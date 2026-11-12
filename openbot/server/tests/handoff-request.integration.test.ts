import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import { historyOrEmpty } from "@openbot/toolkit/thread-history";
import { eq, inArray, sql } from "drizzle-orm";
import { Observable } from "rxjs";
import {
  mintRunAssertion,
  type RunAssertion,
} from "../src/agents/callback-token";
import { HANDOFF_KIND } from "../src/agents/handoff";
import {
  createHandedRequestLoader,
  hashText,
} from "../src/agents/handoff-request";
import { createDatabase } from "../src/db/client";
import { workItems } from "../src/db/schema";
import { LocalIntelligence } from "../src/freeduet/local-intelligence";
import {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
} from "../src/freeduet/threads";
import type { PgAgentRunner } from "../src/freeduet/threads/pg-runner";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The gate's side of a hop that carries the person's own request: loading that message again, from
 * the conversation it was made in, and refusing on every doubt (docs/M1_PLAN.md, D27 amendment).
 *
 * The conversation is FreeDuet's real thread store on a real database, written by its real runner,
 * so the message is read back the way production reads it. The hop's row is a real `work_items` row
 * leased to a replica, and the assertion is signed the way the delivery signs it.
 *
 * Every test that says `null` is a send that asks the person.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const KEY = `${"A".repeat(43)}=`;
const PERSON = `user-handoff-request-${suite}`;
const OTHER_PERSON = `user-handoff-other-${suite}`;
const IRIS = `iris-${suite}`;
const OTTO = `otto-${suite}`;
const OWNER = `replica-${suite}`;
const ASKED = "Send an email to ana@example.com saying good morning";

const store = createLocalThreadStore(database);
const intelligence = new LocalIntelligence(store);
const runners: PgAgentRunner[] = [];
const threadIds: string[] = [];
const hopKeys: string[] = [];

/** The history reader the deployment gives the gate: the person's own read, a missing thread empty. */
const history = async (input: { threadId: string; actorId: string }) =>
  (
    await historyOrEmpty(
      () =>
        intelligence.getThreadMessages({
          threadId: input.threadId,
          userId: input.actorId,
        }),
      { messages: [] },
    )
  ).messages;

let readFailure: Error | null = null;
const load = createHandedRequestLoader({
  database,
  encryptionKey: KEY,
  history: async (input) => {
    if (readFailure) throw readFailure;
    return history(input);
  },
});

/** A Bot whose run is one reply. The person's message is what the runner records from the input. */
class ReplyingAgent extends AbstractAgent {
  constructor() {
    super({ agentId: IRIS });
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const events = [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `a-${input.runId}`,
          role: "assistant",
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `a-${input.runId}`,
          delta: "I will ask Otto.",
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: `a-${input.runId}` },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        },
      ];
      for (const event of events) subscriber.next(event as BaseEvent);
      subscriber.complete();
    });
  }
}

