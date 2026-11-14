/**
 * The command line of `scripts/adopt-single-user-data.ts`: read the arguments, read the settings,
 * say what would happen, and, only when told twice, do it.
 *
 * RUN BY THE PERSON, ON PURPOSE. Nothing in the server imports this (a test fails if it does), no
 * route calls it, and no start-up step runs it. It is a program somebody types, on the machine the
 * database is on, with the same settings file the server reads.
 *
 * WITH NO FLAG BESIDES `--to`, IT WRITES NOTHING. That is the default and it is the dry run: it
 * answers every question the move would, prints what would move and what the person should know
 * before saying yes, and exits. The move needs `--apply` AND `--yes`: `--apply` alone, or `--yes`
 * alone, is a mistake in the command and writes nothing. There is no flag that skips the backup or
 * any of the checks.
 *
 * Exit codes: 0 done or nothing to do, 1 refused (the message says what to fix and nothing was
 * changed), 2 the command line was wrong, 3 an unexpected failure (a move that had not committed is
 * undone by the database).
 */
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { createDatabase } from "../../db/client";
import { type ApplyOptions, applyAdoption } from "./apply";
import {
  type BackupRequest,
  type BackupResult,
  connectionOf,
  type Spawner,
  takeBackup,
} from "./backup";
import { type Plan, readPlan } from "./plan";
import {
  addressProblems,
  adoptionConfig,
  Refusal,
  serverProblems,
  targetAddress,
} from "./preconditions";
import { SOURCE_EMAIL, SOURCE_ID } from "./registry";
import { rowsOf } from "./schema-scan";

export const EXIT = { ok: 0, refused: 1, usage: 2, failed: 3 } as const;

export type Io = {
  out: (line: string) => void;
  err: (line: string) => void;
};

/** What a caller of `run` (a test) can change. The command line passes none of it. */
export type Options = {
  /** How long a closing connection is given to finish before it counts as the server still running. */
  settleMs?: number;
  /** How long the move waits for a lock before giving up. */
  lockTimeoutMs?: number;
  /** Where the backup goes, when `--backup-dir` is not given. */
  backupDirectory?: string;
  /** Called after each step of the move, inside its transaction. */
  checkpoint?: ApplyOptions["checkpoint"];
  /** Takes the backup. Tests that are not about the backup stand in for it. */
  backup?: (request: BackupRequest) => Promise<BackupResult>;
  /** Runs `pg_dump`, for the backup. */
  spawn?: Spawner;
};

export type Parsed = {
  to: string | undefined;
  help: boolean;
  apply: boolean;
  yes: boolean;
  backupDir: string | undefined;
};

/** The openbot folder, where the stack's docker-compose.yml is and where `.logs` is. */
const OPENBOT = resolve(import.meta.dir, "..", "..", "..", "..");

export const USAGE = `Moves what the person who had no sign-in owns to the account you will sign in with.

  bun scripts/adopt-single-user-data.ts --to you@example.com
  bun scripts/adopt-single-user-data.ts --to you@example.com --apply --yes

Run it from the openbot folder, with the same .env the server uses, after you have turned the
sign-in provider on in that file and stopped the server and the worker. With only --to it writes
nothing: it says what would move and what you should know before you say yes. With --apply --yes it
first backs up the whole database to a file only you can read, then moves everything in one step.

  --backup-dir <folder>   where the backup goes (default: .logs, which git ignores)`;

