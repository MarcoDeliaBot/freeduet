"""The engine chain in the member path (ENGINES_PLAN slice 3): one test per row of the plan's switch table, with
two fake engines (tests/fake_engines.py), through the real service and the real segment loop.

Every limit is the recorded `usage_limit.jsonl` (it says it resets at 2100-01-01 00:00 UTC). Nothing here is a
real engine, login or network.
"""

from __future__ import annotations

import json

import pytest

from freeduet import engine_router
from freeduet.app import app
from freeduet.engine_adapter import ProbeResult
from freeduet.engine_breaker import SIGNED_OUT
from freeduet.engines import EnginesFileError
from fake_engines import build
from helpers import post_run, run_body, standing, tool, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
LIMIT = {"replay": "usage_limit.jsonl"}
SIGNED_OUT_PLAN = {"replay": "not_signed_in.jsonl"}
UNTIL = "00:00 UTC"
DEPLOYMENT = ["message_bot"]
TOOLS = [tool("message_bot", {"bot": {"type": "string"}, "message": {"type": "string"}}), tool("write_page")]


def said(events) -> str:
    return "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")


def use(client, team):
    app.state.engine_router = team.router


def posted(client, team, messages=ASK, **kwargs):
    use(client, team)
    return post_run(client, run_body(messages, **kwargs))[0]


# ── the default install ────────────────────────────────────────────────────────────────────────────


def test_one_engine_is_never_routed(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, ("claude-code",))
    assert not team.router.engaged("freeduet")
    assert not team.router.engaged("chef")


def test_a_disabled_engine_is_not_in_the_chain(client, fake_cli, tmp_path):
    def off(data):
        data["engines"]["codex"]["enabled"] = False

    team = build(tmp_path, fake_cli, mutate=off)
    assert team.router._runnable("freeduet") == ["claude-code"]
    assert not team.router.engaged("freeduet")
    fake_cli.plan([{"text": "Done."}])
    events = posted(client, team)
    assert said(events) == "Done."
    assert team["codex"].runs() == 0


# ── limit before output ────────────────────────────────────────────────────────────────────────────


def test_a_limit_before_any_output_switches_silently_and_says_so(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "The plan is ready."}])
    events = posted(client, team)
    assert types(events)[0] == "RUN_STARTED" and types(events).count("RUN_STARTED") == 1
    assert types(events)[-1] == "RUN_FINISHED"
    assert "RUN_ERROR" not in types(events)
    assert said(events) == (
        f"Claude Code reached its limit until {UNTIL}, so Codex is answering instead.The plan is ready."
    )
    assert fake_cli.run(0) and team["codex"].run(0)


def test_the_first_engine_is_not_asked_again_while_it_is_limited(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "One."}], [{"text": "Two."}])
    posted(client, team)
    events = posted(client, team, run_id="run-2")
    assert team["claude-code"].runs() == 1  # not launched again: the breaker holds it open until its reset
    assert said(events).startswith(f"Claude Code reached its limit until {UNTIL}, so Codex is answering instead.")


# ── limit after text ───────────────────────────────────────────────────────────────────────────────


