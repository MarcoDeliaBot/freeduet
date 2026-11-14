"""The `anthropic-compatible` kind in engines.yaml (docs/ENGINES_PLAN.md slice 5): what the file may say about an
endpoint the person names, and what it may never say.

Pure: nothing here starts a process or opens a network connection. Every key, address and name is invented.
"""

from __future__ import annotations

import copy
import re

import pytest

from freeduet import engines
from freeduet.engines import COMPATIBLE_KIND, EnginesFileError, is_local_host, parse_engines, parse_secret_ref
from gateway_support import BASE_URL, CLAUDE_ENTRY, ENTRY, KEY, config_with

SECRET_IN_URL = "SECRETPASSWORD-9f2c"


def problems_of(entry: dict | None = None, **top) -> list[str]:
    with pytest.raises(EnginesFileError) as caught:
        config_with(entry, **top)
    return caught.value.problems


# ── The entry itself ─────────────────────────────────────────────────────────────────────────────


def test_the_kind_is_known_and_an_entry_is_off_until_it_is_switched_on():
    engine = config_with({"enabled": None}).engines["gw"]
    assert (engine.kind, engine.billing, engine.enabled) == (COMPATIBLE_KIND, "free", False)
    assert engine.base_url == BASE_URL and engine.credential_secret_ref.startswith("env:")
    assert COMPATIBLE_KIND in engines.KINDS and COMPATIBLE_KIND in engines.API_KINDS
    assert COMPATIBLE_KIND not in engines.LOGIN_KINDS


def test_the_tier_is_c_unless_the_person_says_otherwise():
    assert config_with().engines["gw"].tier == "C"
    assert config_with({"tier": "B"}).engines["gw"].tier == "B"
    assert config_with({"tier": "A"}).engines["gw"].tier == "A"
    assert any("`tier` must be one of" in problem for problem in problems_of({"tier": "S"}))


def test_the_default_tier_is_not_given_to_the_kinds_that_already_exist():
    # Guard of unchanged behaviour: an API engine of another kind still has to say its tier.
    data = {
        "engines": {"claude-code": dict(CLAUDE_ENTRY), "local": {"kind": "openai-compatible", "base_url": "http://127.0.0.1:11434/v1",
                                                                   "billing": "free", "model": "m", "enabled": True}},
        "chains": {"default": ["claude-code", "local"]},
    }
    with pytest.raises(EnginesFileError) as caught:
        parse_engines(data)
    assert any("`tier` must be one of" in problem for problem in caught.value.problems)


def test_billing_has_no_default_and_is_never_guessed():
    problem = problems_of({"billing": None})
    assert any("`billing` must be one of subscription, free, metered" in line for line in problem)
    assert config_with({"billing": "free"}).engines["gw"].billing == "free"
    assert config_with({"billing": "metered"}).engines["gw"].billing == "metered"


def test_an_endpoint_cannot_be_called_a_subscription():
    assert any("cannot have `billing: subscription`" in line for line in problems_of({"billing": "subscription"}))


# ── A paid endpoint is read, and refused ─────────────────────────────────────────────────────────

#: What a paid (metered) gateway the person switched on is told, whatever the `metered:` block says: FreeDuet cannot enforce
#: the caps until the usage ledger exists (slice 12 of the plan), and caps that are not enforced must not let money be spent.
PAID_SENTENCE = (
    "gw is a paid gateway. FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. "
    "Free gateways and your own logins work."
)
WHOLE_OPT_IN = {"enabled": True, "currency": "EUR", "daily_cap": 5, "monthly_cap": 50}


def test_the_metered_block_is_still_read_and_checked_so_the_file_format_does_not_change_later():
    config = config_with({"billing": "metered"}, metered=WHOLE_OPT_IN)
    assert config.metered == engines.Metered(enabled=True, currency="EUR", daily_cap=5, monthly_cap=50)
    assert config.engines["gw"].billing == "metered"
    # The same checks as before: a wrong value is still a problem of the file, with the words it always had.
    assert any("`daily_cap` must be a number of 0 or more" in line for line in problems_of({"billing": "metered"}, metered={**WHOLE_OPT_IN, "daily_cap": -1}))
    assert any("unknown key `limit`" in line for line in problems_of({"billing": "metered"}, metered={**WHOLE_OPT_IN, "limit": 3}))
    assert any("`enabled` must be true or false" in line for line in problems_of({"billing": "metered"}, metered={**WHOLE_OPT_IN, "enabled": "yes please"}))


