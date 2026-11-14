"""The spend ledger on its own (freeduet/ledger.py): what is recorded, the time rule, the verdict, the file.

A made-up clock and made-up numbers; nothing here runs an engine. Each test names one rule of the module's docstring.
"""

from __future__ import annotations

import errno
import json
import os
import threading
from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from freeduet import ledger as ledger_module
from freeduet.engine_adapter import Usage
from freeduet.ledger import (
    CURRENCY,
    DAILY,
    FILE,
    KEEP_DAYS,
    KEEP_MONTHS,
    KEEP_TURNS,
    MAX_FILE_BYTES,
    MONTHLY,
    TURN_COST,
    UNKNOWN,
    UNSAVED,
    Ledger,
    Limits,
)
from ledger_support import START, Clock

LIMITS = Limits("EUR", Decimal("1"), Decimal("10"))


def turn(cost=0.1, given=100, wrote=20, currency="EUR") -> Usage:
    return Usage(input_tokens=given, output_tokens=wrote, cost=cost, currency=currency if cost is not None else None)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def path(tmp_path):
    return tmp_path / "data" / "engine-ledger.json"


@pytest.fixture
def ledger(path, clock):
    return Ledger(path, now=clock)


def saved(path) -> dict:
    return json.loads(path.read_text())


# ── What is recorded ───────────────────────────────────────────────────────────────────────────────


def test_a_turn_is_recorded_with_only_what_the_engine_reported(ledger):
    ledger.record("gw", turn(cost=0.25, given=1200, wrote=300), "EUR")
    day = ledger.view("gw", LIMITS)["day"]
    assert day["engine"] == {"turns": 1, "input_tokens": 1200, "output_tokens": 300, "cost": 0.25, "cost_unknown_turns": 0}
    assert ledger.turns() == [
        {"at": START.isoformat(), "engine": "gw", "input_tokens": 1200, "output_tokens": 300, "cost": "0.25"}
    ]


def test_money_is_added_as_exact_decimals_so_ten_dimes_are_a_euro_and_reach_the_cap(ledger):
    for _ in range(9):
        ledger.record("gw", turn(cost=0.1), "EUR")
    assert ledger.hold(LIMITS) is None  # 0.9: a float sum of ten dimes would be 0.9999999999999999 and miss the cap
    ledger.record("gw", turn(cost=0.1), "EUR")
    assert ledger.hold(LIMITS).kind == DAILY


def test_a_cost_the_engine_did_not_report_is_unknown_never_zero(ledger):
    ledger.record("gw", turn(cost=None, given=500, wrote=80), "EUR")
    engine = ledger.view("gw", LIMITS)["month"]["engine"]
    assert engine["cost_unknown_turns"] == 1 and engine["cost"] == 0 and engine["input_tokens"] == 500  # tokens are kept
    assert ledger.turns()[0]["cost"] is None
    hold = ledger.hold(LIMITS)
    assert hold.kind == UNKNOWN and hold.why == TURN_COST
    assert hold.until == datetime(2026, 12, 1, tzinfo=UTC)  # the month's sum is a lower bound until the month turns


def test_a_turn_that_answered_and_reported_no_usage_at_all_is_a_turn_of_unknown_cost(ledger):
    ledger.record("gw", None, "EUR")
    assert ledger.view("gw", LIMITS)["month"]["engine"] == {
        "turns": 1, "input_tokens": 0, "output_tokens": 0, "cost": 0, "cost_unknown_turns": 1,
    }
    assert ledger.turns()[0]["input_tokens"] is None  # not reported: None, never a 0 that says "none were used"
    assert ledger.hold(LIMITS).why == TURN_COST


def test_a_cost_in_another_currency_is_never_added_and_never_converted(ledger):
    ledger.record("gw", turn(cost=0.4, currency="USD"), "EUR")
    assert ledger.view("gw", LIMITS)["day"]["spent"] == 0
    assert ledger.hold(LIMITS).why == TURN_COST


@pytest.mark.parametrize("cost", [-0.01, float("nan"), float("inf"), "abc", True, 10**13, [1], {"a": 1}])
def test_a_cost_that_is_not_a_cost_is_an_unknown_one_and_adds_nothing(ledger, cost):
    ledger.record("gw", Usage(input_tokens=1, output_tokens=1, cost=cost, currency="EUR"), "EUR")
    assert ledger.view("gw", LIMITS)["day"]["spent"] == 0
    assert ledger.hold(LIMITS).why == TURN_COST


