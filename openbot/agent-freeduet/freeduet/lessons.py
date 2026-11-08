"""Lessons (docs/M1_PLAN.md D16): standing corrections for one member, approved by the person.

Iris proposes a lesson, with its evidence; it is stored `pending` under a fresh random code. It
becomes `active` only when agent-freeduet itself, never a model, finds the person's approval, and
from then on it is added to that member's system text on every run (transcript.py). Removal needs no
approval and stays on record in the file, with its time and run.

Files: `<FREEDUET_DATA_DIR>/lessons/<member>.json`, written whole (temporary file, then rename) under
one lock for the folder. Lesson text and evidence are redacted with the checkpoint writer's rules.

THE APPROVAL RULE (`activate_from_transcript`). A pending lesson becomes active when, in a run:

1. the run is for Iris (bot id `freeduet`, origin.IRIS_ID), being rendered by this service;
2. the run is not a Bot-to-Bot hop: its signed run statement claims no hand-off and no depth, no
   message id starts with `handoff-`, and no user message carries the wording OpenBot writes into
   hand-overs, relayed answers and notices (origin.ENVELOPE_MARKERS). Any one of these and nothing
   in the run approves anything;
3. a message with role `user` (never assistant, tool, system or developer) that is not such an
   envelope and is not the person's answer to a Bot's question (it starts "In response to your
   question:", which begins with the Bot's own words), has a line that starts with "approve" (or the Italian "approvo")
   followed directly by the code, for example "approve L-7K3Q" (several codes may follow, separated
   by spaces, commas or "and"). Only the text the person wrote counts: attachments are not read, and
   a group channel's quoted transcript is cut off first.

The line must start with the word, which is stricter than "contains": a person who quotes Iris's
"To approve, reply: approve L-7K3Q" back to ask about it approves nothing, and neither does "do not
approve L-7K3Q". This service cannot tell a person's own message from a Bot's relayed one except by
the marks OpenBot puts on the latter, so rule 2 refuses on any of them.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from pathlib import Path

from . import checkpoints, origin
from .locking import locked

log = logging.getLogger("freeduet.lessons")

FOLDER = "lessons"
LOCK_NAME = ".lock"
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: read aloud and retyped
CODE_LENGTH = 4
MAX_LESSON = 300
MAX_EVIDENCE = 1000
MAX_PENDING = 20
MAX_ACTIVE_IN_PROMPT = 20
MAX_REMOVED_KEPT = 100
STATUSES = ("pending", "active", "removed")

_CODE = r"L-[A-Z0-9]{4}"
_APPROVE = re.compile(
    rf"^[ \t]*[*_\"'`“]*(?:approve|approvo)[ \t]+({_CODE}(?:(?:[ \t]*[,;&][ \t]*|[ \t]+(?:and|e)[ \t]+|[ \t]+){_CODE})*)(?![A-Za-z0-9-])",
    re.IGNORECASE | re.MULTILINE,
)
_CODE_RE = re.compile(_CODE, re.IGNORECASE)


class LessonError(ValueError):
    """A request about lessons that cannot be done. The message is safe to show."""


def approval_sentence(code: str) -> str:
    return f"To approve, reply: approve {code} (in Italian: approvo {code})"


def _folder(root: Path | None) -> Path:
    base = checkpoints._data_root(root if root is not None else checkpoints.default_root())
    folder = checkpoints.confined(base, FOLDER)
    folder.mkdir(mode=0o700, exist_ok=True)
    return folder


def _member(value) -> str:
    if not isinstance(value, str) or not checkpoints.IDENTIFIER.fullmatch(value):
        raise LessonError("member must be a member id, such as bookkeeper")
    return value


def _file(folder: Path, member: str) -> Path:
    return checkpoints.confined(folder, f"{_member(member)}.json")


def _load(path: Path) -> list[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except ValueError as error:
        raise LessonError(f"The lessons file for {path.stem} cannot be read.") from error
    rows = data.get("lessons") if isinstance(data, dict) else None
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _save(path: Path, member: str, rows: list[dict]) -> None:
    removed = [row for row in rows if row.get("status") == "removed"]
    if len(removed) > MAX_REMOVED_KEPT:
        drop = {id(row) for row in removed[: len(removed) - MAX_REMOVED_KEPT]}
        rows = [row for row in rows if id(row) not in drop]
    content = json.dumps({"member": member, "lessons": rows}, ensure_ascii=False, indent=2) + "\n"
    checkpoints.atomic_write(path, content)


def _members(folder: Path) -> list[str]:
    return sorted(
        path.stem for path in folder.glob("*.json") if checkpoints.IDENTIFIER.fullmatch(path.stem)
    )


def _all(folder: Path) -> dict[str, list[dict]]:
    return {member: _load(_file(folder, member)) for member in _members(folder)}


def _text(value, name: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise LessonError(f"{name} must be a non-empty text")
    flat = " ".join(value.split())
    if len(flat) > limit:
        raise LessonError(f"{name} must be at most {limit} characters")
    return checkpoints.redact(flat)


def _new_code(taken: set[str]) -> str:
    while True:
        code = "L-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in taken:
            return code


def _public(member: str, row: dict) -> dict:
    keys = ("code", "status", "lesson", "evidence", "proposed_at", "approved_at")
    return {"member": member, **{key: row.get(key) for key in keys}}


def propose(member, lesson, evidence, *, thread: str, run: str, known=None, now: str, root=None) -> dict:
    """Store a pending lesson. Returns its public record, with `existing` true when the same text
    was already pending or active for that member (no second copy is made)."""
    member = _member(member)
    if known is not None and member not in known:
        raise LessonError(f"There is no team member with the id {member}.")
    lesson = _text(lesson, "lesson", MAX_LESSON)
    evidence = _text(evidence, "evidence", MAX_EVIDENCE)
    folder = _folder(root)
    with locked(folder / LOCK_NAME):
        everything = _all(folder)
        rows = everything.get(member, [])
        for row in rows:
            if row.get("status") in ("pending", "active") and row.get("lesson") == lesson:
                return {**_public(member, row), "existing": True}
        if sum(row.get("status") == "pending" for row in rows) >= MAX_PENDING:
            raise LessonError(
                f"{MAX_PENDING} lessons for {member} already wait for the person; ask about those first."
            )
        taken = {row.get("code") for rows_ in everything.values() for row in rows_}
        row = {
            "code": _new_code(taken),
            "status": "pending",
            "lesson": lesson,
            "evidence": evidence,
            "proposed_at": now,
            "proposed_in": {"thread": thread, "run": run},
            "approved_at": None,
            "approved_in": None,
        }
        _save(_file(folder, member), member, [*rows, row])
    return {**_public(member, row), "existing": False}


def list_lessons(member=None, root=None) -> list[dict]:
    """Pending and active lessons, oldest first; one member's when `member` is given."""
    folder = _folder(root)
    members = [_member(member)] if member is not None else _members(folder)
    found = []
    for name in members:
        for row in _load(_file(folder, name)):
            if row.get("status") in ("pending", "active"):
                found.append(_public(name, row))
    return found


