"""Work reports read from a member's final text and mapped to checkpoint fields (report.py)."""

import re
from pathlib import Path

import pytest
import yaml

from freeduet import checkpoints, team_log
from freeduet.report import OUTCOMES, SegmentFacts, approval_ids, assess, canonical_outcome, parse_report, report_block

APPROVAL = "5b1f0c2e-8d7a-4c3b-9e6f-0a1b2c3d4e5f"

FULL = f"""I drafted the invoice and sent it after your approval.

Outcome: done
Done: Invoice INV-12 drafted for ACME and sent
Evidence: send_email confirmed message id m-881; total 1,240.00 EUR
Not done and why: nothing
Already sent, paid, booked, published or deleted: sent INV-12 to ACME (approval {APPROVAL})
Next step: none"""

BOLD_BULLETS = """Here is where things stand.

- **Outcome:** partly done
- **Done:**
  - Read 14 new messages
  - Drafted the landlord reply
- **Evidence:** search_messages returned 14 results
- **Not done and why, with what you tried:** the reply to the bank is not drafted; tried the bank's portal, it was down
- **Already:** "nothing"
- **Next step:** ask the person to approve the landlord reply"""


def facts(text="", **changes):
    return SegmentFacts(**{"text": text, "objective": "Send the ACME invoice", **changes})


def valid(assessment):
    checkpoints.validate_state(assessment.state, assessment.phase)
    return True


def test_a_full_report():
    report = parse_report(FULL)
    assert report.outcome == "done"
    assert report.items("done") == ["Invoice INV-12 drafted for ACME and sent"]
    assert report.items("not_done") == [] and report.items("next_step") == []
    a = assess(facts(FULL))
    assert valid(a) and a.phase == "complete" and a.outcome == "done"
    assert a.state["completed"] == [
        "Invoice INV-12 drafted for ACME and sent",
        f"Already: sent INV-12 to ACME (approval {APPROVAL})",
    ]
    assert a.state["verification"] == ["send_email confirmed message id m-881; total 1,240.00 EUR"]
    assert a.state["objective"] == "Send the ACME invoice"
    assert a.approvals == [APPROVAL]
    assert a.summary == "Invoice INV-12 drafted for ACME and sent"


def test_bullets_and_bold_labels():
    report = parse_report(BOLD_BULLETS)
    assert report.outcome == "partly done"
    assert report.items("done") == ["Read 14 new messages", "Drafted the landlord reply"]
    a = assess(facts(BOLD_BULLETS))
    assert valid(a) and a.phase == "in-progress"
    assert a.state["blockers"] == ["the reply to the bank is not drafted; tried the bank's portal, it was down"]
    assert a.state["decisions"] == ["Failed attempt: the reply to the bank is not drafted; tried the bank's portal, it was down"]
    assert a.state["next_steps"] == ["ask the person to approve the landlord reply"]
    assert a.approvals == "nothing"


# The shared rules ask for each label on its own line, as a list item or with a blank line between
# the labels, so the chat shows six lines and not one run-on paragraph. Both must read like FULL.
LIST_ITEMS = f"""I drafted the invoice and sent it after your approval.

- Outcome: done
- Done: Invoice INV-12 drafted for ACME and sent
- Evidence: send_email confirmed message id m-881; total 1,240.00 EUR
- Not done and why: nothing
- Already sent, paid, booked, published or deleted: sent INV-12 to ACME (approval {APPROVAL})
- Next step: none"""

BLANK_LINES = f"""I drafted the invoice and sent it after your approval.

Outcome: done

Done: Invoice INV-12 drafted for ACME and sent

Evidence: send_email confirmed message id m-881; total 1,240.00 EUR

Not done and why: nothing

Already sent, paid, booked, published or deleted: sent INV-12 to ACME (approval {APPROVAL})

Next step: none"""


@pytest.mark.parametrize("shape", [LIST_ITEMS, BLANK_LINES], ids=["list items", "blank lines"])
def test_a_report_with_each_label_on_its_own_line_reads_like_the_plain_one(shape):
    report = parse_report(shape)
    assert report is not None and report.outcome == "done"
    assert report.fields == parse_report(FULL).fields
    a = assess(facts(shape))
    assert valid(a) and a.phase == "complete" and a.outcome == "done"
    assert a.state == assess(facts(FULL)).state
    assert a.approvals == [APPROVAL]


def test_the_report_block_of_each_shape_is_the_six_labelled_lines_as_written():
    assert report_block(LIST_ITEMS) == LIST_ITEMS.split("\n\n", 1)[1]
    block = report_block(BLANK_LINES)
    assert block is not None and block.startswith("Outcome: done") and block.endswith("Next step: none")
    assert block.count("\n\n") == 5  # one blank line between the labels, none lost


