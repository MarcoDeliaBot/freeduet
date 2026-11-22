/**
 * The Engines dashboard's server side (docs/ENGINES_PLAN.md section 9.1, slices 6 and 7;
 * docs/design/engines-dashboard.md).
 *
 *   GET  /api/freeduet/engines                           administrators only; { reason, engines } and, where the
 *                                                        person's choices are kept here, { members, choices, canChange,
 *                                                        cannotChange }
 *   PUT  /api/freeduet/engines/members/:memberId/mode    the administrator at the computer: automatic or ask first
 *   PUT  /api/freeduet/engines/members/:memberId/order   the administrator at the computer (D112): one member's engines
 *                                                        in a new order, written by agent-freeduet to its own marked file
 *   POST /api/freeduet/engines/changes/:changeId/undo    the administrator at the computer: put the old choice back
 *   POST /api/freeduet/engines/claude/check              the administrator at the computer: check Claude Code now
 *                                                        (docs/design/first-start.md, "Check again"); three facts back
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
 * WHO MAY CHANGE. An administrator who is also at the computer FreeDuet runs on (at-the-computer.ts), or, since D106,
 * with sign-in and an installation secret, signed in from a browser holding a live `computer` pairing of the same
 * person, through a tunnel too (`mayChangeEngines`). A remote session, a phone paired as a `device`, an unpaired
 * browser, a tunnel in single-user mode and a non-administrator are refused and nothing is written. The
 * page is told whether it may (`canChange`) and, if not, which of the three words says why, so it shows the
 * information and disables the controls.
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
import type { AuditSink } from "../audit";
import { type AppVariables, requireAdmin } from "../auth/guards";
import type { PairingGate } from "../auth/install-secret";
import type { ManagedAgentConfig } from "../config";
import { mayChangeEngines } from "./at-the-computer";
import { isHosted } from "./deployment";
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
/**
 * The check waits for agent-freeduet's probe, which gives up after 8 s, so it may wait longer than a read. It stays
 * under the 10 s a Bun connection may sit silent, because the browser's request is open while it waits.
 */
export const CHECK_TIMEOUT_MS = 9_500;
/** agent-freeduet's check of Claude Code (agent-freeduet app.py, `check_claude`). */
export const AGENT_CLAUDE_CHECK_PATH = "/engines/claude/check";
/** An engine list is a few hundred bytes per engine. Anything much larger is not what the agent sends. */
const MAX_REPLY_CHARACTERS = 262_144;
const MAX_ENGINES = 64;
const MAX_TEXT_CHARACTERS = 120;

/** agent-freeduet's token counter (D102, usage_counter.py). */
export const AGENT_USAGE_PATH = "/engines/usage";
const MAX_USAGE_ROWS = 512;
const MAX_DAILY_DAYS = 7;
const MAX_DAILY_MEMBERS = 64;

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
  /**
   * D116: only when the engine's last turn ended with a tool call written as text instead of used (a small free model does
   * that). One fixed word, and absent otherwise, so no row changes for an engine that never did.
   */
  note?: "tools_as_text";
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
  /** D115: the person ordered this member's engines by hand, so logins are not necessarily first. */
  ownOrder: boolean;
  /** D115: the same engines with logins first, which "use the recommended order" sends back. */
  recommendedChain: string[];
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
  /** D115: the order is the person's own and may leave logins first; the page says so and offers the way back. */
  ownOrder: boolean;
  /** D115: the recommended order of the same engines, logins first. */
  recommendedChain: string[];
};

/** Why the page may not change anything, in one word. The page says the sentence. */
export type ChangeBlock =
  | "not_at_the_computer"
  | "not_paired_with_the_computer"
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

// ── THE PROVIDER CARDS (D109, docs/design/engines-three-clicks.md) ───────────────────────────────

