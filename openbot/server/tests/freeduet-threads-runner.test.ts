/**
 * FreeDuet's Postgres agent runner (#42) against a real Postgres, driven by a scripted agent that
 * emits AG-UI events the way a real Bot does. What it proves: a conversation survives a restart, a
 * routine and a browser turn share one history without either erasing the other, one run at a time
 * per thread, stop, and a crash that keeps the reply as far as it got.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  AbstractAgent,
  type BaseEvent,
  defaultApplyEvents,
  EventType,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import { sql } from "drizzle-orm";
import { from, Observable, type Subscriber } from "rxjs";
import { createDatabase } from "../src/db/client";
import {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
  ThreadLockDeniedError,
} from "../src/freeduet/threads";
import type { PgAgentRunner } from "../src/freeduet/threads/pg-runner";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const threadIds: string[] = [];
const runners: PgAgentRunner[] = [];

/** A store and a runner over `db`, as one server process would hold them. */
function boot(db = database, options: { lockRenewMs?: number } = {}) {
  const store = createLocalThreadStore(db);
  const runner = createPgAgentRunner({
    database: db,
    store,
    flushEveryMs: 10,
    flushEveryEvents: 2,
    ...options,
  });
  runners.push(runner);
  return { store, runner };
}

/**
 * A second server process on the same database, for the length of `work`: a pool, store and runner
 * of its own. Its runner is stopped and its pool closed afterwards, pass or fail. The suite runs in
 * one process and an open pool holds its connections to the end (see `TEST_POOL`), so a pool left
 * open here takes connections from every file after this one.
 */
async function inAnotherProcess<T>(
  work: (peer: ReturnType<typeof boot>) => Promise<T>,
): Promise<T> {
  const db = createDatabase(testDatabaseUrl(), TEST_POOL);
  const other = boot(db);
  try {
    return await work(other);
  } finally {
    for (const threadId of threadIds) await other.runner.stop({ threadId });
    await db.$client.close();
  }
}

async function newThread(
  store: ReturnType<typeof boot>["store"],
  userId = "ada",
) {
  const threadId = `fd-runner-${randomUUID()}`;
  threadIds.push(threadId);
  await store.getOrCreateThread({ threadId, userId, agentId: "iris" });
  return threadId;
}

beforeAll(async () => {
  await applyFreeDuetThreadMigrations(database);
});

afterAll(async () => {
  for (const runner of runners) {
    for (const threadId of threadIds) await runner.stop({ threadId });
  }
  for (const threadId of threadIds) {
    await database.execute(
      sql`delete from freeduet_thread_locks where thread_id = ${threadId}`,
    );
    await database.execute(
      sql`delete from freeduet_threads where thread_id = ${threadId}`,
    );
  }
  // Every run is stopped above, so no renewal or write is left to reach for the pool once closed.
  await database.$client.close();
});

type Script = (context: {
  input: RunAgentInput;
  emit: (event: BaseEvent) => void;
  subscriber: Subscriber<BaseEvent>;
  agent: ScriptedAgent;
}) => void;

/** A Bot whose run is whatever the script emits. `abortRun` ends a run the script left open. */
class ScriptedAgent extends AbstractAgent {
  aborted = 0;
  private open?: Subscriber<BaseEvent>;

  constructor(private readonly script: Script) {
    super({ agentId: "iris" });
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      this.open = subscriber;
      this.script({
        input,
        emit: (event) => subscriber.next(event),
        subscriber,
        agent: this,
      });
    });
  }

  override abortRun(): void {
    this.aborted += 1;
    this.open?.complete();
  }
}

/** A reply in two chunks, then the run ends. */
function replies(messageId: string, text: string): Script {
  return ({ input, emit, subscriber }) => {
    emit({
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    } as BaseEvent);
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
    } as BaseEvent);
    const half = Math.ceil(text.length / 2);
    for (const delta of [text.slice(0, half), text.slice(half)]) {
      emit({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
      } as BaseEvent);
    }
    emit({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);
    emit({
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    } as BaseEvent);
    subscriber.complete();
  };
}

/** Starts a reply and never finishes it: a Bot still thinking, or a process about to die. */
function startsAndHangs(messageId: string, text: string): Script {
  return ({ input, emit }) => {
    emit({
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    } as BaseEvent);
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
    } as BaseEvent);
    emit({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: text,
    } as BaseEvent);
  };
}

function user(id: string, content: string): Message {
  return { id, role: "user", content };
}

