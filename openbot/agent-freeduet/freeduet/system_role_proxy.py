"""A loopback hop between the Claude Code CLI and an Anthropic-compatible endpoint (D105).

WHY. The CLI puts its "# Environment" section (working folder, platform, shell) into the request as a message with
role "system", after the user's message, and sends it to whatever ``ANTHROPIC_BASE_URL`` names. Anthropic's own API
accepts that; Ollama's Anthropic-compatible ``/v1/messages`` answers 500 "no user query found in messages", every
time, so no turn on a local model could start (seen live on 20 November 2026). The CLI is not ours to change, so
this module sits in agent-freeduet's own path to the endpoint: it moves every message whose role is ``system`` or
``developer`` into the request's top-level ``system`` field, which is where the protocol puts system text, and
forwards the request. Of a moved message only its text blocks move, and nothing else in the request is changed. The real Claude engine does not use it: it talks to Anthropic directly.

WHAT IT IS NOT. It has no upstream of its own: the address is the entry's, fixed when it is built. It listens on this
machine's loopback only, on a port the system picks, for one turn. It adds no header. The
``Authorization`` the CLI sends (the entry's own key, or the key-free placeholder) is passed on, so a keyed gateway's key
travels through this hop too; it is never logged, stored or put in an error. It logs no body. End-to-end headers are
passed on (the ones that describe one hop are not), and an answer is passed through as its bytes arrive, so a stream stays
a stream. Each request uses its own connection to the CLI (the answer says ``connection: close``). Only the target's path
and query are taken from the CLI's request, and a target that is not a plain path is refused with 400, so the upstream's
host can never change. Of a moved message only its text blocks move. httpx does not read ``NODE_EXTRA_CA_CERTS``, which
the CLI does, so when that variable names a file it is passed as the CA bundle for the upstream.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import ssl
from contextlib import suppress
from urllib.parse import urlsplit

import httpx

log = logging.getLogger("freeduet.system_role_proxy")

SYSTEM_ROLES = frozenset({"system", "developer"})
MAX_HEAD = 64 * 1024  # the stream reader's limit for the request head: a longer one is refused
MAX_BODY = 64 * 1024 * 1024  # a request with pictures is large; past this it is not a Messages request
#: Never copied from one side to the other: they describe the hop, not the message.
_HOP = frozenset(
    {"connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "content-length", "host"}
)


def _verify_with(bundle: str | None):
    """What httpx verifies the upstream with: its own default CAs, plus the file ``NODE_EXTRA_CA_CERTS`` names, which the CLI
    adds to its trust store and httpx does not read. The file ADDS to the default CAs, never replaces them. A file that cannot
    be read or is not a certificate bundle leaves the default, and only the kind of error is logged."""
    if not bundle:
        return True
    try:
        context = httpx.create_ssl_context()
        context.load_verify_locations(cafile=bundle)
    except (ssl.SSLError, OSError) as error:
        log.warning("system-role proxy: NODE_EXTRA_CA_CERTS was not used (%s)", type(error).__name__)
        return True
    return context


def _plain_target(target: str) -> bool:
    """A request target the hop forwards: a path that starts with one "/", with no userinfo marker, backslash, space or control
    character. Anything else (``@host``, an absolute URI, ``//host``) could move the request to another host and is refused."""
    return (
        target.startswith("/")
        and not target.startswith("//")
        and "@" not in target
        and "\\" not in target
        and all(ch.isprintable() and not ch.isspace() for ch in target)
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


#: Keys of a request body that make OpenRouter try other models than the one named (`models`, `route`) or choose providers
#: (`provider`); a free entry never sends them (D107).
FALLBACK_KEYS = ("models", "route", "provider")


def pin_model(body: dict, model: str) -> bool:
    """Make the request ask for exactly ``model``: set ``body["model"]`` and drop the fallback keys. True when anything changed."""
    changed = body.get("model") != model
    body["model"] = model
    for key in FALLBACK_KEYS:
        if key in body:
            del body[key]
            changed = True
    return changed


def rewrite(raw: bytes, pinned: str | None = None) -> bytes:
    """The request body with system-role messages moved, and with its model pinned when ``pinned`` is given; the bytes unchanged
    when there is nothing to do or it is not JSON."""
    try:
        body = json.loads(raw)
    except ValueError:
        return raw
    if not isinstance(body, dict):
        return raw
    moved = normalize(body)
    fixed = pin_model(body, pinned) if pinned else False
    if not moved and not fixed:
        return raw
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


async def _read_request(reader: asyncio.StreamReader) -> tuple[str, str, list[tuple[str, str]], bytes] | None:
    head = await reader.readuntil(b"\r\n\r\n")
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
            if len(body) + size > MAX_BODY:
                return None
            body.extend(await reader.readexactly(size))
            await reader.readexactly(2)
        return method, target, headers, bytes(body)
    length = int(lowered.get("content-length", "0") or 0)
    if length > MAX_BODY:
        return None
    return method, target, headers, await reader.readexactly(length) if length else b""


class SystemRoleProxy:
    """One per turn: ``async with SystemRoleProxy(base_url) as proxy``, then point the CLI at ``proxy.url``."""

    def __init__(self, upstream: str, *, use_environment_proxy: bool = False, pinned_model: str | None = None):
        self._pinned = pinned_model  # an OpenRouter free entry's one model (D107): every request is made to ask for it alone
        self._upstream = upstream.rstrip("/")
        parts = urlsplit(self._upstream)
        self._base = f"{parts.scheme}://{parts.netloc}{parts.path}"
        bundle = os.environ.get("NODE_EXTRA_CA_CERTS")
        verify = _verify_with(bundle)
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=900.0, write=30.0, pool=10.0),
            trust_env=use_environment_proxy,
            verify=verify,
        )
        self._server: asyncio.AbstractServer | None = None
        self._handlers: set[asyncio.Task] = set()
        self.url = ""

    async def __aenter__(self) -> SystemRoleProxy:
        self._server = await asyncio.start_server(self._accept, "127.0.0.1", 0, limit=MAX_HEAD)
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
        """One request, one answer, then the connection is closed (the answer says so)."""
        try:
            request = await _read_request(reader)
            if request is None:
                await self._refuse(writer, "400 Bad Request", "the request is too large")
            else:
                await self._forward(request, writer)
        except (asyncio.IncompleteReadError, ConnectionError, asyncio.CancelledError):
            return
        except Exception as error:  # noqa: BLE001 - only the kind of failure is logged: no address, header or body
            log.warning("system-role proxy: a request was dropped (%s)", type(error).__name__)
        finally:
            with suppress(Exception):
                writer.close()

    @staticmethod
    async def _refuse(writer: asyncio.StreamWriter, status: str, message: str) -> None:
        data = json.dumps({"type": "error", "error": {"type": "api_error", "message": message}}).encode("utf-8")
        writer.write(
            f"HTTP/1.1 {status}\r\ncontent-type: application/json\r\nconnection: close\r\ncontent-length: {len(data)}\r\n\r\n".encode()
            + data
        )
        await writer.drain()

    async def _forward(self, request, writer: asyncio.StreamWriter) -> None:
        method, target, headers, body = request
        if not _plain_target(target):
            await self._refuse(writer, "400 Bad Request", "the request target is not a plain path")
            return
        path = urlsplit(target)
        if path.path.rstrip("/").endswith("/v1/messages"):
            body = rewrite(body, self._pinned)
        sent = [(name, value) for name, value in headers if name.lower() not in _HOP]
        try:
            upstream = self._client.build_request(method, self._base + path.path + (f"?{path.query}" if path.query else ""), headers=sent, content=body)
            response = await self._client.send(upstream, stream=True)
        except httpx.HTTPError as error:
            log.warning("system-role proxy: the endpoint could not be reached (%s)", type(error).__name__)
            await self._refuse(writer, "502 Bad Gateway", "the endpoint could not be reached")
            return
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
