"""Live evals, 9 Nov 2026 (eval stack, 12 warnings in 6 hours; jules-1 failed 0/3): in a PERSON's run
that offered `computer_navigate`, Claude Code answered the model's call with "No such tool available".
Jules had made 11 to 16 good computer calls in the same conversation, then one call was refused and it
stopped with one or two ideas instead of three.

What the code and the CLI's documentation say (the real model cannot be run here, so the cause is the
most likely one, not a proven one; the log line below tells the two apart on the next live run):

- A MCP connection that is not up yet should not be the cause. `claude -p --mcp-config` waits for a
  stdio server before the first turn (Claude Code 2.1.221 and later; this image pins 2.1.311), and the
  init event is sent after that wait. This service sets no MCP_TIMEOUT, so the default 30 s applies.
- The bridge cannot list a partial set. It lists `ipc.mcp_tools(run.tools)`, built once per segment, the
  same on every `tools/list` (test_computer_tools_turn.py, H2). A failed `tools/list` would lose all
  the tools, not one.
- Most likely: the CLI does not match the model's call to the registered name. The model's tool list
  shows `mcp__freeduet__<name>`, while its own prompt and the transcript this service renders name the
  same tool by its plain `<name>` (transcript.py). A call by the plain name is answered by the CLI and
  never reaches the bridge. It used to leave no trace but a tool_result whose name the parser stripped
  of the prefix (stream_json.py), so the live log could not tell the plain name from the registered one.
  The live log then confirmed it (every warning read `called as computer_navigate`, init listed all the
  offered tools), and transcript.py now writes earlier calls under the registered name and says so in
  its system text (test_tool_full_names.py). This hand-over stays as the safety net.

Whatever the CLI's reason, a refused call to a tool this run OFFERED is not the model's fault, and the
call is plain: its name and its input are in the stream. The segment hands it to OpenBot like any other
call to a tool OpenBot runs (the approval gate is unchanged), and the log says how the model called it
and what the CLI's init event reported: `called as computer_navigate` is the plain name,
`called as mcp__freeduet__computer_navigate` with `freeduet=pending` is a server not connected yet, and
`init did not list ...` is a list the CLI did not take.
"""

import asyncio
import json
import logging
import os
import time

import pytest

from freeduet import claude_cli, segment
from freeduet.stream_json import Refused, StreamParser
from helpers import SETTLE_NEVER, post_run, run_body, standing, tool, types

NAVIGATE = {"url": {"type": "string"}}
TOOLS = [tool("computer_navigate", NAVIGATE), tool("computer_read"), tool("make_page", {"title": {"type": "string"}})]
ASK = [standing(), {"id": "u1", "role": "user", "content": "Find three gift ideas."}]
OPEN = {"url": "https://shop.example/gifts"}
GIVE_UP = "My browser tool stopped working."


def starts(events):
    return [event for event in events if event["type"] == "TOOL_CALL_START"]


def args_of(events):
    return [json.loads(event["delta"]) for event in events if event["type"] == "TOOL_CALL_ARGS"]


def text_of(events):
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def warnings(caplog):
    return [record.getMessage() for record in caplog.records if "No such tool available" in record.getMessage()]


# ── the call is handed over ──────────────────────────────────────────────────────────────────────


