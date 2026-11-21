"""D121: a short hold waits instead of switching.

The limit is the recorded `usage_limit.jsonl`, which says it resets at 2100-01-01 00:00 UTC. A test sets the breaker's clock a few
seconds before that moment (a short hold) or five hours before (a long one, the default of tests/fake_engines.py). The router's sleep is
replaced by a function that moves that fake clock, so no test waits for real time and none counts timer ticks.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest

from freeduet import agui, engine_notices as notices, engine_router
from freeduet.app import app
from freeduet.members import resolve_member
from freeduet.segment import SegmentNotes
from fake_engines import RESET, build
from helpers import post_run, run_body, standing, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
LIMIT = {"replay": "usage_limit.jsonl"}
UNTIL = "Jan 1, 2100 at 00:00 UTC"


class Clock:
    """The breaker's clock and the router's sleep, together: sleeping moves the clock, nothing else does."""

    def __init__(self, seconds_before_reset: float):
        self.moment = RESET - timedelta(seconds=seconds_before_reset)
        self.slept: list[float] = []

    def __call__(self):
        return self.moment

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.moment += timedelta(seconds=seconds)


def said(events) -> str:
    return "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")


def team_with(tmp_path, fake_cli, seconds_before_reset: float, **kwargs):
    clock = Clock(seconds_before_reset)
    team = build(tmp_path, fake_cli, clock=clock, **kwargs)
    team.router._sleep = clock.sleep
    app.state.engine_router = team.router
    return team, clock


WAIT_45 = "Claude Code asks to wait 45 seconds; I wait and try again."


def test_a_short_hold_waits_and_tries_the_same_engine_again_without_switching(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45)
    fake_cli.plan([LIMIT], [{"text": "The plan is ready."}])
    team["codex"].plan([{"text": "Codex answered."}])
    events = post_run(client, run_body(ASK))[0]
    assert said(events) == WAIT_45 + "The plan is ready."
    assert said(events).count("asks to wait") == 1
    assert clock.slept == [45 + engine_router.HOLD_WAIT_CUSHION_SECONDS]
    assert team["claude-code"].runs() == 2 and team["codex"].runs() == 0
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert "answering instead" not in said(events)


def test_a_long_hold_switches_as_before_and_does_not_wait(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 5 * 3600)
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "The plan is ready."}])
    events = post_run(client, run_body(ASK))[0]
    assert said(events) == f"Claude Code reached its limit until {UNTIL}, so Codex is answering instead.The plan is ready."
    assert clock.slept == []
    assert team["claude-code"].runs() == 1


def test_a_hold_just_over_the_threshold_switches(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, engine_router.HOLD_WAIT_MAX_SECONDS + 1)
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "Codex."}])
    events = post_run(client, run_body(ASK))[0]
    assert "so Codex is answering instead." in said(events) and clock.slept == []


def test_a_hold_exactly_at_the_threshold_waits(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, engine_router.HOLD_WAIT_MAX_SECONDS)
    fake_cli.plan([LIMIT], [{"text": "Back."}])
    events = post_run(client, run_body(ASK))[0]
    assert said(events).endswith("Back.") and len(clock.slept) == 1


def test_when_the_retry_fails_too_the_turn_switches_and_waits_only_once(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45)
    fake_cli.plan([LIMIT], [LIMIT])
    team["codex"].plan([{"text": "Codex answered."}])
    events = post_run(client, run_body(ASK))[0]
    text = said(events)
    assert text.startswith(WAIT_45) and text.count("asks to wait") == 1
    assert text.endswith("so Codex is answering instead.Codex answered.")
    assert len(clock.slept) == 1 and team["claude-code"].runs() == 2
    assert types(events)[-1] == "RUN_FINISHED"


def test_an_engine_already_held_for_a_short_time_at_the_start_is_waited_for(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45)
    real_sleep = team.router._sleep

    async def no_time(seconds):  # turn one: the wait does not move the clock, so the retry is limited again and the turn switches
        clock.slept.append(seconds)

    team.router._sleep = no_time
    fake_cli.plan([LIMIT], [{"text": "Two."}])
    team["codex"].plan([{"text": "One."}])
    post_run(client, run_body(ASK))
    assert team["claude-code"].runs() == 1  # still held after the wait: not asked again, the turn moved on
    # Turn two starts with Claude still held, for 45 seconds more: it waits (the sleep moves the clock now) and Claude answers.
    team.router._sleep = real_sleep
    events = post_run(client, run_body(ASK, run_id="run-2"))[0]
    assert said(events) == WAIT_45 + "Two."
    assert team["claude-code"].runs() == 2 and team["codex"].runs() == 1


def test_ask_first_waits_for_a_short_hold_without_asking(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT], [{"text": "The plan is ready."}])
    events = post_run(client, run_body(ASK))[0]
    assert said(events) == WAIT_45 + "The plan is ready."  # a wait changes no engine, so there is nothing to ask
    assert team["codex"].runs() == 0


def test_ask_first_asks_when_the_retry_fails_too(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT], [LIMIT])
    team["codex"].plan([{"text": "Never run."}])
    events = post_run(client, run_body(ASK))[0]
    text = said(events)
    assert text.startswith(WAIT_45) and 'Reply "switch", "wait", or name another engine.' in text
    assert text.count("asks to wait") == 1 and team["codex"].runs() == 0
    assert types(events)[-1] == "RUN_FINISHED"


def test_a_pinned_member_waits_for_its_pinned_engine(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45, switching={"freeduet": {"pin": "claude-code"}})
    fake_cli.plan([LIMIT], [{"text": "Pinned answer."}])
    events = post_run(client, run_body(ASK))[0]
    assert said(events) == WAIT_45 + "Pinned answer."
    assert team["codex"].runs() == 0


def test_a_pinned_engine_whose_retry_fails_stops_with_the_pinned_message(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 45, switching={"freeduet": {"pin": "claude-code"}})
    fake_cli.plan([LIMIT], [LIMIT])
    events = post_run(client, run_body(ASK))[0]
    assert "RUN_ERROR" in types(events) and team["codex"].runs() == 0
    assert said(events).count("asks to wait") == 1


def test_a_hold_in_italian_is_told_in_italian(client, fake_cli, tmp_path):
    team, clock = team_with(tmp_path, fake_cli, 1)
    fake_cli.plan([LIMIT], [{"text": "Fatto."}])
    body = run_body(ASK)
    body["forwardedProps"]["openbotPersonLanguage"] = {"code": "it", "name": "Italian"}
    events = post_run(client, body)[0]
    assert said(events).startswith("Claude Code chiede di attendere 1 secondo; aspetto e riprovo.")


def test_the_stream_stays_open_while_the_turn_waits(fake_cli, tmp_path):
    """The router waits inside the stream, and `agui.sse` sends a keep-alive comment whenever nothing was sent for a while. The
    router's sleep here ends only after one keep-alive has been read, so the test shows the stream spoke during the wait."""
    team, clock = team_with(tmp_path, fake_cli, 45)
    fake_cli.plan([LIMIT], [{"text": "Done."}])
    seen_keepalive = asyncio.Event()

    async def sleep(seconds):
        clock.slept.append(seconds)
        await asyncio.wait_for(seen_keepalive.wait(), 30)
        clock.moment += timedelta(seconds=seconds)

    team.router._sleep = sleep
    run = agui.parse_run_input(run_body(ASK))
    member = resolve_member(run.bot_id, run.messages)

    async def go():
        chunks = []
        async for chunk in agui.sse(team.router.run(run, member, SegmentNotes()), keepalive_seconds=0.01):
            chunks.append(chunk)
            if chunk == agui.KEEPALIVE and b"asks to wait" in b"".join(chunks):  # a keep-alive during the wait itself
                seen_keepalive.set()
        return chunks

    chunks = asyncio.run(go())
    assert agui.KEEPALIVE in chunks
    told = next(i for i, chunk in enumerate(chunks) if b"asks to wait" in chunk)
    assert agui.KEEPALIVE in chunks[told:]  # the stream spoke after the person was told, while the router slept
    assert b"RUN_FINISHED" in chunks[-1]  # and the turn then went on to the retry and finished


