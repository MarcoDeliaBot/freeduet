import { afterEach, describe, expect, test } from "bun:test";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `scripts/typecheck-tests.ts` when `tsc` finished, and when it did not.
 *
 * The gate used to read only what `tsc` printed. A run that the out-of-memory killer ended (exit 137)
 * prints nothing, so the gate read it as "no errors": it reported the baseline as fixed, or the suite
 * as clean, and exited 0. Now the exit status and any signal decide, and a run that did not finish
 * exits 2 before it compares anything or writes the baseline.
 *
 * Each case runs the real script in a sandbox: a copy of it under a temporary `scripts/`, a baseline
 * of its own, and a `bunx` on PATH that plays `tsc`. PATH holds nothing else, so a missing `bunx` is a
 * real spawn failure, and `--update` never touches the repository's baseline. The fakes are `#!/bin/sh`
 * scripts that use only shell builtins, as `processes.test.ts` does.
 */

const gateScript = resolve(import.meta.dir, "typecheck-tests.ts");

// Lines as `tsc --pretty false` prints them. The baseline holds the same text without the position,
// which is how the gate keys an error.
const alpha =
  "server/tests/alpha.test.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.";
const beta =
  "server/tests/beta.test.ts(12,4): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'string'.";
const gamma =
  "server/tests/gamma.test.ts(9,1): error TS2554: Expected 1 arguments, but got 0.";
const knownErrors = [alpha, beta];

function withoutPosition(line: string) {
  return line.replace(/\(\d+,\d+\)/, "");
}

function baselineEntries(text: string) {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"));
}

function shellQuote(text: string) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

// A `tsc` that prints each line, then runs `ending` (shell commands).
function printed(lines: string[], ending: string) {
  const prints = lines.map((line) => `printf '%s\\n' ${shellQuote(line)}`);
  return [...prints, ending].join("\n");
}

type Sandbox = { root: string; bin: string; baseline: string; script: string };

const created: string[] = [];

afterEach(async () => {
  for (const directory of created.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "openbot-typecheck-tests-"));
  created.push(root);
  const sandbox = {
    root,
    bin: join(root, "bin"),
    baseline: join(root, "server", "tests", "typecheck-baseline.txt"),
    script: join(root, "scripts", "typecheck-tests.ts"),
  };
  await mkdir(sandbox.bin, { recursive: true });
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "server", "tests"), { recursive: true });
  await copyFile(gateScript, sandbox.script);
  await writeFile(
    sandbox.baseline,
    `${knownErrors.map(withoutPosition).join("\n")}\n`,
  );
  return sandbox;
}

// Makes `bunx` on the sandbox PATH run `body`, which plays tsc.
async function fakeTsc(sandbox: Sandbox, body: string) {
  const path = join(sandbox.bin, "bunx");
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
}

type GateRun = { exitCode: number | null; stdout: string; stderr: string };

function runGate(sandbox: Sandbox, args: string[] = []): GateRun {
  const result = Bun.spawnSync({
    cmd: [process.execPath, sandbox.script, ...args],
    cwd: sandbox.root,
    env: { ...process.env, PATH: sandbox.bin },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function expectFinished(result: GateRun, exitCode: 0 | 1) {
  expect(result.exitCode).toBe(exitCode);
  expect(result.stderr).not.toContain("did not finish");
}

function expectDidNotFinish(result: GateRun, reason: string) {
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain(`tsc did not finish (${reason}`);
  // Nothing on stdout: no "clean", and no "no longer occur" from a comparison that never ran.
  expect(result.stdout).toBe("");
}

describe("a tsc run that finished", () => {
  test("no errors and no output passes", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, "exit 0");
    const result = runGate(sandbox);
    expectFinished(result, 0);
    expect(result.stdout).toContain("(0 known error(s))");
  });

  test("only the baselined errors pass", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, printed(knownErrors, "exit 1"));
    const result = runGate(sandbox);
    expectFinished(result, 0);
    expect(result.stdout).toContain("(2 known error(s))");
  });

  test("a new error fails with exit 1", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, printed([...knownErrors, gamma], "exit 1"));
    const result = runGate(sandbox);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("1 NEW type error(s)");
    expect(result.stderr).toContain(withoutPosition(gamma));
  });

  test("--update rewrites the baseline from the errors it printed", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, printed([alpha], "exit 1"));
    const result = runGate(sandbox, ["--update"]);
    expect(result.exitCode).toBe(0);
    const entries = baselineEntries(await readFile(sandbox.baseline, "utf8"));
    expect(entries).toEqual([withoutPosition(alpha)]);
  });
});

describe("a tsc run that did not finish", () => {
  test("killed by a signal fails with exit 2", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, "kill -9 $$");
    expectDidNotFinish(runGate(sandbox), "killed, signal SIGKILL");
  });

  test("exit 137 with no output fails with exit 2", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, "exit 137");
    expectDidNotFinish(runGate(sandbox), "killed, exit 137");
  });

  test("exit 1 with no output fails with exit 2", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, "exit 1");
    expectDidNotFinish(runGate(sandbox), "exit 1, no diagnostic printed");
  });

  test("exit 137 after printing one diagnostic fails with exit 2", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, printed([alpha], "exit 137"));
    expectDidNotFinish(runGate(sandbox), "killed, exit 137");
  });

  test("a spawn error fails with exit 2", async () => {
    // No fake is written: the sandbox PATH holds no bunx, so the spawn fails.
    const sandbox = await createSandbox();
    expectDidNotFinish(runGate(sandbox), "could not start it");
  });

  test("--update refuses to rewrite the baseline from a run that did not finish", async () => {
    const sandbox = await createSandbox();
    await fakeTsc(sandbox, "exit 137");
    const before = await readFile(sandbox.baseline, "utf8");
    expectDidNotFinish(runGate(sandbox, ["--update"]), "killed, exit 137");
    expect(await readFile(sandbox.baseline, "utf8")).toBe(before);
  });
});
