/**
 * Conversations without CopilotKit Intelligence: the contract between the store and the wiring.
 *
 * Issue #42 (decided 2026-11-08): with FREEDUET_INTELLIGENCE=off, FreeDuet keeps its conversations
 * in its own Postgres. Two pieces meet here and are built separately:
 *
 * - THE STORE (`./store.ts`, `./pg-runner.ts`, `./migrations/`): tables, the thread store and the
 *   Postgres agent runner. It touches no upstream file.
 * - THE WIRING (`../backend.ts`, `../thread-routes.ts`): the switch, the backend factory, the
 *   ownership guard on the runtime's routes, and every upstream site that read Intelligence.
 *
 * Neither side changes these shapes alone. A change here is a change to both, made in one commit.
 *
 * WHAT IS THE TRUTH. A thread is the runs that happened on it, as the AG-UI events each run
 * produced (the model of CopilotKit's own SqliteAgentRunner, MIT). Messages are read from those
 * events. A routine, a hand-off and a browser turn all write through the one runner, so there is
 * one history, and a browser run never erases what a routine wrote while the tab was open.
 *
 * ONE PROCESS. Live tailing of a running turn works inside one server process. The Postgres lock
 * stops two processes running the same thread, but a second replica cannot tail the first one's
 * run. FreeDuet supports a single server; see docs/M1_PLAN.md.
 */
import type { AgentRunner } from "@copilotkit/runtime/v2";
import type { Database } from "../../db/client";

/** One message as Intelligence returned it, which every reader in OpenBot already understands. */
export type StoredThreadMessage = {
  id: string;
  role: string;
  content?: unknown;
  activityType?: string;
  /** `args` is the JSON text of the arguments, as Intelligence returns it. */
  toolCalls?: { id: string; name: string; args: string }[];
  toolCallId?: string;
};

export type StoredThread = {
  threadId: string;
  /** The person who owns the thread. Every read and every run is checked against it. */
  userId: string;
  agentId: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** How a run ended, or that it has not. `interrupted` is a run the server stopped hearing from. */
export type StoredRunStatus =
  | "running"
  | "finished"
  | "stopped"
  | "failed"
  | "interrupted";

export interface LocalThreadStore {
  /** Creates the thread on first use. A thread that exists for another user is refused. */
  getOrCreateThread(params: {
    threadId: string;
    userId: string;
    agentId: string;
  }): Promise<StoredThread>;

  /** The thread, or null when there is none. Callers check `userId` themselves. */
  getThread(threadId: string): Promise<StoredThread | null>;

  /** The person's threads, newest first. */
  listThreads(params: {
    userId: string;
    agentId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ threads: StoredThread[]; nextCursor: string | null }>;

  /** Every message on the thread, oldest first, including the running turn's text so far. */
  getThreadMessages(threadId: string): Promise<StoredThreadMessage[]>;

  /**
   * Takes the thread for one run. False when another live run holds it: the caller answers
   * 409 "Thread lock denied", as Intelligence did. An expired lock is taken over.
   */
  acquireLock(params: {
    threadId: string;
    runId: string;
    userId: string;
    agentId: string;
    ttlSeconds: number;
  }): Promise<boolean>;

  /** Extends the lock this run holds. False when the run no longer holds it. */
  renewLock(params: {
    threadId: string;
    runId: string;
    ttlSeconds: number;
  }): Promise<boolean>;

  /** Lets the lock go. Releasing a lock the run does not hold changes nothing. */
  releaseLock(params: { threadId: string; runId: string }): Promise<void>;

  /** The run in progress on the thread, for the app's live-run probe; null when idle. */
  activeRunId(threadId: string): Promise<string | null>;
}

/**
 * The runner the runtime, headless turns and hand-offs all share: ONE instance per process.
 * It accepts `persistedInputMessages` the way IntelligenceAgentRunner does.
 */
export type PgAgentRunner = AgentRunner & {
  /** Marks runs left `running` by a previous process as `interrupted` and frees their locks. */
  sweepInterruptedRuns(): Promise<number>;
};

/** What `./index.ts` exports. The wiring imports only these names. */
export type ThreadsModule = {
  /** FreeDuet's own migrations folder and journal, so upstream's numbering is never touched. */
  applyFreeDuetThreadMigrations(database: Database): Promise<void>;
  createLocalThreadStore(database: Database): LocalThreadStore;
  createPgAgentRunner(options: {
    database: Database;
    store: LocalThreadStore;
  }): PgAgentRunner;
};
