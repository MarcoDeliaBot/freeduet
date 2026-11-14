"""The `anthropic-compatible` engine, turn by turn (docs/ENGINES_PLAN.md slice 5).

It is the same locked-down Claude Code CLI pointed at an endpoint the person names, on a key the person holds at that
endpoint. Everything here runs against the fake CLI (`fake_claude.py`) through the real segment loop: no gateway, no
network and no login exist in these tests, and the key is an invented canary (`gateway_support.KEY`). THIS ENGINE HAS
NEVER ANSWERED A REAL TURN FROM A REAL GATEWAY: what these tests prove is what the service does around the CLI (the
environment it is given, what it reads back and keeps, how it classifies a failure), not what a gateway does.

The failure fixtures `gateway_*.jsonl` are what Claude Code 2.1.325 printed when a loopback test double answered each
request with the status in the name (the unreachable one: with nothing listening). Their ids are replaced, the long
init line and the usage blocks are dropped, and the repeated retry lines are cut to one.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

import pytest

from freeduet import agui, claude_cli, segment
from freeduet import compatible_engine as ce
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_adapter import COULD_NOT_RUN, NOT_INSTALLED, TIMED_OUT, ProbeResult
from freeduet.engine_state import EngineState
from freeduet.engines import COMPATIBLE_KIND
from freeduet.members import resolve_member
from freeduet.stream_json import StreamParser
from fake_engines import NOW
from gateway_support import (
    AWKWARD_KEY,
    BASE_URL,
    KEY,
    KEY_ENV,
    MODEL,
    config_with,
    decoys,
    everything_on_disk,
    rig,
)
from helpers import MANAGED_TOKEN, TOOL_TOKEN, run_body, standing, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
FIXTURES = Path(__file__).parent / "fixtures"
SERVICE_SECRETS = ("MANAGED_AGENT_TOKEN", "AGENT_TOOL_TOKEN", "OPENBOT_TOOL_URL", "FREEDUET_LOCAL_KEY")
#: The names the CLI may be started with: the Claude engine's allowlist, less the two that say where a sign-in lives,
#: the fixed settings, the four settings for a gateway, and the endpoint, key and model names of the entry.
ANTHROPIC_NAMES = {
    "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
}
ALLOWED_NAMES = (
    set(ce.PASSED_ENV) | set(claude_cli.FIXED_ENV) | set(ce.GATEWAY_ENV) | ANTHROPIC_NAMES | {"HOME", "CLAUDE_CONFIG_DIR"}
)
SHELL_EXTRAS = {"PWD", "OLDPWD", "SHLVL", "_"}  # what the wrapper's shell may add on its own


def said(events) -> str:
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def play(engine, messages=ASK, **kwargs) -> list[dict]:
    async def go():
        run = agui.parse_run_input(run_body(messages, **kwargs))
        member = resolve_member(run.bot_id, run.messages)
        return [event async for event in segment.run_segment(run, member, engine=engine)]

    return asyncio.run(go())


def probe_of(engine) -> ProbeResult:
    return asyncio.run(engine.probe())


def shape(gw, **plan) -> None:
    (gw.dir / "probe.json").write_text(json.dumps(plan))


def failure_run(fixture: str, exit_code: int = 1) -> list[dict]:
    """The fake CLI prints a recorded failure as it is, then exits as the real CLI did (1)."""
    return [{"replay": fixture}, {"exit": exit_code}]


def error_lines(text: str, status: int, error: str = "unknown") -> dict:
    """An API error as the CLI prints it, with `text` as what it says."""
    message = {"id": "m1", "model": "<synthetic>", "role": "assistant", "type": "message",
               "content": [{"type": "text", "text": text}], "stop_reason": "stop_sequence"}
    return {"events": [
        {"type": "assistant", "message": message, "parent_tool_use_id": None, "error": error,
         "api_error_status": status, "is_api_error_message": True},
        {"type": "result", "subtype": "success", "is_error": True, "api_error_status": status, "result": text,
         "permission_denials": [], "terminal_reason": "api_error"},
    ]}


PROXY_NAMES = ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy")


def no_proxy_at_all(monkeypatch) -> None:
    """The service's own environment may already carry proxy settings (a sandbox does): start from none."""
    for name in PROXY_NAMES:
        monkeypatch.delenv(name, raising=False)