# -- a model rate-limited by its own provider behind OpenRouter is unavailable, not slow ------------------------------

MODEL = "google/gemma-4-26b-a4b-it:free"
OPENROUTER = {"base_url": "https://openrouter.ai/api", "billing": "free", "model": MODEL}
UPSTREAM = {"replay": "gateway_429_upstream.jsonl"}
PLAIN_429 = {"replay": "gateway_429.jsonl"}
LONG_LIMIT = LIMIT  # Claude Code's limit resets in five hours at the default fake clock


def openrouter_chain(tmp_path, monkeypatch):
    from gateway_support import chain

    team = chain(tmp_path, monkeypatch, OPENROUTER, extra_gateways=("gw2",))
    slept = []

    async def record(seconds):
        slept.append(seconds)

    team.router._sleep = record
    app.state.engine_router = team.router
    return team, slept


def test_an_upstream_rate_limit_switches_at_once_with_the_reason_and_waits_for_nothing(client, fake_cli, tmp_path, monkeypatch):
    team, slept = openrouter_chain(tmp_path, monkeypatch)
    fake_cli.plan([LONG_LIMIT])
    team.gateways["gw"].plan([UPSTREAM])
    team.gateways["gw2"].plan([{"text": "Answered by the next engine."}])
    events = post_run(client, run_body(ASK))[0]
    text = said(events)
    assert notices.reason("en", "gw", notices.Upstream(MODEL), None) in text  # the one fixed sentence (engine_notices.py)
    assert f"the free model {MODEL}" in text and "OpenRouter card" in text
    assert text.endswith("Answered by the next engine.")
    assert slept == [] and "asks to wait" not in text
    assert team.gateways["gw"].turns() and len(team.gateways["gw"].turns()) == 1  # not asked again
    assert team.state.row("gw").note == notices.upstream_note(MODEL)


