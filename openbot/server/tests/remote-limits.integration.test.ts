/**
 * A remote session, through the real app, the real sign-in and a real database
 * (docs/design/phone-and-remote.md 3.5, decided 14 November 2026).
 *
 * WHAT IS REAL. `createAuth` (Better Auth, with the sign-in callback of a provider), the role table, the
 * session lookup every guard makes, and `createApp` with the middleware that limits a remote session. For
 * the live screen, `startHttpServer` and a raw socket.
 *
 * WHAT THE PROVIDER IS. A small server in this file that speaks the three endpoints Better Auth's OAuth
 * sign-in needs and says whoever the test says is signing in (the recipe of
 * `freeduet-signin-allowlist-callback.integration.test.ts`). It is NOT Okta, Google or Entra. It proves
 * what this deployment does with a session; not that any real provider hands one out, and not what a phone
 * or a tunnel does to a request on its way here. No phone, no real provider and no tunnel took part.
 *
 * WHAT THE ROUTES BEHIND THE GUARD ARE. Fakes that count what they were asked, so a refusal can be shown to
 * have changed nothing: a rule written, a decision taken, a tool run, a routine started.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { inArray } from "drizzle-orm";
import { REMOTE_ANSWER_SENTENCE } from "../src/approvals/remote-answer";
import { createAuditStore } from "../src/audit";
import { createAuth } from "../src/auth";
import { createRoleRepository } from "../src/auth/guards";
import {
  LEDGER,
  REMOTE_SESSION_LIMITED,
  REMOTE_SESSION_SENTENCE,
} from "../src/auth/remote-limits";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { startHttpServer } from "../src/http-server";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import {
  assembleSignIn,
  pairedCookie,
  peerAt,
  signInConfig,
} from "./support/signin-app";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const run = randomUUID().slice(0, 8);
const ADMIN = `admin-${run}@openbot.test`;
const ALICE = `alice-${run}@openbot.test`;
const ORIGIN = "http://localhost:3001";
const WORKER_SECRET = "worker-shared-secret-for-this-test";

let signingIn = ADMIN;
let idp: ReturnType<typeof Bun.serve>;
let issuer = "";

// A fake behind a route that is let through throws for what it does not hold, and the route logs it.
const quiet = [
  spyOn(console, "error").mockImplementation(() => {}),
  spyOn(console, "info").mockImplementation(() => {}),
];

beforeAll(() => {
  idp = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      switch (url.pathname) {
        case "/.well-known/openid-configuration":
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            userinfo_endpoint: `${issuer}/userinfo`,
          });
        case "/authorize": {
          const back = new URL(url.searchParams.get("redirect_uri") ?? "");
          back.searchParams.set("code", "the-code");
          back.searchParams.set("state", url.searchParams.get("state") ?? "");
          return new Response(null, {
            status: 302,
            headers: { location: back.toString() },
          });
        }
        case "/token":
          return Response.json({
            access_token: "the-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid profile email",
          });
        case "/userinfo":
          return Response.json({
            id: `subject-${signingIn}`,
            email: signingIn,
            name: signingIn,
            email_verified: true,
          });
        default:
          return new Response("not found", { status: 404 });
      }
    },
  });
  issuer = `http://127.0.0.1:${idp.port}`;
});

afterAll(async () => {
  for (const spy of quiet) spy.mockRestore();
  idp.stop(true);
  await database.delete(users).where(inArray(users.email, [ADMIN, ALICE]));
  await database.$client.close();
});

/** The settings of a sign-in deployment that has this installation's secret, unless the test says not. */
const environment = () => ({
  OKTA_OAUTH_CLIENT_ID: "okta-client",
  OKTA_OAUTH_CLIENT_SECRET: "okta-client-secret-long-enough",
  OKTA_OAUTH_ISSUER: issuer,
  INITIAL_ADMIN_EMAILS: ADMIN,
  WORKER_SHARED_SECRET: WORKER_SECRET,
  AGENT_COMPUTER_URL: "http://127.0.0.1:9",
});

/** One sign-in as a browser does it. Returns the `Cookie` header that browser then sends. */
async function signIn(
  auth: ReturnType<typeof createAuth>,
  who: string,
): Promise<string> {
  signingIn = who;
  const start = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        provider: "okta",
        callbackURL: "/",
        disableRedirect: true,
      }),
    }),
  );
  const { url } = (await start.json()) as { url: string };
  const startCookie = start.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
  const atProvider = await fetch(url, { redirect: "manual" });
  const callback = atProvider.headers.get("location") ?? "";
  const response = await auth.handler(
    new Request(callback, { headers: { cookie: startCookie } }),
  );
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
  expect(cookie).toContain("better-auth.session_token");
  return cookie;
}

