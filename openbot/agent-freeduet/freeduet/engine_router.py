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

THE LEDGER (ledger.py). An engine that costs money and that the person put under ``metered.enforce: ledger`` is checked before
it starts a turn: at or over today's or this month's cap, or with a ledger that cannot tell what was spent, it is skipped
exactly like a limited engine (the same notices, the pin stops and says so, ask-first asks), and it is available again when the
UTC day or month turns. Its turns are recorded when they end (``EngineState.finish``). A turn that crosses a cap while it runs
finishes: the limit is checked before a turn, not during it. No engine of a default install is in this group, and for them
nothing here runs.

THE PERSON'S MODE. The server sends what the person chose on the Engines page for this member with the run
(``RunInput.engine_choices``, engine_choices.py). Their mode replaces the file's; the pin stays the file's. Without a
choice, or with one this service cannot read, the file's ``switching:`` entry is used as before. The mode decides only
whether the router asks before it switches. It never decides what may run: the ledger's check is made in ``_pick`` for every
engine of the order, whatever the mode, and whatever the person answers to a question (``switch``, or the name of an
engine), so an engine held by a cap is skipped in either mode and no answer lifts the hold.

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

from . import agui, engine_choices, engine_notices as notices
from .agui import RunInput
from .claude_cli import ENGINE_LIMITED
from .compatible_engine import adapters_from_config
from .engine_adapter import EngineAdapter, Gate, Health, Outcome, ProbeResult, Sink, TurnContext

from .engine_state import SIGNED_OUT, EngineState, ledger_file
from .engines import (
    COMPATIBLE_KIND,
    Engine,
    EnginesConfig,
    Switching,
    chain_ids,
    first_answer_limit,
    is_light,
    is_local_model,
    exclusion_code,
    exclusion_reason,
    is_free_cloud,
    ledger_engine_ids,
    order_logins_first,
    ordered_chain,
    paid_gateway_gap,
    paid_gateway_refusal,
    paid_gateway_refused,
    refused_paid_gateways,
    switching_for,
    tier_at_least,
)
from .failure_classifier import AUTH, CREDITS, RATE_LIMIT, TRANSIENT, USAGE_LIMIT, Failure
from .tools_as_text import NOTE as TOOLS_AS_TEXT_NOTE, TOOLS_AS_TEXT, looks_like_tool_call_text
from .ledger import DAILY, Ledger, Limits
from .members import Member
from .segment import SegmentNotes, run_segment

log = logging.getLogger("freeduet.engine_router")

MAX_SWITCHES = 2
LOCAL_NOTICE_AFTER_SECONDS = 15.0  # D108: a local model silent this long is said to be reading
PROBE_EVERY_SECONDS = 60.0
PROBE_WAIT_SECONDS = 10.0
SWITCHABLE = frozenset({RATE_LIMIT, USAGE_LIMIT, CREDITS, AUTH, TRANSIENT, TOOLS_AS_TEXT})
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
        self.tools_as_text = False  # D116: the turn ended with a tool call written as text; set by the router
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
            health = dataclasses.replace(health, failure=Failure(TRANSIENT))  # what the engine reported of its use stays
        self._state.finish(self.key, self._ticket, health)

    @property
    def failure(self) -> Failure | None:
        if self.tools_as_text:
            return Failure(TOOLS_AS_TEXT)
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


