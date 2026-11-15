import { afterEach, describe, expect, test as bunTest } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * `scripts/update.sh` on a machine that is not there.
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT. The script runs in a real git checkout (a clone of a bare
 * repository made here, with two release tags and a commit after them), so every git decision in it
 * is the real git's: what is newest, what moves forward, what is refused. Everything else it runs is
 * a fake on a PATH that holds nothing but those fakes and symlinks to the real coreutils: `docker`
 * (compose, `inspect` and the labels Compose puts on a container, and psql, pg_dump and pg_restore
 * inside the postgres container), `bun`, `curl`, `sleep`, `df`, `stat`, `rm` (the real one, which can
 * end the run on cue), and the checkout's own `scripts/start.sh` and `scripts/stop.sh`. `git` is a spy
 * that records and then runs the real one, and can be told to fail one subcommand. The fakes keep a
 * small model in a state directory: a stack that is up or down, a database that is a few lines of text,
 * a role password, a mark in the checkout that says which version is there. A machine built with
 * `twoStacks` has a second stack from the same checkout (project freeduet-eval, `.env.eval`), with a
 * model of its own, which is how a run for one is shown not to touch the other.
 *
 * So these tests prove the command's DECISIONS and its ORDER: what it refuses, what it changes only
 * after the copy exists, what it undoes and in which order, which exit code each ending has, that
 * nothing it prints or runs carries a secret, that the commands it prints for the person really do
 * the job. They do not prove that a real Docker, a real `pg_dump` or the real `start.sh` behave as the
 * fakes do. The restore flags were checked against a real PostgreSQL 16 when this was written
 * (docs/design/update-and-go-back.md); the whole command has not been run on a real installation.
 *
 * Nothing in here runs `shellcheck`, which CI does not have.
 */

const scriptsDirectory = import.meta.dir;
const realScript = join(scriptsDirectory, "update.sh");
const bash = Bun.which("bash") as string;
const realGit = Bun.which("git") as string;
const slow = 60_000;

/**
 * Every test starts bash, which starts dozens of processes. The longest takes under two seconds on a
 * quiet machine; the limit bun gives by default is five, and a loaded two-core runner is slower than a
 * quiet one, so each test gets the long limit unless it names its own.
 */
const test = (name: string, run: () => Promise<void>, timeout = slow) =>
  bunTest(name, run, timeout);

// The real programs the script and its fakes use, linked in beside the fakes. Nothing else is on the PATH.
const REAL_TOOLS = [
  "awk",
  "basename",
  "bash",
  "cat",
  "chmod",
  "cmp",
  "cp",
  "cut",
  "date",
  "dirname",
  "env",
  "grep",
  "head",
  "ln",
  "mkdir",
  "mv",
  "rmdir",
  "sed",
  "seq",
  "sha256sum",
  "tail",
  "touch",
  "tr",
  "wc",
];

// Secrets that must never be printed, logged or put on a command line. They are in `.env` and in the
// database model, so a leak shows as one of these strings somewhere it should not be.
const CANARIES = {
  postgresPassword: "canary-pg-password-7f3a9c",
  keyEncryptionKey: "canary-key-encryption-key-91bc3d",
  computerToken: "canary-computer-token-55de0a",
  databasePassword: "canary-db-password-0c1d77",
};
const OLD_VERIFIER =
  "SCRAM-SHA-256$4096:b2xkc2FsdG9sZHNhbHQ=$b2xkc3RvcmVka2V5:b2xkc2VydmVya2V5";
const NEW_VERIFIER =
  "SCRAM-SHA-256$4096:bmV3c2FsdG5ld3NhbHQ=$bmV3c3RvcmVka2V5:bmV3c2VydmVya2V5";
const EVAL_VERIFIER =
  "SCRAM-SHA-256$4096:ZXZhbHNhbHRldmFsc2E=$ZXZhbHN0b3JlZGtleQ==:ZXZhbHNlcnZlcmtleQ==";
const SECRETS = [
  ...Object.values(CANARIES),
  OLD_VERIFIER,
  NEW_VERIFIER,
  EVAL_VERIFIER,
];

const ENV_FILE = [
  `POSTGRES_PASSWORD=${CANARIES.postgresPassword}`,
  `KEY_ENCRYPTION_KEY=${CANARIES.keyEncryptionKey}`,
  `COMPUTER_TOKEN=${CANARIES.computerToken}`,
  `DATABASE_URL=postgres://openbot:${CANARIES.databasePassword}@localhost:5432/openbot`,
  "SERVER_PORT=3001",
  "APP_PORT=3010",
  "",
].join("\n");

// The second stack of a machine, from the same checkout: its own Compose project, ports and database.
const EVAL_ENV_FILE = [
  `POSTGRES_PASSWORD=${CANARIES.postgresPassword}`,
  `KEY_ENCRYPTION_KEY=${CANARIES.keyEncryptionKey}`,
  `COMPUTER_TOKEN=${CANARIES.computerToken}`,
  `DATABASE_URL=postgres://openbot:${CANARIES.databasePassword}@localhost:5442/openbot`,
  "COMPOSE_PROJECT_NAME=freeduet-eval",
  "SERVER_PORT=3101",
  "APP_PORT=3110",
  "POSTGRES_PORT=5442",
  "",
].join("\n");

const START_DB = "tables=3\njournal=7\nrows=42\n";
const EVAL_DB = "tables=3\njournal=7\nrows=7\nstack=eval\n";

// ---------------------------------------------------------------------------------------------------
// The fakes
// ---------------------------------------------------------------------------------------------------

// The checkout's own scripts. They read the mark of the version that is checked out, and keep the
// model: what is up, what the database holds, who is connected to it. A machine with a second stack
// (project freeduet-eval, from the same checkout) keeps that stack's model in `$STATE/eval`; which one a
// script is about is decided as Compose decides it, by the project name the environment or the settings
// file gives.
const WHICH_STACK = `project="\${COMPOSE_PROJECT_NAME:-}"
if [ -z "$project" ]; then
  project="$(grep -E '^COMPOSE_PROJECT_NAME=' "$root/openbot/\${OPENBOT_ENV_FILE:-.env}" 2>/dev/null | tail -1 | cut -d= -f2-)"
fi
S="$STATE"
if [ "$project" = freeduet-eval ] && [ -d "$STATE/eval" ]; then S="$STATE/eval"; fi
`;

const FAKE_START = `#!/bin/sh
root="$(cd "$(dirname "$0")/.." && pwd)"
mark="$(cat "$root/mark")"
${WHICH_STACK}echo "start.sh [mark=$mark]" >> "$STATE/calls.log"
echo "start.sh OPENBOT_ENV_FILE=\${OPENBOT_ENV_FILE:-}" >> "$STATE/env-seen.log"
echo "  (fake start.sh on $mark)"
if [ "$mark" != old ]; then
  sed -e 's/^tables=.*/tables=4/' -e 's/^journal=.*/journal=8/' "$S/db" > "$S/db.new"
  echo migrated=1 >> "$S/db.new"
  mv "$S/db.new" "$S/db"
fi
if [ -f "$STATE/start-rotates-password-$mark" ]; then
  cp "$STATE/new-verifier" "$S/role-password"
fi
if [ -f "$STATE/start-writes-env-$mark" ]; then
  echo "WRITTEN_BY_START=value-from-$mark" >> "$root/openbot/.env"
fi
if [ -f "$STATE/start-corrupts-dump-$mark" ]; then
  for f in "$HOME"/.freeduet/updates/update-*/database.dump; do echo CORRUPT >> "$f"; done
fi
if [ -f "$STATE/start-breaks-list-$mark" ]; then touch "$STATE/list-fails"; fi
if [ -f "$STATE/start-deletes-dump-$mark" ]; then rm -f "$HOME"/.freeduet/updates/update-*/database.dump; fi
if [ -f "$STATE/start-fails-$mark" ]; then
  echo "fake start.sh: refusing to finish $mark" >&2
  exit 1
fi
echo up > "$S/stack"
echo up > "$S/postgres"
echo 3 > "$S/connections"
if [ -f "$STATE/interrupt-in-start-$mark" ]; then kill -TERM "$(cat "$root/openbot/.logs/update.lock/pid")"; fi
exit 0
`;

const FAKE_STOP = `#!/bin/sh
root="$(cd "$(dirname "$0")/.." && pwd)"
mark="$(cat "$root/mark")"
${WHICH_STACK}echo "stop.sh [mark=$mark]" >> "$STATE/calls.log"
echo "stop.sh OPENBOT_ENV_FILE=\${OPENBOT_ENV_FILE:-}" >> "$STATE/env-seen.log"
echo "  (fake stop.sh on $mark)"
n=$(( $(cat "$STATE/stop-count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STATE/stop-count"
if [ -f "$STATE/stop-fails" ] || [ "$(cat "$STATE/stop-fails-on" 2>/dev/null)" = "$n" ]; then
  echo "fake stop.sh: failing" >&2
  exit 1
fi
echo down > "$S/stack"
echo 0 > "$S/connections"
if [ -f "$STATE/stop-leaves-postgres" ]; then echo up > "$S/postgres"; else echo down > "$S/postgres"; fi
rm -f "$STATE/sleeps-down" "$STATE/watchdog-fired"
if [ "$(cat "$STATE/watchdog-on-stop" 2>/dev/null)" = "$n" ]; then touch "$STATE/watchdog-armed"; else rm -f "$STATE/watchdog-armed"; fi
if [ -f "$STATE/interrupt-in-stop" ]; then kill -TERM "$(cat "$root/openbot/.logs/update.lock/pid")"; fi
exit 0
`;

