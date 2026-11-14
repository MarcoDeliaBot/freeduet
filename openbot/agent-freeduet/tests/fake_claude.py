#!/usr/bin/env python3
"""A stand-in for the `claude` CLI, for offline tests.

agent-freeduet starts it exactly as it starts the real CLI (claude_cli.build_command). It reads the
prompt from stdin, launches the MCP server named in `--mcp-config` (the real freeduet bridge), and
plays the next plan from $FAKE_CLAUDE_DIR/plans.json, one plan per invocation:

  {"text": "..."}                         an assistant message, streamed as deltas
  {"tool": {"name": ..., "input": {...}}, a message with a tool_use block (and optional text),
   "text": "..."}                         then the call through the bridge, like the real CLI
  {"replay": "fixture.jsonl"}             print a fixture's lines as they are
  {"events": [{...}, ...]}                print these stream-json events as they are
  {"sleep": seconds} / {"stderr": "..."} / {"exit": code}
  {"result": {...}}                       the result line, then exit 0

  {"tool": ..., "real_cli": true}         a call to a name the server did not list is answered the way
                                          the real CLI answers it (cli.js, "No such tool available"): an
                                          error result in the stream, and the bridge never hears of the
                                          call. The names are kept in `unavailable` in the run's record.
                                          Without it the call goes to the bridge anyway, which is how the
                                          bridge's own refusal of an unoffered tool is tested.
  {"tool": {..., "plain": true}, ...}     the model calls the tool by its plain name, without the
                                          mcp__freeduet__ prefix the CLI registers it under. With
                                          "real_cli" the CLI refuses it, as it refuses any name it does
                                          not have.
  {"tool": ..., "refuse": true}           the CLI refuses a call to a tool the server DID list (a server
                                          that was not connected yet, a name it did not match): the same
                                          answer, the bridge never hears of the call.
  {"init": {"status": "pending",          the first step only: what the init event says about the
            "tools": []}}                 freeduet server (its status, and the tools it lists). The
                                          server itself is started either way.

Without a result step it ends with a successful result. Everything it saw (argv, environment
names, prompt, MCP config, tools/list, tool results) goes to $FAKE_CLAUDE_DIR/run-<n>.json.
It never reads any CLI configuration or credential folder.

The probe's two commands, `--version` and `auth status`, are not runs: no plan is played and nothing
is counted, so the numbers of the runs stay what they were. Each is recorded in
$FAKE_CLAUDE_DIR/probe-<n>.json (argv, working folder, environment names, and what arrived on stdin:
"" when it was closed at once). $FAKE_CLAUDE_DIR/probe.json may shape them:

  {"version": {"text": "...", "exit": 0, "sleep": 0, "stderr": "..."},
   "auth": {"text": "...", "fixture": "auth_status_signed_out.json", "exit": 1, "sleep": 0, "stderr": "...",
            "bytes": 100000}}

`fixture` prints a file of tests/fixtures as it is; `bytes` prints that many bytes of filler. Without
a file, `--version` prints a version and `auth status` the signed-in fixture. `auth status` exits 1
when what it prints says `"loggedIn": false`, like the real CLI, unless "exit" says otherwise.

The report guard's follow-up (its prompt carries REPORT_GUARD_MARKER, a phrase of
freeduet/report_guard.py's INSTRUCTION) plays $FAKE_CLAUDE_DIR/followups.json instead, one plan per
follow-up, recorded as followup-<n>.json, so the plans of ordinary runs keep their numbers. Without a
plan it answers a line that is no report, and the guard adds nothing.
"""

