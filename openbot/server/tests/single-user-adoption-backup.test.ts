/**
 * The backup the move takes first, which is the only way back (docs/design/single-user-to-sign-in.md,
 * sections 6.3 and 6.6): that it is private from the first byte, that it is a real dump or nothing,
 * that the password is never on a command line, that the wrong database is never dumped and believed,
 * and, with a real `pg_dump` and a real `pg_restore`, that the way back the tool prints puts the
 * database back exactly as it was.
 *
 * TWO KINDS OF TEST. The first kind stands in for the programs (a `Spawner`), because what is being
 * decided is which program to run, with what, and what to do with the file it writes: those are
 * choices, and a fake lets every branch be taken, including the ones a healthy computer never takes.
 * The second kind runs the real `pg_dump` and `pg_restore` of this computer against a real scratch
 * database. It needs a `pg_dump` at least as new as the server (an older one refuses to dump a newer
 * server, which is the tool's own rule too), so it is skipped, and says so, where there is none: the
 * CI runner's client is older than its server. A skipped file is not a pass; the numbers in the
 * delivery report are from a computer that had one.
 *
 * NOT TESTED HERE. The refusal for a file system that cannot keep file permissions (a Windows drive
 * mounted into WSL): no file system the tests can use behaves like that. The branch is read, not run.
 *
 * RED ON MAIN. The tool does not exist there: this file cannot even load.
 */
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
  chmodSync,
  existsSync,
  fchmodSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { createDatabase } from "../src/db/client";
import {
  type BackupRequest,
  connectionOf,
  type Spawned,
  type Spawner,
  takeBackup,
} from "../src/freeduet/adopt/backup";
import { EXIT } from "../src/freeduet/adopt/command";
import { Refusal } from "../src/freeduet/adopt/preconditions";
import { invoke, MOVE_ARGUMENTS } from "./support/adopt-run";
import { testDatabaseUrl } from "./support/database";
import { createScratchDatabase } from "./support/scratch-database";
import {
  createWorld,
  seedAsSingleUser,
  seenBy,
  snapshot,
  type World,
} from "./support/single-user-world";

const SLOW = 120_000;
const NOW = new Date("2026-11-14T12:00:00.123Z");
const FILE_NAME = "single-user-backup-20261114T120000123Z.dump";
const PASSWORD = "s3cr3t-pass";
const URL_WITH_PASSWORD = `postgres://openbot:${PASSWORD}@db.example:5433/appdb`;

type Call = {
  command: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdoutFd?: number;
};

/** A stand-in for the programs: each call is recorded, and `answer` says what the program did. */
function programs(answer: (call: Call) => Spawned | Promise<Spawned>) {
  const calls: Call[] = [];
  const spawn: Spawner = async (command, options = {}) => {
    const call: Call = { command, ...options };
    calls.push(call);
    return answer(call);
  };
  return { calls, spawn };
}

const ok = (stdout = ""): Spawned => ({ code: 0, stdout, stderr: "" });
const version = (major: number) =>
  ok(`pg_dump (PostgreSQL) ${major}.4 (Ubuntu ${major}.4-1)\n`);

/** What a dump starts with, then enough bytes to be a believable one. */
function writeDump(fd: number, bytes = 2048) {
  writeSync(
    fd,
    Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(bytes - 5, 1)]),
  );
}

