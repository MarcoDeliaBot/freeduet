"""A member's work report, read from its final text, as a checkpoint and a team-log outcome.

Every member closes a piece of work with six lines (the shared rules in agents.yaml): Outcome,
Done, Evidence, Not done and why, Already, Next step. They map to checkpoint fields as
docs/ARCHITECTURE.md §2.5 says:

| Report line | Checkpoint field |
|---|---|
| Outcome: done / partly done, in progress / blocked, failed, needs you | phase: complete / in-progress / blocked |
| Done | completed |
| Evidence | verification |
| Not done and why, with what was tried | blockers; an item that says what was tried also in decisions |
| Already sent, paid, booked, published or deleted | completed, as "Already: ...", with its approval id |
| Next step | next_steps |

"Done" needs evidence and no open next step or blocker; a report that says done without them is
kept in progress, with the reason in `decisions`. "In progress" is work handed to a colleague or
still running, with nothing for the person to do yet. A segment without a report (it ended on a tool
call OpenBot runs, or it answered a question) is in progress too, with the tool names in
`in_progress`; both reach the team log as "in progress". A segment that ended in RUN_ERROR is
blocked, with the error in `blockers`.

Labels are read the way evals/team/checks.ts reads them: optional bullet, heading or bold, the label
(short or as the prompt words it), then a colon or a dash. The last "Outcome" line starts the report.
Italian labels and outcomes (the shared rules give the exact set: Esito, Fatto, Prove, Non fatto e
perché, Già, Prossimo passo; fatto, fatto in parte, in corso, bloccato, fallito, serve te) read
the same.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

IN_PROGRESS = "in progress"
OUTCOMES = ("done", "partly done", IN_PROGRESS, "blocked", "failed", "needs you")
ERROR = "error"
PHASE_FOR = {
    "done": "complete",
    "partly done": "in-progress",
    IN_PROGRESS: "in-progress",
    "blocked": "blocked",
    "failed": "blocked",
    "needs you": "blocked",
}
FIELDS = ("outcome", "done", "evidence", "not_done", "already", "next_step")

MAX_ITEMS = 20
MAX_ITEM = 500
MAX_SUMMARY = 200

_LABEL = re.compile(
    r"^\s*(?:#{1,6}\s+)?(?:[-*•>]\s+|\d+[.)]\s+)?(?:\*\*|__|\*|_)?\s*"
    r"(outcome|done|evidence|not done(?: and why| ?/ ?why)?(?:(?:,? | ?/ ?)with what (?:you|i) tried)?|already(?: [a-z ,/]+?)?|next steps?"
    r"|esito|fatto|prove|non fatto(?: e perch[eé])?(?:,? con (?:quello|ciò|cio) che (?:hai|ho) provato)?"
    r"|gi[àa](?: [a-zàèéìòù ,/]+?)?|prossim[oi] pass[oi])"
    r"\s*(?:\*\*|__|\*|_)?\s*[:—–-]\s*(?:\*\*|__|\*|_)?\s*(.*)$",
    re.IGNORECASE,
)
_LIST_OR_INDENTED = re.compile(r"^(?:\s{2,}|\t|\s*[-*•]\s|\s*\d+[.)]\s)")
_BULLET = re.compile(r"^\s*(?:[-*•]\s+|\d+[.)]\s+)")
_NOTHING = re.compile(
    r"(?:nothing|none|n/?a|no|-+|—|–|nessun[oa]?|niente|nulla)(?: (?:yet|else|so far|to report))?",
    re.IGNORECASE,
)
_TRIED = re.compile(r"\b(?:tried|attempted|attempts?|retried)\b", re.IGNORECASE)
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)
_APPROVAL_REF = re.compile(
    r"\bapproval(?:\s+id)?\s*[:#]?\s*((?=[A-Za-z0-9_-]*\d)[A-Za-z0-9][A-Za-z0-9_-]{2,63})", re.IGNORECASE
)


# Italian outcomes, longest first, mapped to the canonical English ones.
_ITALIAN_OUTCOMES = (
    ("fatto in parte", "partly done"),
    ("parzialmente fatto", "partly done"),
    ("fatto", "done"),
    ("in corso", IN_PROGRESS),
    ("bloccat", "blocked"),
    ("fallit", "failed"),
    ("serve te", "needs you"),
)


# The next step a checkpoint gets when the report names none: by outcome, else by phase.
_NEXT_STEP = {
    "needs you": "Wait for the person's answer",
    IN_PROGRESS: "Wait for the work under way to finish",
    "in-progress": "Finish what is not done yet",
    "blocked": "Resolve the blocker, then try again",
}


def _field_of(label: str) -> str:
    lower = label.lower()
    if lower in ("outcome", "esito"):
        return "outcome"
    if lower in ("done", "fatto"):
        return "done"
    if lower in ("evidence", "prove"):
        return "evidence"
    if lower.startswith(("not done", "non fatto")):
        return "not_done"
    if lower.startswith(("already", "già", "gia")):
        return "already"
    return "next_step"


def canonical_outcome(raw: str) -> str | None:
    """The outcome a report's first line names, in English, or None when it names none."""
    raw = raw.lower().strip(" .*_")
    for name in sorted(OUTCOMES, key=len, reverse=True):
        if raw.startswith(name):
            return name
    for prefix, name in _ITALIAN_OUTCOMES:
        if raw.startswith(prefix):
            return name
    return None


