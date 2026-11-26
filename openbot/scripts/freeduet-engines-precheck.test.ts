/**
 * `scripts/freeduet-engines-precheck.sh` is the read-only pre-check the maintainer runs before the engines live
 * round. These tests pin what matters for a script run on a real installation: it sends no POST, PUT, DELETE or
 * PATCH, it has no upload or body option, it never prints a shell variable named for a key, token or secret, and
 * the round's checklist links it. The one run checks the output of a run in which every connection is refused on
 * localhost, with a made-up secret in .env: the secret must not appear in the output.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_SOURCE = join(import.meta.dir, "freeduet-engines-precheck.sh");
const REQUIRE_BASH = join(import.meta.dir, "require-bash.sh");
const CHECKLIST = join(
  import.meta.dir,
  "..",
  "..",
  "docs",
  "live-tests",
  "v0.2.3-round-2-engines.md",
);

const SCRIPT = readFileSync(SCRIPT_SOURCE, "utf8");
/** The lines the shell runs: everything but comments and blank lines. */
const CODE_LINES = SCRIPT.split("\n").filter(
  (line) => line.trim() !== "" && !line.trimStart().startsWith("#"),
);
const CODE = CODE_LINES.join("\n");

const trees: string[] = [];
afterEach(() => {
  for (const tree of trees.splice(0))
    rmSync(tree, { recursive: true, force: true });
});

describe("only GET is sent", () => {
  test.each(["POST", "PUT", "DELETE", "PATCH"])(
    "the script has no %s",
    (method) => {
      expect(CODE).not.toMatch(new RegExp(`\\b${method}\\b`));
    },
  );

  test.each([
    ["-X or --request", /(^|\s)(-X\b|--request\b)/],
    ["-d or --data", /(^|\s)(-d\b|--data[-a-z]*\b)/],
    ["-F or --form", /(^|\s)(-F\b|--form[-a-z]*\b)/],
    ["-T or --upload-file", /(^|\s)(-T\b|--upload-file\b)/],
    ["--json", /--json\b/],
  ])("no curl call uses %s", (_label, pattern) => {
    const curlLines = CODE_LINES.filter((line) => /\bcurl\b/.test(line));
    expect(curlLines.length).toBeGreaterThan(0);
    for (const line of curlLines) expect(line).not.toMatch(pattern);
  });
});

describe("no secret is printed", () => {
  test("no shell variable named for a key, token or secret is used", () => {
    // Any use of such a variable could reach an echo, a printf or a log; the script has none.
    expect(CODE).not.toMatch(/\$\{?[A-Za-z0-9_]*(KEY|TOKEN|SECRET)/);
  });

  test("the script never turns on command tracing, which would print values", () => {
    expect(CODE).not.toMatch(/\bset\s+[-+][a-zA-Z]*x/);
    expect(CODE).not.toMatch(/\bBASH_XTRACEFD\b/);
  });

  test("the secret and token are read only through a pipe from .env into a mode-600 curl config", () => {
    expect(CODE).toMatch(/header_from_env Cookie FREEDUET_INSTALL_SECRET/);
    expect(CODE).toMatch(
      /header_from_env x-openbot-agent-token MANAGED_AGENT_TOKEN/,
    );
    expect(CODE).toMatch(/chmod 600 "\$CFG"/);
    expect(CODE).not.toMatch(/\bcurl\b[^\n]*-H\s/);
  });
});

describe("the checklist links the script", () => {
  test("the round's Before you start section names the script", () => {
    const text = readFileSync(CHECKLIST, "utf8");
    const start = text.indexOf("## Before you start");
    const end = text.indexOf("## Rules for this round");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = text.slice(start, end);
    expect(section).toContain("openbot/scripts/freeduet-engines-precheck.sh");
  });
});

/**
 * A temporary folder laid out like an installation: openbot/scripts with the script and require-bash.sh, and an
 * openbot/.env whose ports are closed on localhost and whose secrets are made-up strings.
 */
function tree(): string {
  const root = mkdtempSync(join(tmpdir(), "engines-precheck-"));
  trees.push(root);
  mkdirSync(join(root, "openbot", "scripts"), { recursive: true });
  copyFileSync(
    SCRIPT_SOURCE,
    join(root, "openbot", "scripts", "freeduet-engines-precheck.sh"),
  );
  copyFileSync(
    REQUIRE_BASH,
    join(root, "openbot", "scripts", "require-bash.sh"),
  );
  writeFileSync(
    join(root, "openbot", ".env"),
    [
      "SERVER_PORT=1",
      "FREEDUET_PORT=1",
      "FREEDUET_INSTALL_SECRET=made-up-install-secret-7731",
      "MANAGED_AGENT_TOKEN=made-up-agent-token-4419",
      "",
    ].join("\n"),
  );
  return root;
}

describe("a run prints no secret and exits non-zero when checks fail", () => {
  test("the made-up secrets never reach the output, and the run fails", () => {
    const root = tree();
    chmodSync(
      join(root, "openbot", "scripts", "freeduet-engines-precheck.sh"),
      0o755,
    );
    const result = spawnSync(
      "bash",
      [join(root, "openbot", "scripts", "freeduet-engines-precheck.sh")],
      { encoding: "utf8", timeout: 60_000 },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain("made-up-install-secret-7731");
    expect(output).not.toContain("made-up-agent-token-4419");
    expect(output).toContain("FAIL");
    expect(output).toMatch(/\d+ failed, \d+ skipped/);
    expect(result.status).toBe(1);
  });
});
