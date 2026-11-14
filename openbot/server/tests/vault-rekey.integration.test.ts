import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { encryptSsoConfig } from "../src/auth/encrypt-sso-config";
import { loadConfig } from "../src/config";
import { decryptSecret, encryptSecret } from "../src/credentials";
import { createDatabase, type Database } from "../src/db/client";
import {
  inspectVault,
  isPublishedExampleKey,
  isSealed,
  isValidKey,
  newVaultKey,
  otherSessions,
  REKEY_APPLICATION_NAME,
  resealVault,
  seesEverySession,
  totals,
  VAULT_TABLES,
  VaultRekeyError,
} from "../src/freeduet/vault-rekey";
import { TEST_POOL } from "./support/database";
import { throwawayDatabase } from "./support/throwaway-database";
import {
  CANARY,
  EXAMPLE_KEY,
  type Seeded,
  seedVault,
  snapshot,
} from "./support/vault-fixture";

/**
 * Sealing the vault again with a new key (docs/design/vault-rekey.md), against a real database.
 *
 * Everything here runs in a database made for this file, because the cases count and change every row
 * of three whole tables, and the shared test database holds what other files put there while they run.
 * On main none of it exists: `server/src/freeduet/vault-rekey.ts` is new, so this file fails to load.
 */

let throwaway: Awaited<ReturnType<typeof throwawayDatabase>>;
let database: Database;
let seeded: Seeded;
const NEW_KEY = newVaultKey();
const THIRD_KEY = newVaultKey();

/** The address with the name this command's own connections carry, so they are not counted as strangers. */
function namedAsTheCommand(url: string) {
  const named = new URL(url);
  named.searchParams.set("application_name", REKEY_APPLICATION_NAME);
  return named.href;
}

beforeAll(async () => {
  throwaway = await throwawayDatabase("vault_rekey");
  database = createDatabase(namedAsTheCommand(throwaway.url), TEST_POOL);
}, 120_000);

beforeEach(async () => {
  seeded = await seedVault(database);
});

afterAll(async () => {
  await database?.$client.close();
  await throwaway?.drop();
}, 30_000);

/** Which sealed value of every row opens with which key: what "re-sealed" has to mean. */
async function opensWith(key: string) {
  return totals(await inspectVault(database, key));
}

describe("the tables and columns the tool re-seals", () => {
  test("are the tables the question in scripts/secrets.sh asks about, and the columns are in them", async () => {
    const child = Bun.spawn(
      ["bash", "-c", ". scripts/secrets.sh && vault_rows_query"],
      { cwd: join(import.meta.dir, "..", ".."), stdout: "pipe" },
    );
    const text = await new Response(child.stdout).text();
    await child.exited;
    const array = text.match(/array\[([^\]]*)\]/);
    const asked = [...(array?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (match) => String(match[1]),
    );
    const tables: string[] = [...VAULT_TABLES];
    expect(tables).toEqual(asked);

    const columns = await database.execute(sql`
      select table_name || '.' || column_name as name from information_schema.columns
      where table_schema = 'public'
        and table_name in ('credentials', 'saved_logins', 'sso_providers')
    `);
    const names = columns.map((row) => String(row.name));
    for (const sealed of [
      "credentials.encrypted_value",
      "saved_logins.encrypted_password",
      "sso_providers.oidc_config",
      "sso_providers.saml_config",
    ])
      expect(names).toContain(sealed);
  });
});

describe("what counts as sealed", () => {
  test("is what the server's own wrapper writes, and not plain text or an empty column", async () => {
    let stored: Record<string, unknown> = {};
    const wrapped = encryptSsoConfig(
      () => ({
        create: async (data: Record<string, unknown>) => {
          stored = data.data as Record<string, unknown>;
          return data.data;
        },
        update: async () => undefined,
        findOne: async () => undefined,
        findMany: async () => [],
      }),
      EXAMPLE_KEY,
    )({});
    await wrapped.create({
      model: "ssoProvider",
      data: { oidcConfig: '{"clientSecret":"plain"}', samlConfig: "" },
    } as never);

    expect(isSealed(stored.oidcConfig as string)).toBe(true);
    // An empty column is not sealed, and the server leaves it empty.
    expect(isSealed(stored.samlConfig as string)).toBe(false);
    expect(isSealed('{"clientSecret":"plain"}')).toBe(false);
    expect(isSealed(null)).toBe(false);
    expect(isSealed(await encryptSecret(EXAMPLE_KEY, "x"))).toBe(true);
  });
});

