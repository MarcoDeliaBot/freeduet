/**
 * The list of what a remote session may reach (docs/design/phone-and-remote.md 3.5.2), held to the app it
 * guards and to the document that gives its reasons.
 *
 * Four things are held: every route the app registers is on the list or under a prefix the list refuses (so a
 * route family added later fails here until somebody decides it); the allowed routes are exactly the ones
 * pinned below (so an allowance is never a side effect); the matcher is strict about how a path is spelled;
 * and the document and the list say the same thing family by family.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createApp } from "../src/app";
import { createAuditStore } from "../src/audit";
import { createAuth } from "../src/auth";
import {
  decidingEntry,
  LEDGER,
  remoteMayReach,
  spellingsOf,
} from "../src/auth/remote-limits";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { DIRECTORY_PATH } from "../src/web-bot-auth";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";
import { SECRET } from "./support/signin-app";

// ---------------------------------------------------------------------------------------------------
// The routes the app registers, read from an app assembled with a stand-in behind every argument.
// ---------------------------------------------------------------------------------------------------

/** Any property is a stand-in, any call returns one, and awaiting one gives it back. */
function stub(): unknown {
  return new Proxy(() => {}, {
    get: (_target, property) => {
      if (property === "then") return undefined;
      if (property === Symbol.toPrimitive) return () => "stub";
      if (property === Symbol.iterator) return undefined;
      return stub();
    },
    apply: () => stub(),
    has: () => false,
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => undefined,
  });
}

const dist = mkdtempSync(join(tmpdir(), "remote-ledger-"));
writeFileSync(join(dist, "index.html"), "<!doctype html><title>app</title>");

type Route = { method: string; path: string };

/** `createApp` with sign-in and a secret, every optional piece present, so every route is mounted. */
function registeredRoutes(): Route[] {
  const config = loadConfig(
    testEnvironment({
      FREEDUET_INSTALL_SECRET: SECRET,
      APP_DIST_DIR: dist,
      OPENBOT_PUBLIC_URL: "http://localhost:3001",
      WEB_BOT_AUTH: "off",
    }),
    {},
  );
  const args: unknown[] = new Array(38).fill(undefined);
  args[0] = config;
  for (let index = 1; index < 38; index++) args[index] = stub();
  args[6] = new Hono().basePath("/api/copilotkit").all("*", (c) => c.json({}));
  args[14] = new Proxy(stub() as object, {
    get: (target, property) =>
      property === "brokerProvider"
        ? "composio"
        : Reflect.get(target, property),
  });
  args[27] = "desktop-token";
  args[29] = { broker: stub(), provider: "composio" };
  args[37] = new Hono().get("/", (c) => c.json({}));
  const coworker: Record<string, unknown> = {};
  for (const key of [
    "demonstrations",
    "approvals",
    "shared",
    "passwords",
    "memory",
    "proactive",
    "groups",
    "teamBots",
    "lifecycle",
    "settingChanges",
    "engineChoices",
    "programs",
    "pairings",
  ])
    coworker[key] = stub();
  coworker.responsibilities = {
    store: stub(),
    engine: stub(),
    bindings: stub(),
    triggers: {
      store: stub(),
      emailDomain: "x",
      ingressRoutes: new Hono().post("/*", (c) => c.json({})),
      emailRoutes: new Hono().post("/*", (c) => c.json({})),
    },
  };
  coworker.openduet = {
    pages: stub(),
    setup: stub(),
    tasks: stub(),
    intake: stub(),
    report: stub(),
    channels: stub(),
  };
  coworker.delivery = { authenticated: stub(), webhooks: stub() };
  args[34] = coworker;
  const app = (createApp as unknown as (...values: unknown[]) => Hono)(...args);
  const seen = new Set<string>();
  const routes: Route[] = [];
  for (const route of app.routes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ method: route.method, path: route.path });
  }
  return routes;
}

/** Registrations that are guards over a whole prefix and carry no route of their own to classify. */
const GUARDS_ONLY = new Set(["ALL /*", "ALL /api/*"]);

