import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { credentials } from "../src/db/schema";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The question `scripts/start.sh` asks a database before it replaces the vault's key (docs/M1_PLAN.md
 * D39).
 *
 * `KEY_ENCRYPTION_KEY` used to default to a key this repository published, so an installation that has
 * been running on it holds saved logins and connections sealed with it. A new key would make every one
 * of them unreadable, which is the one thing a start must never do quietly, so start.sh replaces the
 * key only when this question says that nothing is sealed under it, and leaves it, with a warning,
 * when anything is or when the question could not be answered.
 *
 * The question is a shell function (`vault_rows_query` in `scripts/secrets.sh`) so that the script and
 * this test run the same text. It is SQL, so it is held against a real database: the empty case, a row
 * that makes it one, a table that is not there, and the schema itself, which gains a new place to seal
 * something without this question hearing about it unless a test says so.
 */

const databaseUrl = testDatabaseUrl();
const database = createDatabase(databaseUrl, TEST_POOL);

/** The text start.sh sends, read from the script that holds it and not copied here. */
async function vaultRowsQuery(): Promise<string> {
  const child = Bun.spawn(
    ["bash", "-c", ". scripts/secrets.sh && vault_rows_query"],
    {
      cwd: join(import.meta.dir, "..", ".."),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0 || stdout.trim() === "")
    throw new Error(`vault_rows_query printed nothing: ${stderr}`);
  return stdout;
}

const QUERY = await vaultRowsQuery();

/** What the question answers, as start.sh reads it: one number. */
async function vaultRows(
  executor: Pick<typeof database, "execute"> = database,
): Promise<number> {
  const rows = await executor.execute(sql.raw(QUERY));
  expect(rows).toHaveLength(1);
  return Number(Object.values(rows[0] ?? {})[0]);
}

/** The tables the question counts, read out of its text. */
function listedTables(): string[] {
  const array = QUERY.match(/array\[([^\]]*)\]/);
  return [...(array?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
    (match) => match[1] ?? "",
  );
}

const created: string[] = [];

/** A credential, as the vault stores one; `where` is the database, or a transaction to roll back. */
async function sealedRow(
  revoked: boolean,
  where: Pick<typeof database, "insert"> = database,
): Promise<void> {
  const [row] = await where
    .insert(credentials)
    .values({
      kind: "model",
      provider: `vault-rows-test-${randomUUID()}`,
      keyId: "vault-rows-test",
      metadata: {},
      encryptedValue: "sealed-by-a-test",
      revokedAt: revoked ? new Date() : null,
    })
    .returning({ id: credentials.id });
  if (!row) throw new Error("the credential was not stored");
  created.push(row.id);
}

afterAll(async () => {
  for (const id of created.splice(0))
    await database.delete(credentials).where(eq(credentials.id, id));
  await database.$client.close();
});

describe("how many rows hold something sealed with the vault key", () => {
  test("is one number, and counts a credential once it is stored", async () => {
    const before = await vaultRows();
    expect(Number.isInteger(before)).toBe(true);
    expect(before).toBeGreaterThanOrEqual(0);

    await sealedRow(false);

    expect(await vaultRows()).toBe(before + 1);
  });

  test("counts a revoked credential too, since the old key may be the only way to read it", async () => {
    const before = await vaultRows();

    await sealedRow(true);

    expect(await vaultRows()).toBe(before + 1);
  });

  test("reads a table that is not there as empty, so a database from before it existed can be asked", async () => {
    const rollback = new Error("rollback the renamed tables");
    let counted = { present: -1, withoutCredentials: -1, withoutAny: -1 };

    await expect(
      database.transaction(async (transaction) => {
        await sealedRow(false, transaction);
        const present = await vaultRows(transaction);
        // `credentials` is gone: what it held no longer counts, and nothing fails.
        await transaction.execute(
          sql`alter table credentials rename to credentials_renamed_by_test`,
        );
        const withoutCredentials = await vaultRows(transaction);
        await transaction.execute(
          sql`alter table saved_logins rename to saved_logins_renamed_by_test`,
        );
        await transaction.execute(
          sql`alter table sso_providers rename to sso_providers_renamed_by_test`,
        );
        const withoutAny = await vaultRows(transaction);
        counted = { present, withoutCredentials, withoutAny };
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    // The credential made inside the transaction is counted while its table is there, and a table that
    // is not there makes the answer smaller by what it held, down to nothing, and is never an error.
    expect(counted.present - counted.withoutCredentials).toBeGreaterThanOrEqual(
      1,
    );
    expect(counted.withoutAny).toBe(0);
    // The renames went back with the transaction, and so did the credential made inside it.
    const tables = await database.execute(
      sql`select count(*)::int as n from pg_tables where schemaname = 'public' and tablename in ('credentials', 'saved_logins', 'sso_providers')`,
    );
    expect(tables[0]?.n).toBe(3);
    const leftover = await database
      .select({ id: credentials.id })
      .from(credentials)
      .where(eq(credentials.id, created.at(-1) ?? ""));
    expect(leftover).toHaveLength(0);
  });
});

/*
 * The question names the tables that hold something the key sealed. The schema grows, and a new table
 * that seals something with the key would make the question answer "nothing" on a database that holds
 * a lot, which is the failure this exists to prevent. So the places the code seals into are pinned here,
 * from the schema, and the question is held to all of them.
 */
describe("the tables the question counts are the ones that hold something the key sealed", () => {
  test("every column named for what it seals is in a table the question lists", async () => {
    const sealed = await database.execute(sql`
      select table_name as "table", column_name as "column"
      from information_schema.columns
      where table_schema = 'public'
        and column_name ~ '(^|_)(encrypted|sealed|cipher|ciphertext)(_|$)'
      order by 1, 2
    `);
    const found = sealed.map((row) => `${row.table}.${row.column}`);

    // The two this code base seals into today, by the name it gives them.
    expect(found).toEqual(
      expect.arrayContaining([
        "credentials.encrypted_value",
        "saved_logins.encrypted_password",
      ]),
    );
    const listed = listedTables();
    const unlisted = sealed
      .map((row) => String(row.table))
      .filter((table) => !listed.includes(table));
    expect(unlisted).toEqual([]);
  });

  test("a company's sign-in provider, whose settings Better Auth stores as text the server seals, is listed too", async () => {
    // `auth/encrypt-sso-config.ts` seals `oidc_config` and `saml_config` with the key, and neither
    // column is named for it, so the check above cannot find them. They are pinned by name instead.
    const columns = await database.execute(sql`
      select column_name as "column" from information_schema.columns
      where table_schema = 'public' and table_name = 'sso_providers'
    `);
    const names = columns.map((row) => String(row.column));

    expect(names).toContain("oidc_config");
    expect(names).toContain("saml_config");
    expect(listedTables()).toContain("sso_providers");
  });

  test("lists exactly three tables, so adding or dropping one is an edit somebody reads", () => {
    expect(listedTables()).toEqual([
      "credentials",
      "saved_logins",
      "sso_providers",
    ]);
  });
});
