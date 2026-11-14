"""Each member's engines as the engines file gives them, read through `GET /engines`
(docs/ENGINES_PLAN.md slice 7, docs/design/engines-dashboard.md 3.2).

The server's Engines page shows, per member, the engines in the order they will be tried, the ones that will not run
and why, and the mode and the pin. This is the read-only half: nothing here changes a run. The words for "why" are a
closed list (`engines.EXCLUSION_CODES`), and nothing the person wrote in the file beyond an engine's id and the two
switching values is in the answer: no address, no key reference, no file path.
"""

from __future__ import annotations

import itertools
import json

import pytest

from freeduet import engine_router
from freeduet.app import app
from freeduet.claude_engine import ClaudeEngine
from freeduet.engines import (
    EXAMPLE_ENGINES_FILE,
    EXCLUSION_CODES,
    Assistants,
    Engine,
    EnginesConfig,
    Metered,
    exclusion_code,
    exclusion_reason,
)
from fake_engines import SPECS, build
from helpers import MANAGED_TOKEN

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
WORDS = {*EXCLUSION_CODES, "not_set_up"}
CANARY_KEY = "sk-gw-CANARY-0123456789abcdef"


def body_of(client) -> dict:
    response = client.get("/engines", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def members_of(client) -> dict[str, dict]:
    return {member["id"]: member for member in body_of(client)["members"]}


def use(team) -> None:
    app.state.engine_router = team.router


# ── the default install ────────────────────────────────────────────────────────────────────────────


def test_the_default_install_lists_each_member_with_claude_alone(client, monkeypatch):
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(EXAMPLE_ENGINES_FILE))
    app.state.engine_router = engine_router.router_from_environment(
        app.state.engine_state, {"claude-code": ClaudeEngine()}
    )
    body = body_of(client)
    assert body["choices_version"] == 1
    assert body["members"] == [
        {
            "id": "freeduet",
            "chain": ["claude-code"],
            "left_out": [{"id": "codex", "why": "disabled"}, {"id": "anthropic-api", "why": "disabled"}],
            "mode": "automatic",
            "pin": None,
        },
        {
            "id": "chef",
            "chain": ["claude-code"],
            "left_out": [
                {"id": "codex", "why": "disabled"},
                {"id": "local", "why": "disabled"},
                {"id": "openrouter", "why": "disabled"},
            ],
            "mode": "automatic",
            "pin": None,
        },
    ]
    # The Claude row is what it was: one engine, the same fields.
    (row,) = body["engines"]
    assert (row["id"], row["state"], row["available"]) == ("claude-code", "ready", True)


def test_without_a_router_or_a_team_file_there_are_no_members_and_the_state_is_still_served(client, fake_cli):
    app.state.engine_router = None
    assert body_of(client)["members"] == []
    assert body_of(client)["engines"]
    team_file = fake_cli.agents_file
    team_file.unlink()  # a missing file is an empty team, not an error
    assert body_of(client)["members"] == []


def test_a_failing_overview_never_fails_the_endpoint(client, fake_cli, tmp_path, monkeypatch):
    team = build(tmp_path, fake_cli)
    use(team)

    def broken(_ids):
        raise RuntimeError("the file went away")

    monkeypatch.setattr(team.router, "overview", broken)
    body = body_of(client)
    assert body["members"] == [] and body["engines"] and body["choices_version"] == 1


# ── the chain is what will run ─────────────────────────────────────────────────────────────────────


def test_the_chain_is_the_order_the_member_will_run_logins_first(client, fake_cli, tmp_path):
    team = build(
        tmp_path, fake_cli, ("claude-code", "codex", "local"), chains={"default": ["local", "claude-code", "codex"]}
    )
    use(team)
    freeduet = members_of(client)["freeduet"]
    assert freeduet["chain"] == ["claude-code", "codex", "local"]  # the free engine was written first and runs last
    assert freeduet["left_out"] == []


def test_an_engine_that_will_not_run_is_listed_with_one_word_for_why(client, fake_cli, tmp_path):
    def more(data):
        # `local` is enabled and allowed, but nothing in this service runs it: it has no adapter.
        data["engines"]["local"] = dict(SPECS["local"])
        data["engines"]["off"] = {**SPECS["codex"], "enabled": False}
        data["engines"]["locked"] = {**SPECS["codex"], "enabled": False, "locked_reason": "terms"}
        data["engines"]["gw"] = {
            "kind": "anthropic-compatible", "base_url": "https://gateway.example.invalid/api",
            "credential_secret_ref": "env:GW_KEY", "billing": "metered", "model": "m", "tier": "C", "enabled": True,
        }
        data["engines"]["api"] = {
            "kind": "anthropic-api", "credential_secret_ref": "api-key", "billing": "metered", "model": "m",
            "tier": "A", "enabled": True,
        }
        data["chains"] = {
            "default": ["claude-code", "off", "locked", "gw", "api", "local"],
            "chef": ["claude-code", "codex"],
        }

    use(build(tmp_path, fake_cli, ("claude-code", "codex"), mutate=more))
    members = members_of(client)
    assert members["freeduet"]["chain"] == ["claude-code"]
    assert members["freeduet"]["left_out"] == [
        {"id": "off", "why": "disabled"},
        {"id": "locked", "why": "locked"},
        {"id": "gw", "why": "paid_gateway"},
        {"id": "api", "why": "metered_off"},
        {"id": "local", "why": "not_set_up"},
    ]
    assert members["chef"]["chain"] == ["claude-code", "codex"] and members["chef"]["left_out"] == []


