"""The Engines page's provider cards (D109): the file they write, the key files, the guards and the two small requests.

Nothing here reaches a network: the card's requests go through an httpx mock transport, and every key is invented.
"""

from __future__ import annotations

import asyncio
import json
import os
import logging
import stat
from pathlib import Path

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
TEAM = ["freeduet", "inbox", "concierge", "chef"]


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(tmp_path / "no-such-own-file.yaml"))
    monkeypatch.setenv("MANAGED_AGENT_TOKEN", MANAGED_TOKEN)
    team = tmp_path / "team.yaml"
    team.write_text("agents:\n" + "".join(f"  - id: {m}\n    name: {m}\n    system_prompt: x\n" for m in TEAM))
    monkeypatch.setenv("FREEDUET_AGENTS_FILE", str(team))
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
    # A free cloud engine joins NO member's chain until the person ticks that member (review of PR #414).
    assert not any("openrouter-member" in ids for ids in config.chains.values())


def test_a_cloud_provider_keeps_to_its_own_host_and_cloudflare_only_the_account_is_editable(data):
    panel.save_key("cloudflare", "cf_CANARYtoken0123456789")
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("cloudflare", enabled=True, model="@cf/meta/llama-3.1-8b-instruct")
    assert caught.value.code == "address_first"
    for provider, bad in (
        ("groq", "http://api.groq.com/openai/v1"),
        ("groq", "https://evil.example.com/openai/v1"),
        ("groq", "https://api.groq.com.evil.example/openai/v1"),
        ("groq", "https://api.groq.com:8443/openai/v1"),
        ("google", "https://user:pw@generativelanguage.googleapis.com/v1beta/openai"),
    ):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_change(provider, base_url=bad)
        assert caught.value.code in {"address_fixed", "address_host", "address_shape"}, bad
    for bad in (
        "https://evil.example.com/client/v4/accounts/abc12345678/ai/v1",
        "https://api.cloudflare.com@evil.example.com/client/v4/accounts/abc12345678/ai/v1",
        "https://api.cloudflare.com/client/v4/accounts/abc12345678/ai/v1/../../x",
        "https://api.cloudflare.com/client/v4/accounts/abc12345678/ai/v1?x=1",
        "https://api.cloudflare.com:444/client/v4/accounts/abc12345678/ai/v1",
        "http://api.cloudflare.com/client/v4/accounts/abc12345678/ai/v1",
    ):
        with pytest.raises(panel.PanelRefused):
            panel.apply_change("cloudflare", base_url=bad)
    assert not (data / "engines.yaml").exists()
    panel.apply_change(
        "cloudflare",
        enabled=True,
        model="@cf/meta/llama-3.1-8b-instruct",
        base_url="https://api.cloudflare.com/client/v4/accounts/abc12345678/ai/v1",
    )
    assert "cloudflare-assist" in load_engines().assistants.chain


@pytest.mark.parametrize(
    "address,fine",
    [
        ("http://host.docker.internal:11434/v1", True),
        ("http://localhost:8080/v1", True),
        ("http://127.0.0.1:1234/v1", True),
        ("http://192.168.1.20:8080/v1", True),
        ("http://10.0.0.5:8080", True),
        ("http://169.254.1.1:8080", False),  # link-local is refused whole
        ("http://[fd00::1]:8080/v1", True),
        ("http://studio.local:1234/v1", True),
        ("http://198.19.255.1:11435/v1", True),  # the host forwarder for Ollama: exactly this one
        ("http://198.19.255.1:11434/v1", False),
        ("http://198.19.255.1:8080/v1", False),
        ("http://198.19.255.2:11435/v1", False),
        ("http://198.19.0.5:11435/v1", False),
        ("http://198.18.0.5:8080/v1", False),
        ("http://172.18.0.2:8080/v1", False),  # a container on a compose network
        ("http://172.16.0.1:8080", False),
        ("http://172.31.255.254:8080", False),
        ("http://172.15.0.1:8080", False),  # outside 172.16/12 and not private: refused as public
        ("http://169.254.169.254/latest/meta-data", False),  # the metadata service
        ("http://169.254.169.254:80", False),
        ("http://[fe80::1]:8080", False),
        ("http://[::ffff:169.254.169.254]:80", False),
        ("http://127.0.0.1:4300", False),  # the supervisor
        ("http://host.docker.internal:4300", False),
        ("http://localhost:4500", False),  # the supervisor's published port
        ("http://192.168.0.1:8080/v1", True),
        ("http://192.168.255.254:11434", True),
        ("http://10.255.0.9:8080", True),
        ("http://host.docker.internal:4230/v1", False),  # the agent itself
        ("http://localhost:3001/v1", False),  # the server
        ("http://127.0.0.1:5432", False),  # postgres
        ("http://postgres:5432", False),
        ("http://supervisor:8080", False),
        ("http://agent-freeduet:11434", False),
        ("http://agent-computer:11434", False),
        ("http://8.8.8.8:11434/v1", False),
        ("http://example.com:11434/v1", False),
        ("http://user@localhost:11434/v1", False),
        ("ftp://localhost:11434/v1", False),
        ("http://localhost:11434/v1?x=1", False),
    ],
)
def test_a_local_card_reaches_this_machine_or_network_and_never_freeduets_own_services(data, address, fine):
    if fine:
        assert panel.apply_change("llamacpp", base_url=address, model="m")["baseUrl"] == address
    else:
        with pytest.raises(panel.PanelRefused):
            panel.apply_change("llamacpp", base_url=address, model="m")
        assert not (data / "engines.yaml").exists()