/** One run's request, as the runtime or a headless turn hands it to the runner. */
function request(
  threadId: string,
  messages: Message[],
  script: Script,
  extra: { runId?: string; persistedInputMessages?: Message[] } = {},
) {
  const agent = new ScriptedAgent(script);
  agent.threadId = threadId;
  agent.setMessages(messages);
  const input: RunAgentInput = {
    threadId,
    runId: extra.runId ?? `run-${randomUUID()}`,
    messages,
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
  return {
    threadId,
    agent,
    input,
    ...(extra.persistedInputMessages
      ? { persistedInputMessages: extra.persistedInputMessages }
      : {}),
  };
}

function drain(events$: Observable<BaseEvent>): Promise<BaseEvent[]> {
  return new Promise((resolve, reject) => {
    const seen: BaseEvent[] = [];
    events$.subscribe({
      next: (event) => seen.push(event),
      error: reject,
      complete: () => resolve(seen),
    });
  });
}

/** What a browser shows after reading these events with AG-UI's own reducer, as it is. */
async function browserView(events: BaseEvent[]) {
  const reader = {
    messages: [],
    pendingInterrupts: [],
  } as unknown as AbstractAgent;
  const input: RunAgentInput = {
    threadId: "",
    runId: "",
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
  let messages: Message[] = [];
  await new Promise<void>((resolve, reject) => {
    defaultApplyEvents(input, from(events), reader, []).subscribe({
      next: (mutation) => {
        if (mutation.messages) messages = mutation.messages;
      },
      error: reject,
      complete: () => resolve(),
    });
  });
  return messages.map((message) => ({
    id: message.id,
    content: (message as { content?: unknown }).content,
  }));
}

async function runRow(runId: string) {
  const [row] = [
    ...(await database.execute(
      sql`select status, events from freeduet_thread_runs where run_id = ${runId}`,
    )),
  ];
  return row as { status: string; events: BaseEvent[] } | undefined;
}

async function until(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(10);
  }
  throw new Error(`timed out waiting until ${what}`);
}

describe("a conversation on FreeDuet's own database", () => {
  test("a run is replayed on connect, and read back as messages", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const asked = user("u-1", "What is on today?");
    const streamed = await drain(
      runner.run(request(threadId, [asked], replies("a-1", "Two meetings."))),
    );
    expect(streamed.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);

    const replayed = await drain(runner.connect({ threadId }));
    expect(await browserView(replayed)).toEqual([
      { id: "u-1", content: "What is on today?" },
      { id: "a-1", content: "Two meetings." },
    ]);
    expect(await store.getThreadMessages(threadId)).toEqual([
      { id: "u-1", role: "user", content: "What is on today?" },
      { id: "a-1", role: "assistant", content: "Two meetings." },
    ]);
    expect(await store.activeRunId(threadId)).toBeNull();
  });

  test("a new runner and store over the same database still hold the history", async () => {
    const before = boot();
    const threadId = await newThread(before.store);
    const runId = `run-${randomUUID()}`;
    await drain(
      before.runner.run(
        request(
          threadId,
          [user("u-1", "Remember this.")],
          replies("a-1", "Noted."),
          {
            runId,
          },
        ),
      ),
    );

    await inAnotherProcess(async (restarted) => {
      expect(await restarted.store.getThreadMessages(threadId)).toEqual([
        { id: "u-1", role: "user", content: "Remember this." },
        { id: "a-1", role: "assistant", content: "Noted." },
      ]);
      expect(
        await browserView(await drain(restarted.runner.connect({ threadId }))),
      ).toEqual([
        { id: "u-1", content: "Remember this." },
        { id: "a-1", content: "Noted." },
      ]);
    });
    expect((await runRow(runId))?.status).toBe("finished");
  });

  test("a routine's turn and then a browser turn: nothing is lost", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    // The person chats, and leaves the tab open.
    const first = user("u-1", "Hi");
    await drain(
      runner.run(request(threadId, [first], replies("a-1", "Hello."))),
    );
    const tab: Message[] = [
      first,
      { id: "a-1", role: "assistant", content: "Hello." },
    ];

    // A routine writes into the thread, as run-turn.ts does: the whole history to the model, only
    // its own message to keep.
    const history = (await store.getThreadMessages(threadId)).map(
      (row) =>
        ({ id: row.id, role: row.role, content: row.content }) as Message,
    );
    const firing = user("r-1", "Morning brief");
    await drain(
      runner.run(
        request(
          threadId,
          [...history, firing],
          replies("ra-1", "Three things."),
          {
            persistedInputMessages: [firing],
          },
        ),
      ),
    );

    // The tab never saw the routine. Its next message carries only what the tab holds, and this
    // Bot ends its run with a snapshot of the conversation as IT was given it.
    const next = user("u-2", "Thanks");
    const browserTurn: Script = ({ input, emit, subscriber }) => {
      emit({
        type: EventType.RUN_STARTED,
        threadId,
        runId: input.runId,
      } as BaseEvent);
      emit({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "a-2",
        role: "assistant",
      } as BaseEvent);
      emit({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "a-2",
        delta: "Any time.",
      } as BaseEvent);
      emit({ type: EventType.TEXT_MESSAGE_END, messageId: "a-2" } as BaseEvent);
      emit({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          ...input.messages,
          { id: "a-2", role: "assistant", content: "Any time." },
        ],
      } as BaseEvent);
      emit({
        type: EventType.RUN_FINISHED,
        threadId,
        runId: input.runId,
      } as BaseEvent);
      subscriber.complete();
    };
    await drain(runner.run(request(threadId, [...tab, next], browserTurn)));

    const expected = ["u-1", "a-1", "r-1", "ra-1", "u-2", "a-2"];
    expect(
      (await store.getThreadMessages(threadId)).map((row) => row.id),
    ).toEqual(expected);
    // And a browser opening the thread now, with AG-UI's own reducer, sees all of it too.
    const replayed = await browserView(
      await drain(runner.connect({ threadId })),
    );
    expect(replayed.map((message) => message.id)).toEqual(expected);
    // Each message is recorded once, by the run that brought it.
    const rows = [
      ...(await database.execute(sql`
        select input from freeduet_thread_runs where thread_id = ${threadId} order by id
      `)),
    ].map((row) =>
      (row.input as RunAgentInput).messages.map((message) => message.id),
    );
    expect(rows).toEqual([["u-1"], ["r-1"], ["u-2"]]);
  });

  test("tool calls come back in Intelligence's row shape", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const callsATool: Script = ({ input, emit, subscriber }) => {
      emit({
        type: EventType.RUN_STARTED,
        threadId,
        runId: input.runId,
      } as BaseEvent);
      emit({
        type: EventType.TOOL_CALL_START,
        toolCallId: "call-1",
        toolCallName: "lookup_calendar",
        parentMessageId: "a-1",
      } as BaseEvent);
      emit({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "call-1",
        delta: '{"day":',
      } as BaseEvent);
      emit({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "call-1",
        delta: '"today"}',
      } as BaseEvent);
      emit({
        type: EventType.TOOL_CALL_END,
        toolCallId: "call-1",
      } as BaseEvent);
      emit({
        type: EventType.TOOL_CALL_RESULT,
        messageId: "t-1",
        toolCallId: "call-1",
        role: "tool",
        content: "2 meetings",
      } as BaseEvent);
      emit({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "a-2",
        role: "assistant",
      } as BaseEvent);
      emit({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "a-2",
        delta: "You have two.",
      } as BaseEvent);
      emit({ type: EventType.TEXT_MESSAGE_END, messageId: "a-2" } as BaseEvent);
      emit({
        type: EventType.RUN_FINISHED,
        threadId,
        runId: input.runId,
      } as BaseEvent);
      subscriber.complete();
    };
    await drain(
      runner.run(request(threadId, [user("u-1", "Today?")], callsATool)),
    );

    expect(await store.getThreadMessages(threadId)).toEqual([
      { id: "u-1", role: "user", content: "Today?" },
      {
        id: "a-1",
        role: "assistant",
        toolCalls: [
          { id: "call-1", name: "lookup_calendar", args: '{"day":"today"}' },
        ],
      },
      { id: "t-1", role: "tool", content: "2 meetings", toolCallId: "call-1" },
      { id: "a-2", role: "assistant", content: "You have two." },
    ]);
  });
});

