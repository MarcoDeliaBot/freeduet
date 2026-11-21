/**
 * Text safety check for the repository's tracked text files.
 *
 * Two classes of text fail the check, and neither shows up in an ordinary review:
 *
 * 1. Hidden or bidirectional Unicode characters. A member prompt, a skill or a line of code can carry
 *    an instruction that a reader never sees, and a bidirectional override can make code read other
 *    than how it runs. Checked: the zero-width characters and direction marks (U+200B to U+200F), the
 *    bidirectional embeddings and overrides (U+202A to U+202E), the invisible operators and word joiner
 *    (U+2060 to U+2064), the bidirectional isolates (U+2066 to U+2069), a byte order mark anywhere but
 *    the first character of a file (U+FEFF), and the tag characters (U+E0000 to U+E007F).
 * 2. Absolute paths into a person's home folder (a home or Users folder on Linux or macOS, and a Users
 *    folder on Windows). They put a name into a public repository, and a prompt that carries one teaches
 *    an agent a path that exists on one machine only. A document that must describe such a path uses a
 *    placeholder such as the one in this comment.
 *
 * Every hit must be listed in ALLOWLIST, or the check fails. An entry names one file, one kind of hit and
 * the exact text of that hit, and gives the reason. An entry that matches no hit also fails the check, so
 * the list cannot outlive the text it was written for.
 *
 *     bun openbot/scripts/check-text-safety.ts
 *
 * The check reads only `git ls-files`, so it runs the same on a worktree and on the CI runner, and it
 * needs no package installed: bun alone is enough.
 */
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type HitKind = "hidden-character" | "personal-path";

export type Hit = {
  file: string;
  kind: HitKind;
  /** `U+XXXX` for a character, or the path as the file spells it. */
  text: string;
  line: number;
  column: number;
  detail: string;
};

export type AllowEntry = {
  /** Repository path, as `git ls-files` prints it. */
  file: string;
  kind: HitKind;
  /** The exact `text` of the hit being allowed. */
  text: string;
  reason: string;
};

/**
 * Each entry is one file, one kind of hit in it, and why the hit stays. The repository was reviewed when the
 * check was added: every hit in it was a test input, a detector or stripper of a byte order mark, a container
 * service user, or a generic example name. Add an entry only with a reason, and remove it when its hit goes.
 */