def gone(pid: int, seconds: float = 3.0) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        time.sleep(0.05)
    return False


# ── What the CLI is started with ─────────────────────────────────────────────────────────────────


def test_the_cli_is_given_the_endpoint_the_key_and_the_model_and_nothing_of_the_claude_sign_in(fake_cli, tmp_path, monkeypatch):
    service = decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Hello from the gateway."}])
    events = play(gw.engine)
    assert said(events) == "Hello from the gateway." and types(events)[-1] == "RUN_FINISHED"
    (turn,) = gw.turns()
    env = turn["env"]
    assert env["ANTHROPIC_BASE_URL"] == BASE_URL  # the entry's address, not the one this service was given
    assert env["ANTHROPIC_AUTH_TOKEN"] == KEY  # the key goes as the bearer token
    assert env["ANTHROPIC_API_KEY"] == ""  # blank on purpose: the other credential variable would take precedence
    for name in ("ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL"):
        assert env[name] == MODEL
    assert {name for name in env if name.startswith("ANTHROPIC_")} == ANTHROPIC_NAMES
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in env
    for name, value in service.items():
        assert value not in env.values(), f"the service's {name} reached the CLI"
    for secret in (MANAGED_TOKEN, TOOL_TOKEN):
        assert secret not in env.values()
    for name in SERVICE_SECRETS:
        assert name not in env
    assert set(env) - SHELL_EXTRAS <= ALLOWED_NAMES, sorted(set(env) - SHELL_EXTRAS - ALLOWED_NAMES)


def test_the_cli_finds_no_sign_in_because_its_home_and_config_folders_are_new_and_empty(fake_cli, tmp_path, monkeypatch):
    service = decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    (turn,) = gw.turns()
    home, config = Path(turn["env"]["HOME"]), Path(turn["env"]["CLAUDE_CONFIG_DIR"])
    assert str(home) != service["HOME"] and str(config) != service["CLAUDE_CONFIG_DIR"]
    assert (home.name, config.name) == (ce.HOME_FOLDER, ce.CONFIG_FOLDER)
    assert home.parent == config.parent == Path(turn["cwd"]).parent  # inside the segment's own folder
    assert turn["home_entries"] == [] and turn["config_entries"] == []  # nothing in them when the CLI started
    assert not home.exists() and not config.exists()  # deleted with the segment


def test_the_settings_the_cli_is_given_for_a_gateway(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    env = gw.turns()[0]["env"]
    assert env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] == "1"  # no traffic but the requests to the gateway
    assert env["CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"] == "1"  # no pre-release beta field a gateway may reject
    assert env["CLAUDE_CODE_MAX_RETRIES"] == "2"  # a refused key must not be retried for two minutes
    assert env["CLAUDE_CODE_MCP_ALLOWLIST_ENV"] == "1"  # the bridge does not inherit the key
    assert env["DISABLE_AUTOUPDATER"] == "1" and env["CLAUDE_CODE_DISABLE_AUTO_MEMORY"] == "1"  # as on the Claude engine
    assert "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB" not in env  # it makes the CLI refuse to start without bubblewrap


def test_a_gateway_on_this_machine_is_not_reached_through_the_services_proxy(fake_cli, tmp_path, monkeypatch):
    no_proxy_at_all(monkeypatch)
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("NO_PROXY", "internal.example")
    gw = rig(tmp_path, monkeypatch, {"base_url": "http://host.docker.internal:3002"})
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    env = gw.turns()[0]["env"]
    assert env["HTTPS_PROXY"] == "http://proxy.invalid:3128"
    assert env["NO_PROXY"].split(",") == ["internal.example", "host.docker.internal"]
    assert env["no_proxy"].split(",") == ["host.docker.internal"]  # the lower-case name too: tools read either


