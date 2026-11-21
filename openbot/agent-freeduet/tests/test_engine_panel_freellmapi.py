"""The FreeLLMAPI card (D113): a router the person runs on their own computer, as an `anthropic-compatible` member engine and an
OpenAI-format assistants entry. Nothing here reaches a network; every key is invented."""

from __future__ import annotations

import asyncio
import json
import stat

import httpx
import pytest
import yaml

from freeduet import engine_panel as panel
from freeduet.compatible_engine import adapters_from_config
from freeduet.engines import load_engines

KEY = "freellmapi-CANARYtoken0123456789abcdef"
TEAM = ["freeduet", "inbox", "concierge", "chef"]
BASE = "http://localhost:3999/v1"


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(tmp_path / "no-such-own-file.yaml"))
    team = tmp_path / "team.yaml"
    team.write_text("agents:\n" + "".join(f"  - id: {m}\n    name: {m}\n    system_prompt: x\n" for m in TEAM))
    monkeypatch.setenv("FREEDUET_AGENTS_FILE", str(team))
    return tmp_path


def card():
    return next(c for c in panel.panel_state()["providers"] if c["id"] == "freellmapi")


def test_it_is_off_by_default_with_no_address_no_key_and_no_member(data):
    shown = card()
    assert shown["enabled"] is False and shown["keySaved"] is False
    assert shown["baseUrl"] == "" and shown["model"] == ""  # no default address: FreeLLMAPI's own port is FreeDuet's
    assert shown["tag"] == "router" and shown["cloud"] is True and shown["forMembers"] is True
    assert shown["useFor"] == {"available": TEAM, "chosen": []}
    assert not (data / "engines.yaml").exists()


def test_the_key_is_a_file_with_mode_600_and_never_comes_back(data):
    panel.save_key("freellmapi", f" {KEY}\n")
    path = data / "keys" / "freellmapi"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600 and stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert card()["keySaved"] is True
    assert KEY not in json.dumps(panel.panel_state())
    panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
    assert KEY not in (data / "engines.yaml").read_text()
    assert f"file:{path}" in (data / "engines.yaml").read_text()


def test_switching_on_writes_a_member_engine_and_an_assistants_entry_in_no_chain_but_the_assistants(data):
    panel.save_key("freellmapi", KEY)
    shown = panel.apply_change("freellmapi", enabled=True, base_url=BASE + "/", model="auto")
    assert shown["enabled"] is True and shown["baseUrl"] == BASE and shown["useFor"]["chosen"] == []
    config = load_engines()
    member, assist = config.engines["freellmapi-member"], config.engines["freellmapi-assist"]
    assert member.kind == "anthropic-compatible" and member.base_url == "http://localhost:3999"
    assert member.billing == "free" and member.tier == "C" and member.light is False and member.no_key is False
    assert assist.kind == "openai-compatible" and assist.base_url == BASE
    assert "freellmapi-assist" in config.assistants.chain
    assert not any("freellmapi-member" in ids for ids in config.chains.values())  # none by default, `default` never
    assert "freellmapi-member" in adapters_from_config(config)
    panel.apply_change("freellmapi", members=["chef"])
    assert "freellmapi-member" in load_engines().chains["chef"]
    assert "freellmapi-member" not in load_engines().chains["default"]
    panel.apply_change("freellmapi", enabled=False)
    config = load_engines()
    assert not any("freellmapi-member" in ids for ids in config.chains.values())
    assert "freellmapi-assist" not in config.assistants.chain


def test_it_is_never_first_by_default_a_login_stays_before_it(data):
    panel.save_key("freellmapi", KEY)
    panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
    panel.apply_change("freellmapi", members=["chef"])
    from freeduet.engines import ordered_chain

    order = [e.id for e in ordered_chain("chef", load_engines())]
    assert order.index("freellmapi-member") > 0 and load_engines().engines[order[0]].billing == "subscription"
    assert "metered" not in {e.billing for e in ordered_chain("chef", load_engines())}


