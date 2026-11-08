# Copyright the open-duet authors (https://github.com/Anil-matcha/open-duet).
# Licensed under the Apache License, Version 2.0; see LICENSE-APACHE-2.0 in openbot/agent-freeduet.
#
# Ported from Anil-matcha/open-duet, backend/app/services/engine_errors.py.
# Modified for FreeDuet: kept the limit patterns, `classify` and `describe`; dropped the engine
# registry hooks; added `is_sign_in_failure` for the CLI's not-signed-in wording (D12); `describe`
# speaks of team members instead of agents and engines picked in settings.
"""Engine failures that mean "this account is limited right now" or "not signed in".

A subscription's usage limit, a rate limit or no credits becomes a RUN_ERROR with a plain message
(D12); a missing or expired sign-in becomes RUN_ERROR `OPENBOT_MODEL_AUTH_REQUIRED`. Only text the
engine itself reported is read, so a crash whose text happens to mention a limit is not taken for
one.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

USAGE_LIMIT = "usage_limit"
RATE_LIMIT = "rate_limit"
CREDITS = "credits"

# A subscription's usage running out: Claude Code says "Claude AI usage limit reached|<epoch>",
# "You've hit your weekly limit · resets 3pm", "...your session limit".
_USAGE = re.compile(
    r"\busage limit\b|\bhit your (?:(?!rate\b)[\w'’-]+ ){0,3}(?:limit|budget)\b"
    r"|\b(?:weekly|daily|monthly|subscription|usage|session|5-hour) limit reached\b"
    r"|\bout of (?:usage(?: credits)?|extra usage)\b",
    re.IGNORECASE,
)
_CREDITS = re.compile(
    r"\b402\b|\bpayment required\b|\binsufficient[_ ](?:quota|funds|balance|credits?)\b"
    r"|\b(?:credit|account) balance is too low\b|\bout of credits?\b|\bexceeded your current quota\b",
    re.IGNORECASE,
)
_RATE = re.compile(r"\b429\b|\brate[ _-]?limit(?:ed)?\b|\btoo many requests\b", re.IGNORECASE)
# "Claude AI usage limit reached|1760000000"
_EPOCH = re.compile(r"\|(\d{10})\b")
# "try again in 20s", "Try again in 3 days 2 hours", "retry after 90 seconds"
_IN = re.compile(
    r"\b(?:try again|retry|resets?)\s+(?:in|after)\s+((?:\d+(?:\.\d+)?\s*[a-z]+[\s,]*(?:and\s+)?)+)",
    re.IGNORECASE,
)
_UNIT = re.compile(
    r"(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds|ms)\b",
    re.IGNORECASE,
)
_SECONDS = {"d": 86400, "h": 3600, "m": 60, "s": 1}

# Claude Code 2.1.311's own wording (read from the binary's strings, not from a sign-in):
# "Not logged in · Please run /login", "Invalid API key · Please run /login",
# "OAuth token has been revoked", "OAuth token revoked. Please log in again ...".
_SIGN_IN = re.compile(
    r"\bnot logged in\b|please run /login|\binvalid api key\b|\boauth (?:access )?token (?:has been )?revoked\b"
    r"|\bplease log in again\b|\bauthentication required\b|\bauthentication_failed\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class EngineLimit:
    kind: str  # usage_limit | rate_limit | credits
    resets_at: datetime | None
    said: str


def is_sign_in_failure(text: str | None) -> bool:
    return bool(text) and bool(_SIGN_IN.search(text))


def _duration(text: str) -> timedelta | None:
    total = 0.0
    for amount, unit in _UNIT.findall(text):
        unit = unit.lower()
        total += float(amount) / 1000 if unit == "ms" else float(amount) * _SECONDS[unit[0]]
    return timedelta(seconds=total) if total > 0 else None


def reset_time(text: str, now: datetime | None = None) -> datetime | None:
    """A reset time the engine's words give, or None."""
    now = now or datetime.now(UTC)
    epoch = _EPOCH.search(text)
    if epoch:
        when = datetime.fromtimestamp(int(epoch.group(1)), UTC)
        return when if when > now else None
    match = _IN.search(text)
    if match:
        span = _duration(match.group(1))
        if span is not None:
            return now + span
    return None


def classify(text: str | None, *, resets_at: float | None = None, now: datetime | None = None) -> EngineLimit | None:
    """The limit `text` (an engine's own error) describes, or None."""
    if not text:
        return None
    if _CREDITS.search(text):
        kind = CREDITS
    elif _USAGE.search(text):
        kind = USAGE_LIMIT
    elif _RATE.search(text):
        kind = RATE_LIMIT
    else:
        return None
    now = now or datetime.now(UTC)
    when = None
    if resets_at:
        when = datetime.fromtimestamp(resets_at, UTC)
        if when <= now:
            when = None
    if when is None:
        when = reset_time(text, now)
    said = _EPOCH.sub("", " ".join(text.split()))[:300]
    return EngineLimit(kind=kind, resets_at=when, said=said)


def describe(label: str, limit: EngineLimit) -> str:
    """The limit in plain words, with when it resets when known."""
    when = f" It resets at {limit.resets_at.strftime('%Y-%m-%d %H:%M UTC')}." if limit.resets_at else ""
    said = f' ({label} says: "{limit.said.rstrip(". ")}")' if limit.said else ""
    if limit.kind == CREDITS:
        return f"{label} is out of credits{said}. Add credits, or try again later."
    if limit.kind == USAGE_LIMIT:
        return f"{label} has reached its usage limit{said}.{when} Try again after it resets."
    return f"{label} hit a rate limit{said}.{when or ' Wait a minute, then send it again.'}"
