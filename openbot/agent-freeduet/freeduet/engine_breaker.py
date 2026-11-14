"""The engine breaker: whether an engine may take a turn now, from what its failures said.

docs/ENGINES_PLAN.md section 5 ("Engine states") and slice 2. One :class:`EngineBreaker` per engine id, held by
a :class:`BreakerRegistry`. What goes in is the :class:`~freeduet.failure_classifier.Failure` the classifier
returned, or a success. What comes out is a yes or no for the next turn (:meth:`EngineBreaker.acquire`) and a
read-only :class:`Snapshot` for the future dashboard.

WIRED FOR RECORDING ONLY (slice 2, freeduet/engine_state.py). The service reports the real outcome of every turn
through a ticket and keeps the file; no run path asks :meth:`EngineBreaker.acquire` whether to run a turn, so
nothing is skipped, moved or delayed because of a verdict (that is slice 3). This module still reads no
setting of the service and instantiates no store: the path of the file comes from configuration in
engine_state.py (decision E4, ENGINES_PLAN section 9.3: limited-until in a file in agent-freeduet's own
volume, the person's choices on the server).

The states, named as the plan's table names them (``half_open`` and ``signed_out`` are "Half-open" and
"Signed out"):

=============  =======================  =======================================================================
state          a turn may                enters when (leaves when)
=============  =======================  =======================================================================
``ready``      yes                       start, or a success (a failure)
``degraded``   yes (the caller orders     a transient failure below the trip count (a success, or it trips)
               it after healthy ones
               and gives it a shorter
               timeout; the ticket says)
``open``       no                        a limit, or the trip count of transient failures (the time passes)
``half_open``  one probe, the rest no    the open time passed (probe success: ``ready``; probe failure: ``open``
                                         again; probe failure by sign-in: ``signed_out``)
``signed_out`` no                        an ``auth`` failure, or a probe that saw no sign-in
                                         (:meth:`EngineBreaker.signed_out`); a probe that sees one leaves it
                                         (:meth:`EngineBreaker.signed_in`); never a timer
=============  =======================  =======================================================================

What each failure kind does. Only a report that is current counts (see "Reports" below).

* ``rate_limit``, ``usage_limit``, ``credits``: ``open`` at once. The wait is the time the engine stated
  (``Failure.retry_at``) when it is still ahead, capped at ``max_declared_wait``; the plan: "a reset time stated
  by the engine always wins over a guessed wait: Open lasts until then, not shorter and not longer". With none
  stated the wait is a guess: ``guessed_wait``, doubling on each repeat (each ``open`` since the last success),
  capped at ``max_guessed_wait``.
* ``transient``: ``degraded``; the ``trip_after``-th in a row opens the breaker, with the same wait rule. A
  failed probe opens it again at once.
* ``auth``: ``signed_out`` at once. Waiting does not cure a sign-in, so there is no timer.
* ``rejected``: the plan says "not its health; the turn moves on". No state, no counter and no snapshot field
  changes. It only settles the ticket (and frees the probe slot of ``half_open``).
* ``unknown``: the PLAN IS SILENT. It is treated like ``rejected``: it never opens the breaker. A later slice
  may want to count many of them in a row as transient; that is a decision for the maintainer.

A success returns ``degraded`` and ``half_open`` to ``ready`` and zeroes the counters. A success in ``ready``
only zeroes them. ``open`` and ``signed_out`` ignore a success: it can only come from a turn that began before
the trip.

Reports. :meth:`EngineBreaker.acquire` hands out a :class:`Ticket`; the turn reports through it, once. Turns on
one engine run at the same time, and a report from a turn that began before the last trip says nothing about the
engine now: it is ignored (its method returns False). A ticket is also ignored when it was already reported,
when it came from another breaker, or when it is not a ticket. In ``half_open`` the single ticket handed out is
the probe; while it is out, :meth:`acquire` returns None. A probe nobody reports within ``probe_lease`` lapses:
the slot is free again and the late report, if any, is ignored.

Time. ``now`` is an injected callable returning a datetime (a naive one is taken as UTC); a clock that raises,
returns something else or reads year 9000 or later is replaced by the real one for that reading. The transition
from ``open`` to ``half_open`` is lazy: it happens when the breaker is next asked, with the clock it is asked
with. A clock that goes backwards never makes a wait longer than the wait that was set: the remaining time is
clamped to it each time the breaker looks.

Timing defaults, all "proposed, to be confirmed by the maintainer" except where this says the plan states it:

* ``guessed_wait`` 1 minute. THE PLAN STATES IT (ENGINES_PLAN section 5 and ARCHITECTURE 3.3 rule 5: "a minute
  when it named none"). Its doubling on repeats is proposed; the plan says only "growing on repeats up to a cap
  [to decide]".
* ``max_guessed_wait`` 30 minutes. Proposed.
* ``max_declared_wait`` 30 days. Proposed.
* ``trip_after`` 3 transient failures in a row. Proposed; the plan says "below the trip weight" and gives none.
* ``probe_lease`` 1 hour. Proposed, and the plan is silent: it exceeds the longest segment, 1800 s
  (``segment.SEGMENT_TIMEOUT_SECONDS``), so a probe that is only slow is not lapsed.

Storage. A store keeps one :class:`Record` per engine id, loaded once when a breaker is created and saved after
each call that changed it. A store that raises never reaches the caller: the state in memory carries on, and the
next change tries to save again. The default, :class:`NullStore`, keeps nothing. :class:`FileStore` writes one
small JSON file atomically (a temp file in the same directory, fsync, rename) and holds no secret and no text an
engine sent: only the engine id, the state, limited-until and counters.

Concurrency. agent-freeduet is one uvicorn process on one asyncio loop (Dockerfile), but its code also runs on
worker threads (``asyncio.to_thread``, Starlette's thread pool). So the guard is a ``threading.Lock`` per
breaker, held for the few lines of one call and never across an ``await`` (this module has none). An
``asyncio.Lock`` would not protect a thread, and would force every caller to be a coroutine. The file store has
one process-wide lock, so two stores on one path and several breakers cannot lose each other's records; two
processes are not coordinated (the service runs one).

Never raises on bad input and does bounded work whatever it is given: ids, tickets, failures, clocks, stores and
files are all untrusted here. Standard library only, plus the classifier's kinds.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from .failure_classifier import (
    AUTH,
    KINDS,
    LIMIT_KINDS,
    REJECTED,
    TRANSIENT,
    UNKNOWN,
    Failure,
)

log = logging.getLogger("freeduet.engine_breaker")

READY = "ready"
DEGRADED = "degraded"
OPEN = "open"
HALF_OPEN = "half_open"
SIGNED_OUT = "signed_out"
STATES = (READY, DEGRADED, OPEN, HALF_OPEN, SIGNED_OUT)

#: Counters stop here, so a long outage does no growing work.
COUNTER_CAP = 1_000_000
#: The registry keeps at most this many breakers (and the one for a bad id).
MAX_ENGINES = 64
MAX_ID_CHARS = 100
#: What a bad or surplus engine id is filed under.
INVALID_ID = "invalid"
#: A state file larger than this is not read.
MAX_FILE_BYTES = 1_048_576
FILE_VERSION = 1

_TOP = datetime(9000, 1, 1, tzinfo=UTC)
_MAX_EXPONENT = 20


# ── Timing ───────────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Timing:
    """The waits and counts. Every default is proposed, to be confirmed by the maintainer, except
    ``guessed_wait``, whose minute the plan states. A value that is not usable is replaced by its default
    or clamped into a sane range when a breaker is made."""

    guessed_wait: timedelta = timedelta(minutes=1)
    max_guessed_wait: timedelta = timedelta(minutes=30)
    max_declared_wait: timedelta = timedelta(days=30)
    trip_after: int = 3
    probe_lease: timedelta = timedelta(hours=1)

    def checked(self) -> Timing:
        guessed = _span(self.guessed_wait, timedelta(minutes=1), timedelta(seconds=1), timedelta(hours=1))
        return Timing(
            guessed_wait=guessed,
            max_guessed_wait=_span(self.max_guessed_wait, timedelta(minutes=30), guessed, timedelta(days=30)),
            max_declared_wait=_span(self.max_declared_wait, timedelta(days=30), guessed, timedelta(days=366)),
            trip_after=self.trip_after if _is_count(self.trip_after) and self.trip_after >= 1 else 3,
            probe_lease=_span(self.probe_lease, timedelta(hours=1), timedelta(seconds=1), timedelta(days=1)),
        )


def _is_count(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value <= COUNTER_CAP


def _span(value: Any, default: timedelta, low: timedelta, high: timedelta) -> timedelta:
    if not isinstance(value, timedelta):
        return default
    return min(max(value, low), high)


# ── Time ─────────────────────────────────────────────────────────────────────────────────────────


def _real_now() -> datetime:
    return datetime.now(UTC)


def _utc(moment: Any, reading: bool = True) -> datetime | None:
    """The moment as an aware UTC datetime, or None when it is not a usable datetime. A clock reading
    (``reading``) must also be before year 9000; a time an engine stated may be any date, and is capped later."""
    if not isinstance(moment, datetime):
        return None
    try:
        moment = moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)
    except (OverflowError, ValueError, OSError):
        return None
    return moment if moment < _TOP or not reading else None


def _plus(moment: datetime, span: timedelta) -> datetime:
    try:
        return moment + span
    except OverflowError:
        return _TOP


def _stated(value: Any, now: datetime) -> datetime | None:
    """A reset time an engine stated, when it is a datetime still ahead of ``now``."""
    moment = _utc(value, reading=False)
    return moment if moment is not None and moment > now else None


# ── What a store keeps ───────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Record:
    """One engine's saved state. No secret and no text from an engine: a state, a time, counters and the
    name of the last failure's kind."""

    state: str = READY
    limited_until: datetime | None = None
    consecutive_failures: int = 0
    opens: int = 0
    last_failure_kind: str | None = None


