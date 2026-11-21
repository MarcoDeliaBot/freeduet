"""The token counter (D102, usage_counter.py): what each engine reported per turn, kept per member, engine and UTC day.

The numbers come from the recorded stream `gateway_usage.jsonl` (the CLI's own usage block: 1234 + 10 + 20 given, 56 written,
10 cached written, 20 cached read), through the real service and the fake CLI. A turn that reported nothing is "not reported",
never zero. Counts only: no text, no key.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from freeduet import usage_counter
from freeduet.engine_adapter import Health, Usage
from freeduet.stream_json import StreamParser
from freeduet.usage_counter import TokenCounter
from helpers import MANAGED_TOKEN, post_run, run_body, standing

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
NOON = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)


def parsed(name: str) -> StreamParser:
    parser = StreamParser()
    for line in (Path(__file__).parent / "fixtures" / name).read_bytes().splitlines():
        parser.feed(line)
    return parser


def test_the_parser_reads_given_written_and_cached_tokens_from_the_recorded_stream():
    parser = parsed("gateway_usage.jsonl")
    assert parser.usage() == (1264, 56)  # 1234 + 10 + 20 given (cached ones included), 56 written
    assert parser.cache_usage() == (20, 10)  # read, written


def test_a_stream_with_no_usage_block_reports_nothing():
    parser = StreamParser()
    parser.feed(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "Hi"}))
    assert parser.usage() is None and parser.cache_usage() is None


def test_a_turn_adds_to_its_member_engine_and_day(tmp_path):
    counter = TokenCounter(tmp_path / "u.json", now=lambda: NOON)
    counter.record("creator", "claude-code", Usage(100, 20, cache_read_tokens=30, cache_write_tokens=5))
    counter.record("creator", "claude-code", Usage(10, 2))
    (row,) = counter.view()["rows"]
    assert (row["member"], row["engine"]) == ("creator", "claude-code")
    assert row["today"] == {
        "turns": 2, "reported_turns": 2, "input_tokens": 110, "output_tokens": 22, "cache_read_tokens": 30, "cache_write_tokens": 5,
        "seconds": 0,
    }
    assert row["week"] == row["today"]


def test_an_engine_that_reported_nothing_is_a_turn_and_not_tokens(tmp_path):
    counter = TokenCounter(tmp_path / "u.json", now=lambda: NOON)
    counter.record("chef", "local-model", None)
    (row,) = counter.view()["rows"]
    assert (row["today"]["turns"], row["today"]["reported_turns"], row["today"]["input_tokens"]) == (1, 0, 0)


def test_days_are_utc_and_the_week_is_the_seven_utc_days_ending_today(tmp_path):
    counter = TokenCounter(tmp_path / "u.json", now=lambda: NOON)
    late = datetime(2026, 11, 20, 23, 59, tzinfo=UTC)  # yesterday in UTC, whatever the person's clock says
    for at, given in [(late, 1), (NOON - timedelta(days=6), 2), (NOON - timedelta(days=7), 4), (NOON, 8)]:
        counter.record("m", "e", Usage(given, 0), at=at)
    view = counter.view()
    (row,) = view["rows"]
    assert view["timezone"] == "UTC" and view["today"] == "2026-11-21"
    assert row["today"]["input_tokens"] == 8
    assert row["week"]["input_tokens"] == 1 + 2 + 8  # the eighth day back is outside the window
    (total,) = view["engines"]
    assert total["engine"] == "e" and total["week"]["input_tokens"] == 11


def test_it_survives_a_restart_and_keeps_only_counts(tmp_path):
    path = tmp_path / "u.json"
    TokenCounter(path, now=lambda: NOON).record("m", "e", Usage(7, 3))
    assert TokenCounter(path, now=lambda: NOON).view()["rows"][0]["today"]["input_tokens"] == 7
    assert set(json.loads(path.read_text())) == {"version", "days"}


def test_a_damaged_file_is_said_and_never_overwritten(tmp_path):
    path = tmp_path / "u.json"
    path.write_text("{not json")
    counter = TokenCounter(path, now=lambda: NOON)
    counter.record("m", "e", Usage(1, 1))
    assert counter.view()["problem"] is True and counter.view()["rows"] == []
    assert path.read_text() == "{not json"


def test_a_turn_that_started_nothing_is_not_counted(tmp_path, monkeypatch):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    usage_counter.note_turn("m", "e", Health())
    assert not (tmp_path / usage_counter.FILE_NAME).exists()


@pytest.fixture
def stored(client, fake_cli):
    return fake_cli.data_dir / usage_counter.FILE_NAME


def test_a_member_turn_through_the_service_is_counted_and_read_back(client, fake_cli, stored):
    fake_cli.plan([{"replay": "gateway_usage.jsonl"}])
    post_run(client, run_body(ASK))
    body = client.get("/engines/usage", headers=AUTH).json()
    (row,) = body["rows"]
    assert row["engine"] == "claude-code"
    assert row["today"]["input_tokens"] == 1264 and row["today"]["output_tokens"] == 56
    assert (row["today"]["cache_read_tokens"], row["today"]["cache_write_tokens"]) == (20, 10)
    assert "Write the plan" not in stored.read_text()  # counts only


def test_a_service_turn_that_reports_no_usage_is_not_reported(client, fake_cli):
    fake_cli.plan([{"text": "Hello there."}])
    post_run(client, run_body(ASK))
    (row,) = client.get("/engines/usage", headers=AUTH).json()["rows"]
    assert (row["today"]["turns"], row["today"]["reported_turns"]) == (1, 0)


def test_the_route_needs_the_server_token(client):
    assert client.get("/engines/usage").status_code == 401


# ── D126: the time of each attempt, and what counts as saved ─────────────────────────────────────────────────


def test_an_attempt_adds_its_wall_clock_seconds_per_day_member_and_engine(tmp_path):
    counter = TokenCounter(tmp_path / "u.json", now=lambda: NOON)
    counter.record("m", "e", Usage(1, 1), seconds=61.4)
    counter.record("m", "e", None, seconds=120)
    counter.record("m", "e", Usage(1, 1), seconds=30, at=NOON - timedelta(days=3))
    counter.record("m", "e", None, seconds=9999, at=NOON - timedelta(days=9))  # outside the week
    (row,) = counter.view()["rows"]
    assert row["today"]["seconds"] == 61 + 120 and row["week"]["seconds"] == 61 + 120 + 30
    (total,) = counter.view()["engines"]
    assert total["today"]["seconds"] == 181 and total["week"]["seconds"] == 211


@pytest.mark.parametrize("bad", [-5, float("nan"), "soon", None])
def test_a_time_that_cannot_be_trusted_adds_nothing(tmp_path, bad):
    counter = TokenCounter(tmp_path / "u.json", now=lambda: NOON)
    counter.record("m", "e", Usage(1, 1), seconds=bad)
    (row,) = counter.view()["rows"]
    assert row["today"]["turns"] == 1 and row["today"]["seconds"] == 0


def test_the_file_keeps_seconds_and_stays_strict_about_them(tmp_path):
    path = tmp_path / "u.json"
    TokenCounter(path, now=lambda: NOON).record("m", "e", None, seconds=42)
    document = json.loads(path.read_text())
    assert document["days"]["2026-11-21"]["m"]["e"]["seconds"] == 42
    for broken in (-1, "42", True, 1.5):
        document["days"]["2026-11-21"]["m"]["e"]["seconds"] = broken
        path.write_text(json.dumps(document))
        assert TokenCounter(path, now=lambda: NOON).problem is True
    del document["days"]["2026-11-21"]["m"]["e"]["seconds"]  # a count that is missing is a damaged file, not a guess
    path.write_text(json.dumps(document))
    assert TokenCounter(path, now=lambda: NOON).problem is True


class _Clock:
    """A fake monotonic clock that moves only when the test says so."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_a_segment_is_timed_from_its_start_to_its_end_with_a_fake_clock(client, fake_cli, monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(usage_counter, "monotonic", clock)
    started = []
    real = usage_counter.note_turn

    def note(member, engine, health, seconds=0):
        started.append(seconds)
        real(member, engine, health, seconds)

    monkeypatch.setattr(usage_counter, "note_turn", note)
    fake_cli.plan([{"text": "Hello there."}])
    post_run(client, run_body(ASK))
    assert started == [0.0]  # the fake clock never moved, whatever the real one did
    (row,) = client.get("/engines/usage", headers=AUTH).json()["rows"]
    assert row["today"]["seconds"] == 0 and row["today"]["turns"] == 1


