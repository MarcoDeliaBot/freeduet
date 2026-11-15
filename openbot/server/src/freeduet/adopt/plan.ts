/**
 * What moving the single-user person to an address would do, read from the database and written
 * nowhere (docs/design/single-user-to-sign-in.md, sections 6.1 and 6.2).
 *
 * THE DRY RUN AND THE MOVE READ THE SAME THING. `readPlan` is what `--to` alone prints, and it is
 * what the move reads again, inside its transaction and under its locks, before it changes a row. A
 * clean dry run is therefore a forecast of the move and not a different calculation that happens to
 * agree, and a plan that has gone stale in between (something wrote a row) is caught where it counts.
 *
 * READ-ONLY. Every statement here is a select. It takes no lock and writes nothing, so it may be run
 * as often as anybody likes, against a database the server is still using, and the answer is simply
 * the state at that moment.
 */
import { sql } from "drizzle-orm";
import { FULL_ACCESS_PREFERENCE } from "../full-access";
import {
  type Condition,
  classified,
  columnKey,
  IDENTITY,
  MOVE,
  SOURCE_ID,
  SPECIAL,
  USER_KEYED_CREDENTIAL_KINDS,
} from "./registry";
import {
  type Executor,
  type LiveColumn,
  readColumns,
  rowsOf,
} from "./schema-scan";

/** How many rows one entry of the registry would move, or hold for the target. */
export type Counted = {
  key: string;
  table: string;
  column: string;
  family: string;
  what: string;
  count: number;
};

export type TargetRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  /** Whether the row is the empty shell a sign-in leaves, or somebody who has used the app. */
  shell: boolean;
};

export type Plan = {
  from: string;
  to: string;
  /** Whether the single-user person's row is there. */
  sourceExists: boolean;
  /** The row the address already has, or null when the move will make it. */
  target: TargetRow | null;
  /** Every column of the registry that is moved, with its count (zeros included, absent tables not). */
  moves: Counted[];
  /** The columns with a handler of their own. */
  special: Counted[];
  /** Rows moved, across `moves` and `special`. */
  total: number;
  /** Why the move cannot run. Empty means it can. */
  blockers: string[];
  /** What the person should know before saying yes. */
  standing: { fullAccess: string[]; alwaysAllowRules: number };
  apps: string[];
  /** The latest earlier move, to any address, from the audit trail. */
  earlier: { at: string; toEmail: string } | null;
};

export const identifier = (name: string) => sql.identifier(name);

export function whereOf(
  column: string,
  value: string,
  conditions: readonly Condition[] = [],
) {
  return sql.join(
    [
      sql`${identifier(column)} = ${value}`,
      ...conditions.map(
        (condition) =>
          sql`${identifier(condition.column)} = ${condition.equals}`,
      ),
    ],
    sql` and `,
  );
}

async function countRows(
  executor: Executor,
  table: string,
  where: ReturnType<typeof sql>,
): Promise<number> {
  const [row] = await rowsOf(
    executor,
    sql`select count(*)::int as n from ${identifier(table)} where ${where}`,
  );
  return Number(row?.n ?? 0);
}

/** A jsonb value that holds this string anywhere inside it, at any depth. */
export const holdsString = (column: ReturnType<typeof sql>, value: string) =>
  sql`jsonb_path_exists(${column}, '$.** ? (@ == $v)', jsonb_build_object('v', ${value}::text))`;

const inKinds = sql.join(
  USER_KEYED_CREDENTIAL_KINDS.map((kind) => sql`${kind}`),
  sql`, `,
);

/** The special columns' counts for one person id. */
export async function countSpecial(
  executor: Executor,
  id: string,
): Promise<Counted[]> {
  const counted: Counted[] = [];
  for (const entry of SPECIAL) {
    if (entry.table === "users") continue;
    let count = 0;
    if (entry.table === "credentials") {
      count = await countRows(
        executor,
        "credentials",
        sql`${identifier("key_id")} = ${id} and ${identifier("kind")}::text in (${inKinds})`,
      );
    } else {
      count = await countRows(
        executor,
        entry.table,
        holdsString(sql`${identifier(entry.column)}::jsonb`, id),
      );
    }
    counted.push({
      key: columnKey(entry.table, entry.column),
      table: entry.table,
      column: entry.column,
      family: entry.family,
      what: entry.what,
      count,
    });
  }
  return counted;
}