/** What the store holds for any request here: a plain email, which the gate settled as "ask". */
const ORDINARY_REQUEST = {
  actorId: "u-admin",
  botId: "otto",
  toolRef: "mcp__gmail__GMAIL_SEND_EMAIL",
  effect: "send",
  scope: "friend@example.test",
  args: { to: "friend@example.test", subject: "Lunch" },
  policy: { behaviour: "ask", source: "default", reason: "Asked every time." },
};

type Setup = {
  config: ReturnType<typeof signInConfig>;
  app: ReturnType<typeof assembleSignIn>["app"];
  calls: ReturnType<typeof assembleSignIn>["calls"];
  auth: ReturnType<typeof createAuth>;
  sessions: { admin: string; alice: string };
};

/** A deployment: the real sign-in over the real database, and fakes behind the routes. */
async function deployment(withSecret = true): Promise<Setup> {
  const config = signInConfig(environment(), withSecret);
  const auth = createAuth(
    config,
    database,
    async () => false,
    createAuditStore(database),
  );
  const { app, calls } = assembleSignIn(
    config,
    { 1: auth, 2: createRoleRepository(database) },
    { action: ORDINARY_REQUEST },
  );
  // The first sign-in of an address in INITIAL_ADMIN_EMAILS makes the administrator.
  const admin = await signIn(auth, ADMIN);
  const alice = await signIn(auth, ALICE);
  return { config, app, calls, auth, sessions: { admin, alice } };
}

type Ask = {
  method?: string;
  who?: "admin" | "alice" | "nobody";
  paired?: boolean;
  cookie?: string;
  headers?: Record<string, string>;
  body?: unknown;
  peer?: unknown;
};