describe("what the backup does, with the programs stood in for", () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "adopt-backup-"));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  function request(
    spawn: Spawner,
    extra: Partial<BackupRequest> = {},
  ): BackupRequest {
    return {
      databaseUrl: URL_WITH_PASSWORD,
      serverMajor: 16,
      serverStartedAt: "1700000000",
      directory: join(folder, "backups"),
      composeDirectory: folder,
      now: NOW,
      spawn,
      ...extra,
    };
  }

  test("the file exists, empty and private to the person, before the dump writes a byte, whatever the umask", async () => {
    let atTheStart: { size: number; mode: number } | undefined;
    const { spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      const fd = call.stdoutFd as number;
      atTheStart = {
        size: fstatSync(fd).size,
        mode: fstatSync(fd).mode & 0o777,
      };
      writeDump(fd);
      return ok();
    });

    const before = process.umask(0);
    let made: Awaited<ReturnType<typeof takeBackup>>;
    try {
      made = await takeBackup(request(spawn));
    } finally {
      process.umask(before);
    }

    expect(atTheStart).toEqual({ size: 0, mode: 0o600 });
    expect(made.name).toBe(FILE_NAME);
    expect(made.path).toBe(join(folder, "backups", FILE_NAME));
    expect(made.via).toBe("pg_dump");
    expect(made.bytes).toBe(2048);
    expect(statSync(made.path).mode & 0o777).toBe(0o600);
    expect(readFileSync(made.path).subarray(0, 5).toString()).toBe("PGDMP");
  });

  test("the dump goes to the file through the descriptor, as a whole custom-format archive, and asks for no password", async () => {
    const { calls, spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      writeDump(call.stdoutFd as number);
      return ok();
    });
    await takeBackup(request(spawn));

    const dump = calls.find((call) => call.stdoutFd !== undefined);
    expect(dump?.command).toEqual([
      "pg_dump",
      "--format=custom",
      "--no-password",
    ]);
    // Not `-f` or `--file`: the file is the one made private, not one pg_dump makes by its own rules.
    expect(dump?.command.some((word) => /^(-f|--file)/.test(word))).toBe(false);
  });

  test("the password reaches pg_dump in its environment and in no command line at all", async () => {
    const { calls, spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      writeDump(call.stdoutFd as number);
      return ok();
    });
    await takeBackup(request(spawn));

    const dump = calls.find((call) => call.stdoutFd !== undefined);
    expect(dump?.env).toMatchObject({
      PGPASSWORD: PASSWORD,
      PGHOST: "db.example",
      PGPORT: "5433",
      PGUSER: "openbot",
      PGDATABASE: "appdb",
    });
    for (const call of calls) {
      const line = call.command.join(" ");
      expect(line).not.toContain(PASSWORD);
      expect(line).not.toContain("://");
    }
  });

  test("a pg_dump older than the server is not used: the stack's own container is, once it is shown to be the same server", async () => {
    writeFileSync(join(folder, "docker-compose.yml"), "services: {}\n");
    const { calls, spawn } = programs((call) => {
      if (call.command[0] === "pg_dump") return version(14);
      if (call.command.includes("psql")) return ok("1700000000\n");
      writeDump(call.stdoutFd as number);
      return ok();
    });
    const made = await takeBackup(request(spawn));

    expect(made.via).toBe("docker");
    const dump = calls.find((call) => call.stdoutFd !== undefined);
    expect(dump?.command).toEqual([
      "docker",
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "openbot",
      "--format=custom",
      "appdb",
    ]);
    expect(dump?.cwd).toBe(folder);
    // The container has its own way in: no password goes anywhere.
    expect(Object.keys(dump?.env ?? {})).not.toContain("PGPASSWORD");
    expect(readFileSync(made.path).subarray(0, 5).toString()).toBe("PGDMP");
  });

  test("a pg_dump newer than the server is fine", async () => {
    const { spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(17);
      writeDump(call.stdoutFd as number);
      return ok();
    });
    expect((await takeBackup(request(spawn))).via).toBe("pg_dump");
  });

  test("a container that is not the server DATABASE_URL points at is not dumped: nothing is written, and the reason is said", async () => {
    writeFileSync(join(folder, "docker-compose.yml"), "services: {}\n");
    const { calls, spawn } = programs((call) => {
      if (call.command[0] === "pg_dump") return version(14);
      // Another stack's postgres: it started at another moment.
      if (call.command.includes("psql")) return ok("1699999999\n");
      writeDump(call.stdoutFd as number);
      return ok();
    });

    const error = await takeBackup(request(spawn)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refusal);
    expect((error as Error).message).toContain(
      "is not the server DATABASE_URL points at",
    );
    expect((error as Error).message).toContain("version 14");
    expect(calls.filter((call) => call.stdoutFd !== undefined)).toHaveLength(0);
    expect(existsSync(join(folder, "backups"))).toBe(false);
  });

  test("with no pg_dump and no container, it refuses and says what to install, before it makes a folder or a file", async () => {
    const { spawn } = programs(() => ({
      code: 127,
      stdout: "",
      stderr: "not found",
    }));
    const error = await takeBackup(request(spawn)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refusal);
    const message = (error as Error).message;
    expect(message).toContain("there is no pg_dump on this computer");
    expect(message).toContain("there is no docker-compose.yml");
    expect(message).toContain("version 16 or newer");
    expect(message).toContain("PG_DUMP");
    expect(existsSync(join(folder, "backups"))).toBe(false);
  });

  test("a pg_dump that fails leaves no file, and its own words are in the refusal", async () => {
    const { spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      // Part of a dump, then the end of the connection.
      writeDump(call.stdoutFd as number, 900);
      return {
        code: 1,
        stdout: "",
        stderr: "pg_dump: error: connection to server was lost\n",
      };
    });
    const error = await takeBackup(request(spawn)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refusal);
    expect((error as Error).message).toContain(
      "pg_dump said: pg_dump: error: connection to server was lost",
    );
    expect(readdirSync(join(folder, "backups"))).toEqual([]);
  });

  test("a file that is not a dump, or is too short to be one, is removed rather than kept as the way back", async () => {
    for (const write of [
      (fd: number) => writeSync(fd, Buffer.alloc(4096, 65)),
      (fd: number) => writeSync(fd, Buffer.from("PGDMP-and-then-nothing")),
    ]) {
      const { spawn } = programs((call) => {
        if (call.command.includes("--version")) return version(16);
        write(call.stdoutFd as number);
        return ok();
      });
      const error = await takeBackup(request(spawn)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Refusal);
      expect((error as Error).message).toContain(
        "is not a PostgreSQL dump, so it was removed",
      );
      expect(readdirSync(join(folder, "backups"))).toEqual([]);
    }
  });

  test("a file of that name that is already there is never overwritten, and the move would not start", async () => {
    mkdirSync(join(folder, "backups"));
    writeFileSync(join(folder, "backups", FILE_NAME), "keep me");
    const { calls, spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      writeDump(call.stdoutFd as number);
      return ok();
    });
    const error = await takeBackup(request(spawn)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refusal);
    expect((error as Error).message).toContain("cannot be created");
    expect(readFileSync(join(folder, "backups", FILE_NAME), "utf8")).toBe(
      "keep me",
    );
    expect(calls.filter((call) => call.stdoutFd !== undefined)).toHaveLength(0);
  });

  test("a dump that came out with open permissions is made private again, and is then accepted", async () => {
    const { spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      const fd = call.stdoutFd as number;
      writeDump(fd);
      fchmodSync(fd, 0o644);
      return ok();
    });
    const made = await takeBackup(request(spawn));
    expect(statSync(made.path).mode & 0o777).toBe(0o600);
  });

  test("a folder it cannot make is a refusal that says so, with nothing written", async () => {
    // A file where the folder should be.
    writeFileSync(join(folder, "taken"), "x");
    const { calls, spawn } = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      writeDump(call.stdoutFd as number);
      return ok();
    });
    const error = await takeBackup(
      request(spawn, { directory: join(folder, "taken", "inside") }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refusal);
    expect((error as Error).message).toContain("cannot be made");
    expect(calls.filter((call) => call.stdoutFd !== undefined)).toHaveLength(0);
  });

  test("the folder it makes is private to the person, and the default one is a folder git ignores", () => {
    chmodSync(folder, 0o755);
    const probe = programs((call) => {
      if (call.command.includes("--version")) return version(16);
      writeDump(call.stdoutFd as number);
      return ok();
    });
    return takeBackup(request(probe.spawn)).then(() => {
      expect(statSync(join(folder, "backups")).mode & 0o777).toBe(0o700);
      // The repository root, from this file: openbot/server/tests -> the checkout.
      const root = resolve(import.meta.dir, "..", "..", "..");
      const ignored = Bun.spawnSync(
        [
          "git",
          "check-ignore",
          "-q",
          "openbot/.logs/single-user-backup-x.dump",
        ],
        { cwd: root },
      );
      expect(ignored.exitCode).toBe(0);
    });
  });
});

