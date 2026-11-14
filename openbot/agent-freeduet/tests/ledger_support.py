"""Shared pieces of the spend ledger tests (docs/ENGINES_PLAN.md slice 12, first part).

Nothing here spends anything, and nothing here is a real engine, gateway, key or price. A paid gateway cannot run in this
release (`engines.PAID_GATEWAYS_OPEN` is False and no kind of engine reports a verified cost), so these tests open the gate
the way the maintainer would, in the test only: they patch the switch and the table of verified facts, and put the paid
engine behind a fake CLI that states a cost after each turn the way an engine that reported one would. The cost numbers are
invented.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import MappingProxyType

from freeduet import engines
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_adapter import Usage
from freeduet.engine_router import Router
from freeduet.engine_state import EngineState
from freeduet.engines import COMPATIBLE_KIND, parse_engines
from freeduet.ledger import Ledger
from fake_engines import NOW, SPECS, Fake

TESTS = Path(__file__).parent
KEY_ENV = "FREEDUET_TEST_PAID_KEY"
START = datetime(2026, 11, 14, 10, 0, tzinfo=UTC)  # a day well inside its month, so a rollover is a test of its own
LIMIT = {"replay": "usage_limit.jsonl"}


class Clock:
    """The ledger's clock, UTC, moved by the test."""

    def __init__(self, at: datetime = START):
        self.at = at

    def __call__(self) -> datetime:
        return self.at

    def advance(self, **delta) -> None:
        self.at += timedelta(**delta)


def paid_entry(**changes) -> dict:
    entry = {
        "kind": COMPATIBLE_KIND,
        "base_url": "http://127.0.0.1:18080",
        "credential_secret_ref": f"env:{KEY_ENV}",
        "billing": "metered",
        "model": "paid-test-model",
        "enabled": True,
    }
    entry.update(changes)
    return entry


def reports(*costs: float | None, currency: str = "EUR", given: int = 1000, wrote: int = 200) -> list[Usage]:
    """One report per turn, as an engine that states a cost would make it: tokens, and the cost (None: it stated none)."""
    return [Usage(input_tokens=given, output_tokens=wrote, cost=cost, currency=currency if cost is not None else None) for cost in costs]


class CostedEngine(ClaudeEngine):
    """The Claude engine over a fake CLI that, when each turn is over, reports what the next entry of `reports` says. It is
    what a metered engine is to the ledger: an engine whose own report carries a cost."""

    def __init__(self, *, key: str, label: str, binary: str, reports: list[Usage | None], barrier=None):
        super().__init__(key=key, label=label, binary=binary)
        self.reports = list(reports)
        self.turns = 0
        self.barrier = barrier  # a threading.Barrier: no turn goes on until all of them are running (two turns in flight)

    async def run_turn(self, ctx, sink, gate):
        try:
            if self.barrier is not None:
                await asyncio.get_running_loop().run_in_executor(None, self.barrier.wait, 30)
            return await super().run_turn(ctx, sink, gate)
        finally:
            ctx.diagnostics.health.usage = self.reports[self.turns] if self.turns < len(self.reports) else None
            self.turns += 1


@dataclass
class Paid:
    router: Router
    state: EngineState
    ledger: Ledger
    clock: Clock
    path: Path
    claude: Fake
    fakes: dict[str, Fake] = field(default_factory=dict)
    engines: dict[str, CostedEngine] = field(default_factory=dict)

    def __getitem__(self, key: str) -> Fake:
        return self.fakes[key]

    def row(self, key: str = "paid") -> dict:
        return next(row for row in self.state.snapshot().as_json()["engines"] if row["id"] == key)

    @property
    def totals(self) -> dict:
        return self.row()["spend"]


def open_the_gate(monkeypatch, currency: str = "EUR", *, switch: bool = True, reporting: bool = True) -> None:
    """What the maintainer's decision and a verified engine would be, for one test: the switch, and the table of kinds that
    report what a turn costs (here, in `currency`)."""
    monkeypatch.setattr(engines, "PAID_GATEWAYS_OPEN", switch)
    monkeypatch.setattr(engines, "COST_REPORTING_KINDS", MappingProxyType({COMPATIBLE_KIND: currency} if reporting else {}))


def paid_team(
    tmp_path,
    fake_cli,
    monkeypatch,
    *,
    costs: dict[str, list[Usage | None]] | None = None,
    ids: tuple[str, ...] = ("paid",),
    daily: float = 1,
    monthly: float = 10,
    currency: str = "EUR",
    enforce: str = "ledger",
    switching: dict | None = None,
    gate: bool = True,
    clock: Clock | None = None,
    path: Path | None = None,
    metered: dict | None = None,
    barrier=None,
) -> Paid:
    """A router over `claude-code` (behind CLAUDE_BIN) and the paid engines `ids`, each over a fake CLI of its own and each
    reporting `costs[id]`, one report per turn. The ledger is a file in `tmp_path` with a clock the test moves."""
    if gate:
        open_the_gate(monkeypatch, currency)
    clock = clock or Clock()
    path = path or tmp_path / "ledger" / "engine-ledger.json"
    adapters: dict[str, ClaudeEngine] = {"claude-code": ClaudeEngine(key="claude-code", label="Claude Code")}
    fakes: dict[str, Fake] = {}
    costed: dict[str, CostedEngine] = {}
    for key in ids:
        state_dir = tmp_path / f"fake-{key}"
        state_dir.mkdir()
        wrapper = tmp_path / f"cli-{key}"
        wrapper.write_text(f'#!/bin/sh\nFAKE_CLAUDE_DIR="{state_dir}" exec "{sys.executable}" "{TESTS / "fake_claude.py"}" "$@"\n')
        wrapper.chmod(0o755)
        fakes[key] = Fake(state_dir)
        costed[key] = adapters[key] = CostedEngine(
            key=key, label=key, binary=str(wrapper), reports=(costs or {}).get(key, []), barrier=barrier
        )
    data = {
        "engines": {"claude-code": dict(SPECS["claude-code"]), **{key: paid_entry() for key in ids}},
        "metered": {"enabled": True, "currency": currency, "daily_cap": daily, "monthly_cap": monthly, "enforce": enforce, **(metered or {})},
        "chains": {"default": ["claude-code", *ids]},
    }
    if switching is not None:
        data["switching"] = switching
    config = parse_engines(data)
    state = EngineState(None, now=NOW)
    ledger = Ledger(path, now=clock)
    router = Router(state, adapters, config, ledger=ledger)
    return Paid(router, state, ledger, clock, path, Fake(fake_cli.dir), fakes, costed)
