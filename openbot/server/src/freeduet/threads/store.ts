/**
 * The thread store on FreeDuet's own Postgres: threads, their messages, and the lock a run holds.
 *
 * It answers what CopilotKit Intelligence answered (#42), in the shapes `./contract.ts` fixes, so
 * the readers OpenBot already has keep working when FREEDUET_INTELLIGENCE=off.
 *
 * MESSAGES ARE READ, NOT KEPT. There is no messages table. A thread's messages are what the events
 * of its runs add up to (`./events.ts`), so a routine's turn, a hand-off and a browser turn all
 * land in one history through the one runner, and nothing can fall out of step with the events.
 *
 * THE RUNNING TURN IS INCLUDED. The runner on this process registers itself here, and the run it
 * is streaming is read from its memory rather than from the last batch it wrote, so a reader sees
 * the reply as far as it has got.
 *
 * THE LOCK IS ONE ROW PER THREAD, TAKEN IN ONE STATEMENT. `insert ... on conflict do update ... where`
 * either inserts, takes over an expired row, or re-enters a row this same run already holds, and
 * does nothing otherwise. Postgres locks the conflicting row for the statement, so two runs asking
 * at once cannot both get it, and no read-then-write gap exists to race through.
 */
import type { BaseEvent } from "@ag-ui/client";
import { compactEvents } from "@ag-ui/client";
import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type {
  LocalThreadStore,
  StoredThread,
  StoredThreadMessage,
} from "./contract";
import { reduceEvents, storedEvents, toStoredMessage } from "./events";
import { readRunChain, rowsOf } from "./runs";

/**
 * Refused: the thread exists and belongs to somebody else.
 *
 * Status 404 rather than 403, and the message says "not found": answering "forbidden" would tell
 * the asker that a conversation with that id exists, which is itself somebody else's information.
 */
export class ThreadOwnershipError extends Error {
  override name = "ThreadOwnershipError";
  readonly status = 404;
  constructor(readonly threadId: string) {
    super("Thread not found");
  }
}

/** The run a runner on this process is streaming on a thread, as far as it has got. */
export type LiveRunSource = {
  liveRun(threadId: string): { runId: string; events: BaseEvent[] } | undefined;
};

type ThreadRow = {
  thread_id: string;
  user_id: string;
  agent_id: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
};

