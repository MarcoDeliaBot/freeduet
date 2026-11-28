/**
 * The Engines page's sentences (docs/ENGINES_PLAN.md section 9.1, slice 6). Pure: no React, no request, so the
 * wording and the times are tested on their own.
 *
 * The server sends a state and a time in UTC (server/src/freeduet/engines-routes.ts). This module says it in
 * English, and formats the time in the person's own time zone, which is the browser's: the server does not
 * know it. Keep the state names in step with the server.
 */

import type { ProviderView } from "./engines-providers-text";
import type { MessageId } from "./i18n/catalogs";
import { englishT, type T } from "./i18n/provider";

export type EngineState =
  | "ready"
  | "degraded"
  | "limited"
  | "out_of_credit"
  | "not_answering"
  | "checking"
  | "signed_out"
  | "refused"
  | "unknown";

/** The kinds the server names. `other` is any kind it does not know. */
export type EngineKind =
  | "cli"
  | "app-server"
  | "acp"
  | "anthropic-api"
  | "openai-compatible"
  | "anthropic-compatible"
  | "other";

export type EngineReason = "off" | "not_set_up" | "unreachable";

export type EngineSummary = {
  id: string;
  name: string;
  kind: EngineKind;
  state: EngineState;
  /** ISO 8601 in UTC; set only for the states that wait for a time. */
  until: string | null;
  /** Set only for a refused engine: the cleaned sentence that says why it is not run. */
  refusal: string | null;
  /** D116: set only when the engine's last turn ended with a tool call written as text instead of used. */
  note?: "tools_as_text";
};

/** What happens when an engine runs out (docs/design/engines-dashboard.md). */
export type EngineMode = "automatic" | "ask-first";

/** Why an engine in a member's list will not run: the server's words, `other` for any it does not know. */
export type LeftOutWhy =
  | "locked"
  | "disabled"
  | "paid_gateway"
  | "metered_off"
  | "cap_zero"
  | "not_set_up"
  | "other";

/** Why the page may not change anything, in one word (server/src/freeduet/engines-routes.ts, `ChangeBlock`). */
export type ChangeBlock =
  | "not_at_the_computer"
  | "not_paired_with_the_computer"
  | "agent_too_old"
  | "choices_unreadable";

/** D139: the words the server accepts, the same closed lists as the server's `CLAUDE_MODELS` and `CLAUDE_EFFORTS`. */
export type ClaudeModel = "haiku" | "sonnet" | "opus";
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type ClaudeChoice = {
  model: ClaudeModel | null;
  effort: ClaudeEffort | null;
};

/** One team member as the server describes it: the engines it will try, in order, and its mode. */
export type MemberSummary = {
  id: string;
  /** Engine ids, in the order they will be tried. */
  chain: string[];
  leftOut: { id: string; why: LeftOutWhy }[];
  /** The mode that applies: the person's choice when there is one, else the file's. */
  mode: EngineMode;
  /** The installation's file's own mode. */
  fileMode: EngineMode;
  /** Whether `mode` is the person's own choice. */
  chosen: boolean;
  pin: string | null;
  /** D115: the person ordered this member's engines by hand, so logins are not necessarily first. */
  ownOrder: boolean;
  /** D115: the same engines with logins first, which "Use the recommended order" sends back. */
  recommendedChain: string[];
  /** D139: the Claude model and effort chosen for this member (Claude Code only); null is the subscription's default. */
  claude?: ClaudeChoice;
};

/**
 * What `GET /api/freeduet/engines` answers. The members and what follows them are present only when the server keeps the
 * person's choices (slice 7); a server that does not leaves them out, and the page is the read-only one of slice 6.
 */
export type EnginesReading = {
  /** The provider cards (D109); absent when the service behind the server does not have them. */
  providers?: ProviderView[];
  providersLocked?: "file_is_yours" | null;
  reason: EngineReason | null;
  engines: EngineSummary[];
  members?: MemberSummary[];
  choices?: { state: "ok" | "unreadable" };
  canChange?: boolean;
  cannotChange?: ChangeBlock | null;
};

/**
 * The locale a time or a date is written in. English keeps the 24-hour "Sun 15 Nov" style this page has always used
 * (`en-GB`); every other language writes in its own.
 */
export function timeLocale(language: string): string {
  return language === "en" ? "en-GB" : language;
}

