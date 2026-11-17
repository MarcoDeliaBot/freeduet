/**
 * The table of browser pairings (docs/M1_PLAN.md D49) against a real database: only a hash is kept, a pairing is
 * live only for its own person under the secret in force, and a person who is removed takes their pairings with them.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  createBrowserPairings,
  createPgPairingStore,
} from "../src/auth/browser-pairings";
import { createDatabase } from "../src/db/client";
import { browserPairings, users } from "../src/db/schema";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const maya = `pair_maya_${suite}`;
const noor = `pair_noor_${suite}`;
const SECRET = "p".repeat(40);
const events: { eventType: string; payload: Record<string, unknown> }[] = [];
const audit = {
  insert: async (event: { eventType: string; payload?: unknown }) =>
    void events.push(event as (typeof events)[number]),
};
const clock = { now: Date.now() };
const make = (secret = SECRET) =>
  createBrowserPairings({
    store: createPgPairingStore(database),
    secret,
    port: 3001,
    audit,
    now: () => clock.now,
  });
const requestWith = (setCookie: string) =>
  new Request("http://localhost:3001/api/me", {
    headers: { cookie: setCookie.split(";")[0] as string },
  });

beforeAll(async () => {
  await database.insert(users).values([
    {
      id: maya,
      email: `${maya}@pair.test`,
      name: "Maya",
      emailVerified: false,
    },
    {
      id: noor,
      email: `${noor}@pair.test`,
      name: "Noor",
      emailVerified: false,
    },
  ]);
});
afterAll(async () => {
  await database.delete(users).where(inArray(users.id, [maya, noor]));
  await database.$client.close();
});

describe("browser_pairings", () => {
  test("keeps the hash of the token and never the token", async () => {
    const service = make();
    const made = await service.issue(
      maya,
      "computer",
      "Chrome on this computer",
      "link",
    );
    const token = made.setCookie.split(";")[0]?.split("=")[1] as string;
    const [row] = await database
      .select()
      .from(browserPairings)
      .where(eq(browserPairings.id, made.id));
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(row).toMatchObject({
      userId: maya,
      kind: "computer",
      revokedAt: null,
    });
  });

  test("is live for its own person only, and for a token that was issued", async () => {
    const service = make();
    const made = await service.issue(maya, "device", "Phone", "code");
    const request = requestWith(made.setCookie);
    expect(await service.standing(request, maya)).toMatchObject({
      kind: "device",
      label: "Phone",
    });
    expect(await service.standing(request, noor)).toBeNull();
    expect(
      await service.standing(
        new Request("http://localhost:3001/", {
          headers: { cookie: `freeduet_pair_3001=${"z".repeat(43)}` },
        }),
        maya,
      ),
    ).toBeNull();
  });

  test("ends on revoke, on its end date, and under another secret", async () => {
    const service = make();
    const made = await service.issue(maya, "device", "Tablet", "code");
    const request = requestWith(made.setCookie);
    expect(await service.standing(request, maya)).not.toBeNull();
    // Another secret: the same row is no pairing.
    expect(await make(`${SECRET}-new`).standing(request, maya)).toBeNull();
    // Revoke: the very next question says no.
    expect(await service.revoke(maya, made.id, "test")).toEqual({
      sessionEnded: false,
    });
    expect(await service.standing(request, maya)).toBeNull();
    expect(await service.revoke(maya, made.id, "test")).toBeNull();
    // The end date.
    const long = await service.issue(maya, "device", "Old", "code");
    clock.now += 401 * 86_400_000;
    expect(
      await service.standing(requestWith(long.setCookie), maya),
    ).toBeNull();
    clock.now -= 401 * 86_400_000;
  });

  test("a person revokes only their own; the list shows only live ones, oldest first", async () => {
    const service = make();
    const mine = await service.issue(maya, "computer", "A", "link");
    const theirs = await service.issue(noor, "computer", "B", "link");
    expect(await service.revoke(maya, theirs.id, "test")).toBeNull();
    expect(
      await service.standing(requestWith(theirs.setCookie), noor),
    ).not.toBeNull();
    const listed = await service.list(maya);
    expect(listed.map((each) => each.id)).toContain(mine.id);
    expect(listed.map((each) => each.id)).not.toContain(theirs.id);
    const times = listed.map((each) => each.createdAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(await service.rename(maya, mine.id, "Renamed")).toBe(true);
    expect(await service.rename(maya, theirs.id, "Taken")).toBe(false);
  });

  test("the sweep at start ends the pairings of an earlier secret, once", async () => {
    const old = make("o".repeat(40));
    const made = await old.issue(noor, "computer", "Before", "link");
    events.length = 0;
    const current = make();
    expect(await current.sweepStale()).toBeGreaterThanOrEqual(1);
    const [row] = await database
      .select()
      .from(browserPairings)
      .where(eq(browserPairings.id, made.id));
    expect(row?.revokedAt).not.toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      by: "installation_secret_changed",
    });
    expect(await current.sweepStale()).toBe(0);
  });

  test("a person who is removed takes their pairings with them", async () => {
    const gone = `pair_gone_${suite}`;
    await database.insert(users).values({
      id: gone,
      email: `${gone}@pair.test`,
      name: "Gone",
      emailVerified: false,
    });
    await make().issue(gone, "computer", "Gone's", "link");
    await database.delete(users).where(eq(users.id, gone));
    expect(
      await database
        .select()
        .from(browserPairings)
        .where(eq(browserPairings.userId, gone)),
    ).toEqual([]);
  });
});