@pytest.mark.parametrize("top", [
    {},
    {"metered": {"enabled": False, "daily_cap": 5, "monthly_cap": 50}},
    {"metered": {"enabled": True}},
    {"metered": {"enabled": True, "daily_cap": 5, "monthly_cap": 0}},
    {"metered": WHOLE_OPT_IN},
])
def test_a_paid_endpoint_that_is_switched_on_is_refused_with_one_sentence_whatever_the_metered_block_says(top):
    config = config_with({"billing": "metered"}, **top)
    gateway = config.engines["gw"]
    assert engines.exclusion_reason(gateway, config) == PAID_SENTENCE
    assert not engines.is_allowed(gateway, config)
    assert engines.paid_gateway_refused(gateway) and [engine.id for engine in engines.refused_paid_gateways(config)] == ["gw"]
    assert "gw" not in [engine.id for engine in engines.ordered_chain("default", config)]


@pytest.mark.parametrize("entry, reason", [({"enabled": False}, "disabled in engines.yaml"), ({"locked_reason": "No."}, "locked: No.")])
def test_a_paid_endpoint_that_is_off_or_locked_keeps_the_ordinary_reason_and_is_not_called_refused(entry, reason):
    config = config_with({"billing": "metered", **entry}, metered=WHOLE_OPT_IN)
    assert engines.exclusion_reason(config.engines["gw"], config) == reason
    assert not engines.paid_gateway_refused(config.engines["gw"]) and engines.refused_paid_gateways(config) == []


@pytest.mark.parametrize("top", [{}, {"metered": WHOLE_OPT_IN}])
def test_a_free_endpoint_is_never_refused_by_the_paid_rule(top):
    config = config_with({"billing": "free"}, **top)
    assert engines.exclusion_reason(config.engines["gw"], config) is None
    assert engines.refused_paid_gateways(config) == []
    assert [engine.id for engine in engines.ordered_chain("default", config)] == ["claude-code", "gw"]


def test_the_paid_rule_is_for_this_kind_only_so_the_other_metered_engines_keep_their_rules():
    # Guard of unchanged behaviour: `exclusion_reason` for `anthropic-api` and `openai-compatible` is what it was.
    data = {
        "engines": {
            "claude-code": dict(CLAUDE_ENTRY),
            "api": {"kind": "anthropic-api", "credential_secret_ref": "anthropic-api-key", "billing": "metered",
                    "model": "m", "tier": "A", "enabled": True},
            "kimi": {"kind": "openai-compatible", "base_url": "https://api.example.invalid/v1", "billing": "metered",
                     "model": "m", "tier": "B", "enabled": True},
        },
        "chains": {"default": ["claude-code", "api", "kimi"]},
        "metered": WHOLE_OPT_IN,
    }
    config = parse_engines(data)
    assert [engines.exclusion_reason(config.engines[name], config) for name in ("api", "kimi")] == [None, None]
    assert engines.refused_paid_gateways(config) == []
    off = parse_engines({**data, "metered": {"enabled": False}})
    assert engines.exclusion_reason(off.engines["api"], off) == "metered engines are off (`metered.enabled: false`)"


@pytest.mark.parametrize("missing, fragment", [
    ("base_url", "needs `base_url`"),
    ("credential_secret_ref", "needs `credential_secret_ref`"),
    ("model", "needs `model`"),
])
def test_an_entry_needs_its_address_its_key_and_its_model(missing, fragment):
    assert any(fragment in line for line in problems_of({missing: None}))


def test_without_a_key_the_cli_would_keep_a_claude_sign_in_and_the_file_says_so():
    assert any("would keep using a Claude sign-in" in line for line in problems_of({"credential_secret_ref": None}))


def test_it_takes_no_command_because_it_is_the_claude_code_cli():
    assert any("takes no `command`" in line for line in problems_of({"command": "claude"}))


def test_a_login_cannot_carry_a_key_but_this_kind_must():
    # Guard of unchanged behaviour (rule 1 of PROVIDERS.md): the login kinds still refuse `credential_secret_ref`.
    data = {"engines": {"claude-code": {**CLAUDE_ENTRY, "credential_secret_ref": "env:SOMETHING"}}, "chains": {"default": ["claude-code"]}}
    with pytest.raises(EnginesFileError) as caught:
        parse_engines(data)
    assert any("cannot carry `credential_secret_ref`" in line for line in caught.value.problems)


