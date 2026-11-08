"""engines.py: loading, validation, logins-first ordering, metered exclusion, quality floor."""

from __future__ import annotations

import copy
import itertools
import sys
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from freeduet import engines  # noqa: E402
from freeduet.engines import EnginesFileError, parse_engines  # noqa: E402

BASE = {
    "engines": {
        "claude-code": {
            "kind": "cli",
            "command": "claude",
            "billing": "subscription",
            "tier": "A",
            "enabled": True,
        },
        "codex": {
            "kind": "app-server",
            "command": "codex",
            "billing": "subscription",
            "tier": "A",
            "enabled": True,
        },
        "gemini-cli": {
            "kind": "acp",
            "command": "gemini",
            "billing": "subscription",
            "tier": "A",
            "enabled": True,
            "locked_reason": "Provider terms do not allow it.",
        },
        "local": {
            "kind": "openai-compatible",
            "base_url": "http://127.0.0.1:11434/v1",
            "billing": "free",
            "model": "llama-test",
            "tier": "C",
            "enabled": True,
        },
        "anthropic-api": {
            "kind": "anthropic-api",
            "credential_secret_ref": "anthropic-api-key",
            "billing": "metered",
            "model": "claude-sonnet-5-5",
            "tier": "A",
            "enabled": True,
        },
        "openrouter": {
            "kind": "openai-compatible",
            "base_url": "https://openrouter.ai/api/v1",
            "credential_secret_ref": "openrouter-api-key",
            "billing": "metered",
            "model": "vendor/some-model",
            "tier": "B",
            "enabled": True,
        },
    },
    "metered": {"enabled": True, "currency": "EUR", "daily_cap": 5, "monthly_cap": 50},
    "chains": {
        "default": ["anthropic-api", "local", "claude-code"],
        "chef": ["openrouter", "local", "codex", "claude-code"],
    },
    "quality_floor": {"concierge": {"request_purchase": "A"}},
    "assistants": {"enabled": True, "chain": ["local"]},
}

MIXED = ["claude-code", "codex", "local", "anthropic-api", "openrouter"]


def config(mutate=None) -> engines.EnginesConfig:
    data = copy.deepcopy(BASE)
    if mutate is not None:
        mutate(data)
    return parse_engines(data)


def ids(chain) -> list[str]:
    return [engine.id for engine in chain]


# ── The shipped example ──────────────────────────────────────────────────────────────────────────


def test_example_file_loads_and_runs_on_the_login_only():
    example = engines.load_engines(engines.EXAMPLE_ENGINES_FILE)
    assert len(example.engines) == 8
    assert example.metered.enabled is False
    assert example.metered.daily_cap == 0 and example.metered.monthly_cap == 0
    for member in example.chains:
        assert ids(engines.ordered_chain(member, example)) == ["claude-code"]
    assert engines.assistant_chain(example) == []  # every free engine ships disabled


def test_example_locks_gemini_and_keeps_metered_last_in_every_chain():
    example = engines.load_engines(engines.EXAMPLE_ENGINES_FILE)
    assert engines.exclusion_reason(example.engines["gemini-cli"], example).startswith("locked")
    for member, chain in example.chains.items():
        written = [example.engines[engine_id] for engine_id in chain]
        ranks = [engines.BILLING_RANK[engine.billing] for engine in engines.order_logins_first(written)]
        assert ranks == sorted(ranks), member


# ── File location ────────────────────────────────────────────────────────────────────────────────


def test_engines_file_from_environment(tmp_path):
    custom = tmp_path / "engines.yaml"
    custom.write_text("engines: {}\n", encoding="utf-8")
    assert engines.engines_file_path({"FREEDUET_ENGINES_FILE": str(custom)}) == custom


def test_missing_engines_file_falls_back_to_the_example(tmp_path):
    missing = tmp_path / "nope.yaml"
    assert engines.engines_file_path({"FREEDUET_ENGINES_FILE": str(missing)}) == (
        engines.EXAMPLE_ENGINES_FILE
    )


@pytest.mark.skipif(Path("/app/engines.yaml").exists(), reason="a real /app/engines.yaml exists")
def test_unset_engines_file_falls_back_to_the_example():
    assert engines.engines_file_path({}) == engines.EXAMPLE_ENGINES_FILE


def test_ordered_chain_reads_the_configured_file_when_no_config_is_given(tmp_path, monkeypatch):
    import yaml

    data = copy.deepcopy(BASE)
    data["chains"]["default"] = ["local", "claude-code"]
    path = tmp_path / "engines.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(path))
    assert ids(engines.ordered_chain("anyone")) == ["claude-code", "local"]


