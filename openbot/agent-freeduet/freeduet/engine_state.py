"""Engine state: what agent-freeduet keeps about its engines between turns.

docs/ENGINES_PLAN.md section 5 and slice 2; decision E4 (section 9.3, 14 November 2026: limited-until is kept in
a file in agent-freeduet's own volume, the person's choices on the server, which is a later slice).

RECORDING ONLY. When a member's turn ends, what happened is reported to the engine breaker
(engine_breaker.py): a success, or the :class:`~freeduet.failure_classifier.Failure` the engine said the turn
ended with. Nothing reads the breaker's verdict to run a turn: no turn is skipped, moved, delayed or given
another timeout because of it (that is slice 3), and a turn gets no log line, no launch and no stream event
from this module. ``tests/test_engine_state_neutral.py`` plays the recorded run-path scenarios with the breaker
forced into each state and compares them with the same goldens.

How a turn is recorded. :class:`RecordedEngine` wraps an engine and implements the same interface.
``begin`` asks the breaker for a ticket when the turn starts; ``finish`` reports through it when the engine's
``run_turn`` is over, even when it was cancelled (a segment that ends on a tool call stops its engine). What
is reported is the engine's own account of the turn, :class:`~freeduet.engine_adapter.Health`:

* a failure is set: ``ticket.failure(failure)``. A failure outweighs an answer: a limit that arrives after the
  first words is still a limit;
* no failure, and the engine answered (a message started, text came or a tool was called, or its result line
  was a success): ``ticket.success()``;
* neither (the engine could not start, or the segment stopped it before it spoke): the engine said nothing
  about its health. The ticket is settled with an ``unknown`` failure, which changes no state and frees the
  slot of a half-open probe. THE PLAN IS SILENT on a turn the segment's own timeout cuts short (it lists
  timeouts as a transient cause of ``degraded``); that timeout is the segment's, not the engine's, so it is
  recorded as nothing here, and the router's own timeouts are slice 3.

The breaker hands no ticket while an engine is ``open`` or ``signed_out`` (or ``half_open`` with its probe
out). A turn that still ran, because nothing skips it yet, reports nothing then, with one exception: an engine
that answers while the breaker believes it is ``signed_out`` is signed in, and the breaker is told so
(``signed_in()``). Without it a sign-in the person did in a terminal could not clear the state in a service
that never probes, and the file would say "signed out" for good.

Nothing here probes. :meth:`EngineState.probe` asks an engine's ``probe()`` and applies the answer (a probe that
sees no sign-in is ``signed_out()``, one that sees a sign-in is ``signed_in()``); the service does not call it
yet, so the snapshot says ``null`` for installed and signed in until something does. WHEN to probe (on the
dashboard's refresh, once an engine is signed out, on a timer) is slice 3's and slice 5's to decide, and a probe
is a process, so it is not hidden inside a GET.

What is kept, and where. One breaker per engine id (a :class:`~freeduet.engine_breaker.BreakerRegistry`). Its
store is a :class:`~freeduet.engine_breaker.FileStore` at :func:`state_file`: ``FREEDUET_ENGINE_STATE_FILE``, or
``engine-state.json`` in the data directory (``FREEDUET_DATA_DIR``, ``/data`` in the image: the named volume
``freeduet-data``, so no compose change). A bare file name in the variable is a file of the data directory,
never of the working folder: the service may be started from a checkout. The file holds, per engine id, the
state, limited-until, the counters and the kind of the last failure, and nothing an engine sent. It is read
when the state is made (the service's start-up), so the first turn reads nothing and logs nothing; a missing,
empty or corrupt file starts clean and is named in :attr:`StateSnapshot.problems`. The last probe's findings
are in memory only.

What is shown. :meth:`EngineState.snapshot` is the agent's side of the future server read-through
``GET /api/freeduet/engines`` (ARCHITECTURE 2.4: installed, signed in, available, limited until, last error),
served read-only by ``GET /engines`` in app.py behind the service's token check. It holds ids, labels, kinds,
states, a time, counters, the kind of the last failure, the version of an engine and fixed phrases: never an
account, never a message, never what an engine printed.

Recording never fails a turn: every call here is guarded, and a failure is one warning in the log.
"""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from . import checkpoints
from .engine_adapter import COULD_NOT_RUN, EngineAdapter, Gate, Health, Outcome, ProbeResult, Sink, TurnContext
from .engine_breaker import DEGRADED, HALF_OPEN, READY, SIGNED_OUT, BreakerRegistry, FileStore, Store, Ticket, Timing  # noqa: F401 - SIGNED_OUT is read through here (engine_router.py)
from .failure_classifier import UNKNOWN, Failure

log = logging.getLogger("freeduet.engine_state")

