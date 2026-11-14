"""The engine seam itself: the segment drives any EngineAdapter, not only Claude Code."""

import asyncio

from freeduet import agui, claude_cli, segment
from freeduet.claude_engine import ClaudeEngine
from freeduet.engine_adapter import EngineAdapter, Finished, Outcome
from freeduet.members import resolve_member
from freeduet.stream_json import MessageStart, TextDelta
from helpers import run_body, standing, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Hello"}]


class Stub(EngineAdapter):
    key, label, kind, capabilities = "stub", "Stub", "cli", frozenset()

    def __init__(self, act):
        self.act, self.seen = act, []

    def child_env(self, source=None):
        return {"ONLY": "this"}

    async def run_turn(self, ctx, sink, gate):
        self.seen.append((ctx, gate))
        return await self.act(ctx, sink, gate)


def play(engine):
    async def go():
        run = agui.parse_run_input(run_body(ASK))
        member = resolve_member(run.bot_id, run.messages)
        return [event async for event in segment.run_segment(run, member, engine=engine)]

    return asyncio.run(go())


def test_the_segment_runs_a_turn_on_any_engine(fake_cli):
    async def act(ctx, sink, gate):
        sink.started()
        await sink.put(MessageStart("m1"))
        await sink.put(TextDelta("m1", "From the stub."))
        await sink.put(Finished("From the stub.", lambda: None))
        await sink.end()
        return Outcome()

    engine = Stub(act)
    events = play(engine)
    assert types(events) == ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]
    ctx, gate = engine.seen[0]
    assert "<user>\nHello\n</user>" in ctx.prompt and ctx.system and ctx.work.name == "work"
    assert gate.port > 0 and gate.secret
    assert gate.secret not in repr(gate)


def test_an_engine_that_cannot_start_ends_the_turn_with_its_own_error(fake_cli):
    async def act(ctx, sink, gate):
        return Outcome(agui.run_error("Stub is not installed."))

    assert play(Stub(act))[-1] == {"type": "RUN_ERROR", "message": "Stub is not installed."}


def test_a_stream_that_ends_without_a_result_asks_the_engine_why(fake_cli):
    async def act(ctx, sink, gate):
        sink.started()
        await sink.end()
        return Outcome(agui.run_error("Stub stopped."))

    assert play(Stub(act))[-1] == {"type": "RUN_ERROR", "message": "Stub stopped."}


def test_claude_code_is_the_engine_by_default_and_builds_its_own_environment():
    engine = ClaudeEngine()
    assert (engine.key, engine.kind, engine.label) == ("claude-code", "cli", claude_cli.LABEL)
    env = engine.child_env({"PATH": "/bin", "ANTHROPIC_API_KEY": "k", "ANTHROPIC_BASE_URL": "u", "CLAUDE_CODE_OAUTH_TOKEN": "t"})
    assert env == {"PATH": "/bin", **claude_cli.FIXED_ENV}
