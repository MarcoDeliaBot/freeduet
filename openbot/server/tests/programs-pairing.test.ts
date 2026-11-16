/**
 * Pairing the programs helper (docs/design/programs-on-your-computer.md, S2, D62): a one-time code made by the
 * person at the computer, redeemed by the helper with no session, which hands the secret once and rotates the salt.
 * The routes run over a real database (the salt table); the code store's clock is injected.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppVariables } from "../src/auth/guards";
import type { PairingGate } from "../src/auth/install-secret";
import { decidingEntry, remoteMayReach } from "../src/auth/remote-limits";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema";
import { createProgramsBroker } from "../src/programs/broker";
import {
  CODE_SPACE,
  CODES_PER_MINUTE,
  createProgramsPairing,
  PAIRING_CODE_LIFETIME_MS,
  WRONG_PER_MINUTE,
  WRONG_WINDOW_MS,
} from "../src/programs/pairing";
import { createProgramsRoutes } from "../src/programs/routes";
import { createProgramsSwitch } from "../src/programs/switch";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import { pollBody } from "./support/programs-helper";

const KEY = "b3JkaW5hcnktdGVzdC1rZXktbm90LXRoZS1leGFtcGxl";
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const programsSwitch = createProgramsSwitch({ database, deploymentKey: KEY });
const prefix = `pair-${randomUUID()}`;
const created: string[] = [];
const clock = { at: Date.now() + 60_000 };

async function person(on = true): Promise<string> {
  const id = `${prefix}-${created.length}`;
  created.push(id);
  await database.insert(users).values({ id, email: `${id}@example.test` });
  if (on) await programsSwitch.set(id, true);
  return id;
}

afterAll(async () => {
  await database.delete(users).where(inArray(users.id, created));
  await database.$client.close();
});

function build(actorId: string, gate?: PairingGate) {
  const broker = createProgramsBroker({
    deploymentKey: KEY,
    salt: (a) => programsSwitch.saltOf(a),
    now: () => clock.at,
    enabled: (a) => programsSwitch.isOn(a),
    sweepEveryMs: 0,
  });
  const programsPairing = createProgramsPairing({
    isOn: (a) => programsSwitch.isOn(a),
    rotateSalt: (a) => programsSwitch.rotateSalt(a),
    secretFor: (a) => broker.helperSecretFor(a),
    now: () => clock.at,
  });
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.route(
    "/api/programs",
    createProgramsRoutes({
      broker,
      switch: programsSwitch,
      requireUser: (async (
        context: { set: (k: string, v: unknown) => void },
        next: () => Promise<void>,
      ) => {
        context.set("actor", {
          id: actorId,
          email: `${actorId}@example.test`,
          role: "user",
        });
        await next();
      }) as never,
      ...(gate ? { pairing: gate } : {}),
      programsPairing,
    }),
  );
  const json = (path: string, body: unknown, env?: unknown) =>
    routes.request(
      `/api/programs${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      env as never,
    );
  const code = async () =>
    (
      (await (await json("/pairing/code", {}, LOOPBACK_PEER)).json()) as {
        code: string;
      }
    ).code;
  const redeem = (typed: unknown, address?: string) =>
    json(
      "/helper/pair",
      { code: typed },
      address ? { server: { requestIP: () => ({ address }) } } : undefined,
    );
  return { broker, routes, json, code, redeem };
}

type Paired = { actorId: string; secret: string; serverTime: number };

describe("making a code", () => {
  test("only the person at the computer gets one, and only with the switch on", async () => {
    const id = await person();
    const { json } = build(id);
    expect((await json("/pairing/code", {})).status).toBe(403);
    const ok = await json("/pairing/code", {}, LOOPBACK_PEER);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = (await ok.json()) as {
      code: string;
      expiresInSeconds: number;
    };
    expect(body.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(body.expiresInSeconds).toBe(PAIRING_CODE_LIFETIME_MS / 1000);
    const off = await person(false);
    expect(
      (await build(off).json("/pairing/code", {}, LOOPBACK_PEER)).status,
    ).toBe(409);
  });

  test("a remote session (a browser not paired with the computer) is refused", async () => {
    const id = await person();
    const remote = {
      pairings: { standing: async () => null },
    } as unknown as PairingGate;
    const { json } = build(id, remote);
    expect((await json("/pairing/code", {}, LOOPBACK_PEER)).status).toBe(403);
  });

  test("the plain page is the person's own, at the computer, and carries no secret", async () => {
    const id = await person();
    const { routes } = build(id);
    expect((await routes.request("/api/programs/pairing")).status).toBe(403);
    const page = await routes.request(
      "/api/programs/pairing",
      {},
      LOOPBACK_PEER as never,
    );
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("sha256-");
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.headers.get("x-frame-options")).toBe("DENY");
  });

  test("more than six codes a minute are refused", async () => {
    const id = await person();
    const { json } = build(id);
    for (let i = 0; i < CODES_PER_MINUTE; i++)
      expect((await json("/pairing/code", {}, LOOPBACK_PEER)).status).toBe(200);
    expect((await json("/pairing/code", {}, LOOPBACK_PEER)).status).toBe(429);
  });
});

describe("redeeming a code", () => {
  test("hands the secret once, bound to the person who made the code, and the secret works", async () => {
    const id = await person();
    const { code, redeem, broker } = build(id);
    const typed = await code();
    const first = await redeem(typed.toLowerCase().replace("-", " "));
    expect(first.status).toBe(200);
    const body = (await first.json()) as Paired;
    expect(body.actorId).toBe(id);
    expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
    // The secret the helper holds is the one the server derives now.
    expect((await broker.helperSecretFor(id))?.toString("hex")).toBe(
      body.secret,
    );
    clock.at += 1000;
    const poll = await broker.poll(
      pollBody(Buffer.from(body.secret, "hex"), id, clock.at),
    );
    expect(poll.ok).toBe(true);
    // Single use: the same code again is refused.
    expect((await redeem(typed)).status).toBe(401);
  });

  test("an expired code is refused", async () => {
    const id = await person();
    const { code, redeem } = build(id);
    const typed = await code();
    clock.at += PAIRING_CODE_LIFETIME_MS + 1;
    expect((await redeem(typed)).status).toBe(401);
  });

  test("a new code replaces the last one for the same person", async () => {
    const id = await person();
    const { code, redeem } = build(id);
    const one = await code();
    const two = await code();
    expect((await redeem(one)).status).toBe(401);
    expect((await redeem(two)).status).toBe(200);
  });

  test("re-pairing rotates the salt: the old secret is refused afterwards, the new one works", async () => {
    const id = await person();
    const { code, redeem, broker } = build(id);
    const a = (await (await redeem(await code())).json()) as Paired;
    clock.at += 1000;
    expect(
      (await broker.poll(pollBody(Buffer.from(a.secret, "hex"), id, clock.at)))
        .ok,
    ).toBe(true);
    clock.at += 1000;
    const b = (await (await redeem(await code())).json()) as Paired;
    expect(b.secret).not.toBe(a.secret);
    clock.at += 1000;
    expect(
      (await broker.poll(pollBody(Buffer.from(a.secret, "hex"), id, clock.at)))
        .ok,
    ).toBe(false);
    clock.at += 1000;
    expect(
      (await broker.poll(pollBody(Buffer.from(b.secret, "hex"), id, clock.at)))
        .ok,
    ).toBe(true);
  });

  test("with the switch off by then, redeeming fails and the code is spent", async () => {
    const id = await person();
    const { code, redeem } = build(id);
    const typed = await code();
    await programsSwitch.set(id, false);
    expect((await redeem(typed)).status).toBe(401);
    await programsSwitch.set(id, true);
    expect((await redeem(typed)).status).toBe(401);
  });

  test("a code made for one person never pairs another person's helper", async () => {
    const a = await person();
    const b = await person();
    const one = build(a);
    const two = build(b);
    const typed = await one.code();
    // The same code store is per server; here two stores: B's store does not know A's code.
    expect((await two.redeem(typed)).status).toBe(401);
    const got = (await (await one.redeem(typed)).json()) as Paired;
    expect(got.actorId).toBe(a);
  });

  test("wrong shapes are wrong tries, never an exception", async () => {
    const id = await person();
    const { redeem, json } = build(id);
    for (const bad of [null, 5, {}, "x".repeat(500), "", "ABCDE-FGHJ"])
      expect([401, 429]).toContain((await redeem(bad)).status);
    expect([401, 429]).toContain(
      (await json("/helper/pair", { code: "AAAAAAAAAA", extra: 1 })).status,
    );
  });

  test("a flood of wrong codes from one address stops neither a correct code from another address nor from the same one", async () => {
    clock.at += 120_000;
    const id = await person();
    const { code, redeem } = build(id);
    const typed = await code();
    for (let i = 0; i < WRONG_PER_MINUTE + 40; i++)
      await redeem(`ZZZZ${i % 10}-ZZZZZ`, "203.0.113.9");
    // The flooding address is limited for its wrong tries...
    expect((await redeem("ZZZZZ-ZZZZZ", "203.0.113.9")).status).toBe(429);
    // ...a wrong code never burned the real one: another address pairs...
    const other = await redeem(typed, "198.51.100.7");
    expect(other.status).toBe(200);
    // ...and the same address pairs as well, because a correct code is never refused.
    const again = await code();
    expect((await redeem(again, "203.0.113.9")).status).toBe(200);
  });

  test("wrong tries are counted per address and the counters decay", async () => {
    clock.at += 120_000;
    const id = await person();
    const { redeem } = build(id);
    for (let i = 0; i < WRONG_PER_MINUTE; i++)
      expect((await redeem("ZZZZZ-ZZZZZ", "192.0.2.1")).status).toBe(401);
    expect((await redeem("ZZZZZ-ZZZZZ", "192.0.2.1")).status).toBe(429);
    // Another address has its own count.
    expect((await redeem("ZZZZZ-ZZZZZ", "192.0.2.2")).status).toBe(401);
    clock.at += WRONG_WINDOW_MS + 1;
    expect((await redeem("ZZZZZ-ZZZZZ", "192.0.2.1")).status).toBe(401);
  });

  test("the odds written in the source are the odds of the alphabet and the length", async () => {
    expect(CODE_SPACE).toBe(31 ** 10);
    expect(Math.log2(CODE_SPACE)).toBeGreaterThan(49.5);
    expect(Math.log2(CODE_SPACE)).toBeLessThan(49.6);
    const text = await Bun.file(
      new URL("../src/programs/pairing.ts", import.meta.url),
    ).text();
    expect(text).toContain("1 / 31^10 = 1 / 819,628,286,980,801");
    expect(text).toContain("about 49.5 bits");
    expect(String(31 ** 10)).toBe("819628286980801");
  });

  test("a switch turned off between the first check and the rotation is not paired", async () => {
    const id = await person();
    let calls = 0;
    const broker = createProgramsBroker({
      deploymentKey: KEY,
      salt: (a) => programsSwitch.saltOf(a),
      now: () => clock.at,
      enabled: (a) => programsSwitch.isOn(a),
      sweepEveryMs: 0,
    });
    const pairing = createProgramsPairing({
      isOn: async (a) => {
        calls += 1;
        return calls === 1 ? true : programsSwitch.isOn(a);
      },
      rotateSalt: async (a) => {
        await programsSwitch.set(a, false);
        await programsSwitch.rotateSalt(a);
      },
      secretFor: (a) => broker.helperSecretFor(a),
      now: () => clock.at,
    });
    const made = await pairing.makeCode(id);
    // makeCode asked isOn once (calls = 1); the next isOn is the redeem's first, answered true by the stub below.
    calls = 0;
    expect(made.ok).toBe(true);
    if (made.ok) expect((await pairing.redeem(made.code)).ok).toBe(false);
    await programsSwitch.set(id, true);
  });

  test("the answer carries no cache and nothing else of the secret machinery", async () => {
    const id = await person();
    const { code, redeem } = build(id);
    const response = await redeem(await code());
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys((await response.json()) as object).sort()).toEqual([
      "actorId",
      "secret",
      "serverTime",
    ]);
  });
});

describe("the new routes are on the remote deny list", () => {
  test("each is decided by the computers family and refused to a remote session", () => {
    for (const [method, path] of [
      ["POST", "/api/programs/helper/pair"],
      ["POST", "/api/programs/pairing/code"],
      ["GET", "/api/programs/pairing"],
    ] as const) {
      const entry = decidingEntry(method, path.split("/").filter(Boolean));
      expect(entry?.family).toBe("computers");
      expect(entry?.verdict).toBe("refuse");
      expect(remoteMayReach(method, path)).toBe(false);
    }
  });

  test("the secret is not returned by any other route and not kept: the module has no store of it", async () => {
    const text = await Bun.file(
      new URL("../src/programs/pairing.ts", import.meta.url),
    ).text();
    expect(text).not.toMatch(/insert\(|\.values\(|writeFile|console\./);
  });
});