/** The providers agent-freeduet's `engine_panel.py` knows. Anything else is refused before it is forwarded. */
export const PROVIDER_IDS = [
  "ollama",
  "llamacpp",
  "lmstudio",
  "freellmapi",
  "groq",
  "cerebras",
  "google",
  "mistral",
  "openrouter",
  "cloudflare",
  "anthropic-api",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
const PROVIDER_TAGS = ["local", "router", "free", "trial", "paid"] as const;
const PANEL_PATH = "/engines/panel";
/** A key is short; anything much longer is not one, and is never read further. */
const MAX_KEY_BODY_CHARACTERS = 2_048;
const MAX_MODELS = 300;
const MAX_MODEL_CHARACTERS = 120;
/** D116: a model id the card may offer from OpenRouter's free list: one that ends in `:free`, or the router. */
const FREE_MODEL =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+:free$/;
const FREE_ROUTER = "openrouter/free";
const FREE_SOURCES = ["live", "cached", "stale", "fallback"] as const;

/** One card as the page draws it. No key, no path: `keySaved` is all the page ever learns about a key. */
export type ProviderView = {
  id: ProviderId;
  tag: (typeof PROVIDER_TAGS)[number];
  enabled: boolean;
  baseUrl: string;
  model: string;
  keySaved: boolean;
  needsKey: boolean;
  cloud: boolean;
  forMembers: boolean;
  forAssistants: boolean;
  blocked: "paid" | "trial_needs_card" | null;
  addressFixed: boolean;
  /**
   * For a free cloud engine a member can run on (OpenRouter): the members the person may choose from, and the ones chosen.
   * Null for every other card (a local engine joins every member; an OpenAI-format-only engine joins none).
   */
  useFor: { available: string[]; chosen: string[] } | null;
};

/** The words agent-freeduet refuses a card change with, and the sentence the person reads for each. */
export const PANEL_SENTENCES: Record<string, string> = {
  paid: "This engine costs money. It cannot be switched on here until spending caps exist.",
  trial_needs_card:
    "Its free tier is a trial that needs a card, so it is not offered as free. It cannot be switched on here.",
  key_first: "Save a key first. Nothing was changed.",
  address_host:
    "That address is not allowed. A key goes only to the provider's own address, and a local engine only to this computer or your own network. Nothing was changed.",
  members_shape: "Those members cannot be chosen. Nothing was changed.",
  switch_on_first:
    "Switch the engine on before choosing members. Nothing was changed.",
  model_first: "Choose a model first. Nothing was changed.",
  address_first:
    "Write the server address first (for Cloudflare, with your own account in it). Nothing was changed.",
  address_shape: "That server address is not valid. Nothing was changed.",
  address_fixed:
    "This provider's address cannot be changed. Nothing was changed.",
  model_shape: "That model name is not valid. Nothing was changed.",
  model_not_free:
    "Only a free model is accepted here: one that ends in :free, or openrouter/free. Nothing was changed.",
  key_shape: "That does not look like a key. Nothing was saved.",
  no_key_needed: "This engine takes no key.",
  file_is_yours:
    "You wrote an engines file of your own, so this page leaves it alone. Change it there.",
  unknown_provider: "There is no such provider.",
  invalid: "That change is not accepted. Nothing was changed.",
  enabled_shape: "That change is not accepted. Nothing was changed.",
  file_unreadable: "The engines file could not be read. Nothing was changed.",
  file_not_written: "The change could not be saved. Nothing was changed.",
  unknown_member: "There is no such member.",
  order_shape: "That order is not accepted. Nothing was changed.",
  order_not_permutation:
    "That order does not hold the same engines as the member has now. Nothing was changed.",
  order_needs_confirmation:
    "That order puts a free or paid engine before your own logins. Confirm it to use it. Nothing was changed.",
};
/** D115: the two ways an order can leave the logins-first group order; the agent names one, the page says it in words. */
export const ORDER_BREAK_KINDS = [
  "free_before_login",
  "paid_before_free_or_login",
] as const;
export type OrderBreakKind = (typeof ORDER_BREAK_KINDS)[number];
function orderBreakKind(value: unknown): OrderBreakKind | null {
  return (ORDER_BREAK_KINDS as readonly unknown[]).includes(value)
    ? (value as OrderBreakKind)
    : null;
}
const PANEL_FALLBACK = "That could not be done. Nothing was changed.";
const NO_AUDIT =
  "This installation cannot record the change, so nothing was changed.";
/** The closed list of outcomes a Test or Load list answers with. The page says each in words. */
const CHECK_CODES = [
  "ok",
  "key_rejected",
  "model_missing",
  "rate_limited",
  "unreachable",
] as const;

function providerOf(value: unknown): ProviderView | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = PROVIDER_IDS.find((known) => known === raw.id);
  const tag = PROVIDER_TAGS.find((known) => known === raw.tag);
  if (!id || !tag) return null;
  const flag = (name: string) => raw[name] === true;
  return {
    id,
    tag,
    enabled: flag("enabled"),
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.slice(0, 300) : "",
    model: typeof raw.model === "string" ? raw.model.slice(0, 120) : "",
    keySaved: flag("keySaved"),
    needsKey: flag("needsKey"),
    cloud: flag("cloud"),
    forMembers: flag("forMembers"),
    forAssistants: flag("forAssistants"),
    blocked:
      raw.blocked === "paid" || raw.blocked === "trial_needs_card"
        ? raw.blocked
        : null,
    addressFixed: flag("addressFixed"),
    useFor: useForOf(raw.useFor),
  };
}

