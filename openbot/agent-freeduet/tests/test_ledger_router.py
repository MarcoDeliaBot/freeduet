"""The spend ledger in the member path (docs/ENGINES_PLAN.md slice 12): a turn on a metered engine is written down, an engine
at or over a limit the person set is skipped like a limited one, and `GET /engines` shows the numbers.

Everything runs through the real service and the real segment loop over fake CLIs (tests/fake_claude.py). The paid engine is
`CostedEngine` (tests/ledger_support.py): the Claude engine over a fake CLI that reports a cost after each turn, the way an
engine whose own report carries one would. A paid gateway cannot run in this release (the switch is closed and no kind
reports a verified cost), so each test opens the gate for itself. The costs, the limits and the clock are invented.
"""

from __future__ import annotations

import functools
import json
import threading
from datetime import UTC, datetime

import pytest

from freeduet import engine_notices as notices
from freeduet.app import app
from freeduet.engine_adapter import Usage
from freeduet.engine_router import Router
from freeduet.engine_state import EngineState
from freeduet.ledger import DAILY, MONTHLY, Ledger
from fake_engines import NOW, build
from helpers import MANAGED_TOKEN, post_run, run_body, standing, types
from ledger_support import LIMIT, Paid, paid_team, reports

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
PIN = {"freeduet": {"pin": "paid"}}
ASK_TEXT = "Write the plan as a page."
DAILY_STOP = "paid reached the daily limit you set (1.00 EUR)"
MONTHLY_STOP = "paid reached the monthly limit you set (2.00 EUR)"
PINNED = ", and this assistant is pinned to it, so I stopped here and did not switch to another engine."
CANNOT_TELL = "paid is held back because FreeDuet cannot tell what it has cost"
ITALIAN_PIN = ", e questo assistente è fissato su di esso: mi fermo qui e non passo a un altro motore."


def said(events) -> str:
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def go(client, team, run_id="run-1", *, italian=False, bot_id="freeduet"):
    app.state.engine_router, app.state.engine_state = team.router, team.state
    body = run_body([standing(bot_id), {"id": "u1", "role": "user", "content": ASK_TEXT}], bot_id=bot_id, run_id=run_id)
    if italian:
        body["forwardedProps"]["openbotPersonLanguage"] = {"code": "it", "name": "Italian"}
    return post_run(client, body)[0]


def spend(cost, *, given=1000, wrote=200, currency="EUR") -> Usage:
    return Usage(input_tokens=given, output_tokens=wrote, cost=cost, currency=currency)


def folder(tmp_path, name):
    """A folder of its own, for a test that makes two teams."""
    path = tmp_path / name
    path.mkdir()
    return path


def restarted(team, path=None) -> Paid:
    """The service started again over the same engines and the same file: a new engine state, a new ledger, nothing else."""
    path = path or team.path
    router = Router(EngineState(None, now=NOW), team.router.adapters, team.router.config, ledger=Ledger(path, now=team.clock))
    return Paid(router, router.state, router.state._ledger, team.clock, path, team.claude, team.fakes, team.engines)


def rows(client, team) -> dict[str, dict]:
    app.state.engine_router, app.state.engine_state = team.router, team.state
    response = client.get("/engines", headers=AUTH)
    assert response.status_code == 200
    return {row["id"]: row for row in response.json()["engines"]}


# ── What is written down ───────────────────────────────────────────────────────────────────────────


def test_a_turn_on_a_paid_engine_is_written_down_with_what_the_engine_reported(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(0.25, given=1200, wrote=300)}, switching=PIN)
    team["paid"].plan([{"text": "The plan."}])
    assert said(go(client, team)) == "The plan."
    assert team.totals["day"] == {
        "period": "2026-11-14", "cap": 1.0, "spent": 0.25, "cost_unknown_turns": 0,
        "engine": {"turns": 1, "input_tokens": 1200, "output_tokens": 300, "cost": 0.25, "cost_unknown_turns": 0},
    }
    assert team.totals["month"]["cap"] == 10.0 and team.totals["month"]["spent"] == 0.25
    assert (team.totals["currency"], team.totals["time_zone"], team.totals["held"]) == ("EUR", "UTC", None)
    saved = json.loads(team.path.read_text())
    assert [(turn["engine"], turn["input_tokens"], turn["output_tokens"], turn["cost"]) for turn in saved["turns"]] == [("paid", 1200, 300, "0.25")]


