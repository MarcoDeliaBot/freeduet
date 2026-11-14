"""failure_classifier.py: which kind of failure an engine reported, and when it said it would be back.

docs/ENGINES_PLAN.md section 2 ("Limit classifier") and section 8 ("a bare 429 is not a quota"). The
module is a pure function and is not wired into any run path, so nothing here starts an engine, opens a
socket or reads a login.

Where each text comes from. Every case of CASES carries `source`: a file and the lines of this repository
where the text, and the status when the case has one, stand as written there, or `synthetic: ...` when the
case is built for this test and no provider was recorded saying it (an HTTP status or a header with no body,
a sentence put together around a wait phrase the repository quotes, a repository text under a status made up
for it). A synthetic case shows how the classifier reads a shape, never what a provider really sends: the
plan keeps the exact error text of every engine but Claude Code as [verify].
"""

from __future__ import annotations

import ast
import re
import time
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from pathlib import Path
from typing import NamedTuple

import httpx
import pytest

from freeduet import engine_errors, failure_classifier
from freeduet.failure_classifier import (
    AUTH,
    CREDITS,
    KINDS,
    LIMIT_KINDS,
    RATE_LIMIT,
    REJECTED,
    TRANSIENT,
    UNKNOWN,
    USAGE_LIMIT,
    Failure,
    classify_failure,
    parse_retry_after,
)
from freeduet.stream_json import StreamParser

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = PACKAGE_ROOT / "tests" / "fixtures"

#: The test clock. Nothing below reads the real one except the one test that says so.
NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)


def at(**span) -> datetime:
    return NOW + timedelta(**span)


# ── The cases ────────────────────────────────────────────────────────────────────────────────────

SYNTHETIC = "synthetic: "
ROOT = "openbot/agent-freeduet"
ENGINE_ERRORS = f"{ROOT}/freeduet/engine_errors.py"
ASK_RS = "openbot/desktop/src-tauri/src/ask.rs"
TASK_TURN = "openbot/server/tests/openduet-task-turn.test.ts"
TITLER = "openbot/server/tests/channel-titler.test.ts"
RUN_LIFECYCLE = "openbot/app/src/lib/channels/run-lifecycle.ts"
RUN_LIFECYCLE_TEST = "openbot/app/tests/run-lifecycle.test.ts"
GOOGLE_REST = "openbot/server/tests/google-workspace-rest.test.ts"
IN_AN_HOUR = int(at(hours=1).timestamp())


def fixture(name: str, lines: str) -> str:
    return f"{ROOT}/tests/fixtures/{name}:{lines}"


class Case(NamedTuple):
    id: str
    source: str
    given: dict
    kind: str
    retry_at: datetime | None = None


