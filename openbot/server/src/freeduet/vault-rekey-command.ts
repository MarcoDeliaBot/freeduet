import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import {
  chmod,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { basename, dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { addressOf, createDatabase, type Database } from "../db/client";
import { reasonWithoutStatement } from "../db/query-failure";
import {
  emptyCounts,
  type Inspection,
  inspectVault,
  isPublishedExampleKey,
  isValidKey,
  newVaultKey,
  otherSessions,
  presentTables,
  REKEY_APPLICATION_NAME,
  resealVault,
  seesEverySession,
  serverMajorVersion,
  totals,
  VAULT_TABLES,
  VaultRekeyError,
  type VaultTable,
} from "./vault-rekey";

/**
 * `bun scripts/rekey-vault.ts`: the command a person runs, on purpose, to seal again what the
 * example `KEY_ENCRYPTION_KEY` seals (docs/design/vault-rekey.md). Never started by anything else.
 *
 * The cryptography and every database statement that changes a secret live in `vault-rekey.ts`, which
 * uses the server's own `encryptSecret` and `decryptSecret`. This file is the part around it: who may
 * run, in what order, what is written where, and what is said. Every line it prints goes through
 * `clean`, which has been told each secret this run knows, so a mistake in a message cannot become a
 * leak. Nothing it prints is ever a key, a decrypted value or a stored envelope.
 */

const KEY_NAME = "KEY_ENCRYPTION_KEY";
const ENV_NAME = /^\.env(\.[A-Za-z0-9_-]+)?$/;

export const EXIT = {
  /** Done, or nothing to do, or the check found everything in order. */
  ok: 0,
  /** Something was found wrong, or the run failed. Nothing was changed. */
  failed: 1,
  /** The command declined to start. Nothing was changed. */
  refused: 2,
  /** The database was changed and the settings file could not be. The new key is kept in a file. */
  keyNotWritten: 3,
  interrupted: 130,
} as const;

const USAGE = [
  "Usage, from the openbot folder:",
  "  bun scripts/rekey-vault.ts --yes            Check only. Opens every saved secret with the current key and",
  "                                              reports counts. Changes nothing.",
  "  bun scripts/rekey-vault.ts --apply --yes    Seal every saved secret again with a new key, and write the new",
  "                                              key into .env.",
  "Without --yes it only says what it would do. Stop FreeDuet first (bash scripts/stop.sh), then start the",
  "database alone (docker compose up -d postgres).",
];

/** Thrown by the entry point's `checkpoint` when somebody pressed Ctrl-C before the database was changed. */
export class Interrupted extends Error {
  constructor() {
    super("Interrupted.");
    this.name = "Interrupted";
  }
}

/** A refusal whose message is written here, in plain words, and so is safe to print. */
class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refusal";
  }
}

// ---------------------------------------------------------------------------------------------------
// The settings file, read and written the way scripts/start.sh does it
// ---------------------------------------------------------------------------------------------------

/**
 * What `file_setting` in scripts/start.sh answers: the LAST line that begins `NAME=`, everything after
 * the first `=`, and one pair of double quotes dropped and then one pair of single quotes. An empty
 * string when there is no such line. A test runs that function and this one over the same files.
 */
export function settingFrom(text: string, name: string): string {
  const last = text
    .split("\n")
    .filter((line) => line.startsWith(`${name}=`))
    .at(-1);
  if (last === undefined) return "";
  return last
    .slice(name.length + 1)
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/^'([\s\S]*)'$/, "$1");
}

/**
 * What `freeduet_env_line` in scripts/start.sh produces: every line that begins `NAME=` removed, the
 * remaining lines kept in order, and `NAME=VALUE` added at the end. A last line with no newline gets
 * one, as `grep` gives it. A test runs that function and this one over the same files.
 */
export function replaceSetting(
  text: string,
  name: string,
  value: string,
): string {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const kept = lines.filter((line) => !line.startsWith(`${name}=`));
  kept.push(`${name}=${value}`);
  return `${kept.join("\n")}\n`;
}

/**
 * Writes the setting the way start.sh does: a new file, mode 600 from the moment it exists, moved over
 * the old one, so a reader sees the old file or the new one and never half of either. The new file is
 * made beside the old one, because a move between two disks is a copy and not one step.
 */
