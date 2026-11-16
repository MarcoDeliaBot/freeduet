import { afterEach, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Two pure helpers of `scripts/freeduet-eval-stack.sh`, the script that runs the eval stack.
 * `value_in` reads the value of a `NAME=value` line from a settings file; `set_line` writes one into
 * `.env.eval`. No test calls either of them directly. `up` reaches them through `write_settings`, and
 * `start-restart-guard.test.ts` checks only the file that comes out, not their edge cases.
 *
 * THE SCRIPT IS NOT RUN. Run as a whole, its command dispatch starts, resets or stops the eval stack,
 * or prints usage and exits, so this test reads the file as text, takes the two function definitions
 * out of it by their header and their closing brace, and writes only those into a file of its own,
 * in a directory made for the test. Each case calls one function with bash under the same
 * `set -euo pipefail` the script runs with. Docker and the eval stack are not touched.
 *
 * WHAT THE EXPECTATIONS ARE. What the code does, read off its text, whichever way that is. Where the
 * result is a weakness, the test name says what happens and the report calls it a finding; nothing in
 * the script is changed to make a test pass.
 */

const SCRIPT = join(import.meta.dir, "freeduet-eval-stack.sh");
const BASH = Bun.which("bash") as string;
const HELPERS = ["value_in", "set_line"];
const SPECIAL = "http://localhost:3101/a&b|c d\\e%f$HOME";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function freshDirectory() {
  const directory = await mkdtemp(
    join(tmpdir(), "openbot-eval-stack-parsers-"),
  );
  createdDirectories.push(directory);
  return directory;
}

/**
 * The text of one top-level function, from its header line to the first `}` on a line of its own.
 * The header must be there exactly once, and inside the braces nothing may stand at the top level,
 * so the extraction is a copy of the function and of nothing else.
 */
function functionText(script: string, name: string): string {
  const lines = script.split("\n");
  const headers = lines.flatMap((line, index) =>
    line === `${name}() {` ? [index] : [],
  );
  expect(headers).toHaveLength(1);
  const start = headers[0] as number;
  const end = lines.indexOf("}", start);
  expect(end).toBeGreaterThan(start);
  // Every line inside the braces is indented, blank or a comment; a column-0 line would be a command.
  const stray = lines
    .slice(start + 1, end)
    .filter((line) => !/^( |$|#)/.test(line));
  expect(stray).toEqual([]);
  return `${lines.slice(start, end + 1).join("\n")}\n`;
}

/** Writes the two helpers, and nothing else of the script, into a file of the directory. */
async function helpersFile(directory: string) {
  const script = await readFile(SCRIPT, "utf8");
  const file = join(directory, "eval-stack-helpers.sh");
  await writeFile(
    file,
    HELPERS.map((name) => functionText(script, name)).join(""),
  );
  return file;
}

type Outcome = { exitCode: number; stderr: string; stdout: string };

/** Calls one function as the script does: sourced under `set -euo pipefail`, with its arguments. */
async function call(
  helpers: string,
  invocation: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<Outcome> {
  const proc = Bun.spawn(
    [
      BASH,
      "-c",
      `set -euo pipefail\nsource "$0"\n${invocation}`,
      helpers,
      ...args,
    ],
    {
      // A fixed, small environment: the byte-for-byte cases must not depend on the runner's locale.
      env: { PATH: process.env.PATH ?? "", LC_ALL: "C", ...env },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stderr, stdout };
}

/** A fresh directory holding the helpers, and the two calls the cases make. */
async function harness() {
  const directory = await freshDirectory();
  const helpers = await helpersFile(directory);
  return {
    settings: join(directory, "settings.env"),
    // `value_in FILE NAME`: the way the script reads one setting.
    valueIn: (file: string, name: string) =>
      call(helpers, 'value_in "$1" "$2"', [file, name]),
    // `set_line NAME VALUE`: writes into the file the script names in ENV_FILE.
    setLine: (file: string, name: string, value: string) =>
      call(helpers, 'set_line "$1" "$2"', [name, value], { ENV_FILE: file }),
  };
}

async function modeOf(file: string) {
  return (await stat(file)).mode & 0o777;
}

test("the helpers file holds exactly the two definitions, in order", async () => {
  const script = await readFile(SCRIPT, "utf8");
  const text = HELPERS.map((name) => functionText(script, name)).join("");
  const definitions = text
    .split("\n")
    .filter((line) => /^[a-z_]+\(\) \{$/.test(line));
  expect(definitions).toEqual(["value_in() {", "set_line() {"]);
});

describe("value_in reads the value of NAME=value from a settings file", () => {
  test("reads a plain line", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=value\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "value\n",
    });
  });

  test("the last of several lines for the name wins", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=first\nNAME=second\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "second\n",
    });
  });

  test("drops double quotes around the value", async () => {
    const h = await harness();
    await writeFile(h.settings, 'NAME="a b"\n');
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "a b\n",
    });
  });

  test("drops single quotes around the value", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME='a b'\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "a b\n",
    });
  });

  test("keeps = inside the value, quoted or not", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=a=b=c\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "a=b=c\n",
    });
    await writeFile(h.settings, 'NAME="x=y"\n');
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "x=y\n",
    });
  });

  test("ignores a commented line", async () => {
    const h = await harness();
    await writeFile(h.settings, "# NAME=x\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });

  test("ignores a commented line that comes after the real one", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=real\n# NAME=x\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "real\n",
    });
  });

  test("does not read a longer name that ends the same way", async () => {
    const h = await harness();
    await writeFile(h.settings, "SERVER_PORT=3101\n");
    expect(await h.valueIn(h.settings, "PORT")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
    expect(await h.valueIn(h.settings, "SERVER_PORT")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "3101\n",
    });
    await writeFile(h.settings, "PORT=1\nSERVER_PORT=2\n");
    expect(await h.valueIn(h.settings, "PORT")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "1\n",
    });
  });

  test("a name that is not in the file gives an empty value, exit 0", async () => {
    const h = await harness();
    await writeFile(h.settings, "OTHER=1\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });

  test("a missing file gives an empty value, exit 0, and says nothing", async () => {
    const h = await harness();
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });

  test("reads the last line of a file with no final newline", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\nNAME=last");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "last\n",
    });
  });

  test("an empty value, bare or quoted, reads as an empty line", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "\n",
    });
    await writeFile(h.settings, 'NAME=""\n');
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "\n",
    });
  });

  test("keeps trailing spaces in the value", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=value   \n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "value   \n",
    });
  });

  test("keeps the quotes of a quoted value that is followed by trailing spaces", async () => {
    const h = await harness();
    await writeFile(h.settings, 'NAME="value"   \n');
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: '"value"   \n',
    });
  });

  test("keeps the carriage return of a Windows line ending in the value", async () => {
    const h = await harness();
    await writeFile(h.settings, "NAME=value\r\n");
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "value\r\n",
    });
  });

  test("keeps the quotes and the carriage return of a quoted value with a Windows line ending", async () => {
    const h = await harness();
    await writeFile(h.settings, 'NAME="value"\r\n');
    expect(await h.valueIn(h.settings, "NAME")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: '"value"\r\n',
    });
  });
});

