"""M1.8: no FreeDuet Python code opens a file inside a CLI's credential directory.

docs/PROVIDERS.md rule 1 and docs/M1_PLAN.md D9: the person signs in to the provider's own CLI, the
sign-in stays in that CLI's config directory, and FreeDuet only starts the CLI and reads its output.

Two checks:

1. Dynamic. A child Python, with HOME pointed at a temporary directory full of decoy credential
   directories and canary files, installs an audit hook on ``open``, ``os.listdir``, ``os.scandir``
   and ``glob.glob`` before importing anything from FreeDuet, then imports every module of the package
   and drives its request paths. Any touch of a decoy fails the test. A positive control proves the
   hook would have seen one.
2. Static. No module of agent-freeduet names one of those paths in a string, except this file.
"""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parents[1]
THIS_FILE = Path(__file__).resolve()

CANARY = "canary-credential-7d1e0b"

#: Directories (relative to HOME) where CLIs keep their sign-in.
HOME_CREDENTIAL_DIRS = (".claude", ".codex", ".gemini", ".config/claude")
#: Files (relative to HOME) a CLI keeps its account in; any name starting with these is watched.
HOME_CREDENTIAL_FILES = (".claude.json",)

CHILD_SCRIPT = r'''
import json
import os
import sys

package_root, report_path, watch_json = sys.argv[1], sys.argv[2], sys.argv[3]
watch = json.loads(watch_json)
watch_dirs = sorted({form for path in watch["dirs"] for form in (os.path.normpath(path), os.path.realpath(path))})
watch_files = sorted({form for path in watch["files"] for form in (os.path.normpath(path), os.path.realpath(path))})
WATCHED_EVENTS = {"open", "os.listdir", "os.scandir", "glob.glob"}
touches = []
state = {"control": False}


def audit(event, args):
    if event not in WATCHED_EVENTS:
        return
    try:
        target = args[0] if args else None
        if target is None or isinstance(target, int):
            return
        target = os.fsdecode(target) if isinstance(target, bytes) else os.fspath(target)
        path = os.path.normpath(os.path.join(os.getcwd(), target))
        if any(path == d or path.startswith(d + os.sep) for d in watch_dirs) or any(
            path.startswith(f) for f in watch_files
        ):
            touches.append({"event": event, "path": path, "control": state["control"]})
    except Exception as error:  # an audit hook must never raise
        touches.append({"event": event, "error": repr(error), "control": state["control"]})


sys.addaudithook(audit)
sys.path.insert(0, package_root)

import asyncio
import importlib
import importlib.util
import pkgutil

import httpx
from fastapi import FastAPI

import freeduet

imported = []
for info in pkgutil.walk_packages(freeduet.__path__, "freeduet."):
    if info.name.rsplit(".", 1)[-1] == "__main__":
        continue
    importlib.import_module(info.name)
    imported.append(info.name)

from freeduet import assistants, engines
from freeduet import server_calls as aux

# engines.py: the configured file (missing here, so the shipped example) and every chain.
example = engines.load_engines()
for member in example.chains:
    engines.ordered_chain(member, example)
    engines.ordered_chain(member, example, min_tier="A")
engines.assistant_chain(example)
engines.required_tier("concierge", "request_purchase", example)

import copy
import yaml

with open(engines.EXAMPLE_ENGINES_FILE, encoding="utf-8") as handle:
    data = yaml.safe_load(handle)
data["engines"]["local"].update(enabled=True, model="llama-test")
data["assistants"]["chain"] = ["local"]
config = engines.parse_engines(data)

free_mode = {"value": "ok"}


def free_engine(request):
    if free_mode["value"] == "down":
        return httpx.Response(500, json={"error": "down"})
    return httpx.Response(200, json={"choices": [{"message": {"content": "Flour suppliers in Turin"}}]})


def fake_claude(system, prompt, model):
    return '{"verdict": "needs_approval", "preApproved": false, "safety": "none", "reason": "new recipient"}'


runtime = aux.AuxRuntime(
    run_claude_text=fake_claude,
    engines=config,
    assistant=assistants.AssistantClient(transport=httpx.MockTransport(free_engine)),
    local_key="child-key",
)
app = FastAPI()
app.include_router(aux.router)
app.dependency_overrides[aux.get_runtime] = lambda: runtime

title = {
    "model": "claude-sonnet-5-5",
    "system": "You name conversations, like a title in a sidebar.",
    "messages": [{"role": "user", "content": "Ada: flour suppliers near Turin?"}],
    "max_tokens": 512,
}
review = {
    "model": "claude-sonnet-5-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "You review one action an AI assistant is about to take on a person's behalf, before it runs.\n<request>send it</request>"}],
}
unknown = {"model": "claude-sonnet-5-5", "max_tokens": 64, "messages": [{"role": "user", "content": "Write a haiku."}]}
streaming = dict(title, stream=True)

statuses = []
bodies = []
probes = []


async def drive():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://agent-freeduet") as client:
        for body, key in ((title, "child-key"), (review, "child-key"), (unknown, "child-key"), (streaming, "child-key"), (title, "wrong")):
            response = await client.post("/v1/messages", json=body, headers={"x-api-key": key})
            statuses.append(response.status_code)
            bodies.append(response.text)
        free_mode["value"] = "down"
        response = await client.post("/v1/messages", json=title, headers={"x-api-key": "child-key"})
        statuses.append(response.status_code)
        bodies.append(response.text)

    # The default wiring: configure() reads FREEDUET_ENGINES_FILE, the key comes from the environment.
    aux.configure(run_claude_text=fake_claude)
    plain = FastAPI()
    plain.include_router(aux.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=plain), base_url="http://agent-freeduet") as client:
        response = await client.post("/v1/messages", json=review, headers={"x-api-key": os.environ["FREEDUET_LOCAL_KEY"]})
        statuses.append(response.status_code)
        bodies.append(response.text)

    # The member runtime's app, once it exists: its health route must not touch a login either.
    if importlib.util.find_spec("freeduet.app") is not None:
        member_app = getattr(importlib.import_module("freeduet.app"), "app", None)
        if member_app is not None:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=member_app), base_url="http://agent-freeduet") as client:
                response = await client.get("/health")
                statuses.append(response.status_code)
                bodies.append(response.text)
                # The engine state (ENGINES_PLAN slice 2): its endpoint, a turn recorded through it, and the
                # probe (`claude --version`, `claude auth status`) of a stand-in CLI: none of them opens a login.
                from freeduet import claude_cli, engine_state
                from freeduet.claude_engine import ClaudeEngine
                from freeduet.engine_adapter import Health
                from freeduet.failure_classifier import USAGE_LIMIT, Failure

                stand_in = os.path.join(os.environ["TMPDIR"], "stand-in-claude.sh")
                with open(stand_in, "w", encoding="utf-8") as handle:
                    handle.write("""#!/bin/sh
case "$1" in
  --version) echo "2.1.311 (Claude Code)" ;;
  auth) echo '{"loggedIn": true}' ;;
esac
""")
                os.chmod(stand_in, 0o755)
                os.environ["CLAUDE_BIN"] = stand_in
                found = await claude_cli.probe()
                probes.append([found.installed, found.version, found.signed_in, found.problem])
                state = engine_state.from_environment(ClaudeEngine())
                await state.probe(ClaudeEngine())
                state.finish("claude-code", state.begin("claude-code"), Health(failure=Failure(USAGE_LIMIT)))
                response = await client.get("/engines", headers={"x-openbot-agent-token": os.environ["MANAGED_AGENT_TOKEN"]})
                statuses.append(response.status_code)
                bodies.append(response.text)

    free_mode["value"] = "ok"
    await assistants.complete(
        base_url="http://ollama.test:11434/v1",
        model="llama-test",
        system="Summarise.",
        messages=[("user", "Three emails about flour.")],
        transport=httpx.MockTransport(free_engine),
    )


asyncio.run(drive())

# Positive control: the hook must see a deliberate read of a decoy.
state["control"] = True
with open(watch["control"], encoding="utf-8") as handle:
    handle.read()
state["control"] = False

report = {
    "imported": imported,
    "violations": [touch for touch in touches if not touch["control"]],
    "control_detected": any(touch["control"] for touch in touches),
    "statuses": statuses,
    "probes": probes,
    "canary_seen": any(watch["canary"] in body for body in bodies),
}
with open(report_path, "w", encoding="utf-8") as handle:
    json.dump(report, handle)
'''