def _clean(item: str) -> str:
    item = _BULLET.sub("", item).strip()
    item = re.sub(r"^(?:\*\*|__)|(?:\*\*|__)$", "", item).strip()
    return item[:MAX_ITEM].strip()


def _is_nothing(items: list[str]) -> bool:
    return len(items) == 1 and bool(_NOTHING.fullmatch(items[0].strip(" \"'“”‘’.*_")))


@dataclass(frozen=True)
class Report:
    outcome: str
    fields: dict[str, list[str]]

    def items(self, name: str) -> list[str]:
        """A field's items, with "nothing", "none" and the like read as no items."""
        values = self.fields.get(name, [])
        if name == "already" and values and values[0].strip(" \"'“”*_").lower().startswith(
            ("nothing", "niente", "nulla", "nessun")
        ):
            return []
        return [] if _is_nothing(values) else values


def _scan(text: str) -> tuple[list[str], int, int, dict[str, list[str]]] | None:
    """The last report in `text`: its lines, where it starts and ends (exclusive), its fields."""
    lines = (text or "").replace("\r\n", "\n").split("\n")
    matches = [_LABEL.match(line) for line in lines]
    starts = [i for i, match in enumerate(matches) if match and _field_of(match.group(1)) == "outcome"]
    if not starts:
        return None
    fields: dict[str, list[str]] = {}
    current = None
    end = starts[-1]
    for index in range(starts[-1], len(lines)):
        line, match = lines[index], matches[index]
        if match:
            name = _field_of(match.group(1))
            if name in fields:
                break  # a second report, or a stray label after this one
            value = _clean(match.group(2).rstrip("*_ "))
            fields[name] = [value] if value else []
            current = name
            end = index + 1
            continue
        if not line.strip():
            continue
        if current == "next_step" and not _LIST_OR_INDENTED.match(line):
            break  # text after the report
        if current is not None and len(fields[current]) < MAX_ITEMS:
            item = _clean(line)
            if item:
                fields[current].append(item)
        end = index + 1
    return lines, starts[-1], end, fields


def parse_report(text: str) -> Report | None:
    """The report at the end of `text`, or None when there is none or its outcome is not one of
    done, partly done, in progress, blocked, failed, needs you."""
    scanned = _scan(text)
    if scanned is None:
        return None
    fields = scanned[3]
    outcome = canonical_outcome(" ".join(fields.get("outcome", [])))
    if outcome is None:
        return None
    return Report(outcome=outcome, fields=fields)


def report_block(text: str) -> str | None:
    """The last complete report in `text`, as written: from its Outcome line to its Next step and
    nothing around it. None unless all six lines are there and the outcome is a known one."""
    scanned = _scan(text)
    if scanned is None:
        return None
    lines, start, end, fields = scanned
    if set(fields) != set(FIELDS) or canonical_outcome(" ".join(fields.get("outcome", []))) is None:
        return None
    return "\n".join(line.rstrip() for line in lines[start:end]).strip()


