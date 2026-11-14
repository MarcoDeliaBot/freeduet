"""Shared pieces of the compatible-endpoint tests (docs/ENGINES_PLAN.md slice 5).

Nothing here is real. The gateway key is a made-up canary, the endpoint points at a port nothing listens on, and the
CLI is the fake (`fake_claude.py`), which never opens a connection. What this module adds to the fake is a wrapper that
writes down the VALUES of the environment the CLI was started with (the fake itself records only the names), so that
a test can say what the child could see: the endpoint, the key, and nothing of the service's own sign-in.
"""

from __future__ import annotations

import copy
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from freeduet import compatible_engine
from freeduet.claude_engine import ClaudeEngine
from freeduet.compatible_engine import CompatibleEngine
from freeduet.engine_router import Router
from freeduet.engine_state import EngineState
from freeduet.engines import EnginesConfig, parse_engines
from fake_engines import NOW

TESTS = Path(__file__).parent

#: The invented gateway key every test uses: distinctive, so that a search for it finds a leak and nothing else.
KEY = "canary-gw-key-7c1e5b09d2a44f83"
KEY_ENV = "FREEDUET_TEST_GATEWAY_KEY"
#: A value with the two characters that a JSON string escapes, for the test of the form a secret takes inside a stream
#: line. It is not a key (a key has no quote), so it only goes to the scrubber, never through ``read_key``.
AWKWARD_KEY = 'canary"gw\\key-91d0c7e2b3a5'
#: A key that uses every punctuation mark a bearer token may hold, for the tests that a key is found wherever it is echoed.
SYMBOL_KEY = "canary+gw/key.v1~91d0c7e2b3a5=="
BASE_URL = "http://127.0.0.1:18080"
MODEL = "gw-test-model"

ENTRY = {
    "kind": "anthropic-compatible",
    "base_url": BASE_URL,
    "credential_secret_ref": f"env:{KEY_ENV}",
    "billing": "free",
    "model": MODEL,
    "enabled": True,
}
CLAUDE_ENTRY = {"kind": "cli", "command": "claude", "billing": "subscription", "tier": "A", "enabled": True}

#: What the child process writes down before the fake CLI takes over: its argv, its whole environment (values
#: included), and what its two private folders held at that moment.
DUMPER = """\
import json, os, sys
STATE, FAKE = {state!r}, {fake!r}
n = 0
while True:
    try:
        handle = os.open(os.path.join(STATE, f"env-{{n}}.json"), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        break
    except FileExistsError:
        n += 1
home, config = os.environ.get("HOME", ""), os.environ.get("CLAUDE_CONFIG_DIR", "")
with os.fdopen(handle, "w") as out:
    json.dump({{
        "argv": sys.argv[1:], "env": dict(os.environ), "cwd": os.getcwd(),
        "home_entries": sorted(os.listdir(home)) if os.path.isdir(home) else None,
        "config_entries": sorted(os.listdir(config)) if os.path.isdir(config) else None,
    }}, out)
os.environ["FAKE_CLAUDE_DIR"] = STATE
os.execv(sys.executable, [sys.executable, FAKE, *sys.argv[1:]])
"""


@dataclass
class Rig:
    """One compatible engine over its own fake CLI: where its records are, and the wrapper that starts it."""

    engine: CompatibleEngine
    config: EnginesConfig
    dir: Path
    wrapper: Path

    def plan(self, *plans) -> None:
        (self.dir / "plans.json").write_text(json.dumps(list(plans)))

    def run(self, index: int = 0) -> dict:
        return json.loads((self.dir / f"run-{index}.json").read_text())

    def runs(self) -> int:
        counter = self.dir / "count"
        return int(counter.read_text()) if counter.exists() else 0

    def probes(self) -> list[dict]:
        files = sorted(self.dir.glob("probe-*.json"), key=lambda path: int(path.stem.split("-")[1]))
        return [json.loads(path.read_text()) for path in files]

    def starts(self) -> list[dict]:
        """Every start of the CLI, in order: what it was given and what it could see. The probe's starts are the
        ones whose argv is `--version`."""
        files = sorted(self.dir.glob("env-*.json"), key=lambda path: int(path.stem.split("-")[1]))
        return [json.loads(path.read_text()) for path in files]

    def turns(self) -> list[dict]:
        return [start for start in self.starts() if start["argv"] != ["--version"]]

    def dumps(self) -> list[Path]:
        """The files that hold the key on purpose (they are this module's own record of the child's environment)."""
        return list(self.dir.glob("env-*.json"))


def wrapper_for(tmp_path: Path, state: Path, name: str = "cli-gw") -> Path:
    """A `claude` that writes down its environment, then is the fake CLI with `state` as its folder."""
    state.mkdir(exist_ok=True)
    dumper = tmp_path / f"{name}-dump.py"
    dumper.write_text(DUMPER.format(state=str(state), fake=str(TESTS / "fake_claude.py")))
    wrapper = tmp_path / name
    wrapper.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{dumper}" "$@"\n')
    wrapper.chmod(0o755)
    return wrapper


