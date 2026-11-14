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
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from . import agui, checkpoints, claude_cli, engine_choices, engine_router, engine_state, origin, report, team_log
from .claude_engine import ClaudeEngine
from .engine_adapter import EngineAdapter
from .members import MemberError, load_prompts, resolve_member
from .segment import SegmentNotes, run_segment

TOKEN_HEADER = "x-openbot-agent-token"
SERVER_CALLS_MODULE = "freeduet.server_calls"
SERVER_CALLS_PREFIX = "/v1/"
OPEN_PATHS = {"/health"}

log = logging.getLogger("freeduet")


@asynccontextmanager
async def lifespan(target: FastAPI):
    # The engine state reads its file here, once, so that no turn reads (or logs) it.
    try:
        target.state.engine_state = engine_state.from_environment(ClaudeEngine())
    except Exception:  # noqa: BLE001 - recording is never a reason for the service not to start
        log.warning("engine state not started: it is made on first use", exc_info=True)
        target.state.engine_state = None
    target.state.engine_router = None
    if target.state.engine_state is not None:
        engines_now = {engine.key: engine for engine in (ClaudeEngine(),)}
        target.state.engine_router = engine_router.router_from_environment(target.state.engine_state, engines_now)
    try:
        yield
    finally:
        target.state.engine_state = None
        target.state.engine_router = None


