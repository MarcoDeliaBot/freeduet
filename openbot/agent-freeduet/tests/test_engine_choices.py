"""The person's engine choices, sent with each run, and honoured by the router
(docs/ENGINES_PLAN.md slice 7, docs/design/engines-dashboard.md section 5).

`forwardedProps.openbotEngineChoices` is what the server sends for the member a run is for, when the person chose
something on the Engines page. Only the mode (automatic or ask-first) is read so far. It is read tolerantly, as every
`forwardedProps` field is: what is not in the shape the server sends is ignored and the file's values stand. The pin
is the file's. A choice never reaches a prompt.
"""

from __future__ import annotations

import json

import pytest

from freeduet import engine_choices
from freeduet.agui import RunInput, parse_run_input
from freeduet.app import app
from freeduet.engine_choices import Choices
from freeduet.engines import Switching
from fake_engines import build
from helpers import post_run, run_body, standing, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
LIMIT = {"replay": "usage_limit.jsonl"}
UNTIL = "00:00 UTC"
QUESTION = (
    f'Claude Code reached its limit until {UNTIL}. Switch to Codex, wait, or pick another? '
    'Reply "switch", "wait", or name another engine.'
)
SWITCHED = f"Claude Code reached its limit until {UNTIL}, so Codex is answering instead."
ASK_FIRST = {"version": 1, "mode": "ask-first"}
AUTOMATIC = {"version": 1, "mode": "automatic"}


def said(events) -> str:
    return "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")


def chosen(value, messages=ASK, **kwargs) -> dict:
    """A run body that carries `value` as the person's engine choices, as the server would send it."""
    body = run_body(messages, **kwargs)
    body["forwardedProps"][engine_choices.PROP] = value
    return body


def run_on(client, team, body):
    app.state.engine_router = team.router
    return post_run(client, body)[0]


# ── reading it ─────────────────────────────────────────────────────────────────────────────────────


def test_a_choice_in_the_shape_the_server_sends_is_read():
    assert engine_choices.from_props(ASK_FIRST) == Choices(mode="ask-first")
    assert engine_choices.from_props(AUTOMATIC) == Choices(mode="automatic")
    # A field this service does not read is left alone, and does not spoil the one it does.
    assert engine_choices.from_props({**ASK_FIRST, "pin": "codex", "order": ["a"], "other": {}}) == Choices(mode="ask-first")


@pytest.mark.parametrize(
    "value",
    [
        None, "ask-first", ["ask-first"], 7, True, {},
        {"mode": "ask-first"},  # no version
        {"version": 2, "mode": "ask-first"},  # a version this service does not know
        {"version": "1", "mode": "ask-first"},
        {"version": True, "mode": "ask-first"},  # True == 1 in Python: a boolean is not a version
        {"version": 1.5, "mode": "ask-first"},
        {"version": 1},  # nothing chosen
        {"version": 1, "mode": None},
        {"version": 1, "mode": "Ask-First"},
        {"version": 1, "mode": "pin"},
        {"version": 1, "mode": ["ask-first"]},
        {"version": 1, "mode": {"x": 1}},
        {"version": 1, "mode": 1},
    ],
)
def test_anything_else_is_ignored_as_if_nothing_was_chosen(value):
    assert engine_choices.from_props(value) is None


def test_a_choice_is_laid_over_the_files_switching_and_the_pin_stays_the_files():
    file = Switching(mode="automatic", pin="claude-code")
    assert engine_choices.apply(file, Choices(mode="ask-first")) == Switching(mode="ask-first", pin="claude-code")
    assert engine_choices.apply(Switching(mode="ask-first"), Choices(mode="automatic")) == Switching(mode="automatic")
    assert engine_choices.apply(file, None) is file
    assert engine_choices.apply(file, Choices()) is file


def test_the_run_input_carries_the_choice_and_a_bad_one_never_refuses_the_run():
    assert parse_run_input(chosen(ASK_FIRST)).engine_choices == Choices(mode="ask-first")
    assert parse_run_input(run_body(ASK)).engine_choices is None
    for garbage in ("x", 3, [], {"version": 9}, {"version": 1, "mode": "nope"}):
        run = parse_run_input(chosen(garbage))
        assert isinstance(run, RunInput) and run.engine_choices is None
        assert run.bot_id == "freeduet" and run.thread_id == "thread-1"  # everything else is read as always


# ── honoured by the router ─────────────────────────────────────────────────────────────────────────


def test_a_persons_ask_first_beats_a_file_that_says_automatic(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)  # the file says nothing: automatic
    fake_cli.plan([LIMIT])
    events = run_on(client, team, chosen(ASK_FIRST))
    assert types(events) == ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]
    assert said(events) == QUESTION
    assert team["codex"].runs() == 0  # nothing moved on without the person's word