def test_a_placeholder_model_is_refused_once_the_entry_is_switched_on():
    assert config_with({"model": "<model-id>", "enabled": False}).engines["gw"].enabled is False
    assert any("replace the placeholder model" in line for line in problems_of({"model": "<model-id>", "enabled": True}))


# ── Where the key is read from ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("reference, parsed", [
    ("env:GATEWAY_KEY", ("env", "GATEWAY_KEY")),
    ("env:_x9", ("env", "_x9")),
    ("file:/run/secrets/gateway-key", ("file", "/run/secrets/gateway-key")),
    ("file:/key", ("file", "/key")),
])
def test_the_two_forms_of_a_key_reference(reference, parsed):
    assert parse_secret_ref(reference) == parsed


@pytest.mark.parametrize("reference", [
    "openrouter-api-key",       # the symbolic names of the other kinds are not enough here
    "env:",
    "env:1ABC",
    "env:A-B",
    "env:A B",
    "file:",
    "file:relative/key",
    "file:/with\nnewline",
    "file:/data/.secrets/key",  # a folder whose name starts with a dot is where a program keeps its own sign-in
    "file:/run/secrets/.key",
    "file:/run/secrets/../key",
    "file:/.hidden",
    "http://example.com/key",
    KEY,                        # the key itself, pasted into the file by mistake
    "",
    None,
    5,
])
def test_anything_else_is_not_a_key_reference(reference):
    assert parse_secret_ref(reference) is None


def test_a_key_pasted_into_the_file_is_refused_and_never_repeated():
    with pytest.raises(EnginesFileError) as caught:
        config_with({"credential_secret_ref": KEY})
    assert any("`credential_secret_ref` must be `env:NAME`" in line for line in caught.value.problems)
    assert KEY not in str(caught.value) and KEY not in repr(caught.value.problems)


def test_a_key_file_in_a_hidden_folder_is_a_problem_of_the_file_that_says_so_and_does_not_repeat_the_path():
    reference = "file:/data/.secrets/gateway-key"
    with pytest.raises(EnginesFileError) as caught:
        config_with({"credential_secret_ref": reference})
    assert any("in no folder whose name starts with a dot" in line for line in caught.value.problems)
    assert reference not in str(caught.value) and ".secrets" not in repr(caught.value.problems)


# ── Where the endpoint is ────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("address", [
    "https://openrouter.ai/api",
    "https://gateway.example.com",
    "https://gateway.example.com:8443/anthropic",
    "http://localhost:3002",
    "http://LOCALHOST:3002",
    "http://127.0.0.1:3002",
    "http://127.10.20.30:3002",
    "http://[::1]:3002",
    "http://host.docker.internal:3002",
])
def test_an_address_the_key_may_travel_to(address):
    assert config_with({"base_url": address}).engines["gw"].base_url == address


@pytest.mark.parametrize("address, fragment", [
    ("http://gateway.example.com", "must be https:// unless it points at this machine"),
    ("http://192.168.1.20:3002", "must be https:// unless it points at this machine"),
    ("http://my-bridge:3002", "must be https:// unless it points at this machine"),
    ("http://localhost.example.com", "must be https:// unless it points at this machine"),
    ("http://127.0.0.1.example.com", "must be https:// unless it points at this machine"),
    ("http://0.0.0.0:3002", "must be https:// unless it points at this machine"),
    ("ftp://gateway.example.com", "must be an http:// or https:// address"),
    ("localhost:3002", "must be an http:// or https:// address"),
    ("https://", "must be an http:// or https:// address"),
    ("https://gateway.example.com:99999", "is not a valid address"),
    ("https://gateway.example.com/with space", "must not contain spaces"),
    (f"https://person:{SECRET_IN_URL}@gateway.example.com", "must not carry a user name or a password"),
    (f"https://gateway.example.com?token={SECRET_IN_URL}", "must not carry a query or a fragment"),
    (f"https://gateway.example.com/#{SECRET_IN_URL}", "must not carry a query or a fragment"),
])
def test_an_address_the_key_may_not_travel_to(address, fragment):
    with pytest.raises(EnginesFileError) as caught:
        config_with({"base_url": address})
    assert any(fragment in line for line in caught.value.problems), caught.value.problems
    assert SECRET_IN_URL not in str(caught.value), "the message must not repeat an address that may hold a secret"


