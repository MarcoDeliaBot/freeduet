"""One segment: a fresh `claude -p` from the whole transcript to the end of the turn, or to the
first tool OpenBot has to run itself (D4, D6).

Two channels feed one ordered inbox: the CLI's stdout (text, the tool calls it is about to make,
its final result) and the bridge (the calls it actually makes). A bridge call is acted on once its
`tool_use` line has been read from stdout, so the AG-UI events keep the CLI's order (text first,
then the call) and carry the CLI's own call id.

- A deployment tool (named in `openbotDeploymentTools`) is announced with TOOL_CALL_START/ARGS/END,
  run through OpenBot's callback route, answered to the CLI and reported with TOOL_CALL_RESULT, so
  the next transcript has it. The CLI carries on.
- Any other tool is announced and never answered: after a short settle, for calls the CLI makes
  alongside it, the segment ends with RUN_FINISHED and the CLI is stopped. OpenBot runs the call
  under its own approval gate and POSTs again with the result.
"""

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncIterator
from contextlib import suppress
from pathlib import Path

from . import agui, claude_cli, transcript
from .agui import RunInput
from .bridge import ipc
from .bridge.callback import call_deployment_tool
from .members import Member
from .stream_json import Final, MessageStart, StreamParser, TextDelta, ToolUse

log = logging.getLogger("freeduet.segment")

SETTLE_SECONDS = 0.3
MATCH_SECONDS = 1.0
SEGMENT_TIMEOUT_SECONDS = 1800.0
MAX_STDERR = 64 * 1024


def _same(a: dict, b: dict) -> bool:
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


class _Text:
    """Open and close AG-UI text messages: one per CLI message, never two open at once."""

    def __init__(self):
        self.ids: dict[str | None, str] = {}
        self.open: str | None = None
        self.last: str | None = None

    def id_for(self, cli_id: str | None) -> str:
        if cli_id not in self.ids:
            self.ids[cli_id] = agui.new_id("msg-")
        return self.ids[cli_id]

    def delta(self, cli_id: str | None, text: str) -> list[dict]:
        message_id = self.id_for(cli_id)
        events = [] if self.open == message_id else [*self.close(), agui.text_start(message_id)]
        self.open = self.last = message_id
        return [*events, agui.text_content(message_id, text)]

    def close(self) -> list[dict]:
        if self.open is None:
            return []
        closing, self.open = self.open, None
        return [agui.text_end(closing)]


async def _later(delay: float, inbox: asyncio.Queue, item: tuple) -> None:
    await asyncio.sleep(delay)
    await inbox.put(item)


async def run_segment(run: RunInput, member: Member) -> AsyncIterator[dict]:
    yield agui.run_started(run)
    rendered = transcript.render(member, run.messages, run.context)
    offered = {tool["name"] for tool in run.tools}
    inbox: asyncio.Queue = asyncio.Queue()
    parser = StreamParser()
    stderr = bytearray()
    tasks: set[asyncio.Task] = set()

    def spawn(coroutine) -> None:
        task = asyncio.create_task(coroutine)
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    async def on_call(call: ipc.BridgeCall) -> None:
        await inbox.put(("call", call))

    host = ipc.BridgeHost(ipc.mcp_tools(run.tools), on_call)
    process = None
    with tempfile.TemporaryDirectory(prefix="freeduet-segment-") as folder:
        try:
            directory = Path(folder)
            work = directory / "work"  # an empty folder: no project files, no CLAUDE.md
            work.mkdir()
            port = await host.start()
            config = claude_cli.write_mcp_config(directory, port, host.secret)
            command = claude_cli.build_command(claude_cli.claude_bin(), config, rendered.system, directory)
            try:
                process = await claude_cli.start(command, work)
            except OSError:
                yield agui.run_error(f"{claude_cli.LABEL} is not installed in this service.")
                return

            async def feed_stdin():
                with suppress(BrokenPipeError, ConnectionError):
                    process.stdin.write(rendered.prompt.encode("utf-8"))
                    await process.stdin.drain()
                    process.stdin.close()

            async def read_stdout():
                with suppress(ValueError, ConnectionError):  # ValueError: a line past MAX_LINE
                    while line := await process.stdout.readline():
                        for item in parser.feed(line):
                            await inbox.put(("stream", item))
                await inbox.put(("eof", None))

            async def read_stderr():
                while chunk := await process.stderr.read(65536):
                    stderr.extend(chunk)
                    del stderr[:-MAX_STDERR]

            stderr_task = asyncio.create_task(read_stderr())
            tasks.add(stderr_task)
            for coroutine in (feed_stdin(), read_stdout()):
                spawn(coroutine)

            async def failed_exit() -> dict:
                """The stream ended without a result line: wait for the exit, then say why."""
                with suppress(TimeoutError):
                    await asyncio.wait_for(process.wait(), 5)
                with suppress(TimeoutError, asyncio.CancelledError):
                    await asyncio.wait_for(asyncio.shield(stderr_task), 2)
                said = bytes(stderr).decode("utf-8", errors="replace")
                return claude_cli.failure_event(parser, said, process.returncode) or agui.run_error(
                    f"{claude_cli.LABEL} ended without an answer."
                )

            async for event in _drive(run, offered, inbox, parser, spawn, failed_exit):
                yield event
        finally:
            await claude_cli.stop(process)
            for task in list(tasks):
                task.cancel()
            for task in list(tasks):
                with suppress(asyncio.CancelledError, Exception):
                    await task
            await host.close()
            if stderr and parser.final is None:
                log.info("claude stderr: %s", bytes(stderr[-2000:]).decode("utf-8", errors="replace"))


