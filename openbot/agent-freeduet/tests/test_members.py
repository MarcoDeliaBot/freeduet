"""The member is found by forwardedProps.openbotBotId, cross-checked with the standing role (D3)."""

import os

import pytest

from freeduet.members import MemberError, resolve_member
from helpers import post_run, run_body, standing, types


def test_member_is_found_by_id_and_standing_role(fake_cli):
    member = resolve_member("chef", [standing("chef")])
    assert member.id == "chef"
    assert member.system_prompt == "You are Basil, the test chef."


def test_a_standing_role_for_another_member_is_refused(fake_cli):
    with pytest.raises(MemberError):
        resolve_member("chef", [standing("freeduet")])


def test_a_run_that_names_no_member_is_refused(fake_cli):
    with pytest.raises(MemberError):
        resolve_member("", [standing("freeduet")])


def test_rows_keep_their_placeholders_and_only_the_prompt_is_read(fake_cli):
    # The file holds ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}: nothing here expands or needs it.
    assert "${FREEDUET_MEMBER_TYPE" in fake_cli.agents_file.read_text()
    assert resolve_member("freeduet", [standing()]).system_prompt.startswith("You are Iris")


def test_a_prompt_change_applies_to_the_next_turn(fake_cli):
    path = fake_cli.agents_file
    path.write_text(path.read_text().replace("the test chef", "the renamed chef"))
    stat = path.stat()
    os.utime(path, (stat.st_atime, stat.st_mtime + 5))
    assert resolve_member("chef", [standing("chef")]).system_prompt == "You are Basil, the renamed chef."


def test_a_bot_made_in_the_app_runs_on_its_standing_role(fake_cli):
    role = standing("bot_custom1", "You are Ada, a research assistant.")
    member = resolve_member("bot_custom1", [role])
    assert member.system_prompt == "You are Ada, a research assistant."


def test_a_bot_made_in_the_app_answers_with_its_standing_role_once(client, fake_cli):
    fake_cli.plan([{"text": "Hello, I am Ada."}])
    role = standing("bot_custom1", "You are Ada, a research assistant.")
    events, _ = post_run(client, run_body([role, {"id": "u1", "role": "user", "content": "Who are you?"}], bot_id="bot_custom1"))
    assert types(events)[-1] == "RUN_FINISHED"
    argv = fake_cli.run(0)["argv"]
    system = argv[argv.index("--append-system-prompt") + 1]
    assert system.count("You are Ada, a research assistant.") == 1


def test_an_unknown_bot_without_its_standing_role_gets_a_plain_error(client, fake_cli):
    body = run_body([{"id": "u1", "role": "user", "content": "Hi"}], bot_id="bot_custom1")
    events, _ = post_run(client, body)
    assert types(events) == ["RUN_STARTED", "RUN_ERROR"]
    assert events[-1]["code"] == "FREEDUET_UNKNOWN_MEMBER"
    assert "standing role" in events[-1]["message"]
    assert not (fake_cli.dir / "count").exists()  # the CLI never started
