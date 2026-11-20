"""The Engines page's provider cards (D109): the file they write, the key files, the guards and the two small requests.

Nothing here reaches a network: the card's requests go through an httpx mock transport, and every key is invented.
"""

from __future__ import annotations

import asyncio
import json
import logging
import stat

import httpx
import pytest
import yaml
from fastapi.testclient import TestClient

from freeduet import engine_panel as panel
from freeduet.app import app
from freeduet.compatible_engine import adapters_from_config
from freeduet.engines import load_engines
from helpers import MANAGED_TOKEN

KEY = "gsk_CANARYkey0123456789abcdef"
AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(tmp_path / "no-such-own-file.yaml"))
    monkeypatch.setenv("MANAGED_AGENT_TOKEN", MANAGED_TOKEN)
    return tmp_path


def card(id_):
    return next(c for c in panel.panel_state()["providers"] if c["id"] == id_)


def test_every_card_is_listed_off_and_without_a_key(data):
    state = panel.panel_state()
    assert state["editable"] is True
    assert [c["id"] for c in state["providers"]] == list(panel.PROVIDERS)
    assert not any(c["enabled"] or c["keySaved"] for c in state["providers"])
    assert card("cerebras")["blocked"] == "trial_needs_card"
    assert card("anthropic-api")["blocked"] == "paid"
    assert card("groq")["forMembers"] is False and card("ollama")["forMembers"] is True


def test_a_key_is_stored_in_its_own_file_with_mode_600_and_is_never_shown(data):
    panel.save_key("groq", f"  {KEY}\n")
    path = data / "keys" / "groq"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert card("groq")["keySaved"] is True
    assert KEY not in json.dumps(panel.panel_state())
    panel.apply_change("groq", enabled=True, model="llama-3.1-8b-instant")
    assert KEY not in (data / "engines.yaml").read_text()
    panel.remove_key("groq")
    assert not path.exists() and card("groq")["keySaved"] is False


@pytest.mark.parametrize("bad", ["short", "has space in it 123456", "sk-ant-oat01-abcdefghijklmnop", "ключ-ключ-ключ-1234", 5, None])
def test_a_badly_shaped_key_or_a_claude_plan_token_is_refused_and_nothing_is_written(data, bad):
    with pytest.raises(panel.PanelRefused) as caught:
        panel.save_key("groq", bad)
    assert caught.value.code == "key_shape"
    assert not (data / "keys").exists()


def test_paid_and_trial_cards_take_no_key_and_cannot_be_switched_on(data):
    for id_, why in (("anthropic-api", "paid"), ("cerebras", "trial_needs_card")):
        for call in (lambda: panel.save_key(id_, KEY), lambda: panel.apply_change(id_, enabled=True, model="m")):
            with pytest.raises(panel.PanelRefused) as caught:
                call()
            assert caught.value.code == why
    assert not (data / "engines.yaml").exists() and not (data / "keys").exists()


def test_a_cloud_card_needs_its_key_and_a_model_before_it_goes_on(data):
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("groq", enabled=True)
    assert caught.value.code == "model_first"
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("groq", enabled=True, model="llama-3.1-8b-instant")
    assert caught.value.code == "key_first"
    assert not (data / "engines.yaml").exists()


def test_an_openai_format_provider_joins_the_assistants_only(data):
    panel.save_key("groq", KEY)
    shown = panel.apply_change("groq", enabled=True, model="llama-3.1-8b-instant")
    assert shown["enabled"] is True and shown["keySaved"] is True
    config = load_engines()
    assert config.source == str(data / "engines.yaml")
    assert "groq-assist" in config.assistants.chain
    assert config.engines["groq-assist"].credential_secret_ref == f"file:{data}/keys/groq"
    assert "groq-member" not in config.engines
    assert "groq-assist" not in adapters_from_config(config) and not any(
        "groq" in ids for ids in map(str, config.chains.values())
    )


