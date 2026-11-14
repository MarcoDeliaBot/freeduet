/**
 * The Engines dashboard's server side (docs/ENGINES_PLAN.md section 9.1, slices 6 and 7;
 * docs/design/engines-dashboard.md).
 *
 *   GET  /api/freeduet/engines                           administrators only; { reason, engines } and, where the
 *                                                        person's choices are kept here, { members, choices, canChange,
 *                                                        cannotChange }
 *   PUT  /api/freeduet/engines/members/:memberId/mode    the administrator at the computer: automatic or ask first
 *   POST /api/freeduet/engines/changes/:changeId/undo    the administrator at the computer: put the old choice back
 *
 * The server asks agent-freeduet for its engine list (`GET /engines`, agent-freeduet's engine_state.py) with
 * the deployment token, which goes to that one address and nowhere else, and answers the administrator with
 * the few fields a person needs: each engine's name, its kind, one state, the time it is limited until and, for an
 * engine that is not run, the sentence that says why (`cleanRefusal` below). The token,
 * the state file's problem list, versions, probe findings and anything an engine printed never reach the
 * browser. The answer is `Cache-Control: no-store`.
 *
 * MEMBERS (slice 7). From the same answer, each team member's engines as the engines file gives them: the engines in
 * the order they will be tried, the ones that will not run with one word for why, the file's mode and its pin. All of it
 * is ids and words from closed lists (`memberOf`): no address, no key reference, no path, however the file spells them.
 * The person's own choice of mode (engine-choices.ts) is laid over the file's, and the answer says which it is.
 *
 * WHO MAY CHANGE. An administrator who is also at the computer FreeDuet runs on (at-the-computer.ts): a remote
 * session, a tunnel and a non-administrator are refused and nothing is written. The page is told whether it may
 * (`canChange`) and, if not, which of the three words says why, so it shows the information and disables the controls.
 * The change is stored on this server, written to the audit trail, and undone with its change id (engine-choices.ts).
 * Nothing here enables, disables or edits an engine, and no key is stored or shown.
 *
 * When the engines are switched off, when no agent is set up, or when agent-freeduet does not answer, the answer says why and
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
import { atTheComputer } from "./at-the-computer";
import {
  CHANGE_ID,
  type ChoicesSnapshot,
  EngineChoiceRefusedError,
  type EngineChoices,
  type EngineMode,
  isEngineMode,
  MAX_MEMBERS,
  MEMBER_ID,
} from "./engine-choices";
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

/**
 * The words for an engine a member's list names that will not run, as agent-freeduet sends them (engines.py,
 * `EXCLUSION_CODES`, and `not_set_up`: allowed, but this service has no way to run it). Any other word is `other`.
 * Keep in step with app/src/freeduet/engines-text.ts.
 */
export const LEFT_OUT_WHY = [
  "locked",
  "disabled",
  "paid_gateway",
  "metered_off",
  "cap_zero",
  "not_set_up",
] as const;
export type LeftOutWhy = (typeof LEFT_OUT_WHY)[number] | "other";

/** One member as agent-freeduet gives it from the engines file, reduced to ids and words (`memberOf`). */
export type AgentMember = {
  id: string;
  /** The engines that will be tried, in order: logins first, every excluded engine removed. */
  chain: string[];
  leftOut: { id: string; why: LeftOutWhy }[];
  /** The file's mode: the person's choice is not in it. */
  mode: EngineMode;
  pin: string | null;
};

/** One member as the page shows it: the file's values with the person's choice of mode laid over. */
export type MemberSummary = {
  id: string;
  chain: string[];
  leftOut: { id: string; why: LeftOutWhy }[];
  /** The mode that applies: the person's choice when there is one, else the file's. */
  mode: EngineMode;
  /** The file's own mode, so the page can say what it would go back to. */
  fileMode: EngineMode;
  /** Whether `mode` is the person's choice. */
  chosen: boolean;
  pin: string | null;
};

/** Why the page may not change anything, in one word. The page says the sentence. */
export type ChangeBlock =
  | "not_at_the_computer"
  | "agent_too_old"
  | "choices_unreadable";

