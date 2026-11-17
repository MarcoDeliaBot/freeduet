/**
 * Iris holds the Routines connector by default, once (docs/M1_PLAN.md, D81, section 60).
 *
 * WHY. D79 stopped the server from creating Iris's daily review at first sign-in: she offers it as one line of
 * the first-day proposal and makes it with `create_routine`, where the always-ask card decides (D35). But the
 * Routines connector (`plugins/catalogue.ts`, key `routines`) was granted to a Bot only by an administrator by
 * hand, so on a plain installation Iris was never offered the tool and nobody was offered the review.
 *
 * ONE WRITE PATH OUTSIDE THE AUTOMATIC-GRANT PATTERN, AND WHY. The Gmail automatic grant is made by an event
 * (the person connects the app) and, once a tool is taken away by hand, nothing re-adds it, because the
 * start-time top-up only acts on a Bot that still holds a marked row. The Routines connector is built in: no
 * connect event exists, so a grant has to be made at start, and "a start that finds nothing grants" would give
 * back what an administrator removed. So the grant is made ONCE, and the fact that it was made (or skipped) is
 * kept in one row of `enterprise_settings` ({@link IRIS_ROUTINES_KEY}), written in the same transaction as the
 * grant. A row present means: never again. A removal or a trim by hand therefore stays. No migration: the
 * table is a plain key and a jsonb value, and its reader (`admin/settings-store.ts`) ignores unknown keys, as
 * it does for `freeduet_engine_choices` (`engine-choices.ts`).
 *
 * WHAT IS GIVEN. Only to Iris (the member whose id is the tenant id), only in FreeDuet's own package, and only
 * the tools the catalogue declares for `routines`: two reads and seven writes. A grant is a tool, not an
 * approval: every write still meets the always-ask card (D35) in every mode, Full access included.
 *
 * THE CONNECTOR ITSELF. A grant offers a tool only while the connector's row exists (`mcp_servers`, with its tool
 * list), and on a plain installation nobody has added Routines under Plugins. So, before the grant, the seed
 * adds the connector when it is not there (`ensureServer`, which index.ts passes as `pluginStore.addServer`, or `refreshTools` when the row is there but its tools were never listed),
 * and never rewrites an administrator's own row. If adding it fails, no marker is written and the next start
 * tries again.
 *
 * NEVER WIDEN A HAND-MADE SET. If Iris already holds any `routines/*` row when the marker is absent, her
 * grants are left exactly as they are and the marker is still written.
 */
import { and, eq, sql } from "drizzle-orm";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { enterpriseSettings, mcpServers, pluginGrants } from "../db/schema";
import {
  AUTOMATIC_GRANT,
  automaticToolRefs,
  isFreeDuetMember,
} from "../plugins/plugin-store/automatic";
import type { TenantPackage } from "../tenant-package";
import { isFreeDuetPackage } from "./hub-grants";

/** The `enterprise_settings` key. Documented in docs/design/automations-in-chat.md and docs/M1_PLAN.md section 60. */
export const IRIS_ROUTINES_KEY = "freeduet_iris_routines_seeded";
export const IRIS_ROUTINES_SERVER = "routines";

export type IrisRoutinesOutcome =
  /** The package has no Iris, or is not FreeDuet's: nothing granted, no marker. */
  | { status: "not-applicable" }
  /** The marker was already there: nothing done. */
  | { status: "already-decided" }
  /** The tools were granted and the marker written. */
  | { status: "granted"; added: string[] }
  /** Iris already held a `routines/*` row: left as it was, marker written. */
  | { status: "left-as-is" };

/**
 * The grant itself, for the Bot `iris`. The caller has already decided that the package is FreeDuet's and has
 * an Iris ({@link applyIrisRoutines}); this checks that the Bot is a member of that package.
 */
async function marker(database: Database) {
  const [row] = await database
    .select({ key: enterpriseSettings.key })
    .from(enterpriseSettings)
    .where(eq(enterpriseSettings.key, IRIS_ROUTINES_KEY));
  return row;
}

async function holdsAny(database: Database, iris: string) {
  const rows = await database
    .select({ ref: pluginGrants.ref })
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.kind, "mcp"),
        eq(pluginGrants.agentId, iris),
        sql`split_part(${pluginGrants.ref}, '/', 1) = ${IRIS_ROUTINES_SERVER}`,
      ),
    );
  return rows.length > 0;
}