describe("keys", () => {
  test("a new key is the shape the server requires, never the published one, and differs each time", () => {
    const keys = new Set<string>();
    for (let count = 0; count < 20; count += 1) {
      const key = newVaultKey();
      expect(isValidKey(key)).toBe(true);
      expect(isPublishedExampleKey(key)).toBe(false);
      keys.add(key);
    }
    expect(keys.size).toBe(20);
  });

  test("the rule for a usable key is the server's own", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    const environment = {
      DATABASE_URL: "postgres://openbot:openbot@localhost:5432/openbot",
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
      BETTER_AUTH_SECRET: "a-long-enough-local-development-auth-secret",
      BETTER_AUTH_URL: "http://localhost:3001",
      INITIAL_ADMIN_EMAILS: "admin@openbot.test",
      INTELLIGENCE_API_URL: "http://localhost:7100",
      INTELLIGENCE_GATEWAY_WS_URL: "ws://localhost:7103",
      INTELLIGENCE_API_KEY: "tenant-api-key",
      COPILOTKIT_LICENSE_TOKEN: "license-token",
      MANAGED_AGENT_AG_UI_URL: " http://localhost:4200/ag-ui ",
      MANAGED_AGENT_TOKEN: "managed-agent-token",
    };
    const candidates = [
      EXAMPLE_KEY,
      newVaultKey(),
      "",
      "local-development-key",
      // Thirty-one and thirty-three bytes.
      Buffer.alloc(31).toString("base64"),
      Buffer.alloc(33).toString("base64"),
      // Thirty-two bytes, written in a form base64 does not produce.
      EXAMPLE_KEY.replace(/=$/, ""),
      `${EXAMPLE_KEY.slice(0, -2)}B=`,
      ` ${newVaultKey()}`,
    ];
    try {
      for (const candidate of candidates) {
        let accepted = true;
        try {
          loadConfig({ ...environment, KEY_ENCRYPTION_KEY: candidate });
        } catch {
          accepted = false;
        }
        // The server trims what it reads before it checks it, so the rule is asked of the trimmed value.
        expect({ candidate, valid: isValidKey(candidate.trim()) }).toEqual({
          candidate,
          valid: accepted,
        });
      }
    } finally {
      warn.mockRestore();
    }
  });

  test("the published key is the one scripts/secrets.sh calls public, and only that one", async () => {
    const asked = async (value: string) => {
      const child = Bun.spawn(
        [
          "bash",
          "-c",
          '. scripts/secrets.sh && secret_is_public_default KEY_ENCRYPTION_KEY "$1"',
          "bash",
          value,
        ],
        { cwd: join(import.meta.dir, "..", ".."), stdout: "pipe" },
      );
      return (await child.exited) === 0;
    };
    for (const value of [EXAMPLE_KEY, newVaultKey(), "", `${EXAMPLE_KEY} `])
      expect(isPublishedExampleKey(value)).toBe(await asked(value));
  });
});