CASES = [
    # Claude Code prints its words and has no HTTP status.
    Case("claude-session-limit", fixture("usage_limit.jsonl", "3"),
         {"text": "You've hit your session limit · resets 3pm"}, USAGE_LIMIT),
    Case("claude-weekly-limit", f"{ENGINE_ERRORS}:25",
         {"text": "You've hit your weekly limit · resets 3pm"}, USAGE_LIMIT),
    Case("claude-usage-limit-with-a-stale-epoch", f"{ENGINE_ERRORS}:38",
         {"text": "Claude AI usage limit reached|1760000000"}, USAGE_LIMIT),
    Case("claude-usage-limit-with-an-epoch-ahead",
         SYNTHETIC + "the shape quoted at engine_errors.py:38, with an epoch after the test clock",
         {"text": f"Claude AI usage limit reached|{IN_AN_HOUR}"}, USAGE_LIMIT, at(hours=1)),
    Case("claude-limit-event-reset", fixture("usage_limit.jsonl", "1,3"),
         {"text": "You've hit your session limit · resets 3pm", "resets_at": 4102444800},
         USAGE_LIMIT, datetime(2100, 1, 1, tzinfo=UTC)),
    Case("claude-not-logged-in", fixture("not_signed_in.jsonl", "3"),
         {"text": "Not logged in · Please run /login"}, AUTH),
    Case("claude-invalid-api-key", f"{ROOT}/tests/test_segment_loop.py:137",
         {"text": "Invalid API key · Please run /login"}, AUTH),
    Case("claude-oauth-token-revoked", f"{ENGINE_ERRORS}:53",
         {"text": "OAuth token has been revoked"}, AUTH),
    Case("codex-usage-limit", "docs/ENGINES_PLAN.md:60",
         {"text": "You've hit your usage limit."}, USAGE_LIMIT),
    # A wait phrase the repository quotes (engine_errors.py:40) inside a sentence made for the test.
    Case("wait-in-seconds", SYNTHETIC + "the wait phrase quoted at engine_errors.py:40, in a sentence of our own",
         {"text": "Rate limit reached. Please try again in 20s."}, RATE_LIMIT, at(seconds=20)),
    Case("wait-in-days-and-hours", SYNTHETIC + "the wait phrase quoted at engine_errors.py:40, in a sentence of our own",
         {"text": "Usage limit reached. Try again in 3 days 2 hours"}, USAGE_LIMIT, at(days=3, hours=2)),
    Case("wait-after-seconds", SYNTHETIC + "the wait phrase quoted at engine_errors.py:40, in a sentence of our own",
         {"text": "Rate limit. Retry after 90 seconds"}, RATE_LIMIT, at(seconds=90)),
    # Words other tools of this repository already match, with no HTTP status.
    Case("words-rate-limit", f"{ASK_RS}:410", {"text": "rate limit"}, RATE_LIMIT),
    Case("words-429-in-json", f"{TASK_TURN}:266",
         {"text": '429 {"error":{"type":"rate_limit"}} at line 3'}, RATE_LIMIT),
    Case("words-insufficient-quota", f"{ASK_RS}:392",
         {"text": "Error code: 429 - insufficient_quota"}, CREDITS),
    Case("words-401-unauthorized", f"{ASK_RS}:408", {"text": "401 unauthorized"}, AUTH),
    Case("words-invalid-x-api-key", f"{TASK_TURN}:263", {"text": "invalid x-api-key"}, AUTH),
    Case("words-invalid-api-key-code", f"{ASK_RS}:275", {"text": "invalid_api_key"}, AUTH),
    Case("words-model-not-found", f"{ASK_RS}:411", {"text": "model_not_found"}, REJECTED),
    Case("words-model-does-not-exist", f"{ASK_RS}:393",
         {"text": "The model `gpt-9` does not exist or you do not have access to it"}, REJECTED),
    Case("words-fetch-failed", f"{TASK_TURN}:262", {"text": "fetch failed"}, TRANSIENT),
    Case("words-connection-refused", f"{ASK_RS}:412", {"text": "connection refused"}, TRANSIENT),
    Case("words-connection-error", f"{ASK_RS}:394",
         {"text": "Connection error while reaching the provider"}, TRANSIENT),
    Case("words-operation-timed-out", f"{RUN_LIFECYCLE}:375", {"text": "The operation timed out."}, TRANSIENT),
    Case("words-overloaded", f"{TITLER}:177", {"text": "overloaded"}, TRANSIENT),
    Case("words-nothing-recognisable", f"{ASK_RS}:395",
         {"text": "Traceback (most recent call last): RuntimeError: something else"}, UNKNOWN),
    Case("words-something-broke", f"{ROOT}/tests/test_segment_loop.py:153", {"text": "something broke"}, UNKNOWN),
    Case("words-none", SYNTHETIC + "no text at all", {}, UNKNOWN),
    # HTTP: a status, with or without a body or a header.
    Case("http-429-bare", SYNTHETIC + "a status alone (RFC 6585, 429)", {"status": 429}, RATE_LIMIT),
    Case("http-429-rate-limited", f"{TITLER}:90", {"status": 429, "text": "rate limited"}, RATE_LIMIT),
    Case("http-429-retry-after-seconds", SYNTHETIC + "the header of RFC 9110 section 10.2.3",
         {"status": 429, "headers": {"Retry-After": "30"}}, RATE_LIMIT, at(seconds=30)),
    Case("http-429-insufficient-quota", f"{ASK_RS}:392",
         {"status": 429, "text": "Error code: 429 - insufficient_quota"}, CREDITS),
    Case("http-429-usage-limit", SYNTHETIC + "the words of docs/ENGINES_PLAN.md:60 under a status made for the test",
         {"status": 429, "text": "You've hit your usage limit."}, USAGE_LIMIT),
    Case("http-402-bare", SYNTHETIC + "a status alone (RFC 9110, 402)", {"status": 402}, CREDITS),
    Case("http-400-credit-balance",
         SYNTHETIC + "a sentence built on the pattern at engine_errors.py:33, under a 400",
         {"status": 400, "text": "Your credit balance is too low to access the API"}, CREDITS),
    Case("http-401-bare", SYNTHETIC + "a status alone (RFC 9110, 401)", {"status": 401}, AUTH),
    Case("http-401-with-words", f"{RUN_LIFECYCLE_TEST}:171", {"status": 401, "text": "401 invalid x-api-key"}, AUTH),
    Case("http-403-bare", SYNTHETIC + "a status alone (RFC 9110, 403)", {"status": 403}, AUTH),
    Case("http-403-that-is-a-rate-limit", f"{GOOGLE_REST}:1378,1380",
         {"status": 403, "text": "User rate limit exceeded."}, RATE_LIMIT),
    Case("http-503-page-that-says-too-many-requests", f"{TITLER}:103,104",
         {"status": 503, "text": "<html>\n  <body>Too many requests</body>\n</html>"}, RATE_LIMIT),
    Case("http-503-with-retry-after", SYNTHETIC + "a status and the header of RFC 9110 section 10.2.3",
         {"status": 503, "headers": {"retry-after": "120"}}, TRANSIENT, at(seconds=120)),
    Case("http-529-overloaded", f"{TITLER}:177", {"status": 529, "text": "overloaded"}, TRANSIENT),
    Case("http-502-bad-gateway", f"{GOOGLE_REST}:1389", {"status": 502, "text": "<html>bad gateway</html>"}, TRANSIENT),
    Case("http-408-bare", SYNTHETIC + "a status alone (RFC 9110, 408)", {"status": 408}, TRANSIENT),
    Case("http-400-invalid-request",
         SYNTHETIC + "the error type this service's own /v1/messages answers with (server_calls.py:453), a message of our own",
         {"status": 400, "text": '{"type":"error","error":{"type":"invalid_request_error","message":"Unexpected field"}}'},
         REJECTED),
    Case("http-404-model-not-found", SYNTHETIC + "the words of ask.rs:411 under a 404 made for the test",
         {"status": 404, "text": "model_not_found"}, REJECTED),
    Case("http-413-bare", SYNTHETIC + "a status alone (RFC 9110, 413)", {"status": 413}, REJECTED),
    Case("http-200-that-says-rate-limit", SYNTHETIC + "a limit reported in the body of a 200",
         {"status": 200, "text": "rate limit"}, RATE_LIMIT),
    Case("http-301-bare", SYNTHETIC + "a status alone (RFC 9110, 301): not an error the engine reported",
         {"status": 301}, UNKNOWN),
]

