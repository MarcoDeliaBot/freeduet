/**
 * The run rows, read and written in one place for the store and the runner.
 *
 * JSON GOES IN AS TEXT. Through Bun's SQL client a `jsonb` parameter is encoded a second time, so a
 * stringified array lands as one JSON string rather than as an array (checked against Postgres 16:
 * `jsonb_typeof` answers "string"). Every value here is therefore sent as `text` and cast to `jsonb`
 * in SQL, which stores the array itself, and Bun hands `jsonb` back already parsed.
 */
import type { BaseEvent, RunAgentInput } from "@ag-ui/client";
import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { StoredRunStatus } from "./contract";
import { endLastRun, storedEvents } from "./events";

/** One run as the history reads it. */
export type StoredRun = {
  runId: string;
  parentRunId: string | null;
  status: StoredRunStatus;
  events: BaseEvent[];
};

/** What a run's RUN_ERROR says when the server stopped before the run did. */
export const INTERRUPTED_MESSAGE =
  "This reply was interrupted: the server stopped before it finished.";

/** The database or an open transaction on it: anything a statement can be run through. */
type Executor = Pick<Database, "execute">;

/**
 * A statement's rows, typed. drizzle's `execute` on Bun's driver types every row as a plain record
 * whatever is asked for, so the shape is stated once here at the boundary rather than at each use.
 */
export async function rowsOf<Row>(
  executor: Executor,
  statement: SQL,
): Promise<Row[]> {
  return [...(await executor.execute(statement))] as Row[];
}

/** `jsonb` as Bun returns it, which is parsed, or as text if something stored a string. */
function parsedJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * The thread's runs in order, following each run to the one that came before it.
 *
 * CopilotKit's SqliteAgentRunner reads history as a chain: a run with no parent first, then every
 * run whose parent is already in the chain. Kept, because a run the chain does not reach is one no
 * history ever named, and replaying it would invent a turn.
 */
export async function readRunChain(
  database: Database,
  threadId: string,
): Promise<StoredRun[]> {
  const rows = await rowsOf<{
    run_id: string;
    parent_run_id: string | null;
    status: StoredRunStatus;
    events: unknown;
  }>(
    database,
    sql`
    with recursive chain as (
      select r.id, r.run_id, r.parent_run_id, r.status, r.events
      from freeduet_thread_runs r
      where r.thread_id = ${threadId} and r.parent_run_id is null
      union all
      select r.id, r.run_id, r.parent_run_id, r.status, r.events
      from freeduet_thread_runs r
      join chain c on r.parent_run_id = c.run_id
      where r.thread_id = ${threadId}
    )
    select run_id, parent_run_id, status, events from chain order by id
  `,
  );
  return rows.map((row) => ({
    runId: row.run_id,
    parentRunId: row.parent_run_id,
    status: row.status,
    events: parsedJson<BaseEvent[]>(row.events, []),
  }));
}

/** The run a new run follows: the newest on the thread, as the SQLite original chose it. */
export async function latestRunId(
  database: Database,
  threadId: string,
): Promise<string | null> {
  const [row] = await rowsOf<{ run_id: string }>(
    database,
    sql`
      select run_id from freeduet_thread_runs
      where thread_id = ${threadId}
      order by id desc
      limit 1
    `,
  );
  return row?.run_id ?? null;
}

/**
 * Opens a run's row as `running`.
 *
 * A run id already on record for this thread is a retry: a durable delivery re-runs under the id
 * it was first given. The row is reopened and its stored events are returned, so the retry adds to
 * what the first attempt left (the person's message among it) instead of erasing it, and it keeps
 * its place in the chain. A run id recorded on ANOTHER thread is refused: run ids are unique, and
 * reopening it would move a turn between conversations.
 */