export async function writeSetting(
  path: string,
  name: string,
  value: string,
): Promise<void> {
  const current = await readFile(path, "latin1");
  const next = replaceSetting(current, name, value);
  const temporary = join(
    dirname(path),
    `${basename(path)}.rekey-${randomBytes(4).toString("hex")}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(next, "latin1");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function createPrivateFile(path: string, content: string) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(content, "latin1");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

// ---------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------

export type Parsed =
  | { kind: "help" }
  | { kind: "problem"; message: string }
  | { kind: "run"; apply: boolean; yes: boolean };

export function parseArguments(argv: string[]): Parsed {
  let apply = false;
  let yes = false;
  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") return { kind: "help" };
    if (argument === "--apply") apply = true;
    else if (argument === "--yes") yes = true;
    else
      return {
        kind: "problem",
        // Only the name of the option, so that a key pasted in by mistake is not printed back.
        message: `Unknown option: ${argument.split("=")[0]?.slice(0, 24)}`,
      };
  }
  return { kind: "run", apply, yes };
}

// ---------------------------------------------------------------------------------------------------
// Looking at the world: the server, the database address, the helper programs
// ---------------------------------------------------------------------------------------------------

/**
 * Whether this FreeDuet server answers on `port`: the question scripts/start.sh asks
 * (`identifies_as_openbot`). A field of the server's own payload, because any single-page app on a
 * default port answers 200 to the same path. Over `node:http`, which never goes through a proxy.
 */
function answersAsServer(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const asked = httpRequest(
      { host, port, path: "/api/capabilities", method: "GET", timeout: 3000 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          if (body.length < 65536) body += chunk;
        });
        response.on("end", () =>
          resolve(
            (response.statusCode ?? 0) >= 200 &&
              (response.statusCode ?? 0) < 300 &&
              body.includes('"durableHistory"'),
          ),
        );
        response.on("error", () => resolve(false));
      },
    );
    asked.on("timeout", () => {
      asked.destroy();
      resolve(false);
    });
    asked.on("error", () => resolve(false));
    asked.end();
  });
}

export async function serverIsUp(port: number): Promise<boolean> {
  for (const host of ["127.0.0.1", "::1"])
    if (await answersAsServer(host, port)) return true;
  return false;
}

export type Address = {
  hostname: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslmode?: string;
  sslrootcert?: string;
};

/** The address, taken apart by the server's own parser, which names the fault and never the value. */
function addressFrom(databaseUrl: string): Address {
  const parts = addressOf(databaseUrl);
  const search = new URL(databaseUrl).searchParams;
  return {
    hostname: parts.hostname,
    port: parts.port,
    username: parts.username,
    password: parts.password,
    database: parts.database,
    sslmode: search.get("sslmode") ?? undefined,
    sslrootcert: search.get("sslrootcert") ?? undefined,
  };
}

function withApplicationName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("application_name", REKEY_APPLICATION_NAME);
  return url.toString();
}

/** The database Docker Compose starts here: this machine, the user and the database it is made with. */
function isComposeDatabase(address: Address): boolean {
  return (
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(address.hostname) &&
    address.username === "openbot" &&
    address.database === "openbot"
  );
}

// ---------------------------------------------------------------------------------------------------
// The backup
// ---------------------------------------------------------------------------------------------------

export type BackupRequest = {
  /** Where to write it. Does not exist yet. */
  path: string;
  /** The tables that exist, which are the ones that can be asked for. */
  tables: VaultTable[];
  address: Address;
  /** The database's major version: a `pg_dump` older than it refuses to read it. */
  serverMajor: number;
  /** `pg_postmaster_start_time()` as this command sees it, to tell that a container is the same server. */
  serverStartedAt: string;
  root: string;
  envName: string;
  env: Record<string, string | undefined>;
};

export type BackupResult =
  | { ok: true; via: string; rows: Record<VaultTable, number> }
  | { ok: false; reason: string };

type DumpPlan = {
  label: string;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
};

type Ran = {
  code: number | null;
  stdout: string;
  stderr: string;
  failedToStart: boolean;
};

/** The environment a helper program gets: this one's, without the two settings that are secrets. */
function childEnvironment(env: Record<string, string | undefined>) {
  const copy: NodeJS.ProcessEnv = { ...env };
  delete copy[KEY_NAME];
  delete copy.DATABASE_URL;
  delete copy.PGPASSWORD;
  return copy;
}

function run(
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    cwd?: string;
    stdoutFd?: number;
    timeoutMs: number;
  },
): Promise<Ran> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value: Ran) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        env: options.env,
        cwd: options.cwd,
        stdio: ["ignore", options.stdoutFd ?? "pipe", "pipe"],
      });
    } catch {
      return resolve({ code: null, stdout, stderr, failedToStart: true });
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ code: null, stdout, stderr, failedToStart: false });
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 4096) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString("utf8");
    });
    child.on("error", () =>
      finish({ code: null, stdout, stderr, failedToStart: true }),
    );
    child.on("close", (code) =>
      finish({ code, stdout, stderr, failedToStart: false }),
    );
  });
}

function dumpArguments(tables: VaultTable[]) {
  return [
    "--no-password",
    "--data-only",
    "--format=plain",
    ...tables.flatMap((table) => ["--table", `public.${table}`]),
  ];
}

async function hostDump(request: BackupRequest): Promise<DumpPlan | string> {
  const command = request.env.PG_DUMP?.trim() || "pg_dump";
  const environment = childEnvironment(request.env);
  const version = await run(command, ["--version"], {
    env: environment,
    timeoutMs: 15_000,
  });
  if (version.failedToStart || version.code !== 0)
    return "pg_dump was not found on this computer.";
  const major = /\(PostgreSQL\)\s+(\d+)/.exec(version.stdout)?.[1];
  if (major === undefined) return "pg_dump did not say which version it is.";
  if (Number(major) < request.serverMajor)
    return `The pg_dump on this computer is version ${major}, older than the database (version ${request.serverMajor}), and it refuses to read a newer one.`;
  const { address } = request;
  const env: NodeJS.ProcessEnv = {
    ...environment,
    PGPASSWORD: address.password,
    PGCONNECT_TIMEOUT: "10",
  };
  if (address.sslmode) env.PGSSLMODE = address.sslmode;
  if (address.sslrootcert) env.PGSSLROOTCERT = address.sslrootcert;
  return {
    label: "pg_dump",
    command,
    args: [
      "--host",
      address.hostname.replace(/^\[|\]$/g, ""),
      "--port",
      String(address.port),
      "--username",
      address.username,
      "--dbname",
      address.database,
      ...dumpArguments(request.tables),
    ],
    env,
  };
}

async function containerDump(
  request: BackupRequest,
): Promise<DumpPlan | string> {
  if (!isComposeDatabase(request.address))
    return "The database is not the one Docker Compose runs here, so Docker cannot make the copy either.";
  const environment = childEnvironment(request.env);
  const compose = [
    "compose",
    ...(request.envName === ".env"
      ? []
      : ["--env-file", join(request.root, request.envName)]),
    "exec",
    "-T",
    "postgres",
  ];
  const asked = await run(
    "docker",
    [
      ...compose,
      "psql",
      "--username",
      "openbot",
      "--dbname",
      "openbot",
      "--tuples-only",
      "--no-align",
      "--command",
      "select extract(epoch from pg_postmaster_start_time())::text",
    ],
    { env: environment, cwd: request.root, timeoutMs: 30_000 },
  );
  if (asked.failedToStart || asked.code !== 0)
    return "Docker could not be asked for the database (is it running? Try: docker compose up -d postgres).";
  if (asked.stdout.trim() !== request.serverStartedAt)
    return "The database in Docker is not the one this command is connected to, so it cannot make the copy.";
  return {
    label: "pg_dump inside the Docker database",
    command: "docker",
    args: [
      ...compose,
      "pg_dump",
      "--username",
      "openbot",
      "--dbname",
      "openbot",
      ...dumpArguments(request.tables),
    ],
    env: environment,
    cwd: request.root,
  };
}

/**
 * How many rows each table has in a plain-format, data-only dump, or `undefined` when the text is not a
 * whole dump. `COPY` writes one row to a line (a newline inside a value is written `\n`), so rows are
 * lines between the `COPY` header and the `\.` that ends it.
 */
export function rowsInDump(
  text: string,
): Record<VaultTable, number> | undefined {
  if (!/^-- PostgreSQL database dump complete$/m.test(text)) return undefined;
  const counts = emptyCounts();
  let current: VaultTable | undefined;
  for (const line of text.split("\n")) {
    if (current === undefined) {
      const header =
        /^COPY public\.(credentials|saved_logins|sso_providers) \(.*\) FROM stdin;$/.exec(
          line,
        );
      if (header) current = header[1] as VaultTable;
    } else if (line === "\\.") {
      current = undefined;
    } else {
      counts[current] += 1;
    }
  }
  return counts;
}

/**
 * A `pg_dump` of the tables, into a file only its owner can read, which is made before anything is
 * written to it. The program on this computer when it is new enough to read the database; otherwise the
 * one inside the Compose database, which is the same version by construction, after checking that it is
 * the server this command is connected to. When neither can be used it says so and stops.
 */
export async function runBackup(request: BackupRequest): Promise<BackupResult> {
  const reasons: string[] = [];
  let plan: DumpPlan | undefined;
  for (const attempt of [hostDump, containerDump]) {
    const found = await attempt(request);
    if (typeof found === "string") reasons.push(found);
    else {
      plan = found;
      break;
    }
  }
  if (!plan)
    return {
      ok: false,
      reason: `${reasons.join(" ")} Install the PostgreSQL client tools (pg_dump) or start the database with Docker Compose, then run this again.`,
    };

  let descriptor: number;
  try {
    descriptor = openSync(request.path, "wx", 0o600);
  } catch {
    return {
      ok: false,
      reason: "The backup file could not be created next to the settings file.",
    };
  }
  let ran: Ran;
  try {
    ran = await run(plan.command, plan.args, {
      env: plan.env,
      cwd: plan.cwd,
      stdoutFd: descriptor,
      timeoutMs: 120_000,
    });
  } finally {
    closeSync(descriptor);
  }
  if (ran.failedToStart || ran.code !== 0) {
    await rm(request.path, { force: true });
    const said = ran.stderr.trim().slice(0, 300);
    return {
      ok: false,
      reason: `${plan.label} did not finish${said ? `: ${said}` : "."}`,
    };
  }
  const rows = rowsInDump(await readFile(request.path, "utf8"));
  if (!rows) {
    await rm(request.path, { force: true });
    return {
      ok: false,
      reason: `${plan.label} wrote a file that does not end the way a finished dump does.`,
    };
  }
  await chmod(request.path, 0o600);
  return { ok: true, via: plan.label, rows };
}

// ---------------------------------------------------------------------------------------------------
// Files this command leaves beside the settings file
// ---------------------------------------------------------------------------------------------------

type KeyFile = { path: string; key: string | undefined };

/**
 * The files an earlier run left holding a new key, newest first. Named for the settings file they
 * belong to, so a run for one stack never reads another stack's.
 */
async function keyFilesFor(root: string, envName: string): Promise<KeyFile[]> {
  const prefix = `${envName}.vault-new-key-`;
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const found = names
    .filter(
      (name) =>
        name.startsWith(prefix) &&
        /^\d{8}T\d{6}Z-[0-9a-f]{4}$/.test(name.slice(prefix.length)),
    )
    .sort()
    .reverse();
  const files: KeyFile[] = [];
  for (const name of found) {
    const path = join(root, name);
    let key: string | undefined;
    try {
      const content = (await readFile(path, "latin1")).trim();
      if (isValidKey(content) && !isPublishedExampleKey(content)) key = content;
    } catch {
      key = undefined;
    }
    files.push({ path, key });
  }
  return files;
}

function stampOf(date: Date): string {
  const text = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `${text}-${randomBytes(2).toString("hex")}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The same thing `start.sh` does to write a setting, as one line for a person to paste, with the key
 * read from its file and never written out. `|| true` because `grep -v` exits 1 when no line is left.
 */
export function manualRecoveryCommand(
  envPath: string,
  keyPath: string,
): string {
  const env = shellQuote(envPath);
  const fresh = shellQuote(`${envPath}.new`);
  return `{ grep -v '^${KEY_NAME}=' ${env} || true; } > ${fresh} && printf '${KEY_NAME}=%s\\n' "$(cat ${shellQuote(keyPath)})" >> ${fresh} && chmod 600 ${fresh} && mv ${fresh} ${env}`;
}

// ---------------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------------

export type Stage = "inspected" | "backed-up" | "key-saved" | "resealed";

export type RekeyOptions = {
  argv: string[];
  /** The folder docker-compose.yml and the settings file are in (the `openbot` folder). */
  root: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  now?: () => Date;
  /** Opens the database. Tests, and nothing else, pass their own. */
  connect?: (databaseUrl: string) => Database;
  backup?: (request: BackupRequest) => Promise<BackupResult>;
  writeSetting?: (path: string, name: string, value: string) => Promise<void>;
  /**
   * Called at each point where the work can still be stopped without a trace. The entry point throws
   * `Interrupted` from it after Ctrl-C; a test throws to stand in for an interruption.
   */
  checkpoint?: (stage: Stage) => void | Promise<void>;
};

type Voice = {
  say: (line?: string) => void;
  complain: (line?: string) => void;
  hide: (secret: string | undefined) => void;
};

/**
 * Everything this command prints passes through `clean`, which has been told each secret the run knows
 * of (the current key, the new key, the database password) and also removes anything shaped like a
 * stored envelope. A message built from an error therefore cannot carry a secret out, whatever the
 * error held.
 */
function voiceFor(options: RekeyOptions): Voice {
  const hidden: string[] = [];
  const clean = (text: string) =>
    hidden
      .reduce((value, secret) => value.split(secret).join("[hidden]"), text)
      .replace(/\{"version":1[^}]*\}/g, "[hidden]");
  return {
    say: (line = "") => options.out(clean(line)),
    complain: (line = "") => options.err(clean(line)),
    hide: (secret) => {
      // Not a short one: a password like `openbot` would turn every word it is part of into [hidden].
      if (secret && secret.length >= 12) hidden.push(secret);
    },
  };
}

function tableLines(inspection: Inspection): string[] {
  const header = ["table", "rows", "sealed values", "open", "do not open"];
  const body = VAULT_TABLES.map((table) => {
    const tally = inspection[table];
    return [
      table,
      String(tally.rows),
      String(tally.sealed),
      String(tally.open),
      String(tally.unopened),
    ];
  });
  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((row) => (row[column] ?? "").length)),
  );
  const format = (cells: string[]) =>
    `  ${cells
      .map((cell, column) =>
        column === 0
          ? cell.padEnd(widths[column] ?? 0)
          : cell.padStart(widths[column] ?? 0),
      )
      .join("  ")}`;
  return [format(header), ...body.map(format)];
}

