"""Live evals, 8-9 Nov 2026 (jules-1, jules-3): in the middle of a turn Jules said "Opening Booking.com
and re-reading the page both failed with 'No such tool available'", "my browser tool stopped working
partway through" and "my computer stopped responding". Those calls never reached the server.

The cause is not a fault. "No such tool available" is Claude Code's own answer to a call for a name
the freeduet MCP server did not list (cli.js, `Error: No such tool available`), and the bridge lists
exactly this run's `tools` (ipc.mcp_tools). A hand-off turn, the forward hop to the addressed Bot and
the relay of its answer back to the Bot that asked, is run by OpenBot's hand-off delivery with
`tools: []` (server/src/agents/handoff-delivery.ts), so it carries none of the computer tools the
person's browser chat offers (tests/fixtures/handoff_relay_run.json and handoff_hop_run.json, recorded
from the server's own wiring, hold `ask_person` and `make_page` only). Jules's report to Iris is a
hand-off, Iris's answer comes back to Jules as a relay, and a Jules that goes on researching in that
turn calls a tool the CLI does not have.

Whether hand-off turns should get the person's computer is a product and security decision (PR body).
What agent-freeduet owes the member in the meantime is the exact reason, in the turn, so it neither
calls a tool that is not there nor tells the person its browser broke (tool_notes.py), and a log line
when it happens anyway.
"""

import logging

import pytest

from freeduet import tool_notes
from freeduet.stream_json import StreamParser
from helpers import post_run, run_body, standing, tool, types
from test_tool_notes import system_of

CONCIERGE = """\
agents:
  - id: concierge
    name: Jules
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: >-
      You are Jules, the concierge. Research with only three computer tools: computer_navigate opens
      a page and returns its text, computer_read reads the open page again, computer_snapshot lists
      what is on it. With no computer tools, use your research tools. Send your report to Iris with
      message_bot; when Iris's answer comes back to you, say it in a sentence or two.
  - id: chef
    name: Basil
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: You are Basil, the test chef. Hand work on with message_bot.
"""

# What the person's browser chat offers a member that has a computer (app/src/lib/copilot).
COMPUTER = [
    tool("computer_navigate", {"url": {"type": "string"}}),
    tool("computer_read"),
    tool("computer_snapshot"),
]
# What OpenBot's hand-off delivery gives a hand-off turn: the Bot's granted tools, no computer.
HANDOFF_TOOLS = [tool("ask_person"), tool("make_page")]

PERSON = {"id": "u1", "role": "user", "content": "Leaving present for a colleague who loves gardening and jazz. Budget 50."}
EARLIER = {"id": "a1", "role": "assistant", "content": "Two ideas so far. Report: Outcome: in progress."}
# The relay of Iris's answer, written by OpenBot (agents/handoff-runner.ts, `relay`).
RELAY = {
    "id": "handoff-run-9",
    "role": "user",
    "content": "You asked Iris to help with this: Report on the gift ideas.\n\nIt answered:\n\nGood. Find a third idea.\n\n"
    "Give the person the outcome. Keep what matters, drop the pleasantries, and say it came from Iris.",
}
# A forward hop (agents/handoff-runner.ts, `attribute`): Iris hands Jules the work.
HOP = {
    "id": "handoff-run-8",
    "role": "user",
    "content": "freeduet has asked you to help with this, on behalf of the person in this conversation.\n\n"
    "Task: Find three gift ideas for a colleague.\nConstraints: Budget 50.",
}


def with_concierge(fake_cli) -> None:
    import os

    fake_cli.agents_file.write_text(CONCIERGE)
    stat = fake_cli.agents_file.stat()
    os.utime(fake_cli.agents_file, (stat.st_atime, stat.st_mtime + 5))


def jules(messages, tools, **kwargs):
    return run_body([standing("concierge", "You are Jules, the concierge."), *messages], bot_id="concierge", tools=tools, **kwargs)


GO_ON = [
    {"tool": {"name": "computer_navigate", "input": {"url": "https://shop.example/gifts"}}, "real_cli": True},
    {"text": "My browser tool stopped working partway through."},
]


# ── the cause ────────────────────────────────────────────────────────────────────────────────────


