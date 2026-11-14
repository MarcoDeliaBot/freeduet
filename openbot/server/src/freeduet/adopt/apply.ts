/**
 * The move: everything the single-user person owns becomes the target's, in one transaction
 * (docs/design/single-user-to-sign-in.md, sections 3, 4 and 6.3).
 *
 * ONE TRANSACTION, SO ANY FAILURE IS NO CHANGE. Every statement below runs inside a single
 * transaction on a single connection. An error, a refusal, a signal or a killed process before the
 * commit leaves the database exactly as it was, because closing the connection rolls it back. There is
 * no step after the commit that the move depends on.
 *
 * NOTHING ELSE WRITES WHILE IT RUNS. The caller has already checked that the server is stopped. Here
 * that is not trusted for the length of the move: the tool takes an advisory lock (two runs cannot
 * overlap), locks every table it will touch against writers, asks again, under those locks, whether
 * anything else is connected or answering, reads the plan again and stops if it is not the plan the
 * person was shown, does the move, proves the counts add up, writes one audit event, and asks about
 * the server a last time just before the commit. Anything that appeared makes it roll back.
 *
 * THE SHAPE OF THE TARGET'S ROW is what makes the first sign-in land on this person and not on a
 * second one. The reasons are in section 4 and the proof is single-user-adoption-signin.test.ts.
 *
 * NOT DONE HERE. Roles: the first sign-in grants the administrator role itself, because the address
 * is in INITIAL_ADMIN_EMAILS (auth/index.ts). The audit trail: it keeps the old id on every row,
 * because it says who did what at the time. Conversation text: it is not touched.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createAuditStore, recordAuditEvent } from "../../audit";
import type { DeploymentConfig } from "../../config";
import type { Database } from "../../db/client";
import {
  countMoves,
  countSpecial,
  findResidue,
  holdsString,
  identifier,
  type Plan,
  readPlan,
  whereOf,
} from "./plan";
import { Refusal, SETTLE_MS, serverProblems } from "./preconditions";
import {
  columnKey,
  IDENTITY,
  MOVE,
  SOURCE_ID,
  SPECIAL,
  USER_KEYED_CREDENTIAL_KINDS,
} from "./registry";
import { readColumns, rowsOf } from "./schema-scan";

/** The key of the advisory lock that keeps two runs of this tool from overlapping. */
const LOCK_KEY = "freeduet.adopt-single-user-data";

export type ApplyOptions = {
  config: DeploymentConfig;
  /** The address the data becomes, as the sign-in will see it. */
  address: string;
  /** The plan the person was shown. The move reads the data again under its locks and stops if it differs. */
  expected: Plan;
  /** The backup's file name, for the audit event. A name, never a path. */
  backupName: string;
  /** How long a closing connection is given to finish. */
  settleMs?: number;
  /** How long to wait for a lock before giving up and rolling back. */
  lockTimeoutMs?: number;
  /**
   * Called after each step, inside the transaction, with the transaction itself. A test throws from
   * it to prove that stopping after any step leaves nothing behind, and writes through it to prove
   * that a row which did not move is noticed. Reachable only by a caller of this module: the
   * command line passes none.
   */
  checkpoint?: (step: string, transaction: Transaction) => void | Promise<void>;
};

export type Applied = {
  fromId: string;
  toId: string;
  /** Whether the target's row was made by the move (otherwise an empty one was filled in). */
  createdTarget: boolean;
  /** Rows moved, by `table.column`, where there were any. */
  rows: Record<string, number>;
  total: number;
};

/**
 * `text`, which is JSON as PostgreSQL prints a jsonb, with every string VALUE equal to `from` replaced
 * by `to`, at any depth, and how many there were. Every other character is copied as it was.
 *
 * WHY TEXT AND NOT A PARSED VALUE. Parsed in JavaScript every number is a 64-bit float, so an integer
 * past 2^53 (the 19-digit identifier a service sends as a number, which a tool call can carry in its
 * arguments) comes back as a different number, and 1.10 as 1.1, in a row that was only meant to change
 * its owner. The row count matches, so nothing says so. Here nothing but the id's own token is touched.
 *
 * A key equal to the id is left as it is: only a string that is not followed by a colon is a value. A
 * string is read to its closing quote with its escapes, so the id is found only as a whole string and
 * never inside a longer one.
 */