function closedLines(inspection: Inspection): string[] {
  const lines: string[] = [];
  for (const table of VAULT_TABLES) {
    const ids = inspection[table].closed;
    if (ids.length === 0) continue;
    const shown = ids.slice(0, 10).map((id) => `row ${id}`);
    const more = ids.length > 10 ? `, and ${ids.length - 10} more` : "";
    lines.push(`  ${table}: ${shown.join(", ")}${more}`);
  }
  return lines;
}

function sameCounts(
  a: Record<VaultTable, number>,
  b: Record<VaultTable, number>,
) {
  return VAULT_TABLES.every((table) => a[table] === b[table]);
}

function keyFileLines(keyFiles: KeyFile[]): string[] {
  if (keyFiles.length === 0) return [];
  return [
    "A file from an earlier run still holds a key. Once the stack starts and your connections work you can delete it:",
    ...keyFiles.map((file) => `  ${file.path}`),
  ];
}

/** What a failure may say: our own words, or the driver's, never a statement and never a value. */
function reasonOf(error: unknown): string {
  if (
    error instanceof VaultRekeyError ||
    error instanceof Refusal ||
    error instanceof Interrupted
  )
    return error.message;
  const reason = reasonWithoutStatement(error).slice(0, 300);
  if (/lock timeout/i.test(reason))
    return "A table could not be locked within 10 seconds, so something else is using it.";
  return reason;
}