const FAKES: Record<string, string> = {
  // Records, and is the real git, unless a subcommand is listed in the state file `git-fails`.
  git: `#!/bin/sh
dir=""
if [ "$1" = -C ]; then dir="$2"; shift 2; fi
printf 'git %s\\n' "$*" >> "$STATE/calls.log"
sub=""; skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in
    -c) skip=1 ;;
    -*) ;;
    *) sub="$a"; break ;;
  esac
done
if [ -f "$STATE/git-fails" ] && grep -Fx "$sub" "$STATE/git-fails" >/dev/null; then
  echo "fake git: $sub fails here" >&2
  exit 1
fi
if [ -n "$dir" ]; then exec "$REAL_GIT" -C "$dir" "$@"; fi
exec "$REAL_GIT" "$@"
`,
  bun: `#!/bin/sh
mark="$(cat "$FAKE_REPO/mark")"
printf 'bun %s [mark=%s]\\n' "$*" "$mark" >> "$STATE/calls.log"
if [ -f "$STATE/bun-fails-$mark" ]; then
  echo "fake bun: the install failed" >&2
  exit 1
fi
if [ -f "$STATE/bun-overwrites-update" ]; then
  printf 'echo "overwritten under bash"\\nexit 99\\n' > "$FAKE_REPO/openbot/scripts/update.sh"
fi
exit 0
`,
  // The two ports of each stack: 3001 and 3010 for the person's, 3101 and 3110 for the second one.
  curl: `#!/bin/sh
for a in "$@"; do url="$a"; done
echo "$url" >> "$STATE/curl.log"
mark="$(cat "$FAKE_REPO/mark" 2>/dev/null || echo none)"
S="$STATE"
case "$url" in
  http://localhost:3101/*|http://localhost:3110/*)
    if [ ! -d "$STATE/eval" ]; then echo "curl: (7) Failed to connect" >&2; exit 7; fi
    S="$STATE/eval" ;;
esac
stack="$(cat "$S/stack")"
case "$url" in
  http://localhost:3001/api/capabilities|http://localhost:3101/api/capabilities)
    if [ "$stack" = up ] && [ ! -f "$STATE/api-down-$mark" ]; then echo '{"durableHistory":true}'; exit 0; fi ;;
  http://localhost:3010/|http://localhost:3110/)
    if [ "$stack" = up ] && [ ! -f "$STATE/app-down-$mark" ]; then echo '<html><head><meta name="openbot" content="app"></head></html>'; exit 0; fi ;;
esac
echo "curl: (7) Failed to connect" >&2
exit 7
`,
  // Nothing waits. A watchdog is modelled here: armed by the Nth stop, it starts the stack once
  // that many sleeps after it. And a lock whose owner is about to write its process number: the Nth
  // sleep writes it.
  sleep: `#!/bin/sh
printf 'sleep %s\\n' "$*" >> "$STATE/sleep.log"
if [ -f "$STATE/watchdog-armed" ] && [ ! -f "$STATE/watchdog-fired" ] && [ "$(cat "$STATE/stack")" = down ]; then
  n=$(( $(cat "$STATE/sleeps-down" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$STATE/sleeps-down"
  if [ "$n" -ge "$(cat "$STATE/watchdog-after")" ]; then
    echo up > "$STATE/stack"; echo up > "$STATE/postgres"; echo 3 > "$STATE/connections"
    touch "$STATE/watchdog-fired"
    echo "(a watchdog started the stack)" >> "$STATE/calls.log"
  fi
fi
if [ -f "$STATE/lock-pid-after" ]; then
  n=$(( $(cat "$STATE/lock-sleeps" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$STATE/lock-sleeps"
  if [ "$n" -ge "$(cat "$STATE/lock-pid-after")" ] && [ -d "$FAKE_REPO/openbot/.logs/update.lock" ]; then
    cat "$STATE/lock-pid-value" > "$FAKE_REPO/openbot/.logs/update.lock/pid"
  fi
fi
exit 0
`,
  // The real rm. Where the state file says so, it first ends the run the way a Ctrl-C (TERM) or a
  // crash (USR1) would, while an older copy is being removed: the only place this script removes a
  // folder that an older run made.
  rm: `#!/bin/sh
if [ -f "$STATE/signal-in-prune" ]; then
  case "$*" in
    *update-2020*)
      sig="$(cat "$STATE/signal-in-prune")"
      "$REAL_RM" -f "$STATE/signal-in-prune"
      kill -"$sig" "$(cat "$FAKE_REPO/openbot/.logs/update.lock/pid")"
      ;;
  esac
fi
exec "$REAL_RM" "$@"
`,
  df: `#!/bin/sh
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "fake 100000000 1000 $(cat "$STATE/df-available") 1% /"
`,
  // The real stat, unless the state says this disk does not keep permissions.
  stat: `#!/bin/sh
if [ -f "$STATE/stat-lies" ]; then echo 755; exit 0; fi
exec "$REAL_STAT" "$@"
`,
  // `docker inspect` answers the labels Compose puts on a container, from the container's own name
  // (fakepg-<project>); state files in the stack's folder say what a label holds when a test needs it
  // to be something else, or says it cannot be read.
  docker: `#!/bin/sh
if [ "$1" = inspect ]; then
  shift
  fmt=""; id=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --format) fmt="$2"; shift 2 ;;
      *) id="$1"; shift ;;
    esac
  done
  printf 'docker inspect %s\\n' "$id" >> "$STATE/calls.log"
  project="\${id#fakepg-}"
  S="$STATE"
  if [ "$project" = freeduet-eval ] && [ -d "$STATE/eval" ]; then S="$STATE/eval"; fi
  if [ -f "$STATE/inspect-fails" ]; then echo "Error: No such object: $id" >&2; exit 1; fi
  key="$(printf '%s' "$fmt" | sed -n 's/.*index \\.Config\\.Labels "\\([^"]*\\)".*/\\1/p')"
  case "$key" in
    com.docker.compose.project)
      if [ -f "$S/label-project" ]; then cat "$S/label-project"; else echo "$project"; fi ;;
    com.docker.compose.project.working_dir)
      if [ -f "$S/label-working-dir" ]; then cat "$S/label-working-dir"; else echo "$FAKE_REPO/openbot"; fi ;;
    com.docker.compose.project.config_files)
      if [ -f "$S/label-config-files" ]; then cat "$S/label-config-files"; else echo "$FAKE_REPO/openbot/docker-compose.yml"; fi ;;
    *) echo "fake docker: label not expected: $key" >&2; exit 1 ;;
  esac
  exit 0
fi
if [ "$1" != compose ]; then echo "fake docker: not expected: $*" >&2; exit 1; fi
shift
envfile=""
if [ "$1" = --env-file ]; then envfile="$2"; shift 2; fi
if [ -n "$envfile" ]; then
  printf 'docker compose --env-file %s %s\\n' "$envfile" "$*" >> "$STATE/calls.log"
else
  printf 'docker compose %s\\n' "$*" >> "$STATE/calls.log"
fi
# Which Compose project this call is for, as Compose decides it: the environment first, then the
# settings file (--env-file, or .env in the folder it runs in), then the name of the folder.
project="\${COMPOSE_PROJECT_NAME:-}"
if [ -z "$project" ]; then
  project="$(grep -E '^COMPOSE_PROJECT_NAME=' "\${envfile:-.env}" 2>/dev/null | tail -1 | cut -d= -f2-)"
fi
[ -n "$project" ] || project=openbot
S="$STATE"
if [ "$project" = freeduet-eval ] && [ -d "$STATE/eval" ]; then S="$STATE/eval"; fi
up() { [ "$(cat "$S/stack")" = up ] || [ "$(cat "$S/postgres")" = up ]; }
case "$1" in
  version) echo "Docker Compose version v2.99.0"; exit 0 ;;
  ps)
    case " $* " in
      *" postgres "*)
        if up; then
          echo "fakepg-$project"
          if [ -f "$STATE/ps-two-postgres" ]; then echo "fakepg-$project-2"; fi
        fi ;;
      *) if up; then echo fakecontainer; fi ;;
    esac
    exit 0 ;;
  up)
    if [ -f "$STATE/postgres-up-fails" ]; then echo "fake compose: postgres would not start" >&2; exit 1; fi
    echo up > "$S/postgres"
    exit 0 ;;
  exec) ;;
  *) echo "fake docker: not expected: compose $*" >&2; exit 1 ;;
esac
shift
if [ "$1" = -T ]; then shift; fi
if [ "$1" != postgres ]; then echo "fake docker: exec on $1" >&2; exit 1; fi
shift
if ! up; then echo 'service "postgres" is not running' >&2; exit 1; fi
prog="$1"; shift
case "$prog" in
  psql)
    sql=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -c) sql="$2"; shift 2 ;;
        -U|-d|-v) shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -z "$sql" ]; then
      n=$(( $(cat "$STATE/psql-stdin-count" 2>/dev/null || echo 0) + 1 ))
      echo "$n" > "$STATE/psql-stdin-count"
      cat > "$STATE/psql-stdin-$n"
      input="$(cat "$STATE/psql-stdin-$n")"
      printf 'psql: %s bytes on standard input, not logged\\n' "$(wc -c < "$STATE/psql-stdin-$n" | tr -d ' ')" >> "$STATE/calls.log"
      if [ -f "$STATE/psql-stdin-fails" ]; then echo "fake psql: failing" >&2; exit 1; fi
      case "$input" in
        "ALTER ROLE"*"PASSWORD NULL"*) : > "$S/role-password" ;;
        "ALTER ROLE"*) printf '%s\\n' "$input" | sed "s/^[^']*'//; s/'[^']*$//" > "$S/role-password" ;;
      esac
      exit 0
    fi
    case "$sql" in
      "select 1") echo 1 ;;
      *pg_stat_activity*) cat "$S/connections" ;;
      *pg_database_size*) cat "$S/db-size" ;;
      *information_schema.tables*) grep '^tables=' "$S/db" | cut -d= -f2 ;;
      *__drizzle_migrations*)
        if [ -f "$STATE/no-journal" ]; then echo 'ERROR:  relation "drizzle.__drizzle_migrations" does not exist' >&2; exit 1; fi
        grep '^journal=' "$S/db" | cut -d= -f2 ;;
      *rolpassword*)
        if [ -f "$STATE/role-unreadable" ]; then echo "ERROR:  permission denied" >&2; exit 1; fi
        cat "$S/role-password" ;;
      *) echo "fake psql: not expected: $sql" >&2; exit 1 ;;
    esac
    exit 0 ;;
  pg_dump)
    case " $* " in *" -Fc "*) ;; *) echo "fake pg_dump: not expected without -Fc: $*" >&2; exit 1 ;; esac
    case " $* " in *" -C "*) ;; *) echo "fake pg_dump: not expected without -C: $*" >&2; exit 1 ;; esac
    if [ -f "$STATE/pg_dump-fails" ]; then echo "pg_dump: error: connection failed" >&2; exit 1; fi
    if [ -f "$STATE/pg_dump-short" ]; then printf 'PGDMP'; exit 0; fi
    echo PGDMP
    cat "$S/db"
    echo '--pad--'
    head -c 600 /dev/zero | tr '\\000' '.'
    echo
    exit 0 ;;
  pg_restore)
    case " $* " in
      *" --list "*)
        cat > /dev/null
        if [ -f "$STATE/list-fails" ]; then echo "pg_restore: error: could not read the copy" >&2; exit 1; fi
        exit 0 ;;
    esac
    cat > "$S/restore-input"
    if [ "$(cat "$S/connections")" != 0 ]; then
      echo 'ERROR:  database "openbot" is being accessed by other users' >&2
      exit 1
    fi
    if [ -f "$STATE/restore-fails" ]; then echo "pg_restore: error: could not execute query" >&2; exit 1; fi
    case " $* " in
      *" --exit-on-error --clean --create --if-exists --no-owner -U openbot -d postgres "*) ;;
      *)
        printf 'tables=9\\njournal=9\\nmixed=1\\n' > "$S/db"
        echo "pg_restore: warning: errors ignored on restore: 5" >&2
        exit 1 ;;
    esac
    # A copy that is not the one that was made: --clean --create has dropped the database by the time
    # the restore finds out, as the real one does, and it stops with the database gone.
    if grep -q '^CORRUPT$' "$S/restore-input"; then
      printf 'tables=0\\njournal=none\\ndropped=1\\n' > "$S/db"
      echo "pg_restore: error: unexpected end of file" >&2
      exit 1
    fi
    # Stopped in the middle: some of the database is back, and the run is ended as a Ctrl-C would.
    if [ -f "$STATE/interrupt-in-restore" ]; then
      printf 'tables=1\\njournal=none\\nhalf=1\\n' > "$S/db"
      kill -TERM "$(cat "$FAKE_REPO/openbot/.logs/update.lock/pid")"
      exit 130
    fi
    awk 'NR == 1 { next } /^--pad--$/ { exit } { print }' "$S/restore-input" > "$S/db"
    if [ -f "$STATE/restore-corrupts" ]; then printf 'tables=99\\njournal=1\\n' > "$S/db"; fi
    exit 0 ;;
  *) echo "fake docker: not expected: exec $prog" >&2; exit 1 ;;
esac
`,
};

// ---------------------------------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------------------------------

type Result = { exitCode: number; stdout: string; stderr: string };

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

