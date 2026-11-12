"""The person's language, told to the member in its runtime notes (docs/M1_PLAN.md D26).

A member's prompt says "reply in the language the person writes in". In a turn nobody wrote (a
check-in, a routine, the morning brief, a report coming back from a colleague) that rule names no
language, and the member wrote in English to a person who reads Italian. When the deployment sets
`FREEDUET_PERSON_LANGUAGE`, OpenBot sends it with every run in `forwardedProps.openbotPersonLanguage`
(`server/src/freeduet/person-language.ts`), the place it already puts the other per-run facts
(`openbotBotId`, `openbotDeploymentTools`, `openbotRun`), and this module turns it into one run note.

The note rides in the same list as the tool notes (tool_notes.py): `segment.py` hands that list to the
segment's transcript and to the report guard's follow-up, so both say the same thing. Without the
setting there is no note and nothing else changes: the system text and the prompt are the ones this
service has always written.

The value is read the way every `forwardedProps` field is, tolerantly and only as far as it is used:
anything that is not a two-letter lowercase code with a short plain name is ignored, as if unset,
because the name goes into the member's system text and a request must not be able to put a sentence
there.
"""

from __future__ import annotations

import re

PROP = "openbotPersonLanguage"

_CODE = re.compile(r"\A[a-z]{2}\Z")
# Letters of any script, spaces and a few marks, 40 characters at most: a language's name, not a sentence.
_NAME = re.compile(r"\A[^\W\d_](?:[^\W\d_]|[ ,'()-]){0,39}\Z")


def from_props(value) -> tuple[str, str] | None:
    """The language code and its English name from the run's forwardedProps, or None when absent or
    not in the shape OpenBot sends."""
    if not isinstance(value, dict):
        return None
    code, name = value.get("code"), value.get("name")
    if not isinstance(code, str) or not _CODE.match(code):
        return None
    if not isinstance(name, str) or not _NAME.match(name):
        return None
    return code, name


def note(language: tuple[str, str]) -> str:
    """The one run note: the person's language, and what to do with it in a turn nobody wrote."""
    code, name = language
    named = code if name == code else f"{name} ({code})"
    return (
        f"The person's language is {named}. When a turn starts without a message from the "
        "person (a check-in, a routine, the morning brief, a report that comes back from a "
        "colleague), write everything the person will read in that language, cards and their titles "
        "included. When the person writes in another language, answer in theirs."
    )


def notes_for(run) -> list[str]:
    """The notes for this run: the language note when the deployment set one, else nothing."""
    language = getattr(run, "person_language", None)
    return [note(language)] if language else []
