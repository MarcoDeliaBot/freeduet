"""The team member a run is for, and its prompt, from the tenant package's agents.yaml (D2, D3).

Neither the URL nor the body names the agent, so the member is the one OpenBot says it is in
`forwardedProps.openbotBotId`. That value is trusted: OpenBot's own middleware sets it on every run
(server/src/copilot.ts, runWith) and only OpenBot reaches this service, over the managed endpoint
with `x-openbot-agent-token` (app.py refuses anything else). A run with no bot id is refused.

OpenBot also sends the Bot's standing role as a system message with id `standing-role:<id>`. It is
NOT always first: other OpenBot middleware runs inside the one that adds it and puts its own system
rows in front (`openbot:personal-memory`, `openduet:channel`, `openbot:learned-skills`). A browser
chat clones the agent and loses those rows, so the role happened to be first there; a Bot-to-Bot hop
(agents/handoff-delivery.ts) builds the agent without cloning and keeps them, so the role is second
or third (tests/fixtures/handoff_hop_run.json, recorded from the server's own wiring by
server/tests/freeduet-handoff.test.ts). This Bot's role is therefore found wherever it is.

A standing role or holdings row that names ANOTHER Bot is never this member's instructions:
transcript.py quotes it as context, outside the system prompt.

Only `id` and `system_prompt` are read from each row of agents.yaml. The others (`type`, `endpoint`)
hold `${...}` placeholders for the server to expand and mean nothing here.

A Bot a person created in the app is not in agents.yaml but still reaches this endpoint, since it
falls back to the managed one. Its prompt is its standing role.
"""

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

DEFAULT_AGENTS_FILE = "/app/tenant/agents.yaml"
STANDING_ROLE_PREFIX = "standing-role:"
# OpenBot's per-Bot system rows: the role (copilot.ts, standingRoleMessage) and what it holds
# (copilot.ts, holdingsMessageFor). Each carries the Bot's id after the colon.
BOT_ROW_PREFIXES = (STANDING_ROLE_PREFIX, "granted-tools:")
SYSTEM_ROLES = {"system", "developer"}


class MemberError(Exception):
    """This run cannot be matched to a team member. The message is safe to show the person."""


@dataclass(frozen=True)
class Member:
    id: str
    system_prompt: str


def agents_file() -> Path:
    return Path(os.environ.get("FREEDUET_AGENTS_FILE") or DEFAULT_AGENTS_FILE)


_cache: dict[Path, tuple[float, dict[str, str]]] = {}


def load_prompts(path: Path | None = None) -> dict[str, str]:
    """Every member's prompt by id ("" when a row has none). Re-read when the file changes, so a
    prompt fix applies to the next turn without a restart. A missing file is an empty team."""
    path = path or agents_file()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    cached = _cache.get(path)
    if cached and cached[0] == mtime:
        return cached[1]
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as error:
        raise MemberError("The team file (agents.yaml) could not be read.") from error
    rows = data.get("agents") if isinstance(data, dict) else None
    prompts: dict[str, str] = {}
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and isinstance(row.get("id"), str):
            prompt = row.get("system_prompt")
            prompts[row["id"]] = prompt.strip() if isinstance(prompt, str) else ""
    _cache[path] = (mtime, prompts)
    return prompts


def bot_row_owner(message: dict) -> str | None:
    """The Bot an OpenBot per-Bot system row belongs to (`standing-role:<id>`, `granted-tools:<id>`),
    or None for any other message."""
    message_id = message.get("id")
    if message.get("role") not in SYSTEM_ROLES or not isinstance(message_id, str):
        return None
    for prefix in BOT_ROW_PREFIXES:
        if message_id.startswith(prefix):
            return message_id[len(prefix):]
    return None


def is_other_bots_row(message: dict, bot_id: str) -> bool:
    """A standing role or holdings row that names a Bot other than `bot_id`."""
    owner = bot_row_owner(message)
    return owner is not None and owner != bot_id


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            part["text"]
            for part in content
            if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str)
        )
    return ""


def standing_role(bot_id: str, messages: list[dict]) -> str | None:
    """This Bot's standing role, wherever OpenBot put it; None when the run carries none."""
    wanted = f"{STANDING_ROLE_PREFIX}{bot_id}"
    for message in messages:
        if message.get("id") == wanted and message.get("role") in SYSTEM_ROLES:
            return _text(message.get("content")).strip()
    return None


def resolve_member(bot_id: str, messages: list[dict], path: Path | None = None) -> Member:
    if not bot_id:
        raise MemberError("This run did not say which team member it is for.")
    prompt = load_prompts(path).get(bot_id) or standing_role(bot_id, messages) or ""
    if not prompt:
        raise MemberError("This team member has no instructions, so it was not run.")
    return Member(id=bot_id, system_prompt=prompt)
