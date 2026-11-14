"""Golden-output harness for the engine seam (docs/ENGINES_PLAN.md, slice 1).

A scenario drives the real service (the app, the segment loop, the real bridge) against the fake CLI
and records everything observable at its edges: the exact SSE stream, the exact subprocess launch
(argv, environment, working folder, keyword arguments, the files named in argv), what the CLI saw,
the calls to OpenBot's callback route, the `freeduet*` log lines, the team-log lines and the
checkpoints. The result is compared with `tests/goldens/<scenario>.json`.

The goldens were generated from the code as it stood BEFORE the engine seam. Random ids are replaced
by their order of first appearance (`<msg-1>`, `<toolu-2>`), temporary paths and times by markers;
nothing else is touched, so "byte-identical" means identical after that renaming. A string longer than
BLOB_OVER characters is stored as its length and sha256 (plus its head).

Regenerate on purpose only: `FREEDUET_UPDATE_GOLDENS=1 python -m pytest tests/test_engine_goldens.py`.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

GOLDENS = Path(__file__).parent / "goldens"
UPDATE = os.environ.get("FREEDUET_UPDATE_GOLDENS") == "1"
BLOB_OVER = 400

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
IDS = {
    "msg": re.compile(rf"\bmsg-{UUID}"),
    "tool": re.compile(rf"\btool-{UUID}"),
    "call": re.compile(rf"\bcall-{UUID}"),
    "local": re.compile(rf"\blocal-{UUID}"),
    "toolu": re.compile(r"\btoolu_[0-9a-f]{12}\b"),
    "uuid": re.compile(rf"\b{UUID}\b"),
    "lesson": re.compile(r"\bL-[A-Z0-9]{4}\b"),
}
TIME = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?")

# What the service's environment holds while a scenario runs: every name the CLI may be given, and the
# names it must never be given.
PASSED = {
    "PATH": "/golden/bin:/usr/bin:/bin", "HOME": "/golden/home", "USER": "golden", "LOGNAME": "golden",
    "LANG": "C.UTF-8", "LANGUAGE": "en", "LC_ALL": "C.UTF-8", "LC_CTYPE": "C.UTF-8", "TZ": "UTC",
    "TMPDIR": "/golden/tmp", "CLAUDE_CONFIG_DIR": "/golden/cli-config-never-opened",
    "HTTP_PROXY": "http://golden-proxy:3128", "HTTPS_PROXY": "http://golden-proxy:3128",
    "NO_PROXY": "127.0.0.1,localhost", "http_proxy": "http://golden-proxy:3128",
    "https_proxy": "http://golden-proxy:3128", "no_proxy": "127.0.0.1,localhost",
    "NODE_EXTRA_CA_CERTS": "/golden/ca.pem", "SSL_CERT_FILE": "/golden/ca.pem", "SSL_CERT_DIR": "/golden/certs",
}
HOSTILE = {
    "ANTHROPIC_API_KEY": "sk-golden", "ANTHROPIC_AUTH_TOKEN": "golden", "ANTHROPIC_BASE_URL": "http://localhost:4230",
    "ANTHROPIC_MODEL": "golden-model", "CLAUDE_CODE_OAUTH_TOKEN": "golden", "FREEDUET_LOCAL_KEY": "golden",
    "OPENAI_API_KEY": "golden", "GEMINI_API_KEY": "golden", "CODEX_API_KEY": "golden",
}
WATCHED = sorted({*PASSED, *HOSTILE, "MANAGED_AGENT_TOKEN", "AGENT_TOOL_TOKEN", "OPENBOT_TOOL_URL", "CLAUDE_BIN",
                  "FREEDUET_DATA_DIR", "DISABLE_AUTOUPDATER", "CLAUDE_CODE_DISABLE_AUTO_MEMORY"})


class Normalizer:
    def __init__(self):
        self.names = {kind: {} for kind in IDS}
        self.paths: list[tuple[str, str]] = []

    def path(self, real, marker: str) -> None:
        self.paths.append((str(real), marker))

    def text(self, value: str) -> str:
        for real, marker in sorted(self.paths, key=lambda pair: -len(pair[0])):
            value = value.replace(real, marker)
        for kind, pattern in IDS.items():
            value = pattern.sub(lambda match, kind=kind: self._name(kind, match.group(0)), value)
        return TIME.sub("<time>", value)

    def _name(self, kind: str, raw: str) -> str:
        table = self.names[kind]
        table.setdefault(raw, f"<{kind}-{len(table) + 1}>")
        return table[raw]

    def data(self, value):
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, list):
            return [self.data(item) for item in value]
        if isinstance(value, dict):
            return {self.text(str(key)): self.data(item) for key, item in value.items()}
        return value


def blob(value: str):
    if len(value) <= BLOB_OVER:
        return value
    return {"sha256": hashlib.sha256(value.encode("utf-8")).hexdigest(), "bytes": len(value.encode("utf-8")), "head": value[:100]}


def blobs(value):
    if isinstance(value, str):
        return blob(value)
    if isinstance(value, list):
        return [blobs(item) for item in value]
    if isinstance(value, dict):
        return {key: blobs(item) for key, item in value.items()}
    return value


class Launches:
    """asyncio.create_subprocess_exec, recorded exactly and then forwarded (or refused, so that a
    scenario about a missing binary can never start a real one)."""

    def __init__(self):
        self.calls: list[dict] = []
        self.refuse = False

    def install(self, monkeypatch) -> None:
        real = asyncio.create_subprocess_exec

        async def recorded(*args, **kwargs):
            cwd = Path(kwargs["cwd"]) if kwargs.get("cwd") is not None else None
            files = {}
            for index, arg in enumerate(args):
                path = Path(str(arg))
                if cwd is not None and index and path.is_absolute() and path.parent == cwd.parent and path.is_file():
                    data = path.read_bytes()
                    files[str(index)] = {"mode": oct(stat.S_IMODE(path.stat().st_mode)), "bytes": data.decode("utf-8")}
            self.calls.append({"args": [str(arg) for arg in args], "kwargs": dict(kwargs), "files": files})
            if self.refuse:
                raise FileNotFoundError(2, "No such file or directory", str(args[0]))
            return await real(*args, **kwargs)

        monkeypatch.setattr(asyncio, "create_subprocess_exec", recorded)


class LogTap(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.records: list[list] = []

    def emit(self, record):
        kind = record.exc_info[0].__name__ if record.exc_info and record.exc_info[0] else None
        self.records.append([record.name, record.levelname, record.getMessage(), kind])

    def __enter__(self):
        self.logger = logging.getLogger("freeduet")
        self.level = self.logger.level
        self.logger.setLevel(logging.DEBUG)
        self.logger.addHandler(self)
        return self

    def __exit__(self, *exc):
        self.logger.removeHandler(self)
        self.logger.setLevel(self.level)


def pin_environment(monkeypatch) -> None:
    tempfile.gettempdir()  # cached for the whole process: TMPDIR below changes only what the CLI is given
    for name, value in {**PASSED, **HOSTILE}.items():
        monkeypatch.setenv(name, value)


def launch_view(call: dict, norm: Normalizer) -> dict:
    kwargs = call["kwargs"]
    cwd = kwargs.get("cwd")
    segment = Path(str(cwd)).parent if cwd is not None else None
    if segment is not None:
        norm.path(segment, "<segment>")
    args = [norm.text(arg) for arg in call["args"]]
    files = {}
    for index, item in call["files"].items():
        name = Path(call["args"][int(index)]).name
        content = item["bytes"]
        if name == "mcp.json":
            config = json.loads(content)
            for server in config["mcpServers"].values():
                env = server["env"]
                server["command"] = "<python>" if server["command"] == sys.executable else server["command"]
                env["FREEDUET_BRIDGE_PORT"] = "<port>" if env["FREEDUET_BRIDGE_PORT"].isdigit() else env["FREEDUET_BRIDGE_PORT"]
                env["FREEDUET_BRIDGE_SECRET"] = f"<secret of {len(env['FREEDUET_BRIDGE_SECRET'])} characters>"
                env["PYTHONPATH"] = "<package root>"
            content = config
        else:
            content = blob(content)
        files[name] = {"mode": item["mode"], "content": content}
    view = {
        "argv": [blob(arg) for arg in args],
        "cwd": norm.text(str(cwd)) if cwd is not None else None,
        "kwargs": {key: ("PIPE" if value == asyncio.subprocess.PIPE else value) for key, value in kwargs.items() if key not in ("cwd", "env")},
        "env": kwargs.get("env"),
        "files": files,
    }
    return json.loads(json.dumps(view, default=str))


def cli_view(record: dict, norm: Normalizer) -> dict:
    view = {
        "prompt": blob(norm.text(record["prompt"])),
        "cwd_entries": record["cwd_entries"],
        "mcp_config": norm.data(record.get("mcp_config") or {}),
        "env_seen_of_interest": sorted(set(record["env"]) & set(WATCHED)),
    }
    if "mcp_config" in view and view["mcp_config"].get("mcpServers"):
        for server in view["mcp_config"]["mcpServers"].values():
            server["command"] = "<python>"
            server["env"] = {key: "<value>" for key in server["env"]}
    if "tools" in record:
        canonical = json.dumps(record["tools"], sort_keys=True)
        view["tools"] = {"names": [tool["name"] for tool in record["tools"]], "sha256": hashlib.sha256(canonical.encode()).hexdigest()}
        view["initialize"] = record.get("initialize")
    for key in ("calls", "results", "unavailable", "unavailable_as"):
        if key in record:
            view[key] = norm.data(record[key])
    return view


def compare(name: str, snapshot: dict) -> None:
    path = GOLDENS / f"{name}.json"
    text = json.dumps(snapshot, indent=1, ensure_ascii=False) + "\n"
    if UPDATE:
        GOLDENS.mkdir(exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return
    assert path.exists(), f"no golden for {name}: generate it from the unchanged code with FREEDUET_UPDATE_GOLDENS=1"
    expected = json.loads(path.read_text(encoding="utf-8"))
    for key in expected:
        assert snapshot.get(key) == expected[key], f"{name}: {key} differs from its golden"
    assert set(snapshot) == set(expected)
    assert text == path.read_text(encoding="utf-8")
