"""The person's switching mode and the spend ledger, together (docs/ENGINES_PLAN.md slices 7 and 12).

The person can choose, per member, whether the router switches engines by itself (automatic) or asks first
(`freeduet/engine_choices.py`). The ledger holds an engine that costs money to the limits the person set
(`freeduet/ledger.py`). The mode decides only whether the router asks before it switches: what may run is decided by the
ledger's check in `Router._pick`, which every engine of the order passes, in either mode, and again for every answer to a
question. These tests hold that, with the real service and the real segment loop over fake CLIs; the costs, the limits and
the clock are invented, and no paid gateway can run in this release, so each test opens the gate for itself
(tests/ledger_support.py).
"""

from __future__ import annotations

import pytest

from freeduet import engine_choices
from freeduet.app import app
from freeduet.engine_adapter import Usage
from helpers import post_run, run_body, standing, types
from ledger_support import LIMIT, paid_team

ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
ASK_FIRST = {"version": 1, "mode": "ask-first"}
AUTOMATIC = {"version": 1, "mode": "automatic"}
DAILY_STOP = "paid reached the daily limit you set (1.00 EUR)"
PINNED = ", and this assistant is pinned to it, so I stopped here and did not switch to another engine."
CLAUDE_ANSWERS = f"{DAILY_STOP}, so Claude Code is answering instead.Claude answered."
HELD_QUESTION = f'{DAILY_STOP}. Switch to Claude Code, wait, or pick another? Reply "switch", "wait", or name another engine.'
OFFERED_QUESTION = 'Claude Code reached its limit until Jan 1, 2100 at 00:00 UTC. Switch to paid, wait, or pick another? Reply "switch", "wait", or name another engine.'
NO_ENGINE = (
    "Every engine is unavailable right now. The earliest is back on Nov 15, 2026 at 00:00 UTC. "
    f"{DAILY_STOP}. Your message is kept: send it again later."
)


def said(events) -> str:
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def spend(cost: float) -> Usage:
    return Usage(input_tokens=1000, output_tokens=200, cost=cost, currency="EUR")


def go(client, team, choice=None, messages=ASK, run_id="run-1"):
    """One turn of the member, with `choice` as what the server sends for the person's pick on the Engines page."""
    app.state.engine_router, app.state.engine_state = team.router, team.state
    body = run_body(messages, run_id=run_id)
    if choice is not None:
        body["forwardedProps"][engine_choices.PROP] = choice
    return post_run(client, body)[0]


def answered(question: str, reply: str, number: int = 0) -> list[dict]:
    """The conversation as the person's reply leaves it: the question the router asked, and the reply directly after it."""
    return [*ASK, {"id": "q", "role": "assistant", "content": question}, {"id": f"a{number}", "role": "user", "content": reply}]


def untouched(team) -> None:
    """The paid engine was never started, and the ledger holds only the spend that put it at its cap."""
    assert team["paid"].runs() == 0
    assert [turn["engine"] for turn in team.ledger.turns()] == ["paid"] and team.totals["day"]["spent"] == 1.0


