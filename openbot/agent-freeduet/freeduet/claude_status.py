"""What a person is told about Claude Code when it cannot answer, and the one status the probe gives (docs/design/
first-start.md sections 4 and 5, slice S2).

The words live here once, in English (the app's interface is English): a plain sentence the person can act on, with no
command to type, no path, no account, and nothing the CLI printed. A chat shows these sentences as the run error of a
failed turn (claude_cli.py, claude_engine.py). The probe's answer becomes one status (`status_of`), which
`POST /engines/claude/check` returns. The buttons that go beside a sentence belong to the app's card (slice S5).
"""

from .engine_adapter import ProbeResult

#: The program is not there: its start failed, a build did not install it, or CLAUDE_BIN names nothing.
MISSING = "missing"
#: The program is there and holds no sign-in.
NOT_SIGNED_IN = "not_signed_in"
#: The program is there and signed in.
SIGNED_IN = "signed_in"
#: The probe could not tell (it timed out, or its answer was not one it could read). Never read as "no".
UNKNOWN = "unknown"

#: Only what is true today. FreeDuet does not add the program itself yet (slice S8, decisions D2 and D3), so the
#: sentence says where the program comes from and does not promise that FreeDuet will add it.
MISSING_SENTENCE = (
    "Claude is not installed on this computer yet. It comes from Anthropic's own package, "
    "which is added when FreeDuet's service is built."
)
#: The person signs in on Claude's own page. FreeDuet never sees the password.
NOT_SIGNED_IN_SENTENCE = (
    "Claude is not connected yet. You sign in on Claude's own page; FreeDuet never sees your password."
)


def status_of(result: ProbeResult) -> str:
    """The probe's findings as one status. A missing program is `installed` False; otherwise the sign-in decides, and
    None (could not tell) is never read as "not signed in" (engine_adapter.ProbeResult)."""
    if result.installed is False:
        return MISSING
    if result.signed_in is False:
        return NOT_SIGNED_IN
    if result.signed_in is True:
        return SIGNED_IN
    return UNKNOWN