describe("one run at a time", () => {
  test("a second run on a busy thread is refused, from this process and from another", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const busy = request(
      threadId,
      [user("u-1", "Long task")],
      startsAndHangs("a-1", "Working"),
    );
    const first = drain(runner.run(busy));
    await until(
      async () => (await store.activeRunId(threadId)) !== null,
      "the run holds the lock",
    );
    expect(await store.activeRunId(threadId)).toBe(busy.input.runId);
    expect(await runner.isRunning({ threadId })).toBe(true);

    // The same process: refused on the spot, as every upstream runner throws "Thread already running".
    expect(() =>
      runner.run(
        request(threadId, [user("u-2", "Also")], replies("a-2", "No.")),
      ),
    ).toThrow(ThreadLockDeniedError);

    // Another process: refused through the stream, with the same error.
    await inAnotherProcess(async (other) => {
      const refused = drain(
        other.runner.run(
          request(threadId, [user("u-3", "Me too")], replies("a-3", "No.")),
        ),
      );
      await expect(refused).rejects.toBeInstanceOf(ThreadLockDeniedError);
      await expect(refused).rejects.toMatchObject({
        status: 409,
        message: "Thread lock denied",
      });
    });

    expect(await runner.stop({ threadId, runId: busy.input.runId })).toBe(true);
    await first;
    expect(await store.activeRunId(threadId)).toBeNull();
    expect(await runner.isRunning({ threadId })).toBe(false);
    // Nothing the refused runs were given reached the history.
    expect(
      (await store.getThreadMessages(threadId)).map((row) => row.id),
    ).toEqual(["u-1", "a-1"]);
  });

  test("stop ends the run as stopped, keeps what it said, and frees the thread", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const asked = request(
      threadId,
      [user("u-1", "Write an essay")],
      startsAndHangs("a-1", "Once upon"),
    );
    const streamed = drain(runner.run(asked));
    await until(
      async () => (await store.getThreadMessages(threadId)).length === 2,
      "the reply has started",
    );
    // The running turn's text so far, while it runs.
    expect(await store.getThreadMessages(threadId)).toEqual([
      { id: "u-1", role: "user", content: "Write an essay" },
      { id: "a-1", role: "assistant", content: "Once upon" },
    ]);

    expect(await runner.stop({ threadId, runId: "some-other-run" })).toBe(
      false,
    );
    expect(await runner.stop({ threadId, runId: asked.input.runId })).toBe(
      true,
    );
    const events = await streamed;
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(asked.agent.aborted).toBe(1);
    expect((await runRow(asked.input.runId))?.status).toBe("stopped");
    expect(await store.activeRunId(threadId)).toBeNull();
    expect(await runner.stop({ threadId })).toBe(false);

    // The thread takes the next run at once.
    await drain(
      runner.run(
        request(
          threadId,
          [user("u-2", "Go on")],
          replies("a-2", "...there was."),
        ),
      ),
    );
    expect(
      (await store.getThreadMessages(threadId)).map((row) => row.id),
    ).toEqual(["u-1", "a-1", "u-2", "a-2"]);
  });

  test("a lock a headless turn took for this run is re-entered, and left for it to release", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const runId = `run-${randomUUID()}`;
    expect(
      await store.acquireLock({
        threadId,
        runId,
        userId: "ada",
        agentId: "iris",
        ttlSeconds: 60,
      }),
    ).toBe(true);
    await drain(
      runner.run(
        request(threadId, [user("u-1", "Brief")], replies("a-1", "Done."), {
          runId,
        }),
      ),
    );
    // Still the caller's: its heartbeat would report a lost lock if the runner had dropped it.
    expect(await store.activeRunId(threadId)).toBe(runId);
    await store.releaseLock({ threadId, runId });
    expect(await store.activeRunId(threadId)).toBeNull();
    expect((await runRow(runId))?.status).toBe("finished");
  });

  test("a thread nobody created is not run", async () => {
    const { runner } = boot();
    const threadId = `fd-runner-absent-${randomUUID()}`;
    await expect(
      drain(
        runner.run(
          request(threadId, [user("u-1", "Hi")], replies("a-1", "Hi.")),
        ),
      ),
    ).rejects.toMatchObject({ name: "UnknownThreadError", status: 404 });
  });
});