class Store(Protocol):
    """What a breaker needs from storage. Both calls may raise; the breaker survives it."""

    def load(self, engine_id: str) -> Record | None: ...

    def save(self, engine_id: str, record: Record) -> None: ...


class NullStore:
    """The default: remembers nothing, so a restart starts clean."""

    def load(self, engine_id: str) -> Record | None:
        return None

    def save(self, engine_id: str, record: Record) -> None:
        return None


# ── The file store ───────────────────────────────────────────────────────────────────────────────

MISSING = "file missing"
EMPTY = "file empty"
CORRUPT = "file corrupt"
UNREADABLE = "file unreadable"
DROPPED = "records dropped"
NOT_WRITTEN = "file not written"

_FILE_LOCK = threading.Lock()


def _record_to_json(record: Record) -> dict[str, Any]:
    until = None
    if record.limited_until is not None:
        moment = _utc(record.limited_until)
        until = moment.isoformat() if moment is not None else None
    return {
        "state": record.state,
        "limited_until": until,
        "consecutive_failures": record.consecutive_failures,
        "opens": record.opens,
        "last_failure_kind": record.last_failure_kind,
    }


def _counter(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= COUNTER_CAP else None


def _record_from_json(raw: Any) -> Record | None:
    """The record a file entry says, or None when any field is not what a record holds."""
    if not isinstance(raw, dict):
        return None
    state, until, last = raw.get("state"), raw.get("limited_until"), raw.get("last_failure_kind")
    failures, opens = _counter(raw.get("consecutive_failures")), _counter(raw.get("opens"))
    if state not in STATES or failures is None or opens is None:
        return None
    if last is not None and last not in KINDS:
        return None
    moment = None
    if until is not None:
        if not isinstance(until, str) or len(until) > 64:
            return None
        try:
            moment = _utc(datetime.fromisoformat(until))
        except ValueError:
            return None
        if moment is None:
            return None
    return Record(state, moment, failures, opens, last)


class FileStore:
    """One small JSON file for every engine, written atomically. Nothing creates one yet.

    Missing, empty, corrupt, unreadable and half-usable files all start clean for what could not be read;
    what happened is in :attr:`problems` (fixed phrases, never the file's content) and one log line.
    """

    def __init__(self, path: Any):
        try:
            text = os.fspath(path)
        except TypeError:
            text = None
        self._path: str | None = text if isinstance(text, str) and text else None
        self._problems: list[str] = [] if self._path else [NOT_WRITTEN]

    @property
    def problems(self) -> tuple[str, ...]:
        """Each distinct problem met so far, first met first."""
        with _FILE_LOCK:
            return tuple(self._problems)

    def load(self, engine_id: str) -> Record | None:
        with _FILE_LOCK:
            return self._read().get(engine_id)

    def save(self, engine_id: str, record: Record) -> None:
        with _FILE_LOCK:
            if self._path is None:
                return
            records = self._read()
            records[engine_id] = record
            try:
                self._write(dict(sorted(records.items())[:MAX_ENGINES]))
            except Exception:  # noqa: BLE001 - a full disk must not reach a turn
                self._note(NOT_WRITTEN)

    def _note(self, problem: str) -> None:
        if problem not in self._problems:
            self._problems.append(problem)
            (log.info if problem == MISSING else log.warning)("engine breaker state: %s", problem)

    def _read(self) -> dict[str, Record]:
        if self._path is None:
            return {}
        try:
            with open(self._path, "rb") as handle:
                data = handle.read(MAX_FILE_BYTES + 1)
        except FileNotFoundError:
            self._note(MISSING)
            return {}
        except OSError:
            self._note(UNREADABLE)
            return {}
        if not data.strip():
            self._note(EMPTY)
            return {}
        try:
            document = json.loads(data.decode("utf-8")) if len(data) <= MAX_FILE_BYTES else None
        except Exception:  # noqa: BLE001 - bad bytes, bad JSON, JSON nested too deep
            document = None
        engines = document.get("engines") if isinstance(document, dict) and document.get("version") == FILE_VERSION else None
        if not isinstance(engines, dict):
            self._note(CORRUPT)
            return {}
        records: dict[str, Record] = {}
        for engine_id, raw in list(engines.items())[:MAX_ENGINES]:
            record = _record_from_json(raw)
            if record is None or not isinstance(engine_id, str):
                self._note(DROPPED)
            else:
                records[engine_id] = record
        if len(engines) > MAX_ENGINES:
            self._note(DROPPED)
        return records

    def _write(self, records: dict[str, Record]) -> None:
        assert self._path is not None
        directory = os.path.dirname(os.path.abspath(self._path))
        os.makedirs(directory, exist_ok=True)
        document = {"version": FILE_VERSION, "engines": {key: _record_to_json(value) for key, value in records.items()}}
        payload = json.dumps(document, indent=2, sort_keys=True).encode("utf-8")
        descriptor, temporary = tempfile.mkstemp(dir=directory, prefix=".engine-breaker-", suffix=".tmp")
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._path)
        except BaseException:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise
        try:  # make the rename itself durable; not every platform can open a directory
            directory_fd = os.open(directory, os.O_RDONLY)
        except OSError:
            return
        try:
            os.fsync(directory_fd)
        except OSError:
            pass
        finally:
            os.close(directory_fd)