export const ALLOWLIST: readonly AllowEntry[] = [
  {
    file: "docs/design/first-start.md",
    kind: "personal-path",
    text: "/home/freeduet/",
    reason: "container service user (not a person's home folder)",
  },
  {
    file: "openbot/agent-computer/tests/local-chrome-startup.test.ts",
    kind: "personal-path",
    text: "/Users/operator/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/agent-freeduet/Dockerfile",
    kind: "personal-path",
    text: "/home/freeduet/",
    reason: "container service user (not a person's home folder)",
  },
  {
    file: "openbot/agent-freeduet/tests/test_credentials_untouched.py",
    kind: "personal-path",
    text: "/home/app/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/agent-freeduet/tests/test_engine_members.py",
    kind: "personal-path",
    text: "/home/person/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/app/tests/member-file-card.test.tsx",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/charts/openbot/templates/_helpers.tpl",
    kind: "personal-path",
    text: "/home/pwuser/",
    reason: "container service user (not a person's home folder)",
  },
  {
    file: "openbot/charts/openbot/templates/computer/statefulset.yaml",
    kind: "personal-path",
    text: "/home/pwuser/",
    reason: "container service user (not a person's home folder)",
  },
  {
    file: "openbot/desktop/src-tauri/src/host_access.rs",
    kind: "personal-path",
    text: "/Users/example/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/desktop/src-tauri/src/host_access.rs",
    kind: "personal-path",
    text: "/Users/someone/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/desktop/src-tauri/src/main.rs",
    kind: "personal-path",
    text: "/Users/alice/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/desktop/src-tauri/src/stack.rs",
    kind: "personal-path",
    text: "/home/me/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/desktop/src-tauri/src/stack.rs",
    kind: "personal-path",
    text: "C:\\Users\\me\\",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/desktop/src-tauri/src/stack.rs",
    kind: "personal-path",
    text: "C:\\Users\\person\\",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/desktop/src/Problem.test.tsx",
    kind: "personal-path",
    text: "/Users/private-user/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/docker-compose.yml",
    kind: "personal-path",
    text: "/home/freeduet/",
    reason: "container service user (not a person's home folder)",
  },
  {
    file: "openbot/scripts/install.ps1",
    kind: "personal-path",
    text: "C:\\Users\\me\\",
    reason: "example path in a code comment, generic name",
  },
  {
    file: "openbot/scripts/install.ps1",
    kind: "personal-path",
    text: "C:\\Users\\you\\",
    reason: "example path in a message shown to the user, generic name",
  },
  {
    file: "openbot/scripts/install.Tests.ps1",
    kind: "personal-path",
    text: "C:\\Users\\Test\\",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/scripts/programs-helper/FreeDuetProgramsHelper.Tests.ps1",
    kind: "personal-path",
    text: "C:\\Users\\Test\\",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/scripts/check-text-safety.test.ts",
    kind: "personal-path",
    text: "/home/alice/",
    reason: "fixture for this check: a generic home folder name, not a person",
  },
  {
    file: "openbot/scripts/check-text-safety.test.ts",
    kind: "personal-path",
    text: "/Users/bob/",
    reason: "fixture for this check: a generic home folder name, not a person",
  },
  {
    file: "openbot/scripts/check-text-safety.test.ts",
    kind: "personal-path",
    text: "/home/gone/",
    reason: "fixture for this check: a generic home folder name, not a person",
  },
  {
    file: "openbot/scripts/check-text-safety.test.ts",
    kind: "personal-path",
    text: "D:/Users/carol/",
    reason: "fixture for this check: a generic home folder name, not a person",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/freeduet/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/Users/operator/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/app/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/person/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/pwuser/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/Users/example/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/Users/someone/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/Users/alice/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/me/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/Users/private-user/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/alice/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/Users/bob/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/someone/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "/home/gone/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/check-text-safety.ts",
    kind: "personal-path",
    text: "D:/Users/carol/",
    reason: "this check's own allowlist names the path it allows",
  },
  {
    file: "openbot/scripts/update.test.ts",
    kind: "personal-path",
    text: "/home/someone/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+200B",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+200F",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+202A",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+2060",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+2064",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+2066",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+2069",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/checks.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason:
      "detector source: the list of hidden characters the import check looks for, written literally",
  },
  {
    file: "openbot/server/src/freeduet/import/freeduet-json.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason:
      "production code removes a leading byte order mark: the literal is the character it strips",
  },
  {
    file: "openbot/server/src/freeduet/import/skill-folder.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason:
      "production code removes a leading byte order mark: the literal is the character it strips",
  },
  {
    file: "openbot/server/src/plugins/google-ical.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason:
      "production code removes a leading byte order mark: the literal is the character it strips",
  },
  {
    file: "openbot/server/tests/freeduet-engines-dashboard.test.ts",
    kind: "personal-path",
    text: "/home/someone/",
    reason: "test fixture: a generic home folder name, not a person",
  },
  {
    file: "openbot/server/tests/freeduet-import-parse.test.ts",
    kind: "hidden-character",
    text: "U+200B",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-import-parse.test.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-import-parse.test.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-import-preview.test.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-import-preview.test.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-signin-allowlist.test.ts",
    kind: "hidden-character",
    text: "U+200B",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-team-file.test.ts",
    kind: "hidden-character",
    text: "U+200B",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-team-file.test.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/freeduet-team-file.test.ts",
    kind: "hidden-character",
    text: "U+FEFF",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/mail-rules.test.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/openduet-text-continuation.test.ts",
    kind: "hidden-character",
    text: "U+200D",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/programs-review.test.ts",
    kind: "hidden-character",
    text: "U+200B",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/programs-review.test.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/settings-in-chat-member-name.test.ts",
    kind: "hidden-character",
    text: "U+200B",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/settings-in-chat-member-name.test.ts",
    kind: "hidden-character",
    text: "U+202E",
    reason: "test input: a hidden character the code under test must handle",
  },
  {
    file: "openbot/server/tests/single-user-adoption-apply.test.ts",
    kind: "personal-path",
    text: "/home/me/",
    reason: "test fixture: a generic home folder name, not a person",
  },
];

const HIDDEN_CLASSES: ReadonlyArray<{
  from: number;
  to: number;
  detail: string;
}> = [
  {
    from: 0x200b,
    to: 0x200f,
    detail: "zero-width character or direction mark",
  },
  { from: 0x202a, to: 0x202e, detail: "bidirectional embedding or override" },
  { from: 0x2060, to: 0x2064, detail: "invisible operator or word joiner" },
  { from: 0x2066, to: 0x2069, detail: "bidirectional isolate" },
  {
    from: 0xfeff,
    to: 0xfeff,
    detail: "byte order mark away from the start of the file",
  },
  { from: 0xe0000, to: 0xe007f, detail: "tag character" },
];

