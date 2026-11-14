"""Which kind of failure an engine reported, and when it said it would be back.

docs/ENGINES_PLAN.md section 2 ("Limit classifier") and section 8 ("a bare 429 is not a quota"). What an
engine reported goes in: its words, the HTTP status of its reply, its headers, a reset time it stated. A
:class:`Failure` comes out. The function reads no file, calls nothing, starts nothing and keeps no state; it
runs in a failure path, so it never raises and its work is bounded, whatever an engine or a gateway sends.

FOR RECORDING ONLY (slice 2). `claude_cli.turn_failure` classifies how a member's turn ended, for the engine
breaker (plan section 5, engine_state.py); `claude_cli.failure_event` still decides what a member's run says,
through `engine_errors`, exactly as before. Nothing a person sees comes from this module.

The kinds, and what the plan's engine states do with each:

====================  ===============================================  ================================
kind                  meaning                                          plan section 5
====================  ===============================================  ================================
``rate_limit``        too many requests right now                      Open, a short wait
``usage_limit``       a subscription window is used up                 Open until its reset
``credits``           a paid balance or quota is used up               Open; the person adds credit
``auth``              not signed in, or a key was refused              Signed out: not a timer
``transient``         the engine or the path to it failed, and such    Degraded
                      failures usually pass
``rejected``          the engine refused this request as it was sent   not its health; the turn moves on
                      (a field, an unknown model, a request too big)
``unknown``           nothing recognisable
====================  ===============================================  ================================

The first three share their strings with `engine_errors`; the other four are new.

How a kind is chosen, first match wins:

1. Sign-in. Status 401, or `engine_errors.is_sign_in_failure`, or the words of a refused key.
2. A limit the words name, read by `engine_errors.classify`: credits, then usage limit, then rate limit.
   Explicit limit words beat a 4xx or 5xx status, because a limit treated as a hiccup is retried at once.
3. A status by itself: 402 credits; 429 a rate limit, whatever its wait, and never quota (only words say
   quota); 403 auth; 408 and every 5xx transient; any other 4xx rejected. A status of 1xx, 2xx or 3xx, a
   value that is not an HTTP status and no status at all say nothing.
4. Words by themselves: transient (a timeout, a refused or dropped connection, "overloaded", a bad
   gateway), then a refusal of the request (an unknown model, an invalid request).
5. Otherwise unknown.

`retry_at` is the moment the engine itself said it would answer again, for the kinds where waiting helps (the
limits and transient). It is the later of the reset time handed in, a wait phrase in the words
("try again in 20s") and a ``Retry-After`` header (RFC 9110 section 10.2.3: seconds, or an HTTP date), so a
router never comes back before any of them. A moment already past is not a wait.

What this module does not decide, because each belongs to the breaker or to the notice: how long to wait when
the engine named no time (ARCHITECTURE section 3.3 rule 5 says a minute, and the growth on repeats and its cap
are [to decide], plan section 5), a ceiling on a wait an engine states (``Retry-After: 9999999999`` is 317
years), what to say to the person, and anything stored. Not read: a clock time in words ("resets 3pm", which
needs the person's time zone; Claude Code's own ``resetsAt`` is passed as ``resets_at``) and any
provider-specific reset header, since the plan marks every engine's exact error shape [verify] but Claude
Code's.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any

from .engine_errors import (
    CREDITS,
    RATE_LIMIT,
    USAGE_LIMIT,
    classify as read_limit,
    is_sign_in_failure,
    reset_time as read_reset_time,
)

AUTH = "auth"
TRANSIENT = "transient"
REJECTED = "rejected"
UNKNOWN = "unknown"

KINDS = (RATE_LIMIT, USAGE_LIMIT, CREDITS, AUTH, TRANSIENT, REJECTED, UNKNOWN)
#: The kinds that are an account's limit.
LIMIT_KINDS = frozenset({RATE_LIMIT, USAGE_LIMIT, CREDITS})

#: An engine's error is a sentence or a small page. Longer than twice this, only the first and the last
#: READ_CHARS characters are read: the work stays bounded and a limit word at either end still counts.
READ_CHARS = 10_000

#: Ten digits are an epoch in seconds. A longer run is no time anyone can wait for, and engine_errors'
#: wait phrase regex takes quadratic time on it (10,000 digits took about 10 s, checked 2026-11-14).
_LONG_DIGITS = re.compile(r"[0-9]{11,}")
#: The second reading of a text that made engine_errors overflow a clock.
_MANY_DIGITS = re.compile(r"[0-9]{4,}")

# What else the repository's other tools already read as a refused key, beyond engine_errors' own sign-in
# words: run-lifecycle.ts (app) matches invalid x-api-key, incorrect api key, invalid_api_key and
# authentication_error; ask.rs (desktop) the same family, and its test logs list "401 unauthorized".
_AUTH_WORDS = re.compile(
    r"\bunauthori[sz]ed\b|\binvalid x-api-key\b|\bincorrect api key\b|\binvalid_api_key\b"
    r"|\bauthentication[_ ]?error\b",
    re.IGNORECASE,
)
# A failure that usually passes: the words task-store.ts (server), run-lifecycle.ts (app) and ask.rs (desktop)
# already use for "the service did not answer", and the usual names of a gateway that failed.
_TRANSIENT_WORDS = re.compile(
    r"\boverloaded\b|\btimed out\b|\btimeout\b|\betimedout\b|\beconn(?:reset|refused|aborted)\b"
    r"|\benotfound\b|\bsocket hang up\b|\bfetch failed\b|\bconnection (?:error|refused|reset)\b"
    r"|\b(?:cannot|unable to) connect\b|\b(?:temporarily|service) unavailable\b"
    r"|\bbad gateway\b|\bgateway time-?out\b",
    re.IGNORECASE,
)
# The request itself was refused. `invalid_request_error` is the Anthropic error type this service's own
# /v1/messages answers with (server_calls.py); the model words come from ask.rs.
_REJECTED_WORDS = re.compile(
    r"\bmodel_not_found\b|\bunknown model\b|\bdoes not exist or you do not have access\b"
    r"|\binvalid_request_error\b",
    re.IGNORECASE,
)

_DELAY_SECONDS = re.compile(r"[0-9]{1,10}")
_MAX_DELAY_SECONDS = 9_999_999_999
#: The longest HTTP date is under 40 characters.
_MAX_HEADER_CHARS = 64


@dataclass(frozen=True)
class Failure:
    kind: str
    #: When the engine said it would answer again, for the kinds where waiting helps. None when it
    #: named no moment, or the moment had passed, or waiting does not help.
    retry_at: datetime | None = None


def _aware(moment: datetime | None) -> datetime:
    """The clock given, or the real one. A clock with no zone is taken as UTC."""
    if moment is None:
        return datetime.now(UTC)
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def _status(value: Any) -> int | None:
    """The value when it is an HTTP status, else None. A string or a float is not one, and a bool is 0 or 1."""
    return value if isinstance(value, int) and 100 <= value <= 599 else None


def _clean(text: Any) -> str:
    if not isinstance(text, str):
        return ""
    if len(text) > 2 * READ_CHARS:
        text = f"{text[:READ_CHARS]} {text[-READ_CHARS:]}"
    return _LONG_DIGITS.sub("0", text)


def _read(read, words: str):
    """``read(words)``, read again with the long numbers zeroed if it overflows a clock, else None.

    engine_errors raises OverflowError on a wait too long for a date ("try again in 9999999 days"), and an
    engine or a gateway can say that. The kind is still in the words, so the numbers are zeroed and the
    words read once more; if that fails too, nothing is read.
    """
    for candidate in (words, _MANY_DIGITS.sub("0", words)):
        try:
            return read(candidate)
        except (OverflowError, ValueError, OSError):
            continue
    return None


def _epoch(value: Any, now: datetime) -> datetime | None:
    """A reset time given as epoch seconds, when it is a usable number and still ahead."""
    if not isinstance(value, (int, float)) or not value > 0:
        return None
    try:
        when = datetime.fromtimestamp(value, UTC)
    except (OverflowError, OSError, ValueError):
        return None
    return when if when > now else None


def _header(headers: Any, name: str) -> Any:
    """A header's value by lower-case name, whatever the case it was sent in."""
    if not isinstance(headers, Mapping):
        return None
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == name:
            return value
    return None