def test_a_call_by_the_plain_name_is_handed_to_openbot_although_the_cli_refused_it(client, fake_cli):
    fake_cli.plan([
        {"text": "Opening the shop.", "tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"text": GIVE_UP},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    seen = fake_cli.run(0)
    assert seen["unavailable_as"] == ["computer_navigate"] and "calls" not in seen  # the CLI refused; the bridge never heard
    assert [event["toolCallName"] for event in starts(events)] == ["computer_navigate"]
    assert args_of(events) == [OPEN]
    assert types(events)[-1] == "RUN_FINISHED"
    assert GIVE_UP not in text_of(events)  # what the model said after the refusal is not the person's answer


def test_a_call_the_cli_refused_by_the_registered_name_is_handed_over_too(client, fake_cli):
    # A server that was not connected yet, or a list the CLI did not take: the name is the right one.
    fake_cli.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN}, "refuse": True},
        {"text": GIVE_UP},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    assert fake_cli.run(0)["unavailable_as"] == ["mcp__freeduet__computer_navigate"]
    assert [event["toolCallName"] for event in starts(events)] == ["computer_navigate"]
    assert args_of(events) == [OPEN]
    assert GIVE_UP not in text_of(events)


def test_the_handed_over_call_carries_the_clis_own_call_id_and_its_text(client, fake_cli):
    fake_cli.plan([{"text": "Opening the shop.", "tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True}])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    start = starts(events)[0]
    message_start = next(event for event in events if event["type"] == "TEXT_MESSAGE_START")
    assert start["parentMessageId"] == message_start["messageId"]
    assert text_of(events) == "Opening the shop."
    assert start["toolCallId"].startswith("toolu_")


def test_several_refused_calls_of_one_message_are_all_handed_over(client, fake_cli, monkeypatch):
    # The CLI plays both steps and ends by itself, and that ends the segment: no timer is part of this
    # test. With the 0.1 s window of the other tests, a CLI that is slow between the two refusals loses
    # the second one. The pause below is that slowness, on purpose; a slow file write on a busy CI runner
    # did it by itself (14 Nov 2026).
    monkeypatch.setattr(segment, "SETTLE_SECONDS", SETTLE_NEVER)
    fake_cli.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"sleep": 0.25},
        {"tool": {"name": "make_page", "input": {"title": "Ideas"}, "plain": True}, "real_cli": True},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    assert [event["toolCallName"] for event in starts(events)] == ["computer_navigate", "make_page"]
    assert types(events).count("RUN_FINISHED") == 1


def running(pid):
    try:
        return os.waitid(os.P_PID, pid, os.WEXITED | os.WNOHANG | os.WNOWAIT) is None
    except ChildProcessError:  # the loop's child watcher has already collected it
        return False


def a_loop_busy_past_the_deadline(monkeypatch):
    """The segment's loop is stuck from the moment its first settle timer is armed until that timer is
    overdue and the CLI has finished (a starved process, a long collection, a blocking call): the timer
    and everything the CLI wrote are both waiting when the loop runs again. Which one the loop takes
    first is what segment._later settles. Returns the list that says the loop was stuck."""
    processes: list = []
    stuck: list = []
    start, later = claude_cli.start, segment._later

    async def started(*args, **kwargs):
        processes.append(await start(*args, **kwargs))
        return processes[-1]

    async def busy(delay, inbox, item):
        timer = asyncio.ensure_future(later(delay, inbox, item))
        await asyncio.sleep(0)  # the timer is armed
        if not stuck:
            loop = asyncio.get_running_loop()
            due, give_up = loop.time() + delay, time.monotonic() + 10
            while (loop.time() < due or running(processes[0].pid)) and time.monotonic() < give_up:
                time.sleep(0.005)  # noqa: ASYNC251 - the loop is busy on purpose
            stuck.append(True)
        await timer

    monkeypatch.setattr(claude_cli, "start", started)
    monkeypatch.setattr(segment, "_later", busy)
    return stuck


def test_a_busy_loop_does_not_lose_the_second_refused_call(client, fake_cli, monkeypatch):
    # The settle window is the default here (0.1 s): the CLI wrote the second refusal before it ran out,
    # the loop only got to read it afterwards.
    stuck = a_loop_busy_past_the_deadline(monkeypatch)
    fake_cli.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"sleep": 0.05},  # the first refusal is read before the second is written
        {"tool": {"name": "make_page", "input": {"title": "Ideas"}, "plain": True}, "real_cli": True},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    assert stuck == [True]
    assert [event["toolCallName"] for event in starts(events)] == ["computer_navigate", "make_page"]
    assert types(events).count("RUN_FINISHED") == 1


def test_a_model_that_retries_with_the_right_name_does_not_make_the_call_twice(client, fake_cli):
    fake_cli.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"tool": {"name": "computer_navigate", "input": OPEN}},  # the retry reaches the bridge
        {"text": "never reached"},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    assert [event["toolCallName"] for event in starts(events)] == ["computer_navigate"]
    assert types(events).count("RUN_FINISHED") == 1
    results = fake_cli.run(0).get("results", [])
    assert all(result["isError"] for result in results)  # the CLI is told it was already handed over


def test_a_call_that_was_never_refused_is_announced_once(client, fake_cli):
    fake_cli.plan([{"tool": {"name": "computer_navigate", "input": OPEN}}, {"text": "never reached"}])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    assert [event["toolCallName"] for event in starts(events)] == ["computer_navigate"]
    assert "unavailable_as" not in fake_cli.run(0)


# ── what stays as it was ─────────────────────────────────────────────────────────────────────────


def test_a_refused_call_to_a_tool_the_run_did_not_offer_is_not_handed_over(client, fake_cli):
    fake_cli.plan([
        {"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True},
        {"text": GIVE_UP},
    ])
    events, _ = post_run(client, run_body(ASK, tools=[tool("make_page", {"title": {"type": "string"}})]))
    assert starts(events) == []
    assert GIVE_UP in text_of(events) and types(events)[-1] == "RUN_FINISHED"


def test_a_refused_deployment_tool_is_not_handed_over(client, fake_cli, callback_server):
    # Its answer would have to go back to the CLI, which has already answered the model: no call is made.
    fake_cli.plan([
        {"tool": {"name": "ask_person", "input": {"question": "Budget?"}, "plain": True}, "real_cli": True},
        {"text": GIVE_UP},
    ])
    events, _ = post_run(client, run_body(ASK, tools=[tool("ask_person"), *TOOLS], deployment=["ask_person"]))
    assert starts(events) == [] and callback_server == []
    assert GIVE_UP in text_of(events)


def test_a_refused_tool_of_irises_own_is_not_handed_over(client, fake_cli):
    fake_cli.plan([
        {"tool": {"name": "team_log", "input": {}, "plain": True}, "real_cli": True},
        {"text": GIVE_UP},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS))
    assert starts(events) == [] and GIVE_UP in text_of(events)


# ── the log ──────────────────────────────────────────────────────────────────────────────────────


def test_the_log_says_how_the_model_called_the_tool_and_that_the_call_was_handed_over(client, fake_cli, caplog):
    fake_cli.plan([{"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True}])
    with caplog.at_level(logging.WARNING, logger="freeduet.segment"):
        post_run(client, run_body(ASK, tools=TOOLS))
    [line] = warnings(caplog)
    assert "called as computer_navigate" in line
    assert "handed to OpenBot: computer_navigate" in line
    assert "person's" in line and "thread-1" in line and "run-1" in line


def test_the_log_says_when_the_call_was_the_registered_name(client, fake_cli, caplog):
    fake_cli.plan([{"tool": {"name": "computer_navigate", "input": OPEN}, "refuse": True}])
    with caplog.at_level(logging.WARNING, logger="freeduet.segment"):
        post_run(client, run_body(ASK, tools=TOOLS))
    [line] = warnings(caplog)
    assert "called as mcp__freeduet__computer_navigate" in line


def test_the_log_carries_what_the_init_event_said_about_the_freeduet_server(client, fake_cli, caplog):
    fake_cli.plan([
        {"init": {"status": "pending", "tools": ["make_page"]}},
        {"tool": {"name": "computer_navigate", "input": OPEN}, "refuse": True},
    ])
    with caplog.at_level(logging.WARNING, logger="freeduet.segment"):
        post_run(client, run_body(ASK, tools=TOOLS))
    [line] = warnings(caplog)
    assert "freeduet=pending" in line
    assert "init did not list computer_navigate, computer_read" in line


def test_a_healthy_init_is_reported_as_connected_and_complete(client, fake_cli, caplog):
    fake_cli.plan([{"tool": {"name": "computer_navigate", "input": OPEN, "plain": True}, "real_cli": True}])
    with caplog.at_level(logging.WARNING, logger="freeduet.segment"):
        post_run(client, run_body(ASK, tools=TOOLS))
    [line] = warnings(caplog)
    assert "freeduet=connected" in line and "init listed all 3 offered tools" in line


# ── the stream parser ────────────────────────────────────────────────────────────────────────────


def refusal(tool_use_id, name, tail=""):
    return json.dumps({
        "type": "user",
        "message": {"role": "user", "content": [{
            "type": "tool_result", "tool_use_id": tool_use_id, "is_error": True,
            "content": f"<tool_use_error>Error: No such tool available: {name}{tail}</tool_use_error>",
        }]},
        "parent_tool_use_id": None,
    })


def assistant_call(tool_use_id, name, tool_input, message_id="msg_1"):
    return json.dumps({"type": "assistant", "message": {"id": message_id, "content": [{"type": "tool_use", "id": tool_use_id, "name": name, "input": tool_input}]}})


def test_the_parser_reports_a_refused_call_with_its_name_as_sent_and_its_input():
    parser = StreamParser()
    assert parser.feed(assistant_call("toolu_1", "computer_navigate", OPEN)) == []  # not a registered name: no ToolUse
    assert parser.feed(refusal("toolu_1", "computer_navigate")) == [Refused("toolu_1", "computer_navigate", "computer_navigate", OPEN, "msg_1")]
    assert parser.unavailable == ["computer_navigate"] and parser.unavailable_as == ["computer_navigate"]


def test_the_parser_strips_the_prefix_for_the_name_and_keeps_it_for_how_it_was_called():
    parser = StreamParser()
    parser.feed(assistant_call("toolu_2", "mcp__freeduet__computer_read", {}))
    [item] = parser.feed(refusal("toolu_2", "mcp__freeduet__computer_read"))
    assert (item.name, item.called_as, item.input) == ("computer_read", "mcp__freeduet__computer_read", {})
    assert parser.unavailable == ["computer_read"] and parser.unavailable_as == ["mcp__freeduet__computer_read"]


@pytest.mark.parametrize("tail", [". computer_navigate is not a tool you can call.", " "])
def test_the_parser_reads_the_name_when_the_cli_adds_words_after_it(tail):
    parser = StreamParser()
    parser.feed(assistant_call("toolu_3", "computer_navigate", OPEN))
    [item] = parser.feed(refusal("toolu_3", "computer_navigate", tail))
    assert item.called_as == "computer_navigate"


def test_a_refusal_of_a_call_the_parser_never_saw_has_no_input():
    parser = StreamParser()
    [item] = parser.feed(refusal("toolu_9", "mcp__freeduet__make_page"))
    assert item.input is None and item.message_id is None


def test_the_parser_keeps_the_status_and_the_tools_of_the_init_event():
    parser = StreamParser()
    parser.feed(json.dumps({
        "type": "system", "subtype": "init",
        "tools": ["mcp__freeduet__make_page", "mcp__freeduet__computer_read", 7],
        "mcp_servers": [{"name": "freeduet", "status": "pending"}, {"status": "x"}, "junk"],
    }))
    assert parser.init_seen
    assert parser.mcp_servers == {"freeduet": "pending"}
    assert parser.init_tools == ["mcp__freeduet__make_page", "mcp__freeduet__computer_read"]


def test_an_init_event_without_those_fields_is_read_as_empty():
    parser = StreamParser()
    parser.feed(json.dumps({"type": "system", "subtype": "init"}))
    assert parser.init_seen and parser.mcp_servers == {} and parser.init_tools == []