# ── Logins first ─────────────────────────────────────────────────────────────────────────────────


def test_logins_first_whatever_order_the_file_lists():
    assert ids(engines.ordered_chain("default", config())) == [
        "claude-code",
        "local",
        "anthropic-api",
    ]
    assert ids(engines.ordered_chain("chef", config())) == [
        "codex",
        "claude-code",
        "local",
        "openrouter",
    ]


@pytest.mark.parametrize("order", list(itertools.permutations(MIXED)))
def test_metered_is_never_first_in_any_order(order):
    def mutate(data):
        data["chains"]["default"] = list(order)

    chain = engines.ordered_chain("default", config(mutate))
    billings = [engine.billing for engine in chain]
    assert billings[0] != "metered"
    assert billings == ["subscription", "subscription", "free", "metered", "metered"]
    # Within a group the file's order holds.
    written_logins = [engine_id for engine_id in order if engine_id in ("claude-code", "codex")]
    assert ids(chain)[:2] == written_logins


def test_a_chain_of_only_metered_engines_is_empty_while_metered_is_off():
    def mutate(data):
        data["metered"]["enabled"] = False
        data["chains"]["default"] = ["anthropic-api", "openrouter"]

    assert engines.ordered_chain("default", config(mutate)) == []


@pytest.mark.parametrize(
    "metered",
    [
        {"enabled": False, "daily_cap": 5, "monthly_cap": 50},
        {"enabled": True, "daily_cap": 0, "monthly_cap": 50},
        {"enabled": True, "daily_cap": 5, "monthly_cap": 0},
        {"enabled": True, "daily_cap": 0, "monthly_cap": 0},
        {"enabled": True},  # missing caps are 0, and 0 means never
    ],
    ids=["switched-off", "daily-cap-0", "monthly-cap-0", "both-caps-0", "caps-missing"],
)
def test_metered_engines_are_absent_while_off_or_capped_at_zero(metered):
    def mutate(data):
        data["metered"] = metered

    cfg = config(mutate)
    assert engines.metered_allowed(cfg) is False
    for order in itertools.permutations(MIXED):

        def with_order(data, order=order):
            data["metered"] = metered
            data["chains"]["default"] = list(order)

        chain = engines.ordered_chain("default", config(with_order))
        assert ids(chain)[:2] in (["claude-code", "codex"], ["codex", "claude-code"])
        assert all(engine.billing != "metered" for engine in chain)
    reason = engines.exclusion_reason(cfg.engines["anthropic-api"], cfg)
    assert reason is not None and ("off" in reason or "cap is 0" in reason)


def test_disabled_engine_is_never_chosen():
    def mutate(data):
        data["engines"]["codex"]["enabled"] = False

    cfg = config(mutate)
    assert "codex" not in ids(engines.ordered_chain("chef", cfg))
    assert engines.exclusion_reason(cfg.engines["codex"], cfg) == "disabled in engines.yaml"


def test_engine_with_a_locked_reason_is_never_chosen_even_when_enabled():
    def mutate(data):
        data["chains"]["default"] = ["gemini-cli", "claude-code"]

    cfg = config(mutate)
    assert cfg.engines["gemini-cli"].enabled is True
    assert ids(engines.ordered_chain("default", cfg)) == ["claude-code"]
    assert engines.exclusion_reason(cfg.engines["gemini-cli"], cfg).startswith("locked")


def test_member_without_a_chain_uses_the_default():
    cfg = config()
    assert ids(engines.ordered_chain("writer", cfg)) == ids(engines.ordered_chain("default", cfg))


def test_min_tier_drops_engines_below_the_floor():
    cfg = config()
    assert ids(engines.ordered_chain("default", cfg, min_tier="A")) == [
        "claude-code",
        "anthropic-api",
    ]
    assert ids(engines.ordered_chain("chef", cfg, min_tier="B")) == [
        "codex",
        "claude-code",
        "openrouter",
    ]
    with pytest.raises(ValueError):
        engines.ordered_chain("default", cfg, min_tier="Z")


# ── Quality floor ────────────────────────────────────────────────────────────────────────────────


def test_quality_floor_helpers():
    cfg = config()
    assert engines.required_tier("concierge", "request_purchase", cfg) == "A"
    assert engines.required_tier("concierge", "web_search", cfg) is None
    assert engines.required_tier("chef", "request_purchase", cfg) is None
    assert engines.meets_quality_floor(cfg.engines["claude-code"], "concierge", "request_purchase", cfg)
    assert not engines.meets_quality_floor(cfg.engines["local"], "concierge", "request_purchase", cfg)
    assert engines.meets_quality_floor(cfg.engines["local"], "concierge", "web_search", cfg)
    assert engines.tier_at_least("B", "C") and not engines.tier_at_least("C", "B")