type Start = {
  apply: boolean;
  yes: boolean;
  envName: string;
  envPath: string;
  settings: string;
  /** The key as the settings file has it, which is the published example. */
  current: string;
  keyFiles: KeyFile[];
  /** Whether the key the Bots sign web requests with is made from this key; see webSigningFollowsKey. */
  webSigning: boolean;
};

/**
 * Whether there is anything for this command to do, before anything is asked of anybody: a usage
 * problem, a settings file that is missing or belongs to the desktop app, and a key that is not the
 * example (the second run, and everybody who already has a key of their own) all end here, saying so.
 */
async function decide(
  options: RekeyOptions,
  voice: Voice,
): Promise<number | Start> {
  const { say, complain, hide } = voice;
  const parsed = parseArguments(options.argv);
  if (parsed.kind === "help") {
    for (const line of USAGE) say(line);
    return EXIT.ok;
  }
  if (parsed.kind === "problem") {
    complain(parsed.message);
    for (const line of USAGE) complain(line);
    return EXIT.refused;
  }

  const envName = options.env.OPENBOT_ENV_FILE?.trim() || ".env";
  if (!ENV_NAME.test(envName)) {
    complain(
      "OPENBOT_ENV_FILE must name a file beside docker-compose.yml, such as .env.eval.",
    );
    return EXIT.refused;
  }
  const envPath = join(options.root, envName);
  let settings: string;
  try {
    settings = await readFile(envPath, "latin1");
  } catch {
    complain(
      `${envName} was not found in ${options.root}. Nothing was changed.`,
    );
    return EXIT.refused;
  }
  const desktop = await stat(
    join(options.root, ".secrets", `${KEY_NAME}.secret`),
  ).then(
    () => true,
    () => false,
  );
  if (desktop) {
    complain(
      "This folder belongs to the FreeDuet desktop app, which keeps its key in .secrets and writes .env from it. This command does not change that key. Nothing was changed.",
    );
    return EXIT.refused;
  }

  // Trimmed, because the server trims what it reads, so a line with a space after the `=` is the key it names.
  const current = settingFrom(settings, KEY_NAME).trim();
  hide(current);
  const fromEnvironment = (options.env[KEY_NAME] ?? "").trim();
  hide(fromEnvironment);
  const keyFiles = await keyFilesFor(options.root, envName);
  for (const file of keyFiles) hide(file.key);

  if (fromEnvironment !== "" && fromEnvironment !== current) {
    say(
      `${KEY_NAME} is set in your environment, to something other than the line in ${envName}.`,
    );
    say(
      "start.sh and the server use the environment's value, a key you chose yourself, so this command leaves it alone.",
    );
    say("Nothing was changed.");
    return EXIT.ok;
  }
  if (current === "" || !isPublishedExampleKey(current)) {
    say(
      current === ""
        ? `${envName} has no ${KEY_NAME} line, so there is nothing to change. start.sh makes a key for this installation the next time it runs.`
        : `${KEY_NAME} in ${envName} is not the example key this repository publishes, so there is nothing to change.`,
    );
    say("Nothing was changed.");
    for (const line of keyFileLines(keyFiles)) say(line);
    return EXIT.ok;
  }
  return {
    apply: parsed.apply,
    yes: parsed.yes,
    envName,
    envPath,
    settings,
    current,
    keyFiles,
    webSigning: webSigningFollowsKey(options.env, settings),
  };
}