def test_switching_on_needs_an_address_a_model_and_a_key_and_writes_nothing_without(data):
    for call, code in (
        (lambda: panel.apply_change("freellmapi", enabled=True, model="auto"), "address_first"),
        (lambda: panel.apply_change("freellmapi", enabled=True, base_url=BASE), "model_first"),
        (lambda: panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto"), "key_first"),
    ):
        with pytest.raises(panel.PanelRefused) as caught:
            call()
        assert caught.value.code == code
    assert not (data / "engines.yaml").exists()


@pytest.mark.parametrize("model", ["auto", "auto:fast", "auto:smart", "some-model_1.5"])
def test_a_model_is_safe_ascii(data, model):
    panel.save_key("freellmapi", KEY)
    assert panel.apply_change("freellmapi", enabled=True, base_url=BASE, model=model)["model"] == model


@pytest.mark.parametrize("model", ["", "a b", "a,b", "modèle", "a;rm", "$(x)", "-x", "x" * 121, 5, None])
def test_a_model_that_is_not_safe_ascii_is_refused(data, model):
    panel.save_key("freellmapi", KEY)
    with pytest.raises(panel.PanelRefused):
        panel.apply_change("freellmapi", enabled=True, base_url=BASE, model=model)
    assert not (data / "engines.yaml").exists()


HOSTS = [
    "http://localhost:3999/v1",
    "http://127.0.0.1:3999/v1",
    "http://host.docker.internal:3999/v1",
    "http://192.168.1.20:3999/v1",
    "http://10.0.0.5:3999/v1",
    "http://[fd00::1]:3999/v1",
    "http://studio.local:3999/v1",
    "https://192.168.1.20:3999/v1",
    "https://studio.local:3999/v1",
    "http://169.254.169.254/v1",
    "http://[fe80::1]:3999/v1",
    "http://172.18.0.2:3999/v1",
    "http://198.18.0.5:3999/v1",
    "http://198.19.255.1:11435/v1",
    "http://198.19.255.1:3999/v1",
    "http://localhost:3001/v1",  # FreeLLMAPI's own default port is FreeDuet's server
    "http://localhost:3010/v1",
    "http://localhost:4230/v1",
    "http://localhost:4300/v1",
    "http://localhost:4500/v1",
    "http://localhost:5432/v1",
    "http://postgres:3999/v1",
    "http://supervisor:3999/v1",
    "http://8.8.8.8:3999/v1",
    "https://example.com/v1",
    "http://user@localhost:3999/v1",
    "http://localhost:3999/v1?x=1",
    "ftp://localhost:3999/v1",
]


@pytest.mark.parametrize("address", HOSTS)
def test_the_host_rules_are_the_local_cards_and_never_wider(data, address):
    """Whatever FreeLLMAPI accepts, a local card (llama.cpp) accepts too: no host or port is opened that D109 keeps shut."""
    try:
        panel.checked_address(panel.PROVIDERS["freellmapi"], address)
        mine = True
    except panel.PanelRefused:
        mine = False
    try:
        panel.checked_address(panel.PROVIDERS["llamacpp"], address)
        local = True
    except panel.PanelRefused:
        local = False
    assert not mine or local, address


def test_the_accepted_and_refused_hosts_are_exactly_these(data):
    accepted = []
    for address in HOSTS:
        try:
            panel.checked_address(panel.PROVIDERS["freellmapi"], address)
            accepted.append(address)
        except panel.PanelRefused:
            pass
    assert accepted == [
        "http://localhost:3999/v1",
        "http://127.0.0.1:3999/v1",
        "http://host.docker.internal:3999/v1",
        "https://192.168.1.20:3999/v1",
        "https://studio.local:3999/v1",
    ]  # a key travels over plain http to this machine only (the loader's rule); a LAN host needs https


@pytest.mark.parametrize("address", ["http://localhost:3999", "http://localhost:3999/v2", "http://localhost:3999/x/v1/y"])
def test_the_address_is_the_v1_base(data, address):
    with pytest.raises(panel.PanelRefused) as caught:
        panel.checked_address(panel.PROVIDERS["freellmapi"], address)
    assert caught.value.code == "address_shape"


def test_a_host_in_the_file_is_judged_again_before_the_key_is_sent(data):
    panel.save_key("freellmapi", KEY)
    panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
    document = yaml.safe_load((data / "engines.yaml").read_text())
    document["engines"]["freellmapi-assist"]["base_url"] = "https://evil.example.com/v1"
    (data / "engines.yaml").write_text(panel.MARKER + "\n" + yaml.safe_dump(document))
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"data": []})

    for call in (panel.test_provider, panel.list_models):
        with pytest.raises(panel.PanelRefused):
            asyncio.run(call("freellmapi", transport=httpx.MockTransport(handler)))
    assert seen == []


def test_test_and_load_list_send_the_token_to_the_router_only(data):
    panel.save_key("freellmapi", KEY)
    panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "auto"}, {"id": "auto:fast"}, {"id": "bad model"}]})
        return httpx.Response(200, json={"choices": []})

    result = asyncio.run(panel.test_provider("freellmapi", transport=httpx.MockTransport(handler)))
    listed = asyncio.run(panel.list_models("freellmapi", transport=httpx.MockTransport(handler)))
    assert result == {"ok": True, "code": "ok"} and listed["models"] == ["auto", "auto:fast"]
    assert {r.url.host for r in seen} == {"localhost"} and all(r.headers["authorization"] == f"Bearer {KEY}" for r in seen)
    assert KEY not in json.dumps([result, listed])