function asker(setup: Setup) {
  return (path: string, options: Ask = {}) => {
    const method = options.method ?? "GET";
    const who = options.who ?? "admin";
    const cookie = [
      who === "nobody" ? "" : setup.sessions[who],
      options.paired ? pairedCookie(setup.config) : "",
      options.cookie ?? "",
    ]
      .filter(Boolean)
      .join("; ");
    const writes = method !== "GET" && method !== "HEAD";
    return setup.app.request(
      `${ORIGIN}${path}`,
      {
        method,
        headers: {
          origin: ORIGIN,
          ...(cookie ? { cookie } : {}),
          ...(writes ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
        ...(writes ? { body: JSON.stringify(options.body ?? {}) } : {}),
      },
      options.peer ?? LOOPBACK_PEER,
    );
  };
}

/** Whether the answer is the refusal of a remote session, and says what it should. */
async function isLimited(answer: Response): Promise<boolean> {
  if (answer.status !== 403) return false;
  const body = (await answer
    .clone()
    .json()
    .catch(() => null)) as {
    error?: string;
    code?: string;
  } | null;
  if (body?.code !== REMOTE_SESSION_LIMITED) return false;
  expect([REMOTE_SESSION_SENTENCE, REMOTE_ANSWER_SENTENCE]).toContain(
    body.error as string,
  );
  return true;
}

/** What a remote session sends to change what the assistants may do, or who may reach them. */
const POWERS: [string, string, unknown?][] = [
  ["PUT", "/api/approvals/full-access/iris", { mode: "on" }],
  ["PUT", "/api/approvals/full-access/iris", { mode: "no-payments" }],
  ["GET", "/api/approvals/full-access"],
  ["POST", "/api/approvals/rules", { toolRef: "*", behaviour: "allow" }],
  ["PATCH", "/api/approvals/rules/r1"],
  ["DELETE", "/api/approvals/rules/r1"],
  ["PATCH", "/api/approvals/preferences"],
  ["PATCH", "/api/approvals/team"],
  ["POST", "/api/approvals/team/rules"],
  ["POST", "/api/approvals/computer/bot-1"],
  ["POST", "/api/approvals/shared-use/s1/approve"],
  ["PATCH", "/api/settings/preferences"],
  ["PUT", "/api/settings/instructions"],
  ["POST", "/api/routines/r1/run"],
  ["PUT", "/api/routines/r1/enabled"],
  ["DELETE", "/api/routines/r1"],
  ["POST", "/api/responsibilities"],
  ["POST", "/api/responsibilities/r1/triggers"],
  ["POST", "/api/proactive/settings"],
  ["POST", "/api/demonstrations"],
  ["POST", "/api/plugins/servers"],
  ["POST", "/api/plugins/servers/s1/connect"],
  ["POST", "/api/plugins/servers/s1/authorize"],
  ["POST", "/api/plugins/grants"],
  ["POST", "/api/identity/challenges"],
  ["DELETE", "/api/identity/links/l1"],
  ["GET", "/api/passwords"],
  ["DELETE", "/api/passwords/p1"],
  ["POST", "/api/sign-in-requests"],
  ["POST", "/api/computers/bot-1/exec"],
  ["GET", "/api/computers/bot-1/screenshot"],
  ["PUT", "/api/computers/policy"],
  ["POST", "/api/host-access/grants"],
  ["GET", "/api/admin/people"],
  ["POST", "/api/admin/people/u1/role"],
  ["POST", "/api/admin/credentials"],
  ["PUT", "/api/admin/enterprise/capabilities"],
  ["GET", "/api/freeduet/engines"],
  ["PUT", "/api/freeduet/engines/members/iris/mode", { mode: "ask-first" }],
  ["DELETE", "/api/channels/c1"],
  ["PUT", "/api/channels/c1/pin"],
  ["POST", "/api/groups"],
  // A post to a group is queued and answered by turns that carry no mark of the session (decision H).
  ["POST", "/api/groups/g1"],
  ["POST", "/api/groups/g1/members"],
  ["DELETE", "/api/groups/g1/members/u1"],
  ["POST", "/api/team-bots/b1/consents"],
  ["GET", "/api/memory"],
  ["DELETE", "/api/memory/m1"],
  ["PATCH", "/api/agents/iris"],
  ["POST", "/api/agents/iris/callback-token"],
  ["POST", "/api/bots/iris/pause"],
  ["POST", "/api/bots/iris/reset"],
  ["POST", "/internal/pairing"],
  ["POST", "/api/agent-tools/call"],
  ["POST", "/api/audio/transcriptions"],
  ["POST", "/api/voice/sessions"],
  ["POST", "/api/sandboxed"],
];

/**
 * The sign-in library's own calls on the account. Sent by a remote session they are refused; they are
 * never sent by a paired one here, because the real library would carry them out (revoke the sessions
 * these tests hold, delete the user).
 */
const ACCOUNT_CALLS: [string, string, unknown?][] = [
  ["POST", "/api/auth/revoke-sessions"],
  ["POST", "/api/auth/change-password"],
  ["POST", "/api/auth/update-user"],
  ["POST", "/api/auth/delete-user"],
  ["POST", "/api/auth/sso/register"],
  ["GET", "/api/auth/list-sessions"],
];

describe("a remote session: signed in, and not paired with this computer", () => {
  let setup: Setup;
  let ask: ReturnType<typeof asker>;
  beforeAll(async () => {
    setup = await deployment();
    ask = asker(setup);
  }, 60_000);

  test("is signed in, as the administrator, and the session is real (the guard has not changed)", async () => {
    const me = await ask("/api/me");
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user?: { role?: string } }).user?.role).toBe(
      "admin",
    );
    expect((await ask("/api/me", { who: "nobody" })).status).toBe(401);
  });

  test("reads, chats and sees an approval request: each allowed family reaches its handler", async () => {
    expect((await ask("/api/capabilities")).status).toBe(200);
    expect((await ask("/api/auth/get-session")).status).toBe(200);
    expect((await ask("/health", { who: "nobody" })).status).toBe(200);
    const channels = await ask("/api/channels");
    expect(channels.status).toBe(200);
    expect(setup.calls.channels).toContain("list");
    const run = await ask("/api/copilotkit/agent/iris/run", {
      method: "POST",
      body: { threadId: "t1" },
    });
    expect(run.status).toBe(200);
    expect((await ask("/api/copilotkit/info")).status).toBe(200);
    expect(setup.calls.copilot).toEqual([
      "POST /api/copilotkit/agent/iris/run",
      "GET /api/copilotkit/info",
    ]);
    expect((await ask("/api/approvals")).status).toBe(200);
  });

  test("answers an ordinary approval request once, and only once: allow always is left for the computer", async () => {
    const decide = (decision: string) =>
      ask("/api/approvals/req-1/decision", {
        method: "POST",
        body: { decision },
      });
    expect((await decide("allow_once")).status).toBe(200);
    expect(setup.calls.decisions).toEqual([
      { id: "req-1", decision: "allow_once" },
    ]);
    const refused = await decide("allow_always");
    expect(refused.status).toBe(403);
    expect(await isLimited(refused)).toBe(true);
    expect(setup.calls.decisions).toHaveLength(1);
  });

  test("no allowed family is refused by the list, whatever else its handler says", async () => {
    const allowed: [string, string, unknown?][] = [
      ["GET", "/api/channels/c1"],
      ["GET", "/api/channels/events"],
      ["POST", "/api/channels", { agentId: "iris" }],
      ["POST", "/api/channels/c1/activity"],
      ["POST", "/api/channels/c1/busy"],
      ["PUT", "/api/channels/c1/read"],
      ["GET", "/api/attachments/a1"],
      ["GET", "/api/groups/g1"],
      ["GET", "/api/agents"],
      ["GET", "/api/agents/iris"],
      ["GET", "/api/bots/attention"],
      ["GET", "/api/bots/iris/activity"],
      ["POST", "/api/bots/iris/activity/handoffs/stop"],
      ["GET", "/api/openduet/channels"],
      ["GET", "/api/settings/preferences"],
      ["POST", "/api/me/onboarding"],
      ["POST", "/api/route"],
      ["POST", "/api/threads/mint"],
      ["GET", "/api/threads/t1"],
      ["GET", "/api/copilotkit/threads"],
      ["GET", "/api/copilotkit/threads/t1/messages"],
      ["POST", "/api/copilotkit/agent/iris/connect"],
      ["POST", "/api/copilotkit/agent/iris/stop/t1"],
      ["POST", "/api/approvals/questions/q1/respond"],
      ["GET", "/index.html"],
      ["GET", "/channels/c1"],
    ];
    for (const [method, path, body] of allowed)
      expect([
        method,
        path,
        await isLimited(await ask(path, { method, body })),
      ]).toEqual([method, path, false]);
  });

  test("everything that changes what the assistants may do, or who may reach them, is refused with the sentence", async () => {
    // Counted from here: the tests before this one may have answered a request.
    setup.calls.decisions.length = 0;
    setup.calls.rules.length = 0;
    const before = JSON.stringify(setup.calls);
    for (const [method, path, body] of [...POWERS, ...ACCOUNT_CALLS]) {
      const answer = await ask(path, { method, body });
      expect([method, path, answer.status, await isLimited(answer)]).toEqual([
        method,
        path,
        403,
        true,
      ]);
    }
    // And nothing behind any of them ran: no rule, no decision, no tool, no routine.
    expect(JSON.stringify(setup.calls)).toBe(before);
    expect(setup.calls.rules).toEqual([]);
    expect(setup.calls.decisions).toEqual([]);
    expect(setup.calls.tools).toBe(0);
    expect(setup.calls.routines).toBe(0);
  });

  test("every refused family of the list is refused, whatever the method", async () => {
    const withAllowances = new Set(
      LEDGER.filter((entry) => entry.verdict === "allow").map(
        (entry) => entry.family,
      ),
    );
    let checked = 0;
    for (const entry of LEDGER.filter((each) => each.verdict === "refuse")) {
      const space = entry.route.indexOf(" ");
      const verb = entry.route.slice(0, space);
      const pattern = entry.route.slice(space + 1);
      if (pattern.endsWith("*") && withAllowances.has(entry.family)) continue;
      const path = pattern.replace(/:[A-Za-z]+/g, "p0").replace(/\*$/, "p0");
      for (const method of verb === "ALL"
        ? ["GET", "POST", "DELETE"]
        : [verb]) {
        checked += 1;
        expect([
          entry.route,
          method,
          await isLimited(await ask(path, { method })),
        ]).toEqual([entry.route, method, true]);
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(setup.calls.tools + setup.calls.routines).toBe(0);
  });

  test("the same person, paired with this computer, is not refused anywhere: everything is as it is today", async () => {
    for (const [method, path, body] of POWERS) {
      const answer = await ask(path, { method, body, paired: true });
      expect([method, path, await isLimited(answer)]).toEqual([
        method,
        path,
        false,
      ]);
    }
    // A write that has a handler here is carried out, not only let through.
    const rulesBefore = setup.calls.rules.length;
    const rule = await ask("/api/approvals/rules", {
      method: "POST",
      body: { toolRef: "*", behaviour: "allow" },
      paired: true,
    });
    expect(rule.status).toBeLessThan(300);
    expect(setup.calls.rules.length).toBe(rulesBefore + 1);
  });

  test("a person who is not an administrator is limited in the same way, and paired is paired for them too", async () => {
    const limited = await ask("/api/approvals/rules", {
      method: "POST",
      who: "alice",
    });
    expect(await isLimited(limited)).toBe(true);
    const paired = await ask("/api/approvals/rules", {
      method: "POST",
      who: "alice",
      paired: true,
    });
    expect(await isLimited(paired)).toBe(false);
  });

  test("forged facts change nothing: headers, the user agent, the host, the peer, the wrong cookie", async () => {
    const forged: Ask[] = [
      { headers: { "x-forwarded-for": "127.0.0.1" } },
      { headers: { "x-real-ip": "127.0.0.1", forwarded: "for=127.0.0.1" } },
      { headers: { "user-agent": "FreeDuet-Computer/1.0 (paired)" } },
      { headers: { host: "localhost:3001" } },
      { headers: { "x-freeduet-paired": "1", "x-install-secret": "yes" } },
      { headers: { authorization: "Bearer d3adb33fd3adb33f" } },
      { peer: undefined },
      { peer: peerAt("203.0.113.9") },
      { peer: peerAt("::1") },
      { cookie: "freeduet_install_3001=not-the-secret" },
      { cookie: "freeduet_install_1=d3adb33fd3adb33fd3adb33fd3adb33f" },
    ];
    for (const options of forged) {
      const answer = await ask("/api/approvals/full-access/iris", {
        method: "PUT",
        body: { mode: "on" },
        peer: "peer" in options ? options.peer : LOOPBACK_PEER,
        ...options,
      });
      expect([JSON.stringify(options), await isLimited(answer)]).toEqual([
        JSON.stringify(options),
        true,
      ]);
    }
    // The secret is not a thing a query can carry.
    const query = await ask(
      `/api/approvals/full-access/iris?freeduet_install_3001=${"d3adb33f".repeat(8)}`,
      { method: "PUT", body: { mode: "on" } },
    );
    expect(await isLimited(query)).toBe(true);
  });

  test("the cookie signs nobody in: with no session it is nobody, and the route's own guard answers", async () => {
    const withCookie = await ask("/api/me", { who: "nobody", paired: true });
    expect(withCookie.status).toBe(401);
    expect(await withCookie.json()).toEqual({
      error: "Authentication required.",
    });
    const power = await ask("/api/approvals/full-access/iris", {
      method: "PUT",
      who: "nobody",
      paired: true,
    });
    expect(power.status).toBe(401);
    expect(await isLimited(power)).toBe(false);
  });

  test("a door with a credential of its own still opens without a session, and no session opens one", async () => {
    const hand = (secret: string, options: Ask = {}) =>
      ask("/internal/routines/run", {
        method: "POST",
        who: "nobody",
        headers: { authorization: `Bearer ${secret}` },
        body: { routineRunId: "run-1" },
        ...options,
      });
    expect((await hand(WORKER_SECRET)).status).toBe(202);
    expect(setup.calls.routines).toBe(1);
    expect((await hand("a different secret")).status).toBe(401);
    // A signed-in browser that sends the worker's secret too is a session, and is refused.
    const mixed = await hand(WORKER_SECRET, { who: "admin" });
    expect(await isLimited(mixed)).toBe(true);
    expect(setup.calls.routines).toBe(1);
    // A call that has no session and no credential is the route's to answer, not the list's.
    const noCredential = await ask("/api/agent-tools/call", {
      method: "POST",
      who: "nobody",
    });
    expect(await isLimited(noCredential)).toBe(false);
  });

  test("a path spelled another way is the same path", async () => {
    for (const path of [
      "/api/%61dmin/people",
      "/api/admin%2Fpeople",
      "/api//admin/people",
      "/api/channels/c1%2Fpin",
    ]) {
      const answer = await ask(path, {
        method: path.includes("pin") ? "PUT" : "GET",
      });
      expect([path, await isLimited(answer)]).toEqual([path, true]);
    }
  });

  test("pairing itself is reachable, because it is how a browser becomes the computer's", async () => {
    const answer = await ask("/api/pair?token=not-a-link");
    expect(await isLimited(answer)).toBe(false);
    expect([401, 403]).toContain(answer.status);
  });
});

describe("a deployment with sign-in and no installation secret", () => {
  // Nothing tells one browser from another, so nothing is limited. The boot log says so.
  test("limits nothing: the same session reaches the powers it always did", async () => {
    const setup = await deployment(false);
    const ask = asker(setup);
    for (const [method, path, body] of POWERS) {
      const answer = await ask(path, { method, body });
      expect([method, path, await isLimited(answer)]).toEqual([
        method,
        path,
        false,
      ]);
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------
// The live screen: an upgrade the server answers itself, outside the app.
// ---------------------------------------------------------------------------------------------------

type Answer = { status: number; body: string };

/** One HTTP/1.1 request on a socket of its own, so the headers are exactly the ones written. */
function send(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const lines = [
      `GET ${path} HTTP/1.1`,
      ...Object.entries({
        host: `127.0.0.1:${port}`,
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...headers,
      }).map(([name, value]) => `${name}: ${value}`),
    ];
    let data = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const [head = "", ...rest] = data.split("\r\n\r\n");
      resolve({
        status: Number(/^HTTP\/1\.1 (\d{3})/.exec(head)?.[1] ?? 0),
        body: rest.join("\r\n\r\n"),
      });
    };
    const socket = connect({ host: "127.0.0.1", port }, () =>
      socket.write(`${lines.join("\r\n")}\r\n\r\n`),
    );
    socket.setEncoding("utf8");
    socket.setTimeout(8000, () => {
      settled = true;
      socket.destroy();
      reject(new Error(`${path} timed out`));
    });
    socket.on("data", (chunk: string) => {
      data += chunk;
      const split = data.indexOf("\r\n\r\n");
      if (split === -1) return;
      const length = /^content-length:\s*(\d+)/im.exec(
        data.slice(0, split),
      )?.[1];
      if (
        data.startsWith("HTTP/1.1 101") ||
        (length !== undefined &&
          Buffer.byteLength(data.slice(split + 4)) >= Number(length))
      )
        finish();
    });
    socket.on("close", finish);
    socket.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

describe("the live screen, which the server upgrades itself", () => {
  let setup: Setup;
  let stop = () => {};
  let port = 0;

  beforeAll(async () => {
    setup = await deployment();
    const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
    port = probe.port as number;
    probe.stop(true);
    const server = startHttpServer({
      port,
      config: setup.config,
      resolveRequestActor: async (request) => {
        const session = await setup.auth.api.getSession({
          headers: request.headers,
        });
        if (!session) throw new Error("not signed in");
        return { id: session.user.id, name: session.user.email, role: "admin" };
      },
      // Nobody owns any Bot here, so a request that is let through is told there is no such Bot.
      agentProfileStore: { get: async () => null } as never,
      computerGateway: undefined,
      demonstrationStore: {} as never,
      demonstrationRecorder: {} as never,
      app: { fetch: (request, env) => setup.app.fetch(request, env) },
    });
    stop = server.stop;
  }, 60_000);
  afterAll(() => stop());

  const path = "/api/computers/bot-1/stream";

  test("a remote session is refused with the sentence, and no session still gets 'Sign in first.'", async () => {
    const remote = await send(port, path, { cookie: setup.sessions.admin });
    expect(remote.status).toBe(403);
    expect(remote.body).toBe(REMOTE_SESSION_SENTENCE);
    const nobody = await send(port, path, {});
    expect(nobody.status).toBe(401);
    expect(nobody.body).toBe("Sign in first.");
    const cookieOnly = await send(port, path, {
      cookie: pairedCookie(setup.config),
    });
    expect(cookieOnly.status).toBe(401);
  });

  test("forged headers do not make it paired", async () => {
    const forged: Record<string, string>[] = [
      { "x-forwarded-for": "127.0.0.1" },
      { "user-agent": "FreeDuet-Computer/1.0" },
      { "x-real-ip": "127.0.0.1" },
      { cookie: `${setup.sessions.admin}; freeduet_install_3001=nope` },
    ];
    for (const headers of forged) {
      const answer = await send(port, path, {
        cookie: setup.sessions.admin,
        ...headers,
      });
      expect([JSON.stringify(headers), answer.status]).toEqual([
        JSON.stringify(headers),
        403,
      ]);
    }
  });

  test("paired, it goes on to the next check, which is whose Bot it is", async () => {
    const paired = await send(port, path, {
      cookie: `${setup.sessions.admin}; ${pairedCookie(setup.config)}`,
    });
    expect(paired.status).toBe(404);
    expect(paired.body).toBe("There is no such Bot.");
  });
});
