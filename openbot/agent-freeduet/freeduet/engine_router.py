"""The engine chain in the member path (ENGINES_PLAN slice 3, section 5).

WHEN IT RUNS. Only for a member whose chain has more than one engine this service can run, or who is pinned
(:meth:`Router.engaged`). The default install is Claude Code alone, and for it nothing here runs: ``app._events``
calls ``run_segment`` with the recorded Claude engine exactly as before, whatever the breaker says (the 52
goldens and ``test_engine_state_neutral.py`` hold that).

WHAT IT DOES. One POST is one segment, and the router runs the segment on the first engine of the member's chain
that the breaker lets in (``EngineState.begin``), once per attempt, and records each attempt's outcome once
(:class:`_Attempt`, which settles the ticket the way ``RecordedEngine`` does). When the engine stops the segment
with a failure the plan lets a turn move on from (a limit, a sign-in, a transient failure), the next engine
continues IN THE SAME SEGMENT, and the person sees one short sentence (engine_notices.py):

* nothing was said or done yet: the next engine answers instead;
* text was said: the next engine gets that text as the end of the transcript and is told not to repeat it;
* a tool call ran and has its result (a deployment tool inside the segment): the call and its result are in the
  transcript, and the model is told, as always, never to repeat a call that has a result. A segment that ends on a
  tool OpenBot runs is not a failure: it ends with RUN_FINISHED, the approval gate runs the call, and the next POST
  walks the chain afresh, so every write still meets the gate and a switch happens only at a segment boundary.

MODES (``switching`` in the engines file, per member or ``default``): ``automatic`` (the default) and
``ask-first``, which stops with one fixed question (a plain assistant message and RUN_FINISHED, the way
``ask_the_person`` pauses a turn; no card, nothing on the server) and reads the person's next message as the
answer. ``pin`` never falls back: the turn stops with a plain message that names the limited engine and until
when. DISABLE is ``enabled: false`` in the file, which ``ordered_chain`` already honours.

BOUNDS. ``MAX_SWITCHES`` (2, the plan's loop guard) engine switches per turn, then a plain message.
``FIRST_OUTPUT_SECONDS`` without a word or a tool call from an engine is a ``transient`` failure of that engine
and the turn moves on; the segment's own whole-turn timeout stays the segment's and is recorded as ``transient``
only when the engine had said nothing. ``PROBE_EVERY_SECONDS``: an engine the breaker holds ``signed_out`` is
probed (``claude --version`` and ``claude auth status``, never a model call) at most once in that time, and only
when a turn would walk past it, so a sign-in the person did in a terminal is seen without any turn being spent.
"""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import logging
import os
import time
from collections.abc import AsyncIterator, Mapping
from datetime import datetime

from . import agui, engine_notices as notices
from .agui import RunInput
from .claude_cli import ENGINE_LIMITED
from .engine_adapter import EngineAdapter, Gate, Health, Outcome, ProbeResult, Sink, TurnContext

from .engine_state import SIGNED_OUT, EngineState
from .engines import EnginesConfig, Switching, ordered_chain, switching_for, tier_at_least
from .failure_classifier import AUTH, CREDITS, RATE_LIMIT, TRANSIENT, USAGE_LIMIT, Failure
from .members import Member
from .segment import SegmentNotes, run_segment

log = logging.getLogger("freeduet.engine_router")

MAX_SWITCHES = 2
PROBE_EVERY_SECONDS = 60.0
PROBE_WAIT_SECONDS = 10.0
SWITCHABLE = frozenset({RATE_LIMIT, USAGE_LIMIT, CREDITS, AUTH, TRANSIENT})
TOOK_TOO_LONG = "took too long on this turn"


def first_output_seconds() -> float:
    """How long an engine may say nothing before the turn moves on. Claude may think a long while before its
    first word, so the default is generous; ``FREEDUET_FIRST_OUTPUT_SECONDS`` sets it."""
    try:
        return max(1.0, float(os.environ.get("FREEDUET_FIRST_OUTPUT_SECONDS", "") or 180.0))
    except ValueError:
        return 180.0