/**
 * Whether the key the Bots sign web requests with is made from the key this command replaces: signing
 * is on and has no key of its own, which is when `web-bot-auth.ts` derives one from the deployment key.
 * The environment wins over the file, as it does for the server. Read as the server reads it, so
 * `ON` counts.
 */
export function webSigningFollowsKey(
  env: Record<string, string | undefined>,
  settings: string,
): boolean {
  const named = (name: string) =>
    (env[name]?.trim()
      ? (env[name] ?? "")
      : settingFrom(settings, name)
    ).trim();
  return (
    named("WEB_BOT_AUTH").toLowerCase() === "on" &&
    named("WEB_BOT_AUTH_KEY") === ""
  );
}

/** What this will do, in plain words, before it does any of it. */
function announce(voice: Voice, start: Start) {
  const { say } = voice;
  const { envName } = start;
  if (start.apply) {
    for (const line of [
      "Seal the saved secrets again with a new key",
      "",
      `${KEY_NAME} in ${envName} is still the example key this repository publishes, so anyone who has a copy of your database can open what it holds.`,
      "With --apply, this command will:",
      "  1. Check that FreeDuet is stopped and that nothing else is using the database.",
      "  2. Open every saved secret (connections, saved logins, sign-in provider secrets) with the current key.",
      "     If even one does not open, it stops and changes nothing.",
      `  3. Save a backup of those tables to a file next to ${envName} that only you can read. This needs pg_dump.`,
      `  4. Make a new key and keep a copy in a second file next to ${envName}, until ${envName} has it.`,
      "  5. Seal every saved secret again with the new key, in one step that is undone completely if anything goes wrong,",
      "     and check that each one opens with the new key.",
      `  6. Only then write the new key into ${envName}.`,
      "It never prints a secret, and nothing leaves this computer.",
    ])
      say(line);
  } else {
    for (const line of [
      "Check the saved secrets (nothing is changed)",
      "",
      `${KEY_NAME} in ${envName} is still the example key this repository publishes.`,
      "This opens every saved secret in your database with the current key and reports counts only: how many rows there are, how many open and how many do not.",
      "It changes nothing, writes no file and prints no secret. To seal them again with a new key, run it again with --apply.",
    ])
      say(line);
  }
  if (start.webSigning)
    say(
      "WEB_BOT_AUTH is on and has no WEB_BOT_AUTH_KEY, so the key your Bots sign web requests with is made from this key and changes with it. A site that trusts the old one needs the new one.",
    );
  if (start.keyFiles.length > 0)
    say(
      `A file from an earlier run holds a new key (${start.keyFiles[0]?.path}). This command first finds out whether that run finished, and finishes it if it can.`,
    );
}