def test_example_quality_floor_for_jules():
    example = engines.load_engines(engines.EXAMPLE_ENGINES_FILE)
    assert engines.required_tier("concierge", "request_purchase", example) == "A"
    assert engines.required_tier("concierge", "book-an-appointment", example) == "A"


# ── Assistants ───────────────────────────────────────────────────────────────────────────────────


def test_assistant_chain_holds_enabled_free_engines_only():
    assert ids(engines.assistant_chain(config())) == ["local"]

    def off(data):
        data["assistants"]["enabled"] = False

    assert engines.assistant_chain(config(off)) == []

    def local_disabled(data):
        data["engines"]["local"]["enabled"] = False

    assert engines.assistant_chain(config(local_disabled)) == []


# ── Validation ───────────────────────────────────────────────────────────────────────────────────


def _set(path: str, value):
    def mutate(data):
        node = data
        keys = path.split(".")
        for key in keys[:-1]:
            node = node[key]
        node[keys[-1]] = value

    return mutate


def _delete(path: str):
    def mutate(data):
        node = data
        keys = path.split(".")
        for key in keys[:-1]:
            node = node[key]
        del node[keys[-1]]

    return mutate


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (_set("engines.codex.kind", "telnet"), "`kind` must be one of"),
        (_set("engines.local.billing", "subscription"), "cannot have `billing: subscription`"),
        (_set("engines.anthropic-api.billing", "free"), "always `billing: metered`"),
        (_set("engines.claude-code.enabled", "false"), "`enabled` must be true or false"),
        (_set("engines.claude-code.enable", True), "unknown key `enable`"),
        (_set("engines.claude-code.tier", "S"), "`tier` must be one of"),
        (_set("engines.claude-code.credential_secret_ref", "x"), "cannot carry `credential_secret_ref`"),
        (_delete("engines.codex.command"), "needs `command`"),
        (_delete("engines.local.base_url"), "needs `base_url`"),
        (_set("engines.local.base_url", "ftp://host/v1"), "must start with http"),
        (_set("engines.local.model", "<local-model-name>"), "replace the placeholder model"),
        (_set("chains.default", ["claude-code", "ghost"]), "`ghost` is not defined"),
        (_set("chains.default", ["claude-code", "claude-code"]), "listed twice"),
        (_set("chains.default", []), "non-empty list"),
        (_delete("chains.default"), "needs a `default` chain"),
        (_set("assistants.chain", ["claude-code"]), "assistants run on free engines only"),
        (_set("assistants.chain", ["openrouter"]), "assistants run on free engines only"),
        (_set("assistants.max_input_tokens", 0), "`max_input_tokens` must be"),
        (_set("metered.daily_cap", -1), "`daily_cap` must be a number of 0 or more"),
        (_set("metered.monthly_cap", True), "`monthly_cap` must be a number of 0 or more"),
        (_set("metered.enabled", "yes please"), "metered: `enabled` must be true or false"),
        (_set("quality_floor.concierge.request_purchase", "S"), "must name a tier"),
        (_set("routers", {}), "unknown top-level key `routers`"),
    ],
)
def test_invalid_files_are_refused(mutate, expected):
    with pytest.raises(EnginesFileError) as caught:
        config(mutate)
    assert any(expected in problem for problem in caught.value.problems), caught.value.problems


def test_a_disabled_engine_may_keep_its_placeholder_model():
    def placeholder(data):
        data["engines"]["local"]["enabled"] = False
        data["engines"]["local"]["model"] = "<local-model-name>"

    assert config(placeholder).engines["local"].model == "<local-model-name>"


def test_every_problem_is_reported_at_once():
    def mutate(data):
        data["engines"]["codex"]["kind"] = "telnet"
        data["metered"]["daily_cap"] = -3

    with pytest.raises(EnginesFileError) as caught:
        config(mutate)
    assert len(caught.value.problems) >= 2
    assert "is not a valid engines file" in str(caught.value)


@pytest.mark.parametrize("document", [None, [], "engines", {"engines": []}])
def test_a_document_that_is_not_an_engines_mapping_is_refused(document):
    with pytest.raises(EnginesFileError):
        parse_engines(document)


def test_invalid_yaml_is_refused(tmp_path):
    path = tmp_path / "engines.yaml"
    path.write_text("engines: [unclosed\n", encoding="utf-8")
    with pytest.raises(EnginesFileError) as caught:
        engines.load_engines(path)
    assert "not valid YAML" in caught.value.problems[0]