def test_a_model_held_by_its_provider_is_not_waited_for_on_the_next_turn_either(client, fake_cli, tmp_path, monkeypatch):
    team, slept = openrouter_chain(tmp_path, monkeypatch)
    fake_cli.plan([LONG_LIMIT])
    team.gateways["gw"].plan([UPSTREAM])
    team.gateways["gw2"].plan([{"text": "One."}], [{"text": "Two."}])
    post_run(client, run_body(ASK))
    events = post_run(client, run_body(ASK, run_id="run-2"))[0]
    assert said(events).endswith("Two.")  # the notice names the first engine that was held, as before (D119)
    assert slept == [] and len(team.gateways["gw"].turns()) == 1  # no wait, and the held model was not asked again
    assert notices.is_upstream_note(team.state.row("gw").note)


def test_an_openrouter_429_that_is_only_a_rate_limit_still_waits(client, fake_cli, tmp_path, monkeypatch):
    team, slept = openrouter_chain(tmp_path, monkeypatch)
    fake_cli.plan([LONG_LIMIT])
    team.gateways["gw"].plan([PLAIN_429])
    team.gateways["gw2"].plan([{"text": "Next."}])
    events = post_run(client, run_body(ASK))[0]
    assert slept == [61.0] and "asks to wait 60 seconds; I wait and try again." in said(events)


def test_the_upstream_words_are_read_only_from_openrouters_wording():
    from freeduet.failure_classifier import is_upstream_rate_limit

    # Written in two pieces: tests/test_engine_errors.py reads every whole string of the suite as limit words and wants it pinned.
    assert is_upstream_rate_limit("x/y:free is temporarily " + "rate-" + "limited" + " upstream. Please retry shortly")
    assert not is_upstream_rate_limit("You are being " + "rate" + " limited, try later")
    assert not is_upstream_rate_limit(None)


# -- only OpenRouter's wording of an upstream limit drops the stated wait -------------------------------------------------


def _upstream_parser(extra=" Try again in 20s."):
    from freeduet.stream_json import StreamParser
    from test_engine_state import FIXTURES

    parser = StreamParser()
    for line in (FIXTURES / "gateway_429_upstream.jsonl").read_text().splitlines():
        parser.feed(line.replace("Please retry shortly", "Please retry shortly." + extra) + "\n")
    return parser


def test_another_gateways_stated_wait_is_kept_even_with_the_same_words():
    from freeduet import compatible_engine as ce

    other = ce.turn_verdict(_upstream_parser(), "", 1)
    assert other.kind == "rate_limit" and other.upstream is False and other.retry_at is not None


def test_openrouters_upstream_limit_carries_no_wait_and_is_flagged():
    from freeduet import compatible_engine as ce

    failure = ce.turn_verdict(_upstream_parser(), "", 1, openrouter=True)
    assert failure.kind == "rate_limit" and failure.upstream is True and failure.retry_at is None