describe("reading DATABASE_URL for pg_dump", () => {
  test("the user, database, host, port and password, the way libpq reads them, with a percent-encoded password decoded", () => {
    const connection = connectionOf(
      "postgres://open%40bot:p%40ss%25word@db.example:5433/app%20db",
    );
    expect(connection.user).toBe("open@bot");
    expect(connection.database).toBe("app db");
    expect(connection.env).toMatchObject({
      PGHOST: "db.example",
      PGPORT: "5433",
      PGUSER: "open@bot",
      PGDATABASE: "app db",
      PGPASSWORD: "p@ss%word",
    });
  });

  test("a socket directory, a TLS mode and an IPv6 host are passed on as they are", () => {
    expect(
      connectionOf(
        "postgres://u@localhost/d?host=/var/run/postgresql&sslmode=require",
      ).env,
    ).toMatchObject({ PGHOST: "/var/run/postgresql", PGSSLMODE: "require" });
    expect(connectionOf("postgres://u:p@[::1]:5432/d").env.PGHOST).toBe("::1");
  });

  test("an address with no password sets none, and one that cannot be read is a refusal", () => {
    expect(
      connectionOf("postgres://u@localhost/d").env.PGPASSWORD,
    ).toBeUndefined();
    expect(() => connectionOf("not an address")).toThrow(Refusal);
    expect(() => connectionOf("postgres://u:100%@localhost/d")).toThrow(
      Refusal,
    );
  });
});

