"""The gateway as a link of a member's chain (docs/ENGINES_PLAN.md slice 5): when it is built, when it is asked, what the
person is told, and what it is never allowed to do (come first, run when it is paid, take a tool the quality floor
reserves). A paid (metered) gateway is not run at all until the ledger can enforce the person's caps (slice 12), whatever
the `metered:` block says; every test of it runs with and without that block's whole opt-in and expects the same refusal.

Everything runs through the real service and the real segment loop, over fake CLIs (tests/fake_claude.py). Every limit is
the recorded `usage_limit.jsonl`, which says it resets at 2100-01-01 00:00 UTC. Nothing here is a real gateway, key or login,
and this engine has never answered a real turn.
"""

from __future__ import annotations

import json
import logging

import pytest
from fastapi.testclient import TestClient

from freeduet import engine_notices as notices
from freeduet import engine_router
from freeduet import server_calls as aux
from freeduet.app import app
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_router import router_from_environment
from freeduet.engine_state import EngineState
from freeduet.engines import COMPATIBLE_KIND
from fake_engines import NOW
from gateway_support import BASE_URL, ENTRY, KEY, KEY_ENV, MODEL, chain, config_with, data_with
from helpers import MANAGED_TOKEN, post_run, run_body, standing, tool, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
LIMIT = {"replay": "usage_limit.jsonl"}
UNTIL = "00:00 UTC"
TOOLS = [tool("write_page")]
PAID = {"billing": "metered"}
OPT_IN = {"enabled": True, "daily_cap": 5, "monthly_cap": 50}
#: Without the person's opt-in and with all of it: the answer for a paid gateway is the same.
BLOCKS = [{}, {"metered": OPT_IN}]
PAID_SENTENCE = (
    "gw is a paid gateway. FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. "
    "Free gateways and your own logins work."
)
AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}


def said(events) -> str:
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def posted(client, team, messages=ASK, **kwargs):
    app.state.engine_router = team.router
    return post_run(client, run_body(messages, **kwargs))[0]


def refused_key() -> list[dict]:
    return [{"replay": "gateway_401.jsonl"}, {"exit": 1}]


# ── The default install ──────────────────────────────────────────────────────────────────────────


def test_a_default_install_builds_no_gateway_and_is_not_routed(tmp_path, monkeypatch):
    # Guard of unchanged behaviour: with no engines.yaml the example is read, and it holds no active entry of this kind.
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(tmp_path / "no-engines-file.yaml"))
    router = router_from_environment(EngineState(None), {"claude-code": ClaudeEngine()})
    assert set(router.adapters) == {"claude-code"}
    assert not router.engaged("freeduet") and not router.engaged("chef")


def write_file(tmp_path, entry: dict | None = None, **top) -> str:
    import yaml

    path = tmp_path / "engines.yaml"
    path.write_text(yaml.safe_dump(data_with(entry, **top)), encoding="utf-8")
    return str(path)


def test_a_file_with_a_gateway_switched_on_gives_the_service_a_second_engine(tmp_path, monkeypatch):
    monkeypatch.setenv(KEY_ENV, KEY)
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", write_file(tmp_path))
    router = router_from_environment(EngineState(None), {"claude-code": ClaudeEngine()})
    assert set(router.adapters) == {"claude-code", "gw"}
    assert router.adapters["gw"].kind == COMPATIBLE_KIND
    assert router.engaged("freeduet") and router._runnable("freeduet") == ["claude-code", "gw"]


@pytest.mark.parametrize("top", BLOCKS)
def test_the_service_starts_with_a_paid_gateway_switched_on_names_it_once_in_the_log_and_lists_it_as_refused(fake_cli, tmp_path, monkeypatch, caplog, top):
    caplog.set_level(logging.WARNING, logger="freeduet.compatible_engine")
    monkeypatch.setenv(KEY_ENV, KEY)
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", write_file(tmp_path, PAID, **top))
    with TestClient(app) as started:  # the real start-up: the engines file is read and the router is made
        assert set(app.state.engine_router.adapters) == {"claude-code"}
        body = started.get("/engines", headers=AUTH).json()
    rows = {row["id"]: row for row in body["engines"]}
    assert (rows["gw"]["state"], rows["gw"]["available"], rows["gw"]["refusal"]) == ("refused", False, PAID_SENTENCE)
    assert caplog.text.count(PAID_SENTENCE) == 1