def test_the_service_records_the_seconds_the_clock_gave(client, fake_cli, monkeypatch):
    ticks = iter([1000.0, 1000.0 + 125.0])
    monkeypatch.setattr(usage_counter, "monotonic", lambda: next(ticks))
    fake_cli.plan([{"text": "Hello there."}])
    post_run(client, run_body(ASK))
    (row,) = client.get("/engines/usage", headers=AUTH).json()["rows"]
    assert row["today"]["seconds"] == 125 and row["today"]["reported_turns"] == 0  # time, and no tokens made up


def _engine(**kw):
    from freeduet.engines import Engine

    return Engine(**{"id": "x", "kind": "anthropic-compatible", "billing": "free", "tier": "C", **kw})


@pytest.mark.parametrize(
    ("engine", "expected"),
    [
        (_engine(base_url="https://openrouter.ai/api", model="vendor/model:free"), "free_cloud"),
        (_engine(base_url="http://localhost:3002", router=True), "free_cloud"),  # a router such as FreeLLMAPI
        (_engine(base_url="http://localhost:11434", no_key=True), "local"),  # Ollama
        (_engine(kind="cli", billing="subscription", base_url=None), "login"),
        (_engine(base_url="https://gateway.example", billing="metered"), "metered"),
    ],
)
def test_the_class_of_an_engine_is_the_engine_modules_own(monkeypatch, engine, expected):
    from freeduet import engines as engines_module

    config = engines_module.EnginesConfig(
        engines={"x": engine}, metered=engines_module.Metered(), chains={}, quality_floor={}, assistants=engines_module.Assistants()
    )
    monkeypatch.setattr(engines_module, "load_engines", lambda *a, **k: config)
    assert usage_counter.engine_class("x") == expected
    assert usage_counter.engine_class("not-in-the-file") == "other"


def test_the_view_carries_the_class_and_an_unknown_class_is_other(tmp_path):
    counter = TokenCounter(tmp_path / "u.json", now=lambda: NOON)
    counter.record("m", "ollama", None, seconds=2400)
    counter.record("m", "plan", Usage(5, 5), seconds=10)
    kinds = {"ollama": "local", "plan": "surprise"}
    view = counter.view(classify=kinds.__getitem__)
    assert {row["engine"]: row["class"] for row in view["rows"]} == {"ollama": "local", "plan": "other"}
    assert {row["engine"]: row["class"] for row in view["engines"]} == {"ollama": "local", "plan": "other"}
    (local,) = [row for row in view["rows"] if row["engine"] == "ollama"]
    assert local["week"]["seconds"] == 2400 and local["week"]["reported_turns"] == 0 and local["week"]["input_tokens"] == 0
