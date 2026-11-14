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

export type EnginesReading = {
  reason: EngineReason | null;
  engines: EngineSummary[];
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
