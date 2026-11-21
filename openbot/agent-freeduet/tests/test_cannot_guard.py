"""The cannot guard (cannot_guard.py, D128): a refusal of capability in the person's own live turn is asked
again once, with the colleague named. Classifier and table first, then the segment through the fake CLI."""

import base64
import json
from pathlib import Path

import pytest

from freeduet import cannot_guard, members, segment
from helpers import SETTLE_NEVER, post_run, run_body, standing, tool, types

REPO = Path(__file__).resolve().parents[2]
TEAM_FILE = REPO / "examples" / "freeduet" / "agents.yaml"

IRIS = standing("freeduet", "You are Iris, Chief of Staff of the test team.")
TEAM = """\
agents:
  - id: freeduet
    system_prompt: You are Iris, Chief of Staff of the test team.
  - id: concierge
    system_prompt: You are Jules, the concierge. You browse the web.
  - id: inbox
    system_prompt: You are Otto, the inbox clerk.
"""
ITALIAN = "Non posso controllare la temperatura a Roma in tempo reale, perché non ho accesso a servizi meteo. Controlla un'app meteo."
ENGLISH = "I can't check the weather in Rome in real time: I don't have access to weather services."
ASKED_IT = "puoi dirmi la temperatura a Roma"
HANDOFF = tool("message_bot", {"bot": {"type": "string"}, "task": {"type": "string"}})


def assertion(kind="person", **more):
    payload = base64.urlsafe_b64encode(json.dumps({"initiator": {"kind": kind, **more}}).encode()).decode().rstrip("=")
    return f"{payload}.signature"


def ask(text=ASKED_IT, *more):
    return [IRIS, {"id": "u1", "role": "user", "content": text}, *more]


def body(messages, *, kind="person", tools=(HANDOFF,), deployment=("message_bot",), **more):
    run = run_body(messages, tools=list(tools), deployment=list(deployment))
    run["forwardedProps"]["openbotRun"] = assertion(kind, **more)
    return run


def texts(events):
    return ["".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT" and e["messageId"] == mid)
            for mid in dict.fromkeys(e["messageId"] for e in events if e["type"] == "TEXT_MESSAGE_START")]


def runs(fake_cli):
    return len(list(fake_cli.dir.glob("run-*.json")))


def team_log_of(fake_cli):
    path = fake_cli.data_dir / "team-log.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


@pytest.fixture
def team(fake_cli, monkeypatch):
    monkeypatch.setattr(segment, "SETTLE_SECONDS", SETTLE_NEVER)  # a CLI that plays several steps ends the segment by itself
    fake_cli.agents_file.write_text(TEAM)
    return fake_cli


HAND_OVER = [
    {"tool": {"name": "message_bot", "input": {"bot": "Jules", "task": "Temperature in Rome"}}, "text": "Chiedo a Jules."},
    {"text": "A Roma ci sono 14 gradi, lo ha controllato Jules."},
]


# ── the classifier ───────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("reply", [
    ITALIAN, ENGLISH, "I cannot browse the internet.", "I'm unable to look that up.", "Non ho accesso a internet.",
    "Non sono in grado di farlo.", "No puedo consultar el tiempo.", "Je ne peux pas vérifier la météo.",
    "Ich habe keinen Zugriff auf das Internet.", "Não tenho acesso à internet.", "I don’t have access to the web.",
])
def test_refusals_in_several_languages(reply):
    assert cannot_guard.is_refusal(reply)


@pytest.mark.parametrize("reply", [
    "", "A Roma ci sono 14 gradi.", "It is 14 degrees in Rome.", "I can't tell which one you mean. Which city?",
    "Non posso farlo senza il nome della città, me lo dici?", "x" * 900 + " non posso",
    "Posso controllare per te.",
])
def test_answers_and_questions_are_not_refusals(reply):
    assert not cannot_guard.is_refusal(reply)


def test_every_capability_names_a_member_of_the_real_team_with_a_name():
    prompts = members.load_prompts(TEAM_FILE)
    for capability in cannot_guard.CAPABILITIES:
        assert capability.member_id in prompts, capability.key
        assert cannot_guard._name_of(prompts[capability.member_id]), capability.key


def test_the_web_goes_to_jules_in_the_real_team_and_never_to_the_member_itself():
    prompts = members.load_prompts(TEAM_FILE)
    capability, name = cannot_guard.colleague_for(ASKED_IT, ITALIAN, "freeduet", prompts)
    assert (capability.member_id, name) == ("concierge", "Jules")
    assert cannot_guard.colleague_for(ASKED_IT, ITALIAN, "concierge", prompts) is None
    assert cannot_guard.colleague_for("write a poem", "I can't do poems.", "freeduet", prompts) is None


def test_the_reminder_names_the_colleague_and_the_tool():
    capability, name = cannot_guard.colleague_for(ASKED_IT, ITALIAN, "freeduet", members.load_prompts(TEAM_FILE))
    text = cannot_guard.reminder(capability, name)
    assert 'message_bot' in text and 'bot "Jules"' in text
    assert "does not end with the work report" not in text  # the fake CLI tells the report guard's follow-up by that phrase


def test_the_switch():
    assert cannot_guard.enabled({}) and not cannot_guard.enabled({"FREEDUET_CANNOT_GUARD": "off"})


# ── the segment ──────────────────────────────────────────────────────────────────────────────────