# ── What the caller sees ─────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Snapshot:
    """One engine as the dashboard reads it. ``limited_until`` is set only while ``open``;
    ``consecutive_failures`` and ``last_failure_kind`` count failures since the last success (a rejected or
    unknown failure is not one)."""

    engine_id: str
    state: str
    limited_until: datetime | None
    last_failure_kind: str | None
    consecutive_failures: int


class Ticket:
    """Permission for one turn, from :meth:`EngineBreaker.acquire`. Report once: :meth:`success` or
    :meth:`failure`. Both return True when the report counted, False when it was ignored.

    ``state`` is the breaker's state when the ticket was issued, so a caller can give a ``degraded`` engine a
    shorter timeout; ``probe`` is True for the single turn of ``half_open``.
    """

    __slots__ = ("_breaker", "_epoch", "_settled", "engine_id", "probe", "state")

    def __init__(self, breaker: EngineBreaker, state: str, epoch: int):
        self._breaker = breaker
        self._epoch = epoch
        self._settled = False
        self.engine_id = breaker.engine_id
        self.state = state
        self.probe = state == HALF_OPEN

    def success(self) -> bool:
        return self._breaker._report(self, None)

    def failure(self, failure: Failure) -> bool:
        return self._breaker._report(self, failure if failure is not None else Failure(UNKNOWN))

    def __repr__(self) -> str:
        return f"Ticket({self.engine_id!r}, {self.state}, probe={self.probe}, settled={self._settled})"


