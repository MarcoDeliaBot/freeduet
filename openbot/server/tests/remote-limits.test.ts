/**
 * Who is remote (docs/design/phone-and-remote.md 3.5.1): the classification, and the one "at the computer" the
 * Engines page asks. Built from a session and one cookie, and from nothing a sender can choose. Since D49 the
 * cookie is a token of ONE browser, matched against a live pairing of the SAME signed-in person.
 */
import { describe, expect, test } from "bun:test";
import { createRequireUser } from "../src/auth/guards";
import {
  createBrowserPairings,
  createMemoryPairingStore,
} from "../src/auth/browser-pairings";
import { installCookieName, signInGate } from "../src/auth/install-secret";
import { isRemote, isRemoteSession } from "../src/auth/remote-limits";
import { loadConfig } from "../src/config";
import { atTheComputer } from "../src/freeduet/at-the-computer";
import { createEnginesRoutes } from "../src/freeduet/engines-routes";
import { testEnvironment } from "./support/environment";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import {
  legacyCookie,
  pairedCookie,
  peerAt,
  SECRET,
  seedPairings,
  signInConfig,
  stubAuth,
  stubRoles,
} from "./support/signin-app";

const config = signInConfig();
const seeded = seedPairings(config);
const gate = signInGate(config, seeded.service);
if (!gate) throw new Error("a sign-in configuration with a secret has a gate");

const URL_ = "http://localhost:3001/api/channels";
const ask = (headers: Record<string, string> = {}) =>
  new Request(URL_, { headers });