def test_turns_that_add_up_to_exactly_the_limit_reach_it_and_the_next_turn_is_not_started(client, fake_cli, tmp_path, monkeypatch):
    # 0.7 + 0.1 + 0.1 + 0.1 is 0.9999999999999999 as floats and exactly 1.00 as the money it is: the sum is kept as decimals.
    costs = [0.7, 0.1, 0.1, 0.1]
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(*costs)}, switching=PIN)
    team["paid"].plan(*[[{"text": f"Answer {number}."}] for number in range(len(costs) + 1)])
    for number in range(len(costs)):
        assert said(go(client, team, f"run-{number}")) == f"Answer {number}."
    assert functools.reduce(float.__add__, costs) < 1.0  # (sum() itself compensates since Python 3.12: add one by one)
    assert team.totals["day"]["spent"] == 1.0
    events = go(client, team, "run-last")
    assert (events[-1]["type"], events[-1]["code"]) == ("RUN_ERROR", "FREEDUET_ENGINE_LIMITED")
    assert events[-1]["message"] == DAILY_STOP + PINNED
    assert team["paid"].runs() == len(costs)  # the fifth was never started


def test_a_turn_that_crosses_the_limit_while_it_runs_finishes_and_counts_and_the_next_one_is_held(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(0.9, 0.7)}, switching=PIN)
    team["paid"].plan([{"text": "First."}], [{"text": "The whole of the second answer, which ends above the limit."}])
    assert said(go(client, team, "run-1")) == "First."
    events = go(client, team, "run-2")  # 0.9 of 1.00 is spent: the check passes, and the turn may cost more than the 0.10 left
    assert said(events) == "The whole of the second answer, which ends above the limit." and types(events)[-1] == "RUN_FINISHED"
    assert team.totals["day"]["spent"] == 1.6  # counted in full: the overshoot is what was running when the limit was reached
    held = go(client, team, "run-3")
    assert held[-1]["message"] == DAILY_STOP + PINNED and team["paid"].runs() == 2


@pytest.mark.parametrize(
    ("usage", "tokens", "unknown"),
    [
        pytest.param(reports(None, given=500, wrote=80), (500, 80), 1, id="the engine reported tokens and no cost"),
        pytest.param([None], (0, 0), 1, id="the engine reported nothing at all"),
        pytest.param(reports(0.4, currency="USD", given=500, wrote=80), (500, 80), 1, id="the cost is in another currency"),
    ],
)
def test_a_turn_with_no_cost_in_the_limits_currency_is_cost_unknown_and_holds_the_engine_never_zero_spent(
    client, fake_cli, tmp_path, monkeypatch, usage, tokens, unknown
):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": usage}, switching=PIN)
    team["paid"].plan([{"text": "Answered."}], [{"text": "Never started."}])
    assert said(go(client, team, "run-1")) == "Answered."
    month = team.totals["month"]
    assert (month["engine"]["input_tokens"], month["engine"]["output_tokens"]) == tokens
    assert month["engine"]["cost"] == 0 and month["engine"]["cost_unknown_turns"] == unknown and month["cost_unknown_turns"] == unknown
    assert team.totals["held"] == "unknown"
    second = go(client, team, "run-2")
    assert second[-1]["message"] == CANNOT_TELL + PINNED and team["paid"].runs() == 1


def test_a_turn_of_claude_or_of_a_free_engine_is_never_written_down_as_spend(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(0.5)})
    fake_cli.plan([{"text": "Claude answered."}], [{"text": "Claude again."}])  # Claude is first in the chain and answers
    assert said(go(client, team, "run-1")).endswith("Claude answered.") and said(go(client, team, "run-2")).endswith("Claude again.")
    assert team.ledger.turns() == [] and not team.path.exists()  # a login is not spend: nothing was counted, nothing written
    assert team.totals["day"]["engine"]["turns"] == 0 and team["paid"].runs() == 0


# ── Skipped like a limited engine, and what the person is told ─────────────────────────────────────


def test_a_paid_engine_at_its_limit_is_not_started_and_the_pinned_person_is_told_who_stopped_and_why(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, switching=PIN)
    team.ledger.record("paid", spend(1.0), "EUR")
    events = go(client, team)
    assert types(events) == ["RUN_STARTED", "RUN_ERROR"] and events[-1]["code"] == "FREEDUET_ENGINE_LIMITED"
    assert events[-1]["message"] == DAILY_STOP + PINNED
    assert team["paid"].runs() == 0 and team.claude.runs() == 0  # a pin never falls back to another engine


