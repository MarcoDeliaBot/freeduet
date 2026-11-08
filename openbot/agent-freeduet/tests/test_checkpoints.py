"""The checkpoint writer ported from AI Continuity (freeduet/checkpoints.py), on temporary directories."""

import json
import os
from pathlib import Path
import stat

import pytest

from freeduet import checkpoints
from freeduet.checkpoints import latest_checkpoint, save_checkpoint

BOT = "inbox"
THREAD = "0f8c2a54-3b1d-8e6f-9a7b-1c2d3e4f5a6b"


def state(**changes):
    base = {
        "objective": "Sort this morning's mail and draft the two replies that matter",
        "constraints": ["Nothing is sent without the person's approval"],
        "completed": ["Read 14 new messages"],
        "decisions": ["Left the newsletter thread unanswered: no question in it"],
        "in_progress": ["Drafting the reply to the landlord"],
        "changed_files": [],
        "verification": ["search_messages returned 14 results"],
        "blockers": [],
        "next_steps": ["Ask the person to approve the landlord reply"],
    }
    base.update(changes)
    return base


def complete_state(**changes):
    return state(**{"in_progress": [], "blockers": [], "next_steps": [], **changes})


def history_files(root, bot=BOT, thread=THREAD):
    return sorted((root / "handoff" / bot / thread / "history").glob("*.json"))


def test_saves_history_and_view_under_bot_and_thread(tmp_path):
    result = save_checkpoint(tmp_path, THREAD, BOT, "in-progress", state())

    assert result["saved"] is True
    assert result["warnings"] == []
    [history] = history_files(tmp_path)
    assert result["checkpoint"] == str(history)
    view = tmp_path / "handoff" / BOT / THREAD / "HANDOFF.md"
    assert result["handoff"] == str(view)

    payload = json.loads(history.read_text(encoding="utf-8"))
    assert payload["schema_version"] == 1
    assert payload["agent"] == BOT
    assert payload["run"] == THREAD
    assert payload["phase"] == "in-progress"
    assert payload["state"] == state()

    text = view.read_text(encoding="utf-8")
    assert f"Authoritative source: history/{history.name}" in text
    assert "Sort this morning's mail" in text
    assert "- Ask the person to approve the landlord reply" in text
    assert "## Changed files\n\nNo items recorded." in text


def test_history_is_immutable_and_the_view_follows_the_newest(tmp_path):
    save_checkpoint(tmp_path, THREAD, BOT, "planned", state())
    [first] = history_files(tmp_path)
    first_text = first.read_text(encoding="utf-8")

    save_checkpoint(tmp_path, THREAD, BOT, "complete", complete_state(completed=["Both drafts approved and sent"]))
    files = history_files(tmp_path)

    assert len(files) == 2
    assert first.read_text(encoding="utf-8") == first_text
    for path in files:
        assert stat.S_IMODE(path.stat().st_mode) & 0o222 == 0
    view = (tmp_path / "handoff" / BOT / THREAD / "HANDOFF.md").read_text(encoding="utf-8")
    assert "Phase: complete" in view
    assert "Both drafts approved and sent" in view

    latest = latest_checkpoint(tmp_path, BOT, THREAD)
    assert latest["file"] == str(files[-1])
    assert latest["checkpoint"]["phase"] == "complete"


def test_history_is_never_replaced(tmp_path):
    target = tmp_path / "existing.json"
    target.write_text("first\n", encoding="utf-8")

    with pytest.raises(FileExistsError):
        checkpoints.publish_once(target, "second\n")

    assert target.read_text(encoding="utf-8") == "first\n"
    assert [path.name for path in tmp_path.iterdir()] == ["existing.json"]


