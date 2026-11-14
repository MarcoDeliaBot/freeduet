"""engine_errors.py: what an engine's own error text says about its usage limit, rate limit or credits.

The GOLDEN table holds what main returns for every text the suite uses (string constants in the other
test modules and every string in the fixtures) and for the normal waits below. It was generated from
unmodified main before the hardening, so a change that alters what a person is told shows here.
"""

import ast
import json
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from freeduet.engine_errors import RATE_LIMIT, classify

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


def _docstring_nodes(tree):
    """Docstrings are not texts any test passes to classify, so the scan leaves them out."""
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                found.add(first.value)
    return found


def _suite_texts():
    """Every string constant in the other test modules (docstrings aside), and every string in the fixtures."""
    texts = set()
    for path in TESTS.glob("*.py"):
        if path.name != Path(__file__).name:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            skipped = _docstring_nodes(tree)
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str) and node not in skipped:
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

# (kind, said, resets_at) that classify(text, now=NOW) returns, generated from unmodified main (origin/main);
# None where main returns None. The three absurd waits main raised on are pinned to the fixed behaviour.
GOLDEN = {
    ' usage limit': ('usage_limit', 'usage limit', None),
    ' usage limit ': ('usage_limit', 'usage limit', None),
    '429': ('rate_limit', '429', None),
    '429 Too Many Requests, try again in 45s': ('rate_limit', '429 Too Many Requests, try again in 45s', '2026-11-14T10:00:45+00:00'),
    '429 {"error":{"type":"rate_limit"}} at line 3': ('rate_limit', '429 {"error":{"type":"rate_limit"}} at line 3', None),
    '<html>\n  <body>Too many requests</body>\n</html>': ('rate_limit', '<html> <body>Too many requests</body> </html>', None),
    '<html>429</html>': ('rate_limit', '<html>429</html>', None),
    'Claude AI usage limit reached|': ('usage_limit', 'Claude AI usage limit reached|', None),
    'Claude AI usage limit reached|1760000000': ('usage_limit', 'Claude AI usage limit reached', None),
    'Claude AI usage limit reached|4102444800': ('usage_limit', 'Claude AI usage limit reached', '2100-01-01T00:00:00+00:00'),
    'Error code: 429 - insufficient_quota': ('credits', 'Error code: 429 - insufficient_quota', None),
    'Rate limit reached. Please try again in 20s.': ('rate_limit', 'Rate limit reached. Please try again in 20s.', '2026-11-14T10:00:20+00:00'),
    'Rate limit reached. Retry after 90 seconds': ('rate_limit', 'Rate limit reached. Retry after 90 seconds', '2026-11-14T10:01:30+00:00'),
    'Rate limit. Retry after 90 seconds': ('rate_limit', 'Rate limit. Retry after 90 seconds', '2026-11-14T10:01:30+00:00'),
    'Too Many Requests': ('rate_limit', 'Too Many Requests', None),
    'Usage limit reached. Try again in 3 days 2 hours': ('usage_limit', 'Usage limit reached. Try again in 3 days 2 hours', '2026-11-17T12:00:00+00:00'),
    'User rate limit exceeded.': ('rate_limit', 'User rate limit exceeded.', None),
    "You've hit your session limit · resets 3pm": ('usage_limit', "You've hit your session limit · resets 3pm", None),
    "You've hit your usage limit.": ('usage_limit', "You've hit your usage limit.", None),
    "You've hit your weekly limit": ('usage_limit', "You've hit your weekly limit", None),
    "You've hit your weekly limit · resets 3pm": ('usage_limit', "You've hit your weekly limit · resets 3pm", None),
    "You've hit your weekly limit · resets in 4h": ('usage_limit', "You've hit your weekly limit · resets in 4h", '2026-11-14T14:00:00+00:00'),
    'Your credit balance is too low to access the API': ('credits', 'Your credit balance is too low to access the API', None),
    'a status alone (RFC 6585, 429)': ('rate_limit', 'a status alone (RFC 6585, 429)', None),
    'a status alone (RFC 9110, 402)': ('credits', 'a status alone (RFC 9110, 402)', None),
    'http-200-that-says-rate-limit': ('rate_limit', 'http-200-that-says-rate-limit', None),
    'http-402-bare': ('credits', 'http-402-bare', None),
    'http-403-that-is-a-rate-limit': ('rate_limit', 'http-403-that-is-a-rate-limit', None),
    'http-429-bare': ('rate_limit', 'http-429-bare', None),
    'http-429-insufficient-quota': ('rate_limit', 'http-429-insufficient-quota', None),
    'http-429-rate-limited': ('rate_limit', 'http-429-rate-limited', None),
    'http-429-retry-after-seconds': ('rate_limit', 'http-429-retry-after-seconds', None),
    'http-429-usage-limit': ('rate_limit', 'http-429-usage-limit', None),
    'insufficient_quota': ('credits', 'insufficient_quota', None),
    'out of extra usage, try again in 12 mins': ('usage_limit', 'out of extra usage, try again in 12 mins', '2026-11-14T10:12:00+00:00'),
    'rate limit': ('rate_limit', 'rate limit', None),
    'rate limit ': ('rate_limit', 'rate limit', None),
    'rate limit exceeded': ('rate_limit', 'rate limit exceeded', None),
    'rate limit, resets in ': ('rate_limit', 'rate limit, resets in', None),
    'rate limit, try again in ': ('rate_limit', 'rate limit, try again in', None),
    'rate limit, try again in 0s': ('rate_limit', 'rate limit, try again in 0s', None),
    'rate limit, try again in 1 day and 12 hours': ('rate_limit', 'rate limit, try again in 1 day and 12 hours', '2026-11-15T22:00:00+00:00'),
    'rate limit, try again in 1.5 hours': ('rate_limit', 'rate limit, try again in 1.5 hours', '2026-11-14T11:30:00+00:00'),
    'rate limit, try again in 12 days x 2 s': ('rate_limit', 'rate limit, try again in 12 days x 2 s', '2026-11-26T10:00:00+00:00'),
    'rate limit, try again in 1d 1h 1m 1s': ('rate_limit', 'rate limit, try again in 1d 1h 1m 1s', '2026-11-15T11:01:01+00:00'),
    'rate limit, try again in 1x': ('rate_limit', 'rate limit, try again in 1x', None),
    'rate limit, try again in 2 hr, 15 min and 30 seconds': ('rate_limit', 'rate limit, try again in 2 hr, 15 min and 30 seconds', '2026-11-14T12:15:30+00:00'),
    'rate limit, try again in 20s': ('rate_limit', 'rate limit, try again in 20s', '2026-11-14T10:00:20+00:00'),
    'rate limit, try again in 250 ms': ('rate_limit', 'rate limit, try again in 250 ms', '2026-11-14T10:00:00.250000+00:00'),
    'rate limit, try again in 3 days 2 hours': ('rate_limit', 'rate limit, try again in 3 days 2 hours', '2026-11-17T12:00:00+00:00'),
    'rate limit, try again in 3.5.1s': ('rate_limit', 'rate limit, try again in 3.5.1s', None),
    'rate limit, try again in 30 days': ('rate_limit', 'rate limit, try again in 30 days', '2026-12-14T10:00:00+00:00'),
    'rate limit, try again in 5 minutes. Then 3 more mins': ('rate_limit', 'rate limit, try again in 5 minutes. Then 3 more mins', '2026-11-14T10:05:00+00:00'),
    'rate limit, try again in 5 mo': ('rate_limit', 'rate limit, try again in 5 mo', None),
    'rate limit, try again in 9999999 days': ('rate_limit', 'rate limit, try again in 9999999 days', None),
    'rate limit, try again in 9999999999 days': ('rate_limit', 'rate limit, try again in 9999999999 days', None),
    'rate limit, try again in 99999999999999 days': ('rate_limit', 'rate limit, try again in 99999999999999 days', None),
    'rate limited': ('rate_limit', 'rate limited', None),
    'rate_limit': ('rate_limit', 'rate_limit', None),
    'usage limit': ('usage_limit', 'usage limit', None),
    'usage limit ': ('usage_limit', 'usage limit', None),
    'usage limit reached, resets in 1 hour': ('usage_limit', 'usage limit reached, resets in 1 hour', '2026-11-14T11:00:00+00:00'),
    'usage limit reached|9999999999': ('usage_limit', 'usage limit reached', '2286-11-20T17:46:39+00:00'),
    'words-429-in-json': ('rate_limit', 'words-429-in-json', None),
    'words-rate-limit': ('rate_limit', 'words-rate-limit', None),
    '|9999999999 usage limit': ('usage_limit', ' usage limit', '2286-11-20T17:46:39+00:00'),
}