def test_the_last_outcome_starts_the_report_and_extra_text_after_it_is_ignored():
    text = (
        "Earlier attempt:\nOutcome: failed\nDone: nothing\n\n"
        + FULL
        + "\n\nLet me know if you need anything else!\nHappy to help."
    )
    report = parse_report(text)
    assert report.outcome == "done"
    assert report.fields["next_step"] == ["none"]
    a = assess(facts(text))
    assert a.phase == "complete" and "Happy to help." not in str(a.state)


def test_headings_dashes_and_short_labels():
    text = "### Outcome — blocked\nDone - nothing\nEvidence: none\nNot done: the VAT number is missing\nAlready: nothing\nNext steps: ask for the VAT number"
    a = assess(facts(text))
    assert valid(a) and (a.phase, a.outcome) == ("blocked", "blocked")
    assert a.summary == "the VAT number is missing"


def test_a_slash_inside_the_long_already_not_done_and_gia_labels():
    text = (
        "Outcome: done\nDone: the reminder\nEvidence: send_email confirmed m-1\n"
        "Not done and why/with what I tried: the follow-up, the address bounced\n"
        f"Already sent/published: the reminder to ACME (approval {APPROVAL})\nNext step: none"
    )
    report = parse_report(text)
    assert report.items("not_done") == ["the follow-up, the address bounced"]
    assert report.items("already") == [f"the reminder to ACME (approval {APPROVAL})"]
    assert parse_report(text.replace("Not done and why/with what I tried", "Not done / why")).items("not_done") == [
        "the follow-up, the address bounced"
    ]
    italian = "Esito: fatto\nFatto: x\nProve: y\nNon fatto e perché: niente\nGià inviato/pubblicato: il promemoria\nProssimo passo: z"
    assert parse_report(italian).items("already") == ["il promemoria"]


@pytest.mark.parametrize(
    "outcome, phase",
    [
        ("done", "complete"),
        ("partly done", "in-progress"),
        ("in progress", "in-progress"),
        ("blocked", "blocked"),
        ("failed", "blocked"),
        ("needs you", "blocked"),
    ],
)
def test_each_outcome_maps_to_its_phase(outcome, phase):
    text = (
        f"Outcome: {outcome}\nDone: drafted the reply\nEvidence: draft d-1 saved\n"
        f"Not done and why: {'nothing' if outcome == 'done' else 'the address is unknown'}\n"
        f"Already: nothing\nNext step: {'none' if outcome == 'done' else 'ask the person for the address'}"
    )
    a = assess(facts(text))
    assert valid(a)
    assert (a.phase, a.outcome) == (phase, outcome)


HANDED_OVER = """Gus: the jamming printer
Penny: Northwind's unpaid March invoice

Outcome: in progress
Done: handed the printer to Gus and the invoice to Penny
Evidence: message_bot confirmed both hand-offs
Not done and why: their answers arrive later
Already sent, paid, booked, published or deleted: nothing
Next step: none"""


def test_work_handed_to_colleagues_is_in_progress_in_the_checkpoint_and_the_team_log():
    a = assess(facts(HANDED_OVER))
    assert valid(a) and (a.phase, a.outcome) == ("in-progress", "in progress")
    assert a.state["completed"] == ["handed the printer to Gus and the invoice to Penny"]
    assert a.state["verification"] == ["message_bot confirmed both hand-offs"]
    assert a.summary == "handed the printer to Gus and the invoice to Penny"
    no_step = assess(facts(HANDED_OVER.replace("Not done and why: their answers arrive later", "Not done: nothing")))
    assert valid(no_step) and no_step.state["next_steps"] == ["Wait for the work under way to finish"]
    entry = team_log.make_entry(
        member="freeduet", thread="t", run="r", outcome=a.outcome, summary=a.summary, from_iris=None, approvals=a.approvals
    )
    assert entry["outcome"] == "in progress" and entry["approvals"] == "nothing"
    assert len(team_log.LOG_OUTCOMES) == len(set(team_log.LOG_OUTCOMES))
    assert set(team_log.LOG_OUTCOMES) == {"done", "partly done", "in progress", "blocked", "failed", "needs you", "error"}


