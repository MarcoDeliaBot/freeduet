"""agent-freeduet's HTTP surface: `GET /health` and `POST /` (AG-UI over SSE).

One service serves every team member (D1): OpenBot posts each member's runs to the managed
endpoint with `x-openbot-agent-token`, and the member is found by id (members.py). The server's own
short model calls, `POST /v1/messages`, live in `freeduet/server_calls.py` (stream B; the plan's
`aux.py`, renamed because `aux` is a reserved file name on Windows). When that module is present it
is given `run_claude_text` and its `router` is mounted here; it checks `x-api-key` itself.
"""

import asyncio
import hmac
import importlib
import importlib.util
import logging
import os
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from . import agui, claude_cli
from .members import MemberError, resolve_member
from .segment import run_segment

TOKEN_HEADER = "x-openbot-agent-token"
SERVER_CALLS_MODULE = "freeduet.server_calls"
SERVER_CALLS_PREFIX = "/v1/"
OPEN_PATHS = {"/health"}

log = logging.getLogger("freeduet")

app = FastAPI(title="agent-freeduet", docs_url=None, redoc_url=None, openapi_url=None)


def _token_ok(offered: str) -> bool:
    expected = (os.environ.get("MANAGED_AGENT_TOKEN") or "").strip()
    # No token configured means nobody is let in, not everybody.
    return bool(expected) and hmac.compare_digest(offered.strip().encode("utf-8"), expected.encode("utf-8"))


@app.middleware("http")
async def refuse_without_the_server_token(request: Request, call_next):
    path = request.url.path
    # /v1/* belongs to server_calls.py, which checks FREEDUET_LOCAL_KEY itself.
    if path not in OPEN_PATHS and not path.startswith(SERVER_CALLS_PREFIX):
        if not _token_ok(request.headers.get(TOKEN_HEADER) or ""):
            return JSONResponse({"error": "unauthorised"}, status_code=401)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"ok": True, "service": "agent-freeduet"}


TERMINAL = {"RUN_FINISHED", "RUN_ERROR"}


# ── CHECKPOINT CALL SITE (stream E, D13) ─────────────────────────────────────────────────────────
# `freeduet/checkpoints.py` comes from stream E: save_checkpoint(root, run_id, agent, phase, state),
# with run_id = the AG-UI threadId, agent = the bot id and root = default_root(). Imported only when
# the module exists. A checkpoint that cannot be written is logged and never fails the run.
def _checkpoint_writer():
    if importlib.util.find_spec("freeduet.checkpoints") is None:
        return None
    module = importlib.import_module("freeduet.checkpoints")
    return lambda run_id, agent, phase, state: module.save_checkpoint(
        module.default_root(), run_id, agent, phase, state
    )


async def _save_checkpoint(run: agui.RunInput, phase: str, state: dict) -> None:
    try:
        writer = _checkpoint_writer()
        if writer is not None:
            await asyncio.to_thread(writer, run.thread_id, run.bot_id, phase, state)
    except Exception:  # noqa: BLE001 - ValueError for an invalid id, or any I/O failure
        log.warning("checkpoint not written for this segment", exc_info=True)
# ─────────────────────────────────────────────────────────────────────────────────────────────────


class _SegmentSummary:
    """What a segment did, for its checkpoint: its text, the tools it called, how it ended."""

    def __init__(self, run: agui.RunInput):
        self.run = run
        self.text: list[str] = []
        self.tools: list[str] = []

    def see(self, event: dict) -> None:
        if event["type"] == "TEXT_MESSAGE_CONTENT":
            self.text.append(event["delta"])
        elif event["type"] == "TOOL_CALL_START":
            self.tools.append(event["toolCallName"])

    def checkpoint(self, terminal: dict) -> tuple[str, dict]:
        phase = "error" if terminal["type"] == "RUN_ERROR" else "tool_call" if self.tools else "finished"
        state = {"runId": self.run.run_id, "text": "".join(self.text)[-4000:], "toolCalls": self.tools}
        if terminal["type"] == "RUN_ERROR":
            state["error"] = terminal.get("message", "")
        return phase, state


async def _events(run: agui.RunInput) -> AsyncIterator[dict]:
    """The run's events, always ending in RUN_FINISHED or RUN_ERROR, whatever goes wrong."""
    try:
        member = resolve_member(run.bot_id, run.messages)
    except MemberError as error:
        yield agui.run_started(run)
        yield agui.run_error(str(error), "FREEDUET_UNKNOWN_MEMBER")
        return
    summary = _SegmentSummary(run)
    started = False
    try:
        async for event in run_segment(run, member):
            started = started or event["type"] == "RUN_STARTED"
            summary.see(event)
            if event["type"] in TERMINAL:
                await _save_checkpoint(run, *summary.checkpoint(event))
            yield event
    except Exception:
        log.exception("segment failed", extra={"thread_id": run.thread_id})
        if not started:
            yield agui.run_started(run)
        yield agui.run_error("agent-freeduet failed on this turn. Send it again; if it keeps failing, check its log.")


@app.post("/")
async def run_agent(request: Request):
    try:
        run = agui.parse_run_input(await request.json())
    except ValueError as error:  # also covers a body that is not JSON
        return JSONResponse({"error": str(error) or "invalid body"}, status_code=400)
    return StreamingResponse(
        agui.sse(_events(run), agui.KEEPALIVE_SECONDS),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def claude_text_runner(module):
    """The `run_claude_text` handed to server_calls: the person's Claude Code login, locked down
    with no tools at all; a plain failure becomes the module's EngineUnavailable."""

    async def run_claude_text(system: str, prompt: str, model: str | None = None) -> str:
        try:
            return await claude_cli.run_text(system or "", prompt, model)
        except claude_cli.TextCallFailed as error:
            raise module.EngineUnavailable(str(error)) from None

    return run_claude_text


def mount_server_calls(target: FastAPI, module_name: str = SERVER_CALLS_MODULE) -> bool:
    """Mount stream B's `/v1/messages` router when its module exists. A module that exists but
    fails to import is an error, not a silent absence."""
    if importlib.util.find_spec(module_name) is None:
        return False
    module = importlib.import_module(module_name)
    module.configure(run_claude_text=claude_text_runner(module))
    target.include_router(module.router)
    return True


mount_server_calls(app)
