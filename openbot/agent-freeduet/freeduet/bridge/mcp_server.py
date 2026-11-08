"""The `freeduet` MCP server, over stdio (newline-delimited JSON-RPC 2.0).

Small on purpose: initialize, ping, tools/list and tools/call are all a CLI needs from a server that
has no resources or prompts. Every list and every call is asked of the parent, so the tools the CLI
sees are exactly this segment's RunAgentInput.tools and nothing here decides what a call means.
"""

import asyncio
import json
import sys

from . import ipc

SERVER_INFO = {"name": "freeduet", "version": "0.1.0"}
FALLBACK_PROTOCOL = "2025-06-18"


def _result(request_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


async def handle(message: dict) -> dict | None:
    """The response to one JSON-RPC message, or None for a notification."""
    method = message.get("method")
    request_id = message.get("id")
    if request_id is None:
        return None  # notifications/initialized and friends need no answer
    params = message.get("params") if isinstance(message.get("params"), dict) else {}
    if method == "initialize":
        version = params.get("protocolVersion")
        return _result(
            request_id,
            {
                # Answer in the client's version: the server uses nothing that differs between them.
                "protocolVersion": version if isinstance(version, str) else FALLBACK_PROTOCOL,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": SERVER_INFO,
            },
        )
    if method == "ping":
        return _result(request_id, {})
    if method == "tools/list":
        answer = await ipc.ask_parent({"op": "list"})
        return _result(request_id, {"tools": answer.get("tools", [])})
    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments")
        if not isinstance(name, str):
            return _error(request_id, -32602, "tools/call needs a tool name.")
        answer = await ipc.ask_parent(
            {"op": "call", "name": name, "arguments": arguments if isinstance(arguments, dict) else {}}
        )
        text = answer.get("text")
        return _result(
            request_id,
            {
                "content": [{"type": "text", "text": text if isinstance(text, str) else ""}],
                "isError": bool(answer.get("isError")),
            },
        )
    return _error(request_id, -32601, f"Method not found: {method}")


async def serve(reader: asyncio.StreamReader, write) -> None:
    pending: set[asyncio.Task] = set()

    async def answer(message: dict) -> None:
        try:
            response = await handle(message)
        except Exception:  # noqa: BLE001 - the CLI gets an error, never a hang
            response = _error(message.get("id"), -32603, "The FreeDuet tool line failed.")
        if response is not None:
            write(response)

    while True:
        line = await reader.readline()
        if not line:
            break
        try:
            message = json.loads(line)
        except ValueError:
            write(_error(None, -32700, "Parse error"))
            continue
        if not isinstance(message, dict):
            continue
        # Calls run side by side: a call OpenBot runs itself is never answered here, and must not
        # hold up a ping or another call behind it.
        task = asyncio.create_task(answer(message))
        pending.add(task)
        task.add_done_callback(pending.discard)
    for task in list(pending):
        task.cancel()


async def _main() -> None:
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=ipc.MAX_LINE)
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    out = sys.stdout.buffer

    def write(response: dict) -> None:
        out.write(json.dumps(response, ensure_ascii=False).encode("utf-8") + b"\n")
        out.flush()

    await serve(reader, write)


def main() -> None:
    asyncio.run(_main())