def test_every_text_the_suite_uses_reads_as_on_main():
    texts = _suite_texts()
    assert {"usage limit", "rate_limit"} <= texts  # the scan reaches the suite's own strings
    for text in sorted(texts):
        got = _shape(classify(text, now=NOW))
        if text in GOLDEN:
            assert got == GOLDEN[text], f"{text!r} reads as {got}, GOLDEN has {GOLDEN[text]}"
        else:
            assert got is None, (
                f"{text!r} reads as {got} but has no GOLDEN entry: generate its result from unmodified "
                "main (origin/main) and add it to GOLDEN"
            )


@pytest.mark.parametrize("text", NORMAL_WAITS)
def test_a_normal_wait_reads_as_on_main(text):
    assert _shape(classify(text, now=NOW)) == GOLDEN[text]


def test_an_engine_reset_time_still_wins_over_the_text():
    for text in ("You've hit your session limit · resets 3pm", "usage limit"):
        limit = classify(text, resets_at=ENGINE_RESETS, now=NOW)
        assert limit.resets_at == datetime(2100, 1, 1, tzinfo=UTC)


# A wait over the 30-day cap, or too large to count, is no usable reset time (never an exception).
ABSURD_WAITS = [
    pytest.param("rate limit, try again in 99999999999999 days", id="days_too_large_to_count"),
    pytest.param("rate limit, try again in 1" + "0" * 400 + "s", id="seconds_infinite"),
    pytest.param("rate limit, try again in " + "9" * 200_000 + " days", id="absurd_digits_200k_days"),
    pytest.param("rate limit, try again in 31 days", id="31_days"),
    pytest.param("rate limit, try again in 30 days and 1 second", id="30_days_and_1_second"),
    pytest.param("rate limit, try again in 99999999 s", id="99999999_seconds"),
]