class _Attempt(EngineAdapter):
    """One engine's go at a segment. Reports the outcome to the breaker once, like ``RecordedEngine``, plus what
    only the router knows: a first-output timeout is a transient failure; the whole-turn timeout is one only when
    the engine had said nothing."""

    def __init__(self, engine: EngineAdapter, state: EngineState, ticket):
        self._engine, self._state, self._ticket = engine, state, ticket
        self.key, self.label, self.kind, self.capabilities = engine.key, engine.label, engine.kind, engine.capabilities
        self.health: Health | None = None
        self.hint: str | None = None  # "first_output" or "whole_turn"
        self._settled = False

    def child_env(self, source=None):
        return self._engine.child_env(source)

    async def probe(self) -> ProbeResult:
        return await self._engine.probe()

    async def run_turn(self, ctx: TurnContext, sink: Sink, gate: Gate) -> Outcome:
        self.health = ctx.diagnostics.health
        try:
            return await self._engine.run_turn(ctx, sink, gate)
        finally:
            self.settle()

    def settle(self) -> None:
        if self._settled:
            return
        self._settled = True
        health = self.health if self.health is not None else Health()
        if health.failure is None and (self.hint == "first_output" or (self.hint == "whole_turn" and not health.answered)):
            health = Health(answered=health.answered, failure=Failure(TRANSIENT))
        self._state.finish(self.key, self._ticket, health)

    @property
    def failure(self) -> Failure | None:
        if self.health is not None and self.health.failure is not None:
            return self.health.failure
        return Failure(TRANSIENT) if self.hint == "first_output" else None


_END = object()


async def _next(generator):
    try:
        return await generator.__anext__()
    except StopAsyncIteration:
        return _END


def _say(text: str) -> list[dict]:
    message_id = agui.new_id("msg-")
    return [agui.text_start(message_id), agui.text_content(message_id, text), agui.text_end(message_id)]


