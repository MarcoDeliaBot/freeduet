"""The bridge's two ends: the loopback line with its per-run secret, and the MCP protocol."""

import asyncio
import json
import socket

from freeduet.bridge import ipc, mcp_server
from freeduet.bridge.callback import call_deployment_tool

TOOLS = ipc.mcp_tools([{"name": "make_page", "description": "Make a page.", "parameters": {"$schema": "x", "type": "object", "properties": {"title": {"type": "string"}}}}])


async def _ask(port: int, payload: dict) -> bytes:
    reader, writer = await asyncio.open_connection(ipc.HOST, port)
    writer.write(json.dumps(payload).encode() + b"\n")
    await writer.drain()
    answer = await reader.readline()
    writer.close()
    return answer


def test_the_line_answers_only_with_the_secret():
    async def scenario():
        async def on_call(call):
            call.answer(ipc.ToolReply("done"))

        host = ipc.BridgeHost(TOOLS, on_call)
        port = await host.start()
        try:
            refused = await _ask(port, {"secret": "wrong", "op": "list"})
            missing = await _ask(port, {"op": "list"})
            listed = await _ask(port, {"secret": host.secret, "op": "list"})
            called = await _ask(port, {"secret": host.secret, "op": "call", "name": "make_page", "arguments": {"title": "x"}})
        finally:
            await host.close()
        return refused, missing, json.loads(listed), json.loads(called)

    refused, missing, listed, called = asyncio.run(scenario())
    assert refused == b"" and missing == b""
    assert listed == {"tools": TOOLS}
    assert called == {"text": "done", "isError": False}


def test_closing_the_line_releases_a_call_nobody_answers():
    async def scenario():
        async def on_call(call):
            pass  # a tool OpenBot runs itself: never answered here

        host = ipc.BridgeHost(TOOLS, on_call)
        port = await host.start()
        pending = asyncio.create_task(_ask(port, {"secret": host.secret, "op": "call", "name": "make_page", "arguments": {}}))
        await asyncio.sleep(0.1)
        await asyncio.wait_for(host.close(), 2)
        return await asyncio.wait_for(pending, 2)

    assert asyncio.run(scenario()) == b""


def test_tool_definitions_are_mcp_shaped():
    assert TOOLS == [{"name": "make_page", "description": "Make a page.", "inputSchema": {"type": "object", "properties": {"title": {"type": "string"}}}}]
    assert ipc.mcp_tools([{"name": "bare"}])[0]["inputSchema"] == {"type": "object", "properties": {}}


def test_mcp_initialize_ping_and_unknown_methods():
    init = asyncio.run(mcp_server.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}}))
    assert init["result"]["protocolVersion"] == "2025-03-26"
    assert init["result"]["serverInfo"]["name"] == "freeduet"
    assert init["result"]["capabilities"] == {"tools": {"listChanged": False}}
    assert asyncio.run(mcp_server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"})) is None
    assert asyncio.run(mcp_server.handle({"jsonrpc": "2.0", "id": 2, "method": "ping"}))["result"] == {}
    assert asyncio.run(mcp_server.handle({"jsonrpc": "2.0", "id": 3, "method": "resources/list"}))["error"]["code"] == -32601


def test_a_callback_that_cannot_connect_says_so(monkeypatch):
    """The member repeats this reason to the person, so it says what happened, never "unavailable"."""
    with socket.socket() as spare:
        spare.bind(("127.0.0.1", 0))
        port = spare.getsockname()[1]  # closed once the block ends: nothing listens there
    monkeypatch.setenv("AGENT_TOOL_TOKEN", "test-agent-tool-token")
    monkeypatch.setenv("OPENBOT_TOOL_URL", f"http://127.0.0.1:{port}/api/agent-tools/call")
    reply = asyncio.run(call_deployment_tool("ask_person", {"question": "Which office?"}, "assertion"))
    assert reply.is_error
    assert reply.text == (
        "The tool callback could not be completed: agent-freeduet could not connect to OpenBot's tool route."
    )
    assert "unavailable" not in reply.text
