/**
 * The backup the move takes first, which is the only way back
 * (docs/design/single-user-to-sign-in.md, sections 6.3 and 6.6).
 *
 * A COPY OF EVERY SECRET. The dump holds the whole database: the saved logins (sealed with a key that
 * is in the settings file, so whoever has both has them), the sessions, the approval rules, every
 * conversation. So the file is made with `O_EXCL` and mode 0600 BEFORE a byte is written to it, in a
 * folder git ignores, and it is not trusted afterwards without looking: a file system that cannot
 * keep permissions (a Windows drive mounted into WSL) is refused, and so is a dump that does not
 * start like one. The tool stops when it cannot make a backup. There is no way to skip it.
 *
 * WHICH `pg_dump`. The one on the computer, when it is at least as new as the server (an older one
 * refuses to dump a newer server, and a dump that fails halfway is worse than none). Otherwise the one
 * inside the stack's own postgres container, which is the server's own version by construction, and
 * only after proving that container IS the server `DATABASE_URL` points at, by the time that server
 * started: two stacks on one computer, each with an `openbot` database, are how a backup of the wrong
 * database would be made and believed.
 *
 * THE PASSWORD NEVER GOES ON A COMMAND LINE, where every program the same user runs can read it. It
 * goes to `pg_dump` in the environment, as libpq expects.
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { Refusal } from "./preconditions";

export type Spawned = { code: number; stdout: string; stderr: string };

/** Runs a program. Replaced in tests, so the choice between the ways of dumping can be tried. */
export type Spawner = (
  command: string[],
  options?: {
    env?: Record<string, string>;
    cwd?: string;
    /** A file descriptor to write the program's output to. Without it the output is returned. */
    stdoutFd?: number;
  },
) => Promise<Spawned>;

export const spawner: Spawner = async (command, options = {}) => {
  try {
    const child = Bun.spawn(command, {
      env: options.env,
      cwd: options.cwd,
      stdin: "ignore",
      stdout: options.stdoutFd ?? "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      options.stdoutFd === undefined
        ? new Response(child.stdout as ReadableStream).text()
        : Promise.resolve(""),
      new Response(child.stderr as ReadableStream).text(),
      child.exited,
    ]);
    return { code, stdout, stderr };
  } catch (error) {
    // The program is not there, or could not be started.
    return {
      code: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
};

export type BackupRequest = {
  databaseUrl: string;
  /** The server's major version, from the database itself. */
  serverMajor: number;
  /** When the server started, in whole seconds since 1970, from the database itself. */
  serverStartedAt: string;
  /** The folder the file goes in. Made, private to the user, when it is not there. */
  directory: string;
  /** Where the stack's docker-compose.yml is, for the way through its postgres container. */
  composeDirectory: string;
  /** A `pg_dump` to try first (the PG_DUMP setting). */
  pgDump?: string;
  now?: Date;
  spawn?: Spawner;
};

export type BackupResult = {
  path: string;
  /** The file's name alone, which is all the audit trail is given. */
  name: string;
  bytes: number;
  via: "pg_dump" | "docker";
};

type Connection = {
  user: string;
  database: string;
  /** What libpq reads, so that nothing secret is on a command line. */
  env: Record<string, string>;
};

/** The parts of the database address that `pg_dump` needs, as libpq's own environment. */
export function connectionOf(databaseUrl: string): Connection {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Refusal(
      "DATABASE_URL is not an address this tool can read, so it cannot make a backup.",
    );
  }
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new Refusal(
        'DATABASE_URL has a part that is not percent-encoded, so it cannot make a backup. A literal "%" must be written "%25".',
      );
    }
  };
  const user = decode(url.username);
  const database = decode(url.pathname.replace(/^\//, ""));
  const env: Record<string, string> = {
    PGHOST:
      url.searchParams.get("host") ?? url.hostname.replace(/^\[|\]$/g, ""),
    PGUSER: user,
    PGDATABASE: database,
    PGCONNECT_TIMEOUT: "10",
  };
  if (url.port) env.PGPORT = url.port;
  if (url.password) env.PGPASSWORD = decode(url.password);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return { user, database, env };
}

/** The program's environment, with only what it needs from this one. */
function childEnvironment(
  extra: Record<string, string>,
): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LC_ALL: "C",
    ...extra,
  };
}

const majorOf = (versionLine: string): number | undefined => {
  const found = /\(PostgreSQL\)\s+(\d+)/.exec(versionLine);
  return found ? Number(found[1]) : undefined;
};

type Route =
  | { via: "pg_dump"; command: string[]; env: Record<string, string> }
  | {
      via: "docker";
      command: string[];
      env: Record<string, string>;
      cwd: string;
    };

