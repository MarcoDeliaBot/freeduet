"""D72 (17 November 2026): a picture in the person's LATEST message reaches Claude Code as an image block.

Everything here runs against the fake CLI (`fake_claude.py`, taught `--input-format stream-json`): no model, no
sign-in. It proves what this service builds, writes and keeps; it does NOT prove that the pinned CLI reads that
command with `--include-partial-messages`, `--mcp-config`, `--allowedTools` and `--append-system-prompt` all set
(the live test of 17 November had none of them). Every byte string is invented."""

import asyncio
import base64
import json
import logging
from pathlib import Path

import pytest

from freeduet import agui, claude_cli, segment, transcript
from freeduet.members import resolve_member
from freeduet.transcript import MAX_PICTURE_BYTES, MAX_PICTURE_BYTES_PER_TURN, MAX_PICTURES_PER_TURN, Picture
from gateway_support import rig
from helpers import SETTLE_NEVER, post_run, run_body, standing, types
from test_compatible_engine import play

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + bytes(range(256)) * 12  # invented: a signature and 3 KiB of filler
PNG_B64 = base64.b64encode(PNG_BYTES).decode()


def picture(data=PNG_B64, mime="image/png", name="shot.png"):
    return {"type": "image", "metadata": {"filename": name}, "source": {"type": "data", "mimeType": mime, "value": data}}


def png_of(size: int) -> str:
    return base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * (size - 8)).decode()


def ask(*parts, text="what is on it?"):
    return [standing(), {"id": "u1", "role": "user", "content": [{"type": "text", "text": text}, *parts]}]


def go(client, fake_cli, messages, plan=None):
    fake_cli.plan(plan or [{"text": "I see a yellow square."}])
    events, _ = post_run(client, run_body(messages))
    assert types(events)[-1] == "RUN_FINISHED"
    return events, fake_cli.run(0)


@pytest.fixture(autouse=True)
def _settle(monkeypatch):
    monkeypatch.setattr(segment, "SETTLE_SECONDS", SETTLE_NEVER)


# 1. A picture in the latest message: stream-json input, the same bytes, the rendered prompt as the text block.
def test_a_picture_in_the_latest_message_goes_as_an_image_block_on_stdin(client, fake_cli):
    _, seen = go(client, fake_cli, ask(picture()))
    argv = seen["argv"]
    assert argv[argv.index("--input-format") + 1] == "stream-json"
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert seen["input_format"] == "stream-json" and seen["stdin_lines"] == 1
    (sent,) = seen["pictures"]
    assert sent == {"type": "base64", "media_type": "image/png", "data": PNG_B64}
    assert base64.b64decode(sent["data"]) == PNG_BYTES
    assert "what is on it?" in seen["prompt"]
    assert "passed to you as image 1 of 1" in seen["prompt"]
    assert "you cannot see it" not in seen["prompt"] and "does not pass" not in seen["prompt"]


def test_the_stdin_line_is_one_user_message_with_the_pictures_first_then_the_prompt():
    two = (Picture("image/png", PNG_B64, "a.png", len(PNG_BYTES)), Picture("image/jpeg", "/9j/", "b.jpg", 3))
    raw = claude_cli.picture_input("the rendered prompt", two)
    assert raw.endswith(b"\n") and raw.count(b"\n") == 1
    line = json.loads(raw)
    assert line["type"] == "user" and line["message"]["role"] == "user"
    kinds = [block["type"] for block in line["message"]["content"]]
    assert kinds == ["image", "image", "text"]
    assert line["message"]["content"][2]["text"] == "the rendered prompt"
    assert line["message"]["content"][1]["source"] == {"type": "base64", "media_type": "image/jpeg", "data": "/9j/"}


def test_the_pictures_are_in_no_argument_file_or_variable_of_the_cli(client, fake_cli):
    _, seen = go(client, fake_cli, ask(picture()))
    assert PNG_B64 not in json.dumps(seen["argv"]) + json.dumps(seen["mcp_config"]) + "".join(seen["env"])
    assert seen["cwd_entries"] == []


