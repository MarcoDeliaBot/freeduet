"""D107: OpenRouter's free models as an `anthropic-compatible` member engine, off by default.

What is tested: the load-time guard (an OpenRouter entry that says `billing: free` names exactly one free model and never a
list), the example file's entry, what the CLI is given (one model, no fallback), a free keyed turn through the D105 hop, and the
one sentence a free cloud engine adds to the notices (D101). NO CALL IS MADE TO OpenRouter: every address, key and model here is
invented or is only parsed, and a free model's tool calls through the CLI are not verified (docs/ENGINES_PLAN.md, constraint 6).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from freeduet import claude_cli
from freeduet import compatible_engine as ce
from freeduet import engine_notices as notices
from freeduet.engines import EnginesFileError, exclusion_reason, is_free_cloud, load_engines, parse_engines
from fake_engines import NOW
from gateway_support import KEY, KEY_ENV, chain, config_with
from helpers import post_run, run_body, standing, types
from test_compatible_engine_chain import LIMIT, ASK, posted, said
from fastapi.testclient import TestClient  # noqa: F401  (the `client` fixture comes from conftest)

OPENROUTER = {"base_url": "https://openrouter.ai/api", "billing": "free"}
HERE = Path(__file__).parent.parent


def problems_of(entry: dict) -> list[str]:
    with pytest.raises(EnginesFileError) as caught:
        config_with({**OPENROUTER, **entry})
    return caught.value.problems


# ── The guard ────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("model", ["openrouter/free", "meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free"])
def test_a_free_openrouter_entry_with_a_free_model_loads(model):
    assert config_with({**OPENROUTER, "model": model}).engines["gw"].model == model


@pytest.mark.parametrize("model", [
    "anthropic/claude-sonnet-4.5",                  # a paid model
    "openrouter/auto",                              # a router that can pick a paid model
    "meta-llama/llama-3.3-70b-instruct",            # the paid sibling of a free model
    "openrouter/free,anthropic/claude-sonnet-4.5",  # a fallback list
    "a/b:free,anthropic/claude-sonnet-4.5",
    "a/b:free anthropic/claude-sonnet-4.5",
    "a/b:free:nitro",
    ":free",
    "<free-model-id>",
    "free",
])
def test_a_free_openrouter_entry_with_any_other_model_is_refused_at_load(model):
    found = problems_of({"model": model})
    assert any("must name exactly one free model" in line and "`gw`" in line for line in found), found
    assert not any(model in line for line in found if "exactly one free model" in line)  # it does not repeat the model


@pytest.mark.parametrize("address", [
    "https://openrouter.ai/api", "https://OpenRouter.AI/api", "https://www.openrouter.ai/api", "https://openrouter.ai:443/api",
    "https://openrouter.ai./api",
])
def test_every_spelling_of_the_host_is_guarded(address):
    assert any("exactly one free model" in line for line in problems_of({"base_url": address, "model": "anthropic/claude-sonnet-4.5"}))


def test_the_guard_reads_the_host_and_not_the_words_in_the_address():
    # Not OpenRouter: another host that merely mentions it is judged by the ordinary rules, and loads.
    assert config_with({"base_url": "https://gateway.example.com/openrouter.ai", "model": "anything"}).engines["gw"]
    assert config_with({"base_url": "https://notopenrouter.ai/api", "model": "anything"}).engines["gw"]


def test_a_paid_openrouter_entry_is_not_touched_by_the_guard():
    # `metered` is refused later and for its own reason; the guard is for the entry that says free.
    config = config_with({"base_url": "https://openrouter.ai/api", "billing": "metered", "model": "anthropic/claude-sonnet-4.5"})
    assert config.engines["gw"].billing == "metered"


def test_the_guard_is_checked_when_the_entry_is_off_too():
    assert problems_of({"model": "anthropic/claude-sonnet-4.5", "enabled": False})


def test_the_guard_stops_the_file_from_loading_so_the_service_does_not_start_with_it(tmp_path, monkeypatch):
    path = tmp_path / "engines.yaml"
    path.write_text(
        "engines:\n"
        "  claude-code: {kind: cli, command: claude, billing: subscription, tier: A, enabled: true}\n"
        "  gw: {kind: anthropic-compatible, base_url: 'https://openrouter.ai/api', credential_secret_ref: 'env:K', "
        "billing: free, model: 'anthropic/claude-sonnet-4.5', enabled: true}\n"
        "chains: {default: [claude-code, gw]}\n"
    )
    with pytest.raises(EnginesFileError):
        load_engines(path)


# ── The example file ─────────────────────────────────────────────────────────────────────────────


def example():
    return load_engines(HERE / "engines.example.yaml")


def test_the_example_entry_loads_is_off_is_in_no_chain_and_is_free_cloud():
    config = example()
    entry = config.engines["openrouter-free-claude"]
    assert (entry.kind, entry.billing, entry.tier, entry.enabled) == ("anthropic-compatible", "free", "C", False)
    assert entry.base_url == "https://openrouter.ai/api" and entry.model == "openrouter/free"
    assert entry.credential_secret_ref == "env:OPENROUTER_API_KEY"  # a reference, never the key
    assert is_free_cloud(entry)
    assert all("openrouter-free-claude" not in chain for chain in config.chains.values())
    assert exclusion_reason(entry, config) == "disabled in engines.yaml"


def test_the_example_says_the_limit_the_privacy_setting_and_the_warning():
    text = (HERE / "engines.example.yaml").read_text()
    for words in ("50 A DAY", "MAY KEEP OR USE WHAT IT IS SENT", "train on free-model prompts", "never sends\n  #    a list of fallback models"):
        assert words in text, words


def test_the_example_with_the_entry_switched_on_is_allowed_to_run_once_it_has_a_key():
    data = {"engines": {"claude-code": {"kind": "cli", "command": "claude", "billing": "subscription", "tier": "A", "enabled": True}}}
    data["engines"]["or"] = {**example().__dict__["engines"]["openrouter-free-claude"].__dict__}
    entry = {k: v for k, v in data["engines"]["or"].items() if v not in (None, False) and k != "id"}
    entry["enabled"] = True
    data["engines"]["or"] = entry
    data["chains"] = {"default": ["claude-code", "or"]}
    config = parse_engines(data)
    assert exclusion_reason(config.engines["or"], config) is None  # a free keyed entry runs: nothing refuses it but a missing key


# ── What the CLI is given: one model, no fallback ────────────────────────────────────────────────


def test_the_cli_is_given_the_one_model_and_no_fallback_or_model_list(tmp_path):
    config = config_with({**OPENROUTER, "model": "openrouter/free", "enabled": True})
    engine = ce.CompatibleEngine(config.engines["gw"], config)
    env = engine._environment({}, KEY)
    for name in ce.MODEL_VARIABLES:
        assert env[name] == "openrouter/free", name
    assert not any("," in value for name, value in env.items() if "MODEL" in name)
    command = claude_cli.build_command("claude", tmp_path / "mcp.json", "system", tmp_path)
    assert not any("fallback" in part.lower() or part == "--models" for part in command)
    assert "--model" not in command or command[command.index("--model") + 1] == command[command.index("--model") + 1].split(",")[0]


# ── A free keyed turn through the D105 hop ───────────────────────────────────────────────────────


def test_a_free_keyed_entry_runs_a_turn_with_the_key_only_in_the_header_environment(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {**OPENROUTER, "model": "openrouter/free"})
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Answered on a free model."}])
    events = posted(client, team)
    assert "RUN_ERROR" not in types(events) and types(events)[-1] == "RUN_FINISHED"
    assert "Answered on a free model." in said(events)
    env = [start for start in team.gw.starts() if start['argv'] != ['--version']][0]['env']
    assert env["ANTHROPIC_AUTH_TOKEN"] == KEY and env["ANTHROPIC_API_KEY"] == ""
    assert env["ANTHROPIC_BASE_URL"].startswith("http://127.0.0.1:")  # this turn's loopback hop, not the cloud address
    assert env["ANTHROPIC_MODEL"] == "openrouter/free"
    assert KEY not in said(events)


# ── The notice (D101) ────────────────────────────────────────────────────────────────────────────


def test_the_sentence_is_short_and_in_both_languages():
    assert notices.free_cloud("en") == "It is a free cloud service and may keep what it is sent."
    assert notices.free_cloud("it") == "È un servizio cloud gratuito: potrebbe conservare ciò che gli viene inviato."


def test_a_switch_to_a_free_cloud_engine_adds_the_warning(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {**OPENROUTER, "model": "openrouter/free"})
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Done."}])
    text = said(posted(client, team))
    assert "so gw is answering instead." in text and notices.free_cloud("en") in text
    assert text.index(notices.free_cloud("en")) > text.index("answering instead.")


def test_a_switch_to_a_local_or_logins_engine_adds_nothing(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)  # the default test gateway is on 127.0.0.1
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Done."}])
    assert notices.free_cloud("en") not in said(posted(client, team))


def test_the_ask_first_question_names_the_warning_for_a_free_cloud_engine(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {**OPENROUTER, "model": "openrouter/free"}, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    text = said(posted(client, team))
    assert 'Reply "switch"' in text and notices.free_cloud("en") in text


def test_is_free_cloud_is_false_for_logins_local_and_paid():
    assert not is_free_cloud(config_with().engines["claude-code"])
    assert not is_free_cloud(config_with().engines["gw"])  # 127.0.0.1
    assert not is_free_cloud(config_with({"base_url": "https://gateway.example.com", "billing": "metered"}).engines["gw"])
    assert is_free_cloud(config_with({"base_url": "https://gateway.example.com"}).engines["gw"])