async function chooseRoute(request: BackupRequest): Promise<Route> {
  const run = request.spawn ?? spawner;
  const connection = connectionOf(request.databaseUrl);
  const why: string[] = [];

  const program = request.pgDump ?? "pg_dump";
  const version = await run([program, "--version"], {
    env: childEnvironment({}),
  });
  if (version.code === 0) {
    const major = majorOf(version.stdout);
    if (major !== undefined && major >= request.serverMajor) {
      return {
        via: "pg_dump",
        command: [program, "--format=custom", "--no-password"],
        env: childEnvironment(connection.env),
      };
    }
    why.push(
      `the pg_dump on this computer is version ${major ?? "unknown"}, and the database is version ${request.serverMajor}, which an older pg_dump will not dump`,
    );
  } else {
    why.push(`there is no pg_dump on this computer (looked for ${program})`);
  }

  const composeFile = join(request.composeDirectory, "docker-compose.yml");
  if (!existsSync(composeFile)) {
    why.push(
      "there is no docker-compose.yml here to dump from the stack's postgres container",
    );
  } else {
    const inContainer = (rest: string[]) => [
      "docker",
      "compose",
      "exec",
      "-T",
      "postgres",
      ...rest,
    ];
    const started = await run(
      inContainer([
        "psql",
        "-U",
        connection.user,
        "-d",
        connection.database,
        "-Atc",
        "select extract(epoch from pg_postmaster_start_time())::bigint::text",
      ]),
      { env: childEnvironment({}), cwd: request.composeDirectory },
    );
    if (started.code !== 0) {
      why.push(
        "the stack's postgres container could not be asked (is it running, from this folder?)",
      );
    } else if (started.stdout.trim() !== request.serverStartedAt) {
      why.push(
        "the postgres container in this folder is not the server DATABASE_URL points at, so a dump from it would be a backup of another database",
      );
    } else {
      return {
        via: "docker",
        command: inContainer([
          "pg_dump",
          "-U",
          connection.user,
          "--format=custom",
          connection.database,
        ]),
        env: childEnvironment({}),
        cwd: request.composeDirectory,
      };
    }
  }

  throw new Refusal(
    `A backup cannot be made, so nothing was changed: ${why.join("; and ")}. Install the PostgreSQL client tools (version ${request.serverMajor} or newer) so that pg_dump is on the PATH, or set PG_DUMP to its full path, or start the stack's postgres container from the openbot folder.`,
  );
}

/** What a failed program said, short and on one line. */
const said = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 400);

function removeQuietly(path: string) {
  try {
    unlinkSync(path);
  } catch {
    // Nothing to remove.
  }
}

const stamp = (when: Date) =>
  when
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d{3})Z$/, "$1Z");

/**
 * Takes the backup, or refuses. Returns where the file is.
 *
 * Whatever happens, no half-made file is left behind: a file that is not a whole dump is removed,
 * because it is a copy of the secrets that is good for nothing.
 */
export async function takeBackup(
  request: BackupRequest,
): Promise<BackupResult> {
  const run = request.spawn ?? spawner;
  const route = await chooseRoute(request);

  try {
    mkdirSync(request.directory, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new Refusal(
      `The backup folder ${request.directory} cannot be made: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`,
    );
  }
  const name = `single-user-backup-${stamp(request.now ?? new Date())}.dump`;
  const path = join(request.directory, name);

  let fd: number;
  try {
    // Exclusive, and private from the first moment it exists.
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    throw new Refusal(
      `The backup file ${path} cannot be created: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`,
    );
  }

  let finished: Spawned;
  try {
    finished = await run(route.command, {
      env: route.env,
      cwd: route.via === "docker" ? route.cwd : undefined,
      stdoutFd: fd,
    });
  } finally {
    closeSync(fd);
  }
  if (finished.code !== 0) {
    removeQuietly(path);
    throw new Refusal(
      `The backup failed, so nothing was changed. ${route.command[0]} said: ${said(finished.stderr) || `it stopped with code ${finished.code}`}`,
    );
  }

  // Look at what was made before trusting it as the way back.
  const bytes = statSync(path).size;
  const header = Buffer.alloc(5);
  const reader = openSync(path, "r");
  try {
    readSync(reader, header, 0, 5, 0);
  } finally {
    closeSync(reader);
  }
  if (header.toString("latin1") !== "PGDMP" || bytes < 512) {
    removeQuietly(path);
    throw new Refusal(
      "The file the backup made is not a PostgreSQL dump, so it was removed and nothing was changed.",
    );
  }
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    // Try once to make it private; a file system that cannot keep modes will say so here.
    try {
      chmodSync(path, 0o600);
    } catch {
      // Judged below.
    }
    if ((statSync(path).mode & 0o077) !== 0) {
      removeQuietly(path);
      throw new Refusal(
        `The folder ${request.directory} is on a file system that does not keep file permissions, and the backup holds every secret in the database, so it was removed and nothing was changed. Give --backup-dir a folder on a Linux file system.`,
      );
    }
  }
  return { path, name, bytes, via: route.via };
}