def test_a_remote_gateway_keeps_the_proxy_the_service_was_given(fake_cli, tmp_path, monkeypatch):
    no_proxy_at_all(monkeypatch)
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("NO_PROXY", "internal.example")
    gw = rig(tmp_path, monkeypatch, {"base_url": "https://gateway.example.com"})
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    env = gw.turns()[0]["env"]
    assert env["NO_PROXY"] == "internal.example" and "no_proxy" not in env


def test_without_any_proxy_nothing_is_added(fake_cli, tmp_path, monkeypatch):
    no_proxy_at_all(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    env = gw.turns()[0]["env"]
    assert "NO_PROXY" not in env and "no_proxy" not in env


def test_the_service_environment_is_not_changed_by_a_turn(fake_cli, tmp_path, monkeypatch):
    decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    before = dict(os.environ)
    play(gw.engine)
    assert dict(os.environ) == before


def test_the_gateway_never_leaks_into_the_claude_engines_runs(fake_cli, tmp_path, monkeypatch):
    decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "From the gateway."}])
    fake_cli.plan([{"text": "From Claude."}])
    play(gw.engine)
    play(ClaudeEngine())
    names = set(fake_cli.run(0)["env"])
    assert not {name for name in names if name.startswith("ANTHROPIC_")} and "CLAUDE_CODE_OAUTH_TOKEN" not in names
    assert not names & set(ce.GATEWAY_ENV) - set(claude_cli.FIXED_ENV)
    # and Claude's own child still gets the service's CLAUDE_CONFIG_DIR, as before: the sign-in is its own
    assert "CLAUDE_CONFIG_DIR" in names and "HOME" in names


def test_the_key_is_read_again_at_every_turn_so_a_replaced_key_file_is_used_at_once(fake_cli, tmp_path, monkeypatch):
    key_file = tmp_path / "gateway-key"
    key_file.write_text(KEY + "\n")
    gw = rig(tmp_path, monkeypatch, {"credential_secret_ref": f"file:{key_file}"}, key=None)
    gw.plan([{"text": "One."}], [{"text": "Two."}])
    play(gw.engine)
    key_file.write_text("canary-gw-key-replacement-55aa\n")
    play(gw.engine)
    first, second = gw.turns()
    assert first["env"]["ANTHROPIC_AUTH_TOKEN"] == KEY
    assert second["env"]["ANTHROPIC_AUTH_TOKEN"] == "canary-gw-key-replacement-55aa"


def test_child_env_says_what_it_would_start_the_cli_with_and_refuses_to_without_a_key(fake_cli, tmp_path, monkeypatch):
    decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    env = gw.engine.child_env({"PATH": "/bin", KEY_ENV: KEY, "ANTHROPIC_API_KEY": "decoy", "HOME": "/decoy"})
    assert env["PATH"] == "/bin" and env["ANTHROPIC_AUTH_TOKEN"] == KEY and env["ANTHROPIC_BASE_URL"] == BASE_URL
    assert "HOME" not in env and "CLAUDE_CONFIG_DIR" not in env  # the private folders are added when a turn starts
    with pytest.raises(ce.NoKey) as caught:
        gw.engine.child_env({"PATH": "/bin"})
    assert KEY not in str(caught.value) and KEY_ENV not in str(caught.value)


# ── The same lockdown as the Claude engine ───────────────────────────────────────────────────────


def normalised(argv: list[str]) -> list[str]:
    """The argv with the one path that differs between two segments (their own folders) replaced."""
    out = list(argv)
    out[out.index("--mcp-config") + 1] = "<mcp-config>"
    return out


def test_the_cli_is_started_with_exactly_the_arguments_the_claude_engine_uses(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "From the gateway."}])
    fake_cli.plan([{"text": "From Claude."}])
    play(gw.engine)
    play(ClaudeEngine())
    on_gateway, on_claude = gw.run(0), fake_cli.run(0)
    assert normalised(on_gateway["argv"]) == normalised(on_claude["argv"])
    argv = on_gateway["argv"]
    assert argv[: len(claude_cli.LOCKDOWN_ARGS)] == claude_cli.LOCKDOWN_ARGS
    assert argv[argv.index("--tools") + 1] == ""  # no built-in tool of the CLI at all
    for flag in ("--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"):
        assert flag in argv
    assert argv[argv.index("--permission-mode") + 1] == "dontAsk"
    assert argv[argv.index("--allowedTools") + 1] == "mcp__freeduet"
    assert on_gateway["prompt"] == on_claude["prompt"]  # the same transcript, rendered by the same code


