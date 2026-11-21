import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  ALLOWLIST,
  type AllowEntry,
  applyAllowlist,
  scanText,
} from "./check-text-safety.ts";

// Hidden characters are written as escapes so this file itself carries none of them.
const HIDDEN_CASES: Array<[string, string, string]> = [
  ["U+200B", "U+200B", "\u200B"],
  ["U+200F", "U+200F", "\u200F"],
  ["U+202A", "U+202A", "\u202A"],
  ["U+202E", "U+202E", "\u202E"],
  ["U+2060", "U+2060", "\u2060"],
  ["U+2064", "U+2064", "\u2064"],
  ["U+2066", "U+2066", "\u2066"],
  ["U+2069", "U+2069", "\u2069"],
  ["U+FEFF in the middle of a file", "U+FEFF", "\uFEFF"],
  ["U+E0001 language tag", "U+E0001", "\u{E0001}"],
  ["U+E0041 tag letter", "U+E0041", "\u{E0041}"],
  ["U+E007F cancel tag", "U+E007F", "\u{E007F}"],
];

describe("hidden and bidirectional characters", () => {
  test.each(HIDDEN_CASES)("flags %s", (_label, code, character) => {
    const hits = scanText("prompts/member.yaml", `before ${character} after\n`);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      file: "prompts/member.yaml",
      kind: "hidden-character",
      line: 1,
      column: 8,
    });
    expect(hits[0]?.text).toBe(code);
  });

  test("reports the line and column of each character", () => {
    const hits = scanText("code.ts", "first line\nsecond \u202E line\n");
    expect(hits).toMatchObject([{ line: 2, column: 8, text: "U+202E" }]);
  });

  test("a byte order mark as the first character of a file is allowed", () => {
    expect(scanText("install.ps1", "\uFEFFWrite-Host 'hi'\n")).toEqual([]);
  });

  test("a byte order mark later in the file is flagged", () => {
    const hits = scanText("notes.md", "text\n\uFEFFmore\n");
    expect(hits).toMatchObject([
      { kind: "hidden-character", text: "U+FEFF", line: 2 },
    ]);
  });

  test("ordinary non-ASCII letters and punctuation are not flagged", () => {
    expect(
      scanText("docs/it.md", "perché è \u2014 “sì” \u00E9 \u20AC 50\u00A0%\n"),
    ).toEqual([]);
  });
});

describe("personal absolute paths", () => {
  test.each([
    ["Linux home", "run in /home/alice/openbot now\n", "/home/alice/"],
    ["macOS home", "cd /Users/bob/work\n", "/Users/bob/"],
    ["Windows home", "copy C:\\Users\\carol\\file.txt\n", "C:\\Users\\carol\\"],
    [
      "Windows home, forward slashes",
      "cd D:/Users/carol/x\n",
      "D:/Users/carol/",
    ],
  ])("flags a %s", (_label, text, path) => {
    const hits = scanText("docs/x.md", text);
    expect(hits).toMatchObject([{ kind: "personal-path", text: path }]);
  });

  test("placeholders and variables are not flagged", () => {
    const clean = [
      "/home/<user>/project\n",
      "/Users/$USER/project\n",
      "C:\\Users\\%USERNAME%\\project\n",
      "~/project and $HOME/project\n",
      "/opt/usr/home/x/ is not a home folder\n",
      "the folder foo/home/bar/ is relative\n",
    ];
    for (const text of clean) expect(scanText("docs/x.md", text)).toEqual([]);
  });

  test("a binary file with a NUL byte near its start is skipped", () => {
    expect(scanText("logo.png", "\u0000\u200B/home/alice/")).toEqual([]);
  });
});

describe("allowlist", () => {
  const hits = scanText("docs/a.md", "x /home/alice/ y \u202E z\n");

  test("a hit that matches an entry is allowed, the rest are blocked", () => {
    const allow: AllowEntry[] = [
      {
        file: "docs/a.md",
        kind: "personal-path",
        text: "/home/alice/",
        reason: "example",
      },
    ];
    const result = applyAllowlist(hits, allow);
    expect(result.allowed.map((h) => h.text)).toEqual(["/home/alice/"]);
    expect(result.blocked.map((h) => h.text)).toEqual(["U+202E"]);
    expect(result.unused).toEqual([]);
  });

  test("an entry is for one file only", () => {
    const allow: AllowEntry[] = [
      {
        file: "docs/other.md",
        kind: "personal-path",
        text: "/home/alice/",
        reason: "example",
      },
    ];
    const result = applyAllowlist(hits, allow);
    expect(result.blocked.map((h) => h.text)).toEqual([
      "U+202E",
      "/home/alice/",
    ]);
    expect(result.unused).toHaveLength(1);
  });

  test("an entry for a kind of hit it does not match is not used", () => {
    const allow: AllowEntry[] = [
      {
        file: "docs/a.md",
        kind: "hidden-character",
        text: "/home/alice/",
        reason: "wrong kind",
      },
    ];
    expect(applyAllowlist(hits, allow).blocked).toHaveLength(2);
  });

  test("an entry that matches no hit is reported as unused", () => {
    const allow: AllowEntry[] = [
      {
        file: "docs/a.md",
        kind: "personal-path",
        text: "/home/gone/",
        reason: "removed text",
      },
    ];
    expect(applyAllowlist(hits, allow).unused.map((e) => e.text)).toEqual([
      "/home/gone/",
    ]);
  });

  test("an entry without a reason is reported", () => {
    const allow: AllowEntry[] = [
      {
        file: "docs/a.md",
        kind: "personal-path",
        text: "/home/alice/",
        reason: "  ",
      },
    ];
    expect(applyAllowlist(hits, allow).unexplained).toHaveLength(1);
  });

  test("the shipped allowlist has a reason on every entry", () => {
    expect(ALLOWLIST.filter((e) => e.reason.trim() === "")).toEqual([]);
  });
});

describe("clean text", () => {
  test("a clean prompt passes with no hits", () => {
    const prompt = [
      "# Role",
      "You are Leo. Read `docs/PROJECT.md` and keep to the brief.",
      "Run `bun test` from `openbot/` and report the numbers.",
      "",
    ].join("\n");
    expect(scanText("openbot/examples/freeduet/agents.yaml", prompt)).toEqual(
      [],
    );
  });
});

describe("the repository", () => {
  test("every tracked text file passes with the shipped allowlist", () => {
    const script = join(import.meta.dir, "check-text-safety.ts");
    const result = Bun.spawnSync(["bun", script], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
