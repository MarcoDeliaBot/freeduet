"""Claude Code behind the engine seam: the process block that used to sit in segment.py, moved as it
was (start, stdin, stdout and stderr readers, the failure verdicts, the teardown, the two log lines).
claude_cli.py still holds the command, the environment and the failure text."""

import asyncio
import logging
from contextlib import suppress

from . import agui, claude_cli
from .engine_adapter import EngineAdapter, Finished, Gate, Health, Outcome, ProbeResult, Sink, TurnContext
from .stream_json import MCP_PREFIX, Final, StreamParser

# The log lines keep the segment's logger: they are the ones its operators already grep for.
log = logging.getLogger("freeduet.segment")

MAX_STDERR = 64 * 1024
PIPE_DRAIN_SECONDS = 2.0


def mcp_state(parser: StreamParser, offered) -> str:
    """What the CLI's init event said about the freeduet server, for the log line of a refused call."""
    if not parser.init_seen:
        return "no init event read"
    status = ", ".join(f"{name}={state}" for name, state in parser.mcp_servers.items()) or "no MCP server listed"
    listed = {tool.removeprefix(MCP_PREFIX) for tool in parser.init_tools}
    missing = sorted(offered - listed)
    if missing:
        return f"{status}; init did not list {', '.join(missing)}"
    return f"{status}; init listed all {len(offered)} offered tools"


def note_result(health: Health, parser: StreamParser) -> None:
    """The CLI's result line was read: say how the turn went, from what the CLI itself said. Only notes;
    whatever goes wrong here is swallowed, because the turn must run exactly as it did before anyone recorded it."""
    try:
        failure = claude_cli.turn_failure(parser)
    except Exception:  # noqa: BLE001
        return
    health.failure = failure
    health.answered = health.answered or failure is None


def note_stream_end(health: Health, parser: StreamParser, said: str, exit_code: int | None) -> None:
    """The output ended with no result line: the verdict is what the CLI said on stderr and how it exited."""
    try:
        if parser.final is not None:
            return  # the result line already said how it went
        health.failure = claude_cli.turn_failure(parser, said, exit_code)
    except Exception:  # noqa: BLE001
        return


class ClaudeEngine(EngineAdapter):
    key = "claude-code"
    label = claude_cli.LABEL
    kind = "cli"
    capabilities = frozenset({"tools", "approvals", "mcp"})

    def __init__(self, key: str | None = None, label: str | None = None, binary: str | None = None):
        """No argument is Claude Code, as ever. A key, label or binary of its own is how the tests make a
        second engine out of the same adapter (tests/fake_engines.py); nothing in the service passes one."""
        if key is not None:
            self.key = key
        if label is not None:
            self.label = label
        self._binary = binary

    def child_env(self, source: dict[str, str] | None = None) -> dict[str, str]:
        return claude_cli.child_env(source)

    async def probe(self) -> ProbeResult:
        return await claude_cli.probe()

    async def run_turn(self, ctx: TurnContext, sink: Sink, gate: Gate) -> Outcome:
        parser = StreamParser()
        health = ctx.diagnostics.health
        stderr = bytearray()
        tasks: set[asyncio.Task] = set()
        readers: tuple[asyncio.Task, ...] = ()
        process = None

        def log_the_end() -> None:
            if stderr and parser.final is None:
                log.info("claude stderr: %s", bytes(stderr[-2000:]).decode("utf-8", errors="replace"))
            if parser.unavailable:
                # The call went nowhere: the CLI answered it itself, so no stored transcript shows it.
                about = ctx.diagnostics
                log.warning(
                    "claude answered \"No such tool available\" for %s (called as %s; handed to OpenBot: %s): "
                    "this %s run offered only %s; mcp: %s (thread %s, run %s)",
                    ", ".join(parser.unavailable),
                    ", ".join(parser.unavailable_as),
                    ", ".join(about.handed_over) or "nothing",
                    "hand-off" if about.handoff() else "person's",
                    ", ".join(sorted(about.offered)) or "no tool",
                    mcp_state(parser, about.offered),
                    about.thread_id,
                    about.run_id,
                )

        ctx.diagnostics.at_close.append(log_the_end)
        try:
            config = claude_cli.write_mcp_config(ctx.directory, gate.port, gate.secret)
            command = claude_cli.build_command(self._binary or claude_cli.claude_bin(), config, ctx.system, ctx.directory)
            try:
                process = await claude_cli.start(command, ctx.work, self.child_env())
            except OSError:
                return Outcome(agui.run_error(f"{claude_cli.LABEL} is not installed in this service."))
            sink.started()

            async def feed_stdin():
                with suppress(BrokenPipeError, ConnectionError):
                    process.stdin.write(ctx.prompt.encode("utf-8"))
                    await process.stdin.drain()
                    process.stdin.close()

            async def read_stdout():
                with suppress(ValueError, ConnectionError):  # ValueError: a line past MAX_LINE
                    while line := await process.stdout.readline():
                        for item in parser.feed(line):
                            if isinstance(item, Final):
                                note_result(health, parser)
                                item = Finished(item.text, lambda: claude_cli.failure_event(parser))
                            else:
                                health.answered = True  # a message started, text came, or a tool was called
                            await sink.put(item)
                await sink.end()

            async def read_stderr():
                while chunk := await process.stderr.read(65536):
                    stderr.extend(chunk)
                    del stderr[:-MAX_STDERR]

            stderr_task = asyncio.create_task(read_stderr())
            readers = (asyncio.create_task(read_stdout()), stderr_task)
            tasks.update(readers)
            tasks.add(asyncio.create_task(feed_stdin()))

            # The stream ends without a result line: wait for the exit, then say why.
            await asyncio.shield(readers[0])
            with suppress(TimeoutError):
                await asyncio.wait_for(process.wait(), 5)
            with suppress(TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(asyncio.shield(stderr_task), 2)
            said = bytes(stderr).decode("utf-8", errors="replace")
            note_stream_end(health, parser, said, process.returncode)
            return Outcome(claude_cli.failure_event(parser, said, process.returncode) or agui.run_error(
                f"{claude_cli.LABEL} ended without an answer."
            ))
        finally:
            await claude_cli.stop(process)
            # The CLI's process group is gone: let its pipes reach end of file, so the subprocess
            # transport closes with the segment rather than some time after it.
            pending = [task for task in readers if not task.done()]
            if pending:
                await asyncio.wait(pending, timeout=PIPE_DRAIN_SECONDS)
            for task in list(tasks):
                task.cancel()
            for task in list(tasks):
                with suppress(asyncio.CancelledError, Exception):
                    await task
