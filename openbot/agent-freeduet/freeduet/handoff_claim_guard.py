"""The hand-off claim guard: a member that says a colleague has the work, with no hand-off made, is asked once (D184).

THE PROBLEM. In a live run (27-28 November 2026) the person answered Kai's read-back with "via". Iris wrote
"Ottimo, procedo con Kai... Kai riceve il go... Esito: in corso" and made no `message_bot` call. Asked "sicuro che
stia lavorando?", she answered "Si, Kai sta lavorando" and quoted a line from the registro that was her own claim.
Only when pressed twice did she say she had never called the tool. No card, no ring and no hop existed. Her prompt
already says that the work has started only after the go: a prompt is not a guarantee, so this is the same thing
in code, in the way of the cannot guard (cannot_guard.py, D128).

THE RULE. When a segment ends the turn and ALL of these hold, the segment asks the member once more, in the same
segment, on the same engine, with the same tools:

- the run is the person's own live turn (`is_live_person_turn`: as cannot_guard decides it, but an envelope earlier in the conversation does not end it);
- the member was offered `message_bot` in this run;
- the turn made no `message_bot` call (this segment, or since the person's message);
- the final answer claims that a named colleague has the work now (`claimed_colleagues`): an in-progress outcome
  line, or words such as "receives the go", "I passed it to", "is working", "riceve il via", "sta lavorando",
  "gliel'ho passato", in English, Italian, Spanish, French, German and Portuguese, in a sentence that is not a
  question, not a negation and not a condition or a promise ("when you say go, Kai starts"). The colleague names
  are read from the members' own prompts ("You are <Name>,"); the member itself is never one;
- no hand-off to that colleague is open in this conversation (`open_handoffs`).

THE SOURCE OF "OPEN" (the brief's question B). agent-freeduet holds no list of hops: the queue lives in the
server (`server/src/work/queue`, read by `GET /api/freeduet/work-status` behind the person's own session), and the
one authenticated door agent-freeduet has (`POST /api/agent-tools/call`, bridge/callback.py) runs the tools the
deployment granted and has no read of the queue; a new tool on it would widen that route. The team log is written
after a segment ends, so a running hop is not in it, and a hop's own thread is not the asking one. What the member
does see is this conversation's own transcript: its `message_bot` calls and, when a colleague finishes or gives
up, the envelope OpenBot writes back into the asking conversation ("You asked <Name> to help with this: ... It
answered:" or "... and it never answered:", agents/handoff-runner.ts). So a hand-off to a colleague counts as OPEN
when the transcript holds a `message_bot` call to that colleague that was not refused and that no later envelope
from that colleague closes. This errs toward "open": an unanswered hop that has in fact failed silently is read as
open and the guard stays quiet, which is the safe side (no second hand-off, no second card).

WHAT IT DOES. A new `claude -p` turn of the same engine with `reminder` in place of the usual last line: it wrote
that <colleague> has the work, but no `message_bot` call was made and no hand-off to <colleague> is open; if it
meant to hand the work over it calls `message_bot` now (through the same bridge and the same approval gate as any
hand-off: nothing is approved here); otherwise it tells the person plainly that nothing was handed over.

AT MOST ONE RETRY, and the cannot guard and this guard share it: the second answer is the answer. IT NEVER BREAKS
A TURN: any exception is logged and swallowed. `FREEDUET_HANDOFF_CLAIM_GUARD=off` switches it off.

The team log records it (`handoff_claim_guard`, team_log.py): "retried" when the second turn made a tool call,
"unchanged" when it did not, "failed" when the retry could not run.
"""

from __future__ import annotations

import json
import logging
import os
import re

from . import cannot_guard, members, origin, report_guard, team_log
from .members import MemberError
from .origin import latest_user_message, message_text

log = logging.getLogger("freeduet.handoff_claim_guard")

HANDOFF_TOOL = "message_bot"

RETRIED, UNCHANGED, FAILED = team_log.HANDOFF_CLAIM_GUARD_VALUES


def enabled(environment: dict[str, str] | None = None) -> bool:
    value = (environment if environment is not None else os.environ).get("FREEDUET_HANDOFF_CLAIM_GUARD", "")
    return value.strip().lower() not in {"off", "0", "false", "no"}


# ── the claim ────────────────────────────────────────────────────────────────────────────────────