@pytest.mark.parametrize("tokens", [-1, 1.5, "3", True, 10**16, None])
def test_a_token_count_that_is_not_a_count_is_not_reported_not_zero(ledger, tokens):
    ledger.record("gw", Usage(input_tokens=tokens, output_tokens=tokens, cost=0.1, currency="EUR"), "EUR")
    assert ledger.turns()[0]["input_tokens"] is None and ledger.turns()[0]["output_tokens"] is None
    assert ledger.view("gw", LIMITS)["day"]["engine"]["cost"] == 0.1  # the cost still counts


def test_a_bad_record_never_raises_into_a_turn(ledger):
    ledger.record("gw", object(), "EUR")  # type: ignore[arg-type]
    ledger.record("gw", Usage(cost=0.1, currency="EUR"), None)  # type: ignore[arg-type]
    assert ledger.hold(LIMITS) is not None  # and the engines are held, not run on a total that is wrong


# ── The time rule: UTC ─────────────────────────────────────────────────────────────────────────────


def test_a_day_runs_from_midnight_utc_to_midnight_utc(ledger, clock):
    clock.at = datetime(2026, 11, 14, 23, 59, 59, tzinfo=UTC)
    ledger.record("gw", turn(cost=1.0), "EUR")
    hold = ledger.hold(LIMITS)
    assert (hold.kind, hold.until, hold.cap_text) == (DAILY, datetime(2026, 11, 15, tzinfo=UTC), "1.00 EUR")
    clock.at = datetime(2026, 11, 15, 0, 0, 0, tzinfo=UTC)
    assert ledger.hold(LIMITS) is None  # available again the moment the day turns
    assert ledger.view("gw", LIMITS)["month"]["spent"] == 1.0  # and the month remembers it


def test_a_month_runs_from_the_first_to_the_first_and_a_new_year_is_a_new_month(ledger, clock):
    clock.at = datetime(2026, 12, 31, 23, 0, tzinfo=UTC)
    for _ in range(10):
        ledger.record("gw", turn(cost=1.0), "EUR")
    hold = ledger.hold(LIMITS)
    assert (hold.kind, hold.until) == (MONTHLY, datetime(2027, 1, 1, tzinfo=UTC))
    clock.at = datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
    assert ledger.hold(LIMITS) is None
    assert ledger.view("gw", LIMITS)["month"]["period"] == "2027-01" and ledger.view("gw", LIMITS)["month"]["spent"] == 0


def test_when_both_limits_are_reached_the_one_that_lifts_later_is_said(ledger):
    for _ in range(10):
        ledger.record("gw", turn(cost=1.0), "EUR")
    assert ledger.hold(LIMITS).kind == MONTHLY  # not "back at midnight": it is not


def test_a_time_with_another_offset_is_counted_in_utc_and_a_naive_time_is_utc(ledger, path):
    late = datetime(2026, 11, 14, 23, 30, tzinfo=timezone(timedelta(hours=-5)))  # 04:30 UTC on the 15th
    ledger.record("gw", turn(cost=0.2), "EUR", at=late)
    ledger.record("gw", turn(cost=0.3), "EUR", at=datetime(2026, 11, 15, 12, 0))
    assert set(saved(path)["days"]) == {"2026-11-15"}
    assert saved(path)["days"]["2026-11-15"]["gw"]["cost"] == "0.5"


def test_the_stated_time_zone_is_in_what_the_endpoint_shows(ledger):
    assert ledger.view("gw", LIMITS)["time_zone"] == "UTC"


# ── The verdict ────────────────────────────────────────────────────────────────────────────────────


def test_at_the_cap_is_reached_and_one_cent_under_is_not(ledger):
    ledger.record("gw", turn(cost=0.99), "EUR")
    assert ledger.hold(LIMITS) is None
    ledger.record("gw", turn(cost=0.01), "EUR")
    assert ledger.hold(LIMITS).kind == DAILY


def test_the_limits_are_for_all_engines_together(ledger):
    ledger.record("one", turn(cost=0.6), "EUR")
    ledger.record("two", turn(cost=0.4), "EUR")
    assert ledger.hold(LIMITS).kind == DAILY  # neither engine reached 1.00 alone
    assert ledger.view("one", LIMITS)["day"]["spent"] == 1.0 and ledger.view("one", LIMITS)["day"]["engine"]["cost"] == 0.6


def test_an_unknown_turn_of_one_engine_holds_them_all(ledger):
    ledger.record("one", turn(cost=None), "EUR")
    assert ledger.hold(LIMITS).kind == UNKNOWN