def test_a_limit_after_text_continues_on_the_next_engine_without_repeating(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([{"text": "First half of the plan."}, LIMIT])
    team["codex"].plan([{"text": "Second half."}])
    events = posted(client, team)
    assert said(events) == (
        "First half of the plan."
        f"Claude Code reached its limit until {UNTIL}, so Codex is continuing from where it stopped, "
        "without repeating the text.Second half."
    )
    prompt = team["codex"].run(0)["prompt"]
    assert "First half of the plan." in prompt  # the next engine reads what was said
    assert "do not repeat it" in json.dumps(team["codex"].run(0))  # and told so, in its notes


# ── a tool call that ran ───────────────────────────────────────────────────────────────────────────


def test_a_tool_that_ran_with_a_result_is_never_run_twice(client, fake_cli, tmp_path, callback_server):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([{"text": "Asking Otto.", "tool": {"name": "message_bot", "input": {"bot": "otto", "message": "Sort the inbox"}}}, LIMIT])
    team["codex"].plan([{"text": "Otto has it, I am done."}])
    events = posted(client, team, tools=TOOLS, deployment=DEPLOYMENT)
    assert len(callback_server) == 1  # the hand-off was made once
    assert "TOOL_CALL_RESULT" in types(events)
    assert types(events)[-1] == "RUN_FINISHED"
    assert "continuing; nothing already done is repeated." in said(events)
    prompt = team["codex"].run(0)["prompt"]
    assert "Sort the inbox" in prompt and "Otto has it: Sort the inbox" in prompt  # the call and its result
    assert prompt.count("<tool_call") == 1 and prompt.count("<tool_result") == 1
    assert team["codex"].run(0).get("calls") is None  # the second engine called nothing


# ── approvals ──────────────────────────────────────────────────────────────────────────────────────


def test_approvals_are_unchanged_across_a_switch(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT], [{"text": "Back on Claude."}])
    team["codex"].plan([{"tool": {"name": "write_page", "input": {"title": "Plan"}}}])
    events = posted(client, team, tools=TOOLS, deployment=DEPLOYMENT)
    # The write is announced and NOT run here: the segment ends and OpenBot's approval gate decides.
    assert "TOOL_CALL_START" in types(events) and "TOOL_CALL_RESULT" not in types(events)
    assert types(events)[-1] == "RUN_FINISHED"
    assert "Codex is answering instead." in said(events)
    # The next POST (the result comes back) walks the chain afresh: Claude is still limited, Codex goes on.
    call_id = next(e["toolCallId"] for e in events if e["type"] == "TOOL_CALL_START")
    messages = [*ASK, {"id": "a1", "role": "assistant", "content": "", "toolCalls": [{"id": call_id, "type": "function", "function": {"name": "write_page", "arguments": "{\"title\": \"Plan\"}"}}]},
                {"id": "t1", "role": "tool", "toolCallId": call_id, "content": "Page written."}]
    team["codex"].plan([{"tool": {"name": "write_page", "input": {"title": "Plan"}}}], [{"text": "Written."}])
    second = posted(client, team, messages, tools=TOOLS, deployment=DEPLOYMENT, run_id="run-2")
    assert "Written." in said(second)
    assert team["claude-code"].runs() == 1


# ── ask-first ──────────────────────────────────────────────────────────────────────────────────────


def question_of(events) -> str:
    return said(events)


def test_ask_first_pauses_with_a_question_and_resumes_on_the_answer(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    first = posted(client, team)
    assert types(first) == ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]
    question = question_of(first)
    assert question == (
        f'Claude Code reached its limit until {UNTIL}. Switch to Codex, wait, or pick another? '
        'Reply "switch", "wait", or name another engine.'
    )
    assert team["codex"].runs() == 0
    history = [*ASK, {"id": "q", "role": "assistant", "content": question}, {"id": "u2", "role": "user", "content": "switch"}]
    team["codex"].plan([{"text": "Done on Codex."}])
    second = posted(client, team, history, run_id="run-2")
    assert said(second).endswith("Done on Codex.")
    assert "answered a question about which engine" in json.dumps(team["codex"].run(0))