/** What the server adds when it keeps the person's choices (slice 7). */
export type EnginesDashboard = {
  members: MemberSummary[];
  /** `unreadable`: the saved choices cannot be read, so the file's values apply. */
  choices: { state: ChoicesSnapshot["state"] };
  canChange: boolean;
  cannotChange: ChangeBlock | null;
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

/** The most engines one member's list is read to hold: a team file names a handful. */
const MAX_CHAIN = 16;

/**
 * One member as the agent describes it, reduced to ids and words from closed lists. A row without a member id is not a
 * member. Nothing else the agent holds about an engine is read here, so nothing else can leave.
 */
export function memberOf(row: unknown): AgentMember | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  if (typeof raw.id !== "string" || !MEMBER_ID.test(raw.id)) return null;
  const ids = (list: unknown) =>
    (Array.isArray(list) ? list : [])
      .slice(0, MAX_CHAIN)
      .map(textOf)
      .filter((id): id is string => id !== null);
  const leftOut = (Array.isArray(raw.left_out) ? raw.left_out : [])
    .slice(0, MAX_CHAIN)
    .flatMap((entry): AgentMember["leftOut"] => {
      if (!entry || typeof entry !== "object") return [];
      const id = textOf((entry as Record<string, unknown>).id);
      if (id === null) return [];
      const why = (entry as Record<string, unknown>).why;
      return [
        {
          id,
          why: (LEFT_OUT_WHY as readonly unknown[]).includes(why)
            ? (why as LeftOutWhy)
            : "other",
        },
      ];
    });
  return {
    id: raw.id,
    chain: ids(raw.chain),
    leftOut,
    mode: isEngineMode(raw.mode) ? raw.mode : "automatic",
    pin: textOf(raw.pin),
  };
}

/** What agent-freeduet answered, reduced: the engines, the members, and whether it honours the person's choices. */
type AgentReading = {
  reading: EnginesReading;
  members: AgentMember[];
  /** agent-freeduet's `choices_version`; null when it does not say (an older one). */
  choicesVersion: number | null;
};

async function readAgent(reach: EnginesReach): Promise<AgentReading> {
  const none = (reading: EnginesReading): AgentReading => ({
    reading,
    members: [],
    choicesVersion: null,
  });
  try {
    if (!routerOn(reach.environment)) return none(OFF);
    const agent = reach.managedAgent;
    if (!agent?.endpoint || !agent.token) return none(NOT_SET_UP);

    const response = await (reach.fetch ?? fetch)(
      new URL(AGENT_ENGINES_PATH, agent.endpoint),
      {
        headers: { [AGENT_TOKEN_HEADER]: agent.token },
        // The token goes to this address and nowhere else: a redirect is not followed.
        redirect: "error",
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      },
    );
    if (!response.ok) return none(UNREACHABLE);

    const text = await response.text();
    if (text.length > MAX_REPLY_CHARACTERS) return none(UNREACHABLE);
    const body = JSON.parse(text) as {
      engines?: unknown;
      members?: unknown;
      choices_version?: unknown;
    };
    if (!Array.isArray(body?.engines)) return none(UNREACHABLE);

    const engines = body.engines
      .slice(0, MAX_ENGINES)
      .map(summaryOf)
      .filter((engine): engine is EngineSummary => engine !== null);
    const members = (Array.isArray(body.members) ? body.members : [])
      .slice(0, MAX_MEMBERS)
      .map(memberOf)
      .filter((member): member is AgentMember => member !== null);
    return {
      reading: { reason: null, engines },
      members,
      choicesVersion: Number.isInteger(body.choices_version)
        ? (body.choices_version as number)
        : null,
    };
  } catch {
    // Unreachable, refused, timed out, or not JSON. Said as one fact; the detail is not the person's to see.
    return none(UNREACHABLE);
  }
}

/**
 * The engine list as the person may see it, from the deployment's own settings and agent-freeduet's answer. Never
 * throws: every failure is one of the three reasons.
 */
export async function readEngines(
  reach: EnginesReach,
): Promise<EnginesReading> {
  return (await readAgent(reach)).reading;
}

/** The version of the person's choices this server sends and agent-freeduet must honour (engine-choices.ts). */
const CHOICES_VERSION = 1;