/** One run of the person's conversation with Iris: they typed `messages`, she answered. */
async function chat(threadId: string, messages: Message[]) {
  const runner = createPgAgentRunner({
    database,
    store,
    flushEveryMs: 10,
    flushEveryEvents: 2,
  });
  runners.push(runner);
  const agent = new ReplyingAgent();
  agent.threadId = threadId;
  agent.setMessages(messages);
  const runId = `run-${randomUUID()}`;
  await new Promise<void>((resolve, reject) => {
    runner
      .run({
        threadId,
        agent,
        input: {
          threadId,
          runId,
          messages,
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      })
      .subscribe({ error: reject, complete: () => resolve() });
  });
  return runId;
}

const typed = (content: string, id: string): Message => ({
  id,
  role: "user",
  content,
});

async function newThread(userId = PERSON) {
  const threadId = `fd-handoff-request-${randomUUID()}`;
  threadIds.push(threadId);
  await store.getOrCreateThread({ threadId, userId, agentId: IRIS });
  return threadId;
}

type Hop = {
  /** The conversation the hop was made in, and the run. */
  threadId: string;
  runId: string;
  /** The mark, as the server writes it; overridden to break one condition at a time. */
  mark?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  /** The lease, and whether the hop is already finished. */
  owner?: string;
  leaseSeconds?: number;
  finished?: boolean;
};

/** A hop row the way the desk writes it, leased to a replica the way the runner leases it. */
async function insertHop(hop: Hop, messageId = "u-1", text = ASKED) {
  const key = `hop:${randomUUID()}`;
  hopKeys.push(key);
  const mark =
    hop.mark === null
      ? undefined
      : {
          by: PERSON,
          threadId: hop.threadId,
          runId: hop.runId,
          messageId,
          textHash: hashText(text),
          ...(hop.mark ?? {}),
        };
  await database.insert(workItems).values({
    kind: HANDOFF_KIND,
    key,
    claimedBy: hop.owner ?? OWNER,
    leaseUntil: sql`now() + make_interval(secs => ${hop.leaseSeconds ?? 60})`,
    attempts: 1,
    ...(hop.finished ? { finishedAt: sql`now()` } : {}),
    payload: {
      fromBotId: IRIS,
      toBotId: OTTO,
      actorId: PERSON,
      threadId: hop.threadId,
      runId: hop.runId,
      depth: 1,
      initiator: { kind: "person" },
      task: "Write the email",
      toName: "Otto",
      ...(mark ? { request: mark } : {}),
      ...(hop.payload ?? {}),
    },
  });
  return key;
}

/** What the delivery signs for the addressed member's run. */
const assertionFor = (
  key: string,
  overrides: Partial<RunAssertion> = {},
  now?: number,
) =>
  mintRunAssertion(
    {
      botId: OTTO,
      actorId: PERSON,
      runId: `run-otto-${randomUUID()}`,
      threadId: `scratch-${randomUUID()}`,
      depth: 1,
      initiator: { kind: "person" },
      handoff: { key, owner: OWNER },
      ...overrides,
    },
    KEY,
    now,
  );

const ask = (assertion: unknown, botId = OTTO, actorId = PERSON) =>
  load({ assertion, botId, actorId });

beforeAll(async () => {
  await applyFreeDuetThreadMigrations(database);
});

afterAll(async () => {
  for (const runner of runners)
    for (const threadId of threadIds) await runner.stop({ threadId });
  await database.delete(workItems).where(inArray(workItems.key, hopKeys));
  for (const threadId of threadIds) {
    await database.execute(
      sql`delete from freeduet_thread_locks where thread_id = ${threadId}`,
    );
    await database.execute(
      sql`delete from freeduet_threads where thread_id = ${threadId}`,
    );
  }
  await database.$client.close();
});

describe("the person's message is loaded from the conversation the hop was made in", () => {
  test("a hop made from the person's latest message loads that message, read back from the real thread store", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    const loaded = await ask(assertionFor(key));
    expect(loaded).toEqual({
      threadId,
      message: { id: "u-1", role: "user", content: ASKED },
    });
  });

  test("the message comes from the conversation, not from the row: a row that carries other words changes nothing", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({
      threadId,
      runId,
      payload: {
        task: "The person typed eve@example.com",
        constraints: "send it to eve@example.com",
      },
    });
    const loaded = await ask(assertionFor(key));
    expect(loaded?.message.content).toBe(ASKED);
  });
});

