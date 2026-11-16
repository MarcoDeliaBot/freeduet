/**
 * Pairing the programs helper (docs/design/programs-on-your-computer.md, S2, D62): a one-time code made by the
 * person at the computer, redeemed by the helper with no session, which hands the secret once and rotates the salt.
 * The routes run over a real database (the salt table); the code store's clock is injected.
 */
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
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
  PAIRING_CLEAN_BUDGET,
  PAIRING_CODE_LIFETIME_MS,
  PAIRING_MAX_ADDRESSES,
  WRONG_PER_MINUTE,
  WRONG_WINDOW_MS,
} from "../src/programs/pairing";
import {
  HELPER_FILE_MAX_BYTES,
  HELPER_FILES,
  HELPER_ZIP_NAME,
} from "../src/programs/helper-bundle";
import { createProgramsRoutes, PAIRING_SCRIPT } from "../src/programs/routes";
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

function build(
  actorId: string,
  gate?: PairingGate,
  extra: {
    helperDir?: string;
    auditStore?: { insert: (event: unknown) => Promise<void> };
    singleUserWithoutSecret?: boolean;
  } = {},
) {
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
      ...(extra.helperDir ? { helperDir: extra.helperDir } : {}),
      ...(extra.auditStore ? { auditStore: extra.auditStore as never } : {}),
      ...(extra.singleUserWithoutSecret
        ? { singleUserWithoutSecret: true }
        : {}),
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

  test("a flood from many addresses costs a bounded amount of cleaning per request, whatever the table holds (work, not wall time)", async () => {
    let at = 1_000_000;
    const pairing = createProgramsPairing({
      isOn: async () => true,
      rotateSalt: async () => undefined,
      secretFor: async () => null,
      now: () => at,
    });
    let mostInOneRequest = 0;
    const flood = async (from: number, to: number, step: number) => {
      for (let i = from; i < to; i++) {
        at += step;
        const before = pairing.cleaningWork();
        const outcome = await pairing.redeem(
          "ZZZZZ-ZZZZZ",
          `198.18.${i >> 8}.${i & 255}`,
        );
        expect(outcome).toEqual({ ok: false, reason: "wrong_or_expired" });
        mostInOneRequest = Math.max(
          mostInOneRequest,
          pairing.cleaningWork() - before,
        );
      }
    };
    // 20,000 distinct addresses, 1 ms apart: the table fills to its cap and never past it.
    await flood(0, 20_000, 1);
    expect(pairing.trackedAddresses()).toBeLessThanOrEqual(
      PAIRING_MAX_ADDRESSES,
    );
    expect(mostInOneRequest).toBeLessThanOrEqual(PAIRING_CLEAN_BUDGET);
    // A request that finds nothing to clean looks at one entry, not at the table.
    expect(pairing.cleaningWork()).toBeLessThanOrEqual(
      20_000 * PAIRING_CLEAN_BUDGET,
    );
    // The decay is kept: after the window the old entries leave, a few at a request, none left behind.
    at += WRONG_WINDOW_MS + 1;
    await flood(30_000, 30_000 + PAIRING_MAX_ADDRESSES, 0);
    expect(pairing.trackedAddresses()).toBeLessThanOrEqual(
      PAIRING_MAX_ADDRESSES,
    );
    at += WRONG_WINDOW_MS + 1;
    await flood(50_000, 50_000 + PAIRING_MAX_ADDRESSES / 2, 0);
    expect(pairing.trackedAddresses()).toBeLessThanOrEqual(
      PAIRING_MAX_ADDRESSES / 2 + 1,
    );
    expect(mostInOneRequest).toBeLessThanOrEqual(PAIRING_CLEAN_BUDGET);
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

/** Reads a "stored" zip written by `zipStored`: entry name, bytes and the CRC-32 the header declares. */
function readStoredZip(zip: Buffer) {
  const entries: Array<{ name: string; data: Buffer; crc: number }> = [];
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    expect(zip.readUInt16LE(at + 8)).toBe(0); // stored
    const crc = zip.readUInt32LE(at + 14);
    const size = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const extraLength = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    entries.push({ name, data: zip.subarray(start, start + size), crc });
    at = start + size;
  }
  return entries;
}
const HELPER_SOURCE = new URL("../../scripts/programs-helper/", import.meta.url)
  .pathname;

describe("handing the helper to the person at the computer", () => {
  const url = "/api/programs/pairing/helper.zip";

  test("the person at the computer gets a zip with attachment headers and a fixed name", async () => {
    const id = await person();
    const { routes } = build(id);
    const response = await routes.request(url, {}, LOOPBACK_PEER as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${HELPER_ZIP_NAME}"`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("the bytes served are the files of the repository, four fixed names, each with its own CRC-32", async () => {
    const id = await person();
    const { routes } = build(id);
    const zip = Buffer.from(
      await (
        await routes.request(url, {}, LOOPBACK_PEER as never)
      ).arrayBuffer(),
    );
    const entries = readStoredZip(zip);
    expect(entries.map((e) => e.name)).toEqual([...HELPER_FILES]);
    expect(HELPER_FILES.length).toBe(4);
    for (const entry of entries) {
      const real = Buffer.from(
        await Bun.file(`${HELPER_SOURCE}${entry.name}`).arrayBuffer(),
      );
      expect(Buffer.compare(entry.data, real)).toBe(0);
      expect(entry.crc).toBe(crc32(real));
    }
  });

  test("a name or path in the request changes nothing: no traversal is possible", async () => {
    const id = await person();
    const { routes } = build(id);
    const plain = Buffer.from(
      await (
        await routes.request(url, {}, LOOPBACK_PEER as never)
      ).arrayBuffer(),
    );
    for (const odd of [
      `${url}?file=../../../../etc/passwd`,
      `${url}?name=setup.ps1&path=..%2F..`,
    ]) {
      const response = await routes.request(odd, {}, LOOPBACK_PEER as never);
      expect(response.status).toBe(200);
      expect(
        Buffer.compare(Buffer.from(await response.arrayBuffer()), plain),
      ).toBe(0);
    }
    for (const other of [
      "/api/programs/pairing/..%2F..%2Fsetup.ps1",
      "/api/programs/pairing/setup.ps1",
      "/api/programs/pairing/helper.zip/extra",
    ])
      expect(
        (await routes.request(other, {}, LOOPBACK_PEER as never)).status,
      ).toBe(404);
  });

  test("refused to a request not at the computer, to a remote session, and without the installation secret", async () => {
    const id = await person();
    expect((await build(id).routes.request(url)).status).toBe(403);
    const remote = {
      pairings: { standing: async () => null },
    } as unknown as PairingGate;
    expect(
      (await build(id, remote).routes.request(url, {}, LOOPBACK_PEER as never))
        .status,
    ).toBe(403);
    const without = await build(id, undefined, {
      singleUserWithoutSecret: true,
    }).routes.request(url, {}, LOOPBACK_PEER as never);
    expect(without.status).toBe(403);
    expect(without.headers.get("content-type")).not.toBe("application/zip");
  });

  test("is on the remote deny list, like the other pairing routes", () => {
    const entry = decidingEntry("GET", [
      "api",
      "programs",
      "pairing",
      "helper.zip",
    ]);
    expect(entry?.family).toBe("computers");
    expect(entry?.verdict).toBe("refuse");
    expect(remoteMayReach("GET", "/api/programs/pairing/helper.zip")).toBe(
      false,
    );
  });

  test("one audit row per download, with no file content, and none for a refusal", async () => {
    const id = await person();
    const rows: unknown[] = [];
    const auditStore = {
      insert: async (event: unknown) => {
        rows.push(event);
      },
    };
    const { routes } = build(id, undefined, { auditStore });
    await routes.request(url);
    expect(rows.length).toBe(0);
    await routes.request(url, {}, LOOPBACK_PEER as never);
    expect(rows.length).toBe(1);
    const row = rows[0] as {
      actorUserId: string;
      payload: { change: string; bytes: number };
    };
    expect(row.actorUserId).toBe(id);
    expect(row.payload.change).toBe("programs_helper_downloaded");
    expect(typeof row.payload.bytes).toBe("number");
  });

  test("a deployment without the folder answers 404 with a plain sentence", async () => {
    const id = await person();
    const { routes } = build(id, undefined, {
      helperDir: `${HELPER_SOURCE}missing-folder`,
    });
    const response = await routes.request(url, {}, LOOPBACK_PEER as never);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toContain(
      "does not carry the helper's files",
    );
  });

  test("the page links to the download and shows the two lines to run, with the CSP and frame limits kept", async () => {
    const id = await person();
    const { routes } = build(id);
    const page = await routes.request(
      "/api/programs/pairing",
      {},
      LOOPBACK_PEER as never,
    );
    const html = await page.text();
    expect(html).toContain('href="/api/programs/pairing/helper.zip"');
    expect(html).toContain("Unblock-File .\\*.ps1");
    expect(html).toContain(
      "powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\\setup.ps1",
    );
    expect(html).toContain("into that window only");
    expect(html).toContain('(not "as administrator")');
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'none'");
    // The hash in the policy is the hash of the one inline script the page carries.
    // No HTML is pulled apart with a pattern: the page carries exactly one script, and it is the exported one.
    expect(html.toLowerCase().split("<script").length - 1).toBe(1);
    expect(html).toContain(`<script>${PAIRING_SCRIPT}</script>`);
    const hash = new Bun.CryptoHasher("sha256")
      .update(PAIRING_SCRIPT)
      .digest("base64");
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the helper bundle does not follow links or carry oversized files", () => {
  const url = "/api/programs/pairing/helper.zip";
  const roots: string[] = [];
  afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });
  async function copyOfHelper(): Promise<{ root: string; dir: string }> {
    const root = await mkdtemp(join(tmpdir(), "helper-bundle-"));
    roots.push(root);
    const dir = join(root, "programs-helper");
    await mkdir(dir);
    for (const name of HELPER_FILES)
      await copyFile(`${HELPER_SOURCE}${name}`, join(dir, name));
    return { root, dir };
  }
  async function refusedWith(dir: string, secret?: string) {
    const id = await person();
    const rows: Array<{ payload: Record<string, unknown> }> = [];
    const auditStore = {
      insert: async (event: unknown) => {
        rows.push(event as { payload: Record<string, unknown> });
      },
    };
    const { routes } = build(id, undefined, { helperDir: dir, auditStore });
    const response = await routes.request(url, {}, LOOPBACK_PEER as never);
    const text = await response.text();
    expect(response.status).toBe(404);
    expect(text).toContain("does not carry the helper's files");
    if (secret) expect(JSON.stringify(rows) + text).not.toContain(secret);
    expect(rows.length).toBe(1);
    expect(rows[0]?.payload.change).toBe("programs_helper_refused");
    return rows[0]?.payload;
  }

  test("a file replaced by a link to another file is refused and its content is never served", async () => {
    const { dir } = await copyOfHelper();
    const target = join(dir, "..", "outside.txt");
    await writeFile(target, "SECRET-OUTSIDE-CONTENT");
    await rm(join(dir, "FreeDuetProgramsHelper.ps1"));
    await symlink(target, join(dir, "FreeDuetProgramsHelper.ps1"));
    const payload = await refusedWith(dir, "SECRET-OUTSIDE-CONTENT");
    expect(payload).toEqual({
      change: "programs_helper_refused",
      file: "FreeDuetProgramsHelper.ps1",
      reason: "not_a_regular_file",
    });
  });

  test("a folder in place of a file is refused", async () => {
    const { dir } = await copyOfHelper();
    await rm(join(dir, "setup.ps1"));
    await mkdir(join(dir, "setup.ps1"));
    expect((await refusedWith(dir))?.reason).toBe("not_a_regular_file");
  });

  test("a file over the cap is refused, and so is a total over the cap", async () => {
    const { dir } = await copyOfHelper();
    await writeFile(
      join(dir, "README.md"),
      Buffer.alloc(HELPER_FILE_MAX_BYTES + 1, 97),
    );
    expect((await refusedWith(dir))?.reason).toBe("too_big");
    const second = await copyOfHelper();
    for (const name of HELPER_FILES)
      await writeFile(
        join(second.dir, name),
        Buffer.alloc(HELPER_FILE_MAX_BYTES - 1, 97),
      );
    expect((await refusedWith(second.dir))?.reason).toBe("total_too_big");
  });

  test("a folder that is itself a link is refused, even when the real folder is fine", async () => {
    const { root, dir } = await copyOfHelper();
    const link = join(root, "linked-helper");
    await symlink(dir, link);
    expect((await refusedWith(link))?.reason).toBe("folder_is_a_link");
  });

  test("the happy path stays byte-identical to the repository files, with their CRC-32", async () => {
    const { dir } = await copyOfHelper();
    const id = await person();
    const { routes } = build(id, undefined, { helperDir: dir });
    const response = await routes.request(url, {}, LOOPBACK_PEER as never);
    expect(response.status).toBe(200);
    const entries = readStoredZip(Buffer.from(await response.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual([...HELPER_FILES]);
    for (const entry of entries) {
      const real = Buffer.from(
        await Bun.file(`${HELPER_SOURCE}${entry.name}`).arrayBuffer(),
      );
      expect(Buffer.compare(entry.data, real)).toBe(0);
      expect(entry.crc).toBe(crc32(real));
    }
  });
});

describe("the pairing page says where the scripts come from and what Unblock-File does", () => {
  test("two plain sentences next to the two lines", async () => {
    const id = await person();
    const { routes } = build(id);
    const page = await routes.request(
      "/api/programs/pairing",
      {},
      LOOPBACK_PEER as never,
    );
    const html = await page.text();
    expect(html).toContain(
      "These scripts come from this FreeDuet installation",
    );
    expect(html).toContain("read it before you run it");
    expect(html).toContain(
      'removes the "downloaded from the Internet" mark that Windows puts on these files',
    );
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
