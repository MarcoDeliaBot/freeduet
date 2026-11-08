/**
 * FreeDuet's own thread store (#42) against a real Postgres: its migrations, thread ownership, the
 * per-person list and the thread lock. The runner's flows are in freeduet-threads-runner.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  ThreadOwnershipError,
} from "../src/freeduet/threads";
import {
  FreeDuetMigrationChangedError,
  readFreeDuetMigrations,
} from "../src/freeduet/threads/migrate";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const store = createLocalThreadStore(database);
const threadIds: string[] = [];

/** A thread id this file made, so `afterAll` removes exactly what it created. */
function newThreadId() {
  const threadId = `fd-store-${randomUUID()}`;
  threadIds.push(threadId);
  return threadId;
}

beforeAll(async () => {
  await applyFreeDuetThreadMigrations(database);
});

afterAll(async () => {
  for (const threadId of threadIds) {
    await database.execute(
      sql`delete from freeduet_thread_locks where thread_id = ${threadId}`,
    );
    await database.execute(
      sql`delete from freeduet_threads where thread_id = ${threadId}`,
    );
  }
  // The suite runs in one process: a pool left open holds its connections to the end (TEST_POOL).
  await database.$client.close();
});

describe("FreeDuet's thread migrations", () => {
  /**
   * In a schema of their own, so the tables start absent without touching the ones the rest of the
   * suite uses. `search_path` travels as a connection parameter (`addressOf` carries the query).
   */
  const schema = `fd_migrations_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(testDatabaseUrl());
  url.searchParams.set("search_path", schema);
  const scoped = createDatabase(url.toString(), TEST_POOL);

  beforeAll(async () => {
    await database.execute(sql.raw(`create schema "${schema}"`));
  });
  afterAll(async () => {
    await scoped.$client.close();
    await database.execute(sql.raw(`drop schema "${schema}" cascade`));
  });

  test("two boots at once create the tables once, and a third changes nothing", async () => {
    await Promise.all([
      applyFreeDuetThreadMigrations(scoped),
      applyFreeDuetThreadMigrations(scoped),
    ]);
    await applyFreeDuetThreadMigrations(scoped);

    const tables = [
      ...(await database.execute(sql`
        select table_name from information_schema.tables
        where table_schema = ${schema} order by table_name
      `)),
    ].map((row) => row.table_name);
    expect(tables).toEqual([
      "freeduet_thread_locks",
      "freeduet_thread_migrations",
      "freeduet_thread_runs",
      "freeduet_threads",
    ]);
    const applied = [
      ...(await database.execute(
        sql.raw(`select tag from "${schema}".freeduet_thread_migrations`),
      )),
    ].map((row) => row.tag);
    const folder = await readFreeDuetMigrations();
    expect(applied).toEqual(folder.map((migration) => migration.tag));
  });

  test("a migration edited after it was applied is refused, not skipped", async () => {
    const folder = await mkdtemp(join(tmpdir(), "fd-migrations-"));
    try {
      await cp(
        join(import.meta.dir, "../src/freeduet/threads/migrations"),
        folder,
        { recursive: true },
      );
      const [first] = await readFreeDuetMigrations(folder);
      if (!first) throw new Error("the migrations folder is empty");
      await writeFile(
        join(folder, `${first.tag}.sql`),
        "-- edited after it shipped\nselect 1;\n",
      );
      await expect(
        applyFreeDuetThreadMigrations(scoped, folder),
      ).rejects.toBeInstanceOf(FreeDuetMigrationChangedError);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe("threads belong to one person", () => {
  test("the first call creates the thread, the next returns it", async () => {
    const threadId = newThreadId();
    const created = await store.getOrCreateThread({
      threadId,
      userId: "ada",
      agentId: "iris",
    });
    expect(created).toMatchObject({
      threadId,
      userId: "ada",
      agentId: "iris",
      name: null,
    });
    const again = await store.getOrCreateThread({
      threadId,
      userId: "ada",
      agentId: "iris",
    });
    expect(again.createdAt.getTime()).toBe(created.createdAt.getTime());
    expect(await store.getThread(threadId)).toMatchObject({ userId: "ada" });
    expect(await store.getThread(`fd-store-absent-${randomUUID()}`)).toBeNull();
  });

  test("another person's thread is refused as not found", async () => {
    const threadId = newThreadId();
    await store.getOrCreateThread({ threadId, userId: "ada", agentId: "iris" });
    const refused = store.getOrCreateThread({
      threadId,
      userId: "bob",
      agentId: "iris",
    });
    await expect(refused).rejects.toBeInstanceOf(ThreadOwnershipError);
    await expect(refused).rejects.toMatchObject({
      status: 404,
      message: "Thread not found",
    });
    // And it still belongs to the person who made it.
    expect(await store.getThread(threadId)).toMatchObject({ userId: "ada" });
  });
});

describe("a person's threads", () => {
  test("newest first, one person's only, a page at a time", async () => {
    const owner = `fd-list-${randomUUID()}`;
    const ids: string[] = [];
    for (const agentId of ["iris", "penny", "iris"]) {
      const threadId = newThreadId();
      ids.push(threadId);
      await store.getOrCreateThread({ threadId, userId: owner, agentId });
    }
    const stranger = newThreadId();
    await store.getOrCreateThread({
      threadId: stranger,
      userId: `fd-list-${randomUUID()}`,
      agentId: "iris",
    });
    // The first thread touched last, so it is the newest.
    await database.execute(
      sql`update freeduet_threads set updated_at = now() + interval '1 minute' where thread_id = ${ids[0]}`,
    );

    const first = await store.listThreads({ userId: owner, limit: 2 });
    expect(first.threads.map((thread) => thread.threadId)).toEqual([
      ids[0],
      ids[2],
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await store.listThreads({
      userId: owner,
      limit: 2,
      cursor: first.nextCursor ?? "",
    });
    expect(second.threads.map((thread) => thread.threadId)).toEqual([ids[1]]);
    expect(second.nextCursor).toBeNull();

    const irisOnly = await store.listThreads({
      userId: owner,
      agentId: "iris",
    });
    expect(irisOnly.threads.map((thread) => thread.threadId)).toEqual([
      ids[0],
      ids[2],
    ]);
  });

  test("a cursor this list never returned is refused", async () => {
    await expect(
      store.listThreads({ userId: "ada", cursor: "not-a-cursor" }),
    ).rejects.toThrow("The cursor is not one this list returned.");
  });
});

describe("the thread lock", () => {
  const lock = (threadId: string, runId: string, ttlSeconds = 60) =>
    store.acquireLock({
      threadId,
      runId,
      userId: "ada",
      agentId: "iris",
      ttlSeconds,
    });

  test("one run at a time; the same run may take it again", async () => {
    const threadId = newThreadId();
    expect(await store.activeRunId(threadId)).toBeNull();
    expect(await lock(threadId, "run-a")).toBe(true);
    expect(await store.activeRunId(threadId)).toBe("run-a");
    expect(await lock(threadId, "run-b")).toBe(false);
    expect(await lock(threadId, "run-a")).toBe(true);
    expect(
      await store.renewLock({ threadId, runId: "run-b", ttlSeconds: 60 }),
    ).toBe(false);
    expect(
      await store.renewLock({ threadId, runId: "run-a", ttlSeconds: 60 }),
    ).toBe(true);

    // Releasing somebody else's lock changes nothing.
    await store.releaseLock({ threadId, runId: "run-b" });
    expect(await store.activeRunId(threadId)).toBe("run-a");
    await store.releaseLock({ threadId, runId: "run-a" });
    expect(await store.activeRunId(threadId)).toBeNull();
    expect(await lock(threadId, "run-b")).toBe(true);
    await store.releaseLock({ threadId, runId: "run-b" });
  });

  test("two runs asking at once: exactly one gets it", async () => {
    const threadId = newThreadId();
    const answers = await Promise.all(
      ["run-1", "run-2", "run-3", "run-4"].map((runId) =>
        lock(threadId, runId),
      ),
    );
    expect(answers.filter(Boolean)).toHaveLength(1);
    const holder = await store.activeRunId(threadId);
    await store.releaseLock({ threadId, runId: holder ?? "" });
  });

  test("an expired lock is taken over, and its old holder can no longer renew it", async () => {
    const threadId = newThreadId();
    expect(await lock(threadId, "run-old")).toBe(true);
    await database.execute(
      sql`update freeduet_thread_locks set expires_at = now() - interval '1 second' where thread_id = ${threadId}`,
    );
    expect(await store.activeRunId(threadId)).toBeNull();
    expect(
      await store.renewLock({ threadId, runId: "run-old", ttlSeconds: 60 }),
    ).toBe(false);
    expect(await lock(threadId, "run-new")).toBe(true);
    expect(await store.activeRunId(threadId)).toBe("run-new");
    await store.releaseLock({ threadId, runId: "run-new" });
  });
});
