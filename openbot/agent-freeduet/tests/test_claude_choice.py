"""D139: the person's optional Claude model and effort for one member (claude_choice.py).

Nothing here starts the real CLI: the fake CLI records the argv it was started with."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from freeduet import claude_choice, claude_cli, engine_panel as panel
from freeduet.engines import EXAMPLE_ENGINES_FILE, EnginesFileError, load_engines, parse_engines
from freeduet.failure_classifier import REJECTED, classify_failure
from helpers import MANAGED_TOKEN, post_run, run_body, standing

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
CHOICE_URL = "/engines/panel/members/chef/claude"


def argv_for(tmp_path, choice):
    return claude_cli.build_command("claude", tmp_path / "mcp.json", "x", tmp_path, choice=choice)


def after(argv, flag):
    return argv[argv.index(flag) + 1]


# -- the argument list ------------------------------------------------------------------------


def test_no_choice_adds_no_flag_and_the_command_is_what_it_was(tmp_path):
    plain = claude_cli.build_command("claude", tmp_path / "mcp.json", "x", tmp_path)
    for choice in (None, claude_choice.ClaudeChoice()):
        assert argv_for(tmp_path, choice) == plain
    assert "--model" not in plain and "--effort" not in plain


def test_the_model_and_the_effort_are_each_added_only_when_set(tmp_path):
    only_model = argv_for(tmp_path, claude_choice.ClaudeChoice(model="haiku"))
    assert after(only_model, "--model") == "haiku" and "--effort" not in only_model
    only_effort = argv_for(tmp_path, claude_choice.ClaudeChoice(effort="max"))
    assert after(only_effort, "--effort") == "max" and "--model" not in only_effort
    both = argv_for(tmp_path, claude_choice.ClaudeChoice("opus", "xhigh"))
    assert (after(both, "--model"), after(both, "--effort")) == ("opus", "xhigh")


@pytest.mark.parametrize("bad", ["claude-opus-4-1", "Opus", "--dangerously-skip-permissions", "opus --effort max", "", "default", 7, ["opus"]])
def test_a_word_off_the_lists_never_reaches_the_command_line(tmp_path, bad):
    argv = argv_for(tmp_path, claude_choice.ClaudeChoice(model=bad, effort=bad))
    assert argv == claude_cli.build_command("claude", tmp_path / "mcp.json", "x", tmp_path)
    assert "--dangerously-skip-permissions" not in argv


def test_the_lists_are_the_ones_the_cli_help_names():
    # `claude --help` of 2.1.311: --effort (low, medium, high, xhigh, max); --model takes the aliases haiku, sonnet, opus.
    assert claude_choice.EFFORTS == ("low", "medium", "high", "xhigh", "max")
    assert claude_choice.MODELS == ("haiku", "sonnet", "opus")


def test_the_lockdown_is_unchanged_by_a_choice(tmp_path):
    argv = argv_for(tmp_path, claude_choice.ClaudeChoice("sonnet", "high"))
    assert after(argv, "--tools") == "" and after(argv, "--permission-mode") == "dontAsk"
    assert "--strict-mcp-config" in argv and after(argv, "--allowedTools") == "mcp__freeduet"


def test_a_model_the_subscription_cannot_use_is_a_refused_request_not_a_crash():
    for said in (
        "There's an issue with the selected model (opus). It may not exist or you may not have access to it.",
        "Claude Opus is not available with the Claude Pro plan. If you have updated your subscription plan recently, run /login",
    ):
        assert classify_failure(said).kind == REJECTED


# -- the file ---------------------------------------------------------------------------------


def test_the_loader_reads_a_choice_and_refuses_a_word_off_the_lists():
    base = yaml.safe_load(EXAMPLE_ENGINES_FILE.read_text())
    ok = parse_engines({**base, "claude": {"chef": {"model": "sonnet", "effort": "low"}, "inbox": {"effort": "max"}}})
    assert ok.claude["chef"] == claude_choice.ClaudeChoice("sonnet", "low")
    assert ok.claude["inbox"] == claude_choice.ClaudeChoice(None, "max")
    assert parse_engines(base).claude == {}
    for bad in (
        {"chef": {"model": "gpt-9"}},
        {"chef": {"effort": "extreme"}},
        {"chef": {"model": "opus --effort max"}},
        {"chef": {"flag": "x"}},
        {"chef": "opus"},
        {"default": {"model": "opus"}},
        ["chef"],
    ):
        with pytest.raises(EnginesFileError):
            parse_engines({**base, "claude": bad})


# -- the panel and its route ------------------------------------------------------------------


@pytest.fixture
def data(fake_cli):
    return fake_cli.data_dir


def written(data):
    return yaml.safe_load((Path(data) / "engines.yaml").read_text())


def test_the_choice_round_trips_through_the_panel_file(data):
    first = panel.apply_claude_choice("chef", "haiku", "low")
    assert first == {"member": "chef", "model": "haiku", "effort": "low", "changed": True}
    assert written(data)["claude"] == {"chef": {"model": "haiku", "effort": "low"}}
    assert load_engines().claude["chef"] == claude_choice.ClaudeChoice("haiku", "low")
    assert panel.apply_claude_choice("chef", "haiku", "low")["changed"] is False  # the same: nothing written
    panel.apply_claude_choice("chef", None, "high")
    assert written(data)["claude"] == {"chef": {"effort": "high"}}
    reset = panel.apply_claude_choice("chef", "default", None)
    assert reset["changed"] is True and "claude" not in written(data)
    assert load_engines().claude == {}


@pytest.mark.parametrize("model,effort", [("gpt-9", None), (None, "extreme"), ("opus --effort max", None), (5, None), (None, ["low"]), ("Opus", None)])
def test_the_panel_refuses_anything_off_the_lists_and_writes_nothing(data, model, effort):
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_claude_choice("chef", model, effort)
    assert (caught.value.code, caught.value.status) == ("claude_choice_invalid", 400)
    assert not (Path(data) / "engines.yaml").exists()


def test_an_unknown_member_and_the_persons_own_file_are_refused(data, tmp_path, monkeypatch):
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_claude_choice("nobody", "opus", None)
    assert (caught.value.code, caught.value.status) == ("unknown_member", 404)
    own = tmp_path / "own.yaml"
    own.write_text("engines:\n  claude-code: {kind: cli, billing: subscription, tier: A}\n")
    monkeypatch.setenv("FREEDUET_ENGINES_FILE", str(own))
    with pytest.raises(panel.PanelRefused) as caught:
        panel.apply_claude_choice("chef", "opus", None)
    assert (caught.value.code, caught.value.status) == ("file_is_yours", 409)
    assert own.read_text().startswith("engines:")


def test_the_route_needs_the_token_validates_and_shows_in_the_overview(client):
    assert client.put(CHOICE_URL, json={"model": "opus"}).status_code == 401
    assert client.put("/engines/panel/members/nobody/claude", json={"model": "opus"}, headers=AUTH).status_code == 404
    refused = client.put(CHOICE_URL, json={"model": "--dangerously-skip-permissions"}, headers=AUTH)
    assert (refused.status_code, refused.json()["error"]) == (400, "claude_choice_invalid")

    def chef():
        return next(m for m in client.get("/engines", headers=AUTH).json()["members"] if m["id"] == "chef")

    assert chef()["claude"] == {"model": None, "effort": None}
    done = client.put(CHOICE_URL, json={"model": "sonnet", "effort": "high"}, headers=AUTH)
    assert done.status_code == 200 and done.json()["changed"] is True
    assert chef()["claude"] == {"model": "sonnet", "effort": "high"}
    assert client.put(CHOICE_URL, json={}, headers=AUTH).json()["changed"] is True  # an empty body resets to the default
    assert chef()["claude"] == {"model": None, "effort": None}


def test_a_chosen_model_reaches_that_member_s_cli_and_no_one_elses(client, fake_cli):
    client.put(CHOICE_URL, json={"model": "haiku", "effort": "low"}, headers=AUTH)
    fake_cli.plan([{"text": "Hi."}], [{"text": "Hi."}])
    user = {"id": "u1", "role": "user", "content": "Hello"}
    post_run(client, run_body([standing("chef", "You are Basil."), user], bot_id="chef"))
    seen = fake_cli.run(0)["argv"]
    assert (after(seen, "--model"), after(seen, "--effort")) == ("haiku", "low")
    post_run(client, run_body([standing(), user], run_id="run-2", thread_id="thread-2"))
    other = fake_cli.run(1)["argv"]
    assert "--model" not in other and "--effort" not in other


def test_the_choice_also_reaches_the_cli_when_the_router_walks_a_chain(client, fake_cli):
    client.put("/engines/panel/ollama", json={"enabled": True, "model": "qwen2.5:7b"}, headers=AUTH)
    assert client.put(CHOICE_URL, json={"model": "opus", "effort": "max"}, headers=AUTH).status_code == 200
    from freeduet.app import app

    assert app.state.engine_router.engaged("chef")  # more than one engine: the router runs the turn, not the plain path
    fake_cli.plan([{"text": "Hi."}])
    post_run(client, run_body([standing("chef", "You are Basil."), {"id": "u1", "role": "user", "content": "Hello"}], bot_id="chef"))
    seen = fake_cli.run(0)["argv"]
    assert (after(seen, "--model"), after(seen, "--effort")) == ("opus", "max")
