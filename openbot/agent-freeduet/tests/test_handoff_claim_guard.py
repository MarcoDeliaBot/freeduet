"""The hand-off claim guard (handoff_claim_guard.py, D184): a member that says a colleague has the work, with no
hand-off made, is asked once. The claim detection first, then the segment through the fake CLI."""

import base64
import json
from pathlib import Path

import pytest

from freeduet import cannot_guard, handoff_claim_guard as guard, members, segment
from helpers import SETTLE_NEVER, post_run, run_body, standing, tool

REPO = Path(__file__).resolve().parents[2]
TEAM_FILE = REPO / "examples" / "freeduet" / "agents.yaml"

IRIS = standing("freeduet", "You are Iris, Chief of Staff of the test team.")
TEAM = """\
agents:
  - id: freeduet
    system_prompt: You are Iris, Chief of Staff of the test team.
  - id: game
    system_prompt: You are Kai, the game and app developer.
  - id: concierge
    system_prompt: You are Jules, the concierge. You browse the web.
"""
PROMPTS = {
    "freeduet": "You are Iris, Chief of Staff of the test team.",
    "game": "You are Kai, the game and app developer.",
    "concierge": "You are Jules, the concierge.",
}
LIVE_CLAIM = "Ottimo, procedo con Kai.\nKai riceve il go e inizia.\n\nEsito: in corso"
# The two replies of the live bug (27 November 2026), word for word but the colleague's name.
LIVE_BUG_FIRST = (
    "Ottimo, procedo con Kai confermando la scelta delle grafiche di Kai (poiché Lumi non ha ancora consegnato gli asset, "
    "come Kai ha specificato). Per la build Android, assumo no poiché non è stata specificata.\n\n"
    "Kai: via confermata — costruzione di Out Run stile arcade in un unico file HTML autonomo. Nessuna build Android.\n\n"
    "- Esito: in corso\n- Fatto: Kai riceve il \"go\" con grafiche di Kai e senza build Android\n"
    "- Non fatto e perché: build Android non specificata (assunta no)\n- Già: nulla\n"
    "- Prossimo passo: Kai inizia la costruzione e riporta il file HTML e le prove dei test."
)
LIVE_BUG_SECOND = (
    "Sì, Kai sta lavorando.\n\n- Outcome: in progress\n- Done:\n"
    "- Evidence: ultima voce nel registro di Kai, alle 21:01: ha ricevuto il tuo \"via\".\n"
    "- Next step: la prossima risposta di Kai sul file e sul test."
)
HANDOFF = tool("message_bot", {"bot": {"type": "string"}, "task": {"type": "string"}})


def assertion(kind="person"):
    payload = base64.urlsafe_b64encode(json.dumps({"initiator": {"kind": kind}}).encode()).decode().rstrip("=")
    return f"{payload}.signature"


def conversation(*more, last="via"):
    return [IRIS, {"id": "u0", "role": "user", "content": "fammi un gioco Out Run"}, *more,
            {"id": "u1", "role": "user", "content": last}]


def body(messages, *, kind="person", tools=(HANDOFF,), deployment=("message_bot",)):
    run = run_body(messages, tools=list(tools), deployment=list(deployment))
    run["forwardedProps"]["openbotRun"] = assertion(kind)
    return run


def texts(events):
    return ["".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT" and e["messageId"] == mid)
            for mid in dict.fromkeys(e["messageId"] for e in events if e["type"] == "TEXT_MESSAGE_START")]


def runs(fake_cli):
    return len(list(fake_cli.dir.glob("run-*.json")))


def team_log_of(fake_cli):
    path = fake_cli.data_dir / "team-log.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def call_to(bot, call_id="c1", name="message_bot"):
    return {"id": f"a-{call_id}", "role": "assistant", "content": "", "toolCalls": [
        {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps({"bot": bot, "task": "x"})}}]}


def result(call_id="c1", text="Handed over.", error=False):
    message = {"id": f"r-{call_id}", "role": "tool", "toolCallId": call_id, "content": text}
    if error:
        message["error"] = text
    return message


def claimed(reply):
    return [name for _, name in guard.claimed_colleagues(reply, "freeduet", PROMPTS)]


# ── the claim ────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("reply, name", [
    (LIVE_CLAIM, "Kai"),
    (LIVE_BUG_FIRST, "Kai"),  # the list is split at its colons and holds "non": read as report lines
    (LIVE_BUG_SECOND, "Kai"),
    ("Si, Kai sta lavorando.", "Kai"),
    ("Gliel'ho passato: Kai ci sta lavorando.", "Kai"),
    ("Kai has the go and is working on it now.", "Kai"),
    ("I passed it to Kai. He is working on it.", "Kai"),
    ("I've handed this over to Kai.", "Kai"),
    ("Kai recibe el visto bueno y esta trabajando.", "Kai"),
    ("Je l'ai transmis à Kai, il travaille dessus.", "Kai"),
    ("Kai erhält das Go und arbeitet jetzt daran.", "Kai"),
    ("Passei o trabalho para o Kai, ele está trabalhando nisso.", "Kai"),
    ("Jules is working on it.", "Jules"),
])
def test_a_claim_that_a_colleague_has_the_work_is_found(reply, name):
    assert name in claimed(reply)