/** The clock on the person's own device, 24 hours, as the rest of the admin screens write times. */
function clock(moment: Date, timeZone?: string, language = "en"): string {
  return new Intl.DateTimeFormat(timeLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(moment);
}

function calendarDay(moment: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(moment);
}

/**
 * A time the person can read: "17:00" when it is today, "Sun 15 Nov, 09:00" when it is another day. Null when the
 * text is not a time. `now` and `timeZone` are given by tests; the page passes neither, so the browser's own zone
 * and clock are used. `language` is the app language (English when none): the zone stays the person's own.
 */
export function untilText(
  until: string,
  now: Date = new Date(),
  timeZone?: string,
  language = "en",
): string | null {
  const moment = new Date(until);
  if (Number.isNaN(moment.getTime())) return null;
  if (calendarDay(moment, timeZone) === calendarDay(now, timeZone)) {
    return clock(moment, timeZone, language);
  }
  let locale = timeLocale(language);
  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    locale = "en-GB";
  }
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(moment);
  return `${day}, ${clock(moment, timeZone, language)}`;
}

/**
 * One engine's state, in one plain sentence. The kind is read only for a signed-out engine, and the refusal only for an
 * engine that is not run; every other state reads the same whatever they hold. `t` and `language` are the app's
 * (English when not given).
 */
export function engineStateText(
  engine: Pick<EngineSummary, "state" | "until"> &
    Partial<Pick<EngineSummary, "kind" | "refusal" | "note">>,
  now: Date = new Date(),
  timeZone?: string,
  t: T = englishT,
  language = "en",
): string {
  const said = engineStateBase(engine, now, timeZone, t, language);
  return engine.note === "tools_as_text"
    ? `${said}. ${t("engines.state.toolsAsText")}`
    : said;
}

/** D116: what the page adds to an engine whose last answer was a tool call written as text. */
export const TOOLS_AS_TEXT_NOTE = englishT("engines.state.toolsAsText");

function engineStateBase(
  engine: Pick<EngineSummary, "state" | "until"> &
    Partial<Pick<EngineSummary, "kind" | "refusal">>,
  now: Date,
  timeZone: string | undefined,
  t: T,
  language: string,
): string {
  const at = engine.until
    ? untilText(engine.until, now, timeZone, language)
    : null;
  switch (engine.state) {
    case "ready":
      return t("engines.state.ready");
    case "degraded":
      return t("engines.state.degraded");
    case "limited":
      return at
        ? t("engines.state.limitedAt", { at })
        : t("engines.state.limited");
    case "out_of_credit":
      return at
        ? t("engines.state.outOfCreditAt", { at })
        : t("engines.state.outOfCredit");
    case "not_answering":
      return at
        ? t("engines.state.notAnsweringAt", { at })
        : t("engines.state.notAnswering");
    case "checking":
      return t("engines.state.checking");
    case "signed_out":
      // A gateway has a key, not a login: its remedy is the key.
      return engine.kind === "anthropic-compatible"
        ? t("engines.state.gatewayKey")
        : t("engines.state.signedOut");
    case "refused":
      // The reason is the server's own sentence and stays as it was sent.
      return engine.refusal
        ? t("engines.state.refusedWhy", { reason: engine.refusal })
        : t("engines.state.refused");
    default:
      return t("engines.state.unknown");
  }
}

/** Why the page lists nothing, in one sentence. */
export function engineReasonText(
  reason: EngineReason,
  t: T = englishT,
): string {
  switch (reason) {
    case "off":
      return t("engines.reason.off");
    case "not_set_up":
      return t("engines.reason.not_set_up");
    case "unreachable":
      return t("engines.reason.unreachable");
  }
}

/** The page's title, and the one sentence under it (the approved direction, 14 November 2026). The English forms; the page reads the catalogue. */
export const ENGINES_TITLE = englishT("dash.engines");
export const ENGINES_INTRO = englishT("engines.intro");

/** Said when the list cannot be read at all; the page is not reloaded for the person. */
export const LOAD_FAILED = englishT("engines.loadFailed");
/** The message the request helper uses when the server gives no sentence of its own. */
export const ENGINES_FALLBACK = englishT("engines.fallback");
/** Said when the server answers with a list that holds no engine. */
export const NO_ENGINES = englishT("engines.noEngines");
/** The name of the section that holds the engine cards, for screen readers. */
export const ENGINE_STATES_TITLE = englishT("engines.statesTitle");

