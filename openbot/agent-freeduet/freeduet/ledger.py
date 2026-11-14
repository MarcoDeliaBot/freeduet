"""The spend ledger: what the engines that cost money have cost, kept in a file, and the verdict on their limits.

docs/ENGINES_PLAN.md slice 12 (its first part: the ledger and the limits, not the card), decisions E3 and E5 (9.3),
docs/PROVIDERS.md rule 4: an engine that costs money is never first, never on by default, and capped. This module is
the cap's memory and its verdict. It knows an engine id, a number and a time, and nothing of engines.yaml, the router
or a stream, so a test can drive it with a made-up clock.

WHAT IS RECORDED. One record per turn of an engine the ledger holds to the limits (``engine_state.attach_ledger``), and
only what the engine itself reported: tokens given and written, and a cost only when the engine stated one
(:class:`~freeduet.engine_adapter.Usage`). Never a price worked out here, never a guess. A turn whose cost was not
reported is recorded with its tokens and is counted as "cost unknown": from then on the limits cannot be checked, and
the engines are held (below). A turn that reported nothing and said nothing is not a turn: nothing was seen to start.
Free engines and logins are never recorded here, whatever they report.

THE TIME RULE. Days and months are UTC. The service knows no time zone of the person's, and every notice already says
"UTC". A day runs from 00:00 UTC to the next 00:00 UTC; a month from the first of the month, 00:00 UTC, to the next first.
Totals are kept in the currency of the person's limits (``metered.currency``); money of another currency is never added
to them and never converted (there is no rate to take), so such a cost is "unknown".

THE VERDICT (:meth:`Ledger.hold`). The limits are for all engines held together: ``daily_cap`` and ``monthly_cap`` bound
what they cost in total. An engine is held when, in this order: the ledger file cannot be trusted; a write failed; the
totals are in another currency than the limits; a turn this month has an unknown cost (the sum is only a lower bound);
the month's total has reached ``monthly_cap``; today's has reached ``daily_cap``. At or over a cap is reached. Each
verdict says when it lifts by itself (the next UTC midnight, the next first of the month), or None when only the person
can lift it. The check is made before a turn starts. A turn that crosses a cap while it runs is allowed to finish, so a
cap can be passed by what the turns already running cost, and no more: the next turn is held.

NEVER "ZERO SPENT". A missing file is a ledger that has recorded nothing. Anything else that is not a file this module
wrote (empty, damaged, unreadable, too big, an unknown version, a number that is not a number) is not a total of zero:
it holds every engine until the person mends the file or deletes it, which is how a ledger is reset. The file is read
again on each check while it is held, so mending or deleting it needs no restart.

WHAT IS KEPT, AND WHERE. One JSON file (``engine-ledger.json``, next to the engine state file: ``engine_state.ledger_file``),
written whole and atomically (a temporary file in the same folder, flushed, then renamed over it), so a crash leaves the
old file or the new one. It holds the last ``KEEP_TURNS`` turns (when, engine, tokens, cost or null), the totals per UTC
day for the last ``KEEP_DAYS`` days and the totals per UTC month for the last ``KEEP_MONTHS`` months, per engine. Money is
written as text and added as exact decimals, so ten turns of 0.10 are 1.00 and not 0.9999999999999999. The file holds no
message, no key, no path and no member. One service process writes it; two would overwrite each other.
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
from decimal import Decimal, InvalidOperation
from typing import Any

from .engine_adapter import Usage

log = logging.getLogger("freeduet.ledger")

FILE_VERSION = 1
#: Retention, in the open. Turns: the most recent. Days and months: by age against the clock, and never fewer than the
#: current day and month. A metered engine's turn costs money, so a handful of engines and a few hundred turns make a file
#: of tens of kilobytes; `MAX_FILE_BYTES` is far above what this module writes.
KEEP_TURNS = 200
KEEP_DAYS = 62
KEEP_MONTHS = 14
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_COUNT = 10**15
MAX_MONEY = Decimal(10**12)

# The kinds of hold.
DAILY, MONTHLY, UNKNOWN = "daily", "monthly", "unknown"
# Why the ledger cannot tell (an UNKNOWN hold): fixed phrases, never what a file held.
TURN_COST = "turn_cost"  # a turn's cost was not reported
FILE = "file"  # the ledger file is damaged or unreadable
CURRENCY = "currency"  # the totals are in another currency than the limits
UNSAVED = "unsaved"  # what the last turns cost could not be written down

_TOTALS_KEYS = frozenset({"turns", "input_tokens", "output_tokens", "cost", "cost_unknown_turns"})
_TURN_KEYS = frozenset({"at", "engine", "input_tokens", "output_tokens", "cost"})
_ZERO = Decimal(0)


# ── Numbers ──────────────────────────────────────────────────────────────────────────────────────


def _money(value: Any) -> Decimal | None:
    """A cost as an exact decimal, or None when it is not a finite number of 0 or more (and not absurdly large)."""
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        return None
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation:
        return None
    return number if number.is_finite() and _ZERO <= number <= MAX_MONEY else None


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= MAX_COUNT else None


def _currency(value: Any) -> str:
    return str(value or "").strip().upper()


def _text(amount: Decimal) -> str:
    """An amount as a person writes it: two decimals, more only when the amount needs them."""
    cents = amount.quantize(Decimal("0.01"))
    return f"{cents:f}" if cents == amount else f"{amount.normalize():f}"


def _number(amount: Decimal) -> float:
    return float(amount.quantize(Decimal("0.000001")))


# ── What is added up ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Totals:
    """What one engine's turns added up to in a day or a month. `cost` is the sum of the costs the engine reported;
    `cost_unknown_turns` counts the turns whose cost it did not, so a total with any is a lower bound, never exact."""

    turns: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost: Decimal = _ZERO
    cost_unknown_turns: int = 0

    def plus(self, other: Totals) -> Totals:
        return Totals(
            self.turns + other.turns,
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
            self.cost + other.cost,
            self.cost_unknown_turns + other.cost_unknown_turns,
        )

    def as_json(self) -> dict[str, Any]:
        """Numbers, for ``GET /engines``."""
        return {
            "turns": self.turns,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost": _number(self.cost),
            "cost_unknown_turns": self.cost_unknown_turns,
        }

    def to_file(self) -> dict[str, Any]:
        return {
            "turns": self.turns,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost": str(self.cost),
            "cost_unknown_turns": self.cost_unknown_turns,
        }


def _totals_from_file(raw: Any) -> Totals | None:
    if not isinstance(raw, dict) or set(raw) != _TOTALS_KEYS:
        return None
    turns, given, wrote, unknown = (_count(raw[name]) for name in ("turns", "input_tokens", "output_tokens", "cost_unknown_turns"))
    cost = _money(raw["cost"]) if isinstance(raw["cost"], str) else None
    if None in (turns, given, wrote, unknown, cost):
        return None
    return Totals(turns, given, wrote, cost, unknown)


Buckets = dict[str, dict[str, Totals]]


def _buckets_from_file(raw: Any, key_length: int) -> Buckets | None:
    """Period (``YYYY-MM-DD`` or ``YYYY-MM``) -> engine -> totals; None when anything in it is not what was written."""
    if not isinstance(raw, dict):
        return None
    found: Buckets = {}
    for period, engines in raw.items():
        if not isinstance(period, str) or len(period) != key_length or not isinstance(engines, dict):
            return None
        try:
            datetime.strptime(period, "%Y-%m-%d" if key_length == 10 else "%Y-%m")
        except ValueError:
            return None
        found[period] = {}
        for engine_id, totals in engines.items():
            parsed = _totals_from_file(totals)
            if not isinstance(engine_id, str) or parsed is None:
                return None
            found[period][engine_id] = parsed
    return found


def _turns_from_file(raw: Any) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list) or len(raw) > KEEP_TURNS:
        return None
    for turn in raw:
        if not isinstance(turn, dict) or set(turn) != _TURN_KEYS or not isinstance(turn["engine"], str) or not isinstance(turn["at"], str):
            return None
        if turn["cost"] is not None and _money(turn["cost"]) is None:
            return None
        if any(turn[name] is not None and _count(turn[name]) is None for name in ("input_tokens", "output_tokens")):
            return None
    return raw


# ── Limits and verdicts ──────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Limits:
    """The person's limits (``metered:`` in engines.yaml): one currency, a daily and a monthly cap, for all held engines together."""

    currency: str
    daily: Decimal
    monthly: Decimal

    @classmethod
    def of(cls, metered: Any) -> Limits:
        """From a ``Metered`` block (anything with ``currency``, ``daily_cap`` and ``monthly_cap``)."""
        return cls(_currency(metered.currency), Decimal(str(metered.daily_cap)), Decimal(str(metered.monthly_cap)))


