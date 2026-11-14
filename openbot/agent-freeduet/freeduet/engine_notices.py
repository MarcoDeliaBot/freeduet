"""What the person is told when an engine cannot take a turn (ENGINES_PLAN section 5, "What the person sees").

Fixed sentences, English and Italian, like D26's person-language table: Italian when the deployment says the person
reads Italian, English otherwise. Nothing here is model text, and nothing here carries an account, an error an
engine printed or a path: only an engine's label, a time and a fixed phrase. Times are UTC, because the service
knows no time zone of the person's (the sentence says so).

One short sentence per switch. Where the plan was silent the choices are named in docs/M1_PLAN.md (D34).
"""

from __future__ import annotations

from datetime import UTC, datetime

from .failure_classifier import AUTH, CREDITS, RATE_LIMIT, TRANSIENT, USAGE_LIMIT

NONE, TEXT, TOOL = "none", "text", "tool"  # how far the turn got on the engine that stopped

#: Words the ask-first question always carries, so the answer to it can be told from any other message.
ASK_MARK = {"en": 'Reply "switch"', "it": 'Rispondi "passa"'}


def language_of(run) -> str:
    code = (getattr(run, "person_language", None) or ("en",))[0]
    return "it" if code == "it" else "en"


def clock(moment: datetime | None) -> str | None:
    return moment.astimezone(UTC).strftime("%H:%M UTC") if moment is not None else None


def _reason(lang: str, label: str, kind: str, until: str | None) -> str:
    """The first half of a notice: why `label` cannot take the turn."""
    limited = kind in (RATE_LIMIT, USAGE_LIMIT, CREDITS)
    if lang == "it":
        if limited:
            return f"{label} ha raggiunto il limite fino alle {until}" if until else f"{label} ha raggiunto il limite"
        if kind == AUTH:
            return f"{label} non ha effettuato l'accesso"
        return f"{label} non risponde"
    if limited:
        return f"{label} reached its limit until {until}" if until else f"{label} reached its limit"
    if kind == AUTH:
        return f"{label} is not signed in"
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


def all_limited(lang: str, until: datetime | None) -> str:
    when = clock(until)
    if lang == "it":
        back = f" Il primo torna alle {when}." if when else ""
        return f"Ora nessun motore è disponibile.{back} Il tuo messaggio è conservato: rimandalo più tardi."
    back = f" The earliest is back at {when}." if when else ""
    return f"Every engine is unavailable right now.{back} Your message is kept: send it again later."


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