class EngineBreaker:
    def __init__(
        self,
        engine_id: str,
        *,
        now: Callable[[], datetime] | None = None,
        store: Store | None = None,
        timing: Timing | None = None,
    ):
        self.engine_id = engine_id if _good_id(engine_id) else INVALID_ID
        self._now = now if callable(now) else _real_now
        self._store: Store = store if store is not None else NullStore()
        self._timing = (timing if isinstance(timing, Timing) else Timing()).checked()
        self._lock = threading.Lock()
        self._state = READY
        self._until: datetime | None = None
        self._wait = timedelta(0)
        self._failures = 0
        self._opens = 0
        self._last: str | None = None
        self._epoch = 0
        self._probe_open = False
        self._probe_until = _TOP
        self._saved = Record()
        with self._lock:
            self._restore(self._clock())

    # -- public ---------------------------------------------------------------------------------

    def acquire(self) -> Ticket | None:
        """A ticket when the engine may take a turn now, else None (skip it)."""
        with self._lock:
            now = self._clock()
            self._advance(now)
            if self._state in (OPEN, SIGNED_OUT) or (self._state == HALF_OPEN and self._probe_open):
                return None
            if self._state == HALF_OPEN:
                self._probe_open = True
                self._probe_until = _plus(now, self._timing.probe_lease)
                self._epoch += 1
            ticket = Ticket(self, self._state, self._epoch)
            self._commit()
            return ticket

    def signed_in(self) -> bool:
        """Tell the breaker the engine is signed in again (its ``probe()`` saw it, or the person did it).
        Only ``signed_out`` listens: it returns to ``ready`` with the counters zeroed. True when it did."""
        with self._lock:
            if self._state != SIGNED_OUT:
                return False
            self._to_ready()
            self._commit()
            return True

    def signed_out(self) -> bool:
        """Tell the breaker the engine is not signed in (its ``probe()`` saw it). It is an ``auth`` failure that
        no turn reported: from any other state the breaker goes to ``signed_out`` the way :meth:`failure` with
        an ``auth`` failure does (a failure counted, ``last_failure_kind`` ``auth``, tickets out now go stale),
        and a ticket the engine was given before it is ignored when reported. True when it moved; False when
        it was already ``signed_out``, where nothing changes."""
        with self._lock:
            if self._state == SIGNED_OUT:
                return False
            self._take(Failure(AUTH), self._clock())
            self._commit()
            return True

    def snapshot(self) -> Snapshot:
        with self._lock:
            self._advance(self._clock())
            return Snapshot(
                self.engine_id,
                self._state,
                self._until,
                self._last,
                self._failures,
            )

    # -- reports --------------------------------------------------------------------------------

    def _report(self, ticket: Any, failure: Failure | None) -> bool:
        with self._lock:
            if not isinstance(ticket, Ticket) or ticket._breaker is not self or ticket._settled:
                return False
            ticket._settled = True
            now = self._clock()
            self._advance(now)
            if ticket._epoch != self._epoch:
                return False
            if ticket.probe:
                self._probe_open = False
            if failure is None:
                self._to_ready()
            else:
                self._take(failure, now)
            self._commit()
            return True

    def _take(self, failure: Any, now: datetime) -> None:
        kind = failure.kind if isinstance(failure, Failure) and failure.kind in KINDS else UNKNOWN
        if kind in (REJECTED, UNKNOWN):
            return
        self._failures = min(self._failures + 1, COUNTER_CAP)
        self._last = kind
        if kind == AUTH:
            self._state, self._until, self._probe_open = SIGNED_OUT, None, False
            self._epoch += 1
            return
        stated = _stated(failure.retry_at, now)
        if kind in LIMIT_KINDS:
            self._open(now, stated)
        elif self._state == HALF_OPEN or self._failures >= self._timing.trip_after:
            self._open(now, stated)
        else:
            self._state = DEGRADED

    def _open(self, now: datetime, stated: datetime | None) -> None:
        timing = self._timing
        if stated is not None:
            wait = min(stated - now, timing.max_declared_wait)
        else:
            wait = min(timing.guessed_wait * (2 ** min(self._opens, _MAX_EXPONENT)), timing.max_guessed_wait)
        self._opens = min(self._opens + 1, COUNTER_CAP)
        self._state, self._wait, self._until = OPEN, wait, _plus(now, wait)
        self._probe_open = False
        self._epoch += 1

    def _to_ready(self) -> None:
        self._state, self._until, self._wait = READY, None, timedelta(0)
        self._failures = self._opens = 0
        self._last = None
        self._probe_open = False

    # -- time and storage -----------------------------------------------------------------------

    def _clock(self) -> datetime:
        try:
            moment = _utc(self._now())
        except Exception:  # noqa: BLE001 - an injected clock is untrusted
            moment = None
        return moment if moment is not None else _real_now()

    def _advance(self, now: datetime) -> None:
        """The lazy transitions, with the clock the caller is asking with."""
        if self._state == OPEN:
            if self._until is not None:
                # A clock that went backwards must not stretch the wait past the one that was set.
                self._until = min(self._until, _plus(now, self._wait))
            if self._until is None or now >= self._until:
                self._state, self._until, self._probe_open = HALF_OPEN, None, False
        elif self._state == HALF_OPEN and self._probe_open:
            self._probe_until = min(self._probe_until, _plus(now, self._timing.probe_lease))
            if now >= self._probe_until:
                self._probe_open = False

    def _record(self) -> Record:
        return Record(self._state, self._until, self._failures, self._opens, self._last)

    def _commit(self) -> None:
        record = self._record()
        if record == self._saved:
            return
        try:
            self._store.save(self.engine_id, record)
        except Exception:  # noqa: BLE001 - storage must never fail a turn; the next change tries again
            log.warning("engine breaker state for %s not saved", self.engine_id, exc_info=True)
            return
        self._saved = record

    def _restore(self, now: datetime) -> None:
        try:
            record = self._store.load(self.engine_id)
        except Exception:  # noqa: BLE001
            log.warning("engine breaker state for %s not loaded", self.engine_id, exc_info=True)
            return
        if not isinstance(record, Record) or record.state not in STATES:
            return
        failures, opens = _counter(record.consecutive_failures), _counter(record.opens)
        if failures is None or opens is None:
            return
        self._failures, self._opens = failures, opens
        self._last = record.last_failure_kind if record.last_failure_kind in KINDS else None
        self._state = record.state
        if self._state == OPEN:
            until = _utc(record.limited_until)
            if until is None:
                self._state = HALF_OPEN
            else:  # a time already past is half-open at the first look, like any other wait that ran out
                self._until = min(until, _plus(now, self._timing.max_declared_wait))
                self._wait = max(self._until - now, timedelta(0))
        self._saved = record