const MEMBER_ID_LIST = /^[a-z][a-z0-9_-]{0,31}$/;
/** An engine id as the engines file spells it, and how many one member's order may hold. */
const ENGINE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_ORDER = 32;
function useForOf(value: unknown): ProviderView["useFor"] {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const ids = (list: unknown) =>
    (Array.isArray(list) ? list : [])
      .filter(
        (id): id is string => typeof id === "string" && MEMBER_ID_LIST.test(id),
      )
      .slice(0, 64);
  return { available: ids(raw.available), chosen: ids(raw.chosen) };
}

/** What the page is told about the cards. `locked` is set when the person's own engines file is in use. */
export type ProvidersReading = {
  providers: ProviderView[];
  providersLocked: "file_is_yours" | null;
};

type AgentAnswer = { status: number; body: unknown };

/** One request to agent-freeduet's card routes. Never throws; `null` is "no answer". The token goes to this address only. */
async function callPanel(
  reach: EnginesReach,
  method: string,
  path: string,
  body?: unknown,
): Promise<AgentAnswer | null> {
  try {
    if (!routerOn(reach.environment)) return null;
    const agent = reach.managedAgent;
    if (!agent?.endpoint || !agent.token) return null;
    const response = await (reach.fetch ?? fetch)(
      new URL(`${PANEL_PATH}${path}`, agent.endpoint),
      {
        method,
        headers: {
          [AGENT_TOKEN_HEADER]: agent.token,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      },
    );
    const text = await response.text();
    if (text.length > MAX_REPLY_CHARACTERS) return null;
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return null;
  }
}

async function readProviders(
  reach: EnginesReach,
): Promise<ProvidersReading | null> {
  const answer = await callPanel(reach, "GET", "");
  if (answer?.status !== 200) return null;
  const raw = answer.body as { providers?: unknown; reason?: unknown };
  if (!Array.isArray(raw?.providers)) return null;
  return {
    providers: raw.providers
      .slice(0, PROVIDER_IDS.length)
      .map(providerOf)
      .filter((card): card is ProviderView => card !== null),
    providersLocked: raw.reason === "file_is_yours" ? "file_is_yours" : null,
  };
}

/** The refusal a card change got, as `{ error, code }` with the sentence from the closed list. */
function panelRefusal(answer: AgentAnswer | null): {
  status: 400 | 404 | 409 | 502;
  body: { error: string; code: string; kind?: OrderBreakKind };
} {
  if (!answer) {
    return {
      status: 502,
      body: {
        error: "FreeDuet's engine service did not answer. Nothing was changed.",
        code: "unreachable",
      },
    };
  }
  const code = (answer.body as { error?: unknown } | null)?.error;
  const known = typeof code === "string" && code in PANEL_SENTENCES;
  const kind =
    code === "order_needs_confirmation"
      ? orderBreakKind((answer.body as { kind?: unknown }).kind)
      : null;
  return {
    status: answer.status === 404 ? 404 : answer.status === 409 ? 409 : 400,
    body: {
      error: known ? PANEL_SENTENCES[code as string] : PANEL_FALLBACK,
      code: known ? (code as string) : "other",
      ...(kind ? { kind } : {}),
    },
  };
}

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

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
    ...(raw.note === "tools_as_text" ? { note: "tools_as_text" as const } : {}),
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
    ownOrder: raw.own_order === true,
    recommendedChain: ids(raw.recommended_chain),
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
    ownOrder: member.ownOrder,
    recommendedChain: member.recommendedChain,
  };
}

/**
 * What "Check again" answers to the browser: whether Claude Code is installed and signed in (null: not known), and the
 * reason when there is no answer at all. Never a version, an account or a path: agent-freeduet's answer is reduced here.
 */
export type ClaudeCheck = {
  reason: EnginesReason | null;
  installed: boolean | null;
  signedIn: boolean | null;
};

/**
 * Ask agent-freeduet to check Claude Code now: one request, with the same token and the same single address as
 * `GET /engines`. Never throws. A failure is one of the three reasons, and nothing is said about Claude.
 */
