"""A loopback hop between the Claude Code CLI and an Anthropic-compatible endpoint (D105).

WHY. The CLI puts its "# Environment" section (working folder, platform, shell) into the request as a message with
role "system", after the user's message, and sends it to whatever ``ANTHROPIC_BASE_URL`` names. Anthropic's own API
accepts that; Ollama's Anthropic-compatible ``/v1/messages`` answers 500 "no user query found in messages", every
time, so no turn on a local model could start (seen live on 20 November 2026). The CLI is not ours to change, so
this module sits in agent-freeduet's own path to the endpoint: it moves every message whose role is ``system`` or
``developer`` into the request's top-level ``system`` field, which is where the protocol puts system text, and
forwards the request. Nothing else is changed. The real Claude engine does not use it: it talks to Anthropic directly.

WHAT IT IS NOT. It has no upstream of its own: the address is the entry's, fixed when it is built. It listens on this
machine's loopback only, on a port the system picks, for one turn. It adds no header and reads none: the
``Authorization`` the CLI sends (the entry's own key, or the key-free placeholder) is passed on as it came and is never
logged, stored or put in an error. It logs no body. An answer is passed through byte for byte as it arrives, so a
stream stays a stream.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from urllib.parse import urlsplit

import httpx

log = logging.getLogger("freeduet.system_role_proxy")

SYSTEM_ROLES = frozenset({"system", "developer"})
MAX_HEAD = 64 * 1024
MAX_BODY = 64 * 1024 * 1024  # a request with pictures is large; past this it is not a Messages request
#: Never copied from one side to the other: they describe the hop, not the message.
_HOP = frozenset(
    {"connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "content-length", "host"}
)


def _text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n\n".join(
            block["text"] for block in content if isinstance(block, dict) and isinstance(block.get("text"), str)
        )
    return ""


def normalize(body: dict) -> bool:
    """Move the messages whose role is ``system`` or ``developer`` into ``body["system"]``, in order, after what the
    request already had. True when anything moved. A request with no such message is not touched."""
    messages = body.get("messages")
    if not isinstance(messages, list):
        return False
    moved = [m for m in messages if isinstance(m, dict) and m.get("role") in SYSTEM_ROLES]
    if not moved:
        return False
    body["messages"] = [m for m in messages if not (isinstance(m, dict) and m.get("role") in SYSTEM_ROLES)]
    system = body.get("system")
    blocks = [{"type": "text", "text": system}] if isinstance(system, str) and system else list(system) if isinstance(system, list) else []
    for message in moved:
        text = _text_of(message.get("content"))
        if text:
            blocks.append({"type": "text", "text": text})
    if blocks:
        body["system"] = blocks
    return True


def rewrite(raw: bytes) -> bytes:
    """The request body with system-role messages moved; the bytes unchanged when there are none or it is not JSON."""
    try:
        body = json.loads(raw)
    except ValueError:
        return raw
    if not isinstance(body, dict) or not normalize(body):
        return raw
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


async def _read_request(reader: asyncio.StreamReader) -> tuple[str, str, list[tuple[str, str]], bytes] | None:
    head = await reader.readuntil(b"\r\n\r\n")
    if len(head) > MAX_HEAD:
        return None
    lines = head.decode("latin-1").split("\r\n")
    method, target, _ = lines[0].split(" ", 2)
    headers = [tuple(line.split(":", 1)) for line in lines[1:] if ":" in line]
    headers = [(name.strip(), value.strip()) for name, value in headers]
    lowered = {name.lower(): value for name, value in headers}
    if "chunked" in lowered.get("transfer-encoding", "").lower():
        body = bytearray()
        while True:
            size = int((await reader.readline()).split(b";")[0].strip() or b"0", 16)
            if size == 0:
                while (await reader.readline()).strip():
                    pass
                break
            body.extend(await reader.readexactly(size))
            await reader.readexactly(2)
            if len(body) > MAX_BODY:
                return None
        return method, target, headers, bytes(body)
    length = int(lowered.get("content-length", "0") or 0)
    if length > MAX_BODY:
        return None
    return method, target, headers, await reader.readexactly(length) if length else b""


class SystemRoleProxy:
    """One per turn: ``async with SystemRoleProxy(base_url) as proxy``, then point the CLI at ``proxy.url``."""

    def __init__(self, upstream: str, *, use_environment_proxy: bool = False):
        self._upstream = upstream.rstrip("/")
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=900.0, write=30.0, pool=10.0), trust_env=use_environment_proxy
        )
        self._server: asyncio.AbstractServer | None = None
        self._handlers: set[asyncio.Task] = set()
        self.url = ""

    async def __aenter__(self) -> SystemRoleProxy:
        self._server = await asyncio.start_server(self._accept, "127.0.0.1", 0)
        self.url = f"http://127.0.0.1:{self._server.sockets[0].getsockname()[1]}"
        return self

    async def __aexit__(self, *_exc) -> None:
        if self._server is not None:
            self._server.close()
        for task in list(self._handlers):
            task.cancel()
        for task in list(self._handlers):
            with suppress(asyncio.CancelledError, Exception):
                await task
        await self._client.aclose()

    def _accept(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        task = asyncio.get_running_loop().create_task(self._serve(reader, writer))
        self._handlers.add(task)
        task.add_done_callback(self._handlers.discard)

    async def _serve(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            while True:
                try:
                    request = await _read_request(reader)
                except (asyncio.IncompleteReadError, ConnectionError, ValueError):
                    return
                if request is None:
                    return
                if not await self._forward(request, writer):
                    return
        except (ConnectionError, asyncio.CancelledError):
            return
        finally:
            with suppress(Exception):
                writer.close()

    async def _forward(self, request, writer: asyncio.StreamWriter) -> bool:
        method, target, headers, body = request
        path = urlsplit(target)
        if path.path.rstrip("/").endswith("/v1/messages"):
            body = rewrite(body)
        sent = [(name, value) for name, value in headers if name.lower() not in _HOP]
        try:
            upstream = self._client.build_request(method, self._upstream + target, headers=sent, content=body)
            response = await self._client.send(upstream, stream=True)
        except httpx.HTTPError as error:
            log.warning("system-role proxy: the endpoint could not be reached (%s)", type(error).__name__)
            message = json.dumps({"type": "error", "error": {"type": "api_error", "message": "the endpoint could not be reached"}})
            data = message.encode("utf-8")
            writer.write(
                b"HTTP/1.1 502 Bad Gateway\r\ncontent-type: application/json\r\nconnection: close\r\n"
                + f"content-length: {len(data)}\r\n\r\n".encode()
                + data
            )
            await writer.drain()
            return False
        try:
            head = [f"HTTP/1.1 {response.status_code} {response.reason_phrase}"]
            head += [f"{name}: {value}" for name, value in response.headers.multi_items() if name.lower() not in _HOP]
            head += ["transfer-encoding: chunked", "connection: close"]
            writer.write(("\r\n".join(head) + "\r\n\r\n").encode("latin-1"))
            async for chunk in response.aiter_raw():
                if chunk:
                    writer.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                    await writer.drain()
            writer.write(b"0\r\n\r\n")
            await writer.drain()
        finally:
            await response.aclose()
        return False