def _good_id(engine_id: Any) -> bool:
    return (
        isinstance(engine_id, str)
        and 0 < len(engine_id) <= MAX_ID_CHARS
        and bool(engine_id.strip())
        and engine_id.isprintable()
    )


class BreakerRegistry:
    """One breaker per engine id. A bad id, or one past :data:`MAX_ENGINES` engines, is filed under
    ``"invalid"`` so the dashboard shows it."""

    def __init__(
        self,
        *,
        now: Callable[[], datetime] | None = None,
        store: Store | None = None,
        timing: Timing | None = None,
    ):
        self._now, self._store, self._timing = now, store, timing
        self._breakers: dict[str, EngineBreaker] = {}
        self._lock = threading.Lock()

    def get(self, engine_id: str) -> EngineBreaker:
        key = engine_id if _good_id(engine_id) else INVALID_ID
        with self._lock:
            breaker = self._breakers.get(key)
            if breaker is None:
                if len(self._breakers) >= MAX_ENGINES:
                    key = INVALID_ID
                    breaker = self._breakers.get(key)
                if breaker is None:
                    breaker = self._breakers[key] = EngineBreaker(
                        key, now=self._now, store=self._store, timing=self._timing
                    )
            return breaker

    def snapshots(self) -> tuple[Snapshot, ...]:
        """Every engine asked about so far, by id."""
        with self._lock:
            breakers = sorted(self._breakers.items())
        return tuple(breaker.snapshot() for _, breaker in breakers)
