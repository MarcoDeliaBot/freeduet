/**
 * Revoking a pairing also ends the sign-in session of that browser (docs/M1_PLAN.md D74), against a real database and
 * the real sign-in.
 *
 * WHAT IS REAL. `createAuth` (Better Auth) with its `sessions` table, the Postgres pairing store, the pairing service,
 * and `createApp` with the middleware that limits a remote session and the pairing routes. WHAT IS NOT: the provider
 * is a small server in this file (the recipe of `remote-limits.integration.test.ts`), and no phone took part: a
 * "browser" here is a `Cookie` header.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import { createAuth } from "../src/auth";
import {
  createBrowserPairings,
  createPgPairingStore,
} from "../src/auth/browser-pairings";
import { createRoleRepository } from "../src/auth/guards";
import { createDatabase } from "../src/db/client";
import { auditEvents, browserPairings } from "../src/db/schema";
import { sessions, users } from "../src/db/schema/core";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import { assembleSignIn, signInConfig, SECRET } from "./support/signin-app";

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
// The spies are made in beforeAll and given back in afterAll, not when the file loads (console-spy-scope.test.ts).
let quiet: ReturnType<typeof spyOn>[] = [];

beforeAll(() => {
  quiet = [
    spyOn(console, "error").mockImplementation(() => {}),
    spyOn(console, "info").mockImplementation(() => {}),
  ];
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

type Browser = {
  /** The Cookie header's session part. */
  session: string;
  /** The Cookie header's pairing part. */
  pair: string;
  pairingId: string;
};

async function sessionIdOf(
  auth: ReturnType<typeof createAuth>,
  cookie: string,
): Promise<string | null> {
  const found = (await auth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true },
  })) as { session: { id: string } } | null;
  return found?.session.id ?? null;
}

async function deployment() {
  const config = signInConfig(environment());
  const auth = createAuth(
    config,
    database,
    async () => false,
    createAuditStore(database),
  );
  const audit = createAuditStore(database);
  const pairings = createBrowserPairings({
    store: createPgPairingStore(database),
    secret: SECRET,
    port: config.port,
    audit,
  });
  const { app } = assembleSignIn(config, {
    1: auth,
    2: createRoleRepository(database),
    34: { pairings },
  });
  const ask = (
    path: string,
    browser: Pick<Browser, "session" | "pair">,
    method = "GET",
  ) =>
    app.request(
      `${ORIGIN}${path}`,
      {
        method,
        headers: {
          origin: ORIGIN,
          cookie: [browser.session, browser.pair].filter(Boolean).join("; "),
        },
      },
      LOOPBACK_PEER,
    );
  /** A browser: signed in as `who`, paired as `kind`, and seen once (the app loads `/api/me` first). */
  const browser = async (
    who: string,
    kind: "computer" | "device",
    seen = true,
  ): Promise<Browser> => {
    const session = await signIn(auth, who);
    const sessionResult = (await auth.api.getSession({
      headers: new Headers({ cookie: session }),
    })) as { user: { id: string } };
    const made = await pairings.issue(
      sessionResult.user.id,
      kind,
      `${kind} of ${who}`,
      kind === "computer" ? "link" : "code",
    );
    const pair = made.setCookie.split(";")[0] as string;
    if (seen)
      expect((await ask("/api/me", { session, pair })).status).toBe(200);
    return { session, pair, pairingId: made.id };
  };
  return { config, auth, pairings, ask, browser };
}

const pairingRow = async (id: string) =>
  (
    await database
      .select()
      .from(browserPairings)
      .where(eq(browserPairings.id, id))
  )[0];
const sessionRows = async (id: string) =>
  database
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, id));

