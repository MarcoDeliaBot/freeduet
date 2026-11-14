/**
 * The text of the cards the person sees every day, in the language the person reads
 * (docs/M1_PLAN.md D26, amendment of 2026-11-12): the morning brief card, the suggestion card, and the
 * quiet line above a check-in; and, since D38, the card a member's file is drawn as.
 *
 * NOT AN i18N OF THE INTERFACE. The app has about 500 other strings (menus, settings, sheets, tool
 * lines) and none of them is here. Only what those cards draw is, because those are the ones the
 * person opens first and the member's own text under them already follows the language. A real
 * interface translation is a later job, and when it comes this table is the part of it that exists.
 * What is here besides the cards themselves is what belongs to them: the two running lines that
 * announce them (and the pill under the header's orb, which says the same words), the browser
 * notification a check-in raises, and the onboarding demo's own example brief.
 *
 * HOW THE LANGUAGE ARRIVES. The server reads `FREEDUET_PERSON_LANGUAGE` and puts the validated code
 * on `/api/capabilities` (`personLanguage`, server/src/app.ts); `PersonLanguageProvider`
 * (./use-card-text.tsx) hands it to the cards. This file is pure: it knows no React and reads no
 * environment.
 *
 * ONE TABLE PER LANGUAGE, ENGLISH FIRST. A language with no table here, and no language at all, draw
 * today's English exactly: the same strings, and the browser's own locale for dates and times
 * (`undefined`, as before). Italian is the one translation shipped; adding another is one more
 * entry in `TABLES` and one more object of the same shape as `IT`.
 *
 * A KEY CANNOT BE ADDED TO ENGLISH ALONE. `IT` is typed by the shape of `EN`, so a string added only
 * to `EN` stops `tsc` at `IT`, and so does an Italian entry English does not have, and so does a
 * plural written as a plain string or the other way round.
 */

/** A string that changes with a number. `other` is required; the rest are only for languages that need them. */
export type Plural = {
  one: string;
  other: string;
  zero?: string;
  two?: string;
  few?: string;
  many?: string;
};

export type Entries = Record<string, string | Plural>;

/**
 * `T`'s keys and no others, each a string where `T`'s is a string and a `Plural` where `T`'s is one.
 * What every translation is typed as, with English as `T`.
 */
export type SameShape<T extends Entries> = {
  [K in keyof T]: T[K] extends string ? string : Plural;
};

/*
 * `{name}` is filled from the values a card passes. A plural also needs `count`, which picks the form
 * with the language's own rules (`Intl.PluralRules`).
 */
const EN = {
  // The morning brief card (components/duet/morning-brief-card.tsx)
  "brief.region": "Morning brief",
  "brief.nothing":
    "Nothing new needs you, and nothing is on your calendar today.",
  "brief.needsYou": "Needs you",
  "brief.canWaitLabel": "Can wait",
  "brief.today": "Today",
  "brief.couldNotCheck": "Couldn't check",
  "brief.showMore": {
    one: "Show {count} more",
    other: "Show {count} more",
  },
  "brief.showMoreIn": {
    one: "Show {count} more in {section}",
    other: "Show {count} more in {section}",
  },
  // The rows the card is made of (lib/copilot/morning-brief-tool.tsx)
  "brief.greeting.morning": "Morning",
  "brief.greeting.afternoon": "Afternoon",
  "brief.greeting.evening": "Evening",
  "brief.allDay": "All day",
  "brief.canWait": {
    one: "{count} email can wait",
    other: "{count} emails can wait",
  },
  "brief.andMore": {
    one: "{names} and {count} more",
    other: "{names} and {count} more",
  },
  "brief.couldNotMake": "Couldn't make the brief",
  "brief.start": "Start",
  "brief.startNamed": "Start: {title}",
  "brief.started": "Started",
  // What Start sends, as the person's own words in the thread.
  "brief.startRequest": "Take care of {from}'s email: {subject}",
  "brief.startRequestNoSubject": "Take care of {from}'s email.",
  // The suggestion card (components/shell/suggestion-card.tsx, chat-suggestion.tsx, offer-task-tool.tsx)
  "suggestion.heading": "{bot} could take this on",
  "suggestion.headingNoBot": "Ready to start",
  "suggestion.startedLine": "Started. {bot} is on it.",
  "suggestion.from": "From {source}",
  "suggestion.started": "Started",
  "suggestion.hidden": "Hidden",
  "suggestion.hide": "Hide",
  "suggestion.start": "Start",
  // The line above a check-in (components/channels/chat-transcript.tsx)
  "checkIn.line": "Checked your mail and calendar",
  // The browser notification a check-in raises (components/shell/check-in-notifier.ts)
  "checkIn.notification.more": {
    one: "{title}, and {count} more",
    other: "{title}, and {count} more",
  },
  /*
   * The two FreeDuet tools' running and finished lines (person-language/tool-lines.ts). The shared
   * vocabulary in lib/plugins/tool-name.ts holds the same English, and a test pins that the two agree,
   * so the line and the pill under the header's orb (which reads the same vocabulary) cannot drift.
   */
  "tool.morningBrief.running": "Reading your mail and calendar",
  "tool.morningBrief.done": "Read your mail and calendar",
  "tool.offerTask.running": "Adding a task",
  "tool.offerTask.done": "Added a task",
  // The card a member's file is drawn as (freeduet/member-file-card.tsx, docs/M1_PLAN.md D38)
  "file.download": "Download",
  "file.downloading": "Downloading…",
  "file.started": "Download started",
  "file.couldNot": "Couldn't download the file. Try again.",
  "file.running": "Getting the file ready",
  // The onboarding demo's example brief (components/onboarding/capability-demo.tsx)
  "demo.greeting": "Your day, at a glance.",
  "demo.delivery.title": "Confirm the delivery",
  "demo.delivery.why": "Ana needs a yes for Friday.",
  "demo.visit.title": "Studio visit at 2",
  "demo.visit.why": "The samples are ready.",
  "demo.caption.searching": "Searching your email",
  "demo.caption.done": "Here's what needs you today",
  "demo.label.brief":
    "Example: a morning brief arrives with a delivery to confirm and a studio visit today",
  "demo.label.search":
    "Example: the Bot searches your email, then brings you a morning brief",
} satisfies Entries;