def test_the_only_tool_source_is_the_freeduet_bridge(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    servers = gw.run(0)["mcp_config"]["mcpServers"]
    assert list(servers) == ["freeduet"]
    assert servers["freeduet"]["command"] == sys.executable and servers["freeduet"]["args"] == ["-m", "freeduet.bridge"]
    assert set(servers["freeduet"]["env"]) == {"FREEDUET_BRIDGE_PORT", "FREEDUET_BRIDGE_SECRET", "PYTHONPATH"}
    assert KEY not in json.dumps(servers)


def test_a_tool_the_member_calls_goes_through_the_same_bridge_and_gate(fake_cli, tmp_path, monkeypatch):
    from helpers import tool

    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"tool": {"name": "write_page", "input": {"title": "Plan"}}}])
    events = play(gw.engine, tools=[tool("write_page", {"title": {"type": "string"}})])
    # The write is announced and NOT run here: the segment ends and OpenBot's approval gate decides, as on Claude.
    assert "TOOL_CALL_START" in types(events) and "TOOL_CALL_RESULT" not in types(events)
    assert types(events)[-1] == "RUN_FINISHED"
    assert gw.run(0)["calls"][0]["name"] == "write_page"


def test_the_cli_process_is_gone_when_the_turn_is_over(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    assert gone(gw.run(0)["pid"])


# ── Where the key goes, and where it never does ──────────────────────────────────────────────────


def test_the_key_is_nowhere_but_the_childs_environment(fake_cli, tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    assert KEY not in json.dumps(events)
    assert KEY not in caplog.text
    assert KEY not in json.dumps(state.snapshot().as_json())
    # Argv, prompt, MCP config and tool list as the fake CLI saw them, the data folder, the probe records...
    assert KEY not in everything_on_disk(tmp_path, skip=gw.dumps())
    assert KEY in json.dumps(gw.turns()[0]["env"])  # and it was in the one place it must be


def test_a_key_file_holds_the_key_and_is_read_without_its_newline(fake_cli, tmp_path, monkeypatch):
    key_file = tmp_path / "gateway-key"
    key_file.write_text(f"{KEY}\n")
    gw = rig(tmp_path, monkeypatch, {"credential_secret_ref": f"file:{key_file}"}, key=None)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    assert gw.turns()[0]["env"]["ANTHROPIC_AUTH_TOKEN"] == KEY


@pytest.mark.parametrize("reference_of, how", [
    (lambda tmp: "env:FREEDUET_TEST_NO_SUCH_VARIABLE", "an unset variable"),
    (lambda tmp: f"file:{tmp}/no-such-file", "a missing file"),
    (lambda tmp: f"file:{tmp}", "a folder"),
])
def test_no_key_means_no_turn_and_a_plain_message(fake_cli, tmp_path, monkeypatch, caplog, reference_of, how):
    caplog.set_level(logging.DEBUG)
    reference = reference_of(tmp_path)
    gw = rig(tmp_path, monkeypatch, {"credential_secret_ref": reference}, key=None)
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    assert events[-1]["type"] == "RUN_ERROR"
    assert events[-1]["message"] == (
        "gw has no key it can use. Set the key that `credential_secret_ref` names in engines.yaml, "
        "then send your message again."
    ), how
    assert gw.runs() == 0 and gw.starts() == []  # the CLI was never started: it would have had nothing but a sign-in to use
    assert state.row("gw").state == "signed_out"  # recorded as what it is: a key the gateway cannot be given
    assert reference not in events[-1]["message"] and reference not in caplog.text
    assert "no turn was started" in caplog.text


@pytest.mark.parametrize("key", [
    "sk-ant-oat01-" + "a" * 40,   # the token `claude setup-token` prints: a Claude plan credential, never a gateway key
    "has a space in it 12345",
    "short",
    "x" * 513,
    "café-key-non-ascii-1234",
])
def test_a_value_that_is_not_a_gateway_key_is_not_sent_anywhere(fake_cli, tmp_path, monkeypatch, caplog, key):
    caplog.set_level(logging.DEBUG)
    gw = rig(tmp_path, monkeypatch, key=key)
    events = play(gw.engine)
    assert events[-1]["type"] == "RUN_ERROR" and "has no key it can use" in events[-1]["message"]
    assert gw.starts() == [] and gw.runs() == 0
    assert key not in json.dumps(events) and key not in caplog.text


def test_a_key_that_is_too_long_or_a_file_that_is_too_big_is_refused(tmp_path):
    big = tmp_path / "big"
    big.write_bytes(b"k" * (ce.KEY_FILE_MAX_BYTES + 1))
    assert ce.read_key(f"file:{big}", {}) is None
    exact = tmp_path / "exact"
    exact.write_bytes(b"k" * 512)
    assert ce.read_key(f"file:{exact}", {}) == "k" * 512


def test_read_key_never_raises_and_never_says_what_it_read(tmp_path):
    odd = tmp_path / "odd"
    odd.write_bytes(b"\xff\xfe\x00key")
    for reference in (None, "", "nonsense", "env:", f"file:{odd}", f"file:{tmp_path}", "file:/proc/self/mem/x", 7, ["env:X"]):
        assert ce.read_key(reference, {"X": KEY}) is None
    assert ce.read_key("env:X", {"X": f"  {KEY}\n"}) == KEY
    assert ce.read_key("env:X", {"X": "sk-ant-api03-" + "b" * 30}) == "sk-ant-api03-" + "b" * 30  # an API key is not a plan token


# ── Scrubbing ────────────────────────────────────────────────────────────────────────────────────


def test_the_scrubber_replaces_the_key_as_text_as_bytes_and_as_it_looks_inside_a_json_string():
    scrub = ce.Scrubber(AWKWARD_KEY)
    assert scrub.text(f"a {AWKWARD_KEY} b {AWKWARD_KEY}") == "a [key] b [key]"
    line = json.dumps({"message": f"bad header: Bearer {AWKWARD_KEY}"}).encode()
    assert AWKWARD_KEY.encode() not in line  # inside JSON its quote and backslash are escaped, so a plain search misses it
    cleaned = scrub.data(line)
    assert b"canary" not in cleaned and json.loads(cleaned) == {"message": "bad header: Bearer [key]"}
    assert ce.Scrubber(KEY).text("nothing to hide") == "nothing to hide"


@pytest.mark.parametrize("key", [KEY, AWKWARD_KEY])
def test_a_key_a_gateway_echoes_in_an_error_never_reaches_the_person_the_log_or_the_state(fake_cli, tmp_path, monkeypatch, caplog, key):
    caplog.set_level(logging.DEBUG)
    gw = rig(tmp_path, monkeypatch, key=key)
    gw.plan([error_lines(f"API Error: 400 invalid header Authorization: Bearer {key}", 400)])
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    message = events[-1]["message"]
    assert events[-1]["type"] == "RUN_ERROR"
    assert message == "gw could not finish this turn: API Error: 400 invalid header Authorization: Bearer [key]"
    # The plan the fake CLI was told to play carries the key on purpose (it is the gateway's echo): everything else must not.
    on_disk = everything_on_disk(tmp_path, skip=[*gw.dumps(), gw.dir / "plans.json"])
    for where in (json.dumps(events), caplog.text, json.dumps(state.snapshot().as_json()), on_disk):
        assert key not in where and json.dumps(key)[1:-1] not in where


def test_a_key_the_cli_prints_on_its_error_stream_is_scrubbed_from_the_log_and_not_shown(fake_cli, tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="freeduet.compatible_engine")
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"stderr": f"fatal: the gateway refused {KEY}"}, {"exit": 1}])
    events = play(gw.engine)
    assert events[-1] == {"type": "RUN_ERROR", "message": "gw ended without an answer (exit code 1)."}
    assert "the gateway refused [key]" in caplog.text
    assert KEY not in caplog.text and KEY not in json.dumps(events)


