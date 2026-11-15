"""Plain words and one status (docs/design/first-start.md section 5, slice S2).

What a person reads when Claude Code is not installed, or holds no sign-in, is one module's and is written in English. The
sentences below are the design's words, typed here on purpose: a test that imported them could not notice a change. Each
situation is reached through the real code path (a fake CLI, or a binary that does not exist), and no sentence carries a
command to type, a path, an account, or what the CLI printed.
"""

import asyncio
import json

import pytest

from freeduet import claude_cli
from freeduet.claude_status import MISSING, NOT_SIGNED_IN, SIGNED_IN, UNKNOWN, status_of
from freeduet.engine_adapter import COULD_NOT_RUN, NOT_INSTALLED, TIMED_OUT, UNREADABLE, ProbeResult
from helpers import MANAGED_TOKEN, post_run, run_body, standing

MISSING_SENTENCE = (
    "Claude is not installed on this computer yet. It comes from Anthropic's own package, "
    "which is added when FreeDuet's service is built."
)
NOT_SIGNED_IN_SENTENCE = "Claude is not connected yet. You sign in on Claude's own page; FreeDuet never sees your password."
AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
ASK = [standing(), {"id": "u1", "role": "user", "content": "Hello"}]
PLAN_SIGNED_OUT = {"auth": {"fixture": "auth_status_signed_out.json", "exit": 1}}
PLAN_SIGNED_IN = {"auth": {"fixture": "auth_status_signed_in.json", "exit": 0}}
PLAN_UNREADABLE = {"auth": {"text": "not an answer"}}


def check(client):
    response = client.post("/engines/claude/check", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def probe_says(fake_cli, plan):
    (fake_cli.dir / "probe.json").write_text(json.dumps(plan))


@pytest.mark.parametrize(
    ("result", "status"),
    [
        (ProbeResult(installed=False, problem=NOT_INSTALLED), MISSING),
        (ProbeResult(installed=True, version="2.1.311", signed_in=False), NOT_SIGNED_IN),
        (ProbeResult(installed=True, version="2.1.311", signed_in=True), SIGNED_IN),
        (ProbeResult(installed=True, version="2.1.311", problem=UNREADABLE), UNKNOWN),
        (ProbeResult(installed=True, problem=TIMED_OUT), UNKNOWN),
        (ProbeResult(problem=COULD_NOT_RUN), UNKNOWN),
        (ProbeResult(), UNKNOWN),
    ],
)
def test_the_probe_becomes_one_status_and_no_answer_is_never_not_signed_in(result, status):
    assert status_of(result) == status


@pytest.mark.parametrize("sentence", [MISSING_SENTENCE, NOT_SIGNED_IN_SENTENCE])
def test_each_sentence_is_plain_english_with_no_command_path_account_or_line_break(sentence):
    assert sentence.endswith(".") and "\n" not in sentence and len(sentence) <= 200
    for typed in ("`", "docker", "compose", "exec", "/", "@", "$"):
        assert typed not in sentence


def test_a_missing_program_is_said_in_the_chat_in_plain_words(client, monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    events, _ = post_run(client, run_body(ASK))
    assert events[-1] == {"type": "RUN_ERROR", "message": MISSING_SENTENCE}


def test_a_sign_in_the_cli_refuses_is_said_in_plain_words_and_keeps_its_code(client, fake_cli):
    fake_cli.plan([{"replay": "not_signed_in.jsonl"}])
    events, _ = post_run(client, run_body(ASK))
    assert events[-1] == {
        "type": "RUN_ERROR",
        "message": NOT_SIGNED_IN_SENTENCE,
        "code": "OPENBOT_MODEL_AUTH_REQUIRED",
    }


def test_what_the_cli_printed_is_never_echoed_into_the_sign_in_sentence(client, fake_cli):
    secret = "CANARY-what-the-cli-printed"
    fake_cli.plan([{"stderr": f"Invalid API key · Please run /login {secret}"}, {"exit": 1}])
    events, _ = post_run(client, run_body(ASK))
    assert events[-1]["message"] == NOT_SIGNED_IN_SENTENCE
    assert secret not in json.dumps(events)


def test_a_server_call_with_no_program_is_told_the_same_words(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    with pytest.raises(claude_cli.TextCallFailed) as raised:
        asyncio.run(claude_cli.run_text("", "Hi"))
    assert str(raised.value) == MISSING_SENTENCE


def test_a_server_call_with_no_sign_in_is_told_the_same_words(fake_cli):
    fake_cli.plan([{"replay": "not_signed_in.jsonl"}])
    with pytest.raises(claude_cli.TextCallFailed) as raised:
        asyncio.run(claude_cli.run_text("", "Hi"))
    assert str(raised.value) == NOT_SIGNED_IN_SENTENCE


def test_check_again_answers_three_facts_and_one_status_and_no_words(client, fake_cli):
    probe_says(fake_cli, PLAN_SIGNED_OUT)
    answer = check(client)
    assert set(answer) == {"installed", "signed_in", "version", "status"}
    assert answer["status"] == "not_signed_in"


def test_check_again_gives_the_status_each_probe_answer_means(client, fake_cli, monkeypatch, tmp_path):
    probe_says(fake_cli, PLAN_SIGNED_OUT)
    assert check(client)["status"] == "not_signed_in"
    probe_says(fake_cli, PLAN_SIGNED_IN)
    assert check(client)["status"] == "signed_in"
    probe_says(fake_cli, PLAN_UNREADABLE)
    assert check(client)["status"] == "unknown"
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "no-such-claude"))
    assert check(client)["status"] == "missing"
