"""D116: a tool call a model wrote as TEXT is not an answer. The detector (conservative: only a message that is, or ends
with, such a block), and the router: the text is never delivered, the engine fails the turn for that reason, the next
engine continues with a notice, the last one ends with a plain message, ask-first still asks, and nothing is run.
Nothing here is a real model or network."""

from __future__ import annotations

import pytest

from datetime import UTC, datetime

from freeduet import engine_notices as notices
from freeduet.engine_adapter import Health
from freeduet.failure_classifier import USAGE_LIMIT, Failure
from freeduet.tools_as_text import looks_like_tool_call_text, prose_before
from test_compatible_engine_chain import chain, posted, said, types, TOOLS, ASK, LIMIT, UNTIL
from test_engine_router import DEPLOYMENT, TOOLS as HANDOFF_TOOLS
from freeduet.app import app

CALL = '<tool_call id="call-1" name="mcp__freeduet__mcp__google-imap__gmail_search_messages">{"query": "in:inbox newer_than:1d"}'

POSITIVE = [
    CALL,
    CALL + "</tool_call>",
    "Let me look.\n" + CALL,
    '<function_call>{"name": "a", "arguments": {}}</function_call>',
    '{"name": "gmail_search_messages", "arguments": {"query": "in:inbox"}}',
    '[{"name": "a", "parameters": {}}]',
    '<|tool_call|>{"name": "a", "arguments": {}}',
    '<|tool_call_start|>[gmail_search(query="x")]<|tool_call_end|>',
    '```tool_call\n{"name": "a", "arguments": {}}\n```',
    '```json\n{"name": "a", "input": {}}\n```',
]
NEGATIVE = [
    "",
    "   ",
    "Hello, I found three mails.",
    "I use the <tool_call> tag when I need a tool.",
    "<tool_call> tags are used by some models, which is why they appear in logs.",
    "A tool call looks like this:\n<tool_call>\nbut I will not write one.",
    'Here is an example: {"name": "Ann", "age": 3} and that is all.',
    '{"name": "Ann", "age": 3}',
    "The function_call field is deprecated.",
    "Use the ```tool_call fence only in docs\nnever mind",
    "Sorry, I could not search: the tool failed.",
]


@pytest.mark.parametrize("text", POSITIVE)
def test_a_tool_call_written_as_text_is_recognised(text):
    assert looks_like_tool_call_text(text)


@pytest.mark.parametrize("text", NEGATIVE)
def test_ordinary_prose_that_mentions_the_words_is_not(text):
    assert not looks_like_tool_call_text(text)


def test_a_non_string_is_not_a_tool_call():
    assert not looks_like_tool_call_text(None) and not looks_like_tool_call_text(7)


def test_the_prose_before_a_block_is_kept_apart():
    assert prose_before("Let me look.\n" + CALL) == "Let me look."
    assert prose_before(POSITIVE[3]) == ""


# ── the router ───────────────────────────────────────────────────────────────────────────────────


def three(tmp_path, monkeypatch, **top):
    return chain(tmp_path, monkeypatch, extra_gateways=("gw2",), **top)


def test_the_text_is_not_delivered_and_the_next_engine_continues_with_a_notice(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": CALL}])
    team.gateways["gw2"].plan([{"text": "You have three new mails."}])
    events = posted(client, team)
    text = said(events)
    assert "<tool_call" not in text and "gmail_search_messages" not in text  # never delivered as the answer
    assert "gw wrote its tool calls as text instead of using them, so gw2 is answering instead." in text
    assert text.endswith("You have three new mails.")
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events) and types(events).count("RUN_STARTED") == 1
    assert "TOOL_CALL_START" not in types(events)  # and never run


def test_the_engines_page_row_carries_a_note_until_a_turn_goes_well(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": CALL}])
    team.gateways["gw2"].plan([{"text": "Done."}])
    posted(client, team)
    rows = {row["id"]: row for row in team.state.snapshot().as_json()["engines"]}
    assert rows["gw"]["note"] == "tools_as_text" and "note" not in rows["gw2"]
    assert rows["gw"]["state"] == "ready"  # a model choice is not the engine's health


def test_prose_before_the_block_stays_and_the_block_goes(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Let me look.\n" + CALL}])
    team.gateways["gw2"].plan([{"text": "Done."}])
    text = said(posted(client, team))
    assert "Let me look." in text and "<tool_call" not in text and text.endswith("Done.")
    assert "continuing from where it stopped" in text  # something was said, so the next engine is told not to repeat it


def test_ordinary_text_with_a_tag_in_it_is_delivered(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "I use the <tool_call> tag when I need one, and `code` too."}])
    text = said(posted(client, team))
    assert text.endswith("I use the <tool_call> tag when I need one, and `code` too.")
    assert team.gateways["gw2"].runs() == 0


