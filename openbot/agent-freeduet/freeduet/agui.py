"""AG-UI on the wire: the RunAgentInput OpenBot posts, and the events sent back as SSE.

Parsing is tolerant on purpose. OpenBot adds fields of its own to messages (a tool message's
`error`, attachment parts) and a strict schema would refuse a turn over a field this service never
reads. Only what the runtime needs is checked: the ids, the message list, the tool list and the
three `forwardedProps` OpenBot sets on every run (server/src/copilot.ts, runWith), a fourth
when the deployment names the person's language (person_language.py), and a fifth when the person has chosen
something on the Engines page for this member (engine_choices.py).
"""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from contextlib import suppress
from dataclasses import dataclass, field

from .engine_choices import PROP as ENGINE_CHOICES_PROP
from .engine_choices import Choices
from .engine_choices import from_props as engine_choices_from_props
from .person_language import PROP as PERSON_LANGUAGE_PROP
from .person_language import from_props as person_language_from_props

KEEPALIVE_SECONDS = 15.0
KEEPALIVE = b": keepalive\n\n"


class InvalidRunInput(ValueError):
    """The body is not a RunAgentInput this service can run."""


@dataclass(frozen=True)
class RunInput:
    thread_id: str
    run_id: str
    messages: list[dict]
    tools: list[dict]
    context: list[dict] = field(default_factory=list)
    bot_id: str = ""
    deployment_tools: frozenset[str] = frozenset()
    # The signed run assertion. Handed back on deployment tool calls, never logged or shown.
    assertion: str = field(default="", repr=False)
    # The person's language as (two-letter code, English name), when the deployment set one (D26).
    person_language: tuple[str, str] | None = None
    # What the person chose for this member on the Engines page, when they chose anything (engine_choices.py).
    engine_choices: Choices | None = None


def _strings(value) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def parse_run_input(body) -> RunInput:
    if not isinstance(body, dict):
        raise InvalidRunInput("The request body must be a JSON object.")
    thread_id, run_id = body.get("threadId"), body.get("runId")
    if not isinstance(thread_id, str) or not thread_id:
        raise InvalidRunInput("threadId is required.")
    if not isinstance(run_id, str) or not run_id:
        raise InvalidRunInput("runId is required.")
    messages = body.get("messages") or []
    tools = body.get("tools") or []
    context = body.get("context") or []
    if not isinstance(messages, list) or not all(isinstance(m, dict) for m in messages):
        raise InvalidRunInput("messages must be a list of objects.")
    if not isinstance(tools, list) or not all(isinstance(t, dict) for t in tools):
        raise InvalidRunInput("tools must be a list of objects.")
    if not isinstance(context, list):
        context = []
    props = body.get("forwardedProps")
    props = props if isinstance(props, dict) else {}
    bot_id = props.get("openbotBotId")
    assertion = props.get("openbotRun")
    return RunInput(
        thread_id=thread_id,
        run_id=run_id,
        messages=messages,
        tools=[tool for tool in tools if isinstance(tool.get("name"), str) and tool["name"]],
        context=[entry for entry in context if isinstance(entry, dict)],
        bot_id=bot_id if isinstance(bot_id, str) else "",
        deployment_tools=frozenset(_strings(props.get("openbotDeploymentTools"))),
        assertion=assertion if isinstance(assertion, str) else "",
        person_language=person_language_from_props(props.get(PERSON_LANGUAGE_PROP)),
        engine_choices=engine_choices_from_props(props.get(ENGINE_CHOICES_PROP)),
    )


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4()}"


# -- events ----------------------------------------------------------------------------------------


def run_started(run: RunInput) -> dict:
    return {"type": "RUN_STARTED", "threadId": run.thread_id, "runId": run.run_id}


def run_finished(run: RunInput) -> dict:
    return {"type": "RUN_FINISHED", "threadId": run.thread_id, "runId": run.run_id}


def run_error(message: str, code: str | None = None) -> dict:
    event = {"type": "RUN_ERROR", "message": message}
    if code:
        event["code"] = code
    return event


def text_start(message_id: str) -> dict:
    return {"type": "TEXT_MESSAGE_START", "messageId": message_id, "role": "assistant"}


def text_content(message_id: str, delta: str) -> dict:
    return {"type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": delta}


def text_end(message_id: str) -> dict:
    return {"type": "TEXT_MESSAGE_END", "messageId": message_id}


def tool_call_events(call_id: str, name: str, args: dict, parent_id: str | None) -> list[dict]:
    start = {"type": "TOOL_CALL_START", "toolCallId": call_id, "toolCallName": name}
    if parent_id:
        start["parentMessageId"] = parent_id
    return [
        start,
        {"type": "TOOL_CALL_ARGS", "toolCallId": call_id, "delta": json.dumps(args, ensure_ascii=False)},
        {"type": "TOOL_CALL_END", "toolCallId": call_id},
    ]


def tool_call_result(call_id: str, content: str) -> dict:
    return {
        "type": "TOOL_CALL_RESULT",
        "messageId": new_id("tool-"),
        "toolCallId": call_id,
        "role": "tool",
        "content": content,
    }


# -- SSE -------------------------------------------------------------------------------------------


def encode(event: dict) -> bytes:
    return b"data: " + json.dumps(event, ensure_ascii=False).encode("utf-8") + b"\n\n"


async def sse(events: AsyncIterator[dict], keepalive_seconds: float = KEEPALIVE_SECONDS):
    """Encode `events` as SSE, with a comment line whenever nothing was sent for a while.

    OpenBot ends a turn after 60 s of silence (D8), and a Claude Code turn can think, or wait on a
    deployment tool, for longer than that. The producer runs in its own task so a slow event never
    blocks the keepalive; closing this generator (the client went away) cancels the producer, which
    is what stops the CLI.
    """
    queue: asyncio.Queue = asyncio.Queue()
    done = object()

    async def produce():
        try:
            async for event in events:
                await queue.put(encode(event))
        finally:
            await queue.put(done)

    producer = asyncio.create_task(produce())
    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), keepalive_seconds)
            except TimeoutError:
                yield KEEPALIVE
                continue
            if item is done:
                break
            yield item
        # Surface a producer crash instead of ending the stream as if the run had finished.
        await producer
    finally:
        if not producer.done():
            producer.cancel()
            with suppress(asyncio.CancelledError):
                await producer
