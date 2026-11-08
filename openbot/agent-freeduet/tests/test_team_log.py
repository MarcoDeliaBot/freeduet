"""The team log (team_log.py): whole lines under a lock, rotation, and the reads Iris makes."""

import datetime as dt
import json
import multiprocessing
import threading

import pytest

from freeduet import team_log


def entry(member="bookkeeper", outcome="done", summary="Invoice drafted", **changes):
    return team_log.make_entry(
        member=member, thread="thread-1", run="run-1", outcome=outcome, summary=summary,
        from_iris=changes.pop("from_iris", None), approvals=changes.pop("approvals", None),
        report_guard=changes.pop("report_guard", None),
    ) | changes


def lines(root):
    return (root / team_log.LOG_NAME).read_text(encoding="utf-8").splitlines()


def test_one_line_per_entry_with_the_documented_fields(tmp_path):
    team_log.append(entry(from_iris=True, approvals=["apr_1"]), root=tmp_path)
    [line] = lines(tmp_path)
    record = json.loads(line)
    assert set(record) == {
        "time", "member", "thread", "run", "outcome", "summary", "from_iris", "approvals", "report_guard",
    }
    assert record["time"].endswith("Z") and record["from_iris"] is True and record["approvals"] == ["apr_1"]
    assert record["report_guard"] is None
    assert oct((tmp_path / team_log.LOG_NAME).stat().st_mode & 0o777) == "0o600"


def test_report_guard_is_null_added_or_failed():
    assert entry(report_guard="added")["report_guard"] == "added"
    assert entry(report_guard="failed")["report_guard"] == "failed"
    with pytest.raises(ValueError):
        entry(report_guard="yes")


def test_entries_are_redacted_and_checked():
    record = entry(summary="Logged in with password: hunter22 and card 4111 1111 1111 1111")
    assert "hunter22" not in record["summary"] and "4111" not in record["summary"]
    with pytest.raises(ValueError):
        entry(outcome="great")


def _write_many(root: str, worker: int, count: int) -> None:
    from pathlib import Path

    for index in range(count):
        team_log.append({"time": team_log.now_iso(), "member": f"m{worker}", "n": index, "pad": "x" * 6000}, root=Path(root))


def test_concurrent_appends_never_interleave(tmp_path):
    threads = [threading.Thread(target=_write_many, args=(str(tmp_path), worker, 40)) for worker in range(8)]
    # spawn, not fork: a child forked while a thread holds a lock would inherit it held.
    processes = [multiprocessing.get_context("spawn").Process(target=_write_many, args=(str(tmp_path), 100 + worker, 40)) for worker in range(4)]
    for job in [*threads, *processes]:
        job.start()
    for job in [*threads, *processes]:
        job.join(60)
    for process in processes:
        assert process.exitcode == 0
    records = [json.loads(line) for line in lines(tmp_path)]  # every line is whole JSON
    assert len(records) == 12 * 40
    for worker in [*range(8), *range(100, 104)]:
        assert sorted(r["n"] for r in records if r["member"] == f"m{worker}") == list(range(40))


def test_the_log_rotates_past_its_cap_and_reads_cover_both_files(tmp_path, monkeypatch):
    monkeypatch.setattr(team_log, "MAX_BYTES", 2000)
    for index in range(12):
        team_log.append(entry(summary=f"piece {index} " + "x" * 150), root=tmp_path)
    assert (tmp_path / team_log.ROTATED_NAME).exists()
    assert (tmp_path / team_log.LOG_NAME).stat().st_size <= 2000
    found = team_log.read(limit=100, root=tmp_path)
    assert found["matching"] >= 6  # the current file and the one before it


def test_reads_filter_and_put_the_newest_first(tmp_path):
    now = dt.datetime.now(dt.timezone.utc)
    old = (now - dt.timedelta(days=3)).isoformat().replace("+00:00", "Z")
    team_log.append(entry(member="inbox", outcome="failed", time=old), root=tmp_path)
    team_log.append(entry(member="bookkeeper", outcome="blocked"), root=tmp_path)
    team_log.append(entry(member="bookkeeper", outcome="done"), root=tmp_path)
    everything = team_log.read(root=tmp_path)
    assert [e["outcome"] for e in everything["entries"]] == ["done", "blocked", "failed"]
    assert [e["member"] for e in team_log.read(member="inbox", root=tmp_path)["entries"]] == ["inbox"]
    assert [e["outcome"] for e in team_log.read(outcome="blocked", root=tmp_path)["entries"]] == ["blocked"]
    assert team_log.read(since="24h", root=tmp_path)["matching"] == 2
    assert team_log.read(since=(now - dt.timedelta(days=7)).date().isoformat(), root=tmp_path)["matching"] == 3
    assert team_log.read(limit=1, root=tmp_path) | {"entries": None} == {"entries": None, "matching": 3, "shown": 1}


@pytest.mark.parametrize("arguments", [{"limit": 0}, {"limit": 101}, {"outcome": "great"}, {"since": "last week"}])
def test_bad_reads_are_refused(tmp_path, arguments):
    with pytest.raises(ValueError):
        team_log.read(root=tmp_path, **arguments)


def test_an_empty_log_reads_as_nothing(tmp_path):
    assert team_log.read(root=tmp_path) == {"entries": [], "matching": 0, "shown": 0}