describe("revoking a pairing also ends its session (D74)", () => {
  test("the session last seen with the pairing ends, and that browser's next request is signed out", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const phone = await d.browser(ADMIN, "device");
    const phoneSession = await sessionIdOf(d.auth, phone.session);
    // The pairing recorded the session it was seen with, and nothing of the token.
    const before = await pairingRow(phone.pairingId);
    expect(before?.sessionId).toBe(phoneSession as string);
    expect(JSON.stringify(before)).not.toContain(
      phone.session.split("=")[1] as string,
    );

    const answer = await d.ask(
      `/api/pairings/${phone.pairingId}`,
      computer,
      "DELETE",
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ revoked: true, signedOut: true });

    expect(await sessionRows(phoneSession as string)).toHaveLength(0);
    expect((await d.ask("/api/me", phone)).status).toBe(401);
    // Not even with its sign-in cookie alone.
    expect(
      (await d.ask("/api/me", { session: phone.session, pair: "" })).status,
    ).toBe(401);
    // The pairing is revoked, and the session id on it went with the session.
    const after = await pairingRow(phone.pairingId);
    expect(after?.revokedAt).not.toBeNull();
    expect(after?.sessionId).toBeNull();
  });

  test("another browser of the same person stays signed in and paired, and so does the browser revoking", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const laptop = await d.browser(ADMIN, "device");
    const phone = await d.browser(ADMIN, "device");
    const laptopSession = await sessionIdOf(d.auth, laptop.session);
    const computerSession = await sessionIdOf(d.auth, computer.session);

    expect(
      (await d.ask(`/api/pairings/${phone.pairingId}`, computer, "DELETE"))
        .status,
    ).toBe(200);

    for (const stays of [computer, laptop]) {
      const me = await d.ask("/api/me", stays);
      expect(me.status).toBe(200);
      expect(((await me.json()) as { remote: boolean }).remote).toBe(false);
    }
    expect(await sessionRows(laptopSession as string)).toHaveLength(1);
    expect(await sessionRows(computerSession as string)).toHaveLength(1);
    expect((await pairingRow(laptop.pairingId))?.revokedAt).toBeNull();
  });

  test("revoking from the phone itself signs the phone out, and nobody else", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const phone = await d.browser(ADMIN, "device");
    const answer = await d.ask(
      `/api/pairings/${phone.pairingId}`,
      phone,
      "DELETE",
    );
    expect(answer.status).toBe(200);
    expect(((await answer.json()) as { signedOut: boolean }).signedOut).toBe(
      true,
    );
    expect((await d.ask("/api/me", phone)).status).toBe(401);
    expect((await d.ask("/api/me", computer)).status).toBe(200);
  });

  test("a pairing never seen with a session revokes cleanly and ends no session", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const unseen = await d.browser(ADMIN, "device", false);
    expect((await pairingRow(unseen.pairingId))?.sessionId).toBeNull();
    const unseenSession = await sessionIdOf(d.auth, unseen.session);
    const answer = await d.ask(
      `/api/pairings/${unseen.pairingId}`,
      computer,
      "DELETE",
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ revoked: true, signedOut: false });
    expect((await pairingRow(unseen.pairingId))?.revokedAt).not.toBeNull();
    expect(await sessionRows(unseenSession as string)).toHaveLength(1);
  });

  test("a browser that signed in anew is revoked with its new session", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const phone = await d.browser(ADMIN, "device");
    const oldSession = await sessionIdOf(d.auth, phone.session);
    // The phone signs out and signs in again: a new session, the same pairing cookie.
    await d.auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: phone.session,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(await sessionRows(oldSession as string)).toHaveLength(0);
    const fresh = { session: await signIn(d.auth, ADMIN), pair: phone.pair };
    expect((await d.ask("/api/me", fresh)).status).toBe(200);
    const freshSession = await sessionIdOf(d.auth, fresh.session);
    expect((await pairingRow(phone.pairingId))?.sessionId).toBe(
      freshSession as string,
    );
    await d.ask(`/api/pairings/${phone.pairingId}`, computer, "DELETE");
    expect((await d.ask("/api/me", fresh)).status).toBe(401);
  });

  test("the session of the browser doing the revoking is never ended through another pairing", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const phone = await d.browser(ADMIN, "device");
    const computerSession = await sessionIdOf(d.auth, computer.session);
    // A copied sign-in cookie: the phone's pairing was last seen with the very session the computer is using.
    await database
      .update(browserPairings)
      .set({ sessionId: computerSession as string })
      .where(eq(browserPairings.id, phone.pairingId));
    const answer = await d.ask(
      `/api/pairings/${phone.pairingId}`,
      computer,
      "DELETE",
    );
    expect(answer.status).toBe(200);
    expect(((await answer.json()) as { signedOut: boolean }).signedOut).toBe(
      false,
    );
    expect((await d.ask("/api/me", computer)).status).toBe(200);
  });

  test("person A cannot end person B's session through any pairing id", async () => {
    const d = await deployment();
    const admin = await d.browser(ADMIN, "computer");
    const adminPhone = await d.browser(ADMIN, "device");
    const alice = await d.browser(ALICE, "computer");
    const phoneSession = await sessionIdOf(d.auth, adminPhone.session);
    // Alice names the administrator's pairing: there is no such pairing of hers.
    const named = await d.ask(
      `/api/pairings/${adminPhone.pairingId}`,
      alice,
      "DELETE",
    );
    expect(named.status).toBe(404);
    expect(await sessionRows(phoneSession as string)).toHaveLength(1);
    expect((await pairingRow(adminPhone.pairingId))?.revokedAt).toBeNull();
    // Even with a pairing of Alice's that somehow names the administrator's session, only Alice's own session can end.
    await database
      .update(browserPairings)
      .set({ sessionId: phoneSession as string })
      .where(eq(browserPairings.id, alice.pairingId));
    const own = await d.ask(
      `/api/pairings/${alice.pairingId}`,
      admin,
      "DELETE",
    );
    expect(own.status).toBe(404);
    const aliceRevokes = await d.pairings.revoke(
      (
        await database
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, ALICE))
      )[0]?.id as string,
      alice.pairingId,
      "test",
    );
    expect(aliceRevokes).toEqual({ sessionEnded: false });
    expect(await sessionRows(phoneSession as string)).toHaveLength(1);
    expect((await d.ask("/api/me", adminPhone)).status).toBe(200);
  });

  test("the trail says the session was ended, and holds no token, code or secret", async () => {
    const d = await deployment();
    const computer = await d.browser(ADMIN, "computer");
    const phone = await d.browser(ADMIN, "device");
    const phoneSession = (await sessionIdOf(d.auth, phone.session)) as string;
    await d.ask(`/api/pairings/${phone.pairingId}`, computer, "DELETE");
    const rows = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "pairing.revoked"),
          eq(auditEvents.targetId, phone.pairingId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({ sessionEnded: true });
    const text = JSON.stringify(rows);
    for (const secret of [
      SECRET,
      phone.pair.split("=")[1] as string,
      phone.session.split("=")[1] as string,
      phoneSession,
    ])
      expect(text).not.toContain(secret);
  });

  test("single-user mode is unchanged: no pairing door, and no session is touched", async () => {
    const config = signInConfig({ OPENBOT_SINGLE_USER: "true" }, false);
    const before = await database.select({ id: sessions.id }).from(sessions);
    const { app } = assembleSignIn(config);
    const answer = await app.request(
      `${ORIGIN}/api/pairings/pair_x`,
      { method: "DELETE", headers: { origin: ORIGIN } },
      LOOPBACK_PEER,
    );
    expect([401, 404]).toContain(answer.status);
    expect(
      await database.select({ id: sessions.id }).from(sessions),
    ).toHaveLength(before.length);
  });
});