@pytest.mark.parametrize("reply", [
    "Non ho passato nulla a Kai.",
    "I have not handed anything to Kai.",
    "Nothing was handed over to Kai yet.",
    "Quando dici via, Kai riceve il go e inizia.",
    "When you say go, Kai starts working.",
    "Vuoi che passi il lavoro a Kai?",
    "Kai is working on it?",
    "Ready when you are, I will pass it to Kai.",
    "Kai sta lavorando.".replace("Kai", "Iris"),  # the member itself is never the colleague
    "Che bel gioco, Out Run!",
    "- Outcome: needs you\n- Done: Kai sent the read-back.",  # "i sent" inside "Kai sent" is not "I sent"
    "",
])
def test_a_denial_a_question_a_condition_or_no_colleague_is_not_a_claim(reply):
    assert claimed(reply) == []


def test_the_member_itself_is_never_the_colleague():
    assert guard.claimed_colleagues("Iris is working on it.", "freeduet", PROMPTS) == []
    assert guard.claimed_colleagues("Kai is working on it.", "game", PROMPTS) == []


# ── is a hand-off open ───────────────────────────────────────────────────────────────────────────


def test_an_open_handoff_is_a_call_not_refused_and_not_closed_by_an_answer():
    assert guard.open_handoffs(conversation(call_to("Kai"), result()), "freeduet", PROMPTS) == {"game"}
    assert guard.open_handoffs(conversation(call_to("game")), "freeduet", PROMPTS) == {"game"}  # no result yet: a card waits
    assert guard.open_handoffs(conversation(call_to("Kai"), result(text="That handoff was not sent: no.")), "freeduet", PROMPTS) == set()
    answer = {"id": "handoff-r2", "role": "user", "content": "You asked Kai to help with this: x\n\nIt answered:\n\ndone"}
    assert guard.open_handoffs(conversation(call_to("Kai"), result(), answer), "freeduet", PROMPTS) == set()
    never = {"id": "handoff-r3", "role": "user", "content": "You asked game to help with this and it never answered: busy."}
    assert guard.open_handoffs(conversation(call_to("Kai"), result(), never), "freeduet", PROMPTS) == set()


def applies(reply, messages=None, story=(), offered=frozenset({"message_bot"}), kind="person"):
    return guard.applies(messages or conversation(), list(story), reply, assertion(kind), offered, "freeduet", PROMPTS)


def test_the_claim_with_no_handoff_applies():
    assert applies(LIVE_CLAIM) == ("game", "Kai", False)


def test_a_handoff_made_in_the_turn_does_not_apply():
    assert applies(LIVE_CLAIM, story=[call_to("Kai")]) is None
    assert applies(LIVE_CLAIM, story=[call_to("Kai", name="mcp__freeduet__message_bot")]) is None


def test_a_claim_with_an_open_handoff_does_not_apply():
    assert applies(LIVE_CLAIM, messages=conversation(call_to("Kai"), result())) is None


def test_a_claim_about_a_closed_handoff_applies_again():
    answer = {"id": "handoff-r2", "role": "user", "content": "You asked Kai to help with this: x\n\nIt answered:\n\ndone"}
    assert applies(LIVE_CLAIM, messages=conversation(call_to("Kai"), result(), answer)) == ("game", "Kai", True)


def test_the_reminder_after_an_answered_hand_off_asks_whether_it_was_an_answer():
    # The live bug had one: the read-back hand-off to Kai had come back before the person's "via".
    text = guard.reminder("game", "Kai", True)
    assert "has already come back" in text and "call the message_bot tool now" in text
    assert "an answer that came back and not work in progress" in text
    assert "has received nothing" not in text and "has received nothing" in guard.reminder("game", "Kai")


def test_an_outcome_line_alone_is_a_claim_about_the_colleague_it_names():
    assert claimed("Kai: il gioco.\nEsito: in corso") == ["Kai"]
    assert claimed("Kai: the game.\nOutcome: in progress") == ["Kai"]
    assert claimed("- Outcome: in progress\n- Done: Kai has the brief") == ["Kai"]


def test_a_report_of_an_answer_that_came_back_is_not_a_claim():
    assert claimed("I asked Kai earlier and he answered: done.") == []
    assert claimed("Ho chiesto a Kai e ha risposto: fatto.") == []


def test_the_colleague_is_looked_for_in_the_same_sentence_first():
    assert claimed("Kai answered. Now Jules is working on it.") == ["Jules"]
    assert claimed("Kai has the brief. He is working on it.") == ["Kai"]  # no name here: the sentence before


def test_other_conditions_do_not_apply():
    assert applies(LIVE_CLAIM, offered=frozenset()) is None  # message_bot was not offered
    assert applies(LIVE_CLAIM, kind="routine") is None
    assert applies(LIVE_CLAIM, kind="handoff") is None
    assert applies("Kai sta lavorando. Altro?") is None  # ends with a question


