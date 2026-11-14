/**
 * Reading the shape of the database, for the registry's checks and for the tool's search.
 *
 * Only the catalogue is read here (information_schema), never a table's rows, so this is safe to
 * run against any database and cheap. The tool uses {@link readColumns} to find every text-like
 * column to search for the single-user id; the schema test uses {@link unclassifiedPersonColumns}
 * to fail the build when a column that names a person is in none of the registry's lists.
 */
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  classified,
  columnKey,
  PERSON_COLUMN_PATTERN,
  PERSON_COLUMN_TYPES,
} from "./registry";

/** Anything that can run a statement: the database or an open transaction. */
export type Executor = Pick<Database, "execute">;

export type LiveColumn = {
  table: string;
  column: string;
  type: string;
};

type Row = Record<string, unknown>;

async function rowsOf(executor: Executor, query: ReturnType<typeof sql>) {
  return (await executor.execute(query)) as unknown as Row[];
}

/** Every column of every ordinary table in the public schema. */
export async function readColumns(executor: Executor): Promise<LiveColumn[]> {
  const rows = await rowsOf(
    executor,
    sql`
      select c.table_name as "table", c.column_name as "column", c.data_type as "type"
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public'
      order by c.table_name, c.ordinal_position
    `,
  );
  return rows.map((row) => ({
    table: String(row.table),
    column: String(row.column),
    type: String(row.type),
  }));
}

/** The columns that are a foreign key to `users.id`, as `table.column`. */
export async function readUserForeignKeys(
  executor: Executor,
): Promise<string[]> {
  const rows = await rowsOf(
    executor,
    sql`
      select distinct tc.table_name as "table", kcu.column_name as "column"
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.constraint_schema = tc.constraint_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.constraint_schema = tc.constraint_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ccu.table_name = 'users'
        and ccu.column_name = 'id'
      order by 1, 2
    `,
  );
  return rows.map((row) => columnKey(String(row.table), String(row.column)));
}

/** Whether a column of this type can hold a person's id. */
export const holdsText = (type: string) =>
  (PERSON_COLUMN_TYPES as readonly string[]).includes(type);

/**
 * The columns that name a person and are in none of the registry's lists: a foreign key to
 * `users.id`, or a text-like column whose name looks like a person. Empty when the list is complete.
 */
export function unclassifiedPersonColumns(
  columns: readonly LiveColumn[],
  userForeignKeys: readonly string[],
): { key: string; why: string }[] {
  const known = new Set(classified().map((entry) => entry.key));
  const foreign = new Set(userForeignKeys);
  const found: { key: string; why: string }[] = [];
  for (const live of columns) {
    const key = columnKey(live.table, live.column);
    if (known.has(key)) continue;
    if (foreign.has(key)) {
      found.push({ key, why: "foreign key to users.id" });
    } else if (
      holdsText(live.type) &&
      PERSON_COLUMN_PATTERN.test(live.column)
    ) {
      found.push({ key, why: `${live.type} column named like a person` });
    }
  }
  return found;
}
