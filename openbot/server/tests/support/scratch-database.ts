// server/tests/support/scratch-database.ts
//
// A database of this test file's own, migrated, and dropped afterwards.
//
// WHY NOT THE SHARED TEST DATABASE. The adoption command (freeduet/adopt) moves EVERYTHING that the
// single-user person owns, and the single-user person has one fixed id (`dev-local-user`). Run against
// the shared database it would also move whatever another file in this one-process suite happens to
// have left under that id, and the cleanup that file does afterwards would then find nothing. A
// database that only this file connects to makes "everything" mean what the test says.
//
// It is made on the same server as TEST_DATABASE_URL (same user, same password), so it needs the
// `CREATEDB` right the CI role (the container's POSTGRES_USER) and the local test cluster both have.
// A file killed between `create` and `drop` leaves a database named `su2si_scratch_<id>` behind; it is
// safe to drop by hand.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { applyMigrations } from "../../src/db/apply-migrations";
import { createDatabase } from "../../src/db/client";
import { applyFreeDuetThreadMigrations } from "../../src/freeduet/threads/migrate";
import { testDatabaseUrl } from "./database";

type Database = ReturnType<typeof createDatabase>;

export type ScratchDatabase = {
  /** The scratch database's own address. */
  url: string;
  /** A pool on it; the caller uses it for seeding and for looking. */
  database: Database;
  /** Closes the pool and drops the database. Safe to call twice. */
  drop: () => Promise<void>;
  /**
   * Waits until nothing at all is connected to this database, which is how a stopped server leaves
   * it. Closing a pool returns before the server has finished with the connections, and a test that
   * is about "nothing else is using the database" has to look after they are gone, not before.
   */
  idle: (timeoutMs?: number) => Promise<void>;
};

const MIGRATIONS = join(import.meta.dir, "..", "..", "drizzle");

function withDatabaseName(address: string, name: string): string {
  const url = new URL(address);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createScratchDatabase(
  options: { max?: number } = {},
): Promise<ScratchDatabase> {
  const name = `su2si_scratch_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = createDatabase(testDatabaseUrl(), { max: 1 });
  await admin.execute(sql.raw(`create database "${name}"`));

  const url = withDatabaseName(testDatabaseUrl(), name);
  const migrator = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(migrator, MIGRATIONS);
  } finally {
    await migrator.end({ timeout: 5 });
  }
  const database = createDatabase(url, { max: options.max ?? 4 });
  await applyFreeDuetThreadMigrations(database);

  let dropped = false;
  return {
    url,
    database,
    idle: async (timeoutMs = 10_000) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const [row] = (await admin.execute(
          sql`select count(*)::int as n from pg_stat_activity where datname = ${name}`,
        )) as unknown as { n: number }[];
        if ((row?.n ?? 0) === 0) return;
        if (Date.now() > deadline) {
          throw new Error(`Connections to ${name} did not close in time.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
    drop: async () => {
      if (dropped) return;
      dropped = true;
      // Already closed by a test that stopped "the server", which is allowed.
      await database.$client.close().catch(() => undefined);
      await admin.execute(
        sql.raw(`drop database if exists "${name}" with (force)`),
      );
      await admin.$client.close();
    },
  };
}