def _decoys(tmp_path: Path) -> tuple[Path, dict]:
    """A HOME full of decoy sign-ins, plus decoy configured CLI config directories."""
    home = tmp_path / "home"
    dirs: list[Path] = []
    for relative in HOME_CREDENTIAL_DIRS:
        directory = home / relative
        directory.mkdir(parents=True)
        (directory / ".credentials.json").write_text(json.dumps({"token": CANARY}), encoding="utf-8")
        dirs.append(directory)
    files: list[Path] = []
    for relative in HOME_CREDENTIAL_FILES:
        path = home / relative
        path.write_text(json.dumps({"oauthAccount": CANARY}), encoding="utf-8")
        files.append(path)
    # The CLI config directories as configured through the environment (the mounted volume in D9).
    configured = {
        "CLAUDE_CONFIG_DIR": tmp_path / "cli-config" / "claude",
        "CODEX_HOME": tmp_path / "cli-config" / "codex",
        "GEMINI_CLI_HOME": tmp_path / "cli-config" / "gemini",
    }
    for directory in configured.values():
        directory.mkdir(parents=True)
        (directory / ".credentials.json").write_text(json.dumps({"token": CANARY}), encoding="utf-8")
        dirs.append(directory)
    watch = {
        "dirs": [str(path) for path in dirs],
        "files": [str(path) for path in files],
        "control": str(home / ".claude" / ".credentials.json"),
        "canary": CANARY,
    }
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(home / ".config"),
        "TMPDIR": str(tmp_path),
        **{name: str(path) for name, path in configured.items()},
        "FREEDUET_LOCAL_KEY": "env-key",
        "FREEDUET_ENGINES_FILE": str(tmp_path / "no-engines-file.yaml"),
        "FREEDUET_DATA_DIR": str(tmp_path / "data"),
        "FREEDUET_AGENTS_FILE": str(REPO_ROOT / "openbot" / "examples" / "freeduet" / "agents.yaml"),
        "MANAGED_AGENT_TOKEN": "child-agent-token",
        "AGENT_TOOL_TOKEN": "child-tool-token",
        "CLAUDE_BIN": str(tmp_path / "no-claude-here"),
    }
    return home, {"watch": watch, "env": env}


