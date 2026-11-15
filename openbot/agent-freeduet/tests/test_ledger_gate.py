"""The gate in front of a paid gateway (docs/ENGINES_PLAN.md slice 12 and decision E3).

A paid gateway runs only when ALL of these hold: the maintainer's switch is open (`engines.PAID_GATEWAYS_OPEN`); the person
wrote `metered.enabled: true`, both caps above 0 and `metered.enforce: ledger`; the kind of engine reports what each turn
costs, in the currency of the limits (`engines.COST_REPORTING_KINDS`); and the entry is on and not locked. In this release
the switch is closed and no kind is listed, so nothing here changes what a default install or a free gateway does.

The tests that need the gate open do it for one test (`ledger_support.open_the_gate`); nothing opens it for good.
"""

from __future__ import annotations

import pytest

from freeduet import compatible_engine, engines
from freeduet import engine_notices as notices
from freeduet.engines import (
    COMPATIBLE_KIND,
    GAP_CLOSED,
    GAP_COST,
    GAP_SETUP,
    PAID_GATEWAY_NOT_RUN,
    EnginesFileError,
    exclusion_reason,
    ledger_engine_ids,
    paid_gateway_gap,
    paid_gateway_refusal,
    parse_engines,
)
from gateway_support import CLAUDE_ENTRY, ENTRY, KEY, KEY_ENV, config_with, data_with
from ledger_support import open_the_gate

PAID = {"billing": "metered"}
SETUP = {"enabled": True, "currency": "EUR", "daily_cap": 1, "monthly_cap": 10, "enforce": "ledger"}


def gateway(config):
    return config.engines["gw"]


# ── The release as it is ───────────────────────────────────────────────────────────────────────────


def test_in_this_release_the_switch_is_closed_and_no_kind_reports_a_cost_it_can_vouch_for():
    # The two places the maintainer changes to open paid gateways. Pinned so that opening them is a visible edit with a
    # review of its own, not a side effect: see docs/design/engines-ledger.md ("Decisions left to the maintainer").
    assert engines.PAID_GATEWAYS_OPEN is False
    assert dict(engines.COST_REPORTING_KINDS) == {}


def test_a_gateway_with_all_of_the_persons_words_is_still_refused_while_the_switch_is_closed(monkeypatch):
    monkeypatch.setenv(KEY_ENV, KEY)
    config = config_with(PAID, metered=SETUP)
    assert paid_gateway_gap(gateway(config), config) == GAP_CLOSED
    assert exclusion_reason(gateway(config), config) == f"gw is a paid gateway. {PAID_GATEWAY_NOT_RUN}"
    assert compatible_engine.adapters_from_config(config) == {}  # no adapter: nothing can start it
    assert ledger_engine_ids(config) == frozenset()  # and no ledger is made for an engine that cannot run


def test_the_closed_switch_has_its_own_sentence_that_does_not_ask_the_person_to_write_anything():
    assert paid_gateway_refusal("gw", GAP_CLOSED) == paid_gateway_refusal("gw")  # what every release so far said, word for word


# ── Each condition on its own ──────────────────────────────────────────────────────────────────────


def _blocks(**changes):
    return {**SETUP, **changes}


@pytest.mark.parametrize(
    ("top", "reported", "expected"),
    [
        pytest.param({"metered": _blocks()}, "EUR", None, id="everything holds"),
        pytest.param({"metered": _blocks()}, " eur ", None, id="the currency is compared without case or spaces"),
        pytest.param({}, "EUR", GAP_SETUP, id="no metered block"),
        pytest.param({"metered": _blocks(enabled=False)}, "EUR", GAP_SETUP, id="metered is off"),
        pytest.param({"metered": _blocks(daily_cap=0)}, "EUR", GAP_SETUP, id="the daily limit is 0"),
        pytest.param({"metered": _blocks(monthly_cap=0)}, "EUR", GAP_SETUP, id="the monthly limit is 0"),
        pytest.param({"metered": {k: v for k, v in SETUP.items() if k != "enforce"}}, "EUR", GAP_SETUP, id="enforce is not written"),
        pytest.param({"metered": _blocks(enforce="none")}, "EUR", GAP_SETUP, id="enforce is none"),
        pytest.param({"metered": _blocks()}, None, GAP_COST, id="the kind reports no cost"),
        pytest.param({"metered": _blocks()}, "USD", GAP_COST, id="the kind reports in another currency"),
        pytest.param({"metered": _blocks(currency="USD")}, "EUR", GAP_COST, id="the limits are in another currency"),
    ],
)
def test_a_paid_gateway_runs_only_when_every_condition_holds_and_each_one_alone_keeps_it_out(monkeypatch, top, reported, expected):
    monkeypatch.setenv(KEY_ENV, KEY)
    config = config_with(PAID, **top)
    open_the_gate(monkeypatch, reported or "EUR", reporting=reported is not None)
    assert paid_gateway_gap(gateway(config), config) == expected
    built = compatible_engine.adapters_from_config(config)
    if expected is None:
        assert set(built) == {"gw"} and exclusion_reason(gateway(config), config) is None
        assert ledger_engine_ids(config) == {"gw"}
    else:
        assert built == {} and exclusion_reason(gateway(config), config) == paid_gateway_refusal("gw", expected)
        assert ledger_engine_ids(config) == frozenset()


