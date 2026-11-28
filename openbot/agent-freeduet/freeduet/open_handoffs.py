"""The hand-offs this conversation has open, as the server's own hop queue tells them (D185, docs/M1_PLAN.md).

Iris must not say "Kai is working" from her own words, and the hand-off claim guard (handoff_claim_guard.py,
D184) must not guess from the transcript which hand-offs are open. The server holds the queue behind the D168
work card, and sends the open ones of the asking conversation with the run, in
`forwardedProps.openbotOpenHandoffs` (`server/src/freeduet/open-handoffs.ts`), the way it sends the person's
language and tone. This module reads it and turns it into one run note for Iris.

What it holds, per hand-off: the asked member's id, a state (working, queued, waiting, stuck), when it started
and the time of its last sign of life. Never a task, an argument or a path. The server sends it only on Iris's
runs and drops what a caller put under the key.

Unknown is not none. `from_props` gives None when the value is absent or not in the shape the server sends (a
malformed entry makes the whole value unknown, never a crash and never a guess), and the guard then falls back
to the transcript. An empty list is a real answer: no hand-off is open. The elapsed times are the server's own
(`at` is the server's clock when it read the queue), so a skew between the two machines changes nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

PROP = "openbotOpenHandoffs"
IRIS = "freeduet"

STATES = ("working", "queued", "waiting", "stuck")
_ID = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z")
_MAX = 50  # the server reads at most 50 hops


@dataclass(frozen=True)
class Open:
    to: str
    state: str
    since: datetime
    last_event: datetime


@dataclass(frozen=True)
class OpenHandoffs:
    items: tuple[Open, ...]
    at: datetime

    def members(self) -> frozenset[str]:
        return frozenset(item.to for item in self.items)


def _time(value) -> datetime | None:
    if not isinstance(value, str) or not 10 <= len(value) <= 40:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def from_props(value) -> OpenHandoffs | None:
    """The server's open hand-offs from the run's forwardedProps, or None (unknown) when absent or not in the
    shape the server sends ({"version": 1, "handoffs": [{to, state, since, lastEventAt}], "at"})."""
    try:
        if not isinstance(value, dict) or value.get("version") != 1:
            return None
        raw, at = value.get("handoffs"), _time(value.get("at"))
        if not isinstance(raw, list) or len(raw) > _MAX or at is None or at.tzinfo is None:
            return None
        items = []
        for entry in raw:
            if not isinstance(entry, dict):
                return None
            to, state = entry.get("to"), entry.get("state")
            since, last = _time(entry.get("since")), _time(entry.get("lastEventAt"))
            if not isinstance(to, str) or not _ID.match(to) or state not in STATES:
                return None
            if since is None or last is None or since.tzinfo is None or last.tzinfo is None:
                return None
            items.append(Open(to, state, since, last))
        return OpenHandoffs(tuple(items), at)
    except Exception:  # noqa: BLE001 - a malformed value must never end a run
        return None


def _minutes(start: datetime, at: datetime) -> str:
    seconds = max(0, int((at - start).total_seconds()))
    if seconds < 60:
        return "under a minute"
    minutes = seconds // 60
    return f"{minutes} min" if minutes < 120 else f"{minutes // 60} h"


_STATE_WORDS = {
    "working": "is working",
    "queued": "has not started yet (queued)",
    "waiting": "is waiting for the person (a card or a question)",
    "stuck": "has shown no sign of life for a while (stuck)",
}


def _name(member_id: str, names: dict[str, str]) -> str:
    name = names.get(member_id)
    return f"{name} ({member_id})" if name and name != member_id else member_id


def note(found: OpenHandoffs, names: dict[str, str] | None = None) -> str:
    """The one run note: who is working for this conversation right now, from the server's queue."""
    names = names or {}
    if not found.items:
        return (
            "The server's own record of this conversation's hand-offs: no colleague is working for it right now "
            "(no hand-off is open). Do not say that a colleague has the work, or is working, unless a message_bot "
            "call of this turn returned."
        )
    lines = [
        f"{_name(item.to, names)} {_STATE_WORDS[item.state]}, "
        f"for {_minutes(item.since, found.at)}, last sign of life {_minutes(item.last_event, found.at)} ago"
        for item in found.items
    ]
    return (
        "The server's own record of this conversation's hand-offs, right now (it is the truth, not the transcript): "
        + "; ".join(lines)
        + ". A colleague not listed here is not working for this conversation."
    )


def notes_for(run, member) -> list[str]:
    """The notes for this run: the open hand-offs, only for Iris and only in the person's own live turn, else
    nothing (a hand-off's own run and a routine are told nothing)."""
    found = getattr(run, "open_handoffs", None)
    if found is None or getattr(member, "id", None) != IRIS:
        return []
    from . import handoff_claim_guard, members  # here: this module is imported by agui, which they import

    try:
        if not handoff_claim_guard.is_live_person_turn(run.messages, run.assertion):
            return []
        names = {}
        from . import cannot_guard

        for member_id, prompt in members.load_prompts().items():
            name = cannot_guard._name_of(prompt)
            if name:
                names[member_id] = name
    except Exception:  # noqa: BLE001 - a missing team file only costs the display names
        names = {}
    return [note(found, names)]