export type CardTextId = keyof typeof EN;

/*
 * Italian: natural and short, "tu", the same wording as the server's own Italian sentences
 * (server/src/freeduet/person-language.ts: "hanno bisogno di te", "Da {source}"). First person where
 * the English speaks as the Bot, with "ho" so that it needs no gender ("Non ho potuto controllare").
 */
const IT: SameShape<typeof EN> = {
  "brief.region": "Riepilogo del mattino",
  "brief.nothing":
    "Niente di nuovo ha bisogno di te e oggi non hai nulla in calendario.",
  "brief.needsYou": "Hanno bisogno di te",
  "brief.canWaitLabel": "Possono aspettare",
  "brief.today": "Oggi",
  "brief.couldNotCheck": "Non ho potuto controllare",
  "brief.showMore": {
    one: "Mostra un'altra",
    other: "Mostra altre {count}",
  },
  "brief.showMoreIn": {
    one: "Mostra un'altra in «{section}»",
    other: "Mostra altre {count} in «{section}»",
  },
  "brief.greeting.morning": "Buongiorno",
  "brief.greeting.afternoon": "Buon pomeriggio",
  "brief.greeting.evening": "Buonasera",
  "brief.allDay": "Tutto il giorno",
  "brief.canWait": {
    one: "{count} email può aspettare",
    other: "{count} email possono aspettare",
  },
  "brief.andMore": {
    one: "{names} e un altro",
    other: "{names} e altri {count}",
  },
  "brief.couldNotMake": "Non ho potuto preparare il riepilogo",
  "brief.start": "Avvia",
  "brief.startNamed": "Avvia: {title}",
  "brief.started": "Avviato",
  "brief.startRequest": "Occupati dell'email di {from}: {subject}",
  "brief.startRequestNoSubject": "Occupati dell'email di {from}.",
  "suggestion.heading": "{bot} potrebbe occuparsene",
  "suggestion.headingNoBot": "Pronto da avviare",
  "suggestion.startedLine": "Avviato. {bot} ci sta lavorando.",
  "suggestion.from": "Da {source}",
  "suggestion.started": "Avviato",
  "suggestion.hidden": "Nascosto",
  "suggestion.hide": "Nascondi",
  "suggestion.start": "Avvia",
  "checkIn.line": "Ho controllato posta e calendario",
  "checkIn.notification.more": {
    one: "{title} e un'altra",
    other: "{title} e altre {count}",
  },
  "tool.morningBrief.running": "Leggo posta e calendario",
  "tool.morningBrief.done": "Ho letto posta e calendario",
  "tool.offerTask.running": "Aggiungo un'attività",
  "tool.offerTask.done": "Ho aggiunto un'attività",
  "file.download": "Scarica",
  "file.downloading": "Scarico…",
  "file.started": "Download avviato",
  "file.couldNot": "Non ho potuto scaricare il file. Riprova.",
  "file.running": "Preparo il file",
  "demo.greeting": "La tua giornata, in breve.",
  "demo.delivery.title": "Conferma la consegna",
  "demo.delivery.why": "Ana aspetta un sì per venerdì.",
  "demo.visit.title": "Visita in studio alle 14",
  "demo.visit.why": "I campioni sono pronti.",
  "demo.caption.searching": "Cerco tra le tue email",
  "demo.caption.done": "Ecco cosa ti aspetta oggi",
  "demo.label.brief":
    "Esempio: arriva un riepilogo del mattino con una consegna da confermare e una visita in studio oggi",
  "demo.label.search":
    "Esempio: il Bot cerca tra le tue email, poi ti porta un riepilogo del mattino",
};