@pytest.mark.parametrize("host, local", [
    ("localhost", True), ("LocalHost", True), ("host.docker.internal", True), ("127.0.0.1", True), ("127.5.5.5", True),
    ("::1", True), ("openrouter.ai", False), ("192.168.0.4", False), ("10.0.0.1", False), ("0.0.0.0", False),
    ("localhost.evil.example", False), ("", False), (None, False),
])
def test_which_hosts_are_this_machine(host, local):
    assert is_local_host(host) is local


# ── The shipped example ──────────────────────────────────────────────────────────────────────────


def example_text() -> str:
    return engines.EXAMPLE_ENGINES_FILE.read_text(encoding="utf-8")


def commented_entries() -> dict[str, dict]:
    """The commented-out entries of the shipped example, uncommented and parsed: an entry's name line is
    `  # name:` and each of its fields is `  #   field: value`; every other comment is prose."""
    lines: list[str] = []
    for line in example_text().splitlines():
        if re.fullmatch(r"  # [a-z][a-z0-9-]*:\s*", line) or re.fullmatch(r"  #   [a-z_]+: .*", line):
            lines.append(line.replace("  # ", "  ", 1))
    import yaml

    return yaml.safe_load("engines:\n" + "\n".join(lines))["engines"]


def test_the_shipped_example_has_no_active_entry_of_this_kind():
    example = engines.load_engines(engines.EXAMPLE_ENGINES_FILE)
    assert [engine.id for engine in example.engines.values() if engine.kind == COMPATIBLE_KIND] == []
    assert not any(COMPATIBLE_KIND in chain for chain in example.chains.values())


def test_the_two_commented_out_examples_are_valid_and_off():
    entries = commented_entries()
    assert set(entries) == {"my-gateway", "local-free-router"}
    data = {
        "engines": {"claude-code": dict(CLAUDE_ENTRY), **copy.deepcopy(entries)},
        "chains": {"default": ["claude-code"]},
    }
    config = parse_engines(data)
    for name in entries:
        engine = config.engines[name]
        assert engine.kind == COMPATIBLE_KIND and engine.enabled is False and engine.tier == "C"
        assert parse_secret_ref(engine.credential_secret_ref) is not None
    assert config.engines["my-gateway"].billing == "metered"
    assert config.engines["local-free-router"].billing == "free"


def test_the_local_router_example_uses_another_port_than_the_servers_and_says_why():
    entry = commented_entries()["local-free-router"]
    port = int(re.search(r":(\d+)", entry["base_url"]).group(1))
    assert port != 3001  # the port FreeDuet's own server listens on (openbot/.env.example, PORT)
    host = re.match(r"http://([^:/]+)", entry["base_url"]).group(1)
    assert is_local_host(host)
    text = example_text()
    assert "3001" in text and "FreeDuet's server" in text
    assert "neither ships nor installs it" in text


def test_the_example_says_plainly_that_a_paid_endpoint_is_not_run_yet():
    text = example_text()
    assert "A PAID ENDPOINT IS NOT RUN YET" in text and "is refused whatever the `metered:` block below says" in text
    assert "still read and checked" in text
    assert "written down but not enforced" not in text  # the old promise, of a paid endpoint that ran with caps nobody checked


def test_the_paid_example_is_refused_once_switched_on_and_the_free_one_is_not():
    entries = commented_entries()
    switched_on = {name: {**copy.deepcopy(entry), "enabled": True, "model": "some-model"} for name, entry in entries.items()}
    config = parse_engines({
        "engines": {"claude-code": dict(CLAUDE_ENTRY), **switched_on},
        "chains": {"default": ["claude-code", "my-gateway", "local-free-router"]},
        "metered": WHOLE_OPT_IN,
    })
    assert [engine.id for engine in engines.refused_paid_gateways(config)] == ["my-gateway"]
    assert engines.exclusion_reason(config.engines["local-free-router"], config) is None
    assert engines.exclusion_reason(config.engines["my-gateway"], config).startswith("my-gateway is a paid gateway. ")


def test_the_example_still_names_the_new_kind_in_its_header():
    assert re.search(r"^# kind:.*anthropic-compatible", example_text(), flags=re.MULTILINE)


def test_the_entry_used_by_these_tests_is_itself_valid():
    # Guard of the fixtures: if this fails, every other test of the kind fails for the wrong reason.
    assert parse_secret_ref(ENTRY["credential_secret_ref"]) is not None
    assert config_with().engines["gw"].model == ENTRY["model"]