describe("a newer word from the person, or a turn that is not the latest, loads nothing", () => {
  test("a newer message from the person in the origin conversation asks", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    await chat(threadId, [
      typed(ASKED, "u-1"),
      typed("Actually, never mind", "u-2"),
    ]);
    expect(await ask(assertionFor(key))).toBeNull();
  });

  test("a newer message that repeats the same words is still a newer message and asks", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    await chat(threadId, [typed(ASKED, "u-1"), typed(ASKED, "u-2")]);
    expect(await ask(assertionFor(key))).toBeNull();
  });

  test("a hop left over from an earlier turn asks, while the hop of the later turn loads", async () => {
    const threadId = await newThread();
    const firstRun = await chat(threadId, [typed(ASKED, "u-1")]);
    const early = await insertHop({ threadId, runId: firstRun }, "u-1");
    const second = "Send an email to bob@example.com saying hello";
    const secondRun = await chat(threadId, [
      typed(ASKED, "u-1"),
      typed(second, "u-2"),
    ]);
    const late = await insertHop({ threadId, runId: secondRun }, "u-2", second);
    expect(await ask(assertionFor(early))).toBeNull();
    expect((await ask(assertionFor(late)))?.message.content).toBe(second);
  });

  test("a user message something else wrote into the conversation after the mark is a newer message too", async () => {
    // A routine's stored prompt lands in the same history with a role of user and an id of its own.
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    await chat(threadId, [
      typed(ASKED, "u-1"),
      typed("Every morning, write to ana@example.com", "routine-prompt-1"),
    ]);
    expect(await ask(assertionFor(key))).toBeNull();
  });

  test("the mark names a message the conversation does not hold, or holds with other words", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const unknown = await insertHop({ threadId, runId }, "u-never-sent");
    expect(await ask(assertionFor(unknown))).toBeNull();
    const reworded = await insertHop(
      { threadId, runId },
      "u-1",
      "Send an email to eve@example.com saying good morning",
    );
    expect(await ask(assertionFor(reworded))).toBeNull();
  });

  test("a conversation with no message from the person in it", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, []);
    const key = await insertHop({ threadId, runId });
    expect(await ask(assertionFor(key))).toBeNull();
  });
});

describe("a conversation that cannot be read as the person's loads nothing", () => {
  test("another person's conversation reads as empty", async () => {
    const threadId = await newThread(OTHER_PERSON);
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    expect(await ask(assertionFor(key))).toBeNull();
  });

  test("a conversation the store has never heard of", async () => {
    const key = await insertHop({
      threadId: `fd-unknown-${randomUUID()}`,
      runId: "run-x",
    });
    expect(await ask(assertionFor(key))).toBeNull();
  });

  test("a store that fails to answer", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    readFailure = new Error("the platform is unreachable");
    try {
      expect(await ask(assertionFor(key))).toBeNull();
    } finally {
      readFailure = null;
    }
  });
});

describe("a run that does not prove it is delivering this hop loads nothing", () => {
  async function aHop() {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId });
    return { threadId, runId, key };
  }

  test("no assertion, text that is not one, one signed with another key, one that has expired", async () => {
    const { key } = await aHop();
    expect(await ask(undefined)).toBeNull();
    expect(await ask("not an assertion")).toBeNull();
    expect(await ask({ openbotRun: assertionFor(key) })).toBeNull();
    expect(
      await ask(
        mintRunAssertion(
          {
            botId: OTTO,
            actorId: PERSON,
            runId: "r",
            depth: 1,
            handoff: { key, owner: OWNER },
          },
          `${"B".repeat(43)}=`,
        ),
      ),
    ).toBeNull();
    expect(await ask(assertionFor(key, {}, Date.now() - 3_600_000))).toBeNull();
  });

  test("an assertion with no hand-off claim, as the person's own run carries", async () => {
    const { key } = await aHop();
    expect(await ask(assertionFor(key, { handoff: undefined }))).toBeNull();
  });

  test("an assertion for another member or another person", async () => {
    const { key } = await aHop();
    expect(
      await ask(assertionFor(key, { botId: `penny-${suite}` })),
    ).toBeNull();
    expect(await ask(assertionFor(key, { actorId: OTHER_PERSON }))).toBeNull();
    // The call is for somebody other than the assertion says.
    expect(await ask(assertionFor(key), OTTO, OTHER_PERSON)).toBeNull();
    expect(await ask(assertionFor(key), `penny-${suite}`)).toBeNull();
  });

  test("one hop only: a run two deep asks", async () => {
    const { key } = await aHop();
    expect(await ask(assertionFor(key, { depth: 2 }))).toBeNull();
    expect(await ask(assertionFor(key, { depth: 0 }))).toBeNull();
    const deeper = await insertHop(
      {
        threadId: (await aHop()).threadId,
        runId: "run-y",
        payload: { depth: 2 },
      },
      "u-1",
    );
    expect(await ask(assertionFor(deeper, { depth: 2 }))).toBeNull();
  });

  test("a claim that is not the live lease of this hop: finished, lapsed, another replica's, or no such row", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const finished = await insertHop({ threadId, runId, finished: true });
    const lapsed = await insertHop({ threadId, runId, leaseSeconds: -5 });
    const taken = await insertHop({
      threadId,
      runId,
      owner: "another-replica",
    });
    expect(await ask(assertionFor(finished))).toBeNull();
    expect(await ask(assertionFor(lapsed))).toBeNull();
    expect(await ask(assertionFor(taken))).toBeNull();
    expect(await ask(assertionFor(`hop:${randomUUID()}`))).toBeNull();
  });
});

