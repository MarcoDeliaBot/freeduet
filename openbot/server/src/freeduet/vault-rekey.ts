import { createHmac, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../credentials";
import type { Database } from "../db/client";
import { credentials, savedLogins, ssoProviders } from "../db/schema";

/**
 * Sealing again what `KEY_ENCRYPTION_KEY` seals (docs/design/vault-rekey.md).
 *
 * `scripts/rekey-vault.ts` is the command a person runs; this is the part that touches the database,
 * kept here so the server's own `encryptSecret` and `decryptSecret` do all of the cryptography (there
 * is no second implementation to keep right) and so a test can run it against a real database.
 *
 * WHAT THE KEY SEALS AT REST, and so what has to be sealed again. Three tables, the ones
 * `vault_rows_query` in `scripts/secrets.sh` asks about before `start.sh` replaces the key; a test
 * holds the two lists to each other and to the schema:
 *
 *   credentials    `encrypted_value`      every connection, token and pasted secret the vault keeps
 *   saved_logins   `encrypted_password`   a person's saved site passwords
 *   sso_providers  `oidc_config`, `saml_config`   a company sign-in provider's secret and signing
 *                  material, sealed by `auth/encrypt-sso-config.ts`. A value there can be empty, or
 *                  plain text from before it was sealed. Neither is sealed with the key, so neither
 *                  is touched.
 *
 * WHAT IT ALSO SIGNS, which is not stored and so is not here: run assertions, hand-offs and OAuth
 * state are signed or sealed with keys derived from it and last minutes (`auth/signed-value.ts`). A
 * new key makes the ones in flight unreadable; nothing is lost with them. Read the design document for
 * each use, with its line.
 */

export const VAULT_TABLES = [
  "credentials",
  "saved_logins",
  "sso_providers",
] as const;
export type VaultTable = (typeof VAULT_TABLES)[number];

type Column =
  | "encrypted_value"
  | "encrypted_password"
  | "oidc_config"
  | "saml_config";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** What reading needs: a database, or a transaction, which has the same two methods. */
type Reader = Pick<Database, "select" | "execute">;

/**
 * The name this command's own connections carry, so that the check for other programs using the
 * database does not count the command itself.
 */
export const REKEY_APPLICATION_NAME = "freeduet-rekey-vault";

/** One value that may be sealed, and where it is stored. Never printed. */
type Cell = {
  table: VaultTable;
  id: string;
  column: Column;
  value: string | null;
};

/** A count of zero for each of the three tables. */
export function emptyCounts(): Record<VaultTable, number> {
  return { credentials: 0, saved_logins: 0, sso_providers: 0 };
}

/**
 * What `encryptSecret` writes, by its first characters: the test `auth/encrypt-sso-config.ts` applies
 * to decide that a value is sealed (`isEnvelope`, not exported there). A test runs the server's own
 * wrapper over the same values, so the two cannot disagree without it failing.
 */
export function isSealed(value: string | null): value is string {
  return typeof value === "string" && value.startsWith('{"version":1');
}

/**
 * The key `.env.example` used to ship: thirty-two zero bytes. Written as what it is rather than as the
 * literal, because `scripts/secrets.sh` is the one file the published values are written in; a test
 * asks that file's `secret_is_public_default` the same question and holds the two to one answer.
 */
export function isPublishedExampleKey(value: string): boolean {
  return value === Buffer.alloc(32).toString("base64");
}

/**
 * The server's own rule for a usable key (`keyEncryptionKey` in `config.ts`): base64 of exactly 32
 * bytes, written the way base64 is written.
 */
export function isValidKey(value: string): boolean {
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength === 32 && decoded.toString("base64") === value;
}

/**
 * A new key, the way `start.sh` makes one: 32 random bytes, base64 (`openssl rand -base64 32`).
 * Never the published example, which a random key equals with probability 2^-256 and which is checked
 * for anyway, because the one outcome that must be impossible is a "new" key that is public.
 */
export function newVaultKey(): string {
  for (;;) {
    const key = randomBytes(32).toString("base64");
    if (isValidKey(key) && !isPublishedExampleKey(key)) return key;
  }
}

/**
 * What stopped the work, in words that name no value. Only a table and a row id are ever attached,
 * because this is printed.
 */
export class VaultRekeyError extends Error {
  constructor(
    readonly code:
      | "same-key"
      | "closed"
      | "not-written"
      | "shape-changed"
      | "not-open-with-new-key"
      | "value-changed"
      | "not-rewritten",
    readonly table?: VaultTable,
    readonly id?: string,
  ) {
    super(
      `${REASONS[code]}${table ? ` (table ${table}${id ? `, row ${id}` : ""})` : ""}`,
    );
    this.name = "VaultRekeyError";
  }
}

const REASONS: Record<VaultRekeyError["code"], string> = {
  "same-key": "The new key is the current key.",
  closed: "A saved secret does not open with the current key.",
  "not-written": "A saved secret could not be written back.",
  "shape-changed": "The number of rows or saved secrets changed.",
  "not-open-with-new-key":
    "A saved secret does not open with the new key after it was sealed again.",
  "value-changed": "A saved secret is not the same after it was sealed again.",
  "not-rewritten": "A saved secret was not replaced.",
};

/** Which of the three tables exist: a database from before one existed counts it as empty. */
export async function presentTables(reader: Reader): Promise<VaultTable[]> {
  const found = await reader.execute(sql`
    select tablename as name from pg_tables
    where schemaname = 'public'
      and tablename in ('credentials', 'saved_logins', 'sso_providers')
  `);
  const names = new Set(found.map((row) => String(row.name)));
  return VAULT_TABLES.filter((table) => names.has(table));
}

async function readVault(reader: Reader): Promise<{
  cells: Cell[];
  rows: Record<VaultTable, number>;
  present: VaultTable[];
}> {
  const present = await presentTables(reader);
  const cells: Cell[] = [];
  const rows = emptyCounts();
  if (present.includes("credentials")) {
    const found = await reader
      .select({ id: credentials.id, value: credentials.encryptedValue })
      .from(credentials)
      .orderBy(credentials.id);
    rows.credentials = found.length;
    for (const row of found)
      cells.push({
        table: "credentials",
        id: row.id,
        column: "encrypted_value",
        value: row.value,
      });
  }
  if (present.includes("saved_logins")) {
    const found = await reader
      .select({ id: savedLogins.id, value: savedLogins.encryptedPassword })
      .from(savedLogins)
      .orderBy(savedLogins.id);
    rows.saved_logins = found.length;
    for (const row of found)
      cells.push({
        table: "saved_logins",
        id: row.id,
        column: "encrypted_password",
        value: row.value,
      });
  }
  if (present.includes("sso_providers")) {
    const found = await reader
      .select({
        id: ssoProviders.id,
        oidc: ssoProviders.oidcConfig,
        saml: ssoProviders.samlConfig,
      })
      .from(ssoProviders)
      .orderBy(ssoProviders.id);
    rows.sso_providers = found.length;
    for (const row of found) {
      cells.push({
        table: "sso_providers",
        id: row.id,
        column: "oidc_config",
        value: row.oidc,
      });
      cells.push({
        table: "sso_providers",
        id: row.id,
        column: "saml_config",
        value: row.saml,
      });
    }
  }
  return { cells, rows, present };
}

/**
 * Whether a cell is one the key is expected to open. In `credentials` and `saved_logins` every value is
 * sealed, so one that is not an envelope is a value the server cannot read either and is counted as
 * one that does not open. In `sso_providers` a value can be empty or plain text from before it was
 * sealed, and those are not the key's.
 */
function expectedSealed(cell: Cell): boolean {
  return cell.table === "sso_providers" ? isSealed(cell.value) : true;
}

async function opens(key: string, value: string | null): Promise<boolean> {
  if (value === null) return false;
  try {
    // The plaintext is dropped at once: only whether it opened is kept.
    await decryptSecret(key, value);
    return true;
  } catch {
    return false;
  }
}

export type Tally = {
  /** Rows in the table. */
  rows: number;
  /** Values the key is expected to open: one per row, two possible in `sso_providers`. */
  sealed: number;
  /** Of those, how many open with the key asked about. */
  open: number;
  /** Of those, how many do not. `open + unopened` is `sealed`. */
  unopened: number;
  /** The id of each row holding a value that does not open, once each, and never anything else. */
  closed: string[];
  /** `sso_providers` only: values that are plain text from before sealing, left as they are. */
  plain: number;
};
export type Inspection = Record<VaultTable, Tally>;

export function totals(inspection: Inspection) {
  const all = Object.values(inspection);
  const sum = (pick: (tally: Tally) => number) =>
    all.reduce((total, tally) => total + pick(tally), 0);
  return {
    rows: sum((tally) => tally.rows),
    sealed: sum((tally) => tally.sealed),
    open: sum((tally) => tally.open),
    unopened: sum((tally) => tally.unopened),
    plain: sum((tally) => tally.plain),
  };
}

/**
 * Opens every sealed value with `key` and counts. Changes nothing, and keeps none of what it opens.
 */
export async function inspectVault(
  reader: Reader,
  key: string,
): Promise<Inspection> {
  const { cells, rows } = await readVault(reader);
  const inspection = {} as Inspection;
  for (const table of VAULT_TABLES)
    inspection[table] = {
      rows: rows[table],
      sealed: 0,
      open: 0,
      unopened: 0,
      closed: [],
      plain: 0,
    };
  for (const cell of cells) {
    const tally = inspection[cell.table];
    if (!expectedSealed(cell)) {
      if (cell.value) tally.plain += 1;
      continue;
    }
    tally.sealed += 1;
    if (await opens(key, cell.value)) tally.open += 1;
    else {
      tally.unopened += 1;
      if (!tally.closed.includes(cell.id)) tally.closed.push(cell.id);
    }
  }
  return inspection;
}

/**
 * The programs other than this command that hold a connection to the database, by the name they gave
 * it, and how many each. A server or a worker that is running holds some (a pool, even when idle), so
 * this finds one that no port check can: one on another port, or one started by hand.
 */
export async function otherSessions(
  reader: Reader,
): Promise<{ count: number; names: string[] }> {
  const found = await reader.execute(sql`
    select coalesce(nullif(application_name, ''), '(unnamed)') as name, count(*)::int as n
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and backend_type = 'client backend'
      and application_name <> ${REKEY_APPLICATION_NAME}
    group by 1
    order by 1
  `);
  return {
    count: found.reduce((total, row) => total + Number(row.n), 0),
    names: found.map((row) => String(row.name)),
  };
}

/**
 * Whether this database user can see every connection to the database. PostgreSQL shows a user the
 * connections of its own role and no others, unless it is a superuser or may read all statistics
 * (`pg_read_all_stats`, which `pg_monitor` includes). Without that, `otherSessions` is blind to a program
 * that connects as another user, and the command says so rather than report an empty list as complete.
 * The server and the worker connect with the address in `.env`, which is the one this command uses, so
 * they are always seen.
 */
export async function seesEverySession(reader: Reader): Promise<boolean> {
  const found = await reader.execute(sql`
    select (rolsuper or pg_has_role(current_user, 'pg_read_all_stats', 'member')) as sees
    from pg_roles
    where rolname = current_user
  `);
  return (found as unknown as { sees: unknown }[])[0]?.sees === true;
}

/** The server's major version, to compare with the `pg_dump` that is about to be used. */
export async function serverMajorVersion(reader: Reader): Promise<number> {
  const found = await reader.execute(
    sql`select (current_setting('server_version_num')::int / 10000)::int as major`,
  );
  return Number(found[0]?.major);
}

async function writeCell(
  transaction: Transaction,
  cell: Cell,
  value: string,
): Promise<void> {
  // Only the sealed column is set: `updated_at` and everything else about the row stay as they were.
  const updated =
    cell.table === "credentials"
      ? await transaction
          .update(credentials)
          .set({ encryptedValue: value })
          .where(eq(credentials.id, cell.id))
          .returning({ id: credentials.id })
      : cell.table === "saved_logins"
        ? await transaction
            .update(savedLogins)
            .set({ encryptedPassword: value })
            .where(eq(savedLogins.id, cell.id))
            .returning({ id: savedLogins.id })
        : await transaction
            .update(ssoProviders)
            .set(
              cell.column === "oidc_config"
                ? { oidcConfig: value }
                : { samlConfig: value },
            )
            .where(eq(ssoProviders.id, cell.id))
            .returning({ id: ssoProviders.id });
  if (updated.length !== 1)
    throw new VaultRekeyError("not-written", cell.table, cell.id);
}

const at = (cell: Cell) => `${cell.table}/${cell.id}/${cell.column}`;

export type Resealed = {
  /** Sealed values replaced, per table. */
  values: Record<VaultTable, number>;
  /** Rows per table, which is what it was before and after. */
  rows: Record<VaultTable, number>;
};

/**
 * Opens every sealed value with `oldKey`, seals it with `newKey`, and checks the result, all inside the
 * transaction it is handed, which commits only if this returns. A throw rolls everything back.
 *
 * In order: the three tables are locked against other writers (a lock that cannot be had in ten seconds
 * is an error, not a wait); every value is opened and sealed again IN MEMORY, so a value that does not
 * open stops the work before the first write; every value is written; then the tables are read again
 * and each value must open with the new key to what it opened to with the old one (compared by a keyed
 * digest, so no plaintext is kept), must not be the value it was, and the rows and values must be the
 * same in number.
 */
export async function resealVault(
  transaction: Transaction,
  oldKey: string,
  newKey: string,
): Promise<Resealed> {
  if (oldKey === newKey) throw new VaultRekeyError("same-key");

  await transaction.execute(sql`set local lock_timeout = '10s'`);
  const present = await presentTables(transaction);
  if (present.length > 0)
    await transaction.execute(
      sql.raw(
        `lock table ${present.map((table) => `public.${table}`).join(", ")} in share row exclusive mode`,
      ),
    );

  const before = await readVault(transaction);
  const salt = randomBytes(32);
  const digest = (plaintext: string) =>
    createHmac("sha256", salt).update(plaintext).digest("hex");

  const sealedCells = before.cells.filter(
    (cell): cell is Cell & { value: string } =>
      expectedSealed(cell) && cell.value !== null,
  );
  // A value that is expected to be sealed and is not even there is the same as one that will not open.
  for (const cell of before.cells)
    if (expectedSealed(cell) && cell.value === null)
      throw new VaultRekeyError("closed", cell.table, cell.id);

  const digests = new Map<string, string>();
  const sealedAgain = new Map<string, string>();
  for (const cell of sealedCells) {
    let plaintext: string;
    try {
      plaintext = await decryptSecret(oldKey, cell.value);
    } catch {
      throw new VaultRekeyError("closed", cell.table, cell.id);
    }
    digests.set(at(cell), digest(plaintext));
    sealedAgain.set(at(cell), await encryptSecret(newKey, plaintext));
  }

  for (const cell of sealedCells) {
    const next = sealedAgain.get(at(cell));
    if (next === undefined)
      throw new VaultRekeyError("not-written", cell.table, cell.id);
    await writeCell(transaction, cell, next);
  }

  const after = await readVault(transaction);
  for (const table of VAULT_TABLES)
    if (after.rows[table] !== before.rows[table])
      throw new VaultRekeyError("shape-changed", table);
  const afterSealed = after.cells.filter(
    (cell): cell is Cell & { value: string } =>
      expectedSealed(cell) && cell.value !== null,
  );
  if (afterSealed.length !== sealedCells.length)
    throw new VaultRekeyError("shape-changed");

  const wasValue = new Map(sealedCells.map((cell) => [at(cell), cell.value]));
  const values = emptyCounts();
  for (const cell of afterSealed) {
    if (!wasValue.has(at(cell)))
      throw new VaultRekeyError("shape-changed", cell.table, cell.id);
    if (cell.value === wasValue.get(at(cell)))
      throw new VaultRekeyError("not-rewritten", cell.table, cell.id);
    let plaintext: string;
    try {
      plaintext = await decryptSecret(newKey, cell.value);
    } catch {
      throw new VaultRekeyError("not-open-with-new-key", cell.table, cell.id);
    }
    if (digest(plaintext) !== digests.get(at(cell)))
      throw new VaultRekeyError("value-changed", cell.table, cell.id);
    values[cell.table] += 1;
  }
  return { values, rows: before.rows };
}
