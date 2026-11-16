/**
 * The assembled app for a deployment with sign-in, with a fake behind each door that matters.
 *
 * Shared by the tests of the remote-session limits (docs/design/phone-and-remote.md 3.5): the pairing
 * doors, the classification, the list and the approvals rule. A session is a header a test sets
 * (`x-test-session`), standing in for Better Auth's cookie, so these tests need no database; the one
 * that does (`remote-limits.integration.test.ts`) goes through the real `createAuth`.
 */
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { createApp } from "../../src/app";
import type { AuditStore } from "../../src/audit";
import type { ApprovalService } from "../../src/approvals/service";
import type { AuthService, RoleRepository } from "../../src/auth/guards";
import {
  type BrowserPairings,
  createBrowserPairings,
  createMemoryPairingStore,
  type PairingKind,
  pairCookieName,
  secretTagOf,
} from "../../src/auth/browser-pairings";
import { installCookieName } from "../../src/auth/install-secret";
import { createChannelEventHub } from "../../src/channels/events";
import type { ChannelStore } from "../../src/channels/routes";
import { type DeploymentConfig, loadConfig } from "../../src/config";
import type { RoutineRunner } from "../../src/routines/runner";
import { testEnvironment } from "./environment";

/** What `openssl rand -hex 32` makes: 64 characters. Recognisable, so a leak is found by searching. */
export const SECRET = "d3adb33f".repeat(8);

/** A deployment with sign-in, and this installation's secret unless the test says there is none. */
export function signInConfig(
  overrides: Record<string, string | undefined> = {},
  withSecret = true,
): DeploymentConfig {
  return loadConfig(
    {
      ...testEnvironment(),
      ...(withSecret ? { FREEDUET_INSTALL_SECRET: SECRET } : {}),
      ...overrides,
    },
    {},
  );
}

/** The OLD cookie, as a browser paired before D49 sends it: the secret itself. Upgraded once, on a signed-in request. */
export const legacyCookie = (config: Pick<DeploymentConfig, "port">) =>
  `${installCookieName(config.port)}=${SECRET}`;

/**
 * A token a test browser holds. Fixed and recognisable, 43 characters like a real one, so a leak is found by
 * searching; `seedPairings` makes the matching pairing for each person.
 */
export const tokenFor = (who: keyof typeof PEOPLE, kind: PairingKind) =>
  createHash("sha256").update(`test-token:${who}:${kind}`).digest("base64url");

/** The header of a browser paired with this computer as `who`, the way a pairing's cookie is sent (D49). */
export const pairedCookie = (
  config: Pick<DeploymentConfig, "port">,
  who: keyof typeof PEOPLE = "admin",
  kind: PairingKind = "computer",
) => `${pairCookieName(config.port)}=${tokenFor(who, kind)}`;

