"""Recording is neutral: a member's turn behaves identically whatever the engine breaker says (ENGINES_PLAN slice 2).

Slice 2 wires the breaker for RECORDING ONLY. The breaker's verdict is not used to skip, move or delay anything
(that is slice 3). The proof is the goldens of test_engine_goldens.py, recorded before the engine seam existed
and untouched since: here the same scenarios are played with the breaker forced into every state, and each is
compared, byte for byte, with the SAME golden file (the stream, the launch, the environment, what the CLI saw,
the callbacks, the team log, the checkpoints and every `freeduet*` log line).

Forced open is the case that matters: with the engine open for ten days the turn still starts the CLI, streams
the answer and ends as it ever did.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from freeduet import app as app_module
from freeduet import engine_state
from freeduet.app import app
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_adapter import Health
from freeduet.engine_breaker import HALF_OPEN, OPEN, READY, SIGNED_OUT, FileStore
from freeduet.engine_state import EngineState
from freeduet.failure_classifier import AUTH, RATE_LIMIT, TRANSIENT, USAGE_LIMIT, Failure
from golden_support import GOLDENS, LogTap, compare, pin_environment
from helpers import run_body
from test_engine_goldens import ASK, SCENARIOS, Rig

KEY = "claude-code"
NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)

# One scenario of each kind of end: an answer, a pause on a tool call, a hand-off through the callback, a
# recorded limit and a recorded sign-in failure, the same two read from stderr, a CLI that dies, a CLI that
# dies after some text, a missing CLI, a segment that times out, three segments in a thread, a report guard.
PLAYED = [
    "text_turn",
    "tool_call_then_resume",
    "deployment_tool_through_the_callback",
    "usage_limit_recorded",
    "not_signed_in_recorded",
    "usage_limit_on_stderr_without_a_result",
    "not_signed_in_on_stderr",
    "cli_dies_without_a_result",
    "partial_text_then_exit",
    "missing_cli",
    "segment_timeout",
    "three_segments_one_thread",
    "report_guard_adds_the_report",
]
# The first five of them are the core: an answer, a pause on a tool call, the two recorded failures and a CLI that
# dies. Forced open, every scenario is played; in the other states, the core.
CORE = PLAYED[:2] + ["usage_limit_recorded", "not_signed_in_recorded", "cli_dies_without_a_result"]
OTHER_STATES = ["signed_out", "half_open", "half_open_probe_out", "degraded"]
MATRIX = [(name, "open") for name in PLAYED] + [(name, how) for how in OTHER_STATES for name in CORE]


class Clock:
    def __init__(self, at):
        self.at = at

    def __call__(self):
        return self.at


@pytest.fixture
def rig(client, fake_cli, monkeypatch, tmp_path):
    pin_environment(monkeypatch)
    made = Rig(client, fake_cli, monkeypatch, tmp_path)
    made.launches.install(monkeypatch)
    yield made
    made.server.shutdown()


def force(how: str) -> tuple[EngineState, Clock]:
    """The service's state, with the breaker put into one state by what an engine would have said."""
    clock = Clock(NOW)
    state = EngineState(FileStore(engine_state.state_file()), now=clock)
    state.register(ClaudeEngine())

    def say(failure):
        state.finish(KEY, state.begin(KEY), Health(failure=failure))

    if how == "open":
        say(Failure(USAGE_LIMIT, NOW + timedelta(days=10)))
    elif how == "signed_out":
        say(Failure(AUTH))
    elif how == "degraded":
        say(Failure(TRANSIENT))
    else:  # half_open: the open time has passed
        say(Failure(RATE_LIMIT))
        clock.at = NOW + timedelta(minutes=2)
        if how == "half_open_probe_out":
            assert state.begin(KEY).probe  # one probe turn is out and never reported: the others get no ticket
    app.state.engine_state = state
    return state, clock


def shown(state: EngineState) -> str:
    return state.snapshot().engines[0].state


def play(name, rig):
    with LogTap() as tap:
        SCENARIOS[name](rig)
    snapshot = rig.finish()
    snapshot["logs"] = rig.norm.data(tap.records)
    return snapshot


# ── The goldens, with the breaker in every state ────────────────────────────────────────────────


@pytest.mark.parametrize("name, how", MATRIX, ids=[f"{how}-{name}" for name, how in MATRIX])
def test_the_turn_is_identical_to_its_golden_whatever_state_the_breaker_is_in(name, how, rig):
    force(how)
    compare(name, play(name, rig))


