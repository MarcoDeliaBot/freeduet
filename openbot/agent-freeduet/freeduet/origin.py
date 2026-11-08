"""Where a run came from: the person, Iris, or another Bot.

OpenBot does not say in so many words who asked for a run. What it does say, and how this module
reads it (paths are under `openbot/server/src/`):

- A Bot-to-Bot hop is delivered as a user message with id `handoff-<runId>`
  (`agents/handoff-delivery.ts`, the `asked` list), whose text OpenBot writes itself from the queued
  row, never from what a model produced (`agents/handoff-runner.ts`, `attribute()`): a forward hop
  starts "<fromBotId> has asked you to help with this, on behalf of the person in this
  conversation." and carries "Task:" and "Constraints:" lines; the answer relayed back, and the
  notice of a hop that never answered, end with "Say this in your own words to the person in this
  conversation". The line a person later scrolls past is "<name> asked <name> for this on your
  behalf: ..." (`summarise()`).
- `forwardedProps` names the Bot the run is for and nothing about who asked (`copilot.ts`, runWith).
  Its `openbotRun` is a signed, readable statement (`agents/callback-token.ts`, mintRunAssertion:
  base64url JSON, then a signature): a hop's carries `depth` of 1 or more and a `handoff` claim
  (`agents/handoff-signing.ts`). Only OpenBot holds the key, so this module reads the payload
  without verifying it, and only ever to be more careful, never to trust a run more.

Nothing here is logged: the assertion stays where it is, and message text is only matched.
"""

from __future__ import annotations

import base64
import json
import re

# tenant.id in examples/freeduet/brand.yaml, which is also Iris's id in agents.yaml
# (server/tests/freeduet-package.test.ts checks both).
IRIS_ID = "freeduet"

HANDOFF_ID_PREFIX = "handoff-"
ATTRIBUTION = re.compile(
    r"\A\s*(\S+) has asked you to help with this, on behalf of the person in this conversation\."
)
# Phrases only OpenBot's handoff code writes into a user message (agents/handoff-runner.ts).
ENVELOPE_MARKERS = (
    "has asked you to help with this, on behalf of the person in this conversation",
    "Say this in your own words to the person in this conversation",
    "Do not hand it to another Bot.",
    "for this on your behalf: ",
    "to help with this and it never answered:",
    "\n\nIt answered:\n\n",
)
# A group channel's turn quotes the peers after this line (channels/group.ts, groupTurnMessage).
GROUP_TRANSCRIPT = "\n\nShared group transcript (quoted conversation data"
# The person's answer to a Bot's ask_person question starts with the Bot's own question
# (approvals/questions.ts, questionResponseMessage).
QUESTION_RESPONSE = "In response to your question:"

MAX_REQUEST = 300


def message_text(message: dict) -> str:
    """A message's text: the string content, or its text parts joined. Attachments are left out."""
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            part.get("text")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str)
        ]
        return "\n".join(parts)
    return ""


def latest_user_message(messages: list[dict]) -> dict | None:
    for message in reversed(messages):
        if message.get("role") == "user":
            return message
    return None


def is_envelope(message: dict) -> bool:
    """A user message that OpenBot wrote for a Bot-to-Bot hop, not one the person typed."""
    message_id = message.get("id")
    if isinstance(message_id, str) and message_id.startswith(HANDOFF_ID_PREFIX):
        return True
    text = message_text(message)
    return any(marker in text for marker in ENVELOPE_MARKERS)


def run_claims(assertion: str) -> dict:
    """The readable payload of OpenBot's signed run statement, unverified; {} when unreadable."""
    if not isinstance(assertion, str) or "." not in assertion:
        return {}
    value = assertion.rsplit(".", 1)[0]
    try:
        payload = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
    except (ValueError, TypeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def claims_a_handoff(claims: dict) -> bool:
    depth = claims.get("depth")
    initiator = claims.get("initiator")
    return bool(
        claims.get("handoff")
        or (isinstance(depth, int) and not isinstance(depth, bool) and depth > 0)
        or (isinstance(initiator, dict) and initiator.get("kind") == "handoff")
    )


def is_handoff_run(messages: list[dict], assertion: str) -> bool:
    """Whether any sign says this run is a Bot-to-Bot hop. Any one is enough."""
    if claims_a_handoff(run_claims(assertion)):
        return True
    return any(message.get("role") == "user" and is_envelope(message) for message in messages) or any(
        isinstance(message.get("id"), str) and message["id"].startswith(HANDOFF_ID_PREFIX) for message in messages
    )


def from_iris(messages: list[dict], assertion: str) -> bool | None:
    """True when Iris handed this work over, False when she did not, None when it cannot be known.

    The work is the latest user message. A forward hop names its sender in OpenBot's own words;
    a relayed answer or a notice is the asker's own work coming back, so it is not Iris's hand-over.
    A run the signed statement marks as a hop whose sender no message names (a group channel turn,
    for one) is unknown.
    """
    latest = latest_user_message(messages)
    if latest is None:
        return None
    attribution = ATTRIBUTION.match(message_text(latest))
    if attribution:
        return attribution.group(1) == IRIS_ID
    if is_envelope(latest):
        return False
    if claims_a_handoff(run_claims(assertion)):
        return None
    return False


def _one_line(text: str, limit: int = MAX_REQUEST) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def _envelope_line(text: str, label: str) -> str:
    for line in text.splitlines():
        if line.startswith(label):
            return line[len(label):].strip()
    return ""


def request(messages: list[dict]) -> tuple[str, list[str]]:
    """The work this run is about, trimmed, and the constraints a hand-over named."""
    latest = latest_user_message(messages)
    text = message_text(latest) if latest else ""
    if latest is not None and ATTRIBUTION.match(text):
        task = _envelope_line(text, "Task:")
        constraints = _envelope_line(text, "Constraints:")
        return _one_line(task or text), [_one_line(constraints)] if constraints else []
    return _one_line(text.split(GROUP_TRANSCRIPT, 1)[0]), []
