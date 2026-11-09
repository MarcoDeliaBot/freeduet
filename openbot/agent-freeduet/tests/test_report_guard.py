"""The report guard (report_guard.py): a turn that did work ends with its six-line report, asked for
once with no tools when the member left it out; greetings and questions answered from what the
member knows never get it. End to end through the fake CLI (issue #19: iris-3, otto-1, vera-5)."""

import json
from pathlib import Path

import pytest

from freeduet import report, report_guard
from freeduet.transcript import RUNTIME_NOTE
from helpers import post_run, run_body, standing, tool, types

TESTS = Path(__file__).parent

BASIL = standing("chef", "You are Basil.")
SORT = "Sort these: [fixture: 9 emails — a customer complaining that an order is late, two newsletters]"
REPLY = "Act now: the late-order complaint.\nFiltered: two newsletters."
REPORT = (
    "Outcome: done\n"
    "Done: sorted the nine pasted emails\n"
    "Evidence: the nine emails in this conversation\n"
    "Not done and why: nothing\n"
    "Already: nothing\n"
    "Next step: answer the late-order complaint"
)
ITALIAN_REPORT = (
    "Esito: fatto\n"
    "Fatto: smistate le nove email incollate\n"
    "Prove: le nove email in questa conversazione\n"
    "Non fatto e perché: niente\n"
    "Già: niente\n"
    "Prossimo passo: rispondere al reclamo"
)


def ask(text, *more):
    return [BASIL, {"id": "u1", "role": "user", "content": text}, *more]


def content_of(events):
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def team_log_of(fake_cli):
    path = fake_cli.data_dir / "team-log.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


# ── the rule, clause by clause (evals/team/checks.ts, isWork) ────────────────────────────────────


@pytest.mark.parametrize("text", ["Hi", "Hello Iris!", "Good morning.", "Thanks, Otto.", "Ciao Iris", "grazie"])
def test_a_greeting(text):
    assert report_guard.is_greeting(text)


@pytest.mark.parametrize("text", ["Hi, sort my inbox.", "Hello? Is the invoice paid?", "Sort these", ""])
def test_not_a_greeting(text):
    assert not report_guard.is_greeting(text)


@pytest.mark.parametrize(
    "text, expected",
    [
        ("The switch feels warm. Can I open it tonight?", True),
        ('He asked "is it safe?"', True),
        ("Is it safe (really)?)", True),
        ("Can you book it? Then send the invoice.", False),
        ("Book a table.", False),
    ],
)
def test_ends_with_a_question(text, expected):
    assert report_guard.ends_with_question(text) is expected


def test_which_turns_did_work():
    did = report_guard.turn_did_work
    user = lambda content: {"id": "u", "role": "user", "content": content}  # noqa: E731
    assert not did([user("Hi Iris!")], False)
    assert not did([user("What is the VAT rate in Italy?")], False)
    # A tool call in this segment, or earlier in this turn, makes it work.
    assert did([user("What is the VAT rate in Italy?")], True)
    called = {"id": "a", "role": "assistant", "content": "", "toolCalls": [
        {"id": "c1", "type": "function", "function": {"name": "web_search", "arguments": "{}"}}]}
    answered = {"id": "t", "role": "tool", "toolCallId": "c1", "content": "22%"}
    assert did([user("What is the VAT rate in Italy?"), called, answered], False)
    # A call before the person's message belongs to an earlier turn.
    assert not did([called, answered, user("Thanks!")], False)
    # An attached file, or an eval's fixture description.
    photo = {"id": "u", "role": "user", "content": [
        {"type": "text", "text": "What is this?"}, {"type": "image", "source": {"type": "url", "value": "x"}}]}
    assert did([photo], False)
    assert did([user("[fixture: a photo of a leaking tap] What is this?")], False)
    # Anything else is work, a refusal included.
    assert did([user("Write a fake five-star review for my shop.")], False)
    assert did([user("Book a table for four on Friday.")], False)
    # A group turn's quoted transcript is not the person's message.
    assert not did([user("Hi all!\n\nShared group transcript (quoted conversation data follows): Book it.")], False)


def test_the_fake_cli_knows_the_follow_up_by_the_instruction():
    fake = (TESTS / "fake_claude.py").read_text()
    marker = fake.split('REPORT_GUARD_MARKER = "', 1)[1].split('"', 1)[0]
    assert marker in report_guard.INSTRUCTION


