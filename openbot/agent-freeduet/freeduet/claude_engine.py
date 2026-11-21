"""Claude Code behind the engine seam: the process block that used to sit in segment.py, moved as it
was (start, stdin, stdout and stderr readers, the failure verdicts, the teardown, the two log lines).
claude_cli.py still holds the command, the environment and the failure text."""

import asyncio
import logging
import os
from contextlib import suppress

from . import agui, claude_cli
from .claude_status import MISSING_SENTENCE
from .failure_classifier import REJECTED, Failure
from .engine_adapter import EngineAdapter, Finished, Gate, Health, Outcome, ProbeResult, Sink, TurnContext, Usage
from .stream_json import MCP_PREFIX, Final, StreamParser

# The log lines keep the segment's logger: they are the ones its operators already grep for.
log = logging.getLogger("freeduet.segment")

MAX_STDERR = 64 * 1024
PIPE_DRAIN_SECONDS = 2.0


def pictures_on() -> bool:
    """D72's switch: `FREEDUET_PICTURES=off` sends no picture to Claude Code, whatever the turn holds. Set it
    if a live turn with a picture fails and the cause is not yet found: the note of D68 is then used again."""
    return os.environ.get("FREEDUET_PICTURES", "").strip().lower() not in {"off", "0", "false", "no"}


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


def note_result(health: Health, parser: StreamParser, pictures=()) -> None:
    """The CLI's result line was read: say how the turn went, from what the CLI itself said. Only notes;
    whatever goes wrong here is swallowed, because the turn must run exactly as it did before anyone recorded it."""
    try:
        failure = claude_cli.turn_failure(parser)
    except Exception:  # noqa: BLE001
        return
    health.failure = _not_the_engines(failure, pictures)
    health.answered = health.answered or failure is None


def _not_the_engines(failure, pictures):
    """D72. A turn that carried pictures and failed says nothing certain about the engine: the cause may be
    the picture or the untested flag combination, so it is reported as a refused request (which moves no
    state, whatever the classifier made of the words). The chat still gets the CLI's own error."""
    return Failure(REJECTED) if pictures and failure is not None else failure


def note_usage(health: Health, parser: StreamParser) -> None:
    """The token counts the CLI printed, as far as it did, go to ``health.usage`` for the token counter (usage_counter.py):
    numbers only, never a cost. Called however the turn ends. Swallows whatever goes wrong, like ``note_result``."""
    try:
        used = parser.usage()
        if used is not None:
            cached = parser.cache_usage() or (None, None)
            health.usage = Usage(input_tokens=used[0], output_tokens=used[1], cache_read_tokens=cached[0], cache_write_tokens=cached[1])
    except Exception:  # noqa: BLE001
        return


def note_stream_end(health: Health, parser: StreamParser, said: str, exit_code: int | None, pictures=()) -> None:
    """The output ended with no result line: the verdict is what the CLI said on stderr and how it exited."""
    try:
        if parser.final is not None:
            return  # the result line already said how it went
        health.failure = _not_the_engines(claude_cli.turn_failure(parser, said, exit_code), pictures)
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

        pictures = ctx.pictures if ctx.picture_prompt is not None and pictures_on() else ()

        def log_the_end() -> None:
            if stderr and parser.final is None:
                if pictures:
                    log.info("claude wrote %d bytes on stderr (not logged: the turn carried pictures)", len(stderr))
                else:
                    log.info("claude stderr: %s", bytes(stderr[-2000:]).decode("utf-8", errors="replace"))
            if pictures and not health.answered:
                # The one place a failure of the stream-json input with pictures shows in the logs: counts only.
                log.warning(
                    "claude gave no answer to a turn with %d picture(s) sent as stream-json input "
                    "(thread %s, run %s); FREEDUET_PICTURES=off turns the pictures off",
                    len(pictures), ctx.diagnostics.thread_id, ctx.diagnostics.run_id,
                )
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
            command = claude_cli.build_command(
                self._binary or claude_cli.claude_bin(), config, ctx.system, ctx.directory, bool(pictures)
            )
            try:
                process = await claude_cli.start(command, ctx.work, self.child_env())
            except OSError:
                return Outcome(agui.run_error(MISSING_SENTENCE))
            sink.started()
            if pictures:
                # Counts and types only: never a byte of a picture, and never a name the person gave it.
                log.info(
                    "claude gets %d picture(s) as stream-json input (%s, %d bytes; thread %s, run %s)",
                    len(pictures), ", ".join(sorted({p.media_type for p in pictures})),
                    sum(p.size for p in pictures), ctx.diagnostics.thread_id, ctx.diagnostics.run_id,
                )

            async def feed_stdin():
                with suppress(BrokenPipeError, ConnectionError):
                    # stdin only (D7): the pictures are in this one write and in no file, argument or variable of the CLI.
                    process.stdin.write(
                        claude_cli.picture_input(ctx.picture_prompt, pictures) if pictures else ctx.prompt.encode("utf-8")
                    )
                    await process.stdin.drain()
                    process.stdin.close()

            async def read_stdout():
                with suppress(ValueError, ConnectionError):  # ValueError: a line past MAX_LINE
                    while line := await process.stdout.readline():
                        for item in parser.feed(line):
                            if isinstance(item, Final):
                                note_result(health, parser, pictures)
                                item = Finished(item.text, lambda: claude_cli.failure_event(parser, pictures=pictures))
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
            said = claude_cli.without_pictures(bytes(stderr).decode("utf-8", errors="replace"), pictures)
            note_stream_end(health, parser, said, process.returncode, pictures)
            return Outcome(claude_cli.failure_event(parser, said, process.returncode, pictures) or agui.run_error(
                f"{claude_cli.LABEL} ended without an answer."
            ))
        finally:
            note_usage(health, parser)
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
