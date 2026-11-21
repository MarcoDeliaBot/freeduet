"""The cannot guard: a member that says "I can't" in the person's own turn is asked once to look at its team (D128).

THE PROBLEM. In a live run (21 November 2026) the person asked Iris for the temperature in Rome and Iris
answered "I cannot check the temperature in real time, I have no access to weather services. Use a weather
app". D122 had told her, in her prompt, to hand a quick web look-up to Jules. A model on a fallback engine
(a free router model or a small local one, D116) ignores a prompt rule more easily than the model the prompt
was written for. A prompt is not a guarantee, so this is the same thing in code, in the way of the report
guard (report_guard.py): the segment looks at how the turn ended and acts once.

THE RULE. When a segment ends the turn (the CLI's final result, no call left for OpenBot to run, no
hand-off waiting for the person, no error) and ALL of these hold, the segment asks the member once more, in
the same segment, on the same engine, with the same tools:

- the run is the person's own live turn: the signed run statement says the initiator is the person (or their
  paired phone, kind `remote`), and nothing marks it as a hand-off (origin.is_handoff_run) or as the answer of
  a colleague coming back. A routine, a check-in, a responsibility and a hop never get it;
- the member was offered `message_bot` in this run (it can hand work to a colleague at all);
- the turn made no tool call (this segment, or one since the person's message) and no hand-off;
- the final answer is a refusal of capability (`is_refusal`): a short reply with a phrase such as "I can't",
  "I don't have access", "non posso", "non ho accesso", "no puedo", "je ne peux pas", "ich kann nicht",
  "não posso", that does not end with a question (a refusal that asks is a clarification, not a dead end);
- a colleague has the capability the request needs (`colleague_for`: a small table of capabilities, each
  naming a team member id, the name read from that member's own prompt, and never the member itself).

A refusal that names no capability in the table passes through unchanged: the guard does not guess which
colleague to name, and a refusal that was right (a thing the member must not do) is never pushed.

WHAT IT DOES. A new `claude -p` turn of the same engine, with the member's system text and the conversation so
far (the refusal included) and `reminder` in place of the usual last line. The reminder names the colleague and
the tool, asks for the hand-off, and says that if nobody can do it, or the member must not, it says so and why.
The tools are the segment's own, so the hand-off goes through the same bridge and the same approval gate as any
other: nothing is approved here, no card is skipped, and a hand-off that needs the person still asks.

AT MOST ONE RETRY. The second answer is the answer: if it refuses again it is let through. The first reply was
already on the person's screen, so the answer that follows comes as a new message after it.

IT NEVER BREAKS A TURN. Any exception in the decision or in the start of the retry is logged and swallowed, and
the turn ends with the first answer as before. `FREEDUET_CANNOT_GUARD=off` switches it off.

The team log records it (`cannot_guard`, team_log.py): "retried" when it asked again and the member then made a
tool call, "unchanged" when it asked again and the answer was no tool call, "failed" when the retry could not run.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass

from . import members, origin, report_guard, team_log
from .members import MemberError
from .origin import is_envelope, latest_user_message, message_text

log = logging.getLogger("freeduet.cannot_guard")

HANDOFF_TOOL = "message_bot"
LIVE_INITIATORS = frozenset({"person", "remote"})  # the person's own message (a paired browser, or a phone)
MAX_REFUSAL_CHARS = 800  # a refusal is short; a long answer that holds the phrase is an answer

RETRIED, UNCHANGED, FAILED = team_log.CANNOT_GUARD_VALUES  # what the team log's `cannot_guard` records


def enabled(environment: dict[str, str] | None = None) -> bool:
    value = (environment if environment is not None else os.environ).get("FREEDUET_CANNOT_GUARD", "")
    return value.strip().lower() not in {"off", "0", "false", "no"}


# ── the classifier ───────────────────────────────────────────────────────────────────────────────

# Phrases of a refusal of capability, per language. Lower case, apostrophes normalised to '. A phrase is
# matched on word edges. Kept short and plain on purpose: a longer list is a longer list of wrong matches.
_PHRASES = (
    # English
    r"i can'?t", r"i cannot", r"i am not able to", r"i'm not able to", r"i am unable to", r"i'm unable to",
    r"i don'?t have (?:any )?(?:access|a way|the ability|the tools?|tools?)", r"i do not have (?:any )?(?:access|a way|the ability|the tools?|tools?)",
    r"i have no (?:access|way|ability|tools?)", r"i lack (?:access|the ability)",
    # Italian
    r"non posso", r"non riesco a", r"non sono in grado", r"non ho accesso", r"non ho la possibilit[aà]",
    r"non ho (?:modo|strumenti|alcuno strumento)", r"non dispongo", r"non ho (?:la capacit[aà]|i mezzi)",
    # Spanish
    r"no puedo", r"no tengo acceso", r"no soy capaz", r"no dispongo",
    # French
    r"je ne peux pas", r"je n'ai pas acc[eè]s", r"je ne suis pas en mesure", r"je ne dispose pas",
    # German
    r"ich kann nicht", r"ich kann (?:\w+ ){0,4}nicht", r"ich habe keinen zugriff", r"ich habe keinen zugang",
    # Portuguese
    r"n[aã]o posso", r"n[aã]o tenho acesso", r"n[aã]o consigo", r"n[aã]o sou capaz",
)
_REFUSAL = re.compile(r"(?<!\w)(?:" + "|".join(_PHRASES) + r")(?!\w)", re.IGNORECASE)


def _plain(text: str) -> str:
    return (text or "").replace("’", "'").replace("‘", "'").replace("`", "'")


def is_refusal(reply: str) -> bool:
    """The reply is a short refusal of capability and not a question to the person."""
    text = _plain(reply).strip()
    if not text or len(text) > MAX_REFUSAL_CHARS or report_guard.ends_with_question(text):
        return False
    return _REFUSAL.search(text) is not None


# ── who can do what ──────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Capability:
    key: str
    member_id: str  # an id in the team file (agents.yaml); a test reads that every one exists
    what: str  # what the colleague has, as the reminder says it
    pattern: re.Pattern  # matched on the person's message and on the refusal, together


def _words(*alternatives: str) -> re.Pattern:
    return re.compile(r"(?<!\w)(?:" + "|".join(alternatives) + r")", re.IGNORECASE)


# One row per capability a refusal can be about. The member is the one whose own prompt says it does that
# job (examples/freeduet/agents.yaml); the table is the only place code names members, and
# tests/test_cannot_guard.py reads each id in the team file and the capability in that member's prompt.
CAPABILITIES: tuple[Capability, ...] = (
    Capability(
        "web", "concierge", "a browser and the web, so a quick look-up (the weather, news, opening hours, an address)",
        _words(
            r"weather", r"forecast", r"temperatur", r"meteo", r"previsioni", r"tempo reale", r"real[- ]?time",
            r"news\b", r"notizie", r"headlines?", r"opening hours", r"orari di apertura", r"stock price", r"exchange rate",
            r"search the (?:web|internet)", r"cerca(?:re)? (?:online|sul web|su internet)", r"wetter", r"nachrichten", r"noticias",
        ),
    ),
    Capability(
        "mail", "inbox", "the person's mailbox (reading, sorting and, with the person's approval, sending mail)",
        _words(r"e-?mails?\b", r"\bmail\b", r"inbox", r"gmail", r"posta in arrivo", r"casella di posta"),
    ),
    Capability(
        "money", "bookkeeper", "the small-business money paperwork (invoices, receipts, who owes what)",
        _words(r"invoice", r"fattur", r"receipt", r"ricevut", r"bookkeep", r"contabil", r"who owes", r"chi mi deve"),
    ),
    Capability(
        "contracts", "counsel", "the first-pass review of a contract, a lease or terms",
        _words(r"contract", r"contratt", r"\blease\b", r"affitto", r"terms and conditions", r"termini e condizioni"),
    ),
    Capability(
        "video", "video", "a computer with ffmpeg for cutting and editing video",
        _words(r"\bvideo", r"ffmpeg", r"montaggio", r"sottotitol", r"subtitles"),
    ),
)


def _name_of(prompt: str) -> str | None:
    match = re.search(r"You are ([A-Z][A-Za-z]+),", prompt or "")
    return match.group(1) if match else None


def colleague_for(
    request: str, member_id: str, prompts: dict[str, str] | None = None
) -> tuple[Capability, str] | None:
    """The first capability the PERSON'S REQUEST is about whose member is not this one and is in the team
    file, with that member's name. The refusal's own words are not read: a stray word in a refusal ("I can't
    predict the future price") must not name a colleague. None when nothing matches: the refusal passes through."""
    try:
        prompts = members.load_prompts() if prompts is None else prompts
    except MemberError:
        return None
    for capability in CAPABILITIES:
        if capability.member_id == member_id or not capability.pattern.search(request):
            continue
        name = _name_of(prompts.get(capability.member_id, ""))
        if name:
            return capability, name
    return None


# ── never for a safety, credential or payment matter ─────────────────────────────────────────────

# The words of the approval gate's SAFETY_REQUIREMENTS (openbot/server/src/approvals/policy.ts: credentials,
# security settings, payments), mirrored here because that list is TypeScript, plus the illegal. A refusal about
# one of these is very likely a right refusal, so the guard never pushes it (the approval gate is not
# involved: this only decides not to ask again). tests/test_cannot_guard.py reads policy.ts and fails if its
# base patterns are no longer the ones mirrored here.
_SENSITIVE = re.compile(
    r"pass(?:word|code|phrase)|passwd|\b2fa\b|two[-_ ]?factor|\bmfa\b|\botp\b|one[-_ ]?time[-_ ]?code|"
    r"recovery[-_ ]?(?:code|key|email|phone)|security[-_ ]?question|api[-_ ]?key|access[-_ ]?token|credential|"
    r"credenzial|codice (?:otp|monouso|di verifica|di accesso|di sicurezza)|chiave (?:api|segreta)|"
    r"security[-_ ]?settings?|impostazioni (?:di )?sicurezza|delete[-_ ]?(?:my[-_ ]?)?account|elimina(?:re)? (?:il )?(?:mio )?account|"
    r"payment|\bpay(?:ing)?\b|checkout|purchase|place[-_ ]?order|buy[-_ ]?now|\bwire\b|bank[-_ ]?transfer|transfer[-_ ]?(?:money|funds)|"
    r"send[-_ ]?money|credit[-_ ]?card|card[-_ ]?number|\bcvv\b|\biban\b|billing|"
    r"\bpaga|pagament|bonific|acquist|compra|carta di credito|"
    r"illegal|illegale|illecit|\bhack|\bmalware|\bphishing",
    re.IGNORECASE,
)


def is_sensitive(text: str) -> bool:
    return _SENSITIVE.search(_plain(text)) is not None


# ── when it applies ──────────────────────────────────────────────────────────────────────────────


def is_live_person_turn(messages: list[dict], assertion: str) -> bool:
    """The signed run statement names the person (or their paired phone) as the initiator, and nothing says
    this run is a hop or a colleague's answer coming back. A statement that cannot be read is not the person."""
    claims = origin.run_claims(assertion)
    initiator = claims.get("initiator")
    if not isinstance(initiator, dict) or initiator.get("kind") not in LIVE_INITIATORS:
        return False
    if origin.is_handoff_run(messages, assertion):
        return False
    latest = latest_user_message(messages)
    return latest is not None and not is_envelope(latest)


def applies(
    messages: list[dict], reply: str, called_in_segment: bool, assertion: str, offered: set[str] | frozenset[str],
    member_id: str, prompts: dict[str, str] | None = None,
) -> tuple[Capability, str] | None:
    """The colleague to name when the turn that ends with `reply` gets the retry, else None."""
    if not is_live_person_turn(messages, assertion) or HANDOFF_TOOL not in offered:
        return None
    if called_in_segment or report_guard._called_since(messages, latest_user_message(messages)):
        return None
    if not is_refusal(reply):
        return None
    latest = latest_user_message(messages)
    request = message_text(latest).split(origin.GROUP_TRANSCRIPT, 1)[0] if latest else ""
    if is_sensitive(request) or is_sensitive(reply):
        return None
    return colleague_for(request, member_id, prompts)


def reminder(capability: Capability, name: str) -> str:
    """The last line of the retry's prompt (transcript.render, `closing`)."""
    return (
        f"Your reply above says you cannot do this. Before you tell the person that, you must look at your team: "
        f"{name} has {capability.what}. Call the {HANDOFF_TOOL} tool now with bot \"{name}\", a task that states "
        "what the person asked in one or two sentences, and what a good answer holds. Then answer the person "
        f"from what {name} sends back, in the language of the person's last message, and say who found it. "
        "Do not tell the person to use another app or website for something your team can do. "
        f"Only if {name} cannot do it either, or doing it would be wrong, say so in a sentence and why. "
        "Write nothing about this note."
    )