def test_a_file_of_your_own_is_never_touched(data):
    (data / "mine.yaml").write_text("engines: {}\n")
    import os

    os.environ["FREEDUET_ENGINES_FILE"] = str(data / "mine.yaml")
    try:
        with pytest.raises(panel.PanelRefused) as caught:
            panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
        assert caught.value.code == "file_is_yours"
    finally:
        os.environ.pop("FREEDUET_ENGINES_FILE")


def test_the_member_entry_is_a_router_not_a_local_model_and_a_free_cloud_engine(data):
    from freeduet import engines

    panel.save_key("freellmapi", KEY)
    panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
    written = yaml.safe_load((data / "engines.yaml").read_text())["engines"]
    assert written["freellmapi-member"]["router"] is True and written["freellmapi-assist"]["router"] is True
    member = load_engines().engines["freellmapi-member"]
    assert engines.is_local_model(member) is False  # the router's own patience and no "reading" notice
    assert engines.first_answer_limit(member) is None
    assert engines.is_light(member) is False
    assert engines.is_free_cloud(member) is True  # the D101 sentence
    assert engines.is_free_cloud(load_engines().engines["freellmapi-assist"]) is True


def _entry(**over):
    base = {"kind": "anthropic-compatible", "base_url": "http://localhost:3999", "billing": "free", "tier": "C",
            "enabled": False, "model": "auto", "credential_secret_ref": "file:/tmp/k"}
    return {**base, **over}


def _config(entry):
    from freeduet import engines

    document = yaml.safe_load(open(engines.EXAMPLE_ENGINES_FILE, encoding="utf-8"))
    document["engines"]["x"] = entry
    return engines.parse_engines(document, source="test")


def test_existing_engines_keep_their_behaviour_and_only_the_router_flag_changes_it():
    from freeduet import engines

    plain = _config(_entry()).engines["x"]  # the same entry without the flag: a local model, as before
    assert engines.is_local_model(plain) is True and engines.is_free_cloud(plain) is False
    assert engines.first_answer_limit(plain) == engines.LOCAL_FIRST_ANSWER_SECONDS and engines.is_light(plain) is True
    flagged = _config(_entry(router=True)).engines["x"]
    assert engines.is_local_model(flagged) is False and engines.is_free_cloud(flagged) is True
    keyless = _config(_entry(credential_secret_ref=None, no_key=True)).engines["x"]
    assert engines.is_local_model(keyless) is True and engines.is_free_cloud(keyless) is False
    remote = _config(_entry(base_url="https://api.example.com", router=False)).engines["x"]
    assert engines.is_free_cloud(remote) is True and engines.is_local_model(remote) is False


@pytest.mark.parametrize(
    "over",
    [
        {"router": "yes"},
        {"router": True, "billing": "metered"},
        {"router": True, "kind": "claude-code", "command": "claude", "credential_secret_ref": None},
        {"router": True, "credential_secret_ref": None, "no_key": True},
        {"router": True, "first_answer_seconds": 100},
    ],
)
def test_the_loader_refuses_a_router_flag_that_does_not_fit(over):
    from freeduet import engines

    with pytest.raises(engines.EnginesFileError):
        _config(_entry(**over))


def test_the_router_flag_is_pinned_in_the_notices_of_the_router_too(data):
    from freeduet import engines

    panel.save_key("freellmapi", KEY)
    panel.apply_change("freellmapi", enabled=True, base_url=BASE, model="auto")
    assert engines.is_free_cloud(load_engines().engines["freellmapi-member"])


@pytest.mark.parametrize("port", [2375, 2376])
@pytest.mark.parametrize("provider", ["llamacpp", "lmstudio", "ollama", "freellmapi"])
def test_the_docker_api_ports_are_refused_by_every_local_card(data, provider, port):
    with pytest.raises(panel.PanelRefused) as caught:
        panel.checked_address(panel.PROVIDERS[provider], f"http://localhost:{port}/v1")
    assert caught.value.code == "address_host"


@pytest.mark.parametrize("path", ["/v1/../x/v1", "/../v1", "/./v1", "/a/./b/v1", "/a/../v1"])
@pytest.mark.parametrize("provider", ["llamacpp", "freellmapi"])
def test_a_dot_segment_in_a_local_address_is_refused(data, provider, path):
    with pytest.raises(panel.PanelRefused):
        panel.checked_address(panel.PROVIDERS[provider], f"http://localhost:3999{path}")