SOURCE_FORM = re.compile(r"synthetic: .+|[\w./-]+(?::\d+(?:,\d+)*)?")


def test_every_case_says_where_its_text_comes_from():
    ids = [case.id for case in CASES]
    assert len(ids) == len(set(ids))
    for case in CASES:
        assert SOURCE_FORM.fullmatch(case.source), (case.id, case.source)


def test_the_cases_cover_every_kind():
    assert {case.kind for case in CASES} == set(KINDS)


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.id)
def test_the_case(case):
    assert classify_failure(**case.given, now=NOW) == Failure(case.kind, case.retry_at)


@pytest.mark.parametrize(
    "case", [case for case in CASES if set(case.given) <= {"text", "resets_at"} and "text" in case.given],
    ids=lambda case: case.id,
)
def test_it_never_disagrees_with_engine_errors_on_the_same_words(case):
    """The classifier production already runs (`engine_errors`) stays the authority on a CLI's words."""
    text, resets_at = case.given["text"], case.given.get("resets_at")
    limit = engine_errors.classify(text, resets_at=resets_at, now=NOW)
    got = classify_failure(**case.given, now=NOW)
    if engine_errors.is_sign_in_failure(text):
        assert got.kind == AUTH
    elif limit is not None:
        assert (got.kind, got.retry_at) == (limit.kind, limit.resets_at)


