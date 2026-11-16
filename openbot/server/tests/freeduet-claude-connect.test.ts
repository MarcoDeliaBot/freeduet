/**
 * First start in three clicks (docs/design/first-start.md, decisions D1 and D6), the server's side of the card:
 *
 * - D6: `FREEDUET_DEPLOYMENT=hosted` makes the Claude check answer 404 and shows on `/api/capabilities`; unset keeps
 *   every installation as it was; a value nobody knows counts as hosted (a safety line closes on a typo).
 * - Check again works with nothing restarted: the same app and the same agent address see a sign-in made between two
 *   presses.
 * - D1(b): no code passes through FreeDuet. The engines sub-app has no route named for a sign-in, a code or a token,
 *   and a request that carries a code is not passed on, whatever it says.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createApp } from "../src/app";
import {
  type AuthService,
  createRequireUser,
  type RoleRepository,
} from "../src/auth/guards";
import { remoteMayReach } from "../src/auth/remote-limits";
import { loadConfig } from "../src/config";
import { deploymentOf, isHosted } from "../src/freeduet/deployment";
import {
  createEnginesRoutes,
  type EnginesReach,
} from "../src/freeduet/engines-routes";
import { testEnvironment } from "./support/environment";
import { LOOPBACK_PEER } from "./support/loopback-peer";

const TOKEN = "stub-agent-token-connect";
const CHECK_PATH = "/api/freeduet/engines/claude/check";
const CANARY = "ONE-TIME-CODE-CANARY-7f3a";

type Stub = {
  url: string;
  seen: { method: string; url: string; body: string }[];
  signedIn: { value: boolean };
  stop: () => void;
};
const stubs: Stub[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

/** agent-freeduet's check, whose answer the test changes between two presses, as the person signing in does. */
function stubAgent(): Stub {
  const seen: Stub["seen"] = [];
  const signedIn = { value: false };
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      seen.push({
        method: request.method,
        url: request.url,
        body: await request.text(),
      });
      if (request.headers.get("x-openbot-agent-token") !== TOKEN)
        return Response.json({ error: "unauthorised" }, { status: 401 });
      return Response.json({
        installed: true,
        signed_in: signedIn.value,
        version: "2.1.311",
      });
    },
  });
  const stub = {
    url: `http://127.0.0.1:${server.port}/`,
    seen,
    signedIn,
    stop: () => server.stop(true),
  };
  stubs.push(stub);
  return stub;
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

function engines(reach: EnginesReach) {
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () => ({
        user: { id: "person-1", email: "person@openbot.test", role: "admin" },
      }),
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const routes = createEnginesRoutes(
    createRequireUser(auth, roles),
    () => reach,
  );
  const app = new Hono();
  app.route("/api/freeduet/engines", routes);
  return { app, routes };
}

const press = (app: Hono, body?: unknown) =>
  app.request(
    CHECK_PATH,
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
    LOOPBACK_PEER,
  );

describe("FREEDUET_DEPLOYMENT (D6)", () => {
  test("unset, empty or self-hosted is a person's own installation", () => {
    for (const value of [undefined, "", "  ", "self-hosted", "Self-Hosted "])
      expect(deploymentOf({ FREEDUET_DEPLOYMENT: value })).toBe("self-hosted");
    expect(deploymentOf({})).toBe("self-hosted");
  });

  test("hosted is hosted, however it is written, and a value nobody knows closes the line", () => {
    for (const value of ["hosted", " HOSTED ", "hosting", "cloud", "true"])
      expect(isHosted({ FREEDUET_DEPLOYMENT: value })).toBe(true);
  });
});

describe("the Claude check on a hosted deployment", () => {
  test("answers 404 to the administrator at the computer, and the agent is never asked", async () => {
    const agent = stubAgent();
    const { app } = engines(
      reachTo(agent.url, { FREEDUET_DEPLOYMENT: "hosted" }),
    );
    const response = await press(app);
    expect(response.status).toBe(404);
    expect(agent.seen.length).toBe(0);
  });

  test("a default installation is unchanged: the same press is answered", async () => {
    const agent = stubAgent();
    const { app } = engines(reachTo(agent.url));
    const response = await press(app);
    expect(response.status).toBe(200);
    expect(agent.seen.length).toBe(1);
  });

  test("a remote session is refused by the list, hosted or not", () => {
    expect(remoteMayReach("POST", CHECK_PATH)).toBe(false);
  });
});

describe("/api/capabilities and the deployment", () => {
  async function capabilities(value: string | undefined) {
    const before = process.env.FREEDUET_DEPLOYMENT;
    if (value === undefined) delete process.env.FREEDUET_DEPLOYMENT;
    else process.env.FREEDUET_DEPLOYMENT = value;
    try {
      const app = createApp(loadConfig(testEnvironment({})));
      const response = await app.request(
        "http://openbot.local/api/capabilities",
      );
      return (await response.json()) as Record<string, unknown>;
    } finally {
      if (before === undefined) delete process.env.FREEDUET_DEPLOYMENT;
      else process.env.FREEDUET_DEPLOYMENT = before;
    }
  }

  test("a hosted deployment says so, and nothing else changes", async () => {
    const plain = await capabilities(undefined);
    const hosted = await capabilities("hosted");
    expect("deployment" in plain).toBe(false);
    expect(hosted.deployment).toBe("hosted");
    const { deployment: _said, ...rest } = hosted;
    expect(rest).toEqual(plain);
  });
});

describe("Check again, with nothing restarted", () => {
  test("the same app sees a sign-in made between two presses", async () => {
    const agent = stubAgent();
    const { app } = engines(reachTo(agent.url));
    const first = await (await press(app)).json();
    expect(first).toEqual({ reason: null, installed: true, signedIn: false });
    agent.signedIn.value = true; // the person signs in, in a terminal
    const second = await (await press(app)).json();
    expect(second).toEqual({ reason: null, installed: true, signedIn: true });
    expect(agent.seen.length).toBe(2);
  });
});

describe("no one-time code passes through FreeDuet (D1, option b)", () => {
  test("the engines routes include none for a sign-in, a code or a token", () => {
    const { routes } = engines(reachTo("http://127.0.0.1:1/"));
    const paths = routes.routes.map((route) => route.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths)
      expect(path).not.toMatch(/login|code|token|secret|credential/i);
    expect(paths).toContain("/claude/check");
  });

  test("a press that carries a code is answered as any press, and the code reaches no one", async () => {
    const agent = stubAgent();
    const { app } = engines(reachTo(agent.url));
    const response = await press(app, { code: CANARY, token: CANARY });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(CANARY);
    for (const request of agent.seen) {
      expect(request.body).toBe("");
      expect(request.url).not.toContain(CANARY);
    }
  });

  test("nothing on the server's own app takes a login or a code", async () => {
    const app = createApp(loadConfig(testEnvironment({})));
    for (const path of [
      "/api/freeduet/engines/claude/login",
      "/api/freeduet/engines/claude/login/code",
      "/api/freeduet/engines/claude/code",
    ]) {
      const response = await app.request(
        `http://openbot.local${path}`,
        { method: "POST", body: JSON.stringify({ code: CANARY }) },
        LOOPBACK_PEER,
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });
});