def remove(code, *, thread: str, run: str, now: str, root=None) -> dict | None:
    """Mark a pending or active lesson removed. None when no such lesson is pending or active."""
    if not isinstance(code, str) or not _CODE_RE.fullmatch(code.strip()):
        raise LessonError("code must look like L-7K3Q")
    code = code.strip().upper()
    folder = _folder(root)
    with locked(folder / LOCK_NAME):
        for member, rows in _all(folder).items():
            for row in rows:
                if row.get("code") == code and row.get("status") in ("pending", "active"):
                    previous = row["status"]
                    row.update(status="removed", removed_at=now, removed_in={"thread": thread, "run": run})
                    _save(_file(folder, member), member, rows)
                    log.info("lesson %s for %s removed (was %s)", code, member, previous)
                    return {**_public(member, row), "was": previous}
    return None


def approval_codes(messages: list[dict]) -> dict[str, str]:
    """The codes the person approved in these messages (rule 3 above), each with the id of the
    message that approved it."""
    codes: dict[str, str] = {}
    for message in messages:
        if message.get("role") != "user" or origin.is_envelope(message):
            continue
        text = origin.message_text(message)
        if text.lstrip().startswith(origin.QUESTION_RESPONSE):
            continue
        text = text.split(origin.GROUP_TRANSCRIPT, 1)[0]
        for match in _APPROVE.finditer(text):
            for code in _CODE_RE.findall(match.group(1)):
                codes.setdefault(code.upper(), str(message.get("id") or ""))
    return codes


def activate_from_transcript(bot_id: str, messages: list[dict], assertion: str, *, thread: str, run: str,
                             now: str, root=None) -> list[str]:
    """Activate the pending lessons this run's transcript approves, by the rule above. Returns the
    codes it activated."""
    if bot_id != origin.IRIS_ID or origin.is_handoff_run(messages, assertion):
        return []
    approved = approval_codes(messages)
    if not approved:
        return []
    folder = _folder(root)
    activated = []
    with locked(folder / LOCK_NAME):
        for member, rows in _all(folder).items():
            changed = False
            for row in rows:
                code = row.get("code")
                if row.get("status") == "pending" and code in approved:
                    row.update(
                        status="active",
                        approved_at=now,
                        approved_in={"thread": thread, "run": run, "message": approved[code]},
                    )
                    activated.append(code)
                    changed = True
            if changed:
                _save(_file(folder, member), member, rows)
    for code in activated:
        log.info("lesson %s activated by the person's message", code)
    return activated


def active_for(member: str, root=None) -> list[str]:
    """The member's active lessons for its prompt: at most 20, newest last."""
    folder = _folder(root)
    try:
        rows = _load(_file(folder, member))
    except LessonError:
        log.warning("lessons for %s not read", member, exc_info=True)
        return []
    active = [row for row in rows if row.get("status") == "active" and isinstance(row.get("lesson"), str)]
    active.sort(key=lambda row: str(row.get("approved_at") or ""))
    return [f"{row['lesson']} ({row.get('code')})" for row in active[-MAX_ACTIVE_IN_PROMPT:]]
