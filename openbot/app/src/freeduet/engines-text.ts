/**
 * The Engines page's sentences (docs/ENGINES_PLAN.md section 9.1, slice 6). Pure: no React, no request, so the
 * wording and the times are tested on their own.
 *
 * The server sends a state and a time in UTC (server/src/freeduet/engines-routes.ts). This module says it in
 * English, and formats the time in the person's own time zone, which is the browser's: the server does not
 * know it. Keep the state names in step with the server.
 */

import type { ProviderView } from "./engines-providers-text";

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

/** The clock on the person's own device, 24 hours, as the rest of the admin screens write times. */
function clock(moment: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
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
 * and clock are used.
 */
export function untilText(
  until: string,
  now: Date = new Date(),
  timeZone?: string,
): string | null {
  const moment = new Date(until);
  if (Number.isNaN(moment.getTime())) return null;
  if (calendarDay(moment, timeZone) === calendarDay(now, timeZone)) {
    return clock(moment, timeZone);
  }
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(moment);
  return `${day}, ${clock(moment, timeZone)}`;
}

/**
 * One engine's state, in one plain sentence. The kind is read only for a signed-out engine, and the refusal only for an
 * engine that is not run; every other state reads the same whatever they hold.
 */
export function engineStateText(
  engine: Pick<EngineSummary, "state" | "until"> &
    Partial<Pick<EngineSummary, "kind" | "refusal">>,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const at = engine.until ? untilText(engine.until, now, timeZone) : null;
  switch (engine.state) {
    case "ready":
      return "Ready";
    case "degraded":
      return "Ready, but it has had recent errors";
    case "limited":
      return at ? `Reached its limit until ${at}` : "Reached its limit for now";
    case "out_of_credit":
      return at ? `Out of credit, trying again at ${at}` : "Out of credit";
    case "not_answering":
      return at
        ? `Not answering, trying again at ${at}`
        : "Not answering for now";
    case "checking":
      return "Checking whether it answers again";
    case "signed_out":
      // A gateway has a key, not a login: its remedy is the key.
      return engine.kind === "anthropic-compatible"
        ? "Its gateway did not accept the key. Check the key you gave it."
        : "Signed out: sign in again with the engine's own login";
    case "refused":
      return engine.refusal
        ? `Not run: ${engine.refusal}`
        : "Not run: the reason is not known.";
    default:
      return "State not known";
  }
}

/** Why the page lists nothing, in one sentence. */
export function engineReasonText(reason: EngineReason): string {
  switch (reason) {
    case "off":
      return "The engines are switched off on this installation (FREEDUET_ROUTER=off), so there is nothing to show.";
    case "not_set_up":
      return "No FreeDuet agent is set up on this installation, so there are no engines to show.";
    case "unreachable":
      return "The FreeDuet agent did not answer, so the engines cannot be read right now. This page asks again every 30 seconds.";
  }
}

/** The page's title, and the one sentence under it (the approved direction, 14 November 2026). */
export const ENGINES_TITLE = "Engines";
export const ENGINES_INTRO =
  "The engine is what does the thinking for each member. Your own sign-ins always answer first; anything paid stays off until you say so.";

/** Said when the list cannot be read at all; the page is not reloaded for the person. */
export const LOAD_FAILED = "Couldn't load the engines. Reload the page.";
/** The message the request helper uses when the server gives no sentence of its own. */
export const ENGINES_FALLBACK = "The engines could not be listed.";
/** Said when the server answers with a list that holds no engine. */
export const NO_ENGINES = "No engines are reported yet.";
/** The name of the section that holds the engine cards, for screen readers. */
export const ENGINE_STATES_TITLE = "Engines and their state";

/** The tones a state's word can be drawn in. Each one is a duet status pair that clears 4.5:1 in both themes. */
export type EnginePillTone = "green" | "red" | "blue" | "amber" | "neutral";

/**
 * The word on an engine's card for each state the server names. Each word is the state in plain English: no state is
 * added here. The server has nine states and every one has a word. "Off" and "Not built yet" have no state behind them,
 * so the page does not show them.
 */
export const ENGINE_PILLS: Record<
  EngineState,
  { label: string; tone: EnginePillTone }
> = {
  ready: { label: "Working", tone: "green" },
  degraded: { label: "Working", tone: "green" },
  checking: { label: "Checking", tone: "blue" },
  limited: { label: "Limited", tone: "neutral" },
  out_of_credit: { label: "Out of credit", tone: "amber" },
  not_answering: { label: "Not answering", tone: "red" },
  signed_out: { label: "Signed out", tone: "amber" },
  refused: { label: "Locked", tone: "amber" },
  unknown: { label: "Not known", tone: "neutral" },
};

/** The word and tone for a state. A state this page was not written for reads as "Not known", never as a guess. */
export function enginePill(state: string): {
  label: string;
  tone: EnginePillTone;
} {
  return Object.hasOwn(ENGINE_PILLS, state)
    ? ENGINE_PILLS[state as EngineState]
    : ENGINE_PILLS.unknown;
}

/** The Keys panel: words only. The place to add a key is not built (design doc slice 7d), so it has no field. */
export const KEYS_TITLE = "Keys";
export const KEYS_TEXT =
  "Only keys for gateways will be kept here. Your Claude and ChatGPT sign-ins are never stored by FreeDuet.";
export const KEYS_NOT_BUILT =
  "A key is added on its engine's card. It is kept on this installation and never shown again.";

/**
 * The Spending panel. The server sends no spending figure yet, so the page shows no amount. It says what it cannot show,
 * because a member's metered engine joins its order when the installation's file enables it.
 */
export const SPENDING_TITLE = "Spending";
export const SPENDING_TEXT =
  "Spending is not shown on this page yet. A paid engine runs only if this installation allows it.";

/** The aside beside the engines, for screen readers. */
export const ASIDE_LABEL = "Keys and spending";

/** The members section: its title, what it says, and the three column headings of its table. */
export const MEMBERS_TITLE = "Who uses what";
export const MEMBERS_DESCRIPTION =
  "The engines each member tries, in the order it tries them, and what happens when one runs out. A change applies from the member's next message, and you can undo it.";
/** D112: the order by hand. One sentence above the table, and the words a screen reader reads for each arrow. */
export const ORDER_NOTE =
  "Use the arrows to move an engine one place. Your own logins come first unless you choose otherwise: if a move puts a free or a paid engine before them, you are asked to confirm it first.";
/** D115: the two ways an order can leave the group order (logins, then free, then paid), as the server names them. */
export type OrderBreakKind = "free_before_login" | "paid_before_free_or_login";
export const ORDER_BREAK_KINDS: readonly OrderBreakKind[] = [
  "free_before_login",
  "paid_before_free_or_login",
];
export const ORDER_WARNING_TITLE: Record<OrderBreakKind, string> = {
  free_before_login: "A free engine would answer before your own login",
  paid_before_free_or_login: "A paid engine would answer first",
};
export const ORDER_WARNING_TEXT: Record<OrderBreakKind, string> = {
  free_before_login:
    "If it is a cloud service, this member's messages go to that provider first and it may keep them. Its answers may also be of lower quality than your login's.",
  paid_before_free_or_login:
    "Every message may cost money from the first one. A paid engine runs only if you have switched paid engines on, and it then answers before your logins and the free engines.",
};
export const ORDER_NEW_LABEL = "New order:";
export const ORDER_TICK = "I understand, use this order";
export const ORDER_CONFIRM = "Confirm";
export const ORDER_CANCEL = "Cancel";
export const orderTickLabel = (name: string): string =>
  `I understand, use this order for ${name}`;
export const orderConfirmLabel = (name: string): string =>
  `Confirm the new order for ${name}`;
export const orderCancelLabel = (name: string): string =>
  `Cancel the new order for ${name}`;
export const orderWarningGroupLabel = (name: string): string =>
  `Confirm the new order for ${name}`;
export const OWN_ORDER_NOTE = "Your order: logins are not first";
export const RECOMMENDED_ORDER_BUTTON = "Use the recommended order";
export const recommendedOrderLabel = (name: string): string =>
  `Use the recommended order for ${name}`;
export const moveUpLabel = (engine: string, name: string): string =>
  `Move ${engine} up for ${name}`;
export const moveDownLabel = (engine: string, name: string): string =>
  `Move ${engine} down for ${name}`;
export const MEMBER_COLUMNS = {
  member: "Member",
  order: "Order of engines",
  switching: "When an engine runs out",
} as const;

/** The name of the two-answer group in a member's row, and of each answer's control (the words a screen reader reads). */
export const modeGroupLabel = (name: string): string =>
  `When an engine runs out, for ${name}`;
export const modeControlLabel = (label: string, name: string): string =>
  `${label} for ${name}`;
export const undoLabel = (name: string): string =>
  `Undo the change for ${name}`;
export const UNDO_BUTTON = "Undo";

/** The two modes, each with the words the router itself uses to the person when an engine runs out (engine_notices.py). */
export const ENGINE_MODES: readonly {
  mode: EngineMode;
  label: string;
  effect: string;
}[] = [
  {
    mode: "automatic",
    label: "Switch automatically",
    effect:
      "When an engine runs out, the next one answers and you are told which.",
  },
  {
    mode: "ask-first",
    label: "Ask me first",
    effect:
      "When an engine runs out, you are asked: switch, wait, or name another engine.",
  },
];

/** The mode as a short label, for the sentence that says what the installation's file has. */
export function modeLabel(mode: EngineMode): string {
  return ENGINE_MODES.find((entry) => entry.mode === mode)?.label ?? mode;
}

/** Why a member's engine will not run, in a few words that follow "not used:". */
const LEFT_OUT_WORDS: Record<LeftOutWhy, string> = {
  locked: "the installation's file does not allow it",
  disabled: "it is switched off",
  paid_gateway: "it is a paid gateway, which FreeDuet does not run yet",
  metered_off: "paid engines are switched off",
  cap_zero: "its spending cap is zero",
  not_set_up: "it is not set up on this installation",
  other: "it will not run",
};

/** The engines a member will try, in order, as one sentence. `nameOf` turns an engine id into its name. */
export function chainText(
  chain: readonly string[],
  nameOf: (id: string) => string,
): string {
  const names = chain.map(nameOf);
  if (names.length === 0) return "No engine can answer for this member now.";
  if (names.length === 1) return `Tries only ${names[0]}.`;
  return `Tries ${names.join(", then ")}.`;
}

/** One engine in a member's list that will not run, with the reason. */
export function leftOutText(
  entry: { id: string; why: LeftOutWhy },
  nameOf: (id: string) => string,
): string {
  return `Not used: ${nameOf(entry.id)}, because ${LEFT_OUT_WORDS[entry.why] ?? LEFT_OUT_WORDS.other}.`;
}

/** What a pin means, when the installation's file pins a member to one engine. */
export function pinText(pin: string, nameOf: (id: string) => string): string {
  return `Pinned to ${nameOf(pin)} by the installation's file: it never switches to another engine.`;
}

/** The line for a member with one engine only: a choice made now is kept for when there are more. Null otherwise. */
export function aloneText(
  chain: readonly string[],
  nameOf: (id: string) => string,
): string | null {
  const [only] = chain;
  if (chain.length !== 1 || only === undefined) return null;
  return `Only ${nameOf(only)} is set up for this member, so there is nothing to switch to yet. Your choice is kept for when there is.`;
}

/** Whose value the member's mode is. */
export function sourceText(
  member: Pick<MemberSummary, "chosen" | "fileMode">,
): string {
  return member.chosen
    ? `Your choice. The installation's file says: ${modeLabel(member.fileMode).toLowerCase()}.`
    : "From the installation's file.";
}

/** Why the controls are not usable, in one sentence. The unreadable choices have a banner of their own. */
export function blockText(block: ChangeBlock): string {
  switch (block) {
    case "not_at_the_computer":
      return "Change these on the computer FreeDuet runs on.";
    case "not_paired_with_the_computer":
      return "Pair this browser with the computer FreeDuet runs on first: run `bash scripts/open.sh` there and open the link here.";
    case "agent_too_old":
      return "Update FreeDuet to change this.";
    case "choices_unreadable":
      return CHOICES_UNREADABLE;
  }
}

/** The banner for stored choices that cannot be read: the installation's settings are in use. */
export const CHOICES_UNREADABLE =
  "Your choices could not be read, so the installation's settings are in use. Nothing you chose is lost.";

/** What is said right after a change, and after an Undo. */
export const SAVED_TEXT = "Saved. It applies from the member's next message.";
export const UNDONE_TEXT =
  "Undone. The previous setting applies from the member's next message.";