/** The tones a state's word can be drawn in. Each one is a duet status pair that clears 4.5:1 in both themes. */
export type EnginePillTone = "green" | "red" | "blue" | "amber" | "neutral";

/** The catalogue id of each state's word. */
const PILL_IDS: Record<EngineState, MessageId> = {
  ready: "engines.pill.working",
  degraded: "engines.pill.working",
  checking: "engines.pill.checking",
  limited: "engines.pill.limited",
  out_of_credit: "engines.pill.outOfCredit",
  not_answering: "engines.pill.notAnswering",
  signed_out: "engines.pill.signedOut",
  refused: "engines.pill.locked",
  unknown: "engines.pill.unknown",
};

const PILL_TONES: Record<EngineState, EnginePillTone> = {
  ready: "green",
  degraded: "green",
  checking: "blue",
  limited: "neutral",
  out_of_credit: "amber",
  not_answering: "red",
  signed_out: "amber",
  refused: "amber",
  unknown: "neutral",
};

/**
 * The word on an engine's card for each state the server names, in English. Each word is the state in plain English: no state is
 * added here. The server has nine states and every one has a word. "Off" and "Not built yet" have no state behind them,
 * so the page does not show them.
 */
export const ENGINE_PILLS = Object.fromEntries(
  (Object.keys(PILL_IDS) as EngineState[]).map((state) => [
    state,
    { label: englishT(PILL_IDS[state]), tone: PILL_TONES[state] },
  ]),
) as Record<EngineState, { label: string; tone: EnginePillTone }>;

/** The word and tone for a state. A state this page was not written for reads as "Not known", never as a guess. */
export function enginePill(
  state: string,
  t: T = englishT,
): {
  label: string;
  tone: EnginePillTone;
} {
  const known: EngineState = Object.hasOwn(PILL_IDS, state)
    ? (state as EngineState)
    : "unknown";
  return { label: t(PILL_IDS[known]), tone: PILL_TONES[known] };
}

/** The Keys panel: words only. The place to add a key is not built (design doc slice 7d), so it has no field. */
export const KEYS_TITLE = englishT("engines.keys.title");
export const KEYS_TEXT = englishT("engines.keys.text");
export const KEYS_NOT_BUILT = englishT("engines.keys.notBuilt");

/**
 * The Spending panel. The server sends no spending figure yet, so the page shows no amount. It says what it cannot show,
 * because a member's metered engine joins its order when the installation's file enables it.
 */
export const SPENDING_TITLE = englishT("engines.spending.title");
export const SPENDING_TEXT = englishT("engines.spending.text");

/** The aside beside the engines, for screen readers. */
export const ASIDE_LABEL = englishT("engines.asideLabel");

/** The members section: its title, what it says, and the three column headings of its table (English; the page reads the catalogue). */
export const MEMBERS_TITLE = englishT("engines.members.title");
export const MEMBERS_DESCRIPTION = englishT("engines.members.description");
/** D112: the order by hand. One sentence above the table, and the words a screen reader reads for each arrow. */
export const ORDER_NOTE = englishT("engines.order.note");
/** D115: the two ways an order can leave the group order (logins, then free, then paid), as the server names them. */
export type OrderBreakKind = "free_before_login" | "paid_before_free_or_login";
export const ORDER_BREAK_KINDS: readonly OrderBreakKind[] = [
  "free_before_login",
  "paid_before_free_or_login",
];
const WARNING_TITLE_IDS: Record<OrderBreakKind, MessageId> = {
  free_before_login: "engines.order.warnTitle.free_before_login",
  paid_before_free_or_login:
    "engines.order.warnTitle.paid_before_free_or_login",
};
const WARNING_TEXT_IDS: Record<OrderBreakKind, MessageId> = {
  free_before_login: "engines.order.warnText.free_before_login",
  paid_before_free_or_login: "engines.order.warnText.paid_before_free_or_login",
};
export const ORDER_WARNING_TITLE: Record<OrderBreakKind, string> = {
  free_before_login: englishT(WARNING_TITLE_IDS.free_before_login),
  paid_before_free_or_login: englishT(
    WARNING_TITLE_IDS.paid_before_free_or_login,
  ),
};
export const ORDER_WARNING_TEXT: Record<OrderBreakKind, string> = {
  free_before_login: englishT(WARNING_TEXT_IDS.free_before_login),
  paid_before_free_or_login: englishT(
    WARNING_TEXT_IDS.paid_before_free_or_login,
  ),
};
/** The warning's title and text for a kind of break, in the app's language. */
export const orderWarningTitle = (
  kind: OrderBreakKind,
  t: T = englishT,
): string => t(WARNING_TITLE_IDS[kind]);
export const orderWarningText = (
  kind: OrderBreakKind,
  t: T = englishT,
): string => t(WARNING_TEXT_IDS[kind]);
export const ORDER_NEW_LABEL = englishT("engines.order.newLabel");
export const ORDER_TICK = englishT("engines.order.tick");
export const ORDER_CONFIRM = englishT("engines.order.confirm");
export const ORDER_CANCEL = englishT("settings.cancel");
export const orderTickLabel = (name: string, t: T = englishT): string =>
  t("engines.order.tickLabel", { name });