# ── How a failure is read ────────────────────────────────────────────────────────────────────────

#                     fixture,               breaker state, last failure, said to the person, flagged as an engine limit
FAILURES = [
    ("gateway_401", "signed_out", "auth", "gw did not accept its key. Check the key that `credential_secret_ref` names in engines.yaml, then send your message again.", False),
    ("gateway_402", "open", "credits", "gw is out of credits", True),
    ("gateway_429", "open", "rate_limit", "gw", True),
    ("gateway_502", "degraded", "transient", "gw could not finish this turn: API Error: 502 Your chosen model is down", False),
    ("gateway_503", "degraded", "transient", "gw could not finish this turn: API Error: 503 There is no available model provider", False),
    ("gateway_unreachable", "degraded", "transient", "gw could not finish this turn: API Error: Connection refused", False),
    ("gateway_400", "ready", None, "gw could not finish this turn: API Error: 400 thinking is not supported by this model", False),
    ("gateway_404", "ready", None, "gw could not finish this turn: There's an issue with the selected model", False),
    ("gateway_403", "ready", None, "gw could not finish this turn: Failed to authenticate. API Error: 403 Forbidden", False),
]


@pytest.mark.parametrize("fixture, state_after, kind, said_text, limited", FAILURES, ids=[row[0] for row in FAILURES])
def test_what_the_cli_printed_for_each_kind_of_gateway_failure(fake_cli, tmp_path, monkeypatch, fixture, state_after, kind, said_text, limited):
    gw = rig(tmp_path, monkeypatch)
    gw.plan(failure_run(f"{fixture}.jsonl"))
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    assert types(events)[-1] == "RUN_ERROR"
    error = events[-1]
    assert error["message"].startswith(said_text), error["message"]
    assert (error.get("code") == claude_cli.ENGINE_LIMITED) is limited
    assert "OPENBOT_MODEL_AUTH_REQUIRED" not in json.dumps(error)  # a refused key is not a Claude sign-in
    row = state.row("gw")
    assert (row.state, row.last_failure_kind) == (state_after, kind)