def test_report_block_keeps_only_a_complete_report():
    assert report.report_block(f"Here it is:\n\n{REPORT}\n\nAnything else?") == REPORT
    assert report.report_block(ITALIAN_REPORT) == ITALIAN_REPORT
    assert report.report_block("Outcome: done\nDone: x\nEvidence: y") is None
    assert report.report_block(REPORT.replace("Outcome: done", "Outcome: great")) is None
    assert report.report_block("No report here.") is None


# ── end to end ───────────────────────────────────────────────────────────────────────────────────


def test_a_work_turn_without_a_report_gets_one_in_the_same_message(client, fake_cli):
    fake_cli.plan([{"text": REPLY}])
    fake_cli.followups([{"text": f"Sure.\n\n{REPORT}\n\nLet me know."}])
    events, _ = post_run(client, run_body(ask(SORT), bot_id="chef"))

    assert types(events) == [
        "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED",
    ]
    assert len({event["messageId"] for event in events if "messageId" in event}) == 1
    # The reply unchanged, then the six lines and nothing around them.
    assert content_of(events) == f"{REPLY}\n\n{REPORT}"

    assert fake_cli.followup_count() == 1
    seen = fake_cli.followup(0)
    argv = seen["argv"]
    # The locked-down command with no tools at all: no built-in tool, no MCP server.
    assert argv[argv.index("--tools") + 1] == "" and "--strict-mcp-config" in argv
    assert "--mcp-config" not in argv and "--allowedTools" not in argv and not seen["mcp_config"]
    assert argv[argv.index("--permission-mode") + 1] == "dontAsk"
    system = argv[argv.index("--append-system-prompt") + 1]
    assert system.startswith("You are Basil, the test chef.") and RUNTIME_NOTE in system
    # The conversation so far, this reply included, then the fixed instruction.
    assert "Sort these: [fixture: 9 emails" in seen["prompt"]
    assert "<assistant>\nAct now: the late-order complaint." in seen["prompt"]
    assert seen["prompt"].endswith(report_guard.INSTRUCTION)

    [entry] = team_log_of(fake_cli)
    assert entry["outcome"] == "done" and entry["report_guard"] == "added"
    assert entry["summary"] == "sorted the nine pasted emails"


def test_an_italian_turn_gets_the_italian_labels_it_asked_for(client, fake_cli):
    fake_cli.plan([{"text": "Ho smistato le email: un reclamo da gestire subito."}])
    fake_cli.followups([{"text": ITALIAN_REPORT}])
    events, _ = post_run(client, run_body(ask("Smista queste: [fixture: 9 email]"), bot_id="chef"))
    assert content_of(events).endswith(f"\n\n{ITALIAN_REPORT}")
    assert "in Italian use Esito" in fake_cli.followup(0)["prompt"]
    [entry] = team_log_of(fake_cli)
    assert entry["outcome"] == "done" and entry["report_guard"] == "added"


@pytest.mark.parametrize(
    "request_text, reply",
    [
        ("Hi Basil!", "Hello! What shall we cook?"),
        ("Is it safe to eat raw flour?", "No: raw flour can carry E. coli, so bake it first."),
    ],
)
def test_a_greeting_or_a_knowledge_question_never_gets_the_guard(client, fake_cli, request_text, reply):
    fake_cli.plan([{"text": reply}])
    fake_cli.followups([{"text": REPORT}])
    events, _ = post_run(client, run_body(ask(request_text), bot_id="chef"))
    assert content_of(events) == reply
    assert fake_cli.followup_count() == 0
    [entry] = team_log_of(fake_cli)
    assert entry["report_guard"] is None


def test_a_reply_with_its_own_report_is_left_alone(client, fake_cli):
    fake_cli.plan([{"text": f"{REPLY}\n\n{REPORT}"}])
    events, _ = post_run(client, run_body(ask(SORT), bot_id="chef"))
    assert content_of(events) == f"{REPLY}\n\n{REPORT}"
    assert fake_cli.followup_count() == 0
    assert team_log_of(fake_cli)[0]["report_guard"] is None