export const orderConfirmLabel = (name: string, t: T = englishT): string =>
  t("engines.order.confirmLabel", { name });
export const orderCancelLabel = (name: string, t: T = englishT): string =>
  t("engines.order.cancelLabel", { name });
export const orderWarningGroupLabel = (name: string, t: T = englishT): string =>
  t("engines.order.confirmLabel", { name });
export const OWN_ORDER_NOTE = englishT("engines.order.own");
export const RECOMMENDED_ORDER_BUTTON = englishT("engines.order.recommended");
export const recommendedOrderLabel = (name: string, t: T = englishT): string =>
  t("engines.order.recommendedLabel", { name });
export const moveUpLabel = (
  engine: string,
  name: string,
  t: T = englishT,
): string => t("engines.order.moveUp", { engine, name });
export const moveDownLabel = (
  engine: string,
  name: string,
  t: T = englishT,
): string => t("engines.order.moveDown", { engine, name });
/** D139: the id of the subscription Claude Code engine in a member's chain; the model and effort choices show beside it only. */
export const CLAUDE_ENGINE_ID = "claude-code";
export const CLAUDE_DEFAULT_OPTION = englishT("engines.claude.default");
/** The model names are product names and stay as they are. */
export const CLAUDE_MODEL_OPTIONS: { value: ClaudeModel; label: string }[] = [
  { value: "haiku", label: "Haiku" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
];
const EFFORT_IDS: Record<ClaudeEffort, MessageId> = {
  low: "engines.claude.effort.low",
  medium: "engines.claude.effort.medium",
  high: "engines.claude.effort.high",
  xhigh: "engines.claude.effort.xhigh",
  max: "engines.claude.effort.max",
};
export const CLAUDE_EFFORT_OPTIONS: { value: ClaudeEffort; label: string }[] = (
  ["low", "medium", "high", "xhigh", "max"] as const
).map((value) => ({ value, label: englishT(EFFORT_IDS[value]) }));
/** The effort choices with their words in the app's language; the values sent to the server are the same. */
export const claudeEffortOptions = (
  t: T = englishT,
): { value: ClaudeEffort; label: string }[] =>
  CLAUDE_EFFORT_OPTIONS.map(({ value }) => ({
    value,
    label: t(EFFORT_IDS[value]),
  }));
export const CLAUDE_MODEL_LABEL = englishT("admin.credentials.model");
export const CLAUDE_EFFORT_LABEL = englishT("engines.claude.effortLabel");
export const CLAUDE_CHOICE_NOTE = englishT("engines.claude.note");
export const claudeModelLabel = (name: string, t: T = englishT): string =>
  t("engines.claude.modelAria", { name });
export const claudeEffortLabel = (name: string, t: T = englishT): string =>
  t("engines.claude.effortAria", { name });
export const CLAUDE_SAVED_TEXT = englishT("engines.claude.saved");

export const MEMBER_COLUMNS = {
  member: englishT("engines.members.col.member"),
  order: englishT("engines.members.col.order"),
  switching: englishT("engines.members.col.switching"),
} as const;

/** The name of the two-answer group in a member's row, and of each answer's control (the words a screen reader reads). */
export const modeGroupLabel = (name: string, t: T = englishT): string =>
  t("engines.mode.groupLabel", { name });
export const modeControlLabel = (
  label: string,
  name: string,
  t: T = englishT,
): string => t("engines.mode.controlLabel", { label, name });
export const undoLabel = (name: string, t: T = englishT): string =>
  t("engines.mode.undoLabel", { name });
export const UNDO_BUTTON = englishT("settings.undo");

const MODE_IDS: Record<EngineMode, { label: MessageId; effect: MessageId }> = {
  automatic: {
    label: "engines.mode.automatic.label",
    effect: "engines.mode.automatic.effect",
  },
  "ask-first": {
    label: "engines.mode.askFirst.label",
    effect: "engines.mode.askFirst.effect",
  },
};

/** The two modes in the app's language, each with the words the router itself uses to the person when an engine runs out (engine_notices.py). The `mode` values are what the server sends and are never translated. */
export function engineModes(t: T = englishT): readonly {
  mode: EngineMode;
  label: string;
  effect: string;
}[] {
  return (["automatic", "ask-first"] as const).map((mode) => ({
    mode,
    label: t(MODE_IDS[mode].label),
    effect: t(MODE_IDS[mode].effect),
  }));
}

/** The two modes in English. */
export const ENGINE_MODES = engineModes(englishT);

/** The mode as a short label, for the sentence that says what the installation's file has. */
export function modeLabel(mode: EngineMode, t: T = englishT): string {
  const ids = MODE_IDS[mode];
  return ids ? t(ids.label) : mode;
}

/** Why a member's engine will not run, in a few words that follow "not used:". */
const LEFT_OUT_IDS: Record<LeftOutWhy, MessageId> = {
  locked: "engines.leftOut.locked",
  disabled: "engines.leftOut.disabled",
  paid_gateway: "engines.leftOut.paid_gateway",
  metered_off: "engines.leftOut.metered_off",
  cap_zero: "engines.leftOut.cap_zero",
  not_set_up: "engines.leftOut.not_set_up",
  other: "engines.leftOut.other",
};

/** The engines a member will try, in order, as one sentence. `nameOf` turns an engine id into its name. */
export function chainText(
  chain: readonly string[],
  nameOf: (id: string) => string,
  t: T = englishT,
): string {
  const names = chain.map(nameOf);
  if (names.length === 0) return t("engines.chain.none");
  if (names.length === 1)
    return t("engines.chain.one", { engine: names[0] as string });
  return t("engines.chain.many", { list: names.join(t("engines.chain.then")) });
}

/** One engine in a member's list that will not run, with the reason. */
export function leftOutText(
  entry: { id: string; why: LeftOutWhy },
  nameOf: (id: string) => string,
  t: T = englishT,
): string {
  return t("engines.leftOut.line", {
    engine: nameOf(entry.id),
    why: t(LEFT_OUT_IDS[entry.why] ?? LEFT_OUT_IDS.other),
  });
}

/** What a pin means, when the installation's file pins a member to one engine. */
export function pinText(
  pin: string,
  nameOf: (id: string) => string,
  t: T = englishT,
): string {
  return t("engines.pin", { engine: nameOf(pin) });
}

/** The line for a member with one engine only: a choice made now is kept for when there are more. Null otherwise. */
export function aloneText(
  chain: readonly string[],
  nameOf: (id: string) => string,
  t: T = englishT,
): string | null {
  const [only] = chain;
  if (chain.length !== 1 || only === undefined) return null;
  return t("engines.alone", { engine: nameOf(only) });
}

/** Whose value the member's mode is. */
export function sourceText(
  member: Pick<MemberSummary, "chosen" | "fileMode">,
  t: T = englishT,
): string {
  return member.chosen
    ? t("engines.source.yours", {
        mode: modeLabel(member.fileMode, t).toLowerCase(),
      })
    : t("engines.source.file");
}

/** Why the controls are not usable, in one sentence. The unreadable choices have a banner of their own. */
export function blockText(block: ChangeBlock, t: T = englishT): string {
  switch (block) {
    case "not_at_the_computer":
      return t("engines.block.not_at_the_computer");
    case "not_paired_with_the_computer":
      return t("engines.block.not_paired_with_the_computer");
    case "agent_too_old":
      return t("engines.block.agent_too_old");
    case "choices_unreadable":
      return t("engines.block.choices_unreadable");
  }
}

/** The banner for stored choices that cannot be read: the installation's settings are in use. */
export const CHOICES_UNREADABLE = englishT("engines.block.choices_unreadable");

/** What is said right after a change, and after an Undo. */
export const SAVED_TEXT = englishT("engines.saved");
export const UNDONE_TEXT = englishT("engines.undone");