/** The arguments, or the sentence that says what is wrong with them. */
export function parseArguments(
  argv: readonly string[],
): Parsed | { error: string } {
  const parsed: Parsed = {
    to: undefined,
    help: false,
    apply: false,
    yes: false,
    backupDir: undefined,
  };
  const valueAfter = (
    index: number,
    flag: string,
    needs: string,
    example: string,
  ) => {
    const value = argv[index + 1];
    return value === undefined || value.startsWith("--")
      ? { error: `${flag} needs ${needs}: ${flag} ${example}` }
      : value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
    } else if (argument === "--apply") {
      parsed.apply = true;
    } else if (argument === "--yes") {
      parsed.yes = true;
    } else if (argument === "--to") {
      const value = valueAfter(index, "--to", "an address", "you@example.com");
      if (typeof value !== "string") return value;
      parsed.to = value;
      index += 1;
    } else if (argument.startsWith("--to=")) {
      parsed.to = argument.slice("--to=".length);
    } else if (argument === "--backup-dir") {
      const value = valueAfter(index, "--backup-dir", "a folder", "<folder>");
      if (typeof value !== "string") return value;
      parsed.backupDir = value;
      index += 1;
    } else if (argument.startsWith("--backup-dir=")) {
      parsed.backupDir = argument.slice("--backup-dir=".length);
    } else {
      return {
        error: `${argument} is not something this tool knows. Run it with --help.`,
      };
    }
  }
  if (parsed.help) return parsed;
  if (parsed.yes && !parsed.apply)
    return { error: "--yes only goes with --apply. Run it with --help." };
  if (parsed.apply && !parsed.yes)
    return {
      error:
        "--apply writes to the database. Add --yes to say you have read the dry run and want it: --apply --yes.",
    };
  return parsed;
}

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

/** What the dry run and the move say about what moves, as lines, for a plan that can run. */
export function describePlan(plan: Plan): string[] {
  const lines: string[] = [];
  lines.push(`From  ${SOURCE_ID}, the person you were with no sign-in`);
  lines.push(
    plan.target
      ? `To    ${plan.to} (it has an account already, with nothing in it)`
      : `To    ${plan.to} (no account yet: the move makes one, and your first sign-in finds it)`,
  );
  lines.push("");
  lines.push(`What moves, ${plan.total} rows:`);
  const families = new Map<string, { what: string; count: number }[]>();
  for (const entry of [...plan.moves, ...plan.special]) {
    if (entry.count === 0) continue;
    families.set(entry.family, [
      ...(families.get(entry.family) ?? []),
      { what: entry.what, count: entry.count },
    ]);
  }
  for (const [family, entries] of families) {
    const sum = entries.reduce((total, entry) => total + entry.count, 0);
    lines.push(`  ${family}: ${sum}`);
    for (const entry of entries)
      lines.push(`    ${entry.what}: ${entry.count}`);
  }
  lines.push(
    "  And the person's profile: preferences, groups and where the first-run wizard stopped.",
  );
  lines.push("");
  const { fullAccess, alwaysAllowRules } = plan.standing;
  if (fullAccess.length > 0 || alwaysAllowRules > 0) {
    lines.push(`Standing permissions that will belong to ${plan.to}:`);
    if (fullAccess.length > 0)
      lines.push(`  Full access is on for: ${fullAccess.join(", ")}`);
    if (alwaysAllowRules > 0)
      lines.push(
        `  ${alwaysAllowRules} always-allow ${plural(alwaysAllowRules, "rule", "rules")}`,
      );
    lines.push("");
  }
  if (plan.apps.length > 0) {
    lines.push(
      `Connected apps (an app may ask you to connect it again): ${plan.apps.join(", ")}`,
    );
    lines.push("");
  }
  return lines;
}

/** What to read before saying yes. */
function beforeYouSayYes(address: string): string[] {
  return [
    "Before you say yes:",
    "  - Do this before you sign in for the first time. An account that has opened the app already owns",
    "    a team of its own, and this tool will not mix two people's data.",
    "  - Make sure the address is yours. Everything above becomes that account's, including the",
    "    standing permissions.",
    "  - Make sure nothing restarts the server while this runs (a watchdog, a service manager).",
    `  - ${SOURCE_ID} keeps nothing afterwards. The way back is the backup this tool takes first.`,
    "",
    "To move it, run the same command with --apply --yes:",
    `  bun scripts/adopt-single-user-data.ts --to ${address} --apply --yes`,
  ];
}