def test_the_reminder_names_the_colleague_and_the_tool():
    text = guard.reminder("game", "Kai")
    assert "Kai" in text and "message_bot" in text and "no hand-off to Kai is open" in text and "nothing was handed over" in text


def test_the_switch():
    assert guard.enabled({}) and not guard.enabled({"FREEDUET_HANDOFF_CLAIM_GUARD": "off"})


def test_the_real_team_names_kai_and_the_prompt_says_a_claim_is_not_a_hand_off():
    prompts = members.load_prompts(TEAM_FILE)
    assert "Kai" in [name for _, name in guard.claimed_colleagues("Kai sta lavorando.", "freeduet", prompts)]


# ── the segment ──────────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def team(fake_cli, monkeypatch):
    monkeypatch.setattr(segment, "SETTLE_SECONDS", SETTLE_NEVER)
    fake_cli.agents_file.write_text(TEAM)
    return fake_cli


HAND_OVER = [
    {"tool": {"name": "message_bot", "input": {"bot": "Kai", "task": "Out Run"}}, "text": "Passo a Kai."},
    {"text": "Fatto: ho passato il lavoro a Kai."},
]
HONEST = [{"text": "Mi correggo: non ho passato nulla a Kai. Vuoi che lo faccia ora?"}]


def test_the_claim_is_asked_again_once_and_the_second_turn_hands_over(client, team, callback_server):
    team.plan([{"text": LIVE_CLAIM}], HAND_OVER)
    events, _ = post_run(client, body(conversation()))
    assert runs(team) == 2
    assert any(e["type"] == "TOOL_CALL_START" and e["toolCallName"] == "message_bot" for e in events)
    second_prompt = sorted(team.dir.glob("run-*.json"))[1].read_text()
    assert "no hand-off to Kai is open" in second_prompt and "Kai" in second_prompt
    assert team_log_of(team)[-1]["handoff_claim_guard"] == "retried"


def test_a_second_turn_that_is_honest_is_logged_unchanged(client, team):
    team.plan([{"text": LIVE_CLAIM}], HONEST, [{"text": "never played"}])
    events, _ = post_run(client, body(conversation()))
    assert runs(team) == 2
    assert "non ho passato nulla" in texts(events)[-1]
    assert team_log_of(team)[-1]["handoff_claim_guard"] == "unchanged"


def test_a_second_claim_is_the_answer_and_is_not_asked_again(client, team):
    team.plan([{"text": LIVE_CLAIM}], [{"text": "Kai sta lavorando, davvero."}], [{"text": "never played"}])
    post_run(client, body(conversation()))
    assert runs(team) == 2


def test_a_hand_off_in_the_turn_gets_no_retry(client, team, callback_server):
    team.plan(HAND_OVER)
    post_run(client, body(conversation()))
    assert runs(team) == 1


def test_a_claim_with_an_open_hand_off_gets_no_retry(client, team):
    team.plan([{"text": "Kai sta lavorando."}])
    post_run(client, body(conversation(call_to("Kai"), result(), last="sicuro che stia lavorando?")))
    assert runs(team) == 1


def test_the_switch_turns_it_off(client, team, monkeypatch):
    monkeypatch.setenv("FREEDUET_HANDOFF_CLAIM_GUARD", "off")
    team.plan([{"text": LIVE_CLAIM}])
    post_run(client, body(conversation()))
    assert runs(team) == 1
    assert "handoff_claim_guard" not in team_log_of(team)[-1]


def test_routines_and_hops_never_get_it(client, team):
    team.plan([{"text": LIVE_CLAIM}])
    post_run(client, body(conversation(), kind="routine"))
    assert runs(team) == 1


def test_a_guard_that_raises_never_breaks_the_turn(client, team, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("boom")
    monkeypatch.setattr(guard, "applies", boom)
    team.plan([{"text": LIVE_CLAIM}])
    events, _ = post_run(client, body(conversation()))
    assert events[-1]["type"] == "RUN_FINISHED" and runs(team) == 1


def test_the_cannot_guard_and_this_one_share_one_retry(client, team, callback_server):
    team.plan([{"text": "Non posso controllare la temperatura in tempo reale, non ho accesso al meteo."}], [{"text": "never played"}])
    post_run(client, body([IRIS, {"id": "u1", "role": "user", "content": "puoi dirmi la temperatura a Roma"}]))
    assert runs(team) == 2  # one retry in all, whichever guard asked
    last = team_log_of(team)[-1]
    assert last.get("cannot_guard") and "handoff_claim_guard" not in last


def test_iriss_prompt_says_that_writing_the_go_sends_nothing():
    prompt = " ".join(members.load_prompts(TEAM_FILE)["freeduet"].split())
    assert 'Say the work has started only after your message_bot call with "go" returned' in prompt
    assert '(writing "go" in the chat sends nothing)' in prompt