def test_a_403_is_not_taken_for_a_refused_key_but_the_claude_engines_reading_would_have_been(fake_cli):
    parser = StreamParser()
    for line in (FIXTURES / "gateway_403.jsonl").read_bytes().splitlines():
        parser.feed(line + b"\n")
    assert parser.api_error_status == 403
    assert claude_cli.turn_failure(parser, "", 1).kind == "auth"  # the CLI calls every 403 `authentication_failed`
    assert ce.turn_verdict(parser, "", 1).kind == "unknown"  # a gateway's 403 is about one request, not about the key


@pytest.mark.parametrize("fixture, kind", [
    ("gateway_401", "auth"), ("gateway_402", "credits"), ("gateway_429", "rate_limit"), ("gateway_502", "transient"),
    ("gateway_503", "transient"), ("gateway_400", "rejected"), ("gateway_404", "rejected"), ("gateway_unreachable", "transient"),
])
def test_the_status_the_cli_reports_decides_when_its_words_do_not(fixture, kind):
    parser = StreamParser()
    for line in (FIXTURES / f"{fixture}.jsonl").read_bytes().splitlines():
        parser.feed(line + b"\n")
    assert ce.turn_verdict(parser, "", 1).kind == kind


def test_the_parser_keeps_the_http_status_the_cli_reports_and_only_an_integer():
    def status_of(value):
        parser = StreamParser()
        event = {"type": "assistant", "message": {"content": [{"type": "text", "text": "x"}]}, "error": "unknown", "api_error_status": value}
        parser.feed(json.dumps(event).encode() + b"\n")
        return parser.api_error_status

    assert status_of(502) == 502
    for odd in (None, "502", 502.5, True, [502], {"status": 502}):
        assert status_of(odd) is None
    assert StreamParser().api_error_status is None