class _TextGuard:
    """D116: holds back the part of an assistant message that could be a tool call written as text, so that it is never
    delivered as the answer. Prose is streamed as it comes; from the first ``<``, ``{`` or backtick the rest of the message is
    held until the message ends, and then delivered when it is ordinary text, or dropped when the whole message ends with a
    text-written tool call (``tools_as_text.looks_like_tool_call_text``). Used only for an engine that runs on a key (a
    gateway), where a small model may do this. Nothing is parsed or run."""

    def __init__(self, tools_offered: bool = True):
        self._tools_offered = tools_offered
        self._start: dict | None = None
        self._id: str | None = None
        self._text = ""
        self._sent = 0
        self._opened = False
        self.flagged = False
        self.tool_seen = False

    @property
    def tools_as_text(self) -> bool:
        """The LAST message of the attempt is a text-written call and nothing real was done before it: the engine failed the turn."""
        return self.flagged and not self.tool_seen

    @property
    def text_call_after_tools(self) -> bool:
        """The last message is a text-written call, but a real tool call was made before it: nothing is run or repeated, the
        person is told in one sentence."""
        return self.flagged and self.tool_seen

    def _open(self) -> list[dict]:
        if self._opened or self._start is None:
            return []
        self._opened = True
        return [self._start]

    def _content(self, upto: int) -> list[dict]:
        if upto <= self._sent:
            return []
        events = self._open()
        events.append({**agui.text_content(self._id or "", self._text[self._sent:upto])})
        self._sent = upto
        return events

    def feed(self, event: dict) -> list[dict]:
        kind = event["type"]
        if kind.startswith("TOOL_CALL"):
            self.tool_seen = True
            self.flagged = False  # a real call came after any text-written one: that text was only noise
        if kind == "TEXT_MESSAGE_START":
            self.flagged = False  # only the LAST message of the attempt decides
            self._start, self._id = event, event.get("messageId")
            self._text, self._sent, self._opened = "", 0, False
            return []
        if kind == "TEXT_MESSAGE_CONTENT" and self._start is not None:
            self._text += event.get("delta") or ""
            cut = next((i for i in range(self._sent, len(self._text)) if self._text[i] in "<{`"), len(self._text))
            return self._content(cut)
        if kind == "TEXT_MESSAGE_END" and self._start is not None:
            out: list[dict] = []
            if self._sent < len(self._text):
                if looks_like_tool_call_text(self._text, self._tools_offered):
                    self.flagged = True
                else:
                    out = self._content(len(self._text))
            if self._opened:
                out.append(event)
            self._start = None
            return out
        return [event]


_RANK = {notices.NONE: 0, notices.TEXT: 1, notices.TOOL: 2}