def test_ollama_also_gets_a_member_engine_in_every_chain_and_switching_off_takes_it_out(data):
    panel.apply_change("ollama", enabled=True, model="qwen2.5:7b")
    config = load_engines()
    assert config.engines["ollama-member"].kind == "anthropic-compatible"
    assert config.engines["ollama-member"].base_url == "http://host.docker.internal:11434"
    assert all("ollama-member" in ids for ids in config.chains.values())
    assert "ollama-member" in adapters_from_config(config)
    panel.apply_change("ollama", enabled=False)
    config = load_engines()
    assert not any("ollama-member" in ids for ids in config.chains.values())
    assert "ollama-assist" not in config.assistants.chain
    assert config.engines["ollama-member"].model == "qwen2.5:7b"  # the settings are kept


def test_openrouter_keeps_the_free_model_guard_of_d107(data):
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    for paid in ("anthropic/claude-sonnet-5", "openrouter/auto", "meta/llama:free,other", "x/y:free-extra"):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_change("openrouter", enabled=True, model=paid)
        assert caught.value.code in {"model_not_free", "model_shape"}
    assert not (data / "engines.yaml").exists()
    panel.apply_change("openrouter", enabled=True, model="meta-llama/llama-3.3-70b-instruct:free")
    config = load_engines()
    assert config.engines["openrouter-member"].base_url == "https://openrouter.ai/api"
    assert "openrouter-member" in adapters_from_config(config)
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("openrouter", base_url="https://evil.example.com/v1")
    assert caught.value.code == "address_fixed"


def test_a_cloud_address_must_be_https_and_cloudflare_needs_its_account(data):
    panel.save_key("cloudflare", "cf_CANARYtoken0123456789")
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("cloudflare", enabled=True, model="@cf/meta/llama-3.1-8b-instruct")
    assert caught.value.code == "address_first"
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("groq", base_url="http://api.groq.com/openai/v1")
    assert caught.value.code == "address_shape"
    panel.apply_change(
        "cloudflare",
        enabled=True,
        model="@cf/meta/llama-3.1-8b-instruct",
        base_url="https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1",
    )
    assert "cloudflare-assist" in load_engines().assistants.chain


def test_a_file_of_the_persons_own_is_never_touched(tmp_path, monkeypatch):
    own = tmp_path / "mine.yaml"
    own.write_text((panel.EXAMPLE_ENGINES_FILE).read_text())
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(own))
    before = own.read_bytes()
    assert panel.panel_state()["editable"] is False and panel.panel_state()["reason"] == "file_is_yours"
    for call in (lambda: panel.apply_change("ollama", enabled=True, model="m"), lambda: panel.save_key("groq", KEY)):
        with pytest.raises(panel.PanelRefused) as caught:
            call()
        assert caught.value.code == "file_is_yours"
    assert own.read_bytes() == before and not (tmp_path / "data").exists()


def transport(status, seen=None, body=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, json=body if body is not None else {"choices": []})

    return httpx.MockTransport(handler)


@pytest.mark.parametrize(
    "status,code", [(200, "ok"), (401, "key_wrong"), (403, "key_wrong"), (404, "model_missing"), (429, "limit"), (402, "credit"), (500, "other")]
)
def test_the_test_button_says_one_word_and_never_the_key(data, status, code):
    panel.save_key("groq", KEY)
    panel.apply_change("groq", enabled=True, model="llama-3.1-8b-instant")
    seen: list[httpx.Request] = []
    result = asyncio.run(panel.test_provider("groq", transport=transport(status, seen)))
    assert result == {"ok": status == 200, "code": code, "status": status}
    assert seen[0].headers["authorization"] == f"Bearer {KEY}"
    assert seen[0].url.path.endswith("/chat/completions")
    assert KEY not in json.dumps(result)


def test_the_test_button_reports_an_unreachable_server_without_the_error_text(data):
    panel.apply_change("ollama", enabled=True, model="qwen2.5:7b")

    def refuse(request):
        raise httpx.ConnectError("boom http://host.docker.internal:11434")

    result = asyncio.run(panel.test_provider("ollama", transport=httpx.MockTransport(refuse)))
    assert result == {"ok": False, "code": "unreachable", "status": None}


