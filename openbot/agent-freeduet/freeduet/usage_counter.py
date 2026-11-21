"""The token counter (D102): how many tokens each member used on each engine, by day, from what the engine itself reported.

WHAT IS RECORDED. One count per finished turn of a member, under the UTC day, the member's id and the engine's id: the turns,
the turns whose engine reported its use, and the tokens it reported (given, written, and the cached part of what it was given
when it said). Counts only: no message, no key, no path, no cost. A turn whose engine reported nothing is a turn and is not
tokens: it adds to ``turns`` and not to ``reported_turns``, so a person is told "not reported" and never shown a zero or a guess.
A turn that reported nothing and said nothing (it never started as far as anyone saw) is not a turn.

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
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from . import checkpoints
from .engine_adapter import Health, Usage

log = logging.getLogger("freeduet.usage")

FILE_VERSION = 1
FILE_NAME = "token-usage.json"
FILE_ENV = "FREEDUET_TOKEN_USAGE_FILE"
KEEP_DAYS = 31
WINDOW_DAYS = 7
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_COUNT = 10**15

FIELDS = ("turns", "reported_turns", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens")
# Tokens that only some turns reported: the sum is over the turns that did, and `reported_turns` says how many.
_TOKEN_FIELDS = FIELDS[2:]


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


class TokenCounter:
    def __init__(self, path: str | os.PathLike[str], *, now: Callable[[], datetime] | None = None):
        self._path = os.fspath(path)
        self._now = now
        self._lock = threading.RLock()
        self._days: dict[str, dict[str, dict[str, dict[str, int]]]] = {}
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
            if days is None:
                self._problem = True
                log.warning("token counter: %s is damaged or unreadable; nothing is counted until it is mended or deleted", os.path.basename(self._path))
                return
            self._days = days

    @property
    def problem(self) -> bool:
        return self._problem

    def record(self, member_id: str, engine_id: str, usage: Usage | None, *, at: datetime | None = None) -> None:
        """A turn of ``member_id`` on ``engine_id`` has ended. ``usage`` is what the engine reported, None when it reported
        nothing. Never raises: a turn is never failed by its own bookkeeping."""
        try:
            with self._lock:
                if self._problem:
                    return  # never write over a file that could not be read: the person may be mending it
                moment = self._clock() if at is None else at.astimezone(UTC) if at.tzinfo is not None else at.replace(tzinfo=UTC)
                counts = self._days.setdefault(moment.strftime("%Y-%m-%d"), {}).setdefault(member_id, {}).setdefault(engine_id, _empty())
                counts["turns"] += 1
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
        for day in [day for day in self._days if day < oldest]:
            del self._days[day]

    def _flush(self) -> None:
        directory = os.path.dirname(os.path.abspath(self._path))
        temporary = None
        try:
            os.makedirs(directory, exist_ok=True)
            payload = json.dumps({"version": FILE_VERSION, "days": self._days}, indent=1, sort_keys=True).encode("utf-8")
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

    def view(self) -> dict[str, Any]:
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
            rows = [{"member": member, "engine": engine, **cell} for (member, engine), cell in sorted(cells.items())]
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
                "engines": [{"engine": engine, **total} for engine, total in sorted(by_engine.items())],
                "problem": self._problem,
            }


_counter: TokenCounter | None = None
_counter_path: str | None = None


def counter() -> TokenCounter:
    """The service's counter, made on first use and again when the file's place changes (a test, or an environment edit)."""
    global _counter, _counter_path
    path = os.fspath(usage_file())
    if _counter is None or _counter_path != path:
        _counter, _counter_path = TokenCounter(path), path
    return _counter


def note_turn(member_id: str, engine_id: str, health: Health) -> None:
    """The segment is over: count what the engine reported. A turn that reported nothing and answered nothing is not counted.
    Never raises."""
    try:
        if health.usage is None and not health.answered:
            return
        counter().record(member_id, engine_id, health.usage)
    except Exception:  # noqa: BLE001
        log.warning("token counter: a turn was not counted", exc_info=True)
