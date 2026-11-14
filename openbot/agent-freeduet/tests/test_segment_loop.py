"""Segments end to end through the real bridge and a fake CLI (D4, D5, D6, D8, D12)."""

import asyncio
import json
import os
import socket
import threading
import time

import pytest

from freeduet import agui, iris_tools, segment
from freeduet.bridge import ipc
from helpers import ASSERTION, TOOL_TOKEN, post_run, run_body, standing, tool, types

TOOLS = [tool("make_page", {"title": {"type": "string"}}), tool("message_bot", {"bot": {"type": "string"}, "message": {"type": "string"}})]
DEPLOYMENT = ["message_bot"]
ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]


def text_of(events):
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def test_a_text_turn(client, fake_cli):
    fake_cli.plan([{"text": "Hello there."}])
    events, _ = post_run(client, run_body(ASK))
    assert types(events) == [
        "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED",
    ]
    assert text_of(events) == "Hello there."
    assert events[0] == {"type": "RUN_STARTED", "threadId": "thread-1", "runId": "run-1"}
    assert "<user>\nWrite the plan as a page.\n</user>" in fake_cli.run(0)["prompt"]


def test_full_loop_tool_call_then_resume_with_the_result(client, fake_cli):
    fake_cli.plan(
        [{"text": "Let me write that up.", "tool": {"name": "make_page", "input": {"title": "Plan"}}}, {"text": "never reached"}],
        [{"text": "The page is ready."}],
    )
    first, _ = post_run(client, run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))
    assert types(first) == [
        "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END",
        "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "RUN_FINISHED",
    ]
    message_id = first[1]["messageId"]
    start, args = first[5], first[6]
    assert start["toolCallName"] == "make_page"
    assert start["parentMessageId"] == message_id
    assert json.loads(args["delta"]) == {"title": "Plan"}
    assert "never reached" not in text_of(first)

    seen = fake_cli.run(0)
    # Exactly RunAgentInput.tools, then Iris's own four (this run is hers; iris_tools.py).
    assert [t["name"] for t in seen["tools"]] == ["make_page", "message_bot", *sorted(iris_tools.NAMES)]
    assert seen["calls"] == [{"name": "make_page", "arguments": {"title": "Plan"}}]
    assert "results" not in seen  # OpenBot runs it; the CLI was never answered
    time.sleep(0.2)
    with pytest.raises(ProcessLookupError):
        os.kill(seen["pid"], 0)  # and the CLI is gone

    # OpenBot runs the call under its approval gate, then POSTs again with the result, same runId.
    call_id = start["toolCallId"]
    resumed = ASK + [
        {"id": message_id, "role": "assistant", "content": "Let me write that up.",
         "toolCalls": [{"id": call_id, "type": "function", "function": {"name": "make_page", "arguments": args["delta"]}}]},
        {"id": "tool-1", "role": "tool", "toolCallId": call_id, "content": '{"ok":true,"url":"/pages/1"}'},
    ]
    second, _ = post_run(client, run_body(resumed, tools=TOOLS, deployment=DEPLOYMENT))
    assert types(second) == ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]
    assert text_of(second) == "The page is ready."
    assert second[1]["messageId"] != message_id

    prompt = fake_cli.run(1)["prompt"]  # a fresh, stateless CLI read the whole transcript
    # The CLI registers the tool as mcp__freeduet__make_page: the history writes the call that way.
    assert f'<tool_call id="{call_id}" name="mcp__freeduet__make_page">' in prompt
    assert f'<tool_result id="{call_id}" name="mcp__freeduet__make_page">\n{{"ok":true,"url":"/pages/1"}}\n</tool_result>' in prompt
    assert prompt.rstrip().endswith("the last entries above.")


def test_a_deployment_tool_goes_to_the_callback_and_its_result_back_to_the_cli(client, fake_cli, callback_server):
    fake_cli.plan([
        {"text": "Asking Otto.", "tool": {"name": "message_bot", "input": {"bot": "otto", "message": "Sort the inbox"}}},
        {"text": "Otto is on it."},
    ])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))
    assert types(events) == [
        "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END",
        "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT",
        "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED",
    ]
    assert len(callback_server) == 1
    request = callback_server[0]
    assert request["path"] == "/api/agent-tools/call"
    assert request["headers"]["x-openbot-agent-token"] == TOOL_TOKEN
    assert request["body"] == {"name": "message_bot", "args": {"bot": "otto", "message": "Sort the inbox"}, "run": ASSERTION}

    result = events[8]
    assert result["toolCallId"] == events[5]["toolCallId"]
    assert result["content"] == "Otto has it: Sort the inbox"
    assert fake_cli.run(0)["results"] == [{"name": "message_bot", "text": "Otto has it: Sort the inbox", "isError": False}]
    assert events[9]["messageId"] != events[1]["messageId"]
    assert text_of(events) == "Asking Otto.Otto is on it."