def test_the_pinned_person_who_reads_italian_is_told_in_italian(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, switching=PIN)
    team.ledger.record("paid", spend(1.0), "EUR")
    assert go(client, team, italian=True)[-1]["message"] == (
        "paid ha raggiunto il limite giornaliero che hai impostato (1.00 EUR)" + ITALIAN_PIN
    )


def test_with_claude_available_and_the_paid_engine_held_claude_answers_and_the_person_is_told_who_was_skipped(client, fake_cli, tmp_path, monkeypatch):
    # The paid engine is always last in a chain (logins first), so it is skipped on the way to an engine before it: the
    # notice is the router's existing one for an engine that cannot take the turn. It says so on every turn the engine stays
    # held; see docs/design/engines-ledger.md ("Decisions left to the maintainer") for what that means and the alternative.
    team = paid_team(tmp_path, fake_cli, monkeypatch)
    team.ledger.record("paid", spend(1.0), "EUR")
    fake_cli.plan([{"text": "Claude answered."}])
    events = go(client, team)
    assert said(events) == f"{DAILY_STOP}, so Claude Code is answering instead.Claude answered."
    assert types(events)[-1] == "RUN_FINISHED" and team["paid"].runs() == 0 and team.claude.runs() == 1


def test_the_same_notice_in_italian(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch)
    team.ledger.record("paid", spend(1.0), "EUR")
    fake_cli.plan([{"text": "Risposta di Claude."}])
    assert said(go(client, team, italian=True)) == (
        "paid ha raggiunto il limite giornaliero che hai impostato (1.00 EUR), quindi risponde Claude Code al suo posto.Risposta di Claude."
    )


def test_a_monthly_limit_is_named_as_the_monthly_one(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, daily=5, monthly=2, switching=PIN)
    team.ledger.record("paid", spend(1.0), "EUR")
    team.ledger.record("paid", spend(1.0), "EUR")
    assert go(client, team)[-1]["message"] == MONTHLY_STOP + PINNED


def test_when_claude_is_limited_and_the_paid_engine_is_held_the_person_is_told_both_and_the_message_is_kept(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch)
    team.ledger.record("paid", spend(1.0), "EUR")
    fake_cli.plan([LIMIT])
    events = go(client, team)
    assert (events[-1]["type"], events[-1]["code"]) == ("RUN_ERROR", "FREEDUET_ENGINE_LIMITED")
    assert events[-1]["message"] == (
        f"Every engine is unavailable right now. The earliest is back at 00:00 UTC. {DAILY_STOP}. "
        "Your message is kept: send it again later."
    )
    assert team["paid"].runs() == 0
    italian = go(client, team, "run-2", italian=True)  # Claude is held open by its breaker now: not even started again
    assert italian[-1]["message"] == (
        "Ora nessun motore è disponibile. Il primo torna alle 00:00 UTC. "
        "paid ha raggiunto il limite giornaliero che hai impostato (1.00 EUR). Il tuo messaggio è conservato: rimandalo più tardi."
    )
    assert team.claude.runs() == 1


def test_a_months_limit_is_not_called_a_time_of_day_but_a_days_limit_is(tmp_path, fake_cli, monkeypatch):
    # The notices write a clock time ("back at 00:00 UTC"), true of a day's limit and not of a month's: the router hands the
    # month's end to no notice, so that a month-long hold is never announced as tonight.
    day = paid_team(folder(tmp_path, "day"), fake_cli, monkeypatch)
    day.ledger.record("paid", spend(1.0), "EUR")
    month = paid_team(folder(tmp_path, "month"), fake_cli, monkeypatch, daily=5, monthly=2)
    month.ledger.record("paid", spend(2.0), "EUR")
    asked_day, asked_month = [], []
    assert day.router._pick(["paid"], set(), {}, asked_day) is None and month.router._pick(["paid"], set(), {}, asked_month) is None
    assert asked_day == [("paid", notices.Held(DAILY, "1.00 EUR"), datetime(2026, 11, 15, tzinfo=UTC))]
    assert asked_month[0][2] is None and asked_month[0][1].which == MONTHLY and asked_month[0][1].cap == "2.00 EUR"
    for found in (asked_day[0], asked_month[0]):
        assert isinstance(found[1], notices.Held)
    assert "earliest" not in notices.all_limited("en", None, (), (), [("paid", asked_month[0][1])])


# ── Available again when the day or the month turns ────────────────────────────────────────────────


