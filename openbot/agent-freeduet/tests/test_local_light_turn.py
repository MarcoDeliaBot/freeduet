"""D108: a local model gets a longer first-answer limit, a notice while it reads, and a much smaller (light) turn.

Everything runs against the fake CLI or a loopback server of this test's own: no model answers, nothing leaves
127.0.0.1. What is proven is what the service does around the CLI, not that a real Ollama answers.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
import yaml

from freeduet import compatible_engine as ce
from freeduet import engine_router, transcript
from freeduet.app import app
from freeduet.engines import (
    LOCAL_FIRST_ANSWER_SECONDS,
    EnginesFileError,
    first_answer_limit,
    is_light,
    is_local_model,
    parse_engines,
)
from freeduet.members import Member
from freeduet.system_role_proxy import SystemRoleProxy
from gateway_support import CLAUDE_ENTRY, KEY, chain, config_with, rig
from helpers import post_run, run_body, standing, tool, types

ASK = [standing(), {"id": "u1", "role": "user", "content": "Hello, what is for dinner?"}]
LIMIT = {"replay": "usage_limit.jsonl"}
LOCAL = {"no_key": True, "base_url": "http://127.0.0.1:11434", "credential_secret_ref": None}
CLOUD = {"base_url": "https://gateway.example.com", "light": None}
AGENTS = Path(__file__).resolve().parents[2] / "examples" / "freeduet" / "agents.yaml"


def said(events) -> str:
    return "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")


def engine_of(entry: dict):
    return config_with(entry).engines["gw"]


# -- the entry: who is local, the limit, the light flag --------------------------------------------------------------


def test_a_free_entry_on_this_machine_or_network_is_a_local_model_and_a_cloud_one_is_not():
    assert is_local_model(engine_of(LOCAL))
    assert is_local_model(engine_of({"base_url": "http://127.0.0.1:11434"}))  # keyed, loopback
    assert is_local_model(engine_of({"base_url": "https://192.168.1.20:11434"}))  # keyed, a private address
    assert not is_local_model(engine_of(CLOUD))
    assert not is_local_model(engine_of({"base_url": "http://127.0.0.1:11434", "billing": "metered"}))
    assert not is_local_model(config_with().engines["claude-code"])


def test_only_a_local_model_has_its_own_first_answer_limit_and_the_default_is_long():
    assert first_answer_limit(engine_of(LOCAL)) == LOCAL_FIRST_ANSWER_SECONDS == 900.0
    assert first_answer_limit(engine_of({**LOCAL, "first_answer_seconds": 1500})) == 1500.0
    assert first_answer_limit(engine_of(CLOUD)) is None  # the router's own limit stays
    assert first_answer_limit(config_with().engines["claude-code"]) is None


@pytest.mark.parametrize("entry", [CLOUD, {"billing": "metered", "base_url": "https://gateway.example.com"}])
def test_a_cloud_entry_cannot_lengthen_its_limit(entry):
    with pytest.raises(EnginesFileError, match="first_answer_seconds"):
        config_with({**entry, "first_answer_seconds": 900})


@pytest.mark.parametrize("value", [0, 5, 7201, -1, "900", True])
def test_a_first_answer_limit_out_of_bounds_is_refused(value):
    with pytest.raises(EnginesFileError, match="first_answer_seconds"):
        config_with({**LOCAL, "first_answer_seconds": value})


def test_light_is_on_for_a_local_model_unless_the_entry_says_no_and_on_for_any_entry_that_says_yes():
    assert is_light(engine_of({**LOCAL, "light": None}))
    assert not is_light(engine_of({**LOCAL, "light": False}))
    assert is_light(engine_of({**CLOUD, "light": True}))
    assert not is_light(engine_of(CLOUD))
    assert not is_light(config_with().engines["claude-code"])
    with pytest.raises(EnginesFileError, match="light"):
        parse_engines({"engines": {"c": {**CLAUDE_ENTRY, "light": True}}, "chains": {"default": ["c"]}})


# -- where the limit is: the router, the CLI's own waits, the hop -------------------------------------------------------


def test_the_cli_of_a_local_model_waits_as_long_as_the_router_and_a_cloud_one_keeps_its_own(tmp_path, monkeypatch):
    local = ce.patience_env(engine_of(LOCAL))
    assert set(local) == set(ce.PATIENCE_VARIABLES)
    assert set(local.values()) == {str(int((900 + ce.PATIENCE_SLACK_SECONDS) * 1000))}
    assert ce.patience_env(engine_of(CLOUD)) == {}
    cloud = rig(tmp_path, monkeypatch, CLOUD)
    assert not set(ce.PATIENCE_VARIABLES) & set(cloud.engine.child_env({"PATH": "/usr/bin", "FREEDUET_TEST_GATEWAY_KEY": KEY}))
    near = rig(tmp_path, monkeypatch, LOCAL, key=None)
    assert near.engine.child_env({"PATH": "/usr/bin"})["API_TIMEOUT_MS"] == "960000"


def test_the_hop_of_a_local_model_waits_for_its_upstream_as_long_as_the_entry_says():
    async def go():
        async with SystemRoleProxy("http://127.0.0.1:1", read_seconds=1500.0) as hop:
            return hop._client.timeout.read
        
    assert asyncio.run(go()) == 1500.0
    assert SystemRoleProxy("http://127.0.0.1:1")._client.timeout.read == 900.0


def test_a_local_model_that_is_silent_past_the_routers_limit_is_not_cut_and_is_told_it_is_reading(
    client, fake_cli, tmp_path, monkeypatch
):
    monkeypatch.setenv("FREEDUET_FIRST_OUTPUT_SECONDS", "1")  # what cut a cloud engine, and what cut the local one at 180 s
    monkeypatch.setattr(engine_router, "LOCAL_NOTICE_AFTER_SECONDS", 0.3)
    team = chain(tmp_path, monkeypatch, LOCAL, key=None)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"sleep": 2.5}, {"text": "Pasta tonight."}])
    app.state.engine_router = team.router
    events = post_run(client, run_body(ASK))[0]
    text = said(events)
    assert "The local model (gw) is reading your request" in text
    assert text.count("is reading your request") == 1
    assert text.endswith("Pasta tonight.")
    assert team.state.row("gw").last_failure_kind != "transient"


def test_a_cloud_engine_that_is_silent_past_the_limit_is_still_cut(client, fake_cli, tmp_path, monkeypatch):
    monkeypatch.setenv("FREEDUET_FIRST_OUTPUT_SECONDS", "1")
    team = chain(tmp_path, monkeypatch, CLOUD)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"sleep": 20}])
    app.state.engine_router = team.router
    events = post_run(client, run_body(ASK))[0]
    assert "is reading your request" not in said(events)
    assert team.state.row("gw").last_failure_kind == "transient"


# -- the light turn ----------------------------------------------------------------------------------------------------


def system_rows(member_id: str, prompt: str, memory=20000, catalog=40000, holdings=12000, channel=2000):
    return [
        {"id": f"standing-role:{member_id}", "role": "system", "content": prompt},
        {"id": f"granted-tools:{member_id}", "role": "system", "content": "HOLDINGS " + "h" * holdings},
        {"id": "openbot:personal-memory", "role": "system", "content": "MEMORY " + "m" * memory},
        {"id": "openbot:learned-skills", "role": "system", "content": "CATALOG " + "s" * catalog},
        {"id": "openduet:channel", "role": "system", "content": "CHANNEL " + "c" * channel},
        {"id": "u1", "role": "user", "content": "Hello"},
    ]


def context_of(rows):
    return [
        {"description": "OpenBot personal memory", "value": rows[2]["content"]},
        {"description": "OpenBot learned skills", "value": rows[3]["content"]},
    ]


def members():
    data = yaml.safe_load(AGENTS.read_text(encoding="utf-8"))
    return [Member(row["id"], row["system_prompt"].strip()) for row in data["agents"]]


def test_the_light_system_text_drops_the_catalog_and_the_holdings_cuts_the_memory_and_keeps_the_rest():
    member = Member("chef", "You are Basil, the chef. SHARED RULES PARAGRAPH.")
    rows = system_rows("chef", member.system_prompt, channel=5000)
    light = transcript.render(member, rows, context_of(rows), notes=[transcript.LIGHT_NOTE], light=True).system
    assert "CATALOG" not in light and "HOLDINGS" not in light
    assert light.startswith("You are Basil, the chef. SHARED RULES PARAGRAPH.")
    assert "m" * 20000 in light  # the personal memory is never cut
    assert transcript.LIGHT_CUT.strip() in light  # the channel row is cut, and says so
    assert "CHANNEL" in light and transcript.LIGHT_NOTE in light and transcript.RUNTIME_NOTE in light
    assert light.count("MEMORY") == 1  # the context entry that repeats the row does not bring it back whole
    full = transcript.render(member, rows, context_of(rows)).system
    assert "CATALOG" in full and "HOLDINGS" in full and len(full) > 3 * len(light)


def test_a_record_past_six_thousand_characters_of_the_personal_memory_reaches_the_light_prompt():
    import json

    member = Member("chef", "You are Basil.")
    records = [{"id": f"r{i}", "text": "Likes " + "pasta " * 30} for i in range(40)]
    records.append({"id": "allergy", "text": "ALLERGY: never any peanuts, severe"})
    memory = "CRITICAL: respect every record below.\n" + json.dumps(records)
    assert memory.index("peanuts") > 6000
    rows = [
        {"id": "standing-role:chef", "role": "system", "content": member.system_prompt},
        {"id": "openbot:personal-memory", "role": "system", "content": memory},
        {"id": "u1", "role": "user", "content": "Dinner?"},
    ]
    for context in ([], [{"description": "OpenBot personal memory", "value": memory}]):
        assert "never any peanuts" in transcript.render(member, rows, context, light=True).system
    only_context = [rows[0], rows[2]]  # a built-in Bot: the memory arrives only as a context entry
    assert "never any peanuts" in transcript.render(member, only_context, [{"description": "OpenBot personal memory", "value": memory}], light=True).system


def test_the_channel_row_and_its_context_entry_are_cut_at_the_same_three_thousand_characters():
    member = Member("chef", "You are Basil.")
    channel = "CHANNEL " + "c" * 5000
    rows = [{"id": "standing-role:chef", "role": "system", "content": member.system_prompt}, {"id": "openduet:channel", "role": "system", "content": channel}]
    as_row = transcript.render(member, rows, [], light=True).system
    as_context = transcript.render(member, rows[:1], [{"description": "Channel", "value": channel}], light=True).system
    assert "c" * 2900 in as_row and "c" * 3001 not in as_row
    assert "c" * 2900 in as_context and "c" * 3001 not in as_context


def test_an_unknown_row_is_kept_not_dropped_by_a_guess():
    member = Member("chef", "You are Basil.")
    rows = [*system_rows("chef", member.system_prompt)[:1], {"id": "something-new", "role": "system", "content": "NEW RULE"}]
    assert "NEW RULE" in transcript.render(member, rows, [], light=True).system


@pytest.mark.parametrize("member", members(), ids=lambda m: m.id)
def test_every_members_light_prompt_keeps_its_whole_own_prompt_and_stays_under_eight_thousand_tokens(member):
    rows = system_rows(member.id, member.system_prompt, memory=6000)  # a normal memory (the light turn never cuts it); a catalog and holdings far larger than a normal turn's
    light = transcript.render(member, rows, context_of(rows), notes=[transcript.LIGHT_NOTE], light=True).system
    assert member.system_prompt in light  # the shared rules and every other rule of the member, word for word
    assert len(light) <= 28_000  # about 7,000 tokens at 4 characters a token, with the tool list and the question still to add
    full = transcript.render(member, rows, context_of(rows)).system
    assert len(full) > 60_000  # the shape seen live: 79,521 characters in one system block


TOOLS = [
    tool(name)
    for name in ("message_bot", "ask_person", "recall_personal_memory", "remember_personal_fact", "computer_navigate", "gmail_send", "write_page")
]


def one_turn(client, fake_cli, tmp_path, monkeypatch, entry, tools=()):
    team = chain(tmp_path, monkeypatch, entry, key=None)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Done."}])
    app.state.engine_router = team.router
    post_run(client, run_body(ASK, tools=tools))
    return team.gw


def test_a_light_turn_offers_only_the_tools_of_a_plain_conversation(client, fake_cli, tmp_path, monkeypatch):
    gw = one_turn(client, fake_cli, tmp_path, monkeypatch, {**LOCAL, "light": None}, TOOLS)
    names = [item["name"] for item in gw.run(0)["tools"]]
    assert sorted(names) == ["ask_person", "message_bot", "recall_personal_memory", "remember_personal_fact"]


def test_a_full_turn_on_the_same_entry_offers_every_tool(client, fake_cli, tmp_path, monkeypatch):
    gw = one_turn(client, fake_cli, tmp_path, monkeypatch, {**LOCAL, "light": False}, TOOLS)
    assert {item["name"] for item in gw.run(0)["tools"]} >= {item["name"] for item in TOOLS}


@pytest.mark.parametrize(
    ("light", "present", "absent"),
    [(None, "--system-prompt", "--append-system-prompt"), (False, "--append-system-prompt", "--system-prompt")],
)
def test_the_cli_of_a_light_turn_replaces_its_own_prompt_and_a_full_turn_adds_to_it(
    client, fake_cli, tmp_path, monkeypatch, light, present, absent
):
    gw = one_turn(client, fake_cli, tmp_path, monkeypatch, {**LOCAL, "light": light})
    argv = gw.turns()[0]["argv"]
    assert present in argv and absent not in argv
    # The lockdown is the same: no built-in tool, no other MCP server, the headless permission mode.
    assert argv[argv.index("--tools") + 1] == "" and "--strict-mcp-config" in argv and "--permission-mode" in argv


def test_the_light_note_tells_the_member_what_it_cannot_do_and_not_to_pretend():
    assert "never pretend" in transcript.LIGHT_NOTE and "stronger engine" in transcript.LIGHT_NOTE