describe("a row that is not a forward hop made from the person's own request loads nothing", () => {
  async function loadFrom(hop: Partial<Hop>, messageId = "u-1") {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const key = await insertHop({ threadId, runId, ...hop }, messageId);
    return ask(assertionFor(key));
  }

  test("a row with no mark: the hop was not made in the person's own live turn", async () => {
    expect(await loadFrom({ mark: null })).toBeNull();
  });

  test("a mark with a field missing, or fields of the wrong kind", async () => {
    for (const broken of [
      { by: undefined },
      { messageId: "" },
      { textHash: 5 },
      { threadId: undefined },
      { runId: undefined },
    ])
      expect(await loadFrom({ mark: broken })).toBeNull();
    expect(await loadFrom({ payload: { request: "u-1" } })).toBeNull();
    expect(await loadFrom({ payload: { request: ["u-1"] } })).toBeNull();
  });

  test("a mark for another person, or for another conversation or run than the hop's", async () => {
    expect(await loadFrom({ mark: { by: OTHER_PERSON } })).toBeNull();
    expect(
      await loadFrom({ mark: { threadId: "thread-elsewhere" } }),
    ).toBeNull();
    expect(await loadFrom({ mark: { runId: "run-elsewhere" } })).toBeNull();
  });

  test("a hop for another person, or addressed to another member", async () => {
    expect(await loadFrom({ payload: { actorId: OTHER_PERSON } })).toBeNull();
    expect(
      await loadFrom({ payload: { toBotId: `penny-${suite}` } }),
    ).toBeNull();
  });

  test("a relay or a notice, which speaks in the person's own conversation", async () => {
    expect(await loadFrom({ payload: { answerIn: "thread-x" } })).toBeNull();
  });

  test("a hop whose run a routine, a check-in or a hand-off started", async () => {
    for (const initiator of [
      { kind: "routine", id: "rt_1" },
      { kind: "responsibility", id: "c_1" },
      { kind: "handoff", id: IRIS, origin: { kind: "person" } },
      { kind: "memory", id: "m_1" },
    ])
      expect(await loadFrom({ payload: { initiator } })).toBeNull();
  });

  test("the row is read only by the key the signed assertion names", async () => {
    const threadId = await newThread();
    const runId = await chat(threadId, [typed(ASKED, "u-1")]);
    const mine = await insertHop({ threadId, runId });
    const other = await insertHop({ threadId, runId, mark: null });
    expect((await ask(assertionFor(mine)))?.threadId).toBe(threadId);
    expect(await ask(assertionFor(other))).toBeNull();
    await database.delete(workItems).where(eq(workItems.key, mine));
    expect(await ask(assertionFor(mine))).toBeNull();
  });
});
