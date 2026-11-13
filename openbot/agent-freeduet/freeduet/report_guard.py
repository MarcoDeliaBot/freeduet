"""The report guard: a turn that did work never ends without its six-line report.

The shared rules (examples/freeduet/agents.yaml) make every member close a turn in which it did or
stopped work with the report (Outcome, Done, Evidence, Not done and why, Already, Next step). The
report is what the checkpoint and the team log are written from, and the team log is how Iris learns
about work she did not hand out (docs/M1_PLAN.md D15). In live runs two or three turns a run still
ended without one (iris-3, otto-1, vera-5: "no Outcome line", issue #19), so that work was invisible
to her.

THE RULE. When a segment ends the turn (the CLI's final result, no call left for OpenBot to run, no
hand-off waiting for the person, no error) and its text holds no report (report.parse_report), the
guard asks once, if the turn did work. Whether it did is the shared rules' no-report sentence
(NO_REPORT_RULE in evals/team/checks.ts, `isWork` there, clause by clause):

    "Skip the report only when the person's message is just a greeting, or ends with a question you
    answer from what you already know (a safety warning included), with no attached file and no
    tool call."

So the turn did work when this turn made a tool call (in this segment, Iris's own tools included,
or in an earlier segment since the person's message), when the person's message carries an attached
file (a non-text part, or an eval's "[fixture: ...]" description), or when that message is neither
just a greeting nor ends with a question. A greeting or a question answered from what the member
knows never gets the guard.

WHAT IT DOES. One more `claude -p` on the same login, locked down like the server's own text calls
(claude_cli.build_text_command: no built-in tools and no MCP server, so no tool exists at all), with
the member's system text and the conversation so far, this segment's reply and calls included, and
INSTRUCTION in place of the usual last line. Only a complete report comes back into the reply: its
six lines are cut out of the answer (report.report_block) and streamed as the end of the same
assistant message. Anything else (a refusal, a rewrite of the reply, a partial report, a failure or
a timeout) adds nothing. Never more than once per turn: the follow-up has no tools, so it cannot
start another segment, and it is never retried. The team log records that the guard asked
(`report_guard`: "added" or "failed").

NO TEXT AT ALL. A turn must never end with nothing for the person. When the engine's final message is
empty (the CLI ended its turn on a tool's error result with no words, found in a live run: jules-3),
the guard above asks for the report as for any turn that did work. If that adds nothing too, or the
turn did no work and the guard never asked, the person gets `no_answer_text`: one fixed sentence that
says the member stopped without an answer and names the last tool it called (its name only: never a
tool result, a page or an argument). segment.py streams it.
"""

from __future__ import annotations

import json
import logging
import re

from . import claude_cli, report, team_log, transcript
from .members import Member
from .origin import GROUP_TRANSCRIPT, latest_user_message, message_text
from .stream_json import MCP_PREFIX

log = logging.getLogger("freeduet.report_guard")

TIMEOUT_SECONDS = 90.0

ADDED, FAILED = team_log.REPORT_GUARD_VALUES  # what the team log's `report_guard` records

INSTRUCTION = (
    "Your reply above is finished, but it does not end with the work report the shared rules "
    "require. Write that report now and nothing else: the six lines Outcome, Done, Evidence, Not "
    "done and why, Already, Next step, in this order, each on its own line as a list item that starts "
    "with its label and a colon (\"- Outcome: done\"). "
    "Outcome is one of done, partly done, in progress, blocked, failed or needs you. Write it in the "
    "language of your reply above; in Italian use Esito (fatto, fatto in parte, in corso, bloccato, "
    "fallito or serve te), Fatto, Prove, Non fatto e perché, Già, Prossimo passo. Report only what "
    "the conversation above shows: Evidence names only files, links, numbers or tool results that "
    "appear in it; Already names only what a tool there confirmed as sent, paid, booked, published "
    "or deleted, otherwise \"nothing\"; what you cannot show goes under Not done and why. Change "
    "nothing else: do not repeat, correct or continue the reply, call no tool, and write nothing "
    "before the Outcome line or after the Next step line."
)

# evals/team/checks.ts, GREETING, isGreeting and endsWithQuestion, as Python.
_GREETING = re.compile(
    r"^(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you|ciao|salve|buongiorno|"
    r"buonasera|grazie)(,?\s+(?:[^\W\d_]|['-])+)?$",
    re.IGNORECASE,
)
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
_TRAILING_PUNCTUATION = re.compile(r"[\s!.,?]+$")
_TRAILING_CLOSERS = re.compile(r"[\"'”’»)\]\s]+$")
_FIXTURE = re.compile(r"\[fixture:", re.IGNORECASE)


def is_greeting(text: str) -> bool:
    """Every sentence is a greeting, optionally with a name ("Hi Iris!")."""
    sentences = [part.strip() for part in _SENTENCE_BREAK.split(text or "") if part.strip()]
    return bool(sentences) and all(_GREETING.match(_TRAILING_PUNCTUATION.sub("", s)) for s in sentences)


def ends_with_question(text: str) -> bool:
    """The last character, past closing quotes and brackets, is a question mark."""
    return _TRAILING_CLOSERS.sub("", (text or "").strip()).endswith(("?", "？"))


