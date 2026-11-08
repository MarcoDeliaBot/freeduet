"""Work reports read from a member's final text and mapped to checkpoint fields (report.py)."""

import pytest

from freeduet import checkpoints
from freeduet.report import SegmentFacts, approval_ids, assess, parse_report

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


@pytest.mark.parametrize(
    "outcome, phase",
    [("done", "complete"), ("partly done", "in-progress"), ("blocked", "blocked"), ("failed", "blocked"), ("needs you", "blocked")],
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
