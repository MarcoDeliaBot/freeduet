import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspace,
  DEFAULT_WORKSPACE_LIMITS,
  WorkspacePathError,
} from "../src/workspace";

/** The finished-work listing (D194): out/ only, names, sizes and times, never a way out. */

let root: string;
let outside: string;

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), "openbot-workspace-finished-"));
  root = join(base, "workspace");
  outside = join(base, "outside");
  await mkdir(join(root, "out"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.txt"), "a private key", "utf8");
});

afterEach(async () => {
  await rm(join(root, ".."), { recursive: true, force: true });
});

describe("listing the finished work", () => {
  test("lists files under out/ and its subfolders with name, size and time, newest first", async () => {
    await mkdir(join(root, "out", "site"), { recursive: true });
    await writeFile(join(root, "out", "old.txt"), "12345");
    await writeFile(join(root, "out", "site", "index.html"), "<p>x</p>");
    await utimes(join(root, "out", "old.txt"), 1_000, 1_000);
    await utimes(join(root, "out", "site", "index.html"), 2_000, 2_000);
    await writeFile(join(root, "notes.txt"), "not finished work");

    const { files, truncated } = await createWorkspace(root).listFinished();

    expect(truncated).toBe(false);
    expect(files.map((file) => file.path)).toEqual([
      "out/site/index.html",
      "out/old.txt",
    ]);
    expect(files[0]).toEqual({
      path: "out/site/index.html",
      name: "index.html",
      bytes: 8,
      modifiedMs: 2_000_000,
    });
    expect(JSON.stringify(files)).not.toContain("not finished work");
  });

  test("an absent out folder is an empty list", async () => {
    await rm(join(root, "out"), { recursive: true });
    expect(await createWorkspace(root).listFinished()).toEqual({
      files: [],
      truncated: false,
    });
  });

  test("leaves hidden files and hidden folders out", async () => {
    await mkdir(join(root, "out", ".cache"), { recursive: true });
    await writeFile(join(root, "out", ".cache", "a.bin"), "x");
    await writeFile(join(root, "out", ".env"), "TOKEN=1");
    await writeFile(join(root, "out", "visible.txt"), "x");
    const { files } = await createWorkspace(root).listFinished();
    expect(files.map((file) => file.path)).toEqual(["out/visible.txt"]);
  });

  test("never follows a link out of the folder: a link to a file or a folder is left out", async () => {
    await symlink(join(outside, "secret.txt"), join(root, "out", "link.txt"));
    await symlink(outside, join(root, "out", "linked-folder"));
    await writeFile(join(root, "out", "real.txt"), "x");
    const { files } = await createWorkspace(root).listFinished();
    expect(files.map((file) => file.path)).toEqual(["out/real.txt"]);
  });

  test("refuses an out folder that is itself a link pointing outside the workspace", async () => {
    await rm(join(root, "out"), { recursive: true });
    await symlink(outside, join(root, "out"));
    await expect(createWorkspace(root).listFinished()).rejects.toBeInstanceOf(
      WorkspacePathError,
    );
  });

  test("refuses an out folder that is a link even when it stays inside the workspace", async () => {
    await rm(join(root, "out"), { recursive: true });
    await mkdir(join(root, "other"), { recursive: true });
    await writeFile(join(root, "other", "private.txt"), "x");
    await symlink(join(root, "other"), join(root, "out"));
    await expect(createWorkspace(root).listFinished()).rejects.toBeInstanceOf(
      WorkspacePathError,
    );
  });

  test("stops at the cap and says more is not shown", async () => {
    for (let index = 0; index < 5; index += 1) {
      await writeFile(join(root, "out", `f${index}.txt`), "x");
    }
    const ws = createWorkspace(root, {
      ...DEFAULT_WORKSPACE_LIMITS,
      listEntries: 3,
    });
    const { files, truncated } = await ws.listFinished();
    expect(files.length).toBe(3);
    expect(truncated).toBe(true);
  });

  test("the default cap is 500", () => {
    expect(DEFAULT_WORKSPACE_LIMITS.listEntries).toBe(500);
  });
});
