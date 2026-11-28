/**
 * D168: `GET /api/freeduet/work-status` against a real PostgreSQL with TWO people. The hand-off rows come from
 * `ActivityStore.workStatusRows` and the attention counts from `ActivityStore.attention`, both filtered on the
 * signed-in person's id. Every assertion that a person sees their own work is paired with one that the other
 * person's work, titles and Bots do not appear.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createActivityStore } from "../src/activity/activity";
import { HANDOFF_KIND } from "../src/agents/handoff";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { workItems } from "../src/db/schema/work";
import { createWorkNotes } from "../src/freeduet/work-status";
import { createWorkStatusRoutes } from "../src/freeduet/work-status-routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `wsp-${randomUUID()}`;
const alice = `${prefix}-alice`;
const bob = `${prefix}-bob`;
const aliceBot = `${prefix}-helper-alice`;
const bobBot = `${prefix}-helper-bob`;

beforeAll(async () => {
  await database.insert(users).values([
    { id: alice, email: `${alice}@example.test` },
    { id: bob, email: `${bob}@example.test` },
  ]);
  await database.insert(workItems).values([
    {
      kind: HANDOFF_KIND,
      key: `${prefix}-hop-alice`,
      claimedBy: "worker-a",
      leaseUntil: new Date(Date.now() + 10 * 60_000),
      payload: {
        fromBotId: `${prefix}-lead-alice`,
        toBotId: aliceBot,
        toName: "Alice Helper",
        actorId: alice,
        threadId: `${prefix}-thread-alice`,
        task: "Alice private invoice review",
      },
    },
    {
      kind: HANDOFF_KIND,
      key: `${prefix}-hop-alice-answered`,
      payload: {
        fromBotId: `${prefix}-lead-alice`,
        toBotId: aliceBot,
        toName: "Alice Helper",
        actorId: alice,
        threadId: `${prefix}-thread-alice`,
        task: "Alice answered contract check",
        answerIn: `${prefix}-thread-alice`,
      },
    },
    {
      kind: HANDOFF_KIND,
      key: `${prefix}-hop-bob`,
      claimedBy: "worker-b",
      leaseUntil: new Date(Date.now() + 10 * 60_000),
      payload: {
        fromBotId: `${prefix}-lead-bob`,
        toBotId: bobBot,
        toName: "Bob Helper",
        actorId: bob,
        threadId: `${prefix}-thread-bob`,
        task: "Bob private payroll sheet",
      },
    },
    {
      kind: "person.question",
      key: `${prefix}-question-alice`,
      payload: {
        actorId: alice,
        botId: aliceBot,
        threadId: `${prefix}-thread-alice`,
        runId: "r-alice",
        question: "Alice only question",
        mode: "completed_question",
      },
    },
    {
      kind: "person.question",
      key: `${prefix}-question-bob`,
      payload: {
        actorId: bob,
        botId: bobBot,
        threadId: `${prefix}-thread-bob`,
        runId: "r-bob",
        question: "Bob only question",
        mode: "completed_question",
      },
    },
  ]);
});

afterAll(async () => {
  await database
    .delete(workItems)
    .where(sql`${workItems.key} like ${`%${prefix}%`}`);
  await database.delete(users).where(sql`${users.id} like ${`%${prefix}%`}`);
});

function appFor(actorId: string) {
  const activity = createActivityStore(database);
  const root = new Hono();
  root.route(
    "/api/freeduet/work-status",
    createWorkStatusRoutes(
      async (context, next) => {
        context.set("actor", { id: actorId } as never);
        return next();
      },
      {
        hops: activity.workStatusRows,
        attention: activity.attention,
      },
      createWorkNotes(() => Date.now()),
      () => Date.now(),
    ),
  );
  return root;
}

async function statusFor(actorId: string) {
  const response = await appFor(actorId).request("/api/freeduet/work-status");
  expect(response.status).toBe(200);
  const text = await response.text();
  return {
    text,
    body: (
      JSON.parse(text) as {
        "work-status": {
          handoffs: Array<{ id: string; title: string; toBotId: string }>;
          members: Array<{
            agentId: string;
            state: string;
            title: string | null;
          }>;
        };
      }
    )["work-status"],
  };
}

describe("GET /api/freeduet/work-status with two people", () => {
  test("Alice sees only her own hand-off and her own attention, and never Bob's titles or Bots", async () => {
    const { text, body } = await statusFor(alice);
    expect(body.handoffs.map((row) => row.id)).toEqual([`${prefix}-hop-alice`]);
    expect(body.handoffs[0]?.title).toBe("Alice private invoice review");
    expect(body.handoffs[0]?.toBotId).toBe(aliceBot);

    // Her own question makes her Bot wait on her; Bob's Bot is not in her answer.
    const alicesBot = body.members.find(
      (member) => member.agentId === aliceBot,
    );
    expect(alicesBot?.state).toBe("waiting");
    expect(body.members.some((member) => member.agentId === bobBot)).toBe(
      false,
    );

    expect(text).not.toContain("Bob private payroll sheet");
    expect(text).not.toContain(`${prefix}-hop-bob`);
    expect(text).not.toContain(bobBot);
    expect(text).not.toContain("Bob only question");
  });

  test("Bob sees only his own hand-off and his own attention, and never Alice's titles or Bots", async () => {
    const { text, body } = await statusFor(bob);
    expect(body.handoffs.map((row) => row.id)).toEqual([`${prefix}-hop-bob`]);
    expect(body.handoffs[0]?.title).toBe("Bob private payroll sheet");

    const bobsBot = body.members.find((member) => member.agentId === bobBot);
    expect(bobsBot?.state).toBe("waiting");
    expect(body.members.some((member) => member.agentId === aliceBot)).toBe(
      false,
    );

    expect(text).not.toContain("Alice private invoice review");
    expect(text).not.toContain(`${prefix}-hop-alice`);
    expect(text).not.toContain(aliceBot);
    expect(text).not.toContain("Alice only question");
  });

  test("a hand-off with answerIn set is not listed for its owner", async () => {
    const { text, body } = await statusFor(alice);
    expect(
      body.handoffs.some((row) => row.id === `${prefix}-hop-alice-answered`),
    ).toBe(false);
    expect(text).not.toContain("Alice answered contract check");
  });

  test("a person with no hand-offs gets an empty answer, not someone else's", async () => {
    const stranger = `${prefix}-nobody`;
    const { text, body } = await statusFor(stranger);
    expect(body.handoffs).toEqual([]);
    expect(body.members).toEqual([]);
    expect(text).not.toContain(`${prefix}-hop-alice`);
    expect(text).not.toContain(`${prefix}-hop-bob`);
  });
});
