"""engine_breaker.py: whether an engine may take a turn now (docs/ENGINES_PLAN.md section 5, slice 2).

The module is wired into no run path. Every test runs on a fake clock and a temp directory: nothing here
starts an engine, reads a login or touches a real file of the service. Time is the fixed NOW below.
"""

from __future__ import annotations

import ast
import json
import os
import random
import sys
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from freeduet import engine_breaker
from freeduet.engine_breaker import (
    DEGRADED,
    HALF_OPEN,
    OPEN,
    READY,
    SIGNED_OUT,
    STATES,
    BreakerRegistry,
    EngineBreaker,
    FileStore,
    NullStore,
    Record,
    Snapshot,
    Ticket,
    Timing,
)
from freeduet.failure_classifier import (
    AUTH,
    CREDITS,
    KINDS,
    RATE_LIMIT,
    REJECTED,
    TRANSIENT,
    UNKNOWN,
    USAGE_LIMIT,
    Failure,
)

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)
MINUTE = timedelta(minutes=1)


class Clock:
    def __init__(self, at: datetime = NOW):
        self.at = at

    def __call__(self) -> datetime:
        return self.at

    def advance(self, **span) -> None:
        self.at += timedelta(**span)


class MemoryStore:
    """A store a test can look into: what was saved, in what order."""

    def __init__(self, records=None):
        self.records: dict[str, Record] = dict(records or {})
        self.saves: list[tuple[str, Record]] = []

    def load(self, engine_id):
        return self.records.get(engine_id)

    def save(self, engine_id, record):
        self.saves.append((engine_id, record))
        self.records[engine_id] = record


@pytest.fixture
def clock():
    return Clock()


def make(clock, store=None, **timing) -> EngineBreaker:
    return EngineBreaker("claude-code", now=clock, store=store, timing=Timing(**timing) if timing else None)


def fail(breaker, kind, retry_at=None):
    ticket = breaker.acquire()
    assert ticket is not None, f"the breaker refused a turn in state {breaker.snapshot().state}"
    assert ticket.failure(Failure(kind, retry_at)) is True
    return ticket


def succeed(breaker):
    ticket = breaker.acquire()
    assert ticket is not None
    assert ticket.success() is True


def to_open(breaker, kind=RATE_LIMIT, retry_at=None):
    fail(breaker, kind, retry_at)
    assert breaker.snapshot().state == OPEN


def to_half_open(breaker, clock, kind=RATE_LIMIT):
    to_open(breaker, kind)
    clock.at = breaker.snapshot().limited_until
    assert breaker.snapshot().state == HALF_OPEN


# ── Every transition of the plan's table, one named test each ───────────────────────────────────


def test_start_is_ready(clock):
    snap = make(clock).snapshot()
    assert snap == Snapshot("claude-code", READY, None, None, 0)


def test_ready_stays_ready_on_a_success(clock):
    breaker = make(clock)
    succeed(breaker)
    assert breaker.snapshot().state == READY