class Router:
    def __init__(self, state: EngineState, adapters: Mapping[str, EngineAdapter], config: EnginesConfig,
                 clock=time.monotonic, ledger: Ledger | None = None):
        self.state, self.adapters, self.config, self._clock = state, dict(adapters), config, clock
        self._probed_at: dict[str, float] = {}
        for adapter in self.adapters.values():
            state.register(adapter)
        # The engines that cost money and that the person put under `metered.enforce: ledger` are held to the limits by a
        # ledger, which is made here so that none of them can ever run without one (`ledger` is for tests). A default
        # install has none of them: no ledger is made, no file is read, and nothing below runs.
        held = ledger_engine_ids(config) & set(self.adapters)
        if held:
            state.attach_ledger(ledger if ledger is not None else Ledger(ledger_file()), Limits.of(config.metered), frozenset(held))
        # A paid gateway the person switched on and that does not run (it has no adapter): `GET /engines` lists it as
        # refused, with the reason, so the person can see it did not simply vanish.
        for engine in refused_paid_gateways(config):
            if engine.id not in self.adapters:
                state.register_refused(engine.id, engine.id, engine.kind, paid_gateway_refusal(engine.id, paid_gateway_gap(engine, config)))

    # -- the plan for a member ------------------------------------------------------------------

    def _runnable(self, member_id: str) -> list[str]:
        return [e.id for e in ordered_chain(member_id, self.config) if e.id in self.adapters]

    def _recommended(self, member_id: str) -> list[str]:
        """D115: the same engines in the recommended order, logins first. What "back to the recommended order" puts."""
        running = [e for e in ordered_chain(member_id, self.config) if e.id in self.adapters]
        return [e.id for e in order_logins_first(running)]

    def engaged(self, member_id: str) -> bool:
        """More than one engine to walk, or a pin, or a paid gateway the person put in the chain and switched on, which
        FreeDuet does not run (the turn goes through here then, so that the person is told why that gateway did not
        answer, in the words of ``all_limited``, and not left with the first engine's own message). Otherwise the
        member's turn is the one it always was."""
        return (
            len(self._runnable(member_id)) > 1
            or switching_for(member_id, self.config).pin is not None
            or bool(self._paid_left_out(member_id))
        )

    def overview(self, member_ids) -> list[dict]:
        """What the engines file gives each member, for ``GET /engines`` (docs/design/engines-dashboard.md 3.2).
        Read-only, and a closed vocabulary: engine ids, one word per reason (``engines.exclusion_code``) and the
        two switching values, and (D115) whether the person ordered the member's engines by hand (``own_order``). The person's own choices are not here: the server holds them and lays them over this.

        ``chain`` is the engines that will be tried, in order (logins first, every excluded engine removed, and only
        those this service has an adapter for). ``left_out`` is each engine the member's list names that will not run,
        with the word for why: ``not_set_up`` when it is allowed but this service has no way to run it."""
        members = []
        for member_id in member_ids:
            running = self._runnable(member_id)
            left_out = []
            for engine_id in chain_ids(member_id, self.config):
                if engine_id in running:
                    continue
                engine = self.config.engines.get(engine_id)
                left_out.append({"id": engine_id, "why": (exclusion_code(engine, self.config) if engine else None) or "not_set_up"})
            choice = switching_for(member_id, self.config)
            members.append({"id": member_id, "chain": running, "left_out": left_out, "mode": choice.mode, "pin": choice.pin, "own_order": member_id in self.config.own_order, "recommended_chain": self._recommended(member_id)})
        return members

    def _is_paid_left_out(self, engine: Engine | None) -> bool:
        """A paid gateway that is switched on and not locked and that does not meet the conditions for running
        (`engines.paid_gateway_gap`: the maintainer's switch, the person's `metered:` words, cost reporting), so that FreeDuet
        cannot hold it to the limits (docs/ENGINES_PLAN.md slice 12)."""
        return engine is not None and paid_gateway_refused(engine, self.config)

    def _paid_left_out(self, member_id: str) -> list[str]:
        """The paid gateways of the member's chain that are left out for that reason: the person is told so, in
        plain words, when nothing else can answer."""
        engines = (self.config.engines[engine_id] for engine_id in chain_ids(member_id, self.config))
        return [engine.id for engine in engines if self._is_paid_left_out(engine)]

    def _paid_gaps(self, engine_ids: list[str]) -> dict[str, str | None]:
        """Why each of these left-out gateways does not run (`engines.paid_gateway_gap`), by its name."""
        return {engine_id: paid_gateway_gap(self.config.engines[engine_id], self.config) for engine_id in engine_ids}

    def _notice_kind(self, key: str, kind: str) -> str:
        """A missing or refused key is not a Claude sign-in: the notice for an engine that runs on a key says so."""
        return notices.KEY if kind == AUTH and self.adapters[key].kind == COMPATIBLE_KIND else kind

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
        choice: Switching = engine_choices.apply(switching_for(member.id, self.config), run.engine_choices)
        order = self._runnable(member.id)
        if choice.pin is not None:
            pinned_engine = self.config.engines.get(choice.pin)
            # The person's switch and the refusal of a paid gateway hold for a pin exactly as for any chain: a pin never lifts them.
            left_out = pinned_engine is None or exclusion_reason(pinned_engine, self.config) is not None
            if choice.pin not in self.adapters or left_out:
                label = self.adapters[choice.pin].label if choice.pin in self.adapters else choice.pin
                if self._is_paid_left_out(pinned_engine):
                    gap = paid_gateway_gap(pinned_engine, self.config)
                    yield agui.run_error(notices.pinned_paid_off(lang, label, gap), ENGINE_LIMITED)
                else:
                    yield agui.run_error(notices.pinned_off(lang, label), ENGINE_LIMITED)
                return
            order = [choice.pin]
        await self._probe_signed_out(order)

        authorised, chosen = False, None
        extra: list[str] = []
        # The reply to the ask-first question is read whatever the mode is now: the question stands in the
        # conversation, and the person may have changed the mode on the Engines page since it was asked. Without a
        # question directly before it, `_answer` finds nothing, so a mode that was never ask-first never gets here.
        answer = self._answer(run.messages, lang)
        if answer is not None:
            what, said = answer
            if what == "wait":
                row = self.state.row(order[0]) if order else None
                label = self.adapters[order[0]].label if order else ""
                for event in _say(notices.waiting(lang, label, row.limited_until if row else None, self.state.now())):
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
        last_failed: tuple[str, str, datetime | None] | None = None  # the last engine that ran and failed (D119: not blocked[-1])

        while True:
            key = self._pick(order, tried, floors, blocked)
            if key is None:
                reason = last_failed or (blocked[-1] if blocked else None)
                if choice.pin is not None and blocked:
                    yield agui.run_error(notices.pinned(lang, *reason, now=self.state.now()), ENGINE_LIMITED)
                    return
                if reason is not None and reason[1] == TOOLS_AS_TEXT:
                    # D116: the last engine that could answer wrote its tool calls as text: a plain message, not "unavailable".
                    for event in _say(notices.tools_as_text_stop(lang, reason[0])):
                        yield event
                    yield agui.run_finished(run)
                    return
                until = min((b[2] for b in blocked if b[2] is not None), default=None)
                key_off = [label for label, kind, _ in blocked if kind == notices.KEY]
                held_off = [(label, kind) for label, kind, _ in blocked if isinstance(kind, notices.Held)]
                paid = self._paid_left_out(member.id)
                yield agui.run_error(
                    notices.all_limited(lang, until, paid, key_off, held_off, self._paid_gaps(paid), self.state.now()), ENGINE_LIMITED
                )
                return
            if stopped is None and blocked:
                stopped = blocked[0]  # the first engine of the chain was not available at the start
            pending: list[str] = []
            if stopped is not None:
                if switches >= MAX_SWITCHES:
                    yield agui.run_error(notices.loop_stop(lang, switches), ENGINE_LIMITED)
                    return
                if choice.mode == "ask-first" and not authorised:
                    asked = notices.asked(lang, *stopped, self.adapters[key].label, self.state.now())
                    if is_free_cloud(self.config.engines[key]):
                        asked = f"{asked} {notices.free_cloud(lang)}"
                    for event in _say(asked):
                        yield event
                    yield agui.run_finished(run)
                    return
                switches += 1
                pending.append(notices.switched(lang, *stopped, self.adapters[key].label, progress, self.state.now()))
                if is_free_cloud(self.config.engines[key]):
                    pending.append(notices.free_cloud(lang))  # D101: where the work goes is the person's choice, so say it
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
            stream = run_segment(
                sub, member, notes, attempt, announce=False, extra_notes=tuple(attempt_notes),
                light=is_light(engine),
            )
            held: dict | None = None
            saw_output, finished = False, False
            builder = _Produced()
            guard = _TextGuard(bool(tools)) if self.adapters[key].kind == COMPATIBLE_KIND else None
            pending_event = None
            try:
                limit = first_answer_limit(engine) or first_output_seconds()  # D108: only a local model has its own
                local = is_local_model(engine)
                said_reading = False
                loop = asyncio.get_running_loop()
                while True:
                    if pending_event is None:
                        pending_event = asyncio.ensure_future(_next(stream))
                        waited = 0.0
                    if saw_output:
                        await asyncio.wait({pending_event})
                    else:
                        # The limit counts from the last event the engine gave, as before. A local model that has said
                        # nothing for a while is told it is reading (once), so a long first read is not silence.
                        left = limit - waited
                        if local and not said_reading:
                            left = min(left, max(LOCAL_NOTICE_AFTER_SECONDS - waited, 0.0))
                        began = loop.time()
                        await asyncio.wait({pending_event}, timeout=left)
                        waited += loop.time() - began
                        if not pending_event.done() and local and not said_reading and waited < limit:
                            said_reading = True
                            for event in _say(notices.local_reading(lang, self.adapters[key].label)):
                                yield event
                            continue
                    if not pending_event.done():
                        # The hint is set BEFORE the segment is stopped, because stopping it settles the ticket.
                        attempt.hint = "first_output"
                        pending_event.cancel()
                        with contextlib.suppress(asyncio.CancelledError, Exception):
                            await pending_event
                        held = {"type": "RUN_ERROR", "message": ""}
                        break
                    event = pending_event.result()
                    pending_event = None
                    if event is _END:
                        break
                    kind = event["type"]
                    if kind == "RUN_ERROR":
                        held = event
                        if TOOK_TOO_LONG in str(event.get("message") or ""):
                            attempt.hint = "whole_turn"
                        break
                    if kind == "RUN_FINISHED" and guard is not None and guard.tools_as_text:
                        # D116: the turn ended with a tool call written as text. It is not the answer and is never run: this
                        # engine failed the turn for that reason, and the turn moves on.
                        attempt.tools_as_text = True
                        held = {"type": "RUN_ERROR", "message": ""}
                        break
                    if kind == "RUN_FINISHED" and guard is not None and guard.text_call_after_tools:
                        for out in _say(notices.tools_as_text_after_tools(lang, self.adapters[key].label)):
                            builder.see(out)
                            yield out
                    if kind == "RUN_FINISHED":
                        finished = True
                    saw_output = saw_output or kind.startswith(("TEXT_MESSAGE_CONTENT", "TOOL_CALL"))
                    for out in (guard.feed(event) if guard is not None else [event]):
                        builder.see(out)
                        yield out
                    if finished:
                        break
            finally:
                if pending_event is not None and not pending_event.done():
                    # The client went away while a notice was being yielded: the read of the stream must not outlive it.
                    pending_event.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await pending_event
                await stream.aclose()
                attempt.settle()
            if finished:
                return
            produced.extend(builder.messages())
            progress = max(progress, builder.progress, key=_RANK.get)
            failure = attempt.failure
            tried.add(key)
            if attempt.tools_as_text:
                self.state.note(key, TOOLS_AS_TEXT_NOTE)  # the Engines page can say so
            if held is None:  # the segment ended with no terminal event: leave it to the app's own guard
                return
            if attempt.hint == "whole_turn" or failure is None or failure.kind not in SWITCHABLE:
                yield held
                return
            row = self.state.row(key)
            until = (row.limited_until if row else None) or failure.retry_at
            stopped = (self.adapters[key].label, self._notice_kind(key, failure.kind), until)
            blocked.append(stopped)
            last_failed = stopped

    def _pick(self, order: list[str], tried: set[str], floors: dict[str, str],
              blocked: list[tuple[str, str, datetime | None]]) -> str | None:
        """The next engine that is available now, preferring ones that meet the quality floor. Looks without
        asking the breaker for a ticket; engines it finds unavailable are noted in `blocked` (once each)."""
        # First look at every engine without recording anything, then record the engines up to the one chosen (and any cap-held one):
        # a limited engine that stands AFTER the chosen one is not "stopped" (it would not have answered first), and
        # it is noted when the walk reaches it (D119).
        looked: list[tuple[str, tuple[str, object, datetime | None] | None]] = []
        for key in order:
            if key in tried:
                continue
            hold = self.state.hold_of(key)  # what the engine has cost: a limit the person set, or a ledger that cannot tell
            if hold is not None:
                # "Back at 00:00 UTC" is only true of a day's limit: a month's is weeks away, and the notices write a time, not a date.
                looked.append((key, (self.adapters[key].label, notices.Held(hold.kind, hold.cap_text), hold.until if hold.kind == DAILY else None)))
                continue
            row = self.state.row(key)
            if row is not None and not row.available:
                kind = AUTH if row.state == SIGNED_OUT else (row.last_failure_kind or USAGE_LIMIT)
                looked.append((key, (self.adapters[key].label, self._notice_kind(key, kind), row.limited_until)))
                continue
            looked.append((key, None))
        available = [key for key, why in looked if why is None]
        chosen: str | None = None
        if available:
            chosen = available[0]
            if floors:
                for key in available:
                    if all(tier_at_least(self.config.engines[key].tier, t) for t in floors.values()):
                        chosen = key
                        break
        recording = True  # up to the chosen engine; every engine when none is available
        for key, why in looked:
            # A cap the person set (Held) is told wherever the engine stands: the notices that say who was skipped for the
            # cap are pinned by the ledger tests, and that is a decision of the maintainer's, not part of D119.
            if why is not None and (recording or isinstance(why[1], notices.Held)):
                tried.add(key)
                blocked.append(why)
            if key == chosen:
                recording = False
        return chosen


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
        config = load_engines()
        engines = dict(adapters)
        # An `anthropic-compatible` entry of the file that is switched on and allowed to run (docs/ENGINES_PLAN.md
        # slice 5). A default install has none, so it gets exactly the adapters it was given.
        for key, adapter in adapters_from_config(config).items():
            if key in engines:
                log.warning("engine %s is defined twice: the engine the service already runs keeps the name", key)
                continue
            engines[key] = adapter
        return Router(state, engines, config)
    except Exception:  # noqa: BLE001
        log.warning("engine router not started: members run on Claude Code alone", exc_info=True)
        return None


__all__ = ["MAX_SWITCHES", "PROBE_EVERY_SECONDS", "Router", "router_from_environment"]