def test_a_deployment_tool_without_the_agent_token_is_refused(client, fake_cli, callback_server, monkeypatch):
    monkeypatch.delenv("AGENT_TOOL_TOKEN")
    fake_cli.plan([{"tool": {"name": "message_bot", "input": {"bot": "otto", "message": "x"}}}, {"text": "I could not reach Otto."}])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))
    assert callback_server == []
    result = fake_cli.run(0)["results"][0]
    assert result["isError"] is True and result["text"].startswith("Refused.")
    assert types(events)[-1] == "RUN_FINISHED"


def test_a_tool_that_was_not_offered_is_refused_and_not_announced(client, fake_cli):
    fake_cli.plan([{"tool": {"name": "delete_everything", "input": {}}}, {"text": "That is not available."}])
    events, _ = post_run(client, run_body(ASK, tools=TOOLS, deployment=DEPLOYMENT))
    assert "TOOL_CALL_START" not in types(events)
    assert fake_cli.run(0)["results"][0]["text"].startswith("Refused. That tool was not offered")


def test_keepalive_while_the_cli_is_silent(client, fake_cli, monkeypatch):
    monkeypatch.setattr(agui, "KEEPALIVE_SECONDS", 0.2)
    fake_cli.plan([{"sleep": 1.2}, {"text": "Done thinking."}])
    events, keepalives = post_run(client, run_body(ASK))
    assert keepalives >= 2
    assert types(events)[-1] == "RUN_FINISHED"
    assert text_of(events) == "Done thinking."


def test_not_signed_in_is_a_sign_in_error(client, fake_cli):
    fake_cli.plan([{"replay": "not_signed_in.jsonl"}])
    events, _ = post_run(client, run_body(ASK))
    assert types(events) == ["RUN_STARTED", "RUN_ERROR"]
    assert events[-1]["code"] == "OPENBOT_MODEL_AUTH_REQUIRED"
    assert "docker compose exec -it agent-freeduet claude" in events[-1]["message"]


def test_not_signed_in_on_stderr_is_a_sign_in_error_too(client, fake_cli):
    fake_cli.plan([{"stderr": "Invalid API key · Please run /login"}, {"exit": 1}])
    events, _ = post_run(client, run_body(ASK))
    assert events[-1]["code"] == "OPENBOT_MODEL_AUTH_REQUIRED"


def test_a_usage_limit_is_a_plain_error(client, fake_cli):
    fake_cli.plan([{"replay": "usage_limit.jsonl"}])
    events, _ = post_run(client, run_body(ASK))
    error = events[-1]
    assert error["type"] == "RUN_ERROR"
    assert error["code"] == "FREEDUET_ENGINE_LIMITED"
    assert "usage limit" in error["message"] and "2100-01-01" in error["message"]
    assert "TEXT_MESSAGE_START" not in types(events)


def test_a_cli_that_dies_without_a_result(client, fake_cli):
    fake_cli.plan([{"stderr": "something broke"}, {"exit": 3}])
    events, _ = post_run(client, run_body(ASK))
    assert events[-1] == {"type": "RUN_ERROR", "message": "Claude Code ended without an answer (exit code 3)."}


def test_a_missing_cli_is_a_plain_error(client, fake_cli, monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    events, _ = post_run(client, run_body(ASK))
    assert events[-1]["type"] == "RUN_ERROR"
    assert "not installed" in events[-1]["message"]


def test_a_timer_that_fires_late_does_not_overtake_a_bridge_call_already_on_the_socket():
    # The bridge sends each call on a connection of its own, which asyncio hands to its reader a few passes
    # after the timer's wake-up (segment._later). The loop is busy while the call arrives and the timer
    # comes due: the call, written before the deadline, goes in the inbox first.
    async def play():
        inbox: asyncio.Queue = asyncio.Queue()

        async def on_call(call):
            await inbox.put(("call", call))

        host = ipc.BridgeHost([], on_call)
        port = await host.start()
        sent, connections = threading.Event(), []

        def bridge():
            connections.append(socket.create_connection(("127.0.0.1", port)))
            line = json.dumps({"op": "call", "name": "make_page", "arguments": {}, "secret": host.secret})
            connections[0].sendall(line.encode() + b"\n")
            sent.set()

        loop = asyncio.get_running_loop()
        timer = asyncio.create_task(segment._later(0.05, inbox, ("settle", None)))
        await asyncio.sleep(0)  # the timer is armed
        threading.Thread(target=bridge, daemon=True).start()
        due, give_up = loop.time() + 0.05, time.monotonic() + 10
        while (not sent.is_set() or loop.time() < due) and time.monotonic() < give_up:
            time.sleep(0.005)  # noqa: ASYNC251 - the loop is busy on purpose: the call arrives, the timer comes due
        try:
            return [(await asyncio.wait_for(inbox.get(), 5))[0] for _ in range(2)]
        finally:
            await timer
            for connection in connections:
                connection.close()
            await host.close()

    assert asyncio.run(play()) == ["call", "settle"]