# ── Recorded streams: the fixtures the segment tests already replay ──────────────────────────────


def parsed(name: str) -> StreamParser:
    parser = StreamParser()
    for line in (FIXTURES / name).read_text(encoding="utf-8").splitlines():
        parser.feed(line)
    return parser


def test_the_recorded_usage_limit_is_a_usage_limit_that_resets_when_the_event_says():
    parser = parsed("usage_limit.jsonl")
    # The CLI labels this error "rate_limit"; its words and its event say what it is.
    assert parser.api_error_kind == "rate_limit"
    for words in (parser.final.text, parser.api_error):
        failure = classify_failure(words, resets_at=parser.limit_resets_at, now=NOW)
        assert failure == Failure(USAGE_LIMIT, datetime(2100, 1, 1, tzinfo=UTC))


def test_the_recorded_sign_in_failure_is_auth():
    parser = parsed("not_signed_in.jsonl")
    assert parser.api_error_kind == "authentication_failed"
    for words in (parser.final.text, parser.api_error):
        assert classify_failure(words, now=NOW) == Failure(AUTH)


# ── A bare 429 is never taken as quota ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("text", [None, "", "   ", "Too Many Requests", "rate limited", "{}", "<html>429</html>", "quota"])
def test_a_bare_429_is_a_rate_limit_and_never_quota(text):
    failure = classify_failure(text, status=429, now=NOW)
    assert failure.kind == RATE_LIMIT
    assert failure.kind not in (CREDITS, USAGE_LIMIT)


def test_a_long_retry_after_does_not_turn_a_429_into_quota():
    assert classify_failure(status=429, headers={"Retry-After": "86400"}, now=NOW) == Failure(RATE_LIMIT, at(days=1))


def test_the_words_of_a_limit_decide_inside_a_429():
    assert classify_failure("insufficient_quota", status=429, now=NOW).kind == CREDITS
    assert classify_failure("You've hit your weekly limit", status=429, now=NOW).kind == USAGE_LIMIT


# ── What a status says by itself ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [500, 502, 503, 504, 529, 599])
def test_a_server_side_status_is_transient(status):
    assert classify_failure(status=status, now=NOW) == Failure(TRANSIENT)


@pytest.mark.parametrize("status", [400, 404, 405, 409, 413, 415, 422, 451])
def test_any_other_client_error_is_a_refusal_of_this_request(status):
    assert classify_failure(status=status, now=NOW) == Failure(REJECTED)


@pytest.mark.parametrize("status", [None, 100, 200, 204, 301, 302, 304])
def test_a_status_that_is_not_an_error_says_nothing_and_leaves_the_words_to_decide(status):
    assert classify_failure(status=status, now=NOW) == Failure(UNKNOWN)
    assert classify_failure("rate limit", status=status, now=NOW).kind == RATE_LIMIT
    assert classify_failure("fetch failed", status=status, now=NOW).kind == TRANSIENT


