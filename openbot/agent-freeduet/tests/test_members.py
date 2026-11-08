"""The member is the one forwardedProps.openbotBotId names; its standing role is found wherever
OpenBot put it, and another Bot's is never its instructions (D3)."""

import os

import pytest

from freeduet.members import MemberError, resolve_member, standing_role
from helpers import post_run, run_body, standing, types


def test_member_is_found_by_id_and_standing_role(fake_cli):
    member = resolve_member("chef", [standing("chef")])
    assert member.id == "chef"
    assert member.system_prompt == "You are Basil, the test chef."


def test_the_standing_role_need_not_be_first(fake_cli):
    # A hop: OpenBot's personal-memory and channel rows come before the role (fixtures/handoff_*).
    messages = [
        {"id": "openduet:channel", "role": "system", "content": "This conversation is the channel."},
        {"id": "openbot:personal-memory", "role": "system", "content": "The person invoices in EUR."},
        standing("bot_custom1", "You are Ada, a research assistant."),
        {"id": "u1", "role": "user", "content": "Hi"},
    ]
    assert standing_role("bot_custom1", messages) == "You are Ada, a research assistant."
    assert resolve_member("bot_custom1", messages).system_prompt == "You are Ada, a research assistant."


def test_another_bots_standing_role_is_not_this_members_prompt(fake_cli):
    # The bot id is OpenBot's own word for who this run is; another Bot's role changes nothing.
    member = resolve_member("chef", [standing("freeduet")])
    assert member.id == "chef"
    assert member.system_prompt == "You are Basil, the test chef."
    assert standing_role("chef", [standing("freeduet")]) is None
    # A Bot that is not in agents.yaml and carries only another Bot's role has no instructions.
    with pytest.raises(MemberError, match="no instructions"):
        resolve_member("bot_custom1", [standing("freeduet", "You are Iris.")])


def test_a_run_that_names_no_member_is_refused(fake_cli):
    with pytest.raises(MemberError, match="did not say which team member"):
        resolve_member("", [standing("freeduet")])


def test_rows_keep_their_placeholders_and_only_the_prompt_is_read(fake_cli):
    # The file holds ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}: nothing here expands or needs it.
    assert "${FREEDUET_MEMBER_TYPE" in fake_cli.agents_file.read_text()
    assert resolve_member("freeduet", [standing()]).system_prompt.startswith("You are Iris")


def test_a_package_member_runs_on_its_prompt_without_a_standing_role(fake_cli):
    assert resolve_member("chef", [{"id": "u1", "role": "user", "content": "Hi"}]).system_prompt == (
        "You are Basil, the test chef."
    )


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
    assert "no instructions" in events[-1]["message"]
    assert not (fake_cli.dir / "count").exists()  # the CLI never started


def test_a_run_without_a_bot_id_is_refused_before_the_cli_starts(client, fake_cli):
    body = run_body([standing("chef"), {"id": "u1", "role": "user", "content": "Hi"}], bot_id="")
    events, _ = post_run(client, body)
    assert types(events) == ["RUN_STARTED", "RUN_ERROR"]
    assert events[-1]["code"] == "FREEDUET_UNKNOWN_MEMBER"
    assert "did not say which team member" in events[-1]["message"]
    assert not (fake_cli.dir / "count").exists()
