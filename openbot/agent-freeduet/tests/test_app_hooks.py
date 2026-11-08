"""The two seams other streams plug into: stream B's server_calls router (with run_claude_text) and
stream E's checkpoint writer."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from freeduet import app as app_module
from freeduet import claude_cli
from helpers import post_run, run_body, standing

SERVER_CALLS = '''
from fastapi import APIRouter

router = APIRouter()
runner = None


class EngineUnavailable(Exception):
    pass


def configure(run_claude_text):
    global runner
    runner = run_claude_text


@router.post("/v1/messages")
async def messages():
    return {"ok": True}
'''


@pytest.fixture
def server_calls_module(tmp_path, monkeypatch):
    package = tmp_path / "fake_streamb"
    package.mkdir()
    (package / "__init__.py").write_text("")
    (package / "server_calls.py").write_text(SERVER_CALLS)
    monkeypatch.syspath_prepend(str(tmp_path))
    return "fake_streamb.server_calls"


def test_no_server_calls_module_is_fine():
    assert app_module.mount_server_calls(FastAPI(), "freeduet.no_such_module") is False


def test_server_calls_is_configured_and_mounted(server_calls_module):
    target = FastAPI()
    assert app_module.mount_server_calls(target, server_calls_module) is True
    import importlib

    module = importlib.import_module(server_calls_module)
    assert callable(module.runner)
    assert TestClient(target).post("/v1/messages").json() == {"ok": True}


def test_v1_is_left_to_server_calls_by_the_token_check(client):
    # The agent-token check leaves /v1/messages alone: server_calls refuses it for its own key.
    response = client.post("/v1/messages")
    assert response.status_code == 401
    assert response.json() != {"error": "unauthorised"}
    assert response.json()["error"]["type"] == "authentication_error"


def test_run_claude_text_answers_from_a_locked_down_cli(fake_cli, server_calls_module):
    import importlib

    module = importlib.import_module(server_calls_module)
    runner = app_module.claude_text_runner(module)
    fake_cli.plan([{"text": "Kitchen plan"}], [{"replay": "not_signed_in.jsonl"}])
    assert asyncio.run(runner("Write a short title.", "Plan the kitchen.", None)) == "Kitchen plan"
    seen = fake_cli.run(0)
    assert "--mcp-config" not in seen["argv"] and seen["argv"][seen["argv"].index("--tools") + 1] == ""
    assert "tools" not in seen  # no MCP server was started at all
    assert seen["prompt"] == "Plan the kitchen."
    with pytest.raises(module.EngineUnavailable, match="not signed in"):
        asyncio.run(runner("", "Plan the kitchen.", None))


def test_run_claude_text_gives_up_before_the_server_does(fake_cli):
    fake_cli.plan([{"sleep": 5}, {"text": "late"}])
    with pytest.raises(claude_cli.TextCallFailed, match="did not answer in time"):
        asyncio.run(claude_cli.run_text("", "Hi", timeout=0.5))


def test_a_checkpoint_is_written_per_segment(client, fake_cli, monkeypatch):
    written = []
    monkeypatch.setattr(app_module, "_checkpoint_writer", lambda: lambda *args: written.append(args))
    fake_cli.plan([{"text": "Hello."}])
    post_run(client, run_body([standing(), {"id": "u1", "role": "user", "content": "Hi"}]))
    assert len(written) == 1
    run_id, agent, phase, state = written[0]
    assert (run_id, agent, phase) == ("thread-1", "freeduet", "finished")
    assert state["text"] == "Hello." and state["runId"] == "run-1"


def test_a_checkpoint_that_fails_never_fails_the_run(client, fake_cli, monkeypatch):
    def broken(*args):
        raise ValueError("invalid id")

    monkeypatch.setattr(app_module, "_checkpoint_writer", lambda: broken)
    fake_cli.plan([{"text": "Hello."}])
    events, _ = post_run(client, run_body([standing(), {"id": "u1", "role": "user", "content": "Hi"}]))
    assert events[-1]["type"] == "RUN_FINISHED"