def test_the_agents_own_and_the_supervisors_configured_ports_are_refused_too(data, monkeypatch):
    monkeypatch.setenv("FREEDUET_PORT", "4999")
    monkeypatch.setenv("SUPERVISOR_PORT", "4777")
    for port in (4999, 4777):
        with pytest.raises(panel.PanelRefused):
            panel.apply_change("llamacpp", base_url=f"http://localhost:{port}/v1", model="m")


def test_a_key_is_never_sent_to_a_host_the_file_was_changed_to(data):
    panel.save_key("groq", KEY)
    panel.apply_change("groq", enabled=True, model="m")
    document = yaml.safe_load((data / "engines.yaml").read_text())
    document["engines"]["groq-assist"]["base_url"] = "https://evil.example.com/openai/v1"
    (data / "engines.yaml").write_text(panel.MARKER + "\n" + yaml.safe_dump(document))
    seen: list[httpx.Request] = []
    for call in (panel.test_provider, panel.list_models):
        with pytest.raises(panel.PanelRefused):
            asyncio.run(call("groq", transport=transport(200, seen)))
    assert seen == []


def test_a_cloud_engine_joins_only_the_members_the_person_ticks_and_a_local_one_joins_everyone(data):
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    panel.apply_change("openrouter", enabled=True, model="openrouter/free")
    shown = panel.panel_state()["providers"]
    use = next(c for c in shown if c["id"] == "openrouter")["useFor"]
    assert use == {"available": TEAM, "chosen": []}
    assert next(c for c in shown if c["id"] == "groq")["useFor"] is None
    assert next(c for c in shown if c["id"] == "ollama")["useFor"] is None
    panel.apply_change("openrouter", members=["chef", "inbox"])
    config = load_engines()
    assert "openrouter-member" in config.chains["chef"] and "openrouter-member" in config.chains["inbox"]
    assert "openrouter-member" not in config.chains["default"]
    assert "openrouter-member" not in config.chains["freeduet"]
    assert "openrouter-member" not in config.chains["concierge"]
    assert next(c for c in panel.panel_state()["providers"] if c["id"] == "openrouter")["useFor"]["chosen"] == ["chef", "inbox"]
    panel.apply_change("openrouter", members=["chef"])
    assert "openrouter-member" not in load_engines().chains["inbox"]
    for bad in (["nobody"], "chef", [5], ["chef", None]):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_change("openrouter", members=bad)
        assert caught.value.code == "members_shape"
    panel.apply_change("openrouter", enabled=False)
    assert not any("openrouter-member" in ids for ids in load_engines().chains.values())
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_change("openrouter", members=["chef"])
    assert caught.value.code == "switch_on_first"
    with pytest.raises(panel.PanelRefused):
        panel.apply_change("groq", members=["chef"])  # no member entry at all
    panel.apply_change("ollama", enabled=True, model="qwen2.5:7b")
    assert all("ollama-member" in ids for ids in load_engines().chains.values())


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
    "status,code",
    [(200, "ok"), (401, "key_rejected"), (403, "key_rejected"), (404, "model_missing"), (429, "rate_limited"), (402, "rate_limited"), (500, "unreachable"), (302, "unreachable")],
)
def test_the_test_button_says_one_word_and_never_the_key(data, status, code):
    panel.save_key("groq", KEY)
    panel.apply_change("groq", enabled=True, model="llama-3.1-8b-instant")
    seen: list[httpx.Request] = []
    result = asyncio.run(panel.test_provider("groq", transport=transport(status, seen)))
    assert result == {"ok": status == 200, "code": code}  # the upstream status is never passed on
    assert seen[0].headers["authorization"] == f"Bearer {KEY}"
    assert seen[0].url.path.endswith("/chat/completions")
    assert KEY not in json.dumps(result)


