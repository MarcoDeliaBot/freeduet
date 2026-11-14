"""The engine seam (docs/ENGINES_PLAN.md slice 1, docs/ARCHITECTURE.md 3.1).

An engine is whatever turns one rendered conversation into a stream of normalized items and an
outcome. segment.py owns everything that is not the engine: the transcript, the tool bridge, the
state machine that decides when a segment ends, the report guard. An engine owns its process, its
stream, its failures and the environment it is started with.

The contract is `run_turn`, `child_env` and `probe` (slice 2). The plan's `limit` ("usage limit, rate limit
or credits exhausted, with reset time when the engine reports one", ARCHITECTURE 3.1) is not a member of
the adapter: a limit is a fact about one turn, so an engine states it through `Diagnostics.health`, as a
`Failure` of failure_classifier (its kind and the moment it said it would be back).
"""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from .failure_classifier import Failure

# What a probe says when it could not finish. Fixed phrases, never what the engine printed: an engine's
# own words can hold an account (an email, an organisation), and a probe never carries those.
NOT_INSTALLED = "not installed"
TIMED_OUT = "timed out"
UNREADABLE = "unreadable answer"
COULD_NOT_RUN = "could not run"


@dataclass(frozen=True)
class Gate:
    """Where the engine's tool source reaches the tool bridge (the approval gate stays OpenBot's)."""

    port: int
    secret: str = field(repr=False)


@dataclass
class Health:
    """How the engine says one turn went, for the engine breaker (engine_state.py). The engine fills it in as
    it reads its own output; it is read once, when the segment is over. Nothing here is text the engine sent.

    `failure` is what the engine reported when the turn did not go through: its kind and the reset time it
    stated. `answered` is that the engine produced something (text or a tool call), which is the plan's "the
    engine accepted the turn". A failure outweighs an answer: a limit that arrives after the first words is
    still a limit. Neither set means the engine said nothing about its health (it could not start, or the
    segment stopped it before it spoke).
    """

    answered: bool = False
    failure: Failure | None = None


@dataclass(frozen=True)
class ProbeResult:
    """What a probe found. None is "could not tell", never "no": a probe that timed out says nothing about
    the sign-in. Never an account: whether the engine is signed in, not which account it is.

    `problem` is one of NOT_INSTALLED, TIMED_OUT, UNREADABLE, COULD_NOT_RUN when the probe could not finish.
    """

    installed: bool | None = None
    version: str | None = None
    signed_in: bool | None = None
    problem: str | None = None


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
    # How the engine says the turn went. Read after the segment, by the wrapper that records it.
    health: Health = field(default_factory=Health)


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
    async def probe(self) -> ProbeResult:
        """Whether the engine is installed, which version, and whether it is signed in: bounded to a few
        seconds, never a model call (it must not spend the person's subscription), never an account in
        the answer or in a log, and started like any turn (the engine's own environment, no secret of this
        service, a folder of its own, stopped at the deadline). Never raises."""

    @abstractmethod
    async def run_turn(self, ctx: TurnContext, sink: Sink, gate: Gate) -> Outcome:
        """Run one segment's turn. Stops the engine's process and tasks before it returns or when it
        is cancelled. Says how it went in `ctx.diagnostics.health`."""