@pytest.mark.parametrize("status", [True, False, 0, 99, 600, -429, 429.0, "429", b"429", [], {}])
def test_a_value_that_is_not_an_http_status_is_ignored(status):
    assert classify_failure(status=status, now=NOW) == Failure(UNKNOWN)


def test_a_sign_in_failure_is_auth_whatever_else_the_reply_carries():
    assert classify_failure("Not logged in · Please run /login", status=429, now=NOW).kind == AUTH
    assert classify_failure("rate limit", status=401, now=NOW).kind == AUTH


def test_explicit_limit_words_beat_a_server_error_status():
    """A limit hammered as if it were a hiccup is the harm the breaker exists to prevent."""
    assert classify_failure("rate limit exceeded", status=500, now=NOW).kind == RATE_LIMIT
    assert classify_failure("usage limit", status=502, now=NOW).kind == USAGE_LIMIT
    assert classify_failure("overloaded", status=500, now=NOW).kind == TRANSIENT


def test_a_status_decides_before_transient_or_refusal_words():
    assert classify_failure("model_not_found", status=503, now=NOW).kind == TRANSIENT
    assert classify_failure("fetch failed", status=404, now=NOW).kind == REJECTED


# ── Retry-After ──────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "seconds"),
    [("0", 0), ("30", 30), ("  30  ", 30), ("0000000120", 120), (30, 30), ("9999999999", 9_999_999_999)],
)
def test_retry_after_as_a_count_of_seconds(value, seconds):
    assert parse_retry_after(value, NOW) == timedelta(seconds=seconds)


@pytest.mark.parametrize(
    "value",
    [
        "", " ", "-5", "1.5", "1e3", "30s", "30 seconds", "soon", "30, 60", "٣٠", "99999999999",
        "Sat, 99 Foo 2026 99:99:99 GMT", "x" * 65, None, True, False, 1.5, b"30", [30], {"a": 1},
        10**10, -1,  # an int is a count of seconds of at most ten digits
        pytest.param(10**5000, id="an-int-of-5000-digits"),
        # a date the parser would read, with more than 64 characters after it
        f"{format_datetime(NOW + timedelta(minutes=5), usegmt=True)} {'x' * 100}",
    ],
)
def test_retry_after_that_is_not_a_wait_is_none(value):
    assert parse_retry_after(value, NOW) is None


def test_retry_after_as_an_http_date_in_each_form_rfc_9110_asks_a_recipient_to_read():
    when = at(minutes=5)
    forms = [
        format_datetime(when, usegmt=True),  # the one senders must use
        when.strftime("%A, %d-%b-%y %H:%M:%S GMT"),  # the obsolete RFC 850 form
        f"{when:%a %b} {when.day:2d} {when:%H:%M:%S %Y}",  # asctime, which names no zone
    ]
    for form in forms:
        assert parse_retry_after(form, NOW) == timedelta(minutes=5), form


def test_retry_after_with_spaces_around_it_is_still_a_wait():
    stated = format_datetime(at(minutes=5), usegmt=True)
    assert parse_retry_after(f"{' ' * 100}{stated}{' ' * 100}", NOW) == timedelta(minutes=5)


def test_retry_after_as_a_date_already_past_is_a_wait_of_zero():
    assert parse_retry_after(format_datetime(at(minutes=-5), usegmt=True), NOW) == timedelta(0)


@pytest.mark.parametrize("name", ["Retry-After", "retry-after", "RETRY-AFTER", "rEtRy-AfTeR"])
def test_the_header_name_is_matched_ignoring_case(name):
    assert classify_failure(status=429, headers={name: "7"}, now=NOW).retry_at == at(seconds=7)


def test_an_httpx_headers_object_is_read_like_a_dict():
    headers = httpx.Headers({"Retry-After": "7", "Content-Type": "application/json"})
    assert classify_failure(status=429, headers=headers, now=NOW) == Failure(RATE_LIMIT, at(seconds=7))


