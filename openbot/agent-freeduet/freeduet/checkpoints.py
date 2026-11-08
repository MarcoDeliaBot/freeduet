# Ported from AI Continuity (https://github.com/MarcoDeliaBot/ai-continuity):
#   checkpoint.py (the checkpoint writer: validate_state, confined, atomic_write, render, save)
#   continuity/core.py (redact, redact_values)
#
# MIT License
#
# Copyright (c) 2026 Marco D'Elia
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Modified for FreeDuet:
# - A library function, save_checkpoint(), instead of a command line.
# - Checkpoints live under <FREEDUET_DATA_DIR>/handoff/<botId>/<threadId>/ (docs/M1_PLAN.md D13)
#   rather than <project>/.ai/handoff/<run>/: `agent` is the member's bot id and `run_id` the
#   AG-UI thread id, and both must be plain path segments.
# - No Git snapshot and no project index (STATE.md, INDEX.md): the data directory is not a
#   repository, and the member's files are in its own computer.
# - Every string in the state is redacted before it is written, with extra patterns for card
#   numbers, JWTs and a few vendor key formats (docs/ARCHITECTURE.md §2.5: no passwords, tokens or
#   card numbers in a checkpoint).
# - History files are published without ever replacing an existing one, and made read-only.
# - latest_checkpoint() reads back the newest valid entry for one member and thread.
"""Work checkpoints for FreeDuet's members, after AI Continuity's checkpoint writer.

A checkpoint keeps the facts of a member's work report (docs/ARCHITECTURE.md §2.5) so that the
router, Iris or the person can resume the task after an engine switch or an interruption. The
history is immutable JSON, one file per save; HANDOFF.md beside it is a readable view of the
newest one. A checkpoint never approves anything: approvals stay with OpenBot's gateway.

No model calls, no network and no dependencies beyond the standard library.
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import uuid

SCHEMA_VERSION = 1
WRITER_VERSION = "1.2.0+freeduet.1"
LIST_FIELDS = (
    "constraints", "completed", "decisions", "in_progress", "changed_files",
    "verification", "blockers", "next_steps",
)
STATE_FIELDS = frozenset({"objective", *LIST_FIELDS})
PHASES = ("planned", "in-progress", "blocked", "complete")
# A bot id (`inbox`, `agent_<uuid>`) or a thread id (a UUID): one path segment, no dots.
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")
MAX_STATE_BYTES = 128 * 1024
DEFAULT_DATA_DIR = "/data"

LABELS = {
    "constraints": "Constraints", "completed": "Completed", "decisions": "Decisions and reasons",
    "in_progress": "In progress or planned", "changed_files": "Changed files",
    "verification": "Checks and results", "blockers": "Issues and blockers", "next_steps": "Next steps",
}


def default_root() -> Path:
    """The data directory agent-freeduet writes to: FREEDUET_DATA_DIR, or /data."""
    return Path(os.environ.get("FREEDUET_DATA_DIR") or DEFAULT_DATA_DIR)


def validate_state(state, phase):
    if not isinstance(state, dict):
        raise ValueError("State must be a JSON object")
    if set(state) != STATE_FIELDS:
        raise ValueError("State must contain objective and all documented list fields only")
    if not isinstance(state["objective"], str) or not state["objective"].strip():
        raise ValueError("objective must be a non-empty string")
    for key in LIST_FIELDS:
        if not isinstance(state[key], list) or any(
            not isinstance(item, str) or not item.strip() for item in state[key]
        ):
            raise ValueError(f"{key} must be a list of non-empty strings")
    if phase not in PHASES:
        raise ValueError(f"phase must be one of {', '.join(PHASES)}")
    if phase != "complete" and not state["next_steps"]:
        raise ValueError("An unfinished task needs next_steps")
    if phase == "complete" and any(state[key] for key in ("in_progress", "blockers", "next_steps")):
        raise ValueError("A complete task cannot have unfinished work or blockers")


def _identifier(value, name):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ValueError(
            f"{name} must be 1 to 128 letters, digits, '_' or '-', starting with a letter or digit"
        )
    return value


def _data_root(raw) -> Path:
    try:
        root = Path(raw).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"Data directory is not available: {raw}") from exc
    if not root.is_dir():
        raise ValueError("Data directory must be a directory")
    if root == Path(root.anchor) or root == Path.home().resolve():
        raise ValueError("Choose a data directory, not the home or filesystem root")
    return root


def confined(root, *parts):
    target = root.joinpath(*parts)
    resolved = target.resolve()
    if not resolved.is_relative_to(root) or resolved == root:
        raise ValueError("Checkpoint path escapes the data directory")
    return target


def _private_dirs(root, *parts):
    # One level at a time, each checked before the next is made inside it.
    for depth in range(1, len(parts) + 1):
        confined(root, *parts[:depth]).mkdir(mode=0o700, exist_ok=True)
    return confined(root, *parts)


def _write_temporary(directory, content):
    fd, temporary = tempfile.mkstemp(prefix=".checkpoint-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        os.unlink(temporary)
        raise
    return temporary


def atomic_write(path, content):
    temporary = _write_temporary(path.parent, content)
    try:
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def publish_once(path, content):
    """Write `path` complete or not at all, read-only, and never over an existing file."""
    temporary = _write_temporary(path.parent, content)
    try:
        os.chmod(temporary, 0o400)
        os.link(temporary, path)
        return
    except FileExistsError:
        raise
    except OSError:
        pass  # A filesystem without hard links: exclusive create below, still never a replace.
    finally:
        os.unlink(temporary)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def _luhn(digits):
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def _mask_card(match):
    digits = re.sub(r"\D", "", match.group(0))
    return "[CARD NUMBER REDACTED]" if 13 <= len(digits) <= 19 and _luhn(digits) else match.group(0)


def redact(text):
    """Best-effort reduction, never a claim to detect every private datum."""
    text = str(text)
    text = re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----',
                  '[PRIVATE KEY REDACTED]', text, flags=re.S)
    # Match whole quoted values (including spaces) and quoted JSON keys.
    value = r'''(?P<value>"(?:\\.|[^"\\\r\n])*(?:"|(?=[\r\n]|$))|'(?:\\.|[^'\\\r\n])*(?:'|(?=[\r\n]|$))|[^\s"',;<>{}]+)'''
    labels = (r'api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|'
              r'(?:aws[_-]?)?(?:secret[_-]?access[_-]?key|access[_-]?key[_-]?id|session[_-]?token)|'
              r'password|passwd|secret(?:[_-]?value)?|token')

    def mask(match):
        secret = match.group('value')
        quote = secret[0] if secret[0] in ('"', "'") else ''
        return match.group('prefix') + quote + '[REDACTED]' + quote

    text = re.sub(r'(?i)(?P<prefix>\b(?:' + labels + r''')\b["']?\s*[=:]\s*)''' + value, mask, text)
    # A few explicit phrases; natural-language confidentiality is not detectable
    # in general. Avoid treating every use of "key" or "token" as a credential.
    text = re.sub(r'(?i)(?P<prefix>\bpassword(?:[ \t]+(?:del|della|di|per|for|of)'
                  r"[ \t]+[^\s:=]{1,64})?[ \t]+(?:è|e'|is)[ \t]+)" + value, mask, text)
    text = re.sub(r'(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]', text)
    text = re.sub(r'\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{20,})\b',
                  '[TOKEN REDACTED]', text)
    text = re.sub(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b', '[AWS KEY ID REDACTED]', text)
    # FreeDuet additions: Slack and Google keys, JSON Web Tokens, payment card numbers.
    text = re.sub(r'\bxox[abposr]-[A-Za-z0-9-]{10,}\b', '[TOKEN REDACTED]', text)
    text = re.sub(r'\bAIza[0-9A-Za-z_-]{35}\b', '[TOKEN REDACTED]', text)
    text = re.sub(r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b', '[TOKEN REDACTED]', text)
    text = re.sub(r'(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])', _mask_card, text)
    return text


def redact_values(value):
    """Sanitize strings before serialization without damaging JSON structure."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, list):
        return [redact_values(item) for item in value]
    if isinstance(value, dict):
        return {key: redact_values(item) for key, item in value.items()}
    return value


