import { join } from "node:path";
import postgres from "postgres";
import { applyMigrations } from "../../src/db/apply-migrations";
import { testDatabaseUrl } from "./database";

/**
 * A database made for one test file, migrated the way an installation's is, and dropped afterwards.
 *
 * For a test that must see EVERY row of a table: the shared test database also holds what the other
 * files put there while they run, so a count over a whole table, or a change to all of it, is only
 * about the rows a test wrote in a database nothing else writes to.
 *
 * It sits beside the shared test database, on the same server, and needs the same rights as
 * `migration-reach.integration.test.ts` has: to create a database and to connect to `postgres`.
 */
export async function throwawayDatabase(prefix: string): Promise<{
  /** The address of the new database, on the server `TEST_DATABASE_URL` names. */
  url: string;
  name: string;
  drop: () => Promise<void>;
}> {
  const server = new URL(testDatabaseUrl());
  const administrative = new URL(server.href);
  administrative.pathname = "/postgres";
  const name = `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

  const create = postgres(administrative.href, { max: 1, onnotice: () => {} });
  try {
    await create.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await create.end({ timeout: 5 });
  }
  const url = new URL(server.href);
  url.pathname = `/${name}`;

  const client = postgres(url.href, { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(client, join(import.meta.dir, "../../drizzle"));
  } finally {
    await client.end({ timeout: 5 });
  }

  return {
    url: url.href,
    name,
    drop: async () => {
      const admin = postgres(administrative.href, {
        max: 1,
        onnotice: () => {},
      });
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    },
  };
}