def test_the_test_button_reports_an_unreachable_server_without_the_error_text(data):
    panel.apply_change("ollama", enabled=True, model="qwen2.5:7b")

    def refuse(request):
        raise httpx.ConnectError("boom http://host.docker.internal:11434")

    result = asyncio.run(panel.test_provider("ollama", transport=httpx.MockTransport(refuse)))
    assert result == {"ok": False, "code": "unreachable"}


def test_the_model_list_is_cleaned_and_openrouter_shows_only_free_ones(data):
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    body = {"data": [{"id": "a/b:free"}, {"id": "a/paid"}, {"id": "openrouter/free"}, {"id": 5}, {"id": "bad id"}]}
    result = asyncio.run(panel.list_models("openrouter", transport=transport(200, body=body)))
    assert result["models"] == ["a/b:free", "openrouter/free"]
    panel.save_key("google", "AIzaCANARY0123456789abcdef")
    result = asyncio.run(panel.list_models("google", transport=transport(200, body={"data": [{"id": "models/gemini-2.0-flash"}]})))
    assert result["models"] == ["gemini-2.0-flash"]
    result = asyncio.run(panel.list_models("google", transport=transport(401)))
    assert result["code"] == "key_rejected" and result["models"] == []


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


def test_the_real_service_wires_the_secret_reader_into_the_light_assistants():
    from freeduet import server_calls

    assert server_calls.get_runtime().resolve_secret is not None
    server_calls.reload_engines()
    assert server_calls.get_runtime().engines is None


# ── B1: the page recognises only its own file ────────────────────────────────────────────────────


def test_an_unmarked_file_at_the_panels_own_path_is_the_persons_and_is_never_rewritten(tmp_path, monkeypatch):
    own = tmp_path / "engines.yaml"
    text = "# my own notes, kept\n" + panel.EXAMPLE_ENGINES_FILE.read_text()
    own.write_text(text)
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(own))  # the same path: the maintainer's real setup
    state = panel.panel_state()
    assert state["editable"] is False and state["reason"] == "file_is_yours"
    for call in (
        lambda: panel.apply_change("ollama", enabled=True, model="m"),
        lambda: panel.apply_change("ollama", model="m"),
        lambda: panel.save_key("groq", KEY),
    ):
        with pytest.raises(panel.PanelRefused) as caught:
            call()
        assert (caught.value.code, caught.value.status) == ("file_is_yours", 409)
    assert own.read_text() == text
    assert list(tmp_path.iterdir()) == [own]  # no backup, no key folder, no temporary file


def test_an_unmarked_file_at_the_panel_path_is_the_persons_even_with_no_variable(tmp_path, monkeypatch):
    own = tmp_path / "engines.yaml"
    own.write_text(panel.EXAMPLE_ENGINES_FILE.read_text())
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(tmp_path / "absent.yaml"))
    assert panel.own_file_in_use() is True
    with pytest.raises(panel.PanelRefused):
        panel.apply_change("ollama", enabled=True, model="m")


def test_the_pages_own_file_carries_the_marker_and_each_replacement_keeps_a_backup(data):
    panel.apply_change("ollama", enabled=True, model="m1")
    path = data / "engines.yaml"
    assert path.read_text().splitlines()[0] == panel.MARKER
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert list(data.glob("engines.yaml.bak-*")) == []  # nothing to back up at the first write
    first = path.read_text()
    panel.apply_change("ollama", model="m2")
    backups = sorted(data.glob("engines.yaml.bak-*"))
    assert len(backups) == 1 and backups[0].read_text() == first
    for n in range(8):
        panel.apply_change("ollama", model=f"m{n + 3}")
    assert len(list(data.glob("engines.yaml.bak-*"))) == panel.MAX_BACKUPS
    assert panel.panel_state()["editable"] is True  # still its own file


# ── D112: the person puts a member's engines in order by hand ────────────────────────────────────


