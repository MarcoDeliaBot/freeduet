# Copyright the open-duet authors (https://github.com/Anil-matcha/open-duet).
# Licensed under the Apache License, Version 2.0; see LICENSE-APACHE-2.0 in openbot/agent-freeduet.
#
# Ported from Anil-matcha/open-duet, backend/app/services/local_claude_stream.py.
# Modified for FreeDuet: the parser returns typed items (message start, text delta, tool use,
# final result) in stream order instead of strings plus side lists; tool uses are kept only for the
# `freeduet` MCP server and carry their input; approval control requests, tool summaries, usage and
# the stored-message bookkeeping were removed (approvals belong to OpenBot, D4); the structured
# `error` an API-error assistant message carries is kept, for the sign-in check (D12). Token counts are read again,
# for the spend ledger only (ledger.py): the numbers the CLI reports, nothing else of `usage`, no cost.
"""Claude Code's `--output-format stream-json` lines as the few things a segment acts on.

The CLI interleaves many other events with the ones that matter (`system/init`, `system/status`,
`rate_limit_event`, and whatever a newer version adds). This parser acts on an allowlist and skips
everything else, so an unknown event, a malformed line or a missing field never fails a run.
"""

import json
import re
from dataclasses import dataclass, field

MCP_PREFIX = "mcp__freeduet__"
# The CLI's own answer to a call for a name it has no tool under (cli.js): the call never reaches the
# bridge, so this line is the only trace it leaves. The name is word characters and hyphens: newer
# CLIs add ". <name> is not a tool you can call" after it.
NO_SUCH_TOOL = re.compile(r"No such tool available: ([\w-]+)")


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


@dataclass(frozen=True)
class Refused:
    """A call the CLI answered itself with "No such tool available". The bridge never heard of it.

    `called_as` is the name exactly as the model sent it (`mcp__freeduet__make_page`, or a plain
    `make_page` the CLI has no tool under), `name` the same without the MCP prefix. `input` and
    `message_id` come from the call's own tool_use line, None when that line was not read.
    """

    id: str | None
    called_as: str
    name: str
    input: dict | None
    message_id: str | None


Item = MessageStart | TextDelta | ToolUse | Final | Refused


def _text_of(content) -> str:
    if not isinstance(content, list):
        return ""
    return "".join(
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)
    )


def _count(value) -> int | None:
    """A token count as the CLI reports it: a whole number of 0 or more, else None (never a guess)."""
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


_GIVEN = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")