/** A path a registered pattern would match: `:name` and a trailing `*` become one word. */
const sample = (pattern: string) =>
  pattern.replace(/:[A-Za-z]+/g, "p0").replace(/\*$/, "p0");

/**
 * The registered routes that no entry of the list decides but the two catch-alls (`/api/*`, `/internal/*`).
 * One of these is a route family nobody has decided about, and it is refused until somebody does.
 */
function undecided(routes: Route[]): string[] {
  const found: string[] = [];
  for (const { method, path } of routes) {
    if (GUARDS_ONLY.has(`${method} ${path}`)) continue;
    const verbs = method === "ALL" ? ["GET", "POST"] : [method];
    for (const verb of verbs) {
      const parts = sample(path).split("/").filter(Boolean);
      const entry = decidingEntry(verb, parts);
      if (!entry || entry.family === "rest") found.push(`${verb} ${path}`);
    }
  }
  return [...new Set(found)].sort();
}

describe("every route the app registers is decided", () => {
  // Assembled once: it is the slow part.
  const registered = registeredRoutes();

  test("none is left to the catch-all: a family added later fails here until it is listed", () => {
    expect(registered.length).toBeGreaterThan(300);
    expect(undecided(registered)).toEqual([]);
  });

  test("and the check does fail for a route nobody listed (it is not blind)", () => {
    // A route inside a family the list names is decided by the family's prefix (refused or not, it is a
    // decision); the two outside every family are the ones that are caught.
    const added: Route[] = [
      { method: "GET", path: "/api/zzz-new-family/thing" },
      { method: "POST", path: "/internal/zzz-new-door" },
      { method: "DELETE", path: "/api/channels/:channelId/new-call" },
    ];
    expect(undecided([...registered, ...added])).toEqual([
      "GET /api/zzz-new-family/thing",
      "POST /internal/zzz-new-door",
    ]);
  });

  test("the routes that only the catch-alls decide are the ones that are meant to be", () => {
    expect(
      registered
        .filter(({ method, path }) => GUARDS_ONLY.has(`${method} ${path}`))
        .map(({ method, path }) => `${method} ${path}`)
        .sort(),
    ).toEqual(["ALL /*", "ALL /api/*"]);
  });
});

// ---------------------------------------------------------------------------------------------------
// What is allowed, pinned.
// ---------------------------------------------------------------------------------------------------

