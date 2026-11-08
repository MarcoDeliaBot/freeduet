/**
 * Ported from CopilotKit's SqliteAgentRunner (`@copilotkit/sqlite-runner` 1.77.0,
 * `src/sqlite-runner.ts`), https://github.com/CopilotKit/CopilotKit
 *
 * The MIT License
 *
 * Copyright (c) Atai Barkai
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Modified for FreeDuet (#42):
 * - Postgres through the server's own pool instead of a better-sqlite3 file; the tables are
 *   FreeDuet's (`./migrations`), and run state is a lock row with a lifetime instead of a flag.
 * - The run takes the thread's lock before the agent starts, renews it while it works and lets it
 *   go at the end. A thread held elsewhere is refused with `ThreadLockDeniedError` (409).
 * - The run row is written as `running` before the agent starts and its events are written in
 *   batches while it works, so a crash keeps the partial reply. It ends as finished, stopped or
 *   failed; `sweepInterruptedRuns` turns a dead process's runs into `interrupted`.
 * - `persistedInputMessages` is honoured as `IntelligenceAgentRunner` honours it, and only messages
 *   the thread does not already hold are recorded: messages are merged by id, never overwritten.
 * - RUN_STARTED is made sure of and stop races the agent, as in `IntelligenceAgentRunner`.
 * - The active runs live on the instance, not in a module global.
 * - Stop resolves once the run is on record, and an unrelated stop (another run id) is refused.
 *
 * ONE INSTANCE PER PROCESS. The runtime, headless turns and hand-offs share it. Live tailing works
 * inside this process; the lock keeps a second process from running the same thread, but cannot
 * let it watch (see `./contract.ts`).
 *
 * WHO RELEASES THE LOCK. Whoever took it. A headless turn or a hand-off takes the thread's lock with
 * the run id it then passes here; the runner re-enters that lock, renews it, and leaves its release
 * to the caller, whose heartbeat would otherwise find it gone and report a lost lock. A run that
 * arrives with the thread free (a browser turn) takes the lock itself and releases it before its
 * stream completes, so the person's next message never meets a lock left over from the last one.
 */
import type {
  BaseEvent,
  Message,
  RunAgentInput,
  RunStartedEvent,
} from "@ag-ui/client";
import { compactEvents, EventType } from "@ag-ui/client";
import {
  AgentRunner,
  type AgentRunnerConnectRequest,
  type AgentRunnerIsRunningRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
  finalizeRunEvents,
} from "@copilotkit/runtime/v2";
import { type Observable, ReplaySubject } from "rxjs";
import type { Database } from "../../db/client";
import type {
  LocalThreadStore,
  PgAgentRunner as PgAgentRunnerContract,
} from "./contract";
import { messageIdsIn, reduceEvents, storedEvents } from "./events";
import {
  closeRun,
  interruptRuns,
  latestRunId,
  openRun,
  readRunChain,
  touchThread,
  writeRunEvents,
} from "./runs";
import { type LiveRunSource, PgLocalThreadStore } from "./store";

/**
 * The thread is held by another run. The wiring answers it as Intelligence's run handler did:
 * 409 "Thread lock denied".
 *
 * Thrown from `run()` itself when this process is already running the thread, as every upstream
 * runner throws "Thread already running"; delivered through the returned observable's `error`
 * when the lock row says another run holds it, because that answer needs the database.
 */
export class ThreadLockDeniedError extends Error {
  override name = "ThreadLockDeniedError";
  readonly status = 409;
  constructor(
    readonly threadId: string,
    readonly runId: string,
  ) {
    super("Thread lock denied");
  }
}

/**
 * A run on a thread nobody created. The wiring creates the thread for its owner
 * (`getOrCreateThread`) before it runs anything on it; without that row the runner cannot know
 * whose lock it would be taking.
 */
export class UnknownThreadError extends Error {
  override name = "UnknownThreadError";
  readonly status = 404;
  constructor(readonly threadId: string) {
    super("Thread not found");
  }
}