def test_a_gateway_that_answers_with_a_limit_in_words_is_still_a_limit(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan(failure_run("usage_limit.jsonl"))  # the CLI's own limit message, with the reset it states
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    assert events[-1]["code"] == claude_cli.ENGINE_LIMITED and "00:00 UTC" in events[-1]["message"]
    assert state.row("gw").state == "open"


def test_a_stream_that_ends_with_no_result_is_classified_by_what_the_cli_said_and_how_it_exited(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"stderr": "connect ECONNREFUSED 127.0.0.1:18080"}, {"exit": 1}])
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    assert events[-1] == {"type": "RUN_ERROR", "message": "gw ended without an answer (exit code 1)."}
    assert (state.row("gw").state, state.row("gw").last_failure_kind) == ("degraded", "transient")


def test_a_turn_that_answers_is_a_success_for_the_breaker(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "Done."}])
    state = EngineState(None, now=NOW)
    play(state.recorded(gw.engine))
    row = state.row("gw")
    assert (row.state, row.last_failure_kind) == ("ready", None)


# ── The probe: cheap, bounded, never a turn ──────────────────────────────────────────────────────


def test_the_probe_says_installed_and_the_version_and_that_a_key_is_configured_and_nothing_more(fake_cli, tmp_path, monkeypatch):
    decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    result = probe_of(gw.engine)
    assert result == ProbeResult(installed=True, version="2.1.311", signed_in=True, problem=None)
    assert KEY not in repr(result)


def test_the_probe_runs_only_the_version_command_with_no_prompt_no_key_and_no_endpoint(fake_cli, tmp_path, monkeypatch):
    service = decoys(monkeypatch)
    gw = rig(tmp_path, monkeypatch)
    probe_of(gw.engine)
    (start,) = gw.starts()
    assert start["argv"] == ["--version"]
    assert [record["command"] for record in gw.probes()] == ["version"] and gw.probes()[0]["stdin"] == ""
    assert gw.runs() == 0  # no plan was played: nothing a model could answer
    env = start["env"]
    assert not {name for name in env if name.startswith("ANTHROPIC_")}  # no endpoint, no key, no model
    assert KEY not in json.dumps(env)
    for value in service.values():
        assert value not in env.values()
    assert start["home_entries"] == [] and start["config_entries"] == []
    assert not Path(env["HOME"]).exists()  # its folders are deleted with the probe


