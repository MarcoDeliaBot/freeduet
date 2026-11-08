# Copyright the open-duet authors (https://github.com/Anil-matcha/open-duet).
# Licensed under the Apache License, Version 2.0; see LICENSE-APACHE-2.0 in openbot/agent-freeduet.
#
# Ported from Anil-matcha/open-duet, backend/app/services/local_claude_stream.py.
# Modified for FreeDuet: the parser returns typed items (message start, text delta, tool use,
# final result) in stream order instead of strings plus side lists; tool uses are kept only for the
# `freeduet` MCP server and carry their input; approval control requests, tool summaries, usage and
# the stored-message bookkeeping were removed (approvals belong to OpenBot, D4); the structured
# `error` an API-error assistant message carries is kept, for the sign-in check (D12).
"""Claude Code's `--output-format stream-json` lines as the few things a segment acts on.

The CLI interleaves many other events with the ones that matter (`system/init`, `system/status`,
`rate_limit_event`, and whatever a newer version adds). This parser acts on an allowlist and skips
everything else, so an unknown event, a malformed line or a missing field never fails a run.
"""

import json
from dataclasses import dataclass, field

MCP_PREFIX = "mcp__freeduet__"


@dataclass(frozen=True)
class MessageStart:
    message_id: str | None


@dataclass(frozen=True)
class TextDelta:
    message_id: str | None
    text: str


@dataclass(frozen=True)
class ToolUse:
    message_id: str | None
    id: str
    name: str  # without the MCP prefix: the OpenBot tool name
    input: dict


@dataclass(frozen=True)
class Final:
    text: str | None
    is_error: bool


Item = MessageStart | TextDelta | ToolUse | Final


def _text_of(content) -> str:
    if not isinstance(content, list):
        return ""
    return "".join(
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)
    )


@dataclass
class StreamParser:
    """Feed it one raw line at a time; it returns the items that line adds, in order.

    Text comes from stream deltas, or from a full `assistant` snapshot for a message that produced
    no deltas, never both for the same message.
    """

    skipped_lines: int = 0
    init_seen: bool = False
    # An API error the CLI reported as a synthetic assistant message: its text and its kind
    # (`authentication_failed`, `rate_limit`, `billing_error`, ...), never shown as the answer.
    api_error: str | None = None
    api_error_kind: str | None = None
    # A usage or rate limit refusing this account (`rate_limit_event`, status "rejected").
    limit_refused: bool = False
    limit_resets_at: float | None = None
    final: Final | None = None
    _current_message: str | None = None
    _messages_with_deltas: set = field(default_factory=set)
    _snapshot_seen: dict = field(default_factory=dict)
    _tools_seen: set = field(default_factory=set)

    def feed(self, raw: bytes | str) -> list[Item]:
        if self.final is not None:
            # The result line ends the turn. Nothing after it may change what the turn amounted
            # to, which the segment reads from this parser after the reader has moved on.
            return []
        event = self._decode(raw)
        if event is None:
            return []
        if event.get("parent_tool_use_id"):
            return []  # a sub-agent's output, not this conversation's
        kind = event.get("type")
        if kind == "stream_event":
            return self._stream_event(event.get("event"))
        if kind == "system" and event.get("subtype") == "init":
            self.init_seen = True
        elif kind == "rate_limit_event":
            self._rate_limit(event.get("rate_limit_info"))
        elif kind == "assistant":
            if self._api_error(event):
                return []
            return self._assistant(event.get("message"))
        elif kind == "result":
            text = event.get("result")
            self.final = Final(text=text if isinstance(text, str) else None, is_error=bool(event.get("is_error")))
            return [self.final]
        return []

    def _decode(self, raw: bytes | str) -> dict | None:
        try:
            text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
            text = text.strip()
            if not text:
                return None
            decoded = json.loads(text)
        except (ValueError, TypeError, RecursionError):
            self.skipped_lines += 1
            return None
        if not isinstance(decoded, dict):
            self.skipped_lines += 1
            return None
        return decoded

    def _rate_limit(self, info) -> None:
        if not isinstance(info, dict) or info.get("status") != "rejected" or info.get("isUsingOverage") is True:
            return
        self.limit_refused = True
        resets = info.get("resetsAt")
        if isinstance(resets, (int, float)) and not isinstance(resets, bool) and resets > 0:
            self.limit_resets_at = float(resets)

    def _api_error(self, event: dict) -> bool:
        message = event.get("message") if isinstance(event.get("message"), dict) else {}
        flagged = (
            isinstance(event.get("error"), str)
            or event.get("isApiErrorMessage") is True
            or message.get("isApiErrorMessage") is True
        )
        if not flagged:
            return False
        error = event.get("error")
        self.api_error_kind = error if isinstance(error, str) else None
        self.api_error = _text_of(message.get("content")).strip() or self.api_error_kind or "API error"
        return True

    def _stream_event(self, inner) -> list[Item]:
        if not isinstance(inner, dict):
            return []
        inner_type = inner.get("type")
        if inner_type == "message_start":
            message = inner.get("message")
            message_id = message.get("id") if isinstance(message, dict) else None
            self._current_message = message_id if isinstance(message_id, str) else None
            return [MessageStart(self._current_message)]
        if inner_type == "content_block_delta":
            delta = inner.get("delta")
            if not isinstance(delta, dict) or delta.get("type") != "text_delta":
                return []
            chunk = delta.get("text")
            if not isinstance(chunk, str) or not chunk:
                return []
            if self._current_message is not None:
                self._messages_with_deltas.add(self._current_message)
            return [TextDelta(self._current_message, chunk)]
        return []

    def _assistant(self, message) -> list[Item]:
        if not isinstance(message, dict) or not isinstance(message.get("content"), list):
            return []
        message_id = message.get("id") if isinstance(message.get("id"), str) else None
        items: list[Item] = []
        if message_id is None or message_id not in self._messages_with_deltas:
            snapshot = _text_of(message["content"])
            key = message_id or ""
            previous = self._snapshot_seen.get(key, "")
            # A later snapshot of the same message may repeat what an earlier one carried.
            new_text = snapshot[len(previous):] if snapshot.startswith(previous) else snapshot
            self._snapshot_seen[key] = snapshot if snapshot.startswith(previous) else previous + snapshot
            if new_text:
                items.append(TextDelta(message_id, new_text))
        for block in message["content"]:
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            tool_id, name = block.get("id"), block.get("name")
            if not isinstance(tool_id, str) or not isinstance(name, str) or not name.startswith(MCP_PREFIX):
                continue
            if tool_id in self._tools_seen:
                continue  # the same call can appear in more than one snapshot
            self._tools_seen.add(tool_id)
            tool_input = block.get("input") if isinstance(block.get("input"), dict) else {}
            items.append(ToolUse(message_id, tool_id, name[len(MCP_PREFIX):], tool_input))
        return items