@pytest.mark.parametrize("entry", [{"enabled": False}, {"locked_reason": "Not allowed."}])
def test_a_gateway_that_is_off_or_locked_is_not_built_and_the_member_is_not_routed(tmp_path, monkeypatch, entry):
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", write_file(tmp_path, entry))
    router = router_from_environment(EngineState(None), {"claude-code": ClaudeEngine()})
    assert set(router.adapters) == {"claude-code"} and not router.engaged("freeduet")


def test_a_name_the_service_already_uses_keeps_the_engine_the_service_runs(tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.WARNING)
    import yaml

    path = tmp_path / "engines.yaml"
    path.write_text(yaml.safe_dump({
        "engines": {"claude-code": {**ENTRY, "enabled": True}},  # a gateway that wants the name `claude-code`
        "chains": {"default": ["claude-code"]},
    }), encoding="utf-8")
    monkeypatch.setenv(KEY_ENV, KEY)
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(path))
    own = ClaudeEngine()
    router = router_from_environment(EngineState(None), {"claude-code": own})
    assert router.adapters["claude-code"] is own
    assert "is defined twice" in caplog.text


# ── Never first ──────────────────────────────────────────────────────────────────────────────────


def test_the_gateway_is_never_first_whatever_the_file_lists_first(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, chains={"default": ["gw", "claude-code"]})
    assert team.router._runnable("freeduet") == ["claude-code", "gw"]
    fake_cli.plan([{"text": "Claude answered."}])
    events = posted(client, team)
    assert said(events) == "Claude answered."
    assert team.gw.runs() == 0 and team.gw.starts() == []  # not started: Claude took the turn, and it was first


@pytest.mark.parametrize("top", BLOCKS)
def test_a_paid_gateway_is_not_a_link_of_any_chain_whatever_the_metered_block_says(tmp_path, monkeypatch, top):
    team = chain(tmp_path, monkeypatch, PAID, chains={"default": ["gw", "claude-code"]}, **top)
    assert team.router._runnable("freeduet") == ["claude-code"]


# ── The turn moves on to the gateway ─────────────────────────────────────────────────────────────


def test_when_claude_reaches_its_limit_the_gateway_answers_and_the_person_is_told_which_one(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "The plan is ready."}])
    events = posted(client, team)
    assert types(events)[0] == "RUN_STARTED" and types(events).count("RUN_STARTED") == 1
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert said(events) == f"Claude Code reached its limit until {UNTIL}, so gw is answering instead.The plan is ready."
    assert "Write the plan as a page." in team.gw.run(0)["prompt"]  # it read the person's request


def test_a_limit_after_some_text_continues_on_the_gateway_without_repeating(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    fake_cli.plan([{"text": "First half of the plan."}, LIMIT])
    team.gw.plan([{"text": "Second half."}])
    events = posted(client, team)
    assert said(events) == (
        "First half of the plan."
        f"Claude Code reached its limit until {UNTIL}, so gw is continuing from where it stopped, without repeating the text."
        "Second half."
    )
    assert "First half of the plan." in team.gw.run(0)["prompt"]


def test_the_gateway_is_not_asked_while_claude_can_answer(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    fake_cli.plan([{"text": "One."}], [{"text": "Two."}])
    posted(client, team)
    posted(client, team, run_id="run-2")
    assert team.gw.starts() == []


def test_a_member_pinned_to_the_gateway_never_touches_claude(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, switching={"default": {"pin": "gw"}})
    team.gw.plan([{"text": "On the gateway."}])
    events = posted(client, team)
    assert said(events) == "On the gateway." and types(events)[-1] == "RUN_FINISHED"
    assert not (fake_cli.dir / "count").exists()  # the Claude engine was never started


def test_a_tool_call_on_the_gateway_is_announced_and_not_run_here(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"tool": {"name": "write_page", "input": {"title": "Plan"}}}])
    events = posted(client, team, tools=TOOLS)
    # The approval gate is OpenBot's, as on Claude: the write is announced and the segment ends.
    assert "TOOL_CALL_START" in types(events) and "TOOL_CALL_RESULT" not in types(events)
    assert types(events)[-1] == "RUN_FINISHED"
    assert "so gw is answering instead." in said(events)


# ── The quality floor ────────────────────────────────────────────────────────────────────────────


FLOOR = {"quality_floor": {"freeduet": {"write_page": "A"}}}


def tool_names_of(rig) -> list[str]:
    return [item["name"] for item in rig.run(0)["tools"]]