def test_a_relay_turn_lists_no_computer_tool_so_the_cli_refuses_the_call_and_nothing_reaches_the_server(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan(GO_ON)
    events, _ = post_run(client, jules([PERSON, EARLIER, RELAY], HANDOFF_TOOLS))
    seen = fake_cli.run(0)
    # The bridge lists this run's tools and nothing else, so the CLI has no computer_navigate...
    assert {t["name"] for t in seen["tools"]} == {"ask_person", "make_page"}
    # ...answers the model's call itself, and the call is in no stored transcript.
    assert seen["unavailable"] == ["computer_navigate"] and "calls" not in seen
    assert "TOOL_CALL_START" not in types(events) and types(events)[-1] == "RUN_FINISHED"


def test_the_same_member_in_the_persons_chat_lists_the_computer_and_the_call_reaches_the_server(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan(GO_ON)
    events, _ = post_run(client, jules([PERSON], [*COMPUTER, *HANDOFF_TOOLS]))
    assert {"computer_navigate", "computer_read", "computer_snapshot"} <= {t["name"] for t in fake_cli.run(0)["tools"]}
    starts = [e for e in events if e["type"] == "TOOL_CALL_START"]
    assert [e["toolCallName"] for e in starts] == ["computer_navigate"]
    assert "unavailable" not in fake_cli.run(0)


def test_the_tools_of_every_segment_are_the_runs_own_and_never_change_inside_a_turn(client, fake_cli):
    """H2: the bridge's list is built per segment from that run's `tools` and answers the same on
    every `tools/list`; a client that offers the computer on each run keeps it for the whole turn."""
    with_concierge(fake_cli)
    steps = 4
    fake_cli.plan(*[[{"tool": {"name": "computer_navigate", "input": {"url": f"https://shop.example/{k}"}}}] for k in range(steps)], [{"text": "Done."}])
    messages = [PERSON]
    for k in range(steps + 1):
        events, _ = post_run(client, jules(messages, [*COMPUTER, *HANDOFF_TOOLS], run_id=f"run-{k}"))
        names = {t["name"] for t in fake_cli.run(k)["tools"]}
        assert {"computer_navigate", "computer_read", "computer_snapshot"} <= names
        start = next((e for e in events if e["type"] == "TOOL_CALL_START"), None)
        if start is None:
            break
        messages = [
            *messages,
            {"id": f"a{k}", "role": "assistant", "toolCalls": [{"id": start["toolCallId"], "type": "function", "function": {"name": "computer_navigate", "arguments": "{}"}}]},
            {"id": f"t{k}", "role": "tool", "toolCallId": start["toolCallId"], "content": '{"ok":true}'},
        ]
    assert k == steps


# ── what the member is told ──────────────────────────────────────────────────────────────────────


def test_a_relay_turn_says_exactly_why_the_computer_is_missing(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "Iris is happy with two ideas for now."}])
    post_run(client, jules([PERSON, EARLIER, RELAY], HANDOFF_TOOLS))
    system = system_of(fake_cli.run(0))
    assert system.count("Why your computer is not offered on this turn") == 1
    note = tool_notes.computer_note("relay", ["computer_navigate", "computer_read", "computer_snapshot"])
    assert note in system
    assert "computer_navigate, computer_read and computer_snapshot" in note
    assert "never say your browser or your computer stopped working" in note
    assert "No such tool available" in note
    assert "their next message in this conversation" in note


def test_a_forward_hop_names_who_handed_the_work_over(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "Here is what I could do without a browser."}])
    post_run(client, jules([PERSON, EARLIER, HOP], HANDOFF_TOOLS))
    note = tool_notes.computer_note("hop", ["computer_navigate", "computer_read", "computer_snapshot"], sender="Iris")
    assert note in system_of(fake_cli.run(0))
    assert "Iris handed you this work" in note and "Your answer goes back to Iris by itself" in note


def test_a_persons_turn_without_the_computer_says_openbot_did_not_offer_it(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "I cannot open pages here."}])
    post_run(client, jules([PERSON], HANDOFF_TOOLS))
    note = tool_notes.computer_note("not_offered", ["computer_navigate", "computer_read", "computer_snapshot"])
    assert note in system_of(fake_cli.run(0))
    assert "OpenBot did not offer your computer on this turn" in note


