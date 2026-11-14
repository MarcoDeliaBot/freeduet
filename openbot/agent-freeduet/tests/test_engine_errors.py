"""engine_errors.py: what an engine's own error text says about its usage limit, rate limit or credits.

The GOLDEN table holds what main returns for every text the suite uses (string constants in the other
test modules and every string in the fixtures) and for the normal waits below. It was generated from
unmodified main before the hardening, so a change that alters what a person is told shows here.
"""

import ast
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from freeduet.engine_errors import classify

TESTS = Path(__file__).resolve().parent
NOW = datetime(2026, 11, 14, 10, 0, tzinfo=UTC)
ENGINE_RESETS = 4102444800.0  # 2100-01-01 UTC, the reset the usage_limit fixture gives


def _shape(limit):
    if limit is None:
        return None
    return (limit.kind, limit.said, limit.resets_at.isoformat() if limit.resets_at else None)


def _strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _strings(key)
            yield from _strings(value)
    elif isinstance(node, list):
        for item in node:
            yield from _strings(item)


def _suite_texts():
    """Every string constant in the other test modules, and every string in the fixtures."""
    texts = set()
    for path in TESTS.glob("*.py"):
        if path.name != Path(__file__).name:
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    texts.add(node.value)
    for path in (TESTS / "fixtures").iterdir():
        raw = path.read_text(encoding="utf-8")
        if path.suffix == ".jsonl":
            for line in raw.splitlines():
                if line.strip():
                    texts.update(_strings(json.loads(line)))
        elif path.suffix == ".json":
            texts.update(_strings(json.loads(raw)))
        else:
            texts.update(raw.splitlines())
    return texts


NORMAL_WAITS = [
    "rate limit, try again in 20s",
    "Rate limit reached. Retry after 90 seconds",
    "rate limit, try again in 3 days 2 hours",
    "rate limit, try again in 1.5 hours",
    "rate limit, try again in 250 ms",
    "rate limit, try again in 2 hr, 15 min and 30 seconds",
    "rate limit, try again in 1 day and 12 hours",
    "rate limit, try again in 30 days",
    "rate limit, try again in 0s",
    "rate limit, try again in 5 minutes. Then 3 more mins",
    "You've hit your weekly limit · resets in 4h",
    "usage limit reached, resets in 1 hour",
    "429 Too Many Requests, try again in 45s",
    "rate limit, try again in 3.5.1s",
    "rate limit, try again in 1d 1h 1m 1s",
    "rate limit, try again in 12 days x 2 s",
    "rate limit, try again in 1x",
    "rate limit, try again in 5 mo",
    "out of extra usage, try again in 12 mins",
    "Claude AI usage limit reached|4102444800",
    "Claude AI usage limit reached|1760000000",
]

# (kind, said, resets_at) that classify(text, now=NOW) returns on main; None where it returns None.
GOLDEN = {
    "You've hit your session limit · resets 3pm": ("usage_limit", "You've hit your session limit · resets 3pm", None),
    "rate_limit": ("rate_limit", "rate_limit", None),
    "usage limit": ("usage_limit", "usage limit", None),
    "rate limit, try again in 20s": ("rate_limit", "rate limit, try again in 20s", "2026-11-14T10:00:20+00:00"),
    "Rate limit reached. Retry after 90 seconds": ("rate_limit", "Rate limit reached. Retry after 90 seconds", "2026-11-14T10:01:30+00:00"),
    "rate limit, try again in 3 days 2 hours": ("rate_limit", "rate limit, try again in 3 days 2 hours", "2026-11-17T12:00:00+00:00"),
    "rate limit, try again in 1.5 hours": ("rate_limit", "rate limit, try again in 1.5 hours", "2026-11-14T11:30:00+00:00"),
    "rate limit, try again in 250 ms": ("rate_limit", "rate limit, try again in 250 ms", "2026-11-14T10:00:00.250000+00:00"),
    "rate limit, try again in 2 hr, 15 min and 30 seconds": ("rate_limit", "rate limit, try again in 2 hr, 15 min and 30 seconds", "2026-11-14T12:15:30+00:00"),
    "rate limit, try again in 1 day and 12 hours": ("rate_limit", "rate limit, try again in 1 day and 12 hours", "2026-11-15T22:00:00+00:00"),
    "rate limit, try again in 30 days": ("rate_limit", "rate limit, try again in 30 days", "2026-12-14T10:00:00+00:00"),
    "rate limit, try again in 0s": ("rate_limit", "rate limit, try again in 0s", None),
    "rate limit, try again in 5 minutes. Then 3 more mins": ("rate_limit", "rate limit, try again in 5 minutes. Then 3 more mins", "2026-11-14T10:05:00+00:00"),
    "You've hit your weekly limit · resets in 4h": ("usage_limit", "You've hit your weekly limit · resets in 4h", "2026-11-14T14:00:00+00:00"),
    "usage limit reached, resets in 1 hour": ("usage_limit", "usage limit reached, resets in 1 hour", "2026-11-14T11:00:00+00:00"),
    "429 Too Many Requests, try again in 45s": ("rate_limit", "429 Too Many Requests, try again in 45s", "2026-11-14T10:00:45+00:00"),
    "rate limit, try again in 3.5.1s": ("rate_limit", "rate limit, try again in 3.5.1s", None),
    "rate limit, try again in 1d 1h 1m 1s": ("rate_limit", "rate limit, try again in 1d 1h 1m 1s", "2026-11-15T11:01:01+00:00"),
    "rate limit, try again in 12 days x 2 s": ("rate_limit", "rate limit, try again in 12 days x 2 s", "2026-11-26T10:00:00+00:00"),
    "rate limit, try again in 1x": ("rate_limit", "rate limit, try again in 1x", None),
    "rate limit, try again in 5 mo": ("rate_limit", "rate limit, try again in 5 mo", None),
    "out of extra usage, try again in 12 mins": ("usage_limit", "out of extra usage, try again in 12 mins", "2026-11-14T10:12:00+00:00"),
    "Claude AI usage limit reached|4102444800": ("usage_limit", "Claude AI usage limit reached", "2100-01-01T00:00:00+00:00"),
    "Claude AI usage limit reached|1760000000": ("usage_limit", "Claude AI usage limit reached", None),
}


def test_every_text_the_suite_uses_reads_as_on_main():
    texts = _suite_texts()
    assert {"usage limit", "rate_limit"} <= texts  # the scan reaches the suite's own strings
    for text in sorted(texts):
        assert _shape(classify(text, now=NOW)) == GOLDEN.get(text), text


@pytest.mark.parametrize("text", NORMAL_WAITS)
def test_a_normal_wait_reads_as_on_main(text):
    assert _shape(classify(text, now=NOW)) == GOLDEN[text]


def test_an_engine_reset_time_still_wins_over_the_text():
    for text in ("You've hit your session limit · resets 3pm", "usage limit"):
        limit = classify(text, resets_at=ENGINE_RESETS, now=NOW)
        assert limit.resets_at == datetime(2100, 1, 1, tzinfo=UTC)