app = FastAPI(title="agent-freeduet", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


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


# ── ENGINE STATE (ENGINES_PLAN slice 2) ──────────────────────────────────────────────────────────
# Each member turn is reported to the engine breaker when it ends (engine_state.py). A member with ONE engine
# (the default install) behaves the same whatever the breaker says; with a chain the router asks it (slice 3). `GET /engines`
# is the agent's side of the server's `GET /api/freeduet/engines`: read-only, behind the same token check
# as `POST /` (it is in no OPEN_PATHS and not under /v1/).
def _engine_state() -> engine_state.EngineState:
    state = getattr(app.state, "engine_state", None)
    if state is None:  # the start-up did not run (a test client used without `with`)
        state = app.state.engine_state = engine_state.from_environment(ClaudeEngine())
    return state


def _engine_for_a_turn() -> EngineAdapter | None:
    """Claude Code with its turns recorded. If the state cannot be had the turn runs unrecorded (None is
    the segment's own default engine): recording is never a reason to fail it."""
    try:
        return _engine_state().recorded(ClaudeEngine())
    except Exception:  # noqa: BLE001
        log.warning("engine state unavailable: this turn is not recorded", exc_info=True)
        return None


def _members_overview() -> list[dict]:
    """Each member's engines and switching as the engines file gives them (``Router.overview``), for the server's
    Engines page. Empty when there is no router or no team file to name the members: the page then shows the
    engines and no members. Reading it never fails the endpoint."""
    router = getattr(app.state, "engine_router", None)
    if router is None:
        return []
    try:
        return router.overview(list(load_prompts()))
    except Exception:  # noqa: BLE001 - the members are an addition to the state, never a reason to refuse it
        log.warning("members overview unavailable", exc_info=True)
        return []


@app.get("/engines")
async def engines():
    body = _engine_state().snapshot().as_json()
    body["members"] = _members_overview()
    # The version of the person's choices this service honours (engine_choices.py): the server's page turns a
    # control on only where it is here.
    body["choices_version"] = engine_choices.VERSION
    return JSONResponse(body, headers={"Cache-Control": "no-store"})
# ─────────────────────────────────────────────────────────────────────────────────────────────────


TERMINAL = {"RUN_FINISHED", "RUN_ERROR"}


# ── CHECKPOINT CALL SITE (D13, D15) ──────────────────────────────────────────────────────────────
# After every segment (a finished turn, a turn that ended on a tool call OpenBot runs, an error):
# the member's report becomes a checkpoint (report.py maps it, checkpoints.py writes it under
# <FREEDUET_DATA_DIR>/handoff/<botId>/<threadId>/) and one line goes to the team log (team_log.py).
# Each is written or logged as not written; neither ever fails the run. When the report guard asked
# for the report (report_guard.py), the team-log line says so in `report_guard`.
def _checkpoint_writer():
    return lambda run_id, agent, phase, state: checkpoints.save_checkpoint(
        checkpoints.default_root(), run_id, agent, phase, state
    )


async def _save_checkpoint(run: agui.RunInput, phase: str, state: dict) -> None:
    try:
        writer = _checkpoint_writer()
        if writer is not None:
            await asyncio.to_thread(writer, run.thread_id, run.bot_id, phase, state)
    except Exception:  # noqa: BLE001 - ValueError for an invalid id, or any I/O failure
        log.warning("checkpoint not written for this segment", exc_info=True)


async def _append_team_log(run: agui.RunInput, assessment: report.Assessment, report_guard: str | None = None) -> None:
    try:
        entry = team_log.make_entry(
            member=run.bot_id,
            thread=run.thread_id,
            run=run.run_id,
            outcome=assessment.outcome,
            summary=assessment.summary,
            from_iris=origin.from_iris(run.messages, run.assertion),
            approvals=assessment.approvals,
            report_guard=report_guard,
        )
        await asyncio.to_thread(team_log.append, entry)
    except Exception:  # noqa: BLE001 - a missing data folder, a full disk
        log.warning("team-log line not written for this segment", exc_info=True)


async def _record_segment(run: agui.RunInput, summary: "_SegmentSummary", terminal: dict) -> None:
    summary.recorded = True
    try:
        assessment = report.assess(summary.facts(terminal))
    except Exception:  # noqa: BLE001
        log.warning("segment not assessed: no checkpoint and no team-log line", exc_info=True)
        return
    await _save_checkpoint(run, assessment.phase, assessment.state)
    await _append_team_log(run, assessment, summary.notes.report_guard)
# ─────────────────────────────────────────────────────────────────────────────────────────────────


class _SegmentSummary:
    """What a segment did: the text of each message, the tools it called and which of those came
    back within the segment (deployment tools). A call without a result is one OpenBot now runs."""

    MAX_TEXT = 20000  # the report is at the end

    def __init__(self, run: agui.RunInput):
        self.run = run
        self.text: dict[str, list[str]] = {}
        self.calls: dict[str, str] = {}
        self.answered: set[str] = set()
        self.recorded = False
        self.notes = SegmentNotes()  # filled in by the segment: whether the report guard asked

    def see(self, event: dict) -> None:
        kind = event["type"]
        if kind == "TEXT_MESSAGE_CONTENT":
            self.text.setdefault(event.get("messageId") or "", []).append(event["delta"])
        elif kind == "TOOL_CALL_START":
            self.calls[event["toolCallId"]] = event["toolCallName"]
        elif kind == "TOOL_CALL_RESULT":
            self.answered.add(event["toolCallId"])

    def facts(self, terminal: dict) -> report.SegmentFacts:
        objective, constraints = origin.request(self.run.messages)
        text = "\n\n".join("".join(parts) for parts in self.text.values())
        return report.SegmentFacts(
            text=text[-self.MAX_TEXT:],
            objective=objective,
            handed_tools=[name for call_id, name in self.calls.items() if call_id not in self.answered],
            constraints=constraints,
            error=str(terminal.get("message") or "") if terminal["type"] == "RUN_ERROR" else None,
        )


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
    router = getattr(app.state, "engine_router", None)
    if router is not None and router.engaged(member.id):  # a chain of more than one engine, or a pin (ENGINES_PLAN slice 3)
        stream = router.run(run, member, summary.notes)
    else:  # the default install: Claude Code alone, exactly as before
        stream = run_segment(run, member, summary.notes, _engine_for_a_turn())
    try:
        async for event in stream:
            started = started or event["type"] == "RUN_STARTED"
            summary.see(event)
            if event["type"] in TERMINAL:
                await _record_segment(run, summary, event)
            yield event
    except Exception:
        log.exception("segment failed", extra={"thread_id": run.thread_id})
        if not started:
            yield agui.run_started(run)
        error = agui.run_error("agent-freeduet failed on this turn. Send it again; if it keeps failing, check its log.")
        if not summary.recorded:
            await _record_segment(run, summary, error)
        yield error


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
