"""D121: the transcript fits the engine. What is cut, what never is, and the refusal when the least a turn needs does not fit."""

from __future__ import annotations

import pytest

from freeduet import transcript
from freeduet.app import app
from freeduet.engines import (
    DEFAULT_LOCAL_CONTEXT_TOKENS,
    EnginesFileError,
    context_limit,
    parse_engines,
)
from freeduet.members import Member
from gateway_support import CLAUDE_ENTRY, chain, config_with
from helpers import post_run, run_body, standing

MEMBER = Member("chef", "You are Basil, the chef.")
MEMORY = "MEMORY never any peanuts, severe allergy " + "m" * 3000
LIMIT = {"replay": "usage_limit.jsonl"}
LOCAL = {"no_key": True, "base_url": "http://127.0.0.1:11434", "credential_secret_ref": None}


def rows():
    return [
        {"id": "standing-role:chef", "role": "system", "content": MEMBER.system_prompt},
        {"id": "openbot:personal-memory", "role": "system", "content": MEMORY},
    ]


def conversation(turns: int, size: int = 600):
    messages = []
    for i in range(turns):
        messages.append({"id": f"u{i}", "role": "user", "content": f"QUESTION-{i} " + "q" * size})
        messages.append({"id": f"a{i}", "role": "assistant", "content": f"ANSWER-{i} " + "a" * size})
    messages.append({"id": "last", "role": "user", "content": "LATEST-MESSAGE what is for dinner?"})
    return messages


def with_tool_pairs(turns: int):
    messages = []
    for i in range(turns):
        messages.append({"id": f"u{i}", "role": "user", "content": f"QUESTION-{i} " + "q" * 400})
        messages.append({"id": f"a{i}", "role": "assistant", "content": "", "toolCalls": [
            {"id": f"call-{i}", "type": "function", "function": {"name": "recall_personal_memory", "arguments": "{}"}}]})
        messages.append({"id": f"t{i}", "role": "tool", "toolCallId": f"call-{i}", "content": f"RESULT-{i} " + "r" * 400})
        messages.append({"id": f"b{i}", "role": "assistant", "content": f"ANSWER-{i} " + "a" * 400})
    messages.append({"id": "last", "role": "user", "content": "LATEST-MESSAGE"})
    return messages


def render(messages, tokens):
    return transcript.render(MEMBER, [*rows(), *messages], [], context_tokens=tokens)


def size(rendered):
    return len(rendered.system) + len(rendered.prompt)


# -- trimming --------------------------------------------------------------------------------------------------------


def test_without_a_known_context_nothing_is_cut():
    messages = conversation(60)
    plain = transcript.render(MEMBER, [*rows(), *messages], [])
    assert transcript.TRIMMED_NOTE not in plain.prompt and "QUESTION-0 " in plain.prompt


def test_a_conversation_that_fits_is_sent_whole_without_the_note():
    out = render(conversation(3), 32768)
    assert transcript.TRIMMED_NOTE not in out.prompt and "QUESTION-0 " in out.prompt


def test_a_long_conversation_loses_its_oldest_turns_first_and_says_so_once():
    messages = conversation(120)
    tokens = 12000
    out = render(messages, tokens)
    assert size(out) <= transcript.budget_chars(tokens)
    assert out.prompt.count(transcript.TRIMMED_NOTE) == 1
    assert "QUESTION-0 " not in out.prompt and "QUESTION-119 " in out.prompt  # the oldest went, the newest stayed
    kept = [i for i in range(120) if f"QUESTION-{i} " in out.prompt]
    assert kept == list(range(kept[0], 120))  # one block at the end: nothing in the middle was dropped
    assert "LATEST-MESSAGE what is for dinner?" in out.prompt
    assert out.prompt.index(transcript.TRIMMED_NOTE) < out.prompt.index("<conversation>")


def test_the_personal_memory_and_the_members_own_prompt_are_never_cut():
    for tokens in (6000, 12000, 30000):
        out = render(conversation(200), tokens)
        assert MEMORY in out.system and MEMBER.system_prompt in out.system
        assert "LATEST-MESSAGE what is for dinner?" in out.prompt


def test_a_context_entry_with_the_memory_is_never_cut_either():
    memory = "MEMORY-ENTRY " + "z" * 5000
    out = transcript.render(MEMBER, [rows()[0], *conversation(150)], [{"description": "OpenBot personal memory", "value": memory}], context_tokens=9000)
    assert memory in out.system


@pytest.mark.parametrize("tokens", range(5000, 9000, 137))
def test_a_tool_call_and_its_result_are_never_separated_whatever_the_size(tokens):
    out = render(with_tool_pairs(60), tokens)
    prompt = out.prompt
    for i in range(60):
        has_call = f'<tool_call id="call-{i}"' in prompt
        has_result = f'<tool_result id="call-{i}"' in prompt
        assert has_call == has_result, f"pair {i} was split at {tokens} tokens"
    assert "LATEST-MESSAGE" in prompt and size(out) <= transcript.budget_chars(tokens)


def test_the_calls_after_the_latest_message_are_part_of_what_is_never_cut():
    messages = [*conversation(80)[:-1], {"id": "last", "role": "user", "content": "LATEST please look it up"},
                {"id": "a", "role": "assistant", "content": "", "toolCalls": [{"id": "call-x", "type": "function", "function": {"name": "message_bot", "arguments": '{"bot":"otto"}'}}]},
                {"id": "t", "role": "tool", "toolCallId": "call-x", "content": "Otto has it."}]
    out = render(messages, 7000)
    assert 'id="call-x"' in out.prompt and "Otto has it." in out.prompt and "LATEST please look it up" in out.prompt


