"""The person's engine choices, sent by the server with each run (docs/design/engines-dashboard.md section 5).

The engines file holds the installation's defaults. What the person chooses on the Engines page is kept by the
server (docs/ENGINES_PLAN.md E4), and the server sends it, for the member the run is for, in
`forwardedProps.openbotEngineChoices`: the place it already puts the other per-run facts (`openbotBotId`,
`openbotDeploymentTools`, `openbotRun`, and the person's language in person_language.py). This module turns it into
a value the router can lay over the file's own `switching:` entry.

``{"version": 1, "mode": "ask-first"}``. Every field is optional, and only the mode is read so far.

Read the way every `forwardedProps` field is, tolerantly and only as far as it is used: anything that is not the shape
the server sends (another version, a mode that is not one of the two, a field this service does not know) is ignored,
as if the person had chosen nothing, and the member runs on the file's values. A choice never blocks a turn, and it can
only pick one of the values the file's own format allows, so a lost or damaged one never makes a run spend more.

No key and no address ever travels here: the whole vocabulary is a version number and a mode. A run input may be
stored, so nothing secret may be put in one.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from .engines import MODES

PROP = "openbotEngineChoices"
#: What this service understands. The server sends it too, and `GET /engines` says it (`choices_version`), so the
#: page turns a control on only where the service behind it will honour the choice.
VERSION = 1


@dataclass(frozen=True)
class Choices:
    """What the person chose for the member this run is for. None in a field is "nothing chosen"."""

    mode: str | None = None


def from_props(value) -> Choices | None:
    """The choices from the run's forwardedProps, or None when absent or not in the shape the server sends."""
    if not isinstance(value, dict):
        return None
    version = value.get("version")
    # `True == 1` in Python: a boolean is not a version.
    if isinstance(version, bool) or version != VERSION:
        return None
    mode = value.get("mode")
    mode = mode if isinstance(mode, str) and mode in MODES else None
    if mode is None:
        return None
    return Choices(mode=mode)


def apply(switching, choices: Choices | None):
    """The member's switching (engines.py `Switching`) with the person's choices laid over it: their mode where they
    chose one, the file's everything else. The pin is the file's: the person cannot change it here yet, and a mode never
    lifts it."""
    if choices is None or choices.mode is None:
        return switching
    return replace(switching, mode=choices.mode)