export async function checkClaude(reach: EnginesReach): Promise<ClaudeCheck> {
  const none = (reason: EnginesReason): ClaudeCheck => ({
    reason,
    installed: null,
    signedIn: null,
  });
  try {
    if (!routerOn(reach.environment)) return none("off");
    const agent = reach.managedAgent;
    if (!agent?.endpoint || !agent.token) return none("not_set_up");

    const response = await (reach.fetch ?? fetch)(
      new URL(AGENT_CLAUDE_CHECK_PATH, agent.endpoint),
      {
        method: "POST",
        headers: { [AGENT_TOKEN_HEADER]: agent.token },
        // The token goes to this address and nowhere else: a redirect is not followed.
        redirect: "error",
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      },
    );
    if (!response.ok) return none("unreachable");
    const text = await response.text();
    if (text.length > MAX_REPLY_CHARACTERS) return none("unreachable");
    const body = JSON.parse(text) as {
      installed?: unknown;
      signed_in?: unknown;
    };
    return {
      reason: null,
      installed: typeof body.installed === "boolean" ? body.installed : null,
      signedIn: typeof body.signed_in === "boolean" ? body.signed_in : null,
    };
  } catch {
    // Unreachable, refused, timed out, or not JSON. Said as one fact; the detail is not the person's to see.
    return none("unreachable");
  }
}

/** One period's counts for one member and engine. `reportedTurns` is how many of `turns` carried a token count. */
export type TokenCounts = {
  turns: number;
  reportedTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** D126: wall-clock seconds of the attempts, measured by agent-freeduet; there even when no tokens were reported. */
  seconds: number;
};
/** D126: what the engine is, for "tokens saved": only `free_cloud` and `local` save anything. */
export const TOKEN_CLASSES = [
  "free_cloud",
  "local",
  "login",
  "metered",
  "other",
] as const;
export type TokenClass = (typeof TOKEN_CLASSES)[number];
export type TokenRow = {
  member: string | null;
  engine: string;
  class: TokenClass;
  today: TokenCounts;
  week: TokenCounts;
};
/** D134: where a run came from. `unknown` is what a day's total holds that no source accounts for (counted before sources were kept). */
export const TOKEN_SOURCES = [
  "person",
  "routine",
  "handoff",
  "other",
  "unknown",
] as const;
export type TokenSource = (typeof TOKEN_SOURCES)[number];
/** D134: one UTC day of the last seven, with its counts per source and per member. */
export type TokenDay = {
  day: string;
  sources: Partial<Record<TokenSource, TokenCounts>>;
  members: Record<string, TokenCounts>;
};
/** D102. Counts by member and engine, today and the last seven days, in UTC. Numbers and ids only: no text, no key. */
export type TokenUsage = {
  reason: EnginesReason | null;
  timezone: "UTC";
  windowDays: number;
  rows: TokenRow[];
  engines: TokenRow[];
  /** D134: the last seven UTC days, oldest first; empty when agent-freeduet is older and sends none. */
  daily: TokenDay[];
  /** agent-freeduet could not read its own counter file: the numbers may be missing. */
  problem: boolean;
};

const NO_COUNTS: TokenCounts = {
  turns: 0,
  reportedTurns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  seconds: 0,
};

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function countsOf(raw: unknown): TokenCounts {
  if (typeof raw !== "object" || raw === null) return NO_COUNTS;
  const counts = raw as Record<string, unknown>;
  return {
    turns: countOf(counts.turns),
    reportedTurns: countOf(counts.reported_turns),
    inputTokens: countOf(counts.input_tokens),
    outputTokens: countOf(counts.output_tokens),
    cacheReadTokens: countOf(counts.cache_read_tokens),
    cacheWriteTokens: countOf(counts.cache_write_tokens),
    seconds: countOf(counts.seconds),
  };
}

function usageRowOf(raw: unknown, withMember: boolean): TokenRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const engine = textOf(row.engine);
  if (engine === null) return null;
  const member =
    typeof row.member === "string" && MEMBER_ID.test(row.member)
      ? row.member
      : null;
  if (withMember && member === null) return null;
  const kind = (TOKEN_CLASSES as readonly unknown[]).includes(row.class)
    ? (row.class as TokenClass)
    : "other";
  return {
    member,
    engine,
    class: kind,
    today: countsOf(row.today),
    week: countsOf(row.week),
  };
}

