/**
 * The part of the CopilotKit Intelligence client OpenBot calls, answered from FreeDuet's own thread
 * store (issue #42, FREEDUET_INTELLIGENCE=off).
 *
 * WHY AN ADAPTER AND NOT NEW CALL SITES. Headless turns (`toolkit/src/run-turn.ts`), hand-offs
 * (`toolkit/src/copilotkit/thread-lock.ts`), approvals, delivery, conversation titles and task
 * reports all read threads through an object shaped like the Intelligence client. Answering that
 * shape here leaves every one of those files untouched: each keeps calling what it called, and
 * with the switch off the answer comes from Postgres instead of from CopilotKit.
 *
 * ERRORS LOOK LIKE THE PLATFORM'S. OpenBot recognises a missing thread and a busy thread by an error
 * named `PlatformRequestError` with `status` 404 or 409 (`toolkit/src/thread-history.ts`,
 * `toolkit/src/lease.ts`, `channels/thread-status.ts`). The vendor's class is not exported, so this
 * file throws its own error under the same name. A thread that belongs to somebody else answers 404,
 * as Intelligence did: its threads are scoped to the person asking, so another person's thread is
 * simply not there.
 */
import type { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { THREAD_LOCK_TTL_SECONDS } from "@openbot/toolkit/copilotkit/thread-lock";
import type {
  LocalThreadStore,
  StoredThread,
  ThreadLockDeniedErrorShape,
  ThreadOwnershipErrorShape,
} from "./threads/contract";

/** The store's errors by the names `./threads/contract.ts` gives them; `tsc` holds the spelling. */
const LOCK_DENIED: ThreadLockDeniedErrorShape["name"] = "ThreadLockDeniedError";
const NOT_YOURS: ThreadOwnershipErrorShape["name"] = "ThreadOwnershipError";

/** The methods of the Intelligence client OpenBot calls on a thread, and nothing else of it. */
export type ThreadClient = Pick<
  CopilotKitIntelligence,
  | "getThread"
  | "getOrCreateThread"
  | "getThreadMessages"
  | "ɵacquireThreadLock"
  | "ɵrenewThreadLock"
  | "ɵcleanupThreadLock"
>;

/** A 404 or a 409, named as the platform names its own so OpenBot's existing checks read it. */
export class LocalThreadError extends Error {
  override name = "PlatformRequestError";
  readonly retryable = false;
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

/**
 * Whether an error means another run holds the thread. Two spellings: this adapter's 409, and the
 * store's `ThreadLockDeniedError` (by name, as the contract says, so neither side imports the
 * other's class).
 */
export function isThreadLockDenied(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === LOCK_DENIED) return true;
  return (
    error.name === "PlatformRequestError" &&
    (error as { status?: unknown }).status === 409
  );
}

const missing = (threadId: string) =>
  new LocalThreadError(`Thread ${threadId} was not found.`, 404);

/** The thread as Intelligence summarised one. */
function summary(thread: StoredThread) {
  return {
    id: thread.threadId,
    name: thread.name,
    agentId: thread.agentId,
    createdById: thread.userId,
    archived: false,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

export class LocalIntelligence implements ThreadClient {
  constructor(private readonly store: LocalThreadStore) {}

  /** The thread when it exists and is this person's; otherwise null. */
  private async owned(threadId: string, userId: string) {
    const thread = await this.store.getThread(threadId);
    return thread && thread.userId === userId ? thread : null;
  }

  async getThread(params: { threadId: string; userId: string }) {
    const thread = await this.owned(params.threadId, params.userId);
    if (!thread) throw missing(params.threadId);
    return summary(thread);
  }

  async getOrCreateThread(params: {
    threadId: string;
    userId: string;
    agentId: string;
  }) {
    const before = await this.store.getThread(params.threadId);
    if (before && before.userId !== params.userId)
      throw missing(params.threadId);
    if (before) return { thread: summary(before), created: false };
    try {
      const thread = await this.store.getOrCreateThread({
        threadId: params.threadId,
        userId: params.userId,
        agentId: params.agentId,
      });
      return { thread: summary(thread), created: true };
    } catch (error) {
      // Somebody else created the same id in the moment between the read and the create: the
      // store's `ThreadOwnershipError`, answered as the thread not being there.
      if (error instanceof Error && error.name === NOT_YOURS)
        throw missing(params.threadId);
      const after = await this.store.getThread(params.threadId);
      if (after && after.userId !== params.userId)
        throw missing(params.threadId);
      throw error;
    }
  }

  async getThreadMessages(params: { threadId: string; userId: string }) {
    if (!(await this.owned(params.threadId, params.userId)))
      throw missing(params.threadId);
    return { messages: await this.store.getThreadMessages(params.threadId) };
  }

  async ɵacquireThreadLock(params: {
    threadId: string;
    runId: string;
    userId: string;
    agentId: string;
    ttlSeconds?: number;
  }) {
    if (!(await this.owned(params.threadId, params.userId)))
      throw missing(params.threadId);
    const held = await this.store.acquireLock({
      threadId: params.threadId,
      runId: params.runId,
      userId: params.userId,
      agentId: params.agentId,
      ttlSeconds: params.ttlSeconds ?? THREAD_LOCK_TTL_SECONDS,
    });
    if (!held) throw new LocalThreadError("Thread lock denied", 409);
    // No join token: nothing joins a gateway here. Callers read the run id alone.
    return { threadId: params.threadId, runId: params.runId, joinToken: "" };
  }

  async ɵrenewThreadLock(params: {
    threadId: string;
    runId: string;
    ttlSeconds: number;
  }) {
    if (!(await this.store.renewLock(params)))
      throw new LocalThreadError("Thread lock lost", 409);
    return { ttlSeconds: params.ttlSeconds };
  }

  async ɵcleanupThreadLock(params: { threadId: string; runId: string }) {
    await this.store.releaseLock(params);
  }
}
