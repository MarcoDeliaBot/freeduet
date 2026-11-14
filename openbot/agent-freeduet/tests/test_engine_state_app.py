"""The engine state through the real service: the app, the segment loop and the fake CLI (ENGINES_PLAN slice 2).

A turn is posted to `POST /`; what it was is read back from `GET /engines` and from the state file. The limit
and the sign-in are the recorded `usage_limit.jsonl` and `not_signed_in.jsonl`. The fake clock is the
breaker's own (the state is replaced after start-up, through `app.state`, as a test of the app may do), so a
stated reset is exact.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from freeduet import app as app_module
from freeduet import engine_state
from freeduet.app import app
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_breaker import CORRUPT, MISSING, FileStore
from freeduet.engine_state import EngineState
from golden_support import Launches
from helpers import MANAGED_TOKEN, TOOL_TOKEN, post_run, run_body, standing, tool, types

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
FIELDS = {
    "id", "label", "kind", "state", "available", "limited_until", "last_failure_kind", "consecutive_failures",
    "installed", "version", "signed_in", "probed_at", "probe_problem",
}
RESET = datetime(2100, 1, 1, tzinfo=UTC)  # the `resetsAt` of usage_limit.jsonl
CANARY = "sk-ant-api03-CANARY-person@example.invalid"


class Clock:
    def __init__(self, at):
        self.at = at

    def __call__(self):
        return self.at


@pytest.fixture
def clock(client):
    """The breaker's clock, five hours before the recorded limit says it resets, and a state that uses it."""
    fake = Clock(datetime(2099, 12, 31, 19, 0, tzinfo=UTC))
    state = EngineState(FileStore(engine_state.state_file()), now=fake)
    state.register(ClaudeEngine())
    app.state.engine_state = state
    return fake


