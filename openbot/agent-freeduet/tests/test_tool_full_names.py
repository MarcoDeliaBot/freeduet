"""Live evals, 9 Nov 2026: 30 calls in one certification run reached Claude Code under the plain name
(`called as computer_navigate`, with `freeduet=connected; init listed all 33 offered tools`), which the
CLI refuses ("No such tool available"). PR #70 hands such a call to OpenBot anyway; each one still costs
a segment restart (the whole transcript goes to a new CLI).

The cause is in what the model reads. Every segment is a fresh `claude -p --no-session-persistence`
(claude_cli.LOCKDOWN_ARGS, no `--resume`), so the only history it has is transcript.py's rendering of
OpenBot's messages, and that rendering used to write each earlier call under its plain name, while
RUNTIME_NOTE told the model the conversation does so. After one tool round trip the model saw its own
calls as `computer_navigate` and made the next one the same way.

The fix: the history writes earlier calls (and their results) to the tools the run serves under the
name the CLI registers (`mcp__freeduet__<name>`), and the system text tells the model to call tools by
that full name. End to end through the fake CLI, which refuses a plain name as the real one does."""

import json

from freeduet import iris_tools
from freeduet.transcript import RUNTIME_NOTE
from helpers import post_run, run_body, standing, tool, types

NAVIGATE = {"url": {"type": "string"}}
TOOLS = [tool("computer_navigate", NAVIGATE), tool("computer_read"), tool("make_page", {"title": {"type": "string"}})]
ASK = [standing(), {"id": "u1", "role": "user", "content": "Find three gift ideas."}]
OPEN = {"url": "https://shop.example/gifts"}
REGISTERED = "mcp__freeduet__computer_navigate"


def system_of(run: dict) -> str:
    argv = run["argv"]
    return argv[argv.index("--append-system-prompt") + 1]


def history(call_id, name="computer_navigate", arguments=OPEN):
    """What OpenBot sends back after it ran the handed-over call: the call under the name it was
    announced with (the plain one) and its result."""
    return [
        *ASK,
        {"id": "a1", "role": "assistant", "content": "Opening the shop.", "toolCalls": [
            {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}]},
        {"id": "t1", "role": "tool", "toolCallId": call_id, "content": "Page: gift shop"},
    ]


def test_a_resumed_segment_reads_its_earlier_calls_under_the_registered_name(client, fake_cli):
    # First segment: the model calls the tool by its plain name; the CLI refuses it and PR #70's hand-over
    # runs it anyway. OpenBot runs it and starts the next segment with the result.
    fake_cli.plan(
        [{"text": "Opening the shop.", "tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True}],
        [{"text": "Three ideas: a kettle, a book, a plant."}],
    )
    first, _ = post_run(client, run_body(ASK, tools=TOOLS))
    call_id = next(event["toolCallId"] for event in first if event["type"] == "TOOL_CALL_START")
    assert fake_cli.run(0)["unavailable_as"] == ["computer_navigate"]  # the plain name, refused, handed over

    second, _ = post_run(client, run_body(history(call_id), tools=TOOLS))
    assert types(second)[-1] == "RUN_FINISHED"
    prompt = fake_cli.run(1)["prompt"]
    assert f'<tool_call id="{call_id}" name="{REGISTERED}">' in prompt
    assert f'<tool_result id="{call_id}" name="{REGISTERED}">\nPage: gift shop\n</tool_result>' in prompt
    assert 'name="computer_navigate"' not in prompt


def test_the_system_text_names_the_full_call_name_on_every_segment(client, fake_cli):
    fake_cli.plan([{"text": "Hello."}])
    post_run(client, run_body(ASK, tools=TOOLS))
    system = system_of(fake_cli.run(0))
    assert system.endswith(RUNTIME_NOTE)
    assert "call each one by its full name, mcp__freeduet__<name>" in system
    assert "Claude Code refuses a call made under the short name" in system


def test_a_tool_the_resumed_run_does_not_offer_keeps_its_plain_name(client, fake_cli):
    # A hand-off turn runs with no computer tools (handoff-delivery.ts): the history must not show a call
    # the CLI has no tool for under a name that looks callable.
    fake_cli.plan([{"text": "Done."}])
    post_run(client, run_body(history("toolu_9"), tools=[tool("make_page", {"title": {"type": "string"}})]))
    prompt = fake_cli.run(0)["prompt"]
    assert '<tool_call id="toolu_9" name="computer_navigate">' in prompt
    assert REGISTERED not in prompt


def test_irises_own_tools_in_the_follow_up_history_carry_the_registered_name(client, fake_cli):
    assert "team_log" in iris_tools.NAMES
    fake_cli.plan([{"text": "Checking the log.", "tool": {"name": "team_log", "input": {}}}, {"text": "Nothing new this week."}])
    fake_cli.followups([{"text": "Outcome: done\nDone: read the team log\nEvidence: the log\nNot done and why: nothing\nAlready: nothing\nNext step: none"}])
    post_run(client, run_body([standing(), {"id": "u1", "role": "user", "content": "What did the team do this week?"}], tools=TOOLS))
    assert fake_cli.followup_count() == 1
    prompt = fake_cli.followup(0)["prompt"]
    assert 'name="mcp__freeduet__team_log"' in prompt and 'name="team_log"' not in prompt