def _text_of(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


_RANK = {notices.NONE: 0, notices.TEXT: 1, notices.TOOL: 2}


class Router:
    def __init__(self, state: EngineState, adapters: Mapping[str, EngineAdapter], config: EnginesConfig,
                 clock=time.monotonic):
        self.state, self.adapters, self.config, self._clock = state, dict(adapters), config, clock
        self._probed_at: dict[str, float] = {}
        for adapter in self.adapters.values():
            state.register(adapter)

    # -- the plan for a member ------------------------------------------------------------------

    def _runnable(self, member_id: str) -> list[str]:
        return [e.id for e in ordered_chain(member_id, self.config) if e.id in self.adapters]

    def engaged(self, member_id: str) -> bool:
        """More than one engine to walk, or a pin. Otherwise the member's turn is the one it always was."""
        return len(self._runnable(member_id)) > 1 or switching_for(member_id, self.config).pin is not None

    # -- probing --------------------------------------------------------------------------------

    async def _probe_signed_out(self, keys: list[str]) -> None:
        for key in keys:
            row = self.state.row(key)
            if row is None or row.state != SIGNED_OUT:
                continue
            last = self._probed_at.get(key)
            if last is not None and self._clock() - last < PROBE_EVERY_SECONDS:
                continue
            self._probed_at[key] = self._clock()
            try:
                await asyncio.wait_for(self.state.probe(self.adapters[key]), PROBE_WAIT_SECONDS)
            except Exception:  # noqa: BLE001 - a probe never fails a turn
                log.warning("engine probe did not finish", exc_info=True)

    # -- the ask-first answer -------------------------------------------------------------------

    @staticmethod
    def _answer(messages: list[dict], lang: str) -> tuple[str, str] | None:
        """The person's reply to the ask-first question that stands directly before it, or None."""
        if len(messages) < 2 or messages[-1].get("role") != "user" or messages[-2].get("role") != "assistant":
            return None
        if notices.ASK_MARK[lang] not in _text_of(messages[-2]):
            return None
        return notices.parse_answer(_text_of(messages[-1]))

    # -- the turn -------------------------------------------------------------------------------

    async def run(self, run: RunInput, member: Member, notes: SegmentNotes) -> AsyncIterator[dict]:
        yield agui.run_started(run)
        lang = notices.language_of(run)
        choice: Switching = switching_for(member.id, self.config)
        order = self._runnable(member.id)
        if choice.pin is not None:
            pinned_engine = self.config.engines.get(choice.pin)
            if choice.pin not in self.adapters or pinned_engine is None or not pinned_engine.enabled:
                label = self.adapters[choice.pin].label if choice.pin in self.adapters else choice.pin
                yield agui.run_error(notices.pinned_off(lang, label), ENGINE_LIMITED)
                return
            order = [choice.pin]
        await self._probe_signed_out(order)

        authorised, chosen = False, None
        extra: list[str] = []
        if choice.mode == "ask-first":
            answer = self._answer(run.messages, lang)
            if answer is not None:
                what, said = answer
                if what == "wait":
                    row = self.state.row(order[0]) if order else None
                    label = self.adapters[order[0]].label if order else ""
                    for event in _say(notices.waiting(lang, label, row.limited_until if row else None)):
                        yield event
                    yield agui.run_finished(run)
                    return
                if what == "switch":
                    authorised = True
                elif what == "name":
                    chosen = next((k for k in order if said in {k.lower(), self.adapters[k].label.lower()}), None)
                    authorised = chosen is not None
                if authorised:
                    extra.append(
                        "The person's last message only answered a question about which engine should continue. "
                        "It is not a new request: carry on with their earlier request."
                    )
        if chosen is not None:
            order = [chosen, *[k for k in order if k != chosen]]

        offered = {tool["name"] for tool in run.tools}
        floors = {n: t for n, t in self.config.quality_floor.get(member.id, {}).items() if n in offered}

        tried: set[str] = set()
        blocked: list[tuple[str, str, datetime | None]] = []  # engines that could not take the turn: label, kind, until
        produced: list[dict] = []
        progress = notices.NONE
        switches = 0
        stopped: tuple[str, str, datetime | None] | None = None  # the engine we are moving on from

        while True:
            key = self._pick(order, tried, floors, blocked)
            if key is None:
                if choice.pin is not None and blocked:
                    yield agui.run_error(notices.pinned(lang, *blocked[-1]), ENGINE_LIMITED)
                    return
                until = min((b[2] for b in blocked if b[2] is not None), default=None)
                yield agui.run_error(notices.all_limited(lang, until), ENGINE_LIMITED)
                return
            if stopped is None and blocked:
                stopped = blocked[0]  # the first engine of the chain was not available at the start
            pending: list[str] = []
            if stopped is not None:
                if switches >= MAX_SWITCHES:
                    yield agui.run_error(notices.loop_stop(lang, switches), ENGINE_LIMITED)
                    return
                if choice.mode == "ask-first" and not authorised:
                    for event in _say(notices.asked(lang, *stopped, self.adapters[key].label)):
                        yield event
                    yield agui.run_finished(run)
                    return
                switches += 1
                pending.append(notices.switched(lang, *stopped, self.adapters[key].label, progress))
            ticket = self.state.begin(key)
            if ticket is None:  # the breaker said no between the look and the ask (a half-open probe taken)
                tried.add(key)
                continue
            engine = self.config.engines[key]
            missing = {n: t for n, t in floors.items() if not tier_at_least(engine.tier, t)}
            tools = [t for t in run.tools if t["name"] not in missing]
            if missing:
                pending.append(notices.without_tools(lang, sorted(missing), min(missing.values())))
            if pending:
                for event in _say(" ".join(pending)):
                    yield event

            attempt_notes = list(extra)
            if progress != notices.NONE:
                attempt_notes.append(
                    "Your earlier answer in this turn was cut off by an engine limit. What is in the conversation "
                    "above is already on the person's screen: continue exactly where it stopped and do not repeat "
                    "it. Never repeat a tool call that already has a result."
                )
            if missing:
                attempt_notes.append(
                    f"These tools are not available on this engine: {', '.join(sorted(missing))}. Do not pretend to "
                    "use them; if the person needs one, say it needs a better engine and why."
                )
            attempt = _Attempt(self.adapters[key], self.state, ticket)
            sub = dataclasses.replace(run, messages=[*run.messages, *produced], tools=tools)
            stream = run_segment(sub, member, notes, attempt, announce=False, extra_notes=tuple(attempt_notes))
            held: dict | None = None
            saw_output, finished = False, False
            builder = _Produced()
            try:
                while True:
                    wait = first_output_seconds() if not saw_output else None
                    pending_event = asyncio.ensure_future(_next(stream))
                    await asyncio.wait({pending_event}, timeout=wait)
                    if not pending_event.done():
                        # The hint is set BEFORE the segment is stopped, because stopping it settles the ticket.
                        attempt.hint = "first_output"
                        pending_event.cancel()
                        with contextlib.suppress(asyncio.CancelledError, Exception):
                            await pending_event
                        held = {"type": "RUN_ERROR", "message": ""}
                        break
                    event = pending_event.result()
                    if event is _END:
                        break
                    kind = event["type"]
                    if kind == "RUN_ERROR":
                        held = event
                        if TOOK_TOO_LONG in str(event.get("message") or ""):
                            attempt.hint = "whole_turn"
                        break
                    if kind == "RUN_FINISHED":
                        finished = True
                    builder.see(event)
                    saw_output = saw_output or kind.startswith(("TEXT_MESSAGE_CONTENT", "TOOL_CALL"))
                    yield event
                    if finished:
                        break
            finally:
                await stream.aclose()
                attempt.settle()
            if finished:
                return
            produced.extend(builder.messages())
            progress = max(progress, builder.progress, key=_RANK.get)
            failure = attempt.failure
            tried.add(key)
            if held is None:  # the segment ended with no terminal event: leave it to the app's own guard
                return
            if attempt.hint == "whole_turn" or failure is None or failure.kind not in SWITCHABLE:
                yield held
                return
            row = self.state.row(key)
            until = (row.limited_until if row else None) or failure.retry_at
            stopped = (self.adapters[key].label, failure.kind, until)
            blocked.append(stopped)

    def _pick(self, order: list[str], tried: set[str], floors: dict[str, str],
              blocked: list[tuple[str, str, datetime | None]]) -> str | None:
        """The next engine that is available now, preferring ones that meet the quality floor. Looks without
        asking the breaker for a ticket; engines it finds unavailable are noted in `blocked` (once each)."""
        available: list[str] = []
        for key in order:
            if key in tried:
                continue
            row = self.state.row(key)
            if row is not None and not row.available:
                tried.add(key)
                kind = AUTH if row.state == SIGNED_OUT else (row.last_failure_kind or USAGE_LIMIT)
                blocked.append((self.adapters[key].label, kind, row.limited_until))
                continue
            available.append(key)
        if not available:
            return None
        if floors:
            for key in available:
                if all(tier_at_least(self.config.engines[key].tier, t) for t in floors.values()):
                    return key
        return available[0]


class _Produced:
    """What one attempt said and did, as the messages the next engine's transcript needs."""

    def __init__(self):
        self._messages: list[dict] = []
        self.progress = notices.NONE

    def _assistant(self) -> dict:
        if not self._messages or self._messages[-1]["role"] != "assistant":
            self._messages.append({"id": agui.new_id("msg-"), "role": "assistant", "content": ""})
        return self._messages[-1]

    def see(self, event: dict) -> None:
        kind = event["type"]
        if kind == "TEXT_MESSAGE_START":
            self._messages.append({"id": event.get("messageId") or agui.new_id("msg-"), "role": "assistant", "content": ""})
        elif kind == "TEXT_MESSAGE_CONTENT":
            self._assistant()["content"] += event.get("delta") or ""
            self.progress = max(self.progress, notices.TEXT, key=_RANK.get)
        elif kind == "TOOL_CALL_START":
            message = self._assistant()
            message.setdefault("toolCalls", []).append(
                {"id": event["toolCallId"], "type": "function", "function": {"name": event["toolCallName"], "arguments": ""}}
            )
        elif kind == "TOOL_CALL_ARGS":
            for message in self._messages:
                for call in message.get("toolCalls", []):
                    if call["id"] == event["toolCallId"]:
                        call["function"]["arguments"] += event.get("delta") or ""
        elif kind == "TOOL_CALL_RESULT":
            self._messages.append(
                {"id": event.get("messageId") or agui.new_id("tool-"), "role": "tool",
                 "toolCallId": event["toolCallId"], "content": event.get("content") or ""}
            )
            self.progress = notices.TOOL

    def messages(self) -> list[dict]:
        done = []
        for message in self._messages:
            if message["role"] == "assistant":
                for call in message.get("toolCalls", []):
                    call["function"]["arguments"] = call["function"]["arguments"] or "{}"
                if not message["content"] and not message.get("toolCalls"):
                    continue
            done.append(message)
        return done


def router_from_environment(state: EngineState, adapters: Mapping[str, EngineAdapter]) -> Router | None:
    """The router for the engines file in use, or None when it cannot be read (the member path then runs as it
    always has; a bad file already stops the service in server_calls)."""
    from .engines import load_engines

    try:
        return Router(state, adapters, load_engines())
    except Exception:  # noqa: BLE001
        log.warning("engine router not started: members run on Claude Code alone", exc_info=True)
        return None


__all__ = ["MAX_SWITCHES", "PROBE_EVERY_SECONDS", "Router", "router_from_environment"]