def _given(usage) -> int | None:
    """Every token the model was given in one call, cached ones included: the three input counts of a `usage` block
    that are numbers, added. None when the block has none of them."""
    if not isinstance(usage, dict):
        return None
    found = [count for count in (_count(usage.get(name)) for name in _GIVEN) if count is not None]
    return sum(found) if found else None


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
    # The HTTP status the CLI says that error had (`api_error_status`), when it says one: a gateway's answer, as an int.
    api_error_status: int | None = None
    # A usage or rate limit refusing this account (`rate_limit_event`, status "rejected").
    limit_refused: bool = False
    limit_resets_at: float | None = None
    # Tools the model called that the CLI answered with "No such tool available" (names without the
    # MCP prefix, then the names as the model sent them): the call went nowhere.
    unavailable: list[str] = field(default_factory=list)
    unavailable_as: list[str] = field(default_factory=list)
    # What the init event said: each MCP server's status, and the tools it listed (with their prefix).
    mcp_servers: dict[str, str] = field(default_factory=dict)
    init_tools: list[str] = field(default_factory=list)
    final: Final | None = None
    _current_message: str | None = None
    _messages_with_deltas: set = field(default_factory=set)
    _snapshot_seen: dict = field(default_factory=dict)
    _tools_seen: set = field(default_factory=set)
    _calls: dict = field(default_factory=dict)  # tool_use id -> (message id, name as sent, input), any name
    # Token use, for the spend ledger (read through :meth:`usage`). Per message: [given, wrote], from the stream's
    # `message_start` (what the model was given) and `message_delta` (what it wrote, final), else from the `assistant`
    # snapshot (whose count of what the model wrote is a placeholder while the message is still streaming). The result
    # line's own totals for the whole run win when that line was read; a segment that ends on a tool never reads it.
    _use_by_message: dict = field(default_factory=dict)
    _use_key: str | None = None
    _result_use: tuple | None = None

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
            self._init(event)
        elif kind == "user":
            return self._tool_errors(event.get("message"))
        elif kind == "rate_limit_event":
            self._rate_limit(event.get("rate_limit_info"))
        elif kind == "assistant":
            if self._api_error(event):
                return []
            self._usage_of_snapshot(event.get("message"))
            return self._assistant(event.get("message"))
        elif kind == "result":
            self._usage_of_result(event.get("usage"))
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

    def _init(self, event: dict) -> None:
        self.init_seen = True
        servers, tools = event.get("mcp_servers"), event.get("tools")
        self.mcp_servers = {
            server["name"]: str(server.get("status"))
            for server in servers if isinstance(server, dict) and isinstance(server.get("name"), str)
        } if isinstance(servers, list) else {}
        self.init_tools = [tool for tool in tools if isinstance(tool, str)] if isinstance(tools, list) else []

    def _tool_errors(self, message) -> list[Item]:
        refused: list[Item] = []
        content = message.get("content") if isinstance(message, dict) else None
        for block in content if isinstance(content, list) else []:
            if not isinstance(block, dict) or block.get("type") != "tool_result" or block.get("is_error") is not True:
                continue
            found = NO_SUCH_TOOL.search(block["content"]) if isinstance(block.get("content"), str) else None
            if not found:
                continue
            called_as = found.group(1)
            name = called_as.removeprefix(MCP_PREFIX)
            self.unavailable.append(name)
            self.unavailable_as.append(called_as)
            tool_id = block.get("tool_use_id") if isinstance(block.get("tool_use_id"), str) else None
            message_id, _, tool_input = self._calls.get(tool_id) or (None, called_as, None)
            refused.append(Refused(tool_id, called_as, name, tool_input, message_id))
        return refused

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
        status = event.get("api_error_status")
        self.api_error_status = status if isinstance(status, int) and not isinstance(status, bool) else None
        return True

    def _stream_event(self, inner) -> list[Item]:
        if not isinstance(inner, dict):
            return []
        inner_type = inner.get("type")
        if inner_type == "message_start":
            message = inner.get("message")
            message_id = message.get("id") if isinstance(message, dict) else None
            self._current_message = message_id if isinstance(message_id, str) else None
            self._usage_of_start(message)
            return [MessageStart(self._current_message)]
        if inner_type == "message_delta":
            self._usage_of_delta(inner.get("usage"))
            return []
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
            if not isinstance(tool_id, str) or not isinstance(name, str):
                continue
            tool_input = block.get("input") if isinstance(block.get("input"), dict) else {}
            # Every call is remembered, whatever its name: one the CLI refuses is told apart from the
            # model's own words only by this line.
            self._calls.setdefault(tool_id, (message_id, name, tool_input))
            if not name.startswith(MCP_PREFIX):
                continue
            if tool_id in self._tools_seen:
                continue  # the same call can appear in more than one snapshot
            self._tools_seen.add(tool_id)
            items.append(ToolUse(message_id, tool_id, name[len(MCP_PREFIX):], tool_input))
        return items

    # -- token use (the spend ledger) -----------------------------------------------------------

    def _usage_of_start(self, message) -> None:
        message = message if isinstance(message, dict) else {}
        message_id = message.get("id") if isinstance(message.get("id"), str) else None
        self._use_key = message_id if message_id is not None else f"#{len(self._use_by_message)}"
        usage = message.get("usage")
        entry = self._use_by_message.setdefault(self._use_key, [None, None])
        given = _given(usage)
        wrote = _count(usage.get("output_tokens")) if isinstance(usage, dict) else None
        entry[0] = given if given is not None else entry[0]
        entry[1] = wrote if entry[1] is None else entry[1]  # a placeholder: `message_delta` says the real one

    def _usage_of_delta(self, usage) -> None:
        entry = self._use_by_message.get(self._use_key) if self._use_key is not None else None
        if entry is None or not isinstance(usage, dict):
            return
        wrote, given = _count(usage.get("output_tokens")), _given(usage)
        entry[1] = wrote if wrote is not None else entry[1]
        entry[0] = given if given is not None else entry[0]

    def _usage_of_snapshot(self, message) -> None:
        """A message the stream events did not carry (no partial messages): its snapshot's own counts, once."""
        if not isinstance(message, dict) or not isinstance(message.get("id"), str):
            return
        if message["id"] in self._use_by_message:
            return
        usage = message.get("usage")
        if isinstance(usage, dict):
            self._use_by_message[message["id"]] = [_given(usage), _count(usage.get("output_tokens"))]

    def _usage_of_result(self, usage) -> None:
        if not isinstance(usage, dict):
            return
        given, wrote = _given(usage), _count(usage.get("output_tokens"))
        if given is not None or wrote is not None:
            self._result_use = (given, wrote)

    def usage(self) -> tuple[int | None, int | None] | None:
        """What the CLI reported about token use so far: (given, wrote), each None when it reported no number, or None
        when it reported nothing at all. The result line's totals when it was read, else the sum over the messages seen."""
        if self._result_use is not None:
            return self._result_use
        if not self._use_by_message:
            return None
        given = [entry[0] for entry in self._use_by_message.values() if entry[0] is not None]
        wrote = [entry[1] for entry in self._use_by_message.values() if entry[1] is not None]
        if not given and not wrote:
            return None
        return (sum(given) if given else None, sum(wrote) if wrote else None)
