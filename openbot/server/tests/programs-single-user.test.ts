/**
 * Programs on the person's computer in single-user mode (D62, review of PR #322): with no sign-in the person is a
 * loopback peer, and on Docker Desktop a member's computer arrives as loopback too. With an installation secret the
 * loopback caller must also hold it (D28); WITHOUT one nothing tells the person from a member's computer, so the
 * function cannot be switched on and no pairing code is made. The table below is measured through the real app:
 * secret present or absent x a loopback peer (with and without the cookie) or a bridge peer x the three routes.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app";
import { installCookieName } from "../src/auth/install-secret";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema";
import { createProgramsBroker } from "../src/programs/broker";
import { createProgramsSwitch } from "../src/programs/switch";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";

const KEY = "b3JkaW5hcnktdGVzdC1rZXktbm90LXRoZS1leGFtcGxl";
const SECRET = "c0ffee00".repeat(8);
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const ACTOR = "dev-local-user";

afterAll(async () => {
  await database.$client.close();
});

function env(withSecret: boolean) {
  const {
    GOOGLE_OAUTH_CLIENT_ID: _a,
    GOOGLE_OAUTH_CLIENT_SECRET: _b,
    BETTER_AUTH_SECRET: _c,
    BETTER_AUTH_URL: _d,
    INITIAL_ADMIN_EMAILS: _e,
    ...rest
  } = testEnvironment();
  return {
    ...rest,
    OPENBOT_SINGLE_USER: "true",
    AGENT_TOOL_TOKEN: "deployment-wide-agent-token",
    WORKER_SHARED_SECRET: "worker-shared-secret-for-this-test",
    ...(withSecret ? { FREEDUET_INSTALL_SECRET: SECRET } : {}),
  };
}

async function appFor(withSecret: boolean) {
  await database
    .insert(users)
    .values({ id: ACTOR, email: "dev@openbot.local" })
    .onConflictDoNothing();
  await database
    .update(users)
    .set({ preferences: {} })
    .where(eq(users.id, ACTOR));
  const config = loadConfig(env(withSecret), {});
  const sw = createProgramsSwitch({ database, deploymentKey: KEY });
  const broker = createProgramsBroker({
    deploymentKey: KEY,
    salt: (a) => sw.saltOf(a),
    enabled: (a) => sw.isOn(a),
    sweepEveryMs: 0,
  });
  const args: unknown[] = new Array(35).fill(undefined);
  args[0] = config;
  args[34] = { programs: { broker, switch: sw } };
  const app = (createApp as (...v: unknown[]) => ReturnType<typeof createApp>)(
    ...args,
  );
  return { app, config, sw };
}

const peer = (address: string) => ({
  server: { requestIP: () => ({ address }) },
});

const ROUTES = [
  {
    name: "switch on",
    method: "PUT",
    path: "/api/programs/switch",
    body: { enabled: true },
  },
  {
    name: "page",
    method: "GET",
    path: "/api/programs/pairing",
    body: undefined,
  },
  {
    name: "code",
    method: "POST",
    path: "/api/programs/pairing/code",
    body: {},
  },
] as const;

async function call(
  built: Awaited<ReturnType<typeof appFor>>,
  route: (typeof ROUTES)[number],
  address: string,
  cookie: boolean,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "localhost:3001",
  };
  if (cookie)
    headers.cookie = `${installCookieName(built.config.port)}=${SECRET}`;
  const response = await built.app.request(
    `http://localhost:3001${route.path}`,
    {
      method: route.method,
      headers,
      ...(route.body ? { body: JSON.stringify(route.body) } : {}),
    },
    peer(address) as never,
  );
  return { status: response.status, body: await response.text() };
}

describe("single-user mode: who can switch programs on and mint a pairing code", () => {
  test("with no installation secret a loopback caller is refused on all three routes, with the reason", async () => {
    const built = await appFor(false);
    for (const route of ROUTES) {
      const answer = await call(built, route, "127.0.0.1", false);
      expect(answer.status).toBe(403);
      expect(answer.body).toContain("installation secret");
    }
    expect(await built.sw.isOn(ACTOR)).toBe(false);
  });

  test("with no installation secret a peer on the bridge is nobody (401) on all three routes", async () => {
    const built = await appFor(false);
    for (const route of ROUTES)
      expect((await call(built, route, "172.17.0.1", false)).status).toBe(401);
  });

  test("with the secret, a loopback caller WITHOUT the cookie (a member's computer on Docker Desktop) is refused", async () => {
    const built = await appFor(true);
    for (const route of ROUTES) {
      const answer = await call(built, route, "127.0.0.1", false);
      expect(answer.status).toBe(401);
    }
    expect(await built.sw.isOn(ACTOR)).toBe(false);
  });

  test("with the secret, a bridge peer is nobody even with the cookie", async () => {
    const built = await appFor(true);
    for (const route of ROUTES)
      expect((await call(built, route, "172.17.0.1", true)).status).toBe(401);
  });

  test("with the secret, the person (loopback and the cookie) can switch on, see the page and get a code", async () => {
    const built = await appFor(true);
    expect((await call(built, ROUTES[0], "127.0.0.1", true)).status).toBe(200);
    expect((await call(built, ROUTES[1], "127.0.0.1", true)).status).toBe(200);
    const code = await call(built, ROUTES[2], "127.0.0.1", true);
    expect(code.status).toBe(200);
    expect(code.body).toMatch(/[A-Z2-9]{5}-[A-Z2-9]{5}/);
    await built.sw.set(ACTOR, false);
  });

  test("switching OFF stays possible without a secret", async () => {
    const built = await appFor(false);
    await built.sw.set(ACTOR, true);
    const answer = await built.app.request(
      "http://localhost:3001/api/programs/switch",
      {
        method: "PUT",
        headers: { "content-type": "application/json", host: "localhost:3001" },
        body: JSON.stringify({ enabled: false }),
      },
      peer("127.0.0.1") as never,
    );
    expect(answer.status).toBe(200);
    expect(await built.sw.isOn(ACTOR)).toBe(false);
  });

  test("the programs files do not name the installation secret: the question is asked in app.ts, which already does", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(import.meta.dir, "..", "src", "programs");
    for (const file of readdirSync(dir))
      expect(readFileSync(join(dir, file), "utf8")).not.toMatch(
        /installSecret|INSTALL_SECRET|install-secret/,
      );
    expect(randomUUID()).toBeTruthy();
  });
});
