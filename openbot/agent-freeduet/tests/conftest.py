"""Shared fixtures: an invented team, the fake CLI, a fake OpenBot callback route.

Nothing here is real: tokens, ids and prompts are invented, and no CLI configuration or
credential folder is ever read.
"""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from freeduet import segment
from freeduet.app import app
from helpers import MANAGED_TOKEN, TOOL_TOKEN

TESTS = Path(__file__).parent

AGENTS_YAML = """\
agents:
  - id: freeduet
    name: Iris
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: >-
      You are Iris, Chief of Staff of the test team.
  - id: chef
    name: Basil
    type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}
    endpoint: ${MANAGED_AGENT_AG_UI_URL:-}
    system_prompt: You are Basil, the test chef.
"""


@pytest.fixture
def fake_cli(tmp_path, monkeypatch):
    """The fake CLI behind CLAUDE_BIN. `fake_cli.plan([...], [...])` sets one plan per run;
    `fake_cli.run(n)` reads what run n saw."""
    state = tmp_path / "fake-cli"
    state.mkdir()
    # A wrapper, so the fake learns where its plans are without this service passing it any
    # environment the real CLI would not get.
    wrapper = tmp_path / "claude"
    wrapper.write_text(
        f'#!/bin/sh\nFAKE_CLAUDE_DIR="{state}" exec "{sys.executable}" "{TESTS / "fake_claude.py"}" "$@"\n'
    )
    wrapper.chmod(0o755)
    agents = tmp_path / "agents.yaml"
    agents.write_text(AGENTS_YAML)
    data = tmp_path / "data"  # checkpoints, the team log and lessons
    data.mkdir()
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(data))
    monkeypatch.setenv("CLAUDE_BIN", str(wrapper))
    monkeypatch.setenv("FREEDUET_AGENTS_FILE", str(agents))
    monkeypatch.setenv("MANAGED_AGENT_TOKEN", MANAGED_TOKEN)
    monkeypatch.setenv("AGENT_TOOL_TOKEN", TOOL_TOKEN)
    # Passed through to the CLI by name only; nothing in this service opens it.
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "cli-config-never-opened"))
    monkeypatch.setattr(segment, "SETTLE_SECONDS", 0.1)

    class Fake:
        dir = state
        agents_file = agents
        data_dir = data

        def plan(self, *plans):
            (state / "plans.json").write_text(json.dumps(list(plans)))

        def followups(self, *plans):
            """One plan per report-guard follow-up (fake_claude.py)."""
            (state / "followups.json").write_text(json.dumps(list(plans)))

        def run(self, index=0) -> dict:
            return json.loads((state / f"run-{index}.json").read_text())

        def followup(self, index=0) -> dict:
            return json.loads((state / f"followup-{index}.json").read_text())

        def followup_count(self) -> int:
            counter = state / "followup-count"
            return int(counter.read_text()) if counter.exists() else 0

    return Fake()


@pytest.fixture
def client(fake_cli):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def callback_server(monkeypatch):
    """A stand-in for OpenBot's POST /api/agent-tools/call that records what it was sent."""
    seen: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            seen.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
            answer = json.dumps({"text": f"Otto has it: {body['args'].get('message', '')}", "isError": False}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(answer)))
            self.end_headers()
            self.wfile.write(answer)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("OPENBOT_TOOL_URL", f"http://127.0.0.1:{server.server_address[1]}/api/agent-tools/call")
    yield seen
    server.shutdown()