/** Every language with a table of its own. English is the table everything else falls back to. */
const TABLES = { en: EN, it: IT } as const;

/** A language that has a table of its own, other than English. */
export type CardLanguage = Exclude<keyof typeof TABLES, "en">;

/**
 * The table language for what the server sent, or null for today's rendering.
 *
 * Null is English with the browser's own locale for dates and times, exactly as before: for no
 * language at all, for `en` (nothing to translate), and for a code with no table (`de`: the members
 * write German, the cards stay English, as D26 says of the server's own sentences). Anything that is
 * not a string is null too, so a server too old to send it, or a malformed answer, changes nothing.
 */
export function cardLanguageOf(code: unknown): CardLanguage | null {
  if (typeof code !== "string") return null;
  const language = code.trim().toLowerCase();
  return language !== "en" && Object.hasOwn(TABLES, language)
    ? (language as CardLanguage)
    : null;
}

export type CardParams = Readonly<Record<string, string | number>>;

const pluralRules = new Map<string, Intl.PluralRules>();

function pluralFormOf(language: CardLanguage | null, count: number): string {
  const key = language ?? "en";
  let rules = pluralRules.get(key);
  if (!rules) {
    rules = new Intl.PluralRules(key);
    pluralRules.set(key, rules);
  }
  return rules.select(count);
}

/**
 * One piece of card text, in `language` (English for null).
 *
 * A plural entry takes its form from `params.count` by the language's own plural rules: Italian "1
 * email può aspettare", "3 email possono aspettare", and "0 email possono aspettare" (zero is
 * `other` in both languages). A category the entry does not spell out falls back to `other`.
 * Placeholders are filled in one pass over the template, so a value that happens to contain
 * `{count}` (a sender's name, a subject) is never expanded.
 */
export function cardText(
  id: CardTextId,
  params: CardParams = {},
  language: CardLanguage | null = null,
): string {
  const entry: string | Plural = TABLES[language ?? "en"][id];
  let template: string;
  if (typeof entry === "string") {
    template = entry;
  } else {
    const count = Number(params.count);
    const form = Number.isFinite(count)
      ? pluralFormOf(language, count)
      : "other";
    template = entry[form as keyof Plural] ?? entry.other;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

/**
 * The same, bound to a language: what a card holds on to. `CardText` is what `useCardText` returns.
 */
export type CardText = (id: CardTextId, params?: CardParams) => string;

export function cardTextIn(language: CardLanguage | null): CardText {
  return (id, params) => cardText(id, params, language);
}

/*
 * Dates and times. With no table language the locale is `undefined`, the browser's own, which is
 * what these cards always used; with one, that language's, so "giovedì 22 ottobre" and "15:00" and
 * not the browser's English "Thursday, October 22" and "3:00 PM" beside Italian words.
 */

/** "Thursday, October 22", or "giovedì 22 ottobre". */
export function cardDate(at: Date, language: CardLanguage | null): string {
  return at.toLocaleDateString(language ?? undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "3:00 PM", or "15:00". */
export function cardTime(at: Date, language: CardLanguage | null): string {
  return at.toLocaleTimeString(language ?? undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The brief's greeting for the hour: "Morning, Maya." / "Buongiorno, Maya.", or without a name. */
export function cardGreeting(
  at: Date,
  name: string | null,
  language: CardLanguage | null,
): string {
  const hour = at.getHours();
  const part = cardText(
    hour < 12
      ? "brief.greeting.morning"
      : hour < 18
        ? "brief.greeting.afternoon"
        : "brief.greeting.evening",
    {},
    language,
  );
  return name ? `${part}, ${name}.` : `${part}.`;
}

/** Every id and its form in each table, for the tests that read the tables themselves. */
export const CARD_TABLES: Readonly<
  Record<keyof typeof TABLES, Readonly<Record<CardTextId, string | Plural>>>
> = TABLES;