import json
import os
import select
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
        self.listed: set[str] = set()  # the names the freeduet server's tools/list gave

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
            called_as = tool["name"] if tool.get("plain") else f"mcp__freeduet__{tool['name']}"
            use = {"type": "tool_use", "id": f"toolu_{uuid.uuid4().hex[:12]}", "name": called_as, "input": tool.get("input", {})}
            uses.append(use)
            out({"type": "assistant", "message": {"id": message_id, "role": "assistant", "content": [use]}, "parent_tool_use_id": None})
        out({"type": "stream_event", "event": {"type": "message_stop"}, "parent_tool_use_id": None})
        return uses

    def call(self, use: dict, real_cli: bool = False, refuse: bool = False) -> None:
        name = use["name"].removeprefix("mcp__freeduet__")
        # The CLI registers a server's tools as mcp__<server>__<tool>: a plain name is not one of them.
        registered = {f"mcp__freeduet__{listed}" for listed in self.listed}
        if refuse or (real_cli and use["name"] not in registered):
            # The real CLI answers a call to a name it does not have itself; nothing reaches the server.
            text = f"<tool_use_error>Error: No such tool available: {use['name']}</tool_use_error>"
            self.record.setdefault("unavailable", []).append(name)
            self.record.setdefault("unavailable_as", []).append(use["name"])
            self.save()
            out({"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": use["id"], "content": text, "is_error": True}]}, "parent_tool_use_id": None})
            return
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
                self.call(use, step.get("real_cli", False), step.get("refuse", False))
        elif "text" in step:
            self.message(step["text"])
        elif "events" in step:
            for event in step["events"]:
                out(event)
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


def probe_call(args: list[str]) -> int | None:
    """`claude --version` and `claude auth status`, the two commands the probe runs; None for anything else."""
    if args[:1] == ["--version"]:
        which, text = "version", "2.1.311 (Claude Code, test double)"
    elif args == ["auth", "status"]:
        which, text = "auth", (FIXTURES / "auth_status_signed_in.json").read_text()
    else:
        return None
    # The next free name, claimed atomically: probes may run side by side.
    index = 0
    while True:
        try:
            handle = os.open(DIR / f"probe-{index}.json", os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            index += 1
    ready, _, _ = select.select([sys.stdin], [], [], 1.0)
    arrived = sys.stdin.read() if ready else "<stdin left open>"  # closed at once: EOF, so ""
    with os.fdopen(handle, "w") as record:
        json.dump({
            "command": which, "argv": args, "pid": os.getpid(), "cwd": os.getcwd(), "cwd_entries": sorted(os.listdir(".")),
            "env": sorted(os.environ), "stdin": arrived,
        }, record, indent=1)
    plan_file = DIR / "probe.json"
    plan = (json.loads(plan_file.read_text()) if plan_file.exists() else {}).get(which, {})
    if "fixture" in plan:
        text = (FIXTURES / plan["fixture"]).read_text()
    if "text" in plan:
        text = plan["text"]
    if plan.get("sleep"):
        time.sleep(plan["sleep"])
    if plan.get("stderr"):
        sys.stderr.write(plan["stderr"] + "\n")
        sys.stderr.flush()
    if "bytes" in plan:
        text = "x" * plan["bytes"]
    sys.stdout.write(text if text.endswith("\n") or "bytes" in plan else text + "\n")
    sys.stdout.flush()
    if "exit" in plan:
        return plan["exit"]
    try:
        return 1 if which == "auth" and json.loads(text).get("loggedIn") is False else 0
    except (ValueError, AttributeError):
        return 0


def main(args: list[str]) -> int:
    probed = probe_call(args)
    if probed is not None:
        return probed
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
        turn.listed = {tool["name"] for tool in tools}
        record["tools"] = tools
        turn.save()
    init = plan[0]["init"] if plan and "init" in plan[0] else {}
    listed = init["tools"] if "tools" in init else [tool["name"] for tool in tools]
    out({"type": "system", "subtype": "init", "tools": [f"mcp__freeduet__{name}" for name in listed], "mcp_servers": [{"name": name, "status": init.get("status", "connected")} for name in servers], "apiKeySource": "none"})

    for step in plan:
        if not turn.step(step):
            return 0
    out({"type": "result", "subtype": "success", "is_error": False, "result": "".join(turn.text)})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
