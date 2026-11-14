/**
 * The Engines dashboard's server side, read-only (docs/ENGINES_PLAN.md section 9.1, slice 6).
 *
 *   GET /api/freeduet/engines   administrators only; { reason, engines }
 *
 * The server asks agent-freeduet for its engine list (`GET /engines`, agent-freeduet's engine_state.py) with
 * the deployment token, which goes to that one address and nowhere else, and answers the administrator with
 * the few fields a person needs: each engine's name, its kind, one state, the time it is limited until and, for an
 * engine that is not run, the sentence that says why (`cleanRefusal` below). The token,
 * the state file's problem list, versions, probe findings and anything an engine printed never reach the
 * browser. The answer is `Cache-Control: no-store`.
 *
 * Read-only: nothing here enables, disables, pins or edits an engine (slices 7 and later). When the engines
 * are switched off, when no agent is set up, or when agent-freeduet does not answer, the answer says why and
 * lists nothing. It is an honest empty state, never an error page.
 *
 * The states are the breaker's, named for a person. `ready`, `degraded`, `checking` (half-open), `signed_out`
 * are as the breaker has them. An open breaker is `limited` (a usage or rate limit), `out_of_credit` (a paid
 * balance is used up) or `not_answering` (its failures trip it, or the reason is not known). Only an open
 * breaker has a time to show. `refused` is an engine the service will not run (a paid gateway). The app turns these
 * into English sentences and the times into the person's time zone; the server knows neither.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { type AppVariables, requireAdmin } from "../auth/guards";
import type { ManagedAgentConfig } from "../config";
import { routerOn } from "./model-base";

/** agent-freeduet's engine list, on the same origin as the managed endpoint the server already calls. */
export const AGENT_ENGINES_PATH = "/engines";
/** The header agent-freeduet checks on every request outside its open paths (app.py). */
export const AGENT_TOKEN_HEADER = "x-openbot-agent-token";
/** Long enough for an agent on the same machine, short enough that the page is not left waiting. */
export const READ_TIMEOUT_MS = 3_000;
/** An engine list is a few hundred bytes per engine. Anything much larger is not what the agent sends. */
const MAX_REPLY_CHARACTERS = 262_144;
const MAX_ENGINES = 64;
const MAX_TEXT_CHARACTERS = 120;

/** The states the app can say a sentence about. Keep in step with app/src/freeduet/engines-text.ts. */
export const ENGINE_STATES = [
  "ready",
  "degraded",
  "limited",
  "out_of_credit",
  "not_answering",
  "checking",
  "signed_out",
  "refused",
  "unknown",
] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

/** agent-freeduet's engine kinds (engines.py, KINDS). The app is told one of these by name; any other kind is `other`. */
export const ENGINE_KINDS = [
  "cli",
  "app-server",
  "acp",
  "anthropic-api",
  "openai-compatible",
  "anthropic-compatible",
] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number] | "other";

/** The kind the app may be told: one of agent-freeduet's kinds, else `other` (no kind at all included). */
export function kindOf(value: unknown): EngineKind {
  return (ENGINE_KINDS as readonly unknown[]).includes(value)
    ? (value as EngineKind)
    : "other";
}

/** Why there is no list. `null` means there is one, and it may still be empty. */
export type EnginesReason = "off" | "not_set_up" | "unreachable";

export type EngineSummary = {
  id: string;
  name: string;
  kind: EngineKind;
  state: EngineState;
  /** ISO 8601 in UTC. Set only for the states that wait for a time. */
  until: string | null;
  /** Set only for a `refused` engine: the sentence that says why it is not run, cleaned by `cleanRefusal`. */
  refusal: string | null;
};

export type EnginesReading = {
  reason: EnginesReason | null;
  engines: EngineSummary[];
};

const OFF: EnginesReading = { reason: "off", engines: [] };
const NOT_SET_UP: EnginesReading = { reason: "not_set_up", engines: [] };
const UNREACHABLE: EnginesReading = { reason: "unreachable", engines: [] };

const TIMED_STATES: ReadonlySet<EngineState> = new Set([
  "limited",
  "out_of_credit",
  "not_answering",
]);

/**
 * What the server needs to ask agent-freeduet: the switch that says whether the router is on, the deployment's
 * managed endpoint and its token. `fetch` is injected by tests only.
 */
export type EnginesReach = {
  environment: Record<string, string | undefined>;
  managedAgent: ManagedAgentConfig | undefined;
  fetch?: typeof fetch;
};

/**
 * One breaker state, with the kind of the failure it last saw, as the person should see it. Pure, so the mapping
 * is tested without a server. `refused` is the agent's own row for an engine it will not run: not a breaker state.
 */
export function stateOf(
  agentState: unknown,
  lastFailureKind: unknown,
): EngineState {
  switch (agentState) {
    case "ready":
      return "ready";
    case "degraded":
      return "degraded";
    case "half_open":
      return "checking";
    case "signed_out":
      return "signed_out";
    case "refused":
      return "refused";
    case "open":
      if (lastFailureKind === "credits") return "out_of_credit";
      if (lastFailureKind === "usage_limit" || lastFailureKind === "rate_limit")
        return "limited";
      return "not_answering";
    default:
      return "unknown";
  }
}

