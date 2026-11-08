"""The loopback line between the bridge (a grandchild process) and the parent.

One JSON line per connection, in each direction. The bridge sends `{"secret", "op", ...}`; the
parent checks the secret with `hmac.compare_digest` and answers with one line, or, for a tool
OpenBot runs itself, never answers: the segment ends and the CLI, with the bridge, is stopped.

Ops: `list` returns `{"tools": [...]}` (MCP tool definitions); `call` with `name` and `arguments`
returns `{"text": str, "isError": bool}`.
"""

import asyncio
import hmac
import json
import os
import secrets
from collections.abc import Awaitable, Callable
from contextlib import suppress
from dataclasses import dataclass, field

PORT_ENV = "FREEDUET_BRIDGE_PORT"
SECRET_ENV = "FREEDUET_BRIDGE_SECRET"
HOST = "127.0.0.1"
# Tool arguments and results can be whole documents; asyncio's default line limit is 64 KiB.
MAX_LINE = 16 * 1024 * 1024


@dataclass(frozen=True)
class ToolReply:
    text: str
    is_error: bool = False


@dataclass
class BridgeCall:
    name: str
    arguments: dict
    reply: asyncio.Future = field(repr=False)

    def answer(self, reply: ToolReply) -> None:
        if not self.reply.done():
            self.reply.set_result(reply)


def mcp_tools(offered: list[dict]) -> list[dict]:
    """RunAgentInput tools as MCP tool definitions, names unchanged."""
    tools = []
    for tool in offered:
        schema = tool.get("parameters")
        schema = dict(schema) if isinstance(schema, dict) else {}
        schema.pop("$schema", None)
        if schema.get("type") != "object":
            schema = {"type": "object", "properties": {}}
        description = tool.get("description")
        tools.append(
            {
                "name": tool["name"],
                "description": description if isinstance(description, str) else "",
                "inputSchema": schema,
            }
        )
    return tools


class BridgeHost:
    """The parent's end: a loopback server for one segment, closed with it."""

    def __init__(self, tools: list[dict], on_call: Callable[[BridgeCall], Awaitable[None]]):
        self.tools = tools
        self.secret = secrets.token_urlsafe(32)
        self._on_call = on_call
        self._server: asyncio.Server | None = None
        self._handlers: set[asyncio.Task] = set()
        self.port = 0

    async def start(self) -> int:
        self._server = await asyncio.start_server(self._handle, HOST, 0, limit=MAX_LINE)
        self.port = self._server.sockets[0].getsockname()[1]
        return self.port

    async def close(self) -> None:
        if self._server is not None:
            self._server.close()
        # Handlers waiting on a call nobody will answer are cancelled, not awaited forever.
        for task in list(self._handlers):
            task.cancel()
        for task in list(self._handlers):
            with suppress(asyncio.CancelledError, Exception):
                await task

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        self._handlers.add(task)
        call: BridgeCall | None = None
        try:
            request = json.loads(await reader.readline())
            offered = request.get("secret") if isinstance(request, dict) else None
            if not isinstance(offered, str) or not hmac.compare_digest(
                offered.encode("utf-8"), self.secret.encode("utf-8")
            ):
                return
            if request.get("op") == "list":
                answer = {"tools": self.tools}
            elif request.get("op") == "call" and isinstance(request.get("name"), str):
                arguments = request.get("arguments")
                call = BridgeCall(
                    name=request["name"],
                    arguments=arguments if isinstance(arguments, dict) else {},
                    reply=asyncio.get_running_loop().create_future(),
                )
                await self._on_call(call)
                reply: ToolReply = await call.reply
                answer = {"text": reply.text, "isError": reply.is_error}
            else:
                return
            writer.write(json.dumps(answer, ensure_ascii=False).encode("utf-8") + b"\n")
            await writer.drain()
        except (ValueError, ConnectionError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            return
        finally:
            if call is not None and not call.reply.done():
                call.reply.cancel()
            writer.close()
            self._handlers.discard(task)


async def ask_parent(payload: dict) -> dict:
    """The bridge's end: one request, one answer (which may never come)."""
    port = int(os.environ[PORT_ENV])
    secret = os.environ[SECRET_ENV]
    reader, writer = await asyncio.open_connection(HOST, port, limit=MAX_LINE)
    try:
        line = json.dumps({**payload, "secret": secret}, ensure_ascii=False).encode("utf-8") + b"\n"
        writer.write(line)
        await writer.drain()
        answer = await reader.readline()
        if not answer:
            raise ConnectionError("The FreeDuet runtime closed the tool line.")
        return json.loads(answer)
    finally:
        writer.close()
