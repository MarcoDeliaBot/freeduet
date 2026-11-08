"""iris-2 (issue #19): Iris told the person "the messaging tool is unavailable" and wrote a brief to
paste to Jules. The turn she said it in was the relay of Jules's answer, which OpenBot runs as a
hand-off at depth 1, where it offers no message_bot (agents/handoff-tool.ts, BOT_HANDOFF_MAX_DEPTH=1;
reproduced on the server side in server/tests/freeduet-handoff.test.ts). agent-freeduet now gives the
member the exact reason in that turn (tool_notes.py) and every member the rule to give the reason a
tool result gave, never "unavailable" alone (transcript.RUNTIME_NOTE)."""

import copy
import json
import os
from pathlib import Path

from freeduet import tool_notes
from freeduet.transcript import RUNTIME_NOTE
from helpers import post_run, run_body, standing, tool, types

FIXTURES = Path(__file__).parent / "fixtures"

TEAM = """\
agents:
  - id: freeduet
    name: Iris
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: >-
      You are Iris. Hand each piece over with message_bot. With neither, write one line per
      colleague: who to open and the brief ready to paste.
  - id: bookkeeper
    name: Penny
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: You are Penny. When Iris did not give you the work and it failed, send your report to Iris with message_bot.
  - id: chef
    name: Basil
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: You are Basil, the test chef.
"""


def recorded(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def with_team(fake_cli) -> None:
    fake_cli.agents_file.write_text(TEAM)
    stat = fake_cli.agents_file.stat()
    os.utime(fake_cli.agents_file, (stat.st_atime, stat.st_mtime + 5))


def system_of(seen: dict) -> str:
    return seen["argv"][seen["argv"].index("--append-system-prompt") + 1]


def test_the_relay_of_an_answer_says_exactly_why_message_bot_is_missing(client, fake_cli):
    with_team(fake_cli)
    relay = recorded("handoff_relay_run.json")
    # What OpenBot offers Iris in the relay turn: no message_bot at depth 1.
    assert "message_bot" not in {tool["name"] for tool in relay["tools"]}
    fake_cli.plan([{"text": "Penny says Northwind owes 1,200.00 EUR for March."}])
    events, _ = post_run(client, relay)
    assert types(events)[-1] == "RUN_FINISHED"

    system = system_of(fake_cli.run(0))
    note = tool_notes.relay_note(" at hand-off depth 1")
    assert note in system and system.count("Why message_bot is not offered") == 1
    assert "do not write a brief for the person to paste" in note and "never say a tool is unavailable" in note
    assert "their next message in this conversation is an ordinary turn, where message_bot is offered again" in note
    assert system.index(note) < system.index(RUNTIME_NOTE)
    assert "never say a tool is unavailable without the reason you were given" in RUNTIME_NOTE


def test_a_hop_says_the_answer_goes_back_to_who_handed_it(client, fake_cli):
    with_team(fake_cli)
    fake_cli.plan([{"text": "Northwind owes 1,200.00 EUR."}])
    post_run(client, recorded("handoff_hop_run.json"))
    system = system_of(fake_cli.run(0))
    assert tool_notes.hop_note("Iris", " at hand-off depth 1") in system
    assert "Your answer goes back to Iris by itself" in system


def test_irises_own_turn_with_message_bot_gets_no_note(client, fake_cli):
    with_team(fake_cli)
    fake_cli.plan([{"text": "Jules: a quiet table for four, Friday at eight."}])
    body = run_body(
        [standing("freeduet", "You are Iris, Chief of Staff."),
         {"id": "u1", "role": "user", "content": "Get me a table for four on Friday at eight, somewhere quiet near the office."}],
        tools=[tool("message_bot"), tool("ask_person")],
    )
    post_run(client, body)
    assert "message_bot is not offered" not in system_of(fake_cli.run(0))


def test_a_persons_turn_without_message_bot_says_openbot_did_not_offer_it(client, fake_cli):
    with_team(fake_cli)
    fake_cli.plan([{"text": "Jules: open Jules and paste this brief."}])
    body = run_body(
        [standing("freeduet", "You are Iris, Chief of Staff."),
         {"id": "u1", "role": "user", "content": "Get me a table for four on Friday at eight."}],
        tools=[tool("ask_person")],
    )
    post_run(client, body)
    assert tool_notes.NOT_OFFERED_NOTE in system_of(fake_cli.run(0))


def test_a_signed_hop_without_openbots_words_still_names_the_depth(client, fake_cli):
    with_team(fake_cli)
    fake_cli.plan([{"text": "Done."}])
    relay = copy.deepcopy(recorded("handoff_relay_run.json"))
    relay["messages"][-1] = {"id": "group-turn", "role": "user", "content": "Basil asked: what do we cook?"}
    post_run(client, relay)
    assert tool_notes.other_handoff_note(" at hand-off depth 1") in system_of(fake_cli.run(0))


def test_a_member_whose_prompt_never_mentions_message_bot_gets_no_note(client, fake_cli):
    with_team(fake_cli)
    fake_cli.plan([{"text": "Pasta."}])
    post_run(client, run_body([standing("chef", "You are Basil."), {"id": "u1", "role": "user", "content": "Dinner?"}], bot_id="chef"))
    assert "message_bot" not in system_of(fake_cli.run(0))
