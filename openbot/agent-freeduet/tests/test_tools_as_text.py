"""D116: a tool call a model wrote as TEXT is not an answer. The detector (conservative: only a message that is, or ends
with, such a block), and the router: the text is never delivered, the engine fails the turn for that reason, the next
engine continues with a notice, the last one ends with a plain message, ask-first still asks, and nothing is run.
Nothing here is a real model or network."""

from __future__ import annotations

import pytest

from freeduet import engine_notices as notices
from freeduet.tools_as_text import looks_like_tool_call_text, prose_before
from test_compatible_engine_chain import chain, posted, said, types, TOOLS, ASK, LIMIT, UNTIL
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
