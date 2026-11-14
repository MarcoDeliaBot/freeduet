"""engine_state.py: the engine breaker wired for recording (docs/ENGINES_PLAN.md slice 2, decision E4).

Unit tests on a fake clock, a temp directory and a stub engine: nothing here starts the CLI, reads a login or
touches a file of the service. The same wiring through the real app and the fake CLI is in
test_engine_state_app.py, and the proof that no turn changes whatever the breaker says is in
test_engine_state_neutral.py.

The limit and the sign-in come from the recorded fixtures `usage_limit.jsonl` and `not_signed_in.jsonl`, read
by the same parser and the same function (`claude_cli.turn_failure`) a real turn is read by.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from freeduet import claude_cli, claude_engine, engine_state
from freeduet.engine_adapter import (
    COULD_NOT_RUN,
    UNREADABLE,
    EngineAdapter,
    Health,
    Outcome,
    ProbeResult,
    Usage,
)
from freeduet.engine_breaker import (
    CORRUPT,
    DEGRADED,
    EMPTY,
    HALF_OPEN,
    MISSING,
    OPEN,
    READY,
    SIGNED_OUT,
    FileStore,
    Record,
)
from freeduet.engine_state import EngineRow, EngineState, RecordedEngine, StateSnapshot
from freeduet.failure_classifier import AUTH, CREDITS, RATE_LIMIT, REJECTED, TRANSIENT, UNKNOWN, USAGE_LIMIT, Failure
from freeduet.stream_json import StreamParser

KEY = "claude-code"
NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)
FIXTURES = Path(__file__).parent / "fixtures"
REPO_ROOT = Path(__file__).resolve().parents[3]
# Things that must never reach the state file or the snapshot: a key, an account, a prompt.
CANARIES = ("sk-ant-api03-CANARY", "person@example.invalid", "Example Organisation", "the-prompt-the-person-wrote")


class Clock:
    def __init__(self, at: datetime = NOW):
        self.at = at

    def __call__(self) -> datetime:
        return self.at

    def advance(self, **span) -> None:
        self.at += timedelta(**span)


class Stub(EngineAdapter):
    """An engine that does what a test tells it, and says how the turn went through `health`."""

    key, label, kind, capabilities = KEY, "Claude Code", "cli", frozenset({"tools"})

    def __init__(self, act=None, probed=None):
        self.act, self.probed = act, probed
        self.turns = 0

    def child_env(self, source=None):
        return {"ONLY": "this"}

    async def probe(self):
        if isinstance(self.probed, Exception):
            raise self.probed
        return self.probed if self.probed is not None else ProbeResult(installed=True, version="1.2.3", signed_in=True)

    async def run_turn(self, ctx, sink, gate):
        self.turns += 1
        return await self.act(ctx) if self.act else Outcome()


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def path(tmp_path):
    return tmp_path / "data" / "engine-state.json"


def make(path, clock, **kwargs) -> EngineState:
    state = EngineState(FileStore(path), now=clock, **kwargs)
    state.register(Stub())
    return state


def row(state: EngineState) -> EngineRow:
    (only,) = state.snapshot().engines
    return only


def record(state: EngineState, health: Health, *, ticket=...):
    """One turn on the engine, from its start to its end."""
    given = state.begin(KEY) if ticket is ... else ticket
    state.finish(KEY, given, health)
    return given


def parsed(name: str) -> StreamParser:
    parser = StreamParser()
    for line in (FIXTURES / name).read_text().splitlines():
        parser.feed(line)
    return parser


def saved(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# ── What a turn is recorded as ──────────────────────────────────────────────────────────────────


def test_a_new_state_is_ready_and_nothing_has_been_written(path, clock):
    state = make(path, clock)
    assert (row(state).state, row(state).available, row(state).consecutive_failures) == (READY, True, 0)
    assert not path.exists()


def test_a_turn_that_answered_is_a_success_and_writes_nothing(path, clock):
    state = make(path, clock)
    record(state, Health(answered=True))
    assert row(state).state == READY and not path.exists()


def test_a_usage_limit_with_a_stated_reset_opens_the_engine_until_exactly_then(path, clock):
    state = make(path, clock)
    reset = NOW + timedelta(hours=5)
    record(state, Health(failure=Failure(USAGE_LIMIT, reset)))
    shown = row(state)
    assert (shown.state, shown.limited_until, shown.last_failure_kind, shown.available) == (OPEN, reset, USAGE_LIMIT, False)
    assert saved(path)["engines"][KEY]["limited_until"] == reset.isoformat()


@pytest.mark.parametrize("kind", [RATE_LIMIT, USAGE_LIMIT, CREDITS])
def test_every_limit_opens_it_and_with_no_time_stated_the_wait_is_a_minute(path, clock, kind):
    state = make(path, clock)
    record(state, Health(failure=Failure(kind)))
    assert (row(state).state, row(state).limited_until) == (OPEN, NOW + timedelta(minutes=1))


def test_a_sign_in_failure_signs_the_engine_out_with_no_timer(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(AUTH)))
    assert (row(state).state, row(state).limited_until, row(state).last_failure_kind) == (SIGNED_OUT, None, AUTH)
    clock.advance(days=400)
    assert row(state).state == SIGNED_OUT and state.begin(KEY) is None


def test_transient_failures_degrade_it_and_the_third_in_a_row_opens_it(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(TRANSIENT)))
    record(state, Health(failure=Failure(TRANSIENT)))
    assert (row(state).state, row(state).available) == (DEGRADED, True)
    record(state, Health(failure=Failure(TRANSIENT)))
    assert row(state).state == OPEN


@pytest.mark.parametrize("kind", [REJECTED, UNKNOWN])
def test_a_refused_request_and_an_unrecognised_failure_are_not_the_engines_health(path, clock, kind):
    state = make(path, clock)
    for _ in range(5):
        record(state, Health(failure=Failure(kind)))
    assert (row(state).state, row(state).consecutive_failures, row(state).last_failure_kind) == (READY, 0, None)
    assert not path.exists()


def test_a_failure_outweighs_an_answer_a_limit_after_the_first_words_is_still_a_limit(path, clock):
    state = make(path, clock)
    record(state, Health(answered=True, failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=1))))
    assert row(state).state == OPEN


def test_a_success_returns_a_degraded_engine_to_ready(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(TRANSIENT)))
    record(state, Health(answered=True))
    assert (row(state).state, row(state).consecutive_failures) == (READY, 0)


def test_a_turn_that_said_nothing_changes_nothing_and_frees_a_half_open_probe(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(RATE_LIMIT)))
    clock.advance(minutes=2)
    assert row(state).state == HALF_OPEN
    probe = state.begin(KEY)
    assert probe is not None and probe.probe and state.begin(KEY) is None  # the slot is taken
    state.finish(KEY, probe, Health())  # it could not start, or the segment stopped it before it spoke
    assert row(state).state == HALF_OPEN and state.begin(KEY) is not None  # the slot is free again


def test_the_half_open_turn_is_the_probe_a_success_closes_it_and_a_failure_opens_it_again(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(RATE_LIMIT)))
    clock.advance(minutes=2)
    record(state, Health(failure=Failure(RATE_LIMIT)))
    assert (row(state).state, row(state).limited_until) == (OPEN, clock.at + timedelta(minutes=2))  # the guess doubled
    clock.advance(minutes=3)
    record(state, Health(answered=True))
    assert (row(state).state, row(state).consecutive_failures) == (READY, 0)


# ── A turn that ran although the breaker handed no ticket ───────────────────────────────────────
# Nothing skips a turn yet, so one can run while the engine is open or signed out. Recording only.


def test_while_open_no_ticket_is_handed_and_a_turn_that_runs_anyway_moves_nothing(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=2))))
    assert state.begin(KEY) is None
    before = row(state)
    record(state, Health(answered=True), ticket=None)
    record(state, Health(failure=Failure(RATE_LIMIT)), ticket=None)
    record(state, Health(), ticket=None)
    assert row(state) == before


def test_an_engine_that_answers_while_it_is_signed_out_is_signed_in(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(AUTH)))
    record(state, Health(answered=True), ticket=None)  # the person signed in, in a terminal
    assert (row(state).state, row(state).consecutive_failures, row(state).last_failure_kind) == (READY, 0, None)
    assert saved(path)["engines"][KEY]["state"] == READY


def test_a_failure_while_signed_out_moves_nothing(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(AUTH)))
    before = row(state)
    record(state, Health(failure=Failure(AUTH)), ticket=None)
    record(state, Health(), ticket=None)
    assert row(state) == before


# ── What the recorded fixtures say ──────────────────────────────────────────────────────────────


def test_the_recorded_usage_limit_opens_the_engine_until_the_time_it_stated(path):
    clock = Clock(datetime(2099, 12, 31, 19, 0, tzinfo=UTC))  # five hours before the fixture's resetsAt (2100-01-01)
    state = make(path, clock)
    failure = claude_cli.turn_failure(parsed("usage_limit.jsonl"))
    assert failure == Failure(USAGE_LIMIT, datetime(2100, 1, 1, tzinfo=UTC))
    record(state, Health(failure=failure))
    assert (row(state).state, row(state).limited_until) == (OPEN, datetime(2100, 1, 1, tzinfo=UTC))


def test_the_recorded_limit_a_century_away_is_capped_at_thirty_days_like_any_stated_wait(path, clock):
    state = make(path, clock)
    record(state, Health(failure=claude_cli.turn_failure(parsed("usage_limit.jsonl"))))
    assert row(state).limited_until == NOW + timedelta(days=30)


def test_the_recorded_sign_in_failure_signs_the_engine_out(path, clock):
    state = make(path, clock)
    failure = claude_cli.turn_failure(parsed("not_signed_in.jsonl"))
    assert failure == Failure(AUTH)
    record(state, Health(failure=failure))
    assert row(state).state == SIGNED_OUT


# ── The CLI's own account of a turn: claude_cli.turn_failure and what the engine notes ─────────


def test_a_result_that_succeeded_is_no_failure():
    parser = StreamParser()
    parser.feed(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "Done."}))
    assert claude_cli.turn_failure(parser) is None


@pytest.mark.parametrize(
    "stderr, exit_code, kind",
    [
        ("usage limit", 1, USAGE_LIMIT),
        ("Invalid API key · Please run /login", 1, AUTH),
        ("something broke", 3, UNKNOWN),
        ("", 2, UNKNOWN),
        ("rate limit exceeded", 1, RATE_LIMIT),
    ],
)
def test_a_stream_with_no_result_is_read_from_what_the_cli_said_on_stderr(stderr, exit_code, kind):
    assert claude_cli.turn_failure(StreamParser(), stderr, exit_code).kind == kind


def test_the_verdict_is_the_one_a_person_is_told_about_sign_in_before_a_limit():
    # The words of a sign-in failure and of a limit together: the person is told to sign in, so that is recorded.
    # (Two texts the suite already pins in test_engine_errors.py's table, so that table needs no new entry.)
    said = "Please run /login. " + "usage limit"
    assert claude_cli.turn_failure(StreamParser(), said, 1).kind == AUTH
    assert claude_cli.failure_event(StreamParser(), said, 1)["code"] == claude_cli.AUTH_REQUIRED


def test_the_engine_notes_a_result_line_in_the_health_of_the_turn():
    health = Health()
    claude_engine.note_result(health, parsed("usage_limit.jsonl"))
    assert health.failure.kind == USAGE_LIMIT and health.answered is False
    health = Health(answered=True)  # text had already come
    claude_engine.note_result(health, parsed("not_signed_in.jsonl"))
    assert health.failure.kind == AUTH and health.answered is True  # a failure outweighs it, later
    parser, health = StreamParser(), Health()
    parser.feed(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "Hi"}))
    claude_engine.note_result(health, parser)
    assert (health.failure, health.answered) == (None, True)


def test_the_engine_notes_the_end_of_a_stream_with_no_result_but_never_over_a_result():
    health = Health()
    claude_engine.note_stream_end(health, StreamParser(), "usage limit", 1)
    assert health.failure.kind == USAGE_LIMIT
    health = Health()
    claude_engine.note_stream_end(health, parsed("usage_limit.jsonl"), "Invalid API key · Please run /login", 1)
    assert health.failure is None  # the result line already said how it went; nothing is added to it


def test_noting_never_raises_whatever_the_parser_holds():
    health = Health()
    claude_engine.note_result(health, object())
    claude_engine.note_stream_end(health, object(), "x", 1)
    assert (health.failure, health.answered) == (None, False)


# ── Persisted limited-until (E4) ────────────────────────────────────────────────────────────────


def test_a_limit_survives_a_restart_and_is_open_in_the_new_process(path, clock):
    first = make(path, clock)
    reset = NOW + timedelta(hours=5)
    record(first, Health(failure=Failure(USAGE_LIMIT, reset)))
    second = make(path, clock)  # a new process: nothing in memory, only the file
    shown = row(second)
    assert (shown.state, shown.limited_until, shown.last_failure_kind, shown.consecutive_failures) == (OPEN, reset, USAGE_LIMIT, 1)
    assert second.begin(KEY) is None
    clock.advance(hours=5, seconds=1)
    probe = second.begin(KEY)
    assert probe is not None and probe.probe
    second.finish(KEY, probe, Health(answered=True))
    assert row(second).state == READY and saved(path)["engines"][KEY]["state"] == READY
    assert row(make(path, clock)).state == READY


def test_a_limit_that_ran_out_while_the_service_was_down_is_half_open_not_ready(path, clock):
    record(make(path, clock), Health(failure=Failure(RATE_LIMIT)))
    clock.advance(days=3)
    assert row(make(path, clock)).state == HALF_OPEN


def test_signed_out_and_degraded_survive_a_restart_too(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(TRANSIENT)))
    assert (row(make(path, clock)).state, row(make(path, clock)).consecutive_failures) == (DEGRADED, 1)
    record(state, Health(failure=Failure(AUTH)))
    assert row(make(path, clock)).state == SIGNED_OUT


def test_a_missing_file_starts_clean_and_is_named_in_the_problems(path, clock):
    state = make(path, clock)
    assert state.snapshot().problems == (MISSING,) and row(state).state == READY


def test_an_empty_file_starts_clean_and_is_named(path, clock):
    path.parent.mkdir(parents=True)
    path.write_text("  \n")
    state = make(path, clock)
    assert state.snapshot().problems == (EMPTY,) and row(state).state == READY


@pytest.mark.parametrize(
    "content",
    ["{not json", "[1, 2]", '{"version": 99, "engines": {}}', '{"version": 1}', '{"version": 1, "engines": []}', "\x00\x01\x02", "[" * 50_000],
    ids=["syntax", "list", "version", "no-engines", "engines-list", "bytes", "nested"],
)
def test_a_corrupt_file_starts_clean_is_named_and_is_replaced_by_the_next_change(path, clock, content):
    path.parent.mkdir(parents=True)
    path.write_text(content)
    state = make(path, clock)
    assert state.snapshot().problems == (CORRUPT,) and row(state).state == READY
    record(state, Health(failure=Failure(RATE_LIMIT)))
    assert saved(path)["version"] == 1 and saved(path)["engines"][KEY]["state"] == OPEN  # a good file again


def test_a_record_that_is_not_a_record_starts_that_engine_clean(path, clock):
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"version": 1, "engines": {KEY: {"state": "exploded", "limited_until": None}}}))
    state = make(path, clock)
    assert row(state).state == READY and "records dropped" in state.snapshot().problems


def test_a_path_that_cannot_be_written_never_reaches_a_turn_and_is_named(tmp_path, clock):
    blocked = tmp_path / "a-file"
    blocked.write_text("x")
    state = EngineState(FileStore(blocked / "engine-state.json"), now=clock)  # a file where a folder should be
    state.register(Stub())
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=1))))
    assert row(state).state == OPEN  # in memory, whatever the disk says
    assert "file not written" in state.snapshot().problems


def test_the_file_holds_only_the_engine_id_the_state_the_time_and_counters(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=5))))
    document = saved(path)
    assert set(document) == {"version", "engines"} and document["version"] == 1
    assert set(document["engines"]) == {KEY}
    assert document["engines"][KEY] == {
        "state": OPEN,
        "limited_until": (NOW + timedelta(hours=5)).isoformat(),
        "consecutive_failures": 1,
        "opens": 1,
        "last_failure_kind": USAGE_LIMIT,
    }


def test_no_engine_text_and_no_secret_is_ever_written_to_the_file_or_the_snapshot(path, clock):
    """Whatever an engine printed is not in a Failure, a Health, a ProbeResult, the file or the snapshot: they
    have no field for it. The canaries go in everywhere an engine could put them."""
    said = f"usage limit {CANARIES[0]} for {CANARIES[1]} at {CANARIES[2]} while writing {CANARIES[3]}. Try again in 20s"
    parser = StreamParser()
    parser.feed(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": said}))
    failure = claude_cli.turn_failure(parser, said, 1)
    assert failure.kind in (USAGE_LIMIT, RATE_LIMIT)
    state = make(path, clock)
    record(state, Health(failure=failure))
    state.apply_probe(KEY, ProbeResult(installed=True, version="2.1.311", signed_in=True))
    written = path.read_bytes().decode()
    shown = json.dumps(state.snapshot().as_json())
    for canary in CANARIES:
        assert canary not in written and canary not in shown and canary not in repr(failure)
    assert set(saved(path)["engines"][KEY]) == {"state", "limited_until", "consecutive_failures", "opens", "last_failure_kind"}
    assert set(Failure.__dataclass_fields__) == {"kind", "retry_at"}
    # `usage` (the spend ledger's input) is numbers and a currency code: the same guard holds for it, field by field.
    assert set(Health.__dataclass_fields__) == {"answered", "failure", "usage"}
    assert set(Usage.__dataclass_fields__) == {"input_tokens", "output_tokens", "cost", "currency"}


# ── Recording never fails a turn ────────────────────────────────────────────────────────────────


def test_a_state_that_raises_is_one_warning_and_no_change_to_the_turn(path, clock, monkeypatch, caplog):
    state = make(path, clock)

    def explode(key):
        raise RuntimeError("registry on fire")

    monkeypatch.setattr(state._registry, "get", explode)
    with caplog.at_level(logging.WARNING, logger="freeduet"):
        assert state.begin(KEY) is None
        state.finish(KEY, None, Health(answered=True))
        state.apply_probe(KEY, ProbeResult(signed_in=False))
    assert len([r for r in caplog.records if r.name == "freeduet.engine_state"]) == 3


def test_a_health_of_garbage_and_a_foreign_ticket_never_raise(path, clock):
    state = make(path, clock)
    other = make(path.with_name("other.json"), clock)
    foreign = other.begin(KEY)
    state.finish(KEY, foreign, Health(answered=True))
    state.finish(KEY, "not a ticket", Health(failure="a string", answered=object()))
    state.finish(KEY, None, None)
    state.finish(None, None, Health())
    assert row(state).state == READY


def test_a_store_that_raises_never_stops_the_state(clock):
    class Broken:
        def load(self, engine_id):
            raise OSError("disk gone")

        def save(self, engine_id, record):
            raise OSError("disk gone")

    state = EngineState(Broken(), now=clock)
    state.register(Stub())
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=1))))
    assert row(state).state == OPEN and state.snapshot().problems == ()


# ── The probe, applied ──────────────────────────────────────────────────────────────────────────


def test_a_probe_that_sees_no_sign_in_signs_the_engine_out_and_one_that_sees_it_signs_it_in(path, clock):
    state = make(path, clock)
    state.apply_probe(KEY, ProbeResult(installed=True, version="2.1.311", signed_in=False))
    shown = row(state)
    assert (shown.state, shown.available, shown.signed_in, shown.installed, shown.version) == (SIGNED_OUT, False, False, True, "2.1.311")
    assert shown.last_failure_kind == AUTH and shown.probed_at == NOW and shown.probe_problem is None
    assert saved(path)["engines"][KEY]["state"] == SIGNED_OUT
    clock.advance(minutes=5)
    state.apply_probe(KEY, ProbeResult(installed=True, version="2.1.311", signed_in=True))
    shown = row(state)
    assert (shown.state, shown.available, shown.signed_in, shown.probed_at) == (READY, True, True, clock.at)


def test_a_probe_that_could_not_tell_moves_nothing_and_says_why(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=3))))
    before = row(state)
    state.apply_probe(KEY, ProbeResult(installed=True, signed_in=None, problem=UNREADABLE))
    shown = row(state)
    assert (shown.state, shown.limited_until) == (before.state, before.limited_until)
    assert (shown.signed_in, shown.probe_problem, shown.installed) == (None, UNREADABLE, True)


def test_a_probe_that_sees_a_sign_in_does_not_lift_a_limit(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=3))))
    state.apply_probe(KEY, ProbeResult(installed=True, version="1", signed_in=True))
    assert row(state).state == OPEN


def test_an_engine_that_is_not_installed_is_not_available_though_its_breaker_is_ready(path, clock):
    state = make(path, clock)
    state.apply_probe(KEY, ProbeResult(installed=False, problem="not installed"))
    shown = row(state)
    assert (shown.state, shown.available, shown.installed) == (READY, False, False)


def test_a_probe_applied_runs_the_engines_own_probe_and_keeps_what_it_found(path, clock):
    state = make(path, clock)
    result = asyncio.run(state.probe(Stub(probed=ProbeResult(installed=True, version="9.9.9", signed_in=False))))
    assert result.signed_in is False and row(state).state == SIGNED_OUT and row(state).version == "9.9.9"


@pytest.mark.parametrize("bad", [RuntimeError("boom"), "not a result", 42])
def test_a_probe_that_raises_or_answers_garbage_is_could_not_run(path, clock, bad):
    state = make(path, clock)
    result = asyncio.run(state.probe(Stub(probed=bad)))
    assert result == ProbeResult(problem=COULD_NOT_RUN)
    assert (row(state).state, row(state).probe_problem, row(state).signed_in) == (READY, COULD_NOT_RUN, None)


def test_a_probe_changes_no_file_when_nothing_changed(path, clock):
    state = make(path, clock)
    state.apply_probe(KEY, ProbeResult(installed=True, version="1", signed_in=True))
    assert not path.exists()


# ── The snapshot: the agent's side of GET /api/freeduet/engines ─────────────────────────────────


def test_a_fresh_snapshot_has_exactly_these_fields_for_the_one_engine_the_service_runs(path, clock):
    snapshot = make(path, clock).snapshot()
    assert isinstance(snapshot, StateSnapshot)
    assert snapshot.as_json() == {
        "engines": [
            {
                "id": KEY, "label": "Claude Code", "kind": "cli", "state": "ready", "available": True,
                "limited_until": None, "last_failure_kind": None, "consecutive_failures": 0,
                "installed": None, "version": None, "signed_in": None, "probed_at": None, "probe_problem": None,
            }
        ],
        "problems": [MISSING],
    }


def test_the_snapshot_is_plain_json_with_times_in_utc(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(USAGE_LIMIT, NOW + timedelta(hours=5, minutes=30))))
    state.apply_probe(KEY, ProbeResult(installed=True, version="2.1.311", signed_in=True))
    shown = json.loads(json.dumps(state.snapshot().as_json()))["engines"][0]
    assert shown["limited_until"] == "2026-11-14T17:30:00+00:00" and shown["probed_at"] == "2026-11-14T12:00:00+00:00"


def test_the_snapshot_lists_an_engine_before_its_first_turn_and_every_engine_registered(path, clock):
    class Other(Stub):
        key, label, kind = "other", "Other", "api"

    state = make(path, clock)
    state.register(Other())
    assert [(shown.id, shown.label, shown.kind) for shown in state.snapshot().engines] == [(KEY, "Claude Code", "cli"), ("other", "Other", "api")]


def test_the_snapshot_moves_an_open_engine_to_half_open_when_its_time_has_passed_without_writing(path, clock):
    state = make(path, clock)
    record(state, Health(failure=Failure(RATE_LIMIT)))
    saves = path.stat().st_mtime_ns
    clock.advance(minutes=2)
    assert row(state).state == HALF_OPEN and row(state).available is True
    assert path.stat().st_mtime_ns == saves  # reading the state writes nothing


# ── The wrapper ─────────────────────────────────────────────────────────────────────────────────


def test_the_recorded_engine_is_the_same_engine_to_everyone_else(path, clock):
    state = make(path, clock)
    inner = Stub()
    wrapped = state.recorded(inner)
    assert isinstance(wrapped, RecordedEngine) and isinstance(wrapped, EngineAdapter)
    assert (wrapped.key, wrapped.label, wrapped.kind, wrapped.capabilities) == (inner.key, inner.label, inner.kind, inner.capabilities)
    assert wrapped.child_env({"A": "b"}) == {"ONLY": "this"}
    assert asyncio.run(wrapped.probe()) == ProbeResult(installed=True, version="1.2.3", signed_in=True)
    assert row(state).state == READY  # a probe through the wrapper is a plain probe: it records nothing


def test_a_turn_is_recorded_when_it_ends_by_what_the_engine_said_about_it(path, clock):
    async def act(ctx):
        ctx.diagnostics.health.failure = Failure(USAGE_LIMIT, NOW + timedelta(hours=2))
        return Outcome({"type": "RUN_ERROR"})

    state = make(path, clock)
    ctx = type("Ctx", (), {"diagnostics": type("D", (), {"health": Health()})()})()
    outcome = asyncio.run(state.recorded(Stub(act)).run_turn(ctx, None, None))
    assert outcome == Outcome({"type": "RUN_ERROR"}) and row(state).state == OPEN


def test_a_turn_that_raises_raises_the_same_and_is_still_recorded(path, clock):
    async def act(ctx):
        ctx.diagnostics.health.answered = True
        raise ValueError("the engine crashed")

    state = make(path, clock)
    record(state, Health(failure=Failure(TRANSIENT)))
    ctx = type("Ctx", (), {"diagnostics": type("D", (), {"health": Health()})()})()
    with pytest.raises(ValueError, match="the engine crashed"):
        asyncio.run(state.recorded(Stub(act)).run_turn(ctx, None, None))
    assert row(state).state == READY  # it had answered before it crashed


def test_a_turn_the_segment_cancels_is_recorded_as_far_as_the_engine_got(path, clock):
    async def act(ctx):
        ctx.diagnostics.health.failure = Failure(USAGE_LIMIT, NOW + timedelta(hours=1))
        await asyncio.sleep(60)  # the segment ended on a tool call, or timed out, and stopped the engine

    async def drive():
        ctx = type("Ctx", (), {"diagnostics": type("D", (), {"health": Health()})()})()
        task = asyncio.create_task(state.recorded(Stub(act)).run_turn(ctx, None, None))
        await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    state = make(path, clock)
    asyncio.run(drive())
    assert row(state).state == OPEN


# ── Where the file lives ────────────────────────────────────────────────────────────────────────


def test_the_file_is_in_the_data_directory_by_default(monkeypatch, tmp_path):
    monkeypatch.delenv(engine_state.STATE_FILE_ENV, raising=False)
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path / "volume"))
    assert engine_state.state_file() == tmp_path / "volume" / "engine-state.json"
    monkeypatch.delenv("FREEDUET_DATA_DIR")
    assert engine_state.state_file() == Path("/data/engine-state.json")


def test_the_variable_names_the_file_and_a_bare_name_is_a_file_of_the_data_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path / "volume"))
    monkeypatch.setenv(engine_state.STATE_FILE_ENV, str(tmp_path / "elsewhere" / "state.json"))
    assert engine_state.state_file() == tmp_path / "elsewhere" / "state.json"
    monkeypatch.setenv(engine_state.STATE_FILE_ENV, "state.json")  # never the working folder: it may be a checkout
    assert engine_state.state_file() == tmp_path / "volume" / "state.json"
    monkeypatch.setenv(engine_state.STATE_FILE_ENV, "  ")
    assert engine_state.state_file() == tmp_path / "volume" / "engine-state.json"


def test_a_setting_that_cannot_be_read_is_not_a_reason_not_to_start(monkeypatch, tmp_path):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path / "volume"))
    monkeypatch.setenv(engine_state.STATE_FILE_ENV, "~no-such-user-on-this-machine-7d1e/state.json")
    assert engine_state.state_file() == tmp_path / "volume" / "engine-state.json"


def test_the_default_file_is_never_in_the_repository(monkeypatch):
    monkeypatch.delenv(engine_state.STATE_FILE_ENV, raising=False)
    monkeypatch.delenv("FREEDUET_DATA_DIR", raising=False)
    assert REPO_ROOT not in engine_state.state_file().parents and Path.cwd() not in engine_state.state_file().parents


def test_from_the_environment_the_state_keeps_its_file_there_and_lists_the_engines_it_is_given(monkeypatch, tmp_path):
    monkeypatch.setenv(engine_state.STATE_FILE_ENV, str(tmp_path / "volume" / "kept.json"))
    state = engine_state.from_environment(Stub())
    assert [shown.id for shown in state.snapshot().engines] == [KEY] and state.snapshot().problems == (MISSING,)
    state.finish(KEY, state.begin(KEY), Health(failure=Failure(AUTH)))
    assert json.loads((tmp_path / "volume" / "kept.json").read_text())["engines"][KEY]["state"] == SIGNED_OUT
    assert engine_state.from_environment(Stub())._registry.get(KEY).snapshot().state == SIGNED_OUT  # a restart


def test_a_record_the_store_holds_is_what_the_new_state_starts_from(path, clock):
    FileStore(path).save(KEY, Record(OPEN, NOW + timedelta(hours=1), 2, 2, RATE_LIMIT))
    assert (row(make(path, clock)).state, row(make(path, clock)).consecutive_failures) == (OPEN, 2)
