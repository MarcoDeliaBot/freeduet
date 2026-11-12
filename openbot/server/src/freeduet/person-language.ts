/**
 * The language the person reads, for the turns nobody wrote (docs/M1_PLAN.md D26).
 *
 * A member's prompt says "reply in the language the person writes in". In a check-in, a routine or
 * the morning brief the person wrote nothing, so that rule names no language and the member wrote
 * in English to a person who reads Italian. `FREEDUET_PERSON_LANGUAGE` names it once, as a
 * two-letter code, and two things follow from it:
 *
 * 1. Every run sent to agent-freeduet carries it in `forwardedProps.openbotPersonLanguage`, the
 *    place OpenBot already puts the per-run facts agent-freeduet reads (`openbotBotId`,
 *    `openbotDeploymentTools`, `openbotRun`), and agent-freeduet tells the member in its runtime
 *    notes (agent-freeduet/freeduet/person_language.py).
 * 2. The few fixed sentences this server writes to the person in those turns (the brief's reasons
 *    and gaps, the line under a suggestion) come out in Italian: the table at the bottom.
 *
 * ONE LANGUAGE FOR THE DEPLOYMENT, NOT ONE PER PERSON. FreeDuet is self-hosted, usually for one
 * person, and the app has no per-person language yet. A deployment with several people who read
 * different languages needs a per-person setting, which this is not.
 *
 * Unset means today, exactly: no key in `forwardedProps`, every sentence in English.
 */
import { DICTATION_LANGUAGES } from "../dictation/languages";

export const PERSON_LANGUAGE_VARIABLE = "FREEDUET_PERSON_LANGUAGE";
/** The `forwardedProps` key agent-freeduet reads (agent-freeduet/freeduet/agui.py). */
export const PERSON_LANGUAGE_PROP = "openbotPersonLanguage";

export type PersonLanguage = {
  /** The two-letter code the person set. */
  code: string;
  /** Its English name, which the member is told beside the code. */
  name: string;
};

type Environment = Record<string, string | undefined>;

/**
 * The language `FREEDUET_PERSON_LANGUAGE` names, or null when it is unset or blank.
 *
 * The same list of two-letter codes `TRANSCRIPTION_LANGUAGE` is checked against, so the two settings
 * speak the same codes. Anything else is refused with a message that names the setting: a typo
 * ("italian", "it-IT") would otherwise only show as a member that keeps writing English.
 */
export function personLanguageFrom(
  environment: Environment = process.env,
): PersonLanguage | null {
  const value = environment[PERSON_LANGUAGE_VARIABLE]?.trim();
  if (!value) return null;
  if (!DICTATION_LANGUAGES.has(value)) {
    throw new Error(
      `${PERSON_LANGUAGE_VARIABLE} must be a two-letter language code, such as it or en.`,
    );
  }
  return { code: value, name: englishName(value) };
}

function englishName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * `forwarded` as a run sends it, with this deployment's person language in it, or without any.
 *
 * Whatever a caller put under the key is dropped first: the browser's own `forwardedProps` are
 * spread into the run, and the language the member is told is the deployment's setting, not a
 * thing a request can name. Unset and absent leaves the object as it was.
 */
export function withPersonLanguage<T extends Record<string, unknown>>(
  forwarded: T,
  environment: Environment = process.env,
): Omit<T, typeof PERSON_LANGUAGE_PROP> & {
  openbotPersonLanguage?: PersonLanguage;
} {
  const { [PERSON_LANGUAGE_PROP]: _fromCaller, ...own } = forwarded;
  const language = personLanguageFrom(environment);
  return language ? { ...own, [PERSON_LANGUAGE_PROP]: language } : own;
}

/*
 * THE FIXED TEXT THIS SERVER WRITES TO THE PERSON in a turn they did not write, in English and in
 * Italian. English is the default and the only other form there is: a person language that is not
 * `it` still gets English here, and the member's own text in theirs.
 *
 * `{name}` is filled from the values a caller passes. Only what the server itself writes belongs
 * here: the model's sentences follow the member's runtime note, and the app's own labels ("Needs
 * you", "Can wait", "Morning.") are the interface, a separate job (docs/M1_PLAN.md D26).
 */
const TEXT = {
  "brief.unsorted": {
    en: "Could not be sorted, so it is here to be safe.",
    it: "Non è stato possibile classificarla, quindi è qui per sicurezza.",
  },
  "brief.sorting": {
    en: "Sorting",
    it: "Classificazione",
  },
  "brief.capped": {
    en: "Only the newest {shown} of about {matched} messages from this window were sorted. Older ones were not checked.",
    it: "Sono state classificate solo le {shown} email più recenti su circa {matched} di questo periodo. Le più vecchie non sono state controllate.",
  },
  "brief.failures": {
    en: "{failed} of {total} messages could not be sorted ({first}). They are listed under needs you.",
    it: "{failed} email su {total} non si sono potute classificare ({first}). Sono elencate tra quelle che hanno bisogno di te.",
  },
  "triage.bulk": {
    en: "Bulk mail: a newsletter, promotion or digest.",
    it: "Posta di massa: una newsletter, una promozione o un riepilogo.",
  },
  "triage.category": {
    en: "Gmail filed it under Promotions or Social.",
    it: "Gmail l'ha messa tra Promozioni o Social.",
  },
  "triage.auto-reply": {
    en: "An automatic reply, such as an out-of-office.",
    it: "Una risposta automatica, per esempio un messaggio di assenza dall'ufficio.",
  },
  "triage.calendar-response": {
    en: "Someone answered an invitation; nothing to do.",
    it: "Qualcuno ha risposto a un invito; non c'è nulla da fare.",
  },
  "suggestion.from": {
    en: "From {source}",
    it: "Da {source}",
  },
} as const;

export type PersonTextKey = keyof typeof TEXT;

/** One fixed sentence, in Italian for the person language `it` and in English for anything else. */
export function personText(
  key: PersonTextKey,
  language: PersonLanguage | null | undefined,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const form = language?.code === "it" ? TEXT[key].it : TEXT[key].en;
  return form.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}
