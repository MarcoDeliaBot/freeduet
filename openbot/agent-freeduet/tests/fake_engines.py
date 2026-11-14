"""A team of fake engines for the chain tests (ENGINES_PLAN slice 3).

`tests/fake_claude.py` is the stand-in for one `claude` CLI; here each engine of a chain is the same adapter
(`ClaudeEngine`) with its own key, its own label and its own fake CLI, with plans of its own. The first engine
is the one the `fake_cli` fixture already put behind CLAUDE_BIN, so its plans are `fake_cli.plan(...)`. Nothing
here is a real second engine: no gateway, no network, no login.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from dataclasses import dataclass, field
from pathlib import Path

from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_router import Router
from freeduet.engine_state import EngineState
from freeduet.engines import parse_engines

TESTS = Path(__file__).parent
RESET = datetime(2100, 1, 1, tzinfo=UTC)  # the `resetsAt` of usage_limit.jsonl


def NOW():  # the breaker's clock: five hours before that reset, so a stated reset is exact
    return datetime(2099, 12, 31, 19, 0, tzinfo=UTC)


SPECS = {
    "claude-code": {"kind": "cli", "command": "claude", "billing": "subscription", "tier": "A", "enabled": True},
    "codex": {"kind": "app-server", "command": "codex", "billing": "subscription", "tier": "A", "enabled": True},
    "gemini-cli": {"kind": "acp", "command": "gemini", "billing": "subscription", "tier": "A", "enabled": True},
    "local": {"kind": "openai-compatible", "base_url": "http://127.0.0.1:11434/v1", "billing": "free",
              "model": "llama-test", "tier": "C", "enabled": True},
}
LABELS = {"claude-code": "Claude Code", "codex": "Codex", "gemini-cli": "Gemini", "local": "Local model"}


@dataclass
class Fake:
    """One fake engine's plans and records."""

    dir: Path

    def plan(self, *plans) -> None:
        (self.dir / "plans.json").write_text(json.dumps(list(plans)))

    def run(self, index: int = 0) -> dict:
        return json.loads((self.dir / f"run-{index}.json").read_text())

    def runs(self) -> int:
        counter = self.dir / "count"
        return int(counter.read_text()) if counter.exists() else 0


@dataclass
class Team:
    router: Router
    state: EngineState
    fakes: dict[str, Fake] = field(default_factory=dict)

    def __getitem__(self, key: str) -> Fake:
        return self.fakes[key]


def build(tmp_path, fake_cli, keys=("claude-code", "codex"), *, switching=None, quality_floor=None,
          chains=None, mutate=None, clock=None) -> Team:
    """A router over `keys`, in that order. The first is behind CLAUDE_BIN (`fake_cli`); the others each get a
    wrapper and a plans folder of their own."""
    fakes: dict[str, Fake] = {}
    adapters = {}
    for index, key in enumerate(keys):
        if index == 0:
            fakes[key] = Fake(fake_cli.dir)
            adapters[key] = ClaudeEngine(key=key, label=LABELS[key])
            continue
        state_dir = tmp_path / f"fake-{key}"
        state_dir.mkdir()
        wrapper = tmp_path / f"cli-{key}"
        wrapper.write_text(
            f'#!/bin/sh\nFAKE_CLAUDE_DIR="{state_dir}" exec "{sys.executable}" "{TESTS / "fake_claude.py"}" "$@"\n'
        )
        wrapper.chmod(0o755)
        fakes[key] = Fake(state_dir)
        adapters[key] = ClaudeEngine(key=key, label=LABELS[key], binary=str(wrapper))
    data = {
        "engines": {key: dict(SPECS[key]) for key in keys},
        "chains": chains or {"default": list(keys)},
    }
    if switching is not None:
        data["switching"] = switching
    if quality_floor is not None:
        data["quality_floor"] = quality_floor
    if mutate is not None:
        mutate(data)
    config = parse_engines(data)
    state = EngineState(None, now=clock or NOW)
    return Team(Router(state, adapters, config), state, fakes)