describe("a process that dies mid-run", () => {
  test("the partial reply is kept, the run is marked interrupted, and the thread is free again", async () => {
    const crashed = boot();
    const threadId = await newThread(crashed.store);
    const doomed = request(
      threadId,
      [user("u-1", "Summarise the quarter")],
      startsAndHangs("a-1", "Revenue grew"),
    );
    // Not awaited: this process is about to "die" with the run in flight.
    drain(crashed.runner.run(doomed)).catch(() => undefined);
    await until(async () => {
      const row = await runRow(doomed.input.runId);
      return JSON.stringify(row?.events ?? []).includes("Revenue grew");
    }, "the partial reply is written");

    try {
      // A new process on the same database. Its boot sweep finds the run nobody is running.
      await inAnotherProcess(async (restarted) => {
        expect(
          await restarted.runner.sweepInterruptedRuns(),
        ).toBeGreaterThanOrEqual(1);
        expect((await runRow(doomed.input.runId))?.status).toBe("interrupted");
        expect(await restarted.store.activeRunId(threadId)).toBeNull();
        expect(await restarted.store.getThreadMessages(threadId)).toEqual([
          { id: "u-1", role: "user", content: "Summarise the quarter" },
          { id: "a-1", role: "assistant", content: "Revenue grew" },
        ]);
        // A second sweep finds nothing left to do.
        expect(await restarted.runner.sweepInterruptedRuns()).toBe(0);

        // The replay ends the cut-off run, so the next one can follow it.
        const replayed = await drain(restarted.runner.connect({ threadId }));
        expect(replayed.map((event) => event.type)).toContain(
          EventType.RUN_ERROR,
        );
        await drain(
          restarted.runner.run(
            request(
              threadId,
              [user("u-2", "Again please")],
              replies("a-2", "Revenue grew 4%."),
            ),
          ),
        );
        expect(
          (
            await browserView(
              await drain(restarted.runner.connect({ threadId })),
            )
          ).map((message) => message.id),
        ).toEqual(["u-1", "a-1", "u-2", "a-2"]);
      });
    } finally {
      // Stopped here rather than left to `afterAll`, so its renewal timer never outlives the test.
      await crashed.runner.stop({ threadId });
    }
    // The dead process's run, if it ever woke up, could not write over what is now history.
    expect((await runRow(doomed.input.runId))?.status).toBe("interrupted");
  });
});

