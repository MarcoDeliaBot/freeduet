"""A tool call that a model wrote as TEXT (D116).

Some small models behind a gateway (the free router of OpenRouter picks one at random among those that claim tool
support) do not use the tool interface: they end the turn with an assistant message whose text is the call, for
example ``<tool_call id="call-1" name="gmail_search_messages">{"query": "in:inbox"}</tool_call>``. Delivered as the
answer, that text is useless to the person, and nothing was done. This module only RECOGNISES such text; it never runs,
parses into a call, or forwards anything. The router (engine_router.py) treats an engine whose turn ends this way as
having failed the turn for this one reason, and moves on.

It is conservative on purpose. A message is a text-written tool call only when it is ENTIRELY such a block, or when it
ENDS with one that starts on a line of its own and runs to the end of the message. Ordinary prose that mentions the
words (``a <tool_call> tag is ...``, a sentence about function calls, a JSON example in the middle of an explanation)
is not one. The shapes:

* ``<tool_call ...>`` and ``<function_call ...>`` (also ``<tool_calls>``, ``<function_calls>``), with or without the
  closing tag, when the tag has a ``name=`` attribute or its body starts with ``{`` or ``[``;
* ``<|tool_call|>`` and ``<|tool_call_start|>`` (the special tokens of a few small models), likewise;
* a fenced block opened with ```tool_call (or ```tool_calls, ```function_call) that runs to the end;
* (only when the turn offered tools) the whole message being one JSON object, or a list of them, with a ``name`` and ``arguments`` (or ``parameters``,
  or ``input``).
"""

from __future__ import annotations

import json
import re

#: The failure kind the router records (not one of the breaker's kinds: a model choice is not an engine's health).
TOOLS_AS_TEXT = "tools_as_text"
NOTE = TOOLS_AS_TEXT

#: A work bound: a longer message is read at its end only, where a block that "ends the message" would start.
MAX_READ = 20_000

_TAG = re.compile(
    r"(?:^|\n)[ \t]*(?:<(?:tool_calls?|function_calls?)\b(?P<attrs>[^>]*)>|<\|tool_calls?(?:_start|_begin)?\|>)"
    r"(?P<body>.*)\Z",
    re.DOTALL | re.IGNORECASE,
)
_FENCE = re.compile(r"(?:^|\n)[ \t]*```[ \t]*(?:tool_calls?|function_calls?)[ \t]*\n(?P<body>.*)\Z", re.DOTALL | re.IGNORECASE)
_NAME_ATTRIBUTE = re.compile(r"\bname\s*=\s*[\"']?[A-Za-z_]", re.IGNORECASE)
_CLOSERS = re.compile(r"</(?:tool_calls?|function_calls?)>|<\|tool_calls?(?:_end)?\|>|```", re.IGNORECASE)
_ARGUMENT_KEYS = ("arguments", "parameters", "input")


def _is_call(value: object) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("name"), str)
        and bool(value["name"].strip())
        and any(key in value for key in _ARGUMENT_KEYS)
    )


def _json_call(text: str) -> bool:
    stripped = text.strip()
    if stripped.startswith("```"):  # the whole message in a fence of its own, whatever its label
        match = re.fullmatch(r"```[A-Za-z_]*[ \t]*\n(.*?)\n?```", stripped, re.DOTALL)
        if match is None:
            return False
        stripped = match.group(1).strip()
    if not stripped or stripped[0] not in "{[":
        return False
    try:
        value = json.loads(stripped)
    except ValueError:
        return False
    if isinstance(value, list):
        return bool(value) and all(_is_call(item) for item in value)
    return _is_call(value)


def _block_body_is_call(body: str, attrs: str | None) -> bool:
    """A tag or fence counts only with a name attribute, or a body that is JSON-like, and nothing of prose after the block."""
    closer = _CLOSERS.search(body)
    if closer is not None and body[closer.end():].strip():
        return False  # prose after the block: the message does not END with it
    inner = _CLOSERS.sub("", body).strip()
    named = attrs is not None and _NAME_ATTRIBUTE.search(attrs) is not None
    if named:
        return True
    return bool(inner) and inner[0] in "{["


def looks_like_tool_call_text(text: object, tools_offered: bool = True) -> bool:
    """Whether an assistant message is, or ends with, a tool call written as text. False for anything else, and for a non-string.

    A whole message that is only JSON (bare, or in a fence of its own) counts only when the turn offered tools
    (``tools_offered``): a member asked to give JSON as its answer, with no tool to call, must not be switched. A tag or a
    ```tool_call fence names a call in itself, so it counts whatever was offered."""
    if not isinstance(text, str) or not text.strip():
        return False
    read = text if len(text) <= MAX_READ else text[-MAX_READ:]
    if tools_offered and _json_call(read):
        return True
    match = _FENCE.search(read)
    if match is not None and _block_body_is_call(match.group("body"), None):
        return True
    match = _TAG.search(read)
    return match is not None and _block_body_is_call(match.group("body"), match.group("attrs"))


def prose_before(text: str) -> str:
    """The text before the block that makes the message a tool call, for a router that keeps it; the whole text is not
    returned when it is all block, so '' then."""
    for pattern in (_FENCE, _TAG):
        match = pattern.search(text)
        if match is not None:
            return text[: match.start()].rstrip()
    return ""
