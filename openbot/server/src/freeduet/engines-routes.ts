/**
 * The Engines dashboard's server side, read-only (docs/ENGINES_PLAN.md section 9.1, slice 6).
 *
 *   GET /api/freeduet/engines   administrators only; { reason, engines }
 *
 * The server asks agent-freeduet for its engine list (`GET /engines`, agent-freeduet's engine_state.py) with
 * the deployment token, which goes to that one address and nowhere else, and answers the administrator with
 * the few fields a person needs: each engine's name, one state and the time it is limited until. The token,
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
 * breaker has a time to show. The app turns these into English sentences and the times into the person's time
 * zone; the server knows neither.
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
  "unknown",
] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

/** Why there is no list. `null` means there is one, and it may still be empty. */
export type EnginesReason = "off" | "not_set_up" | "unreachable";

export type EngineSummary = {
  id: string;
  name: string;
  state: EngineState;
  /** ISO 8601 in UTC. Set only for the states that wait for a time. */
  until: string | null;
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
 * is tested without a server.
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
    state,
    until: TIMED_STATES.has(state) ? timeOf(raw.limited_until) : null,
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
