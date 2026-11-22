"""The token counter (D102): how many tokens each member used on each engine, by day, from what the engine itself reported.

WHAT IS RECORDED. One count per finished turn of a member, under the UTC day, the member's id and the engine's id: the turns,
the turns whose engine reported its use, and the tokens it reported (given, written, and the cached part of what it was given
when it said). Counts only: no message, no key, no path, no cost. A turn whose engine reported nothing is a turn and is not
tokens: it adds to ``turns`` and not to ``reported_turns``, so a person is told "not reported" and never shown a zero or a guess.
A turn that reported nothing and said nothing (it never started as far as anyone saw) is not a turn.

TIME. Each attempt's wall-clock duration (``seconds``, whole seconds) is added too: measured here from the segment's start to its end,
so it is there even for an engine that reported no tokens. It is never turned into tokens.

SOURCE (D134). Each attempt also says where the run came from, read from the run's signed statement (``origin.run_claims``, the
same reading the cannot guard and the report guard use, and read only to label a count, never to trust a run): ``person`` (the
person's own message, from the browser or a paired phone), ``routine`` (a routine, a check-in or a responsibility), ``handoff``
(a hop between members) or ``other`` (a deployment, a memory run, or a statement that cannot be read). The counts of a source are
kept apart from the totals, under ``sources``: a file written before D134 has none, and its days are shown as ``unknown`` (the part
of a day's total that no source accounts for). Counts only, as before.

THE TIME RULE. Days are UTC, as in the spend ledger (ledger.py) and every notice. The service knows no time zone of the
person's; "today" and "last 7 days" are the UTC day and the seven UTC days ending with it.

WHERE. One JSON file (``token-usage.json``, ``FREEDUET_TOKEN_USAGE_FILE``, next to the engine state file), written whole and
atomically, the last ``KEEP_DAYS`` days. A file that cannot be read is treated as empty and said so in the answer
(``problem``); it is never mended by guessing, and it never fails a turn. It does not hold engines to any limit: that is
the ledger's job, for paid engines only. One service process writes it.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from . import checkpoints, engines, origin
from .engine_adapter import Health, Usage

log = logging.getLogger("freeduet.usage")

FILE_VERSION = 1
FILE_NAME = "token-usage.json"
FILE_ENV = "FREEDUET_TOKEN_USAGE_FILE"
KEEP_DAYS = 31
WINDOW_DAYS = 7
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_COUNT = 10**15

# `turns` counts engine attempts: a retry on the same engine, or a turn that moved to another engine, counts again.
# `seconds` is the wall-clock time of those attempts, measured by this service, so it exists even when no tokens were reported.
FIELDS = ("turns", "reported_turns", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "seconds")
# Tokens that only some turns reported: the sum is over the turns that did, and `reported_turns` says how many.
_TOKEN_FIELDS = FIELDS[2:6]

# D134: where a run came from. `unknown` is never stored: it is the part of a day's total that no stored source accounts for (a day
# counted before sources were kept, or a count whose source was lost), worked out when the view is made.
SOURCES = ("person", "routine", "handoff", "other")
UNKNOWN_SOURCE = "unknown"
_INITIATOR_SOURCE = {
    "person": "person",
    "remote": "person",
    "routine": "routine",
    "responsibility": "routine",
    "handoff": "handoff",
    "deployment": "other",
    "memory": "other",
}


def source_of(messages: list[dict] | None, assertion: str | None) -> str:
    """Where this run came from, as one of ``SOURCES``. A hop is a hop whatever else the statement says; otherwise the statement's
    initiator kind decides, and anything not named, or a statement that cannot be read, is ``other``. Never raises."""
    try:
        if origin.is_handoff_run(list(messages or []), assertion or ""):
            return "handoff"
        initiator = origin.run_claims(assertion or "").get("initiator")
        kind = initiator.get("kind") if isinstance(initiator, dict) else None
        return _INITIATOR_SOURCE.get(kind, "other") if isinstance(kind, str) else "other"
    except Exception:  # noqa: BLE001 - a label that cannot be worked out is "other", never a failed turn
        return "other"


# What an engine is, for "tokens saved" (see `engine_class`). Only the first two are saved: a login is a flat rate and a metered
# engine is paid for, so neither one saves anything.
SAVED_CLASSES = ("free_cloud", "local")
CLASSES = (*SAVED_CLASSES, "login", "metered", "other")

#: The clock that times an attempt. A test replaces it with a fake, so no assertion depends on the wall clock.
monotonic: Callable[[], float] = time.monotonic
MAX_SECONDS = 7 * 24 * 3600  # one attempt cannot have lasted longer than the segment's own timeout; this is only a sanity bound


def usage_file() -> Path:
    """``FREEDUET_TOKEN_USAGE_FILE``, else ``token-usage.json`` in the data directory. A name without a folder is a file of
    the data directory, never of the working folder."""
    raw = (os.environ.get(FILE_ENV) or "").strip()
    base = checkpoints.default_root()
    if not raw:
        return base / FILE_NAME
    try:
        path = Path(raw).expanduser()
    except RuntimeError:
        return base / FILE_NAME
    return path if path.is_absolute() else base / path


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= MAX_COUNT else None


def _empty() -> dict[str, int]:
    return dict.fromkeys(FIELDS, 0)


def _valid_days(raw: Any) -> dict[str, dict[str, dict[str, dict[str, int]]]] | None:
    """Day -> member -> engine -> counts, or None when anything in it is not what this module wrote."""
    if not isinstance(raw, dict):
        return None
    for day, members in raw.items():
        try:
            datetime.strptime(day, "%Y-%m-%d")
        except (TypeError, ValueError):
            return None
        if not isinstance(members, dict):
            return None
        for member, engines in members.items():
            if not isinstance(member, str) or not isinstance(engines, dict):
                return None
            for engine, counts in engines.items():
                if not isinstance(engine, str) or not isinstance(counts, dict) or set(counts) != set(FIELDS):
                    return None
                if any(_count(counts[name]) is None for name in FIELDS):
                    return None
    return raw


def _valid_sources(raw: Any) -> dict[str, dict[str, dict[str, dict[str, int]]]] | None:
    """Day -> source -> member -> counts, or None when anything in it is not what this module wrote. Missing is not damaged:
    a file written before D134 has no ``sources``, and the caller passes ``{}`` for it."""
    if not isinstance(raw, dict):
        return None
    for day, sources in raw.items():
        try:
            datetime.strptime(day, "%Y-%m-%d")
        except (TypeError, ValueError):
            return None
        if not isinstance(sources, dict):
            return None
        for source, members in sources.items():
            if source not in SOURCES or not isinstance(members, dict):
                return None
            for member, counts in members.items():
                if not isinstance(member, str) or not isinstance(counts, dict) or set(counts) != set(FIELDS):
                    return None
                if any(_count(counts[name]) is None for name in FIELDS):
                    return None
    return raw


def _whole_seconds(value: Any) -> int:
    """Whole seconds, at least 0; a value that is not a finite number is 0 (a time that cannot be trusted is not added)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if number != number or number < 0:  # NaN, negative
        return 0
    return min(int(round(number)), MAX_SECONDS)