STATE_FILE_ENV = "FREEDUET_ENGINE_STATE_FILE"
STATE_FILE_NAME = "engine-state.json"
#: The states in which the next turn may run (``half_open``: as the one probe turn).
AVAILABLE_STATES = frozenset({READY, DEGRADED, HALF_OPEN})


def state_file() -> Path:
    """Where limited-until is kept: ``FREEDUET_ENGINE_STATE_FILE``, else ``engine-state.json`` in the data
    directory. A name without a folder is a file of the data directory, so a service started from a checkout
    never writes into it."""
    base = checkpoints.default_root()
    raw = (os.environ.get(STATE_FILE_ENV) or "").strip()
    if not raw:
        return base / STATE_FILE_NAME
    try:
        path = Path(raw).expanduser()
    except RuntimeError:  # `~name` of a user this machine does not know: a wrong setting is not a reason not to start
        return base / STATE_FILE_NAME
    return path if path.is_absolute() else base / path


# ── What the endpoint shows ──────────────────────────────────────────────────────────────────────


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment is not None else None


@dataclass(frozen=True)
class EngineRow:
    """One engine as ``GET /engines`` shows it. ``installed``, ``version``, ``signed_in`` and ``probed_at`` are
    None until a probe has run, and a probe that could not tell leaves what it could not tell as None."""

    id: str
    label: str
    kind: str
    state: str
    available: bool
    limited_until: datetime | None
    last_failure_kind: str | None
    consecutive_failures: int
    installed: bool | None
    version: str | None
    signed_in: bool | None
    probed_at: datetime | None
    probe_problem: str | None

    def as_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "kind": self.kind,
            "state": self.state,
            "available": self.available,
            "limited_until": _iso(self.limited_until),
            "last_failure_kind": self.last_failure_kind,
            "consecutive_failures": self.consecutive_failures,
            "installed": self.installed,
            "version": self.version,
            "signed_in": self.signed_in,
            "probed_at": _iso(self.probed_at),
            "probe_problem": self.probe_problem,
        }


@dataclass(frozen=True)
class StateSnapshot:
    """Every engine the service knows, and what went wrong with its state file (fixed phrases of the file
    store, ``file missing`` on a service that never had a limit included)."""

    engines: tuple[EngineRow, ...]
    problems: tuple[str, ...]

    def as_json(self) -> dict[str, Any]:
        return {"engines": [row.as_json() for row in self.engines], "problems": list(self.problems)}


@dataclass(frozen=True)
class Probed:
    result: ProbeResult
    at: datetime


# ── The state ────────────────────────────────────────────────────────────────────────────────────