@pytest.mark.parametrize("text", ABSURD_WAITS)
def test_a_wait_over_the_cap_is_no_usable_time_and_does_not_raise(text):
    limit = classify(text, now=NOW)
    assert limit.kind == RATE_LIMIT
    assert limit.resets_at is None


def test_a_reset_number_no_date_can_hold_is_no_usable_time_and_does_not_raise():
    assert classify("rate limit", resets_at=1e300, now=NOW).resets_at is None
    assert classify("rate limit", resets_at=float("inf"), now=NOW).resets_at is None
    # the wait in the text still counts when the engine's number cannot be a date
    assert classify("rate limit, try again in 20s", resets_at=1e300, now=NOW).resets_at == NOW + timedelta(seconds=20)


# Hostile text, each case finishing in well under 0.5 s with a rate limit read from it.
HOSTILE = [
    pytest.param("rate limit, try again in " + "9" * 200_000 + "x", id="digits_200k"),
    pytest.param("rate limit, try again in 1." + "2" * 200_000 + "x", id="decimal_digits_200k"),
    pytest.param("rate limit, try again in 1" + " " * 200_000 + "!", id="spaces_after_number_200k"),
    pytest.param("rate limit, try again" + " " * 200_000 + "in 5 s", id="spaces_between_words_200k"),
    pytest.param("rate limit, try again in " + "1d " * 100_000, id="day_units_100k"),
    pytest.param("rate limit, try again in 1" + "ms" * 100_000, id="ms_letters_100k"),
    pytest.param("rate limit, try again in " + "1x " * 100_000, id="non_unit_letters_100k"),
    pytest.param("rate limit " + "word " * 200_000, id="words_1mb"),
    pytest.param("rate limit " + "try again in 5s " * 70_000, id="repeated_waits_1mb"),
]


@pytest.mark.parametrize("text", HOSTILE)
def test_hostile_text_is_read_in_linear_time(text):
    started = time.perf_counter()
    limit = classify(text, now=NOW)
    elapsed = time.perf_counter() - started
    assert elapsed < 0.5, f"{elapsed:.3f} s"
    assert limit is not None and limit.kind == RATE_LIMIT
