/**
 * D185: the run for Iris carries the hand-offs the asking conversation has open, read from the hop queue
 * (the rows behind the D168 work card), against a real PostgreSQL with TWO people. Every assertion that the
 * person sees their own conversation's hand-offs is paired with one that another conversation's, another
 * person's, a finished one and a task's words are not in it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from "@ag-ui/client";
import { sql } from "drizzle-orm";
import { lastValueFrom, of, toArray } from "rxjs";
import { createActivityStore } from "../src/activity/activity";
import { HANDOFF_KIND } from "../src/agents/handoff";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { workItems } from "../src/db/schema/work";
import {
  OPEN_HANDOFFS_PROP,
  OpenHandoffsMiddleware,
  openHandoffsReaderFor,
} from "../src/freeduet/open-handoffs";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `oh-${randomUUID()}`;
const alice = `${prefix}-alice`;
const bob = `${prefix}-bob`;
const threadA = `${prefix}-thread-a`;
const threadB = `${prefix}-thread-b`;
const bobThread = `${prefix}-thread-bob`;

const hop = (
  key: string,
  actorId: string,
  threadId: string,
  toBotId: string,
  task: string,
  more: Record<string, unknown> = {},
  row: Record<string, unknown> = {},
) => ({
  kind: HANDOFF_KIND,
  key: `${prefix}-${key}`,
  payload: {
    fromBotId: "freeduet",
    toBotId,
    toName: toBotId,
    actorId,
    threadId,
    runId: `${prefix}-${key}-run`,
    task,
    ...more,
  },
  ...row,
});

beforeAll(async () => {
  await database.insert(users).values([
    { id: alice, email: `${alice}@example.test` },
    { id: bob, email: `${bob}@example.test` },
  ]);
  const lease = new Date(Date.now() + 10 * 60_000);
  await database.insert(workItems).values([
    hop("a-kai", alice, threadA, "gamedev", "SECRET task words", {}, {
      claimedBy: "w",
      leaseUntil: lease,
    }),
    hop("a-leo", alice, threadA, "creator"),
    hop("a-b", alice, threadB, "marketer", "other thread", {}, {
      claimedBy: "w",
      leaseUntil: lease,
    }),
    hop("a-done", alice, threadA, "researcher", "done one", {}, {
      finishedAt: new Date(),
    }),
    hop("a-answer", alice, threadA, "analyst", "a reply leg", {
      answerIn: threadA,
    }),
    hop("b-kai", bob, bobThread, "gamedev", "bob task", {}, {
      claimedBy: "w",
      leaseUntil: lease,
    }),
    // Bob's hop on a thread id that equals Alice's: still not Alice's.
    hop("b-same-thread", bob, threadA, "designer", "bob same id", {}, {
      claimedBy: "w",
      leaseUntil: lease,
    }),
  ] as never);
});

afterAll(async () => {
  await database.execute(
    sql`delete from work_items where key like ${`${prefix}-%`}`,
  );
  await database.execute(sql`delete from users where id like ${`${prefix}-%`}`);
});

const activity = createActivityStore(database);
const sources = {
  hops: activity.workStatusRows,
  attention: activity.attention,
};

describe("openHandoffsReaderFor (real Postgres)", () => {
  test("Alice's conversation holds its own two open hand-offs and nothing else", async () => {
    const open = await openHandoffsReaderFor(sources, alice)(threadA);
    expect(open.map((entry) => entry.to).sort()).toEqual([
      "creator",
      "gamedev",
    ]);
    const kai = open.find((entry) => entry.to === "gamedev");
    expect(kai?.state).toBe("working");
    expect(open.find((entry) => entry.to === "creator")?.state).toBe("queued");
    const text = JSON.stringify(open);
    for (const leak of [
      "SECRET",
      "task",
      "marketer",
      "researcher",
      "analyst",
      "designer",
      "bob",
    ])
      expect(text).not.toContain(leak);
    expect(Object.keys(kai ?? {}).sort()).toEqual([
      "lastEventAt",
      "since",
      "state",
      "to",
    ]);
  });

  test("another conversation of the same person has only its own", async () => {
    const open = await openHandoffsReaderFor(sources, alice)(threadB);
    expect(open.map((entry) => entry.to)).toEqual(["marketer"]);
  });

  test("another person never sees Alice's hand-offs, even on the same thread id", async () => {
    const bobs = await openHandoffsReaderFor(sources, bob)(threadA);
    expect(bobs.map((entry) => entry.to)).toEqual(["designer"]);
    const none = await openHandoffsReaderFor(sources, bob)(threadB);
    expect(none).toEqual([]);
  });
});

class Capture extends AbstractAgent {
  readonly requests: RunAgentInput[] = [];
  run(input: RunAgentInput) {
    this.requests.push(input);
    return of<BaseEvent>({
      type: EventType.RUN_FINISHED,
      runId: input.runId,
      threadId: input.threadId,
    });
  }
}
const input = (forwardedProps: unknown = {}): RunAgentInput => ({
  runId: "run",
  threadId: threadA,
  messages: [],
  context: [],
  tools: [],
  state: {},
  forwardedProps,
});
async function sent(
  botId: string,
  load: ConstructorParameters<typeof OpenHandoffsMiddleware>[1],
  request = input(),
) {
  const agent = new Capture({ agentId: botId });
  await lastValueFrom(
    new OpenHandoffsMiddleware(botId, load).run(request, agent).pipe(toArray()),
  );
  return agent.requests[0]?.forwardedProps as Record<string, unknown>;
}

describe("OpenHandoffsMiddleware", () => {
  test("Iris's run carries the open hand-offs of the run's own thread", async () => {
    const asked: string[] = [];
    const props = await sent("freeduet", async (threadId) => {
      asked.push(threadId);
      return openHandoffsReaderFor(sources, alice)(threadId);
    });
    expect(asked).toEqual([threadA]);
    const value = props[OPEN_HANDOFFS_PROP] as {
      version: number;
      handoffs: { to: string }[];
    };
    expect(value.version).toBe(1);
    expect(value.handoffs.map((entry) => entry.to).sort()).toEqual([
      "creator",
      "gamedev",
    ]);
  });

  test("a conversation with none open says an empty list, not absence", async () => {
    const props = await sent("freeduet", async () => []);
    expect((props[OPEN_HANDOFFS_PROP] as { handoffs: unknown[] }).handoffs).toEqual(
      [],
    );
  });

  test("a caller's own value is dropped, for Iris and for every other member", async () => {
    const forged = { version: 1, handoffs: [{ to: "gamedev" }] };
    const other = await sent(
      "creator",
      async () => [
        { to: "x", state: "working", since: "s", lastEventAt: "s" },
      ],
      input({ [OPEN_HANDOFFS_PROP]: forged, keep: 1 }),
    );
    expect(other[OPEN_HANDOFFS_PROP]).toBeUndefined();
    expect(other.keep).toBe(1);
    const iris = await sent(
      "freeduet",
      async () => {
        throw new Error("down");
      },
      input({ [OPEN_HANDOFFS_PROP]: forged }),
    );
    expect(iris[OPEN_HANDOFFS_PROP]).toBeUndefined();
  });

  test("a failed read leaves the key out (unknown) and the run goes on", async () => {
    const props = await sent("freeduet", async () => {
      throw new Error("db down");
    });
    expect(OPEN_HANDOFFS_PROP in props).toBe(false);
  });

  test("a member other than Iris never asks the queue", async () => {
    let asked = 0;
    const props = await sent("gamedev", async () => {
      asked += 1;
      return [];
    });
    expect(asked).toBe(0);
    expect(OPEN_HANDOFFS_PROP in props).toBe(false);
  });
});