def _has_attachment(message: dict) -> bool:
    content = message.get("content")
    if isinstance(content, list) and any(
        isinstance(part, dict) and part.get("type") != "text" for part in content
    ):
        return True
    return bool(_FIXTURE.search(message_text(message)))


def _called_since(messages: list[dict], latest: dict | None) -> bool:
    start = next((i for i, message in enumerate(messages) if message is latest), -1) + 1
    return any(
        message.get("role") == "tool" or (message.get("role") == "assistant" and message.get("toolCalls"))
        for message in messages[start:]
    )


def turn_did_work(messages: list[dict], called_in_segment: bool) -> bool:
    """The shared no-report rule as code: False only for a greeting, or a message ending with a
    question, with no attached file and no tool call in this turn."""
    if called_in_segment:
        return True
    latest = latest_user_message(messages)
    if _called_since(messages, latest):
        return True
    if latest is None:
        return False
    if _has_attachment(latest):
        return True
    text = message_text(latest).split(GROUP_TRANSCRIPT, 1)[0]
    return not (is_greeting(text) or ends_with_question(text))


def applies(messages: list[dict], reply: str, called_in_segment: bool) -> bool:
    """Whether a turn that ends with `reply` needs the guard."""
    return report.parse_report(reply) is None and turn_did_work(messages, called_in_segment)


class Story:
    """This segment's reply and calls as OpenBot messages, so the follow-up reads the conversation
    the way the next segment would."""

    def __init__(self):
        self.messages: list[dict] = []
        self.called = False

    def text(self, message_id: str | None, chunk: str) -> None:
        last = self.messages[-1] if self.messages else None
        key = f"segment-{message_id or 'text'}"
        if last is not None and last.get("id") == key and not last.get("toolCalls"):
            last["content"] += chunk
        else:
            self.messages.append({"id": key, "role": "assistant", "content": chunk})

    def call(self, call_id: str, name: str, arguments: dict) -> None:
        self.called = True
        self.messages.append(
            {
                "id": f"segment-call-{call_id}",
                "role": "assistant",
                "content": "",
                "toolCalls": [
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(arguments, ensure_ascii=False)},
                    }
                ],
            }
        )

    def result(self, call_id: str, text: str, is_error: bool) -> None:
        message = {"id": f"segment-result-{call_id}", "role": "tool", "toolCallId": call_id, "content": text}
        if is_error:
            message["error"] = text
        self.messages.append(message)

    def reply(self) -> str:
        return "\n\n".join(
            message["content"] for message in self.messages if message["role"] == "assistant" and message["content"]
        )


def followup_prompt(
    member: Member, messages: list[dict], context: list[dict], story: Story, lessons=(), notes=(), served=()
):
    """The follow-up's system text and stdin: the conversation so far and INSTRUCTION. `served` are the
    tools the turn's bridge served: the history names them as the segment's own transcript does."""
    return transcript.render(
        member, [*messages, *story.messages], context, lessons, notes, closing=INSTRUCTION, served=served
    )


async def request_report(system: str, prompt: str, timeout: float = TIMEOUT_SECONDS) -> str | None:
    """The six report lines the follow-up wrote, or None when it wrote no complete report."""
    try:
        answer = await claude_cli.run_text(system, prompt, timeout=timeout)
    except claude_cli.TextCallFailed as error:
        log.warning("report guard: the follow-up got no answer: %s", error)
        return None
    block = report.report_block(answer)
    if block is None:
        log.warning("report guard: the follow-up wrote no complete report")
    return block


# ── a turn that ends with no text at all ─────────────────────────────────────────────────────────

NO_ANSWER = "I stopped without an answer."
NO_ANSWER_TAIL = "Tell me to go on, or tell me what you want me to do instead."
_TOOL_NAME = re.compile(r"[A-Za-z][\w.-]{0,63}")


def _last_tool_name(messages: list[dict]) -> str | None:
    for message in reversed(messages):
        if message.get("role") != "assistant":
            continue
        for call in reversed(message.get("toolCalls") or []):
            function = call.get("function") if isinstance(call, dict) else None
            name = function.get("name") if isinstance(function, dict) else None
            if isinstance(name, str):
                name = name.removeprefix(MCP_PREFIX)
                if _TOOL_NAME.fullmatch(name):
                    return name
    return None


def last_attempt(messages: list[dict], story: Story) -> str | None:
    """The name of the last tool the member called in this turn: this segment's own calls first, then
    the calls since the person's message. The name only, so nothing a page or a tool said can get in."""
    latest = latest_user_message(messages)
    start = next((i for i, message in enumerate(messages) if message is latest), -1) + 1
    return _last_tool_name([*messages[start:], *story.messages])


def no_answer_text(messages: list[dict], story: Story) -> str:
    """The fixed sentence for a turn that ended with no text for the person at all."""
    name = last_attempt(messages, story)
    if name is None:
        return f"{NO_ANSWER} {NO_ANSWER_TAIL}"
    return f"{NO_ANSWER} The last thing I tried was {name}. {NO_ANSWER_TAIL}"