def _chef_with_two_free_engines():
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    panel.apply_change("openrouter", enabled=True, model="openrouter/free", members=["chef"])
    panel.apply_change("ollama", enabled=True, model="qwen2.5:7b")


def _shown(member):
    from freeduet.engines import ordered_chain

    return [engine.id for engine in ordered_chain(member, load_engines())]


def test_a_permutation_is_written_in_that_order_with_a_backup_and_the_loader_keeps_it(data):
    _chef_with_two_free_engines()
    assert _shown("chef") == ["claude-code", "openrouter-member", "ollama-member"]
    result = panel.apply_order("chef", ["claude-code", "ollama-member", "openrouter-member"])
    assert result == {"member": "chef", "chain": ["claude-code", "ollama-member", "openrouter-member"], "changed": True, "ownOrder": False, "confirmedKind": None}
    assert _shown("chef") == ["claude-code", "ollama-member", "openrouter-member"]
    # engines the chain names that do not run keep their place; the other members are untouched
    file_chain = load_engines().chains["chef"]
    assert file_chain[:3] == ("claude-code", "codex", "local") and set(file_chain) >= {"openrouter", "openrouter-member", "ollama-member"}
    assert _shown("freeduet") == ["claude-code", "ollama-member"]
    assert len(list(data.glob("engines.yaml.bak-*"))) >= 1
    assert (data / "engines.yaml").read_text().splitlines()[0] == panel.MARKER


def test_a_member_on_the_default_chain_is_judged_by_that_chain(data):
    _chef_with_two_free_engines()
    assert "inbox" not in load_engines().chains
    panel.apply_order("inbox", ["claude-code", "ollama-member"])  # the same order: nothing to write
    assert "inbox" not in load_engines().chains
    # one login and one free engine: the only other order leaves the group order, so it needs the person's confirmation (D115)
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_order("inbox", ["ollama-member", "claude-code"])
    assert (caught.value.code, caught.value.status, caught.value.kind) == ("order_needs_confirmation", 409, "free_before_login")


def test_the_same_order_writes_nothing(data):
    _chef_with_two_free_engines()
    before = (data / "engines.yaml").read_bytes()
    backups = len(list(data.glob("engines.yaml.bak-*")))
    result = panel.apply_order("chef", ["claude-code", "openrouter-member", "ollama-member"])
    assert result["changed"] is False
    assert (data / "engines.yaml").read_bytes() == before
    assert len(list(data.glob("engines.yaml.bak-*"))) == backups


@pytest.mark.parametrize(
    "order",
    [
        ["claude-code", "openrouter-member"],  # drops one
        ["claude-code", "openrouter-member", "ollama-member", "codex"],  # adds one
        ["claude-code", "openrouter-member", "made-up"],  # unknown id
        ["claude-code", "openrouter-member", "openrouter-member"],  # repeats one
        "claude-code",
        [5, "claude-code", "openrouter-member"],
        None,
    ],
)
def test_an_order_that_is_not_a_permutation_is_refused_and_nothing_is_written(data, order):
    _chef_with_two_free_engines()
    before = (data / "engines.yaml").read_bytes()
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_order("chef", order)
    assert caught.value.code in ("order_not_permutation", "order_shape")
    assert (data / "engines.yaml").read_bytes() == before


def test_an_unknown_member_is_refused(data):
    _chef_with_two_free_engines()
    before = (data / "engines.yaml").read_bytes()
    for member in ("nobody", None, "default", 5):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_order(member, ["claude-code", "ollama-member"])
        assert caught.value.code == "unknown_member"
    assert (data / "engines.yaml").read_bytes() == before


def test_a_free_engine_before_a_login_needs_the_confirmation_and_nothing_is_written_without_it(data):
    _chef_with_two_free_engines()
    before = (data / "engines.yaml").read_bytes()
    for confirmed in (False, None, "true", 1):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_order("chef", ["openrouter-member", "claude-code", "ollama-member"], confirmed=confirmed)
        assert caught.value.code in ("order_needs_confirmation", "order_shape")
        assert (data / "engines.yaml").read_bytes() == before
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_order("chef", ["openrouter-member", "claude-code", "ollama-member"])
    assert (caught.value.code, caught.value.status, caught.value.kind) == ("order_needs_confirmation", 409, "free_before_login")
    assert (data / "engines.yaml").read_bytes() == before
    assert load_engines().own_order == frozenset()


