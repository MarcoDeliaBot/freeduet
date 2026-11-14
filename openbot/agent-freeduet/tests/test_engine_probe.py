"""The probe of the engine seam (docs/ENGINES_PLAN.md slice 2, ARCHITECTURE 3.1): is the engine installed, which
version, is it signed in. For Claude Code it is `claude --version` and `claude auth status`.

Everything runs against the fake CLI (fake_claude.py), which answers the two commands without playing a plan,
counting a run or touching a login. Fixtures: `auth_status_signed_out.json` is what the CLI the image pins
(2.1.311) printed for `claude auth status` when it held no sign-in: recorded with an empty scratch folder as its
HOME and its config directory, so no real login was in reach, and the two folders it printed replaced by
`/scrubbed`. `auth_status_signed_in.json` is SYNTHETIC: the same shape with `loggedIn` true and an invented
account (example.invalid), because a signed-in answer cannot be recorded without opening a real login. It
carries an account on purpose, so the tests can prove the probe never carries one.
"""

import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path

import pytest

from freeduet import claude_cli
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_adapter import (
    COULD_NOT_RUN,
    NOT_INSTALLED,
    TIMED_OUT,
    UNREADABLE,
    EngineAdapter,
    ProbeResult,
)
from golden_support import HOSTILE, Launches, pin_environment
from helpers import post_run, run_body, standing

ACCOUNT = ("person@example.invalid", "Example Organisation")
ASK = [standing(), {"id": "u1", "role": "user", "content": "Hello"}]
SECRETS_OF_THIS_SERVICE = ("MANAGED_AGENT_TOKEN", "AGENT_TOOL_TOKEN", "OPENBOT_TOOL_URL", "FREEDUET_LOCAL_KEY")


def probe(timeout=claude_cli.PROBE_TIMEOUT_SECONDS):
    return asyncio.run(claude_cli.probe(timeout))


def shape(fake_cli, **plan):
    (fake_cli.dir / "probe.json").write_text(json.dumps(plan))


def records(fake_cli):
    files = sorted(fake_cli.dir.glob("probe-*.json"), key=lambda path: int(path.stem.split("-")[1]))
    return [json.loads(path.read_text()) for path in files]


def gone(pid, seconds=3.0):
    end = time.time() + seconds
    while time.time() < end:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        time.sleep(0.05)
    return False


# ── What it finds ───────────────────────────────────────────────────────────────────────────────


def test_a_signed_in_cli_is_installed_signed_in_and_has_a_version(fake_cli):
    assert probe() == ProbeResult(installed=True, version="2.1.311", signed_in=True, problem=None)


def test_a_signed_out_cli_says_so_from_the_recorded_answer(fake_cli):
    shape(fake_cli, auth={"fixture": "auth_status_signed_out.json"})  # the fake exits 1, as the real CLI does
    assert probe() == ProbeResult(installed=True, version="2.1.311", signed_in=False, problem=None)


def test_the_answer_is_read_from_loggedIn_not_from_the_exit_code(fake_cli):
    shape(fake_cli, auth={"fixture": "auth_status_signed_in.json", "exit": 1})
    assert probe().signed_in is True
    shape(fake_cli, auth={"fixture": "auth_status_signed_out.json", "exit": 0})
    assert probe().signed_in is False