describe("looking at the vault", () => {
  test("opens every sealed value with the current key, counts, and changes nothing", async () => {
    const before = await snapshot(database);

    const inspection = await inspectVault(database, EXAMPLE_KEY);

    expect(inspection.credentials).toMatchObject({
      rows: 2,
      sealed: 2,
      open: 2,
      closed: [],
    });
    expect(inspection.saved_logins).toMatchObject({
      rows: 2,
      sealed: 2,
      open: 2,
      closed: [],
    });
    // Three providers: two sealed values in the first, none in the second (plain text, and an empty
    // column and a null one), one in the third.
    expect(inspection.sso_providers).toMatchObject({
      rows: 3,
      sealed: 3,
      open: 3,
      closed: [],
      plain: 1,
    });
    expect(await snapshot(database)).toBe(before);
  });

  test("with another key, names the rows that do not open by table and id, and nothing else", async () => {
    const inspection = await inspectVault(database, THIRD_KEY);

    expect(totals(inspection)).toMatchObject({ open: 0, unopened: 7 });
    expect(inspection.credentials.closed).toEqual(
      expect.arrayContaining(seeded.credentialIds),
    );
    expect(inspection.sso_providers.closed).toEqual(
      expect.arrayContaining(["fixture-sso-both", "fixture-sso-saml"]),
    );
    // Not a value anywhere in what it returns.
    const printed = JSON.stringify(inspection);
    for (const secret of Object.values(CANARY))
      expect(printed).not.toContain(secret);
    expect(printed).not.toContain(EXAMPLE_KEY);
  });

  test("a table that is not there counts as empty", async () => {
    const rollback = new Error("undo the rename");
    let seen: Awaited<ReturnType<typeof inspectVault>> | undefined;
    await expect(
      database.transaction(async (transaction) => {
        await transaction.execute(
          sql`alter table sso_providers rename to sso_providers_renamed_by_test`,
        );
        seen = await inspectVault(transaction, EXAMPLE_KEY);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(seen?.sso_providers).toMatchObject({ rows: 0, sealed: 0 });
    expect(seen?.credentials.rows).toBe(2);
  });
});

describe("sealing every value again", () => {
  test("every value opens with the new key to what it held, none opens with the old, and the rest of each row is as it was", async () => {
    const rowsOutsideTheKey = async () =>
      JSON.stringify(
        await database.execute(sql`
          select (select jsonb_agg(to_jsonb(c) - 'encrypted_value' order by c.id) from credentials c) as credentials,
                 (select jsonb_agg(to_jsonb(l) - 'encrypted_password' order by l.id) from saved_logins l) as saved_logins,
                 (select jsonb_agg(to_jsonb(s) - 'oidc_config' - 'saml_config' order by s.id) from sso_providers s) as sso_providers
        `),
      );
    const outsideBefore = await rowsOutsideTheKey();
    const plainBefore = await database.execute(
      sql`select oidc_config from sso_providers where id = 'fixture-sso-legacy'`,
    );

    const result = await database.transaction((transaction) =>
      resealVault(transaction, EXAMPLE_KEY, NEW_KEY),
    );

    expect(result.rows).toEqual({
      credentials: 2,
      saved_logins: 2,
      sso_providers: 3,
    });
    expect(result.values).toEqual({
      credentials: 2,
      saved_logins: 2,
      sso_providers: 3,
    });
    expect(await opensWith(NEW_KEY)).toMatchObject({
      rows: 7,
      sealed: 7,
      open: 7,
      unopened: 0,
      plain: 1,
    });
    expect(await opensWith(EXAMPLE_KEY)).toMatchObject({
      sealed: 7,
      open: 0,
      unopened: 7,
    });
    // Each one opens to exactly what it held.
    const found = await database.execute(sql`
      select id::text as id, encrypted_value as value from credentials
      union all select id, encrypted_password from saved_logins
    `);
    for (const row of found)
      expect(await decryptSecret(NEW_KEY, String(row.value))).toBe(
        seeded.plaintext[String(row.id)] ?? "missing",
      );
    const sso = await database.execute(
      sql`select id, oidc_config, saml_config from sso_providers`,
    );
    for (const row of sso) {
      for (const column of ["oidc_config", "saml_config"] as const) {
        const value = row[column] as string | null;
        if (!isSealed(value)) continue;
        expect(await decryptSecret(NEW_KEY, value)).toBe(
          seeded.plaintext[`${row.id}/${column}`] ?? "missing",
        );
      }
    }
    // The value that was plain text stays plain text, the empty column stays empty.
    const plainAfter = await database.execute(
      sql`select oidc_config from sso_providers where id = 'fixture-sso-legacy'`,
    );
    expect(plainAfter[0]?.oidc_config).toBe(plainBefore[0]?.oidc_config);
    const emptied = await database.execute(
      sql`select oidc_config from sso_providers where id = 'fixture-sso-saml'`,
    );
    expect(emptied[0]?.oidc_config).toBe("");
    // Nothing but the sealed columns changed: not `updated_at`, not the metadata, not who owns what.
    expect(await rowsOutsideTheKey()).toBe(outsideBefore);
  });

  test("a second run with the same old key has nothing it can open and changes nothing", async () => {
    await database.transaction((transaction) =>
      resealVault(transaction, EXAMPLE_KEY, NEW_KEY),
    );
    const after = await snapshot(database);

    const error = await database
      .transaction((transaction) =>
        resealVault(transaction, EXAMPLE_KEY, newVaultKey()),
      )
      .catch((thrown) => thrown);

    expect(error).toBeInstanceOf(VaultRekeyError);
    expect(error.code).toBe("closed");
    expect(await snapshot(database)).toBe(after);
  });

  test("the same key for both is refused before anything is touched", async () => {
    const before = await snapshot(database);
    const error = await database
      .transaction((transaction) =>
        resealVault(transaction, EXAMPLE_KEY, EXAMPLE_KEY),
      )
      .catch((thrown) => thrown);
    expect(error).toBeInstanceOf(VaultRekeyError);
    expect(error.code).toBe("same-key");
    expect(await snapshot(database)).toBe(before);
  });

  test("a value that does not open stops it before the first write, naming the table and the row and nothing else", async () => {
    // A trigger that counts every UPDATE on a SEQUENCE, which a rolled-back transaction does not undo,
    // so "nothing was written" is shown by the counter and not by the rollback.
    await database.execute(sql`create sequence if not exists writes_seen`);
    await database.execute(sql`
      create or replace function count_write() returns trigger language plpgsql as
      $$ begin perform nextval('writes_seen'); return new; end $$
    `);
    for (const table of ["credentials", "saved_logins", "sso_providers"])
      await database.execute(
        sql.raw(
          `create or replace trigger count_write before update on public.${table} for each row execute function count_write()`,
        ),
      );
    const counter = async () =>
      Number(
        (
          await database.execute(
            sql`select last_value::int as n from writes_seen`,
          )
        )[0]?.n,
      );

    // One credential sealed with a different key: the rest of the vault opens with the example key.
    const stranger = await encryptSecret(THIRD_KEY, "CANARY-stranger-secret");
    const victim = seeded.credentialIds[0] ?? "";
    await database.execute(
      sql`update credentials set encrypted_value = ${stranger} where id = ${victim}::uuid`,
    );
    await database.execute(sql`select setval('writes_seen', 1000)`);
    const before = await snapshot(database);

    const error = await database
      .transaction((transaction) =>
        resealVault(transaction, EXAMPLE_KEY, NEW_KEY),
      )
      .catch((thrown) => thrown);

    expect(error).toBeInstanceOf(VaultRekeyError);
    expect(error.code).toBe("closed");
    expect(error.table).toBe("credentials");
    expect(error.id).toBe(victim);
    expect(error.message).toContain("credentials");
    expect(error.message).toContain(victim);
    for (const secret of [
      EXAMPLE_KEY,
      NEW_KEY,
      THIRD_KEY,
      stranger,
      "CANARY-stranger-secret",
      ...Object.values(CANARY),
    ])
      expect(error.message).not.toContain(secret);
    expect(await counter()).toBe(1000);
    expect(await snapshot(database)).toBe(before);

    for (const table of ["credentials", "saved_logins", "sso_providers"])
      await database.execute(
        sql.raw(`drop trigger count_write on public.${table}`),
      );
    await database.execute(sql`drop function count_write()`);
    await database.execute(sql`drop sequence writes_seen`);
  });

  test("an interruption after the work and before the commit leaves every row as it was", async () => {
    const before = await snapshot(database);
    const interruption = new Error("interrupted");

    await expect(
      database.transaction(async (transaction) => {
        await resealVault(transaction, EXAMPLE_KEY, NEW_KEY);
        // Inside the transaction the new key already opens everything...
        expect(totals(await inspectVault(transaction, NEW_KEY)).open).toBe(7);
        throw interruption;
      }),
    ).rejects.toBe(interruption);

    // ...and after the rollback nothing opens with it, and every row is byte for byte what it was.
    expect(await snapshot(database)).toBe(before);
    expect(await opensWith(NEW_KEY)).toMatchObject({ open: 0 });
    expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 7 });
  });

  test("an interruption half way through the writes undoes the ones already made", async () => {
    const before = await snapshot(database);
    // The second saved login cannot be written: a rule of the table refuses it.
    await database.execute(sql`
      create or replace function refuse_second_login() returns trigger language plpgsql as
      $$ begin if new.id = 'fixture-login-two' then raise exception 'refused by the test'; end if; return new; end $$
    `);
    await database.execute(
      sql`create trigger refuse_second_login before update on saved_logins for each row execute function refuse_second_login()`,
    );

    const error = await database
      .transaction((transaction) =>
        resealVault(transaction, EXAMPLE_KEY, NEW_KEY),
      )
      .catch((thrown) => thrown);
    await database.execute(
      sql`drop trigger refuse_second_login on saved_logins`,
    );
    await database.execute(sql`drop function refuse_second_login()`);

    expect(error).toBeInstanceOf(Error);
    expect(await snapshot(database)).toBe(before);
    expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 7 });
  });

  test("while it runs, nothing else can write to the three tables", async () => {
    const outsider = postgres(throwaway.url, {
      max: 1,
      onnotice: () => {},
      connection: { application_name: "an-outside-writer" },
    });
    try {
      await database.transaction(async (transaction) => {
        await resealVault(transaction, EXAMPLE_KEY, NEW_KEY);
        const attempt = await outsider
          .begin(async (writer) => {
            await writer`set local lock_timeout = '300ms'`;
            await writer`update credentials set updated_at = updated_at where false`;
          })
          .then(
            () => "went through",
            (error: { code?: string }) => error.code,
          );
        // 55P03: the lock could not be had in time.
        expect(attempt).toBe("55P03");
      });
    } finally {
      await outsider.end({ timeout: 5 });
    }
    expect(await opensWith(NEW_KEY)).toMatchObject({ open: 7 });
  });

  test("a vault holding nothing sealed has nothing to change and still verifies", async () => {
    await database.execute(
      sql`truncate table credentials, saved_logins, sso_providers cascade`,
    );
    await database.execute(sql`
      insert into sso_providers (id, issuer, provider_id, domain, oidc_config, saml_config)
      values ('only-plain', 'https://plain.example.test', 'only-plain', 'plain.example.test', null, '')
    `);

    const result = await database.transaction((transaction) =>
      resealVault(transaction, EXAMPLE_KEY, NEW_KEY),
    );

    expect(result.values).toEqual({
      credentials: 0,
      saved_logins: 0,
      sso_providers: 0,
    });
    expect(result.rows.sso_providers).toBe(1);
  });
});