# ── whatever mode the person chose ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("file_switching", "choice", "outcome"),
    [
        pytest.param({"default": {"mode": "ask-first"}}, AUTOMATIC, "answers", id="the person's automatic over a file that asks first"),
        pytest.param(None, ASK_FIRST, "asks", id="the person's ask-first over a file that is automatic"),
        pytest.param({"freeduet": {"pin": "paid", "mode": "ask-first"}}, AUTOMATIC, "pinned", id="a pin to the paid engine, the person's automatic"),
        pytest.param({"freeduet": {"pin": "paid"}}, ASK_FIRST, "pinned", id="a pin to the paid engine, the person's ask-first"),
    ],
)
def test_a_paid_engine_held_by_its_cap_is_skipped_whatever_mode_the_person_chose(
    client, fake_cli, tmp_path, monkeypatch, file_switching, choice, outcome
):
    team = paid_team(tmp_path, fake_cli, monkeypatch, switching=file_switching)
    team.ledger.record("paid", spend(1.0), "EUR")  # today's cap of 1.00 EUR is reached
    team["paid"].plan([{"text": "The paid engine must never say this."}])
    fake_cli.plan([{"text": "Claude answered."}])
    events = go(client, team, choice)
    if outcome == "answers":  # automatic: the cap is told, and Claude answers
        assert said(events) == CLAUDE_ANSWERS and types(events)[-1] == "RUN_FINISHED" and team.claude.runs() == 1
    elif outcome == "asks":  # ask-first: the person is asked, and nothing is started yet
        assert said(events) == HELD_QUESTION and types(events)[-1] == "RUN_FINISHED" and team.claude.runs() == 0
    else:  # a pin never falls back, and the person's mode does not lift it
        assert (events[-1]["type"], events[-1]["code"]) == ("RUN_ERROR", "FREEDUET_ENGINE_LIMITED")
        assert events[-1]["message"] == DAILY_STOP + PINNED and team.claude.runs() == 0
    untouched(team)


# ── ask first, and the cap ─────────────────────────────────────────────────────────────────────────


def test_ask_first_never_turns_a_cap_refusal_into_a_question_whose_answer_lets_the_paid_engine_run(
    client, fake_cli, tmp_path, monkeypatch
):
    team = paid_team(tmp_path, fake_cli, monkeypatch)
    team.ledger.record("paid", spend(1.0), "EUR")
    team["paid"].plan(*([{"text": "The paid engine must never say this."}] for _ in range(6)))
    fake_cli.plan(*([{"text": "Claude answered."}] for _ in range(4)))
    question = said(go(client, team, ASK_FIRST, run_id="question"))
    # The refusal becomes a question about the engine that can answer: the held engine is named as the one that stopped,
    # and it is never the one offered.
    assert question == HELD_QUESTION and "Switch to paid" not in question and team.claude.runs() == 0
    # Every answer that can mean "go on" goes through the same check as any turn: the hold stands, and Claude answers.
    for number, reply in enumerate(("switch", "yes", "paid", "Paid")):  # the last two name the held engine itself
        events = go(client, team, ASK_FIRST, answered(question, reply, number), run_id=f"answer-{number}")
        assert said(events) == CLAUDE_ANSWERS and types(events)[-1] == "RUN_FINISHED", reply
        assert team["paid"].runs() == 0, reply
    # "wait" starts nothing at all.
    events = go(client, team, ASK_FIRST, answered(question, "wait"), run_id="answer-wait")
    assert types(events)[-1] == "RUN_FINISHED" and team.claude.runs() == 4
    untouched(team)


def test_an_answer_to_an_older_question_that_offered_the_paid_engine_is_checked_against_the_cap_as_it_stands_now(
    client, fake_cli, tmp_path, monkeypatch
):
    team = paid_team(tmp_path, fake_cli, monkeypatch)
    team["paid"].plan([{"text": "The paid engine must never say this."}], [{"text": "Nor this."}])
    fake_cli.plan([LIMIT])
    # Under its cap, the paid engine is offered: Claude Code reached its limit and the person is asked.
    question = said(go(client, team, ASK_FIRST, run_id="question"))
    assert question == OFFERED_QUESTION and team["paid"].runs() == 0
    # While the question stands, the cap is reached (the turns of other members, say).
    team.ledger.record("paid", spend(1.0), "EUR")
    for number, reply in enumerate(("switch", "paid")):
        events = go(client, team, ASK_FIRST, answered(question, reply, number), run_id=f"answer-{number}")
        assert (events[-1]["type"], events[-1]["code"]) == ("RUN_ERROR", "FREEDUET_ENGINE_LIMITED"), reply
        assert events[-1]["message"] == NO_ENGINE, reply
    untouched(team)