@pytest.mark.parametrize(
    "headers",
    [None, [], [("Retry-After", "7")], "Retry-After: 7", 7, {}, {"Retry-After": None}, {b"Retry-After": "7"}, {7: "7"}],
)
def test_headers_that_hold_no_usable_retry_after_are_ignored(headers):
    assert classify_failure(status=429, headers=headers, now=NOW) == Failure(RATE_LIMIT)


def test_a_retry_after_header_alone_makes_no_limit():
    assert classify_failure(headers={"Retry-After": "30"}, now=NOW) == Failure(UNKNOWN)


# ── When the engine said it would be back ────────────────────────────────────────────────────────


def test_the_later_of_the_moments_the_engine_stated_wins():
    failure = classify_failure(
        "rate limit, try again in 20s",
        status=429,
        headers={"Retry-After": "90"},
        resets_at=at(seconds=10).timestamp(),
        now=NOW,
    )
    assert failure == Failure(RATE_LIMIT, at(seconds=90))
    failure = classify_failure(
        "rate limit, try again in 20s", status=429, headers={"Retry-After": "5"}, now=NOW
    )
    assert failure == Failure(RATE_LIMIT, at(seconds=20))


def test_a_stated_moment_that_has_passed_is_not_a_wait():
    stale = (NOW - timedelta(hours=1)).timestamp()
    assert classify_failure("usage limit", resets_at=stale, now=NOW) == Failure(USAGE_LIMIT)


@pytest.mark.parametrize("resets_at", [None, True, 0, -1, float("nan"), float("inf"), 1e30, "4102444800"])
def test_a_reset_time_that_is_not_a_usable_epoch_is_ignored(resets_at):
    assert classify_failure("usage limit", resets_at=resets_at, now=NOW) == Failure(USAGE_LIMIT)


@pytest.mark.parametrize(
    ("given", "kind"),
    [
        ({"status": 401}, AUTH),
        ({"text": "Not logged in · Please run /login"}, AUTH),
        ({"status": 403}, AUTH),
        ({"status": 400}, REJECTED),
        ({"text": "model_not_found"}, REJECTED),
        ({"text": "something broke"}, UNKNOWN),
    ],
    ids=["401", "sign-in-words", "403", "400", "model-not-found", "unrecognised"],
)
def test_waiting_does_not_fix_a_sign_in_a_refusal_or_an_unknown_so_no_moment_is_kept(given, kind):
    failure = classify_failure(**given, headers={"Retry-After": "30"}, resets_at=at(hours=1).timestamp(), now=NOW)
    assert failure == Failure(kind, None)


def test_a_transient_failure_keeps_the_moment_the_engine_gave():
    assert classify_failure("overloaded, try again in 30s", now=NOW) == Failure(TRANSIENT, at(seconds=30))
    assert classify_failure(status=503, headers={"Retry-After": "30"}, now=NOW) == Failure(TRANSIENT, at(seconds=30))


# ── The clock ────────────────────────────────────────────────────────────────────────────────────


def test_the_clock_is_the_one_given_not_the_real_one():
    long_ago = datetime(1999, 1, 1, tzinfo=UTC)
    stated = format_datetime(long_ago + timedelta(minutes=2), usegmt=True)
    failure = classify_failure(status=429, headers={"Retry-After": stated}, now=long_ago)
    assert failure == Failure(RATE_LIMIT, long_ago + timedelta(minutes=2))


def test_a_clock_with_no_zone_is_taken_as_utc():
    assert classify_failure("rate limit, try again in 20s", now=NOW.replace(tzinfo=None)).retry_at == at(seconds=20)


def test_without_a_clock_it_reads_the_real_one():
    before = datetime.now(UTC)
    failure = classify_failure("rate limit, try again in 20s")
    after = datetime.now(UTC)
    assert before + timedelta(seconds=20) <= failure.retry_at <= after + timedelta(seconds=20)