/** The registry's move columns, counted for one person id. Tables that are not there are skipped. */
export async function countMoves(
  executor: Executor,
  id: string,
  tables: ReadonlySet<string>,
): Promise<Counted[]> {
  const counted: Counted[] = [];
  for (const entry of MOVE) {
    if (!tables.has(entry.table)) continue;
    counted.push({
      key: columnKey(entry.table, entry.column),
      table: entry.table,
      column: entry.column,
      family: entry.family,
      what: entry.what,
      count: await countRows(
        executor,
        entry.table,
        whereOf(entry.column, id, entry.where),
      ),
    });
  }
  return counted;
}

/** Which of a table's columns can hold the id, and how to look for it there. */
function searchKind(column: LiveColumn): "text" | "array" | "json" | null {
  if (column.type === "text" || column.type === "character varying")
    return "text";
  if (
    column.type === "ARRAY" &&
    (column.udt === "_text" || column.udt === "_varchar")
  )
    return "array";
  if (column.type === "jsonb" || column.type === "json") return "json";
  return null;
}

/**
 * Every column that holds the id and is in none of the registry's lists.
 *
 * A search of the data, not of the schema: it finds a place nobody thought of, which is the only
 * kind of place that would be left behind without a word.
 */
export async function findResidue(
  executor: Executor,
  columns: readonly LiveColumn[],
  id: string,
): Promise<{ key: string; count: number }[]> {
  const known = new Set(classified().map((entry) => entry.key));
  // The single-user person's own row holds its own id, and is handled as the person's row.
  known.add(columnKey("users", "id"));
  const byTable = new Map<string, LiveColumn[]>();
  for (const column of columns) {
    if (known.has(columnKey(column.table, column.column))) continue;
    if (searchKind(column) === null) continue;
    byTable.set(column.table, [...(byTable.get(column.table) ?? []), column]);
  }
  const found: { key: string; count: number }[] = [];
  for (const [table, tableColumns] of byTable) {
    const parts = tableColumns.map((column, index) => {
      const name = identifier(column.column);
      const kind = searchKind(column);
      const test =
        kind === "text"
          ? sql`${name} = ${id}`
          : kind === "array"
            ? sql`${id} = any(${name})`
            : holdsString(sql`${name}::jsonb`, id);
      return sql`count(*) filter (where ${test})::int as ${identifier(`c${index}`)}`;
    });
    const [row] = await rowsOf(
      executor,
      sql`select ${sql.join(parts, sql`, `)} from ${identifier(table)}`,
    );
    tableColumns.forEach((column, index) => {
      const count = Number(row?.[`c${index}`] ?? 0);
      if (count > 0)
        found.push({ key: columnKey(column.table, column.column), count });
    });
  }
  return found;
}

const OPEN_APPROVAL = ["pending", "approved"] as const;
const OPEN_SIGN_IN = [
  "pending",
  "filling",
  "code_required",
  "taken_over",
] as const;

/**
 * What to do about a request that is still waiting, in the one way that does not undo the move.
 *
 * The request can only be answered in the app, and the app answers as the person it is running as:
 * with the provider settings in .env (which this tool needs, to read the address), the app is the
 * sign-in one, and signing in is what makes the account that this tool then refuses to fill ("already
 * owns data"). So the instruction names the way round, and the one thing not to do.
 */
const ANSWER_AS_BEFORE =
  "To do that, the app has to run as it did before you turned sign-in on: take the sign-in provider settings out of .env for now (keep OPENBOT_SINGLE_USER=true), start the server, do it, stop the server, put the settings back, and run this again. Do not sign in with your address in between: the account that makes is one this tool will not fill in.";

const list = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/** What is still being waited on, which cannot be moved because it is bound to who asked. */
async function openBlockers(
  executor: Executor,
  tables: ReadonlySet<string>,
  id: string,
): Promise<string[]> {
  const blockers: string[] = [];
  const open = [
    {
      table: "approval_requests",
      one: "approval request still waiting for an answer",
      many: "approval requests still waiting for an answer",
      where: sql`${identifier("owner_user_id")} = ${id} and ${identifier("status")} in (${list(OPEN_APPROVAL)})`,
      what: "Answer or dismiss them in the app.",
    },
    {
      table: "sign_in_requests",
      one: "sign-in form still open",
      many: "sign-in forms still open",
      where: sql`${identifier("owner_user_id")} = ${id} and ${identifier("status")} in (${list(OPEN_SIGN_IN)})`,
      what: "Finish or cancel them in the app.",
    },
    {
      table: "pending_authorizations",
      one: "connection to an app still being made",
      many: "connections to an app still being made",
      where: sql`${identifier("actor_id")} = ${id} and ${identifier("completed_at")} is null`,
      what: "Finish or cancel them in the app.",
    },
  ];
  for (const entry of open) {
    if (!tables.has(entry.table)) continue;
    const count = await countRows(executor, entry.table, entry.where);
    if (count === 0) continue;
    blockers.push(
      count === 1
        ? `There is 1 ${entry.one}. It is bound to who asked, so it cannot be moved. ${entry.what}`
        : `There are ${count} ${entry.many}. They are bound to who asked, so they cannot be moved. ${entry.what}`,
    );
  }
  if (blockers.length > 0) blockers.push(ANSWER_AS_BEFORE);
  return blockers;
}