describe("set_line writes NAME=VALUE into the settings file", () => {
  test("replaces an existing line without duplicating it; the new line goes to the end", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\nB=2\nC=3\n");
    expect(await h.setLine(h.settings, "B", "9")).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
    expect(await readFile(h.settings, "utf8")).toBe("A=1\nC=3\nB=9\n");
  });

  test("removes every earlier line for the name", async () => {
    const h = await harness();
    await writeFile(h.settings, "B=1\nA=0\nB=2\n");
    await h.setLine(h.settings, "B", "9");
    expect(await readFile(h.settings, "utf8")).toBe("A=0\nB=9\n");
  });

  test("appends the line when the name is absent", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\n");
    await h.setLine(h.settings, "D", "4");
    expect(await readFile(h.settings, "utf8")).toBe("A=1\nD=4\n");
  });

  test("does not remove a longer name that ends the same way", async () => {
    const h = await harness();
    await writeFile(h.settings, "SERVER_PORT=3101\n");
    await h.setLine(h.settings, "PORT", "3110");
    expect(await readFile(h.settings, "utf8")).toBe(
      "SERVER_PORT=3101\nPORT=3110\n",
    );
  });

  test("leaves the other lines byte for byte, a carriage return and indentation included", async () => {
    const h = await harness();
    const before =
      '# comment line\nA=1\n  indented = spaced\nQUOTED="x y"\r\nB=2\n';
    await writeFile(h.settings, before);
    await h.setLine(h.settings, "B", "9");
    expect(await readFile(h.settings, "utf8")).toBe(
      '# comment line\nA=1\n  indented = spaced\nQUOTED="x y"\r\nB=9\n',
    );
  });

  test("writes a value with / & | spaces, a backslash, % and $ exactly as given", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\n");
    expect(await h.setLine(h.settings, "URL", SPECIAL)).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
    expect(await readFile(h.settings, "utf8")).toBe(`A=1\nURL=${SPECIAL}\n`);
  });

  test("replaces a value that had those characters, exactly", async () => {
    const h = await harness();
    await writeFile(h.settings, "URL=old/value\n");
    await h.setLine(h.settings, "URL", "x&y|z w");
    expect(await readFile(h.settings, "utf8")).toBe("URL=x&y|z w\n");
  });

  test("an empty value is written as NAME=", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\n");
    await h.setLine(h.settings, "X", "");
    expect(await readFile(h.settings, "utf8")).toBe("A=1\nX=\n");
  });

  test("a file without a final newline keeps its lines and ends with one", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\nB=2");
    await h.setLine(h.settings, "C", "3");
    expect(await readFile(h.settings, "utf8")).toBe("A=1\nB=2\nC=3\n");
    await writeFile(h.settings, "A=1\nB=2");
    await h.setLine(h.settings, "B", "9");
    expect(await readFile(h.settings, "utf8")).toBe("A=1\nB=9\n");
  });

  test("a file that was 0644 is 0600 after the call", async () => {
    const h = await harness();
    await writeFile(h.settings, "A=1\n");
    await chmod(h.settings, 0o644);
    expect(await modeOf(h.settings)).toBe(0o644);
    await h.setLine(h.settings, "A", "2");
    expect(await modeOf(h.settings)).toBe(0o600);
  });

  test("a new file is created with mode 0600; grep reports the missing file on stderr", async () => {
    const h = await harness();
    const result = await h.setLine(h.settings, "NEW", "val");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("No such file or directory");
    expect(await readFile(h.settings, "utf8")).toBe("NEW=val\n");
    expect(await modeOf(h.settings)).toBe(0o600);
  });
});