/** D134: the daily series, reduced to a real date, the five source words, member ids and whole counts. Anything else is dropped. */
function dailyOf(raw: unknown): TokenDay[] {
  if (!Array.isArray(raw)) return [];
  const days: TokenDay[] = [];
  for (const item of raw.slice(0, MAX_DAILY_DAYS)) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.day) ||
      Number.isNaN(Date.parse(`${entry.day}T00:00:00Z`))
    )
      continue;
    const sources: Partial<Record<TokenSource, TokenCounts>> = {};
    if (typeof entry.sources === "object" && entry.sources !== null) {
      for (const source of TOKEN_SOURCES) {
        const counts = (entry.sources as Record<string, unknown>)[source];
        if (counts !== undefined) sources[source] = countsOf(counts);
      }
    }
    const members: Record<string, TokenCounts> = {};
    if (typeof entry.members === "object" && entry.members !== null) {
      for (const [member, counts] of Object.entries(entry.members).slice(
        0,
        MAX_DAILY_MEMBERS,
      )) {
        if (MEMBER_ID.test(member)) members[member] = countsOf(counts);
      }
    }
    days.push({ day: entry.day, sources, members });
  }
  return days;
}

/**
 * Ask agent-freeduet for the token counter: one GET, same token and address as `GET /engines`. Never throws. A failure
 * is one of the three reasons and no numbers.
 */
export async function readUsage(reach: EnginesReach): Promise<TokenUsage> {
  const none = (reason: EnginesReason): TokenUsage => ({
    reason,
    timezone: "UTC",
    windowDays: 7,
    rows: [],
    engines: [],
    daily: [],
    problem: false,
  });
  try {
    if (!routerOn(reach.environment)) return none("off");
    const agent = reach.managedAgent;
    if (!agent?.endpoint || !agent.token) return none("not_set_up");
    const response = await (reach.fetch ?? fetch)(
      new URL(AGENT_USAGE_PATH, agent.endpoint),
      {
        headers: { [AGENT_TOKEN_HEADER]: agent.token },
        // The token goes to this address and nowhere else: a redirect is not followed.
        redirect: "error",
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      },
    );
    if (!response.ok) return none("unreachable");
    const text = await response.text();
    if (text.length > MAX_REPLY_CHARACTERS) return none("unreachable");
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!Array.isArray(body.rows) || !Array.isArray(body.engines))
      return none("unreachable");
    return {
      reason: null,
      timezone: "UTC",
      windowDays: 7,
      rows: body.rows
        .slice(0, MAX_USAGE_ROWS)
        .map((row) => usageRowOf(row, true))
        .filter((row): row is TokenRow => row !== null),
      engines: body.engines
        .slice(0, MAX_ENGINES)
        .map((row) => usageRowOf(row, false))
        .filter((row): row is TokenRow => row !== null),
      daily: dailyOf(body.daily),
      problem: body.problem === true,
    };
  } catch {
    return none("unreachable");
  }
}

/** What a person is told when a change is asked of a session that is not at the computer. */
const NOT_AT_THE_COMPUTER =
  "Change this on the computer FreeDuet runs on. Nothing was changed.";
/** D106: with sign-in and a secret, the way in is to pair this browser, so the sentence says how. */
const NOT_PAIRED_WITH_THE_COMPUTER =
  "Pair this browser with the computer FreeDuet runs on first (run `bash scripts/open.sh` there and open the link in this browser), or change this on that computer. Nothing was changed.";
const NO_CHOICES_HERE =
  "This installation does not keep engine choices, so nothing was changed.";
const NO_SUCH_CHANGE = "There is no engine change with that id.";

/**
 * The routes of the sub-app, which is mounted at `/api/freeduet/engines`. Behind the same sign-in as every other
 * administrator route: a person who is not an administrator is refused with 403. `choices` is where the person's
 * choices are kept (engine-choices.ts); without it the page is the read-only one of slice 6, and nothing can be changed.
 * `pairing` is the installation's gate where there is sign-in and a secret, which makes a browser that is not paired
 * with this computer not "at the computer" (at-the-computer.ts); absent, the question is what it was.
 */
