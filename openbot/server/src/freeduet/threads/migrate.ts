/**
 * FreeDuet's thread tables, created and upgraded by FreeDuet itself (#42).
 *
 * NOT UPSTREAM'S MIGRATOR, AND NOT ITS JOURNAL. OpenBot's migrations are numbered 0000-0067 in
 * `server/drizzle` and recorded in `drizzle.__drizzle_migrations`. A FreeDuet migration placed there
 * would be renumbered by every upstream merge, and drizzle's migrator decides what to run from one
 * high-water stamp (see `src/db/migration-reach.ts`), so a renumbered migration can be walked past
 * and reported as applied. These migrations sit in `./migrations` with a journal of their own, and
 * each one is recorded BY NAME in `freeduet_thread_migrations`: a migration runs when its name is
 * not there, whatever any stamp says.
 *
 * THE SAME SAFETY AS `src/db/apply-migrations.ts`. Everything runs in one transaction that first
 * takes a transaction-scoped advisory lock, so two servers booting together queue rather than both
 * creating the same table, and a failure leaves nothing half applied. The lock is released with the
 * transaction, on commit, on rollback or when the connection dies.
 *
 * A migration is never edited once it shipped. Its hash is recorded with its name, and a file that
 * no longer matches what was applied is refused rather than silently ignored, because the database
 * would then hold a schema that no file in the checkout describes.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";

/** The folder and the bookkeeping table, named once. */
const MIGRATIONS_FOLDER = join(import.meta.dir, "migrations");
const MIGRATIONS_TABLE = "freeduet_thread_migrations";

/**
 * Its own advisory lock, not upstream's. Upstream's migrator and this one touch different tables,
 * so a boot that runs both has no reason to make one wait for the other.
 */
const MIGRATION_LOCK = "freeduet:thread-migrations";

/** drizzle-kit's breakpoint marker, so the files read like every other migration in the repo. */
const BREAKPOINT = "--> statement-breakpoint";

type JournalEntry = { idx: number; tag: string };

/** One migration from the folder, ready to run. */
export type FreeDuetMigration = {
  tag: string;
  /** sha256 of the whole file, hex. */
  hash: string;
  statements: string[];
};

/** Thrown instead of migrating when an applied migration's file has changed since. */
export class FreeDuetMigrationChangedError extends Error {
  override name = "FreeDuetMigrationChangedError";
}

/** The folder's migrations, in journal order. */
export async function readFreeDuetMigrations(
  folder: string = MIGRATIONS_FOLDER,
): Promise<FreeDuetMigration[]> {
  const journal = JSON.parse(
    await readFile(join(folder, "meta", "_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  return Promise.all(
    entries.map(async ({ tag }) => {
      const text = await readFile(join(folder, `${tag}.sql`), "utf8");
      return {
        tag,
        hash: createHash("sha256").update(text).digest("hex"),
        statements: text
          .split(BREAKPOINT)
          .map((statement) => statement.trim())
          .filter((statement) => statement.length > 0),
      };
    }),
  );
}

/**
 * Creates FreeDuet's thread tables, or brings them up to date. Safe to call on every boot, and from
 * two processes at once.
 */
export async function applyFreeDuetThreadMigrations(
  database: Database,
  folder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const migrations = await readFreeDuetMigrations(folder);

  await database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${MIGRATION_LOCK}, 0))`,
    );
    // Created inside the lock: two concurrent `create table if not exists` can still collide on
    // the table's type, which is the race the lock is there to remove.
    await tx.execute(
      sql.raw(`create table if not exists "${MIGRATIONS_TABLE}" (
        "tag" text primary key not null,
        "hash" text not null,
        "applied_at" timestamp with time zone default now() not null
      )`),
    );
    const rows = await tx.execute<{ tag: string; hash: string }>(
      sql.raw(`select "tag", "hash" from "${MIGRATIONS_TABLE}"`),
    );
    const applied = new Map([...rows].map((row) => [row.tag, row.hash]));

    for (const migration of migrations) {
      const recorded = applied.get(migration.tag);
      if (recorded !== undefined) {
        if (recorded !== migration.hash) {
          throw new FreeDuetMigrationChangedError(
            `FreeDuet migration ${migration.tag} was changed after it was applied to this database. Restore the file as it was and put the change in a new migration.`,
          );
        }
        continue;
      }
      for (const statement of migration.statements) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(
        sql`insert into ${sql.identifier(MIGRATIONS_TABLE)} ("tag", "hash") values (${migration.tag}, ${migration.hash})`,
      );
    }
  });
}