def test_a_turn_on_an_engine_that_is_open_for_ten_days_still_starts_the_cli_and_answers(rig):
    state, _ = force("open")
    assert state.begin(KEY) is None  # the breaker says no turn may run
    rig.plan([{"text": "Hello there."}])
    events = rig.post(run_body(ASK))
    assert [event["type"] for event in events][-1] == "RUN_FINISHED"
    assert rig.launches.calls and rig.launches.calls[0]["args"][1] == "-p"  # the member's turn was launched
    assert "".join(event.get("delta", "") for event in events) == "Hello there."
    assert shown(state) == OPEN  # an answer does not lift a limit the engine stated


def test_a_signed_out_engine_that_answers_is_recorded_as_signed_in_and_the_turn_is_the_same(rig):
    state, _ = force("signed_out")
    compare("text_turn", play("text_turn", rig))
    assert shown(state) == READY


def test_the_half_open_probe_is_the_turn_that_runs_and_its_answer_closes_the_breaker(rig):
    state, _ = force("half_open")
    compare("text_turn", play("text_turn", rig))
    assert shown(state) == READY


def test_a_limit_hit_while_the_breaker_is_half_open_opens_it_again_and_the_turn_is_the_same(rig):
    state, clock = force("half_open")
    compare("usage_limit_recorded", play("usage_limit_recorded", rig))
    assert shown(state) == OPEN


def test_while_the_probe_is_out_the_turn_runs_unrecorded_and_the_state_stays(rig):
    state, _ = force("half_open_probe_out")
    compare("usage_limit_recorded", play("usage_limit_recorded", rig))
    assert shown(state) == HALF_OPEN  # no ticket, nothing recorded


def test_a_sign_in_failure_on_a_signed_out_engine_leaves_it_signed_out_and_the_turn_the_same(rig):
    state, _ = force("signed_out")
    compare("not_signed_in_recorded", play("not_signed_in_recorded", rig))
    assert shown(state) == SIGNED_OUT


# ── A recorder that fails changes nothing either ────────────────────────────────────────────────


def stream_and_edges(snapshot: dict) -> dict:
    return {key: value for key, value in snapshot.items() if key != "logs"}


def golden(name: str) -> dict:
    return json.loads((GOLDENS / f"{name}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name, warnings", [("text_turn", 2), ("usage_limit_recorded", 1)])
def test_a_recorder_that_raises_changes_no_turn_and_is_a_warning_where_it_was_asked(name, warnings, rig, monkeypatch):
    def explode(key):
        raise RuntimeError("the breaker is on fire")

    monkeypatch.setattr(app.state.engine_state._registry, "get", explode)
    snapshot = play(name, rig)
    expected = golden(name)
    assert stream_and_edges(snapshot) == stream_and_edges(expected)
    own = [record for record in snapshot["logs"] if record[0] == "freeduet.engine_state"]
    # At the start always; at the end only when the turn answered with no ticket (it then asks the breaker).
    assert len(own) == warnings and all(record[1] == "WARNING" for record in own)
    assert [record for record in snapshot["logs"] if record[0] != "freeduet.engine_state"] == expected["logs"]


def test_a_state_that_cannot_be_had_runs_the_turn_on_the_plain_engine(rig, monkeypatch):
    def explode():
        raise RuntimeError("no state today")

    monkeypatch.setattr(app_module, "_engine_state", explode)
    snapshot = play("text_turn", rig)
    expected = golden("text_turn")
    assert stream_and_edges(snapshot) == stream_and_edges(expected)
    extra = [record for record in snapshot["logs"] if record not in expected["logs"]]
    assert [record[:2] for record in extra] == [["freeduet", "WARNING"]]


# ── No run path asks the breaker ────────────────────────────────────────────────────────────────


def test_no_run_path_knows_the_state_or_the_breaker_only_the_app_wires_it():
    package = Path(engine_state.__file__).parent
    for name in ("segment.py", "claude_engine.py", "claude_cli.py", "transcript.py", "report_guard.py", "members.py", "bridge/ipc.py"):
        text = (package / name).read_text(encoding="utf-8")
        assert "engine_state" not in text and "engine_breaker" not in text and "acquire" not in text, name
    # Only the app makes and serves the state; the rest that names it is a docstring (the adapter, the breaker,
    # the classifier say what they are for).
    imports = {file.name for file in package.glob("*.py") if "import engine_state" in file.read_text(encoding="utf-8")
               or "from . import" in file.read_text(encoding="utf-8") and "engine_state," in file.read_text(encoding="utf-8")}
    assert imports == {"app.py"}