def data_with(entry: dict | None = None, *, extra: dict | None = None, **top) -> dict:
    """An engines file as data, with `claude-code` and one compatible entry `gw`; `entry` changes that entry (a key set to
    None is removed), `extra` adds entries, and `top` sets or replaces top-level sections."""
    gateway = copy.deepcopy(ENTRY)
    for name, value in (entry or {}).items():
        if value is None:
            gateway.pop(name, None)
        else:
            gateway[name] = value
    data = {
        "engines": {"claude-code": dict(CLAUDE_ENTRY), "gw": gateway, **(extra or {})},
        "chains": {"default": ["claude-code", "gw"]},
    }
    data.update(top)
    return data


def config_with(entry: dict | None = None, *, extra: dict | None = None, **top) -> EnginesConfig:
    return parse_engines(data_with(entry, extra=extra, **top))


def rig(tmp_path: Path, monkeypatch, entry: dict | None = None, *, key: str | None = KEY, **top) -> Rig:
    """A compatible engine named `gw` with the key in the environment (or none, with `key=None`)."""
    if key is None:
        monkeypatch.delenv(KEY_ENV, raising=False)
    else:
        monkeypatch.setenv(KEY_ENV, key)
    config = config_with(entry, **top)
    state = tmp_path / "fake-gw"
    wrapper = wrapper_for(tmp_path, state)
    engine = CompatibleEngine(config.engines["gw"], config, binary=str(wrapper))
    return Rig(engine, config, state, wrapper)


def decoys(monkeypatch) -> dict[str, str]:
    """Everything of a Claude sign-in or an API key that this service's own environment might hold, as values
    that must never reach the gateway's CLI. Returns them by name."""
    values = {
        "ANTHROPIC_API_KEY": "decoy-service-api-key-1",
        "ANTHROPIC_AUTH_TOKEN": "decoy-service-auth-token-2",
        "ANTHROPIC_BASE_URL": "http://decoy.invalid",
        "ANTHROPIC_MODEL": "decoy-model",
        "CLAUDE_CODE_OAUTH_TOKEN": "decoy-sk-ant-oat01-3",
        "CLAUDE_CONFIG_DIR": "/decoy/cli-config-never-opened",
        "HOME": "/decoy/home-never-opened",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    return values


def everything_on_disk(root: Path, skip: list[Path]) -> str:
    """The text of every file under `root` except `skip`: what a search for the key would read."""
    skipped = {path.resolve() for path in skip}
    parts: list[str] = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.resolve() not in skipped:
            parts.append(path.read_bytes().decode("utf-8", errors="replace"))
    return "\n".join(parts)



@dataclass
class Chain:
    """`claude-code` behind CLAUDE_BIN (the `fake_cli` fixture) and one or more gateways, each over a fake CLI of its
    own, in one router."""

    router: Router
    state: EngineState
    gateways: dict[str, Rig]

    @property
    def gw(self) -> Rig:
        return self.gateways["gw"]


def chain(tmp_path: Path, monkeypatch, entry: dict | None = None, *, key: str | None = KEY, extra_gateways: tuple[str, ...] = (),
          clock=None, now=NOW, **top) -> Chain:
    """The router over `claude-code` and the gateway `gw` (and `extra_gateways`, each a copy of the same entry), built the
    way the service builds it: `adapters_from_config` decides which entries may run, so an entry that is refused has no
    engine in the router, only its place in the chain."""
    if key is None:
        monkeypatch.delenv(KEY_ENV, raising=False)
    else:
        monkeypatch.setenv(KEY_ENV, key)
    ids = ("gw", *extra_gateways)
    extra = {name: {**ENTRY, **(entry or {})} for name in extra_gateways}
    top.setdefault("chains", {"default": ["claude-code", *ids]})
    config = config_with(entry, extra=extra, **top)
    rigs: dict[str, Rig] = {}
    for name in ids:
        state_dir = tmp_path / f"fake-{name}"
        wrapper = wrapper_for(tmp_path, state_dir, f"cli-{name}")
        rigs[name] = Rig(CompatibleEngine(config.engines[name], config, binary=str(wrapper)), config, state_dir, wrapper)
    built = compatible_engine.adapters_from_config(config)
    adapters = {"claude-code": ClaudeEngine(key="claude-code", label="Claude Code")}
    for name, adapter in built.items():
        adapters[name] = rigs[name].engine  # the same entry, started over its own fake CLI
        assert adapter.key == name
    engine_state = EngineState(None, now=now)
    router = Router(engine_state, adapters, config, **({"clock": clock} if clock is not None else {}))
    return Chain(router, engine_state, rigs)