def test_the_overshoot_is_the_turn_that_crossed_the_cap_and_nothing_more(ledger):
    ledger.record("gw", turn(cost=0.9), "EUR")
    assert ledger.hold(LIMITS) is None  # 0.9 of 1.00: a turn may start, and may cost more than the 0.10 left
    ledger.record("gw", turn(cost=0.7), "EUR")  # it crossed the cap while it ran, and finished
    assert ledger.view("gw", LIMITS)["day"]["spent"] == 1.6
    assert ledger.hold(LIMITS).kind == DAILY  # the next turn is held


def test_limits_come_from_the_metered_block():
    class Block:
        currency, daily_cap, monthly_cap = " eur ", 0.5, 12

    assert Limits.of(Block) == Limits("EUR", Decimal("0.5"), Decimal("12"))


# ── What is kept ───────────────────────────────────────────────────────────────────────────────────


def test_totals_survive_a_restart(path, clock):
    first = Ledger(path, now=clock)
    first.record("gw", turn(cost=0.3, given=700, wrote=90), "EUR")
    first.record("gw", turn(cost=0.4), "EUR")
    again = Ledger(path, now=clock)
    assert again.view("gw", LIMITS) == first.view("gw", LIMITS)
    assert again.view("gw", LIMITS)["day"]["spent"] == 0.7
    again.record("gw", turn(cost=0.3), "EUR")
    assert again.hold(LIMITS).kind == DAILY  # and the restart did not forget the day


def test_a_missing_file_is_a_ledger_with_nothing_recorded_and_makes_no_file(path, ledger):
    assert ledger.hold(LIMITS) is None and ledger.problems == ()
    assert ledger.view("gw", LIMITS)["day"]["spent"] == 0
    assert not path.exists() and not path.parent.exists()  # nothing is written until a turn is recorded


def test_the_file_is_written_whole_atomically_and_leaves_nothing_else_behind(path, ledger):
    for index in range(5):
        ledger.record("gw", turn(cost=0.01), "EUR")
        assert saved(path)["days"]["2026-11-14"]["gw"]["turns"] == index + 1  # complete JSON after every turn
        assert [entry.name for entry in path.parent.iterdir()] == [path.name]  # no temporary file


def test_the_file_holds_no_message_key_path_or_member(path, ledger):
    ledger.record("paid", turn(cost=0.3), "EUR")
    document = saved(path)
    assert set(document) == {"version", "currency", "turns", "days", "months"} and document["version"] == 1
    assert set(document["turns"][0]) == {"at", "engine", "input_tokens", "output_tokens", "cost"}
    assert set(document["days"]["2026-11-14"]["paid"]) == {"turns", "input_tokens", "output_tokens", "cost", "cost_unknown_turns"}
    assert str(path.parent) not in path.read_text()


def test_the_retention_is_stated_and_kept(path, clock, monkeypatch):
    monkeypatch.setattr(os, "fsync", lambda descriptor: None)  # 250 turns written whole: the disk sync is not what is tested
    ledger = Ledger(path, now=clock)
    old_day, old_month = START - timedelta(days=KEEP_DAYS + 1), datetime(2024, 1, 15, tzinfo=UTC)
    ledger.record("gw", turn(), "EUR", at=old_month)
    ledger.record("gw", turn(), "EUR", at=old_day)
    for _ in range(KEEP_TURNS + 50):
        ledger.record("gw", turn(cost=0.0), "EUR")
    document = saved(path)
    assert len(document["turns"]) == KEEP_TURNS and len(ledger.turns()) == KEEP_TURNS
    assert "2024-01-15" not in document["days"] and old_day.strftime("%Y-%m-%d") not in document["days"]
    assert "2024-01" not in document["months"]
    assert "2026-11-14" in document["days"] and "2026-11" in document["months"]  # the current ones are never dropped
    assert len(document["months"]) <= KEEP_MONTHS + 1


def test_the_current_day_and_month_are_kept_when_the_clock_goes_back(path, clock):
    ledger = Ledger(path, now=clock)
    ledger.record("gw", turn(cost=0.5), "EUR")
    clock.at = START - timedelta(days=400)  # a clock that jumped back a year
    ledger.record("gw", turn(cost=0.0), "EUR")
    clock.at = START
    assert ledger.view("gw", LIMITS)["day"]["spent"] == 0.5


# ── Two turns ending together ──────────────────────────────────────────────────────────────────────


