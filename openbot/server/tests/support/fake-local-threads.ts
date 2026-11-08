/**
 * An in-memory stand-in for FreeDuet's thread store and Postgres runner (issue #42), written against
 * `src/freeduet/threads/contract.ts` and raising the store's own error classes, so the wiring's route
 * tests can bend the store (a race, a lost thread) in ways the real one cannot be asked to.
 * freeduet-intelligence-store.test.ts runs the same promises over the real one.
 *
 * It behaves the way the contract says the real one does, in the parts the wiring depends on:
 * - a thread belongs to the person who created it, and creating it for anybody else is refused;
 * - the lock is held by one run at a time, the run that holds it may take it again, an expired lock
 *   is taken over, and releasing a lock the run does not hold changes nothing;
 * - the runner needs the thread's row first, refuses on the spot (`ThreadLockDeniedError`, thrown)
 *   a thread this process already runs, and on its stream a thread another run holds;
 * - whoever takes the lock releases it: a run that finds its own run id holding the lock (a headless
 *   turn took it) re-enters it and leaves it; a run that takes it (a browser turn) frees it at the end;
 * - messages the run produced are recorded next to the ones it was sent, merged by id.
 */
import {
  type AbstractAgent,
  type BaseEvent,
  EventType,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import { Observable, ReplaySubject } from "rxjs";
import type { Database } from "../../src/db/client";
import type {
  LocalThreadStore,
  PgAgentRunner,
  StoredThread,
  StoredThreadMessage,
  ThreadsModule,
} from "../../src/freeduet/threads/contract";
import {
  ThreadLockDeniedError,
  ThreadOwnershipError,
  UnknownThreadError,
} from "../../src/freeduet/threads/index";

type Lock = { runId: string; expiresAt: number };

/** The store's three errors, its own classes (`threads/index.ts`), as the stand-in raises them. */
export const lockDenied = (threadId = "thread", runId = "run") =>
  new ThreadLockDeniedError(threadId, runId);
export const unknownThread = (threadId = "thread") =>
  new UnknownThreadError(threadId);
export const notYourThread = (threadId = "thread") =>
  new ThreadOwnershipError(threadId);

export type FakeThreadStore = LocalThreadStore & {
  readonly threads: Map<string, StoredThread>;
  readonly locks: Map<string, Lock>;
};

export function createFakeThreadStore(now: () => number = Date.now) {
  const threads = new Map<string, StoredThread>();
  const messages = new Map<string, StoredThreadMessage[]>();
  const locks = new Map<string, Lock>();
  const live = (threadId: string) => {
    const lock = locks.get(threadId);
    return lock && lock.expiresAt > now() ? lock : undefined;
  };

  const store: FakeThreadStore & {
    record(threadId: string, rows: StoredThreadMessage[]): void;
  } = {
    threads,
    locks,
    async getOrCreateThread({ threadId, userId, agentId }) {
      const existing = threads.get(threadId);
      if (existing) {
        if (existing.userId !== userId) throw notYourThread(threadId);
        return existing;
      }
      const at = new Date(now());
      const thread = {
        threadId,
        userId,
        agentId,
        name: null,
        createdAt: at,
        updatedAt: at,
      };
      threads.set(threadId, thread);
      return thread;
    },
    async getThread(threadId) {
      return threads.get(threadId) ?? null;
    },
    async listThreads({ userId, agentId }) {
      return {
        threads: [...threads.values()]
          .filter((thread) => thread.userId === userId)
          .filter((thread) => !agentId || thread.agentId === agentId)
          .reverse(),
        nextCursor: null,
      };
    },
    async getThreadMessages(threadId) {
      return [...(messages.get(threadId) ?? [])];
    },
    async acquireLock({ threadId, runId, ttlSeconds }) {
      const held = live(threadId);
      if (held && held.runId !== runId) return false;
      locks.set(threadId, { runId, expiresAt: now() + ttlSeconds * 1000 });
      return true;
    },
    async renewLock({ threadId, runId, ttlSeconds }) {
      const held = live(threadId);
      if (!held || held.runId !== runId) return false;
      held.expiresAt = now() + ttlSeconds * 1000;
      return true;
    },
    async releaseLock({ threadId, runId }) {
      if (locks.get(threadId)?.runId === runId) locks.delete(threadId);
    },
    async activeRunId(threadId) {
      return live(threadId)?.runId ?? null;
    },
    /** Merges by id, so a run never erases what another one wrote. */
    record(threadId, rows) {
      const current = messages.get(threadId) ?? [];
      for (const row of rows) {
        const at = current.findIndex((message) => message.id === row.id);
        if (at === -1) current.push(row);
        else current[at] = row;
      }
      messages.set(threadId, current);
    },
  };
  return store;
}

/** An AG-UI message as Intelligence stored it: tool calls flattened, arguments as JSON text. */
export function storedRow(message: Message): StoredThreadMessage {
  const row = message as Message & {
    content?: unknown;
    toolCalls?: {
      id: string;
      function: { name: string; arguments: string };
    }[];
    toolCallId?: string;
    activityType?: string;
  };
  return {
    id: row.id,
    role: row.role,
    ...(row.content !== undefined ? { content: row.content } : {}),
    ...(row.toolCalls
      ? {
          toolCalls: row.toolCalls.map((call) => ({
            id: call.id,
            name: call.function.name,
            args: call.function.arguments,
          })),
        }
      : {}),
    ...(row.toolCallId ? { toolCallId: row.toolCallId } : {}),
    ...(row.activityType ? { activityType: row.activityType } : {}),
  };
}

export function createFakeRunner(
  store: ReturnType<typeof createFakeThreadStore>,
): PgAgentRunner & { sweeps: number; runs: string[] } {
  const running = new Map<
    string,
    { runId: string; agent: AbstractAgent; subject: ReplaySubject<BaseEvent> }
  >();
  const events = new Map<string, BaseEvent[]>();

  const runner = {
    sweeps: 0,
    runs: [] as string[],
    async sweepInterruptedRuns() {
      runner.sweeps++;
      return 0;
    },
    run(request: {
      threadId: string;
      agent: AbstractAgent;
      input: RunAgentInput;
      persistedInputMessages?: Message[];
    }) {
      const { threadId, agent, input } = request;
      // This process already runs the thread: refused on the spot, as the real runner does.
      if (running.has(threadId)) throw lockDenied(threadId, input.runId);
      const subject = new ReplaySubject<BaseEvent>(Infinity);
      running.set(threadId, { runId: input.runId, agent, subject });
      void (async () => {
        const thread = await store.getThread(threadId);
        if (!thread) {
          running.delete(threadId);
          subject.error(unknownThread(threadId));
          return;
        }
        // Whoever takes the lock releases it: a headless turn took it already, a browser run did not.
        const ownsLock = (await store.activeRunId(threadId)) !== input.runId;
        const held = await store.acquireLock({
          threadId,
          runId: input.runId,
          userId: thread.userId,
          agentId: thread.agentId,
          ttlSeconds: 120,
        });
        if (!held) {
          running.delete(threadId);
          subject.error(lockDenied(threadId, input.runId));
          return;
        }
        runner.runs.push(input.runId);
        store.record(threadId, input.messages.map(storedRow));
        const seen = events.get(threadId) ?? [];
        events.set(threadId, seen);
        try {
          await agent.runAgent(input, {
            onEvent: ({ event }) => {
              seen.push(event);
              subject.next(event);
            },
          });
          store.record(threadId, agent.messages.map(storedRow));
        } catch (error) {
          subject.next({
            type: EventType.RUN_ERROR,
            message: error instanceof Error ? error.message : String(error),
          } as BaseEvent);
        } finally {
          running.delete(threadId);
          if (ownsLock)
            await store.releaseLock({ threadId, runId: input.runId });
          subject.complete();
        }
      })();
      return subject.asObservable();
    },
    connect(request: { threadId: string }) {
      const current = running.get(request.threadId);
      if (current) return current.subject.asObservable();
      return new Observable<BaseEvent>((observer) => {
        for (const event of events.get(request.threadId) ?? [])
          observer.next(event);
        observer.complete();
      });
    },
    async isRunning(request: { threadId: string }) {
      return (
        running.has(request.threadId) ||
        (await store.activeRunId(request.threadId)) !== null
      );
    },
    async stop(request: { threadId: string; runId?: string }) {
      const current = running.get(request.threadId);
      if (!current || (request.runId && request.runId !== current.runId))
        return false;
      current.agent.abortRun();
      return true;
    },
  };
  return runner as unknown as PgAgentRunner & {
    sweeps: number;
    runs: string[];
  };
}

/** The store's module, as `./threads/index.ts` will export it, with a record of what boot did. */
export function createFakeThreadsModule() {
  const store = createFakeThreadStore();
  const runner = createFakeRunner(store);
  const order: string[] = [];
  const module: ThreadsModule = {
    applyFreeDuetThreadMigrations: async (_database: Database) => {
      order.push("migrations");
    },
    createLocalThreadStore: () => {
      order.push("store");
      return store;
    },
    createPgAgentRunner: () => {
      order.push("runner");
      const sweep = runner.sweepInterruptedRuns.bind(runner);
      runner.sweepInterruptedRuns = async () => {
        order.push("sweep");
        return sweep();
      };
      return runner;
    },
  };
  return { module, store, runner, order };
}