async def _drive(run: RunInput, offered: set[str], inbox: asyncio.Queue, parser: StreamParser, spawn, failed_exit):
    """The segment's state machine. Ends with exactly one RUN_FINISHED or RUN_ERROR."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + SEGMENT_TIMEOUT_SECONDS
    text = _Text()
    seen: list[ToolUse] = []  # tool_use lines no bridge call has claimed yet
    waiting: list[ipc.BridgeCall] = []  # bridge calls whose tool_use line has not been read yet
    in_flight = 0  # deployment calls running
    handed = 0  # calls left for OpenBot to run

    def claim(call: ipc.BridgeCall) -> ToolUse | None:
        for use in seen:
            if use.name == call.name and _same(use.input, call.arguments):
                seen.remove(use)
                return use
        return None

    def announce(call: ipc.BridgeCall, use: ToolUse | None) -> list[dict]:
        nonlocal in_flight, handed
        call_id = use.id if use else agui.new_id("call-")
        parent = text.id_for(use.message_id) if use else text.last
        events = [*text.close(), *agui.tool_call_events(call_id, call.name, call.arguments, parent)]
        if call.name in run.deployment_tools:
            in_flight += 1

            async def deploy():
                reply = await call_deployment_tool(call.name, call.arguments, run.assertion)
                await inbox.put(("deployed", (call, call_id, reply)))

            spawn(deploy())
        else:
            handed += 1
            spawn(_later(SETTLE_SECONDS, inbox, ("settle", None)))
        return events

    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            yield agui.run_error(f"{claude_cli.LABEL} took too long on this turn and was stopped.")
            return
        try:
            kind, payload = await asyncio.wait_for(inbox.get(), remaining)
        except TimeoutError:
            continue

        if kind == "stream":
            if isinstance(payload, MessageStart):
                for event in text.close():
                    yield event
            elif isinstance(payload, TextDelta):
                if not handed:
                    for event in text.delta(payload.message_id, payload.text):
                        yield event
            elif isinstance(payload, ToolUse):
                seen.append(payload)
                for call in list(waiting):
                    use = claim(call)
                    if use is not None:
                        waiting.remove(call)
                        for event in announce(call, use):
                            yield event
            elif isinstance(payload, Final):
                for event in text.close():
                    yield event
                failure = None if handed else claude_cli.failure_event(parser)
                yield failure or agui.run_finished(run)
                return

        elif kind == "call":
            call: ipc.BridgeCall = payload
            if call.name not in offered:
                call.answer(ipc.ToolReply("Refused. That tool was not offered for this turn.", True))
                continue
            use = claim(call)
            if use is None:
                waiting.append(call)
                spawn(_later(MATCH_SECONDS, inbox, ("unclaimed", call)))
                continue
            for event in announce(call, use):
                yield event

        elif kind == "unclaimed":
            if payload in waiting:
                waiting.remove(payload)
                for event in announce(payload, None):
                    yield event

        elif kind == "deployed":
            call, call_id, reply = payload
            in_flight -= 1
            call.answer(reply)
            for event in text.close():
                yield event
            yield agui.tool_call_result(call_id, reply.text)
            if handed:
                spawn(_later(SETTLE_SECONDS, inbox, ("settle", None)))

        elif kind == "settle":
            if handed and in_flight == 0 and not waiting:
                for event in text.close():
                    yield event
                yield agui.run_finished(run)
                return

        elif kind == "eof":
            for event in text.close():
                yield event
            yield agui.run_finished(run) if handed else await failed_exit()
            return
