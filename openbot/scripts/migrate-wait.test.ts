import { describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `docker/s6/scripts/migrate.sh` waits until the embedded Postgres accepts connections before it
 * migrates (issue #50). The `postgres` service is `up` when its process starts, not when it answers,
 * and an early `migrate` met `57P03 the database system is starting up`, exited 1, and the container
 * never served.
 *
 * The script does `cd /app/server` and then execs `s6-setuidgid`, and neither exists outside the image.
 * Each run therefore uses a copy of the script whose one `cd` points at a temporary directory, with
 * `s6-setuidgid` faked to record what it was asked to run. `pg_isready` is faked too: it refuses the
 * first N calls, as Postgres does while it starts, then accepts. PATH holds only the fakes and the
 * system tools the script calls (`sh`, `date`, `sleep`, `cat`).
 */

const migrateScript = resolve(
  import.meta.dir,
  "../docker/s6/scripts/migrate.sh",
);
const appDirectoryCommand = "cd /app/server";

type Run = {
  /** Calls to pg_isready refused before one is accepted; `"never"` refuses every call. */
  rejections: number | "never";
  env?: Record<string, string>;
};

async function writeExecutable(path: string, contents: string) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function readLines(path: string) {
  const text = await readFile(path, "utf8").catch(() => "");
  return text.split("\n").filter((line) => line !== "");
}

async function runMigrate({ rejections, env = {} }: Run) {
  const directory = await mkdtemp(join(tmpdir(), "openbot-migrate-wait-"));
  try {
    const bin = join(directory, "bin");
    const app = join(directory, "app");
    const countPath = join(directory, "pg-isready-count");
    const pgArgsPath = join(directory, "pg-isready-args.log");
    const migratePath = join(directory, "migrate-calls.log");
    await mkdir(bin);
    await mkdir(app);

    const original = await readFile(migrateScript, "utf8");
    if (original.split(appDirectoryCommand).length !== 2) {
      throw new Error(
        `expected exactly one "${appDirectoryCommand}" in migrate.sh`,
      );
    }
    const script = join(directory, "migrate.sh");
    await writeFile(
      script,
      original.replace(appDirectoryCommand, `cd "${app}"`),
    );

    await writeExecutable(
      join(bin, "pg_isready"),
      `#!/bin/sh
echo "$*" >> "$PG_ARGS_LOG"
n=$(cat "$PG_COUNT" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$PG_COUNT"
if [ "$REJECTIONS" = never ] || [ "$n" -le "$REJECTIONS" ]; then exit 1; fi
exit 0
`,
    );
    await writeExecutable(
      join(bin, "s6-setuidgid"),
      `#!/bin/sh
echo "$*" >> "$MIGRATE_CALLS_LOG"
`,
    );

    const started = Date.now();
    const child = Bun.spawn(["sh", script], {
      cwd: directory,
      env: {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        EMBEDDED_POSTGRES: "on",
        REJECTIONS: String(rejections),
        PG_COUNT: countPath,
        PG_ARGS_LOG: pgArgsPath,
        MIGRATE_CALLS_LOG: migratePath,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      elapsedMs: Date.now() - started,
      pgIsReadyCalls: await readLines(pgArgsPath),
      migrateCalls: await readLines(migratePath),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("migrate.sh waits for the embedded Postgres before migrating", () => {
  test("refused twice, then accepted: it waits, announces the wait once, and migrates", async () => {
    const result = await runMigrate({
      rejections: 2,
      env: { MIGRATE_WAIT_SECONDS: "10" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.pgIsReadyCalls).toHaveLength(3);
    for (const call of result.pgIsReadyCalls) {
      expect(call).toBe("-q -h 127.0.0.1 -p 5432 -U openbot");
    }
    expect(result.stdout.match(/waiting for embedded Postgres/g)).toHaveLength(
      1,
    );
    expect(result.migrateCalls).toEqual([
      "apiuser /usr/local/bin/bun scripts/migrate.ts",
    ]);
  }, 20_000);

  test("never accepted: exits 1 with the error once the limit has passed, and does not migrate", async () => {
    const result = await runMigrate({
      rejections: "never",
      env: { MIGRATE_WAIT_SECONDS: "2" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("did not accept connections within 2s");
    expect(result.pgIsReadyCalls.length).toBeGreaterThan(1);
    expect(result.elapsedMs).toBeLessThan(10_000);
    expect(result.migrateCalls).toEqual([]);
  }, 20_000);

  test("accepted at once: no wait is announced and it migrates", async () => {
    const result = await runMigrate({ rejections: 0 });

    expect(result.exitCode).toBe(0);
    expect(result.pgIsReadyCalls).toHaveLength(1);
    expect(result.stdout).not.toContain("waiting");
    expect(result.migrateCalls).toHaveLength(1);
  });

  test("without the embedded database it neither waits nor migrates", async () => {
    const result = await runMigrate({
      rejections: "never",
      env: { EMBEDDED_POSTGRES: "off" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.pgIsReadyCalls).toEqual([]);
    expect(result.migrateCalls).toEqual([]);
  });
});