def engine_class(engine_id: str) -> str:
    """What this engine is, read from the engines file now (the person may have changed it since the count was made):
    ``free_cloud`` (``engines.is_free_cloud``) and ``local`` (``engines.is_local_model``) are the ones whose tokens count as
    saved; ``login`` (a subscription), ``metered`` and ``other`` (not in the file) do not. One classification, the engines
    module's own: none is made here."""
    try:
        engine = engines.load_engines().engines.get(engine_id)
    except Exception:  # noqa: BLE001 - an engines file that cannot be read classifies nothing
        return "other"
    if engine is None:
        return "other"
    if engine.billing == "metered":
        return "metered"
    if engines.is_local_model(engine):
        return "local"
    if engines.is_free_cloud(engine):
        return "free_cloud"
    return "login" if engine.billing == "subscription" else "other"


class TokenCounter:
    def __init__(self, path: str | os.PathLike[str], *, now: Callable[[], datetime] | None = None):
        self._path = os.fspath(path)
        self._now = now
        self._lock = threading.RLock()
        self._days: dict[str, dict[str, dict[str, dict[str, int]]]] = {}
        self._sources: dict[str, dict[str, dict[str, dict[str, int]]]] = {}
        self._problem = False
        self._load()

    def _clock(self) -> datetime:
        try:
            moment = self._now() if self._now is not None else None
        except Exception:  # noqa: BLE001 - an injected clock is untrusted
            moment = None
        if not isinstance(moment, datetime):
            return datetime.now(UTC)
        return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)

    def _load(self) -> None:
        with self._lock:
            self._problem = False
            self._days = {}
            self._sources = {}
            try:
                with open(self._path, "rb") as handle:
                    data = handle.read(MAX_FILE_BYTES + 1)
            except FileNotFoundError:
                return
            except OSError:
                self._problem = True
                return
            try:
                document = json.loads(data) if len(data) <= MAX_FILE_BYTES else None
            except ValueError:
                document = None
            days = _valid_days(document.get("days")) if isinstance(document, dict) and document.get("version") == FILE_VERSION else None
            # D134: `sources` is new and optional. Absent (an older file) is empty; present but not what this module wrote is damaged.
            sources = _valid_sources(document.get("sources", {})) if days is not None else None
            if days is None or sources is None:
                self._problem = True
                log.warning("token counter: %s is damaged or unreadable; nothing is counted until it is mended or deleted", os.path.basename(self._path))
                return
            self._days = days
            self._sources = sources

    @property
    def problem(self) -> bool:
        return self._problem

    def record(
        self, member_id: str, engine_id: str, usage: Usage | None, *, at: datetime | None = None, seconds: float = 0,
        source: str = "other",
    ) -> None:
        """An attempt of ``member_id`` on ``engine_id`` has ended after ``seconds`` of wall-clock time. ``usage`` is what the engine
        reported, None when it reported nothing. Never raises: a turn is never failed by its own bookkeeping."""
        try:
            with self._lock:
                if self._problem:
                    return  # never write over a file that could not be read: the person may be mending it
                moment = self._clock() if at is None else at.astimezone(UTC) if at.tzinfo is not None else at.replace(tzinfo=UTC)
                day = moment.strftime("%Y-%m-%d")
                source = source if source in SOURCES else "other"
                for counts in (
                    self._days.setdefault(day, {}).setdefault(member_id, {}).setdefault(engine_id, _empty()),
                    self._sources.setdefault(day, {}).setdefault(source, {}).setdefault(member_id, _empty()),
                ):
                    counts["turns"] += 1
                    counts["seconds"] += _whole_seconds(seconds)
                    given = _count(usage.input_tokens) if usage is not None else None
                    wrote = _count(usage.output_tokens) if usage is not None else None
                    if given is not None or wrote is not None:
                        counts["reported_turns"] += 1
                        counts["input_tokens"] += given or 0
                        counts["output_tokens"] += wrote or 0
                        counts["cache_read_tokens"] += _count(usage.cache_read_tokens) or 0
                        counts["cache_write_tokens"] += _count(usage.cache_write_tokens) or 0
                self._prune(moment)
                self._flush()
        except Exception:  # noqa: BLE001
            log.warning("token counter: a turn could not be counted", exc_info=True)

    def _prune(self, moment: datetime) -> None:
        oldest = (moment - timedelta(days=KEEP_DAYS - 1)).strftime("%Y-%m-%d")
        for store in (self._days, self._sources):
            for day in [day for day in store if day < oldest]:
                del store[day]

    def _flush(self) -> None:
        directory = os.path.dirname(os.path.abspath(self._path))
        temporary = None
        try:
            os.makedirs(directory, exist_ok=True)
            payload = json.dumps({"version": FILE_VERSION, "days": self._days, "sources": self._sources}, indent=1, sort_keys=True).encode("utf-8")
            descriptor, temporary = tempfile.mkstemp(dir=directory, prefix=".token-usage-", suffix=".tmp")
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._path)
            temporary = None
        except Exception:  # noqa: BLE001 - a full disk must not reach a turn
            log.warning("token counter: %s could not be written", os.path.basename(self._path), exc_info=True)
            if temporary is not None:
                try:
                    os.unlink(temporary)
                except OSError:
                    pass

    def view(self, classify: Callable[[str], str] | None = None) -> dict[str, Any]:
        """Today and the last seven UTC days, per member and engine, for ``GET /engines/usage``. Numbers only. The file is read
        again first, so a file mended or deleted by hand shows at once."""
        with self._lock:
            self._load()
            today = self._clock().strftime("%Y-%m-%d")
            first = (self._clock() - timedelta(days=WINDOW_DAYS - 1)).strftime("%Y-%m-%d")
            cells: dict[tuple[str, str], dict[str, dict[str, int]]] = {}
            for day, members in self._days.items():
                if not first <= day <= today:
                    continue
                for member, engines in members.items():
                    for engine, counts in engines.items():
                        cell = cells.setdefault((member, engine), {"today": _empty(), "week": _empty()})
                        for name in FIELDS:
                            cell["week"][name] += counts[name]
                            if day == today:
                                cell["today"][name] += counts[name]
            classify = classify if classify is not None else engine_class
            kinds: dict[str, str] = {}
            for _member, engine in cells:
                if engine not in kinds:
                    kind = classify(engine)
                    kinds[engine] = kind if kind in CLASSES else "other"
            rows = [{"member": member, "engine": engine, "class": kinds[engine], **cell} for (member, engine), cell in sorted(cells.items())]
            by_engine: dict[str, dict[str, dict[str, int]]] = {}
            for row in rows:
                total = by_engine.setdefault(row["engine"], {"today": _empty(), "week": _empty()})
                for period in ("today", "week"):
                    for name in FIELDS:
                        total[period][name] += row[period][name]
            return {
                "timezone": "UTC",
                "today": today,
                "window_days": WINDOW_DAYS,
                "rows": rows,
                "engines": [{"engine": engine, "class": kinds[engine], **total} for engine, total in sorted(by_engine.items())],
                "daily": self._daily(),
                "problem": self._problem,
            }

    def _daily(self) -> list[dict[str, Any]]:
        """D134: the seven UTC days ending today, oldest first, each with its counts per source and per member. Per member comes
        from the totals; per source from ``sources``, plus ``unknown``: what a day's total holds that no source accounts for
        (a day counted before sources were kept). Always seven entries, so a chart never has a gap to guess at."""
        end = self._clock()
        daily: list[dict[str, Any]] = []
        for back in range(WINDOW_DAYS - 1, -1, -1):
            day = (end - timedelta(days=back)).strftime("%Y-%m-%d")
            members: dict[str, dict[str, int]] = {}
            total = _empty()
            for member, per_engine in self._days.get(day, {}).items():
                counts = members.setdefault(member, _empty())
                for engine_counts in per_engine.values():
                    for name in FIELDS:
                        counts[name] += engine_counts[name]
                        total[name] += engine_counts[name]
            sources: dict[str, dict[str, int]] = {}
            attributed = _empty()
            for source, per_member in self._sources.get(day, {}).items():
                counts = sources.setdefault(source, _empty())
                for member_counts in per_member.values():
                    for name in FIELDS:
                        counts[name] += member_counts[name]
                        attributed[name] += member_counts[name]
            remainder = {name: max(0, total[name] - attributed[name]) for name in FIELDS}
            if any(remainder.values()):
                sources[UNKNOWN_SOURCE] = remainder
            daily.append({"day": day, "sources": sources, "members": members})
        return daily


_counter: TokenCounter | None = None
_counter_path: str | None = None


def counter() -> TokenCounter:
    """The service's counter, made on first use and again when the file's place changes (a test, or an environment edit)."""
    global _counter, _counter_path
    path = os.fspath(usage_file())
    if _counter is None or _counter_path != path:
        _counter, _counter_path = TokenCounter(path), path
    return _counter


def note_turn(member_id: str, engine_id: str, health: Health, seconds: float = 0, source: str = "other") -> None:
    """The segment is over after ``seconds``: count what the engine reported, and the time. A turn that reported nothing and answered nothing is not counted.
    Never raises."""
    try:
        if health.usage is None and not health.answered:
            return
        counter().record(member_id, engine_id, health.usage, seconds=seconds, source=source)
    except Exception:  # noqa: BLE001
        log.warning("token counter: a turn was not counted", exc_info=True)
