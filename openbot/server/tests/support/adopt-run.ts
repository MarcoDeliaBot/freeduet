// server/tests/support/adopt-run.ts
//
// The adoption command as the person runs it, for the tests that are about what it does to the data:
// the real `run()`, against the world's database, with the world's "server" stopped around it (the
// command refuses while anything else is connected) and the backup stood in for. The real backup is
// single-user-adoption-backup.test.ts's subject.
import type {
  BackupRequest,
  BackupResult,
} from "../../src/freeduet/adopt/backup";
import { type Options, run } from "../../src/freeduet/adopt/command";
import { PERSON_ADDRESS, type World } from "./single-user-world";

export type Env = Record<string, string | undefined>;
export type Ran = { code: number; out: string; err: string };

/** The backup the tests stand in with: it records that it was asked, and returns a name. */
export function fakeBackup() {
  const calls: BackupRequest[] = [];
  const backup = async (request: BackupRequest): Promise<BackupResult> => {
    calls.push(request);
    return {
      path: "/nowhere/fake.dump",
      name: "fake.dump",
      bytes: 1,
      via: "pg_dump",
    };
  };
  return { calls, backup };
}

/** One run of the command, with what it printed. */
export async function invoke(
  argv: string[],
  environment: Env,
  options: Options,
): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    argv,
    environment,
    { out: (line) => out.push(line), err: (line) => err.push(line) },
    { settleMs: 0, ...options },
  );
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export const MOVE_ARGUMENTS = ["--to", PERSON_ADDRESS, "--apply", "--yes"];

/** The move as the person runs it: server stopped, backup stood in for. */
export function moveWhileStopped(
  world: World,
  options: Options,
  environment?: Env,
  argv: string[] = MOVE_ARGUMENTS,
) {
  return world.whileStopped(() =>
    invoke(argv, environment ?? world.environment(), options),
  );
}