def test_a_cli_that_is_not_there_is_not_installed(fake_cli, monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    assert probe() == ProbeResult(installed=False, problem=NOT_INSTALLED)


@pytest.mark.parametrize(
    "printed",
    ["not json at all", "", "[]", "null", '{"loggedIn": "yes"}', '{"loggedIn": 1}', '{"loggedIn": null}', '{"other": true}', "[" * 100_000],
    ids=["words", "nothing", "list", "null", "string", "number", "null-value", "no-key", "nested-too-deep"],
)
def test_an_answer_that_is_not_a_yes_or_no_says_nothing_about_the_sign_in(fake_cli, printed):
    shape(fake_cli, auth={"text": printed})
    result = probe()
    assert result == ProbeResult(installed=True, version="2.1.311", signed_in=None, problem=UNREADABLE)


def test_an_answer_past_the_limit_is_not_read_and_its_process_is_stopped(fake_cli):
    shape(fake_cli, auth={"bytes": claude_cli.PROBE_MAX_BYTES * 20})
    result = probe()
    assert result.signed_in is None and result.problem == UNREADABLE
    assert gone(records(fake_cli)[-1]["pid"])


@pytest.mark.parametrize("printed, version", [("2.1.311 (Claude Code)", "2.1.311"), ("2.1.311", "2.1.311"), ("10.20.30.40", "10.20.30.40"),
                                              ("banana", None), ("", None), ("v2.1.311", None), ("2.1.311.5.6", None)])
def test_a_version_is_read_only_when_it_looks_like_one(fake_cli, printed, version):
    shape(fake_cli, version={"text": printed})
    assert probe().version == version


# ── The deadline ────────────────────────────────────────────────────────────────────────────────


# The deadlines below leave room for a slow machine to start the fake CLI (a Python start) before they run out; the
# fake sleeps far past them, so what is asserted is that the probe stopped it at the deadline and not before.


def test_a_cli_that_hangs_is_stopped_at_the_deadline_and_says_it_could_not_tell(fake_cli):
    shape(fake_cli, version={"sleep": 60})
    started = time.monotonic()
    result = probe(timeout=2.5)
    assert 2.0 < time.monotonic() - started < 15
    assert result == ProbeResult(problem=TIMED_OUT)
    assert gone(records(fake_cli)[-1]["pid"])


def test_one_deadline_covers_both_commands_and_the_version_already_found_is_kept(fake_cli):
    shape(fake_cli, auth={"sleep": 60})
    started = time.monotonic()
    result = probe(timeout=3.0)
    assert 2.0 < time.monotonic() - started < 15  # not 3 s for each command: one deadline for both
    assert result == ProbeResult(installed=True, version="2.1.311", problem=TIMED_OUT)
    assert gone(records(fake_cli)[-1]["pid"])


def test_a_deadline_already_passed_starts_nothing_that_lasts(fake_cli):
    assert probe(timeout=0).problem == TIMED_OUT
    assert all(gone(record["pid"]) for record in records(fake_cli))


def test_the_default_deadline_is_a_few_seconds():
    assert 1 <= claude_cli.PROBE_TIMEOUT_SECONDS <= 10


def test_a_probe_that_cannot_run_at_all_never_raises(fake_cli, monkeypatch):
    async def broken(command, cwd, env=None):
        raise RuntimeError("the loop is on fire")

    monkeypatch.setattr(claude_cli, "start", broken)
    assert probe() == ProbeResult(problem=COULD_NOT_RUN)


def test_a_probe_cancelled_on_the_way_leaves_no_process_behind(fake_cli):
    shape(fake_cli, version={"sleep": 60})

    async def cancelled():
        task = asyncio.create_task(claude_cli.probe())
        for _ in range(200):  # until the fake has started and said so
            if records(fake_cli):
                break
            await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancelled())
    assert gone(records(fake_cli)[-1]["pid"])


def test_probes_side_by_side_do_not_share_anything(fake_cli):
    async def both():
        return await asyncio.gather(claude_cli.probe(), claude_cli.probe(), claude_cli.probe())

    results = asyncio.run(both())
    assert results == [ProbeResult(True, "2.1.311", True, None)] * 3
    cwds = {record["cwd"] for record in records(fake_cli)}
    assert len(records(fake_cli)) == 6 and len(cwds) == 3


# ── It costs the subscription nothing ───────────────────────────────────────────────────────────


def test_a_probe_is_two_commands_with_no_prompt_and_no_model_call(fake_cli):
    probe()
    first, second = records(fake_cli)
    assert (first["command"], second["command"]) == ("version", "auth")
    assert first["argv"] == ["--version"] and second["argv"] == ["auth", "status"]
    # Nothing was sent on stdin: it was closed at once.
    assert first["stdin"] == "" and second["stdin"] == ""
    # And it is no run: the fake's run counter was never touched, so no plan was played.
    assert not (fake_cli.dir / "count").exists() and not list(fake_cli.dir.glob("run-*.json"))


def test_no_argument_of_a_probe_opens_a_session_a_tool_or_the_host(fake_cli):
    probe()
    flags = {
        "-p", "--print", "--model", "--resume", "--continue", "--mcp-config", "--tools", "--allowedTools",
        "--dangerously-skip-permissions", "--permission-mode", "--add-dir", "--append-system-prompt",
    }
    for record in records(fake_cli):
        assert not flags & set(record["argv"]), record["argv"]
    assert claude_cli.VERSION_ARGS == ["--version"] and claude_cli.AUTH_STATUS_ARGS == ["auth", "status"]