type UserRow = {
  id: string;
  email: string;
  email_verified: boolean;
  preferences: Record<string, unknown> | null;
  groups: string[] | null;
  onboarding_step: number;
  onboarding_completed_at: Date | string | null;
};

async function userRowsFor(
  executor: Executor,
  match: ReturnType<typeof sql>,
): Promise<UserRow[]> {
  return (await rowsOf(
    executor,
    sql`select id, email, email_verified, preferences, groups, onboarding_step, onboarding_completed_at
        from users where ${match}`,
  )) as unknown as UserRow[];
}

/** Whether a row is the empty shell a sign-in leaves behind, and not somebody who has used the app. */
function isShell(row: UserRow): boolean {
  return (
    Object.keys(asObject(row.preferences)).length === 0 &&
    (row.groups ?? []).length === 0 &&
    row.onboarding_step === 0 &&
    row.onboarding_completed_at === null
  );
}

/** A jsonb value as an object, whether the driver handed it over parsed or as text. */
export function asObject(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/**
 * What the move would do, and why it cannot, read as one consistent picture.
 *
 * Never throws for a state of the data: every reason it cannot run is a sentence in `blockers`.
 */
export async function readPlan(
  executor: Executor,
  to: string,
  from: string = SOURCE_ID,
): Promise<Plan> {
  const columns = await readColumns(executor);
  const tables = new Set(columns.map((column) => column.table));
  const blockers: string[] = [];

  for (const entry of MOVE) {
    if (!entry.optional && !tables.has(entry.table)) {
      blockers.push(
        `The table ${entry.table} is missing, so this installation is older than the tool. Start the server once so it migrates, stop it, and run this again.`,
      );
    }
  }

  const [source] = await userRowsFor(executor, sql`id = ${from}`);
  const sameAddress = await userRowsFor(executor, sql`lower(email) = ${to}`);
  const targetRow = sameAddress[0];
  // What is wrong with the target matters only if something is going to be moved to it: a run that
  // finds nothing to move says so, and does not stop on an account it would never have touched.
  const aboutTarget: string[] = [];
  if (sameAddress.length > 1)
    aboutTarget.push(
      `More than one account has the address ${to} in some spelling. Fix that by hand first.`,
    );
  if (targetRow && targetRow.email !== to)
    aboutTarget.push(
      `An account exists for ${to} with the address written as ${targetRow.email}. The sign-in would not find it. Fix that by hand first.`,
    );
  if (targetRow && targetRow.id === from)
    aboutTarget.push(`${to} is the single-user person itself.`);

  const moves = await countMoves(executor, from, tables);
  const special = await countSpecial(executor, from);

  // How somebody signs in: the single-user person has none, and if it has this is not what the tool is for.
  for (const entry of IDENTITY) {
    if (!tables.has(entry.table)) continue;
    const count = await countRows(
      executor,
      entry.table,
      whereOf(entry.column, from),
    );
    if (count > 0)
      blockers.push(
        `The single-user person has ${count} row${count === 1 ? "" : "s"} in ${columnKey(entry.table, entry.column)} (${entry.reason}). That means somebody signed in as this person, so this is not an installation that ran with no sign-in, and the tool will not guess.`,
      );
  }

  blockers.push(...(await openBlockers(executor, tables, from)));

  // The target: what it already owns, which would be mixed with the single-user person's.
  let target: TargetRow | null = null;
  if (targetRow && targetRow.id !== from) {
    target = {
      id: targetRow.id,
      email: targetRow.email,
      emailVerified: targetRow.email_verified,
      shell: isShell(targetRow),
    };
    const owned = [
      ...(await countMoves(executor, target.id, tables)),
      ...(await countSpecial(executor, target.id)),
    ].filter((entry) => entry.count > 0);
    if (owned.length > 0) {
      aboutTarget.push(
        `${to} already owns data: ${owned
          .slice(0, 8)
          .map((entry) => `${entry.what} (${entry.count})`)
          .join(
            ", ",
          )}${owned.length > 8 ? ", and more" : ""}. That is what a first sign-in makes. Moving the single-user person's data in as well would mix two people's data, which this tool does not do. Restore the backup you took before turning sign-in on, run this, and then sign in.`,
      );
    } else if (!target.shell) {
      aboutTarget.push(
        `${to} has already signed in and has settings of its own (a profile, groups or a started onboarding). Moving would overwrite them, which this tool does not do. Restore the backup you took before turning sign-in on, run this, and then sign in.`,
      );
    }
    /*
     * An account whose address no provider ever vouched for is not filled in, for two reasons that
     * are the same fact. The sign-in joins a provider to an existing account only when the address on
     * it is marked verified, so data moved into one the person cannot sign in to is data they are
     * locked out of. And an account is left unverified exactly when the sign-in that made it could not
     * prove the address (a Microsoft tenant writes the address of its own users itself), so the
     * account may be somebody else's, made by typing the person's address before they ever signed in:
     * filling it in would hand them the person's data and standing permissions. An account the person
     * made by signing in with Google or Okta is marked verified by that sign-in and is not affected.
     */
    if (!target.emailVerified) {
      const linked = tables.has("accounts")
        ? (
            await rowsOf(
              executor,
              sql`select provider_id from accounts where user_id = ${target.id} order by provider_id`,
            )
          ).map((row) => String(row.provider_id))
        : [];
      const quoted = target.id.replaceAll("'", "''");
      aboutTarget.push(
        `An account for ${to} exists, and no sign-in provider ever vouched for its address: it is not marked verified${linked.length > 0 ? ` (it is linked to a sign-in with ${linked.join(", ")})` : " (and no sign-in is linked to it)"}. The sign-in will not join a provider to it, so data moved into it would be out of your reach, and an account like this can be one that somebody else made by typing your address. ${
          owned.length === 0
            ? `It owns nothing, so it is safe to remove: in psql, delete from users where id = '${quoted}'; and then run this again.`
            : "It also owns data (above), so do not remove it."
        }`,
      );
    }
  }

  // Anywhere else the id appears that nobody has classified.
  for (const residue of await findResidue(executor, columns, from)) {
    blockers.push(
      `The single-user person's id is also in ${residue.key} (${residue.count} row${residue.count === 1 ? "" : "s"}), a column this tool has no rule for. It stops rather than leave a piece of the person behind. See docs/design/single-user-to-sign-in.md, section 2.3.`,
    );
  }

  const total = [...moves, ...special].reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  if (total > 0) blockers.push(...aboutTarget);

  // What the person should read before saying yes.
  const preferences = asObject(source?.preferences);
  const fullAccess = Object.keys(asObject(preferences[FULL_ACCESS_PREFERENCE]));
  const rules = tables.has("approval_rules")
    ? await countRows(
        executor,
        "approval_rules",
        sql`${identifier("owner_user_id")} = ${from} and ${identifier("revoked_at")} is null and ${identifier("behaviour")} in ('allow', 'pre_approved')`,
      )
    : 0;
  const apps: string[] = [];
  if (tables.has("composio_connections")) {
    for (const row of await rowsOf(
      executor,
      sql`select toolkit from composio_connections where user_id = ${from} order by toolkit`,
    ))
      apps.push(String(row.toolkit));
  }
  if (tables.has("brokered_connections")) {
    for (const row of await rowsOf(
      executor,
      sql`select app, provider from brokered_connections where user_id = ${from} and holder = 'person' order by app`,
    ))
      apps.push(`${String(row.app)} (${String(row.provider)})`);
  }

  const earlierRows = await rowsOf(
    executor,
    sql`select created_at as at, payload ->> 'toEmail' as to_email from audit_events
        where event_type = 'person.single_user_data_adopted'
        order by created_at desc limit 1`,
  );
  const earlier = earlierRows[0]
    ? {
        at: new Date(String(earlierRows[0].at)).toISOString(),
        toEmail: String(earlierRows[0].to_email ?? ""),
      }
    : null;

  return {
    from,
    to,
    sourceExists: Boolean(source),
    target,
    moves,
    special,
    total,
    blockers,
    standing: { fullAccess, alwaysAllowRules: rules },
    apps: [...new Set(apps)],
    earlier,
  };
}
