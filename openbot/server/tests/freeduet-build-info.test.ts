/** D162: which build is running: the version function and `GET /api/freeduet/build`. */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createApp } from "../src/app";
import type { AuthService, RoleRepository } from "../src/auth/guards";
import { loadConfig } from "../src/config";
import {
  type BuildInputs,
  buildInfo,
  computeBuildInfo,
  formatBuilt,
} from "../src/freeduet/build-info";
import { createBuildInfoRoutes } from "../src/freeduet/build-info-routes";
import { testEnvironment } from "./support/environment";

const NOW = new Date(2026, 10, 26, 22, 5);
const base = (over: Partial<BuildInputs> = {}): BuildInputs => ({
  env: {},
  git: () => null,
  packageVersion: "0.2.0",
  now: NOW,
  ...over,
});
const gitSays =
  (answers: Record<string, string>) =>
  (args: string[]): string | null =>
    answers[args[0]] ?? null;

describe("computeBuildInfo", () => {
  test("tag, short commit and time make the label", () => {
    const info = computeBuildInfo(
      base({ git: gitSays({ describe: "v0.2.2", "rev-parse": "94313002" }) }),
    );
    expect(info.version).toBe("0.2.2");
    expect(info.commit).toBe("94313002");
    expect(info.label).toBe("v0.2.2 · 94313002 · 26 Nov 2026 22:05");
  });

  test("with no reachable tag the newest release tag is used", () => {
    const info = computeBuildInfo(
      base({ git: gitSays({ tag: "v0.2.2", "rev-parse": "94313002" }) }),
    );
    expect(info.version).toBe("0.2.2");
  });

  test("no git: the image's environment gives version, commit and time", () => {
    const info = computeBuildInfo(
      base({
        env: {
          FREEDUET_BUILD_VERSION: "0.3.0",
          FREEDUET_BUILD_COMMIT: "ABCDEF0123456789",
          FREEDUET_BUILD_TIME: new Date(2026, 10, 20, 8, 1).toISOString(),
        },
      }),
    );
    expect(info.label).toBe("v0.3.0 · abcdef01 · 20 Nov 2026 08:01");
  });

  test("no git and no environment: package.json, no commit", () => {
    const info = computeBuildInfo(base());
    expect(info.version).toBe("0.2.0");
    expect(info.commit).toBeNull();
    expect(info.label).toBe("v0.2.0 · 26 Nov 2026 22:05");
  });

  test("a git answer that is not a tag or a commit is dropped", () => {
    const info = computeBuildInfo(
      base({
        env: { FREEDUET_BUILD_COMMIT: "not a sha" },
        git: gitSays({
          describe: "fatal: not a git repository",
          "rev-parse": "/etc",
        }),
        packageVersion: null,
      }),
    );
    expect(info.version).toBe("unknown");
    expect(info.commit).toBeNull();
    expect(info.label).not.toContain("/");
  });

  test("formatBuilt", () => {
    expect(formatBuilt(new Date(2026, 0, 3, 4, 7))).toBe("3 Jan 2026 04:07");
  });

  test("the real function answers in this checkout", () => {
    const info = buildInfo();
    expect(info.label.length).toBeGreaterThan(5);
    expect(info.version).toMatch(/^\d+\.\d+/);
  });
});

describe("GET /api/freeduet/build", () => {
  const info = computeBuildInfo(base({ git: gitSays({ describe: "v0.2.2" }) }));
  const app = (signedIn: boolean) => {
    const root = new Hono();
    root.route(
      "/api/freeduet/build",
      createBuildInfoRoutes(
        async (context, next) =>
          signedIn ? next() : context.json({ error: "no" }, 401),
        () => info,
      ),
    );
    return root;
  };

  test("a signed-in person gets the build, uncached, with no path or host", async () => {
    const response = await app(true).request("/api/freeduet/build");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as { build: typeof info };
    expect(Object.keys(body.build).sort()).toEqual([
      "builtAt",
      "commit",
      "label",
      "version",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/\/home|\/tmp|localhost/);
  });

  test("nobody signed in is refused", async () => {
    const response = await app(false).request("/api/freeduet/build");
    expect(response.status).toBe(401);
  });

  test("it answers GET only", async () => {
    const response = await app(true).request("/api/freeduet/build", {
      method: "POST",
    });
    expect(response.status).toBe(404);
  });
});

describe("createApp mounts the route behind the sign-in", () => {
  const roles: RoleRepository = { rolesForUser: async () => ["user"] };
  const appFor = (session: unknown) => {
    const auth: AuthService = {
      handler: () => new Response(null, { status: 204 }),
      api: { getSession: async () => session as never },
    };
    return createApp(loadConfig(testEnvironment({})), auth, roles);
  };

  test("no session: 401; a plain signed-in person: the build", async () => {
    expect((await appFor(null).request("/api/freeduet/build")).status).toBe(
      401,
    );
    const ok = await appFor({
      user: { id: "p", email: "p@openbot.test", name: null, image: null },
    }).request("/api/freeduet/build");
    expect(ok.status).toBe(200);
    expect(
      ((await ok.json()) as { build: { label: string } }).build.label,
    ).toBeTruthy();
  });
});