export function createEnginesRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  reach: () => EnginesReach,
  choices?: EngineChoices,
  pairing?: PairingGate,
  /** Where provider and key changes are recorded (D109). Without it they are refused: a change with no record is not made. */
  audit?: AuditSink,
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
      : !(
            await mayChangeEngines(
              context.env,
              context.req.raw,
              pairing,
              context.var.actor.id,
            )
          ).allowed
        ? pairing
          ? "not_paired_with_the_computer"
          : "not_at_the_computer"
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
    const cards = listed ? await readProviders(reach()) : null;
    return context.json(
      { ...agent.reading, ...dashboard, ...(cards ?? {}) },
      200,
      noStore,
    );
  });

  // D102: the token counter. Read-only, the same authority as the page itself (administrators), and no change is made.
  routes.get("/usage", async (context) => {
    const denied = requireAdmin(context);
    if (denied) return denied;
    return context.json(await readUsage(reach()), 200, {
      "Cache-Control": "no-store",
    });
  });

  /**
   * The two guards every change passes before anything is read: an administrator, at the computer or (D106) signed in
   * from a browser paired with it as a `computer`. A change that came through a tunnel is marked, for the audit trail.
   */
  const mayChange = async (context: Parameters<typeof requireAdmin>[0]) => {
    const denied = requireAdmin(context);
    if (denied) return { refused: denied, viaTunnel: false };
    const verdict = await mayChangeEngines(
      context.env,
      context.req.raw,
      pairing,
      context.var.actor.id,
    );
    return verdict.allowed
      ? { refused: undefined, viaTunnel: verdict.viaTunnel }
      : {
          refused: context.json(
            {
              error: pairing
                ? NOT_PAIRED_WITH_THE_COMPUTER
                : NOT_AT_THE_COMPUTER,
            },
            403,
          ),
          viaTunnel: false,
        };
  };

  routes.put("/members/:memberId/mode", async (context) => {
    const { refused, viaTunnel } = await mayChange(context);
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
        ...(viaTunnel ? { via: "tunnel" as const } : {}),
      });
      return context.json(outcome, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      if (error instanceof EngineChoiceRefusedError)
        return context.json({ error: error.message }, error.status);
      throw error;
    }
  });

  routes.post("/changes/:changeId/undo", async (context) => {
    const { refused, viaTunnel } = await mayChange(context);
    if (refused) return refused;
    if (!choices) return context.json({ error: NO_CHOICES_HERE }, 503);
    const changeId = context.req.param("changeId");
    if (!CHANGE_ID.test(changeId))
      return context.json({ error: NO_SUCH_CHANGE }, 404);
    try {
      const outcome = await choices.undo({
        changeId: changeId.toLowerCase(),
        actorUserId: context.var.actor.id,
        ...(viaTunnel ? { via: "tunnel" as const } : {}),
      });
      return context.json(outcome, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      if (error instanceof EngineChoiceRefusedError)
        return context.json({ error: error.message }, error.status);
      throw error;
    }
  });

  // ── The provider cards (D109). The same two guards as every change here: an administrator, at the computer or (D106) with
  // a browser paired as a `computer`. A key arrives only in the body of `PUT /providers/:id/key`, goes to agent-freeduet
  // and nowhere else, and is in no answer, no audit row and no log line: this file never logs. A member's tool cannot reach
  // these routes (they take the person's session, and a remote session is refused in remote-limits.ts).
  const providerGuard = async (context: Parameters<typeof requireAdmin>[0]) => {
    const { refused, viaTunnel } = await mayChange(context);
    if (refused) return { refused, viaTunnel, id: null as ProviderId | null };
    const id = context.req.param("providerId") ?? "";
    if (!isProviderId(id)) {
      return {
        refused: context.json(
          { error: PANEL_SENTENCES.unknown_provider, code: "unknown_provider" },
          404,
        ),
        viaTunnel,
        id: null as ProviderId | null,
      };
    }
    return { refused: undefined, viaTunnel, id: id as ProviderId | null };
  };
  const recordProvider = async (
    actorUserId: string,
    providerId: ProviderId,
    change: string,
    extra: Record<string, unknown>,
    viaTunnel: boolean,
  ) => {
    await audit?.record({
      eventType: "configuration.changed",
      targetType: "engine_provider",
      targetId: providerId,
      actorUserId,
      payload: {
        change,
        providerId,
        ...extra,
        ...(viaTunnel ? { via: "tunnel" } : {}),
      },
    });
  };
  const noStore = { "Cache-Control": "no-store" };

  routes.put("/providers/:providerId", async (context) => {
    const { refused, viaTunnel, id } = await providerGuard(context);
    if (refused || !id) return refused as Response;
    if (!audit) return context.json({ error: NO_AUDIT, code: "no_audit" }, 503);
    let body: Record<string, unknown> = {};
    try {
      const parsed = await context.req.json();
      if (parsed && typeof parsed === "object")
        body = parsed as Record<string, unknown>;
    } catch {
      // Not JSON: nothing to change, and the agent says so.
    }
    const send: Record<string, unknown> = {};
    if ("enabled" in body) send.enabled = body.enabled;
    if ("baseUrl" in body) send.baseUrl = body.baseUrl;
    // D116: a model reaches the agent only as a short string; the agent's guard (a free model only) decides the rest.
    if (
      "model" in body &&
      typeof body.model === "string" &&
      body.model.length <= MAX_MODEL_CHARACTERS
    )
      send.model = body.model;
    if ("members" in body) send.members = body.members;
    const answer = await callPanel(reach(), "PUT", `/${id}`, send);
    const card = providerOf(
      (answer?.body as { provider?: unknown } | null)?.provider,
    );
    if (answer?.status !== 200 || !card) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    await recordProvider(
      context.var.actor.id,
      id,
      "engine_provider_changed",
      {
        fields: Object.keys(send),
        ...(typeof send.enabled === "boolean" ? { enabled: send.enabled } : {}),
        ...(Array.isArray(send.members)
          ? {
              members: send.members
                .filter(
                  (id): id is string =>
                    typeof id === "string" && MEMBER_ID_LIST.test(id),
                )
                .slice(0, 64),
            }
          : {}),
      },
      viaTunnel,
    );
    return context.json({ provider: card }, 200, noStore);
  });

  // D112: one member's engines in a new order, by hand. The same guard and the same audit as a card change. The body is
  // the member's whole chain as the page shows it, in the new order; agent-freeduet checks that it is a permutation of the
  // chain, keeps logins first and writes only its own marked file. Nothing else of the body is forwarded.
  routes.put("/members/:memberId/order", async (context) => {
    const { refused, viaTunnel } = await mayChange(context);
    if (refused) return refused;
    if (!audit) return context.json({ error: NO_AUDIT, code: "no_audit" }, 503);
    const memberId = context.req.param("memberId");
    if (!MEMBER_ID_LIST.test(memberId))
      return context.json(
        {
          error: PANEL_SENTENCES.unknown_member,
          code: "unknown_member",
        },
        404,
      );
    let order: unknown;
    let confirmed: unknown;
    try {
      const sent = (await context.req.json()) as {
        order?: unknown;
        confirmed?: unknown;
      } | null;
      order = sent?.order;
      confirmed = sent?.confirmed;
    } catch {
      // Not JSON: there is no order in it, and the answer below says so.
    }
    if (
      !Array.isArray(order) ||
      order.length > MAX_ORDER ||
      !order.every((id) => typeof id === "string" && ENGINE_ID.test(id)) ||
      // D115: the confirmation is a boolean and nothing else; a word or a number that looks like a yes is not one.
      (confirmed !== undefined && typeof confirmed !== "boolean")
    )
      return context.json(
        { error: PANEL_SENTENCES.order_shape, code: "order_shape" },
        400,
      );
    const answer = await callPanel(
      reach(),
      "PUT",
      `/members/${memberId}/order`,
      confirmed === true ? { order, confirmed: true } : { order },
    );
    const raw = answer?.body as {
      chain?: unknown;
      changed?: unknown;
      ownOrder?: unknown;
      confirmedKind?: unknown;
    } | null;
    const chain = Array.isArray(raw?.chain)
      ? raw.chain
          .filter(
            (id): id is string => typeof id === "string" && ENGINE_ID.test(id),
          )
          .slice(0, MAX_ORDER)
      : null;
    if (answer?.status !== 200 || !chain) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    const changed = raw?.changed === true;
    const ownOrder = raw?.ownOrder === true;
    // D115: what the person confirmed is what the agent says it needed confirming, not what the request claimed.
    const confirmedKind = orderBreakKind(raw?.confirmedKind);
    if (changed) {
      await audit.record({
        eventType: "configuration.changed",
        targetType: "engine_member_order",
        targetId: memberId,
        actorUserId: context.var.actor.id,
        payload: {
          change: "engine_order_changed",
          memberId,
          newValue: chain,
          ownOrder,
          ...(confirmedKind
            ? { confirmed: true, confirmedKind }
            : { confirmed: false }),
          ...(viaTunnel ? { via: "tunnel" } : {}),
        },
      });
    }
    return context.json({ memberId, chain, changed, ownOrder }, 200, noStore);
  });

  routes.put("/providers/:providerId/key", async (context) => {
    const { refused, viaTunnel, id } = await providerGuard(context);
    if (refused || !id) return refused as Response;
    if (!audit) return context.json({ error: NO_AUDIT, code: "no_audit" }, 503);
    let key: unknown;
    try {
      const text = await context.req.text();
      if (text.length <= MAX_KEY_BODY_CHARACTERS) {
        key = (JSON.parse(text) as { key?: unknown } | null)?.key;
      }
    } catch {
      // Not JSON: no key, and the agent refuses it by shape.
    }
    const answer = await callPanel(reach(), "PUT", `/${id}/key`, {
      key: typeof key === "string" ? key : null,
    });
    if (answer?.status !== 200) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    await recordProvider(
      context.var.actor.id,
      id,
      "engine_key_saved",
      {},
      viaTunnel,
    );
    return context.json({ keySaved: true }, 200, noStore);
  });

  routes.delete("/providers/:providerId/key", async (context) => {
    const { refused, viaTunnel, id } = await providerGuard(context);
    if (refused || !id) return refused as Response;
    if (!audit) return context.json({ error: NO_AUDIT, code: "no_audit" }, 503);
    const answer = await callPanel(reach(), "DELETE", `/${id}/key`);
    if (answer?.status !== 200) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    await recordProvider(
      context.var.actor.id,
      id,
      "engine_key_removed",
      {},
      viaTunnel,
    );
    return context.json({ keySaved: false }, 200, noStore);
  });

  // Load list and Test use the SAVED key inside agent-freeduet; nothing is stored, so no audit row (like "Check again").
  routes.post("/providers/:providerId/models", async (context) => {
    const { refused, id } = await providerGuard(context);
    if (refused || !id) return refused as Response;
    const answer = await callPanel(reach(), "POST", `/${id}/models`);
    if (answer?.status !== 200) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    const raw = answer.body as { code?: unknown; models?: unknown };
    const code =
      CHECK_CODES.find((known) => known === raw.code) ?? "unreachable";
    const models = (Array.isArray(raw.models) ? raw.models : [])
      .filter(
        (name): name is string =>
          typeof name === "string" && name.length <= 120,
      )
      .slice(0, MAX_MODELS);
    return context.json({ ok: code === "ok", code, models }, 200, noStore);
  });

  // D116: the free models that support tools, from OpenRouter's public list (no key is used), read through the agent. Nothing
  // is stored, so no audit row. Only a closed shape comes back: ids that pass the free-model guard, and one word for where
  // the list came from.
  routes.post("/providers/:providerId/free-models", async (context) => {
    const { refused, id } = await providerGuard(context);
    if (refused || !id) return refused as Response;
    const answer = await callPanel(reach(), "POST", `/${id}/free-models`);
    if (answer?.status !== 200) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    const raw = answer.body as { models?: unknown; source?: unknown };
    const models = (Array.isArray(raw.models) ? raw.models : [])
      .filter(
        (name): name is string =>
          typeof name === "string" &&
          name.length <= MAX_MODEL_CHARACTERS &&
          (name === FREE_ROUTER || FREE_MODEL.test(name)),
      )
      .slice(0, MAX_MODELS);
    const source =
      FREE_SOURCES.find((known) => known === raw.source) ?? "fallback";
    return context.json(
      { models: models.length > 0 ? models : [FREE_ROUTER], source },
      200,
      noStore,
    );
  });

  routes.post("/providers/:providerId/test", async (context) => {
    const { refused, id } = await providerGuard(context);
    if (refused || !id) return refused as Response;
    const answer = await callPanel(reach(), "POST", `/${id}/test`);
    if (answer?.status !== 200) {
      const failure = panelRefusal(answer);
      return context.json(failure.body, failure.status);
    }
    const raw = answer.body as { code?: unknown };
    const code =
      CHECK_CODES.find((known) => known === raw.code) ?? "unreachable";
    return context.json({ ok: code === "ok", code }, 200, noStore);
  });
  // "Check again" (first-start design, section 4): the two guards of a change, an administrator at the computer. It asks
  // agent-freeduet to look at Claude Code now and keeps nothing here: no change is stored and no audit row is written.
  // Hosted FreeDuet (FREEDUET_DEPLOYMENT=hosted, first-start decision D6) does not offer a Claude plan's sign-in, so the
  // route does not exist there: 404, for everybody, before any other question is asked.
  routes.post("/claude/check", async (context) => {
    if (isHosted(reach().environment))
      return context.json({ error: "Not found" }, 404);
    const { refused } = await mayChange(context);
    if (refused) return refused;
    return context.json(await checkClaude(reach()), 200, {
      "Cache-Control": "no-store",
    });
  });
  return routes;
}