def test_a_metered_engine_is_never_put_before_a_login_or_a_free_engine_without_the_confirmation(data):
    _chef_with_two_free_engines()
    path = data / "engines.yaml"
    document = yaml.safe_load(path.read_text())
    document["metered"] = {"enabled": True, "daily_cap": 5, "monthly_cap": 50, "currency": "USD"}
    document["engines"]["anthropic-api"]["enabled"] = True
    document["chains"]["chef"].insert(1, "anthropic-api")  # written before the free ones: the router still puts it last
    path.write_text(panel.MARKER + "\n" + yaml.safe_dump(document, sort_keys=False))
    shown = _shown("chef")
    assert shown[-1] == "anthropic-api" and len(shown) == 4
    before = path.read_bytes()
    for bad in (
        ["anthropic-api", *shown[:-1]],
        [shown[0], "anthropic-api", *shown[1:-1]],
        [*shown[:-2], "anthropic-api", shown[-2]],
    ):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_order("chef", bad)
        assert (caught.value.code, caught.value.kind) == ("order_needs_confirmation", "paid_before_free_or_login")
    assert path.read_bytes() == before
    assert _shown("chef")[-1] == "anthropic-api"  # the file lists it second, and without the opt-in the router still puts it last
    # a free engine may still move among the free ones, with the metered one kept last
    panel.apply_order("chef", [shown[0], shown[2], shown[1], "anthropic-api"])
    assert _shown("chef")[-1] == "anthropic-api"


def test_an_order_is_refused_for_a_file_the_page_did_not_write(tmp_path, monkeypatch):
    own = tmp_path / "engines.yaml"
    text = "# mine\n" + panel.EXAMPLE_ENGINES_FILE.read_text()
    own.write_text(text)
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(own))
    team = tmp_path / "team.yaml"
    team.write_text("agents:\n  - id: chef\n    name: chef\n    system_prompt: x\n")
    monkeypatch.setenv("FREEDUET_AGENTS_FILE", str(team))
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_order("chef", ["claude-code"])
    assert (caught.value.code, caught.value.status) == ("file_is_yours", 409)
    assert own.read_text() == text and sorted(p.name for p in tmp_path.iterdir()) == ["engines.yaml", "team.yaml"]


def test_the_order_route_applies_from_the_next_message_and_refuses_what_the_panel_refuses(client, data):
    client.put("/engines/panel/openrouter/key", json={"key": "sk-or-v1-CANARYkey0123456789"}, headers=AUTH)
    client.put("/engines/panel/openrouter", json={"enabled": True, "model": "openrouter/free", "members": ["chef"]}, headers=AUTH)
    client.put("/engines/panel/ollama", json={"enabled": True, "model": "qwen2.5:7b"}, headers=AUTH)
    url = "/engines/panel/members/chef/order"
    assert client.put(url, json={"order": []}).status_code == 401
    assert [m["chain"] for m in client.get("/engines", headers=AUTH).json()["members"] if m["id"] == "chef"] == [
        ["claude-code", "openrouter-member", "ollama-member"]
    ]
    done = client.put(url, json={"order": ["claude-code", "ollama-member", "openrouter-member"]}, headers=AUTH)
    assert done.status_code == 200 and done.json()["changed"] is True
    assert [m["chain"] for m in client.get("/engines", headers=AUTH).json()["members"] if m["id"] == "chef"] == [
        ["claude-code", "ollama-member", "openrouter-member"]
    ]
    assert app.state.engine_router._runnable("chef") == ["claude-code", "ollama-member", "openrouter-member"]
    for body, code, status in (
        ({"order": ["claude-code", "ollama-member"]}, "order_not_permutation", 400),
        ({"order": ["ollama-member", "claude-code", "openrouter-member"]}, "order_needs_confirmation", 409),
        ({"order": ["ollama-member", "claude-code", "openrouter-member"], "confirmed": "yes"}, "order_shape", 400),
        ({}, "order_shape", 400),
    ):
        refused = client.put(url, json=body, headers=AUTH)
        assert (refused.status_code, refused.json()["error"]) == (status, code)
    assert client.put("/engines/panel/members/nobody/order", json={"order": []}, headers=AUTH).status_code == 404


def _chef_file():
    return yaml.safe_load((Path(os.environ["FREEDUET_DATA_DIR"]) / "engines.yaml").read_text())