# Phrases that say a colleague has the work now. They are matched on the text folded as cannot_guard folds it
# (lower case, no accents, apostrophes as '), so none carries an accent. Kept plain: a longer list is a longer
# list of wrong matches, and a wrong match costs one more turn, never a wrong action.
_CLAIMS = (
    # English
    r"(?:receives?|got|gets|has|have|received) (?:the|your) [\"'«»“”]?(?:go|green light|go-ahead|okay|ok)\b",
    r"\b(?:i|i'?ve|i have) (?:just )?(?:passed|handed|sent|forwarded|given|delegated|briefed)\b",
    r"(?:passed|handed|sent|forwarded|delegated) (?:it|this|that|everything|the (?:work|task|brief|job)) (?:over )?to\b",
    r"(?:is|are) (?:now |already |currently )?(?:working|on it|building|writing|making|drafting|editing|started)\b",
    r"(?:has|have) (?:now |already )?(?:started|begun|taken (?:it|this) on)\b",
    r"\bproceeding with\b",
    # Italian
    r"(?:riceve|ricevono|ha ricevuto) (?:il |tuo |il tuo )?[\"'«»“”]?(?:via|go)\b",
    r"\bha il [\"'«»“”]?(?:via|go)\b",
    r"\b(?:sta|stanno) (?:gia |ora |adesso )?(?:lavorando|costruendo|scrivendo|preparando|montando)\b",
    r"\bci (?:sta|stanno) lavorando\b",
    r"\b(?:gliel|glielo|gliela|l)'?ho (?:passato|passata|girato|girata|affidato|affidata|inoltrato|inoltrata|dato|data)\b",
    r"\bho (?:passato|girato|affidato|inoltrato) (?:il lavoro|tutto|l'incarico|la richiesta|a)\b",
    r"\bprocedo con\b",
    r"\b(?:ha|hanno) (?:gia )?(?:iniziato|cominciato|preso in carico)\b",
    r"\be (?:gia )?al lavoro\b",
    # Spanish
    r"\b(?:recibe|ha recibido) (?:el|la) (?:go|luz verde|visto bueno|via libre)\b",
    r"\b(?:esta|estan) (?:ya |ahora )?(?:trabajando|construyendo|escribiendo|preparando)\b",
    r"\b(?:se lo|lo|le|se la|la) he (?:pasado|dado|encargado|reenviado)\b",
    r"\bhe (?:pasado|encargado)\b",
    r"\b(?:ha|han) (?:ya )?(?:empezado|comenzado)\b",
    # French
    r"\b(?:recoit|a recu) (?:le|la) (?:go|feu vert)\b",
    r"\best (?:deja |maintenant )?en train de\b",
    r"\btravaille (?:deja |maintenant )?(?:dessus|sur)\b",
    r"\b(?:je|j') ?(?:lui |le |l')?(?:ai|a) (?:transmis|passe|confie|donne)\b",
    r"\ba (?:deja )?(?:commence|demarre)\b",
    # German
    r"\b(?:bekommt|erhalt|hat) (?:jetzt |schon )?(?:das|den|dein) (?:go|startschuss|okay|gruene licht)\b",
    r"\barbeitet (?:jetzt |schon |bereits )?(?:daran|dran|damit|an)\b",
    r"\bich habe (?:es|das|alles|ihm|ihr)?.{0,30}?(?:weitergegeben|uebergeben|weitergeleitet|beauftragt|gebeten)\b",
    r"\bhat (?:schon |bereits )?(?:angefangen|begonnen)\b",
    # Portuguese
    r"\b(?:recebe|recebeu) o (?:go|sinal verde|ok)\b",
    r"\bestao? (?:ja |agora )?(?:trabalhando|a trabalhar|construindo|escrevendo)\b",
    r"\besta (?:ja |agora )?(?:trabalhando|a trabalhar)\b",
    r"\b(?:passei|repassei|entreguei|encaminhei) (?:o|a|isso|tudo|para|ao|a)\b",
    r"\b(?:comecou|iniciou)\b",
)
_CLAIM = re.compile("|".join(f"(?:{phrase})" for phrase in _CLAIMS))

# An in-progress outcome line, the report format's own ("Outcome: in progress", "Esito: in corso").
_OUTCOME_IN_PROGRESS = re.compile(
    r"(?:^|\n)\W*(?:outcome|esito|resultado|resultat|ergebnis|estado|statut|status)\W*[:\-]\W*"
    r"(?:in progress|in corso|en curso|en cours|in arbeit|in bearbeitung|em andamento|em curso)"
)

# A sentence that denies, asks, conditions or promises is not a claim that the work is with the colleague.
_NEGATION = re.compile(
    r"(?<![\w'])(?:not|never|no|non|mai|nessun\w*|nada|nunca|jamais|pas|ne|nicht|kein\w*|nie|nao|ainda nao|"
    r"haven't|hasn't|didn't|isn't|aren't|wasn't|don't|doesn't|cannot|can't|nothing)(?![\w])|n't\b"
)
_NOT_NOW = re.compile(
    r"(?<![\w'])(?:if|once|when|whenever|unless|as soon as|after you|will|would|could|can|shall|"
    r"want me|do you want|should i|quando|appena|vuoi che|se vuoi|se dici|se confermi|posso|potrei|faro|passero|"
    r"cuando|en cuanto|quieres que|puedo|pasare|quand|des que|lorsque|veux-tu|voulez-vous|je pourrais|"
    r"wenn|sobald|soll ich|moechtest du|quando voce|assim que|quer que|posso|passarei|vou)(?![\w])|'ll\b"
)