/**
 * The defaults, and why.
 *
 * - 120 seconds of lock, renewed every 15: the same lifetime and heartbeat as the platform lock
 *   (`THREAD_LOCK_TTL_SECONDS`, `TURN_LIMITS`), so a headless turn's own heartbeat and this one
 *   agree. A process that dies holds a thread for at most this long; the boot sweep frees it sooner.
 * - Events written every 25, or 250 ms after the first unwritten one: a crash loses at most a
 *   quarter of a second of reply, and a reply streamed token by token costs a few writes a second
 *   rather than one per token. RUN_STARTED is written at once, so the person's message is on record
 *   before the model has said anything.
 */
export const PG_RUNNER_DEFAULTS = {
  lockTtlSeconds: 120,
  lockRenewMs: 15_000,
  flushEveryEvents: 25,
  flushEveryMs: 250,
} as const;

/** The RUN_ERROR a run carries when another run took its thread from it. */
const LOCK_LOST_MESSAGE =
  "This reply was stopped: another turn took over the conversation.";

export type PgAgentRunnerOptions = {
  database: Database;
  store: LocalThreadStore;
  lockTtlSeconds?: number;
  lockRenewMs?: number;
  flushEveryEvents?: number;
  flushEveryMs?: number;
  /** Names this instance in the rows it writes. A fresh id per instance; tests may fix it. */
  runnerId?: string;
};

type Timer = ReturnType<typeof setTimeout>;

/** One run this instance is streaming. */
type ActiveRun = {
  threadId: string;
  runId: string;
  request: AgentRunnerRunRequest;
  /** What `run()` returned to its caller. */
  runSubject: ReplaySubject<BaseEvent>;
  /** What `connect()` tails. Kept apart so a refused run errors its caller and nobody else. */
  liveSubject: ReplaySubject<BaseEvent>;
  /** Input messages this run records: the ones the thread does not hold yet. */
  persisted: Message[];
  /** A retried run id's earlier attempts, already on record. */
  priorEvents: BaseEvent[];
  /** This attempt's events, as streamed. */
  events: BaseEvent[];
  /** The lock is taken and the row is open. Before that there is nothing to tail or read. */
  started: boolean;
  /** The lock was free when this run came, so this run took it and gives it back. */
  ownsLock: boolean;
  hasRunStarted: boolean;
  stopRequested: boolean;
  lockLost: boolean;
  /** No more events are accepted from the agent. */
  ended: boolean;
  cancel: () => void;
  cancelled: Promise<void>;
  settle: () => void;
  settled: Promise<void>;
  unflushed: number;
  flushTimer?: Timer;
  /** Writes happen one after another, never two at once, so a late batch never overwrites a newer. */
  writes: Promise<void>;
  renewTimer?: ReturnType<typeof setInterval>;
};

