"""What the person is told when an engine cannot take a turn (ENGINES_PLAN section 5, "What the person sees").

Fixed sentences, English and Italian, like D26's person-language table: Italian when the deployment says the person
reads Italian, English otherwise. Nothing here is model text, and nothing here carries an account, an error an
engine printed or a path: only an engine's label, a time and a fixed phrase. Times are UTC, because the service
knows no time zone of the person's (the sentence says so).

One short sentence per switch. Where the plan was silent the choices are named in docs/M1_PLAN.md (D34).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime

from .engines import GAP_CLOSED, GAP_COST, GAP_SETUP, PAID_GATEWAY_NO_COST, PAID_GATEWAY_NOT_RUN, PAID_GATEWAY_SETUP
from .failure_classifier import AUTH, CREDITS, RATE_LIMIT, TRANSIENT, USAGE_LIMIT
from .ledger import DAILY, MONTHLY

NONE, TEXT, TOOL = "none", "text", "tool"  # how far the turn got on the engine that stopped
#: A kind of its own for an engine that runs on a key (an `anthropic-compatible` gateway): the key is missing or
#: refused, which is not a sign-in the person can do in a terminal. Chosen by the router, never by the classifier.
KEY = "key"


class Held(str):
    """The kind of an engine the spend ledger holds back (ledger.py), in the place of a failure kind: a limit the person set
    was reached, or the ledger cannot tell what was spent. It is a string, so everything that passes a kind around keeps
    working; ``which`` is the ledger's ``DAILY``, ``MONTHLY`` or ``UNKNOWN`` and ``cap`` the limit as the person wrote it
    ("1.00 EUR"; empty when the hold is not a limit)."""

    which: str
    cap: str

    def __new__(cls, which: str, cap: str = ""):
        held = super().__new__(cls, f"held-{which}")
        held.which, held.cap = which, cap
        return held


#: Words the ask-first question always carries, so the answer to it can be told from any other message.
ASK_MARK = {"en": 'Reply "switch"', "it": 'Rispondi "passa"'}


def language_of(run) -> str:
    code = (getattr(run, "person_language", None) or ("en",))[0]
    return "it" if code == "it" else "en"


def clock(moment: datetime | None) -> str | None:
    return moment.astimezone(UTC).strftime("%H:%M UTC") if moment is not None else None


def _held(lang: str, label: str, held: Held) -> str:
    """Why the spend ledger holds `label` back: a limit the person set was reached, or FreeDuet cannot tell what it cost."""
    if lang == "it":
        if held.which == DAILY:
            return f"{label} ha raggiunto il limite giornaliero che hai impostato ({held.cap})"
        if held.which == MONTHLY:
            return f"{label} ha raggiunto il limite mensile che hai impostato ({held.cap})"
        return f"{label} è sospeso perché FreeDuet non sa quanto è costato"
    if held.which == DAILY:
        return f"{label} reached the daily limit you set ({held.cap})"
    if held.which == MONTHLY:
        return f"{label} reached the monthly limit you set ({held.cap})"
    return f"{label} is held back because FreeDuet cannot tell what it has cost"


def _reason(lang: str, label: str, kind: str, until: str | None) -> str:
    """The first half of a notice: why `label` cannot take the turn."""
    if isinstance(kind, Held):
        return _held(lang, label, kind)
    limited = kind in (RATE_LIMIT, USAGE_LIMIT, CREDITS)
    if lang == "it":
        if limited:
            return f"{label} ha raggiunto il limite fino alle {until}" if until else f"{label} ha raggiunto il limite"
        if kind == AUTH:
            return f"{label} non ha effettuato l'accesso"
        if kind == KEY:
            return f"{label} non ha una chiave accettata dal suo gateway"
        return f"{label} non risponde"
    if limited:
        return f"{label} reached its limit until {until}" if until else f"{label} reached its limit"
    if kind == AUTH:
        return f"{label} is not signed in"
    if kind == KEY:
        return f"{label} has no key its gateway accepts"
    return f"{label} is not answering"


def reason(lang: str, label: str, kind: str, until: datetime | None) -> str:
    return _reason(lang, label, kind, clock(until))


def switched(lang: str, old: str, kind: str, until: datetime | None, new: str, progress: str) -> str:
    """The one line shown at a switch. `progress` says how far the turn got, so the person knows whether anything
    was already said or done."""
    why = reason(lang, old, kind, until)
    if lang == "it":
        tail = {
            NONE: f"quindi risponde {new} al suo posto.",
            TEXT: f"quindi {new} continua da dove si era fermato, senza ripetere il testo.",
            TOOL: f"quindi {new} continua; ciò che è già stato fatto non viene ripetuto.",
        }[progress]
    else:
        tail = {
            NONE: f"so {new} is answering instead.",
            TEXT: f"so {new} is continuing from where it stopped, without repeating the text.",
            TOOL: f"so {new} is continuing; nothing already done is repeated.",
        }[progress]
    return f"{why}, {tail}"


def without_tools(lang: str, tools: list[str], tier: str) -> str:
    names = ", ".join(tools)
    if lang == "it":
        return f"Qui non posso usare {names}: solo un motore di livello {tier} può farlo."
    return f"I cannot use {names} here: only a tier {tier} engine may."


def asked(lang: str, old: str, kind: str, until: datetime | None, new: str) -> str:
    why = reason(lang, old, kind, until)
    if lang == "it":
        return f'{why}. Passo a {new}, aspetto, o ne scelgo un altro? Rispondi "passa", "aspetta" o scrivi il nome di un altro motore.'
    return f'{why}. Switch to {new}, wait, or pick another? Reply "switch", "wait", or name another engine.'


def waiting(lang: str, label: str, until: datetime | None) -> str:
    when = clock(until)
    if lang == "it":
        back = f" (torna alle {when})" if when else ""
        return f"Va bene, non cambio motore. Aspetto {label}{back}: manda di nuovo il messaggio quando vuoi."
    back = f" (back at {when})" if when else ""
    return f"Understood, I will not switch. Waiting for {label}{back}: send your message again when you like."


def pinned(lang: str, label: str, kind: str, until: datetime | None) -> str:
    why = reason(lang, label, kind, until)
    if lang == "it":
        return f"{why}, e questo assistente è fissato su di esso: mi fermo qui e non passo a un altro motore."
    return f"{why}, and this assistant is pinned to it, so I stopped here and did not switch to another engine."


def pinned_off(lang: str, label: str) -> str:
    if lang == "it":
        return f"Questo assistente è fissato su {label}, ma {label} è spento: mi fermo qui e non passo a un altro motore."
    return f"This assistant is pinned to {label}, but {label} is switched off, so I stopped here and did not switch to another engine."


#: The Italian of `engines.PAID_GATEWAY_NOT_RUN`: what a paid gateway is told while the maintainer's switch is closed, whatever
#: the `metered:` block says.
_PAID_NOT_RUN_IT = (
    "FreeDuet non esegue ancora i gateway a pagamento, perché non può ancora far rispettare i limiti che hai impostato. "
    "I gateway gratuiti e i motori su cui hai effettuato l'accesso funzionano."
)
#: The Italian of `engines.PAID_GATEWAY_SETUP` and `engines.PAID_GATEWAY_NO_COST`: the switch is open, and something else is missing.
_PAID_SETUP_IT = (
    "Funziona solo se engines.yaml attiva `metered`, con un limite giornaliero e uno mensile maggiori di 0 e `enforce: ledger`, "
    "così FreeDuet rispetta i limiti che hai impostato. I gateway gratuiti e i motori su cui hai effettuato l'accesso funzionano."
)
_PAID_NO_COST_IT = (
    "Non indica quanto costa ogni turno, nella valuta dei tuoi limiti, quindi FreeDuet non può tenerlo entro un limite di spesa. "
    "I gateway gratuiti e i motori su cui hai effettuato l'accesso funzionano."
)
_PAID_WHY = {
    GAP_CLOSED: (PAID_GATEWAY_NOT_RUN, _PAID_NOT_RUN_IT),
    GAP_SETUP: (PAID_GATEWAY_SETUP, _PAID_SETUP_IT),
    GAP_COST: (PAID_GATEWAY_NO_COST, _PAID_NO_COST_IT),
}


def _paid_refusal(lang: str, labels: Sequence[str], gap: str = GAP_CLOSED) -> str:
    """"X is a paid gateway. FreeDuet does not run paid gateways yet ..." for one or several gateways, in the words of
    `engines.paid_gateway_refusal` (English) or their Italian. `gap` is why they do not run (`engines.paid_gateway_gap`).
    While the switch is closed nothing here tells the person to set the `metered:` block, because nothing in it makes a paid
    gateway run."""
    names = ", ".join(labels)
    many = len(labels) > 1
    english, italian = _PAID_WHY[gap]
    if lang == "it":
        return f"{names} {'sono gateway a pagamento' if many else 'è un gateway a pagamento'}. {italian}"
    return f"{names} {'are paid gateways' if many else 'is a paid gateway'}. {english}"


def paid_off(lang: str, labels: Sequence[str], gaps: Mapping[str, str] | None = None) -> str:
    """Why a paid gateway of the chain was not used. Empty when there is none. `gaps` says why each did not run (label to
    `engines.paid_gateway_gap`); without it the switch is closed, which is the only reason there was before the ledger."""
    if not labels:
        return ""
    by_gap: dict[str, list[str]] = {}
    for label in labels:
        by_gap.setdefault((gaps or {}).get(label) or GAP_CLOSED, []).append(label)
    return "".join(f" {_paid_refusal(lang, names, gap)}" for gap, names in by_gap.items())


def pinned_paid_off(lang: str, label: str, gap: str = GAP_CLOSED) -> str:
    if lang == "it":
        return f"{_paid_refusal(lang, [label], gap)} Questo assistente è fissato su di esso: mi fermo qui e non passo a un altro motore."
    return f"{_paid_refusal(lang, [label], gap)} This assistant is pinned to it, so I stopped here and did not switch to another engine."


def key_refused(lang: str, labels: Sequence[str]) -> str:
    """The engines of the chain that run on a key and were left because that key is missing or refused: the person can
    mend it, so it is said, and not folded into "unavailable". Empty when there is none."""
    if not labels:
        return ""
    return "".join(f" {reason(lang, label, KEY, None)}." for label in labels)


def held_off(lang: str, held: Sequence[tuple[str, str]]) -> str:
    """The engines of the chain the spend ledger holds back, each with the sentence of why (label and `Held` kind): a limit
    the person set, or a ledger that cannot tell what was spent. They are said, and not folded into "unavailable", because
    the person set the limit and can change it. Empty when there is none."""
    return "".join(f" {reason(lang, label, kind, None)}." for label, kind in held)


def all_limited(
    lang: str,
    until: datetime | None,
    paid_off_labels: Sequence[str] = (),
    key_labels: Sequence[str] = (),
    held: Sequence[tuple[str, str]] = (),
    paid_gaps: Mapping[str, str] | None = None,
) -> str:
    when = clock(until)
    extra = key_refused(lang, key_labels) + held_off(lang, held) + paid_off(lang, paid_off_labels, paid_gaps)
    if lang == "it":
        back = f" Il primo torna alle {when}." if when else ""
        return f"Ora nessun motore è disponibile.{back}{extra} Il tuo messaggio è conservato: rimandalo più tardi."
    back = f" The earliest is back at {when}." if when else ""
    return f"Every engine is unavailable right now.{back}{extra} Your message is kept: send it again later."


def loop_stop(lang: str, switches: int) -> str:
    if lang == "it":
        return (
            f"In questo turno ho cambiato motore {switches} volte e anche l'ultimo si è fermato: "
            "mi fermo invece di provarne altri. Rimanda il messaggio tra poco."
        )
    return (
        f"I switched engines {switches} times in this turn and the last one stopped too, so I stopped "
        "instead of trying more. Send your message again in a moment."
    )


# What the person answers to the ask-first question.
_SWITCH = frozenset({"switch", "yes", "y", "ok", "okay", "go", "sure", "passa", "si", "sì", "vai", "certo"})
_WAIT = frozenset({"wait", "no", "n", "stop", "cancel", "aspetta", "attendi", "annulla"})


def parse_answer(text: str) -> tuple[str, str]:
    """('switch', ''), ('wait', ''), ('name', <what they wrote>) or ('unclear', '')."""
    said = " ".join((text or "").lower().replace('"', " ").replace(".", " ").replace("!", " ").split())
    if not said:
        return "unclear", ""
    if said in _SWITCH:
        return "switch", ""
    if said in _WAIT:
        return "wait", ""
    if len(said) <= 40:
        return "name", said
    return "unclear", ""


__all__ = ["AUTH", "TRANSIENT"]