def test_the_claude_engine_probes_through_the_same_function(fake_cli):
    assert asyncio.run(ClaudeEngine().probe()) == ProbeResult(True, "2.1.311", True, None)
    assert "probe" in EngineAdapter.__abstractmethods__


# ── The launch: as locked down as a turn's ──────────────────────────────────────────────────────


@pytest.fixture
def launches(monkeypatch, fake_cli):
    pin_environment(monkeypatch)  # the service's environment now holds every hostile name below
    seen = Launches()
    seen.install(monkeypatch)
    return seen


def test_the_probe_is_started_like_a_turn_with_the_same_environment_and_nothing_else(launches, client):
    post_run(client, run_body(ASK))
    turn = launches.calls[-1]
    del launches.calls[:]
    result = asyncio.run(claude_cli.probe())
    assert result.signed_in is True
    assert [call["args"][1:] for call in launches.calls] == [["--version"], ["auth", "status"]]
    for call in launches.calls:
        env, kwargs = call["kwargs"]["env"], call["kwargs"]
        # The very environment of a turn: the allowlist, the pinned values, nothing of the service's own.
        assert env == turn["kwargs"]["env"] == claude_cli.child_env()
        assert not set(env) & (set(HOSTILE) | set(SECRETS_OF_THIS_SERVICE))
        assert not [name for name in env if name.startswith("ANTHROPIC_") or name == "CLAUDE_CODE_OAUTH_TOKEN"]
        assert env["CLAUDE_CONFIG_DIR"] == "/golden/cli-config-never-opened"  # passed by name, never opened
        # The same launch: its three pipes, its own process group, and the same binary.
        assert {key: value for key, value in kwargs.items() if key not in ("cwd", "env")} == {
            key: value for key, value in turn["kwargs"].items() if key not in ("cwd", "env")
        }
        assert kwargs["start_new_session"] is True
        assert call["args"][0] == turn["args"][0] == claude_cli.claude_bin()


def test_the_probe_runs_in_a_folder_of_its_own_which_is_empty_and_then_gone(launches, fake_cli, monkeypatch, tmp_path):
    scratch = tmp_path / "tmp"
    scratch.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(scratch))
    service_folder = Path.cwd()
    asyncio.run(claude_cli.probe())
    cwds = {Path(str(call["kwargs"]["cwd"])) for call in launches.calls}
    assert len(cwds) == 1
    folder = cwds.pop()
    assert folder.name == "work" and folder.parent.name.startswith("freeduet-probe-") and folder.parent.parent == scratch
    assert folder != service_folder and service_folder not in folder.parents
    assert [record["cwd_entries"] for record in records(fake_cli)] == [[], []]  # empty: no project file for the CLI to find
    assert list(scratch.iterdir()) == []  # and nothing is left behind


def test_the_probe_reports_a_missing_binary_without_a_second_launch(launches, monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    launches.refuse = True
    assert asyncio.run(claude_cli.probe()) == ProbeResult(installed=False, problem=NOT_INSTALLED)
    assert len(launches.calls) == 1


# ── Never an account ────────────────────────────────────────────────────────────────────────────


def test_the_probe_never_carries_the_account_the_cli_printed(fake_cli, caplog):
    caplog.set_level(logging.DEBUG)  # every logger: whatever anything logged, the account is not in it
    shape(fake_cli, auth={"fixture": "auth_status_signed_in.json", "stderr": "person@example.invalid is signed in"})
    result = probe()
    assert result.signed_in is True
    for text in (repr(result), json.dumps(result.__dict__, default=str), caplog.text):
        assert not any(name in text for name in ACCOUNT), text


def test_the_signed_in_fixture_does_carry_an_account_so_the_test_above_means_something():
    text = (Path(__file__).parent / "fixtures" / "auth_status_signed_in.json").read_text()
    assert all(name in text for name in ACCOUNT)
    recorded = json.loads((Path(__file__).parent / "fixtures" / "auth_status_signed_out.json").read_text())
    assert recorded["loggedIn"] is False and "email" not in recorded


def test_a_probe_logs_nothing_at_all(fake_cli, caplog):
    caplog.set_level(logging.DEBUG)
    shape(fake_cli, auth={"fixture": "auth_status_signed_out.json"})
    probe()
    probe(timeout=0)
    assert [record for record in caplog.records if record.name.startswith("freeduet")] == []