/** What is said when the single-user person owns nothing: never moved, or already moved. */
function nothingToMove(plan: Plan, address: string): string {
  if (!plan.earlier)
    return `Nothing to move: ${SOURCE_EMAIL} owns nothing in this database.`;
  if (plan.earlier.toEmail === address)
    return `Nothing to move: ${SOURCE_EMAIL} owns nothing now, and the data was already moved to ${address} on ${plan.earlier.at}.`;
  return `Nothing to move: ${SOURCE_EMAIL} owns nothing now. Its data was moved to ${plan.earlier.toEmail} on ${plan.earlier.at}, not to ${address}. If that was a mistake, the way back is the backup that move took.`;
}

/** A path or a name as one word for a shell: as it is when it is plain, quoted when it is not. */
export function shellWord(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
    ? value
    : `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

/**
 * Which database this run is reading or changing, in words, and never the password.
 *
 * WHY IT IS SAID. The tool takes its settings from the environment it is started in, and Bun adds the
 * `.env` of the folder it is started from to that without saying so. A shell that still has a
 * `DATABASE_URL` exported from other work, or a run from another folder, points the tool at a
 * different database than the server's, and before this line nothing the tool printed could tell the
 * person: a run on the wrong database either said "Nothing to move" or moved a different
 * installation's data. Said first in the dry run, the move and the "nothing to move" answer, it is
 * the one thing the person can compare with the settings file they mean.
 */
export function databaseLine(databaseUrl: string): string {
  try {
    const { user, database, env } = connectionOf(databaseUrl);
    const host = env.PGHOST ? env.PGHOST : "this computer";
    const port = env.PGPORT ? `:${env.PGPORT}` : "";
    return `In    the database ${database} on ${host}${port} (as ${user})`;
  } catch {
    // The address connected, but this tool cannot split it. Say that and nothing of it.
    return "In    the database in DATABASE_URL (its address could not be split into parts)";
  }
}

/**
 * How to go back, written for how the backup was taken: a dump made by the pg_dump on this computer
 * is restored by the pg_restore on it, and one made inside the stack's postgres container is restored
 * inside it, where the version is the server's own.
 */
export function wayBack(backup: BackupResult, databaseUrl: string): string[] {
  const file = shellWord(backup.path);
  const lines: string[] = [];
  if (backup.via === "docker") {
    const { user, database } = connectionOf(databaseUrl);
    lines.push(
      "To go back, stop the server, then run this in the openbot folder:",
    );
    lines.push(
      `  docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U ${shellWord(user)} -d ${shellWord(database)} < ${file}`,
    );
  } else {
    lines.push(
      "To go back, stop the server, then run this with DATABASE_URL set to the address in your settings file:",
    );
    lines.push(
      `  pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" ${file}`,
    );
  }
  lines.push(
    "  and set the settings file back to no sign-in (no provider, OPENBOT_SINGLE_USER=true). The backup also",
  );
  lines.push("  undoes anything written after it was taken.");
  return lines;
}