/** One member as the page shows it: the file's values, and the person's mode over them when they chose one. */
function viewOf(member: AgentMember, choices: ChoicesSnapshot): MemberSummary {
  const chosen =
    choices.state === "ok" ? choices.members.get(member.id)?.mode : undefined;
  return {
    id: member.id,
    chain: member.chain,
    leftOut: member.leftOut,
    mode: chosen ?? member.mode,
    fileMode: member.mode,
    chosen: chosen !== undefined,
    pin: member.pin,
  };
}

/** What a person is told when a change is asked of a session that is not at the computer. */
const NOT_AT_THE_COMPUTER =
  "Change this on the computer FreeDuet runs on. Nothing was changed.";
const NO_CHOICES_HERE =
  "This installation does not keep engine choices, so nothing was changed.";
const NO_SUCH_CHANGE = "There is no engine change with that id.";

/**
 * The routes of the sub-app, which is mounted at `/api/freeduet/engines`. Behind the same sign-in as every other
 * administrator route: a person who is not an administrator is refused with 403. `choices` is where the person's
 * choices are kept (engine-choices.ts); without it the page is the read-only one of slice 6, and nothing can be changed.
 */
export function createEnginesRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  reach: () => EnginesReach,
  choices?: EngineChoices,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  routes.get("/", async (context) => {
    const denied = requireAdmin(context);
    if (denied) return denied;
    const noStore = { "Cache-Control": "no-store" };
    if (!choices) return context.json(await readEngines(reach()), 200, noStore);

    // What is read from the store is read again for each answer, so the page shows what is saved and a copy that
    // was stale, or that failed to load at start, is mended by looking.
    await choices.load();
    const agent = await readAgent(reach());
    const saved = choices.current();
    const listed = agent.reading.reason === null;
    const cannotChange: ChangeBlock | null = !listed
      ? null
      : !atTheComputer(context.env, context.req.raw)
        ? "not_at_the_computer"
        : (agent.choicesVersion ?? 0) < CHOICES_VERSION
          ? "agent_too_old"
          : saved.state === "unreadable"
            ? "choices_unreadable"
            : null;
    const dashboard: EnginesDashboard = {
      members: listed
        ? agent.members.map((member) => viewOf(member, saved))
        : [],
      choices: { state: saved.state },
      canChange: listed && cannotChange === null,
      cannotChange,
    };
    return context.json({ ...agent.reading, ...dashboard }, 200, noStore);
  });

  /** The two guards every change passes before anything is read: an administrator, at the computer. */
  const mayChange = (context: Parameters<typeof requireAdmin>[0]) =>
    requireAdmin(context) ??
    (atTheComputer(context.env, context.req.raw)
      ? undefined
      : context.json({ error: NOT_AT_THE_COMPUTER }, 403));

  routes.put("/members/:memberId/mode", async (context) => {
    const refused = mayChange(context);
    if (refused) return refused;
    if (!choices) return context.json({ error: NO_CHOICES_HERE }, 503);
    let body: unknown = null;
    try {
      body = await context.req.json();
    } catch {
      // Not JSON: there is no mode in it, and the answer below says so.
    }
    const mode =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).mode
        : undefined;
    try {
      const outcome = await choices.setMode({
        memberId: context.req.param("memberId"),
        mode: mode as EngineMode,
        actorUserId: context.var.actor.id,
      });
      return context.json(outcome, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      if (error instanceof EngineChoiceRefusedError)
        return context.json({ error: error.message }, error.status);
      throw error;
    }
  });

  routes.post("/changes/:changeId/undo", async (context) => {
    const refused = mayChange(context);
    if (refused) return refused;
    if (!choices) return context.json({ error: NO_CHOICES_HERE }, 503);
    const changeId = context.req.param("changeId");
    if (!CHANGE_ID.test(changeId))
      return context.json({ error: NO_SUCH_CHANGE }, 404);
    try {
      const outcome = await choices.undo({
        changeId: changeId.toLowerCase(),
        actorUserId: context.var.actor.id,
      });
      return context.json(outcome, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      if (error instanceof EngineChoiceRefusedError)
        return context.json({ error: error.message }, error.status);
      throw error;
    }
  });
  return routes;
}
