/**
 * The state-changing routes of the Engines page refuse a request with no sign-in, before anything is read or forwarded.
 *
 * Every route in `engines-routes.ts` sits behind `requireUser` (`routes.use("*", requireUser)`), so a request with no
 * session is answered 401 by the sign-in guard, whatever the peer. The 403 tests of the order, provider, Claude and check
 * files never send a request without a session, so this file pins that case for each state-changing route:
 *   - the answer is 401;
 *   - the agent-freeduet stand-in is never asked (no panel, no key, no Claude check, no provider test);
 *   - nothing is recorded in the audit trail.
 * A control case sends the same requests with an administrator's session at the computer, and expects them to get past
 * the sign-in guard, so the refusal above is the guard's and not a route that never answers.
 *
 * Mode: the same as the `/members/:id/mode` 401 test in `freeduet-engines-dashboard.test.ts`. The sign-in service
 * answers no session, and the request comes from this machine's loopback (`LOOPBACK_PEER`), so the only reason for
 * the refusal is the missing session. The implicit single-user administrator (auth/peer.ts) is not exercised here.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  type AuthService,
  createRequireUser,
  type RoleRepository,
} from "../src/auth/guards";
import type { EngineChoices } from "../src/freeduet/engine-choices";
import {
  createEnginesRoutes,
  type EnginesReach,
} from "../src/freeduet/engines-routes";
import { LOOPBACK_PEER } from "./support/loopback-peer";

const TOKEN = "no-session-agent-token";
/** A key-shaped canary: it must never reach the agent when the request has no session. */
const CANARY_KEY = "gsk_CANARYnoSessionKey0123456789";
const PROVIDER = "groq";
const MEMBER = "chef";

type Seen = { method: string; path: string };
const stubs: { stop: () => void }[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

/** A stand-in for agent-freeduet that records every request it is sent, and answers with the token checked. */
function agent() {
  const seen: Seen[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const path = new URL(request.url).pathname;
      seen.push({ method: request.method, path });
      await request.text();
      if (request.headers.get("x-openbot-agent-token") !== TOKEN)
        return Response.json({ error: "unauthorised" }, { status: 401 });
      if (path === "/engines")
        return Response.json({
          engines: [
            { id: "claude", label: "Claude Code", kind: "cli", state: "ready" },
          ],
          members: [],
          choices_version: 1,
        });
      return Response.json({ ok: true });
    },
  });
  stubs.push({ stop: () => server.stop(true) });
  const reach: EnginesReach = {
    environment: {},
    managedAgent: {
      endpoint: new URL(`http://127.0.0.1:${server.port}/`),
      token: TOKEN,
    },
  };
  return { seen, reach };
}

/** The sub-app as the app mounts it, behind the production sign-in guard. `signedIn` decides whether there is a session. */
function enginesWith(
  reach: EnginesReach,
  options: { signedIn: boolean },
  audit: unknown[],
) {
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () =>
        options.signedIn
          ? {
              user: {
                id: "person-1",
                email: "person@openbot.test",
                role: "admin",
              },
            }
          : null,
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const calls = { choices: 0 };
  const choices = {
    load: async () => {
      calls.choices += 1;
    },
    current: () => {
      calls.choices += 1;
      return { state: "ready", members: new Map() };
    },
    setMode: async () => {
      calls.choices += 1;
      return {};
    },
    undo: async () => {
      calls.choices += 1;
      return {};
    },
  } as unknown as EngineChoices;
  const sink = {
    record: async (event: unknown) => void audit.push(event),
  };
  const app = new Hono();
  app.route(
    "/api/freeduet/engines",
    createEnginesRoutes(
      createRequireUser(auth, roles),
      () => reach,
      choices,
      undefined,
      sink,
    ),
  );
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api/freeduet/engines${path}`,
      {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      LOOPBACK_PEER,
    );
  return { call, calls };
}

/** The state-changing routes, each with a body that would be acted on if the sign-in guard let it through. */
const STATE_ROUTES: [string, string, string, unknown?][] = [
  [
    "order",
    "PUT",
    `/members/${MEMBER}/order`,
    { order: ["claude-code", "ollama-member"] },
  ],
  [
    "claude",
    "PUT",
    `/members/${MEMBER}/claude`,
    { model: "haiku", effort: "low" },
  ],
  ["provider", "PUT", `/providers/${PROVIDER}`, { enabled: false }],
  ["key PUT", "PUT", `/providers/${PROVIDER}/key`, { key: CANARY_KEY }],
  ["key DELETE", "DELETE", `/providers/${PROVIDER}/key`],
  ["models", "POST", `/providers/${PROVIDER}/models`],
  ["free-models", "POST", `/providers/${PROVIDER}/free-models`],
  ["provider test", "POST", `/providers/${PROVIDER}/test`],
  ["claude check", "POST", "/claude/check"],
];

describe("the state-changing engine routes refuse a request with no sign-in", () => {
  test.each(STATE_ROUTES)(
    "%s: no session gets 401, the agent is never asked, and nothing is recorded",
    async (_name, method, path, body) => {
      const stand = agent();
      const audit: unknown[] = [];
      const { call, calls } = enginesWith(
        stand.reach,
        { signedIn: false },
        audit,
      );
      const answer = await call(method, path, body);
      expect(answer.status).toBe(401);
      expect(stand.seen).toHaveLength(0);
      expect(audit).toHaveLength(0);
      expect(calls.choices).toBe(0);
    },
  );

  test("no sign-in never carries the key to the agent, even when the key is in the body", async () => {
    const stand = agent();
    const audit: unknown[] = [];
    const { call } = enginesWith(stand.reach, { signedIn: false }, audit);
    const answer = await call("PUT", `/providers/${PROVIDER}/key`, {
      key: CANARY_KEY,
    });
    expect(answer.status).toBe(401);
    expect(await answer.text()).not.toContain(CANARY_KEY);
    expect(stand.seen).toHaveLength(0);
  });

  test("control: the same requests with an administrator's session get past the sign-in guard", async () => {
    const stand = agent();
    const audit: unknown[] = [];
    const { call } = enginesWith(stand.reach, { signedIn: true }, audit);
    for (const [, method, path, body] of STATE_ROUTES) {
      const answer = await call(method, path, body);
      expect(answer.status).not.toBe(401);
    }
    expect(stand.seen.length).toBeGreaterThan(0);
  });
});