function toThread(row: ThreadRow): StoredThread {
  return {
    threadId: row.thread_id,
    userId: row.user_id,
    agentId: row.agent_id,
    name: row.name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/**
 * A list position. The timestamp travels as Postgres printed it, not as a JS `Date`: a `Date` keeps
 * milliseconds and the column keeps microseconds, so a cursor rounded through one would skip or
 * repeat the threads that differ below the millisecond.
 */
function encodeCursor(updatedAt: string, threadId: string): string {
  return Buffer.from(JSON.stringify([updatedAt, threadId])).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // Falls through to the refusal below: a cursor this list never returned.
  }
  throw new TypeError("The cursor is not one this list returned.");
}

export class PgLocalThreadStore implements LocalThreadStore {
  private readonly liveSources = new Set<LiveRunSource>();

  constructor(private readonly database: Database) {}

  /** Called by the runner on this process; returns the call that detaches it. */
  attachLiveRuns(source: LiveRunSource): () => void {
    this.liveSources.add(source);
    return () => {
      this.liveSources.delete(source);
    };
  }

  async getOrCreateThread(params: {
    threadId: string;
    userId: string;
    agentId: string;
  }): Promise<StoredThread> {
    await this.database.execute(sql`
      insert into freeduet_threads (thread_id, user_id, agent_id)
      values (${params.threadId}, ${params.userId}, ${params.agentId})
      on conflict (thread_id) do nothing
    `);
    const thread = await this.getThread(params.threadId);
    // Absent only if it was deleted between the two statements; the caller retries a run anyway.
    if (!thread || thread.userId !== params.userId) {
      throw new ThreadOwnershipError(params.threadId);
    }
    return thread;
  }

  async getThread(threadId: string): Promise<StoredThread | null> {
    const [row] = await rowsOf<ThreadRow>(
      this.database,
      sql`
        select thread_id, user_id, agent_id, name, created_at, updated_at
        from freeduet_threads where thread_id = ${threadId}
      `,
    );
    return row ? toThread(row) : null;
  }

  async listThreads(params: {
    userId: string;
    agentId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ threads: StoredThread[]; nextCursor: string | null }> {
    const limit = Math.min(
      Math.max(Math.trunc(params.limit ?? DEFAULT_LIST_LIMIT), 1),
      MAX_LIST_LIMIT,
    );
    const conditions: SQL[] = [sql`user_id = ${params.userId}`];
    if (params.agentId !== undefined) {
      conditions.push(sql`agent_id = ${params.agentId}`);
    }
    if (params.cursor) {
      const [updatedAt, threadId] = decodeCursor(params.cursor);
      conditions.push(
        sql`(updated_at, thread_id) < (${updatedAt}::timestamptz, ${threadId})`,
      );
    }
    const rows = await rowsOf<ThreadRow & { position: string }>(
      this.database,
      sql`
        select thread_id, user_id, agent_id, name, created_at, updated_at,
               updated_at::text as position
        from freeduet_threads
        where ${sql.join(conditions, sql` and `)}
        order by updated_at desc, thread_id desc
        limit ${limit + 1}
      `,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      threads: page.map(toThread),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor(last.position, last.thread_id)
          : null,
    };
  }

  async getThreadMessages(threadId: string): Promise<StoredThreadMessage[]> {
    const runs = await readRunChain(this.database, threadId);
    const live = this.liveRun(threadId);
    const events = runs.flatMap((run) =>
      live && run.runId === live.runId ? storedEvents(live.events) : run.events,
    );
    const { messages } = await reduceEvents(compactEvents(events));
    return messages.map(toStoredMessage);
  }

  async acquireLock(params: {
    threadId: string;
    runId: string;
    userId: string;
    agentId: string;
    ttlSeconds: number;
  }): Promise<boolean> {
    const rows = await rowsOf<{ run_id: string }>(
      this.database,
      sql`
      insert into freeduet_thread_locks as held
        (thread_id, run_id, user_id, agent_id, acquired_at, expires_at)
      values
        (${params.threadId}, ${params.runId}, ${params.userId}, ${params.agentId}, now(),
         now() + make_interval(secs => ${params.ttlSeconds}::double precision))
      on conflict (thread_id) do update
        set run_id = excluded.run_id,
            user_id = excluded.user_id,
            agent_id = excluded.agent_id,
            acquired_at = case when held.run_id = excluded.run_id
                               then held.acquired_at else excluded.acquired_at end,
            expires_at = excluded.expires_at
        where held.expires_at <= now() or held.run_id = excluded.run_id
      returning run_id
    `,
    );
    return rows.length > 0;
  }

  async renewLock(params: {
    threadId: string;
    runId: string;
    ttlSeconds: number;
  }): Promise<boolean> {
    // An expired lock is not renewed even if nobody took it yet, as Intelligence refuses it: from
    // the moment it lapsed another run was entitled to it, so the run that let it lapse must stop.
    const rows = await rowsOf<{ run_id: string }>(
      this.database,
      sql`
      update freeduet_thread_locks
      set expires_at = now() + make_interval(secs => ${params.ttlSeconds}::double precision)
      where thread_id = ${params.threadId} and run_id = ${params.runId} and expires_at > now()
      returning run_id
    `,
    );
    return rows.length > 0;
  }

  async releaseLock(params: {
    threadId: string;
    runId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      delete from freeduet_thread_locks
      where thread_id = ${params.threadId} and run_id = ${params.runId}
    `);
  }

  async activeRunId(threadId: string): Promise<string | null> {
    const [row] = await rowsOf<{ run_id: string }>(
      this.database,
      sql`
        select run_id from freeduet_thread_locks
        where thread_id = ${threadId} and expires_at > now()
      `,
    );
    return row?.run_id ?? null;
  }

  private liveRun(threadId: string) {
    for (const source of this.liveSources) {
      const live = source.liveRun(threadId);
      if (live) return live;
    }
    return undefined;
  }
}

export function createLocalThreadStore(database: Database): PgLocalThreadStore {
  return new PgLocalThreadStore(database);
}