def test_two_turns_that_end_together_both_count(path, clock):
    ledger = Ledger(path, now=clock)
    start = threading.Barrier(2)

    def worker(engine):
        start.wait()
        for _ in range(40):
            ledger.record(engine, turn(cost=0.01, given=10, wrote=1), "EUR")

    threads = [threading.Thread(target=worker, args=(name,)) for name in ("one", "two")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    shown = ledger.view("one", LIMITS)["day"]
    assert shown["spent"] == 0.8 and shown["engine"]["turns"] == 40 and shown["engine"]["input_tokens"] == 400
    again = Ledger(path, now=clock).view("two", LIMITS)["day"]  # the file has them all too, not only the memory
    assert again["spent"] == 0.8 and again["engine"]["turns"] == 40


# ── A file that is not the ledger's ────────────────────────────────────────────────────────────────


def _document(path, clock):
    first = Ledger(path, now=clock)
    first.record("gw", turn(cost=0.3), "EUR")
    return saved(path)


def _damaged() -> dict:
    def edit(change):
        def run(document):
            change(document)
            return json.dumps(document).encode()

        return run

    return {
        "not json": lambda document: b"{not json",
        "empty": lambda document: b"",
        "spaces only": lambda document: b"  \n ",
        "bytes that are not text": lambda document: b"\xff\xfe\x00",
        "an empty object": lambda document: b"{}",
        "a list": lambda document: b"[]",
        "a bare zero": lambda document: b"0",
        "an unknown version": edit(lambda d: d.update(version=2)),
        "a missing part": edit(lambda d: d.pop("months")),
        "an extra part": edit(lambda d: d.update(extra=1)),
        "a negative cost": edit(lambda d: d["days"]["2026-11-14"]["gw"].update(cost="-1")),
        "a cost that is not a number": edit(lambda d: d["days"]["2026-11-14"]["gw"].update(cost="NaN")),
        "a cost that is infinite": edit(lambda d: d["months"]["2026-11"]["gw"].update(cost="Infinity")),
        "a cost that is a float": edit(lambda d: d["days"]["2026-11-14"]["gw"].update(cost=0.3)),
        "a count that is a string": edit(lambda d: d["days"]["2026-11-14"]["gw"].update(turns="1")),
        "a count that is a bool": edit(lambda d: d["days"]["2026-11-14"]["gw"].update(turns=True)),
        "a day that is not a day": edit(lambda d: d["days"].update({"2026-13-45": d["days"].pop("2026-11-14")})),
        "a totals entry with a part missing": edit(lambda d: d["days"]["2026-11-14"]["gw"].pop("turns")),
        "too many turns": edit(lambda d: d.update(turns=d["turns"] * (KEEP_TURNS + 1))),
        "a turn without its engine": edit(lambda d: d["turns"][0].pop("engine")),
        "a file too big": lambda document: json.dumps(document).encode() + b" " * (MAX_FILE_BYTES + 1),
    }


@pytest.mark.parametrize("name", list(_damaged()))
def test_a_file_that_is_not_the_ledgers_holds_every_engine_never_a_total_of_zero(path, clock, name):
    good = _document(path, clock)
    path.write_bytes(_damaged()[name](json.loads(json.dumps(good))))
    before = path.read_bytes()
    ledger = Ledger(path, now=clock)
    hold = ledger.hold(LIMITS)
    assert hold is not None and (hold.kind, hold.why, hold.until) == (UNKNOWN, FILE, None)
    assert "damaged or unreadable" in ledger.problems[0]
    ledger.record("gw", turn(cost=0.2), "EUR")  # a turn that was running when the file was found bad
    assert path.read_bytes() == before  # the file is never written over: it may be what the person is mending
    assert ledger.hold(LIMITS).why == FILE


def test_a_directory_where_the_file_should_be_is_the_same(path, clock):
    path.mkdir(parents=True)
    assert Ledger(path, now=clock).hold(LIMITS).why == FILE


def test_mending_the_file_lifts_the_hold_without_a_restart_and_keeps_what_it_says(path, clock):
    good = _document(path, clock)
    good_bytes = path.read_bytes()
    path.write_bytes(b"{broken")
    ledger = Ledger(path, now=clock)
    assert ledger.hold(LIMITS).why == FILE
    path.write_bytes(good_bytes)
    assert ledger.hold(LIMITS) is None and ledger.problems == ()
    assert ledger.view("gw", LIMITS)["day"]["spent"] == 0.3  # what the mended file says, not zero
    assert saved(path) == good


def test_deleting_the_file_is_how_the_ledger_is_reset_and_needs_no_restart(path, clock):
    _document(path, clock)
    path.write_bytes(b"{broken")
    ledger = Ledger(path, now=clock)
    assert ledger.hold(LIMITS).why == FILE
    path.unlink()
    assert ledger.hold(LIMITS) is None  # the person's own reset: counting starts again from nothing
    ledger.record("gw", turn(cost=0.2), "EUR")
    assert saved(path)["days"]["2026-11-14"]["gw"]["cost"] == "0.2"


def test_a_file_that_stays_bad_is_one_warning_not_one_per_check(path, clock, caplog):
    path.parent.mkdir(parents=True)
    path.write_bytes(b"{broken")
    ledger = Ledger(path, now=clock)
    with caplog.at_level("WARNING", logger="freeduet.ledger"):
        for _ in range(5):
            ledger.hold(LIMITS)
    assert len([record for record in caplog.records if "damaged" in record.getMessage()]) == 1


def test_a_file_that_cannot_be_read_holds_the_engines(path, clock, monkeypatch):
    path.parent.mkdir(parents=True)
    path.write_text("{}")

    def refuse(*args, **kwargs):
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr(ledger_module, "open", refuse, raising=False)  # the module's own open(), whoever runs the suite
    hold = Ledger(path, now=clock).hold(LIMITS)
    assert (hold.kind, hold.why) == (UNKNOWN, FILE)


def test_a_path_that_cannot_be_opened_at_all_holds_the_engines(tmp_path, clock):
    blocker = tmp_path / "blocker"
    blocker.write_text("a file where the folder should be")
    assert Ledger(blocker / "engine-ledger.json", now=clock).hold(LIMITS).why == FILE


# ── A write that fails ─────────────────────────────────────────────────────────────────────────────


def test_what_cannot_be_written_down_holds_the_engines_until_it_can(path, clock, monkeypatch):
    real_replace, disk = os.replace, {"full": True}

    def replace(source, target):
        if disk["full"]:
            raise OSError(errno.ENOSPC, "No space left on device")
        return real_replace(source, target)

    monkeypatch.setattr(os, "replace", replace)
    ledger = Ledger(path, now=clock)
    ledger.record("gw", turn(cost=0.2), "EUR")
    hold = ledger.hold(LIMITS)
    assert (hold.kind, hold.why, hold.until) == (UNKNOWN, UNSAVED, None) and "not written" in ledger.problems[0]
    assert not path.exists() and [entry.name for entry in path.parent.iterdir()] == []  # and no temporary file is left
    disk["full"] = False  # the disk has room again
    assert ledger.hold(LIMITS) is None and ledger.problems == ()
    assert saved(path)["days"]["2026-11-14"]["gw"]["cost"] == "0.2"  # the turn was kept in memory and is now written


# ── The currency of the limits ─────────────────────────────────────────────────────────────────────


def test_limits_in_another_currency_than_the_totals_hold_the_engines(path, clock):
    first = Ledger(path, now=clock)
    first.record("gw", turn(cost=0.3), "EUR")
    hold = Ledger(path, now=clock).hold(Limits("USD", Decimal("1"), Decimal("10")))
    assert (hold.kind, hold.why) == (UNKNOWN, CURRENCY)


# ── The words ──────────────────────────────────────────────────────────────────────────────────────


def test_each_hold_has_a_plain_english_sentence_without_a_path(path, clock):
    ledger = Ledger(path, now=clock)
    ledger.record("gw", turn(cost=1.0), "EUR")
    daily = ledger.hold(LIMITS).sentence("gw")
    assert daily == "gw reached the daily limit you set (1.00 EUR). It runs again from 2026-11-15 00:00 UTC."
    for _ in range(9):
        ledger.record("gw", turn(cost=1.0), "EUR")
    assert ledger.hold(LIMITS).sentence("gw") == (
        "gw reached the monthly limit you set (10.00 EUR). It runs again from 2026-12-01 00:00 UTC."
    )
    unknown = Ledger(path.parent / "other.json", now=clock)
    unknown.record("gw", turn(cost=None), "EUR")
    sentence = unknown.hold(LIMITS).sentence("gw")
    assert "did not report what a turn cost" in sentence and "delete other.json" in sentence and str(path.parent) not in sentence
    assert ledger_module.__doc__ and "NEVER \"ZERO SPENT\"" in ledger_module.__doc__
