"""The cannot guard (cannot_guard.py, D128): a refusal of capability in the person's own live turn is asked
again once, with the colleague named. Classifier and table first, then the segment through the fake CLI."""

import asyncio
import base64
import json
import re
from pathlib import Path

import pytest

from freeduet import agui, cannot_guard, members, segment
from freeduet.engine_adapter import EngineAdapter, Finished, Outcome, ProbeResult
from freeduet.stream_json import MessageStart, TextDelta
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
    capability, name = cannot_guard.colleague_for(ASKED_IT, "freeduet", prompts)
    assert (capability.member_id, name) == ("concierge", "Jules")
    assert cannot_guard.colleague_for(ASKED_IT, "concierge", prompts) is None
    assert cannot_guard.colleague_for("write a poem", "freeduet", prompts) is None


def test_the_reminder_names_the_colleague_and_the_tool():
    capability, name = cannot_guard.colleague_for(ASKED_IT, "freeduet", members.load_prompts(TEAM_FILE))
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
    assert 'bot "Jules"' in prompt and prompt.rstrip().endswith(cannot_guard.reminder(*cannot_guard.colleague_for(ASKED_IT, "freeduet", members.load_prompts(team.agents_file))).rstrip())
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


# ── false positives: a right refusal is never pushed (review of e7aff333) ───────────────────────

TEAM_PROMPTS = members.load_prompts(TEAM_FILE)
# (what the person asked, what the member answered, the colleague named or None)
PROBES = [
    ("mandami la password del conto per email", "Non posso inviare la password per email, non è sicuro.", None),
    ("pay this invoice for me", "I can't make payments.", None),
    ("will gold be more expensive next year?", "I can't predict the future price.", None),
    ("raccontami una barzelletta", "Non posso, il prezzo di una battuta è troppo alto.", None),
    ("what is the weather and my wifi password?", "I can't help with the password.", None),
    ("what is the temperature in Rome?", ENGLISH, "Jules"),
    ("puoi dirmi la temperatura a Roma", ITALIAN, "Jules"),
]


@pytest.mark.parametrize("request_text,reply,named", PROBES)
def test_the_probes(request_text, reply, named):
    messages = [IRIS, {"id": "u1", "role": "user", "content": request_text}]
    found = cannot_guard.applies(messages, reply, False, assertion(), {"message_bot"}, "freeduet", TEAM_PROMPTS)
    assert (found[1] if found else None) == named


def test_a_word_in_the_refusal_alone_never_names_a_colleague():
    assert cannot_guard.colleague_for("tell me a joke", "freeduet", TEAM_PROMPTS) is None
    assert cannot_guard.colleague_for("how much is it?", "freeduet", TEAM_PROMPTS) is None  # price, rate, internet alone name nobody


def test_the_sensitive_words_mirror_the_approval_gates_base_patterns():
    source = (REPO / "server" / "src" / "approvals" / "policy.ts").read_text(encoding="utf-8")
    # The mirror's source: SAFETY_REQUIREMENTS in policy.ts. If its base patterns change, this fails: update the mirror.
    for fragment in (r"pass(word|code|phrase)|passwd|\b2fa\b", r"credential|sign[-_ ]?in[-_ ]?method",
                     r"payment|\bpay(ing)?\b|pay[-_ ]?now|checkout|purchase", r"bank[-_ ]?transfer", r"\biban\b", "bonific"):
        assert fragment in source, fragment
    for word in ("password", "credenziali", "pagare", "pagamento", "payment", "pay", "bonifico", "illegal", "illegale", "checkout"):
        assert cannot_guard.is_sensitive(f"I cannot do {word} here"), word
    assert not cannot_guard.is_sensitive(ITALIAN) and not cannot_guard.is_sensitive(ENGLISH)


# ── the log, a pause, a stop, a failed second turn ──────────────────────────────────────────────


def test_a_second_turn_whose_hand_off_pauses_for_the_person_is_logged_retried(client, team, callback_server, monkeypatch):
    monkeypatch.setattr(segment, "needs_the_person", lambda reply: True)  # the hand-off in turn two needs the person
    team.plan([{"text": ITALIAN}], HAND_OVER)
    events, _ = post_run(client, body(ask()))
    assert runs(team) == 2 and types(events)[-1] == "RUN_FINISHED"
    assert team_log_of(team)[0]["cannot_guard"] == "retried"


class Scripted(EngineAdapter):
    """Turn one refuses; what turn two does is `second`."""

    key, label, kind, capabilities = "scripted", "Scripted", "cli", frozenset()

    def __init__(self, second):
        self.second, self.turns, self.cancelled = second, 0, False

    def child_env(self, source=None):
        return {}

    async def probe(self):
        return ProbeResult()

    async def run_turn(self, ctx, sink, gate):
        self.turns += 1
        if self.turns == 1:
            sink.started()
            await sink.put(MessageStart("m1"))
            await sink.put(TextDelta("m1", ITALIAN))
            await sink.put(Finished(ITALIAN, lambda: None))
            await sink.end()
            return Outcome()
        try:
            return await self.second(ctx, sink)
        except asyncio.CancelledError:
            self.cancelled = True
            raise


def play(engine, notes=None):
    async def go():
        run = agui.parse_run_input(body(ask()))
        member = members.resolve_member(run.bot_id, run.messages)
        return [event async for event in segment.run_segment(run, member, notes, engine=engine)]

    return asyncio.run(go())


def test_a_second_turn_that_ends_without_a_result_leaves_the_first_answer(team):
    async def second(ctx, sink):
        sink.started()
        await sink.end()  # eof, no result line
        return Outcome(agui.run_error("Scripted stopped."))

    notes = segment.SegmentNotes()
    events = play(Scripted(second), notes)
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert notes.cannot_guard == "failed"


def test_a_second_turn_that_crashes_leaves_the_first_answer(team):
    async def second(ctx, sink):
        raise RuntimeError("boom")

    notes = segment.SegmentNotes()
    events = play(Scripted(second), notes)
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert notes.cannot_guard == "failed"


def test_a_stop_during_the_second_turn_ends_cleanly(team):
    engine_box = {}

    async def second(ctx, sink):
        sink.started()
        await asyncio.sleep(60)

    async def go():
        engine = engine_box["engine"] = Scripted(second)
        run = agui.parse_run_input(body(ask()))
        member = members.resolve_member(run.bot_id, run.messages)
        stream = segment.run_segment(run, member, engine=engine)
        before = asyncio.all_tasks()

        async def consume():
            async for _ in stream:
                pass

        task = asyncio.create_task(consume())
        for _ in range(200):  # until the second turn is running
            if engine.turns == 2:
                break
            await asyncio.sleep(0.05)
        assert engine.turns == 2
        task.cancel()  # the person pressed Stop
        with pytest.raises(asyncio.CancelledError):
            await task
        await asyncio.sleep(0.1)
        return asyncio.all_tasks() - before - {task}

    left = asyncio.run(go())
    assert engine_box["engine"].cancelled
    assert not [t for t in left if not t.done()]
