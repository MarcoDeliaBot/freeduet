"""Check again (docs/design/first-start.md section 4, slice S1): `POST /engines/claude/check` asks Claude Code now.

Nothing restarts between two answers. The fake CLI reads its answer to `auth status` on every call, so a test changes
the sign-in between two requests, as the person does by signing in, and asks the same running service again. The probe
is two commands with no prompt (fake_claude.py): no run is counted and no model answers.
"""

import json

from helpers import MANAGED_TOKEN

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
SIGNED_OUT = {"auth": {"fixture": "auth_status_signed_out.json", "exit": 1}}
SIGNED_IN = {"auth": {"fixture": "auth_status_signed_in.json", "exit": 0}}
# The signed-in fixture is synthetic and carries an invented account (test_engine_probe.py says so): the answer never does.
ACCOUNT = ("person@example.invalid", "Example Organisation")


def sign_in(fake_cli, plan):
    (fake_cli.dir / "probe.json").write_text(json.dumps(plan))


def check(client):
    response = client.post("/engines/claude/check", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def claude(client) -> dict:
    response = client.get("/engines", headers=AUTH)
    assert response.status_code == 200, response.text
    (only,) = response.json()["engines"]
    return only


def test_check_again_sees_a_sign_in_made_after_start_and_the_next_read_agrees(client, fake_cli):
    sign_in(fake_cli, SIGNED_OUT)
    first = check(client)
    assert first["installed"] is True and first["signed_in"] is False
    assert claude(client)["state"] == "signed_out"

    sign_in(fake_cli, SIGNED_IN)  # the person signs in, in a terminal or on Claude's own page
    second = check(client)
    assert second["signed_in"] is True
    shown = claude(client)
    assert shown["state"] == "ready" and shown["signed_in"] is True


def test_check_again_starts_two_probe_commands_and_no_run(client, fake_cli):
    sign_in(fake_cli, SIGNED_IN)
    check(client)
    argv = sorted(json.loads(path.read_text())["argv"] for path in fake_cli.dir.glob("probe-*.json"))
    assert argv == [["--version"], ["auth", "status"]]
    assert not (fake_cli.dir / "run-0.json").exists()  # no prompt went in, so nothing was counted


def test_check_again_says_nothing_of_the_account(client, fake_cli):
    sign_in(fake_cli, SIGNED_IN)
    body = json.dumps(check(client))
    assert not any(text in body for text in ACCOUNT)


def test_check_again_when_the_program_is_missing_says_not_installed(client, fake_cli, monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    answer = check(client)
    assert answer["installed"] is False and answer["signed_in"] is None
    assert claude(client)["installed"] is False


def test_check_again_needs_the_services_token_before_anything_runs(client, fake_cli):
    response = client.post("/engines/claude/check")
    assert response.status_code == 401
    assert not list(fake_cli.dir.glob("probe-*.json"))