export async function openRun(
  database: Database,
  run: {
    threadId: string;
    runId: string;
    parentRunId: string | null;
    agentId: string;
    input: RunAgentInput;
    runnerId: string;
  },
): Promise<{ priorEvents: BaseEvent[] }> {
  const input = JSON.stringify(run.input);
  const [existing] = await rowsOf<{ thread_id: string; events: unknown }>(
    database,
    sql`select thread_id, events from freeduet_thread_runs where run_id = ${run.runId}`,
  );
  if (existing) {
    if (existing.thread_id !== run.threadId) {
      throw new Error(
        `Run ${run.runId} already belongs to another conversation.`,
      );
    }
    // An attempt that died without ending is ended first, so the retry's RUN_STARTED never lands
    // inside a run that is still open.
    const priorEvents = storedEvents(
      endLastRun(
        parsedJson<BaseEvent[]>(existing.events, []),
        INTERRUPTED_MESSAGE,
      ),
    );
    await database.execute(sql`
      update freeduet_thread_runs
      set status = 'running', events = ${JSON.stringify(priorEvents)}::text::jsonb,
          input = ${input}::text::jsonb, runner_id = ${run.runnerId},
          agent_id = ${run.agentId}, finished_at = null, updated_at = now()
      where run_id = ${run.runId}
    `);
    return { priorEvents };
  }
  await database.execute(sql`
    insert into freeduet_thread_runs
      (thread_id, run_id, parent_run_id, agent_id, status, events, input, runner_id)
    values
      (${run.threadId}, ${run.runId}, ${run.parentRunId}, ${run.agentId}, 'running',
       '[]'::jsonb, ${input}::text::jsonb, ${run.runnerId})
  `);
  return { priorEvents: [] };
}

/**
 * Writes a run's events so far. Only while the row is still this runner's running run: a row a
 * sweep has since marked interrupted is history, and a late write from the run it gave up on must
 * not reopen it.
 */
export async function writeRunEvents(
  database: Database,
  run: { runId: string; runnerId: string; events: BaseEvent[] },
): Promise<void> {
  await database.execute(sql`
    update freeduet_thread_runs
    set events = ${JSON.stringify(run.events)}::text::jsonb, updated_at = now()
    where run_id = ${run.runId} and runner_id = ${run.runnerId} and status = 'running'
  `);
}

/** Closes a run's row with its final events and how it ended. Same guard as `writeRunEvents`. */
export async function closeRun(
  database: Database,
  run: {
    threadId: string;
    runId: string;
    runnerId: string;
    events: BaseEvent[];
    status: Exclude<StoredRunStatus, "running" | "interrupted">;
  },
): Promise<void> {
  await database.execute(sql`
    update freeduet_thread_runs
    set events = ${JSON.stringify(run.events)}::text::jsonb, status = ${run.status},
        finished_at = now(), updated_at = now()
    where run_id = ${run.runId} and runner_id = ${run.runnerId} and status = 'running'
  `);
  await touchThread(database, run.threadId);
}

/** Moves the thread to the top of its owner's list. */
export async function touchThread(
  database: Database,
  threadId: string,
): Promise<void> {
  await database.execute(sql`
    update freeduet_threads set updated_at = now() where thread_id = ${threadId}
  `);
}

/**
 * Marks runs nobody is running any more as `interrupted`, and frees their locks.
 *
 * Their stored events are closed the way the runtime closes a run that ended without a terminal
 * event: open text and tool calls ended, then a RUN_ERROR saying why. The partial reply stays in the
 * history, readable, and a replay can carry the runs after it, which it could not past a run that
 * never ended.
 *
 * `skip locked`, so two sweeps at once divide the rows between them rather than queue.
 */
export async function interruptRuns(
  database: Database,
  which: { notRunner: string } | { threadId: string; exceptRunId: string },
): Promise<number> {
  return database.transaction(async (tx) => {
    const filter =
      "notRunner" in which
        ? sql`runner_id is distinct from ${which.notRunner}`
        : sql`thread_id = ${which.threadId} and run_id <> ${which.exceptRunId}`;
    const rows = await rowsOf<{
      run_id: string;
      thread_id: string;
      events: unknown;
    }>(
      tx,
      sql`
        select run_id, thread_id, events from freeduet_thread_runs
        where status = 'running' and ${filter}
        for update skip locked
      `,
    );
    for (const row of rows) {
      const events = endLastRun(
        parsedJson<BaseEvent[]>(row.events, []),
        INTERRUPTED_MESSAGE,
      );
      await tx.execute(sql`
        update freeduet_thread_runs
        set status = 'interrupted', events = ${JSON.stringify(storedEvents(events))}::text::jsonb,
            finished_at = now(), updated_at = now()
        where run_id = ${row.run_id}
      `);
      await tx.execute(sql`
        delete from freeduet_thread_locks
        where thread_id = ${row.thread_id} and run_id = ${row.run_id}
      `);
    }
    return rows.length;
  });
}
