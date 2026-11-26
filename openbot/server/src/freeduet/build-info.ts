/**
 * Which build is running (D162): the release version, the commit and when the server started, so the
 * person can see in the app that new work is online. Computed once, at server start, never in the browser.
 *
 * WHERE EACH PART COMES FROM, in this order:
 *   version  FREEDUET_BUILD_VERSION (set at image build) -> the latest release tag, read with
 *            `git describe --tags --abbrev=0` (tags reachable from HEAD), then the newest `v*` tag of the
 *            repository when none is reachable -> `version` in openbot/package.json.
 *   commit   FREEDUET_BUILD_COMMIT (set at image build) -> `git rev-parse --short=8 HEAD` -> absent.
 *   built    FREEDUET_BUILD_TIME (set at image build, ISO) -> the time this server started.
 *
 * Nothing here holds a secret, a path or a host name: the git commands run in the folder of this file and
 * only their one-line answers are kept; an answer that is not a plain tag or a hex commit is dropped.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type BuildInfo = {
  /** e.g. `0.2.2`, without the leading v. */
  version: string;
  /** Eight hex characters, or null where no commit is known. */
  commit: string | null;
  /** ISO time the build was made (image) or this server started. */
  builtAt: string;
  /** The line the app shows, e.g. `v0.2.2 · 94313002 · 26 Nov 2026 22:05`. */
  label: string;
};

type Run = (args: string[]) => string | null;

export type BuildInputs = {
  env: Record<string, string | undefined>;
  /** Runs git and returns its trimmed first line, or null when git is missing or fails. */
  git: Run;
  /** `version` of openbot/package.json, or null. */
  packageVersion: string | null;
  now: Date;
};

const TAG = /^v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** `26 Nov 2026 22:05`, in the server's own local time. */
export function formatBuilt(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function computeBuildInfo(input: BuildInputs): BuildInfo {
  const fromEnv = TAG.exec(input.env.FREEDUET_BUILD_VERSION?.trim() ?? "");
  const tag = (value: string | null) => TAG.exec(value ?? "")?.[1];
  const version =
    fromEnv?.[1] ??
    tag(input.git(["describe", "--tags", "--abbrev=0"])) ??
    tag(input.git(["tag", "-l", "v*", "--sort=-v:refname"])) ??
    tag(input.packageVersion) ??
    "unknown";

  const envCommit = input.env.FREEDUET_BUILD_COMMIT?.trim().toLowerCase() ?? "";
  const gitCommit = input.git(["rev-parse", "--short=8", "HEAD"]);
  const raw = COMMIT.test(envCommit)
    ? envCommit
    : gitCommit && COMMIT.test(gitCommit)
      ? gitCommit
      : null;
  const commit = raw ? raw.slice(0, 8) : null;

  const envTime = new Date(input.env.FREEDUET_BUILD_TIME?.trim() ?? "");
  const built = Number.isNaN(envTime.getTime()) ? input.now : envTime;

  const label = [
    version === "unknown" ? "unknown version" : `v${version}`,
    commit,
    formatBuilt(built),
  ]
    .filter(Boolean)
    .join(" · ");
  return { version, commit, builtAt: built.toISOString(), label };
}

/** Runs git in this file's own folder; any failure (no git, no repository) is null. */
function runGit(args: string[]): string | null {
  try {
    const result = Bun.spawnSync(["git", ...args], {
      cwd: dirname(new URL(import.meta.url).pathname),
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
      // A git that hangs never holds the server: two seconds, then this step is skipped.
      timeout: 2000,
    });
    if (result.exitCode !== 0) return null;
    return result.stdout.toString().trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

function readPackageVersion(): string | null {
  try {
    const path = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../../package.json",
    );
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

let cached: BuildInfo | null = null;

/** Computed once, when the routes are made at server start, and kept for the life of the process. */
export function buildInfo(): BuildInfo {
  cached ??= computeBuildInfo({
    env: process.env,
    git: runGit,
    packageVersion: readPackageVersion(),
    now: new Date(),
  });
  return cached;
}

export const buildInfoForTest = {
  reset: () => {
    cached = null;
  },
};