def test_the_probe_never_asks_the_cli_who_is_signed_in(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    probe_of(gw.engine)
    assert all(start["argv"] != ["auth", "status"] for start in gw.starts())  # that would read a Claude sign-in


def test_without_a_key_the_probe_says_so_and_still_does_not_start_a_turn(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, key=None)
    assert probe_of(gw.engine) == ProbeResult(installed=True, version="2.1.311", signed_in=False, problem=None)
    assert gw.runs() == 0


def test_the_probe_says_not_installed_when_there_is_no_cli(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    missing = ce.CompatibleEngine(gw.config.engines["gw"], gw.config, binary=str(tmp_path / "no-such-claude"))
    assert probe_of(missing) == ProbeResult(installed=False, problem=NOT_INSTALLED)


def test_a_probe_that_does_not_finish_in_time_says_so_and_stops_the_process(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    shape(gw, version={"sleep": 30})
    monkeypatch.setattr(claude_cli, "PROBE_TIMEOUT_SECONDS", 0.5)
    started = time.time()
    assert probe_of(gw.engine) == ProbeResult(problem=TIMED_OUT)
    assert time.time() - started < 5
    assert gone(gw.probes()[0]["pid"])


def test_a_probe_never_raises(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)

    def boom(*args, **kwargs):
        raise RuntimeError("anything at all")

    monkeypatch.setattr(ce, "read_key", boom)
    assert probe_of(gw.engine) == ProbeResult(problem=COULD_NOT_RUN)


# ── Off, free and metered ────────────────────────────────────────────────────────────────────────


def test_an_entry_that_is_switched_off_runs_nothing(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, {"enabled": False})
    events = play(gw.engine)
    assert events[-1] == {"type": "RUN_ERROR", "message": "gw is not used: disabled in engines.yaml."}
    assert gw.starts() == []


def test_an_entry_that_is_locked_runs_nothing(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, {"locked_reason": "The provider's terms do not allow it."})
    events = play(gw.engine)
    assert events[-1]["message"] == "gw is not used: locked: The provider's terms do not allow it.."
    assert gw.starts() == []


def test_a_refusal_is_the_persons_switch_and_is_not_recorded_against_the_engines_health(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, {"enabled": False})
    state = EngineState(None, now=NOW)
    play(state.recorded(gw.engine))
    row = state.row("gw")
    assert (row.state, row.last_failure_kind) == ("ready", None)


@pytest.mark.parametrize("top, reason", [
    ({}, "metered engines are off (`metered.enabled: false`)"),
    ({"metered": {"enabled": False, "daily_cap": 5, "monthly_cap": 50}}, "metered engines are off (`metered.enabled: false`)"),
    ({"metered": {"enabled": True}}, "a metered cap is 0, and 0 means never"),
    ({"metered": {"enabled": True, "daily_cap": 5, "monthly_cap": 0}}, "a metered cap is 0, and 0 means never"),
])
def test_a_paid_endpoint_does_not_run_unless_the_person_switched_paid_engines_on_with_caps_and_says_why(fake_cli, tmp_path, monkeypatch, top, reason):
    gw = rig(tmp_path, monkeypatch, {"billing": "metered"}, **top)
    events = play(gw.engine)
    assert events[-1] == {
        "type": "RUN_ERROR",
        "message": f"gw is a paid (metered) gateway, and paid engines are off in engines.yaml ({reason}), so I did not use it.",
    }
    assert gw.starts() == [] and gw.runs() == 0  # nothing was started, so nothing was billed


def test_a_paid_endpoint_runs_once_the_person_has_opted_in_and_every_turn_says_in_the_log_that_it_is_billed(fake_cli, tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.WARNING, logger="freeduet.compatible_engine")
    gw = rig(tmp_path, monkeypatch, {"billing": "metered"}, metered={"enabled": True, "daily_cap": 5, "monthly_cap": 50})
    gw.plan([{"text": "Done."}])
    events = play(gw.engine)
    assert said(events) == "Done." and gw.runs() == 1
    assert "engine gw is metered: this turn is billed by its provider, and the caps in engines.yaml are not enforced yet" in caplog.text


# ── What the file builds ─────────────────────────────────────────────────────────────────────────


def test_an_entry_that_may_run_gets_an_engine_with_its_own_name_and_a_kind_the_router_can_read(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    built = ce.adapters_from_config(gw.config)
    assert list(built) == ["gw"]
    engine = built["gw"]
    assert (engine.key, engine.label, engine.kind) == ("gw", "gw", COMPATIBLE_KIND)
    assert engine.capabilities == frozenset({"tools", "approvals", "mcp"})


def test_a_default_install_builds_nothing(fake_cli, tmp_path, monkeypatch):
    from freeduet import engines

    example = engines.load_engines(engines.EXAMPLE_ENGINES_FILE)
    assert ce.adapters_from_config(example) == {}


@pytest.mark.parametrize("entry, top", [
    ({"enabled": False}, {}),
    ({"locked_reason": "Not allowed."}, {}),
    ({"billing": "metered"}, {}),
    ({"billing": "metered"}, {"metered": {"enabled": True}}),
])
def test_an_entry_that_may_not_run_is_given_no_engine_and_an_enabled_one_is_named_once_in_the_log(fake_cli, tmp_path, monkeypatch, caplog, entry, top):
    caplog.set_level(logging.WARNING, logger="freeduet.compatible_engine")
    config = config_with(entry, **top)
    assert ce.adapters_from_config(config) == {}
    refused = [record for record in caplog.records if "is in engines.yaml but is not used" in record.getMessage()]
    assert len(refused) == (0 if entry.get("enabled") is False or "locked_reason" in entry else 1)


def test_an_opted_in_paid_endpoint_is_built_and_the_log_says_it_is_billed(fake_cli, tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.WARNING, logger="freeduet.compatible_engine")
    config = config_with({"billing": "metered"}, metered={"enabled": True, "daily_cap": 5, "monthly_cap": 50})
    assert list(ce.adapters_from_config(config)) == ["gw"]
    assert "its provider bills every turn it takes, and the caps in engines.yaml are not enforced yet" in caplog.text