def _clock_text(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


@dataclass(frozen=True)
class Hold:
    """Why an engine is not run now, and when that ends by itself. English, for ``GET /engines`` and the log; what the
    person is told in the conversation is engine_notices.py's, from the same facts."""

    kind: str  # DAILY, MONTHLY or UNKNOWN
    until: datetime | None  # when it ends by itself; None: only the person can end it
    cap: Decimal | None = None  # the limit that was reached (DAILY, MONTHLY)
    currency: str = ""
    why: str | None = None  # UNKNOWN: TURN_COST, FILE, CURRENCY or UNSAVED
    file: str = ""  # the ledger file's name (not its folder), for the sentences that tell how to mend it

    @property
    def cap_text(self) -> str:
        return f"{_text(self.cap)} {self.currency}" if self.cap is not None else ""

    def sentence(self, label: str) -> str:
        back = f" It runs again from {_clock_text(self.until)}." if self.until is not None else ""
        reset = (
            f"delete {self.file} (that forgets what was spent: look at the provider's own usage page first) "
            "and restart FreeDuet"
        )
        if self.kind == DAILY:
            return f"{label} reached the daily limit you set ({self.cap_text}).{back}"
        if self.kind == MONTHLY:
            return f"{label} reached the monthly limit you set ({self.cap_text}).{back}"
        if self.why == FILE:
            return (
                f"{label} is held because {self.file}, where FreeDuet counts what paid engines cost, is damaged or cannot "
                "be read. Mend it, or delete it (that forgets what was spent: look at the provider's own usage page first); "
                "the next turn then runs."
            )
        if self.why == CURRENCY:
            return (
                f"{label} is held because {self.file} counts in another currency than your limits, and FreeDuet does not "
                f"convert money. Set `currency` back, or {reset}."
            )
        if self.why == UNSAVED:
            return f"{label} is held because FreeDuet could not write down what the last turns cost in {self.file}. It runs again once that file can be written."
        return (
            f"{label} did not report what a turn cost, so FreeDuet cannot tell whether the limits you set hold.{back} "
            f"To start again sooner, {reset}."
        )


# ── The ledger ───────────────────────────────────────────────────────────────────────────────────


class Ledger:
    def __init__(self, path: str | os.PathLike[str], *, now: Callable[[], datetime] | None = None):
        """The file at ``path``, read now (the service's start-up), so no turn reads it. ``now`` is the clock, UTC."""
        self._path = os.fspath(path)
        self._name = os.path.basename(self._path)
        self._now = now
        self._lock = threading.RLock()
        self._turns: list[dict[str, Any]] = []
        self._days: Buckets = {}
        self._months: Buckets = {}
        self._currency: str | None = None  # what the sums are in, once anything was recorded
        self._problem: bool = False  # the file is not one this module wrote
        self._unsaved = False  # a write failed: what is in memory is not on disk
        self._load()

    # -- the clock ------------------------------------------------------------------------------

    def _clock(self) -> datetime:
        try:
            moment = self._now() if self._now is not None else None
        except Exception:  # noqa: BLE001 - an injected clock is untrusted
            moment = None
        if not isinstance(moment, datetime):
            return datetime.now(UTC)
        return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)

    # -- the file -------------------------------------------------------------------------------

    @property
    def problems(self) -> tuple[str, ...]:
        """Fixed phrases for ``GET /engines``: what is wrong with the file, if anything. Never what it held."""
        with self._lock:
            found = []
            if self._problem:
                found.append("ledger file damaged or unreadable: paid engines are held")
            if self._unsaved:
                found.append("ledger file not written: paid engines are held")
            return tuple(found)

    def _load(self) -> None:
        with self._lock:
            already = self._problem  # a file that is still bad is said once, not on every check
            self._problem = False
            try:
                with open(self._path, "rb") as handle:
                    data = handle.read(MAX_FILE_BYTES + 1)
            except FileNotFoundError:
                self._reset_memory()  # nothing was ever recorded here
                return
            except OSError:
                self._fail("unreadable", already)
                return
            parsed = _parse_document(data)
            if parsed is None:
                self._fail("damaged", already)
                return
            self._turns, self._days, self._months, self._currency = parsed

    def _fail(self, how: str, already: bool) -> None:
        if not already:
            log.warning("engine ledger: %s is %s; paid engines are held until it is mended or deleted", self._name, how)
        self._problem = True
        self._reset_memory()

    def _reset_memory(self) -> None:
        self._turns, self._days, self._months, self._currency = [], {}, {}, None

    def _flush(self) -> None:
        """Write the whole ledger, atomically. Sets ``_unsaved`` on failure and clears it on success."""
        if self._problem:
            return  # never write over a file that could not be read: the person may be mending it
        document = {
            "version": FILE_VERSION,
            "currency": self._currency,
            "turns": self._turns,
            "days": {day: {engine: totals.to_file() for engine, totals in engines.items()} for day, engines in sorted(self._days.items())},
            "months": {month: {engine: totals.to_file() for engine, totals in engines.items()} for month, engines in sorted(self._months.items())},
        }
        directory = os.path.dirname(os.path.abspath(self._path))
        temporary = None
        try:
            os.makedirs(directory, exist_ok=True)
            payload = json.dumps(document, indent=1, sort_keys=True).encode("utf-8")
            descriptor, temporary = tempfile.mkstemp(dir=directory, prefix=".engine-ledger-", suffix=".tmp")
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._path)
            temporary = None
        except Exception:  # noqa: BLE001 - a full disk must not reach a turn; it holds the engines instead
            if not self._unsaved:
                log.warning("engine ledger: %s could not be written; paid engines are held until it can be", self._name, exc_info=True)
            self._unsaved = True
            if temporary is not None:
                try:
                    os.unlink(temporary)
                except OSError:
                    pass
            return
        self._unsaved = False
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

    # -- recording ------------------------------------------------------------------------------

    def record(self, engine_id: str, usage: Usage | None, currency: str, *, at: datetime | None = None) -> None:
        """A turn of an engine the ledger holds to the limits has ended. ``usage`` is what the engine reported, None when
        it answered and reported nothing; ``currency`` is the one the limits are in. Never raises: a turn is never failed by
        its own bookkeeping, and what cannot be written down holds the engines instead."""
        try:
            with self._lock:
                if self._problem:
                    log.warning("engine ledger: a turn of %s was not counted, because %s cannot be read", engine_id, self._name)
                    return
                self._record(engine_id, usage, _currency(currency), at)
        except Exception:  # noqa: BLE001
            log.warning("engine ledger: a turn could not be counted", exc_info=True)
            self._unsaved = True

    def _record(self, engine_id: str, usage: Usage | None, currency: str, at: datetime | None) -> None:
        moment = self._clock() if at is None else at.astimezone(UTC) if at.tzinfo is not None else at.replace(tzinfo=UTC)
        given = _count(usage.input_tokens) if usage is not None else None
        wrote = _count(usage.output_tokens) if usage is not None else None
        cost = _money(usage.cost) if usage is not None and usage.cost is not None else None
        if cost is not None and _currency(usage.currency) != currency:
            cost = None  # another currency: never added to the totals, never converted
        if self._currency is None:
            self._currency = currency
        elif self._currency != currency:
            cost = None  # the limits' currency changed under the totals: hold() says so
        self._turns.append(
            {
                "at": moment.isoformat(),
                "engine": engine_id,
                "input_tokens": given,
                "output_tokens": wrote,
                "cost": str(cost) if cost is not None else None,
            }
        )
        added = Totals(1, given or 0, wrote or 0, cost if cost is not None else _ZERO, 0 if cost is not None else 1)
        for buckets, period in ((self._days, moment.strftime("%Y-%m-%d")), (self._months, moment.strftime("%Y-%m"))):
            engines = buckets.setdefault(period, {})
            engines[engine_id] = engines.get(engine_id, Totals()).plus(added)
        self._prune(moment)
        self._flush()

    def _prune(self, moment: datetime) -> None:
        """Keep the stated retention. The current day and month are never dropped."""
        del self._turns[:-KEEP_TURNS]
        today, month = moment.strftime("%Y-%m-%d"), moment.strftime("%Y-%m")
        oldest_day = (moment - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
        index = moment.year * 12 + moment.month - 1 - KEEP_MONTHS
        oldest_month = f"{index // 12:04d}-{index % 12 + 1:02d}"
        for period in [period for period in self._days if period < oldest_day and period != today]:
            del self._days[period]
        for period in [period for period in self._months if period < oldest_month and period != month]:
            del self._months[period]

    # -- the verdict ----------------------------------------------------------------------------

    def hold(self, limits: Limits) -> Hold | None:
        """Why the held engines may not start a turn now, or None when they may. See the module docstring for the order."""
        with self._lock:
            if self._problem:
                self._load()  # the person may have mended or deleted the file
            if self._unsaved and not self._problem:
                self._flush()  # the disk may have room again
            moment = self._clock()
            day, month = moment.strftime("%Y-%m-%d"), moment.strftime("%Y-%m")
            end_of_day = datetime(moment.year, moment.month, moment.day, tzinfo=UTC) + timedelta(days=1)
            end_of_month = datetime(moment.year + moment.month // 12, moment.month % 12 + 1, 1, tzinfo=UTC)
            kept = {"currency": limits.currency, "file": self._name}
            if self._problem:
                return Hold(UNKNOWN, None, why=FILE, **kept)
            if self._unsaved:
                return Hold(UNKNOWN, None, why=UNSAVED, **kept)
            if self._currency is not None and self._currency != limits.currency:
                return Hold(UNKNOWN, None, why=CURRENCY, **kept)
            this_month = self._together(self._months, month)
            if this_month.cost_unknown_turns:
                return Hold(UNKNOWN, end_of_month, why=TURN_COST, **kept)
            if this_month.cost >= limits.monthly:
                return Hold(MONTHLY, end_of_month, cap=limits.monthly, **kept)
            if self._together(self._days, day).cost >= limits.daily:
                return Hold(DAILY, end_of_day, cap=limits.daily, **kept)
            return None

    @staticmethod
    def _together(buckets: Buckets, period: str) -> Totals:
        total = Totals()
        for totals in buckets.get(period, {}).values():
            total = total.plus(totals)
        return total

    def view(self, engine_id: str, limits: Limits) -> dict[str, Any]:
        """The numbers ``GET /engines`` shows for one held engine: the limits, what all held engines together have cost
        (what the limits are checked against), and this engine's own totals, for today and this month (UTC)."""
        with self._lock:
            moment = self._clock()
            shown: dict[str, Any] = {"currency": limits.currency, "time_zone": "UTC"}
            for name, buckets, period, cap in (
                ("day", self._days, moment.strftime("%Y-%m-%d"), limits.daily),
                ("month", self._months, moment.strftime("%Y-%m"), limits.monthly),
            ):
                together = self._together(buckets, period)
                shown[name] = {
                    "period": period,
                    "cap": _number(cap),
                    "spent": _number(together.cost),
                    "cost_unknown_turns": together.cost_unknown_turns,
                    "engine": buckets.get(period, {}).get(engine_id, Totals()).as_json(),
                }
            return shown

    def turns(self) -> list[dict[str, Any]]:
        """The recorded turns, oldest first (at most ``KEEP_TURNS``)."""
        with self._lock:
            return [dict(turn) for turn in self._turns]


def _parse_document(data: bytes) -> tuple[list[dict[str, Any]], Buckets, Buckets, str | None] | None:
    """The state a file holds, or None when it is not a file this module wrote."""
    if len(data) > MAX_FILE_BYTES or not data.strip():
        return None
    try:
        document = json.loads(data.decode("utf-8"))
    except Exception:  # noqa: BLE001 - bad bytes, bad JSON, JSON nested too deep
        return None
    if not isinstance(document, dict) or set(document) != {"version", "currency", "turns", "days", "months"}:
        return None
    if document["version"] != FILE_VERSION:
        return None
    currency = document["currency"]
    if currency is not None and (not isinstance(currency, str) or not currency):
        return None
    turns, days, months = _turns_from_file(document["turns"]), _buckets_from_file(document["days"], 10), _buckets_from_file(document["months"], 7)
    if turns is None or days is None or months is None:
        return None
    return turns, days, months, currency