def engines(client):
    response = client.get("/engines", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def claude(client) -> dict:
    (only,) = engines(client)["engines"]
    return only


def kept(fake_cli) -> dict:
    return json.loads((fake_cli.data_dir / "engine-state.json").read_text())


# ── A turn is recorded by how it ended ──────────────────────────────────────────────────────────


def test_before_any_turn_the_one_engine_is_ready_and_the_file_is_not_there_yet(client, fake_cli):
    body = engines(client)
    assert set(body) == {"engines", "problems"} and body["problems"] == [MISSING]
    shown = claude(client)
    assert set(shown) == FIELDS
    assert (shown["id"], shown["label"], shown["kind"], shown["state"], shown["available"]) == ("claude-code", "Claude Code", "cli", "ready", True)
    assert (shown["installed"], shown["signed_in"], shown["version"], shown["probed_at"]) == (None, None, None, None)
    assert not (fake_cli.data_dir / "engine-state.json").exists()


def test_a_successful_turn_leaves_it_ready_and_writes_nothing(client, fake_cli):
    fake_cli.plan([{"text": "Hello there."}])
    post_run(client, run_body(ASK))
    assert claude(client)["state"] == "ready"
    assert not (fake_cli.data_dir / "engine-state.json").exists()


def test_a_turn_that_ends_on_a_tool_call_openbot_runs_is_a_success(client, fake_cli):
    fake_cli.plan([{"text": "Writing it.", "tool": {"name": "make_page", "input": {"title": "Plan"}}}, {"text": "never reached"}])
    events, _ = post_run(client, run_body(ASK, tools=[tool("make_page")]))
    assert "TOOL_CALL_START" in types(events)
    assert claude(client)["state"] == "ready"


def test_the_recorded_usage_limit_opens_the_engine_until_the_time_the_cli_stated(client, fake_cli, clock):
    fake_cli.plan([{"replay": "usage_limit.jsonl"}])
    events, _ = post_run(client, run_body(ASK))
    assert types(events)[-1] == "RUN_ERROR"
    shown = claude(client)
    assert (shown["state"], shown["available"], shown["last_failure_kind"], shown["consecutive_failures"]) == ("open", False, "usage_limit", 1)
    assert shown["limited_until"] == RESET.isoformat()
    assert kept(fake_cli)["engines"]["claude-code"] == {
        "state": "open", "limited_until": RESET.isoformat(), "consecutive_failures": 1, "opens": 1, "last_failure_kind": "usage_limit",
    }


def test_a_limit_that_comes_after_the_first_words_is_still_a_limit(client, fake_cli, clock):
    fake_cli.plan([{"text": "I started to write it and"}, {"replay": "usage_limit.jsonl"}])
    post_run(client, run_body(ASK))
    assert (claude(client)["state"], claude(client)["limited_until"]) == ("open", RESET.isoformat())


def test_the_recorded_sign_in_failure_signs_the_engine_out_and_an_answer_signs_it_in_again(client, fake_cli, clock):
    fake_cli.plan([{"replay": "not_signed_in.jsonl"}], [{"text": "Hello again."}])
    post_run(client, run_body(ASK))
    shown = claude(client)
    assert (shown["state"], shown["available"], shown["last_failure_kind"], shown["limited_until"]) == ("signed_out", False, "auth", None)
    assert kept(fake_cli)["engines"]["claude-code"]["state"] == "signed_out"
    post_run(client, run_body(ASK, run_id="run-2"))  # the person signed in, in a terminal; nothing skips the turn yet
    assert (claude(client)["state"], claude(client)["consecutive_failures"]) == ("ready", 0)
    assert kept(fake_cli)["engines"]["claude-code"]["state"] == "ready"


@pytest.mark.parametrize(
    "plan, state, kind",
    [
        ([{"stderr": "usage limit"}, {"exit": 1}], "open", "usage_limit"),
        ([{"stderr": "Invalid API key · Please run /login"}, {"exit": 1}], "signed_out", "auth"),
        ([{"stderr": "rate limit exceeded"}, {"exit": 1}], "open", "rate_limit"),
    ],
    ids=["limit-on-stderr", "sign-in-on-stderr", "too-many-requests-on-stderr"],
)
def test_a_stream_with_no_result_is_recorded_from_what_the_cli_said_on_stderr(client, fake_cli, plan, state, kind):
    fake_cli.plan(plan)
    post_run(client, run_body(ASK))
    assert (claude(client)["state"], claude(client)["last_failure_kind"]) == (state, kind)


@pytest.mark.parametrize(
    "plan",
    [[{"stderr": "something broke"}, {"exit": 3}], [{"text": "I started to"}, {"exit": 2}]],
    ids=["dies-without-a-result", "partial-text-then-exit"],
)
def test_a_cli_that_dies_for_no_reason_it_says_is_not_the_engines_health(client, fake_cli, plan):
    fake_cli.plan(plan)
    post_run(client, run_body(ASK))
    assert (claude(client)["state"], claude(client)["consecutive_failures"]) == ("ready", 0)
    assert not (fake_cli.data_dir / "engine-state.json").exists()


def test_a_missing_cli_is_the_probes_to_find_and_no_failure_of_a_turn(client, fake_cli, monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    events, _ = post_run(client, run_body(ASK))
    assert types(events)[-1] == "RUN_ERROR"
    assert claude(client)["state"] == "ready"  # the engine said nothing: no verdict


def test_nothing_the_cli_printed_reaches_the_file_or_the_endpoint(client, fake_cli, clock):
    fake_cli.plan([{"stderr": f"usage limit {CANARY} Example Organisation the-prompt-the-person-wrote"}, {"exit": 1}])
    post_run(client, run_body(ASK))
    assert claude(client)["state"] == "open"
    for text in ((fake_cli.data_dir / "engine-state.json").read_text(), json.dumps(engines(client))):
        assert "CANARY" not in text and "example.invalid" not in text and "Example Organisation" not in text and "the-prompt" not in text


# ── Restart ─────────────────────────────────────────────────────────────────────────────────────


def test_a_limit_survives_a_restart_of_the_service(fake_cli):
    with TestClient(app) as first:
        fake_cli.plan([{"replay": "usage_limit.jsonl"}])
        post_run(first, run_body(ASK))
        before = claude(first)
    assert before["state"] == "open"
    assert app.state.engine_state is None  # the service stopped
    with TestClient(app) as second:  # a new process, in effect: nothing in memory but the file in the volume
        after = claude(second)
        assert engines(second)["problems"] == []
    assert (after["state"], after["limited_until"], after["last_failure_kind"], after["consecutive_failures"]) == (
        "open", before["limited_until"], "usage_limit", 1,
    )


def test_a_file_that_is_corrupt_at_start_up_starts_clean_and_is_named(fake_cli):
    (fake_cli.data_dir / "engine-state.json").write_text("{this is not json")
    with TestClient(app) as started:
        assert engines(started)["problems"] == [CORRUPT] and claude(started)["state"] == "ready"
        fake_cli.plan([{"stderr": "usage limit"}, {"exit": 1}])
        post_run(started, run_body(ASK))
        assert claude(started)["state"] == "open"
    assert json.loads((fake_cli.data_dir / "engine-state.json").read_text())["version"] == 1  # a good file again


def test_the_file_is_read_at_start_up_and_not_by_the_first_turn(fake_cli, caplog):
    with TestClient(app) as started:
        caplog.set_level(logging.DEBUG, logger="freeduet")
        fake_cli.plan([{"text": "Hi."}])
        post_run(started, run_body(ASK))
        assert [r for r in caplog.records if r.name == "freeduet.engine_breaker"] == []


def test_a_state_that_cannot_be_made_stops_neither_the_start_up_nor_the_turns(fake_cli, monkeypatch, caplog):
    def explode(*engines):
        raise RuntimeError("no state today")

    monkeypatch.setattr(engine_state, "from_environment", explode)
    with caplog.at_level(logging.WARNING, logger="freeduet"):
        with TestClient(app, raise_server_exceptions=False) as started:
            assert started.get("/health").status_code == 200
            fake_cli.plan([{"text": "Hello there."}])
            events, _ = post_run(started, run_body(ASK))
            assert types(events)[-1] == "RUN_FINISHED"
            assert started.get("/engines", headers=AUTH).status_code == 500  # the endpoint says so; the turns do not care
    messages = [record.getMessage() for record in caplog.records]
    assert "engine state not started: it is made on first use" in messages
    assert "engine state unavailable: this turn is not recorded" in messages


def test_without_a_start_up_the_state_is_made_by_the_first_use(fake_cli):
    app.state.engine_state = None
    plain = TestClient(app)  # used without `with`: no start-up runs
    assert plain.get("/engines", headers=AUTH).json()["engines"][0]["state"] == "ready"
    assert app.state.engine_state is not None
    app.state.engine_state = None


# ── The endpoint: read-only, behind the service's token ─────────────────────────────────────────


@pytest.mark.parametrize("headers", [{}, {"x-openbot-agent-token": "wrong"}, {"x-openbot-agent-token": ""}, {"x-openbot-agent-token": TOOL_TOKEN},
                                     {"x-api-key": "env-key"}, {"authorization": f"Bearer {MANAGED_TOKEN}"}],
                         ids=["no-token", "wrong", "empty", "the-tool-token", "a-local-key", "bearer"])
def test_the_endpoint_refuses_without_the_servers_token(client, fake_cli, headers):
    response = client.get("/engines", headers=headers)
    assert response.status_code == 401 and response.json() == {"error": "unauthorised"}


def test_with_no_token_configured_nobody_is_let_in(client, fake_cli, monkeypatch):
    monkeypatch.delenv("MANAGED_AGENT_TOKEN")
    for headers in ({}, {"x-openbot-agent-token": ""}, {"x-openbot-agent-token": MANAGED_TOKEN}):
        assert client.get("/engines", headers=headers).status_code == 401


def test_the_endpoint_is_in_no_open_path_and_not_under_the_local_key_prefix():
    assert "/engines" not in app_module.OPEN_PATHS and not "/engines".startswith(app_module.SERVER_CALLS_PREFIX)
    assert app_module.OPEN_PATHS == {"/health"}


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_the_endpoint_only_reads(client, fake_cli, clock, method):
    fake_cli.plan([{"replay": "usage_limit.jsonl"}])
    post_run(client, run_body(ASK))
    before = engines(client)
    response = getattr(client, method)("/engines", headers=AUTH)
    assert response.status_code == 405
    assert engines(client) == before
    assert client.request(method.upper(), "/engines").status_code == 401  # and without the token it is still refused first


def test_the_endpoint_starts_no_process_and_counts_no_run(client, fake_cli, monkeypatch):
    launches = Launches()
    launches.install(monkeypatch)
    for _ in range(3):
        engines(client)
    assert launches.calls == []
    assert not list(fake_cli.dir.glob("run-*.json")) and not list(fake_cli.dir.glob("probe-*.json"))


def test_the_endpoint_gives_no_secret_no_path_and_asks_not_to_be_cached(client, fake_cli):
    response = client.get("/engines", headers=AUTH)
    assert response.headers["cache-control"] == "no-store" and response.headers["content-type"].startswith("application/json")
    for secret in (MANAGED_TOKEN, TOOL_TOKEN, str(fake_cli.data_dir), "engine-state.json", str(Path.home())):
        assert secret not in response.text
    assert set(claude(client)) == FIELDS


def test_health_stays_the_only_open_path(client, fake_cli):
    assert client.get("/health").status_code == 200
    assert client.get("/engines").status_code == 401