export class PgAgentRunner
  extends AgentRunner
  implements PgAgentRunnerContract, LiveRunSource
{
  private readonly database: Database;
  private readonly store: LocalThreadStore;
  private readonly runnerId: string;
  private readonly lockTtlSeconds: number;
  private readonly lockRenewMs: number;
  private readonly flushEveryEvents: number;
  private readonly flushEveryMs: number;
  /** Per instance, not per module: two runners in one process (a test's restart) share nothing. */
  private readonly active = new Map<string, ActiveRun>();

  constructor(options: PgAgentRunnerOptions) {
    super();
    this.database = options.database;
    this.store = options.store;
    this.runnerId = options.runnerId ?? crypto.randomUUID();
    this.lockTtlSeconds =
      options.lockTtlSeconds ?? PG_RUNNER_DEFAULTS.lockTtlSeconds;
    this.lockRenewMs = options.lockRenewMs ?? PG_RUNNER_DEFAULTS.lockRenewMs;
    this.flushEveryEvents =
      options.flushEveryEvents ?? PG_RUNNER_DEFAULTS.flushEveryEvents;
    this.flushEveryMs = options.flushEveryMs ?? PG_RUNNER_DEFAULTS.flushEveryMs;
    if (this.store instanceof PgLocalThreadStore) {
      this.store.attachLiveRuns(this);
    }
  }

  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    const { threadId } = request;
    if (this.active.has(threadId)) {
      throw new ThreadLockDeniedError(threadId, request.input.runId);
    }
    let cancel = () => {};
    const cancelled = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    let settle = () => {};
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const run: ActiveRun = {
      threadId,
      runId: request.input.runId,
      request,
      runSubject: new ReplaySubject<BaseEvent>(Infinity),
      liveSubject: new ReplaySubject<BaseEvent>(Infinity),
      persisted: [],
      priorEvents: [],
      events: [],
      started: false,
      ownsLock: false,
      hasRunStarted: false,
      stopRequested: false,
      lockLost: false,
      ended: false,
      cancel,
      cancelled,
      settle,
      settled,
      unflushed: 0,
      writes: Promise.resolve(),
    };
    // Claimed before anything is awaited, so a second run on this thread from this process is
    // refused on the spot rather than racing this one to the lock.
    this.active.set(threadId, run);
    void this.execute(run);
    return run.runSubject.asObservable();
  }

  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    const { threadId } = request;
    // Taken now, not after the read: a run that ends while history loads still replays in full
    // from its subject, and its row is skipped so nothing arrives twice.
    const live = this.active.get(threadId);
    const tailed = live?.started ? live : undefined;
    const connection = new ReplaySubject<BaseEvent>(Infinity);

    void (async () => {
      const runs = await readRunChain(this.database, threadId);
      const stored = runs
        .filter((run) => run.runId !== tailed?.runId)
        .flatMap((run) => run.events);
      if (tailed) stored.push(...tailed.priorEvents);
      const { events } = await reduceEvents(compactEvents(stored));
      const emitted = new Set<string>();
      for (const event of events) {
        connection.next(event);
        if ("messageId" in event && typeof event.messageId === "string") {
          emitted.add(event.messageId);
        }
      }
      if (!tailed) {
        connection.complete();
        return;
      }
      tailed.liveSubject.subscribe({
        next: (event) => {
          if (
            "messageId" in event &&
            typeof event.messageId === "string" &&
            emitted.has(event.messageId)
          ) {
            return;
          }
          connection.next(event);
        },
        complete: () => connection.complete(),
        error: () => connection.complete(),
      });
    })().catch((error: unknown) => connection.error(error));

    return connection.asObservable();
  }

  async isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    const run = this.active.get(request.threadId);
    if (run && !run.ended) return !run.stopRequested;
    return (await this.store.activeRunId(request.threadId)) !== null;
  }

  /**
   * Stops this process's run on the thread and resolves once it is on record as stopped and its
   * lock is handled. False for a run this process is not streaming, or not the run id named.
   */
  async stop(request: AgentRunnerStopRequest): Promise<boolean | undefined> {
    const run = this.active.get(request.threadId);
    if (!run || run.ended || run.stopRequested) return false;
    if (request.runId !== undefined && run.runId !== request.runId) {
      return false;
    }
    run.stopRequested = true;
    try {
      run.request.agent.abortRun();
    } catch (error) {
      // The run is ended here either way: an agent that cannot be aborted is raced, not waited on.
      console.warn("[freeduet-threads] the agent could not be aborted:", error);
    }
    run.cancel();
    await run.settled;
    return true;
  }

  async sweepInterruptedRuns(): Promise<number> {
    return interruptRuns(this.database, { notRunner: this.runnerId });
  }

  /** For the store: the run this instance is streaming on the thread, as far as it has got. */
  liveRun(threadId: string) {
    const run = this.active.get(threadId);
    if (!run?.started) return undefined;
    return { runId: run.runId, events: [...run.priorEvents, ...run.events] };
  }

  private async execute(run: ActiveRun): Promise<void> {
    try {
      await this.admit(run);
    } catch (error) {
      this.forget(run);
      run.liveSubject.complete();
      run.runSubject.error(error);
      run.settle();
      return;
    }

    let failure: string | undefined;
    if (!run.stopRequested) {
      const running = run.request.agent.runAgent(run.request.input, {
        onEvent: ({ event }) => this.accept(run, event),
      });
      // Raced against stop below; a rejection after the race is decided has nobody to tell.
      running.catch(() => undefined);
      try {
        await Promise.race([running, run.cancelled]);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    await this.finish(run, failure);
  }

  /** The lock, the history and the open row, in that order, before the agent is started. */
  private async admit(run: ActiveRun): Promise<void> {
    const { threadId, runId, request } = run;
    const thread = await this.store.getThread(threadId);
    if (!thread) throw new UnknownThreadError(threadId);
    const agentId = request.agent.agentId ?? thread.agentId;

    run.ownsLock = (await this.store.activeRunId(threadId)) !== runId;
    const held = await this.store.acquireLock({
      threadId,
      runId,
      userId: thread.userId,
      agentId,
      ttlSeconds: this.lockTtlSeconds,
    });
    if (!held) throw new ThreadLockDeniedError(threadId, runId);

    try {
      // Holding the lock means any other run still marked running here is a dead one.
      await interruptRuns(this.database, { threadId, exceptRunId: runId });
      const historic = new Set<string>();
      for (const stored of await readRunChain(this.database, threadId)) {
        messageIdsIn(stored.events, historic);
      }
      run.persisted = (
        request.persistedInputMessages ??
        request.input.messages ??
        []
      ).filter((message) => !historic.has(message.id));
      const { priorEvents } = await openRun(this.database, {
        threadId,
        runId,
        parentRunId: await latestRunId(this.database, threadId),
        agentId,
        input: { ...request.input, messages: run.persisted },
        runnerId: this.runnerId,
      });
      run.priorEvents = priorEvents;
      await touchThread(this.database, threadId);
    } catch (error) {
      if (run.ownsLock) {
        await this.store
          .releaseLock({ threadId, runId })
          .catch(() => undefined);
      }
      throw error;
    }

    run.started = true;
    run.renewTimer = setInterval(() => this.renew(run), this.lockRenewMs);
    run.renewTimer.unref?.();
  }

  private renew(run: ActiveRun): void {
    this.store
      .renewLock({
        threadId: run.threadId,
        runId: run.runId,
        ttlSeconds: this.lockTtlSeconds,
      })
      .then(
        (held) => {
          if (held || run.ended) return;
          // Somebody else holds the thread now. Writing on would put this reply into their turn.
          run.lockLost = true;
          try {
            run.request.agent.abortRun();
          } catch {
            // Raced, as in `stop`.
          }
          run.cancel();
        },
        (error: unknown) => {
          // A renewal that failed is tried again on the next beat; the lifetime covers a blip.
          console.warn(
            "[freeduet-threads] the conversation lock could not be renewed:",
            error instanceof Error ? error.message : error,
          );
        },
      );
  }

  /** One event from the agent, with its RUN_STARTED made sure of first. */
  private accept(run: ActiveRun, event: BaseEvent): void {
    if (run.ended || run.stopRequested || run.lockLost) return;
    if (event.type === EventType.RUN_STARTED) {
      this.record(run, this.runStarted(run, event as RunStartedEvent));
      return;
    }
    if (!run.hasRunStarted) this.record(run, this.runStarted(run));
    this.record(run, event);
  }

  /**
   * The run's RUN_STARTED, carrying the input messages this run records and no others: the same
   * event `IntelligenceAgentRunner` builds, so a reader finds the person's message in the run that
   * answered it, and a browser run that was sent the whole conversation records only what is new.
   */
  private runStarted(run: ActiveRun, source?: RunStartedEvent): BaseEvent {
    run.hasRunStarted = true;
    const base: RunAgentInput = source?.input ?? run.request.input;
    return {
      ...(source ?? { type: EventType.RUN_STARTED }),
      threadId: run.threadId,
      runId: run.runId,
      input: {
        ...base,
        threadId: run.threadId,
        runId: run.runId,
        messages: run.persisted,
      },
    } as RunStartedEvent;
  }

  private emit(run: ActiveRun, event: BaseEvent): void {
    run.events.push(event);
    run.runSubject.next(event);
    run.liveSubject.next(event);
  }

  private record(run: ActiveRun, event: BaseEvent): void {
    this.emit(run, event);
    if (event.type === EventType.RUN_STARTED) {
      this.flush(run);
      return;
    }
    run.unflushed += 1;
    if (run.unflushed >= this.flushEveryEvents) {
      this.flush(run);
    } else if (!run.flushTimer) {
      run.flushTimer = setTimeout(() => this.flush(run), this.flushEveryMs);
      run.flushTimer.unref?.();
    }
  }

  private rowEvents(run: ActiveRun): BaseEvent[] {
    return storedEvents([...run.priorEvents, ...run.events]);
  }

  private flush(run: ActiveRun): void {
    if (run.flushTimer) {
      clearTimeout(run.flushTimer);
      run.flushTimer = undefined;
    }
    run.unflushed = 0;
    run.writes = run.writes.then(() =>
      // The events as they are when the write's turn comes, so a queued write is never staler
      // than the one before it.
      writeRunEvents(this.database, {
        runId: run.runId,
        runnerId: this.runnerId,
        events: this.rowEvents(run),
      }).catch((error: unknown) => {
        console.warn(
          "[freeduet-threads] a reply in progress could not be saved:",
          error instanceof Error ? error.message : error,
        );
      }),
    );
  }

  /** Closes the run's events, puts the run on record, lets the lock go and completes the streams. */
  private async finish(run: ActiveRun, failure: string | undefined) {
    run.ended = true;
    if (run.flushTimer) clearTimeout(run.flushTimer);
    if (run.renewTimer) clearInterval(run.renewTimer);

    if (!run.hasRunStarted) this.emit(run, this.runStarted(run));
    const interruption =
      failure ?? (run.lockLost ? LOCK_LOST_MESSAGE : undefined);
    const closers = finalizeRunEvents(run.events, {
      stopRequested: run.stopRequested,
      protocolVersion: run.request.input.protocolVersion,
      ...(interruption !== undefined
        ? { interruptionMessage: interruption }
        : {}),
    });
    // `finalizeRunEvents` appended them to `run.events` already; the streams still need them.
    for (const event of closers) {
      run.runSubject.next(event);
      run.liveSubject.next(event);
    }

    const status = run.stopRequested
      ? "stopped"
      : interruption !== undefined ||
          run.events.some((event) => event.type === EventType.RUN_ERROR)
        ? "failed"
        : "finished";
    await run.writes;
    try {
      await closeRun(this.database, {
        threadId: run.threadId,
        runId: run.runId,
        runnerId: this.runnerId,
        events: this.rowEvents(run),
        status,
      });
    } catch (error) {
      // The streams still complete and the lock still goes: a run the database could not record
      // must not also leave the person locked out of their conversation.
      console.warn(
        "[freeduet-threads] a finished reply could not be saved:",
        error instanceof Error ? error.message : error,
      );
    }
    if (run.ownsLock) {
      await this.store
        .releaseLock({ threadId: run.threadId, runId: run.runId })
        .catch(() => undefined);
    }
    this.forget(run);
    run.runSubject.complete();
    run.liveSubject.complete();
    run.settle();
  }

  private forget(run: ActiveRun): void {
    if (this.active.get(run.threadId) === run) this.active.delete(run.threadId);
  }
}

export function createPgAgentRunner(
  options: PgAgentRunnerOptions,
): PgAgentRunner {
  return new PgAgentRunner(options);
}
