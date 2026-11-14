import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { encryptSecret } from "../src/credentials";
import { createDatabase, type Database } from "../src/db/client";
import {
  inspectVault,
  isPublishedExampleKey,
  isValidKey,
  REKEY_APPLICATION_NAME,
  resealVault,
  serverMajorVersion,
  totals,
  VAULT_TABLES,
} from "../src/freeduet/vault-rekey";
import {
  type Address,
  type BackupRequest,
  EXIT,
  Interrupted,
  manualRecoveryCommand,
  type RekeyOptions,
  replaceSetting,
  runBackup,
  runRekey,
  settingFrom,
  type Stage,
} from "../src/freeduet/vault-rekey-command";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { throwawayDatabase } from "./support/throwaway-database";
import {
  CANARY,
  EXAMPLE_KEY,
  type Seeded,
  seedVault,
  snapshot,
} from "./support/vault-fixture";

/**
 * `bun scripts/rekey-vault.ts`, run for real against a real database (docs/design/vault-rekey.md).
 *
 * The command is run through `runRekey`, which is everything the script does but read the arguments and
 * the signals. Each case gets its own folder with its own `.env`, in a database made for this file.
 * `pg_dump` is a stand-in script for every case that is not about `pg_dump` itself, so these cases mean
 * the same on a machine whose `pg_dump` is older than its database (which CI's is) and on one whose
 * is not; the cases about the real program are at the end, and say so.
 *
 * On main none of this exists: the command and the library are new, so this file fails to load.
 */

let throwaway: Awaited<ReturnType<typeof throwawayDatabase>>;
let database: Database;
let seeded: Seeded;
let shimDirectory: string;
const created: string[] = [];

/** The command's own name, so the connection this test keeps open is not counted as somebody else's. */
function namedAsTheCommand(url: string) {
  const named = new URL(url);
  named.searchParams.set("application_name", REKEY_APPLICATION_NAME);
  return named.href;
}

beforeAll(async () => {
  throwaway = await throwawayDatabase("vault_rekey_cmd");
  database = createDatabase(namedAsTheCommand(throwaway.url), TEST_POOL);
  shimDirectory = await mkdtemp(join(tmpdir(), "rekey-shim-"));
  created.push(shimDirectory);
  await writeFile(
    join(shimDirectory, "pg_dump"),
    `#!/bin/sh
dir=$(dirname "$0")
if [ "$1" = "--version" ]; then cat "$dir/version.txt" 2>/dev/null || echo "pg_dump (PostgreSQL) 99.0"; exit 0; fi
printf '%s\\n' "$@" > "$dir/args.txt"
env | grep '^PGPASSWORD=' > "$dir/password.txt"
if [ -f "$dir/hold.txt" ]; then
  : > "$dir/holding.txt"
  n=0
  while [ ! -f "$dir/release.txt" ] && [ "$n" -lt 400 ]; do sleep 0.05; n=$((n+1)); done
fi
cat "$dir/dump.sql"
if [ -f "$dir/stderr.txt" ]; then cat "$dir/stderr.txt" >&2; fi
exit $(cat "$dir/exit.txt" 2>/dev/null || echo 0)
`,
    { mode: 0o755 },
  );
}, 120_000);

beforeEach(async () => {
  seeded = await seedVault(database);
  await rm(join(shimDirectory, "exit.txt"), { force: true });
  await rm(join(shimDirectory, "stderr.txt"), { force: true });
  await rm(join(shimDirectory, "version.txt"), { force: true });
  for (const name of ["hold.txt", "holding.txt", "release.txt"])
    await rm(join(shimDirectory, name), { force: true });
});

afterEach(async () => {
  for (const path of created.splice(0).filter((p) => p !== shimDirectory))
    await rm(path, { recursive: true, force: true });
});

afterAll(async () => {
  await database?.$client.close();
  await throwaway?.drop();
  await rm(shimDirectory, { recursive: true, force: true });
}, 30_000);

// ---------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------

type Ran = { code: number; out: string; err: string; text: string };

async function freePort(): Promise<number> {
  const probe = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(""),
  });
  const port = probe.port ?? 0;
  await probe.stop(true);
  return port;
}

/** A folder with a `.env` in it, as `start.sh` leaves one, holding the example key. */
async function installation(
  options: {
    key?: string;
    databaseUrl?: string;
    serverPort?: number;
    file?: string;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "rekey-root-"));
  created.push(root);
  const port = options.serverPort ?? (await freePort());
  const text = [
    "# written by a test",
    "OTHER_SETTING=keep this line exactly",
    `KEY_ENCRYPTION_KEY=${options.key ?? EXAMPLE_KEY}`,
    `DATABASE_URL=${options.databaseUrl ?? throwaway.url}`,
    `SERVER_PORT=${port}`,
    'QUOTED_SETTING="a quoted value"',
    "LAST_SETTING=1",
    "",
  ].join("\n");
  const envPath = join(root, options.file ?? ".env");
  await writeFile(envPath, text, { mode: 0o600 });
  return { root, port, envPath, text };
}

async function runIn(
  root: string,
  argv: string[],
  overrides: Partial<RekeyOptions> = {},
): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runRekey({
    argv,
    root,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      PG_DUMP: join(shimDirectory, "pg_dump"),
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ...overrides,
  });
  return {
    code,
    out: out.join("\n"),
    err: err.join("\n"),
    text: [...out, ...err].join("\n"),
  };
}

/** What `pg_dump --data-only` writes for the three tables, made by the test from what the database holds now. */
async function dumpOfNow(): Promise<string> {
  const lines = ["--", "-- PostgreSQL database dump", "--", ""];
  const columns: Record<string, string> = {
    credentials: "encrypted_value",
    saved_logins: "encrypted_password",
    sso_providers: "oidc_config",
  };
  for (const table of VAULT_TABLES) {
    const rows = await database.execute(
      sql.raw(
        `select id::text as id, coalesce(${columns[table]}, '\\N') as value from public.${table} order by id`,
      ),
    );
    lines.push(
      `COPY public.${table} (id, ${columns[table]}) FROM stdin;`,
      ...rows.map((row) => `${row.id}\t${row.value}`),
      "\\.",
      "",
    );
  }
  lines.push("--", "-- PostgreSQL database dump complete", "--", "");
  return lines.join("\n");
}

async function stageDump() {
  await writeFile(join(shimDirectory, "dump.sql"), await dumpOfNow());
}

async function sealedStrings(): Promise<string[]> {
  const rows = await database.execute(sql`
    select encrypted_value as v from credentials
    union all select encrypted_password from saved_logins
    union all select oidc_config from sso_providers where oidc_config like '{"version":1%'
    union all select saml_config from sso_providers where saml_config like '{"version":1%'
  `);
  return rows.map((row) => String(row.v));
}

async function opensWith(key: string) {
  return totals(await inspectVault(database, key));
}