/**
 * The checks that need no database: the server is not running (it holds the old key in memory and would
 * go on sealing new rows with it), and the settings name one database and agree with the environment.
 */
async function preflight(
  options: RekeyOptions,
  voice: Voice,
  start: Start,
): Promise<number | { databaseUrl: string; address: Address }> {
  const { say, complain, hide } = voice;
  const portText =
    options.env.SERVER_PORT?.trim() ||
    settingFrom(start.settings, "SERVER_PORT") ||
    "3001";
  const portNumber = Number(portText);
  const port =
    Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536
      ? portNumber
      : 3001;
  if (await serverIsUp(port)) {
    complain(
      `FreeDuet is running: its server answered on port ${port}. Stop it first (bash scripts/stop.sh), start the database alone (docker compose up -d postgres) and run this again. Nothing was changed.`,
    );
    return EXIT.refused;
  }
  say(`FreeDuet is stopped (nothing answered on port ${port}).`);

  const fromFile = settingFrom(start.settings, "DATABASE_URL");
  const fromShell = options.env.DATABASE_URL?.trim() ?? "";
  hide(fromFile);
  hide(fromShell);
  if (fromFile !== "" && fromShell !== "" && fromFile !== fromShell) {
    complain(
      `DATABASE_URL is set in your environment to a different database than the one in ${start.envName}. This command will not guess which one the server uses. Unset it, or make them the same, and run this again. Nothing was changed.`,
    );
    return EXIT.refused;
  }
  const databaseUrl = fromFile || fromShell;
  if (databaseUrl === "") {
    complain(
      `There is no DATABASE_URL in ${start.envName} or in your environment. Nothing was changed.`,
    );
    return EXIT.refused;
  }
  try {
    const address = addressFrom(databaseUrl);
    hide(address.password);
    return { databaseUrl, address };
  } catch (error) {
    complain(`${reasonWithoutStatement(error)} Nothing was changed.`);
    return EXIT.refused;
  }
}

type Opened = { serverMajor: number; serverStartedAt: string };

/** Reaches the database and checks that nothing else is connected to it. */
async function openDatabase(
  voice: Voice,
  database: Database,
  address: Address,
): Promise<number | Opened> {
  const { say, complain } = voice;
  const where = `${address.hostname}:${address.port}/${address.database}`;
  let opened: Opened;
  try {
    const started = await database.execute(
      sql`select extract(epoch from pg_postmaster_start_time())::text as at`,
    );
    opened = {
      serverMajor: await serverMajorVersion(database),
      serverStartedAt: String(
        (started as unknown as { at: string }[])[0]?.at ?? "",
      ),
    };
  } catch (error) {
    complain(
      `Could not reach the database at ${where}: ${reasonOf(error)} Start it with: docker compose up -d postgres. Nothing was changed.`,
    );
    return EXIT.failed;
  }
  say(`Connected to the database at ${where}.`);

  const others = await otherSessions(database);
  if (others.count > 0) {
    complain(
      `Something else is connected to the database (${others.count} connection${others.count === 1 ? "" : "s"}: ${others.names.join(", ")}). It may be the FreeDuet server or worker, a database tool, or another script. Close it, stop FreeDuet (bash scripts/stop.sh), start the database alone (docker compose up -d postgres) and run this again. Nothing was changed.`,
    );
    return EXIT.refused;
  }
  say(
    (await seesEverySession(database))
      ? "Nothing else is connected to the database."
      : "Nothing else is connected under this database user. It cannot see connections made by other users, so make sure nothing else uses the database.",
  );
  say();
  return opened;
}

type Examined = { inspection: Inspection; sums: ReturnType<typeof totals> };

/**
 * Opens every saved secret with the current key and says how many do. Ends the run when there is
 * nothing to do, when one does not open (before any change, naming the table and the row id only), or
 * when an earlier run turns out to have changed the database and only the settings file is left.
 */
async function examine(
  options: RekeyOptions,
  voice: Voice,
  start: Start,
  database: Database,
): Promise<number | Examined> {
  const { say, complain } = voice;
  const inspection = await inspectVault(database, start.current);
  const sums = totals(inspection);

  // An earlier run that changed the database and could not write the key: finish that, changing nothing in the database.
  for (const file of start.keyFiles) {
    if (file.key === undefined) continue;
    const all = totals(await inspectVault(database, file.key));
    if (all.sealed === 0 || all.unopened > 0 || sums.open > 0) continue;
    say(
      `An earlier run sealed all ${all.sealed} saved secrets with the new key in ${file.path}, and stopped before ${start.envName} had it.`,
    );
    if (!start.apply) {
      say(
        `Run it again with --apply --yes to put that key into ${start.envName}. Nothing in the database changes.`,
      );
      return EXIT.ok;
    }
    return await finishEarlierRun({
      voice,
      file: { path: file.path, key: file.key },
      start,
      others: start.keyFiles.filter((other) => other !== file),
      write: options.writeSetting ?? writeSetting,
    });
  }

  say("Opened every saved secret with the current key. Only counts are shown.");
  say();
  for (const line of tableLines(inspection)) say(line);
  say();
  if (sums.plain > 0)
    say(
      `${sums.plain} value${sums.plain === 1 ? " is" : "s are"} stored as plain text, not sealed by any key. Those are not touched.`,
    );
  if (sums.unopened > 0) {
    complain(
      `Stopped: ${sums.unopened} saved secret${sums.unopened === 1 ? " does" : "s do"} not open with the current key, so nothing was changed.`,
    );
    for (const line of closedLines(inspection)) complain(line);
    complain(
      "A secret that does not open was sealed with a different key, or is damaged. Sealing the rest again would hide that, so this command changes nothing until it is sorted out.",
    );
    for (const line of keyFileLines(start.keyFiles)) complain(line);
    return EXIT.failed;
  }
  if (sums.rows === 0) {
    say(
      "The saved-secret tables are empty, so there is nothing to seal again. start.sh replaces the example key by itself the next time it runs.",
    );
    say("Nothing was changed.");
    return EXIT.ok;
  }
  say(
    sums.sealed === 0
      ? `${sums.rows} row${sums.rows === 1 ? "" : "s"} found, none of them holding a sealed value.`
      : `All ${sums.sealed} saved secrets open with the current key.`,
  );
  return { inspection, sums };
}