def test_done_without_evidence_or_with_an_open_next_step_stays_in_progress():
    no_evidence = assess(facts("Outcome: done\nDone: sent it\nEvidence: none\nNot done: nothing\nAlready: nothing\nNext step: none"))
    assert valid(no_evidence) and no_evidence.phase == "in-progress" and no_evidence.outcome == "done"
    assert no_evidence.state["decisions"] == ["Reported done, kept in progress: no evidence"]
    open_step = assess(facts(FULL.replace("Next step: none", "Next step: call the client")))
    assert valid(open_step) and open_step.phase == "in-progress"
    assert open_step.state["next_steps"] == ["call the client"]


def test_no_report_is_in_progress_with_the_person_s_request():
    a = assess(facts("Paris is the capital of France."))
    assert valid(a) and (a.phase, a.outcome) == ("in-progress", "in progress")
    assert a.state["objective"] == "Send the ACME invoice"
    assert a.state["in_progress"] == []
    assert a.summary == "Paris is the capital of France." and a.approvals is None
    assert parse_report("Outcome: great\nDone: x") is None


def test_a_segment_that_ended_on_a_tool_call_lists_the_tools():
    a = assess(facts(FULL, handed_tools=["make_page", "make_page", "send_email"]))
    assert valid(a) and a.phase == "in-progress" and a.outcome == "in progress"
    assert a.state["in_progress"] == ["make_page", "send_email"]
    assert a.summary == "Waiting on make_page, send_email"


def test_an_error_is_blocked_with_the_error_in_blockers():
    a = assess(facts("half a sentence", error="Claude Code ended without an answer (exit code 3)."))
    assert valid(a) and (a.phase, a.outcome) == ("blocked", "error")
    assert a.state["blockers"] == ["Error: Claude Code ended without an answer (exit code 3)."]


def test_an_empty_request_still_gives_a_valid_state():
    a = assess(SegmentFacts(text="", objective=""))
    assert valid(a) and a.state["objective"]


def test_approval_ids():
    assert approval_ids([f"paid bill B-3 (approval {APPROVAL})", "booked a table, approval id: apr_7731"]) == [APPROVAL, "apr_7731"]
    assert approval_ids(["went through the approval gate"]) == []


def test_the_summary_is_one_line_of_at_most_200_characters():
    a = assess(facts("Outcome: done\nDone: " + "word " * 100 + "\nEvidence: e\nNot done: none\nAlready: nothing\nNext step: none"))
    assert len(a.summary) <= 200 and "\n" not in a.summary and a.summary.endswith("…")


ITALIAN = """Ho preparato la fattura.

Esito: fatto in parte
Fatto: bozza della fattura per Rossi
Prove: il file fattura-rossi.pdf su Drive
Non fatto e perché: non l'ho inviata, manca la partita IVA; ho provato a cercarla nelle email
Già: niente
Prossimo passo: dammi la partita IVA di Rossi
"""


def test_an_italian_report_reads_like_the_english_one():
    report = parse_report(ITALIAN)
    assert report is not None
    assert report.outcome == "partly done"
    assert report.items("done") == ["bozza della fattura per Rossi"]
    assert report.items("evidence") == ["il file fattura-rossi.pdf su Drive"]
    assert report.items("already") == []
    assert report.items("next_step") == ["dammi la partita IVA di Rossi"]


@pytest.mark.parametrize(
    ("word", "outcome"),
    [
        ("fatto", "done"),
        ("fatto in parte", "partly done"),
        ("in corso", "in progress"),
        ("bloccato", "blocked"),
        ("fallito", "failed"),
        ("serve te", "needs you"),
    ],
)
def test_each_italian_outcome(word, outcome):
    report = parse_report(f"Esito: {word}\nFatto: x\nProve: y\nNon fatto e perché: niente\nGià: niente\nProssimo passo: z")
    assert report is not None and report.outcome == outcome


AGENTS = Path(__file__).resolve().parents[2] / "examples" / "freeduet" / "agents.yaml"


def _listed(prompt: str, label: str) -> list[str]:
    """The outcomes a prompt's shared rules list after `label (`, up to the first ; or )."""
    match = re.search(re.escape(label) + r" \(([^;)]*)", prompt)
    assert match, f"no {label} list"
    return [word.strip() for word in re.split(r", | or ", match.group(1))]


def test_every_outcome_the_prompts_give_is_read_in_both_languages():
    agents = yaml.safe_load(AGENTS.read_text(encoding="utf-8"))["agents"]
    assert len(agents) == 12
    for agent in agents:
        english = _listed(agent["system_prompt"], "Outcome")
        italian = _listed(agent["system_prompt"], "Esito")
        assert (agent["id"], tuple(english)) == (agent["id"], OUTCOMES)
        assert [canonical_outcome(word) for word in italian] == list(OUTCOMES)