/** Nothing a person would not want shown: no key, no stored envelope, no decrypted value. */
function expectNothingSecret(text: string, secrets: string[]) {
  for (const secret of [
    ...Object.values(CANARY),
    EXAMPLE_KEY,
    ...secrets,
  ].filter(Boolean))
    expect(text).not.toContain(secret);
  expect(text).not.toContain('{"version":1');
}

async function filesIn(root: string) {
  return (await readdir(root)).sort();
}

const mode = async (path: string) => (await stat(path)).mode & 0o777;

// ---------------------------------------------------------------------------------------------------
// Who may run it, and when
// ---------------------------------------------------------------------------------------------------

describe("before it does anything", () => {
  test("without --yes it says in words what it would do, and does nothing", async () => {
    const { root, envPath, text } = await installation();
    const before = await snapshot(database);

    const dry = await runIn(root, []);
    const apply = await runIn(root, ["--apply"]);

    expect(dry.code).toBe(EXIT.refused);
    expect(dry.text).toContain("Check the saved secrets (nothing is changed)");
    expect(dry.text).toContain("Add --yes to go ahead. Nothing was changed.");
    expect(apply.code).toBe(EXIT.refused);
    expect(apply.text).toContain("Seal the saved secrets again with a new key");
    expect(apply.text).toContain("Only then write the new key into .env.");
    expect(apply.text).toContain("Add --yes to go ahead. Nothing was changed.");
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("says that the key the Bots sign web requests with follows this key, and only when it does", async () => {
    const said = "WEB_BOT_AUTH is on and has no WEB_BOT_AUTH_KEY";
    const asked = async (extra: string, env: Record<string, string> = {}) => {
      const { root, envPath, text } = await installation();
      await writeFile(envPath, `${text}${extra}`, { mode: 0o600 });
      return runIn(root, [], {
        env: { PATH: process.env.PATH, HOME: root, ...env },
      });
    };

    expect((await asked("WEB_BOT_AUTH=on\n")).text).toContain(said);
    // Read the way the server reads it: any case, the environment ahead of the file.
    expect((await asked("WEB_BOT_AUTH=ON\n")).text).toContain(said);
    expect((await asked("", { WEB_BOT_AUTH: "on" })).text).toContain(said);
    expect(
      (await asked("WEB_BOT_AUTH=on\n", { WEB_BOT_AUTH: "off" })).text,
    ).not.toContain("WEB_BOT_AUTH");
    // Nothing to say when it is off, absent, or has a key of its own.
    expect((await asked("")).text).not.toContain("WEB_BOT_AUTH");
    expect((await asked("WEB_BOT_AUTH=off\n")).text).not.toContain(
      "WEB_BOT_AUTH",
    );
    expect(
      (await asked('WEB_BOT_AUTH=on\nWEB_BOT_AUTH_KEY={"kty":"OKP"}\n')).text,
    ).not.toContain("WEB_BOT_AUTH");
  });

  test("an option it does not know is refused without echoing what follows an =", async () => {
    const { root } = await installation();
    const ran = await runIn(root, [
      "--key=CANARY-pasted-by-mistake-0123456789",
    ]);
    expect(ran.code).toBe(EXIT.refused);
    expect(ran.text).toContain("Unknown option: --key");
    expect(ran.text).not.toContain("CANARY-pasted");
    const help = await runIn(root, ["--help"]);
    expect(help.code).toBe(EXIT.ok);
    expect(help.text).toContain("--apply --yes");
  });

  test("a folder with no .env is refused, and so is a settings file name that is not one", async () => {
    const empty = await mkdtemp(join(tmpdir(), "rekey-empty-"));
    created.push(empty);
    const missing = await runIn(empty, ["--yes"]);
    expect(missing.code).toBe(EXIT.refused);
    expect(missing.text).toContain(".env was not found");

    const { root } = await installation();
    const odd = await runIn(root, ["--yes"], {
      env: { PATH: process.env.PATH, OPENBOT_ENV_FILE: "../.env" },
    });
    expect(odd.code).toBe(EXIT.refused);
    expect(odd.text).toContain("OPENBOT_ENV_FILE must name a file");
  });

  test("a folder that belongs to the desktop app, which keeps its key elsewhere, is refused", async () => {
    const { root } = await installation();
    await mkdir(join(root, ".secrets"));
    await writeFile(join(root, ".secrets", "KEY_ENCRYPTION_KEY.secret"), "x");
    const before = await snapshot(database);

    const ran = await runIn(root, ["--apply", "--yes"]);

    expect(ran.code).toBe(EXIT.refused);
    expect(ran.text).toContain("desktop app");
    expect(await snapshot(database)).toBe(before);
  });

  test("a key that is not the example is nothing to do, and says so, with or without --yes", async () => {
    const own = EXAMPLE_KEY.replace(/A/g, "B");
    const { root, envPath, text } = await installation({ key: own });
    const before = await snapshot(database);

    for (const argv of [[], ["--yes"], ["--apply", "--yes"]]) {
      const ran = await runIn(root, argv);
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.text).toContain("is not the example key");
      expect(ran.text).toContain("Nothing was changed.");
      expectNothingSecret(ran.text, [own]);
    }
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
  });

  test("a key set in the environment that differs from the file is the person's own, and is left alone", async () => {
    const { root } = await installation();
    const own = Buffer.alloc(32, 7).toString("base64");

    const ran = await runIn(root, ["--apply", "--yes"], {
      env: { PATH: process.env.PATH, KEY_ENCRYPTION_KEY: own },
    });

    expect(ran.code).toBe(EXIT.ok);
    expect(ran.text).toContain("set in your environment");
    expectNothingSecret(ran.text, [own]);
    expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 7 });
  });

  test("the same example key set in the environment is refused: it would be read ahead of the new key in .env", async () => {
    const { root, envPath, text } = await installation();
    const before = await snapshot(database);

    for (const argv of [["--yes"], ["--apply", "--yes"]]) {
      const ran = await runIn(root, argv, {
        env: {
          PATH: process.env.PATH,
          PG_DUMP: join(shimDirectory, "pg_dump"),
          KEY_ENCRYPTION_KEY: EXAMPLE_KEY,
        },
      });

      expect(ran.code).toBe(EXIT.refused);
      expect(ran.text).toContain("is also set in your environment");
      expect(ran.text).toContain("unset KEY_ENCRYPTION_KEY");
      expect(ran.text).toContain("Nothing was changed.");
      expectNothingSecret(ran.text, []);
    }
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("a settings file with no key line is nothing to do", async () => {
    const { root, envPath } = await installation();
    await writeFile(envPath, "OTHER=1\n");
    const ran = await runIn(root, ["--apply", "--yes"]);
    expect(ran.code).toBe(EXIT.ok);
    expect(ran.text).toContain("has no KEY_ENCRYPTION_KEY line");
  });

  test("a server that answers as FreeDuet's is refused, for the check and for the change", async () => {
    const fake = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) =>
        new URL(request.url).pathname === "/api/capabilities"
          ? Response.json({ durableHistory: true })
          : new Response("not found", { status: 404 }),
    });
    try {
      const { root, envPath, text } = await installation({
        serverPort: fake.port ?? 0,
      });
      const before = await snapshot(database);

      for (const argv of [["--yes"], ["--apply", "--yes"]]) {
        const ran = await runIn(root, argv);
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.text).toContain(`FreeDuet is running`);
        expect(ran.text).toContain(`port ${fake.port}`);
        expect(ran.text).toContain("Nothing was changed.");
      }
      expect(await snapshot(database)).toBe(before);
      expect(await readFile(envPath, "utf8")).toBe(text);
      expect(await filesIn(root)).toEqual([".env"]);
    } finally {
      await fake.stop(true);
    }
  });

  test("something else on that port, which is not FreeDuet's server, does not stop it", async () => {
    const other = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      // Any single-page app answers 200 to every path, which is why the check looks inside the answer.
      fetch: () => new Response("<html>an unrelated dashboard</html>"),
    });
    try {
      const { root } = await installation({ serverPort: other.port ?? 0 });
      const ran = await runIn(root, ["--yes"]);
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.text).toContain("FreeDuet is stopped");
    } finally {
      await other.stop(true);
    }
  });

  test("another program connected to the database is refused, and named", async () => {
    const { root, envPath, text } = await installation();
    const stranger = postgres(throwaway.url, {
      max: 1,
      onnotice: () => {},
      connection: { application_name: "freeduet-server" },
    });
    try {
      await stranger`select 1`;
      const before = await snapshot(database);

      for (const argv of [["--yes"], ["--apply", "--yes"]]) {
        const ran = await runIn(root, argv);
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.text).toContain("Something else is connected");
        expect(ran.text).toContain("freeduet-server");
        expect(ran.text).toContain("Nothing was changed.");
      }
      expect(await snapshot(database)).toBe(before);
      expect(await readFile(envPath, "utf8")).toBe(text);
      expect(await filesIn(root)).toEqual([".env"]);
    } finally {
      await stranger.end({ timeout: 5 });
    }
  });

  test("a DATABASE_URL in the environment that is not the file's is refused: it will not guess", async () => {
    const { root } = await installation();
    const ran = await runIn(root, ["--yes"], {
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: "postgres://someone@127.0.0.1:1/another",
      },
    });
    expect(ran.code).toBe(EXIT.refused);
    expect(ran.text).toContain("different database");
  });

  test("a database that cannot be reached is said so, without its password", async () => {
    const password = "CANARY-db-password-0123456789ab";
    const { root } = await installation({
      databaseUrl: `postgres://someone:${password}@127.0.0.1:1/nothing`,
    });
    const ran = await runIn(root, ["--apply", "--yes"]);
    expect(ran.code).toBe(EXIT.failed);
    expect(ran.text).toContain(
      "Could not reach the database at 127.0.0.1:1/nothing",
    );
    expect(ran.text).toContain("Nothing was changed.");
    expect(ran.text).not.toContain(password);
  });
});