def test_a_paid_engine_runs_again_when_the_utc_day_turns_and_not_a_second_before(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(1.0, 0.1)}, switching=PIN)
    team["paid"].plan([{"text": "Spent the day."}], [{"text": "A new day."}])
    assert said(go(client, team, "run-1")) == "Spent the day."
    team.clock.at = datetime(2026, 11, 14, 23, 59, 59, tzinfo=UTC)
    assert go(client, team, "run-2")[-1]["message"] == DAILY_STOP + PINNED and team["paid"].runs() == 1
    assert rows(client, team)["paid"]["state"] == "refused"
    team.clock.at = datetime(2026, 11, 15, 0, 0, 0, tzinfo=UTC)
    assert said(go(client, team, "run-3")) == "A new day."
    assert team.totals["day"]["period"] == "2026-11-15" and team.totals["day"]["spent"] == 0.1
    assert team.totals["month"]["spent"] == 1.1  # the month remembers the day before


def test_a_paid_engine_runs_again_when_the_month_turns_and_the_days_in_between_do_not_free_it(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, daily=5, monthly=2, costs={"paid": reports(1.0, 1.0, 0.5)}, switching=PIN)
    team["paid"].plan([{"text": "One."}], [{"text": "Two."}], [{"text": "Next month."}])
    assert said(go(client, team, "run-1")) == "One."
    team.clock.at = datetime(2026, 11, 20, 8, 0, tzinfo=UTC)
    assert said(go(client, team, "run-2")) == "Two."  # a new day, the same month: 1.00 of 2.00 spent, so it may run
    team.clock.at = datetime(2026, 11, 30, 23, 59, 59, tzinfo=UTC)
    assert go(client, team, "run-3")[-1]["message"] == MONTHLY_STOP + PINNED  # 2.00 of 2.00: the whole month is held
    team.clock.at = datetime(2026, 12, 1, 0, 0, 0, tzinfo=UTC)
    assert said(go(client, team, "run-4")) == "Next month."
    assert team["paid"].runs() == 3


def test_what_was_spent_and_the_hold_survive_a_restart_of_the_service(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(1.0)}, switching=PIN)
    team["paid"].plan([{"text": "Spent it."}], [{"text": "Never started."}])
    assert said(go(client, team, "run-1")) == "Spent it."
    again = restarted(team)  # a new engine state and a new ledger over the same file: the file is all the new service knows
    assert again.totals["day"]["spent"] == 1.0
    assert go(client, again, "run-2")[-1]["message"] == DAILY_STOP + PINNED and team["paid"].runs() == 1


# ── A file that is not the ledger's ────────────────────────────────────────────────────────────────


def test_a_damaged_ledger_file_holds_the_paid_engine_and_is_never_read_as_nothing_spent(client, fake_cli, tmp_path, monkeypatch):
    path = tmp_path / "ledger" / "engine-ledger.json"
    path.parent.mkdir()
    path.write_text('{"version": 1, "days": 3')  # cut short, the way a crash or a full disk leaves a file
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(0.1, 0.1)}, switching=PIN, path=path)
    team["paid"].plan([{"text": "Answered."}])
    events = go(client, team)
    assert events[-1]["message"] == CANNOT_TELL + PINNED and team["paid"].runs() == 0
    assert path.read_text() == '{"version": 1, "days": 3'  # not written over: it may be what the person is mending
    shown = rows(client, team)["paid"]
    assert shown["state"] == "refused" and shown["available"] is False
    assert "Mend it, or delete it" in shown["refusal"] and "the next turn then runs" in shown["refusal"]
    assert "damaged" in " ".join(team.state.snapshot().problems) and str(path.parent) not in json.dumps(shown)


def test_deleting_the_damaged_file_frees_the_engine_on_the_next_turn_with_no_restart_and_counting_starts_again(client, fake_cli, tmp_path, monkeypatch):
    path = tmp_path / "ledger" / "engine-ledger.json"
    path.parent.mkdir()
    path.write_text("not json at all")
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(0.4)}, switching=PIN, path=path)
    team["paid"].plan([{"text": "Back."}])
    assert go(client, team, "run-1")[-1]["message"] == CANNOT_TELL + PINNED
    path.unlink()  # the person's reset
    assert said(go(client, team, "run-2")) == "Back."
    assert json.loads(path.read_text())["days"]["2026-11-14"]["paid"]["cost"] == "0.4"


