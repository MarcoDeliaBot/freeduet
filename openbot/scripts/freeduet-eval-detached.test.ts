/**
 * `scripts/freeduet-eval-detached.sh` runs the team evals on the eval stack, detached, and reports
 * on them while they run. These tests run it with `--dry-run` and `--status` only, in a temporary
 * copy of the folder layout (openbot/scripts, openbot/.env.eval, evals/team/reports), so nothing
 * starts, no container is touched and no network address is dialled.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_SOURCE = join(import.meta.dir, "freeduet-eval-detached.sh");
const REQUIRE_BASH = join(import.meta.dir, "require-bash.sh");

const GOOD_ENV = [
  "COMPOSE_PROJECT_NAME=freeduet-eval",
  "APP_PORT=3110",
  "SERVER_PORT=3101",
  "FREEDUET_PORT=4231",
  "OPENBOT_PUBLIC_URL=http://localhost:3101",
  "",
].join("\n");

const trees: string[] = [];

afterEach(() => {
  for (const tree of trees.splice(0))
    rmSync(tree, { recursive: true, force: true });
});

/** A temporary repository layout with the script copied in, and an env file if `env` is given. */
function tree(env?: string): string {
  const root = mkdtempSync(join(tmpdir(), "eval-detached-"));
  trees.push(root);
  mkdirSync(join(root, "openbot", "scripts"), { recursive: true });
  mkdirSync(join(root, "evals", "team", "reports"), { recursive: true });
  copyFileSync(
    SCRIPT_SOURCE,
    join(root, "openbot", "scripts", "freeduet-eval-detached.sh"),
  );
  copyFileSync(
    REQUIRE_BASH,
    join(root, "openbot", "scripts", "require-bash.sh"),
  );
  if (env !== undefined) writeFileSync(join(root, "openbot", ".env.eval"), env);
  return root;
}

function run(
  root: string,
  args: string[],
): { code: number; out: string; err: string } {
  const result = spawnSync(
    "bash",
    [join(root, "openbot", "scripts", "freeduet-eval-detached.sh"), ...args],
    { cwd: root, encoding: "utf8" },
  );
  return { code: result.status ?? -1, out: result.stdout, err: result.stderr };
}

describe("dry run", () => {
  test("prints the steps in order and runs none", () => {
    const root = tree(GOOD_ENV);
    const result = run(root, [
      "--dry-run",
      "--repeat",
      "2",
      "--id",
      "iris-1,iris-2",
    ]);
    expect(result.code).toBe(0);
    const out = result.out;
    const order = [
      "freeduet-eval",
      "freeduet-eval-stack.sh reset",
      "http://localhost:3101/health",
      "evals/team/run.ts --repeat 2 --id iris-1,iris-2",
      "evals/team/reports/run-",
    ].map((text) => out.indexOf(text));
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain("status");
    // Nothing was written: no status file, no log.
    expect(readdirSync(join(root, "evals", "team", "reports"))).toEqual([]);
  });

  test("defaults to three repeats, and passes --member through", () => {
    const root = tree(GOOD_ENV);
    const result = run(root, ["--dry-run", "--member", "otto"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("run.ts --repeat 3 --member otto");
  });
});

describe("refusals", () => {
  test("refuses when openbot/.env.eval is missing", () => {
    const root = tree();
    const result = run(root, ["--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("missing");
  });

  test("refuses an env file that names the person's Compose project", () => {
    const root = tree(GOOD_ENV.replace("freeduet-eval", "freeduet"));
    const result = run(root, ["--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("freeduet-eval");
  });

  test("refuses a port of 3010 as the port of the person's own FreeDuet", () => {
    const root = tree(GOOD_ENV.replace("SERVER_PORT=3101", "SERVER_PORT=3010"));
    const result = run(root, ["--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("3010");
  });

  test("refuses a URL that points at port 3010", () => {
    const root = tree(GOOD_ENV.replace("localhost:3101", "localhost:3010"));
    const result = run(root, ["--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("3010");
  });

  test("refuses an env file with no server port", () => {
    const root = tree(GOOD_ENV.replace("SERVER_PORT=3101\n", ""));
    const result = run(root, ["--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("SERVER_PORT");
  });

  test("does not mistake another port that ends in 3010 for 3010", () => {
    const root = tree(GOOD_ENV + "FREEDUET_EVAL_NOTE=13010\n");
    const result = run(root, ["--dry-run"]);
    expect(result.code).toBe(0);
  });

  test("refuses --repeat 0 and a repeat count that is not a number", () => {
    const root = tree(GOOD_ENV);
    expect(run(root, ["--dry-run", "--repeat", "0"]).code).toBe(2);
    expect(run(root, ["--dry-run", "--repeat", "three"]).code).toBe(2);
  });

  test("refuses an unknown argument and a value that is missing", () => {
    const root = tree(GOOD_ENV);
    expect(run(root, ["--dry-run", "--reset-everything"]).code).toBe(2);
    expect(run(root, ["--dry-run", "--id"]).code).toBe(2);
  });

  test("refuses an id list with a shell character in it", () => {
    const root = tree(GOOD_ENV);
    const result = run(root, ["--dry-run", "--id", "iris-1;rm"]);
    expect(result.code).toBe(2);
  });
});

describe("status", () => {
  test("says so when no run was ever started", () => {
    const root = tree(GOOD_ENV);
    const result = run(root, ["--status"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("no run has been started");
  });

  test("counts the PASS, FAIL, SKIP and UNGRADED lines of the newest run", () => {
    const root = tree(GOOD_ENV);
    const reports = join(root, "evals", "team", "reports");
    writeFileSync(
      join(reports, "run-20261120T100000Z.status"),
      "DONE exit=0 log=run-20261120T100000Z.log\n",
    );
    writeFileSync(join(reports, "run-20261120T100000Z.log"), "PASS old-1\n");
    writeFileSync(
      join(reports, "run-20261121T100000Z.status"),
      "DONE exit=1 log=run-20261121T100000Z.log\n",
    );
    writeFileSync(
      join(reports, "run-20261121T100000Z.log"),
      [
        "PASS iris-1 (run 1/2)",
        "FAIL iris-1 (run 2/2): missing word",
        "SKIP otto-4 (run 1/2): needs Gmail",
        "UNGRADED mark-2 (run 1/2): grader",
        "  note: PASS in an indented line is not a verdict",
        "",
      ].join("\n"),
    );
    // The newest run is the one with the later name, whatever order the files were written in.
    const result = run(root, ["--status"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("DONE exit=1");
    expect(result.out).toContain("PASS=1 FAIL=1 SKIP=1 UNGRADED=1");
    expect(result.out).not.toContain("old-1");
  });

  test("says a RUNNING run whose process has gone was killed", () => {
    const root = tree(GOOD_ENV);
    const reports = join(root, "evals", "team", "reports");
    writeFileSync(
      join(reports, "run-20261121T120000Z.status"),
      "RUNNING pid=999999 log=run-20261121T120000Z.log\n",
    );
    writeFileSync(
      join(reports, "run-20261121T120000Z.log"),
      "PASS iris-1 (run 1/1)\n",
    );
    const result = run(root, ["--status"]);
    expect(result.out).toContain("not running");
    expect(existsSync(join(reports, "run-20261121T120000Z.log"))).toBe(true);
  });
});