def test_a_confirmed_out_of_group_order_is_written_and_the_member_joins_own_order(data):
    _chef_with_two_free_engines()
    wanted = ["openrouter-member", "claude-code", "ollama-member"]
    result = panel.apply_order("chef", wanted, confirmed=True)
    assert result == {"member": "chef", "chain": wanted, "changed": True, "ownOrder": True, "confirmedKind": "free_before_login"}
    assert _chef_file()["own_order"] == ["chef"]
    assert load_engines().own_order == frozenset({"chef"})
    assert _shown("chef") == wanted  # the router keeps the written order for this member
    assert _shown("freeduet") == ["claude-code", "ollama-member"]  # nobody else is touched
    assert len(list(data.glob("engines.yaml.bak-*"))) >= 1
    assert (data / "engines.yaml").read_text().splitlines()[0] == panel.MARKER
    assert panel.apply_order("chef", wanted, confirmed=True)["changed"] is False  # the same order again writes nothing


def test_a_confirmed_paid_first_order_is_kept_only_for_that_member_and_switches_nothing_on(data):
    _chef_with_two_free_engines()
    path = data / "engines.yaml"
    document = yaml.safe_load(path.read_text())
    document["metered"] = {"enabled": True, "daily_cap": 5, "monthly_cap": 50, "currency": "USD"}
    document["engines"]["anthropic-api"]["enabled"] = True
    document["chains"]["chef"].insert(1, "anthropic-api")
    path.write_text(panel.MARKER + "\n" + yaml.safe_dump(document, sort_keys=False))
    shown = _shown("chef")
    assert shown[-1] == "anthropic-api"
    wanted = ["anthropic-api", *shown[:-1]]
    result = panel.apply_order("chef", wanted, confirmed=True)
    assert result["confirmedKind"] == "paid_before_free_or_login"
    assert _shown("chef") == wanted
    after = _chef_file()
    assert after["metered"] == document["metered"] and after["engines"]["anthropic-api"]["enabled"] is True  # no switch changed


def test_a_member_on_own_order_moves_back_to_the_sorted_order_and_leaves_the_list(data):
    _chef_with_two_free_engines()
    panel.apply_order("chef", ["openrouter-member", "claude-code", "ollama-member"], confirmed=True)
    back = panel.apply_order("chef", ["claude-code", "openrouter-member", "ollama-member"])  # no confirmation needed
    assert back["changed"] is True and back["ownOrder"] is False and back["confirmedKind"] is None
    assert "own_order" not in _chef_file()
    assert _shown("chef") == ["claude-code", "openrouter-member", "ollama-member"]
    # a second member on own order keeps the list with one entry left
    panel.apply_order("chef", ["ollama-member", "claude-code", "openrouter-member"], confirmed=True)
    panel.apply_order("inbox", ["ollama-member", "claude-code"], confirmed=True)
    assert sorted(_chef_file()["own_order"]) == ["chef", "inbox"]
    panel.apply_order("chef", ["claude-code", "ollama-member", "openrouter-member"])
    assert _chef_file()["own_order"] == ["inbox"]


def test_an_out_of_group_move_inside_an_own_order_still_needs_the_confirmation(data):
    _chef_with_two_free_engines()
    panel.apply_order("chef", ["openrouter-member", "claude-code", "ollama-member"], confirmed=True)
    before = (data / "engines.yaml").read_bytes()
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_order("chef", ["ollama-member", "openrouter-member", "claude-code"])
    assert caught.value.code == "order_needs_confirmation"
    assert (data / "engines.yaml").read_bytes() == before


def test_the_confirmation_does_not_unlock_a_file_the_page_did_not_write(tmp_path, monkeypatch):
    own = tmp_path / "engines.yaml"
    text = "# mine\n" + panel.EXAMPLE_ENGINES_FILE.read_text()
    own.write_text(text)
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(own))
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_order("chef", ["codex", "claude-code"], confirmed=True)
    assert (caught.value.code, caught.value.status) == ("file_is_yours", 409)
    assert own.read_text() == text