def test_a_turn_that_offers_the_computer_gets_no_computer_note(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "Searching."}])
    post_run(client, jules([PERSON], [*COMPUTER, *HANDOFF_TOOLS]))
    assert "Why your computer is not offered" not in system_of(fake_cli.run(0))
    assert "computer tools are not offered" not in system_of(fake_cli.run(0))


def test_only_the_computer_tools_that_are_missing_are_named(client, fake_cli):
    # A deployment that allows the browser but not the network offers computer_read, not computer_navigate.
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "Reading."}])
    post_run(client, jules([PERSON], [tool("computer_read"), tool("computer_snapshot"), *HANDOFF_TOOLS]))
    system = system_of(fake_cli.run(0))
    assert tool_notes.computer_note("not_offered", ["computer_navigate"]) in system
    assert "computer_read" not in tool_notes.computer_note("not_offered", ["computer_navigate"])


def test_a_member_whose_prompt_never_names_a_computer_tool_gets_no_computer_note(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "Pasta."}])
    post_run(client, run_body([standing("chef", "You are Basil."), PERSON], bot_id="chef", tools=HANDOFF_TOOLS))
    assert "computer" not in system_of(fake_cli.run(0))


def test_a_member_that_called_its_computer_earlier_in_the_conversation_is_told_too(client, fake_cli):
    # Its prompt names no computer tool (a Bot a person made), but this conversation shows it using one.
    fake_cli.plan([{"text": "Done."}])
    earlier = {"id": "a0", "role": "assistant", "toolCalls": [{"id": "c1", "type": "function", "function": {"name": "computer_navigate", "arguments": "{}"}}]}
    result = {"id": "t0", "role": "tool", "toolCallId": "c1", "content": '{"ok":true}'}
    post_run(client, run_body([standing("freeduet", "You are Iris."), PERSON, earlier, result, RELAY], tools=HANDOFF_TOOLS))
    assert "Why your computer is not offered" in system_of(fake_cli.run(0))


def test_the_note_never_offers_a_tool_openbot_did_not_offer(client, fake_cli):
    with_concierge(fake_cli)
    fake_cli.plan([{"text": "Noted."}])
    post_run(client, jules([PERSON, EARLIER, RELAY], HANDOFF_TOOLS))
    assert {t["name"] for t in fake_cli.run(0)["tools"]} == {"ask_person", "make_page"}


# ── the log ──────────────────────────────────────────────────────────────────────────────────────


def test_a_call_the_cli_refused_is_logged_with_the_tools_the_run_offered(client, fake_cli, caplog):
    with_concierge(fake_cli)
    fake_cli.plan(GO_ON)
    with caplog.at_level(logging.WARNING, logger="freeduet.segment"):
        post_run(client, jules([PERSON, EARLIER, RELAY], HANDOFF_TOOLS))
    lines = [record.getMessage() for record in caplog.records if "No such tool available" in record.getMessage()]
    assert len(lines) == 1
    assert "computer_navigate" in lines[0] and "ask_person" in lines[0] and "make_page" in lines[0]
    assert "hand-off" in lines[0]


def test_the_stream_parser_reads_the_clis_refusal_of_an_unlisted_tool():
    parser = StreamParser()
    refusal = (
        '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1",'
        '"content":"<tool_use_error>Error: No such tool available: mcp__freeduet__computer_navigate</tool_use_error>",'
        '"is_error":true}]},"parent_tool_use_id":null}'
    )
    other = '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"ok"}]}}'
    assert parser.feed(refusal) == [] and parser.feed(other) == []
    assert parser.unavailable == ["computer_navigate"]


@pytest.mark.parametrize("line", ["not json", '{"type":"user","message":"text"}', '{"type":"user","message":{"content":"x"}}'])
def test_the_stream_parser_ignores_user_lines_it_cannot_read(line):
    parser = StreamParser()
    assert parser.feed(line) == [] and parser.unavailable == []


def test_notes_without_a_stated_reason_name_the_switch_the_person_may_have_turned_off():
    for kind in ("relay", "handoff", "not_offered"):
        note = tool_notes.computer_note(kind, ["computer_navigate"])
        assert "switched off by the person, not broken" in note
        assert "your browser is switched off in settings" in note
    # The forward hop never has a browser, whatever the settings say.
    assert "switched off" not in tool_notes.computer_note("hop", ["computer_navigate"], sender="Iris")