const plain = (text: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the colours the script prints
  text.replace(/\x1b\[[0-9;]*m/g, "");

/** What a failed assertion should show: the status and everything the run said. */
const outcome = (result: Result) => ({
  exitCode: result.exitCode,
  output: plain(`${result.stdout}${result.stderr}`),
});

async function exec(
  cwd: string,
  cmd: string[],
  env: Record<string, string>,
): Promise<string> {
  const child = Bun.spawn({ cmd, cwd, env, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed (${exitCode}): ${stderr}`);
  }
  return stdout.trim();
}

async function writeExecutable(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function tree(
  root: string,
  skip: string[] = [".git"],
): Promise<string[]> {
  const lines: string[] = [];
  for (const entry of (await readdir(root, { recursive: true })).sort()) {
    if (skip.some((name) => entry === name || entry.startsWith(`${name}/`))) {
      continue;
    }
    const path = join(root, entry);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      lines.push(`${entry} -> ${await readlink(path)}`);
    } else if (info.isDirectory()) {
      lines.push(`${entry}/`);
    } else {
      const digest = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
      lines.push(`${entry} ${digest}`);
    }
  }
  return lines;
}

type Options = {
  /** HEAD detached at the tag, as after `git checkout v0.1`. */
  detached?: boolean;
  /** Start from the commit after the newest release, so that the checkout is ahead of it. */
  atMain?: boolean;
  /** Also a settings file for a second stack, `.env.eval`. */
  evalEnv?: boolean;
  /** Replace the lines of `.env`. */
  envLines?: string[];
  /**
   * The second stack of a machine: project freeduet-eval, settings file `.env.eval`, its own ports and its
   * own database, from the same checkout as the person's (project freeduet). Each has its own model.
   */
  twoStacks?: boolean;
};

async function build(options: Options = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "freeduet-update-")));
  directories.push(dir);
  const [bin, state, home, origin, seed, repo] = [
    "bin",
    "state",
    "home",
    "origin.git",
    "seed",
    "work",
  ].map((name) => join(dir, name)) as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  for (const directory of [bin, state, home]) {
    await mkdir(directory, { recursive: true });
  }
  const root = join(repo, "openbot");
  const realStat = Bun.which("stat") as string;
  const realRm = Bun.which("rm") as string;

  for (const tool of REAL_TOOLS) {
    const path = Bun.which(tool);
    if (path) await symlink(path, join(bin, tool));
  }
  for (const [name, body] of Object.entries(FAKES)) {
    await writeExecutable(join(bin, name), body);
  }

  const gitEnvironment: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Tester",
    GIT_AUTHOR_EMAIL: "tester@example.invalid",
    GIT_COMMITTER_NAME: "Tester",
    GIT_COMMITTER_EMAIL: "tester@example.invalid",
  };
  const git = (cwd: string, ...args: string[]) =>
    exec(cwd, [realGit, ...args], gitEnvironment);

  const script = await readFile(realScript, "utf8");
  const requireBash = await readFile(
    join(scriptsDirectory, "require-bash.sh"),
    "utf8",
  );
  const put = async (base: string, name: string, contents: string) => {
    await mkdir(dirname(join(base, name)), { recursive: true });
    await writeFile(join(base, name), contents);
  };

  // The release 0.1, pushed to a bare repository, and the checkout cloned from it.
  await git(dir, "init", "-q", "--bare", "-b", "main", origin);
  await git(dir, "init", "-q", "-b", "main", seed);
  await git(seed, "remote", "add", "origin", origin);
  await put(seed, ".gitignore", ".env\n.env.*\n.logs/\n");
  await put(seed, "mark", "old\n");
  await put(seed, "scripts/start.sh", FAKE_START);
  await put(seed, "scripts/stop.sh", FAKE_STOP);
  await put(seed, "openbot/scripts/update.sh", script);
  await put(seed, "openbot/scripts/require-bash.sh", requireBash);
  await put(seed, "openbot/docker-compose.yml", "services: {}\n");
  await put(seed, "openbot/bun.lock", "lock v1\n");
  await git(seed, "add", "-A");
  await git(seed, "commit", "-q", "-m", "0.1");
  await git(seed, "tag", "v0.1");
  await git(seed, "push", "-q", "origin", "main", "--tags");
  await git(dir, "clone", "-q", origin, repo);

  // What comes after, which the checkout does not know until it fetches: 0.2 (a new mark, a changed
  // update.sh, a file that is new) and a commit on main after it.
  await put(seed, "mark", "new\n");
  await put(
    seed,
    "openbot/scripts/update.sh",
    script.replace(
      "#!/usr/bin/env bash\n",
      "#!/usr/bin/env bash\n# (the update.sh that 0.2 ships: a line more, so every offset below it moves)\n",
    ),
  );
  await put(seed, "new-in-0.2.txt", "added by 0.2\n");
  await git(seed, "add", "-A");
  await git(seed, "commit", "-q", "-m", "0.2");
  await git(seed, "tag", "v0.2");
  await put(seed, "mark", "next\n");
  await git(seed, "add", "-A");
  await git(seed, "commit", "-q", "-m", "after 0.2");
  await git(seed, "push", "-q", "origin", "main", "--tags");

  await writeFile(
    join(root, ".env"),
    options.envLines
      ? `${options.envLines.join("\n")}\n`
      : options.twoStacks
        ? `${ENV_FILE}COMPOSE_PROJECT_NAME=freeduet\n`
        : ENV_FILE,
  );
  if (options.twoStacks) {
    await writeFile(join(root, ".env.eval"), EVAL_ENV_FILE);
  } else if (options.evalEnv) {
    await writeFile(join(root, ".env.eval"), ENV_FILE);
  }
  if (options.atMain) {
    await git(repo, "fetch", "-q", "--tags", "origin");
    await git(repo, "merge", "-q", "--ff-only", "origin/main");
  }
  if (options.detached) await git(repo, "checkout", "-q", "--detach", "v0.1");

  const put2 = (name: string, value = "1") =>
    writeFile(join(state, name), `${value}\n`);
  await put2("stack", "up");
  await put2("postgres", "up");
  await put2("connections", "3");
  await writeFile(join(state, "db"), START_DB);
  await put2("db-size", "20000000");
  await put2("df-available", "90000000");
  await put2("role-password", OLD_VERIFIER);
  await put2("new-verifier", NEW_VERIFIER);
  const evalState = join(state, "eval");
  if (options.twoStacks) {
    await mkdir(evalState, { recursive: true });
    const evalPut = (name: string, value: string) =>
      writeFile(join(evalState, name), `${value}\n`);
    await evalPut("stack", "up");
    await evalPut("postgres", "up");
    await evalPut("connections", "2");
    await writeFile(join(evalState, "db"), EVAL_DB);
    await evalPut("db-size", "5000000");
    await evalPut("role-password", EVAL_VERIFIER);
  }

  const environment: Record<string, string> = {
    PATH: bin,
    STATE: state,
    FAKE_REPO: repo,
    REAL_GIT: realGit,
    REAL_STAT: realStat,
    REAL_RM: realRm,
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Tester",
    GIT_AUTHOR_EMAIL: "tester@example.invalid",
    GIT_COMMITTER_NAME: "Tester",
    GIT_COMMITTER_EMAIL: "tester@example.invalid",
    TERM: "dumb",
  };

  async function run(
    args: string[] = [],
    extra: Record<string, string> = {},
  ): Promise<Result> {
    const child = Bun.spawn({
      cmd: [bash, join(root, "scripts/update.sh"), ...args],
      cwd: home,
      env: { ...environment, ...extra },
      stdin: null,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  }

  const read = (path: string) => readFile(path, "utf8");
  const lines = async (name: string) =>
    (await read(join(state, name)).catch(() => ""))
      .split("\n")
      .filter((line) => line.length > 0);
  const copiesDirectory = join(home, ".freeduet", "updates");
  const copies = async () =>
    (await readdir(copiesDirectory).catch(() => [] as string[]))
      .filter((name) => name.startsWith("update-"))
      .sort();

  return {
    dir,
    repo,
    root,
    home,
    state,
    origin,
    bin,
    environment,
    copiesDirectory,
    run,
    git: (...args: string[]) => git(repo, ...args),
    head: () => git(repo, "rev-parse", "HEAD"),
    rev: (ref: string) => git(repo, "rev-parse", `${ref}^{commit}`),
    set: (name: string, value = "1") => put2(name, value),
    unset: (name: string) => rm(join(state, name), { force: true }),
    value: async (name: string) => (await read(join(state, name))).trim(),
    /** The same, for the second stack of a machine built with `twoStacks`. */
    evalSet: (name: string, value = "1") =>
      writeFile(join(evalState, name), `${value}\n`),
    evalValue: async (name: string) =>
      (await read(join(evalState, name))).trim(),
    evalDb: () => read(join(evalState, "db")),
    calls: () => lines("calls.log"),
    sleeps: () => lines("sleep.log"),
    envSeen: () => lines("env-seen.log"),
    /** What the fake curl was asked, apart from the calls: which ports a run looked at. */
    asked: () => lines("curl.log"),
    db: () => read(join(state, "db")),
    env: () => read(join(root, ".env")),
    copies,
    snapshots: async () => ({
      repo: await tree(repo),
      home: await tree(home),
    }),
  };
}

type Machine = Awaited<ReturnType<typeof build>>;

/** The calls that change something, in the order they were made. */
const CHANGES = [
  /^stop\.sh/,
  /^start\.sh/,
  /^docker compose.* up /,
  /pg_dump/,
  /pg_restore -/,
  /^psql: /,
  /^git (merge|reset|checkout|pull|rebase|stash)( |$)/,
  /^bun install/,
];
const changes = (calls: string[]) =>
  calls.filter((call) => CHANGES.some((pattern) => pattern.test(call)));

/** Each pattern must be found, in this order, after the one before it. */
function expectInOrder(calls: string[], patterns: RegExp[]) {
  let from = 0;
  for (const pattern of patterns) {
    const index = calls.findIndex(
      (call, position) => position >= from && pattern.test(call),
    );
    expect({ pattern: String(pattern), found: index >= 0 }).toEqual({
      pattern: String(pattern),
      found: true,
    });
    from = index + 1;
  }
}

/** Everything the run said or did that could have carried a secret, outside the private copy. */
async function everythingSaid(machine: Machine, result: Result) {
  return [
    result.stdout,
    result.stderr,
    (await machine.calls()).join("\n"),
    (await machine.sleeps()).join("\n"),
  ].join("\n");
}

function expectNoSecret(text: string) {
  // The canaries are made up for this file, so naming a leaked one in the failure shows nothing real.
  expect(SECRETS.filter((secret) => text.includes(secret))).toEqual([]);
}

const copyOf = async (machine: Machine) => {
  const [name] = await machine.copies();
  return join(machine.copiesDirectory, name as string);
};

// ---------------------------------------------------------------------------------------------------

describe("update.sh as a file", () => {
  test("is valid bash", async () => {
    const child = Bun.spawn({
      cmd: [bash, "-n", realScript],
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  });

  test("is made of functions and leaves from its last line, so a merge that replaces it cannot break the run", async () => {
    const source = await readFile(realScript, "utf8");
    expect(source.trimEnd().split("\n").slice(-3).join("\n")).toContain(
      'main "$@"',
    );
    expect(source).toMatch(/^main\(\) \{$/m);
    expect(source.trimEnd().endsWith("exit $?")).toBe(true);
  });

  test("never prints or traces what it handles, and does not stop on the first error", async () => {
    const code = (await readFile(realScript, "utf8"))
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    for (const forbidden of [
      /\bset\s+-[a-z]*x/,
      /xtrace/,
      /\bprintenv\b/,
      /\benv\s*\|/,
      /\bcat\s+"?\$ENV_FILE/,
      /\becho\s+"?\$\{?(verifier|password)/,
      /(^|[\s;&|(])eval\s/m,
      /\bpkill\b/,
      /\bkillall\b/,
      /^set -[a-z]*e/m,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });

  test("holds none of the values this repository used to publish as defaults", async () => {
    const source = await readFile(realScript, "utf8");
    for (const published of [
      "openbot-dev-computer-token",
      "openbot-dev-supervisor-token",
      "openbot-dev-worker-secret",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "openbot:openbot@",
    ]) {
      expect(source).not.toContain(published);
    }
  });

  test("never mentions a login or settings location of any CLI", async () => {
    const source = await readFile(realScript, "utf8");
    for (const forbidden of [
      /\.claude/,
      /claude\.json/,
      /\.credentials/,
      /CLAUDE_CONFIG_DIR/,
      /ANTHROPIC_API_KEY/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  test("--help says what it does and runs nothing", async () => {
    const machine = await build();
    const before = await machine.snapshots();
    const result = await machine.run(["--help"]);
    expect(outcome(result).exitCode).toBe(0);
    expect(plain(result.stdout)).toContain(
      "Usage: bash openbot/scripts/update.sh",
    );
    expect(plain(result.stdout)).toContain("20 you have to finish by hand");
    expect(await machine.calls()).toEqual([]);
    expect(await machine.snapshots()).toEqual(before);
  });
});

describe("what it is asked", () => {
  for (const [name, args, message] of [
    [
      "an option it does not know",
      ["--frobnicate"],
      "Unknown argument: --frobnicate",
    ],
    ["--keep with no number", ["--keep"], "--keep needs a number"],
    ["--keep with a word", ["--keep", "many"], "--keep needs a number"],
    ["--watch with a word", ["--watch", "soon"], "--watch needs a number"],
    ["--wait with zero", ["--wait", "0"], "--wait needs a number"],
    ["--to with nothing", ["--to"], "--to needs a tag"],
    ["--to followed by an option", ["--to", "--main"], "--to needs a tag"],
    ["--to and --main together", ["--to", "v0.2", "--main"], "not both"],
    [
      "--to with a name that is not a ref",
      ["--to", "v0.2; rm -rf /"],
      "not a tag, a branch or a commit",
    ],
    ["--copies with nothing", ["--copies"], "--copies needs a folder"],
  ] as [string, string[], string][]) {
    test(`refuses ${name}, and changes nothing`, async () => {
      const machine = await build();
      const before = await machine.snapshots();
      const result = await machine.run(args);
      expect(outcome(result).exitCode).toBe(1);
      expect(plain(result.stdout)).toContain(message);
      expect(plain(result.stdout)).toContain("Nothing was changed.");
      expect(await machine.calls()).toEqual([]);
      expect(await machine.snapshots()).toEqual(before);
    });
  }

  test("refuses a settings file name that is not one beside docker-compose.yml", async () => {
    const machine = await build();
    const result = await machine.run([], { OPENBOT_ENV_FILE: "../.env" });
    expect(outcome(result).exitCode).toBe(1);
    expect(plain(result.stdout)).toContain("OPENBOT_ENV_FILE must name a file");
    expect(await machine.calls()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("the update that works", () => {
  test("says each step, copies first, then stops, moves, installs, starts and checks, in that order", async () => {
    const machine = await build();
    const oldHead = await machine.head();
    // The checkout does not know the new version until the command has fetched.
    await expect(machine.rev("v0.2")).rejects.toThrow();

    const result = await machine.run();
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    const text = plain(result.stdout);
    expect(text).toContain("Updated. FreeDuet is now on v0.2");
    expect(text).toContain("answers at http://localhost:3010");

    await machine.git("fetch", "-q", "--tags", "origin");
    const v02 = await machine.rev("v0.2");
    expect(await machine.head()).toBe(v02);
    expect(await machine.head()).not.toBe(oldHead);

    expectInOrder(await machine.calls(), [
      /^git fetch --quiet --tags origin/,
      /^stop\.sh \[mark=old\]/,
      /^docker compose up -d postgres/,
      /^docker compose exec -T postgres pg_dump -U openbot -Fc -C openbot/,
      /^docker compose exec -T postgres pg_restore --list/,
      new RegExp(`^git merge --ff-only --quiet ${v02}`),
      /^bun install --frozen-lockfile \[mark=new\]/,
      /^start\.sh \[mark=new\]/,
    ]);
    // Nothing is undone, so nothing is restored and the code is not reset.
    const calls = await machine.calls();
    expect(
      calls.filter((call) => /pg_restore --exit-on-error/.test(call)),
    ).toEqual([]);
    expect(calls.filter((call) => /^git reset/.test(call))).toEqual([]);
    // The database came up to date by the start, as it does.
    expect(await machine.db()).toContain("migrated=1");
  });

  test(
    "waits 75 seconds for a watchdog unless told otherwise, and not at all for --watch 0",
    async () => {
      const waited = await build();
      expect(outcome(await waited.run())).toMatchObject({ exitCode: 0 });
      const ones = (await waited.sleeps()).filter((line) => line === "sleep 1");
      expect(ones.length).toBeGreaterThanOrEqual(75);

      const skipped = await build();
      const result = await skipped.run(["--watch", "0"]);
      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(plain(result.stdout)).toContain(
        "not waiting to see whether something starts it again",
      );
      expect((await skipped.sleeps()).length).toBeLessThan(10);
    },
    slow,
  );

  test(
    "goes to the newest release by default, to origin/main with --main, and to what --to names",
    async () => {
      const byDefault = await build();
      expect(outcome(await byDefault.run(["--watch", "0"]))).toMatchObject({
        exitCode: 0,
      });
      expect(await byDefault.head()).toBe(await byDefault.rev("v0.2"));

      const main = await build();
      const mainResult = await main.run(["--watch", "0", "--main"]);
      expect(outcome(mainResult)).toMatchObject({ exitCode: 0 });
      expect(await main.head()).toBe(await main.rev("origin/main"));
      expect(await main.head()).not.toBe(await main.rev("v0.2"));
      expect(plain(mainResult.stdout)).toContain("origin/main");

      const named = await build();
      const short = (await named.git("ls-remote", named.origin, "v0.2")).slice(
        0,
        10,
      );
      expect(
        outcome(await named.run(["--watch", "0", "--to", "v0.2"])),
      ).toMatchObject({ exitCode: 0 });
      expect((await named.head()).startsWith(short)).toBe(true);
    },
    slow,
  );

  test("moves a checkout that sits on a tag, with no branch, as well as one on a branch", async () => {
    const machine = await build({ detached: true });
    expect(
      await machine.git("symbolic-ref", "-q", "HEAD").catch(() => "detached"),
    ).toBe("detached");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expect(await machine.head()).toBe(await machine.rev("v0.2"));
    const record = await readFile(
      join(await copyOf(machine), "record.txt"),
      "utf8",
    );
    expect(record).toContain("branch=none (detached)");
  });

  test("survives its own file being replaced by the move to a version that ships a different update.sh", async () => {
    const machine = await build();
    const before = await readFile(
      join(machine.root, "scripts/update.sh"),
      "utf8",
    );
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expect(plain(result.stdout)).toContain("Updated.");
    const after = await readFile(
      join(machine.root, "scripts/update.sh"),
      "utf8",
    );
    expect(after).not.toBe(before);
    expect(after).toContain("the update.sh that 0.2 ships");
  });

  test("survives its own file being overwritten in place while it runs, after the move", async () => {
    const machine = await build();
    // The install runs after the move and rewrites, in place, the very file bash is reading.
    await machine.set("bun-overwrites-update");
    const result = await machine.run(["--watch", "0"]);
    expect(
      await readFile(join(machine.root, "scripts/update.sh"), "utf8"),
    ).toContain("overwritten under bash");
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expect(plain(result.stdout)).toContain("Updated.");
    expect(plain(result.stdout) + result.stderr).not.toContain(
      "overwritten under bash",
    );
  });

  test("works for a stack made with OPENBOT_ENV_FILE: its own settings file, copied and named", async () => {
    const machine = await build({ evalEnv: true });
    const result = await machine.run(["--watch", "0"], {
      OPENBOT_ENV_FILE: ".env.eval",
    });
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    // The scripts it runs were told which settings file is meant.
    expect(await machine.envSeen()).toEqual([
      "stop.sh OPENBOT_ENV_FILE=.env.eval",
      "start.sh OPENBOT_ENV_FILE=.env.eval",
    ]);
    const calls = await machine.calls();
    expect(
      calls.some((call) => call.startsWith("docker compose --env-file ")),
    ).toBe(true);
    expect(
      calls.filter(
        (call) =>
          call.startsWith("docker compose ") &&
          !call.includes("--env-file") &&
          call !== "docker compose version",
      ),
    ).toEqual([]);
    const folder = await copyOf(machine);
    expect(await readFile(join(folder, "record.txt"), "utf8")).toContain(
      "env_file=.env.eval",
    );
    expect(await readFile(join(folder, "env.copy"), "utf8")).toBe(ENV_FILE);
  });

  test("makes no copy and changes nothing when there is nothing newer", async () => {
    const machine = await build();
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    const before = await machine.snapshots();
    const callsBefore = (await machine.calls()).length;

    const again = await machine.run(["--watch", "0"]);
    expect(outcome(again).exitCode).toBe(0);
    expect(plain(again.stdout)).toContain("Already up to date");
    expect(changes((await machine.calls()).slice(callsBefore))).toEqual([]);
    expect(await machine.snapshots()).toEqual(before);
    expect(await machine.copies()).toHaveLength(1);
  });

  test("says there is nothing to do when the checkout is already ahead of the newest release", async () => {
    const machine = await build({ atMain: true });
    const before = await machine.snapshots();
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result).exitCode).toBe(0);
    expect(plain(result.stdout)).toContain("newer than the latest release");
    expect(changes(await machine.calls())).toEqual([]);
    expect(await machine.snapshots()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("it refuses to start, and changes nothing", () => {
  async function refused(
    machine: Machine,
    args: string[],
    message: string | RegExp,
  ) {
    const before = await machine.snapshots();
    const result = await machine.run(["--watch", "0", ...args]);
    expect(outcome(result).exitCode).toBe(1);
    expect(plain(result.stdout)).toMatch(message);
    expect(plain(result.stdout)).toContain("Nothing was changed.");
    expect(changes(await machine.calls())).toEqual([]);
    expect(await machine.snapshots()).toEqual(before);
    expect(await machine.copies()).toEqual([]);
    return result;
  }

  test("when a tracked file has been changed by hand, and names it", async () => {
    const machine = await build();
    await writeFile(
      join(machine.root, "docker-compose.yml"),
      "services: {changed: true}\n",
    );
    const result = await refused(machine, [], "changes of its own");
    expect(plain(result.stdout)).toContain("openbot/docker-compose.yml");
    // Looked at before anything was downloaded or asked of Docker.
    expect(
      (await machine.calls()).filter((call) => /^git fetch/.test(call)),
    ).toEqual([]);
  });

  test("when a change has been staged", async () => {
    const machine = await build();
    await writeFile(join(machine.root, "bun.lock"), "lock v2\n");
    await machine.git("add", "openbot/bun.lock");
    await refused(machine, [], "changes of its own");
  });

  test("when a merge is half done", async () => {
    const machine = await build();
    await writeFile(
      join(machine.repo, ".git", "MERGE_HEAD"),
      `${await machine.head()}\n`,
    );
    await refused(machine, [], "half done");
  });

  test("when a file of its own would be overwritten by the new version", async () => {
    const machine = await build();
    await writeFile(join(machine.repo, "new-in-0.2.txt"), "mine\n");
    const result = await refused(machine, [], "where git does not know them");
    expect(plain(result.stdout)).toContain("new-in-0.2.txt");
    expect(await readFile(join(machine.repo, "new-in-0.2.txt"), "utf8")).toBe(
      "mine\n",
    );
  });

  test("when the checkout has commits of its own that the new version does not have", async () => {
    const machine = await build();
    await writeFile(join(machine.repo, "mine.txt"), "mine\n");
    await machine.git("add", "mine.txt");
    await machine.git("commit", "-q", "-m", "mine");
    await refused(machine, [], "only moves forward");
  });

  test("when asked to go to a version older than where it is", async () => {
    const machine = await build({ atMain: true });
    await refused(machine, ["--to", "v0.1"], "only moves forward");
  });

  test("when what --to names does not exist", async () => {
    const machine = await build();
    await refused(machine, ["--to", "v9.9"], "Cannot find v9.9");
  });

  test("when the database does not answer", async () => {
    const machine = await build();
    await machine.set("stack", "down");
    await machine.set("postgres", "down");
    await refused(machine, [], "The database does not answer");
  });

  test("when the settings point at a database that Docker does not start here", async () => {
    for (const url of [
      "postgres://openbot:x@db.example.test:5432/openbot",
      "postgres://openbot:x@localhost:6543/openbot",
      "postgres://someone:x@localhost:5432/openbot",
      "postgres://openbot:x@localhost:5432/another",
      "not a url at all",
    ]) {
      const machine = await build({ envLines: [`DATABASE_URL=${url}`] });
      await refused(machine, [], "not the one Docker starts here");
    }
  });

  test("when the settings file is missing", async () => {
    const machine = await build();
    await rm(join(machine.root, ".env"));
    await refused(machine, [], ".env is missing");
  });

  test("when it is not a git checkout, such as an unpacked zip", async () => {
    const machine = await build();
    await rm(join(machine.repo, ".git"), { recursive: true });
    await refused(machine, [], "not a git checkout");
  });

  test("when there is no room for the copy", async () => {
    const machine = await build();
    await machine.set("df-available", "100");
    await refused(machine, [], "Not enough room for the copy");
  });

  test("when another update is running, and takes over a lock whose owner is gone", async () => {
    const live = await build();
    await mkdir(join(live.root, ".logs/update.lock"), { recursive: true });
    await writeFile(
      join(live.root, ".logs/update.lock/pid"),
      `${process.pid}\n`,
    );
    await refused(live, [], "Another update is running");

    const stale = await build();
    await mkdir(join(stale.root, ".logs/update.lock"), { recursive: true });
    await writeFile(join(stale.root, ".logs/update.lock/pid"), "2147483000\n");
    expect(outcome(await stale.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    expect(
      await lstat(join(stale.root, ".logs/update.lock")).catch(() => null),
    ).toBeNull();
  });

  test("when the disk for the copies does not keep file permissions", async () => {
    const machine = await build();
    await machine.set("stat-lies");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result).exitCode).toBe(1);
    expect(plain(result.stdout)).toContain("does not keep file permissions");
    expect(plain(result.stdout)).toContain("--copies");
    expect(changes(await machine.calls())).toEqual([]);
    expect(await machine.copies()).toEqual([]);
  });

  test("when a tool it needs is missing", async () => {
    const machine = await build();
    await rm(join(machine.bin, "bun"));
    await refused(machine, [], "bun is not installed");
  });

  test("when this computer has neither sha256sum nor shasum to check the copy with", async () => {
    const machine = await build();
    await rm(join(machine.bin, "sha256sum"));
    await refused(machine, [], "Neither sha256sum nor shasum is installed");
  });

  test("when another update has just made the lock and not yet written who it is: waits for it, and refuses once it turns out to be alive", async () => {
    const machine = await build();
    await mkdir(join(machine.root, ".logs/update.lock"), { recursive: true });
    // The owner writes its process number the second time this run sleeps.
    await machine.set("lock-pid-after", "2");
    await machine.set("lock-pid-value", String(process.pid));
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result).exitCode).toBe(1);
    expect(plain(result.stdout)).toContain(
      `Another update is running (process ${process.pid})`,
    );
    expect(changes(await machine.calls())).toEqual([]);
    expect(await machine.copies()).toEqual([]);
    // Its lock was not taken over or removed.
    expect(
      await readFile(join(machine.root, ".logs/update.lock/pid"), "utf8"),
    ).toBe(`${process.pid}\n`);
  });

  test("a lock folder that never says who owns it is taken over, after a few seconds and not before", async () => {
    const free = await build();
    expect(outcome(await free.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    const ownerless = await build();
    await mkdir(join(ownerless.root, ".logs/update.lock"), { recursive: true });
    expect(outcome(await ownerless.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    expect(
      (await ownerless.sleeps()).length - (await free.sleeps()).length,
    ).toBe(5);
  });

  test("when the repository cannot be reached and the version asked for is not downloaded", async () => {
    const machine = await build();
    await machine.set("git-fails", "fetch");
    await refused(machine, ["--to", "v0.2"], "git fetch failed");
  });

  test("and says plainly, when it cannot look for newer versions, that it could not", async () => {
    const machine = await build();
    await machine.set("git-fails", "fetch");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result).exitCode).toBe(0);
    expect(plain(result.stdout)).toContain("Could not reach the repository");
    expect(plain(result.stdout)).toContain("Nothing newer is known here");
    expect(plain(result.stdout)).not.toContain("Already up to date");
    expect(changes(await machine.calls())).toEqual([]);
  });
});

describe("--check shows the plan and changes nothing", () => {
  test("names where it is and where it would go, and the steps", async () => {
    const machine = await build();
    const before = await machine.snapshots();
    const result = await machine.run(["--check"]);
    expect(outcome(result).exitCode).toBe(0);
    const text = plain(result.stdout);
    expect(text).toContain("Where you are:   v0.1");
    expect(text).toContain("Going to:        v0.2");
    expect(text).toContain(`${machine.copiesDirectory}/update-<date and time>`);
    expect(text).toContain("Stop FreeDuet");
    expect(text).toContain("goes back");
    expect(text).toContain("Docker project:  openbot");
    expect(text).toContain(
      "Before you go on: pause anything that restarts FreeDuet by itself",
    );
    expect(text).toContain("This was only a look. Nothing was changed.");
    // The one thing it asks the network for, and nothing that changes anything here.
    expect(changes(await machine.calls())).toEqual([]);
    expect(await machine.snapshots()).toEqual(before);
    expect(await machine.copies()).toEqual([]);
    expect(
      await lstat(join(machine.root, ".logs")).catch(() => null),
    ).toBeNull();
    expect(await machine.head()).toBe(await machine.rev("v0.1"));
  });

  test("says to pause whatever restarts FreeDuet by itself, in the plan and before it stops anything, and does not ask for an answer", async () => {
    const machine = await build();
    // No input at all: a question would hang or fail here, so the run ending 0 is the proof.
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    const text = plain(result.stdout);
    const advice = text.indexOf(
      "Before you go on: pause anything that restarts FreeDuet by itself (a watchdog or a service).",
    );
    expect(advice).toBeGreaterThan(-1);
    expect(advice).toBeLessThan(text.indexOf("1  Stopping FreeDuet"));
    expect(
      text.indexOf("5. Check that the app and the API answer"),
    ).toBeLessThan(advice);
  });

  test("refuses what the real run would refuse", async () => {
    const machine = await build();
    await writeFile(
      join(machine.root, "docker-compose.yml"),
      "services: {changed: true}\n",
    );
    const result = await machine.run(["--check"]);
    expect(outcome(result).exitCode).toBe(1);
    expect(plain(result.stdout)).toContain("changes of its own");
  });
});

// ---------------------------------------------------------------------------------------------------

describe("the copy", () => {
  test("is in a private folder with the date in its name: folder 700, every file 600", async () => {
    const machine = await build();
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    const [name] = await machine.copies();
    expect(name).toMatch(/^update-\d{8}-\d{6}$/);
    const folder = join(machine.copiesDirectory, name as string);
    expect((await stat(folder)).mode & 0o777).toBe(0o700);
    const files = await readdir(folder);
    expect(files.sort()).toEqual([
      "database.dump",
      "env.copy",
      "record.txt",
      "role-password.sql",
    ]);
    for (const file of files) {
      expect({
        file,
        mode: (await stat(join(folder, file))).mode & 0o777,
      }).toEqual({ file, mode: 0o600 });
    }
    // The folders it made on the way are private too.
    expect((await stat(join(machine.home, ".freeduet"))).mode & 0o777).toBe(
      0o700,
    );
    expect((await stat(machine.copiesDirectory)).mode & 0o777).toBe(0o700);
  });

  test("holds the settings as they were, a database copy that reads back, and what it needs to go back", async () => {
    const machine = await build();
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    const folder = await copyOf(machine);
    expect(await readFile(join(folder, "env.copy"), "utf8")).toBe(ENV_FILE);
    const dump = await readFile(join(folder, "database.dump"), "utf8");
    expect(dump.startsWith("PGDMP\n")).toBe(true);
    expect(dump).toContain(START_DB);
    const record = await readFile(join(folder, "record.txt"), "utf8");
    expect(record).toContain(`commit=${await machine.rev("v0.1")}`);
    expect(record).toContain(`target=${await machine.rev("v0.2")}`);
    expect(record).toContain(`repository=${machine.repo}`);
    expect(record).toContain("fingerprint=tables=3 journal=7");
    expect(record).toContain("result=updated");
    expect(await readFile(join(folder, "role-password.sql"), "utf8")).toBe(
      `ALTER ROLE openbot WITH PASSWORD '${OLD_VERIFIER}';\n`,
    );
  });

  test("is taken with nothing else running, so nothing the person did can be missing from it", async () => {
    const machine = await build();
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    const calls = await machine.calls();
    const stop = calls.findIndex((call) => /^stop\.sh/.test(call));
    const database = calls.findIndex((call) =>
      /^docker compose up -d postgres/.test(call),
    );
    const dump = calls.findIndex((call) => /pg_dump/.test(call));
    expect(stop).toBeGreaterThan(-1);
    expect(database).toBeGreaterThan(stop);
    expect(dump).toBeGreaterThan(database);
    // Asked of the database that nobody else is connected, between the stop and the dump.
    const between = calls.slice(stop, dump).join("\n");
    expect(between).toContain("pg_stat_activity");
  });

  test("uses -C so that going back can drop and make the database again", async () => {
    const machine = await build();
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    expect(
      (await machine.calls()).filter((call) => /pg_dump/.test(call)),
    ).toEqual([
      "docker compose exec -T postgres pg_dump -U openbot -Fc -C openbot",
    ]);
  });

  test("is checked before anything is changed: a dump that is empty, short, or unreadable goes back at once", async () => {
    for (const flag of ["pg_dump-fails", "pg_dump-short", "list-fails"]) {
      const machine = await build();
      await machine.set(flag);
      const result = await machine.run(["--watch", "0"]);
      expect({ flag, ...outcome(result) }).toMatchObject({
        flag,
        exitCode: 10,
      });
      const calls = await machine.calls();
      expect(
        calls.filter((call) => /^git (merge|reset)( |$)/.test(call)),
      ).toEqual([]);
      expect(calls.filter((call) => /^bun install/.test(call))).toEqual([]);
      expect(
        calls.filter((call) => /^start\.sh \[mark=new\]/.test(call)),
      ).toEqual([]);
      expect(await machine.head()).toBe(await machine.rev("v0.1"));
      expect(await machine.db()).toBe(START_DB);
      expect(plain(result.stdout)).toContain(
        "The copy could not be made. Nothing has been changed.",
      );
      // The stack is up again, and no empty folder was left behind.
      expect(await machine.value("stack")).toBe("up");
      expect(await machine.copies()).toEqual([]);
    }
  });

  test("records the checksum of the copy when it is made, and it is the checksum of that file", async () => {
    const machine = await build();
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    const folder = await copyOf(machine);
    const digest = createHash("sha256")
      .update(await readFile(join(folder, "database.dump")))
      .digest("hex");
    expect(await readFile(join(folder, "record.txt"), "utf8")).toContain(
      `database_sha256=${digest}\n`,
    );
  });

  test("does not copy the database user's password when it cannot be read, and says so", async () => {
    const machine = await build();
    await machine.set("role-unreadable");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result).exitCode).toBe(0);
    expect(plain(result.stdout)).toContain("password could not be read");
    expect(await readdir(await copyOf(machine))).not.toContain(
      "role-password.sql",
    );
  });
});

// ---------------------------------------------------------------------------------------------------

describe("when anything from the stop on fails, it goes back", () => {
  async function wentBack(machine: Machine, args: string[] = []) {
    const original = {
      head: await machine.head(),
      env: await machine.env(),
      db: await machine.db(),
      role: await machine.value("role-password"),
    };
    const result = await machine.run(["--watch", "0", "--wait", "6", ...args]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    const text = plain(result.stdout);
    expect(text).toContain(
      "The update did not go through. You are back where you were: v0.1",
    );
    expect(text).toContain(
      "FreeDuet is running again at http://localhost:3010",
    );
    // Everything is where it was.
    expect(await machine.head()).toBe(original.head);
    expect(await machine.env()).toBe(original.env);
    expect(await machine.db()).toBe(original.db);
    expect(await machine.value("role-password")).toBe(original.role);
    expect(await machine.value("stack")).toBe("up");
    expect(await readFile(join(machine.repo, "mark"), "utf8")).toBe("old\n");
    return { result, text, original };
  }

  test("the app does not answer: stops, resets the code, puts the settings and the database back, starts the old version, in that order", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("start-writes-env-new");
    await machine.set("start-rotates-password-new");
    const { text } = await wentBack(machine);
    expect(text).toContain(
      "the app (port 3010) did not answer within 6 seconds",
    );
    expect(text).toContain(
      "database: restored from the copy (tables=3 journal=7)",
    );
    expect(text).toContain("database user: password put back as it was");
    expect(text).toContain(".env: put back from the copy");
    expect(text).toContain("The copy made before the update is in ");

    const oldSha = await machine.rev("v0.1");
    expectInOrder(await machine.calls(), [
      /^stop\.sh \[mark=old\]/,
      /^git merge --ff-only/,
      /^bun install --frozen-lockfile \[mark=new\]/,
      /^start\.sh \[mark=new\]/,
      // The check fails here. The NEW stop.sh stops what the new start made.
      /^stop\.sh \[mark=new\]/,
      new RegExp(`^git reset --hard --quiet ${oldSha}`),
      /^bun install --frozen-lockfile \[mark=old\]/,
      /^docker compose up -d postgres/,
      /^docker compose exec -T postgres pg_restore --exit-on-error --clean --create --if-exists --no-owner -U openbot -d postgres/,
      /^psql: \d+ bytes on standard input, not logged/,
      /^start\.sh \[mark=old\]/,
    ]);
    // The role's password was put back from standard input, and is the one it had.
    expect(await readFile(join(machine.state, "psql-stdin-1"), "utf8")).toBe(
      `ALTER ROLE openbot WITH PASSWORD '${OLD_VERIFIER}';\n`,
    );
  });

  test("the API does not answer", async () => {
    const machine = await build();
    await machine.set("api-down-new");
    const { text } = await wentBack(machine);
    expect(text).toContain("the API (port 3001) did not answer");
  });

  test("the new version does not start", async () => {
    const machine = await build();
    await machine.set("start-fails-new");
    const { text } = await wentBack(machine);
    expect(text).toContain("scripts/start.sh did not finish on v0.2");
    expect(text).toContain("database: restored from the copy");
  });

  test("the install fails: goes back without restoring a database nothing had touched", async () => {
    const machine = await build();
    await machine.set("bun-fails-new");
    const { text } = await wentBack(machine);
    expect(text).toContain("bun install did not finish.");
    expect(text).toContain("database: not touched, so it is as it was");
    const calls = await machine.calls();
    expect(
      calls.filter((call) => /pg_restore --exit-on-error/.test(call)),
    ).toEqual([]);
    expect(
      calls.filter((call) => /^start\.sh \[mark=new\]/.test(call)),
    ).toEqual([]);
    expectInOrder(calls, [
      /^bun install --frozen-lockfile \[mark=new\]/,
      /^git reset --hard --quiet/,
      /^bun install --frozen-lockfile \[mark=old\]/,
      /^start\.sh \[mark=old\]/,
    ]);
  });

  test("the move itself fails: the code was never moved, so nothing is reset or installed", async () => {
    const machine = await build();
    await machine.set("git-fails", "merge");
    const { text } = await wentBack(machine);
    expect(text).toContain("Could not move the code forward to v0.2 (");
    const calls = await machine.calls();
    expect(calls.filter((call) => /^git reset/.test(call))).toEqual([]);
    expect(calls.filter((call) => /^bun install/.test(call))).toEqual([]);
    expect(
      calls.filter((call) => /pg_restore --exit-on-error/.test(call)),
    ).toEqual([]);
  });

  test("the stop fails: starts the version it has again", async () => {
    const machine = await build();
    await machine.set("stop-fails");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    expect(plain(result.stdout)).toContain("scripts/stop.sh did not finish.");
    const calls = await machine.calls();
    expect(
      calls.filter((call) =>
        /pg_dump|^git (merge|reset)( |$)|^bun install/.test(call),
      ),
    ).toEqual([]);
    expect(await machine.copies()).toEqual([]);
  });

  test("the stop leaves Docker services running: says so, and does not go on", async () => {
    const machine = await build();
    await machine.set("stop-leaves-postgres");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    expect(plain(result.stdout)).toContain("Docker services are still running");
    expect(
      changes(await machine.calls()).filter((call) =>
        /pg_dump|^git merge /.test(call),
      ),
    ).toEqual([]);
  });

  test("a failed update says where its copy is, and the copy says how it ended", async () => {
    const machine = await build();
    await machine.set("start-fails-new");
    const result = await machine.run([
      "--watch",
      "0",
      "--wait",
      "6",
      "--keep",
      "1",
    ]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    const [name] = await machine.copies();
    expect(plain(result.stdout)).toContain(
      join(machine.copiesDirectory, name as string),
    );
    expect(
      await readFile(
        join(machine.copiesDirectory, name as string, "record.txt"),
        "utf8",
      ),
    ).toContain("result=went-back");
  });

  test("everything it says, runs and logs while going back is free of every secret", async () => {
    const machine = await build();
    await machine.set("start-fails-new");
    await machine.set("start-writes-env-new");
    await machine.set("start-rotates-password-new");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    expectNoSecret(await everythingSaid(machine, result));
  });
});

// ---------------------------------------------------------------------------------------------------

describe("when going back fails, it stops and prints the exact commands", () => {
  /** The commands the output tells the person to run, as a script. */
  function handCommands(
    output: string,
    header = "To go back by hand",
  ): string[] {
    const text = plain(output).split("\n");
    const start = text.findIndex((line) => line.startsWith(header));
    expect(start).toBeGreaterThan(-1);
    const commands: string[] = [];
    for (const line of text.slice(start + 2)) {
      if (line.trim() === "") break;
      commands.push(line.trim());
    }
    return commands;
  }

  async function ranByHand(machine: Machine, commands: string[]) {
    const script = join(machine.dir, "by-hand.sh");
    await writeFile(script, `${commands.join("\n")}\n`);
    const child = Bun.spawn({
      cmd: [bash, "-e", script],
      cwd: machine.home,
      env: machine.environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  }

  test("the restore fails: exit 20, the database is not claimed to be back, and the commands printed do the job", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("start-writes-env-new");
    await machine.set("start-rotates-password-new");
    await machine.set("restore-fails");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain(
      "Going back did not work: restoring the database from the copy failed",
    );
    expect(text).toContain(
      "The update did not go through, and FreeDuet is not back where it was yet. Nothing was deleted.",
    );
    expect(text).not.toContain("You are back where you were");
    expect(text).toContain("To go back by hand, run these in this order");
    expect(text).toContain(
      "If something on this computer starts FreeDuet by itself (a watchdog or a service), pause it before you run these.",
    );
    // The record says it needs the person, so it is never deleted by --keep.
    expect(
      await readFile(join(await copyOf(machine), "record.txt"), "utf8"),
    ).toContain("result=needs-person");

    const commands = handCommands(result.stdout);
    const folder = await copyOf(machine);
    const oldSha = await machine.rev("v0.1");
    const digest = createHash("sha256")
      .update(await readFile(join(folder, "database.dump")))
      .digest("hex");
    expect(
      commands.map((command) =>
        command.replace(machine.repo, "<repo>").replace(folder, "<copy>"),
      ),
    ).toEqual([
      "cd '<repo>/openbot'",
      "bash '<repo>/scripts/stop.sh'",
      `git -C '<repo>' reset --hard ${oldSha}`,
      "cp '<copy>/env.copy' '<repo>/openbot/.env'",
      "bun install --frozen-lockfile",
      "docker compose up -d postgres",
      `echo '${digest}  <copy>/database.dump' | sha256sum -c -`,
      "docker compose exec -T postgres pg_restore --exit-on-error --clean --create --if-exists --no-owner -U openbot -d postgres < '<copy>/database.dump'",
      "docker compose exec -T postgres psql -U openbot -d postgres -v ON_ERROR_STOP=1 -q < '<copy>/role-password.sql'",
      "bash '<repo>/scripts/start.sh'",
    ]);
    expectNoSecret(`${text}\n${(await machine.calls()).join("\n")}`);

    // The person fixes what was wrong and runs them. They bring everything back.
    await machine.unset("restore-fails");
    await machine.unset("app-down-new");
    expect(await machine.db()).toContain("migrated=1");
    const byHand = await ranByHand(machine, commands);
    expect({ ...byHand }).toMatchObject({ exitCode: 0 });
    expect(await machine.db()).toBe(START_DB);
    expect(await machine.head()).toBe(oldSha);
    expect(await machine.env()).toBe(ENV_FILE);
    expect(await machine.value("role-password")).toBe(OLD_VERIFIER);
    expect(await machine.value("stack")).toBe("up");
  });

  test("for a stack made with OPENBOT_ENV_FILE the printed commands name the settings file, so a new terminal does the same", async () => {
    const machine = await build({ evalEnv: true });
    await machine.set("app-down-new");
    await machine.set("restore-fails");
    const result = await machine.run(["--watch", "0", "--wait", "6"], {
      OPENBOT_ENV_FILE: ".env.eval",
    });
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const commands = handCommands(result.stdout);
    expect(
      commands
        .filter((command) => /scripts\/st(op|art)\.sh/.test(command))
        .map((command) => command.split(" bash ")[0]),
    ).toEqual(["OPENBOT_ENV_FILE='.env.eval'", "OPENBOT_ENV_FILE='.env.eval'"]);
    const compose = commands.filter((command) =>
      command.startsWith("docker compose"),
    );
    expect(compose).toHaveLength(3);
    for (const command of compose) {
      expect(command).toStartWith("docker compose --env-file '.env.eval' ");
    }

    // Run by hand, in a shell that does not have the variable: both scripts still get it.
    await machine.unset("restore-fails");
    await machine.unset("app-down-new");
    const seenBefore = (await machine.envSeen()).length;
    const byHand = await ranByHand(machine, commands);
    expect({ ...byHand }).toMatchObject({ exitCode: 0 });
    expect((await machine.envSeen()).slice(seenBefore)).toEqual([
      "stop.sh OPENBOT_ENV_FILE=.env.eval",
      "start.sh OPENBOT_ENV_FILE=.env.eval",
    ]);
    expect(await machine.db()).toBe(START_DB);
    expect(await readFile(join(machine.root, ".env.eval"), "utf8")).toBe(
      ENV_FILE,
    );
  });

  test("the restored database is not the one that was copied: exit 20 and says so", async () => {
    const machine = await build();
    await machine.set("start-fails-new");
    await machine.set("restore-corrupts");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain(
      "the restored database is not the one that was copied (tables=99 journal=1 now, tables=3 journal=7 then)",
    );
  });

  test("a restore with the plain flags would have left a mixed database: the fake refuses it, as the real one does", async () => {
    // The guard on the fake itself: the flags the script passes are the ones that make the restore whole.
    const machine = await build();
    await machine.set("start-fails-new");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    expect(await machine.db()).not.toContain("mixed=1");
    expect(
      (await machine.calls()).filter((call) =>
        /pg_restore --exit-on-error/.test(call),
      ),
    ).toEqual([
      "docker compose exec -T postgres pg_restore --exit-on-error --clean --create --if-exists --no-owner -U openbot -d postgres",
    ]);
  });

  test("interrupted after the stop, before the copy: exit 20, says how to start again, leaves no folder behind", async () => {
    const machine = await build();
    await machine.set("interrupt-in-stop");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain("Interrupted.");
    expect(text).toContain("The update stopped before it finished");
    expect(text).toContain(
      "Your database, your settings and your code were not changed.",
    );
    expect(text).toContain("To start it again, run: bash ");
    expect(await machine.copies()).toEqual([]);
    expect(await machine.head()).toBe(await machine.rev("v0.1"));
    expect(
      (await machine.calls()).filter((call) =>
        /pg_dump|pg_restore|^git (merge|reset)( |$)|^bun install/.test(call),
      ),
    ).toEqual([]);
    expect(
      await lstat(join(machine.root, ".logs/update.lock")).catch(() => null),
    ).toBeNull();
  });

  test("interrupted while the new version starts: exit 20, does not go back on its own, and the commands printed bring everything back", async () => {
    const machine = await build();
    await machine.set("interrupt-in-start-new");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain("Interrupted.");
    expect(text).toContain("To go back by hand, run these in this order");
    // The database was not being put back, so nothing says that it may be half done.
    expect(text).not.toContain("half restored");
    expect(
      await readFile(join(await copyOf(machine), "record.txt"), "utf8"),
    ).toContain("result=needs-person");
    expect(
      (await machine.calls()).filter((call) =>
        /pg_restore --exit-on-error|^git reset/.test(call),
      ),
    ).toEqual([]);
    expect(await machine.db()).toContain("migrated=1");
    expect(
      await lstat(join(machine.root, ".logs/update.lock")).catch(() => null),
    ).toBeNull();

    const byHand = await ranByHand(machine, handCommands(result.stdout));
    expect({ ...byHand }).toMatchObject({ exitCode: 0 });
    expect(await machine.db()).toBe(START_DB);
    expect(await machine.head()).toBe(await machine.rev("v0.1"));
    expect(await machine.value("stack")).toBe("up");
  });

  const restores = (calls: string[]) =>
    calls.filter((call) => /pg_restore --exit-on-error/.test(call));

  test("a copy that has changed since it was made is not restored from: exit 20, the database is not touched, and nothing printed restores from it", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("start-corrupts-dump-new");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain(
      "Going back did not work: the copy of your database is not the file that was checked when it was made",
    );
    expect(text).toContain(
      "did not pass the check made just before it was to be used",
    );
    expect(text).toContain("Do NOT restore from it");
    // A restore from it would have dropped the database and stopped: the database is as the new
    // version left it, and the restore was never asked for.
    expect(await machine.db()).toContain("migrated=1");
    expect(await machine.db()).not.toContain("dropped=1");
    const calls = await machine.calls();
    expect(restores(calls)).toEqual([]);
    expect(text).not.toContain("pg_restore --exit-on-error");
    expect(text).not.toContain("--clean --create");
    // What had been done before the check was done: the new version stopped, the code and the
    // settings put back. The stack is down, and the record says the person has to finish.
    expectInOrder(calls, [
      /^stop\.sh \[mark=new\]/,
      /^git reset --hard/,
      /^bun install --frozen-lockfile \[mark=old\]/,
      /^docker compose up -d postgres/,
    ]);
    expect(await machine.value("stack")).toBe("down");
    const folder = await copyOf(machine);
    const record = await readFile(join(folder, "record.txt"), "utf8");
    expect(record).toContain("result=needs-person");

    // The check it prints, run as printed, says the copy is not the one that was made.
    const digest = /^database_sha256=(\w+)$/m.exec(record)?.[1];
    const printed = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("sha256sum -c -"));
    expect(printed).toEqual([
      `echo '${digest}  ${folder}/database.dump' | sha256sum -c -`,
    ]);
    const check = await ranByHand(machine, printed);
    expect(check.exitCode).not.toBe(0);
    expect(check.stdout).toContain("FAILED");

    // And the way forward it prints works: the new version, on the database as it is.
    const forward = handCommands(result.stdout, "To run v0.2 (");
    expect(
      forward.map((command) => command.replace(machine.repo, "<repo>")),
    ).toEqual([
      "cd '<repo>/openbot'",
      `git -C '<repo>' merge --ff-only ${await machine.rev("v0.2")}`,
      "bun install --frozen-lockfile",
      "bash '<repo>/scripts/start.sh'",
    ]);
    await machine.unset("start-corrupts-dump-new");
    await machine.unset("app-down-new");
    const byHand = await ranByHand(machine, forward);
    expect({ ...byHand }).toMatchObject({ exitCode: 0 });
    expect(await machine.head()).toBe(await machine.rev("v0.2"));
    expect(await machine.value("stack")).toBe("up");
    expect(await machine.db()).toContain("migrated=1");
    expect(await machine.db()).not.toContain("dropped=1");
    expectNoSecret(`${text}\n${(await machine.calls()).join("\n")}`);
  });

  test("a copy that can no longer be read back is not restored from either", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("start-breaks-list-new");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain(
      "Going back did not work: the copy of your database can no longer be read back",
    );
    expect(plain(result.stdout)).toContain("Do NOT restore from it");
    expect(await machine.db()).toContain("migrated=1");
    expect(restores(await machine.calls())).toEqual([]);
  });

  test("a copy that is no longer there is not restored from either, and the printed commands do not pretend it is", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("start-deletes-dump-new");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain(
      "Going back did not work: the copy of your database is no longer where it was put",
    );
    expect(text).toContain("Do NOT restore from it");
    expect(text).not.toContain("were not changed");
    expect(await machine.db()).toContain("migrated=1");
    expect(restores(await machine.calls())).toEqual([]);
  });

  test("the commands printed check the copy first: when it has changed since, they stop before the restore", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("restore-fails");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const commands = handCommands(result.stdout);
    // The copy is damaged after the script has gone and before the person gets to the commands.
    const dump = join(await copyOf(machine), "database.dump");
    await writeFile(dump, `${await readFile(dump, "utf8")}CORRUPT\n`);
    await machine.unset("restore-fails");
    await machine.unset("app-down-new");
    const before = restores(await machine.calls()).length;
    const byHand = await ranByHand(machine, commands);
    expect(byHand.exitCode).not.toBe(0);
    expect(byHand.stdout).toContain("FAILED");
    // It stopped at the check: the restore, which would have dropped the database, was not run.
    expect(restores(await machine.calls())).toHaveLength(before);
    expect(await machine.db()).toContain("migrated=1");
    expect(await machine.db()).not.toContain("dropped=1");
  });

  test("stopped while the database is being put back: says that it may be half restored, exits 20, and the commands printed finish the job", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("interrupt-in-restore");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain("Interrupted.");
    expect(text).toContain(
      "The database was being put back from the copy when it stopped, so it may be only half restored.",
    );
    expect(text).toContain("Do not start FreeDuet on it.");
    expect(text).toContain("Run the commands below again, from the first one");
    expect(await machine.db()).toContain("half=1");
    expect(text.indexOf("only half restored")).toBeLessThan(
      text.indexOf("To go back by hand"),
    );
    expect(
      await readFile(join(await copyOf(machine), "record.txt"), "utf8"),
    ).toContain("result=needs-person");

    // The commands it prints put the whole database back.
    await machine.unset("interrupt-in-restore");
    await machine.unset("app-down-new");
    const byHand = await ranByHand(machine, handCommands(result.stdout));
    expect({ ...byHand }).toMatchObject({ exitCode: 0 });
    expect(await machine.db()).toBe(START_DB);
    expect(await machine.value("stack")).toBe("up");
  });

  test("the old version does not answer after going back: exit 20, with the commands", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("app-down-old");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain(
      "FreeDuet was started as it was, but the app (port 3010) does not answer",
    );
    expect(handCommands(result.stdout).length).toBeGreaterThan(5);
  });

  test("the old version cannot start after going back: exit 20", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("start-fails-old");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain(
      "start.sh did not finish on the version you had",
    );
  });

  test("the code cannot be put back: exit 20", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    await machine.set("git-fails", "reset");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain(
      "could not put the code back to v0.1",
    );
    expect(plain(result.stdout)).toContain("To go back by hand");
  });

  test("the new version cannot be stopped while going back: exit 20, and nothing was restored under it", async () => {
    const machine = await build();
    await machine.set("app-down-new");
    // The first stop is the update's own; the second is the one that goes back.
    await machine.set("stop-fails-on", "2");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain(
      "Going back did not work: scripts/stop.sh did not finish",
    );
    expect(plain(result.stdout)).toContain("To go back by hand");
    expect(
      (await machine.calls()).filter((call) =>
        /pg_restore --exit-on-error|^git reset/.test(call),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("a watchdog that starts the stack again", () => {
  test("while it waits after the stop: exit 20, before the copy and before the database is touched", async () => {
    const machine = await build();
    await machine.set("watchdog-on-stop", "1");
    await machine.set("watchdog-after", "5");
    const before = await machine.head();
    const result = await machine.run(["--watch", "20"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain(
      "Something started FreeDuet again while it was being stopped",
    );
    expect(text).toContain("Pause what starts it, then run this again.");
    expect(text).toContain("were not touched");
    const calls = await machine.calls();
    expect(
      calls.filter((call) =>
        /pg_dump|pg_restore|^psql|^git (merge|reset)( |$)|^bun install/.test(
          call,
        ),
      ),
    ).toEqual([]);
    expect(await machine.head()).toBe(before);
    expect(await machine.db()).toBe(START_DB);
    expect(await machine.copies()).toEqual([]);
    expect(await machine.value("stack")).toBe("up");
    // It stopped looking the moment it saw the stack back, and did not wait out the 20 seconds.
    const waited = (await machine.sleeps()).filter(
      (line) => line === "sleep 1",
    );
    expect(waited).toHaveLength(5);
  });

  test("after the copy, before the move: exit 20, and does not start FreeDuet itself on top of it", async () => {
    const machine = await build();
    await machine.set("watchdog-on-stop", "1");
    // The second quiet check is the second sleep after the stop.
    await machine.set("watchdog-after", "2");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    expect(plain(result.stdout)).toContain("Something started FreeDuet again");
    expect(plain(result.stdout)).toContain("The copy made before that is in ");
    const calls = await machine.calls();
    expect(
      calls.filter((call) =>
        /^git (merge|reset)( |$)|^bun install|^start\.sh/.test(call),
      ),
    ).toEqual([]);
    expect(
      calls.filter((call) => /pg_restore --exit-on-error/.test(call)),
    ).toEqual([]);
    expect(await machine.db()).toBe(START_DB);
    expect(
      await readFile(join(await copyOf(machine), "record.txt"), "utf8"),
    ).toContain("result=stopped-by-a-watchdog");
  });

  test("while going back: does not restore the database under it, exit 20 with the commands", async () => {
    const machine = await build();
    await machine.set("start-fails-new");
    await machine.set("watchdog-on-stop", "2");
    await machine.set("watchdog-after", "1");
    const result = await machine.run(["--watch", "0", "--wait", "6"]);
    expect(outcome(result)).toMatchObject({ exitCode: 20 });
    const text = plain(result.stdout);
    expect(text).toContain("the database is in use, so it was not restored");
    expect(text).toContain("pause it first");
    expect(text).toContain("To go back by hand");
    expect(
      (await machine.calls()).filter((call) =>
        /pg_restore --exit-on-error/.test(call),
      ),
    ).toEqual([]);
    expect(await machine.db()).toContain("migrated=1");
  });
});

// ---------------------------------------------------------------------------------------------------

describe("--keep", () => {
  const OTHER_REPOSITORY = "/somewhere/else/freeduet";

  async function oldCopy(machine: Machine, name: string, lines: string[]) {
    const folder = join(machine.copiesDirectory, name);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await writeFile(join(folder, "record.txt"), `${lines.join("\n")}\n`);
    await writeFile(join(folder, "database.dump"), "dump");
  }

  /** Seven copies of this installation that ended well or went back, and the ones it must never touch. */
  async function crowd(machine: Machine) {
    const mine = (result: string, env = ".env") => [
      `repository=${machine.repo}`,
      `env_file=${env}`,
      `result=${result}`,
    ];
    for (let n = 1; n <= 7; n += 1) {
      await oldCopy(
        machine,
        `update-2020010${n}-000000`,
        mine(n % 2 === 0 ? "went-back" : "updated"),
      );
    }
    // Ended with the person finishing by hand: may be the only way back.
    await oldCopy(machine, "update-20200201-000000", mine("needs-person"));
    // Another installation's.
    await oldCopy(machine, "update-20200202-000000", [
      `repository=${OTHER_REPOSITORY}`,
      "env_file=.env",
      "result=updated",
    ]);
    // Another stack of this installation.
    await oldCopy(
      machine,
      "update-20200203-000000",
      mine("updated", ".env.eval"),
    );
    // A run that never said how it ended.
    await oldCopy(machine, "update-20200204-000000", [
      `repository=${machine.repo}`,
      "env_file=.env",
    ]);
    // A name that is not one of its own, and a folder that is not a copy at all.
    await oldCopy(machine, "update-nothing", mine("updated"));
    await oldCopy(machine, "not-a-copy", mine("updated"));
    // A link: neither followed nor removed.
    const outside = join(machine.dir, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "precious.txt"), "keep\n");
    await symlink(
      outside,
      join(machine.copiesDirectory, "update-20200205-000000"),
    );
    return outside;
  }

  const untouched = [
    "update-20200201-000000",
    "update-20200202-000000",
    "update-20200203-000000",
    "update-20200204-000000",
    "update-20200205-000000",
    "update-nothing",
    "not-a-copy",
  ];
  const ofThisRun = (names: string[]) =>
    names.filter((name) => /^update-(?!2020)\d{8}-\d{6}$/.test(name));

  test("keeps the newest n copies of this installation, this run's among them, after a success", async () => {
    const machine = await build();
    const outside = await crowd(machine);
    const result = await machine.run(["--watch", "0", "--keep", "3"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    const all = await readdir(machine.copiesDirectory);
    // Seven of its own: the newest two of them and this run's remain. Nothing else is touched.
    expect(
      all.filter((name) => /^update-2020010\d-000000$/.test(name)).sort(),
    ).toEqual(["update-20200106-000000", "update-20200107-000000"]);
    expect(ofThisRun(all)).toHaveLength(1);
    for (const name of untouched) expect(all).toContain(name);
    expect(await readFile(join(outside, "precious.txt"), "utf8")).toBe(
      "keep\n",
    );
  });

  test("keeps five by default", async () => {
    const machine = await build();
    await crowd(machine);
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    expect(
      (await machine.copies()).filter((name) =>
        /^update-2020010\d-000000$/.test(name),
      ),
    ).toEqual([
      "update-20200104-000000",
      "update-20200105-000000",
      "update-20200106-000000",
      "update-20200107-000000",
    ]);
  });

  test("never deletes the copy made in this run, even with --keep 0", async () => {
    const machine = await build();
    await crowd(machine);
    const result = await machine.run(["--watch", "0", "--keep", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    const all = await readdir(machine.copiesDirectory);
    expect(
      all.filter((name) => /^update-2020010\d-000000$/.test(name)),
    ).toEqual([]);
    const thisRun = ofThisRun(all);
    expect(thisRun).toHaveLength(1);
    expect(
      await readdir(join(machine.copiesDirectory, thisRun[0] as string)),
    ).toContain("database.dump");
    for (const name of untouched) expect(all).toContain(name);
  });

  test("deletes nothing when the update did not work", async () => {
    const machine = await build();
    await crowd(machine);
    const before = await machine.copies();
    await machine.set("start-fails-new");
    const result = await machine.run([
      "--watch",
      "0",
      "--wait",
      "6",
      "--keep",
      "1",
    ]);
    expect(outcome(result)).toMatchObject({ exitCode: 10 });
    const after = await machine.copies();
    for (const name of before) expect(after).toContain(name);
    expect(after).toHaveLength(before.length + 1);
  });

  /** What the run that tidied was made to say, and what it left behind. */
  async function tidyingStoppedBy(signal: "TERM" | "USR1") {
    const machine = await build();
    await crowd(machine);
    await machine.set("signal-in-prune", signal);
    const result = await machine.run(["--watch", "0", "--keep", "1"]);
    const text = plain(result.stdout);
    const [mine] = ofThisRun(await machine.copies());
    const record = await readFile(
      join(machine.copiesDirectory, mine as string, "record.txt"),
      "utf8",
    );
    return { machine, result, text, record };
  }

  function expectUpdateStandsAfterTidyingStopped(
    state: Awaited<ReturnType<typeof tidyingStoppedBy>>,
  ) {
    const { text, record } = state;
    expect(text).toContain("The update is done: FreeDuet is on v0.2");
    expect(text).toContain("Tidying the older copies did not finish");
    // Not a failed update: nothing is said about stopping, and nothing is printed to go back with.
    for (const wrong of [
      "To go back by hand",
      "may be stopped",
      "stopped before it finished",
      "not changed",
    ]) {
      expect(text).not.toContain(wrong);
    }
    expect(
      record.split("\n").filter((line) => line.startsWith("result=")),
    ).toEqual(["result=updated"]);
  }

  test("a Ctrl-C while the older copies are being tidied is not a failed update: it says it is done, exits 0, prints nothing to go back with, and the result stays updated", async () => {
    const state = await tidyingStoppedBy("TERM");
    const { machine, result, text } = state;
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expect(text).toContain("Interrupted.");
    expectUpdateStandsAfterTidyingStopped(state);
    // The new version is in place and running, and nothing was undone.
    expect(await machine.head()).toBe(await machine.rev("v0.2"));
    expect(await machine.value("stack")).toBe("up");
    expect(
      (await machine.calls()).filter((call) =>
        /pg_restore --exit-on-error|^git reset|^stop\.sh \[mark=new\]/.test(
          call,
        ),
      ),
    ).toEqual([]);
    expect(
      await lstat(join(machine.root, ".logs/update.lock")).catch(() => null),
    ).toBeNull();
  });

  test("so is a stop with no handler of its own after the update worked, which only the safety net sees", async () => {
    // USR1 is not one of the signals the script handles, so it is the EXIT trap that runs. (A script
    // that dies of a signal reports that signal as its status whatever the trap says, so the status
    // is not what is checked here: what it says, and what the copy's record says, are.)
    const state = await tidyingStoppedBy("USR1");
    expectUpdateStandsAfterTidyingStopped(state);
    expect(state.text).toContain(
      "The script stopped after the update was done.",
    );
    expect(await state.machine.head()).toBe(await state.machine.rev("v0.2"));
    expect(
      (await state.machine.calls()).filter((call) =>
        /pg_restore --exit-on-error|^git reset/.test(call),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("it works on this installation's database, and on no other", () => {
  /** Refused at the look: nothing stopped, copied or started, whichever stack the shell and the files point at. */
  async function refusedAt(
    machine: Machine,
    message: string | RegExp,
    extra: Record<string, string> = {},
  ) {
    const before = await machine.snapshots();
    const result = await machine.run(["--watch", "0"], extra);
    expect(outcome(result).exitCode).toBe(1);
    expect(plain(result.stdout)).toMatch(message);
    expect(plain(result.stdout)).toContain("Nothing was changed.");
    expect(changes(await machine.calls())).toEqual([]);
    expect(await machine.snapshots()).toEqual(before);
    expect(await machine.copies()).toEqual([]);
    return result;
  }

  test("refuses a postgres container that is another folder's, as when two checkouts share the project name, and names that folder", async () => {
    const machine = await build();
    await machine.set("label-working-dir", "/home/someone/else/openbot");
    await machine.set(
      "label-config-files",
      "/home/someone/else/openbot/docker-compose.yml",
    );
    const result = await refusedAt(
      machine,
      "belongs to another folder: /home/someone/else/openbot (Docker project openbot)",
    );
    expect(plain(result.stdout)).toContain("COMPOSE_PROJECT_NAME");
    // Looked at the container, and nothing else.
    expect(
      (await machine.calls()).filter((call) => /^docker inspect/.test(call)),
    ).not.toEqual([]);
  });

  test("refuses when Docker will not say whose container it is", async () => {
    const unreadable = await build();
    await unreadable.set("inspect-fails");
    await refusedAt(unreadable, "would not say which folder");

    const unlabelled = await build();
    await unlabelled.set("label-working-dir", "");
    await unlabelled.set("label-config-files", "");
    await refusedAt(unlabelled, "would not say which folder");
  });

  test("refuses when Docker shows more than one database container for this folder", async () => {
    const machine = await build();
    await machine.set("ps-two-postgres");
    await refusedAt(machine, "does not show exactly one database container");
  });

  test("takes the folder when the label names it through a link, or when only the label of the compose files names it", async () => {
    const linked = await build();
    await symlink(linked.root, join(linked.dir, "root-link"));
    await linked.set("label-working-dir", join(linked.dir, "root-link"));
    expect(outcome(await linked.run(["--check"]))).toMatchObject({
      exitCode: 0,
    });

    const byFiles = await build();
    await byFiles.set("label-working-dir", "");
    await byFiles.set(
      "label-config-files",
      `${byFiles.root}/docker-compose.yml,${byFiles.root}/scripts/other.yml`,
    );
    expect(outcome(await byFiles.run(["--check"]))).toMatchObject({
      exitCode: 0,
    });
  });

  test("says which Docker project it works on in the plan, and writes it in the record of the copy", async () => {
    const machine = await build();
    const check = await machine.run(["--check"]);
    expect(plain(check.stdout)).toContain(
      "Docker project:  openbot (the database it copies is the one of this folder)",
    );
    expect(outcome(await machine.run(["--watch", "0"]))).toMatchObject({
      exitCode: 0,
    });
    expect(
      await readFile(join(await copyOf(machine), "record.txt"), "utf8"),
    ).toContain("compose_project=openbot\n");
  });

  describe("the second stack of a machine, from the same checkout", () => {
    /** Everything that is the person's stack, as `build({ twoStacks: true })` made it, and was not touched. */
    async function personsStackIsAsItWas(machine: Machine) {
      expect(await machine.value("stack")).toBe("up");
      expect(await machine.value("connections")).toBe("3");
      expect(await machine.db()).toBe(START_DB);
      expect(await machine.value("role-password")).toBe(OLD_VERIFIER);
    }
    async function secondStackIsAsItWas(machine: Machine) {
      expect(await machine.evalValue("stack")).toBe("up");
      expect(await machine.evalValue("connections")).toBe("2");
      expect(await machine.evalDb()).toBe(EVAL_DB);
      expect(await machine.evalValue("role-password")).toBe(EVAL_VERIFIER);
    }

    test("a run for it copies, stops, updates and starts that stack, and leaves the person's alone", async () => {
      const machine = await build({ twoStacks: true });
      const result = await machine.run(["--watch", "0"], {
        OPENBOT_ENV_FILE: ".env.eval",
      });
      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(plain(result.stdout)).toContain("Docker project:  freeduet-eval");
      // Its database was migrated, and the copy is of its database and nobody else's.
      const migrated = await machine.evalDb();
      expect(migrated).toContain("migrated=1");
      expect(migrated).toContain("stack=eval");
      const folder = await copyOf(machine);
      const dump = await readFile(join(folder, "database.dump"), "utf8");
      expect(dump).toContain(EVAL_DB);
      expect(dump).not.toContain("rows=42");
      expect(await readFile(join(folder, "record.txt"), "utf8")).toContain(
        "compose_project=freeduet-eval\n",
      );
      expect(await readFile(join(folder, "env.copy"), "utf8")).toBe(
        EVAL_ENV_FILE,
      );
      // It looked at the second stack's ports (3101 and 3110) and never at the person's.
      const asked = await machine.asked();
      expect(asked.length).toBeGreaterThan(0);
      for (const url of asked)
        expect(url).toMatch(/^http:\/\/localhost:31(01|10)\//);
      // Everything it ran was about that stack: the scripts were told which, and so was Compose.
      expect(await machine.envSeen()).toEqual([
        "stop.sh OPENBOT_ENV_FILE=.env.eval",
        "start.sh OPENBOT_ENV_FILE=.env.eval",
      ]);
      expect(
        (await machine.calls()).filter(
          (call) =>
            call.startsWith("docker compose ") &&
            !call.includes("--env-file") &&
            call !== "docker compose version",
        ),
      ).toEqual([]);
      await personsStackIsAsItWas(machine);
    });

    test("a run for the person's stack does the same the other way round, and leaves the second one alone", async () => {
      const machine = await build({ twoStacks: true });
      const result = await machine.run(["--watch", "0"]);
      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(plain(result.stdout)).toContain("Docker project:  freeduet ");
      expect(await machine.db()).toContain("migrated=1");
      const folder = await copyOf(machine);
      const dump = await readFile(join(folder, "database.dump"), "utf8");
      expect(dump).toContain(START_DB);
      expect(dump).not.toContain("stack=eval");
      expect(await readFile(join(folder, "record.txt"), "utf8")).toContain(
        "compose_project=freeduet\n",
      );
      expect(await machine.envSeen()).toEqual([
        "stop.sh OPENBOT_ENV_FILE=",
        "start.sh OPENBOT_ENV_FILE=",
      ]);
      const asked = await machine.asked();
      expect(asked.length).toBeGreaterThan(0);
      for (const url of asked)
        expect(url).toMatch(/^http:\/\/localhost:30(01|10)\//);
      await secondStackIsAsItWas(machine);
    });

    test("when going back, a run for one puts back only that one", async () => {
      const machine = await build({ twoStacks: true });
      await machine.set("app-down-new");
      const result = await machine.run(["--watch", "0", "--wait", "6"], {
        OPENBOT_ENV_FILE: ".env.eval",
      });
      expect(outcome(result)).toMatchObject({ exitCode: 10 });
      expect(await machine.evalDb()).toBe(EVAL_DB);
      expect(await machine.evalValue("role-password")).toBe(EVAL_VERIFIER);
      expect(await machine.evalValue("stack")).toBe("up");
      await personsStackIsAsItWas(machine);
    });

    test("refuses when the shell names another project than the settings file does, which is how a run for one would reach the other", async () => {
      const machine = await build({ twoStacks: true });
      const result = await refusedAt(
        machine,
        "COMPOSE_PROJECT_NAME is set in this shell (freeduet) and is different in .env.eval (freeduet-eval)",
        { OPENBOT_ENV_FILE: ".env.eval", COMPOSE_PROJECT_NAME: "freeduet" },
      );
      expect(plain(result.stdout)).not.toContain("Updated.");
      await personsStackIsAsItWas(machine);
      await secondStackIsAsItWas(machine);
    });

    test("refuses when the settings file names one project and the container Docker finds is in another", async () => {
      const machine = await build({ twoStacks: true });
      // The same checkout, so the folder matches: only the project tells them apart.
      await machine.set("label-project", "freeduet-eval");
      await refusedAt(
        machine,
        ".env names the Docker project freeduet, but the database container that Docker found is in the project freeduet-eval",
      );
      await secondStackIsAsItWas(machine);
    });
  });
});

describe("the folder for the copies", () => {
  test("is refused inside the repository, however it is written, and nothing is changed", async () => {
    const machine = await build();
    await symlink(machine.repo, join(machine.dir, "link-to-repo"));
    for (const folder of [
      join(machine.repo, "copies"),
      join(machine.root, "not/made/yet/copies"),
      // The checkout is a sibling of the home folder this runs in.
      "../work/copies",
      join(machine.dir, "link-to-repo", "through-a-link"),
      machine.repo,
    ]) {
      const before = await machine.snapshots();
      const result = await machine.run(["--watch", "0", "--copies", folder]);
      expect({ folder, ...outcome(result) }).toMatchObject({
        folder,
        exitCode: 1,
      });
      const text = plain(result.stdout);
      expect(text).toContain(
        "The folder for the copies is inside the repository",
      );
      expect(text).toContain("Nothing was changed.");
      expect(changes(await machine.calls())).toEqual([]);
      expect(await machine.snapshots()).toEqual(before);
    }
    // --check refuses it too: it is the same look.
    const check = await machine.run([
      "--check",
      "--copies",
      join(machine.repo, "copies"),
    ]);
    expect(outcome(check).exitCode).toBe(1);
  });

  test("outside the repository is accepted, also when it is not made yet and when it is written with ..", async () => {
    const machine = await build();
    for (const folder of [
      join(machine.dir, "elsewhere", "copies"),
      "../elsewhere-too/copies",
    ]) {
      const result = await machine.run(["--check", "--copies", folder]);
      expect({ folder, ...outcome(result) }).toMatchObject({
        folder,
        exitCode: 0,
      });
    }
    const real = await machine.run([
      "--watch",
      "0",
      "--copies",
      join(machine.dir, "elsewhere", "copies"),
    ]);
    expect(outcome(real)).toMatchObject({ exitCode: 0 });
    expect(
      (await readdir(join(machine.dir, "elsewhere", "copies"))).length,
    ).toBe(1);
  });
});

describe("--to <name>", () => {
  /** The branch `release` on origin at v0.2, and the person's own branch of that name at `local`. */
  async function withBranches(local: "v0.1" | "v0.2", remote: "v0.1" | "v0.2") {
    const machine = await build();
    await machine.git("fetch", "-q", "--tags", "origin");
    await machine.git("branch", "release", local);
    await machine.git(
      "--git-dir",
      machine.origin,
      "update-ref",
      "refs/heads/release",
      remote,
    );
    return machine;
  }

  test("takes origin/<name> when the local branch of that name is behind it, and says so", async () => {
    const machine = await withBranches("v0.1", "v0.2");
    const result = await machine.run(["--watch", "0", "--to", "release"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    const text = plain(result.stdout);
    expect(text).toContain(
      "--to release: using origin/release, because the local branch release is behind it",
    );
    expect(text).toContain("Going to:        origin/release");
    expect(await machine.head()).toBe(await machine.rev("v0.2"));
  });

  test("keeps a local branch that has commits origin does not have, and says so", async () => {
    const machine = await withBranches("v0.2", "v0.1");
    const result = await machine.run(["--watch", "0", "--to", "release"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expect(plain(result.stdout)).toContain(
      "--to release: using the local branch release, which has commits that origin/release does not have",
    );
    expect(plain(result.stdout)).toContain("Going to:        release");
    expect(await machine.head()).toBe(await machine.rev("v0.2"));
  });

  test("says which it took when there is only one: a tag, or a branch that only origin has", async () => {
    const tag = await build();
    const tagged = await tag.run(["--watch", "0", "--to", "v0.2"]);
    expect(outcome(tagged)).toMatchObject({ exitCode: 0 });
    expect(plain(tagged.stdout)).toContain("--to v0.2: using the tag v0.2");

    const remote = await build();
    await remote.git(
      "--git-dir",
      remote.origin,
      "update-ref",
      "refs/heads/release",
      "v0.2",
    );
    const branch = await remote.run(["--watch", "0", "--to", "release"]);
    expect(outcome(branch)).toMatchObject({ exitCode: 0 });
    expect(plain(branch.stdout)).toContain(
      "--to release: using origin/release",
    );
    expect(await remote.head()).toBe(await remote.rev("v0.2"));
  });
});

describe("secrets", () => {
  test("none out of .env or the database is printed, logged or put on a command line, in the run that works", async () => {
    const machine = await build();
    await machine.set("start-writes-env-new");
    await machine.set("start-rotates-password-new");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expectNoSecret(await everythingSaid(machine, result));
    // They are in the private copy, which is what it is for.
    const copy = await readFile(
      join(await copyOf(machine), "env.copy"),
      "utf8",
    );
    expect(copy).toContain(CANARIES.postgresPassword);
  });

  test("none in the refusals either", async () => {
    const machine = await build();
    await writeFile(join(machine.root, "docker-compose.yml"), "changed\n");
    const result = await machine.run(["--watch", "0"]);
    expect(outcome(result).exitCode).toBe(1);
    expectNoSecret(await everythingSaid(machine, result));

    const elsewhere = await build({
      envLines: [
        `DATABASE_URL=postgres://someone:${CANARIES.databasePassword}@db.example.test:5432/openbot`,
      ],
    });
    const refused = await elsewhere.run(["--watch", "0"]);
    expect(outcome(refused).exitCode).toBe(1);
    expectNoSecret(await everythingSaid(elsewhere, refused));
  });

  test("the role's password goes back on standard input, never on a command line", async () => {
    const machine = await build();
    await machine.set("start-fails-new");
    await machine.set("start-rotates-password-new");
    expect(
      outcome(await machine.run(["--watch", "0", "--wait", "6"])),
    ).toMatchObject({ exitCode: 10 });
    const calls = (await machine.calls()).join("\n");
    expect(calls).toContain("bytes on standard input, not logged");
    expect(calls).not.toContain("SCRAM");
    expect(calls).not.toContain("ALTER ROLE");
  });
});