// ---------------------------------------------------------------------------------------------------
// With the programs this computer has.

/** The version a pg_dump reports, or undefined when there is none. */
function majorOfProgram(program: string): number | undefined {
  try {
    const out = Bun.spawnSync([program, "--version"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (out.exitCode !== 0) return undefined;
    const found = /\(PostgreSQL\)\s+(\d+)/.exec(out.stdout.toString());
    return found ? Number(found[1]) : undefined;
  } catch {
    return undefined;
  }
}

async function serverFacts() {
  const admin = createDatabase(testDatabaseUrl(), { max: 1 });
  try {
    const [row] = (await admin.execute(
      sql`select current_setting('server_version_num')::int as version,
                 extract(epoch from pg_postmaster_start_time())::bigint::text as started`,
    )) as unknown as { version: number; started: string }[];
    return {
      major: Math.floor(Number(row?.version) / 10000),
      startedAt: String(row?.started),
    };
  } finally {
    await admin.$client.close();
  }
}

const server = await serverFacts();
const candidates = [
  process.env.PG_DUMP?.trim(),
  "pg_dump",
  ...[18, 17, 16, 15].map(
    (major) => `/usr/lib/postgresql/${major}/bin/pg_dump`,
  ),
].filter((program): program is string => Boolean(program));
const usable = candidates.find(
  (program) => (majorOfProgram(program) ?? 0) >= server.major,
);
if (!usable) {
  console.warn(
    `single-user-adoption-backup: no pg_dump at least as new as the test server (version ${server.major}) was found, so the tests with the real programs are skipped.`,
  );
}
/** `pg_restore` lives beside the `pg_dump` that was found. */
const restorer = usable?.includes("/")
  ? join(dirname(usable), "pg_restore")
  : "pg_restore";

describe("with the real pg_dump and pg_restore of this computer", () => {
  let folder: string;
  let world: World;

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), "adopt-backup-real-"));
    if (usable) world = await createWorld();
  }, SLOW);

  afterAll(async () => {
    rmSync(folder, { recursive: true, force: true });
    if (usable) await world.dispose();
  }, SLOW);

  test.skipIf(!usable)(
    "the file is a real archive of the database, private, and nothing the database holds is missing from it",
    async () => {
      const scratch = await createScratchDatabase();
      try {
        await scratch.database.execute(
          sql`insert into users (id, email, name, email_verified)
              values ('in-the-dump', 'in-the-dump@example.com', 'x', true)`,
        );
        const started = (await scratch.database.execute(
          sql`select extract(epoch from pg_postmaster_start_time())::bigint::text as at`,
        )) as unknown as { at: string }[];
        const made = await takeBackup({
          databaseUrl: scratch.url,
          serverMajor: server.major,
          serverStartedAt: String(started[0]?.at),
          directory: join(folder, "archive"),
          composeDirectory: folder,
          pgDump: usable,
        });

        expect(made.via).toBe("pg_dump");
        expect(statSync(made.path).mode & 0o777).toBe(0o600);
        expect(statSync(join(folder, "archive")).mode & 0o777).toBe(0o700);
        expect(readFileSync(made.path).subarray(0, 5).toString()).toBe("PGDMP");
        expect(made.bytes).toBe(statSync(made.path).size);

        // pg_restore reads it as an archive and lists the users table among its contents.
        const listed = Bun.spawnSync([restorer, "--list", made.path], {
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(listed.exitCode).toBe(0);
        expect(listed.stdout.toString()).toContain("TABLE DATA public users");
      } finally {
        await scratch.drop();
      }
    },
    SLOW,
  );

  test.skipIf(!usable)(
    "the move, then the way back the tool printed, leaves every table as it was and the person seeing what they saw",
    async () => {
      const single = await world.startSingleUser();
      await seedAsSingleUser(world, single);
      const wasSeen = await seenBy(single, DEV_ACTOR.id);
      const wasStored = await snapshot(world.database);

      // The real move, with the real backup.
      const moved = await world.whileStopped(() =>
        invoke(
          MOVE_ARGUMENTS,
          { ...world.environment(), PG_DUMP: usable },
          { settleMs: 0, backupDirectory: join(folder, "moves") },
        ),
      );
      expect(moved.err).toBe("");
      expect(moved.code).toBe(EXIT.ok);
      expect(moved.out).toContain(
        "Done. 12 rows now belong to you@example.com.",
      );

      const printed = moved.out
        .split("\n")
        .find((line) => line.trim().startsWith("pg_restore "));
      expect(printed).toBeDefined();
      expect(printed).toContain(join(folder, "moves", "single-user-backup-"));
      // The move did change the database, so that putting it back is something the restore did.
      expect(await snapshot(world.database)).not.toEqual(wasStored);

      // Run exactly what was printed, as the person would paste it, with DATABASE_URL set.
      const restoreProgram = restorer.includes("/") ? dirname(restorer) : "";
      const restored = await world.whileStopped(async () => {
        const child = Bun.spawn(["bash", "-c", String(printed)], {
          env: {
            PATH: `${restoreProgram}:${process.env.PATH ?? ""}`,
            HOME: process.env.HOME ?? "",
            DATABASE_URL: world.url,
          },
          stdout: "pipe",
          stderr: "pipe",
        });
        const [code, stderr] = await Promise.all([
          child.exited,
          new Response(child.stderr as ReadableStream).text(),
        ]);
        return { code, stderr };
      });
      expect(restored.stderr).toBe("");
      expect(restored.code).toBe(0);

      // Every table, row for row, as before the move; and the app, started with no sign-in again,
      // shows the person what it showed.
      expect(await snapshot(world.database)).toEqual(wasStored);
      const again = await world.startSingleUser();
      expect(await seenBy(again, DEV_ACTOR.id)).toEqual(wasSeen);
    },
    SLOW,
  );
});
