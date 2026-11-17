/**
 * The eval stack reads FREEDUET_INTELLIGENCE the way the server will run it (D65).
 *
 * The server refuses to start without the switch; the stack starts through start.sh, which writes
 * the missing line (`on` with all three settings, else `off`). `check_intelligence` runs before that
 * and must not read a missing line as off when start.sh will write `on`. The functions are cut out
 * of the script and run in bash against a temporary settings file; nothing is started.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = readFileSync(
  join(import.meta.dir, "freeduet-eval-stack.sh"),
  "utf8",
);

function cut(start: RegExp, end: RegExp): string {
  const lines = SCRIPT.split("\n");
  const from = lines.findIndex((line) => start.test(line));
  const to = lines.findIndex((line, index) => index >= from && end.test(line));
  expect(from).toBeGreaterThanOrEqual(0);
  return lines.slice(from, to + 1).join("\n");
}

function check(settings: string[]): { stdout: string; code: number } {
  const directory = mkdtempSync(join(tmpdir(), "eval-intelligence-"));
  try {
    writeFileSync(join(directory, ".env.eval"), `${settings.join("\n")}\n`);
    const program = [
      'info() { printf "%s\\n" "$1"; }',
      'red() { printf "RED %s\\n" "$1"; }',
      `ENV_FILE="${join(directory, ".env.eval")}"`,
      `PERSON_ENV="${join(directory, ".env")}"`,
      cut(/^value_in\(\) \{/, /^\}/),
      cut(/^setting\(\) /, /^setting\(\) /),
      cut(/^check_intelligence\(\) \{/, /^\}/),
      'check_intelligence; echo "SHARED=$INTELLIGENCE_SHARED"',
    ].join("\n");
    const result = Bun.spawnSync(["bash", "-c", program], {
      env: { PATH: process.env.PATH ?? "", HOME: directory },
    });
    return { stdout: result.stdout.toString(), code: result.exitCode ?? 1 };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const THREE_WITH_KEY = [
  "INTELLIGENCE_API_URL=https://a.example",
  "INTELLIGENCE_GATEWAY_WS_URL=wss://b.example",
  "INTELLIGENCE_API_KEY=key-1",
];

describe("check_intelligence with a missing switch line", () => {
  test("the addresses and no key (a fresh stack): off, as start.sh will write", () => {
    const result = check([
      "INTELLIGENCE_API_URL=https://a.example",
      "INTELLIGENCE_GATEWAY_WS_URL=wss://b.example",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Intelligence: off");
  });

  test("all three settings: on, as start.sh will write, so the stack needs a key of its own", () => {
    const result = check(THREE_WITH_KEY);
    // The key is there, so the isolation check runs; it only stops on the person's own key.
    expect(result.stdout).not.toContain("Intelligence: off");
    expect(result.stdout).toContain("SHARED=false");
  });

  test("an explicit off stays off, even with all three settings", () => {
    const result = check([...THREE_WITH_KEY, "FREEDUET_INTELLIGENCE=off"]);
    expect(result.stdout).toContain("Intelligence: off");
  });
});