/** The key is in a file and the database already holds what it seals: put it into the settings file. */
async function finishEarlierRun(context: {
  voice: Voice;
  file: { path: string; key: string };
  start: Start;
  others: KeyFile[];
  write: (path: string, name: string, value: string) => Promise<void>;
}): Promise<number> {
  const { say, complain, hide } = context.voice;
  const { file, start } = context;
  hide(file.key);
  try {
    await context.write(start.envPath, KEY_NAME, file.key);
    const written = settingFrom(
      await readFile(start.envPath, "latin1"),
      KEY_NAME,
    );
    if (written !== file.key)
      throw new Error("the key read back is not the one that was written");
  } catch (error) {
    complain(
      `The new key could NOT be written into ${start.envName} (${reasonOf(error)}). Nothing in the database changed. Do not start FreeDuet until ${start.envName} has it.`,
    );
    complain(
      `This puts the key in by hand (the same steps start.sh takes): ${manualRecoveryCommand(start.envPath, file.path)}`,
    );
    return EXIT.keyNotWritten;
  }
  await rm(file.path, { force: true });
  say(
    `Done. The new key is in ${start.envName}. The database was not changed.`,
  );
  say(
    "Next: start FreeDuet again (bash scripts/start.sh) and check that your connections and saved logins still work.",
  );
  if (context.others.length > 0)
    say(
      `Other files from earlier runs still hold keys that open nothing here. You can delete them: ${context.others.map((other) => other.path).join(", ")}`,
    );
  return EXIT.ok;
}

/**
 * The change itself. In order: the backup, the new key in a file of its own, one transaction that seals
 * every value again and checks it, and only after the commit the settings file.
 *
 * Until the commit, any failure puts everything back: the transaction is undone, and the backup and the
 * key file made for this run are removed (nothing depends on either). After the commit the database
 * holds data only the new key opens, so from there the key file is what keeps it from being lost, and
 * it stays until the settings file has the key.
 */