export async function seedIrisRoutines(
  database: Database,
  auditStore: AuditStore,
  iris: string,
  ensureServer?: (needs: "add" | "refresh") => Promise<void>,
): Promise<IrisRoutinesOutcome> {
  // Her row is made by the package sync, which runs first; without it (or not a package member) nothing is
  // written, so a later start can still do it.
  if (!(await isFreeDuetMember(database, iris)))
    return { status: "not-applicable" };

  /*
   * A grant offers a tool only while the connector's own row exists (`mcp_servers`, with its tool list): on a
   * plain installation nobody has added Routines under Plugins, so the grant alone would offer nothing. When
   * the marker is absent and Iris holds no Routines row yet, the connector is added first, only if it is not
   * there, so an administrator's own row is never rewritten. A failure here writes no marker, and the next
   * start tries again.
   */
  if (
    ensureServer &&
    !(await marker(database)) &&
    !(await holdsAny(database, iris))
  ) {
    const [server] = await database
      .select({
        id: mcpServers.id,
        refreshed: mcpServers.toolsRefreshedAt,
      })
      .from(mcpServers)
      .where(eq(mcpServers.id, IRIS_ROUTINES_SERVER));
    // Missing: add it. There, but its tools never listed (an earlier add that failed halfway): list them now,
    // or the grant would offer an empty list and the marker would say it was done.
    const needs = !server
      ? "add"
      : server.refreshed === null
        ? "refresh"
        : null;
    if (needs) {
      try {
        await ensureServer(needs);
      } catch (error) {
        console.warn(
          JSON.stringify({
            type: "freeduet-iris-routines-server-failed",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return { status: "not-applicable" };
      }
    }
  }

  const outcome = await database.transaction(
    async (transaction): Promise<IrisRoutinesOutcome> => {
      // The marker first. A second server starting together waits on this insert's unique key until the first
      // commits, and then inserts nothing: one grant, one marker.
      const marked = await transaction
        .insert(enterpriseSettings)
        .values({
          key: IRIS_ROUTINES_KEY,
          value: { value: { version: 1 } },
          updatedBy: AUTOMATIC_GRANT,
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: enterpriseSettings.key })
        .returning({ key: enterpriseSettings.key });
      if (marked.length === 0) return { status: "already-decided" };

      const held = await transaction
        .select({ ref: pluginGrants.ref })
        .from(pluginGrants)
        .where(
          and(
            eq(pluginGrants.kind, "mcp"),
            eq(pluginGrants.agentId, iris),
            sql`split_part(${pluginGrants.ref}, '/', 1) = ${IRIS_ROUTINES_SERVER}`,
          ),
        );
      const outcomeValue = held.length > 0 ? "left-as-is" : "granted";
      await transaction
        .update(enterpriseSettings)
        .set({ value: { value: { version: 1, outcome: outcomeValue } } })
        .where(eq(enterpriseSettings.key, IRIS_ROUTINES_KEY));
      if (held.length > 0) return { status: "left-as-is" };

      const added = await transaction
        .insert(pluginGrants)
        .values(
          automaticToolRefs(IRIS_ROUTINES_SERVER).map((ref) => ({
            kind: "mcp",
            ref,
            agentId: iris,
            grantedBy: AUTOMATIC_GRANT,
          })),
        )
        .onConflictDoNothing()
        .returning({ ref: pluginGrants.ref });
      return { status: "granted", added: added.map((row) => row.ref) };
    },
  );

  if (outcome.status === "granted") {
    for (const ref of outcome.added)
      await recordAuditEvent(auditStore, {
        eventType: "configuration.changed",
        targetType: "plugin",
        targetId: ref,
        payload: {
          actor: AUTOMATIC_GRANT,
          change: "plugin_granted",
          kind: "mcp",
          ref,
          bot: iris,
          automatic: true,
          reason: "iris_routines_default",
        },
      });
  }
  return outcome;
}

/** What index.ts calls at start, after the package sync and the other automatic grants. */
export async function applyIrisRoutines(
  database: Database,
  auditStore: AuditStore,
  tenantPackage: Pick<TenantPackage, "tenantId"> & {
    agents: readonly { id: string }[];
  },
  ensureServer?: (needs: "add" | "refresh") => Promise<void>,
): Promise<IrisRoutinesOutcome> {
  if (!isFreeDuetPackage(tenantPackage)) return { status: "not-applicable" };
  const iris = tenantPackage.tenantId;
  if (!tenantPackage.agents.some((agent) => agent.id === iris))
    return { status: "not-applicable" };
  const outcome = await seedIrisRoutines(
    database,
    auditStore,
    iris,
    ensureServer,
  );
  if (outcome.status === "granted" || outcome.status === "left-as-is")
    console.info(
      JSON.stringify({
        type: "freeduet-iris-routines",
        status: outcome.status,
        added: outcome.status === "granted" ? outcome.added.length : 0,
      }),
    );
  return outcome;
}