def test_members_and_threads_stay_apart(tmp_path):
    save_checkpoint(tmp_path, THREAD, BOT, "in-progress", state())
    save_checkpoint(tmp_path, "other-thread", BOT, "in-progress", state(objective="Another task"))
    save_checkpoint(tmp_path, THREAD, "bookkeeper", "in-progress", state(objective="Penny's task"))

    assert latest_checkpoint(tmp_path, BOT, THREAD)["checkpoint"]["state"]["objective"].startswith("Sort")
    assert latest_checkpoint(tmp_path, BOT, "other-thread")["checkpoint"]["state"]["objective"] == "Another task"
    assert latest_checkpoint(tmp_path, "bookkeeper", THREAD)["checkpoint"]["state"]["objective"] == "Penny's task"
    assert latest_checkpoint(tmp_path, "chef", THREAD) is None


def test_latest_skips_invalid_history(tmp_path):
    save_checkpoint(tmp_path, THREAD, BOT, "in-progress", state())
    [valid] = history_files(tmp_path)
    broken = valid.parent / "99999999T999999.999999Z-broken.json"
    broken.write_text("{not json", encoding="utf-8")

    assert latest_checkpoint(tmp_path, BOT, THREAD)["file"] == str(valid)


@pytest.mark.parametrize(
    ("phase", "bad_state", "message"),
    [
        ("in-progress", "not an object", "JSON object"),
        ("in-progress", {k: v for k, v in state().items() if k != "verification"}, "documented list fields"),
        ("in-progress", {**state(), "approved": ["yes"]}, "documented list fields"),
        ("in-progress", state(objective="  "), "objective"),
        ("in-progress", state(completed="Read the mail"), "completed must be a list"),
        ("in-progress", state(decisions=[""]), "decisions must be a list"),
        ("in-progress", state(blockers=[42]), "blockers must be a list"),
        ("done", state(), "phase must be one of"),
        ("planned", state(next_steps=[]), "needs next_steps"),
        ("blocked", state(next_steps=[]), "needs next_steps"),
        ("complete", complete_state(blockers=["Waiting for the landlord"]), "cannot have unfinished work"),
        ("complete", complete_state(next_steps=["Check again tomorrow"]), "cannot have unfinished work"),
        ("complete", complete_state(in_progress=["Still drafting"]), "cannot have unfinished work"),
    ],
)
def test_refuses_invalid_state_before_writing(tmp_path, phase, bad_state, message):
    with pytest.raises(ValueError, match=message):
        save_checkpoint(tmp_path, THREAD, BOT, phase, bad_state)
    assert not (tmp_path / "handoff").exists()


@pytest.mark.parametrize("phase", ["planned", "in-progress", "blocked"])
def test_unfinished_phases_with_a_next_step_are_accepted(tmp_path, phase):
    assert save_checkpoint(tmp_path, THREAD, BOT, phase, state())["phase"] == phase


@pytest.mark.parametrize(
    ("run_id", "agent"),
    [
        ("../escape", BOT),
        (THREAD, "../escape"),
        ("a/b", BOT),
        (THREAD, ".hidden"),
        ("", BOT),
        (THREAD, ""),
        ("x" * 129, BOT),
        ("thread.with.dots", BOT),
        (THREAD, None),
    ],
)
def test_refuses_identifiers_that_are_not_one_path_segment(tmp_path, run_id, agent):
    with pytest.raises(ValueError):
        save_checkpoint(tmp_path, run_id, agent, "in-progress", state())
    assert not (tmp_path / "handoff").exists()


def test_accepts_bot_ids_made_by_the_api(tmp_path):
    agent = "agent_3f0e2b8c-91d4-4c8e-a1f2-7b6c5d4e3f21"
    save_checkpoint(tmp_path, THREAD, agent, "in-progress", state())
    assert len(history_files(tmp_path, bot=agent)) == 1


def test_refuses_a_missing_or_root_data_directory(tmp_path):
    with pytest.raises(ValueError, match="not available"):
        save_checkpoint(tmp_path / "missing", THREAD, BOT, "in-progress", state())
    with pytest.raises(ValueError, match="filesystem root"):
        save_checkpoint(Path("/"), THREAD, BOT, "in-progress", state())