def approval_ids(items: list[str]) -> list[str]:
    """Approval ids named in the Already line: UUIDs, or what follows the word "approval"."""
    found: list[str] = []
    for item in items:
        for match in [*_UUID.finditer(item), *_APPROVAL_REF.finditer(item)]:
            value = match.group(1) if match.re is _APPROVAL_REF else match.group(0)
            if value not in found and not any(value in other for other in found):
                found.append(value)
    return found[:MAX_ITEMS]


@dataclass(frozen=True)
class SegmentFacts:
    """What one segment did, as the runtime saw it."""

    text: str
    objective: str
    handed_tools: list[str] = field(default_factory=list)  # calls left for OpenBot to run
    constraints: list[str] = field(default_factory=list)
    error: str | None = None


@dataclass(frozen=True)
class Assessment:
    """A checkpoint (phase and state) and the team log's outcome, summary and approvals."""

    phase: str
    state: dict
    outcome: str
    summary: str
    approvals: list[str] | str | None  # ids, "nothing", or None when there is no Already line


def _unique(values: list[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return seen


def _one_line(text: str, limit: int = MAX_SUMMARY) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def _state(facts: SegmentFacts, **lists) -> dict:
    state = {
        "objective": facts.objective.strip() or "Continue the conversation in this thread",
        "constraints": [item for item in facts.constraints if item and item.strip()],
        "completed": [],
        "decisions": [],
        "in_progress": [],
        "changed_files": [],
        "verification": [],
        "blockers": [],
        "next_steps": [],
    }
    for name, values in lists.items():
        state[name] = [value for value in values if value and value.strip()]
    return state


def _from_report(facts: SegmentFacts, report: Report) -> Assessment:
    done, evidence = report.items("done"), report.items("evidence")
    not_done, already, next_steps = report.items("not_done"), report.items("already"), report.items("next_step")
    decisions = [f"Failed attempt: {item}" for item in not_done if _TRIED.search(item)]
    blockers = list(not_done)
    phase = PHASE_FOR[report.outcome]
    if phase == "complete" and (not evidence or blockers or next_steps):
        phase = "in-progress"
        reason = "no evidence" if not evidence else "an open next step or blocker"
        decisions.append(f"Reported done, kept in progress: {reason}")
        if not next_steps:
            next_steps = ["Confirm the result with evidence"]
    if phase == "blocked" and not blockers:
        blockers = [f"Reported {report.outcome} without saying why"]
    if phase != "complete" and not next_steps:
        next_steps = [_NEXT_STEP.get(report.outcome) or _NEXT_STEP[phase]]
    state = _state(
        facts,
        completed=[*done, *(f"Already: {item}" for item in already)],
        decisions=decisions,
        verification=evidence,
        blockers=blockers,
        next_steps=next_steps,
    )
    if report.outcome in ("blocked", "failed", "needs you") and not_done:
        summary = not_done[0]
    else:
        summary = next((items[0] for items in (done, not_done, next_steps) if items), facts.objective)
    if "already" not in report.fields:
        approvals = None
    else:
        approvals = approval_ids(already) if already else "nothing"
    return Assessment(phase, state, report.outcome, _one_line(summary), approvals)


def assess(facts: SegmentFacts) -> Assessment:
    """The checkpoint and the team-log outcome for one segment. The state always passes
    checkpoints.validate_state for its phase."""
    tools = _unique(facts.handed_tools)
    if facts.error is not None:
        error = facts.error.strip() or "The turn ended with an error."
        state = _state(
            facts,
            in_progress=tools,
            blockers=[f"Error: {_one_line(error, MAX_ITEM)}"],
            next_steps=["Run the turn again once the error is resolved"],
        )
        return Assessment("blocked", state, ERROR, _one_line(error), None)
    report = None if tools else parse_report(facts.text)
    if report is not None:
        return _from_report(facts, report)
    if tools:
        next_steps = [f"Continue once {', '.join(tools)} has a result"]
        summary = f"Waiting on {', '.join(tools)}"
    else:
        next_steps = ["Wait for the person's next message"]
        first = next((line for line in (facts.text or "").splitlines() if line.strip()), "")
        summary = first or facts.objective
    state = _state(facts, in_progress=tools, next_steps=next_steps)
    return Assessment("in-progress", state, IN_PROGRESS, _one_line(summary), None)