describe("the gate", () => {
  test("exists for sign-in with a secret, and for no other deployment", () => {
    expect(gate).toMatchObject({
      secret: SECRET,
      cookie: installCookieName(config.port),
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
    expect(signInGate(single)).toBeUndefined();
  });
});

describe("isRemote: the cookie, asked of the person the session names, and nothing else", () => {
  test("without a gate nothing is remote", async () => {
    expect(await isRemote(undefined, ask(), "u-admin")).toBe(false);
  });

  test("a browser whose token is a live pairing of this person is paired; any other is remote", async () => {
    expect(
      await isRemote(gate, ask({ cookie: pairedCookie(config) }), "u-admin"),
    ).toBe(false);
    expect(
      await isRemote(
        gate,
        ask({ cookie: `a=b; ${pairedCookie(config)}; c=d` }),
        "u-admin",
      ),
    ).toBe(false);
    expect(await isRemote(gate, ask(), "u-admin")).toBe(true);
    expect(
      await isRemote(
        gate,
        ask({ cookie: `freeduet_pair_${config.port}=nope` }),
        "u-admin",
      ),
    ).toBe(true);
    // The right value under another installation's name is not this one's.
    expect(
      await isRemote(
        gate,
        ask({ cookie: pairedCookie(config).replace(`_${config.port}`, "_1") }),
        "u-admin",
      ),
    ).toBe(true);
  });

  test("a token of person A never makes person B at the computer", async () => {
    const cookie = pairedCookie(config, "admin");
    expect(await isRemote(gate, ask({ cookie }), "u-admin")).toBe(false);
    expect(await isRemote(gate, ask({ cookie }), "u-user")).toBe(true);
    expect(await isRemote(gate, ask({ cookie }), "u-ghost")).toBe(true);
    // And the device token of B is B's own.
    expect(
      await isRemote(
        gate,
        ask({ cookie: pairedCookie(config, "user", "device") }),
        "u-user",
      ),
    ).toBe(false);
  });

  test("a revoked pairing is remote on the very next request", async () => {
    const own = seedPairings(config);
    const ownGate = signInGate(config, own.service);
    const request = () => ask({ cookie: pairedCookie(config, "user") });
    expect(await isRemote(ownGate, request(), "u-user")).toBe(false);
    expect(
      await own.service.revoke("u-user", "seed-user-computer", "test"),
    ).toBe(true);
    expect(await isRemote(ownGate, request(), "u-user")).toBe(true);
  });

  test("an expired pairing is remote, and so is one made under another secret", async () => {
    let clock = Date.now();
    const timed = seedPairings(config, { now: () => clock });
    const timedGate = signInGate(config, timed.service);
    const request = () => ask({ cookie: pairedCookie(config) });
    expect(await isRemote(timedGate, request(), "u-admin")).toBe(false);
    clock += 401 * 86_400_000;
    expect(await isRemote(timedGate, request(), "u-admin")).toBe(true);

    // The same rows, read by a server whose secret has changed: no pairing is live.
    const rotated = createBrowserPairings({
      store: seeded.store,
      secret: `${SECRET}-new`,
      port: config.port,
    });
    expect(
      await isRemote(
        signInGate(config, rotated),
        ask({ cookie: pairedCookie(config) }),
        "u-admin",
      ),
    ).toBe(true);
  });

  test("a store that fails is remote: a fault refuses and never lifts", async () => {
    const failing = createBrowserPairings({
      store: {
        ...createMemoryPairingStore(),
        findLive: async () => {
          throw new Error("database down");
        },
      },
      secret: SECRET,
      port: config.port,
    });
    expect(
      await isRemote(
        signInGate(config, failing),
        ask({ cookie: pairedCookie(config) }),
        "u-admin",
      ),
    ).toBe(true);
  });

  test("the old cookie, the secret itself, pairs nothing here: it is upgraded elsewhere, once, by a signed-in request", async () => {
    expect(
      await isRemote(gate, ask({ cookie: legacyCookie(config) }), "u-admin"),
    ).toBe(true);
  });

  test("a header, the user agent, the origin or the query never make a request paired", async () => {
    const forged: Record<string, string>[] = [
      { "x-forwarded-for": "127.0.0.1" },
      { "x-real-ip": "127.0.0.1" },
      { forwarded: "for=127.0.0.1" },
      { "user-agent": "FreeDuet-Computer" },
      { host: "localhost:3001" },
      { origin: "http://localhost:3001" },
      { authorization: `Bearer ${SECRET}` },
      { "x-install-secret": SECRET },
      { "x-freeduet-install": SECRET },
    ];
    for (const headers of forged)
      expect(await isRemote(gate, ask(headers), "u-admin")).toBe(true);
    expect(
      await isRemote(
        gate,
        new Request(`${URL_}?${installCookieName(config.port)}=${SECRET}`),
        "u-admin",
      ),
    ).toBe(true);
  });
});

describe("isRemoteSession: a session, and not the cookie, is what is limited", () => {
  const sessions = (outcome: "session" | "none" | "throws") => {
    const seen: unknown[] = [];
    const auth = {
      api: {
        getSession: async (input: unknown) => {
          seen.push(input);
          if (outcome === "throws") throw new Error("database down");
          return outcome === "session"
            ? { user: { id: "u-admin", email: "u@openbot.test" } }
            : null;
        },
      },
    };
    return { auth, seen };
  };

  test("a session without the cookie is remote, found with the lookup the guards make", async () => {
    const { auth, seen } = sessions("session");
    const request = ask({ cookie: "better-auth.session=x" });
    expect(await isRemoteSession(gate, auth, request)).toBe(true);
    expect(seen).toEqual([
      { headers: request.headers, query: { disableCookieCache: true } },
    ]);
  });

  test("a session with its own person's token is paired; with another person's token it is remote", async () => {
    const { auth } = sessions("session");
    expect(
      await isRemoteSession(gate, auth, ask({ cookie: pairedCookie(config) })),
    ).toBe(false);
    expect(
      await isRemoteSession(
        gate,
        auth,
        ask({ cookie: pairedCookie(config, "user") }),
      ),
    ).toBe(true);
  });

  test("no session is nobody, with the cookie or without: the cookie signs nobody in", async () => {
    const { auth } = sessions("none");
    expect(await isRemoteSession(gate, auth, ask())).toBe(false);
    expect(
      await isRemoteSession(gate, auth, ask({ cookie: pairedCookie(config) })),
    ).toBe(false);
  });

  test("a lookup that fails counts as a session, so it refuses and never lets through", async () => {
    const { auth } = sessions("throws");
    expect(await isRemoteSession(gate, auth, ask())).toBe(true);
  });

  test("with no gate, or nobody to ask, there is no remote session, and nothing is looked up", async () => {
    const { auth, seen } = sessions("session");
    expect(await isRemoteSession(undefined, auth, ask())).toBe(false);
    expect(await isRemoteSession(gate, undefined, ask())).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe("atTheComputer with a pairing marker", () => {
  test("without one it is what it was: loopback and no proxy header", async () => {
    expect(
      await atTheComputer(LOOPBACK_PEER, ask(), undefined, "u-admin"),
    ).toBe(true);
    expect(
      await atTheComputer(
        LOOPBACK_PEER,
        ask({ "x-forwarded-for": "1" }),
        undefined,
        "u-admin",
      ),
    ).toBe(false);
  });

  test("with one, a live pairing of this person is asked on top, and a tunnel that strips its headers no longer passes", async () => {
    const paired = ask({ cookie: pairedCookie(config) });
    expect(await atTheComputer(LOOPBACK_PEER, paired, gate, "u-admin")).toBe(
      true,
    );
    // The hole of the two conditions alone: loopback, no proxy header, no pairing.
    expect(
      await atTheComputer(LOOPBACK_PEER, ask(), undefined, "u-admin"),
    ).toBe(true);
    expect(await atTheComputer(LOOPBACK_PEER, ask(), gate, "u-admin")).toBe(
      false,
    );
    expect(
      await atTheComputer(
        LOOPBACK_PEER,
        ask({ cookie: "x=y" }),
        gate,
        "u-admin",
      ),
    ).toBe(false);
    // Another person's token is no pairing of this one.
    expect(await atTheComputer(LOOPBACK_PEER, paired, gate, "u-user")).toBe(
      false,
    );
  });

  test("the pairing does not replace the other two conditions", async () => {
    const headers = { cookie: pairedCookie(config) };
    expect(
      await atTheComputer(peerAt("203.0.113.9"), ask(headers), gate, "u-admin"),
    ).toBe(false);
    expect(await atTheComputer(undefined, ask(headers), gate, "u-admin")).toBe(
      false,
    );
    expect(
      await atTheComputer(
        LOOPBACK_PEER,
        ask({ ...headers, "x-forwarded-for": "198.51.100.7" }),
        gate,
        "u-admin",
      ),
    ).toBe(false);
  });
});

describe("the Engines routes with the marker", () => {
  const signedIn = createRequireUser(stubAuth, stubRoles);
  const reach = () => ({ environment: {}, managedAgent: undefined });
  const put = (
    app: ReturnType<typeof createEnginesRoutes>,
    headers: Record<string, string>,
  ) =>
    app.request(
      "http://localhost:3001/members/iris/mode",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-test-session": "admin",
          ...headers,
        },
        body: JSON.stringify({ mode: "ask-first" }),
      },
      LOOPBACK_PEER,
    );

  test("an administrator at the loopback with no cookie is refused as not at the computer", async () => {
    const app = createEnginesRoutes(signedIn, reach, undefined, gate);
    const answer = await put(app, {});
    expect(answer.status).toBe(403);
    expect(await answer.json()).toEqual({
      error:
        "Change this on the computer FreeDuet runs on. Nothing was changed.",
    });
  });

  test("with a pairing of this administrator the guards pass (the next answer is that no choices are kept)", async () => {
    const app = createEnginesRoutes(signedIn, reach, undefined, gate);
    expect((await put(app, { cookie: pairedCookie(config) })).status).toBe(503);
  });

  test("another person's pairing does not pass them", async () => {
    const app = createEnginesRoutes(signedIn, reach, undefined, gate);
    expect(
      (await put(app, { cookie: pairedCookie(config, "user") })).status,
    ).toBe(403);
  });

  test("guard of unchanged behaviour: given no marker, the loopback needs no cookie", async () => {
    const app = createEnginesRoutes(signedIn, reach);
    expect((await put(app, {})).status).toBe(503);
  });
});
