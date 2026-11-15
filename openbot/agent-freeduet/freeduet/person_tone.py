"""The tone the person chose for this member, told in one run note (docs/design/settings-in-chat.md, 8.10).

The person can ask a member to be `warm` or `formal` in how it talks to them. OpenBot sends the choice
with the run in `forwardedProps.openbotPersonTone` (`server/src/freeduet/person-tone.ts`), the way it
sends the person's language (person_language.py), and this module turns it into one sentence in the run
notes. `plain` is the default and means nothing is said: with it, or with no setting, the system text and
the prompt are the ones this service has always written (the goldens pin that).

The note never rewrites the member's instructions. It asks for a manner of speaking in the member's own
messages to the person, and says in the same sentence what it does not reach: emails and documents for
other people, safety rules, and the wording of approvals and cards.

The value is read tolerantly: anything that is not one of the two known non-default values is ignored,
as if unset, because a request must not be able to put a sentence into the member's system text.
"""

from __future__ import annotations

PROP = "openbotPersonTone"

# plain is the default and says nothing, so it is not here.
_NOTES = {
    "warm": (
        "The person likes a warm tone. In your own messages to them, be friendly and encouraging, "
        "and keep it short. This does not change emails or documents you write for other people, "
        "your safety rules, or the wording of approvals and cards."
    ),
    "formal": (
        "The person likes a formal tone. In your own messages to them, be polite and precise, "
        "without chatty phrases or emoji. This does not change emails or documents you write for "
        "other people, your safety rules, or the wording of approvals and cards."
    ),
}


def from_props(value) -> str | None:
    """The tone from the run's forwardedProps, or None when absent, `plain` or not in the shape
    OpenBot sends ({"version": 1, "tone": "warm"|"formal"})."""
    if not isinstance(value, dict) or value.get("version") != 1:
        return None
    tone = value.get("tone")
    return tone if isinstance(tone, str) and tone in _NOTES else None


def notes_for(run) -> list[str]:
    """The notes for this run: one sentence group for a chosen tone, else nothing."""
    tone = getattr(run, "person_tone", None)
    return [_NOTES[tone]] if tone in _NOTES else []