# ── It runs in a failure path: it never raises and never takes long ──────────────────────────────

HOSTILE_TEXT = [
    None, "", " ", "\x00", "\n" * 10_000, "a" * 200_000, b"rate limit", 429, ["rate limit"], {"error": "rate limit"},
    "rate limit, try again in 99999999999999 days",
    "retry after 9999999 days",
    "retry after 9999999999 days",
    "rate limit, resets in " + "9" * 400 + " seconds",
    "usage limit reached|9999999999",
    "|9999999999 usage limit",
    "rate limit " + "\ud800",  # a lone surrogate
]


@pytest.mark.parametrize("text", HOSTILE_TEXT, ids=[f"hostile-{n}" for n in range(len(HOSTILE_TEXT))])
@pytest.mark.parametrize("status", [None, 429, 503])
def test_hostile_words_never_raise(text, status):
    failure = classify_failure(text, status=status, headers={"Retry-After": "99999999999999999999"}, now=NOW)
    assert isinstance(failure, Failure) and failure.kind in KINDS


def test_a_wait_too_long_for_a_clock_keeps_the_limit_and_drops_the_wait():
    """engine_errors.classify raises OverflowError on this text (checked 2026-11-14): a gateway's words reach it."""
    for text in (
        "rate limit, try again in 99999999999999 days",
        "rate limit, try again in 9999999 days",
        "rate limit, try again in 9999999999 days",
    ):
        assert classify_failure(text, now=NOW) == Failure(RATE_LIMIT), text
    many = "usage limit " + "999999 days " * 5000  # each wait is fine; their sum is not
    assert classify_failure(many, now=NOW) == Failure(USAGE_LIMIT)


@pytest.mark.parametrize(
    "text",
    [
        "rate limit, resets in " + "9" * 10_000 + "z",  # engine_errors alone takes about 10 s on this
        "rate limit " + "9" * 2_000_000,
        "rate limit, try again in " + "1s " * 400_000,
        "x" * 3_000_000 + " usage limit",
    ],
    ids=["digits-then-letter", "digits", "many-waits", "long-then-limit"],
)
def test_long_hostile_words_take_bounded_time(text):
    started = time.perf_counter()
    failure = classify_failure(text, now=NOW)
    assert time.perf_counter() - started < 5
    assert failure.kind in KINDS


def test_a_very_long_error_is_read_from_both_ends_and_not_in_the_middle():
    filler = "x " * 50_000
    assert classify_failure("usage limit " + filler, now=NOW).kind == USAGE_LIMIT
    assert classify_failure(filler + " usage limit", now=NOW).kind == USAGE_LIMIT
    assert classify_failure(filler + " usage limit " + filler, now=NOW).kind == UNKNOWN


# ── The vocabulary ───────────────────────────────────────────────────────────────────────────────


def test_the_kinds_are_the_strings_engine_errors_already_uses_plus_four():
    assert KINDS == ("rate_limit", "usage_limit", "credits", "auth", "transient", "rejected", "unknown")
    assert (engine_errors.RATE_LIMIT, engine_errors.USAGE_LIMIT, engine_errors.CREDITS) == KINDS[:3]
    assert LIMIT_KINDS == {RATE_LIMIT, USAGE_LIMIT, CREDITS}


# ── Pure, and self-contained ─────────────────────────────────────────────────────────────────────

ALLOWED_IMPORTS = {
    "__future__", "collections.abc", "dataclasses", "datetime", "email.utils", "re", "typing",
    "freeduet.engine_errors",
}
FORBIDDEN_CALLS = {"open", "exec", "eval", "__import__", "input", "print"}


def test_the_module_imports_only_the_standard_library_and_engine_errors():
    tree = ast.parse(Path(failure_classifier.__file__).read_text(encoding="utf-8"))
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
    assert not called & FORBIDDEN_CALLS, called & FORBIDDEN_CALLS