def test_the_model_list_is_cleaned_and_openrouter_shows_only_free_ones(data):
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    body = {"data": [{"id": "a/b:free"}, {"id": "a/paid"}, {"id": "openrouter/free"}, {"id": 5}, {"id": "bad id"}]}
    result = asyncio.run(panel.list_models("openrouter", transport=transport(200, body=body)))
    assert result["models"] == ["a/b:free", "openrouter/free"]
    panel.save_key("google", "AIzaCANARY0123456789abcdef")
    result = asyncio.run(panel.list_models("google", transport=transport(200, body={"data": [{"id": "models/gemini-2.0-flash"}]})))
    assert result["models"] == ["gemini-2.0-flash"]
    result = asyncio.run(panel.list_models("google", transport=transport(401)))
    assert result["code"] == "key_wrong" and result["models"] == []


# ── Through the real service ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def client(data):
    with TestClient(app) as test_client:
        yield test_client


def test_the_routes_refuse_a_caller_without_the_deployment_token(client):
    assert client.get("/engines/panel").status_code == 401
    assert client.put("/engines/panel/groq/key", json={"key": KEY}).status_code == 401
    assert client.delete("/engines/panel/groq/key").status_code == 401


def test_a_key_save_never_appears_in_an_answer_or_a_log(client, data, caplog):
    caplog.set_level(logging.DEBUG)
    answers = [
        client.put("/engines/panel/groq/key", json={"key": KEY}, headers=AUTH),
        client.put("/engines/panel/groq", json={"enabled": True, "model": "llama-3.1-8b-instant"}, headers=AUTH),
        client.get("/engines/panel", headers=AUTH),
        client.put("/engines/panel/groq/key", json={"key": "bad key"}, headers=AUTH),
    ]
    assert [a.status_code for a in answers] == [200, 200, 200, 400]
    assert all(KEY not in a.text for a in answers)
    assert KEY not in caplog.text
    assert answers[3].json() == {"error": "key_shape"}


def test_a_change_applies_to_the_next_message_with_no_restart(client):
    assert "ollama-member" not in {e["id"] for e in client.get("/engines", headers=AUTH).json()["engines"]}
    assert client.put("/engines/panel/ollama", json={"enabled": True, "model": "qwen2.5:7b"}, headers=AUTH).status_code == 200
    assert "ollama-member" in app.state.engine_router.adapters
    assert "ollama-member" in {e["id"] for e in client.get("/engines", headers=AUTH).json()["engines"]}
    assert client.put("/engines/panel/ollama", json={"enabled": False}, headers=AUTH).status_code == 200
    assert "ollama-member" not in app.state.engine_router.adapters
    assert "ollama-member" not in {e["id"] for e in client.get("/engines", headers=AUTH).json()["engines"]}


def test_removing_a_key_deletes_the_file_and_switches_the_card_off(client, data):
    client.put("/engines/panel/groq/key", json={"key": KEY}, headers=AUTH)
    client.put("/engines/panel/groq", json={"enabled": True, "model": "llama-3.1-8b-instant"}, headers=AUTH)
    assert client.delete("/engines/panel/groq/key", headers=AUTH).json() == {"keySaved": False}
    assert not (data / "keys" / "groq").exists()
    shown = next(c for c in client.get("/engines/panel", headers=AUTH).json()["providers"] if c["id"] == "groq")
    assert shown["enabled"] is False and shown["keySaved"] is False
    assert "groq-assist" not in yaml.safe_load((data / "engines.yaml").read_text())["assistants"]["chain"]


def test_the_light_assistants_read_the_saved_key(data):
    from freeduet.app import _resolve_secret

    panel.save_key("groq", KEY)
    assert _resolve_secret(f"file:{data}/keys/groq") == KEY
    assert _resolve_secret(f"file:{data}/keys/none") is None
