"""The CLI is started locked down (D7), with the freeduet bridge as its only MCP server, and with
an environment that can never carry an API key or this service's tokens."""

import json
import os
import stat
import sys

from freeduet import claude_cli, iris_tools
from helpers import post_run, run_body, standing, tool

SECRETS = {
    "ANTHROPIC_API_KEY": "sk-invented",
    "ANTHROPIC_AUTH_TOKEN": "invented",
    "ANTHROPIC_BASE_URL": "http://localhost:4230",
    "CLAUDE_CODE_OAUTH_TOKEN": "invented",
    "MANAGED_AGENT_TOKEN": "invented",
    "AGENT_TOOL_TOKEN": "invented",
    "FREEDUET_LOCAL_KEY": "invented",
}


def value_after(argv, flag):
    return argv[argv.index(flag) + 1]


def assert_lockdown(argv):
    assert "-p" in argv
    assert value_after(argv, "--output-format") == "stream-json"
    assert "--verbose" in argv
    assert "--no-session-persistence" in argv
    assert value_after(argv, "--tools") == ""
    assert "--strict-mcp-config" in argv
    assert "--disable-slash-commands" in argv
    assert value_after(argv, "--permission-mode") == "dontAsk"
    for forbidden in ("--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--resume",
                      "--continue", "--session-id", "--bare", "--add-dir", "--settings", "--plugin-dir"):
        assert forbidden not in argv


def test_member_command_is_locked_down(tmp_path):
    argv = claude_cli.build_command("claude", tmp_path / "mcp.json", "You are Iris.", tmp_path)
    assert argv[0] == "claude"
    assert_lockdown(argv)
    assert "--include-partial-messages" in argv
    assert value_after(argv, "--allowedTools") == "mcp__freeduet"
    assert argv.count("--mcp-config") == 1 and value_after(argv, "--mcp-config") == str(tmp_path / "mcp.json")
    assert value_after(argv, "--append-system-prompt") == "You are Iris."


def test_the_mcp_config_names_the_bridge_and_nothing_else(tmp_path):
    path = claude_cli.write_mcp_config(tmp_path, 4321, "per-run-secret")
    config = json.loads(path.read_text())
    assert list(config) == ["mcpServers"]
    assert list(config["mcpServers"]) == ["freeduet"]
    server = config["mcpServers"]["freeduet"]
    assert server["type"] == "stdio"
    assert [server["command"], *server["args"]] == [sys.executable, "-m", "freeduet.bridge"]
    assert server["env"]["FREEDUET_BRIDGE_PORT"] == "4321"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_a_long_system_prompt_goes_through_a_file(tmp_path):
    text = "x" * (claude_cli.MAX_INLINE_SYSTEM_BYTES + 1)
    argv = claude_cli.build_command("claude", tmp_path / "mcp.json", text, tmp_path)
    assert "--append-system-prompt" not in argv
    assert (tmp_path / "system.txt").read_text() == text
    assert value_after(argv, "--append-system-prompt-file") == str(tmp_path / "system.txt")


def test_text_command_has_no_mcp_server_at_all(tmp_path):
    argv = claude_cli.build_text_command("claude", "Write a title.", "haiku", tmp_path)
    assert_lockdown(argv)
    assert "--mcp-config" not in argv and "--allowedTools" not in argv
    assert value_after(argv, "--model") == "haiku"
    assert "--append-system-prompt" not in claude_cli.build_text_command("claude", "", None, tmp_path)


def test_the_cli_environment_never_carries_a_key_or_a_token():
    source = {**SECRETS, "ANTHROPIC_MODEL": "x", "PATH": "/usr/bin", "HOME": "/home/test", "CLAUDE_CONFIG_DIR": "/config"}
    env = claude_cli.child_env(source)
    assert not set(SECRETS) & set(env)
    assert not [name for name in env if name.startswith("ANTHROPIC_")]
    assert env["PATH"] == "/usr/bin" and env["CLAUDE_CONFIG_DIR"] == "/config"
    assert env["DISABLE_AUTOUPDATER"] == "1"


def test_the_started_cli_gets_exactly_that(client, fake_cli, monkeypatch):
    for name, value in SECRETS.items():
        if name not in ("MANAGED_AGENT_TOKEN", "AGENT_TOOL_TOKEN"):
            monkeypatch.setenv(name, value)
    fake_cli.plan([{"text": "Hi."}])
    messages = [standing(), {"id": "u1", "role": "user", "content": "Hello"}]
    post_run(client, run_body(messages, tools=[tool("make_page")]))
    seen = fake_cli.run(0)
    assert_lockdown(seen["argv"])
    assert value_after(seen["argv"], "--allowedTools") == "mcp__freeduet"
    assert list(seen["mcp_config"]["mcpServers"]) == ["freeduet"]
    assert not set(SECRETS) & set(seen["env"])
    assert "CLAUDE_CONFIG_DIR" in seen["env"]  # passed by name; the CLI reads it, this service never does
    assert seen["cwd_entries"] == []  # an empty folder: no project files, no CLAUDE.md
    # OpenBot's offered tools, then (this run is Iris's) her own four, answered by this service.
    assert [t["name"] for t in seen["tools"]] == ["make_page", *sorted(iris_tools.NAMES)]
    # The bridge got its own line and nothing of this service's credentials.
    assert set(seen["mcp_config"]["mcpServers"]["freeduet"]["env"]) == {"FREEDUET_BRIDGE_PORT", "FREEDUET_BRIDGE_SECRET", "PYTHONPATH"}
    assert os.environ["MANAGED_AGENT_TOKEN"] not in json.dumps(seen)
