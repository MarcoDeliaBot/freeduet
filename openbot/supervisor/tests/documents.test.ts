import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostConfig } from "../src/docker";
import {
  DOCUMENTS_LABEL,
  DOCUMENTS_TARGET,
  documentsBind,
  documentsFolderIsEmpty,
  documentsFolderProblem,
  documentsSettings,
  documentsSourceFor,
  holdsCurrentDocuments,
  liveDocuments,
} from "../src/documents";
import { namesFor } from "../src/names";

function names(botId: string) {
  const named = namesFor(botId);
  if (!named.ok) throw new Error(named.reason);
  return named.names;
}

const BASE = { image: "openbot-agent-computer:test", environment: [] };

describe("the documents settings", () => {
  test("unset or blank: the feature is off and says nothing", () => {
    expect(documentsSettings({})).toEqual({ ok: true, documents: undefined });
    expect(
      documentsSettings({
        FREEDUET_COMPUTER_DOCUMENTS: "  ",
        FREEDUET_COMPUTER_DOCUMENTS_BOTS: "",
      }),
    ).toEqual({ ok: true, documents: undefined });
  });

  test("a path with no Bot named is off, and says why", () => {
    for (const bots of [undefined, "", " , ,"]) {
      const result = documentsSettings({
        FREEDUET_COMPUTER_DOCUMENTS: "/mnt/documents",
        FREEDUET_COMPUTER_DOCUMENTS_BOTS: bots,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.documents).toBeUndefined();
      expect(result.note).toContain("names no Bot");
    }
  });

  test("Bots named with no path is off, and says why", () => {
    const result = documentsSettings({
      FREEDUET_COMPUTER_DOCUMENTS_BOTS: "freeduet",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.documents).toBeUndefined();
    expect(result.note).toContain("FREEDUET_COMPUTER_DOCUMENTS is not");
  });

  test("a valid pair is on, with the list trimmed and without repeats", () => {
    expect(
      documentsSettings({
        FREEDUET_COMPUTER_DOCUMENTS: " /mnt/documents/ ",
        FREEDUET_COMPUTER_DOCUMENTS_BOTS: " freeduet, otto ,freeduet,,",
      }),
    ).toEqual({
      ok: true,
      documents: { path: "/mnt/documents", bots: ["freeduet", "otto"] },
    });
  });

  test("a path with a space is allowed", () => {
    const result = documentsSettings({
      FREEDUET_COMPUTER_DOCUMENTS: "/mnt/my documents",
      FREEDUET_COMPUTER_DOCUMENTS_BOTS: "freeduet",
    });
    expect(result).toEqual({
      ok: true,
      documents: { path: "/mnt/my documents", bots: ["freeduet"] },
    });
  });

  test.each([
    ["relative", "documents"],
    ["relative dot", "./documents"],
    ["a Windows drive", "D:/documents"],
    ["a colon", "/mnt/a:b"],
    ["a comma", "/mnt/a,b"],
    ["the root", "/"],
    ["the root, doubled", "//"],
    ["a parent segment", "/mnt/../etc"],
    ["a dot segment", "/mnt/./documents"],
    ["a doubled slash", "/mnt//documents"],
    ["a newline", "/mnt/doc\numents"],
    ["a NUL", "/mnt/doc\u0000uments"],
  ])("a bad path is refused (%s)", (_label, path) => {
    const result = documentsSettings({
      FREEDUET_COMPUTER_DOCUMENTS: path,
      FREEDUET_COMPUTER_DOCUMENTS_BOTS: "freeduet",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain("FREEDUET_COMPUTER_DOCUMENTS");
  });

  test.each([
    ["a space inside", "free duet"],
    ["a slash", "a/b"],
    ["a dot", "a.b"],
    ["a leading hyphen", "-freeduet"],
    ["a path", "../freeduet"],
    ["too long", "a".repeat(65)],
  ])("a bad Bot id turns the whole feature off (%s)", (_label, id) => {
    const result = documentsSettings({
      FREEDUET_COMPUTER_DOCUMENTS: "/mnt/documents",
      FREEDUET_COMPUTER_DOCUMENTS_BOTS: `freeduet,${id}`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain("FREEDUET_COMPUTER_DOCUMENTS_BOTS");
  });
});

describe("the folder on disk", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "documents-test-"));
    mkdirSync(join(root, "empty"));
    mkdirSync(join(root, "full"));
    writeFileSync(join(root, "full", "contract.txt"), "text");
    writeFileSync(join(root, "a-file"), "text");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("a folder is usable, a missing path and a file are not", async () => {
    expect(await documentsFolderProblem(join(root, "full"))).toBeUndefined();
    expect(await documentsFolderProblem(join(root, "nope"))).toContain(
      "does not exist",
    );
    expect(await documentsFolderProblem(join(root, "a-file"))).toContain(
      "is not a folder",
    );
  });

  test("empty is told apart from full, and a missing one is not called empty", async () => {
    expect(await documentsFolderIsEmpty(join(root, "empty"))).toBe(true);
    expect(await documentsFolderIsEmpty(join(root, "full"))).toBe(false);
    expect(await documentsFolderIsEmpty(join(root, "nope"))).toBe(false);
  });

  test("a folder that goes away turns the mount off once, and on again once", async () => {
    const folder = join(root, "share");
    mkdirSync(folder);
    const lines: string[] = [];
    const log = {
      info: (line: string) => lines.push(`info ${line}`),
      warn: (line: string) => lines.push(`warn ${line}`),
    };
    const documents = { path: folder, bots: ["freeduet"] };
    const now = liveDocuments(documents, log);

    expect(await now()).toEqual(documents);
    expect(lines).toEqual([]);

    rmSync(folder, { recursive: true });
    expect(await now()).toBeUndefined();
    expect(await now()).toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("warn Documents folder is off");

    mkdirSync(folder);
    expect(await now()).toEqual(documents);
    expect(await now()).toEqual(documents);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("available again");
  });

  test("nothing configured is nothing handed out, and nothing is checked", async () => {
    expect(await liveDocuments(undefined)()).toBeUndefined();
  });
});

describe("what a computer is given", () => {
  const documents = {
    path: "/mnt/documents",
    bots: ["freeduet"],
  };

  test("feature off: the computer holds its own two volumes and nothing else", () => {
    const { Binds } = hostConfig(names("freeduet"), BASE);
    expect(Binds).toEqual([
      "openbot-profile-freeduet:/profiles",
      "openbot-workspace-freeduet:/workspace",
    ]);
  });

  test("a listed Bot gets the folder read-only, under /workspace", () => {
    const { Binds } = hostConfig(names("freeduet"), { ...BASE, documents });
    expect(Binds).toContain("/mnt/documents:/workspace/documenti:ro");
    // The folder is under the workspace the file tools are confined to, not beside it.
    expect(DOCUMENTS_TARGET.startsWith("/workspace/")).toBe(true);
    // The Bot's own storage is still there, and the workspace volume comes before the nested mount.
    const workspace = Binds.indexOf("openbot-workspace-freeduet:/workspace");
    const mount = Binds.indexOf("/mnt/documents:/workspace/documenti:ro");
    expect(workspace).toBeGreaterThanOrEqual(0);
    expect(mount).toBeGreaterThan(workspace);
  });

  test("a Bot that is not listed gets nothing, although the feature is on", () => {
    for (const other of ["otto", "freeduet2", "Freeduet", "free"]) {
      const { Binds } = hostConfig(names(other), { ...BASE, documents });
      expect(Binds).toEqual([
        `openbot-profile-${other}:/profiles`,
        `openbot-workspace-${other}:/workspace`,
      ]);
    }
  });

  test("every bind the documents setting can add is read-only", () => {
    for (const bots of [["freeduet"], ["freeduet", "otto"], ["otto"]]) {
      for (const bot of ["freeduet", "otto", "penny"]) {
        const { Binds } = hostConfig(names(bot), {
          ...BASE,
          documents: { path: "/mnt/documents", bots },
        });
        for (const bind of Binds.filter((b) => b.includes("documenti"))) {
          expect(bind.endsWith(":ro")).toBe(true);
        }
      }
    }
    expect(documentsBind("/mnt/documents")).toBe(
      "/mnt/documents:/workspace/documenti:ro",
    );
  });

  test("the source for a Bot is the folder for a listed Bot and nothing else", () => {
    expect(documentsSourceFor("freeduet", documents)).toBe("/mnt/documents");
    expect(documentsSourceFor("otto", documents)).toBeUndefined();
    expect(documentsSourceFor("freeduet", undefined)).toBeUndefined();
  });

  test("an existing computer is current when its label is what is wanted now", () => {
    // Made before the feature (no label) and still wanting none: kept.
    expect(holdsCurrentDocuments(undefined, undefined)).toBe(true);
    expect(holdsCurrentDocuments("", undefined)).toBe(true);
    // The same folder: kept.
    expect(holdsCurrentDocuments("/mnt/documents", "/mnt/documents")).toBe(
      true,
    );
    // Feature turned on, turned off, or pointed elsewhere: replaced.
    expect(holdsCurrentDocuments(undefined, "/mnt/documents")).toBe(false);
    expect(holdsCurrentDocuments("/mnt/documents", undefined)).toBe(false);
    expect(holdsCurrentDocuments("/mnt/documents", "/mnt/other")).toBe(false);
  });

  test("the label the recreate rule reads is a stable name", () => {
    expect(DOCUMENTS_LABEL).toBe("openbot.documents");
  });
});