describe("what a remote session may reach", () => {
  test("is exactly this, and nothing is allowed as a side effect of another change", () => {
    expect(
      LEDGER.filter((entry) => entry.verdict === "allow")
        .map((entry) => entry.route)
        .sort(),
    ).toEqual(
      [
        "GET /*",
        "GET /health",
        "GET /.well-known/http-message-signatures-directory",
        "GET /api/capabilities",
        "GET /api/auth/get-session",
        "POST /api/auth/get-session",
        "POST /api/auth/sign-out",
        "POST /api/auth/sign-in/social",
        "POST /api/auth/sign-in/sso",
        "GET /api/auth/callback/:id",
        "POST /api/auth/callback/:id",
        "GET /api/auth/sso/callback",
        "GET /api/auth/sso/callback/:providerId",
        "GET /api/auth/sso/saml2/sp/acs/:providerId",
        "POST /api/auth/sso/saml2/sp/acs/:providerId",
        "GET /api/auth/error",
        "GET /api/auth/ok",
        "GET /api/pair",
        "POST /api/pairings/redeem",
        "GET /api/me",
        "POST /api/me/onboarding",
        "GET /api/channels",
        "GET /api/channels/events",
        "GET /api/channels/:channelId",
        "POST /api/channels",
        "POST /api/channels/first-day",
        "POST /api/channels/morning-brief",
        "POST /api/channels/:channelId/activity",
        "POST /api/channels/:channelId/busy",
        "PUT /api/channels/:channelId/read",
        "POST /api/channels/:channelId/attachments",
        "GET /api/attachments/:id",
        "GET /api/groups/:channelId",
        "GET /api/copilotkit/info",
        "POST /api/copilotkit/agent/:agentId/run",
        "POST /api/copilotkit/agent/:agentId/connect",
        "POST /api/copilotkit/agent/:agentId/stop/:threadId",
        "GET /api/copilotkit/threads",
        "GET /api/copilotkit/threads/:threadId/messages",
        "POST /api/route",
        "POST /api/threads/mint",
        "GET /api/threads/:threadId",
        "GET /api/agents",
        "GET /api/agents/:agentId",
        "GET /api/bots/attention",
        "GET /api/bots/:agentId/activity",
        "POST /api/bots/:agentId/activity/handoffs/stop",
        "GET /api/approvals",
        "POST /api/approvals/:id/decision",
        "POST /api/approvals/questions/:id/respond",
        "GET /api/openduet/channels",
        "GET /api/settings/preferences",
        "GET /api/freeduet/build",
      ].sort(),
    );
  });

  test("each allowed route is reachable, and no refusal shadows it", () => {
    for (const entry of LEDGER.filter((each) => each.verdict === "allow")) {
      const space = entry.route.indexOf(" ");
      const path = sample(entry.route.slice(space + 1));
      expect([
        entry.route,
        remoteMayReach(entry.route.slice(0, space), path),
      ]).toEqual([entry.route, true]);
    }
  });

  test("each refused route is refused, whatever the method, where no allowed route is cut out of it", () => {
    const familiesWithAllowances = new Set(
      LEDGER.filter((each) => each.verdict === "allow").map(
        (each) => each.family,
      ),
    );
    let checked = 0;
    for (const entry of LEDGER.filter((each) => each.verdict === "refuse")) {
      const space = entry.route.indexOf(" ");
      const verb = entry.route.slice(0, space);
      const pattern = entry.route.slice(space + 1);
      // A prefix of a family that has allowed routes is refused except for them (tested above, by name).
      if (pattern.endsWith("*") && familiesWithAllowances.has(entry.family))
        continue;
      const path = sample(pattern);
      for (const method of verb === "ALL"
        ? ["GET", "POST", "DELETE"]
        : [verb]) {
        checked += 1;
        expect([entry.route, method, remoteMayReach(method, path)]).toEqual([
          entry.route,
          method,
          false,
        ]);
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  test("the key directory's path is the one the app serves", () => {
    expect(DIRECTORY_PATH).toBe(
      "/.well-known/http-message-signatures-directory",
    );
    expect(remoteMayReach("GET", DIRECTORY_PATH)).toBe(true);
  });

  test("the chat calls work, and the runtime's other calls do not", () => {
    const reach = (method: string, path: string) =>
      remoteMayReach(method, path);
    expect(reach("GET", "/api/copilotkit/info")).toBe(true);
    expect(reach("POST", "/api/copilotkit/agent/iris/run")).toBe(true);
    expect(reach("POST", "/api/copilotkit/agent/iris/connect")).toBe(true);
    expect(reach("POST", "/api/copilotkit/agent/iris/stop/t1")).toBe(true);
    expect(reach("GET", "/api/copilotkit/threads")).toBe(true);
    expect(reach("GET", "/api/copilotkit/threads/t1/messages")).toBe(true);
    for (const [method, path] of [
      ["POST", "/api/copilotkit/transcribe"],
      ["POST", "/api/copilotkit/agent/iris/suggest"],
      ["GET", "/api/copilotkit/inspector-metadata"],
      ["GET", "/api/copilotkit/inspector-learning"],
      ["GET", "/api/copilotkit/cpk-debug-events"],
      ["POST", "/api/copilotkit/trajectory/t1/connect"],
      ["POST", "/api/copilotkit/threads/subscribe"],
      ["POST", "/api/copilotkit/threads/clear"],
      ["POST", "/api/copilotkit/threads/t1/archive"],
      ["PATCH", "/api/copilotkit/threads/t1"],
      ["DELETE", "/api/copilotkit/threads/t1"],
      ["GET", "/api/copilotkit/memories"],
      ["POST", "/api/copilotkit/annotate"],
      // The runtime routes on the last words, so a longer path must not borrow them.
      ["GET", "/api/copilotkit/x/info"],
      ["GET", "/api/copilotkit/x/threads/subscribe"],
      ["POST", "/api/copilotkit/x/agent/iris/run"],
      // And the single-route envelope: one body that names the call.
      ["POST", "/api/copilotkit"],
      ["POST", "/api/copilotkit/"],
    ] as const)
      expect(reach(method, path)).toBe(false);
  });

  test("sign-in works and the account stays put", () => {
    for (const [method, path] of [
      ["GET", "/api/auth/get-session"],
      ["POST", "/api/auth/sign-out"],
      ["POST", "/api/auth/sign-in/social"],
      ["POST", "/api/auth/sign-in/sso"],
      ["GET", "/api/auth/callback/okta"],
      ["GET", "/api/auth/sso/callback/okta"],
    ] as const)
      expect(remoteMayReach(method, path)).toBe(true);
    for (const [method, path] of [
      ["GET", "/api/auth/list-sessions"],
      ["POST", "/api/auth/revoke-sessions"],
      ["POST", "/api/auth/change-email"],
      ["POST", "/api/auth/update-user"],
      ["POST", "/api/auth/delete-user"],
      ["POST", "/api/auth/link-social"],
      ["POST", "/api/auth/sign-in/email"],
      ["POST", "/api/auth/sso/register"],
      ["GET", "/api/auth/scim/v2/Users"],
      ["PATCH", "/api/auth/scim/v2/Users/u1"],
      ["PUT", "/api/auth/scim/v2/Users/u1"],
      ["DELETE", "/api/auth/scim/v2/Users/u1"],
    ] as const)
      expect(remoteMayReach(method, path)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// How a path is spelled.
// ---------------------------------------------------------------------------------------------------

describe("the matcher is strict about spelling", () => {
  test("the most specific entry decides: a word beats a name, a name beats a star, a tie refuses", () => {
    const decided = (method: string, path: string) =>
      decidingEntry(method, path.split("/").filter(Boolean));
    expect(decided("GET", "/api/channels/abc")?.verdict).toBe("allow");
    expect(decided("PUT", "/api/channels/abc/pin")?.verdict).toBe("refuse");
    expect(decided("DELETE", "/api/channels/abc")?.verdict).toBe("refuse");
    // A word in a refused prefix is not reopened by an allowed `:name` that happens to match it.
    expect(decided("POST", "/api/approvals/abc/decision")?.verdict).toBe(
      "allow",
    );
    for (const word of [
      "shared-use",
      "full-access",
      "computer",
      "rules",
      "team",
      "preferences",
    ])
      expect(decided("POST", `/api/approvals/${word}/decision`)?.verdict).toBe(
        "refuse",
      );
    // No entry at all is a refusal, never an allowance.
    expect(decided("POST", "/")).toBeUndefined();
    expect(decided("PROPFIND", "/api/channels")?.verdict).toBe("refuse");
  });

  test("a method that is not listed is refused, and HEAD follows GET", () => {
    expect(remoteMayReach("GET", "/api/me")).toBe(true);
    expect(remoteMayReach("HEAD", "/api/me")).toBe(true);
    expect(remoteMayReach("HEAD", "/api/admin/people")).toBe(false);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"])
      expect(remoteMayReach(method, "/api/me")).toBe(false);
    expect(remoteMayReach("POST", "/health")).toBe(false);
    expect(remoteMayReach("POST", "/")).toBe(false);
  });

  test("the app itself loads, and nothing under /api or /internal is the app", () => {
    for (const path of [
      "/",
      "/index.html",
      "/assets/index-abc.js",
      "/channels/c1",
      "/apiary",
      "/internalised",
    ])
      expect(remoteMayReach("GET", path)).toBe(true);
    for (const path of [
      "/api",
      "/api/",
      "/api/unknown",
      "/api/admin/people",
      "/internal",
      "/internal/pairing",
      "/internal/routines/run",
    ])
      expect(remoteMayReach("GET", path)).toBe(false);
  });

  test("every spelling the server could read has to be allowed", () => {
    // Encoded: the router decodes a path, and so does a proxy, once or twice.
    expect(remoteMayReach("GET", "/api/%61dmin/people")).toBe(false);
    expect(remoteMayReach("GET", "/api/%2561dmin/people")).toBe(false);
    expect(remoteMayReach("GET", "/api/admin%2Fpeople")).toBe(false);
    // A name that decodes into more segments than it was sent as.
    expect(remoteMayReach("GET", "/api/channels/a%2Fpin")).toBe(false);
    expect(remoteMayReach("PUT", "/api/channels/a%2Fpin")).toBe(false);
    expect(remoteMayReach("POST", "/api/copilotkit/agent/a%2Fb/run")).toBe(
      false,
    );
    // The router's own reading differs from the one sent: the stricter of them decides.
    expect(remoteMayReach("GET", "/api/channels", "/api/admin/people")).toBe(
      false,
    );
    expect(remoteMayReach("GET", "/api/admin/people", "/api/channels")).toBe(
      false,
    );
    // A plain, allowed name decodes to itself.
    expect(remoteMayReach("GET", "/api/channels/a%20b")).toBe(true);
    expect(spellingsOf("/api/%2561dmin")).toEqual([
      "/api/%2561dmin",
      "/api/%61dmin",
      "/api/admin",
    ]);
  });

  test("an empty or dot segment is not a path this list will judge", () => {
    for (const path of [
      "/api//channels",
      "/api/channels//abc",
      "//api/channels",
      "/api/copilotkit//info",
      "/api/copilotkit/agent//run",
      "/api/channels/./abc",
      "/api/channels/%2e%2e/abc",
      "/api/copilotkit/agent/%2e%2e/run",
      "/api/channels/%2E/abc",
    ])
      expect(remoteMayReach("GET", path) || remoteMayReach("POST", path)).toBe(
        false,
      );
    // A path that is not a path, and one that does not decode.
    expect(remoteMayReach("GET", "api/channels")).toBe(false);
    expect(remoteMayReach("GET", "/api/channels/%E0%A4%A")).toBe(true);
    expect(remoteMayReach("PUT", "/api/channels/%E0%A4%A/pin")).toBe(false);
  });

  test("one trailing slash is the same path, and the case of a word is not folded", () => {
    expect(remoteMayReach("GET", "/api/channels/")).toBe(true);
    expect(remoteMayReach("DELETE", "/api/channels/abc/")).toBe(false);
    // `/API/...` is nothing the API serves (its routes are case sensitive), so it is the app's own
    // fallback page and no more.
    expect(remoteMayReach("GET", "/API/admin/people")).toBe(true);
    expect(remoteMayReach("GET", "/Api/channels")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// The sign-in library's own calls.
// ---------------------------------------------------------------------------------------------------

describe("every call of the sign-in library is decided", () => {
  const database = createDatabase(testDatabaseUrl(), TEST_POOL);
  afterAll(async () => {
    await database.$client.close();
  });

  /** What each call of the installed version is, by name. A call that is not here fails the test below. */
  const DECIDED: Record<string, "allow" | "refuse"> = {
    getSession: "allow",
    signOut: "allow",
    signInSocial: "allow",
    signInSSO: "allow",
    callbackOAuth: "allow",
    callbackSSO: "allow",
    callbackSSOShared: "allow",
    acsEndpoint: "allow",
    error: "allow",
    ok: "allow",
    accountInfo: "refuse",
    changeEmail: "refuse",
    changePassword: "refuse",
    deleteUser: "refuse",
    deleteUserCallback: "refuse",
    deleteSSOProvider: "refuse",
    electronInitOAuthProxy: "refuse",
    electronToken: "refuse",
    electronTransferUser: "refuse",
    getAccessToken: "refuse",
    getSSOProvider: "refuse",
    initiateSLO: "refuse",
    linkSocialAccount: "refuse",
    listSSOProviders: "refuse",
    listSessions: "refuse",
    listUserAccounts: "refuse",
    refreshToken: "refuse",
    registerSSOProvider: "refuse",
    requestPasswordReset: "refuse",
    requestPasswordResetCallback: "refuse",
    resetPassword: "refuse",
    revokeOtherSessions: "refuse",
    revokeSession: "refuse",
    revokeSessions: "refuse",
    sendVerificationEmail: "refuse",
    setPassword: "refuse",
    signInEmail: "refuse",
    signUpEmail: "refuse",
    sloEndpoint: "refuse",
    spMetadata: "refuse",
    unlinkAccount: "refuse",
    updateSSOProvider: "refuse",
    updateSession: "refuse",
    updateUser: "refuse",
    verifyEmail: "refuse",
    verifyPassword: "refuse",
  };

  test("each is allowed or refused here on purpose, and the list agrees with the decision", () => {
    const config = loadConfig(
      testEnvironment({
        OKTA_OAUTH_CLIENT_ID: "okta-client",
        OKTA_OAUTH_CLIENT_SECRET: "okta-client-secret-long-enough",
        OKTA_OAUTH_ISSUER: "http://127.0.0.1:1",
        SCIM_BEARER_TOKEN: "scim-token-that-is-long-enough-for-test",
      }),
      {},
    );
    const auth = createAuth(
      config,
      database,
      async () => false,
      createAuditStore(database),
    ) as unknown as {
      api: Record<
        string,
        { path?: string; options?: { method?: string | string[] } }
      >;
    };
    const undecidedCalls: string[] = [];
    const disagreements: string[] = [];
    let checked = 0;
    for (const [name, call] of Object.entries(auth.api)) {
      const expected = DECIDED[name];
      if (expected === undefined) undecidedCalls.push(name);
      // A server-only call has no path and is reachable by no request.
      if (!call.path) continue;
      const methods = [call.options?.method ?? "GET"].flat();
      for (const method of methods) {
        checked += 1;
        const path = `/api/auth${call.path.replace(/:[A-Za-z]+/g, "p0")}`;
        const allowedHere = remoteMayReach(method, path);
        if (expected && allowedHere !== (expected === "allow"))
          disagreements.push(`${method} ${path} (${name})`);
      }
    }
    expect(undecidedCalls).toEqual([]);
    expect(disagreements).toEqual([]);
    expect(checked).toBeGreaterThan(40);
  });
});

// ---------------------------------------------------------------------------------------------------
// The document.
// ---------------------------------------------------------------------------------------------------

describe("the document and the list say the same", () => {
  const document = require("node:fs").readFileSync(
    join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "docs",
      "design",
      "phone-and-remote.md",
    ),
    "utf8",
  ) as string;
  const table = document
    .split("<!-- remote-ledger:start -->")[1]
    ?.split("<!-- remote-ledger:end -->")[0];

  test("the table is there, one row to a family", () => {
    expect(table).toBeDefined();
    const rows = (table ?? "")
      .split("\n")
      .filter((line) => /^\| `[a-z-]+` \|/.test(line));
    const families = rows.map((row) => /^\| `([a-z-]+)`/.exec(row)?.[1]);
    expect(new Set(families).size).toBe(families.length);
    expect([...families].sort()).toEqual(
      [...new Set(LEDGER.map((entry) => entry.family))].sort(),
    );
  });

  test("each family is allowed, partly or refused in the document as it is in the list", () => {
    const rows = (table ?? "")
      .split("\n")
      .filter((line) => /^\| `[a-z-]+` \|/.test(line));
    for (const row of rows) {
      const cells = row.split("|").map((cell) => cell.trim());
      const family = cells[1]?.replaceAll("`", "");
      const verdicts = new Set(
        LEDGER.filter((entry) => entry.family === family).map(
          (entry) => entry.verdict,
        ),
      );
      const derived =
        verdicts.size === 2
          ? "partly"
          : verdicts.has("allow")
            ? "allowed"
            : "refused";
      expect([family, cells[3]]).toEqual([family, derived]);
    }
  });

  test("every allowed route is named in the document", () => {
    const text = table ?? "";
    for (const entry of LEDGER.filter((each) => each.verdict === "allow")) {
      if (entry.route === "GET /*") continue;
      const path = entry.route.slice(entry.route.indexOf(" ") + 1);
      const forms = [
        path,
        path.replace("/api/copilotkit/", ""),
        path.replace("/api/auth/", ""),
      ];
      expect([entry.route, forms.some((form) => text.includes(form))]).toEqual([
        entry.route,
        true,
      ]);
    }
  });
});