async function execute(
  parsed: Parsed,
  environment: Record<string, string | undefined>,
  io: Io,
  options: Options,
): Promise<number> {
  const config = adoptionConfig(environment);
  const address = targetAddress(parsed.to);

  const database = createDatabase(config.databaseUrl, { max: 1 });
  try {
    const plan = await readPlan(database, address);

    // Nothing left to move is an answer, and a good one: it is what a second run finds. It does not
    // need the server stopped or the address checked, because it changes nothing.
    if (plan.total === 0 && plan.blockers.length === 0) {
      io.out(nothingToMove(plan, address));
      io.out(databaseLine(config.databaseUrl));
      return EXIT.ok;
    }

    const problems = [
      ...(await addressProblems(config, address, database)),
      ...(await serverProblems(config, database, options.settleMs)),
      ...plan.blockers,
    ];
    if (problems.length > 0) {
      io.err(`Nothing was written, and this cannot run yet:`);
      for (const problem of problems) io.err(`  - ${problem}`);
      return EXIT.refused;
    }

    if (!parsed.apply) {
      io.out(`This is a dry run. Nothing is written.`);
      io.out("");
      io.out(databaseLine(config.databaseUrl));
      for (const line of describePlan(plan)) io.out(line);
      for (const line of beforeYouSayYes(address)) io.out(line);
      io.out("");
      io.out("Nothing was written.");
      return EXIT.ok;
    }

    io.out(`Moving ${plan.total} rows to ${address}.`);
    io.out("");
    io.out(databaseLine(config.databaseUrl));
    for (const line of describePlan(plan)) io.out(line);

    // The way back comes first, and the move does not start without it.
    const [server] = await rowsOf(
      database,
      sql`select current_setting('server_version_num')::int as version,
                 extract(epoch from pg_postmaster_start_time())::bigint::text as started`,
    );
    const backup = await (options.backup ?? takeBackup)({
      databaseUrl: config.databaseUrl,
      serverMajor: Math.floor(Number(server?.version) / 10000),
      serverStartedAt: String(server?.started),
      directory: resolve(
        parsed.backupDir ??
          options.backupDirectory ??
          resolve(OPENBOT, ".logs"),
      ),
      composeDirectory: OPENBOT,
      pgDump: environment.PG_DUMP?.trim() || undefined,
      spawn: options.spawn,
    });
    io.out(
      `Backup of the whole database: ${backup.path} (${backup.bytes} bytes, readable only by you).`,
    );
    io.out(
      "  It holds every secret in the database. Keep it private, and delete it when you are sure you will not go back.",
    );
    io.out("");
    // Written before the move, so that nothing after the commit can fail on the way to saying so.
    const goingBack = wayBack(backup, config.databaseUrl);

    let applied: Awaited<ReturnType<typeof applyAdoption>>;
    try {
      applied = await applyAdoption(database, {
        config,
        address,
        expected: plan,
        backupName: backup.name,
        settleMs: options.settleMs,
        lockTimeoutMs: options.lockTimeoutMs,
        checkpoint: options.checkpoint,
      });
    } catch (error) {
      // Whatever went wrong, the person is told where the way back is: after a refusal it is a copy
      // they may delete, and after a failure nobody can be sure of (a connection lost at the commit)
      // it is the only thing that undoes the move.
      io.err(`The backup taken before the move is at ${backup.path}.`);
      throw error;
    }

    io.out(`Done. ${applied.total} rows now belong to ${address}.`);
    io.out(
      `  ${SOURCE_ID} owns nothing now. Its row, and every line of the audit trail, are still there.`,
    );
    io.out("");
    io.out(
      "Next: start the server and sign in as that address. The sign-in finds the account this made.",
    );
    io.out("");
    for (const line of goingBack) io.out(line);
    return EXIT.ok;
  } finally {
    await database.$client.close();
  }
}

export async function run(
  argv: readonly string[],
  environment: Record<string, string | undefined>,
  io: Io,
  options: Options = {},
): Promise<number> {
  const parsed = parseArguments(argv);
  if ("error" in parsed) {
    io.err(parsed.error);
    return EXIT.usage;
  }
  if (parsed.help) {
    io.out(USAGE);
    return EXIT.ok;
  }
  if (parsed.to === undefined) {
    io.err(
      "Say whose data this becomes: --to you@example.com (the address you will sign in with). Run it with --help.",
    );
    return EXIT.usage;
  }
  try {
    return await execute(parsed, environment, io, options);
  } catch (error) {
    if (error instanceof Refusal) {
      io.err(`Nothing was changed. ${error.message}`);
      return EXIT.refused;
    }
    io.err(
      `The tool stopped on an unexpected error. A move that had not finished is undone by the database, so nothing is half done: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT.failed;
  }
}

/** What the script calls. */
export function main(
  argv: readonly string[],
  environment: Record<string, string | undefined>,
) {
  const interrupted = () => {
    console.error(
      "Interrupted. A move that had not been committed is undone by the database. Run the dry run again to see where things stand.",
    );
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  return run(argv, environment, {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