def test_ask_first_wait_stops_with_a_plain_message(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    question = question_of(posted(client, team))
    history = [*ASK, {"id": "q", "role": "assistant", "content": question}, {"id": "u2", "role": "user", "content": "wait"}]
    events = posted(client, team, history, run_id="run-2")
    assert types(events)[-1] == "RUN_FINISHED"
    assert said(events) == (
        f"Understood, I will not switch. Waiting for Claude Code (back at {UNTIL}): send your message again when you like."
    )
    assert team["codex"].runs() == 0


def test_ask_first_lets_the_person_name_the_engine(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, ("claude-code", "codex", "gemini-cli"), switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    question = question_of(posted(client, team))
    history = [*ASK, {"id": "q", "role": "assistant", "content": question}, {"id": "u2", "role": "user", "content": "Gemini"}]
    team["gemini-cli"].plan([{"text": "Gemini here."}])
    events = posted(client, team, history, run_id="run-2")
    assert "Gemini here." in said(events)
    assert team["codex"].runs() == 0


def test_ask_first_asks_after_text_too(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([{"text": "Half an answer."}, LIMIT])
    events = posted(client, team)
    assert said(events).startswith("Half an answer.")
    assert 'Reply "switch"' in said(events)
    assert types(events)[-1] == "RUN_FINISHED" and team["codex"].runs() == 0


# ── pin and disable ────────────────────────────────────────────────────────────────────────────────


def test_a_pinned_member_never_falls_back_and_is_told_which_engine_and_until_when(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"freeduet": {"pin": "claude-code"}})
    assert team.router.engaged("freeduet")
    fake_cli.plan([LIMIT])
    events = posted(client, team)
    assert types(events)[-1] == "RUN_ERROR"
    assert events[-1]["code"] == "FREEDUET_ENGINE_LIMITED"
    assert events[-1]["message"] == (
        f"Claude Code reached its limit until {UNTIL}, and this assistant is pinned to it, "
        "so I stopped here and did not switch to another engine."
    )
    assert team["codex"].runs() == 0
    again = posted(client, team, run_id="run-2")  # still limited: not even launched
    assert again[-1]["message"] == events[-1]["message"] and team["claude-code"].runs() == 1


def test_a_pin_on_a_switched_off_engine_stops_with_a_plain_message(client, fake_cli, tmp_path):
    def off(data):
        data["engines"]["codex"]["enabled"] = False

    team = build(tmp_path, fake_cli, switching={"freeduet": {"pin": "codex"}}, mutate=off)
    events = posted(client, team)
    assert events[-1]["message"].startswith("This assistant is pinned to Codex, but Codex is switched off")
    assert team["claude-code"].runs() == 0


# ── loop guard ─────────────────────────────────────────────────────────────────────────────────────


def test_the_loop_guard_stops_after_two_switches(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, ("claude-code", "codex", "gemini-cli", "local"))
    fake_cli.plan([LIMIT])
    team["codex"].plan([LIMIT])
    team["gemini-cli"].plan([LIMIT])
    team["local"].plan([{"text": "Never reached."}])
    events = posted(client, team)
    assert engine_router.MAX_SWITCHES == 2
    assert types(events)[-1] == "RUN_ERROR"
    assert events[-1]["message"].startswith("I switched engines 2 times in this turn and the last one stopped too")
    assert team["local"].runs() == 0


def test_when_every_engine_is_limited_the_person_is_told_when_the_first_is_back(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT])
    team["codex"].plan([LIMIT])
    events = posted(client, team)
    assert events[-1]["code"] == "FREEDUET_ENGINE_LIMITED"
    assert events[-1]["message"] == f"Every engine is unavailable right now. The earliest is back at {UNTIL}. Your message is kept: send it again later."


# ── notices in the person's language ───────────────────────────────────────────────────────────────


def test_the_notice_is_in_italian_for_a_person_who_reads_italian(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([{"text": "Prima parte."}, LIMIT])
    team["codex"].plan([{"text": "Seconda parte."}])
    use(client, team)
    body = run_body(ASK)
    body["forwardedProps"]["openbotPersonLanguage"] = {"code": "it", "name": "Italian"}
    events = post_run(client, body)[0]
    assert said(events) == (
        "Prima parte."
        f"Claude Code ha raggiunto il limite fino alle {UNTIL}, quindi Codex continua da dove si era fermato, senza ripetere il testo."
        "Seconda parte."
    )


@pytest.mark.parametrize(
    ("plan", "sentence"),
    [
        (SIGNED_OUT_PLAN, "Claude Code is not signed in, so Codex is answering instead."),
        ({"stderr": "connection reset", "exit": 1}, None),
    ],
)
def test_a_sign_in_failure_switches_too_and_an_unknown_one_does_not(client, fake_cli, tmp_path, plan, sentence):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([plan])
    team["codex"].plan([{"text": "Codex answer."}])
    events = posted(client, team)
    if sentence:
        assert said(events).startswith(sentence)
    else:
        assert "Codex answer." not in said(events)


# ── timeouts ───────────────────────────────────────────────────────────────────────────────────────


def test_an_engine_that_says_nothing_for_too_long_is_transient_and_the_turn_moves_on(client, fake_cli, tmp_path, monkeypatch):
    monkeypatch.setenv("FREEDUET_FIRST_OUTPUT_SECONDS", "1")
    team = build(tmp_path, fake_cli)
    fake_cli.plan([{"sleep": 20}])
    team["codex"].plan([{"text": "Codex answered."}])
    events = posted(client, team)
    assert "Claude Code is not answering, so Codex is answering instead." in said(events)
    assert said(events).endswith("Codex answered.")
    row = team.state.row("claude-code")
    assert row.last_failure_kind == "transient"


def test_a_whole_turn_timeout_counts_only_when_the_engine_said_nothing(client, fake_cli, tmp_path, monkeypatch):
    from freeduet import segment

    monkeypatch.setattr(segment, "SEGMENT_TIMEOUT_SECONDS", 1.0)
    team = build(tmp_path, fake_cli)
    fake_cli.plan([{"sleep": 20}])
    monkeypatch.setenv("FREEDUET_FIRST_OUTPUT_SECONDS", "60")
    events = posted(client, team)
    assert "took too long" in events[-1]["message"]
    assert team["codex"].runs() == 0  # a whole-turn timeout never moves the turn on
    assert team.state.row("claude-code").last_failure_kind == "transient"


# ── probing ────────────────────────────────────────────────────────────────────────────────────────


def test_a_signed_out_engine_is_probed_at_most_once_a_minute_and_comes_back(client, fake_cli, tmp_path):
    now = [100.0]
    team = build(tmp_path, fake_cli)
    team.router._clock = lambda: now[0]
    seen = []

    async def probe_signed_in():
        seen.append(now[0])
        return ProbeResult(installed=True, version="1", signed_in=True)

    team.router.adapters["claude-code"].probe = probe_signed_in
    team.state._registry.get("claude-code").signed_out()
    assert team.state.row("claude-code").state == SIGNED_OUT
    fake_cli.plan([{"text": "Claude is back."}])
    events = posted(client, team)
    assert said(events) == "Claude is back."  # the probe saw a sign-in, so no switch
    assert seen == [100.0]
    team.state._registry.get("claude-code").signed_out()
    now[0] = 130.0
    team.router.adapters["codex"].probe = probe_signed_in
    team["codex"].plan([{"text": "Codex."}])
    posted(client, team, run_id="run-2")
    assert seen == [100.0]  # asked 30 s ago: not asked again
    now[0] = 161.0
    fake_cli.plan([{"text": "Claude is back."}], [{"text": "Claude again."}])
    again = posted(client, team, run_id="run-3")
    assert seen == [100.0, 161.0] and "Claude again." in said(again)


# ── quality floor ──────────────────────────────────────────────────────────────────────────────────


def test_below_the_quality_floor_the_engine_is_skipped_and_tools_are_withheld_with_a_reason(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, ("claude-code", "local"), quality_floor={"freeduet": {"write_page": "A"}})
    fake_cli.plan([LIMIT])
    team["local"].plan([{"text": "Local answer."}])
    events = posted(client, team, tools=TOOLS, deployment=DEPLOYMENT)
    assert "I cannot use write_page here: only a tier A engine may." in said(events)
    names = [t["name"] for t in team["local"].run(0)["tools"]]
    assert "write_page" not in names and "message_bot" in names


# ── configuration ──────────────────────────────────────────────────────────────────────────────────


def test_switching_in_the_file_is_checked():
    from freeduet.engines import parse_engines

    base = {"engines": {"claude-code": {"kind": "cli", "command": "claude", "billing": "subscription", "tier": "A", "enabled": True}},
            "chains": {"default": ["claude-code"]}}
    with pytest.raises(EnginesFileError) as caught:
        parse_engines({**base, "switching": {"default": {"mode": "sometimes", "pin": "nope", "x": 1}}})
    assert len(caught.value.problems) == 3