def test_ready_to_degraded_on_a_transient_failure(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    assert breaker.snapshot() == Snapshot("claude-code", DEGRADED, None, TRANSIENT, 1)


def test_degraded_is_still_tried_and_the_ticket_says_it_is_degraded(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    ticket = breaker.acquire()
    assert ticket is not None and ticket.state == DEGRADED and ticket.probe is False


def test_degraded_stays_degraded_below_the_trip_count(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    fail(breaker, TRANSIENT)
    assert breaker.snapshot() == Snapshot("claude-code", DEGRADED, None, TRANSIENT, 2)


def test_degraded_to_ready_on_a_success_and_the_counters_reset(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    fail(breaker, TRANSIENT)
    succeed(breaker)
    assert breaker.snapshot() == Snapshot("claude-code", READY, None, None, 0)
    fail(breaker, TRANSIENT)
    fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == DEGRADED  # the success restarted the count of three


def test_degraded_trips_to_open_on_the_third_transient_failure_in_a_row(clock):
    breaker = make(clock)
    for _ in range(2):
        fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == DEGRADED
    fail(breaker, TRANSIENT)
    assert breaker.snapshot() == Snapshot("claude-code", OPEN, NOW + MINUTE, TRANSIENT, 3)


@pytest.mark.parametrize("kind", [RATE_LIMIT, USAGE_LIMIT, CREDITS])
def test_ready_to_open_at_once_on_a_limit(clock, kind):
    breaker = make(clock)
    fail(breaker, kind)
    assert breaker.snapshot() == Snapshot("claude-code", OPEN, NOW + MINUTE, kind, 1)


@pytest.mark.parametrize("kind", [RATE_LIMIT, USAGE_LIMIT, CREDITS])
def test_degraded_to_open_at_once_on_a_limit(clock, kind):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    fail(breaker, kind)
    assert breaker.snapshot().state == OPEN


def test_open_refuses_every_turn(clock):
    breaker = make(clock)
    to_open(breaker)
    assert breaker.acquire() is None
    clock.advance(seconds=59)
    assert breaker.acquire() is None


def test_open_to_half_open_when_the_time_passes_exactly(clock):
    breaker = make(clock)
    to_open(breaker)
    clock.advance(seconds=59, microseconds=999_999)
    assert breaker.snapshot().state == OPEN
    clock.advance(microseconds=1)
    assert breaker.snapshot() == Snapshot("claude-code", HALF_OPEN, None, RATE_LIMIT, 1)


def test_half_open_probe_success_goes_to_ready_and_resets_the_counters(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    probe = breaker.acquire()
    assert probe is not None and probe.state == HALF_OPEN and probe.probe is True
    assert probe.success() is True
    assert breaker.snapshot() == Snapshot("claude-code", READY, None, None, 0)
    to_open(breaker)  # the repeat count was reset too: back to the first guess
    assert breaker.snapshot().limited_until == clock.at + MINUTE


@pytest.mark.parametrize("kind", [RATE_LIMIT, USAGE_LIMIT, CREDITS, TRANSIENT])
def test_half_open_probe_failure_opens_again_and_the_wait_doubles(clock, kind):
    breaker = make(clock)
    to_half_open(breaker, clock)
    probe = breaker.acquire()
    assert probe.failure(Failure(kind)) is True
    assert breaker.snapshot() == Snapshot("claude-code", OPEN, clock.at + 2 * MINUTE, kind, 2)


def test_half_open_probe_failure_by_sign_in_goes_to_signed_out(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    assert breaker.acquire().failure(Failure(AUTH)) is True
    assert breaker.snapshot().state == SIGNED_OUT


def test_ready_to_signed_out_on_one_auth_failure(clock):
    breaker = make(clock)
    fail(breaker, AUTH)
    assert breaker.snapshot() == Snapshot("claude-code", SIGNED_OUT, None, AUTH, 1)


def test_degraded_to_signed_out_on_auth(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    fail(breaker, AUTH)
    assert breaker.snapshot().state == SIGNED_OUT


def test_signed_out_is_not_a_timer_it_never_comes_back_by_itself(clock):
    breaker = make(clock)
    fail(breaker, AUTH)
    for days in (1, 30, 365, 5000):
        clock.advance(days=days)
        assert breaker.acquire() is None
        assert breaker.snapshot().state == SIGNED_OUT
        assert breaker.snapshot().limited_until is None


def test_signed_out_to_ready_when_told_signed_in_and_the_counters_reset(clock):
    breaker = make(clock)
    fail(breaker, AUTH)
    assert breaker.signed_in() is True
    assert breaker.snapshot() == Snapshot("claude-code", READY, None, None, 0)
    assert breaker.acquire() is not None


@pytest.mark.parametrize("setup", ["ready", "degraded", "open", "half_open"])
def test_signed_in_changes_nothing_unless_the_engine_is_signed_out(clock, setup):
    breaker = make(clock)
    if setup == "degraded":
        fail(breaker, TRANSIENT)
    elif setup == "open":
        to_open(breaker)
    elif setup == "half_open":
        to_half_open(breaker, clock)
    before = breaker.snapshot()
    assert breaker.signed_in() is False
    assert breaker.snapshot() == before


def test_open_and_signed_out_ignore_a_success_from_a_turn_that_began_earlier(clock):
    breaker = make(clock)
    early = breaker.acquire()
    other = breaker.acquire()
    other.failure(Failure(RATE_LIMIT))
    assert early.success() is False
    assert breaker.snapshot().state == OPEN
    breaker2 = make(clock)
    early, other = breaker2.acquire(), breaker2.acquire()
    other.failure(Failure(AUTH))
    assert early.success() is False
    assert breaker2.snapshot().state == SIGNED_OUT


# ── Rejected and unknown: not its health ────────────────────────────────────────────────────────


@pytest.mark.parametrize("kind", [REJECTED, UNKNOWN])
@pytest.mark.parametrize("setup", ["ready", "degraded"])
def test_rejected_and_unknown_change_nothing_and_never_open_the_breaker(clock, kind, setup):
    breaker = make(clock)
    if setup == "degraded":
        fail(breaker, TRANSIENT)
    before = breaker.snapshot()
    for _ in range(50):
        fail(breaker, kind)
    assert breaker.snapshot() == before


@pytest.mark.parametrize("kind", [REJECTED, UNKNOWN])
def test_rejected_and_unknown_do_not_count_toward_the_trip(clock, kind):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    fail(breaker, kind)
    fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == DEGRADED
    fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == OPEN


@pytest.mark.parametrize("kind", [REJECTED, UNKNOWN])
def test_a_probe_that_is_rejected_frees_the_slot_and_stays_half_open(clock, kind):
    breaker = make(clock)
    to_half_open(breaker, clock)
    probe = breaker.acquire()
    assert breaker.acquire() is None
    assert probe.failure(Failure(kind)) is True
    assert breaker.snapshot().state == HALF_OPEN
    assert breaker.acquire() is not None


def test_rejected_and_unknown_writes_nothing(clock):
    store = MemoryStore()
    breaker = make(clock, store)
    fail(breaker, REJECTED)
    fail(breaker, UNKNOWN)
    assert store.saves == []


# ── The waits ───────────────────────────────────────────────────────────────────────────────────


def test_the_guessed_wait_is_a_minute_doubling_and_capped_at_thirty(clock):
    breaker = make(clock)
    waits = []
    for _ in range(8):
        before = clock.at
        fail(breaker, RATE_LIMIT)
        waits.append((breaker.snapshot().limited_until - before) / MINUTE)
        clock.at = breaker.snapshot().limited_until
        assert breaker.snapshot().state == HALF_OPEN
    assert waits == [1, 2, 4, 8, 16, 30, 30, 30]


def test_the_guessed_cap_is_a_constructor_argument(clock):
    breaker = make(clock, max_guessed_wait=timedelta(minutes=3))
    waits = []
    for _ in range(4):
        before = clock.at
        fail(breaker, RATE_LIMIT)
        waits.append((breaker.snapshot().limited_until - before) / MINUTE)
        clock.at = breaker.snapshot().limited_until
    assert waits == [1, 2, 3, 3]


def test_a_stated_reset_time_is_the_wait_exactly_not_shorter_and_not_longer(clock):
    breaker = make(clock)
    fail(breaker, USAGE_LIMIT, NOW + timedelta(hours=3, minutes=7))
    assert breaker.snapshot().limited_until == NOW + timedelta(hours=3, minutes=7)
    clock.at = NOW + timedelta(hours=3, minutes=7, seconds=-1)
    assert breaker.snapshot().state == OPEN
    clock.advance(seconds=1)
    assert breaker.snapshot().state == HALF_OPEN


def test_a_stated_time_beats_a_guess_when_it_is_shorter_than_the_guess(clock):
    breaker = make(clock)
    for _ in range(4):  # the guess is now 16 minutes
        fail(breaker, RATE_LIMIT)
        clock.at = breaker.snapshot().limited_until
    fail(breaker, RATE_LIMIT, clock.at + timedelta(seconds=30))
    assert breaker.snapshot().limited_until == clock.at + timedelta(seconds=30)


def test_a_stated_wait_is_capped_at_thirty_days(clock):
    breaker = make(clock)
    fail(breaker, USAGE_LIMIT, NOW + timedelta(days=31))
    assert breaker.snapshot().limited_until == NOW + timedelta(days=30)
    breaker = make(clock)
    fail(breaker, USAGE_LIMIT, datetime(9999, 1, 1, tzinfo=UTC))
    assert breaker.snapshot().limited_until == NOW + timedelta(days=30)
    breaker = make(clock, max_declared_wait=timedelta(days=2))
    fail(breaker, USAGE_LIMIT, NOW + timedelta(days=3))
    assert breaker.snapshot().limited_until == NOW + timedelta(days=2)


def test_a_stated_time_that_is_not_ahead_is_no_wait_so_the_guess_applies(clock):
    for moment in (NOW, NOW - timedelta(hours=1)):
        breaker = make(clock)
        fail(breaker, RATE_LIMIT, moment)
        assert breaker.snapshot().limited_until == NOW + MINUTE


def test_a_stated_time_counts_as_a_repeat_for_the_next_guess(clock):
    breaker = make(clock)
    fail(breaker, USAGE_LIMIT, NOW + timedelta(hours=1))
    clock.at = breaker.snapshot().limited_until
    fail(breaker, RATE_LIMIT)
    assert breaker.snapshot().limited_until == clock.at + 2 * MINUTE


def test_a_naive_stated_time_is_taken_as_utc(clock):
    breaker = make(clock)
    fail(breaker, USAGE_LIMIT, (NOW + timedelta(hours=2)).replace(tzinfo=None))
    assert breaker.snapshot().limited_until == NOW + timedelta(hours=2)


def test_a_transient_failure_that_trips_uses_the_time_the_engine_stated(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT)
    fail(breaker, TRANSIENT)
    fail(breaker, TRANSIENT, NOW + timedelta(minutes=10))
    assert breaker.snapshot().limited_until == NOW + timedelta(minutes=10)


def test_a_transient_failure_below_the_trip_ignores_the_time_it_stated(clock):
    breaker = make(clock)
    fail(breaker, TRANSIENT, NOW + timedelta(hours=1))
    assert breaker.snapshot() == Snapshot("claude-code", DEGRADED, None, TRANSIENT, 1)


def test_the_trip_count_is_a_constructor_argument(clock):
    breaker = make(clock, trip_after=1)
    fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == OPEN
    breaker = make(clock, trip_after=5)
    for _ in range(4):
        fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == DEGRADED
    fail(breaker, TRANSIENT)
    assert breaker.snapshot().state == OPEN


def test_the_first_guess_is_a_constructor_argument(clock):
    breaker = make(clock, guessed_wait=timedelta(seconds=10))
    fail(breaker, RATE_LIMIT)
    assert breaker.snapshot().limited_until == NOW + timedelta(seconds=10)


def test_the_documented_defaults():
    timing = Timing()
    assert timing.guessed_wait == timedelta(minutes=1)
    assert timing.max_guessed_wait == timedelta(minutes=30)
    assert timing.max_declared_wait == timedelta(days=30)
    assert timing.trip_after == 3
    assert timing.probe_lease == timedelta(hours=1)
    assert "proposed, to be confirmed by the maintainer" in Path(engine_breaker.__file__).read_text()


@pytest.mark.parametrize(
    "timing",
    [
        Timing(guessed_wait=None, max_guessed_wait="x", max_declared_wait=3, trip_after="3", probe_lease=[]),
        Timing(guessed_wait=timedelta(seconds=-5), max_guessed_wait=timedelta(0), trip_after=0),
        Timing(guessed_wait=timedelta.max, max_guessed_wait=timedelta.max, max_declared_wait=timedelta.max,
               trip_after=10**30, probe_lease=timedelta.max),
        Timing(trip_after=True),
    ],
    ids=["wrong-types", "non-positive", "huge", "bool"],
)
def test_unusable_timing_is_replaced_and_the_breaker_still_works(clock, timing):
    breaker = EngineBreaker("e", now=clock, timing=timing)
    longest = timedelta(0)
    for _ in range(30):
        fail(breaker, RATE_LIMIT)
        longest = max(longest, breaker.snapshot().limited_until - clock.at)
        clock.at = breaker.snapshot().limited_until
    assert timedelta(0) < longest <= timedelta(days=366)


# ── Half-open: exactly one probe ────────────────────────────────────────────────────────────────


def test_half_open_allows_exactly_one_probe_and_refuses_the_others(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    first = breaker.acquire()
    assert first is not None
    assert [breaker.acquire() for _ in range(5)] == [None] * 5
    first.success()
    assert breaker.acquire() is not None and breaker.acquire() is not None  # ready again: many may run


def test_half_open_probe_taken_by_threads_goes_to_exactly_one(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    start = threading.Barrier(16)
    got = []

    def worker():
        start.wait()
        got.append(breaker.acquire())

    threads = [threading.Thread(target=worker) for _ in range(16)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sum(ticket is not None for ticket in got) == 1


def test_a_probe_nobody_reports_lapses_and_the_late_report_is_ignored(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    lost = breaker.acquire()
    clock.advance(minutes=59)
    assert breaker.acquire() is None
    clock.advance(minutes=1)
    fresh = breaker.acquire()
    assert fresh is not None and fresh.probe
    assert lost.success() is False  # the slot belongs to the new probe now
    assert breaker.snapshot().state == HALF_OPEN
    assert fresh.success() is True


def test_the_probe_lease_is_a_constructor_argument(clock):
    breaker = make(clock, probe_lease=timedelta(minutes=5))
    to_half_open(breaker, clock)
    breaker.acquire()
    clock.advance(minutes=4, seconds=59)
    assert breaker.acquire() is None
    clock.advance(seconds=1)
    assert breaker.acquire() is not None


def test_a_slow_probe_that_reports_before_anyone_asks_is_still_the_probe(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    probe = breaker.acquire()
    clock.advance(hours=3)
    assert probe.success() is True
    assert breaker.snapshot().state == READY


# ── Reports: stale, repeated, foreign, garbage ──────────────────────────────────────────────────


def test_a_report_from_a_turn_that_began_before_the_trip_is_ignored(clock):
    breaker = make(clock)
    early = breaker.acquire()
    fail(breaker, RATE_LIMIT)
    before = breaker.snapshot()
    assert early.failure(Failure(USAGE_LIMIT, NOW + timedelta(days=1))) is False
    assert breaker.snapshot() == before


def test_a_stale_turn_cannot_close_a_half_open_breaker(clock):
    breaker = make(clock)
    early = breaker.acquire()
    to_half_open(breaker, clock)
    assert early.success() is False
    assert breaker.snapshot().state == HALF_OPEN


def test_a_stale_ticket_stays_stale_after_the_engine_recovers(clock):
    breaker = make(clock)
    early = breaker.acquire()
    to_half_open(breaker, clock)
    breaker.acquire().success()
    assert early.failure(Failure(AUTH)) is False
    assert breaker.snapshot().state == READY


def test_concurrent_turns_on_a_healthy_engine_all_count(clock):
    breaker = make(clock)
    tickets = [breaker.acquire() for _ in range(3)]
    assert [ticket.failure(Failure(TRANSIENT)) for ticket in tickets] == [True, True, True]
    assert breaker.snapshot().state == OPEN


def test_a_ticket_reports_once(clock):
    breaker = make(clock)
    ticket = breaker.acquire()
    assert ticket.failure(Failure(TRANSIENT)) is True
    assert ticket.failure(Failure(TRANSIENT)) is False
    assert ticket.success() is False
    assert breaker.snapshot() == Snapshot("claude-code", DEGRADED, None, TRANSIENT, 1)


def test_a_ticket_from_another_breaker_is_ignored(clock):
    one, other = make(clock), make(clock)
    ticket = other.acquire()
    assert one._report(ticket, Failure(RATE_LIMIT)) is False
    assert one.snapshot().state == READY
    assert ticket.success() is True


@pytest.mark.parametrize("junk", [None, 0, "ticket", object(), [], b"x"])
def test_a_report_through_anything_but_a_ticket_is_ignored(clock, junk):
    breaker = make(clock)
    assert breaker._report(junk, Failure(RATE_LIMIT)) is False
    assert breaker._report(junk, None) is False
    assert breaker.snapshot().state == READY


@pytest.mark.parametrize(
    "junk",
    [None, "rate_limit", 429, object(), Failure("nonsense"), Failure(None), Failure(RATE_LIMIT, "tomorrow"),
     Failure(RATE_LIMIT, 12345), Failure(RATE_LIMIT, datetime.max), Failure(RATE_LIMIT, datetime.min)],
    ids=["none", "string", "int", "object", "bad-kind", "no-kind", "text-time", "int-time", "max-time", "min-time"],
)
def test_a_failure_that_is_garbage_never_raises(clock, junk):
    breaker = make(clock)
    ticket = breaker.acquire()
    assert ticket.failure(junk) in (True, False)
    assert breaker.snapshot().state in STATES


# ── The clock ───────────────────────────────────────────────────────────────────────────────────


def test_a_clock_going_backwards_never_stretches_a_wait_past_the_one_that_was_set(clock):
    breaker = make(clock)
    to_open(breaker)  # one minute
    clock.advance(seconds=30)
    assert breaker.snapshot().state == OPEN
    clock.advance(hours=-5)  # the clock jumps back five hours
    snap = breaker.snapshot()
    assert snap.state == OPEN
    assert snap.limited_until <= clock.at + MINUTE  # not five hours
    clock.advance(seconds=60)
    assert breaker.snapshot().state == HALF_OPEN


def test_a_small_step_back_extends_by_that_step_and_no_more(clock):
    breaker = make(clock)
    to_open(breaker)
    clock.advance(seconds=30)
    clock.advance(seconds=-10)
    assert breaker.snapshot().limited_until == NOW + MINUTE
    clock.at = NOW + MINUTE
    assert breaker.snapshot().state == HALF_OPEN


def test_a_clock_going_backwards_does_not_wedge_a_probe_lease(clock):
    breaker = make(clock)
    to_half_open(breaker, clock)
    breaker.acquire()
    clock.advance(days=-400)
    assert breaker.acquire() is None
    clock.advance(hours=1)
    assert breaker.acquire() is not None


@pytest.mark.parametrize(
    "reading",
    [None, "now", 1731585600, datetime.max, datetime(9000, 1, 1, tzinfo=UTC)],
    ids=["none", "string", "int", "max", "year-9000"],
)
def test_a_clock_that_returns_garbage_is_replaced_by_the_real_one(reading):
    breaker = EngineBreaker("e", now=lambda: reading)
    ticket = breaker.acquire()
    assert ticket is not None and ticket.failure(Failure(RATE_LIMIT)) is True
    until = breaker.snapshot().limited_until
    assert abs((until - datetime.now(UTC)) - MINUTE) < timedelta(seconds=5)


def test_a_clock_that_raises_is_replaced_by_the_real_one():
    def broken():
        raise RuntimeError("no clock")

    breaker = EngineBreaker("e", now=broken)
    assert breaker.acquire() is not None


def test_a_clock_with_no_zone_is_taken_as_utc():
    breaker = EngineBreaker("e", now=lambda: NOW.replace(tzinfo=None))
    fail(breaker, RATE_LIMIT)
    assert breaker.snapshot().limited_until == NOW + MINUTE


def test_a_clock_in_another_zone_reads_the_same_moment():
    plus_two = timezone_of(hours=2)
    breaker = EngineBreaker("e", now=lambda: NOW.astimezone(plus_two))
    fail(breaker, RATE_LIMIT)
    assert breaker.snapshot().limited_until == NOW + MINUTE


def timezone_of(hours):
    from datetime import timezone

    return timezone(timedelta(hours=hours))


def test_without_a_clock_it_reads_the_real_one():
    breaker = EngineBreaker("e")
    fail(breaker, RATE_LIMIT)
    assert abs((breaker.snapshot().limited_until - datetime.now(UTC)) - MINUTE) < timedelta(seconds=5)


def test_a_clock_near_the_end_of_time_does_not_overflow(clock):
    clock.at = datetime(8999, 12, 31, 23, 59, tzinfo=UTC)
    breaker = make(clock)
    fail(breaker, USAGE_LIMIT, datetime(9998, 1, 1, tzinfo=UTC))
    assert breaker.snapshot().state == OPEN


# ── Restart: what is loaded and saved ───────────────────────────────────────────────────────────


def restart(clock, store, **timing):
    return make(clock, store, **timing)


def test_the_state_survives_a_restart_for_each_state(clock):
    store = MemoryStore()
    breaker = make(clock, store)
    fail(breaker, TRANSIENT)
    assert restart(clock, store).snapshot() == Snapshot("claude-code", DEGRADED, None, TRANSIENT, 1)
    fail(breaker, RATE_LIMIT)
    assert restart(clock, store).snapshot() == breaker.snapshot()
    clock.at = breaker.snapshot().limited_until
    breaker.acquire().failure(Failure(AUTH))
    assert restart(clock, store).snapshot() == Snapshot("claude-code", SIGNED_OUT, None, AUTH, 3)


def test_limited_until_in_the_future_on_load_is_still_open(clock):
    store = MemoryStore({"claude-code": Record(OPEN, NOW + timedelta(hours=2), 1, 1, USAGE_LIMIT)})
    breaker = make(clock, store)
    assert breaker.snapshot() == Snapshot("claude-code", OPEN, NOW + timedelta(hours=2), USAGE_LIMIT, 1)
    assert breaker.acquire() is None


@pytest.mark.parametrize("until", [NOW - timedelta(seconds=1), NOW, NOW - timedelta(days=400), None])
def test_limited_until_in_the_past_on_load_is_half_open_not_ready(clock, until):
    store = MemoryStore({"claude-code": Record(OPEN, until, 2, 2, RATE_LIMIT)})
    breaker = make(clock, store)
    assert breaker.snapshot() == Snapshot("claude-code", HALF_OPEN, None, RATE_LIMIT, 2)
    probe = breaker.acquire()
    assert probe is not None and probe.probe and breaker.acquire() is None


def test_limited_until_far_beyond_any_wait_on_load_is_clamped(clock):
    store = MemoryStore({"claude-code": Record(OPEN, datetime(2999, 1, 1, tzinfo=UTC), 1, 1, USAGE_LIMIT)})
    assert make(clock, store).snapshot().limited_until == NOW + timedelta(days=30)


def test_a_signed_out_record_stays_signed_out_after_any_downtime(clock):
    store = MemoryStore({"claude-code": Record(SIGNED_OUT, None, 1, 0, AUTH)})
    clock.advance(days=900)
    assert make(clock, store).snapshot().state == SIGNED_OUT


def test_a_loaded_half_open_has_no_probe_in_flight(clock):
    store = MemoryStore({"claude-code": Record(HALF_OPEN, None, 1, 1, RATE_LIMIT)})
    assert make(clock, store).acquire().probe is True


@pytest.mark.parametrize(
    "record",
    [
        Record("exploded"), Record(READY, None, -1), Record(READY, None, 0, 10**9), Record(READY, None, True),
        Record(READY, None, 0, 0, "gremlins"), "not a record", 42,
    ],
    ids=["state", "negative", "huge", "bool", "kind", "string", "int"],
)
def test_a_record_that_is_garbage_starts_clean(clock, record):
    breaker = make(clock, MemoryStore({"claude-code": record}))
    assert breaker.snapshot() == Snapshot("claude-code", READY, None, None, 0)


def test_an_open_record_whose_time_is_not_a_time_is_taken_as_passed(clock):
    breaker = make(clock, MemoryStore({"claude-code": Record(OPEN, "tomorrow", 1, 1)}))
    assert breaker.snapshot().state == HALF_OPEN


def test_a_store_that_raises_on_load_starts_clean(clock):
    class Broken(NullStore):
        def load(self, engine_id):
            raise OSError("disk")

    assert make(clock, Broken()).snapshot().state == READY


def test_a_store_that_raises_on_save_never_reaches_the_caller_and_the_next_change_tries_again(clock):
    class Flaky(MemoryStore):
        broken = True

        def save(self, engine_id, record):
            if self.broken:
                raise OSError("disk full")
            super().save(engine_id, record)

    store = Flaky()
    breaker = make(clock, store)
    fail(breaker, RATE_LIMIT)
    assert breaker.snapshot().state == OPEN and store.saves == []
    store.broken = False
    breaker.acquire()  # a refused turn changes nothing, so nothing is saved yet
    clock.at = breaker.snapshot().limited_until
    breaker.acquire()
    assert store.records["claude-code"].state == HALF_OPEN


def test_only_a_change_is_saved(clock):
    store = MemoryStore()
    breaker = make(clock, store)
    succeed(breaker)
    succeed(breaker)
    assert store.saves == []
    fail(breaker, TRANSIENT)
    assert len(store.saves) == 1
    breaker.snapshot()
    breaker.acquire()
    assert len(store.saves) == 1
    succeed(breaker)
    assert store.saves[-1][1] == Record(READY, None, 0, 0, None)


def test_the_saved_record_holds_only_state_time_counters_and_a_kind_name(clock):
    store = MemoryStore()
    breaker = make(clock, store)
    fail(breaker, USAGE_LIMIT, NOW + timedelta(hours=2))
    (engine_id, record), = store.saves
    assert engine_id == "claude-code"
    assert record == Record(OPEN, NOW + timedelta(hours=2), 1, 1, USAGE_LIMIT)


def test_the_null_store_is_the_default_and_keeps_nothing(clock):
    store = NullStore()
    assert store.load("x") is None and store.save("x", Record()) is None
    assert make(clock).snapshot().state == READY


# ── The registry ────────────────────────────────────────────────────────────────────────────────


def test_one_breaker_per_engine_id():
    registry = BreakerRegistry(now=Clock())
    assert registry.get("codex") is registry.get("codex")
    assert registry.get("codex") is not registry.get("claude-code")
    assert registry.get("codex").engine_id == "codex"


def test_breakers_of_a_registry_are_independent_and_share_clock_store_and_timing(clock):
    store = MemoryStore()
    registry = BreakerRegistry(now=clock, store=store, timing=Timing(guessed_wait=timedelta(minutes=5)))
    fail(registry.get("a"), RATE_LIMIT)
    assert registry.get("a").snapshot().limited_until == NOW + timedelta(minutes=5)
    assert registry.get("b").snapshot().state == READY
    assert [name for name, _ in store.saves] == ["a"]


def test_a_new_breaker_loads_its_own_saved_record(clock):
    store = MemoryStore({"b": Record(SIGNED_OUT, None, 1, 0, AUTH)})
    registry = BreakerRegistry(now=clock, store=store)
    assert registry.get("a").snapshot().state == READY
    assert registry.get("b").snapshot().state == SIGNED_OUT


def test_snapshots_list_every_engine_asked_about_by_id(clock):
    registry = BreakerRegistry(now=clock)
    for name in ("zed", "alpha", "mid"):
        registry.get(name)
    fail(registry.get("mid"), RATE_LIMIT)
    snaps = registry.snapshots()
    assert [snap.engine_id for snap in snaps] == ["alpha", "mid", "zed"]
    assert [snap.state for snap in snaps] == [READY, OPEN, READY]


@pytest.mark.parametrize("bad", [None, 7, "", "   ", "x" * 101, "a\nb", b"claude", ["a"]])
def test_a_bad_engine_id_is_filed_under_invalid_and_never_raises(clock, bad):
    registry = BreakerRegistry(now=clock)
    breaker = registry.get(bad)
    assert breaker.engine_id == "invalid"
    assert registry.get(bad) is breaker
    assert breaker.acquire() is not None
    assert [snap.engine_id for snap in registry.snapshots()] == ["invalid"]


def test_the_registry_is_bounded(clock):
    registry = BreakerRegistry(now=clock)
    for number in range(engine_breaker.MAX_ENGINES + 50):
        registry.get(f"engine-{number}")
    assert len(registry.snapshots()) == engine_breaker.MAX_ENGINES + 1
    assert registry.get("engine-9999").engine_id == "invalid"


def test_the_registry_makes_one_breaker_when_threads_ask_together():
    registry = BreakerRegistry(now=Clock())
    start, got = threading.Barrier(16), []

    def worker():
        start.wait()
        got.append(registry.get("codex"))

    threads = [threading.Thread(target=worker) for _ in range(16)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    assert len({id(breaker) for breaker in got}) == 1


# ── Threads ─────────────────────────────────────────────────────────────────────────────────────


def test_saves_of_one_breaker_never_overlap_and_arrive_in_state_order(clock):
    class Slow(MemoryStore):
        inside = 0
        most = 0
        guard = threading.Lock()

        def save(self, engine_id, record):
            with self.guard:
                Slow.inside += 1
                Slow.most = max(Slow.most, Slow.inside)
            time.sleep(0.002)
            super().save(engine_id, record)
            with self.guard:
                Slow.inside -= 1

    store = Slow()
    breaker = make(clock, store, trip_after=1000)

    def worker():
        for _ in range(12):
            ticket = breaker.acquire()
            ticket.failure(Failure(TRANSIENT))

    threads = [threading.Thread(target=worker) for _ in range(6)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    assert Slow.most == 1
    assert [record.consecutive_failures for _, record in store.saves] == list(range(1, 73))
    assert store.records["claude-code"] == breaker._record()


def test_many_threads_keep_the_counters_exact(clock):
    breaker = make(clock, trip_after=100_000)

    def worker():
        for _ in range(500):
            breaker.acquire().failure(Failure(TRANSIENT))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    assert breaker.snapshot().consecutive_failures == 4000


# ── The file store ──────────────────────────────────────────────────────────────────────────────

SAMPLE = Record(OPEN, NOW + timedelta(hours=3), 4, 2, USAGE_LIMIT)


def test_the_file_store_round_trips_every_field(tmp_path):
    path = tmp_path / "breaker.json"
    FileStore(path).save("claude-code", SAMPLE)
    FileStore(path).save("codex", Record(SIGNED_OUT, None, 1, 0, AUTH))
    again = FileStore(path)
    assert again.load("claude-code") == SAMPLE
    assert again.load("codex") == Record(SIGNED_OUT, None, 1, 0, AUTH)
    assert again.load("absent") is None
    assert again.problems == ()


def test_a_breaker_restarts_from_the_file(tmp_path, clock):
    path = tmp_path / "state" / "breaker.json"  # the directory does not exist yet
    breaker = make(clock, FileStore(path))
    fail(breaker, USAGE_LIMIT, NOW + timedelta(hours=2))
    assert make(clock, FileStore(path)).snapshot() == breaker.snapshot()


def test_the_file_holds_no_secret_and_no_engine_text(tmp_path):
    path = tmp_path / "breaker.json"
    FileStore(path).save("claude-code", SAMPLE)
    document = json.loads(path.read_text())
    assert document == {
        "version": 1,
        "engines": {
            "claude-code": {
                "state": "open",
                "limited_until": "2026-11-14T15:00:00+00:00",
                "consecutive_failures": 4,
                "opens": 2,
                "last_failure_kind": "usage_limit",
            }
        },
    }


def test_a_missing_file_starts_clean_and_says_so(tmp_path):
    store = FileStore(tmp_path / "nope.json")
    assert store.load("x") is None
    assert store.problems == (engine_breaker.MISSING,)


def test_an_empty_file_starts_clean_and_says_so(tmp_path):
    path = tmp_path / "breaker.json"
    for content in (b"", b"  \n\t"):
        path.write_bytes(content)
        store = FileStore(path)
        assert store.load("x") is None
        assert store.problems == (engine_breaker.EMPTY,)


@pytest.mark.parametrize(
    "content",
    [
        b"{", b"not json", b"\xff\xfe\x00", b"[]", b"null", b"42", b'{"version": 1}', b'{"version": 2, "engines": {}}',
        b'{"version": 1, "engines": []}', b"[" * 100_000, b'{"engines": {"x": 1}}',
    ],
    ids=["truncated", "text", "bytes", "list", "null", "number", "no-engines", "other-version", "engines-list",
         "deep", "no-version"],
)
def test_a_corrupt_file_starts_clean_says_so_and_the_next_save_repairs_it(tmp_path, content):
    path = tmp_path / "breaker.json"
    path.write_bytes(content)
    store = FileStore(path)
    assert store.load("x") is None
    assert engine_breaker.CORRUPT in store.problems
    store.save("x", SAMPLE)
    assert FileStore(path).load("x") == SAMPLE


def test_a_file_too_big_is_not_read(tmp_path):
    path = tmp_path / "breaker.json"
    path.write_bytes(b" " * engine_breaker.MAX_FILE_BYTES + b'{"version":1,"engines":{}}')
    store = FileStore(path)
    assert store.load("x") is None and engine_breaker.CORRUPT in store.problems


def test_records_that_are_unusable_are_dropped_and_the_rest_kept(tmp_path):
    path = tmp_path / "breaker.json"
    good = {"state": "ready", "limited_until": None, "consecutive_failures": 0, "opens": 0, "last_failure_kind": None}
    bad = [
        {**good, "state": "exploded"}, {**good, "consecutive_failures": -1}, {**good, "opens": True},
        {**good, "limited_until": "tomorrow"}, {**good, "limited_until": 5}, {**good, "last_failure_kind": "x"},
        "text", None, 7, {},
    ]
    document = {"version": 1, "engines": {"good": good, **{f"bad{n}": raw for n, raw in enumerate(bad)}}}
    path.write_text(json.dumps(document))
    store = FileStore(path)
    assert store.load("good") == Record()
    assert all(store.load(f"bad{n}") is None for n in range(len(bad)))
    assert engine_breaker.DROPPED in store.problems


def test_a_problem_is_reported_once_however_often_it_is_met(tmp_path):
    store = FileStore(tmp_path / "nope.json")
    for _ in range(5):
        store.load("x")
    assert store.problems == (engine_breaker.MISSING,)


@pytest.mark.parametrize("path", [None, 5, "", b"x/y", ["a"]])
def test_a_bad_path_makes_a_store_that_never_raises(path):
    store = FileStore(path)
    assert store.load("x") is None
    store.save("x", SAMPLE)
    assert store.problems


def test_a_file_that_cannot_be_written_never_raises_and_leaves_no_litter(tmp_path):
    target = tmp_path / "is-a-directory"
    target.mkdir()
    store = FileStore(target)
    store.save("x", SAMPLE)
    assert engine_breaker.NOT_WRITTEN in store.problems
    assert [entry.name for entry in tmp_path.iterdir()] == ["is-a-directory"]


def test_a_failed_write_keeps_the_old_file_whole_and_removes_its_temp_file(tmp_path, monkeypatch):
    path = tmp_path / "breaker.json"
    store = FileStore(path)
    store.save("x", SAMPLE)
    before = path.read_bytes()

    def refuse(*args):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", refuse)
    store.save("x", Record(READY))
    monkeypatch.undo()
    assert path.read_bytes() == before
    assert [entry.name for entry in tmp_path.iterdir()] == ["breaker.json"]
    assert engine_breaker.NOT_WRITTEN in store.problems


def test_the_write_is_a_temp_file_in_the_same_directory_then_fsync_then_rename(tmp_path, monkeypatch):
    events = []
    real_fsync, real_replace = os.fsync, os.replace

    def fsync(descriptor):
        events.append(("fsync", os.fstat(descriptor).st_size))
        return real_fsync(descriptor)

    def replace(source, destination):
        events.append(("replace", Path(source).parent, Path(destination), Path(source).read_bytes()))
        return real_replace(source, destination)

    monkeypatch.setattr(os, "fsync", fsync)
    monkeypatch.setattr(os, "replace", replace)
    path = tmp_path / "breaker.json"
    FileStore(path).save("x", SAMPLE)
    names = [event[0] for event in events]
    assert names[0] == "fsync" and names.index("replace") > names.index("fsync")
    _, source_dir, destination, temp_bytes = events[names.index("replace")]
    assert source_dir == tmp_path and destination == path
    assert events[0][1] == len(temp_bytes) > 0  # the whole content was on disk before the rename
    assert json.loads(path.read_text())["engines"]["x"]["state"] == "open"
    assert [entry.name for entry in tmp_path.iterdir()] == ["breaker.json"]


def test_concurrent_writers_lose_no_record_and_a_reader_never_sees_a_half_file(tmp_path):
    path = tmp_path / "breaker.json"
    stores = [FileStore(path) for _ in range(3)]  # three stores on one path, as three owners would be
    stop = threading.Event()
    seen_bad = []

    def reader():
        while not stop.is_set():
            try:
                raw = path.read_bytes()
            except FileNotFoundError:
                continue
            try:
                json.loads(raw)
            except ValueError:
                seen_bad.append(raw)

    def writer(number):
        store = stores[number % 3]
        for step in range(40):
            store.save(f"engine-{number}", Record(READY, None, step, 0, None))

    watcher = threading.Thread(target=reader)
    watcher.start()
    writers = [threading.Thread(target=writer, args=(number,)) for number in range(9)]
    [thread.start() for thread in writers]
    [thread.join() for thread in writers]
    stop.set()
    watcher.join()
    assert seen_bad == []
    final = FileStore(path)
    assert [final.load(f"engine-{number}").consecutive_failures for number in range(9)] == [39] * 9
    assert [entry.name for entry in tmp_path.iterdir()] == ["breaker.json"]


def test_breakers_of_one_registry_sharing_a_file_keep_each_others_records(tmp_path, clock):
    path = tmp_path / "breaker.json"
    registry = BreakerRegistry(now=clock, store=FileStore(path))
    threads = [threading.Thread(target=fail, args=(registry.get(f"e{n}"), RATE_LIMIT)) for n in range(8)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    again = BreakerRegistry(now=clock, store=FileStore(path))
    assert [snap.state for snap in again.snapshots()] == []  # nothing asked yet
    assert [again.get(f"e{n}").snapshot().state for n in range(8)] == [OPEN] * 8


def test_the_file_store_is_bounded_in_records(tmp_path):
    store = FileStore(tmp_path / "breaker.json")
    for number in range(engine_breaker.MAX_ENGINES + 20):
        store.save(f"e{number:03}", Record())
    assert len(json.loads((tmp_path / "breaker.json").read_text())["engines"]) == engine_breaker.MAX_ENGINES


# ── Hostile input ───────────────────────────────────────────────────────────────────────────────


def test_a_very_long_outage_does_bounded_work_and_keeps_counters_capped(clock):
    breaker = make(clock)
    started = time.perf_counter()
    for _ in range(3000):
        fail(breaker, RATE_LIMIT)
        wait = breaker.snapshot().limited_until - clock.at
        clock.at = breaker.snapshot().limited_until
    assert time.perf_counter() - started < 5
    assert wait == timedelta(minutes=30)
    assert breaker.snapshot().consecutive_failures == 3000


def test_constructor_arguments_that_are_garbage_never_raise(clock):
    breaker = EngineBreaker(None, now="clock", store=object(), timing="slow")
    assert breaker.engine_id == "invalid"
    ticket = breaker.acquire()
    assert ticket is not None and ticket.failure(Failure(RATE_LIMIT)) is True
    assert breaker.snapshot().state == OPEN


# ── A random walk against a tiny reference model ────────────────────────────────────────────────

BASE = NOW
GUESS, GUESS_CAP, DECLARED_CAP, TRIP, LEASE = 60, 1800, 30 * 86400, 3, 3600


class Model:
    """The plan's table, written again in the plainest way: whole seconds, and a SET of valid ticket ids in
    place of the breaker's epoch number."""

    def __init__(self):
        self.state, self.until, self.wait = READY, None, 0
        self.fails, self.opens, self.last = 0, 0, None
        self.valid, self.probe_open, self.probe_until, self.serial = set(), False, None, 0

    def advance(self, now):
        if self.state == OPEN:
            self.until = min(self.until, now + self.wait)
            if now >= self.until:
                self.state, self.until, self.probe_open = HALF_OPEN, None, False
        elif self.state == HALF_OPEN and self.probe_open:
            self.probe_until = min(self.probe_until, now + LEASE)
            if now >= self.probe_until:
                self.probe_open = False

    def acquire(self, now):
        self.advance(now)
        if self.state in (OPEN, SIGNED_OUT) or (self.state == HALF_OPEN and self.probe_open):
            return None
        if self.state == HALF_OPEN:
            self.probe_open, self.probe_until = True, now + LEASE
            self.valid.clear()
        self.serial += 1
        self.valid.add(self.serial)
        return self.serial, self.state

    def report(self, ticket, now, kind, retry):
        self.advance(now)
        if ticket not in self.valid:
            return False
        self.valid.discard(ticket)
        was_probe = self.state == HALF_OPEN
        if was_probe:
            self.probe_open = False
        if kind is None:
            self.state, self.until, self.wait, self.fails, self.opens, self.last = READY, None, 0, 0, 0, None
            self.probe_open = False
            return True
        if kind in (REJECTED, UNKNOWN):
            return True
        self.fails, self.last = min(self.fails + 1, 10**6), kind
        if kind == AUTH:
            self.state, self.until, self.probe_open = SIGNED_OUT, None, False
            self.valid.clear()
        elif kind in (RATE_LIMIT, USAGE_LIMIT, CREDITS) or was_probe or self.fails >= TRIP:
            self.trip(now, retry)
        else:
            self.state = DEGRADED
        return True

    def trip(self, now, retry):
        if retry is not None and retry > now:
            wait = min(retry - now, DECLARED_CAP)
        else:
            wait = min(GUESS * 2 ** min(self.opens, 20), GUESS_CAP)
        self.opens += 1
        self.state, self.wait, self.until, self.probe_open = OPEN, wait, now + wait, False
        self.valid.clear()

    def signed_in(self):
        if self.state != SIGNED_OUT:
            return False
        self.state, self.until, self.wait, self.fails, self.opens, self.last = READY, None, 0, 0, 0, None
        return True

    def view(self):
        until = BASE + timedelta(seconds=self.until) if self.state == OPEN else None
        return Snapshot("claude-code", self.state, until, self.last, self.fails)


def test_ten_thousand_random_steps_agree_with_the_reference_model():
    rng = random.Random(20261114)
    clock = Clock()
    breaker = EngineBreaker("claude-code", now=clock, store=MemoryStore())
    model, seconds = Model(), 0
    tickets: list[tuple[Ticket, int | None]] = []  # every ticket ever handed out, and the model's id for it
    kinds = list(KINDS)
    visited = set()
    for step in range(10_000):
        roll = rng.random()
        if roll < 0.25:
            seconds += rng.choice([1, 30, 59, 60, 61, 600, 1800, 3600, 7200, 86_400, 40 * 86_400])
        elif roll < 0.30:
            seconds -= rng.choice([1, 30, 3600, 86_400])
        clock.at = BASE + timedelta(seconds=seconds)
        action = rng.random()
        if action < 0.35:
            ticket, expected = breaker.acquire(), model.acquire(seconds)
            assert (ticket is None) == (expected is None), step
            if ticket is not None:
                assert (ticket.state) == expected[1], step
                tickets.append((ticket, expected[0]))
        elif action < 0.85 and tickets:
            ticket, model_id = rng.choice(tickets[-12:] if rng.random() < 0.8 else tickets)
            kind = rng.choice([None, None] + kinds)
            retry = rng.choice([None, None, seconds - 5, seconds + 20, seconds + 7200, seconds + 90 * 86_400])
            if kind is None:
                got = ticket.success()
            else:
                got = ticket.failure(Failure(kind, None if retry is None else BASE + timedelta(seconds=retry)))
            assert got == model.report(model_id, seconds, kind, retry), step
        elif action < 0.93:
            assert breaker.signed_in() == model.signed_in(), step
        else:
            model.advance(seconds)
        model.advance(seconds)
        assert breaker.snapshot() == model.view(), step
        visited.add(model.state)
    assert visited == set(STATES)


# ── The module's own limits ─────────────────────────────────────────────────────────────────────

ALLOWED_IMPORTS = {
    "__future__", "json", "logging", "os", "tempfile", "threading", "collections.abc", "dataclasses", "datetime",
    "typing", "freeduet.failure_classifier",
}
FORBIDDEN_CALLS = {"exec", "eval", "__import__", "input", "print", "compile"}


def test_the_module_imports_only_the_standard_library_and_the_failure_classifier():
    tree = ast.parse(Path(engine_breaker.__file__).read_text(encoding="utf-8"))
    imported: set[str] = set()
    called: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            imported.add(f"freeduet.{module}" if node.level else module)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            called.add(node.func.id)
    assert imported <= ALLOWED_IMPORTS, imported - ALLOWED_IMPORTS
    outside = {name for name in imported if not name.startswith("freeduet.") and name.split(".")[0] not in sys.stdlib_module_names}
    assert not outside
    assert not called & FORBIDDEN_CALLS, called & FORBIDDEN_CALLS


def test_the_module_reads_no_environment_and_starts_nothing():
    source = Path(engine_breaker.__file__).read_text(encoding="utf-8")
    for word in ("environ", "getenv", "subprocess", "socket", "CLAUDE_CONFIG_DIR"):
        assert word not in source, word


def test_nothing_in_the_package_imports_the_breaker_yet():
    package = Path(engine_breaker.__file__).parent
    for file in package.rglob("*.py"):
        if file.name != "engine_breaker.py":
            assert "engine_breaker" not in file.read_text(encoding="utf-8"), file.name


def test_the_state_names_are_the_plans():
    assert STATES == ("ready", "degraded", "open", "half_open", "signed_out")
    assert set(KINDS) >= {RATE_LIMIT, USAGE_LIMIT, CREDITS, AUTH, TRANSIENT, REJECTED, UNKNOWN}
