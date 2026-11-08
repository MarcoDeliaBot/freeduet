"""The team member a run is for, and its prompt, from the tenant package's agents.yaml (D2, D3).

Neither the URL nor the body names the agent, so the member is the one OpenBot says it is in
`forwardedProps.openbotBotId`, and the standing-role message OpenBot puts first in every run
(`standing-role:<id>`, server/src/copilot.ts) must agree. A run where the two disagree is refused:
running one member's prompt under another member's grants is the mistake this check exists for.

Only `id` and `system_prompt` are read from each row. The others (`type`, `endpoint`) hold
`${...}` placeholders for the server to expand and mean nothing here.

A Bot a person created in the app is not in agents.yaml but still reaches this endpoint, since it
falls back to the managed one. Its prompt is its standing role, which OpenBot sends first.
"""

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

DEFAULT_AGENTS_FILE = "/app/tenant/agents.yaml"
STANDING_ROLE_PREFIX = "standing-role:"


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


def _standing_role(bot_id: str, messages: list[dict]) -> str | None:
    """The standing role's text when messages[0] is this Bot's, else None."""
    first = messages[0] if messages else {}
    if first.get("id") != f"{STANDING_ROLE_PREFIX}{bot_id}":
        return None
    content = first.get("content")
    return content.strip() if isinstance(content, str) else ""


def resolve_member(bot_id: str, messages: list[dict], path: Path | None = None) -> Member:
    if not bot_id:
        raise MemberError("This run did not say which team member it is for.")
    standing = _standing_role(bot_id, messages)
    if standing is None:
        raise MemberError("This run's standing role does not match the team member it names, so it was not run.")
    prompt = load_prompts(path).get(bot_id) or standing
    if not prompt:
        raise MemberError("This team member has no instructions, so it was not run.")
    return Member(id=bot_id, system_prompt=prompt)
