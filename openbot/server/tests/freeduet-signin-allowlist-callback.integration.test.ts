import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import { createAuth } from "../src/auth";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { sessions, users } from "../src/db/schema/core";
import { ADDRESS_REFUSAL_MESSAGE } from "../src/freeduet/signin-allowlist";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";

/*
 * SIGNIN_ALLOWED_EMAILS at the OAuth callback, over HTTP, with a stand-in identity provider.
 *
 * `freeduet-signin-allowlist.integration.test.ts` calls the hooks the way the callback does. This file
 * goes through the real `createAuth` handler instead: the sign-in is started, the browser is sent to
 * a provider and comes back with a code, and the callback exchanges it and reads the profile. So what
 * is checked here is what a browser is actually given: a session cookie or none, and an account or
 * none.
 *
 * WHAT THE PROVIDER IS. A twenty-line server in this file that speaks the three endpoints Better Auth's
 * generic OAuth plugin needs (discovery, token, userinfo) and says whoever the test says is signing in.
 * It is NOT Okta, Google or Entra: it proves what this deployment does with an answer, not that any
 * real provider gives the answer this file supposes. Its discovery document carries no JWKS, so no
 * ID token is verified, which is the part of the exchange a real provider would add.
 */
const database = createDatabase(testDatabaseUrl(), TEST_POOL);

const run = randomUUID().slice(0, 8);
const address = (name: string) => `${name}-${run}@openbot.test`;
const ADMIN = address("admin");
const ALICE = address("alice");
const BOB = address("bob");

const BASE_URL = "http://localhost:3001";

/** Who the provider says is signing in. Set by the test before it starts a sign-in. */
let signingIn = ALICE;

let idp: ReturnType<typeof Bun.serve>;
let issuer: string;

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

afterEach(async () => {
  await database.delete(users).where(inArray(users.email, [ADMIN, ALICE, BOB]));
});

afterAll(async () => {
  idp.stop(true);
  await database.$client.close();
});

function authWith(environment: Record<string, string | undefined> = {}) {
  const config = loadConfig(
    testEnvironment({
      OKTA_OAUTH_CLIENT_ID: "okta-client",
      OKTA_OAUTH_CLIENT_SECRET: "okta-client-secret-long-enough",
      OKTA_OAUTH_ISSUER: issuer,
      INITIAL_ADMIN_EMAILS: ADMIN,
      ...environment,
    }),
  );
  return createAuth(
    config,
    database,
    async () => false,
    createAuditStore(database),
  );
}

/**
 * One sign-in as a browser does it: start, go to the provider, come back to the callback.
 *
 * Returns what the callback answered, which is all a browser is given.
 */
async function signInThrough(auth: ReturnType<typeof createAuth>, who: string) {
  signingIn = who;
  const start = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL },
      body: JSON.stringify({
        provider: "okta",
        callbackURL: "/",
        disableRedirect: true,
      }),
    }),
  );
  const { url } = (await start.json()) as { url: string };
  const cookie = start.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  const atProvider = await fetch(url, { redirect: "manual" });
  const callback = atProvider.headers.get("location") ?? "";

  const response = await auth.handler(
    new Request(callback, { headers: { cookie } }),
  );
  return {
    status: response.status,
    body: await response.text(),
    cookies: response.headers
      .getSetCookie()
      .map((header) => header.split("=")[0]),
  };
}

const accountsFor = (email: string) =>
  database.select({ id: users.id }).from(users).where(eq(users.email, email));

describe("a sign-in through a provider, on a deployment that names its addresses", () => {
  const LISTED = { SIGNIN_ALLOWED_EMAILS: `${ADMIN},${ALICE}` };

  test("a listed address is signed in: a session cookie, and an account", async () => {
    const reply = await signInThrough(authWith(LISTED), ALICE);

    expect(reply.status).toBe(302);
    expect(reply.cookies).toContain("better-auth.session_token");
    expect(await accountsFor(ALICE)).toHaveLength(1);
  });

  test("an address that is not on the list is turned away: no session cookie, and no account", async () => {
    const reply = await signInThrough(authWith(LISTED), BOB);

    expect(reply.status).toBe(403);
    expect(reply.body).toContain(ADDRESS_REFUSAL_MESSAGE);
    expect(reply.cookies).not.toContain("better-auth.session_token");
    expect(await accountsFor(BOB)).toHaveLength(0);
  });

  test("an address that was signed in, and has since been taken off the list, is turned away at its next sign-in", async () => {
    const before = await signInThrough(authWith(LISTED), ALICE);
    expect(before.cookies).toContain("better-auth.session_token");
    const [alice] = await accountsFor(ALICE);
    const sessionsBefore = await database
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, alice.id));

    // The same deployment, restarted with Alice taken off.
    const after = await signInThrough(
      authWith({ SIGNIN_ALLOWED_EMAILS: `${ADMIN},${BOB}` }),
      ALICE,
    );

    expect(after.status).toBe(403);
    expect(after.cookies).not.toContain("better-auth.session_token");
    const sessionsAfter = await database
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, alice.id));
    expect(sessionsAfter).toHaveLength(sessionsBefore.length);
  });
});

describe("a sign-in through a provider, on a deployment that has not set the list", () => {
  // A guard of unchanged behaviour: it holds on main as well.
  test("signs in whoever the provider says, as it always did", async () => {
    const reply = await signInThrough(authWith(), BOB);

    expect(reply.status).toBe(302);
    expect(reply.cookies).toContain("better-auth.session_token");
    expect(await accountsFor(BOB)).toHaveLength(1);
  });
});