export function replaceJsonStrings(
  text: string,
  from: string,
  to: string,
): { text: string; count: number } {
  const fromToken = JSON.stringify(from);
  const toToken = JSON.stringify(to);
  let out = "";
  let count = 0;
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('"', at);
    if (open === -1) {
      out += text.slice(at);
      break;
    }
    out += text.slice(at, open);
    let end = open + 1;
    while (end < text.length && text[end] !== '"')
      end += text[end] === "\\" ? 2 : 1;
    const token = text.slice(open, end + 1);
    let after = end + 1;
    while (after < text.length && /\s/.test(text[after] as string)) after += 1;
    if (token === fromToken && text[after] !== ":") {
      out += toToken;
      count += 1;
    } else {
      out += token;
    }
    at = end + 1;
  }
  return { text: out, count };
}

/** All the move needs of its transaction: it runs statements. */
export type Transaction = Pick<Database, "execute">;

/** Every table the move reads or writes, which is every table it locks. */
export function tablesToLock(present: ReadonlySet<string>): string[] {
  const wanted = new Set<string>(["users", "audit_events"]);
  for (const entry of MOVE) wanted.add(entry.table);
  for (const entry of SPECIAL) wanted.add(entry.table);
  for (const entry of IDENTITY) wanted.add(entry.table);
  return [...wanted].filter((name) => present.has(name)).sort();
}

/** Whether an error, or what caused it, is the database giving up on a lock. */
function isLockTimeout(error: unknown): boolean {
  for (
    let current: unknown = error, depth = 0;
    current && depth < 5;
    depth += 1
  ) {
    const found = current as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (found.code === "55P03" || found.errno === "55P03") return true;
    if (
      typeof found.message === "string" &&
      /lock timeout|lock_not_available/i.test(found.message)
    )
      return true;
    current = found.cause;
  }
  return false;
}

/** Moves rows whose column is the id, and says how many. */
async function moveRows(
  tx: Transaction,
  table: string,
  column: string,
  toId: string,
  where: ReturnType<typeof whereOf>,
): Promise<number> {
  const [row] = await rowsOf(
    tx,
    sql`with moved as (
          update ${identifier(table)} set ${identifier(column)} = ${toId}
          where ${where} returning 1
        ) select count(*)::int as n from moved`,
  );
  return Number(row?.n ?? 0);
}

/** Rewrites every string equal to the old id inside a JSON column, row by row, and says how many rows. */
async function rewriteJson(
  tx: Transaction,
  table: string,
  column: string,
  fromId: string,
  toId: string,
): Promise<number> {
  // The rows are named by where they sit, which cannot change under the table lock the move holds.
  // Read and written as text, so that no number in them passes through a float (replaceJsonStrings).
  const rows = await rowsOf(
    tx,
    sql`select ctid::text as at, ${identifier(column)}::text as body
        from ${identifier(table)}
        where ${holdsString(sql`${identifier(column)}::jsonb`, fromId)}`,
  );
  let changed = 0;
  for (const row of rows) {
    const replaced = replaceJsonStrings(String(row.body), fromId, toId);
    if (replaced.count === 0) continue;
    await tx.execute(
      sql`update ${identifier(table)}
          set ${identifier(column)} = ${replaced.text}::text::jsonb
          where ctid = ${String(row.at)}::tid`,
    );
    changed += 1;
  }
  return changed;
}