def render(checkpoint, filename):
    state = checkpoint["state"]
    lines = [
        "# Work checkpoint", "",
        f"Date (UTC): {checkpoint['created_at']}",
        f"Member: {checkpoint['agent']} | Thread: {checkpoint['run']} | Phase: {checkpoint['phase']}",
        f"Authoritative source: history/{filename}", "",
        "After an interruption, this view may be older than the checkpoint history.",
        "A checkpoint approves nothing: read it before any retry, so nothing happens twice.",
        "", "## Objective", "", state["objective"], "",
    ]
    for key in LIST_FIELDS:
        lines.extend([f"## {LABELS[key]}", ""])
        lines.extend([f"- {item}" for item in state[key]] or ["No items recorded."])
        lines.append("")
    return "\n".join(lines)


def handoff_dir(root, agent, run_id) -> Path:
    """<root>/handoff/<agent>/<run_id>, checked, without creating anything."""
    base = _data_root(root)
    return confined(base, "handoff", _identifier(agent, "agent"), _identifier(run_id, "run_id"))


def save_checkpoint(root, run_id, agent, phase, state):
    """Save one checkpoint for member `agent` (its bot id) on thread `run_id` (the AG-UI threadId).

    Publishes an immutable history file first, then replaces HANDOFF.md. Returns what was written;
    `warnings` is not empty when the history was saved but the readable view was not. Raises
    ValueError for invalid input, before anything is written.
    """
    base = _data_root(root)
    _identifier(agent, "agent")
    _identifier(run_id, "run_id")
    validate_state(state, phase)
    clean = redact_values(copy.deepcopy(state))
    if len(json.dumps(clean, ensure_ascii=False).encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError("State exceeds 128 KiB; reference original documents instead")

    now = dt.datetime.now(dt.timezone.utc)
    filename = now.strftime("%Y%m%dT%H%M%S.%fZ-") + uuid.uuid4().hex[:12] + ".json"
    _private_dirs(base, "handoff", agent, run_id, "history")
    history = confined(base, "handoff", agent, run_id, "history", filename)
    view = confined(base, "handoff", agent, run_id, "HANDOFF.md")
    checkpoint = {
        "schema_version": SCHEMA_VERSION, "writer_version": WRITER_VERSION,
        "created_at": now.isoformat(), "agent": agent, "run": run_id,
        "phase": phase, "state": clean,
    }
    publish_once(history, json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n")
    warnings = []
    try:
        atomic_write(view, render(checkpoint, filename))
    except OSError as exc:
        warnings.append(f"Checkpoint saved, but HANDOFF.md was not updated: {exc}")
    return {"saved": True, "checkpoint": str(history), "handoff": str(view),
            "phase": phase, "warnings": warnings}


def latest_checkpoint(root, agent, run_id):
    """The newest valid checkpoint for `agent` on `run_id`, or None. Invalid files are skipped."""
    history = handoff_dir(root, agent, run_id) / "history"
    base = _data_root(root)
    if not history.is_dir():
        return None
    for path in sorted(history.glob("*.json"), reverse=True):
        try:
            confined(base, "handoff", agent, run_id, "history", path.name)
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("schema_version") != SCHEMA_VERSION:
                raise ValueError("Unsupported schema")
            if payload.get("agent") != agent or payload.get("run") != run_id:
                raise ValueError("Checkpoint belongs to another member or thread")
            validate_state(payload["state"], payload["phase"])
            return {"file": str(path), "checkpoint": payload}
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue
    return None
