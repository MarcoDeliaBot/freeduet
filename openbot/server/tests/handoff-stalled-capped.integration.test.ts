import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createActivityStore } from "../src/activity/activity";
import { HopCapError } from "../src/agents/handoff-delivery";
import {
  createHandoffRunner,
  type HandoffWork,
  RETRY_NOTE,
} from "../src/agents/handoff-runner";
import type { AuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import { workItems } from "../src/db/schema";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * D172, against a real PostgreSQL: a hop that hit the 25-minute cap stays on the person's "Needs you" like
 * a stalled one and is never picked up again by itself; "Dismiss" and "Try again" are scoped to the person
 * and atomic; a retry leaves the person's request byte for byte and tells the colleague it is another try.
 */
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const queue = createWorkQueue(database);
const activity = createActivityStore(database);
const kind = "bot.message";
const silent: AuditStore = { insert: async () => {} };
const CAP =
  "kai was still working after 25 minutes and was stopped at the limit for one hand-off";

const clear = async () => {
  await database.delete(workItems).where(eq(workItems.kind, kind));
};
afterAll(async () => {
  await clear();
  await database.$client.close();
});
beforeEach(clear);

const REQUEST = { text: "Build me an Arkanoid, 'quoted'  words", by: "person" };

function hop(run: string, actorId = "person-1"): HandoffWork {
  return {
    fromBotId: "iris",
    toBotId: "kai",
    fromName: "Iris",
    toName: "Kai",
    actorId,
    threadId: `thread-${run}`,
    runId: run,
    depth: 1,
    task: "Build an Arkanoid",
    request: REQUEST as never,
  };
}

async function offer(run: string, actorId?: string) {
  const key = `${run}:1`;
  await queue.offer({
    kind,
    key,
    payload: hop(run, actorId) as unknown as Record<string, unknown>,
  });
  return key;
}

function runnerFor(delivered: HandoffWork[], messages: string[], fail?: Error) {
  return createHandoffRunner({
    queue,
    owner: "replica-a",
    sign: () => "signed",
    auditStore: silent,
    delivery: {
      deliver: async ({
        work,
        message,
      }: {
        work: HandoffWork;
        message: string;
      }) => {
        delivered.push(work);
        messages.push(message);
        if (fail) throw fail;
        return { answer: "" };
      },
    } as never,
  });
}

const row = async (key: string) => {
  const [found] = await database
    .select()
    .from(workItems)
    .where(eq(workItems.key, key));
  return found;
};

describe("a hop stopped at the cap (D172)", () => {
  test("stays unfinished at the attempt limit, is listed and counted, and nothing runs it again by itself", async () => {
    const run = randomUUID();
    const key = await offer(run);
    const first: HandoffWork[] = [];
    await runnerFor(first, [], new HopCapError(CAP)).sweep();
    expect(first.map((work) => work.toBotId)).toEqual(["kai"]);

    const stored = await row(key);
    expect(stored?.finishedAt).toBeNull();
    expect(stored?.attempts).toBeGreaterThanOrEqual(5);
    expect(stored?.lastError).toBe(CAP);
    expect(stored?.claimedBy).toBeNull();

    // The person's Bots page: counted and explained, like any stalled hop.
    const mine = (await activity.attention("person-1")).find(
      (bot) => bot.agentId === "iris",
    );
    expect(mine?.handoffs).toBe(1);
    expect(mine?.stalled).toMatchObject([
      {
        id: key,
        toName: "Kai",
        reason: "it ran past the time limit for one hand-off",
      },
    ]);
    // Another person sees nothing.
    expect(
      (await activity.attention("person-2")).flatMap((bot) => bot.stalled),
    ).toEqual([]);

    // Sweeps after it: the colleague is never asked again, however many times the runner looks.
    const later: HandoffWork[] = [];
    for (let i = 0; i < 3; i += 1) await runnerFor(later, []).sweep();
    expect(later.filter((work) => work.toBotId === "kai")).toEqual([]);
    expect((await row(key))?.attempts).toBe(stored?.attempts ?? -1);
  });
});

describe("dismissing a stalled or capped hop (D172)", () => {
  async function capped(run = randomUUID()) {
    const key = await offer(run);
    await runnerFor([], [], new HopCapError(CAP)).sweep();
    return key;
  }

  test("finishes it for the person, atomically; it leaves the list and the badge", async () => {
    const key = await capped();
    const done = await activity.dismissHandoff("person-1", "iris", key);
    expect(done).toEqual({ key, toBotId: "kai" });
    const stored = await row(key);
    expect(stored?.finishedAt).not.toBeNull();
    expect(stored?.lastError).toBe("Stopped by the person");
    expect(
      (await activity.attention("person-1")).flatMap((bot) => bot.stalled),
    ).toEqual([]);
    // A second click matches nothing.
    expect(await activity.dismissHandoff("person-1", "iris", key)).toBeNull();
  });

  test("another person's hop, another Bot's, a hop still with tries left and a running one are all null", async () => {
    const key = await capped();
    expect(await activity.dismissHandoff("person-2", "iris", key)).toBeNull();
    expect(await activity.dismissHandoff("person-1", "other", key)).toBeNull();
    expect((await row(key))?.finishedAt).toBeNull();

    const fresh = await offer(randomUUID());
    expect(await activity.dismissHandoff("person-1", "iris", fresh)).toBeNull();

    // At the limit but with a live lease: it is running now.
    await database
      .update(workItems)
      .set({
        claimedBy: "replica-b",
        leaseUntil: sql`now() + interval '1 minute'`,
      })
      .where(eq(workItems.key, key));
    expect(await activity.dismissHandoff("person-1", "iris", key)).toBeNull();
    expect(await activity.retryHandoff("person-1", "iris", key)).toBeNull();
    expect((await row(key))?.finishedAt).toBeNull();
  });
});

describe("retrying a capped hop (D172)", () => {
  test("the request is byte for byte the same, and only the retried run is told it is another try", async () => {
    const run = randomUUID();
    const key = await offer(run);
    const messages: string[] = [];
    await runnerFor([], messages, new HopCapError(CAP)).sweep();
    expect(messages[0]).not.toContain(RETRY_NOTE);

    const text = async () => {
      const [found] = await database.execute<{ request: string; task: string }>(
        sql`select payload->'request'::text as request, payload->>'task' as task from work_items where key = ${key}`,
      );
      return found;
    };
    const before = await text();
    expect(await activity.retryHandoff("person-2", "iris", key)).toBeNull();
    expect(await activity.retryHandoff("person-1", "iris", key)).toEqual({
      key,
      toBotId: "kai",
    });
    expect(await text()).toEqual(before);
    expect((await row(key))?.payload).toMatchObject({ retries: 1 });

    const seen: string[] = [];
    await runnerFor([], seen).sweep();
    const toKai = seen.filter((message) => message.includes("Task:"));
    expect(toKai).toHaveLength(1);
    expect(toKai[0]).toContain(RETRY_NOTE);
    expect(toKai[0]).toContain("Task: Build an Arkanoid");
  });
});
