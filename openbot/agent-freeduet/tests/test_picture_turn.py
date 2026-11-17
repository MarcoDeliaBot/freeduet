"""Defect A (17 November 2026): a picture attached to a chat message never reached the member, and the
member said "only text reaches me". The CLI gets its prompt as text on stdin (claude_engine.py), the
bridge and the segment folder are the only other doors, and no picture goes through any of them in
this version. These tests pin what the member is told and that the bytes go nowhere."""

import json
import os
import tempfile
from pathlib import Path

from helpers import post_run, run_body, standing, types

MARKER = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo="  # base64 stand-in for the picture's bytes
PICTURE = {
    "type": "image",
    "metadata": {"filename": "screenshot.png"},
    "source": {"type": "data", "mimeType": "image/png", "value": MARKER},
}


def attach_and_ask(client, fake_cli, plan_text="I could not see the picture."):
    fake_cli.plan([{"text": plan_text}])
    body = run_body([
        standing(),
        {"id": "u1", "role": "user", "content": [{"type": "text", "text": "this goes labelled and archived"}, PICTURE]},
    ])
    events, _ = post_run(client, body)
    assert types(events)[-1] == "RUN_FINISHED"
    return fake_cli.run(0)


def test_the_member_is_told_a_picture_was_attached_and_could_not_be_shown(client, fake_cli):
    seen = attach_and_ask(client, fake_cli)
    assert "[The person attached a picture to this message: screenshot.png (image/png)." in seen["prompt"]
    assert "Tell the person plainly that a picture was attached and that you could not see it" in seen["prompt"]
    assert "receives text only" not in seen["prompt"]


def test_the_picture_bytes_reach_no_door_of_the_cli(client, fake_cli):
    seen = attach_and_ask(client, fake_cli)
    assert MARKER not in seen["prompt"]
    assert MARKER not in json.dumps(seen["argv"])
    assert MARKER not in json.dumps(seen["mcp_config"])
    assert MARKER not in "".join(seen["env"])
    assert seen["cwd_entries"] == []  # the empty work folder: nothing was written into it


def test_the_bytes_are_in_no_file_of_the_segment_and_the_folder_is_gone_after_it(client, fake_cli, tmp_path, monkeypatch):
    own_temp = tmp_path / "own-temp"  # this test's own temp root: other runs on the machine share /tmp
    own_temp.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(own_temp))
    seen = attach_and_ask(client, fake_cli)
    work = Path(seen["cwd"])
    directory = work.parent  # the segment's private folder, `freeduet-segment-*`
    assert directory.name.startswith("freeduet-segment-") and directory.parent == own_temp
    assert not directory.exists()
    # No segment folder is left behind, and the service's own data folder holds no copy either.
    assert not list(directory.parent.glob("freeduet-segment-*"))
    for path in Path(os.environ["FREEDUET_DATA_DIR"]).rglob("*"):
        if path.is_file():
            assert MARKER not in path.read_text(errors="ignore")