class EngineState:
    """The service's engines: a breaker each, the file that keeps them, and the last probe of each."""

    def __init__(
        self,
        store: Store | None = None,
        *,
        now: Callable[[], datetime] | None = None,
        timing: Timing | None = None,
    ):
        self._store = store
        self._now = now if callable(now) else None
        self._registry = BreakerRegistry(now=now, store=store, timing=timing)
        self._engines: dict[str, EngineAdapter] = {}
        self._probed: dict[str, Probed] = {}
        self._lock = threading.Lock()

    # -- engines --------------------------------------------------------------------------------

    def register(self, engine: EngineAdapter) -> None:
        """Make the engine known, so the snapshot lists it before its first turn. Its breaker is made here,
        which is where its saved state is read."""
        with self._lock:
            self._engines[engine.key] = engine
        self._registry.get(engine.key)

    def recorded(self, engine: EngineAdapter) -> EngineAdapter:
        """The engine, wrapped so that every turn it runs is recorded."""
        if engine.key not in self._engines:
            self.register(engine)
        return RecordedEngine(engine, self)

    # -- recording ------------------------------------------------------------------------------

    def begin(self, key: str) -> Ticket | None:
        """A turn on this engine starts. The ticket the breaker hands, or None when it hands none (the engine
        is open or signed out, or its half-open probe is out): the turn runs all the same."""
        try:
            return self._registry.get(key).acquire()
        except Exception:  # noqa: BLE001 - recording must never change a turn
            log.warning("engine state: a turn was not recorded at its start", exc_info=True)
            return None

    def finish(self, key: str, ticket: Ticket | None, health: Health) -> None:
        """The engine's turn is over: report what its :class:`Health` says (see the module docstring)."""
        try:
            failure, answered = health.failure, health.answered
            if failure is not None:
                if ticket is not None:
                    ticket.failure(failure)
            elif answered:
                if ticket is not None:
                    ticket.success()
                else:
                    self._registry.get(key).signed_in()  # moves nothing unless the engine was signed out
            elif ticket is not None:
                ticket.failure(Failure(UNKNOWN))  # said nothing: settle the ticket, change nothing
        except Exception:  # noqa: BLE001
            log.warning("engine state: a turn was not recorded at its end", exc_info=True)

    # -- probing --------------------------------------------------------------------------------

    async def probe(self, engine: EngineAdapter) -> ProbeResult:
        """Run the engine's own ``probe()``, keep what it found for the snapshot and tell the breaker what it saw
        about the sign-in. Never raises."""
        try:
            result = await engine.probe()
        except Exception:  # noqa: BLE001 - a probe is asked in a failure path
            result = ProbeResult(problem=COULD_NOT_RUN)
        if not isinstance(result, ProbeResult):
            result = ProbeResult(problem=COULD_NOT_RUN)
        self.apply_probe(engine.key, result)
        return result

    def apply_probe(self, key: str, result: ProbeResult) -> None:
        """Keep a probe's findings, and move the breaker by its sign-in: ``False`` is ``signed_out``, ``True`` is
        ``signed_in`` (which only ``signed_out`` listens to), ``None`` (could not tell) moves nothing."""
        try:
            breaker = self._registry.get(key)
            with self._lock:
                self._probed[breaker.engine_id] = Probed(result, self._stamp())
            if result.signed_in is False:
                breaker.signed_out()
            elif result.signed_in is True:
                breaker.signed_in()
        except Exception:  # noqa: BLE001
            log.warning("engine state: a probe was not applied", exc_info=True)

    def _stamp(self) -> datetime:
        try:
            moment = self._now() if self._now is not None else None
        except Exception:  # noqa: BLE001 - an injected clock is untrusted
            moment = None
        if not isinstance(moment, datetime):
            return datetime.now(UTC)
        return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)

    # -- reading --------------------------------------------------------------------------------

    def row(self, key: str) -> EngineRow | None:
        """One engine as the snapshot shows it, or None when it is not known. Reads only; hands no ticket."""
        return next((row for row in self.snapshot().engines if row.id == key), None)

    def record_failure(self, key: str, ticket: Ticket | None, failure: Failure) -> None:
        """A failure the router saw and the engine did not say itself (a timeout): settle the ticket with it."""
        try:
            if ticket is not None:
                ticket.failure(failure)
        except Exception:  # noqa: BLE001
            log.warning("engine state: a failure was not recorded", exc_info=True)

    def snapshot(self) -> StateSnapshot:
        with self._lock:
            engines, probed = dict(self._engines), dict(self._probed)
        rows = []
        for shown in self._registry.snapshots():
            engine = engines.get(shown.engine_id)
            found = probed.get(shown.engine_id)
            result = found.result if found is not None else None
            installed = result.installed if result is not None else None
            rows.append(
                EngineRow(
                    id=shown.engine_id,
                    label=engine.label if engine is not None else shown.engine_id,
                    kind=engine.kind if engine is not None else "",
                    state=shown.state,
                    available=shown.state in AVAILABLE_STATES and installed is not False,
                    limited_until=shown.limited_until,
                    last_failure_kind=shown.last_failure_kind,
                    consecutive_failures=shown.consecutive_failures,
                    installed=installed,
                    version=result.version if result is not None else None,
                    signed_in=result.signed_in if result is not None else None,
                    probed_at=found.at if found is not None else None,
                    probe_problem=result.problem if result is not None else None,
                )
            )
        return StateSnapshot(tuple(rows), tuple(getattr(self._store, "problems", ()) or ()))


def from_environment(*engines: EngineAdapter) -> EngineState:
    """The service's state: its file at :func:`state_file`, and the engines it can run."""
    state = EngineState(FileStore(state_file()))
    for engine in engines:
        state.register(engine)
    return state


# ── The wrapper ──────────────────────────────────────────────────────────────────────────────────


class RecordedEngine(EngineAdapter):
    """An engine whose turns are recorded in an :class:`EngineState`. It adds nothing to what the engine does:
    the same environment, the same probe, the same turn, the same outcome and the same errors."""

    def __init__(self, engine: EngineAdapter, state: EngineState):
        self._engine, self._state = engine, state
        self.key, self.label, self.kind, self.capabilities = engine.key, engine.label, engine.kind, engine.capabilities

    def child_env(self, source: dict[str, str] | None = None) -> dict[str, str]:
        return self._engine.child_env(source)

    async def probe(self) -> ProbeResult:
        return await self._engine.probe()

    async def run_turn(self, ctx: TurnContext, sink: Sink, gate: Gate) -> Outcome:
        ticket = self._state.begin(self.key)
        try:
            return await self._engine.run_turn(ctx, sink, gate)
        finally:
            self._state.finish(self.key, ticket, ctx.diagnostics.health)