def test_the_last_engine_ends_with_a_plain_message_that_suggests_another_model(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": CALL}])
    events = posted(client, team)
    text = said(events)
    assert "<tool_call" not in text
    assert "gw wrote its tool calls as text instead of using them, so it could not do the work" in text
    assert "Choose another model or engine" in text
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert "Every engine is unavailable" not in text


def test_the_last_engine_message_is_in_italian_for_a_person_who_reads_italian():
    assert "Scegli un altro modello" in notices.tools_as_text_stop("it", "gw")


def test_ask_first_still_asks_before_the_turn_moves_on(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch, chains={"default": ["gw", "gw2"]}, switching={"default": {"mode": "ask-first"}})
    team.gw.plan([{"text": CALL}])
    events = posted(client, team)
    text = said(events)
    assert text.startswith("gw wrote its tool calls as text instead of using them. Switch to gw2, wait, or pick another?")
    assert "<tool_call" not in text and types(events)[-1] == "RUN_FINISHED"
    assert team.gateways["gw2"].runs() == 0


def test_the_loop_guard_still_bounds_the_switches(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, extra_gateways=("gw2", "gw3"), chains={"default": ["gw", "gw2", "gw3"]})
    for name in ("gw", "gw2", "gw3"):
        team.gateways[name].plan([{"text": CALL}])
    text = said(posted(client, team))
    assert "<tool_call" not in text
    assert team.gateways["gw3"].runs() == 1  # two switches, then the last engine's own plain message
    assert "gw3 wrote its tool calls as text" in text


def test_a_real_tool_call_is_unchanged(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"tool": {"name": "write_page", "input": {"title": "Plan"}}}])
    events = posted(client, team, tools=TOOLS)
    assert "TOOL_CALL_START" in types(events) and types(events)[-1] == "RUN_FINISHED"
    assert team.gateways["gw2"].runs() == 0


# ── review fixes ─────────────────────────────────────────────────────────────────────────────────

JSON_CALL = '{"name": "gmail_search_messages", "arguments": {"query": "in:inbox"}}'


def test_prose_after_the_closing_tag_means_the_message_does_not_end_with_the_block():
    assert not looks_like_tool_call_text('<tool_call>{"name": "a", "arguments": {}}</tool_call>\nand then I explain it')
    assert not looks_like_tool_call_text('```tool_call\n{"name": "a", "arguments": {}}\n```\nThat was the format.')
    assert looks_like_tool_call_text('<tool_call>{"name": "a", "arguments": {}}</tool_call>\n  \n')


def test_a_whole_message_of_json_is_a_call_only_when_tools_were_offered():
    assert looks_like_tool_call_text(JSON_CALL, tools_offered=True)
    assert not looks_like_tool_call_text(JSON_CALL, tools_offered=False)
    assert not looks_like_tool_call_text("```json\n" + JSON_CALL + "\n```", tools_offered=False)
    # a tag names a call in itself
    assert looks_like_tool_call_text(CALL, tools_offered=False)


def test_a_member_asked_for_json_with_no_tools_is_not_switched(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": JSON_CALL}])
    text = said(posted(client, team))  # the request offers no tool
    assert text.endswith(JSON_CALL)
    assert team.gateways["gw2"].runs() == 0


def test_the_same_json_with_tools_offered_is_a_text_written_call(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": JSON_CALL}])
    team.gateways["gw2"].plan([{"text": "Done."}])
    text = said(posted(client, team, tools=TOOLS))
    assert "gmail_search_messages" not in text and text.endswith("Done.")


def test_a_text_call_followed_by_a_real_answer_is_not_a_failure_and_the_answer_is_said_once(client, fake_cli, tmp_path, monkeypatch):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": CALL}, {"text": "Here is the real answer."}])
    events = posted(client, team)
    text = said(events)
    assert text.count("Here is the real answer.") == 1 and "<tool_call" not in text
    assert "wrote its tool calls as text" not in text
    assert team.gateways["gw2"].runs() == 0 and types(events)[-1] == "RUN_FINISHED"


def test_a_text_call_after_a_real_tool_call_gets_one_sentence_and_nothing_is_repeated(client, fake_cli, tmp_path, monkeypatch, callback_server):
    team = three(tmp_path, monkeypatch)
    fake_cli.plan([LIMIT])
    team.gw.plan([
        {"text": "Asking Otto.", "tool": {"name": "message_bot", "input": {"bot": "otto", "message": "Sort the inbox"}}},
        {"text": CALL},
    ])
    team.gateways["gw2"].plan([{"text": "must not run"}])
    events = posted(client, team, tools=HANDOFF_TOOLS, deployment=DEPLOYMENT)
    text = said(events)
    assert "gw ended with a tool call written as text; nothing more was done." in text
    assert "<tool_call" not in text and "gmail_search_messages" not in text
    assert len(callback_server) == 1  # the real call ran once and was not repeated
    assert team.gateways["gw2"].runs() == 0  # no switch
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)


def test_the_after_tools_sentence_is_in_italian():
    assert "non è stato fatto altro" in notices.tools_as_text_after_tools("it", "gw")


def test_a_limited_engine_after_the_one_that_wrote_a_call_as_text_does_not_hide_the_plain_stop(client, fake_cli, tmp_path, monkeypatch):
    """D119: the stop is decided by the engine that ran and failed, not by the last engine the walk noted as unavailable."""
    team = three(tmp_path, monkeypatch, chains={"default": ["gw", "gw2"]})
    state = team.router.state
    state.finish("gw2", state.begin("gw2"), Health(failure=Failure(USAGE_LIMIT, datetime(2100, 1, 1, tzinfo=UTC))))
    team.gw.plan([{"text": CALL}])
    events = posted(client, team)
    assert "wrote its tool calls as text" in said(events)
    assert types(events)[-1] == "RUN_FINISHED"