/**
 * Runs `run` with a row trigger on `table` whose body is `body` (plpgsql), and takes it away afterwards.
 * A trigger is the way to make the database do something other than what was asked of it, which is
 * what the check after the writes is there for.
 */
async function withTrigger<T>(
  table: string,
  when: "before" | "after",
  body: string,
  run: () => Promise<T>,
): Promise<T> {
  const name = `rekey_check_${table}`;
  await database.execute(
    sql.raw(
      `create or replace function ${name}() returns trigger language plpgsql as $fn$ begin ${body} end $fn$`,
    ),
  );
  await database.execute(
    sql.raw(
      `create trigger ${name} ${when} update on public.${table} for each row execute function ${name}()`,
    ),
  );
  try {
    return await run();
  } finally {
    await database.execute(
      sql.raw(`drop trigger if exists ${name} on public.${table}`),
    );
    await database.execute(sql.raw(`drop function if exists ${name}()`));
  }
}

describe("the check made inside the transaction, after the writes", () => {
  // Each case has the database do something other than what it was asked: a write that is skipped, a
  // value that comes back the same, sealed with another key, a different secret under the right key, or
  // a row that is gone. The check must see it, say which table (and which row) and nothing else, and the
  // transaction must end with every row as it was.
  const strangeKey = newVaultKey();
  const cases: {
    name: string;
    table: "credentials" | "saved_logins";
    when: "before" | "after";
    body: () => Promise<string>;
    code: VaultRekeyError["code"];
    rowKnown: boolean;
  }[] = [
    {
      name: "a write the database skips",
      table: "credentials",
      when: "before",
      body: async () => "return null;",
      code: "not-written",
      rowKnown: true,
    },
    {
      name: "a value that comes back as it was",
      table: "credentials",
      when: "before",
      body: async () =>
        "new.encrypted_value := old.encrypted_value; return new;",
      code: "not-rewritten",
      rowKnown: true,
    },
    {
      name: "a value sealed with some other key",
      table: "credentials",
      when: "before",
      body: async () =>
        `new.encrypted_value := $v$${await encryptSecret(strangeKey, "CANARY-other-key")}$v$; return new;`,
      code: "not-open-with-new-key",
      rowKnown: true,
    },
    {
      name: "a different secret under the right key",
      table: "saved_logins",
      when: "before",
      body: async () =>
        `new.encrypted_password := $v$${await encryptSecret(NEW_KEY, "CANARY-another-secret")}$v$; return new;`,
      code: "value-changed",
      rowKnown: true,
    },
    {
      name: "a row that is gone",
      table: "saved_logins",
      when: "after",
      body: async () =>
        "delete from public.saved_logins where id = new.id; return null;",
      code: "shape-changed",
      rowKnown: false,
    },
  ];

  for (const planted of cases)
    test(`${planted.name} stops it, names the table, and leaves every row as it was`, async () => {
      const before = await snapshot(database);
      const body = await planted.body();

      const error = await withTrigger(planted.table, planted.when, body, () =>
        database
          .transaction((transaction) =>
            resealVault(transaction, EXAMPLE_KEY, NEW_KEY),
          )
          .catch((thrown) => thrown),
      );

      expect(error).toBeInstanceOf(VaultRekeyError);
      expect(error.code).toBe(planted.code);
      expect(error.table).toBe(planted.table);
      expect(error.message).toContain(planted.table);
      if (planted.rowKnown) {
        const ids =
          planted.table === "credentials"
            ? seeded.credentialIds
            : seeded.loginIds;
        expect(ids).toContain(error.id);
        expect(error.message).toContain(error.id);
      }
      for (const secret of [
        EXAMPLE_KEY,
        NEW_KEY,
        strangeKey,
        "CANARY-other-key",
        "CANARY-another-secret",
        ...Object.values(CANARY),
      ])
        expect(error.message).not.toContain(secret);
      expect(await snapshot(database)).toBe(before);
      expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 7 });
      expect(await opensWith(NEW_KEY)).toMatchObject({ open: 0 });
    });
});