async function applyRekey(context: {
  options: RekeyOptions;
  voice: Voice;
  start: Start;
  database: Database;
  address: Address;
  opened: Opened;
  examined: Examined;
}): Promise<number> {
  const { options, voice, start, database, address, opened, examined } =
    context;
  const { say, complain, hide } = voice;
  const { envName, envPath, current } = start;
  const checkpoint = options.checkpoint ?? (() => undefined);

  const stamp = stampOf((options.now ?? (() => new Date()))());
  const backupPath = join(options.root, `${envName}.vault-backup-${stamp}.sql`);
  const keyPath = join(options.root, `${envName}.vault-new-key-${stamp}`);
  const newKey = newVaultKey();
  hide(newKey);
  const rowsBefore = Object.fromEntries(
    VAULT_TABLES.map((table) => [table, examined.inspection[table].rows]),
  ) as Record<VaultTable, number>;

  let callbackFinished = false;
  let values: Record<VaultTable, number>;
  try {
    say("Saving a backup first.");
    const backup = await (options.backup ?? runBackup)({
      path: backupPath,
      tables: await presentTables(database),
      address,
      serverMajor: opened.serverMajor,
      serverStartedAt: opened.serverStartedAt,
      root: options.root,
      envName,
      env: options.env,
    });
    if (!backup.ok)
      throw new Refusal(`The backup could not be made. ${backup.reason}`);
    if (!sameCounts(backup.rows, rowsBefore))
      throw new Refusal(
        "The backup does not hold the same number of rows as the database. Run this again.",
      );
    say(`  Backup saved (${backup.via}): ${backupPath}. Only you can read it.`);
    await checkpoint("backed-up");

    await createPrivateFile(keyPath, `${newKey}\n`);
    say(
      `  The new key is kept in ${keyPath} until ${envName} has it. Only you can read it.`,
    );
    await checkpoint("key-saved");

    say("Sealing every saved secret again, in one step.");
    values = (
      await database.transaction(async (transaction) => {
        const result = await resealVault(transaction, current, newKey);
        if (!sameCounts(result.rows, backup.rows))
          throw new Refusal(
            "The tables changed after the backup was made. Run this again.",
          );
        const nowOthers = await otherSessions(transaction);
        if (nowOthers.count > 0)
          throw new Refusal(
            "Something connected to the database while this was running. Close it and run this again.",
          );
        await checkpoint("resealed");
        callbackFinished = true;
        return result;
      })
    ).values;
  } catch (error) {
    if (!callbackFinished) {
      // Undone. Nothing depends on the backup or on the new key, and both hold secrets.
      await rm(backupPath, { force: true });
      await rm(keyPath, { force: true });
      throw error;
    }
    // The database was asked to commit and did not say. Keep the key: the next run finds out which it was.
    complain(
      `The database did not confirm the last step (${reasonOf(error)}). Do not start FreeDuet. Run this again to find out where things stand; the new key is kept in ${keyPath}, and the backup is ${backupPath}.`,
    );
    return EXIT.keyNotWritten;
  }
  say("The saved secrets in the database are now sealed with the new key.");

  const write = options.writeSetting ?? writeSetting;
  let written: string;
  try {
    await write(envPath, KEY_NAME, newKey);
    written = settingFrom(await readFile(envPath, "latin1"), KEY_NAME);
    if (written !== newKey)
      throw new Error("the key read back is not the one that was written");
    if (process.platform !== "win32") {
      const mode = (await stat(envPath)).mode & 0o777;
      if (mode !== 0o600)
        throw new Error(`${envName} can be read by someone other than you`);
    }
  } catch (error) {
    complain(
      `The new key could NOT be written into ${envName} (${reasonOf(error)}).`,
    );
    complain(
      `The database is already sealed with it, so do not start FreeDuet until ${envName} has it. The key is kept in ${keyPath} (only you can read it).`,
    );
    complain(
      "To finish, run this again: bun scripts/rekey-vault.ts --apply --yes",
    );
    complain(
      `If it cannot write ${envName} either, this puts the key in by hand (the same steps start.sh takes):`,
    );
    complain(`  ${manualRecoveryCommand(envPath, keyPath)}`);
    complain(`and then delete ${keyPath}.`);
    return EXIT.keyNotWritten;
  }

  // The last look, with the key as the file now has it, which is the key the server will read.
  let checkedOpen: number;
  try {
    const withNew = totals(await inspectVault(database, written));
    const withOld = totals(await inspectVault(database, current));
    if (withNew.unopened > 0 || withOld.open > 0)
      throw new Refusal(
        `${withNew.unopened} saved secret(s) do not open with the key now in ${envName} and ${withOld.open} still open with the old one`,
      );
    checkedOpen = withNew.open;
  } catch (error) {
    complain(
      `Unexpected: the final check failed (${reasonOf(error)}). ${envName} has the new key and the database is sealed with it. The key is also in ${keyPath}, and the backup is ${backupPath}. Do not start FreeDuet until you have looked at these.`,
    );
    return EXIT.failed;
  }
  await rm(keyPath, { force: true });

  say();
  say(`Done. The new key is in ${envName}.`);
  say(
    `  Sealed again: ${values.credentials} connection${values.credentials === 1 ? "" : "s"}, ${values.saved_logins} saved login${values.saved_logins === 1 ? "" : "s"}, ${values.sso_providers} sign-in provider value${values.sso_providers === 1 ? "" : "s"}.`,
  );
  say(
    checkedOpen === 0
      ? "  Nothing was sealed with the old key, so only the key changed."
      : `  Checked: all ${checkedOpen} open with the new key, and none opens with the old one.`,
  );
  say();
  say("Next:");
  say("  1. Start FreeDuet again: bash scripts/start.sh");
  say("  2. Check that your connections and saved logins still work.");
  say(
    `  3. The backup (${backupPath}) holds everything sealed with the OLD key, which is public, so anyone who gets that file can read your saved secrets. When step 2 is fine, delete it.`,
  );
  for (const line of keyFileLines(start.keyFiles)) say(line);
  return EXIT.ok;
}

export async function runRekey(options: RekeyOptions): Promise<number> {
  const voice = voiceFor(options);
  const { say, complain } = voice;

  const start = await decide(options, voice);
  if (typeof start === "number") return start;
  announce(voice, start);
  if (!start.yes) {
    say();
    say("Add --yes to go ahead. Nothing was changed.");
    return EXIT.refused;
  }
  say();
  const found = await preflight(options, voice, start);
  if (typeof found === "number") return found;

  let database: Database | undefined;
  try {
    database = (options.connect ?? ((url) => createDatabase(url, { max: 2 })))(
      withApplicationName(found.databaseUrl),
    );
    const opened = await openDatabase(voice, database, found.address);
    if (typeof opened === "number") return opened;
    const examined = await examine(options, voice, start, database);
    if (typeof examined === "number") return examined;
    if (!start.apply) {
      say(
        "To seal them again with a new key, stop FreeDuet if it is running and run:",
      );
      say("  bun scripts/rekey-vault.ts --apply --yes");
      for (const line of keyFileLines(start.keyFiles)) say(line);
      return EXIT.ok;
    }
    await (options.checkpoint ?? (() => undefined))("inspected");
    return await applyRekey({
      options,
      voice,
      start,
      database,
      address: found.address,
      opened,
      examined,
    });
  } catch (error) {
    if (error instanceof Interrupted) {
      say();
      say("Interrupted. Nothing was changed.");
      return EXIT.interrupted;
    }
    complain(`Stopped: ${reasonOf(error)} Nothing was changed.`);
    return EXIT.failed;
  } finally {
    await database?.$client.close().catch(() => undefined);
  }
}