def test_an_italian_refusal_is_asked_again_once_and_the_colleague_answers(client, team, callback_server):
    team.plan([{"text": ITALIAN}], HAND_OVER)
    events, _ = post_run(client, body(ask()))
    assert types(events)[-1] == "RUN_FINISHED"
    assert runs(team) == 2
    first, *rest = texts(events)
    assert first == ITALIAN and rest[-1].startswith("A Roma ci sono 14 gradi")
    assert len({e["messageId"] for e in events if e["type"] == "TEXT_MESSAGE_START"}) == len(texts(events))
    prompt = team.run(1)["prompt"]
    assert 'bot "Jules"' in prompt and prompt.rstrip().endswith(cannot_guard.reminder(*cannot_guard.colleague_for(ASKED_IT, ITALIAN, "freeduet", members.load_prompts(team.agents_file))).rstrip())
    assert "<assistant>\nNon posso controllare" in prompt
    assert len(callback_server) == 1 and callback_server[0]["body"]["args"]["bot"] == "Jules"
    assert team.run(1)["calls"][0]["name"] == "message_bot"
    assert team_log_of(team)[0]["cannot_guard"] == "retried"


def test_an_english_refusal_is_asked_again_once(client, team, callback_server):
    team.plan([{"text": ENGLISH}], HAND_OVER)
    events, _ = post_run(client, body(ask("what is the weather in Rome?")))
    assert runs(team) == 2 and types(events)[-1] == "RUN_FINISHED"


def test_a_refusal_after_a_tool_call_is_not_asked_again(client, team):
    team.plan([{"text": ITALIAN}])
    history = ask(ASKED_IT, {"id": "a1", "role": "assistant", "content": "", "toolCalls": [
        {"id": "c1", "type": "function", "function": {"name": "message_bot", "arguments": "{}"}}]},
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": "Jules could not"})
    events, _ = post_run(client, body(history))
    assert runs(team) == 1 and types(events)[-1] == "RUN_FINISHED"


def test_no_hand_off_tool_no_retry(client, team):
    team.plan([{"text": ITALIAN}])
    events, _ = post_run(client, body(ask(), tools=(), deployment=()))
    assert runs(team) == 1 and texts(events) == [ITALIAN]
    assert "cannot_guard" not in team_log_of(team)[0]


def test_a_second_refusal_passes_through_and_is_not_asked_again(client, team, callback_server):
    team.plan([{"text": ITALIAN}], [{"text": "Mi spiace, non posso proprio."}], [{"text": "never played"}])
    events, _ = post_run(client, body(ask()))
    assert runs(team) == 2
    assert texts(events) == [ITALIAN, "Mi spiace, non posso proprio."]
    assert team_log_of(team)[0]["cannot_guard"] == "unchanged"


@pytest.mark.parametrize("kind,more", [
    ("routine", {}), ("responsibility", {}), ("deployment", {}), ("memory", {}),
    ("handoff", {"id": "freeduet", "origin": {"kind": "person"}}),
])
def test_routines_and_hops_are_never_asked_again(client, team, kind, more):
    team.plan([{"text": ITALIAN}])
    events, _ = post_run(client, body(ask(), kind=kind, **more))
    assert runs(team) == 1 and texts(events) == [ITALIAN]


def test_a_forward_hop_message_is_never_asked_again(client, team):
    team.plan([{"text": ITALIAN}])
    hop = [IRIS, {"id": "handoff-r1", "role": "user", "content": "freeduet has asked you to help with this, on behalf of the person in this conversation.\nTask: weather in Rome"}]
    events, _ = post_run(client, body(hop))
    assert runs(team) == 1


def test_an_unreadable_run_statement_is_not_the_person(client, team):
    team.plan([{"text": ITALIAN}])
    request = body(ask())
    request["forwardedProps"]["openbotRun"] = "test-signed-run-assertion"
    post_run(client, request)
    assert runs(team) == 1


def test_a_turn_that_ended_on_an_approval_pause_is_not_asked_again(client, team, callback_server, monkeypatch):
    # The hand-off needs the person: the segment ends with the card text and never reaches the guard.
    from freeduet.bridge import callback
    monkeypatch.setattr(callback, "needs_the_person", lambda reply: True)
    from freeduet import segment
    monkeypatch.setattr(segment, "needs_the_person", lambda reply: True)
    team.plan(HAND_OVER)
    events, _ = post_run(client, body(ask()))
    assert runs(team) == 1


def test_a_guard_that_raises_never_breaks_the_turn(client, team, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("boom")
    monkeypatch.setattr(cannot_guard, "applies", boom)
    team.plan([{"text": ITALIAN}])
    events, _ = post_run(client, body(ask()))
    assert types(events)[-1] == "RUN_FINISHED" and texts(events) == [ITALIAN] and runs(team) == 1


def test_a_second_turn_that_fails_leaves_the_first_answer_and_no_error(client, team):
    team.plan([{"text": ITALIAN}], [{"stderr": "boom"}, {"exit": 1}])
    events, _ = post_run(client, body(ask()))
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert texts(events) == [ITALIAN]
    assert team_log_of(team)[0]["cannot_guard"] == "failed"


def test_the_switch_turns_it_off(client, team, monkeypatch):
    monkeypatch.setenv("FREEDUET_CANNOT_GUARD", "off")
    team.plan([{"text": ITALIAN}])
    post_run(client, body(ask()))
    assert runs(team) == 1
