/**
 * Who on FreeDuet's team may hand work to whom (docs/M1_PLAN.md, D14).
 *
 * OpenBot lets one Bot address another only through a `plugin_grants` row of kind `bot`
 * (`mayAddress` in index.ts reads them per hop), and a tenant package seeds skill grants only. So on a
 * fresh FreeDuet Iris could address nobody, and a member that failed in its own conversation with the
 * person could not tell her.
 *
 * A HUB, NOT A MESH. Iris may address every other member, and every member may address Iris. No
 * member may address another member: work that needs two specialists goes through Iris, who splits it
 * and brings the answers back, and the handoff depth cap stays at 1 so there are no chains.
 *
 * WRITTEN UNDER ITS OWN MARK. Every row this writes carries `granted_by = freeduet-package`, which no
 * person's id can be. A sync removes only rows with that mark that the package no longer wants (a
 * member taken out of `agents.yaml`), and never a grant somebody made by hand, even one for the same
 * pair: that one keeps the admin's credit and survives the member's removal.
 */
import { and, eq } from "drizzle-orm";
import { HANDOFF_GRANT } from "../agents/handoff";
import type { Database } from "../db/client";
import { pluginGrants } from "../db/schema";
import type { TenantPackage } from "../tenant-package";

/** The tenant id of FreeDuet's own package (`examples/freeduet/brand.yaml`). */
export const FREEDUET_TENANT_ID = "freeduet";

/** The mark a hub grant carries in `plugin_grants.granted_by`. */
export const FREEDUET_GRANT = "freeduet-package";

type TeamPackage = Pick<TenantPackage, "tenantId" | "agents">;

/** Whether the loaded package is FreeDuet's. Nothing here acts on any other package. */
export function isFreeDuetPackage(
  tenantPackage: Pick<TenantPackage, "tenantId">,
) {
  return tenantPackage.tenantId === FREEDUET_TENANT_ID;
}

/** One grant: `agentId` may hand work to `ref`. */
export type HubGrant = { agentId: string; ref: string };

/**
 * The grants the package wants, read from its members rather than from a list kept here.
 *
 * Iris is the member whose id is the tenant id (`brand.yaml` says the two are renamed together). A
 * package without her wants no grants at all: a hub with no centre would be member to member.
 */
export function hubGrants(tenantPackage: TeamPackage): HubGrant[] {
  const iris = tenantPackage.tenantId;
  const ids = tenantPackage.agents.map((agent) => agent.id);
  if (!ids.includes(iris)) return [];
  return ids
    .filter((id) => id !== iris)
    .flatMap((member) => [
      { agentId: iris, ref: member },
      { agentId: member, ref: iris },
    ]);
}

const key = (grant: HubGrant) => `${grant.agentId}\u0000${grant.ref}`;

/**
 * Brings the hub grants in line with the package, in one transaction.
 *
 * Run after `synchronizeTenantPackage`, so every member it names has its agent row. Idempotent: a
 * second run with the same package changes nothing.
 */
export async function seedHubGrants(
  database: Database,
  tenantPackage: TeamPackage,
): Promise<{ added: number; removed: number }> {
  const wanted = hubGrants(tenantPackage);
  const wantedKeys = new Set(wanted.map(key));
  return database.transaction(async (transaction) => {
    const ours = await transaction
      .select({ agentId: pluginGrants.agentId, ref: pluginGrants.ref })
      .from(pluginGrants)
      .where(
        and(
          eq(pluginGrants.kind, HANDOFF_GRANT),
          eq(pluginGrants.grantedBy, FREEDUET_GRANT),
        ),
      );
    const stale = ours.filter((grant) => !wantedKeys.has(key(grant)));
    for (const grant of stale) {
      await transaction
        .delete(pluginGrants)
        .where(
          and(
            eq(pluginGrants.kind, HANDOFF_GRANT),
            eq(pluginGrants.grantedBy, FREEDUET_GRANT),
            eq(pluginGrants.agentId, grant.agentId),
            eq(pluginGrants.ref, grant.ref),
          ),
        );
    }
    const added =
      wanted.length === 0
        ? []
        : await transaction
            .insert(pluginGrants)
            .values(
              wanted.map((grant) => ({
                kind: HANDOFF_GRANT,
                ref: grant.ref,
                agentId: grant.agentId,
                grantedBy: FREEDUET_GRANT,
              })),
            )
            // A grant an admin already made for the same pair stays theirs, untouched.
            .onConflictDoNothing()
            .returning({ agentId: pluginGrants.agentId });
    return { added: added.length, removed: stale.length };
  });
}

/** What index.ts calls after the package sync: the hub grants, for FreeDuet's package only. */
export async function applyFreeDuetPackage(
  database: Database,
  tenantPackage: TeamPackage,
): Promise<void> {
  if (!isFreeDuetPackage(tenantPackage)) return;
  const { added, removed } = await seedHubGrants(database, tenantPackage);
  if (added > 0 || removed > 0) {
    console.info(
      JSON.stringify({ type: "freeduet-hub-grants", added, removed }),
    );
  }
}