// ---------------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------------

describe("the check (no --apply)", () => {
  test("reports counts, changes nothing, writes no file and prints no secret", async () => {
    const { root, envPath, text } = await installation();
    const before = await snapshot(database);
    const sealed = await sealedStrings();

    const ran = await runIn(root, ["--yes"]);

    expect(ran.code).toBe(EXIT.ok);
    // The counts, per table: rows, sealed values, how many open, how many do not.
    expect(ran.out).toMatch(/credentials\s+2\s+2\s+2\s+0/);
    expect(ran.out).toMatch(/saved_logins\s+2\s+2\s+2\s+0/);
    expect(ran.out).toMatch(/sso_providers\s+3\s+3\s+3\s+0/);
    expect(ran.out).toContain("All 7 saved secrets open with the current key.");
    expect(ran.out).toContain("1 value is stored as plain text");
    expect(ran.out).toContain("bun scripts/rekey-vault.ts --apply --yes");
    expectNothingSecret(ran.text, sealed);
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("a value that does not open stops it, naming the table and the row and nothing else", async () => {
    const stranger = Buffer.alloc(32, 9).toString("base64");
    const foreign = await encryptSecret(stranger, "CANARY-foreign-secret-0123");
    const victim = seeded.loginIds[1] ?? "";
    await database.execute(
      sql`update saved_logins set encrypted_password = ${foreign} where id = ${victim}`,
    );
    const { root, envPath, text } = await installation();
    const before = await snapshot(database);

    for (const argv of [["--yes"], ["--apply", "--yes"]]) {
      const ran = await runIn(root, argv);
      expect(ran.code).toBe(EXIT.failed);
      expect(ran.err).toContain("Stopped: 1 saved secret does not open");
      expect(ran.err).toContain(`saved_logins: row ${victim}`);
      expect(ran.err).toContain("nothing was changed");
      expectNothingSecret(ran.text, [stranger, foreign, "CANARY-foreign"]);
    }
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    // Not even a backup: it stopped before the backup.
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("says that nothing else is connected, and, for a database user that cannot see other users' connections, that it could only look at its own", async () => {
    const { root } = await installation();
    const usual = await runIn(root, ["--yes"]);
    expect(usual.code).toBe(EXIT.ok);
    expect(usual.text).toContain("Nothing else is connected to the database.");
    expect(usual.text).not.toContain("cannot see connections made by other");

    const role = `rekey_viewer_${Math.random().toString(36).slice(2, 10)}`;
    await database.execute(sql.raw(`create role ${role} nologin`));
    await database.execute(sql.raw(`grant usage on schema public to ${role}`));
    await database.execute(
      sql.raw(
        `grant select on credentials, saved_logins, sso_providers to ${role}`,
      ),
    );
    try {
      const limited = await runIn(root, ["--yes"], {
        connect: (url) => {
          const asRole = new URL(url);
          asRole.searchParams.set("role", role);
          return createDatabase(asRole.href, { max: 2 });
        },
      });
      expect(limited.code).toBe(EXIT.ok);
      expect(limited.text).toContain(
        "Nothing else is connected under this database user. It cannot see connections made by other users, so make sure nothing else uses the database.",
      );
      expect(limited.text).not.toContain(
        "Nothing else is connected to the database.",
      );
      expect(limited.text).toContain(
        "All 7 saved secrets open with the current key.",
      );
    } finally {
      await database.execute(sql.raw(`drop owned by ${role}`));
      await database.execute(sql.raw(`drop role if exists ${role}`));
    }
  });

  test("an empty vault has nothing to seal again, and start.sh replaces the key by itself", async () => {
    await database.execute(
      sql`truncate table credentials, saved_logins, sso_providers cascade`,
    );
    const { root, envPath, text } = await installation();

    for (const argv of [["--yes"], ["--apply", "--yes"]]) {
      const ran = await runIn(root, argv);
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.text).toContain("start.sh replaces the example key by itself");
    }
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });
});

// ---------------------------------------------------------------------------------------------------
// Changing the key
// ---------------------------------------------------------------------------------------------------

describe("--apply", () => {
  test("seals every value again, writes the new key into .env, and leaves a backup only the owner can read", async () => {
    const { root, envPath, text } = await installation();
    await stageDump();
    const sealedBefore = await sealedStrings();

    const ran = await runIn(root, ["--apply", "--yes"]);

    expect(ran.code).toBe(EXIT.ok);
    const after = await readFile(envPath, "utf8");
    const newKey = settingFrom(after, "KEY_ENCRYPTION_KEY");
    expect(isValidKey(newKey)).toBe(true);
    expect(isPublishedExampleKey(newKey)).toBe(false);
    // Every other line is as it was and in its place; the key line is the one that moved, to the end.
    expect(after).toBe(replaceSetting(text, "KEY_ENCRYPTION_KEY", newKey));
    expect(await mode(envPath)).toBe(0o600);
    // The database: every value opens with the new key, none with the old one.
    expect(await opensWith(newKey)).toMatchObject({
      rows: 7,
      sealed: 7,
      open: 7,
      unopened: 0,
    });
    expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 0 });
    // Beside it: one backup, readable by its owner alone, and no key file left over.
    const names = await filesIn(root);
    const backups = names.filter((name) =>
      name.startsWith(".env.vault-backup-"),
    );
    expect(backups).toHaveLength(1);
    expect(await mode(join(root, backups[0] ?? ""))).toBe(0o600);
    expect(names.some((name) => name.startsWith(".env.vault-new-key-"))).toBe(
      false,
    );
    expect(
      names.filter((name) => !name.startsWith(".env.vault-backup-")),
    ).toEqual([".env"]);
    // What it said, which includes where the backup is and that it is as good as the old key.
    expect(ran.out).toContain(join(root, backups[0] ?? ""));
    expect(ran.out).toContain("Done. The new key is in .env.");
    expect(ran.out).toContain(
      "all 7 open with the new key, and none opens with the old one",
    );
    expect(ran.out).toContain(
      "anyone who gets that file can read your saved secrets",
    );
    expectNothingSecret(ran.text, [
      newKey,
      ...sealedBefore,
      ...(await sealedStrings()),
    ]);
  });

  test("a second run has nothing to do, says so, and changes nothing", async () => {
    const { root, envPath } = await installation();
    await stageDump();
    expect((await runIn(root, ["--apply", "--yes"])).code).toBe(EXIT.ok);
    const env = await readFile(envPath, "utf8");
    const state = await snapshot(database);
    const files = await filesIn(root);

    const again = await runIn(root, ["--apply", "--yes"]);

    expect(again.code).toBe(EXIT.ok);
    expect(again.text).toContain("is not the example key");
    expect(again.text).toContain("Nothing was changed.");
    expect(await readFile(envPath, "utf8")).toBe(env);
    expect(await snapshot(database)).toBe(state);
    expect(await filesIn(root)).toEqual(files);
  });

  test("a vault with rows and nothing sealed in them still gets its key changed", async () => {
    await database.execute(
      sql`truncate table credentials, saved_logins, sso_providers cascade`,
    );
    await database.execute(sql`
      insert into sso_providers (id, issuer, provider_id, domain, oidc_config, saml_config)
      values ('only-plain', 'https://plain.example.test', 'only-plain', 'plain.example.test', null, '')
    `);
    const { root, envPath } = await installation();
    await stageDump();

    const ran = await runIn(root, ["--apply", "--yes"]);

    expect(ran.code).toBe(EXIT.ok);
    expect(ran.out).toContain(
      "Nothing was sealed with the old key, so only the key changed.",
    );
    expect(
      isPublishedExampleKey(
        settingFrom(await readFile(envPath, "utf8"), "KEY_ENCRYPTION_KEY"),
      ),
    ).toBe(false);
  });

  test("a stack named by OPENBOT_ENV_FILE keeps its own files, and never reads another stack's", async () => {
    const { root } = await installation({ file: ".env.eval" });
    // The main stack's earlier run left a key beside the main settings file. It is not this stack's.
    const mainsKey = "0".repeat(10);
    await writeFile(
      join(root, ".env.vault-new-key-20260101T000000Z-abcd"),
      mainsKey,
      {
        mode: 0o600,
      },
    );
    await stageDump();

    const ran = await runIn(root, ["--apply", "--yes"], {
      env: {
        PATH: process.env.PATH,
        HOME: root,
        PG_DUMP: join(shimDirectory, "pg_dump"),
        OPENBOT_ENV_FILE: ".env.eval",
      },
    });

    expect(ran.code).toBe(EXIT.ok);
    const names = await filesIn(root);
    expect(names).toContain(".env.vault-new-key-20260101T000000Z-abcd");
    expect(
      names.some((name) => name.startsWith(".env.eval.vault-backup-")),
    ).toBe(true);
    expect(
      await readFile(
        join(root, ".env.vault-new-key-20260101T000000Z-abcd"),
        "utf8",
      ),
    ).toBe(mainsKey);
    expect(ran.text).not.toContain("earlier run");
  });
});

describe("--apply, when it cannot finish", () => {
  test("without a pg_dump it stops before changing anything, and leaves nothing behind", async () => {
    const { root, envPath, text } = await installation();
    const before = await snapshot(database);

    const ran = await runIn(root, ["--apply", "--yes"], {
      env: {
        PATH: process.env.PATH,
        HOME: root,
        PG_DUMP: join(tmpdir(), "there-is-no-pg_dump-here"),
      },
    });

    expect(ran.code).toBe(EXIT.failed);
    expect(ran.err).toContain("Stopped: The backup could not be made.");
    expect(ran.err).toContain("pg_dump was not found");
    expect(ran.err).toContain("Nothing was changed.");
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("a pg_dump that fails stops it the same way, and its half-written file is removed", async () => {
    const { root, envPath, text } = await installation();
    await stageDump();
    await writeFile(join(shimDirectory, "exit.txt"), "1");
    await writeFile(
      join(shimDirectory, "stderr.txt"),
      "pg_dump: error: the disk is full\n",
    );
    const before = await snapshot(database);

    const ran = await runIn(root, ["--apply", "--yes"]);

    expect(ran.code).toBe(EXIT.failed);
    expect(ran.err).toContain("the disk is full");
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("a backup that does not hold the rows the database holds stops it", async () => {
    const { root } = await installation();
    await stageDump();
    // One row missing from the dump the stand-in prints.
    const dump = (
      await readFile(join(shimDirectory, "dump.sql"), "utf8")
    ).replace(/(COPY public\.saved_logins .*\n)[^\n]*\n/, "$1");
    await writeFile(join(shimDirectory, "dump.sql"), dump);
    const before = await snapshot(database);

    const ran = await runIn(root, ["--apply", "--yes"]);

    expect(ran.code).toBe(EXIT.failed);
    expect(ran.err).toContain("does not hold the same number of rows");
    expect(await snapshot(database)).toBe(before);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  for (const stage of [
    "inspected",
    "backed-up",
    "key-saved",
    "resealed",
  ] as Stage[]) {
    test(`interrupted at "${stage}": the database and .env are as they were and nothing is left beside them`, async () => {
      const { root, envPath, text } = await installation();
      await stageDump();
      const before = await snapshot(database);
      const reached: Stage[] = [];

      const ran = await runIn(root, ["--apply", "--yes"], {
        checkpoint: (reachedStage) => {
          reached.push(reachedStage);
          if (reachedStage === stage) throw new Interrupted();
        },
      });

      expect(reached.at(-1)).toBe(stage);
      expect(ran.code).toBe(EXIT.interrupted);
      expect(ran.out).toContain("Interrupted. Nothing was changed.");
      expect(await snapshot(database)).toBe(before);
      expect(await readFile(envPath, "utf8")).toBe(text);
      expect(await filesIn(root)).toEqual([".env"]);
      expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 7 });
    });
  }

  test("something that connects after the first look and before the commit undoes everything", async () => {
    const { root, envPath, text } = await installation();
    await stageDump();
    const before = await snapshot(database);
    let latecomer: ReturnType<typeof postgres> | undefined;

    const ran = await runIn(root, ["--apply", "--yes"], {
      checkpoint: async (stage) => {
        if (stage !== "key-saved") return;
        latecomer = postgres(throwaway.url, {
          max: 1,
          onnotice: () => {},
          connection: { application_name: "a-server-that-just-started" },
        });
        await latecomer`select 1`;
      },
    });
    await latecomer?.end({ timeout: 5 });

    expect(ran.code).toBe(EXIT.failed);
    expect(ran.err).toContain(
      "Something connected to the database while this was running",
    );
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("a real Ctrl-C while the backup is being made stops it at the next safe point, with the database and the settings as they were", async () => {
    // The script itself, as a person runs it, in the folder it belongs to: its own settings file there,
    // named for this test and ignored by git like every `.env.*`, and removed at the end.
    const openbot = join(import.meta.dir, "..", "..");
    const name = `.env.rekey-signal-${Math.random().toString(36).slice(2, 10)}`;
    const envPath = join(openbot, name);
    const { text } = await installation();
    await writeFile(envPath, text, { mode: 0o600 });
    await stageDump();
    await writeFile(join(shimDirectory, "hold.txt"), "");
    const before = await snapshot(database);
    const home = await mkdtemp(join(tmpdir(), "rekey-home-"));
    created.push(home);

    try {
      const child = Bun.spawn(
        [
          process.execPath,
          join(openbot, "scripts", "rekey-vault.ts"),
          "--apply",
          "--yes",
        ],
        {
          cwd: home,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            PATH: process.env.PATH,
            HOME: home,
            OPENBOT_ENV_FILE: name,
            PG_DUMP: join(shimDirectory, "pg_dump"),
          },
        },
      );
      const out = new Response(child.stdout).text();
      const err = new Response(child.stderr).text();
      // It is in the middle of the backup once the stand-in for pg_dump says it is holding.
      for (let waited = 0; waited < 400; waited += 1) {
        if (
          await stat(join(shimDirectory, "holding.txt")).then(
            () => true,
            () => false,
          )
        )
          break;
        await Bun.sleep(50);
      }
      child.kill("SIGINT");
      await Bun.sleep(300);
      await writeFile(join(shimDirectory, "release.txt"), "");

      const code = await child.exited;
      const said = `${await out}\n${await err}`;

      expect(code).toBe(EXIT.interrupted);
      expect(said).toContain("Stopping at the next safe point.");
      expect(said).toContain("Interrupted. Nothing was changed.");
      expect(await snapshot(database)).toBe(before);
      expect(await opensWith(EXAMPLE_KEY)).toMatchObject({ open: 7 });
      expect(await readFile(envPath, "utf8")).toBe(text);
      expect(
        (await readdir(openbot)).filter((entry) =>
          entry.startsWith(`${name}.vault-`),
        ),
      ).toEqual([]);
      expectNothingSecret(said, []);
    } finally {
      await rm(envPath, { force: true });
      for (const entry of await readdir(openbot))
        if (entry.startsWith(`${name}.vault-`))
          await rm(join(openbot, entry), { force: true });
    }
  }, 60_000);

  test("a table that changed after the backup was made undoes everything", async () => {
    const { root, envPath, text } = await installation();
    await stageDump();
    const sealed = await encryptSecret(
      EXAMPLE_KEY,
      "CANARY-a-late-secret-0123",
    );
    let before = "";

    const ran = await runIn(root, ["--apply", "--yes"], {
      checkpoint: async (stage) => {
        if (stage !== "key-saved") return;
        await database.execute(sql`
          insert into credentials (kind, provider, key_id, metadata, encrypted_value)
          values ('connector', 'a-late-row', 'late', '{}'::jsonb, ${sealed})
        `);
        before = await snapshot(database);
      },
    });

    expect(ran.code).toBe(EXIT.failed);
    expect(ran.err).toContain("The tables changed after the backup was made");
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });

  test("a value the database stores as something other than what was written is caught before the commit", async () => {
    const { root, envPath, text } = await installation();
    await stageDump();
    const before = await snapshot(database);
    // The database answers every write to a credential with a value sealed under some other key.
    const other = await encryptSecret(
      Buffer.alloc(32, 9).toString("base64"),
      "CANARY-other-key-0123",
    );
    await database.execute(
      sql.raw(
        `create or replace function rekey_check_credentials() returns trigger language plpgsql as $fn$ begin new.encrypted_value := $v$${other}$v$; return new; end $fn$`,
      ),
    );
    await database.execute(
      sql`create trigger rekey_check_credentials before update on public.credentials for each row execute function rekey_check_credentials()`,
    );
    let ran: Ran;
    try {
      ran = await runIn(root, ["--apply", "--yes"]);
    } finally {
      await database.execute(
        sql`drop trigger if exists rekey_check_credentials on public.credentials`,
      );
      await database.execute(
        sql`drop function if exists rekey_check_credentials()`,
      );
    }

    expect(ran.code).toBe(EXIT.failed);
    expect(ran.err).toContain(
      "does not open with the new key after it was sealed again",
    );
    expect(ran.err).toMatch(/table credentials, row [0-9a-f-]{36}/);
    expect(ran.err).toContain("Nothing was changed.");
    expectNothingSecret(ran.text, ["CANARY-other-key-0123", other]);
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(await filesIn(root)).toEqual([".env"]);
  });
});

describe("--apply, when .env cannot be written after the database was changed", () => {
  async function failedWrite() {
    const installed = await installation();
    await stageDump();
    const ran = await runIn(installed.root, ["--apply", "--yes"], {
      writeSetting: async () => {
        throw new Error("EACCES: permission denied, rename");
      },
    });
    const names = await filesIn(installed.root);
    const keyFile = names.find((name) =>
      name.startsWith(".env.vault-new-key-"),
    );
    return {
      ...installed,
      ran,
      names,
      keyFile: join(installed.root, keyFile ?? ""),
    };
  }

  test("it says so, keeps the new key in a private file, prints the way to finish, and prints no key", async () => {
    const { envPath, text, ran, names, keyFile } = await failedWrite();
    const newKey = (await readFile(keyFile, "utf8")).trim();

    expect(ran.code).toBe(EXIT.keyNotWritten);
    expect(ran.err).toContain("The new key could NOT be written into .env");
    expect(ran.err).toContain("do not start FreeDuet until .env has it");
    expect(ran.err).toContain("bun scripts/rekey-vault.ts --apply --yes");
    expect(ran.err).toContain(manualRecoveryCommand(envPath, keyFile));
    expectNothingSecret(ran.text, [newKey]);
    // The key file is private, holds a key that is not the example, and is what the database is sealed with.
    expect(
      names.filter((name) => name.startsWith(".env.vault-new-key-")),
    ).toHaveLength(1);
    expect(await mode(keyFile)).toBe(0o600);
    expect(isValidKey(newKey)).toBe(true);
    expect(isPublishedExampleKey(newKey)).toBe(false);
    expect(await opensWith(newKey)).toMatchObject({ sealed: 7, open: 7 });
    // And .env is exactly what it was, so it never holds a key the rows do not match.
    expect(await readFile(envPath, "utf8")).toBe(text);
  });

  test("the printed command puts the key into .env the way start.sh would", async () => {
    const { envPath, text, keyFile } = await failedWrite();
    const newKey = (await readFile(keyFile, "utf8")).trim();

    const child = Bun.spawn(
      ["bash", "-c", manualRecoveryCommand(envPath, keyFile)],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await child.exited).toBe(0);

    const after = await readFile(envPath, "utf8");
    expect(after).toBe(replaceSetting(text, "KEY_ENCRYPTION_KEY", newKey));
    expect(await mode(envPath)).toBe(0o600);
    expect(
      await opensWith(settingFrom(after, "KEY_ENCRYPTION_KEY")),
    ).toMatchObject({
      sealed: 7,
      open: 7,
    });
  });

  test("the printed command works on a .env that holds nothing but the key", async () => {
    const { root, envPath, keyFile } = await failedWrite();
    await writeFile(envPath, `KEY_ENCRYPTION_KEY=${EXAMPLE_KEY}\n`);
    const newKey = (await readFile(keyFile, "utf8")).trim();
    expect(root).toBeTruthy();

    const child = Bun.spawn([
      "bash",
      "-c",
      manualRecoveryCommand(envPath, keyFile),
    ]);
    expect(await child.exited).toBe(0);
    expect(await readFile(envPath, "utf8")).toBe(
      `KEY_ENCRYPTION_KEY=${newKey}\n`,
    );
  });

  test("the check says an earlier run was left half done, and changes nothing", async () => {
    const { root, envPath, text, keyFile } = await failedWrite();
    const before = await snapshot(database);

    const ran = await runIn(root, ["--yes"]);

    expect(ran.code).toBe(EXIT.ok);
    expect(ran.out).toContain(
      "An earlier run sealed all 7 saved secrets with the new key",
    );
    expect(ran.out).toContain("Run it again with --apply --yes");
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect((await readFile(keyFile, "utf8")).length).toBeGreaterThan(0);
  });

  test("run again with --apply it finishes: the key goes into .env, the database is not touched, and the key file is removed", async () => {
    const { root, envPath, text, keyFile, names } = await failedWrite();
    const newKey = (await readFile(keyFile, "utf8")).trim();
    const before = await snapshot(database);
    const backups = names.filter((name) =>
      name.startsWith(".env.vault-backup-"),
    );

    const ran = await runIn(root, ["--apply", "--yes"]);

    expect(ran.code).toBe(EXIT.ok);
    expect(ran.out).toContain(
      "Done. The new key is in .env. The database was not changed.",
    );
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(
      replaceSetting(text, "KEY_ENCRYPTION_KEY", newKey),
    );
    expect(await mode(envPath)).toBe(0o600);
    const after = await filesIn(root);
    expect(after.some((name) => name.startsWith(".env.vault-new-key-"))).toBe(
      false,
    );
    // The backup of the first run is still the only one: finishing made no second.
    expect(
      after.filter((name) => name.startsWith(".env.vault-backup-")),
    ).toEqual(backups);
    expectNothingSecret(ran.text, [newKey]);
  });

  test("a writer that reports success and wrote something else is caught by reading the file back", async () => {
    const { root, envPath, text } = await installation();
    await stageDump();

    const ran = await runIn(root, ["--apply", "--yes"], {
      writeSetting: async () => {
        // The file is as it was: the example key is still in it.
      },
    });

    expect(ran.code).toBe(EXIT.keyNotWritten);
    expect(ran.err).toContain(
      "the key read back is not the one that was written",
    );
    expect(await readFile(envPath, "utf8")).toBe(text);
    expect(
      (await filesIn(root)).some((name) =>
        name.startsWith(".env.vault-new-key-"),
      ),
    ).toBe(true);
  });

  test("a commit the database does not confirm keeps the key, says so, and the next run finds out which it was", async () => {
    // A trigger that refuses at COMMIT, after everything inside the transaction went through.
    await database.execute(sql`
      create or replace function refuse_at_commit() returns trigger language plpgsql as
      $$ begin raise exception 'refused at commit by the test'; end $$
    `);
    await database.execute(sql`
      create constraint trigger refuse_at_commit after update on credentials
      deferrable initially deferred for each row execute function refuse_at_commit()
    `);
    const { root, envPath, text } = await installation();
    await stageDump();
    const before = await snapshot(database);

    let ran: Ran;
    try {
      ran = await runIn(root, ["--apply", "--yes"]);
    } finally {
      await database.execute(sql`drop trigger refuse_at_commit on credentials`);
      await database.execute(sql`drop function refuse_at_commit()`);
    }

    expect(ran.code).toBe(EXIT.keyNotWritten);
    expect(ran.err).toContain("The database did not confirm the last step");
    expect(ran.err).toContain("Do not start FreeDuet");
    // The commit did not happen: the database and .env are as they were, and the key is kept.
    expect(await snapshot(database)).toBe(before);
    expect(await readFile(envPath, "utf8")).toBe(text);
    const kept = (await filesIn(root)).filter((name) =>
      name.startsWith(".env.vault-new-key-"),
    );
    expect(kept).toHaveLength(1);

    // The next run finds the rows open with the example key, not with the kept one, and goes on as a first run.
    await stageDump();
    const next = await runIn(root, ["--apply", "--yes"]);
    expect(next.code).toBe(EXIT.ok);
    expect(next.out).toContain("Done. The new key is in .env.");
    // The file it did not make is the file it leaves alone, and says is there.
    expect(await filesIn(root)).toContain(kept[0] ?? "");
    expect(next.out).toContain("A file from an earlier run still holds a key");
  });
});

// ---------------------------------------------------------------------------------------------------
// The backup program
// ---------------------------------------------------------------------------------------------------

function requestFor(
  path: string,
  overrides: Partial<BackupRequest> = {},
): BackupRequest {
  const address: Address = {
    hostname: "127.0.0.1",
    port: 5432,
    username: "someone",
    password: "CANARY-db-password-0123456789ab",
    database: "somewhere",
  };
  return {
    path,
    tables: [...VAULT_TABLES],
    address,
    serverMajor: 16,
    serverStartedAt: "1731582000.123456",
    root: shimDirectory,
    envName: ".env",
    env: { PATH: process.env.PATH, PG_DUMP: join(shimDirectory, "pg_dump") },
    ...overrides,
  };
}

describe("the backup", () => {
  test("is made by pg_dump with the password in the environment and not on the command line, into a file only its owner can read", async () => {
    await stageDump();
    const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
    created.push(folder);
    const path = join(folder, "backup.sql");

    const result = await runBackup(requestFor(path));

    expect(result).toMatchObject({
      ok: true,
      rows: { credentials: 2, saved_logins: 2, sso_providers: 3 },
    });
    expect(await mode(path)).toBe(0o600);
    const args = await readFile(join(shimDirectory, "args.txt"), "utf8");
    expect(args).toContain("--data-only");
    for (const table of VAULT_TABLES) expect(args).toContain(`public.${table}`);
    expect(args).toContain("--no-password");
    expect(args).not.toContain("CANARY-db-password");
    expect(await readFile(join(shimDirectory, "password.txt"), "utf8")).toBe(
      "PGPASSWORD=CANARY-db-password-0123456789ab\n",
    );
  });

  test("only asks for the tables that exist", async () => {
    await stageDump();
    const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
    created.push(folder);

    await runBackup(
      requestFor(join(folder, "backup.sql"), {
        tables: ["credentials", "saved_logins"],
      }),
    );

    const args = await readFile(join(shimDirectory, "args.txt"), "utf8");
    expect(args).toContain("public.credentials");
    expect(args).not.toContain("public.sso_providers");
  });

  test("a pg_dump older than the database is refused for what it is, not run", async () => {
    await stageDump();
    await writeFile(
      join(shimDirectory, "version.txt"),
      "pg_dump (PostgreSQL) 15.4\n",
    );
    const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
    created.push(folder);
    const path = join(folder, "backup.sql");

    const result = await runBackup(requestFor(path, { serverMajor: 17 }));

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(
      "version 15, older than the database (version 17)",
    );
    expect(await readdir(folder)).toEqual([]);
  });

  test("a dump that does not end the way a finished one does is not a backup", async () => {
    await stageDump();
    const dump = await readFile(join(shimDirectory, "dump.sql"), "utf8");
    await writeFile(
      join(shimDirectory, "dump.sql"),
      dump.replace("-- PostgreSQL database dump complete", "-- cut off"),
    );
    const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
    created.push(folder);

    const result = await runBackup(requestFor(join(folder, "backup.sql")));

    expect(result.ok).toBe(false);
    expect(await readdir(folder)).toEqual([]);
  });

  describe("through Docker, when pg_dump is not on this computer", () => {
    async function dockerShim(startedAt: string) {
      const folder = await mkdtemp(join(tmpdir(), "rekey-docker-"));
      created.push(folder);
      await writeFile(
        join(folder, "docker"),
        `#!/bin/sh
dir=$(dirname "$0")
printf '%s\\n' "$@" >> "$dir/calls.txt"
printf -- '---\\n' >> "$dir/calls.txt"
case "$*" in
  *psql*) echo "${startedAt}"; exit 0 ;;
  *pg_dump*) cat "${join(shimDirectory, "dump.sql")}"; exit 0 ;;
esac
exit 1
`,
        { mode: 0o755 },
      );
      return folder;
    }

    const composeAddress: Address = {
      hostname: "localhost",
      port: 5432,
      username: "openbot",
      password: "CANARY-db-password-0123456789ab",
      database: "openbot",
    };

    test("it uses the database's own pg_dump, once it has checked that it is the same server", async () => {
      await stageDump();
      const docker = await dockerShim("1731582000.123456");
      const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
      created.push(folder);
      const path = join(folder, "backup.sql");

      const result = await runBackup(
        requestFor(path, {
          address: composeAddress,
          env: {
            PATH: `${docker}:${process.env.PATH}`,
            PG_DUMP: join(tmpdir(), "no-pg_dump-here"),
          },
          root: folder,
        }),
      );

      expect(result).toMatchObject({
        ok: true,
        via: "pg_dump inside the Docker database",
      });
      expect(await mode(path)).toBe(0o600);
      const calls = await readFile(join(docker, "calls.txt"), "utf8");
      expect(calls).toContain("compose\nexec\n-T\npostgres\npsql");
      expect(calls).toContain("compose\nexec\n-T\npostgres\npg_dump");
      expect(calls).toContain("public.credentials");
      expect(calls).not.toContain("--env-file");
      expect(calls).not.toContain("CANARY-db-password");
    });

    test("a stack with its own settings file names it to Compose", async () => {
      await stageDump();
      const docker = await dockerShim("1731582000.123456");
      const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
      created.push(folder);

      await runBackup(
        requestFor(join(folder, "backup.sql"), {
          address: composeAddress,
          envName: ".env.eval",
          env: {
            PATH: `${docker}:${process.env.PATH}`,
            PG_DUMP: join(tmpdir(), "no-pg_dump-here"),
          },
          root: folder,
        }),
      );

      expect(await readFile(join(docker, "calls.txt"), "utf8")).toContain(
        `--env-file\n${join(folder, ".env.eval")}`,
      );
    });

    test("a Docker database that is not the server this command is connected to is not used", async () => {
      await stageDump();
      const docker = await dockerShim("1699999999.000000");
      const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
      created.push(folder);
      const path = join(folder, "backup.sql");

      const result = await runBackup(
        requestFor(path, {
          address: composeAddress,
          env: {
            PATH: `${docker}:${process.env.PATH}`,
            PG_DUMP: join(tmpdir(), "no-pg_dump-here"),
          },
          root: folder,
        }),
      );

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).toContain(
        "not the one this command is connected to",
      );
      expect(await readFile(join(docker, "calls.txt"), "utf8")).not.toContain(
        "pg_dump\n--username",
      );
      expect(
        (await readdir(folder)).filter((name) => name === "backup.sql"),
      ).toEqual([]);
    });

    test("a database that is not the one Compose runs is never sent through Docker", async () => {
      await stageDump();
      const docker = await dockerShim("1731582000.123456");
      const folder = await mkdtemp(join(tmpdir(), "rekey-backup-"));
      created.push(folder);

      const result = await runBackup(
        requestFor(join(folder, "backup.sql"), {
          env: {
            PATH: `${docker}:${process.env.PATH}`,
            PG_DUMP: join(tmpdir(), "no-pg_dump-here"),
          },
          root: folder,
        }),
      );

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).toContain(
        "not the one Docker Compose runs here",
      );
      await expect(
        readFile(join(docker, "calls.txt"), "utf8"),
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------------------------------
// The real pg_dump
// ---------------------------------------------------------------------------------------------------

/**
 * The cases below run the real `pg_dump`, which only reads a database of its own version or older. The
 * machine's one is looked for before the cases are declared, so that a machine whose `pg_dump` is too
 * old for its test database (CI's is: version 16 against a version 17 service) says so in the report as
 * a skipped case with the reason in its name, and a case that cannot mean anything does not pass.
 */
const probe = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} });
const [{ major: testServerMajor }] = await probe<{ major: number }[]>`
  select (current_setting('server_version_num')::int / 10000)::int as major
`;
await probe.end({ timeout: 5 });
const realPgDump = await (async () => {
  const path = Bun.which("pg_dump");
  if (!path) return undefined;
  const child = Bun.spawn([path, "--version"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const major = Number(
    /\(PostgreSQL\)\s+(\d+)/.exec(await new Response(child.stdout).text())?.[1],
  );
  await child.exited;
  return major >= testServerMajor ? path : undefined;
})();
const psqlPath = Bun.which("psql");
const needs = realPgDump && psqlPath;

describe("the real pg_dump", () => {
  test.skipIf(!realPgDump)(
    `reads the three tables into a private file whose row counts are the database's (this machine's pg_dump is at least version ${testServerMajor})`,
    async () => {
      const folder = await mkdtemp(join(tmpdir(), "rekey-real-"));
      created.push(folder);
      const path = join(folder, "backup.sql");
      const address: Address = {
        hostname: new URL(throwaway.url).hostname,
        port: Number(new URL(throwaway.url).port || 5432),
        username: decodeURIComponent(new URL(throwaway.url).username),
        password: decodeURIComponent(new URL(throwaway.url).password),
        database: throwaway.name,
      };

      const result = await runBackup(
        requestFor(path, {
          address,
          serverMajor: await serverMajorVersion(database),
          env: { PATH: process.env.PATH, PG_DUMP: realPgDump },
        }),
      );

      expect(result).toMatchObject({
        ok: true,
        via: "pg_dump",
        rows: { credentials: 2, saved_logins: 2, sso_providers: 3 },
      });
      expect(await mode(path)).toBe(0o600);
      const dump = await readFile(path, "utf8");
      // It is the sealed data, as stored: every sealed value is in it, and no decrypted one is. The one
      // value that was plain text in the database (a provider registered before the server sealed
      // them) is plain text in its backup too, because the backup is a copy of what is stored.
      for (const sealed of await sealedStrings())
        expect(dump).toContain(sealed);
      for (const [name, secret] of Object.entries(CANARY)) {
        if (name === "legacy") expect(dump).toContain(secret);
        else expect(dump).not.toContain(secret);
      }
    },
  );

  test.skipIf(!needs)(
    "restores: putting the backup back with the documented command returns every row to what it was, with the rows that depend on them intact",
    async () => {
      // A row in another table that points at a credential, as the connections of a real installation do.
      await database.execute(sql`
        insert into identity_links (id, provider, realm, subject, user_id, verified_by, credential_id)
        values ('a-link', 'github', 'github.com', 'someone', 'fixture-user', 'oauth', ${seeded.credentialIds[0]}::uuid)
      `);
      const folder = await mkdtemp(join(tmpdir(), "rekey-real-"));
      created.push(folder);
      const path = join(folder, "backup.sql");
      const url = new URL(throwaway.url);
      const result = await runBackup(
        requestFor(path, {
          address: {
            hostname: url.hostname,
            port: Number(url.port || 5432),
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: throwaway.name,
          },
          serverMajor: await serverMajorVersion(database),
          env: { PATH: process.env.PATH, PG_DUMP: realPgDump ?? "" },
        }),
      );
      expect(result.ok).toBe(true);
      const before = await snapshot(database);

      // Seal everything again with a new key, as the command does.
      const newKey = Buffer.alloc(32, 5).toString("base64");
      await database.transaction((transaction) =>
        resealVault(transaction, EXAMPLE_KEY, newKey),
      );
      expect(await snapshot(database)).not.toBe(before);

      // The documented restore (docs/design/vault-rekey.md): one transaction, foreign keys not checked
      // for the three tables' own deletes and inserts, the backup played in. The four lines and the
      // backup, in that order, on the standard input of psql, as the document has the person do it.
      const script = [
        "set session_replication_role = replica;",
        "delete from public.sso_providers;",
        "delete from public.saved_logins;",
        "delete from public.credentials;",
        await readFile(path, "utf8"),
      ].join("\n");
      const child = Bun.spawn(
        [
          psqlPath ?? "psql",
          "--no-psqlrc",
          "--single-transaction",
          "--set=ON_ERROR_STOP=1",
          "--quiet",
          url.href,
        ],
        { stdin: new Blob([script]), stdout: "pipe", stderr: "pipe" },
      );
      const stderr = await new Response(child.stderr).text();
      expect({ code: await child.exited, stderr }).toEqual({
        code: 0,
        stderr: "",
      });

      expect(await snapshot(database)).toBe(before);
      expect(await opensWith(EXAMPLE_KEY)).toMatchObject({
        sealed: 7,
        open: 7,
      });
      const link = await database.execute(
        sql`select credential_id::text as id from identity_links where id = 'a-link'`,
      );
      expect(link[0]?.id).toBe(seeded.credentialIds[0]);
      await database.execute(sql`delete from identity_links`);
      await chmod(path, 0o600);
    },
  );

  test.skipIf(!!realPgDump)(
    `a pg_dump older than the test database (version ${testServerMajor}) is refused by the version it is, and leaves no file`,
    async () => {
      const folder = await mkdtemp(join(tmpdir(), "rekey-real-"));
      created.push(folder);
      const path = join(folder, "backup.sql");

      const result = await runBackup(
        requestFor(path, {
          serverMajor: testServerMajor,
          env: {
            PATH: process.env.PATH,
            PG_DUMP: Bun.which("pg_dump") ?? join(tmpdir(), "no-pg_dump-here"),
          },
        }),
      );

      expect(result.ok).toBe(false);
      expect(await readdir(folder)).toEqual([]);
    },
  );
});
