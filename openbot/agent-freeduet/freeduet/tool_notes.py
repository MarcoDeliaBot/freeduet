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

The same goes for the member's computer (`computer_navigate`, `computer_read`, ...). The person's
browser chat offers those tools with every run, but a hand-off turn (the forward hop to the addressed
Bot and the relay of its answer back to the Bot that asked) is run by OpenBot with `tools: []`
(`agents/handoff-delivery.ts`), so the CLI lists no computer tool there. A member whose prompt tells
it to research with them calls one anyway, the CLI answers "No such tool available" without the call
ever reaching OpenBot (stream_json.py, `unavailable`), and the member told the person its browser
"stopped working" (live evals jules-1 and jules-3, 8-9 Nov 2026). Whether a hand-off turn should get
the person's computer is the maintainer's decision, not this module's: it says why the computer is
missing, and what to say and do instead.
"""

from __future__ import annotations

import re

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
COMPUTER_PREFIX = "computer_"
_COMPUTER_TOOL = re.compile(r"\bcomputer_[a-z]+(?:_[a-z]+)*\b")


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


def _names(missing: list[str]) -> str:
    return missing[0] if len(missing) == 1 else ", ".join(missing[:-1]) + " and " + missing[-1]


_NEVER_BROKEN = (
    "Nothing is broken: do not call them (Claude Code would answer \"No such tool available\" and "
    "the step is lost), and never say your browser or your computer stopped working or stopped "
    "responding."
)


# OpenBot offers no computer tool in a server-run turn when the person switched the computer or the
# browser off (server/src/computer/offered.ts), and the tool list never says so. This note cannot tell
# that from the other reasons, so it names it as the one to say when the member must explain.
_SWITCHED_OFF = (
    "The usual reason is that the person switched your browser or computer off in their settings "
    "(switched off by the person, not broken): if you need a page, say plainly that your browser is "
    "switched off in settings and that the person can switch it on there."
)


def computer_note(kind: str, missing: list[str], sender: str = "") -> str:
    """Why these computer tools are not offered on this turn. `kind` is "relay" (the answer to work
    this member handed over, coming back), "hop" (a colleague handed this member the work, `sender`
    is who), "handoff" (a hand-off of some other kind) or "not_offered" (nothing says why)."""
    names = _names(missing)
    if kind == "not_offered":
        return (
            f"Your computer tools ({names}) are not offered on this turn, and OpenBot gave no reason with "
            "the tool list. Do not call them: Claude Code would answer \"No such tool available\". If you "
            "need a page, say exactly that (OpenBot did not offer your computer on this turn), never that "
            f"a tool stopped working, then follow your instructions for working without it. {_SWITCHED_OFF}"
        )
    if kind == "hop":
        return (
            f"Why your computer is not offered on this turn: {sender} handed you this work, and OpenBot "
            f"runs a handed-over turn on its server without a browser, so none of your computer tools "
            f"({names}) is offered. {_NEVER_BROKEN} Do what you can without them, as your instructions "
            f"say. Your answer goes back to {sender} by itself: say plainly in it what you could not "
            f"check because there was no browser, so {sender} can tell the person."
        )
    reason = (
        "this turn brings back the answer to work that was handed over in this conversation, and "
        "OpenBot runs it on its server where a browser is not always offered"
        if kind == "relay"
        else "OpenBot runs this turn as a hand-off, on its server where a browser is not always offered"
    )
    return (
        f"Why your computer is not offered on this turn: {reason}, so none of your computer tools "
        f"({names}) is offered. {_NEVER_BROKEN} Work as your instructions say when you have no computer "
        "tools. If a page still has to be opened or checked, say in one sentence what you could not "
        "check here and that you will do it when the person writes in this conversation: their next "
        "message in this conversation is an ordinary turn, where your computer is offered again when "
        "this deployment allows it. Make that your Next step. " + _SWITCHED_OFF
    )


def _computer_tools_named(run: RunInput, member: Member) -> list[str]:
    """The computer tools this member relies on: the ones its prompt names, and any it called earlier
    in this conversation."""
    named = set(_COMPUTER_TOOL.findall(member.system_prompt))
    for message in run.messages:
        for call in message.get("toolCalls") or []:
            function = call.get("function") if isinstance(call, dict) else None
            name = function.get("name") if isinstance(function, dict) else None
            if isinstance(name, str) and name.startswith(COMPUTER_PREFIX):
                named.add(name)
    return sorted(named)


def computer_notes_for(run: RunInput, member: Member) -> list[str]:
    """One note when the member relies on computer tools this run does not offer, saying why as far
    as the run shows; none when they are all offered or the member never uses them."""
    offered = {tool.get("name") for tool in run.tools}
    missing = [name for name in _computer_tools_named(run, member) if name not in offered]
    if not missing:
        return []
    claims = run_claims(run.assertion)
    latest = latest_user_message(run.messages)
    if latest is not None:
        attribution = ATTRIBUTION.match(message_text(latest))
        if attribution:
            return [computer_note("hop", missing, _who(attribution.group(1)))]
        if is_envelope(latest):
            return [computer_note("relay", missing)]
    if claims_a_handoff(claims):
        return [computer_note("handoff", missing)]
    return [computer_note("not_offered", missing)]


def notes_for(run: RunInput, member: Member) -> list[str]:
    """The notes for this run's system text: why message_bot is missing, when the member's prompt
    relies on it and OpenBot did not offer it, and why its computer tools are missing, when it relies
    on those; each saying exactly why as far as this run shows. None when nothing it relies on is
    missing."""
    return [*_message_bot_notes(run, member), *computer_notes_for(run, member)]


def _message_bot_notes(run: RunInput, member: Member) -> list[str]:
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
