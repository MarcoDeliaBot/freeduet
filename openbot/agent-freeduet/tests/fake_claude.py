#!/usr/bin/env python3
"""A stand-in for the `claude` CLI, for offline tests.

agent-freeduet starts it exactly as it starts the real CLI (claude_cli.build_command). It reads the
prompt from stdin, launches the MCP server named in `--mcp-config` (the real freeduet bridge), and
plays the next plan from $FAKE_CLAUDE_DIR/plans.json, one plan per invocation:

  {"text": "..."}                         an assistant message, streamed as deltas
  {"tool": {"name": ..., "input": {...}}, a message with a tool_use block (and optional text),
   "text": "..."}                         then the call through the bridge, like the real CLI
  {"replay": "fixture.jsonl"}             print a fixture's lines as they are
  {"sleep": seconds} / {"stderr": "..."} / {"exit": code}
  {"result": {...}}                       the result line, then exit 0

Without a result step it ends with a successful result. Everything it saw (argv, environment
names, prompt, MCP config, tools/list, tool results) goes to $FAKE_CLAUDE_DIR/run-<n>.json.
It never reads any CLI configuration or credential folder.

The report guard's follow-up (its prompt carries REPORT_GUARD_MARKER, a phrase of
freeduet/report_guard.py's INSTRUCTION) plays $FAKE_CLAUDE_DIR/followups.json instead, one plan per
follow-up, recorded as followup-<n>.json, so the plans of ordinary runs keep their numbers. Without a
plan it answers a line that is no report, and the guard adds nothing.
"""

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"
DIR = Path(os.environ["FAKE_CLAUDE_DIR"])
REPORT_GUARD_MARKER = "does not end with the work report the shared rules require"


def out(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def value_after(args: list[str], flag: str) -> str | None:
    return args[args.index(flag) + 1] if flag in args else None


class McpClient:
    def __init__(self, server: dict):
        env = {**os.environ, **server.get("env", {})}
        self.proc = subprocess.Popen(
            [server["command"], *server.get("args", [])],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env,
        )
        self.next_id = 0

    def request(self, method: str, params: dict) -> dict:
        self.next_id += 1
        message = {"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params}
        self.proc.stdin.write((json.dumps(message) + "\n").encode())
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()  # blocks for a call OpenBot runs itself, until killed
        return json.loads(line)

    def notify(self, method: str) -> None:
        self.proc.stdin.write((json.dumps({"jsonrpc": "2.0", "method": method}) + "\n").encode())
        self.proc.stdin.flush()


class Turn:
    def __init__(self, record: dict, path: Path):
        self.record, self.path = record, path
        self.text: list[str] = []
        self.mcp: McpClient | None = None

    def save(self) -> None:
        self.path.write_text(json.dumps(self.record, indent=1))

    def message(self, text: str | None = None, tools: list[dict] | None = None) -> list[dict]:
        message_id = f"msg_{uuid.uuid4().hex[:12]}"
        out({"type": "stream_event", "event": {"type": "message_start", "message": {"id": message_id, "role": "assistant", "content": []}}, "parent_tool_use_id": None})
        content = []
        if text:
            half = max(1, len(text) // 2)
            for chunk in (text[:half], text[half:]):
                if chunk:
                    out({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": chunk}}, "parent_tool_use_id": None})
            content.append({"type": "text", "text": text})
            out({"type": "assistant", "message": {"id": message_id, "role": "assistant", "content": [content[-1]]}, "parent_tool_use_id": None})
            self.text.append(text)
        uses = []
        for tool in tools or []:
            use = {"type": "tool_use", "id": f"toolu_{uuid.uuid4().hex[:12]}", "name": f"mcp__freeduet__{tool['name']}", "input": tool.get("input", {})}
            uses.append(use)
            out({"type": "assistant", "message": {"id": message_id, "role": "assistant", "content": [use]}, "parent_tool_use_id": None})
        out({"type": "stream_event", "event": {"type": "message_stop"}, "parent_tool_use_id": None})
        return uses

    def call(self, use: dict) -> None:
        name = use["name"].removeprefix("mcp__freeduet__")
        self.record.setdefault("calls", []).append({"name": name, "arguments": use["input"]})
        self.save()
        response = self.mcp.request("tools/call", {"name": name, "arguments": use["input"]})
        result = response.get("result", {})
        text = "".join(part.get("text", "") for part in result.get("content", []))
        self.record.setdefault("results", []).append({"name": name, "text": text, "isError": result.get("isError")})
        self.save()
        out({"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": use["id"], "content": text}]}, "parent_tool_use_id": None})

    def step(self, step: dict) -> bool:
        """Play one step; False once the turn has ended."""
        if "tool" in step:
            for use in self.message(step.get("text"), [step["tool"]]):
                self.call(use)
        elif "text" in step:
            self.message(step["text"])
        elif "replay" in step:
            for line in (FIXTURES / step["replay"]).read_text().splitlines():
                if line.strip():
                    sys.stdout.write(line + "\n")
            sys.stdout.flush()
        elif "sleep" in step:
            time.sleep(step["sleep"])
        elif "stderr" in step:
            sys.stderr.write(step["stderr"] + "\n")
            sys.stderr.flush()
        elif "exit" in step:
            sys.exit(step["exit"])
        elif "result" in step:
            out({"type": "result", "subtype": "success", **step["result"]})
            return False
        return True


def main(args: list[str]) -> int:
    if args[:1] == ["--version"]:
        print("2.1.311 (Claude Code, test double)")
        return 0
    prompt = sys.stdin.read()
    followup = REPORT_GUARD_MARKER in prompt
    counter = DIR / ("followup-count" if followup else "count")
    index = int(counter.read_text()) if counter.exists() else 0
    counter.write_text(str(index + 1))
    plans_file = DIR / ("followups.json" if followup else "plans.json")
    plans = json.loads(plans_file.read_text()) if plans_file.exists() else []
    fallback = "No report plan for this follow-up." if followup else "No plan for this run."
    plan = plans[index] if index < len(plans) else [{"text": fallback}]

    config_path = value_after(args, "--mcp-config")
    config = json.loads(Path(config_path).read_text()) if config_path else {}
    record = {
        "argv": args, "pid": os.getpid(), "env": sorted(os.environ), "cwd": os.getcwd(),
        "cwd_entries": sorted(os.listdir(".")), "prompt": prompt, "mcp_config": config,
    }
    turn = Turn(record, DIR / (f"followup-{index}.json" if followup else f"run-{index}.json"))
    turn.save()

    servers = config.get("mcpServers", {})
    tools = []
    if "freeduet" in servers:
        turn.mcp = McpClient(servers["freeduet"])
        init = turn.mcp.request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "fake-claude", "version": "0"}})
        turn.mcp.notify("notifications/initialized")
        tools = turn.mcp.request("tools/list", {}).get("result", {}).get("tools", [])
        record["initialize"] = init.get("result")
        record["tools"] = tools
        turn.save()
    out({"type": "system", "subtype": "init", "tools": [f"mcp__freeduet__{tool['name']}" for tool in tools], "mcp_servers": [{"name": name, "status": "connected"} for name in servers], "apiKeySource": "none"})

    for step in plan:
        if not turn.step(step):
            return 0
    out({"type": "result", "subtype": "success", "is_error": False, "result": "".join(turn.text)})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