function samePlan(now: Plan, expected: Plan): boolean {
  const counts = (plan: Plan) =>
    JSON.stringify(
      [...plan.moves, ...plan.special].map((entry) => [entry.key, entry.count]),
    );
  return (
    now.from === expected.from &&
    now.to === expected.to &&
    now.total === expected.total &&
    counts(now) === counts(expected) &&
    (now.target?.id ?? null) === (expected.target?.id ?? null)
  );
}

export async function applyAdoption(
  database: Database,
  options: ApplyOptions,
): Promise<Applied> {
  const settleMs = options.settleMs ?? SETTLE_MS;
  const lockTimeoutMs = options.lockTimeoutMs ?? 10_000;

  try {
    return await database.transaction(async (tx) => {
      const step = async (name: string) => {
        await options.checkpoint?.(name, tx);
      };
      /** Asks whether anything has started using the database or answering as the server. */
      const requireQuiet = async (when: string) => {
        const problems = await serverProblems(options.config, tx, settleMs);
        if (problems.length > 0) {
          throw new Refusal(
            `${problems.join(" ")} This was found ${when}, so nothing was changed.`,
          );
        }
      };

      await step("begun");

      // Two runs cannot overlap, even from two terminals.
      const [advisory] = await rowsOf(
        tx,
        sql`select pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) as got`,
      );
      if (advisory?.got !== true) {
        throw new Refusal(
          "Another run of this tool is moving data right now. Wait for it to finish. Nothing was changed.",
        );
      }
      await step("serialised");

      // Writers wait, or fail, until this transaction ends. Readers are not held up.
      const columns = await readColumns(tx);
      const present = new Set(columns.map((column) => column.table));
      await tx.execute(
        sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`,
      );
      await tx.execute(
        sql`lock table ${sql.join(
          tablesToLock(present).map((name) => identifier(name)),
          sql`, `,
        )} in share row exclusive mode`,
      );
      await step("locked");

      // Asked again, now that nothing can begin to write without being seen.
      await requireQuiet("after the tables were locked");
      await step("still-quiet");

      // The data as it is now, which has to be what the person was shown.
      const plan = await readPlan(tx, options.address);
      if (plan.blockers.length > 0) {
        throw new Refusal(`${plan.blockers.join(" ")} Nothing was changed.`);
      }
      if (!samePlan(plan, options.expected)) {
        throw new Refusal(
          "The data changed between the moment it was read and the moment it was locked, so it is not what you were shown. Nothing was changed. Run the dry run again.",
        );
      }
      await step("planned");

      // The target's row: made in the shape the first sign-in looks for, or an empty one filled in.
      let toId: string;
      let createdTarget = false;
      if (plan.target) {
        toId = plan.target.id;
        await tx.execute(
          sql`update users set
                preferences = source.preferences,
                groups = source.groups,
                onboarding_step = source.onboarding_step,
                onboarding_completed_at = source.onboarding_completed_at,
                updated_at = now()
              from users source
              where users.id = ${toId} and source.id = ${SOURCE_ID}`,
        );
      } else {
        toId = randomUUID();
        createdTarget = true;
        // Verified, because the sign-in links an account to a row only when it can trust the address
        // on it; lower-case, because that is how the sign-in looks an address up.
        if (plan.sourceExists) {
          await tx.execute(
            sql`insert into users
                  (id, email, name, email_verified, preferences, groups, onboarding_step, onboarding_completed_at)
                select ${toId}, ${options.address}, ${options.address}, true,
                       preferences, groups, onboarding_step, onboarding_completed_at
                from users where id = ${SOURCE_ID}`,
          );
        } else {
          await tx.execute(
            sql`insert into users (id, email, name, email_verified)
                values (${toId}, ${options.address}, ${options.address}, true)`,
          );
        }
      }
      await step("target-ready");

      // Everything the person owns.
      for (const entry of MOVE) {
        if (!present.has(entry.table)) continue;
        await moveRows(
          tx,
          entry.table,
          entry.column,
          toId,
          whereOf(entry.column, SOURCE_ID, entry.where),
        );
        await step(`moved:${columnKey(entry.table, entry.column)}`);
      }

      // The columns that are not simply equal to the id.
      for (const entry of SPECIAL) {
        if (entry.table === "users") continue;
        if (entry.table === "credentials") {
          await moveRows(
            tx,
            "credentials",
            "key_id",
            toId,
            sql`${identifier("key_id")} = ${SOURCE_ID} and ${identifier("kind")}::text in (${sql.join(
              USER_KEYED_CREDENTIAL_KINDS.map((kind) => sql`${kind}`),
              sql`, `,
            )})`,
          );
        } else {
          await rewriteJson(tx, entry.table, entry.column, SOURCE_ID, toId);
        }
        await step(`special:${columnKey(entry.table, entry.column)}`);
      }

      // The old row keeps nothing of what moved: not the team's mark, not Full access, not the wizard.
      await tx.execute(
        sql`update users set
              preferences = '{}'::jsonb, groups = '{}', onboarding_step = 0,
              onboarding_completed_at = null, updated_at = now()
            where id = ${SOURCE_ID}`,
      );
      await step("source-emptied");

      // Proof, before anything is committed: what the person owned is what the target owns now.
      const before = [...plan.moves, ...plan.special];
      const left = [
        ...(await countMoves(tx, SOURCE_ID, present)),
        ...(await countSpecial(tx, SOURCE_ID)),
      ];
      const arrived = [
        ...(await countMoves(tx, toId, present)),
        ...(await countSpecial(tx, toId)),
      ];
      for (const entry of before) {
        const stillThere = left.find((other) => other.key === entry.key);
        const nowThere = arrived.find((other) => other.key === entry.key);
        if (
          (stillThere?.count ?? 0) !== 0 ||
          (nowThere?.count ?? 0) !== entry.count
        ) {
          throw new Refusal(
            `The move did not add up for ${entry.key}: ${entry.count} to move, ${stillThere?.count ?? 0} left behind, ${nowThere?.count ?? 0} arrived. Nothing was changed.`,
          );
        }
      }
      const residue = await findResidue(tx, columns, SOURCE_ID);
      if (residue.length > 0) {
        throw new Refusal(
          `The single-user person's id is in a column nobody classified (${residue.map((found) => found.key).join(", ")}). Nothing was changed.`,
        );
      }
      const [accounts] = await rowsOf(
        tx,
        sql`select count(*)::int as n, min(id) as id from users where lower(email) = ${options.address}`,
      );
      if (Number(accounts?.n) !== 1 || accounts?.id !== toId) {
        throw new Refusal(
          `There is not exactly one account for ${options.address} after the move. Nothing was changed.`,
        );
      }
      await step("verified");

      const rows: Record<string, number> = {};
      for (const entry of before) {
        if (entry.count > 0) rows[entry.key] = entry.count;
      }
      const total = before.reduce((sum, entry) => sum + entry.count, 0);

      // One event, in the same transaction, that says what moved. Old events keep the old id.
      await recordAuditEvent(createAuditStore(tx as unknown as Database), {
        eventType: "person.single_user_data_adopted",
        targetType: "person",
        targetId: toId,
        actorUserId: toId,
        payload: {
          toEmail: options.address,
          fromId: SOURCE_ID,
          toId,
          createdTarget,
          total,
          rows,
          backup: options.backupName,
          via: "scripts/adopt-single-user-data.ts",
        },
      });
      await step("audited");

      // The last look, as close to the commit as it can be.
      await requireQuiet("just before the commit");
      await step("quiet-at-the-end");

      return { fromId: SOURCE_ID, toId, createdTarget, rows, total };
    });
  } catch (error) {
    if (error instanceof Refusal) throw error;
    if (isLockTimeout(error)) {
      throw new Refusal(
        "Something is using the data and did not let go in time, so nothing was changed. Make sure the server and the worker are stopped and that nothing restarts them, then run this again.",
      );
    }
    throw error;
  }
}