const HIDDEN_CHARACTER =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;
/** A path segment boundary before `/home/` or `/Users/`, so `/opt/usr/home/x/` is not a home folder. */
const POSIX_HOME = /(?<![\w.:-])\/(?:home|Users)\/[A-Za-z0-9._-]+\//g;
const WINDOWS_USERS =
  /(?<![\w.-])[A-Za-z]:[\\/]Users[\\/][^\\/:*?"<>|%${}\r\n]+[\\/]/g;

/** Line and column (both from 1) of a character index. */
function position(
  text: string,
  index: number,
): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/**
 * Every hit in one file's text, before the allowlist. A file with a NUL byte near its start is binary and
 * has no text to check.
 */
export function scanText(file: string, text: string): Hit[] {
  if (text.slice(0, 8192).includes("\u0000")) return [];
  const hits: Hit[] = [];

  for (const match of text.matchAll(HIDDEN_CHARACTER)) {
    const index = match.index ?? 0;
    const codePoint = match[0].codePointAt(0) ?? 0;
    // A byte order mark is the encoding signature of a file, so the first character of a file may carry one.
    if (index === 0 && codePoint === 0xfeff) continue;
    const found = HIDDEN_CLASSES.find(
      (c) => codePoint >= c.from && codePoint <= c.to,
    );
    hits.push({
      file,
      kind: "hidden-character",
      text: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      ...position(text, index),
      detail: found?.detail ?? "hidden character",
    });
  }

  for (const pattern of [POSIX_HOME, WINDOWS_USERS]) {
    for (const match of text.matchAll(pattern)) {
      hits.push({
        file,
        kind: "personal-path",
        text: match[0],
        ...position(text, match.index ?? 0),
        detail: "absolute path into a person's home folder",
      });
    }
  }
  return hits;
}

/**
 * Splits hits into those the allowlist covers and those it does not, and reports allowlist entries that
 * matched nothing or that give no reason.
 */
export function applyAllowlist(
  hits: readonly Hit[],
  allow: readonly AllowEntry[],
): {
  blocked: Hit[];
  allowed: Hit[];
  unused: AllowEntry[];
  unexplained: AllowEntry[];
} {
  const used = new Set<AllowEntry>();
  const blocked: Hit[] = [];
  const allowed: Hit[] = [];
  for (const hit of hits) {
    const entry = allow.find(
      (e) => e.file === hit.file && e.kind === hit.kind && e.text === hit.text,
    );
    if (entry) {
      used.add(entry);
      allowed.push(hit);
    } else {
      blocked.push(hit);
    }
  }
  return {
    blocked,
    allowed,
    unused: allow.filter((e) => !used.has(e)),
    unexplained: allow.filter((e) => e.reason.trim() === ""),
  };
}

function git(args: string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  return new TextDecoder().decode(result.stdout);
}

if (import.meta.main) {
  const root = git(["rev-parse", "--show-toplevel"], import.meta.dir).trim();
  const files = git(["ls-files", "-z"], root).split("\0").filter(Boolean);
  // ignoreBOM keeps a byte order mark in the text, so the leading-BOM rule sees it.
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

  const hits: Hit[] = [];
  let scanned = 0;
  for (const file of files) {
    const info = lstatSync(join(root, file), { throwIfNoEntry: false });
    // Symbolic links, submodules and deleted entries have no text of their own to check.
    if (!info?.isFile()) continue;
    scanned++;
    hits.push(
      ...scanText(file, decoder.decode(readFileSync(join(root, file)))),
    );
  }

  const { blocked, allowed, unused, unexplained } = applyAllowlist(
    hits,
    ALLOWLIST,
  );
  for (const hit of blocked) {
    console.error(
      `${hit.file}:${hit.line}:${hit.column}: ${hit.kind}: ${hit.text} (${hit.detail})`,
    );
  }
  for (const entry of unused) {
    console.error(
      `allowlist entry matches no hit: ${entry.file} ${entry.kind} ${entry.text}`,
    );
  }
  for (const entry of unexplained) {
    console.error(
      `allowlist entry has no reason: ${entry.file} ${entry.kind} ${entry.text}`,
    );
  }
  console.log(
    `text-safety: ${scanned} tracked text files, ${allowed.length} allowlisted hits, ` +
      `${blocked.length} blocked, ${unused.length + unexplained.length} allowlist problems`,
  );
  process.exit(
    blocked.length + unused.length + unexplained.length === 0 ? 0 : 1,
  );
}