def test_a_gateway_is_tier_c_unless_the_person_says_otherwise_and_is_not_offered_a_tool_the_floor_reserves(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, **FLOOR)
    assert team.router.config.engines["gw"].tier == "C"
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Done without it."}])
    events = posted(client, team, tools=TOOLS)
    assert "I cannot use write_page here: only a tier A engine may." in said(events)
    assert "write_page" not in tool_names_of(team.gw)
    assert "These tools are not available on this engine: write_page" in json.dumps(team.gw.run(0))  # and the member is told


def test_a_gateway_the_person_declares_tier_a_is_offered_that_tool(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {"tier": "A"}, **FLOOR)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Done."}])
    events = posted(client, team, tools=TOOLS)
    assert "I cannot use write_page here" not in said(events)
    assert "write_page" in tool_names_of(team.gw)


# ── Free and paid ────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("top", BLOCKS)
def test_a_paid_gateway_is_not_built_but_the_member_is_still_routed_so_that_the_person_is_told(tmp_path, monkeypatch, top):
    team = chain(tmp_path, monkeypatch, PAID, **top)
    assert set(team.router.adapters) == {"claude-code"}
    assert team.router._runnable("freeduet") == ["claude-code"]
    assert team.router.engaged("freeduet")  # the one engine would otherwise be run as it always was, with no word of why the gateway did not answer


@pytest.mark.parametrize("top", BLOCKS)
def test_a_paid_gateway_left_out_is_named_when_nothing_else_can_answer(client, fake_cli, tmp_path, monkeypatch, top):
    team = chain(tmp_path, monkeypatch, PAID, **top)
    fake_cli.plan([LIMIT])
    events = posted(client, team)
    assert types(events)[-1] == "RUN_ERROR" and events[-1]["code"] == "FREEDUET_ENGINE_LIMITED"
    assert events[-1]["message"] == (
        f"Every engine is unavailable right now. The earliest is back at {UNTIL}. {PAID_SENTENCE} "
        "Your message is kept: send it again later."
    )
    assert "metered:" not in events[-1]["message"]  # nothing in that block would make it run
    assert team.gw.starts() == [] and team.gw.runs() == 0  # nothing was started, so nothing was billed


@pytest.mark.parametrize("top", BLOCKS)
def test_a_paid_gateway_left_out_changes_nothing_while_claude_answers(client, fake_cli, tmp_path, monkeypatch, top):
    team = chain(tmp_path, monkeypatch, PAID, **top)
    fake_cli.plan([{"text": "Claude answered."}])
    events = posted(client, team)
    assert said(events) == "Claude answered." and types(events)[-1] == "RUN_FINISHED"
    assert team.gw.starts() == []


@pytest.mark.parametrize("top", BLOCKS)
def test_a_member_pinned_to_a_paid_gateway_stops_and_says_why_and_a_pin_never_lifts_the_refusal(client, fake_cli, tmp_path, monkeypatch, top):
    team = chain(tmp_path, monkeypatch, PAID, switching={"default": {"pin": "gw"}}, **top)
    events = posted(client, team)
    assert events[-1] == {
        "type": "RUN_ERROR",
        "message": f"{PAID_SENTENCE} This assistant is pinned to it, so I stopped here and did not switch to another engine.",
        "code": "FREEDUET_ENGINE_LIMITED",
    }
    assert not (fake_cli.dir / "count").exists() and team.gw.starts() == []


def test_a_pin_on_a_switched_off_gateway_stops_with_the_ordinary_message(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {"enabled": False}, switching={"default": {"pin": "gw"}})
    events = posted(client, team)
    assert events[-1]["message"].startswith("This assistant is pinned to gw, but gw is switched off")
    assert not (fake_cli.dir / "count").exists()


def test_when_claude_is_limited_a_paid_gateway_with_the_whole_opt_in_still_does_not_take_over(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, PAID, metered=OPT_IN)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "This would have been billed."}])
    events = posted(client, team)
    assert said(events) == "" and types(events)[-1] == "RUN_ERROR"
    assert team.gw.runs() == 0 and team.gw.starts() == []


# ── What GET /engines says ───────────────────────────────────────────────────────────────────────


def listed(client, team) -> dict[str, dict]:
    app.state.engine_state = team.state
    response = client.get("/engines", headers=AUTH)
    assert response.status_code == 200, response.text
    return {row["id"]: row for row in response.json()["engines"]}