def test_a_picture_is_still_sent_when_the_turn_goes_on_after_a_tool_result(client, fake_cli):
    messages = [
        *ask(picture()),
        {"id": "a1", "role": "assistant", "content": "", "toolCalls": [
            {"id": "c1", "type": "function", "function": {"name": "t", "arguments": "{}"}}]},
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": "done"},
    ]
    rendered = transcript.render(resolve_member("freeduet", messages), messages)
    assert len(rendered.pictures) == 1 and "image 1 of 1" in rendered.picture_prompt


# 2. A text-only turn: command and stdin as before.
def test_a_turn_with_no_picture_keeps_the_command_and_stdin_it_always_had(client, fake_cli):
    messages = [standing(), {"id": "u1", "role": "user", "content": "hello there"}]
    _, seen = go(client, fake_cli, messages)
    assert "--input-format" not in seen["argv"] and "input_format" not in seen
    # The command is the lockdown, then the MCP file, then the system text: the order it had before D72.
    assert seen["argv"][:len(claude_cli.LOCKDOWN_ARGS)] == claude_cli.LOCKDOWN_ARGS
    assert seen["argv"][len(claude_cli.LOCKDOWN_ARGS)] == "--mcp-config"
    member = resolve_member("freeduet", messages)
    assert seen["prompt"] == transcript.render(member, messages).prompt  # plain text on stdin, not a JSON line


def test_build_command_without_pictures_is_the_old_command(tmp_path):
    command = claude_cli.build_command("claude", tmp_path / "mcp.json", "sys", tmp_path)
    assert command == ["claude", *claude_cli.LOCKDOWN_ARGS, "--mcp-config", str(tmp_path / "mcp.json"),
                       "--append-system-prompt", "sys"]
    with_pictures = claude_cli.build_command("claude", tmp_path / "mcp.json", "sys", tmp_path, True)
    index = len(claude_cli.LOCKDOWN_ARGS) + 1
    assert with_pictures[index:index + 2] == ["--input-format", "stream-json"]
    assert with_pictures[:index] + with_pictures[index + 2:] == command  # nothing else changes


def test_a_text_message_of_a_turn_with_no_picture_renders_exactly_as_before():
    messages = ask()
    messages[1]["content"] = "just text"
    rendered = transcript.render(resolve_member("freeduet", messages), messages)
    assert rendered.pictures == () and rendered.picture_prompt is None


# 3. A picture only in an older message: the D68 note, the old path.
def test_a_picture_in_an_older_message_stays_the_note_and_the_old_path(client, fake_cli):
    messages = [
        *ask(picture()),
        {"id": "a1", "role": "assistant", "content": "It is a yellow square."},
        {"id": "u2", "role": "user", "content": "and now make it blue"},
    ]
    _, seen = go(client, fake_cli, messages)
    assert "--input-format" not in seen["argv"] and "pictures" not in seen
    assert "This version does not pass pictures on to the engine you run on, so you cannot see it" in seen["prompt"]
    assert PNG_B64 not in seen["prompt"]


# 4. Too large, or not a type or bytes the engine can be shown: the old path with the right note.
def test_a_picture_over_the_size_limit_is_a_note_that_says_it_was_too_large(client, fake_cli):
    _, seen = go(client, fake_cli, ask(picture(png_of(MAX_PICTURE_BYTES + 1), name="big.png")))
    assert "--input-format" not in seen["argv"]
    assert "[The person attached a picture to this message: big.png (image/png). It was too large to be shown" in seen["prompt"]
    assert "attach a smaller one" in seen["prompt"]


def test_a_picture_at_the_limit_is_sent():
    rendered = transcript.render(resolve_member("freeduet", ask()), ask(picture(png_of(MAX_PICTURE_BYTES))))
    assert len(rendered.pictures) == 1 and rendered.pictures[0].size == MAX_PICTURE_BYTES