def test_the_order_route_forwards_confirmed_only_as_a_boolean_and_answers_the_kind(client, data):
    client.put("/engines/panel/openrouter/key", json={"key": "sk-or-v1-CANARYkey0123456789"}, headers=AUTH)
    client.put("/engines/panel/openrouter", json={"enabled": True, "model": "openrouter/free", "members": ["chef"]}, headers=AUTH)
    url = "/engines/panel/members/chef/order"
    wanted = ["openrouter-member", "claude-code"]
    asked = client.put(url, json={"order": wanted}, headers=AUTH)
    assert (asked.status_code, asked.json()) == (409, {"error": "order_needs_confirmation", "kind": "free_before_login"})
    for loose in ("true", 1, "yes", [True]):
        assert client.put(url, json={"order": wanted, "confirmed": loose}, headers=AUTH).json()["error"] == "order_shape"
    done = client.put(url, json={"order": wanted, "confirmed": True}, headers=AUTH)
    assert done.status_code == 200 and done.json()["ownOrder"] is True and done.json()["confirmedKind"] == "free_before_login"
    chef = [m for m in client.get("/engines", headers=AUTH).json()["members"] if m["id"] == "chef"][0]
    assert chef["chain"] == wanted and chef["own_order"] is True
    assert chef["recommended_chain"] == ["claude-code", "openrouter-member"]  # what "back to the recommended order" sends
    assert app.state.engine_router._runnable("chef") == wanted
    back = client.put(url, json={"order": chef["recommended_chain"]}, headers=AUTH)
    assert back.status_code == 200 and back.json()["ownOrder"] is False
    assert app.state.engine_router._runnable("chef") == ["claude-code", "openrouter-member"]


def test_the_order_route_reads_the_chain_inside_the_lock_so_a_card_change_cannot_make_it_stale(client, data, monkeypatch):
    events = []

    class Recording:
        async def __aenter__(self):
            events.append("lock")

        async def __aexit__(self, *_):
            events.append("unlock")

    router = app.state.engine_router
    real_overview = router.overview

    def overview(members):
        events.append("overview")
        return real_overview(members)

    monkeypatch.setattr(panel, "_lock", Recording())
    monkeypatch.setattr(router, "overview", overview)
    client.put("/engines/panel/members/freeduet/order", json={"order": ["claude-code"]}, headers=AUTH)
    assert events[:2] == ["lock", "overview"]


# ── Key folder safety ────────────────────────────────────────────────────────────────────────────


def test_the_keys_folder_is_made_700_and_a_link_in_its_place_is_refused(data):
    old = os.umask(0o022)
    try:
        panel.save_key("groq", KEY)
    finally:
        os.umask(old)
    assert stat.S_IMODE((data / "keys").stat().st_mode) == 0o700
    panel.remove_key("groq")
    elsewhere = data / "elsewhere"
    elsewhere.mkdir()
    (data / "keys").rmdir()
    (data / "keys").symlink_to(elsewhere)
    with pytest.raises(panel.PanelRefused):
        panel.save_key("groq", KEY)
    assert list(elsewhere.iterdir()) == []
    assert panel.key_saved(panel.PROVIDERS["groq"]) is False


def test_a_key_file_that_is_a_link_is_not_a_key(data):
    (data / "keys").mkdir(mode=0o700)
    target = data / "other-secret"
    target.write_text(KEY + "\n")
    (data / "keys" / "groq").symlink_to(target)
    assert panel.key_saved(panel.PROVIDERS["groq"]) is False
    with pytest.raises(panel.PanelRefused):
        panel.save_key("groq", "gsk_ANOTHERkey0123456789abcdef")
    assert target.read_text().strip() == KEY


# ── D116: a model choice on the OpenRouter card ──────────────────────────────────────────────────

OPENROUTER_ANSWER = {
    "data": [
        {"id": "meta-llama/llama-3.3-70b-instruct:free", "supported_parameters": ["tools", "temperature"]},
        {"id": "liquid/lfm-3-1.7b:free", "supported_parameters": ["temperature"]},  # no tools
        {"id": "vendor/paid-model", "supported_parameters": ["tools"]},  # not free
        {"id": "x/y:free-extra", "supported_parameters": ["tools"]},  # not ending in :free
        {"id": "openrouter/free", "supported_parameters": ["tools"]},  # the router is added by the card itself
        {"id": "bad id:free", "supported_parameters": ["tools"]},
        {"id": "a/b:free", "supported_parameters": ["tools"]},
        {"id": "c/d:free"},
        {"id": 7, "supported_parameters": ["tools"]},
        "junk",
    ]
}


@pytest.fixture(autouse=False)
def fresh_cache():
    panel.forget_free_models()
    yield
    panel.forget_free_models()


def test_only_free_models_that_support_tools_are_kept():
    assert panel.free_tool_models_from(OPENROUTER_ANSWER) == ["a/b:free", "meta-llama/llama-3.3-70b-instruct:free"]
    assert panel.free_tool_models_from(None) == [] and panel.free_tool_models_from({"data": "x"}) == []