def test_a_persons_automatic_beats_a_file_that_says_ask_first(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "The plan is ready."}])
    events = run_on(client, team, chosen(AUTOMATIC))
    assert said(events) == f"{SWITCHED}The plan is ready."
    assert types(events)[-1] == "RUN_FINISHED" and team["codex"].runs() == 1


def test_without_a_choice_or_with_one_the_service_cannot_read_the_files_mode_stands(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    assert said(run_on(client, team, run_body(ASK))) == QUESTION
    # a version this service does not know, a mode it does not know: the file's ask-first
    assert said(run_on(client, team, chosen({"version": 2, "mode": "automatic"}, run_id="run-2"))) == QUESTION
    assert said(run_on(client, team, chosen({"version": 1, "mode": "whenever"}, run_id="run-3"))) == QUESTION
    assert team["codex"].runs() == 0


def test_a_choice_this_service_cannot_read_leaves_an_automatic_file_automatic(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "Done."}])
    events = run_on(client, team, chosen({"version": 2, "mode": "ask-first"}))
    assert said(events) == f"{SWITCHED}Done."


def test_a_pin_in_the_file_holds_whatever_mode_the_person_chose(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"freeduet": {"pin": "claude-code"}})
    fake_cli.plan([LIMIT])
    events = run_on(client, team, chosen(ASK_FIRST))
    assert types(events)[-1] == "RUN_ERROR" and events[-1]["code"] == "FREEDUET_ENGINE_LIMITED"
    assert events[-1]["message"] == (
        f"Claude Code reached its limit until {UNTIL}, and this assistant is pinned to it, "
        "so I stopped here and did not switch to another engine."
    )  # not the question: a pinned member is never asked to move
    assert team["codex"].runs() == 0


def test_the_answer_to_the_question_is_read_even_after_the_mode_was_changed(client, fake_cli, tmp_path):
    """The person was asked (ask-first), then switched the mode to automatic on the page, then answered. The question
    stands in the conversation, so the reply is its answer and not a new request for the model."""
    team = build(tmp_path, fake_cli)  # automatic now
    fake_cli.plan([LIMIT])
    history = [*ASK, {"id": "q", "role": "assistant", "content": QUESTION}, {"id": "u2", "role": "user", "content": "switch"}]
    team["codex"].plan([{"text": "Done on Codex."}])
    events = run_on(client, team, chosen(AUTOMATIC, history, run_id="run-2"))
    assert said(events).endswith("Done on Codex.")
    assert "answered a question about which engine" in json.dumps(team["codex"].run(0))
    # and "wait" is honoured too
    waiting = [*ASK, {"id": "q", "role": "assistant", "content": QUESTION}, {"id": "u3", "role": "user", "content": "wait"}]
    again = run_on(client, team, chosen(AUTOMATIC, waiting, run_id="run-3"))
    assert said(again).startswith("Understood, I will not switch. Waiting for Claude Code")
    assert team["codex"].runs() == 1


def test_the_answer_is_read_the_same_while_the_mode_is_still_ask_first(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT])
    history = [*ASK, {"id": "q", "role": "assistant", "content": QUESTION}, {"id": "u2", "role": "user", "content": "switch"}]
    team["codex"].plan([{"text": "Done on Codex."}])
    events = run_on(client, team, chosen(ASK_FIRST, history, run_id="run-2"))
    assert said(events).endswith("Done on Codex.")


# ── what a member's model learns ───────────────────────────────────────────────────────────────────


def test_the_choice_never_reaches_the_model(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli, switching={"default": {"mode": "ask-first"}})
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "Done."}])
    history = [*ASK, {"id": "q", "role": "assistant", "content": QUESTION}, {"id": "u2", "role": "user", "content": "switch"}]
    run_on(client, team, chosen(AUTOMATIC, history))
    for fake in (fake_cli.run(0), team["codex"].run(0)):
        seen = json.dumps(fake)
        assert engine_choices.PROP not in seen and '"mode"' not in seen and "automatic" not in seen


def test_a_default_install_runs_exactly_as_it_did_with_or_without_a_choice(client, fake_cli, tmp_path):
    """One engine: the router is not engaged, so the turn is the one it always was. The choice is read and unused."""
    team = build(tmp_path, fake_cli, ("claude-code",))
    app.state.engine_router = team.router
    assert not team.router.engaged("freeduet")
    fake_cli.plan([{"text": "Done."}], [{"text": "Done."}])
    plain = post_run(client, run_body(ASK))[0]
    with_choice = post_run(client, chosen(ASK_FIRST, run_id="run-2"))[0]
    assert types(plain) == types(with_choice) and said(plain) == said(with_choice) == "Done."
    assert fake_cli.run(0)["prompt"] == fake_cli.run(1)["prompt"]
    assert engine_choices.PROP not in json.dumps(fake_cli.run(1))