def parse_retry_after(value: Any, now: datetime | None = None) -> timedelta | None:
    """A ``Retry-After`` value as a wait (RFC 9110 section 10.2.3), or None when it is no wait.

    Allowed: a count of seconds of at most ten digits, or an HTTP date in any of the three forms the RFC
    asks a recipient to read. A date already past is a wait of zero. Not a wait: a decimal, a negative
    number, a sentence, a list, anything longer than 64 characters.
    """
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    if isinstance(value, int):
        return timedelta(seconds=value) if 0 <= value <= _MAX_DELAY_SECONDS else None
    text = value.strip()
    if len(text) > _MAX_HEADER_CHARS:
        return None
    if _DELAY_SECONDS.fullmatch(text):
        return timedelta(seconds=int(text))
    try:
        when = parsedate_to_datetime(text)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    when = when if when.tzinfo else when.replace(tzinfo=UTC)
    return max(when - _aware(now), timedelta(0))


def _retry_at(words: str, headers: Any, resets_at: Any, now: datetime) -> datetime | None:
    stated = [_epoch(resets_at, now), _read(lambda text: read_reset_time(text, now), words)]
    wait = parse_retry_after(_header(headers, "retry-after"), now)
    if wait is not None:
        stated.append(now + wait)
    stated = [moment for moment in stated if moment is not None]
    return max(stated) if stated else None