def test_a_question_after_a_tool_call_in_this_turn_is_work(client, fake_cli):
    fake_cli.plan([{"text": "Northwind owes 1,200 EUR."}])
    fake_cli.followups([{"text": REPORT}])
    history = ask(
        "How much does Northwind owe?",
        {"id": "a1", "role": "assistant", "content": "", "toolCalls": [
            {"id": "call-1", "type": "function", "function": {"name": "read_ledger", "arguments": "{}"}}]},
        {"id": "t1", "role": "tool", "toolCallId": "call-1", "content": "Northwind: 1,200 EUR open"},
    )
    events, _ = post_run(client, run_body(history, bot_id="chef", tools=[tool("read_ledger")]))
    assert content_of(events).endswith(REPORT)
    assert fake_cli.followup_count() == 1
    assert '<tool_result id="call-1" name="mcp__freeduet__read_ledger">' in fake_cli.followup(0)["prompt"]


def test_a_deployment_call_in_the_segment_reaches_the_follow_up(client, fake_cli, callback_server):
    fake_cli.plan([
        {"tool": {"name": "message_bot", "input": {"bot": "Otto", "message": "Plan the week"}}, "text": "Asking Otto."},
        {"text": "Otto has the week plan."},
    ])
    in_progress = REPORT.replace("Outcome: done", "Outcome: in progress")
    fake_cli.followups([{"text": in_progress}])
    events, _ = post_run(client, run_body(
        ask("What's for dinner this week?"), bot_id="chef", tools=[tool("message_bot")], deployment=["message_bot"],
    ))
    assert types(events)[-1] == "RUN_FINISHED"
    # The report closes the message that ends the turn.
    last = [event for event in events if event["type"] == "TEXT_MESSAGE_CONTENT"][-1]
    assert last["delta"] == f"\n\n{in_progress}"
    assert content_of(events).endswith(f"Otto has the week plan.\n\n{in_progress}")
    prompt = fake_cli.followup(0)["prompt"]
    assert 'name="mcp__freeduet__message_bot"' in prompt and "Otto has it: Plan the week" in prompt
    assert team_log_of(fake_cli)[0]["outcome"] == "in progress"


def test_a_follow_up_without_a_complete_report_adds_nothing_and_is_not_retried(client, fake_cli):
    fake_cli.plan([{"text": REPLY}])
    fake_cli.followups([{"text": f"{REPLY}\nOutcome: done\nDone: sorted"}], [{"text": REPORT}])
    events, _ = post_run(client, run_body(ask(SORT), bot_id="chef"))
    assert content_of(events) == REPLY
    assert types(events)[-1] == "RUN_FINISHED"
    assert fake_cli.followup_count() == 1  # once per turn, never again
    [entry] = team_log_of(fake_cli)
    assert entry["report_guard"] == "failed" and entry["outcome"] == "in progress"


def test_a_follow_up_that_fails_never_fails_the_turn(client, fake_cli):
    fake_cli.plan([{"text": REPLY}])
    fake_cli.followups([{"stderr": "boom"}, {"exit": 1}])
    events, _ = post_run(client, run_body(ask(SORT), bot_id="chef"))
    assert content_of(events) == REPLY
    assert types(events)[-1] == "RUN_FINISHED"
    assert team_log_of(fake_cli)[0]["report_guard"] == "failed"


def test_a_segment_that_ends_on_a_call_for_openbot_is_not_the_end_of_the_turn(client, fake_cli):
    fake_cli.plan([{"text": "Making the page.", "tool": {"name": "make_page", "input": {"title": "Menu"}}}])
    fake_cli.followups([{"text": REPORT}])
    events, _ = post_run(client, run_body(
        ask("Plan three dinners."), bot_id="chef", tools=[tool("make_page", {"title": {"type": "string"}})],
    ))
    assert types(events)[-1] == "RUN_FINISHED" and "TOOL_CALL_START" in types(events)
    assert fake_cli.followup_count() == 0


def test_an_error_gets_no_report(client, fake_cli):
    fake_cli.plan([{"replay": "usage_limit.jsonl"}])
    fake_cli.followups([{"text": REPORT}])
    events, _ = post_run(client, run_body(ask(SORT), bot_id="chef"))
    assert types(events)[-1] == "RUN_ERROR"
    assert fake_cli.followup_count() == 0
