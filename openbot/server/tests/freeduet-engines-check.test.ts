/**
 * Check again (docs/design/first-start.md section 4, slice S1): POST /api/freeduet/engines/claude/check asks
 * agent-freeduet to look at Claude Code now. It passes the guards of a change on the Engines page: an administrator,
 * at the computer (at-the-computer.ts). The answer holds whether Claude is installed and signed in, and nothing else:
 * no version, no account, no token, no path. A remote session is refused by the list (auth/remote-limits.ts).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  type AuthService,
  createRequireUser,
  type RoleRepository,
} from "../src/auth/guards";
import { remoteMayReach } from "../src/auth/remote-limits";
import {
  createEnginesRoutes,
  type EnginesReach,
} from "../src/freeduet/engines-routes";
import { LOOPBACK_PEER } from "./support/loopback-peer";

const TOKEN = "stub-agent-token-check";
const CHECK_PATH = "/api/freeduet/engines/claude/check";
const CHECK_ON_AGENT = "/engines/claude/check";
const ACCOUNT_EMAIL = "person@example.invalid";
const TUNNEL = { "X-Forwarded-For": "198.51.100.7" };

/** What the agent answers for a check: the fields it sends, and two it must never pass on (a version, an e-mail). */
const AGENT_ANSWER = {
  installed: true,
  signed_in: false,
  version: "2.1.311",
  email: ACCOUNT_EMAIL,
};

type Stub = { url: string; seen: Request[]; stop: () => void };
const stubs: Stub[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

/** A stand-in for agent-freeduet: records each request and answers with the given reply. */
function stubAgent(reply: (request: Request) => Response): Stub {
  const seen: Request[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      seen.push(request);
      return reply(request);
    },
  });
  const stub = {
    url: `http://127.0.0.1:${server.port}/`,
    seen,
    stop: () => server.stop(true),
  };
  stubs.push(stub);
  return stub;
}

/** The agent's own answer, checked the way agent-freeduet checks it: the token, the method and the path. */
function checked(request: Request): Response {
  if (request.headers.get("x-openbot-agent-token") !== TOKEN) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  if (request.method !== "POST" || !request.url.endsWith(CHECK_ON_AGENT)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(AGENT_ANSWER);
}

function reachTo(
  url: string,
  environment: Record<string, string | undefined> = {},
): EnginesReach {
  return {
    environment,
    managedAgent: { endpoint: new URL(url), token: TOKEN },
  };
}

/** The sub-app as the app mounts it, behind the production sign-in and role lookup. */
function enginesWith(
  session: { role?: "admin" | "user"; signedIn: boolean },
  reach: EnginesReach,
) {
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () =>
        session.signedIn
          ? {
              user: {
                id: "person-1",
                email: "person@openbot.test",
                role: session.role,
              },
            }
          : null,
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const app = new Hono();
  app.route(
    "/api/freeduet/engines",
    createEnginesRoutes(createRequireUser(auth, roles), () => reach),
  );
  return app;
}

const ADMIN_HERE = { signedIn: true, role: "admin" } as const;

describe("POST /api/freeduet/engines/claude/check: an administrator at the computer", () => {
  test("is told whether Claude is installed and signed in, with nothing else", async () => {
    const agent = stubAgent(checked);
    const response = await enginesWith(ADMIN_HERE, reachTo(agent.url)).request(
      CHECK_PATH,
      { method: "POST" },
      LOOPBACK_PEER,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      reason: null,
      installed: true,
      signedIn: false,
    });
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain(ACCOUNT_EMAIL);
    expect(body).not.toContain("2.1.311");
  });

  test("the agent is asked once, with the token, to check Claude", async () => {
    const agent = stubAgent(checked);
    await enginesWith(ADMIN_HERE, reachTo(agent.url)).request(
      CHECK_PATH,
      { method: "POST" },
      LOOPBACK_PEER,
    );
    expect(agent.seen.length).toBe(1);
    expect(agent.seen[0]?.method).toBe("POST");
    expect(agent.seen[0]?.url.endsWith(CHECK_ON_AGENT)).toBe(true);
    expect(agent.seen[0]?.headers.get("x-openbot-agent-token")).toBe(TOKEN);
  });

  test("a sign-in that the agent sees is answered as signed in", async () => {
    const agent = stubAgent(() =>
      Response.json({ installed: true, signed_in: true, version: "2.1.311" }),
    );
    const response = await enginesWith(ADMIN_HERE, reachTo(agent.url)).request(
      CHECK_PATH,
      { method: "POST" },
      LOOPBACK_PEER,
    );
    expect(await response.json()).toEqual({
      reason: null,
      installed: true,
      signedIn: true,
    });
  });
});

describe("POST /api/freeduet/engines/claude/check: who may ask", () => {
  test("another role is refused and the agent is not asked", async () => {
    const agent = stubAgent(checked);
    const response = await enginesWith(
      { signedIn: true, role: "user" },
      reachTo(agent.url),
    ).request(CHECK_PATH, { method: "POST" }, LOOPBACK_PEER);
    expect(response.status).toBe(403);
    expect(agent.seen.length).toBe(0);
  });

  test("a session that is not at the computer is refused and the agent is not asked", async () => {
    const agent = stubAgent(checked);
    const response = await enginesWith(ADMIN_HERE, reachTo(agent.url)).request(
      CHECK_PATH,
      { method: "POST", headers: TUNNEL },
      LOOPBACK_PEER,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error:
        "Change this on the computer FreeDuet runs on. Nothing was changed.",
    });
    expect(agent.seen.length).toBe(0);
  });

  test("a remote session is refused by the list: the engines family is refused as a whole", () => {
    expect(remoteMayReach("POST", CHECK_PATH)).toBe(false);
  });
});

describe("POST /api/freeduet/engines/claude/check: when the agent cannot be asked", () => {
  test("the engines switched off say so, and nothing is asked", async () => {
    const agent = stubAgent(checked);
    const response = await enginesWith(
      ADMIN_HERE,
      reachTo(agent.url, { FREEDUET_ROUTER: "off" }),
    ).request(CHECK_PATH, { method: "POST" }, LOOPBACK_PEER);
    expect(await response.json()).toEqual({
      reason: "off",
      installed: null,
      signedIn: null,
    });
    expect(agent.seen.length).toBe(0);
  });

  test("no agent set up says so", async () => {
    const response = await enginesWith(ADMIN_HERE, {
      environment: {},
      managedAgent: undefined,
    }).request(CHECK_PATH, { method: "POST" }, LOOPBACK_PEER);
    expect(await response.json()).toEqual({
      reason: "not_set_up",
      installed: null,
      signedIn: null,
    });
  });

  test("an agent that does not answer says it is unreachable, and says nothing about Claude", async () => {
    const agent = stubAgent(() => new Response("broken", { status: 500 }));
    const response = await enginesWith(ADMIN_HERE, reachTo(agent.url)).request(
      CHECK_PATH,
      { method: "POST" },
      LOOPBACK_PEER,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reason: "unreachable",
      installed: null,
      signedIn: null,
    });
  });
});
