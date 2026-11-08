"""stream-json lines, in the shapes Claude Code 2.1.311 prints, read into segment items."""

import json

from freeduet.stream_json import Final, MessageStart, StreamParser, TextDelta, ToolUse


def line(event):
    return json.dumps(event)


def delta(text, message="msg_1"):
    return line({"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}}, "parent_tool_use_id": None, "api_message_id": message})


def test_deltas_win_over_the_snapshot_and_tool_uses_are_kept_for_freeduet_only():
    parser = StreamParser()
    items = []
    for raw in [
        line({"type": "system", "subtype": "init", "tools": ["mcp__freeduet__make_page"], "mcp_servers": [{"name": "freeduet", "status": "connected"}]}),
        line({"type": "stream_event", "event": {"type": "message_start", "message": {"id": "msg_1", "role": "assistant", "content": []}}}),
        delta("Hi! How"),
        delta(" can I help?"),
        line({"type": "assistant", "message": {"id": "msg_1", "content": [{"type": "text", "text": "Hi! How can I help?"}]}}),
        line({"type": "assistant", "message": {"id": "msg_1", "content": [{"type": "tool_use", "id": "toolu_1", "name": "mcp__freeduet__make_page", "input": {"title": "x"}}]}}),
        line({"type": "assistant", "message": {"id": "msg_1", "content": [{"type": "tool_use", "id": "toolu_1", "name": "mcp__freeduet__make_page", "input": {"title": "x"}}]}}),
        line({"type": "assistant", "message": {"id": "msg_1", "content": [{"type": "tool_use", "id": "toolu_2", "name": "Bash", "input": {}}]}}),
        line({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "sub-agent"}}, "parent_tool_use_id": "toolu_9"}),
        line({"type": "rate_limit_event", "rate_limit_info": {"status": "allowed", "resetsAt": 1794722400}}),
        "not json",
        line({"type": "result", "subtype": "success", "is_error": False, "result": "Hi! How can I help?"}),
        line({"type": "result", "subtype": "success", "is_error": True, "result": "ignored"}),
    ]:
        items += parser.feed(raw)
    assert items == [
        MessageStart("msg_1"),
        TextDelta("msg_1", "Hi! How"),
        TextDelta("msg_1", " can I help?"),
        ToolUse("msg_1", "toolu_1", "make_page", {"title": "x"}),
        Final("Hi! How can I help?", False),
    ]
    assert parser.init_seen and not parser.limit_refused and parser.skipped_lines == 1
    assert parser.final == Final("Hi! How can I help?", False)


def test_a_message_without_deltas_comes_from_its_snapshot_once():
    parser = StreamParser()
    first = parser.feed(line({"type": "assistant", "message": {"id": "m", "content": [{"type": "text", "text": "Hello"}]}}))
    second = parser.feed(line({"type": "assistant", "message": {"id": "m", "content": [{"type": "text", "text": "Hello world"}]}}))
    assert first == [TextDelta("m", "Hello")] and second == [TextDelta("m", " world")]


def test_an_api_error_message_is_kept_as_the_error_not_the_answer():
    parser = StreamParser()
    items = parser.feed(line({"type": "assistant", "error": "authentication_failed", "message": {"id": "x", "content": [{"type": "text", "text": "Not logged in · Please run /login"}]}}))
    assert items == []
    assert parser.api_error_kind == "authentication_failed"
    assert parser.api_error == "Not logged in · Please run /login"