def test_refuses_a_handoff_directory_that_leads_outside(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    root = tmp_path / "data"
    root.mkdir()
    (root / "handoff").symlink_to(outside, target_is_directory=True)

    with pytest.raises(ValueError, match="escapes"):
        save_checkpoint(root, THREAD, BOT, "in-progress", state())
    assert list(outside.iterdir()) == []


def test_refuses_an_oversized_state(tmp_path):
    with pytest.raises(ValueError, match="128 KiB"):
        save_checkpoint(tmp_path, THREAD, BOT, "in-progress", state(verification=["x" * (129 * 1024)]))


SECRETS = [
    "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "AKIAABCDEFGHIJKLMNOP",
    "xoxb-123456789012-abcdefghijklmnop",
    "AIzaSyA1234567890abcdefghijklmnopqrstuv",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    "hunter2-correct-horse",
    "s3cr3t-value",
    "4111 1111 1111 1111",
    "5500-0000-0000-0004",
    "abc.def.ghi-bearer",
]


def test_redacts_anything_that_looks_like_a_secret(tmp_path):
    leaky = state(
        objective="Pay the plumber; card 4111 1111 1111 1111 was used last time",
        decisions=["Used api_key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 for the test"],
        verification=[
            "Header Authorization: Bearer abc.def.ghi-bearer",
            "password: hunter2-correct-horse",
            '{"client_secret": "s3cr3t-value"}',
            "GitHub token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
            "AWS key AKIAABCDEFGHIJKLMNOP",
            "Slack xoxb-123456789012-abcdefghijklmnop and Google AIzaSyA1234567890abcdefghijklmnopqrstuv",
            "Session eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
            "Second card 5500-0000-0000-0004",
        ],
        changed_files=["-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----"],
    )
    original = json.dumps(leaky)

    result = save_checkpoint(tmp_path, THREAD, BOT, "in-progress", leaky)

    written = Path(result["checkpoint"]).read_text(encoding="utf-8") + Path(result["handoff"]).read_text(encoding="utf-8")
    for secret in SECRETS:
        assert secret not in written, secret
    assert "PRIVATE KEY-----" not in written
    assert "[CARD NUMBER REDACTED]" in written
    assert "[TOKEN REDACTED]" in written
    assert "Bearer [REDACTED]" in written
    # The caller's own state is left as it was.
    assert json.dumps(leaky) == original


def test_keeps_ordinary_numbers_and_words(tmp_path):
    plain = state(
        verification=[
            "Invoice 1234567812345678 is not a card number (fails the Luhn check)",
            "Called +39 06 1234 5678 at 2026-11-08T09:30:00Z",
            "The token budget is fine",
        ],
    )

    result = save_checkpoint(tmp_path, THREAD, BOT, "in-progress", plain)

    saved = json.loads(Path(result["checkpoint"]).read_text(encoding="utf-8"))["state"]
    assert saved["verification"] == plain["verification"]


def test_default_root_is_the_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("FREEDUET_DATA_DIR", str(tmp_path))
    assert checkpoints.default_root() == tmp_path
    monkeypatch.delenv("FREEDUET_DATA_DIR")
    assert checkpoints.default_root() == Path("/data")


def test_view_failure_is_a_warning_not_a_lost_checkpoint(tmp_path, monkeypatch):
    def refuse(path, content):
        raise OSError("disk full")

    monkeypatch.setattr(checkpoints, "atomic_write", refuse)
    result = save_checkpoint(tmp_path, THREAD, BOT, "in-progress", state())

    assert result["saved"] is True
    assert result["warnings"] and "HANDOFF.md was not updated" in result["warnings"][0]
    assert len(history_files(tmp_path)) == 1
    assert os.path.exists(result["checkpoint"])