@pytest.mark.parametrize("top", BLOCKS)
def test_a_refused_paid_gateway_is_listed_as_not_runnable_with_the_reason(client, tmp_path, monkeypatch, top):
    team = chain(tmp_path, monkeypatch, PAID, **top)
    rows = listed(client, team)
    assert list(rows) == ["claude-code", "gw"]
    gw = rows["gw"]
    assert (gw["label"], gw["kind"], gw["state"], gw["available"], gw["refusal"]) == ("gw", COMPATIBLE_KIND, "refused", False, PAID_SENTENCE)
    assert (gw["limited_until"], gw["last_failure_kind"], gw["consecutive_failures"]) == (None, None, 0)
    assert (gw["installed"], gw["version"], gw["signed_in"], gw["probed_at"], gw["probe_problem"]) == (None,) * 5  # never probed: nothing runs it


def test_the_listing_of_a_refused_gateway_holds_no_key_no_address_and_no_place_to_find_the_key(client, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, PAID, metered=OPT_IN)
    app.state.engine_state = team.state
    text = client.get("/engines", headers=AUTH).text
    assert KEY not in text and BASE_URL not in text and KEY_ENV not in text and MODEL not in text


def test_a_free_gateway_is_listed_like_any_engine_and_the_login_engine_row_has_no_new_field(client, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    rows = listed(client, team)
    assert rows["gw"]["state"] == "ready" and rows["gw"]["available"] is True and "refusal" not in rows["gw"]
    assert "refusal" not in rows["claude-code"]  # the default install shows exactly the rows it always showed


def test_a_paid_gateway_that_is_switched_off_or_locked_is_not_listed_because_the_person_never_asked_for_it(client, tmp_path, monkeypatch):
    for entry in ({**PAID, "enabled": False}, {**PAID, "locked_reason": "Not allowed."}):
        team = chain(tmp_path, monkeypatch, entry, metered=OPT_IN)
        assert list(listed(client, team)) == ["claude-code"]


def test_a_refused_gateway_gets_no_breaker_and_nothing_is_saved_for_it(tmp_path):
    from freeduet.engine_breaker import FileStore

    saved = tmp_path / "engine-state.json"
    state = EngineState(FileStore(saved), now=NOW)
    state.register_refused("gw", "gw", COMPATIBLE_KIND, PAID_SENTENCE)
    (row,) = state.snapshot().engines
    assert (row.id, row.state, row.available, row.refusal) == ("gw", "refused", False, PAID_SENTENCE)
    assert state.row("gw") == row and not saved.exists()


def test_a_refused_row_never_replaces_a_running_engine_of_the_same_name():
    state = EngineState(None, now=NOW)
    state.register_refused("claude-code", "claude-code", COMPATIBLE_KIND, "x")  # a name that is taken after this...
    state.register(ClaudeEngine())  # ...by the engine the service runs
    state.register_refused("claude-code", "claude-code", COMPATIBLE_KIND, "x")  # ...and asked for again
    (row,) = state.snapshot().engines
    assert (row.id, row.kind, row.state, row.refusal) == ("claude-code", "cli", "ready", None)


# ── A refused key ────────────────────────────────────────────────────────────────────────────────


def test_a_refused_key_is_called_a_key_problem_and_not_a_sign_in(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, switching={"default": {"pin": "gw"}})
    team.gw.plan(refused_key())
    first = posted(client, team)
    assert first[-1]["message"] == (
        "gw has no key its gateway accepts, and this assistant is pinned to it, so I stopped here and did not switch to another engine."
    )
    assert "not signed in" not in first[-1]["message"] and "OPENBOT_MODEL_AUTH_REQUIRED" not in json.dumps(first)
    assert team.state.row("gw").state == "signed_out"


def test_a_missing_key_is_the_same_problem_and_the_cli_is_never_started(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, key=None, switching={"default": {"pin": "gw"}})
    events = posted(client, team)
    assert events[-1]["message"] == (
        "gw has no key its gateway accepts, and this assistant is pinned to it, so I stopped here and did not switch to another engine."
    )
    assert team.gw.starts() == []


def test_a_refused_key_is_tried_again_on_the_next_message_and_then_once_a_minute_at_most(client, fake_cli, tmp_path, monkeypatch):
    now = [1000.0]
    team = chain(tmp_path, monkeypatch, switching={"default": {"pin": "gw"}}, clock=lambda: now[0])
    team.gw.plan(refused_key(), refused_key(), refused_key())
    posted(client, team)
    assert team.gw.runs() == 1 and team.state.row("gw").state == "signed_out"
    # The probe sees a key and says so: it cannot tell a refused key from a good one, because no request goes to the
    # gateway. So the next message tries the engine again, once, and it is refused again.
    posted(client, team, run_id="run-2")
    assert team.gw.runs() == 2
    posted(client, team, run_id="run-3")
    assert team.gw.runs() == 2  # the same minute: left alone
    now[0] += engine_router.PROBE_EVERY_SECONDS + 1
    last = posted(client, team, run_id="run-4")
    assert team.gw.runs() == 3
    assert last[-1]["message"].startswith("gw has no key its gateway accepts")


def test_when_every_engine_is_out_a_refused_key_is_said_because_the_person_can_mend_it(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan(refused_key())
    events = posted(client, team)
    assert events[-1]["code"] == "FREEDUET_ENGINE_LIMITED"
    assert events[-1]["message"] == (
        f"Every engine is unavailable right now. The earliest is back at {UNTIL}. "
        "gw has no key its gateway accepts. Your message is kept: send it again later."
    )


def test_when_the_second_gateway_takes_over_from_a_refused_one_the_notice_says_whose_key(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, extra_gateways=("gw2",))
    fake_cli.plan([LIMIT])
    team.gateways["gw"].plan(refused_key())
    team.gateways["gw2"].plan([{"text": "Done on gw2."}])
    events = posted(client, team)
    assert said(events) == (
        f"Claude Code reached its limit until {UNTIL}, so gw is answering instead."
        "gw has no key its gateway accepts, so gw2 is answering instead."
        "Done on gw2."
    )


def test_a_gateway_that_cannot_be_reached_is_left_like_any_engine_that_is_not_answering(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, extra_gateways=("gw2",))
    fake_cli.plan([LIMIT])
    team.gateways["gw"].plan([{"replay": "gateway_unreachable.jsonl"}, {"exit": 1}])
    team.gateways["gw2"].plan([{"text": "Done on gw2."}])
    events = posted(client, team)
    assert "gw is not answering, so gw2 is answering instead." in said(events)


# ── What is shown ────────────────────────────────────────────────────────────────────────────────


def test_the_engine_list_shows_the_gateway_without_its_address_its_key_or_its_model(tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    shown = json.dumps(team.state.snapshot().as_json())
    row = next(row for row in team.state.snapshot().as_json()["engines"] if row["id"] == "gw")
    assert row["kind"] == COMPATIBLE_KIND
    for secret in (KEY, KEY_ENV, BASE_URL, MODEL, "credential_secret_ref"):
        assert secret not in shown


def test_the_state_file_holds_no_text_a_gateway_sent_and_no_key(client, fake_cli, tmp_path, monkeypatch):
    from freeduet.engine_breaker import FileStore

    path = tmp_path / "engine-state.json"
    team = chain(tmp_path, monkeypatch, switching={"default": {"pin": "gw"}})
    team.state._store = FileStore(path)  # a state that keeps its file, as the service's does
    team.gw.plan([{"events": [  # a gateway that echoes the key and says something of its own in its error
        {"type": "assistant", "message": {"id": "m1", "model": "<synthetic>", "role": "assistant", "type": "message",
                                           "content": [{"type": "text", "text": f"API Error: 502 upstream said {KEY}: Bearer-secret-text"}],
                                           "stop_reason": "stop_sequence"},
         "parent_tool_use_id": None, "error": "server_error", "api_error_status": 502},
        {"type": "result", "subtype": "success", "is_error": True, "api_error_status": 502,
         "result": f"API Error: 502 upstream said {KEY}: Bearer-secret-text", "permission_denials": []},
    ]}, {"exit": 1}])
    events = posted(client, team)
    assert events[-1]["type"] == "RUN_ERROR"
    text = path.read_text() if path.exists() else ""
    assert KEY not in text and "Bearer-secret-text" not in text and BASE_URL not in text


# ── Server-side calls stay on the logins ─────────────────────────────────────────────────────────


def test_server_side_calls_do_not_use_a_gateway_even_when_it_is_named_an_assistant():
    # Guard of unchanged behaviour: the aux server (stream B) runs the Claude CLI and free openai-compatible engines only.
    config = config_with(assistants={"enabled": True, "chain": ["gw"]})
    runtime = aux.AuxRuntime(engines=config, local_key="k")
    request = aux.parse_request({"model": "claude-sonnet-5-5", "max_tokens": 50, "system": "You name conversations, like a title in a sidebar.",
                                 "messages": [{"role": "user", "content": "Hello"}]})
    import asyncio

    with pytest.raises(aux.EngineUnavailable) as caught:
        asyncio.run(aux._run_engine(runtime, config.engines["gw"], request))
    assert "the `anthropic-compatible` engine is not available in this version" in str(caught.value)
    metered = config_with(PAID, metered=OPT_IN).engines["gw"]
    with pytest.raises(aux.EngineUnavailable) as caught:
        asyncio.run(aux._run_engine(runtime, metered, request))
    assert "metered engines are not run" in str(caught.value)


# ── The words the person reads ───────────────────────────────────────────────────────────────────


def test_the_notices_name_a_refused_key_in_both_languages():
    assert notices.reason("en", "gw", notices.KEY, None) == "gw has no key its gateway accepts"
    assert notices.reason("it", "gw", notices.KEY, None) == "gw non ha una chiave accettata dal suo gateway"
    assert notices.reason("en", "Claude Code", "auth", None) == "Claude Code is not signed in"  # unchanged for a login


def test_the_paid_engine_sentence_is_empty_without_one_and_says_one_or_many():
    assert notices.paid_off("en", []) == "" and notices.paid_off("it", ()) == ""
    assert notices.paid_off("en", ["a"]) == (
        " a is a paid gateway. FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. "
        "Free gateways and your own logins work."
    )
    assert notices.paid_off("en", ["a", "b"]) == (
        " a, b are paid gateways. FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. "
        "Free gateways and your own logins work."
    )
    assert notices.paid_off("it", ["a"]) == (
        " a è un gateway a pagamento. FreeDuet non esegue ancora i gateway a pagamento, perché non può ancora far rispettare "
        "i limiti che hai impostato. I gateway gratuiti e i motori su cui hai effettuato l'accesso funzionano."
    )
    assert notices.paid_off("it", ["a", "b"]).startswith(" a, b sono gateway a pagamento. FreeDuet non esegue ancora")


def test_the_chat_log_and_engines_sentences_for_a_paid_gateway_are_one_sentence():
    from freeduet.engines import paid_gateway_refusal

    assert notices.paid_off("en", ["gw"]) == f" {paid_gateway_refusal('gw')}" and paid_gateway_refusal("gw") == PAID_SENTENCE
    for text in (notices.paid_off("en", ["gw"]), notices.paid_off("it", ["gw"]), notices.pinned_paid_off("en", "gw"), notices.pinned_paid_off("it", "gw")):
        assert "metered" not in text  # no advice to set a block that would change nothing


def test_every_engine_unavailable_is_unchanged_when_no_paid_gateway_was_left_out():
    # Guard of unchanged behaviour: the sentence the person already reads.
    assert notices.all_limited("en", None) == "Every engine is unavailable right now. Your message is kept: send it again later."
    assert notices.all_limited("it", None) == "Ora nessun motore è disponibile. Il tuo messaggio è conservato: rimandalo più tardi."
    assert "paid" not in notices.all_limited("en", None, [])


def test_a_refused_key_is_named_in_the_every_engine_unavailable_sentence_in_both_languages():
    assert notices.key_refused("en", []) == "" and notices.key_refused("it", ()) == ""
    assert notices.all_limited("en", None, (), ["gw"]) == (
        "Every engine is unavailable right now. gw has no key its gateway accepts. Your message is kept: send it again later."
    )
    assert notices.all_limited("it", None, (), ["gw", "gw2"]) == (
        "Ora nessun motore è disponibile. gw non ha una chiave accettata dal suo gateway. "
        "gw2 non ha una chiave accettata dal suo gateway. Il tuo messaggio è conservato: rimandalo più tardi."
    )


def test_the_pinned_paid_sentence_is_said_in_both_languages():
    assert notices.pinned_paid_off("en", "gw") == (
        f"{PAID_SENTENCE} This assistant is pinned to it, so I stopped here and did not switch to another engine."
    )
    assert notices.pinned_paid_off("it", "gw") == (
        "gw è un gateway a pagamento. FreeDuet non esegue ancora i gateway a pagamento, perché non può ancora far rispettare "
        "i limiti che hai impostato. I gateway gratuiti e i motori su cui hai effettuato l'accesso funzionano. "
        "Questo assistente è fissato su di esso: mi fermo qui e non passo a un altro motore."
    )