describe("who else is connected to the database", () => {
  test("a connection with another name is counted and named, the command's own is not", async () => {
    expect(await otherSessions(database)).toEqual({ count: 0, names: [] });

    const stranger = postgres(throwaway.url, {
      max: 1,
      onnotice: () => {},
      connection: { application_name: "freeduet-server" },
    });
    try {
      await stranger`select 1`;
      expect(await otherSessions(database)).toEqual({
        count: 1,
        names: ["freeduet-server"],
      });
    } finally {
      await stranger.end({ timeout: 5 });
    }
    expect(await otherSessions(database)).toEqual({ count: 0, names: [] });
  });

  test("a connection that gives no name is counted as unnamed", async () => {
    const stranger = postgres(throwaway.url, { max: 1, onnotice: () => {} });
    try {
      await stranger`select 1`;
      const seen = await otherSessions(database);
      expect(seen.count).toBe(1);
      expect(seen.names[0]).toMatch(/unnamed|postgres/);
    } finally {
      await stranger.end({ timeout: 5 });
    }
  });

  test("a database user that is not allowed to see other users' connections is told apart from one that is", async () => {
    // PostgreSQL shows a user only the connections of its own role, so for such a user an empty list
    // proves nothing. Checked here as the database shows it: a connection of another role is not in the list.
    const role = `rekey_viewer_${Math.random().toString(36).slice(2, 10)}`;
    const other = `rekey_other_${Math.random().toString(36).slice(2, 10)}`;
    await database.execute(sql.raw(`create role ${role} nologin`));
    await database.execute(sql.raw(`create role ${other} login`));
    const stranger = postgres(throwaway.url, {
      max: 1,
      onnotice: () => {},
      connection: { application_name: "a-server-of-another-user", role: other },
    });
    try {
      await stranger`select 1`;
      const asRole = (name: string) =>
        database.transaction(async (transaction) => {
          await transaction.execute(sql.raw(`set local role ${name}`));
          return {
            sees: await seesEverySession(transaction),
            others: await otherSessions(transaction),
          };
        });

      const plain = await asRole(role);
      expect(plain.sees).toBe(false);
      // The program is there, and this user's list does not show it. That is what the answer is for.
      expect(plain.others).toEqual({ count: 0, names: [] });

      await database.execute(sql.raw(`grant pg_read_all_stats to ${role}`));
      const monitor = await asRole(role);
      expect(monitor.sees).toBe(true);
      expect(monitor.others).toEqual({
        count: 1,
        names: ["a-server-of-another-user"],
      });
    } finally {
      await stranger.end({ timeout: 5 });
      await database.execute(sql.raw(`drop role if exists ${role}`));
      await database.execute(sql.raw(`drop role if exists ${other}`));
    }
  });
});