def classify_failure(
    text: str | None = None,
    *,
    status: int | None = None,
    headers: Mapping[str, Any] | None = None,
    resets_at: float | None = None,
    now: datetime | None = None,
) -> Failure:
    """The kind of failure an engine reported, and when it said it would be back.

    ``text`` is what the engine itself said (a CLI's result or stderr, an HTTP body), never something this
    service wrote about it. ``status`` and ``headers`` are the HTTP reply's, for an engine that is an API.
    ``resets_at`` is a reset time in epoch seconds that the engine stated outside its words (Claude Code's
    ``rate_limit_event``), as `engine_errors.classify` takes it. ``now`` is the clock; give one in tests.
    """
    now = _aware(now)
    words = _clean(text)
    code = _status(status)

    if code == 401 or is_sign_in_failure(words) or _AUTH_WORDS.search(words):
        return Failure(AUTH)

    limit = _read(lambda candidate: read_limit(candidate, now=now), words)
    if limit is not None:
        kind = limit.kind
    elif code == 402:
        kind = CREDITS
    elif code == 429:
        # Only words say quota. A 429 with no such words is a rate limit, however long it asks to wait.
        kind = RATE_LIMIT
    elif code == 403:
        return Failure(AUTH)
    elif code is not None and (code == 408 or code >= 500):
        kind = TRANSIENT
    elif code is not None and 400 <= code < 500:
        return Failure(REJECTED)
    elif _TRANSIENT_WORDS.search(words):
        kind = TRANSIENT
    elif _REJECTED_WORDS.search(words):
        return Failure(REJECTED)
    else:
        return Failure(UNKNOWN)

    # Only a limit and a transient failure get here. A sign-in, a refusal and an unknown returned above:
    # waiting does not fix them, so whatever time came with them is dropped.
    return Failure(kind, _retry_at(words, headers, resets_at, now))
