/**
 * The list of places that name a person (freeduet/adopt/registry.ts) stays true.
 *
 * The tool that moves the single-user person's data to a real account moves what the registry says
 * and nothing else, so a column that names a person and is not in the registry would be left behind
 * on the old person without a word. This file makes that impossible to do by accident: it reads the
 * live schema of a real PostgreSQL, built by the real migrations, and fails when
 *
 *  - a foreign key to `users.id` is in none of the registry's lists;
 *  - a text-like column whose name looks like a person is in none of them;
 *  - the registry names a column the schema no longer has;
 *  - a column is in two lists;
 *  - or the design document (docs/design/single-user-to-sign-in.md, section 2.2) and the registry
 *    name different columns, in either direction.
 *
 * It also shows the check itself works, by adding three columns to a scratch table and watching it
 * find them: a test that has never been seen to fail proves nothing.
 *
 * On main this file does not load: there is no registry.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import {
  classified,
  columnKey,
  IDENTITY,
  LEAVE,
  MOVE,
  REVIEWED,
  SPECIAL,
} from "../src/freeduet/adopt/registry";
import {
  holdsText,
  type LiveColumn,
  readColumns,
  readUserForeignKeys,
  unclassifiedPersonColumns,
} from "../src/freeduet/adopt/schema-scan";
import { createScratchDatabase } from "./support/scratch-database";

const DOCUMENT = readFileSync(
  join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "docs",
    "design",
    "single-user-to-sign-in.md",
  ),
  "utf8",
);

let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;
let columns: LiveColumn[];
let foreignKeys: string[];

beforeAll(async () => {
  scratch = await createScratchDatabase({ max: 1 });
  columns = await readColumns(scratch.database);
  foreignKeys = await readUserForeignKeys(scratch.database);
}, 60_000);

afterAll(async () => {
  await scratch.drop();
});

/** The part of the document that lists every column, between its headings. */
function section22(): string {
  const start = DOCUMENT.indexOf("### 2.2 ");
  const end = DOCUMENT.indexOf("### 2.3 ");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return DOCUMENT.slice(start, end);
}

describe("the registry against the live schema", () => {
  test("every foreign key to users.id is classified", () => {
    const missing = unclassifiedPersonColumns(columns, foreignKeys).filter(
      (found) => found.why === "foreign key to users.id",
    );
    expect(missing).toEqual([]);
    // And there are some: a schema with none would pass the line above for the wrong reason.
    expect(foreignKeys.length).toBeGreaterThan(40);
  });

  test("every text-like column that is named like a person is classified", () => {
    expect(unclassifiedPersonColumns(columns, foreignKeys)).toEqual([]);
  });

  test("every column the registry names exists, and a person's id is held in text", () => {
    const live = new Map(
      columns.map((column) => [
        columnKey(column.table, column.column),
        column.type,
      ]),
    );
    const absent: string[] = [];
    const notText: string[] = [];
    for (const { key, class: kind } of classified()) {
      const type = live.get(key);
      if (type === undefined) absent.push(key);
      else if (
        (kind === "move" || kind === "leave" || kind === "identity") &&
        !holdsText(type)
      )
        notText.push(key);
    }
    expect(absent).toEqual([]);
    expect(notText).toEqual([]);
  });

  test("the columns a move is conditioned on exist", () => {
    const live = new Set(
      columns.map((column) => columnKey(column.table, column.column)),
    );
    for (const entry of MOVE) {
      for (const condition of entry.where ?? []) {
        expect(live.has(columnKey(entry.table, condition.column))).toBe(true);
      }
    }
  });

  test("no column is in two lists", () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const { key, class: kind } of classified()) {
      const before = seen.get(key);
      if (
        before !== undefined &&
        !(key.startsWith("users.") && kind === before)
      )
        twice.push(`${key} (${before} and ${kind})`);
      seen.set(key, kind);
    }
    expect(twice).toEqual([]);
  });

  test("a foreign key to users.id is never left on the old person to cascade away", () => {
    // A foreign key that cascades, left on a row somebody may later remove, would take the
    // data with it. So a foreign key is moved, or it is identity: never "leave".
    const left = new Set(
      LEAVE.map((entry) => columnKey(entry.table, entry.column)),
    );
    expect(foreignKeys.filter((key) => left.has(key))).toEqual([]);
  });
});

describe("the check fails when a new column names a person", () => {
  test("three new columns, each named a different way, are all found", async () => {
    await scratch.database.execute(sql`
      create table adoption_probe (
        id text primary key,
        owner_user_id text references users (id),
        author_ref text,
        reviewer text references users (id),
        sent_by text,
        note_text text
      )
    `);
    try {
      const probeColumns = await readColumns(scratch.database);
      const probeKeys = await readUserForeignKeys(scratch.database);
      const found = unclassifiedPersonColumns(probeColumns, probeKeys)
        .map((entry) => entry.key)
        .sort();
      expect(found).toEqual([
        "adoption_probe.author_ref",
        "adoption_probe.owner_user_id",
        "adoption_probe.reviewer",
        "adoption_probe.sent_by",
      ]);
    } finally {
      await scratch.database.execute(sql`drop table adoption_probe`);
    }
    // And the schema is as it was.
    expect(
      unclassifiedPersonColumns(
        await readColumns(scratch.database),
        foreignKeys,
      ),
    ).toEqual([]);
  });
});

describe("the document and the registry name the same columns", () => {
  test("every column in the registry is in section 2.2", () => {
    const text = section22();
    const absent = classified()
      .map((entry) => entry.key)
      .filter((key) => !text.includes(`\`${key}\``));
    expect(absent).toEqual([]);
  });

  test("every table.column in section 2.2 is in the registry", () => {
    const known = new Set(classified().map((entry) => entry.key));
    const named = [
      ...section22().matchAll(/`([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)`/g),
    ].map((match) => match[1] as string);
    expect(named.length).toBeGreaterThan(100);
    expect(named.filter((key) => !known.has(key))).toEqual([]);
  });

  test("the number of foreign keys the document gives is the live number", () => {
    const given = DOCUMENT.match(
      /foreign key to `users\.id` in (\d+) columns/,
    )?.[1];
    expect(Number(given)).toBe(foreignKeys.length);
  });

  test("the lists are not empty and the move list has the families the document shows", () => {
    expect(MOVE.length).toBeGreaterThan(50);
    expect(SPECIAL.length).toBe(7);
    expect(LEAVE.length).toBeGreaterThan(25);
    expect(IDENTITY.length).toBe(7);
    expect(REVIEWED.length).toBeGreaterThan(15);
  });
});