def test_the_pictures_of_one_turn_have_a_limit_together():
    four = [picture(png_of(MAX_PICTURE_BYTES // 2 + 1), name=f"{n}.png") for n in range(5)]
    messages = ask(*four)
    rendered = transcript.render(resolve_member("freeduet", messages), messages)
    assert len(rendered.pictures) == 3 and sum(p.size for p in rendered.pictures) <= MAX_PICTURE_BYTES_PER_TURN
    assert rendered.prompt.count("too large to be shown") == 2
    assert rendered.picture_prompt.count("passed to you as image") == 3
    assert "image 3 of 3" in rendered.picture_prompt


@pytest.mark.parametrize("bad", [
    picture(mime="image/svg+xml"),  # a type the server does not let through as a picture
    picture(mime="application/pdf"),
    picture(data="not base64 !!"),
    picture(data=base64.b64encode(b"GIF89a" + b"\0" * 20).decode()),  # GIF bytes under a PNG name
    picture(data=base64.b64encode(b"RIFF\0\0\0\0WAVE").decode(), mime="image/webp"),
    {"type": "image", "source": {"type": "url", "value": "https://example.invalid/a.png", "mimeType": "image/png"}},
    {"type": "image", "source": {"type": "data", "mimeType": "image/png", "value": 5}},
])
def test_a_picture_that_cannot_be_shown_keeps_the_note_of_d68(client, fake_cli, bad):
    _, seen = go(client, fake_cli, ask(bad))
    assert "--input-format" not in seen["argv"]
    assert "This version does not pass pictures on to the engine you run on, so you cannot see it" in seen["prompt"]


def test_a_picture_that_is_shown_and_one_that_is_not_in_one_message():
    messages = ask(picture(mime="image/svg+xml", name="x.svg"), picture(name="ok.png"))
    rendered = transcript.render(resolve_member("freeduet", messages), messages)
    assert len(rendered.pictures) == 1
    assert "image 1 of 1" in rendered.picture_prompt and "does not pass pictures on" in rendered.picture_prompt


def test_the_switch_turns_the_pictures_off(client, fake_cli, monkeypatch):
    monkeypatch.setenv("FREEDUET_PICTURES", "off")
    _, seen = go(client, fake_cli, ask(picture()))
    assert "--input-format" not in seen["argv"] and "pictures" not in seen
    assert "does not pass pictures on to the engine you run on, so you cannot see it" in seen["prompt"]
    assert "passed to you as image" not in seen["prompt"] and PNG_B64 not in seen["prompt"]


# 5. The bytes are never logged or kept.
def test_the_picture_is_in_no_log_line_no_event_and_no_stored_file(client, fake_cli, caplog, tmp_path, monkeypatch):
    caplog.set_level(logging.DEBUG)
    own_temp = tmp_path / "own-temp"
    own_temp.mkdir()
    monkeypatch.setattr("tempfile.tempdir", str(own_temp))
    events, seen = go(client, fake_cli, ask(picture()))
    assert seen["pictures"]  # the turn did carry it
    assert any("1 picture(s) as stream-json" in r.getMessage() for r in caplog.records)
    wholes = "\n".join(r.getMessage() + repr(r.args) + str(r.exc_text) for r in caplog.records)
    assert PNG_B64 not in wholes and PNG_B64[:60] not in wholes and "shot.png" not in wholes
    assert PNG_B64 not in json.dumps(events)
    assert not list(own_temp.glob("freeduet-segment-*"))
    for path in Path(fake_cli.data_dir).rglob("*"):
        if path.is_file():
            assert PNG_B64[:60] not in path.read_text(errors="ignore"), path


def test_a_cli_that_echoes_the_line_on_stderr_does_not_put_it_in_a_log_or_the_error(client, fake_cli, caplog):
    caplog.set_level(logging.DEBUG)
    echoed = "cannot parse: " + PNG_B64[:700]  # a slice, not the whole picture
    fake_cli.plan([{"stderr": echoed}, {"exit": 1}])
    events, _ = post_run(client, run_body(ask(picture())))
    assert types(events)[-1] == "RUN_ERROR"
    wholes = "\n".join(r.getMessage() for r in caplog.records)
    assert PNG_B64[:200] not in wholes + json.dumps(events)
    assert "gave no answer to a turn with 1 picture(s)" in wholes  # and the failure is visible, with counts only
    assert "cannot parse" not in wholes and "bytes on stderr (not logged" in wholes  # the tail is not logged at all


def test_a_picture_does_not_print_in_its_repr_or_in_the_turn_context():
    shown = Picture("image/png", PNG_B64, "a.png", 3)
    assert PNG_B64 not in repr(shown)
    rendered = transcript.render(resolve_member("freeduet", ask(picture())), ask(picture()))
    assert PNG_B64 not in repr(rendered)


def test_without_pictures_takes_the_bytes_out_of_any_text():
    shown = (Picture("image/png", PNG_B64, "a.png", 3),)
    assert PNG_B64 not in claude_cli.without_pictures(f"x {PNG_B64} y", shown)
    assert PNG_B64[:300] not in claude_cli.without_pictures(f"x {PNG_B64[:300]} y", shown)
    assert claude_cli.without_pictures("plain text", ()) == "plain text"


# 6. The compatible engine keeps the note.
def test_the_compatible_engine_still_gets_the_note_and_plain_text(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch)
    gw.plan([{"text": "I could not see it."}])
    events = play(gw.engine, ask(picture()))
    assert types(events)[-1] == "RUN_FINISHED"
    seen = gw.run(0)
    assert "--input-format" not in seen["argv"] and "pictures" not in seen
    assert "This version does not pass pictures on to the engine you run on, so you cannot see it" in seen["prompt"]
    assert PNG_B64 not in seen["prompt"]


# The review of PR #359.
@pytest.mark.parametrize("mime", [["image/png"], {"a": 1}, 5, None])
def test_a_mime_type_that_is_not_text_is_a_note_and_never_an_exception(mime):
    messages = ask(picture(mime=mime))
    rendered = transcript.render(resolve_member("freeduet", messages), messages)
    assert rendered.pictures == () and rendered.picture_prompt is None
    assert "This version does not pass pictures on to the engine you run on, so you cannot see it" in rendered.prompt


def test_more_than_twenty_pictures_are_not_all_shown():
    messages = ask(*[picture(name=f"{n}.png") for n in range(25)])
    rendered = transcript.render(resolve_member("freeduet", messages), messages)
    assert len(rendered.pictures) == MAX_PICTURES_PER_TURN == 20
    assert rendered.prompt.count("too many pictures in this message") == 5  # the same in every engine
    assert rendered.picture_prompt.count("passed to you as image") == 20 and "image 20 of 20" in rendered.picture_prompt
    assert rendered.picture_prompt.count("too many pictures in this message") == 5


def failing(client, fake_cli, messages, stderr, times=3):
    for n in range(times):
        fake_cli.plan(*[[{"stderr": stderr}, {"exit": 1}]] * times)
    for n in range(times):
        events, _ = post_run(client, run_body(messages, run_id=f"run-{n}"))
        assert types(events)[-1] == "RUN_ERROR"


def engine_row(client):
    from helpers import MANAGED_TOKEN
    (only,) = client.get("/engines", headers={"x-openbot-agent-token": MANAGED_TOKEN}).json()["engines"]
    return only


TEXT = [standing(), {"id": "u1", "role": "user", "content": "hello"}]


@pytest.mark.parametrize("words, kind", [("Request timed out", "degraded"), ("401 unauthorized", "signed_out")])
def test_a_picture_turn_that_fails_never_moves_the_engines_health(client, fake_cli, words, kind):
    failing(client, fake_cli, ask(picture()), words)
    assert (engine_row(client)["state"], engine_row(client)["consecutive_failures"]) == ("ready", 0)


@pytest.mark.parametrize("words, kind", [("Request timed out", "open"), ("401 unauthorized", "signed_out")])
def test_the_same_failures_in_a_text_turn_still_count(client, fake_cli, words, kind):
    failing(client, fake_cli, TEXT, words)
    row = engine_row(client)
    assert row["state"] == kind and row["consecutive_failures"] >= 1


def test_the_error_in_the_chat_is_cleaned_of_the_picture(client, fake_cli):
    leaked = "bad input " + PNG_B64[:300]
    fake_cli.plan([{"events": [{"type": "result", "subtype": "error", "is_error": True, "result": leaked}]}])
    events, _ = post_run(client, run_body(ask(picture())))
    assert types(events)[-1] == "RUN_ERROR" and PNG_B64[:100] not in json.dumps(events)