/** A store with one live pairing of each kind for each person, and the service over it, made under SECRET. */
export function seedPairings(
  config: Pick<DeploymentConfig, "port" | "appUrl">,
  options: { now?: () => number; audit?: AuditStore } = {},
) {
  const store = createMemoryPairingStore();
  const service: BrowserPairings = createBrowserPairings({
    store,
    secret: SECRET,
    port: config.port,
    secure: config.appUrl?.startsWith("https://") ?? false,
    ...(options.audit ? { audit: options.audit } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const at = new Date((options.now ?? Date.now)());
  for (const [who, person] of Object.entries(PEOPLE))
    for (const kind of ["computer", "device"] as const)
      void store.insert({
        id: `seed-${who}-${kind}`,
        userId: person.id,
        label: `${kind} of ${who}`,
        kind,
        tokenHash: createHash("sha256")
          .update(tokenFor(who as keyof typeof PEOPLE, kind))
          .digest("hex"),
        secretTag: secretTagOf(SECRET),
        createdAt: at,
        lastSeenAt: at,
        expiresAt: new Date(at.getTime() + 400 * 86_400_000),
      });
  return { store, service };
}

/** A peer, as `server.requestIP` reports it, for a request handed straight to the app. */
export const peerAt = (address: string) => ({
  server: { requestIP: () => ({ address }) },
});

/** Who a test's session header names. `ghost` is signed in with no role at all. */
export const PEOPLE = {
  admin: { id: "u-admin", email: "admin@openbot.test", role: "admin" as const },
  user: { id: "u-user", email: "user@openbot.test", role: "user" as const },
  ghost: { id: "u-ghost", email: "ghost@openbot.test", role: undefined },
};

/** Better Auth's session lookup, answered from `x-test-session: admin | user | ghost`. */
export const stubAuth: AuthService = {
  handler: async () => new Response("auth"),
  api: {
    getSession: async ({ headers }) => {
      const who = headers.get("x-test-session");
      const person =
        who && who in PEOPLE ? PEOPLE[who as keyof typeof PEOPLE] : null;
      return person ? { user: person } : null;
    },
  },
};
export const stubRoles: RoleRepository = { rolesForUser: async () => [] };

/** What the routes behind the guard did, so a refusal can be shown to have written nothing. */
export type Calls = {
  rules: unknown[];
  decisions: { id: string; decision: string }[];
  /** A question answered: which one, with what, and the options the route passed (remote or not). */
  answers: { id: string; response: string; options: unknown }[];
  fullAccess: unknown[];
  tools: number;
  copilot: string[];
  routines: number;
  channels: string[];
};

/**
 * The assembled app. `extra` replaces `createApp`'s positional arguments by index, as the other
 * assembly helpers do; `approval` is what the fake approval service says about a request's action.
 */
export function assembleSignIn(
  config: DeploymentConfig,
  extra: Record<number, unknown> = {},
  approval: { action?: unknown } = {},
  pairingOptions: { now?: () => number; audit?: AuditStore } = {},
) {
  const calls: Calls = {
    rules: [],
    decisions: [],
    answers: [],
    fullAccess: [],
    tools: 0,
    copilot: [],
    routines: 0,
    channels: [],
  };
  const approvals = {
    inbox: async () => ({ pending: [], requests: [] }),
    createRule: async (_owner: string, input: unknown) => {
      calls.rules.push(input);
      return { id: "rule-1", ...(input as object) };
    },
    decide: async (_owner: string, id: string, decision: string) => {
      calls.decisions.push({ id, decision });
      return { id, status: decision === "deny" ? "denied" : "approved" };
    },
    answerQuestion: async (
      _owner: string,
      id: string,
      response: string,
      options?: unknown,
    ) => {
      calls.answers.push({ id, response, options });
      return { id, status: "answered" };
    },
    store: {
      get: async (_owner: string, id: string) => ({
        id,
        status: "pending",
        action: approval.action,
      }),
    },
  } as unknown as ApprovalService;
  // Shaped as `createCopilotHonoHandler` builds it: a base path and one catch-all under it.
  const runtime = new Hono().basePath("/api/copilotkit").all("*", (context) => {
    calls.copilot.push(`${context.req.method} ${context.req.path}`);
    return context.json({ reached: "runtime" });
  });
  const channels = {
    list: async () => {
      calls.channels.push("list");
      return { channels: [], nextCursor: null };
    },
  } as unknown as ChannelStore;

  const { store, service: pairings } = seedPairings(config, pairingOptions);
  const args: unknown[] = new Array(38).fill(undefined);
  args[0] = config;
  args[1] = stubAuth;
  args[2] = stubRoles;
  args[6] = runtime;
  args[10] = channels;
  args[11] = createChannelEventHub();
  args[21] = {
    run: async () => {
      calls.routines += 1;
    },
  } as unknown as RoutineRunner;
  args[28] = async () => {
    calls.tools += 1;
    return { text: "tool ran", isError: false };
  };
  args[34] = { approvals, pairings };
  for (const [index, value] of Object.entries(extra))
    args[Number(index)] = value;
  const app = (
    createApp as (...values: unknown[]) => ReturnType<typeof createApp>
  )(...args);
  return { app, calls, pairings, store };
}