def test_a_metered_cap_of_zero_has_its_own_word(client, fake_cli, tmp_path):
    def metered(data):
        data["engines"]["api"] = {
            "kind": "anthropic-api", "credential_secret_ref": "api-key", "billing": "metered", "model": "m",
            "tier": "A", "enabled": True,
        }
        data["metered"] = {"enabled": True, "daily_cap": 0, "monthly_cap": 5}
        data["chains"] = {"default": ["claude-code", "api"]}

    use(build(tmp_path, fake_cli, ("claude-code",), mutate=metered))
    assert members_of(client)["freeduet"]["left_out"] == [{"id": "api", "why": "cap_zero"}]


def test_the_mode_and_the_pin_are_the_files(client, fake_cli, tmp_path):
    team = build(
        tmp_path, fake_cli,
        switching={"default": {"mode": "ask-first"}, "chef": {"mode": "automatic", "pin": "claude-code"}},
    )
    use(team)
    members = members_of(client)
    assert (members["freeduet"]["mode"], members["freeduet"]["pin"]) == ("ask-first", None)
    assert (members["chef"]["mode"], members["chef"]["pin"]) == ("automatic", "claude-code")


# ── nothing the person wrote in the file leaves except ids and words ───────────────────────────────


def test_no_address_key_reference_or_path_is_in_the_members(client, fake_cli, tmp_path, monkeypatch):
    key_file = tmp_path / "gateway-key"
    key_file.write_text(CANARY_KEY)
    engines_file = tmp_path / "engines.yaml"
    engines_file.write_text(
        "engines:\n"
        "  claude-code: {kind: cli, command: claude, billing: subscription, tier: A, enabled: true}\n"
        "  gw:\n"
        "    kind: anthropic-compatible\n"
        "    base_url: https://gateway.canary-host.example.invalid/api\n"
        f"    credential_secret_ref: file:{key_file}\n"
        "    billing: free\n"
        "    model: canary-model\n"
        "    tier: C\n"
        "    enabled: true\n"
        "  other:\n"
        "    kind: anthropic-compatible\n"
        "    base_url: https://other.canary-host.example.invalid/api\n"
        "    credential_secret_ref: env:CANARY_GATEWAY_VARIABLE\n"
        "    billing: free\n"
        "    model: canary-model\n"
        "    tier: C\n"
        "    enabled: false\n"
        "    locked_reason: 'the provider said /home/person/.config/secret'\n"
        "chains:\n"
        "  default: [claude-code, gw, other]\n"
    )
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(engines_file))
    monkeypatch.setenv("CANARY_GATEWAY_VARIABLE", CANARY_KEY)
    app.state.engine_router = engine_router.router_from_environment(
        app.state.engine_state, {"claude-code": ClaudeEngine()}
    )
    text = json.dumps(body_of(client))
    # The gateway is in the chain (it is allowed and has an adapter), the locked one is left out, and that is all:
    members = members_of(client)
    assert members["freeduet"]["chain"] == ["claude-code", "gw"]
    assert members["freeduet"]["left_out"] == [{"id": "other", "why": "locked"}]
    for secret in (
        CANARY_KEY, "canary-host", "canary-model", "CANARY_GATEWAY_VARIABLE", str(key_file), "/home/person",
        "credential_secret_ref", "base_url", "locked_reason", "the provider said",
    ):
        assert secret not in text, secret
    for member in members.values():
        assert set(member) == {"id", "chain", "left_out", "mode", "pin"}
        assert all(set(entry) == {"id", "why"} and entry["why"] in WORDS for entry in member["left_out"])


# ── the word and the sentence agree ────────────────────────────────────────────────────────────────

_SENTENCE_FOR = {
    "locked": "locked: ",
    "disabled": "disabled in engines.yaml",
    "paid_gateway": "is a paid gateway",
    "metered_off": "metered engines are off",
    "cap_zero": "a metered cap is 0",
}


def test_the_word_and_the_sentence_say_the_same_thing_for_every_combination():
    """`exclusion_reason` (the sentence the router and the adapters use) and `exclusion_code` (the word the page uses)
    are two functions with the same decisions. Every combination of what decides them: the same answer."""
    seen = set()
    for locked, enabled, kind, billing, metered_on, daily, monthly in itertools.product(
        (None, "terms"), (True, False), ("cli", "anthropic-compatible", "anthropic-api"),
        ("subscription", "free", "metered"), (True, False), (0, 2), (0, 3),
    ):
        engine = Engine(id="e", kind=kind, billing=billing, tier="C", enabled=enabled, locked_reason=locked)
        config = EnginesConfig(
            engines={"e": engine}, metered=Metered(enabled=metered_on, daily_cap=daily, monthly_cap=monthly),
            chains={"default": ("e",)}, quality_floor={}, assistants=Assistants(),
        )
        code, sentence = exclusion_code(engine, config), exclusion_reason(engine, config)
        where = (locked, enabled, kind, billing, metered_on, daily, monthly)
        assert (code is None) == (sentence is None), where
        if code is None:
            continue
        seen.add(code)
        assert code in EXCLUSION_CODES, where
        # the sentence is the one for this word and for no other
        assert [word for word, fragment in _SENTENCE_FOR.items() if fragment in sentence] == [code], where
    assert seen == set(EXCLUSION_CODES)  # the combinations reach every word