def test_the_free_model_list_has_the_router_first_and_is_cached(fresh_cache):
    calls = []

    async def fetch():
        calls.append(1)
        return OPENROUTER_ANSWER

    clock = [1000.0]
    first = asyncio.run(panel.free_tool_models("openrouter", fetch=fetch, now=lambda: clock[0]))
    assert first == {"models": ["openrouter/free", "a/b:free", "meta-llama/llama-3.3-70b-instruct:free"], "source": "live"}
    second = asyncio.run(panel.free_tool_models("openrouter", fetch=fetch, now=lambda: clock[0] + 10))
    assert second["source"] == "cached" and second["models"] == first["models"] and len(calls) == 1
    asyncio.run(panel.free_tool_models("openrouter", fetch=fetch, now=lambda: clock[0] + panel.FREE_MODELS_TTL_S + 1))
    assert len(calls) == 2  # fetched again after the hour


def test_when_the_fetch_fails_the_last_list_is_kept_and_with_none_the_router_alone(fresh_cache):
    async def broken():
        raise RuntimeError("no network")

    async def empty():
        return None

    assert asyncio.run(panel.free_tool_models("openrouter", fetch=broken, now=lambda: 1.0)) == {
        "models": ["openrouter/free"], "source": "fallback"}

    async def good():
        return OPENROUTER_ANSWER

    asyncio.run(panel.free_tool_models("openrouter", fetch=good, now=lambda: 2.0))
    stale = asyncio.run(panel.free_tool_models("openrouter", fetch=empty, now=lambda: 2.0 + panel.FREE_MODELS_TTL_S + 5))
    assert stale["source"] == "stale" and "a/b:free" in stale["models"]


def test_the_public_fetch_sends_no_key_and_no_cookie_and_fails_to_the_fallback(fresh_cache, data):
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    seen = []
    result = asyncio.run(panel.free_tool_models("openrouter", transport=transport(200, seen, OPENROUTER_ANSWER)))
    assert result["source"] == "live" and len(seen) == 1
    assert str(seen[0].url) == "https://openrouter.ai/api/v1/models"
    assert "authorization" not in seen[0].headers and "cookie" not in seen[0].headers
    panel.forget_free_models()
    down = asyncio.run(panel.free_tool_models("openrouter", transport=transport(503, None, {})))
    assert down == {"models": ["openrouter/free"], "source": "fallback"}


def test_only_the_openrouter_card_has_a_free_model_list(fresh_cache):
    for other in ("groq", "ollama"):
        with pytest.raises(panel.PanelRefused) as caught:
            asyncio.run(panel.free_tool_models(other, fetch=lambda: None))
        assert caught.value.code == "unknown_provider"


def test_a_model_from_the_list_is_written_and_pinned_and_a_paid_one_is_refused(data):
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    panel.apply_change("openrouter", enabled=True, model="openrouter/free")
    chosen = "meta-llama/llama-3.3-70b-instruct:free"
    shown = panel.apply_change("openrouter", model=chosen)
    assert shown["model"] == chosen
    written = yaml.safe_load((data / "engines.yaml").read_text())
    assert written["engines"]["openrouter-member"]["model"] == chosen and written["engines"]["openrouter-assist"]["model"] == chosen
    env = adapters_from_config(load_engines())["openrouter-member"]._environment({}, "k")
    assert env["ANTHROPIC_MODEL"] == chosen and env["CLAUDE_CODE_SUBAGENT_MODEL"] == chosen  # pinned in the hop
    for paid in ("vendor/paid-model", "openrouter/auto", "a/b:free,vendor/paid"):
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_change("openrouter", model=paid)
        assert caught.value.code in ("model_not_free", "model_shape")
    assert card("openrouter")["model"] == chosen  # the refusals changed nothing


def test_the_service_answers_the_free_model_list(fresh_cache, data, monkeypatch):
    async def fake(provider_id, **_):
        return {"models": ["openrouter/free", "a/b:free"], "source": "live"}

    monkeypatch.setattr(panel, "free_tool_models", fake)
    with TestClient(app) as client:
        answer = client.post("/engines/panel/openrouter/free-models", headers=AUTH)
        assert answer.status_code == 200 and answer.json()["models"] == ["openrouter/free", "a/b:free"]
        assert client.post("/engines/panel/openrouter/free-models").status_code in (401, 403)
