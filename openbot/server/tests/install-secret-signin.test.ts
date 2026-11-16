/**
 * With sign-in, the installation secret and its two pairing doors work, and mean something different.
 *
 * With no sign-in the secret makes a loopback peer the person (install-secret.test.ts). With sign-in
 * the person is who the session says, and the secret says only WHERE: a browser that holds the cookie
 * was paired on the computer this runs on (docs/design/phone-and-remote.md 3.5, decision E). So the
 * cookie is set by the same two doors, the second one asks for a signed-in administrator as well, and
 * the cookie alone signs nobody in.
 *
 * What these tests hold fixed, on top of the doors working: single-user mode is what it was (the
 * answers of its doors are compared with the ones it gave before), the secret is in no answer but the
 * cookie of a pairing that succeeded, and a refusal for any reason but the link leaves the link alive.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { createHash } from "node:crypto";
import { pairCookieName } from "../src/auth/browser-pairings";
import { createRequireUser } from "../src/auth/guards";
import {
  createInstallPairingRoutes,
  installCookieName,
  installSecretSetting,
  PAIRING_MINT_PATH,
  PAIRING_REDEEM_PATH,
  personRule,
  signInGate,
} from "../src/auth/install-secret";
import { loadConfig } from "../src/config";
import { testEnvironment } from "./support/environment";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import {
  assembleSignIn,
  legacyCookie,
  pairedCookie,
  peerAt,
  SECRET,
  signInConfig,
  stubAuth,
  stubRoles,
} from "./support/signin-app";

const ORIGIN = "http://localhost:3001";
// Quiet while this file's tests run and given back afterwards: a spy made at load outlives this file
// (console-spy-scope.test.ts).
let quiet: ReturnType<typeof spyOn>;
beforeAll(() => {
  quiet = spyOn(console, "info").mockImplementation(() => {});
});
afterAll(() => quiet.mockRestore());
afterEach(() => quiet.mockClear());

/** A person's question to the app: a session header, if any, and a peer. */
async function ask(
  app: ReturnType<typeof assembleSignIn>["app"],
  path: string,
  options: {
    method?: string;
    session?: "admin" | "user" | "ghost";
    peer?: ReturnType<typeof peerAt>;
    headers?: Record<string, string>;
  } = {},
) {
  return app.request(
    `${ORIGIN}${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        ...(options.session ? { "x-test-session": options.session } : {}),
        ...options.headers,
      },
    },
    options.peer ?? LOOPBACK_PEER,
  );
}

/** A link from the launcher's door, the way open.sh asks for one. */
async function mint(app: ReturnType<typeof assembleSignIn>["app"]) {
  const answer = await ask(app, PAIRING_MINT_PATH, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  });
  expect(answer.status).toBe(200);
  return (await answer.json()) as {
    path: string;
    expiresInSeconds: number;
    url?: string;
  };
}

describe("the secret in the configuration, with sign-in", () => {
  test("is read, as a marker of a paired browser, and a line that is not set is no secret", () => {
    const config = signInConfig();
    expect(config.singleUser).toBe(false);
    expect(config.installSecret).toBe(SECRET);
    expect(signInConfig({}, false).installSecret).toBeUndefined();
    expect(
      signInConfig({ FREEDUET_INSTALL_SECRET: "   " }).installSecret,
    ).toBeUndefined();
  });

  test("stops the boot on a value that cannot be a secret, as it does without sign-in, and never names the value", () => {
    for (const value of ["short", "x".repeat(257), `${"x".repeat(40)};Path=/`])
      expect(() => signInConfig({ FREEDUET_INSTALL_SECRET: value })).toThrow(
        /FREEDUET_INSTALL_SECRET must be 32 to 256/,
      );
    try {
      signInConfig({ FREEDUET_INSTALL_SECRET: "short-value" });
    } catch (error) {
      expect(String(error)).not.toContain("short-value");
    }
  });

  test("installSecretSetting answers what the configuration spreads, whatever the mode", () => {
    expect(installSecretSetting({})).toEqual({});
    expect(installSecretSetting({ FREEDUET_INSTALL_SECRET: SECRET })).toEqual({
      installSecret: SECRET,
    });
  });

  test("signInGate is the marker's gate with sign-in and a secret, and nothing in any other deployment", () => {
    const config = signInConfig();
    expect(signInGate(config)).toMatchObject({
      secret: SECRET,
      cookie: installCookieName(config.port),
      pairings: expect.anything(),
    });
    expect(signInGate(signInConfig({}, false))).toBeUndefined();
    const single = loadConfig(
      {
        ...testEnvironment(),
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        BETTER_AUTH_SECRET: undefined,
        BETTER_AUTH_URL: undefined,
        INITIAL_ADMIN_EMAILS: undefined,
        OPENBOT_SINGLE_USER: "true",
        FREEDUET_INSTALL_SECRET: SECRET,
      },
      {},
    );
    expect(single.singleUser).toBe(true);
    expect(signInGate(single)).toBeUndefined();
  });

  test("the person rule of a deployment with sign-in is still none: the secret does not make anybody the person", () => {
    expect(personRule(signInConfig())).toEqual({ loopbackOnly: false });
  });
});

describe("the doors, with sign-in", () => {
  test("are there where there is a secret, and not where there is none", async () => {
    const { app } = assembleSignIn(signInConfig());
    expect((await ask(app, PAIRING_MINT_PATH, { method: "POST" })).status).toBe(
      401,
    );
    expect((await ask(app, `${PAIRING_REDEEM_PATH}?token=x`)).status).toBe(401);

    const { app: without } = assembleSignIn(signInConfig({}, false));
    for (const [method, path] of [
      ["POST", PAIRING_MINT_PATH],
      ["GET", `${PAIRING_REDEEM_PATH}?token=x`],
    ] as const)
      expect((await ask(without, path, { method })).status).toBe(404);
  });

  test("the launcher's door gives a link, and the address of the app it opens at", async () => {
    const { app } = assembleSignIn(signInConfig());
    const link = await mint(app);

    expect(link.path).toMatch(/^\/api\/pair\?token=[A-Za-z0-9_-]{43}$/);
    expect(link.expiresInSeconds).toBe(120);
    // Where the session is, which is the app's own address and never the request's.
    expect(link.url).toBe(`${ORIGIN}${link.path}`);
    const elsewhere = assembleSignIn(
      signInConfig({ OPENBOT_APP_URL: "https://duet.example.test/" }),
    );
    expect((await mint(elsewhere.app)).url).toStartWith(
      "https://duet.example.test/api/pair?token=",
    );
  });

  test("the launcher's door is refused without the secret, and from beyond this machine, with one answer", async () => {
    const { app } = assembleSignIn(signInConfig());
    const answers = await Promise.all([
      ask(app, PAIRING_MINT_PATH, { method: "POST" }),
      ask(app, PAIRING_MINT_PATH, {
        method: "POST",
        headers: { authorization: "Bearer not-the-secret" },
      }),
      ask(app, PAIRING_MINT_PATH, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
        peer: peerAt("172.17.0.1"),
      }),
    ]);
    for (const answer of answers) {
      expect(answer.status).toBe(401);
      expect(await answer.json()).toEqual({
        error: "This endpoint is the launcher's.",
      });
    }
  });

  test("a session is not the secret: a signed-in browser that is not paired is refused before the door, a paired one by the door", async () => {
    const config = signInConfig();
    const { app } = assembleSignIn(config);
    const remote = await ask(app, PAIRING_MINT_PATH, {
      method: "POST",
      session: "admin",
    });
    expect(remote.status).toBe(403);
    expect(((await remote.json()) as { code?: string }).code).toBe(
      "remote_session_limited",
    );
    const paired = await ask(app, PAIRING_MINT_PATH, {
      method: "POST",
      session: "admin",
      headers: { cookie: pairedCookie(config) },
    });
    expect(paired.status).toBe(401);
    expect(await paired.json()).toEqual({
      error: "This endpoint is the launcher's.",
    });
  });

  test("a signed-in administrator on this machine pairs a browser: the cookie, once, and the app", async () => {
    const config = signInConfig();
    const { app, store } = assembleSignIn(config);
    const { path } = await mint(app);

    const paired = await ask(app, path, { session: "admin" });
    expect(paired.status).toBe(303);
    expect(paired.headers.get("location")).toBe("/");
    // D49: the cookie is the browser's own token, and never the secret.
    const [cookie, cleared] = paired.headers.getSetCookie();
    expect(cookie).toMatch(
      new RegExp(
        `^${pairCookieName(config.port)}=[A-Za-z0-9_-]{43}; Path=/api; Max-Age=34560000; HttpOnly; SameSite=Strict$`,
      ),
    );
    expect(cleared).toStartWith(`${installCookieName(config.port)}=; `);
    expect(paired.headers.getSetCookie().join("\n")).not.toContain(SECRET);
    // One pairing, of the administrator who was signed in, of kind computer, kept as a hash.
    const rows = [...store.rows.values()].filter(
      (row) => !row.id.startsWith("seed-"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u-admin", kind: "computer" });
    const token = (cookie as string).split("=")[1]?.split(";")[0] as string;
    expect(rows[0]?.tokenHash).not.toContain(token);
    expect(rows[0]?.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(paired.headers.get("cache-control")).toBe("no-store");
    expect(paired.headers.get("referrer-policy")).toBe("no-referrer");

    // Good once.
    const again = await ask(app, path, { session: "admin" });
    expect(again.status).toBe(401);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  test("the cookie is Secure when the app's own address is https, and not otherwise", async () => {
    for (const [appUrl, secure] of [
      ["https://duet.example.test", true],
      ["http://localhost:3010", false],
    ] as const) {
      const { app } = assembleSignIn(signInConfig({ OPENBOT_APP_URL: appUrl }));
      const { path } = await mint(app);
      const paired = await ask(app, path, { session: "admin" });
      expect(paired.status).toBe(303);
      expect(/;\s*Secure/i.test(paired.headers.getSetCookie()[0] ?? "")).toBe(
        secure,
      );
    }
  });

  test("a header cannot make a request https: only the configured address does", async () => {
    const { app } = assembleSignIn(signInConfig());
    const { path } = await mint(app);
    const paired = await ask(app, path, {
      session: "admin",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(paired.status).toBe(303);
    expect(/;\s*Secure/i.test(paired.headers.getSetCookie()[0] ?? "")).toBe(
      false,
    );
  });

  describe("a refusal for any reason but the link leaves the link alive", () => {
    test("nobody is signed in: a sentence that says to sign in, and the link still works afterwards", async () => {
      const { app } = assembleSignIn(signInConfig());
      const { path } = await mint(app);

      const signedOut = await ask(app, path);
      expect(signedOut.status).toBe(401);
      expect(signedOut.headers.get("set-cookie")).toBeNull();
      expect(await signedOut.text()).toContain(
        "Sign in to FreeDuet in this browser as the administrator",
      );

      expect((await ask(app, path, { session: "admin" })).status).toBe(303);
    });

    test("a person who is not an administrator is told so, and the link still works for one", async () => {
      const { app } = assembleSignIn(signInConfig());
      const { path } = await mint(app);

      for (const session of ["user", "ghost"] as const) {
        const refused = await ask(app, path, { session });
        expect(refused.status).toBe(403);
        expect(refused.headers.get("set-cookie")).toBeNull();
        expect(await refused.text()).toContain(
          "Only an administrator can pair a browser with this computer",
        );
      }

      expect((await ask(app, path, { session: "admin" })).status).toBe(303);
    });

    test("a request from beyond this machine is answered as a link that is no good, and tells nothing about sessions", async () => {
      const { app } = assembleSignIn(signInConfig());
      const { path } = await mint(app);

      const answers = [];
      for (const session of [undefined, "user", "admin"] as const)
        answers.push(
          await ask(app, path, { session, peer: peerAt("172.17.0.1") }),
        );
      // No peer at all, as with a request made in-process.
      answers.push(
        await app.request(`${ORIGIN}${path}`, {
          headers: { "x-test-session": "admin" },
        }),
      );
      const bodies = new Set<string>();
      for (const answer of answers) {
        expect(answer.status).toBe(401);
        expect(answer.headers.get("set-cookie")).toBeNull();
        bodies.add(await answer.text());
      }
      expect(bodies.size).toBe(1);
      expect([...bodies][0]).toContain("expired or was already used");

      expect((await ask(app, path, { session: "admin" })).status).toBe(303);
    });
  });

  test("a link that was never minted, or has no token, gets the answer for a link that is no good", async () => {
    const { app } = assembleSignIn(signInConfig());
    for (const path of [
      `${PAIRING_REDEEM_PATH}?token=never-minted`,
      PAIRING_REDEEM_PATH,
      `${PAIRING_REDEEM_PATH}?token=`,
    ]) {
      const answer = await ask(app, path, { session: "admin" });
      expect(answer.status).toBe(401);
      expect(answer.headers.get("set-cookie")).toBeNull();
      expect(await answer.text()).toContain("expired or was already used");
    }
  });

  test("the secret is in no answer at all, the answer of a pairing that succeeded included", async () => {
    const { app } = assembleSignIn(signInConfig());
    const { path, url } = await mint(app);
    const seen: Response[] = [
      await ask(app, PAIRING_MINT_PATH, { method: "POST" }),
      await ask(app, path),
      await ask(app, path, { session: "user" }),
      await ask(app, path, { session: "admin", peer: peerAt("172.17.0.1") }),
      await ask(app, `${PAIRING_REDEEM_PATH}?token=nope`, { session: "admin" }),
      await ask(app, "/api/capabilities"),
    ];
    // D49: not even the cookie of a pairing that succeeded carries it. That cookie is the browser's own token.
    seen.push(await ask(app, (await mint(app)).path, { session: "admin" }));
    for (const answer of seen) {
      expect([...answer.headers.entries()].join("\n")).not.toContain(SECRET);
      expect(await answer.text()).not.toContain(SECRET);
    }
    expect(`${path} ${url}`).not.toContain(SECRET);
  });

  test("the capabilities do not claim a pairing: the sign-in screen is not the single-user one", async () => {
    const { app } = assembleSignIn(signInConfig());
    const answer = await ask(app, "/api/capabilities");
    expect(answer.status).toBe(200);
    expect(await answer.json()).not.toHaveProperty("installPairing");
  });
});

describe("the cookie alone signs nobody in", () => {
  test("a request that has it and no session is nobody: 401, wherever it comes from", async () => {
    const config = signInConfig();
    const { app } = assembleSignIn(config);
    for (const peer of [LOOPBACK_PEER, peerAt("172.17.0.1")]) {
      for (const path of ["/api/me", "/api/approvals", "/api/channels"]) {
        const answer = await ask(app, path, {
          peer,
          headers: { cookie: pairedCookie(config) },
        });
        expect(answer.status).toBe(401);
      }
    }
  });
});

describe("the doors in single-user mode answer as they did", () => {
  /** Built the way app.ts builds them without sign-in: no `signIn` option. */
  const routes = createInstallPairingRoutes(
    { secret: SECRET, cookie: installCookieName(3001) },
    { now: () => 1_000 },
  );
  const ask1 = (path: string, init: RequestInit = {}, peer = LOOPBACK_PEER) =>
    routes.request(`${ORIGIN}${path}`, init, peer);

  test("the launcher's door gives a path and a lifetime, and no address", async () => {
    const answer = await ask1(PAIRING_MINT_PATH, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(answer.status).toBe(200);
    const body = (await answer.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["path", "expiresInSeconds"]);
  });

  test("the browser's door asks no session, sets the cookie without Secure, and refuses with the sentence it always had", async () => {
    const { path } = (await (
      await ask1(PAIRING_MINT_PATH, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      })
    ).json()) as { path: string };

    // Not loopback: the old answer, word for word.
    const elsewhere = await ask1(path, {}, peerAt("172.17.0.1"));
    expect(elsewhere.status).toBe(401);
    expect(await elsewhere.text()).toBe(
      "This link has expired or was already used. On the computer this runs on, run: bash scripts/open.sh",
    );

    const paired = await ask1(path);
    expect(paired.status).toBe(303);
    expect(paired.headers.get("set-cookie")).toBe(
      `${installCookieName(3001)}=${SECRET}; Path=/api; Max-Age=34560000; HttpOnly; SameSite=Strict`,
    );
  });
});

describe("the administrator check is the app's own guard, asked once", () => {
  test("a person with no role is refused by it, and so cannot pair", async () => {
    const guard = createRequireUser(stubAuth, stubRoles);
    const routes = createInstallPairingRoutes(
      { secret: SECRET, cookie: installCookieName(3001) },
      {
        signIn: {
          requireUser: guard,
          pairings: signInGate(signInConfig())?.pairings as never,
        },
      },
    );
    const answer = await routes.request(
      `${ORIGIN}${PAIRING_REDEEM_PATH}?token=anything`,
      { headers: { "x-test-session": "ghost" } },
      LOOPBACK_PEER,
    );
    expect(answer.status).toBe(403);
  });
});

describe("/api/me says whether the browser is a remote session", () => {
  test("a signed-in browser that is not paired is remote, and may read /api/me to learn it; a paired one is not", async () => {
    const config = signInConfig();
    const { app } = assembleSignIn(config);
    const unpaired = await ask(app, "/api/me", { session: "user" });
    expect(unpaired.status).toBe(200);
    expect(await unpaired.json()).toMatchObject({ remote: true });

    const paired = await ask(app, "/api/me", {
      session: "user",
      headers: { cookie: pairedCookie(config, "user") },
    });
    expect(paired.status).toBe(200);
    expect(await paired.json()).toMatchObject({ remote: false });
  });

  test("a deployment without an installation secret, and single-user mode, answer false", async () => {
    const { app: withoutSecret } = assembleSignIn(signInConfig({}, false));
    const signedIn = await ask(withoutSecret, "/api/me", { session: "user" });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ remote: false });

    const single = loadConfig(
      {
        ...testEnvironment(),
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        BETTER_AUTH_SECRET: undefined,
        BETTER_AUTH_URL: undefined,
        INITIAL_ADMIN_EMAILS: undefined,
        OPENBOT_SINGLE_USER: "true",
        FREEDUET_INSTALL_SECRET: SECRET,
      },
      {},
    );
    // Single-user mode asks the pairing cookie of every route (D28), so the browser sends it.
    const { app: alone } = assembleSignIn(single);
    const answer = await ask(alone, "/api/me", {
      headers: { cookie: legacyCookie(single) },
    });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ remote: false });
  });
});
