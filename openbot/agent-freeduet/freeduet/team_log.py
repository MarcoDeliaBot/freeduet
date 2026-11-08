"""The team log (docs/M1_PLAN.md D15): one JSON line per segment, for Iris to read.

`<FREEDUET_DATA_DIR>/team-log.jsonl`, one object per line:

    {"time": "2026-11-08T09:14:03.120Z", "member": "bookkeeper", "thread": "...", "run": "...",
     "outcome": "done", "summary": "Invoice INV-12 drafted for ACME", "from_iris": true,
     "approvals": ["5b1f..."], "report_guard": null}

`outcome` is one of done, partly done, in progress, blocked, failed, needs you (the member's report;
in progress also when there is no report: the segment ended on a tool call or answered a question)
or error. `from_iris` is true when Iris handed the work over, false when she did not, null when that
cannot be known (freeduet/origin.py). `approvals` holds the approval ids the report's "Already" line
names, the string "nothing", or null when the segment had no "Already" line. `report_guard` is null
when the member wrote its own report or none was due, "added" when the turn ended without one and
the report guard asked for it (freeduet/report_guard.py), and "failed" when the guard asked and got no
complete report, so the turn ended without one.

Each line is written whole, with O_APPEND and under a lock, so segments running side by side never
interleave. Past 10 MB the file moves to `team-log.1.jsonl` (replacing the one before) and a new one
starts; reads cover both. The summary and the approvals are redacted with the checkpoint writer's
rules. The log holds FreeDuet's own records only, never the person's mail or documents.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from pathlib import Path

from . import checkpoints, report
from .locking import locked

LOG_NAME = "team-log.jsonl"
ROTATED_NAME = "team-log.1.jsonl"
LOCK_NAME = ".team-log.lock"
MAX_BYTES = 10 * 1024 * 1024
MAX_ID = 200
DEFAULT_LIMIT = 20
MAX_LIMIT = 100
LOG_OUTCOMES = (*report.OUTCOMES, report.ERROR)  # report.OUTCOMES holds report.IN_PROGRESS
_RELATIVE = re.compile(r"\s*(\d{1,5})\s*([mhd])\s*", re.IGNORECASE)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _root() -> Path:
    return checkpoints._data_root(checkpoints.default_root())


REPORT_GUARD_VALUES = ("added", "failed")


def make_entry(*, member, thread, run, outcome, summary, from_iris, approvals, report_guard=None) -> dict:
    if outcome not in LOG_OUTCOMES:
        raise ValueError(f"outcome must be one of {', '.join(LOG_OUTCOMES)}")
    if report_guard is not None and report_guard not in REPORT_GUARD_VALUES:
        raise ValueError(f"report_guard must be null or one of {', '.join(REPORT_GUARD_VALUES)}")
    if isinstance(approvals, list):
        approvals = [checkpoints.redact(value) for value in approvals]
    return {
        "time": now_iso(),
        "member": str(member)[:MAX_ID],
        "thread": str(thread)[:MAX_ID],
        "run": str(run)[:MAX_ID],
        "outcome": outcome,
        "summary": checkpoints.redact(str(summary))[: report.MAX_SUMMARY],
        "from_iris": from_iris if isinstance(from_iris, bool) else None,
        "approvals": approvals,
        "report_guard": report_guard,
    }


def append(entry: dict, root: Path | None = None) -> Path:
    """Append one entry as one line. Returns the log's path."""
    base = checkpoints._data_root(root) if root is not None else _root()
    line = (json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    path = base / LOG_NAME
    with locked(base / LOCK_NAME):
        try:
            size = path.stat().st_size
        except FileNotFoundError:
            size = 0
        if size and size + len(line) > MAX_BYTES:
            os.replace(path, base / ROTATED_NAME)
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        try:
            view = memoryview(line)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
        finally:
            os.close(fd)
    return path


def parse_since(value, now: dt.datetime | None = None) -> dt.datetime | None:
    """An ISO date or time (UTC when it names no zone), or a span back from now: 30m, 24h, 7d."""
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError("since must be a string")
    now = now or dt.datetime.now(dt.timezone.utc)
    relative = _RELATIVE.fullmatch(value)
    if relative:
        amount, unit = int(relative.group(1)), relative.group(2).lower()
        span = {"m": "minutes", "h": "hours", "d": "days"}[unit]
        return now - dt.timedelta(**{span: amount})
    try:
        moment = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("since must be an ISO date or time, or a span such as 24h or 7d") from None
    return moment if moment.tzinfo else moment.replace(tzinfo=dt.timezone.utc)


def _entries(base: Path):
    for name in (ROTATED_NAME, LOG_NAME):
        try:
            with open(base / name, encoding="utf-8") as stream:
                for line in stream:
                    try:
                        entry = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(entry, dict) and isinstance(entry.get("time"), str):
                        yield entry
        except FileNotFoundError:
            continue


def read(*, since=None, member=None, outcome=None, limit=DEFAULT_LIMIT, root: Path | None = None) -> dict:
    """Matching entries, newest first, at most `limit` (1 to 100)."""
    start = parse_since(since)
    if outcome is not None and outcome not in LOG_OUTCOMES:
        raise ValueError(f"outcome must be one of {', '.join(LOG_OUTCOMES)}")
    if member is not None and not isinstance(member, str):
        raise ValueError("member must be a member id, such as bookkeeper")
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be a whole number from 1 to {MAX_LIMIT}")
    base = checkpoints._data_root(root) if root is not None else _root()
    matching = []
    for entry in _entries(base):
        if member and entry.get("member") != member:
            continue
        if outcome and entry.get("outcome") != outcome:
            continue
        if start is not None:
            try:
                if parse_since(entry["time"]) < start:
                    continue
            except ValueError:
                continue
        matching.append(entry)
    # Newest first; within the same millisecond, the later line is the newer one.
    order = sorted(range(len(matching)), key=lambda index: (matching[index]["time"], index), reverse=True)
    matching = [matching[index] for index in order]
    return {"entries": matching[:limit], "matching": len(matching), "shown": min(limit, len(matching))}
