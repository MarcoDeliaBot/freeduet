/**
 * The command line of `scripts/adopt-single-user-data.ts`: read the arguments, read the settings,
 * say what would happen, and refuse in plain words when it cannot.
 *
 * RUN BY THE PERSON, ON PURPOSE. Nothing in the server imports this (a test fails if it does), no
 * route calls it, and no start-up step runs it. It is a program somebody types, on the machine the
 * database is on, with the same settings file the server reads.
 *
 * WITH NO FLAG BESIDES `--to`, IT WRITES NOTHING. That is the default and it is the dry run: it
 * answers every question the move would, prints what would move and what the person should know
 * before saying yes, and exits. Exit codes: 0 done or nothing to do, 1 refused (the message says
 * what to fix), 2 the command line was wrong, 3 an unexpected failure (nothing was changed).
 */
import { createDatabase } from "../../db/client";
import { type Plan, readPlan } from "./plan";
import {
  addressProblems,
  adoptionConfig,
  Refusal,
  serverProblems,
  targetAddress,
} from "./preconditions";
import { SOURCE_EMAIL, SOURCE_ID } from "./registry";

export const EXIT = { ok: 0, refused: 1, usage: 2, failed: 3 } as const;

export type Io = {
  out: (line: string) => void;
  err: (line: string) => void;
};

export type Options = {
  /** How long a closing connection is given to finish before it counts as the server still running. */
  settleMs?: number;
};

export type Parsed = {
  to: string | undefined;
  help: boolean;
};

export const USAGE = `Moves what the person who had no sign-in owns to the account you will sign in with.

  bun scripts/adopt-single-user-data.ts --to you@example.com

Run it from the openbot folder, with the same .env the server uses, after you have turned the
sign-in provider on in that file and stopped the server and the worker. With only --to it writes
nothing: it says what would move and what you should know before you say yes.`;

/** The arguments, or the sentence that says what is wrong with them. */
export function parseArguments(
  argv: readonly string[],
): Parsed | { error: string } {
  const parsed: Parsed = { to: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
    } else if (argument === "--to") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--"))
        return { error: "--to needs an address: --to you@example.com" };
      parsed.to = value;
      index += 1;
    } else if (argument.startsWith("--to=")) {
      parsed.to = argument.slice("--to=".length);
    } else {
      return {
        error: `${argument} is not something this tool knows. Run it with --help.`,
      };
    }
  }
  return parsed;
}

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

/** What the dry run says, as lines, for a plan that can run. */
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

async function dryRun(
  parsed: Parsed,
  environment: Record<string, string | undefined>,
  io: Io,
  options: Options,
): Promise<number> {
  const config = adoptionConfig(environment);
  const address = targetAddress(parsed.to);

  const database = createDatabase(config.databaseUrl, { max: 1 });
  try {
    const problems = [
      ...(await addressProblems(config, address, database)),
      ...(await serverProblems(config, database, options.settleMs)),
    ];
    const plan = await readPlan(database, address);
    problems.push(...plan.blockers);

    if (problems.length > 0) {
      io.err(`Nothing was written, and this cannot run yet:`);
      for (const problem of problems) io.err(`  - ${problem}`);
      return EXIT.refused;
    }
    if (plan.total === 0) {
      io.out(
        plan.earlier
          ? `Nothing to move: ${SOURCE_EMAIL} owns nothing now, and the data was moved to ${address} on ${plan.earlier.at}.`
          : `Nothing to move: ${SOURCE_EMAIL} owns nothing in this database.`,
      );
      return EXIT.ok;
    }

    io.out(`This is a dry run. Nothing is written.`);
    io.out("");
    for (const line of describePlan(plan)) io.out(line);
    io.out(
      "Nothing was written. The move itself is not part of this version of the tool yet.",
    );
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
    return await dryRun(parsed, environment, io, options);
  } catch (error) {
    if (error instanceof Refusal) {
      io.err(`Nothing was written. ${error.message}`);
      return EXIT.refused;
    }
    io.err(
      `The tool stopped on an unexpected error, and nothing was changed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT.failed;
  }
}

/** What the script calls. */
export function main(
  argv: readonly string[],
  environment: Record<string, string | undefined>,
) {
  return run(argv, environment, {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