def test_no_credential_directory_is_opened(tmp_path):
    _, setup = _decoys(tmp_path)
    script = tmp_path / "child_audit.py"
    script.write_text(CHILD_SCRIPT, encoding="utf-8")
    report_path = tmp_path / "report.json"
    process = subprocess.run(
        [
            sys.executable,
            "-I",  # no user site, no PYTHON* variables, no script directory on sys.path
            str(script),
            str(PACKAGE_ROOT),
            str(report_path),
            json.dumps(setup["watch"]),
        ],
        env=setup["env"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert process.returncode == 0, process.stderr[-4000:]
    report = json.loads(report_path.read_text(encoding="utf-8"))

    assert report["control_detected"], "the audit hook did not see the deliberate decoy read"
    assert report["violations"] == [], report["violations"]
    assert not report["canary_seen"]
    for module in ("freeduet.engines", "freeduet.server_calls", "freeduet.assistants"):
        assert module in report["imported"]
    # title (free), review (claude), unknown (claude), stream (400), wrong key (401),
    # free engine down (claude), default wiring (claude), then /health and /engines once the runtime exists.
    assert report["statuses"][:7] == [200, 200, 200, 400, 401, 200, 200]
    assert all(status == 200 for status in report["statuses"][7:])
    # ...then the engine state: the probe ran the stand-in CLI and read its sign-in, and /engines answered.
    assert report["probes"] == [[True, "2.1.311", True, None]]
    assert len(report["statuses"]) == 9


# ── Static check ─────────────────────────────────────────────────────────────────────────────────

CREDENTIAL_PATH_PATTERNS = (
    re.compile(r"(?<![\w.])\.claude(?:\.json)?(?![\w-])"),
    re.compile(r"(?<![\w.])\.codex(?![\w-])"),
    re.compile(r"(?<![\w.])\.gemini(?![\w-])"),
    re.compile(r"\.config[/\\]+claude(?![\w-])"),
    re.compile(r"\.credentials\.json"),
    re.compile(r"oauth_creds\.json"),
)

_SKIPPED_PARTS = {"__pycache__", ".venv", "venv", "site-packages", "node_modules", ".pytest_cache"}


def credential_references(source: str) -> list[tuple[int, str]]:
    """String constants (not docstrings or comments) that name a CLI credential path."""
    tree = ast.parse(source)
    docstrings: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            first = node.body[0] if node.body else None
            if (
                isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)
            ):
                docstrings.add(id(first.value))
    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or id(node) in docstrings:
            continue
        value = node.value
        if isinstance(value, bytes):
            value = value.decode("utf-8", "replace")
        if isinstance(value, str) and any(p.search(value) for p in CREDENTIAL_PATH_PATTERNS):
            found.append((node.lineno, value))
    return found


def test_the_static_scan_recognises_credential_paths():
    flagged = [
        'path = Path.home() / ".claude"',
        'open(os.path.expanduser("~/.claude/.credentials.json"))',
        'CONFIG = "/home/app/.config/claude/settings.json"',
        'open(f"{home}/.codex/auth.json")',
        'x = "~/.gemini/oauth_creds.json"',
        'account = "~/.claude.json"',
    ]
    clean = [
        'import_module("freeduet.claude_cli")',
        'binary = os.environ.get("CLAUDE_BIN", "claude")',
        'args = ["--mcp-config", path, "--output-format", "stream-json"]',
        'def f():\n    """Signs in under ~/.claude, never read here."""\n    return 1',
        "# the CLI keeps its login in ~/.claude\nvalue = 1",
    ]
    for snippet in flagged:
        assert credential_references(snippet), snippet
    for snippet in clean:
        assert not credential_references(snippet), snippet


def test_no_module_names_a_cli_credential_path():
    offenders: list[str] = []
    for path in sorted(PACKAGE_ROOT.rglob("*.py")):
        if path.resolve() == THIS_FILE or _SKIPPED_PARTS & set(path.relative_to(PACKAGE_ROOT).parts):
            continue
        for line, value in credential_references(path.read_text(encoding="utf-8")):
            offenders.append(f"{path.relative_to(PACKAGE_ROOT)}:{line}: {value!r}")
    assert offenders == [], "CLI credential paths named in code:\n" + "\n".join(offenders)