def test_the_estimate_is_conservative():
    assert transcript.CHARS_PER_TOKEN == 3
    assert transcript.budget_chars(65536) == int((65536 * transcript.CONTEXT_USE - transcript.ANSWER_RESERVE_TOKENS) * 3)
    assert transcript.budget_chars(65536) < 65536 * 3  # always under what the engine holds


def test_the_live_case_410k_characters_on_a_65k_model_is_cut_to_fit():
    messages = [{"id": f"m{i}", "role": "user" if i % 2 == 0 else "assistant", "content": ("x" * 1000) + f" {i}"} for i in range(410)]
    messages.append({"id": "last", "role": "user", "content": "che temperatura fa oggi a Roma?"})
    big = [{"id": "standing-role:chef", "role": "system", "content": "p" * 43000}, rows()[1]]
    out = transcript.render(MEMBER, [*big, *messages], [], context_tokens=65536)
    assert size(out) <= transcript.budget_chars(65536)
    assert "che temperatura fa oggi a Roma?" in out.prompt and transcript.TRIMMED_NOTE in out.prompt


# -- the refusal -----------------------------------------------------------------------------------------------------


def test_when_the_least_a_turn_needs_does_not_fit_nothing_is_rendered():
    with pytest.raises(transcript.ContextTooSmall) as caught:
        render(conversation(2), 2600)  # the memory alone is about a thousand tokens; the answer reserve is two thousand
    assert caught.value.needed > caught.value.available


def test_a_latest_message_that_alone_is_too_big_is_refused_not_cut():
    messages = [{"id": "last", "role": "user", "content": "y" * 200_000}]
    with pytest.raises(transcript.ContextTooSmall):
        render(messages, 32768)


def test_the_refusal_stops_the_turn_before_anything_is_sent(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {**LOCAL, "context_tokens": 2048}, key=None)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Never run."}])
    app.state.engine_router = team.router
    body = run_body([standing(content="s" * 9000), {"id": "u1", "role": "user", "content": "Hello"}])
    events = post_run(client, body)[0]
    errors = [e for e in events if e["type"] == "RUN_ERROR"]
    assert len(errors) == 1 and "too long for gw" in errors[0]["message"] and "Start a new conversation" in errors[0]["message"]
    assert team.gw.turns() == []  # nothing reached the model
    assert team.state.row("gw").last_failure_kind in (None, "unknown")  # and the engine was not marked as failing


def test_the_refusal_is_in_the_persons_language(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {**LOCAL, "context_tokens": 2048}, key=None)
    fake_cli.plan([LIMIT])
    app.state.engine_router = team.router
    body = run_body([standing(content="s" * 9000), {"id": "u1", "role": "user", "content": "Ciao"}])
    body["forwardedProps"]["openbotPersonLanguage"] = {"code": "it", "name": "Italian"}
    events = post_run(client, body)[0]
    message = next(e["message"] for e in events if e["type"] == "RUN_ERROR")
    assert "troppo lunga per gw" in message and "nuova conversazione" in message


def test_a_long_thread_reaches_a_local_model_cut_to_its_context(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, {**LOCAL, "context_tokens": 16384}, key=None)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "Done."}])
    app.state.engine_router = team.router
    messages = [standing(), *conversation(150, 800)]
    post_run(client, run_body(messages))
    sent = team.gw.run(0)
    assert transcript.TRIMMED_NOTE in sent["prompt"] and "LATEST-MESSAGE" in sent["prompt"]
    assert len(sent["prompt"]) <= transcript.budget_chars(16384)  # the system text is a separate argument and is counted by render
    assert "QUESTION-0 " not in sent["prompt"]


def test_claude_code_is_not_cut(client, fake_cli, tmp_path):
    fake_cli.plan([{"text": "Done."}])
    post_run(client, run_body([standing(), *conversation(150, 800)]))
    assert "QUESTION-0 " in fake_cli.run(0)["prompt"] and transcript.TRIMMED_NOTE not in fake_cli.run(0)["prompt"]


# -- the entry -------------------------------------------------------------------------------------------------------


def engine_of(entry):
    return config_with(entry).engines["gw"]


def test_a_local_model_without_a_stated_size_is_taken_to_have_the_default():
    assert context_limit(engine_of(LOCAL)) == DEFAULT_LOCAL_CONTEXT_TOKENS == 32768


def test_the_entrys_own_size_wins():
    assert context_limit(engine_of({**LOCAL, "context_tokens": 65536})) == 65536
    assert context_limit(engine_of({"base_url": "https://gateway.example.com", "context_tokens": 131072})) == 131072


def test_a_gateway_without_a_stated_size_has_no_limit_and_a_login_has_none():
    assert context_limit(engine_of({"base_url": "https://gateway.example.com"})) is None
    assert context_limit(config_with().engines["claude-code"]) is None


@pytest.mark.parametrize("value", [0, 100, 2047, -5, 4_000_001, "65536", 65536.5, True])
def test_a_bad_context_size_is_refused(value):
    with pytest.raises(EnginesFileError, match="context_tokens"):
        config_with({**LOCAL, "context_tokens": value})


def test_a_login_engine_cannot_carry_a_context_size():
    with pytest.raises(EnginesFileError, match="context_tokens"):
        parse_engines({"engines": {"c": {**CLAUDE_ENTRY, "context_tokens": 65536}}, "chains": {"default": ["c"]}})
