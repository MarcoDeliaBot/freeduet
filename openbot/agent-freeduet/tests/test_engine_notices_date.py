"""D105: a notice that names a reset says the DAY too when the reset is not today (UTC).

Seen live on 20 November 2026: "Claude Code ha raggiunto il limite fino alle 06:00 UTC" for a weekly limit that reset on
22 November, which read as already past.
"""

from datetime import UTC, datetime

from freeduet import engine_notices as n
from freeduet.failure_classifier import USAGE_LIMIT

NOW = datetime(2026, 11, 20, 14, 30, tzinfo=UTC)
LATER_TODAY = datetime(2026, 11, 20, 23, 0, tzinfo=UTC)
WEEKLY = datetime(2026, 11, 22, 6, 0, tzinfo=UTC)


def test_the_seen_case_says_the_date_in_italian_and_english():
    assert n.switched("it", "Claude Code", USAGE_LIMIT, WEEKLY, "local-models", n.NONE, NOW) == (
        "Claude Code ha raggiunto il limite fino al 22 novembre alle 06:00 UTC, quindi risponde local-models al suo posto."
    )
    assert n.switched("en", "Claude Code", USAGE_LIMIT, WEEKLY, "local-models", n.NONE, NOW) == (
        "Claude Code reached its limit until Nov 22 at 06:00 UTC, so local-models is answering instead."
    )


def test_a_reset_later_today_keeps_the_bare_time():
    assert n.reason("it", "Claude Code", USAGE_LIMIT, LATER_TODAY, NOW) == "Claude Code ha raggiunto il limite fino alle 23:00 UTC"
    assert n.reason("en", "Claude Code", USAGE_LIMIT, LATER_TODAY, NOW) == "Claude Code reached its limit until 23:00 UTC"


def test_the_day_is_the_utc_day_not_the_callers():
    just_after_midnight = datetime(2026, 11, 21, 0, 10, tzinfo=UTC)
    late_evening = datetime(2026, 11, 20, 23, 50, tzinfo=UTC)
    assert "21 novembre" in n.reason("it", "X", USAGE_LIMIT, just_after_midnight, late_evening)


def test_the_other_notices_that_name_a_time_say_the_date_too():
    assert "(torna il 22 novembre alle 06:00 UTC)" in n.waiting("it", "Claude Code", WEEKLY, NOW)
    assert "(back on Nov 22 at 06:00 UTC)" in n.waiting("en", "Claude Code", WEEKLY, NOW)
    assert "Il primo torna il 22 novembre alle 06:00 UTC." in n.all_limited("it", WEEKLY, now=NOW)
    assert "The earliest is back on Nov 22 at 06:00 UTC." in n.all_limited("en", WEEKLY, now=NOW)
    assert "fino al 22 novembre alle 06:00 UTC" in n.pinned("it", "Claude Code", USAGE_LIMIT, WEEKLY, NOW)
    assert "until Nov 22 at 06:00 UTC" in n.asked("en", "Claude Code", USAGE_LIMIT, WEEKLY, "Codex", NOW)


def test_a_reset_in_another_year_says_the_year():
    assert "Jan 1, 2027 at 00:00 UTC" in n.reason("en", "X", USAGE_LIMIT, datetime(2027, 1, 1, tzinfo=UTC), NOW)
    assert "1 gennaio 2027 alle 00:00 UTC" in n.reason("it", "X", USAGE_LIMIT, datetime(2027, 1, 1, tzinfo=UTC), NOW)
