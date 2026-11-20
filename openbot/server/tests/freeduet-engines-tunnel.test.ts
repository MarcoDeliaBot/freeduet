/**
 * D106 (docs/M1_PLAN.md, section 68): the Engines page may be changed through a tunnel that runs on this machine by
 * an administrator who is signed in AND whose browser holds a live `computer` pairing of the same person. A phone
 * paired as a `device`, an unpaired browser and a non-administrator are refused, and nothing else that asks "at the
 * computer" is lifted.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  createBrowserPairings,
  createMemoryPairingStore,
} from "../src/auth/browser-pairings";
import {
  createRequireUser,
  type AuthService,
  type RoleRepository,
} from "../src/auth/guards";
import { signInGate } from "../src/auth/install-secret";
import { atTheComputer } from "../src/freeduet/at-the-computer";
import type { EngineChoices } from "../src/freeduet/engine-choices";
import {
  createEnginesRoutes,
  type EnginesReach,
} from "../src/freeduet/engines-routes";
import { LOOPBACK_PEER } from "./support/loopback-peer";

const SECRET = "s".repeat(40);
const TOKEN = "tunnel-agent-token";
const TUNNEL = { "cf-connecting-ip": "203.0.113.9" };
const stubs: { stop: () => void }[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

function agentReach(): EnginesReach {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      Response.json({
        engines: [
          {
            id: "claude",
            label: "Claude Code",
            kind: "cli",
            state: "ready",
            available: true,
          },
        ],
        problems: [],
      }),
  });
  stubs.push({ stop: () => server.stop(true) });
  return {
    environment: {},
    managedAgent: {
      endpoint: new URL(`http://127.0.0.1:${server.port}/`),
      token: TOKEN,
    },
  };
}

async function setup(role: "admin" | "user" = "admin") {
  const gate = signInGate(
    { singleUser: false, port: 3001, installSecret: SECRET },
    createBrowserPairings({
      store: createMemoryPairingStore(),
      secret: SECRET,
      port: 3001,
    }),
  );
  if (!gate) throw new Error("no gate");
  const computer = await gate.pairings.issue(
    "person-1",
    "computer",
    "PC",
    "link",
  );
  const device = await gate.pairings.issue(
    "person-1",
    "device",
    "Phone",
    "code",
  );
  const calls: { kind: string; via?: string }[] = [];
  const choices: EngineChoices = {
    load: async () => {},
    current: () => ({ state: "ready", members: {} }) as never,
    setMode: async (input) => {
      calls.push({ kind: "set", via: input.via });
      return {
        status: "changed",
        changeId: "c",
        memberId: input.memberId,
        previous: null,
        mode: input.mode,
      } as never;
    },
    undo: async (input) => {
      calls.push({ kind: "undo", via: input.via });
      return { status: "undone", changeId: input.changeId } as never;
    },
  };
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () => ({
        user: { id: "person-1", email: "p@openbot.test", role },
      }),
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const app = new Hono();
  app.route(
    "/api/freeduet/engines",
    createEnginesRoutes(
      createRequireUser(auth, roles),
      agentReach,
      choices,
      gate,
    ),
  );
  const put = (headers: Record<string, string>) =>
    app.request(
      "/api/freeduet/engines/members/leo/mode",
      {
        method: "PUT",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ mode: "ask_first" }),
      },
      LOOPBACK_PEER,
    );
  return { app, calls, computer, device, put, gate };
}
const cookie = (setCookie: string) => ({
  cookie: setCookie.split(";")[0] as string,
});

describe("a change through a tunnel", () => {
  test("an administrator with a computer pairing may change, and the audit row says tunnel", async () => {
    const t = await setup();
    const response = await t.put({
      ...TUNNEL,
      ...cookie(t.computer.setCookie),
    });
    expect(response.status).toBe(200);
    expect(t.calls).toEqual([{ kind: "set", via: "tunnel" }]);
  });

  test("undo follows the same rule", async () => {
    const t = await setup();
    const id = "0".repeat(8) + "-0000-4000-8000-" + "0".repeat(12);
    const undo = (headers: Record<string, string>) =>
      t.app.request(
        `/api/freeduet/engines/changes/${id}/undo`,
        { method: "POST", headers },
        LOOPBACK_PEER,
      );
    expect(
      (await undo({ ...TUNNEL, ...cookie(t.device.setCookie) })).status,
    ).toBe(403);
    expect((await undo({ ...TUNNEL })).status).toBe(403);
    expect(
      (await undo({ ...TUNNEL, ...cookie(t.computer.setCookie) })).status,
    ).toBe(200);
    expect(t.calls).toEqual([{ kind: "undo", via: "tunnel" }]);
  });

  test("a phone paired as a device is refused, and the sentence says how to pair", async () => {
    const t = await setup();
    const response = await t.put({ ...TUNNEL, ...cookie(t.device.setCookie) });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toContain(
      "bash scripts/open.sh",
    );
    expect(t.calls).toEqual([]);
  });

  test("an unpaired browser is refused", async () => {
    const t = await setup();
    expect((await t.put({ ...TUNNEL })).status).toBe(403);
    expect(t.calls).toEqual([]);
  });

  test("a computer pairing of another person is no pairing", async () => {
    const t = await setup();
    const other = await t.gate.pairings.issue(
      "person-2",
      "computer",
      "PC",
      "link",
    );
    expect(
      (await t.put({ ...TUNNEL, ...cookie(other.setCookie) })).status,
    ).toBe(403);
    expect(t.calls).toEqual([]);
  });

  test("a non-administrator is refused even with a computer pairing", async () => {
    const t = await setup("user");
    expect(
      (await t.put({ ...TUNNEL, ...cookie(t.computer.setCookie) })).status,
    ).toBe(403);
    expect(t.calls).toEqual([]);
  });

  test("a direct request from a paired browser is allowed and carries no tunnel mark", async () => {
    const t = await setup();
    expect((await t.put({ ...cookie(t.computer.setCookie) })).status).toBe(200);
    expect(t.calls).toEqual([{ kind: "set" }]);
  });

  test("the page is told why it cannot change: pair this browser", async () => {
    const t = await setup();
    const get = (headers: Record<string, string>) =>
      t.app.request("/api/freeduet/engines", { headers }, LOOPBACK_PEER);
    const paired = (await (
      await get({ ...TUNNEL, ...cookie(t.computer.setCookie) })
    ).json()) as {
      cannotChange: string | null;
    };
    expect(paired.cannotChange).not.toBe("not_paired_with_the_computer");
    expect(paired.cannotChange).not.toBe("not_at_the_computer");
    const unpaired = (await (await get({ ...TUNNEL })).json()) as {
      cannotChange: string;
    };
    expect(unpaired.cannotChange).toBe("not_paired_with_the_computer");
  });
});

describe("nothing else is lifted", () => {
  test("atTheComputer, which every other route asks, still refuses a tunnel with a computer pairing", async () => {
    const t = await setup();
    const tunnel = new Request("http://localhost:3001/api/x", {
      headers: { ...TUNNEL, ...cookie(t.computer.setCookie) },
    });
    expect(await atTheComputer(LOOPBACK_PEER, tunnel, t.gate, "person-1")).toBe(
      false,
    );
    const direct = new Request("http://localhost:3001/api/x", {
      headers: cookie(t.computer.setCookie),
    });
    expect(await atTheComputer(LOOPBACK_PEER, direct, t.gate, "person-1")).toBe(
      true,
    );
  });

  test("single-user mode (no gate) still refuses a tunnel", async () => {
    const choices: EngineChoices = {
      load: async () => {},
      current: () => ({ state: "ready", members: {} }) as never,
      setMode: async () => {
        throw new Error("must not be called");
      },
      undo: async () => {
        throw new Error("must not be called");
      },
    };
    const auth: AuthService = {
      handler: () => new Response(null, { status: 204 }),
      api: {
        getSession: async () => ({
          user: { id: "person-1", email: "p@openbot.test", role: "admin" },
        }),
      },
    };
    const app = new Hono();
    app.route(
      "/e",
      createEnginesRoutes(
        createRequireUser(auth, { rolesForUser: async () => [] }),
        agentReach,
        choices,
      ),
    );
    const response = await app.request(
      "/e/members/leo/mode",
      {
        method: "PUT",
        headers: { ...TUNNEL, "content-type": "application/json" },
        body: JSON.stringify({ mode: "ask_first" }),
      },
      LOOPBACK_PEER,
    );
    expect(response.status).toBe(403);
  });
});