describe("a lock that lapses", () => {
  test("a new run takes over a dead run's expired lock and closes that run as interrupted", async () => {
    const crashed = boot();
    const threadId = await newThread(crashed.store);
    const doomed = request(
      threadId,
      [user("u-1", "Draft the letter")],
      startsAndHangs("a-1", "Dear Sir"),
    );
    drain(crashed.runner.run(doomed)).catch(() => undefined);
    await until(async () => {
      const row = await runRow(doomed.input.runId);
      return JSON.stringify(row?.events ?? []).includes("Dear Sir");
    }, "the partial reply is written");
    // The dead process never renewed it, and its lifetime ran out.
    await database.execute(
      sql`update freeduet_thread_locks set expires_at = now() - interval '1 second' where thread_id = ${threadId}`,
    );

    try {
      await inAnotherProcess(async (next) => {
        const followUp = request(
          threadId,
          [user("u-2", "Start over")],
          replies("a-2", "Dear Madam,"),
        );
        await drain(next.runner.run(followUp));
        expect((await runRow(doomed.input.runId))?.status).toBe("interrupted");
        expect((await runRow(followUp.input.runId))?.status).toBe("finished");
        expect(
          (await next.store.getThreadMessages(threadId)).map(
            (row) => row.content,
          ),
        ).toEqual([
          "Draft the letter",
          "Dear Sir",
          "Start over",
          "Dear Madam,",
        ]);
      });
    } finally {
      await crashed.runner.stop({ threadId });
    }
  });

  test("a run whose lock another run took stops, and leaves that run's lock alone", async () => {
    const { store, runner } = boot(database, { lockRenewMs: 20 });
    const threadId = await newThread(store);
    const losing = request(
      threadId,
      [user("u-1", "Long report")],
      startsAndHangs("a-1", "Section one"),
    );
    const streamed = drain(runner.run(losing));
    await until(
      async () => (await store.activeRunId(threadId)) === losing.input.runId,
      "the run holds the lock",
    );
    await database.execute(
      sql`update freeduet_thread_locks set expires_at = now() - interval '1 second' where thread_id = ${threadId}`,
    );
    expect(
      await store.acquireLock({
        threadId,
        runId: "run-elsewhere",
        userId: "ada",
        agentId: "iris",
        ttlSeconds: 60,
      }),
    ).toBe(true);

    const events = await streamed;
    const last = events.at(-1) as { type: string; message?: string };
    expect(last.type).toBe(EventType.RUN_ERROR);
    expect(last.message).toBe(
      "This reply was stopped: another turn took over the conversation.",
    );
    expect(losing.agent.aborted).toBe(1);
    expect((await runRow(losing.input.runId))?.status).toBe("failed");
    expect(await store.activeRunId(threadId)).toBe("run-elsewhere");
    await store.releaseLock({ threadId, runId: "run-elsewhere" });
  });
});
