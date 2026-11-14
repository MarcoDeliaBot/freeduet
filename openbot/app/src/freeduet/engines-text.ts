/**
 * The Engines page's sentences (docs/ENGINES_PLAN.md section 9.1, slice 6). Pure: no React, no request, so the
 * wording and the times are tested on their own.
 *
 * The server sends a state and a time in UTC (server/src/freeduet/engines-routes.ts). This module says it in
 * English, and formats the time in the person's own time zone, which is the browser's: the server does not
 * know it. Keep the state names in step with the server.
 */

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
};

/**
 * What `GET /api/freeduet/engines` answers. The members and what follows them are present only when the server keeps the
 * person's choices (slice 7); a server that does not leaves them out, and the page is the read-only one of slice 6.
 */
export type EnginesReading = {
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
