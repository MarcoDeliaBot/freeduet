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
- Iris's own tools (iris_tools.py: team log and lessons) are answered here and never announced:
  they do not end the segment and never reach OpenBot. Other members are not offered them.
- A hand-off (`message_bot`) the callback refused only because its approval had to be asked for
  (OpenBot's approval gate cannot ask from that route) is never answered to the CLI: the segment
  ends, so the CLI can neither retry it nor say it went out, and the person is asked, in the
  conversation, for that exact hand-off (who and what). Their "yes" starts a new run in which the
  member asks again. On a FreeDuet server the member's `message_bot` is not a callback tool at all
  (server/src/freeduet/coordination.ts), so this only happens against a server without that change.

- A call to a tool this run OFFERED that the CLI itself refused ("No such tool available": the bridge
  never heard of it, so no bridge call follows) is handed over like any other call to a tool OpenBot
  runs, from the name and input of its own tool_use line (`Refused`, stream_json.py). The model's
  intent is plain and the tool was offered; whatever made the CLI refuse it (the model called it by
  its plain name instead of mcp__freeduet__<name>, a server not connected yet) is not the person's
  problem, and OpenBot's approval gate still runs the call. A deployment tool is not handed over this
  way (its answer would have to go back to the CLI that has already answered the model), nor is a tool
  the run did not offer: both stay refused, and the log says so.

The transcript writes the model's earlier calls to the tools this run serves under the name the CLI
registers them by (mcp__freeduet__<name>), and the system text tells the model to call them that way:
a model that sees its own past calls by the plain name calls them by it, and the CLI refuses those
(the cause of the "called as computer_navigate" log warnings; transcript.py).

Before the transcript is rendered, a run for Iris activates the lessons the person approved in it
(lessons.py has the rule), and every member's active lessons join its system text, followed by the
run's tool notes (tool_notes.py: the exact reason message_bot was not offered, when it was not).

When the CLI's final result ends a turn that did work without the six-line report, the report guard
(report_guard.py) asks once, with no tools, and streams the report it gets as the end of the same
assistant message; `SegmentNotes.report_guard` tells the team log that it asked.

A turn never ends with no text for the person. When the final result comes with no words at all (the
CLI ended its turn on a tool's error result and said nothing) and the guard adds nothing either, the
segment streams report_guard.no_answer_text: one fixed sentence that says the member stopped and names
the last tool it called. The CLI's own result text stands in for the answer when no delta carried it.
"""

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path

from . import (
    agui,
    claude_cli,
    iris_tools,
    lessons,
    origin,
    person_language,
    report_guard,
    team_log,
    tool_notes,
    transcript,
)
from .agui import RunInput
from .bridge import ipc
from .bridge.callback import HANDOFF_TOOL, call_deployment_tool, needs_the_person
from .members import Member
from .stream_json import MCP_PREFIX, Final, MessageStart, Refused, StreamParser, TextDelta, ToolUse

log = logging.getLogger("freeduet.segment")

SETTLE_SECONDS = 0.3
MATCH_SECONDS = 1.0
SEGMENT_TIMEOUT_SECONDS = 1800.0
MAX_STDERR = 64 * 1024
PIPE_DRAIN_SECONDS = 2.0


@dataclass
class SegmentNotes:
    """What the segment did that its events do not show, for the team log (app.py)."""

    report_guard: str | None = None  # report_guard.ADDED or FAILED once the guard asked


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

    def append(self, text: str) -> list[dict]:
        """`text` at the end of the open message, after a blank line; in a new one if none is open."""
        if self.open is not None:
            return [agui.text_content(self.open, "\n\n" + text)]
        return self.delta("report-guard", text)


def _one_line(value) -> str:
    return " ".join(str(value or "").split())


def handoff_needs_person(blocked: list[tuple[dict, str]]) -> str:
    """What the person is told when hand-offs could not be sent because they need their approval
    and this route cannot ask: who and what, and how to go on. Closes with the member's report."""
    lines = [
        "I have not handed this over yet: OpenBot's approval check wants your OK for it and could not "
        "ask you from here, so nothing was sent.",
        "",
    ]
    for arguments, _ in blocked:
        bot = _one_line(arguments.get("bot")) or "a colleague"
        task = _one_line(arguments.get("task")) or "(no task given)"
        lines.append(f"Hand-off to {bot}: {task}")
        constraints = _one_line(arguments.get("constraints"))
        if constraints:
            lines.append(f"Constraints: {constraints}")
    lines += [
        "",
        'Reply "yes" and I will ask again from this conversation, or tell me what to change.',
        "",
        "Outcome: needs you",
        "Done: nothing",
        f"Evidence: OpenBot answered: {_one_line(blocked[0][1])}",
        "Not done and why: the hand-off above, because it needs your approval and this route cannot ask for it",
        "Already: nothing",
        'Next step: your "yes", or a change to the hand-off',
    ]
    return "\n".join(lines)


async def _later(delay: float, inbox: asyncio.Queue, item: tuple) -> None:
    await asyncio.sleep(delay)
    await inbox.put(item)


async def _lessons_for(run: RunInput, member: Member) -> list[str]:
    """Activate what the person approved in this run (Iris's runs only), then the member's active
    lessons for its prompt. A failure is logged and never fails the run."""
    try:
        await asyncio.to_thread(
            lessons.activate_from_transcript, member.id, run.messages, run.assertion,
            thread=run.thread_id, run=run.run_id, now=team_log.now_iso(),
        )
    except Exception:  # noqa: BLE001 - a missing data folder, a broken file
        log.warning("lesson approvals not checked for this segment", exc_info=True)
    try:
        return await asyncio.to_thread(lessons.active_for, member.id)
    except Exception:  # noqa: BLE001
        log.warning("lessons not read for this segment", exc_info=True)
        return []


async def _answer_locally(local: iris_tools.IrisTools, call: ipc.BridgeCall, seen=None) -> None:
    try:
        reply = await asyncio.to_thread(local.call, call.name, call.arguments)
    except Exception:  # noqa: BLE001 - the CLI gets an error, never a hang
        log.warning("local tool %s failed", call.name, exc_info=True)
        reply = ipc.ToolReply("The FreeDuet tool failed on this call. Try once more, or tell the person.", True)
    if seen is not None:
        seen(reply)
    call.answer(reply)


def mcp_state(parser: StreamParser, offered: set[str]) -> str:
    """What the CLI's init event said about the freeduet server, for the log line of a refused call."""
    if not parser.init_seen:
        return "no init event read"
    status = ", ".join(f"{name}={state}" for name, state in parser.mcp_servers.items()) or "no MCP server listed"
    listed = {tool.removeprefix(MCP_PREFIX) for tool in parser.init_tools}
    missing = sorted(offered - listed)
    if missing:
        return f"{status}; init did not list {', '.join(missing)}"
    return f"{status}; init listed all {len(offered)} offered tools"


async def run_segment(run: RunInput, member: Member, notes: SegmentNotes | None = None) -> AsyncIterator[dict]:
    yield agui.run_started(run)
    notes = notes if notes is not None else SegmentNotes()
    active_lessons = await _lessons_for(run, member)
    # The tool notes, then the person's language when the deployment set one (person_language.py).
    run_notes = [*tool_notes.notes_for(run, member), *person_language.notes_for(run)]
    offered = {tool["name"] for tool in run.tools}
    local = iris_tools.for_run(run, member.id, offered)
    # What the bridge serves: the transcript writes earlier calls to these under the name the CLI
    # registers them by, mcp__freeduet__<name> (transcript.py).
    served = offered | (local.names if local else frozenset())
    rendered = transcript.render(member, run.messages, run.context, active_lessons, run_notes, served=served)
    inbox: asyncio.Queue = asyncio.Queue()
    parser = StreamParser()
    handed_over: list[str] = []  # refused calls to offered tools that this segment handed to OpenBot
    stderr = bytearray()
    tasks: set[asyncio.Task] = set()

    def spawn(coroutine) -> None:
        task = asyncio.create_task(coroutine)
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    async def on_call(call: ipc.BridgeCall) -> None:
        await inbox.put(("call", call))

    async def guard(story: report_guard.Story) -> str | None:
        """The report to add to a turn that ends without one, or None (report_guard.py)."""
        if not report_guard.applies(run.messages, story.reply(), story.called):
            return None
        notes.report_guard = report_guard.FAILED
        try:
            followup = report_guard.followup_prompt(
                member, run.messages, run.context, story, active_lessons, run_notes, served
            )
            block = await report_guard.request_report(followup.system, followup.prompt)
        except Exception:  # noqa: BLE001 - the reply stands as it is; the guard never fails a turn
            log.warning("report guard failed", exc_info=True)
            return None
        if block:
            notes.report_guard = report_guard.ADDED
        return block

    host = ipc.BridgeHost(ipc.mcp_tools(run.tools) + (local.definitions() if local else []), on_call)
    process = None
    readers: tuple[asyncio.Task, ...] = ()
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
            readers = (asyncio.create_task(read_stdout()), stderr_task)
            tasks.update(readers)
            spawn(feed_stdin())

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

            async for event in _drive(run, offered, inbox, parser, spawn, failed_exit, local, guard, handed_over):
                yield event
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
            await host.close()
            if stderr and parser.final is None:
                log.info("claude stderr: %s", bytes(stderr[-2000:]).decode("utf-8", errors="replace"))
            if parser.unavailable:
                # The call went nowhere: the CLI answered it itself, so no stored transcript shows it.
                log.warning(
                    "claude answered \"No such tool available\" for %s (called as %s; handed to OpenBot: %s): "
                    "this %s run offered only %s; mcp: %s (thread %s, run %s)",
                    ", ".join(parser.unavailable),
                    ", ".join(parser.unavailable_as),
                    ", ".join(handed_over) or "nothing",
                    "hand-off" if origin.is_handoff_run(run.messages, run.assertion) else "person's",
                    ", ".join(sorted(offered)) or "no tool",
                    mcp_state(parser, offered),
                    run.thread_id,
                    run.run_id,
                )


async def _drive(run: RunInput, offered: set[str], inbox: asyncio.Queue, parser: StreamParser, spawn, failed_exit,
                 local: iris_tools.IrisTools | None = None,
                 guard: Callable[[report_guard.Story], Awaitable[str | None]] | None = None,
                 handed_over: list[str] | None = None):
    """The segment's state machine. Ends with exactly one RUN_FINISHED or RUN_ERROR."""
    handed_over = handed_over if handed_over is not None else []
    local_names = local.names if local is not None else frozenset()
    loop = asyncio.get_running_loop()
    deadline = loop.time() + SEGMENT_TIMEOUT_SECONDS
    text = _Text()
    story = report_guard.Story()  # this segment's reply and calls, for the report guard
    seen: list[ToolUse] = []  # tool_use lines no bridge call has claimed yet
    waiting: list[ipc.BridgeCall] = []  # bridge calls whose tool_use line has not been read yet
    in_flight = 0  # deployment calls running
    handed = 0  # calls left for OpenBot to run
    blocked: list[tuple[dict, str]] = []  # hand-offs that need the person (arguments, refusal)
    refused: list[tuple[str, dict]] = []  # calls the CLI refused and this segment handed over (name, input)

    def ask_the_person() -> list[dict]:
        message_id = agui.new_id("msg-")
        return [
            *text.close(),
            agui.text_start(message_id),
            agui.text_content(message_id, handoff_needs_person(blocked)),
            agui.text_end(message_id),
            agui.run_finished(run),
        ]

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
        story.call(call_id, call.name, call.arguments)
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
                    story.text(payload.message_id, payload.text)
                    for event in text.delta(payload.message_id, payload.text):
                        yield event
            elif isinstance(payload, ToolUse):
                if payload.name in local_names:
                    continue  # answered locally, never announced
                seen.append(payload)
                for call in list(waiting):
                    use = claim(call)
                    if use is not None:
                        waiting.remove(call)
                        for event in announce(call, use):
                            yield event
            elif isinstance(payload, Refused):
                if payload.name not in offered or payload.name in run.deployment_tools or payload.input is None:
                    continue  # stays refused: the model has the CLI's own answer (logged at the end)
                seen[:] = [use for use in seen if use.id != payload.id]
                refused.append((payload.name, payload.input))
                handed_over.append(payload.name)
                call = ipc.BridgeCall(payload.name, payload.input, loop.create_future())
                for event in announce(call, ToolUse(payload.message_id, payload.id, payload.name, payload.input)):
                    yield event
            elif isinstance(payload, Final):
                if blocked:
                    for event in ask_the_person():
                        yield event
                    return
                failure = None if handed else claude_cli.failure_event(parser)
                if failure is None and not handed:
                    # The turn ends here. The CLI's result can carry the answer when no delta did.
                    answer = (payload.text or "").strip()
                    if answer and not story.reply().strip():
                        story.text("result", answer)
                        for event in text.delta("result", answer):
                            yield event
                    # A turn that did work closes with its report (report_guard.py).
                    added = await guard(story) if guard is not None else None
                    if added:
                        for event in text.append(added):
                            yield event
                    elif not story.reply().strip():
                        # Nothing for the person: never end a turn in silence (report_guard.py).
                        log.warning(
                            "segment ended with no text for the person (thread %s, run %s, last call %s)",
                            run.thread_id, run.run_id, report_guard.last_attempt(run.messages, story),
                        )
                        for event in text.append(report_guard.no_answer_text(run.messages, story)):
                            yield event
                for event in text.close():
                    yield event
                yield failure or agui.run_finished(run)
                return

        elif kind == "call":
            call: ipc.BridgeCall = payload
            if call.name in local_names:
                local_id = agui.new_id("local-")
                story.call(local_id, call.name, call.arguments)
                spawn(_answer_locally(local, call, lambda reply, at=local_id: story.result(at, reply.text, reply.is_error)))
                continue
            if call.name not in offered:
                call.answer(ipc.ToolReply("Refused. That tool was not offered for this turn.", True))
                continue
            again = next((entry for entry in refused if entry[0] == call.name and _same(entry[1], call.arguments)), None)
            if again is not None:
                # The model repeated, under the right name, a call this segment already handed over.
                refused.remove(again)
                call.answer(ipc.ToolReply("This call was already handed over; its result comes with your next turn.", True))
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
            if call.name == HANDOFF_TOOL and needs_the_person(reply):
                blocked.append((call.arguments, reply.text))  # never answered to the CLI
            else:
                call.answer(reply)
                story.result(call_id, reply.text, reply.is_error)
            for event in text.close():
                yield event
            yield agui.tool_call_result(call_id, reply.text)
            if blocked and in_flight == 0:
                for event in ask_the_person():
                    yield event
                return
            if handed:
                spawn(_later(SETTLE_SECONDS, inbox, ("settle", None)))

        elif kind == "settle":
            if handed and in_flight == 0 and not waiting:
                for event in text.close():
                    yield event
                yield agui.run_finished(run)
                return

        elif kind == "eof":
            if blocked:
                for event in ask_the_person():
                    yield event
                return
            for event in text.close():
                yield event
            yield agui.run_finished(run) if handed else await failed_exit()
            return