/** A time the agent sent, as UTC ISO 8601, or null when it is not a time at all. */
function timeOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString();
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text.slice(0, MAX_TEXT_CHARACTERS);
}

/** The most of a refusal sentence that is read at all: a bound on the work, not a limit the person sees. */
const MAX_REFUSAL_INPUT_CHARACTERS = 2_000;
/** The longest refusal sentence the person is shown. The agent's own sentence is about 180 characters. */
const MAX_REFUSAL_CHARACTERS = 300;
/** What takes the place of anything that looks like an address, a key or a token. */
const REMOVED = "[removed]";

/**
 * The sentence that says why an engine is not run, as the person may see it: plain text on one line, at most 300
 * characters. The sentence holds the engine's name, and the name is free text in engines.yaml, so anything that looks
 * like an address (a URL, an e-mail-like text, an IP address, a host name, with or without a port) or like a key or a
 * token (a run of 20 or more letters, digits and symbols that holds a digit, or one of 32 or more) becomes `[removed]`.
 * Null when nothing is left to say.
 */
export function cleanRefusal(value: string): string | null {
  let plain = "";
  for (const character of value.slice(0, MAX_REFUSAL_INPUT_CHARACTERS)) {
    const code = character.codePointAt(0) ?? 0;
    plain += code < 32 || code === 127 ? " " : character;
  }
  const cleaned = plain
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*/gi, REMOVED) // a URL
    .replace(/\S+@\S+/g, REMOVED) // user@host, an e-mail address
    .replace(/\[[0-9a-f:]{2,}\](?::\d+)?/gi, REMOVED) // an IPv6 address in brackets, with its port
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, REMOVED) // an IPv4 address, with its port
    .replace(/\blocalhost\b(?::\d+)?/gi, REMOVED) // localhost, with its port
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/\S*)?/gi, REMOVED) // a host name, with its port and path
    .replace(/[A-Za-z0-9_+/=.-]{20,}/g, (run) =>
      /\d/.test(run) || run.length >= 32 ? REMOVED : run,
    ) // a key or a token
    .slice(0, MAX_REFUSAL_CHARACTERS)
    .trim();
  return cleaned === "" ? null : cleaned;
}

/** The sentence that says why an engine is not run: only for a `refused` row, and only once it is cleaned. */
function refusalOf(state: EngineState, value: unknown): string | null {
  if (state !== "refused" || typeof value !== "string") return null;
  return cleanRefusal(value);
}

/** One engine row from the agent, reduced to what a person needs. A row without an id is not an engine. */
export function summaryOf(row: unknown): EngineSummary | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  const id = textOf(raw.id);
  if (id === null) return null;
  const state = stateOf(raw.state, raw.last_failure_kind);
  return {
    id,
    name: textOf(raw.label) ?? id,
    kind: kindOf(raw.kind),
    state,
    until: TIMED_STATES.has(state) ? timeOf(raw.limited_until) : null,
    refusal: refusalOf(state, raw.refusal),
  };
}

/**
 * The engine list as the person may see it, from the deployment's own settings and agent-freeduet's answer. Never
 * throws: every failure is one of the three reasons.
 */
export async function readEngines(
  reach: EnginesReach,
): Promise<EnginesReading> {
  try {
    if (!routerOn(reach.environment)) return OFF;
    const agent = reach.managedAgent;
    if (!agent?.endpoint || !agent.token) return NOT_SET_UP;

    const response = await (reach.fetch ?? fetch)(
      new URL(AGENT_ENGINES_PATH, agent.endpoint),
      {
        headers: { [AGENT_TOKEN_HEADER]: agent.token },
        // The token goes to this address and nowhere else: a redirect is not followed.
        redirect: "error",
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      },
    );
    if (!response.ok) return UNREACHABLE;

    const text = await response.text();
    if (text.length > MAX_REPLY_CHARACTERS) return UNREACHABLE;
    const body = JSON.parse(text) as { engines?: unknown };
    if (!Array.isArray(body?.engines)) return UNREACHABLE;

    const engines = body.engines
      .slice(0, MAX_ENGINES)
      .map(summaryOf)
      .filter((engine): engine is EngineSummary => engine !== null);
    return { reason: null, engines };
  } catch {
    // Unreachable, refused, timed out, or not JSON. Said as one fact; the detail is not the person's to see.
    return UNREACHABLE;
  }
}

/**
 * `GET /` of the sub-app, which is mounted at `/api/freeduet/engines`. Behind the same sign-in as every other
 * administrator route: a person who is not an administrator is refused with 403.
 */
export function createEnginesRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  reach: () => EnginesReach,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  routes.get("/", async (context) => {
    const denied = requireAdmin(context);
    if (denied) return denied;
    return context.json(await readEngines(reach()), 200, {
      "Cache-Control": "no-store",
    });
  });
  return routes;
}