def test_mending_the_damaged_file_keeps_what_it_said(client, fake_cli, tmp_path, monkeypatch):
    path = tmp_path / "ledger" / "engine-ledger.json"
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(1.0)}, switching=PIN, path=path)
    team["paid"].plan([{"text": "Spent it."}])
    assert said(go(client, team, "run-1")) == "Spent it."
    good = path.read_bytes()
    path.write_bytes(b"{")
    again = restarted(team)
    assert go(client, again, "run-2")[-1]["message"] == CANNOT_TELL + PINNED
    path.write_bytes(good)
    assert go(client, again, "run-3")[-1]["message"] == DAILY_STOP + PINNED  # held by what the file says, not freed by the mend


# ── Two turns ending together ──────────────────────────────────────────────────────────────────────


def test_two_turns_in_flight_at_once_are_both_counted_and_both_may_pass_a_limit_the_first_to_end_has_not_yet_reached(client, fake_cli, tmp_path, monkeypatch):
    # Two members, each pinned to a paid engine of its own, both running when the check is made. The ledger has 0.9 of the
    # 1.00 day: neither turn is held, so both run, and what they cost is counted, both of it. This is the overshoot the
    # limits are documented to have: what was already running when the limit was reached, not one turn.
    barrier = threading.Barrier(2)
    team = paid_team(
        tmp_path, fake_cli, monkeypatch, ids=("paid", "paid2"), barrier=barrier,
        costs={"paid": reports(0.5), "paid2": reports(0.5)}, switching={"freeduet": {"pin": "paid"}, "chef": {"pin": "paid2"}},
    )
    team.ledger.record("paid", spend(0.9), "EUR")
    team["paid"].plan([{"text": "Iris, done."}])
    team["paid2"].plan([{"text": "Basil, done."}])
    results: dict[str, list[dict]] = {}

    def turn(bot_id):
        results[bot_id] = go(client, team, f"run-{bot_id}", bot_id=bot_id)

    threads = [threading.Thread(target=turn, args=(bot_id,)) for bot_id in ("freeduet", "chef")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(60)
    assert said(results["freeduet"]) == "Iris, done." and said(results["chef"]) == "Basil, done."
    assert team.totals["day"]["spent"] == 1.9  # 0.9 + 0.5 + 0.5: neither turn was lost to the other
    assert team.totals["day"]["engine"]["turns"] == 2  # this engine's own turns, the 0.9 recorded first and the one that ran
    assert team.ledger.view("paid2", team.state._limits)["day"]["engine"]["turns"] == 1
    assert go(client, team, "run-after")[-1]["message"] == DAILY_STOP + PINNED  # and then both engines are held
    assert go(client, team, "run-after-2", bot_id="chef")[-1]["message"] == "paid2 reached the daily limit you set (1.00 EUR)" + PINNED


# ── GET /engines ───────────────────────────────────────────────────────────────────────────────────


def test_get_engines_shows_the_spend_of_a_metered_engine_and_nothing_else_of_any_other(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch, costs={"paid": reports(0.25, given=1200, wrote=300)}, switching=PIN)
    team["paid"].plan([{"text": "The plan."}])
    go(client, team)
    found = rows(client, team)
    assert set(found) == {"claude-code", "paid"}
    assert "spend" not in found["claude-code"]  # the login's row is the row it always was
    assert found["paid"]["spend"] == {
        "currency": "EUR",
        "time_zone": "UTC",
        "held": None,
        "day": {
            "period": "2026-11-14", "cap": 1.0, "spent": 0.25, "cost_unknown_turns": 0,
            "engine": {"turns": 1, "input_tokens": 1200, "output_tokens": 300, "cost": 0.25, "cost_unknown_turns": 0},
        },
        "month": {
            "period": "2026-11", "cap": 10.0, "spent": 0.25, "cost_unknown_turns": 0,
            "engine": {"turns": 1, "input_tokens": 1200, "output_tokens": 300, "cost": 0.25, "cost_unknown_turns": 0},
        },
    }
    assert found["paid"]["state"] != "refused" and found["paid"]["available"] is True and not found["paid"].get("refusal")
    text = json.dumps(found)
    assert str(tmp_path) not in text and "engine-ledger" not in text  # numbers only: no path, no file name


def test_get_engines_shows_a_held_engine_as_not_run_with_the_sentence_that_says_why_and_until_when(client, fake_cli, tmp_path, monkeypatch):
    team = paid_team(tmp_path, fake_cli, monkeypatch)
    team.ledger.record("paid", spend(1.0), "EUR")
    shown = rows(client, team)["paid"]
    assert (shown["state"], shown["available"]) == ("refused", False)
    assert shown["refusal"] == "paid reached the daily limit you set (1.00 EUR). It runs again from 2026-11-15 00:00 UTC."
    assert shown["spend"]["held"] == DAILY and shown["limited_until"] == "2026-11-15T00:00:00+00:00"


def test_the_claude_row_of_a_service_that_holds_a_paid_engine_has_the_keys_it_has_without_one(client, fake_cli, tmp_path, monkeypatch):
    # Guard of unchanged behaviour: the row of an engine the ledger does not hold is the row of every release.
    plain = build(tmp_path, fake_cli, ("claude-code",))
    before = rows(client, plain)["claude-code"]
    team = paid_team(folder(tmp_path, "paid"), fake_cli, monkeypatch)
    after = rows(client, team)["claude-code"]
    assert set(after) == set(before) and "spend" not in after


# ── An installation that holds nothing ─────────────────────────────────────────────────────────────


def test_a_router_with_no_metered_engine_to_hold_makes_no_ledger(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    assert team.state._ledger is None and team.state.hold_of("claude-code") is None and team.state.hold_of("codex") is None


def test_a_person_who_asked_for_a_ledger_and_has_only_logins_and_free_engines_gets_none(client, fake_cli, tmp_path):
    def asks_for_a_ledger(data):
        data["metered"] = {"enabled": True, "currency": "EUR", "daily_cap": 1, "monthly_cap": 10, "enforce": "ledger"}

    team = build(tmp_path, fake_cli, ("claude-code", "codex", "local"), mutate=asks_for_a_ledger)
    assert team.state._ledger is None  # nothing in the file costs money, so there is nothing to hold
    assert not (fake_cli.data_dir / "engine-ledger.json").exists()


def test_the_service_built_from_the_persons_file_holds_a_paid_gateway_to_a_ledger_and_lists_its_spend(fake_cli, tmp_path, monkeypatch):
    import yaml

    from freeduet import engine_state
    from freeduet.claude_engine import ClaudeEngine
    from freeduet.engine_router import router_from_environment
    from gateway_support import KEY, KEY_ENV, data_with
    from ledger_support import open_the_gate

    open_the_gate(monkeypatch)  # the maintainer's switch and a kind that reports a verified cost: neither is so in this release
    monkeypatch.setenv(KEY_ENV, KEY)
    file = tmp_path / "engines.yaml"
    file.write_text(yaml.safe_dump(data_with({"billing": "metered"}, metered={
        "enabled": True, "currency": "EUR", "daily_cap": 1, "monthly_cap": 10, "enforce": "ledger"})), encoding="utf-8")
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(file))
    router = router_from_environment(EngineState(None), {"claude-code": ClaudeEngine()})
    assert set(router.adapters) == {"claude-code", "gw"}
    assert router.state.hold_of("gw") is None and router.state.hold_of("claude-code") is None
    assert router.state.row("gw").spend["day"]["cap"] == 1.0 and router.state.row("claude-code").spend is None
    assert engine_state.ledger_file() == fake_cli.data_dir / "engine-ledger.json"  # where the engine state would be kept
    assert not engine_state.ledger_file().exists()  # and nothing is written until a metered turn has been run


def test_a_service_that_holds_a_paid_engine_keeps_its_ledger_where_the_engine_state_goes(tmp_path, monkeypatch):
    from freeduet import engine_state

    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv(engine_state.STATE_FILE_ENV, raising=False)
    monkeypatch.delenv(engine_state.LEDGER_FILE_ENV, raising=False)
    assert engine_state.ledger_file() == tmp_path / "data" / "engine-ledger.json" == engine_state.state_file().parent / "engine-ledger.json"
    monkeypatch.setenv(engine_state.STATE_FILE_ENV, str(tmp_path / "elsewhere" / "state.json"))
    assert engine_state.ledger_file() == tmp_path / "elsewhere" / "engine-ledger.json"  # next to the state file, wherever it went
    monkeypatch.setenv(engine_state.LEDGER_FILE_ENV, "mine.json")
    assert engine_state.ledger_file() == tmp_path / "data" / "mine.json"  # a bare name is a file of the data directory
    monkeypatch.setenv(engine_state.LEDGER_FILE_ENV, str(tmp_path / "abs" / "ledger.json"))
    assert engine_state.ledger_file() == tmp_path / "abs" / "ledger.json"