def test_the_switch_alone_is_not_enough_when_the_kind_reports_no_cost(monkeypatch):
    monkeypatch.setenv(KEY_ENV, KEY)
    monkeypatch.setattr(engines, "PAID_GATEWAYS_OPEN", True)  # the maintainer's switch, and nothing else
    config = config_with(PAID, metered=SETUP)
    assert paid_gateway_gap(gateway(config), config) == GAP_COST  # the table of verified facts is still empty
    assert compatible_engine.adapters_from_config(config) == {}


def test_a_gateway_that_is_off_or_locked_is_not_a_refused_one_and_gets_no_ledger(monkeypatch):
    open_the_gate(monkeypatch)
    for changes in ({"enabled": False}, {"locked_reason": "Not allowed."}):
        config = config_with({**PAID, **changes}, metered=SETUP)
        assert ledger_engine_ids(config) == frozenset()
        assert engines.refused_paid_gateways(config) == []  # never asked for: nothing is said


def test_the_cost_and_setup_sentences_say_what_is_missing_and_what_works(monkeypatch):
    assert paid_gateway_refusal("gw", GAP_SETUP) == (
        "gw is a paid gateway. It runs only when engines.yaml turns `metered` on, with a daily and a monthly limit above 0 "
        "and `enforce: ledger`, so that FreeDuet keeps the limits you set. Free gateways and your own logins work."
    )
    assert paid_gateway_refusal("gw", GAP_COST) == (
        "gw is a paid gateway. It does not report what each turn costs, in the currency of your limits, so FreeDuet cannot "
        "hold it to a money limit. Free gateways and your own logins work."
    )
    for gap in (GAP_CLOSED, GAP_SETUP, GAP_COST):
        sentence = paid_gateway_refusal("gw", gap)
        assert "API" not in sentence and "price" not in sentence and "per million" not in sentence  # MAR-15: no provider tariffs


@pytest.mark.parametrize("gap", [GAP_CLOSED, GAP_SETUP, GAP_COST])
def test_the_person_who_reads_italian_is_told_the_same_in_italian(gap):
    said = notices.paid_off("it", ["gw"], {"gw": gap})
    assert said.strip().startswith("gw è un gateway a pagamento.") and "I gateway gratuiti e i motori su cui hai effettuato l'accesso funzionano." in said
    assert "paid gateway" not in said
    pinned = notices.pinned_paid_off("it", "gw", gap)
    assert pinned.startswith(said.strip()) and pinned.endswith("mi fermo qui e non passo a un altro motore.")
    assert notices.paid_off("en", ["gw"], {"gw": gap}).strip() == paid_gateway_refusal("gw", gap)


def test_the_three_italian_sentences_differ_because_the_three_reasons_do():
    sentences = {notices.paid_off("it", ["gw"], {"gw": gap}) for gap in (GAP_CLOSED, GAP_SETUP, GAP_COST)}
    assert len(sentences) == 3


# ── The new word in the file ───────────────────────────────────────────────────────────────────────


def test_enforce_is_none_when_it_is_not_written():
    parsed = parse_engines(data_with(metered={"enabled": True, "currency": "EUR", "daily_cap": 5, "monthly_cap": 50}))
    assert parsed.metered.enforce == "none"
    assert parse_engines(data_with()).metered.enforce == "none"


@pytest.mark.parametrize("word", ["none", "ledger"])
def test_enforce_takes_the_two_words_and_keeps_what_was_written(word):
    assert parse_engines(data_with(metered={**SETUP, "enforce": word})).metered.enforce == word


@pytest.mark.parametrize("word", ["yes", "Ledger", True, 1, None, ["ledger"], ""])
def test_any_other_word_for_enforce_is_a_mistake_the_file_names(word):
    with pytest.raises(EnginesFileError) as caught:
        parse_engines(data_with(metered={**SETUP, "enforce": word}))
    assert "metered: `enforce` must be one of none, ledger" in str(caught.value)


def test_an_unknown_key_in_the_metered_block_is_still_a_mistake():
    with pytest.raises(EnginesFileError):
        parse_engines(data_with(metered={**SETUP, "enforcement": "ledger"}))


def test_the_shipped_example_asks_for_no_ledger():
    # Guard of unchanged behaviour: an installation that copies the example is held to nothing, because it spends nothing.
    example = engines.load_engines(engines.EXAMPLE_ENGINES_FILE)
    assert example.metered.enforce == "none" and ledger_engine_ids(example) == frozenset()


# ── Which engines the ledger holds ─────────────────────────────────────────────────────────────────


def test_only_metered_engines_that_may_run_are_held_and_never_a_login_or_a_free_engine(monkeypatch):
    open_the_gate(monkeypatch)
    free = {"free-gw": {**ENTRY, "billing": "free"}}
    config = config_with(PAID, extra=free, metered=SETUP)
    assert set(config.engines) == {"claude-code", "gw", "free-gw"}
    assert ledger_engine_ids(config) == {"gw"}


def test_without_the_persons_enforce_word_no_engine_is_held_whatever_else_holds(monkeypatch):
    open_the_gate(monkeypatch)
    config = config_with(PAID, metered=_blocks(enforce="none"))
    assert ledger_engine_ids(config) == frozenset()


def test_a_default_file_holds_nothing_and_asks_the_ledger_for_nothing():
    config = parse_engines({"engines": {"claude-code": dict(CLAUDE_ENTRY)}, "chains": {"default": ["claude-code"]}})
    assert ledger_engine_ids(config) == frozenset()
    assert config.metered == engines.Metered(enabled=False, currency="EUR", daily_cap=0, monthly_cap=0)
    assert COMPATIBLE_KIND not in {engine.kind for engine in config.engines.values()}
