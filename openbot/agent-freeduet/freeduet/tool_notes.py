"""Why a tool the member's prompt relies on is missing from this run, in exact words.

Every member's prompt tells it to hand work on, or send its report to Iris, with `message_bot`.
OpenBot offers that tool only on some runs, and never says why it left it out. A model that looks
for a tool and does not find it calls it "unavailable" and improvises: in a live run Iris told the
person "the messaging tool is unavailable" and wrote them a brief to paste to Jules (eval case
iris-2, issue #19).

The cause there was OpenBot's hand-off depth limit, not a fault. Jules's answer comes back to Iris as
a relay, which OpenBot runs as a hand-off at the depth of the hop it answers (1:
`agents/handoff-runner.ts`, `relay`, `depth: work.depth`). With `BOT_HANDOFF_MAX_DEPTH=1` (the
default, `config.ts`), `createCoordinationTools().toolsForRun` offers no `message_bot` at depth 1
(`agents/handoff-tool.ts`, `canHandOn`; `handoffTool` returns null there too). So in the relay turn
Iris cannot pass Jules's question on, ask him for evidence or send his result to Vera, and her
prompt's fallback ("with neither, ... the brief ready to paste") fired. Whether it did depended on
what Jules answered and on whether the relay landed before the eval runner stopped reading, which is
why the same case passed in another run.

This module reads what agent-freeduet itself can see (the offered tools, OpenBot's own hand-off
messages and the readable part of the signed run statement, origin.py) and gives the member one note
with the exact reason and what to do instead. It only explains: it never offers a tool OpenBot did
not offer, and the depth limit stays OpenBot's (docs/M1_PLAN.md D14: no chains).
"""

from __future__ import annotations

from .agui import RunInput
from .members import Member
from .origin import (
    ATTRIBUTION,
    IRIS_ID,
    claims_a_handoff,
    is_envelope,
    latest_user_message,
    message_text,
    run_claims,
)

HANDOFF_TOOL = "message_bot"


def _depth(claims: dict) -> str:
    depth = claims.get("depth")
    if isinstance(depth, int) and not isinstance(depth, bool) and depth > 0:
        return f" at hand-off depth {depth}"
    return ""


def _who(bot_id: str) -> str:
    return "Iris" if bot_id == IRIS_ID else bot_id


def relay_note(depth: str) -> str:
    return (
        f"Why message_bot is not offered on this turn: this turn brings back the answer to work that "
        f"was handed over in this conversation, and OpenBot runs it as a hand-off{depth}, where its "
        "hand-off depth limit lets nobody hand work on. Nothing is broken: never say a tool is "
        "unavailable, and do not write a brief for the person to paste. Give the person the outcome. "
        "If something must go to a colleague next (an answer to their question, a request for "
        "evidence, a correction, a review by Vera), say in one sentence what you will send and to "
        "whom, and that it goes out as soon as they reply here: their next message in this "
        "conversation is an ordinary turn, where message_bot is offered again. Make that your Next "
        "step."
    )


def hop_note(sender: str, depth: str) -> str:
    return (
        f"Why message_bot is not offered on this turn: {sender} handed you this work, and OpenBot runs "
        f"a handed-over turn as a hand-off{depth}, where its hand-off depth limit lets nobody hand "
        f"work on. Nothing is broken: never say a tool is unavailable. Your answer goes back to "
        f"{sender} by itself: put in it anything another colleague should do, and any report you "
        "would have sent with message_bot."
    )


def other_handoff_note(depth: str) -> str:
    return (
        f"Why message_bot is not offered on this turn: OpenBot runs this turn as a hand-off{depth}, "
        "where its hand-off depth limit lets nobody hand work on. Nothing is broken: never say a tool "
        "is unavailable; if it matters, say exactly this reason."
    )


NOT_OFFERED_NOTE = (
    "message_bot is not offered on this turn, and OpenBot gave no reason with the tool list. If you "
    "need a colleague, say exactly that (OpenBot did not offer message_bot on this turn), never that "
    "a tool is unavailable, then follow your instructions for working without it."
)


def notes_for(run: RunInput, member: Member) -> list[str]:
    """The notes for this run's system text: one when the member's prompt relies on message_bot and
    OpenBot did not offer it, saying exactly why as far as this run shows; none otherwise."""
    if HANDOFF_TOOL not in member.system_prompt:
        return []
    if any(tool.get("name") == HANDOFF_TOOL for tool in run.tools):
        return []
    claims = run_claims(run.assertion)
    depth = _depth(claims)
    latest = latest_user_message(run.messages)
    if latest is not None:
        attribution = ATTRIBUTION.match(message_text(latest))
        if attribution:
            return [hop_note(_who(attribution.group(1)), depth)]
        if is_envelope(latest):
            return [relay_note(depth)]
    if claims_a_handoff(claims):
        return [other_handoff_note(depth)]
    return [NOT_OFFERED_NOTE]
