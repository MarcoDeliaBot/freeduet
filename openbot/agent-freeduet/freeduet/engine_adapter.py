"""The engine seam (docs/ENGINES_PLAN.md slice 1, docs/ARCHITECTURE.md 3.1).

An engine is whatever turns one rendered conversation into a stream of normalized items and an
outcome. segment.py owns everything that is not the engine: the transcript, the tool bridge, the
state machine that decides when a segment ends, the report guard. An engine owns its process, its
stream, its failures and the environment it is started with.

Only `run_turn` and `child_env` are in the contract so far. The plan's `probe()` and `limit` belong to
slice 2 and are not here.
"""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class Gate:
    """Where the engine's tool source reaches the tool bridge (the approval gate stays OpenBot's)."""

    port: int
    secret: str = field(repr=False)


@dataclass
class Diagnostics:
    """What the engine's log lines say about the run, filled in by the segment."""

    thread_id: str
    run_id: str
    handoff: Callable[[], bool]  # asked only when a log line needs it
    offered: frozenset[str]
    handed_over: list[str] = field(default_factory=list)  # refused calls the segment handed to OpenBot
    # What the engine wants logged once the whole segment is over (not while its turn is still going).
    at_close: list[Callable[[], None]] = field(default_factory=list)


@dataclass(frozen=True)
class TurnContext:
    system: str  # the member's system text
    prompt: str  # the transcript, for stdin
    directory: Path  # the segment's private folder
    work: Path  # an empty working folder inside it
    diagnostics: Diagnostics


@dataclass(frozen=True)
class Finished:
    """The engine's final result was read. `failure` is asked when the segment acts on it."""

    text: str | None
    failure: Callable[[], dict | None]


@dataclass(frozen=True)
class Outcome:
    """How the turn ended when no result line did: the RUN_ERROR to send, or None when the engine
    could not even start and says so in `error`."""

    error: dict | None = None


class Sink(Protocol):
    """Where an engine puts what it reads, in order: the parser items of stream_json.py (MessageStart,
    TextDelta, ToolUse, Refused), then Finished, then `end()` once its output is over."""

    async def put(self, item) -> None: ...

    async def end(self) -> None: ...

    def started(self) -> None: ...  # the engine is running; called once, before any put


class EngineAdapter(ABC):
    key: str
    label: str
    kind: str  # cli, app-server, acp, api
    capabilities: frozenset[str]

    @abstractmethod
    def child_env(self, source: dict[str, str] | None = None) -> dict[str, str]:
        """The environment the engine's process is started with, built from `source` (the service's
        own environment by default) and the engine's own entry, never copied wholesale."""

    @abstractmethod
    async def run_turn(self, ctx: TurnContext, sink: Sink, gate: Gate) -> Outcome:
        """Run one segment's turn. Stops the engine's process and tasks before it returns or when it
        is cancelled."""