def _sentences(folded: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?:;])\s+|\n+", folded) if part.strip()]


def _names_of(prompts: dict[str, str]) -> dict[str, str]:
    """Folded colleague name -> member id, from each member's own prompt."""
    names: dict[str, str] = {}
    for member_id, prompt in prompts.items():
        name = cannot_guard._name_of(prompt)
        if name:
            names[cannot_guard._fold(name)] = member_id
    return names


def _prompts(prompts: dict[str, str] | None) -> dict[str, str]:
    try:
        return members.load_prompts() if prompts is None else prompts
    except MemberError:
        return {}


def claimed_colleagues(reply: str, member_id: str, prompts: dict[str, str] | None = None) -> list[tuple[str, str]]:
    """(member id, name) of each colleague, in order of appearance, that `reply` says has the work now. The member
    itself is never one. A sentence that denies, asks, makes a condition or promises does not count."""
    prompts = _prompts(prompts)
    names = {name: other for name, other in _names_of(prompts).items() if other != member_id}
    if not reply or not names:
        return []
    folded = cannot_guard._fold(reply)
    sentences = _sentences(folded)
    found: dict[str, str] = {}
    outcome_in_progress = _OUTCOME_IN_PROGRESS.search(folded) is not None
    if outcome_in_progress:
        # The report's outcome line is split at its colon like any sentence, so it is read here as a line: a colleague
        # named in that line, in the line just before it, or in a later line of the same report, in a line that is not
        # a denial, a question or a condition.
        lines = [line.strip() for line in folded.split("\n") if line.strip()]
        start = next((i for i, line in enumerate(lines) if _OUTCOME_IN_PROGRESS.search("\n" + line)), None)
        if start is not None:
            for line in lines[max(0, start - 1):]:
                if line.endswith("?") or _NEGATION.search(line) or _NOT_NOW.search(line):
                    continue
                for name, other in names.items():
                    if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", line):
                        found.setdefault(other, name)
    for index, sentence in enumerate(sentences):
        if sentence.endswith("?") or _NEGATION.search(sentence) or _NOT_NOW.search(sentence):
            continue
        if not (_CLAIM.search(sentence) or (outcome_in_progress and _OUTCOME_IN_PROGRESS.search(sentence))):
            continue
        # The colleague is named in this sentence or in the one before it ("Kai has it. He is working on it.").
        here = [(name, other) for name, other in names.items() if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", sentence)]
        if not here and index > 0:
            before = sentences[index - 1]
            here = [(name, other) for name, other in names.items() if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", before)]
        for name, other in here:
            found.setdefault(other, name)
    display = {other: cannot_guard._name_of(prompts.get(other, "")) or name for other, name in found.items()}
    return [(other, display[other]) for other in found]


# ── is a hand-off open ───────────────────────────────────────────────────────────────────────────


def _handoff_target(call: dict) -> tuple[str, str] | None:
    """(call id, folded `bot` argument) of a message_bot call, else None."""
    function = call.get("function") if isinstance(call, dict) else None
    if not isinstance(function, dict) or not isinstance(call.get("id"), str):
        return None
    if not str(function.get("name") or "").endswith(HANDOFF_TOOL):
        return None
    try:
        arguments = json.loads(function.get("arguments") or "{}")
    except ValueError:
        return None
    bot = arguments.get("bot") if isinstance(arguments, dict) else None
    return (call["id"], cannot_guard._fold(str(bot))) if isinstance(bot, str) else (call["id"], "")


def made_handoff_call(messages: list[dict]) -> bool:
    """A message_bot call (any target) in these messages."""
    for message in messages:
        for call in message.get("toolCalls") or []:
            if _handoff_target(call) is not None:
                return True
    return False


def _refused(result: dict | None) -> bool:
    """The hand-off was not sent: the tool said so, or the call came back as an error."""
    if result is None:
        return False  # no result yet: a hand-off waiting for an approval card is open
    text = str(result.get("content") or "")
    return bool(result.get("error")) or text.startswith(("That handoff was not sent", "Refused", "REFUSED"))


def open_handoffs(messages: list[dict], member_id: str, prompts: dict[str, str] | None = None) -> set[str]:
    """Member ids with a hand-off open in this conversation's transcript: a message_bot call that was not refused
    and that no later envelope from that colleague closed (see the module text for why this is the source)."""
    return handoff_states(messages, member_id, prompts)[0]


def handoff_states(
    messages: list[dict], member_id: str, prompts: dict[str, str] | None = None,
) -> tuple[set[str], set[str]]:
    """(open, answered): member ids with a hand-off still open, and member ids whose last hand-off in this
    conversation an envelope already closed (it answered, or never answered and gave up)."""
    prompts = _prompts(prompts)
    names = _names_of(prompts)
    ids = {cannot_guard._fold(member): member for member in prompts}
    results = {m.get("toolCallId"): m for m in messages if m.get("role") == "tool"}
    opened: set[str] = set()
    answered: set[str] = set()
    for position, message in enumerate(messages):
        for call in message.get("toolCalls") or []:
            target = _handoff_target(call)
            if target is None:
                continue
            call_id, bot = target
            other = names.get(bot) or ids.get(bot)
            if other is None:
                continue
            if _refused(results.get(call_id)):
                continue
            name = cannot_guard._fold(cannot_guard._name_of(prompts.get(other, "")) or other)
            closed = False
            for later in messages[position + 1:]:
                if later.get("role") != "user":
                    continue
                text = cannot_guard._fold(message_text(later))
                if re.search(rf"you asked (?:{re.escape(name)}|{re.escape(cannot_guard._fold(other))}) to help with this", text) and (
                    "it answered:" in text or "never answered" in text
                ):
                    closed = True
                    break
            if closed:
                answered.add(other)
            else:
                opened.add(other)
    return opened, answered - opened


# ── when it applies ──────────────────────────────────────────────────────────────────────────────


def is_live_person_turn(messages: list[dict], assertion: str) -> bool:
    """As cannot_guard.is_live_person_turn, except that an envelope earlier in the conversation (a colleague's
    answer relayed on an earlier turn) does not end it: this guard is about the person's latest message, and the
    thread where a colleague has answered is exactly where Iris can claim a second job started."""
    claims = origin.run_claims(assertion)
    initiator = claims.get("initiator")
    if not isinstance(initiator, dict) or initiator.get("kind") not in cannot_guard.LIVE_INITIATORS:
        return False
    if origin.claims_a_handoff(claims):
        return False
    latest = latest_user_message(messages)
    return latest is not None and not origin.is_envelope(latest)


def applies(
    messages: list[dict], story_messages: list[dict], reply: str, assertion: str, offered: set[str] | frozenset[str],
    member_id: str, prompts: dict[str, str] | None = None,
) -> tuple[str, str, bool] | None:
    """(member id, name, answered) of the colleague to name when the turn that ends with `reply` gets the retry, else
    None. `answered` is True when an earlier hand-off to that colleague in this conversation was already closed."""
    if not is_live_person_turn(messages, assertion) or HANDOFF_TOOL not in offered:
        return None
    latest = latest_user_message(messages)
    start = next((i for i, message in enumerate(messages) if message is latest), -1) + 1
    if made_handoff_call(story_messages) or made_handoff_call(messages[start:]):
        return None
    if report_guard.ends_with_question(reply):
        return None
    prompts = _prompts(prompts)
    claimed = claimed_colleagues(reply, member_id, prompts)
    if not claimed:
        return None
    open_now, answered = handoff_states(messages, member_id, prompts)
    for other, name in claimed:
        if other not in open_now:
            return other, name, other in answered
    return None


def reminder(member_id: str, name: str, answered: bool = False) -> str:
    """The last line of the retry's prompt (transcript.render, `closing`). When the colleague's last hand-off was
    already answered, the reply may be reporting that answer, so the note asks which it is instead of saying that
    the colleague received nothing."""
    if answered:
        return (
            f"Your reply above says that {name} has the work now. But no {HANDOFF_TOOL} call was made in this turn, and "
            f"the last hand-off to {name} in this conversation has already come back, so {name} is not working on "
            f"anything from you now. If you meant to give {name} the go or new work, call the {HANDOFF_TOOL} tool now "
            f"with bot \"{name}\" and the task, and say it has started only after the call has returned. If you were "
            f"reporting {name}'s answer, say plainly, in the language of the person's last message, that it is an answer "
            "that came back and not work in progress. Write nothing about this note."
        )
    return (
        f"Your reply above says that {name} has the work. But no {HANDOFF_TOOL} call was made in this turn, and no "
        f"hand-off to {name} is open in this conversation, so {name} has received nothing. If you meant to hand the "
        f"work over, call the {HANDOFF_TOOL} tool now with bot \"{name}\" and a task that states what the person "
        f"asked and what a good answer holds, and say it has started only after the call has returned. Otherwise "
        f"tell the person plainly, in the language of their last message, that nothing was handed over yet, and "
        "what you will do next. Write nothing about this note."
    )
