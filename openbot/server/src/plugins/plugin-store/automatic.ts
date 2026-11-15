import { and, eq, like, sql } from "drizzle-orm";
import { type AuditStore, recordAuditEvent } from "../../audit";
import type { Database } from "../../db/client";
import { agents, deploymentPackages, pluginGrants } from "../../db/schema";
import { catalogueEntry } from "../catalogue";

/**
 * The mark an AUTOMATIC grant carries in `plugin_grants.granted_by` (docs/design/connect-from-chat.md).
 *
 * WHAT IT SAYS. "The product gave this tool to this Bot as part of connecting or approving an app, and
 * no person chose it one tool at a time." A grant an administrator makes by hand on the Bot's page
 * writes the administrator's address instead, so the two can be told apart. Only rows with this mark
 * are ever topped up when an update adds tools; a row without it is never touched by that.
 *
 * NOT AN ADDRESS AND NOT THE HUB MARK. An address always contains an `@`, and `freeduet-package`
 * (`freeduet/hub-grants.ts`) marks hand-offs between members, a different kind of row.
 */
export const AUTOMATIC_GRANT = "freeduet-automatic";

/**
 * The ONLY apps an automatic grant is ever made or topped up for: the two ways of connecting Gmail and
 * Google Calendar, which the mailbox member (Otto) holds. No other catalogue entry is ever touched.
 */
export const AUTOMATIC_SERVERS: readonly string[] = [
  "google-imap",
  "google-workspace",
];

/** The tenant id of FreeDuet's own package; a test holds it equal to `FREEDUET_TENANT_ID`. */
export const FREEDUET_PACKAGE_TENANT = "freeduet";

/**
 * Whether this Bot is a member of FreeDuet's own package: an agent row the package sync owns
 * (`agents.package_id` points at the `freeduet` package). A Bot a person made, or one imported, has
 * no package and is never a member.
 */
export async function isFreeDuetMember(
  database: Database,
  agentId: string,
): Promise<boolean> {
  const [row] = await database
    .select({ id: agents.id })
    .from(agents)
    .innerJoin(deploymentPackages, eq(agents.packageId, deploymentPackages.id))
    .where(
      and(
        eq(agents.id, agentId),
        eq(deploymentPackages.tenantId, FREEDUET_PACKAGE_TENANT),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Whether an automatic grant may ever name this app. */
export function automaticServerAllowed(serverId: string): boolean {
  return AUTOMATIC_SERVERS.includes(serverId);
}

/** The server a `serverId/toolName` ref belongs to. */
export function serverOfRef(ref: string): string {
  return ref.split("/")[0] ?? "";
}

/**
 * The tools the catalogue declares for a server that an automatic grant may give: every declared
 * read and write, and NEVER one that sends.
 *
 * Read from the entry's own lists and never from the tool's name. A server with no entry declares
 * nothing, so nothing is given for it. A grant is a tool, not an approval: every write here still
 * meets the approval gate when it is used, exactly as before.
 */
export function automaticToolRefs(serverId: string): string[] {
  const entry = catalogueEntry(serverId);
  if (!entry) return [];
  const sends = new Set(entry.sendTools);
  return [...new Set([...entry.readTools, ...entry.writeTools])]
    .filter((name) => !sends.has(name))
    .map((name) => `${serverId}/${name}`);
}

/**
 * Whether EVERY `mcp` row this Bot holds on this server carries the automatic mark (an empty set
 * counts: nothing was chosen yet). One row with any other mark skips the whole Bot and server.
 */
async function setIsAllAutomatic(
  database: Database,
  agentId: string,
  serverId: string,
): Promise<boolean> {
  const rows = await database
    .select({ by: pluginGrants.grantedBy })
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.kind, "mcp"),
        eq(pluginGrants.agentId, agentId),
        sql`split_part(${pluginGrants.ref}, '/', 1) = ${serverId}`,
      ),
    );
  return rows.every((row) => row.by === AUTOMATIC_GRANT);
}

/**
 * Gives one Bot the declared tools of one server that it does not hold yet, under the automatic mark.
 *
 * `onConflictDoNothing`: a tool the Bot already holds keeps whatever mark it has, so a hand-made grant
 * is never relabelled and a second run adds nothing. One audit row per tool actually added.
 */
export async function grantDeclaredAutomatically(
  database: Database,
  auditStore: AuditStore,
  input: { agentId: string; serverId: string; reason: string },
): Promise<string[]> {
  if (!automaticServerAllowed(input.serverId)) return [];
  if (!(await isFreeDuetMember(database, input.agentId))) return [];
  // A set is automatic only when every row of it carries the mark: a hand-made row among them, or
  // any other mark, means somebody chose, and nothing is added.
  if (!(await setIsAllAutomatic(database, input.agentId, input.serverId)))
    return [];
  const refs = automaticToolRefs(input.serverId);
  if (refs.length === 0) return [];
  const added = await database
    .insert(pluginGrants)
    .values(
      refs.map((ref) => ({
        kind: "mcp",
        ref,
        agentId: input.agentId,
        grantedBy: AUTOMATIC_GRANT,
      })),
    )
    .onConflictDoNothing()
    .returning({ ref: pluginGrants.ref });
  for (const { ref } of added) {
    await recordAuditEvent(auditStore, {
      eventType: "configuration.changed",
      targetType: "plugin",
      targetId: ref,
      payload: {
        actor: AUTOMATIC_GRANT,
        change: "plugin_granted",
        kind: "mcp",
        ref,
        bot: input.agentId,
        automatic: true,
        reason: input.reason,
      },
    });
  }
  return added.map((row) => row.ref);
}

/**
 * At server start: for every Bot that holds a tool of a server under the automatic mark, grants the
 * tools of that server the catalogue declares and it lacks. Idempotent. Rows without the mark make a
 * Bot invisible to it, so a set an administrator chose by hand is never widened.
 */
export async function topUpAutomaticGrants(
  database: Database,
  auditStore: AuditStore,
): Promise<{ bot: string; server: string; added: string[] }[]> {
  const marked = await database
    .select({ agentId: pluginGrants.agentId, ref: pluginGrants.ref })
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.kind, "mcp"),
        eq(pluginGrants.grantedBy, AUTOMATIC_GRANT),
      ),
    );
  const pairs = new Map<string, { bot: string; server: string }>();
  for (const row of marked) {
    const server = serverOfRef(row.ref);
    if (!automaticServerAllowed(server)) continue;
    pairs.set(`${row.agentId}\u0000${server}`, { bot: row.agentId, server });
  }
  const done: { bot: string; server: string; added: string[] }[] = [];
  for (const { bot, server } of pairs.values()) {
    const added = await grantDeclaredAutomatically(database, auditStore, {
      agentId: bot,
      serverId: server,
      reason: "update_added_tools",
    });
    if (added.length > 0) done.push({ bot, server, added });
  }
  return done;
}

export class MarkRefused extends Error {}

/**
 * The ONE-OFF for an installation that already has grants: marks a FreeDuet member's existing grants
 * on a Gmail app as automatic, so later updates top them up. Dry run unless `apply`.
 *
 * Refuses (throws {@link MarkRefused}) for an app outside the allow-list, a Bot that does not exist
 * and a Bot that is not a member of FreeDuet's package. It marks `mcp` rows of that server only,
 * skips rows already marked, and NEVER relabels a row for a tool that sends: those are returned in
 * `leftSend` and stay as they are (so the set is then not all-automatic and is not topped up, which
 * the person is told). It is run by a person who knows the set was never trimmed by hand.
 */
export async function markGrantsAutomatic(
  database: Database,
  auditStore: AuditStore,
  input: { agentId: string; serverId: string; apply: boolean },
): Promise<{ marked: string[]; leftSend: string[]; added: string[] }> {
  if (!automaticServerAllowed(input.serverId))
    throw new MarkRefused(
      `${input.serverId} is not an app this command works on (${AUTOMATIC_SERVERS.join(", ")}).`,
    );
  const [bot] = await database
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (!bot) throw new MarkRefused(`There is no Bot called ${input.agentId}.`);
  if (!(await isFreeDuetMember(database, input.agentId)))
    throw new MarkRefused(
      `${input.agentId} is not a member of FreeDuet's team, so nothing is marked.`,
    );
  const sends = new Set(
    (catalogueEntry(input.serverId)?.sendTools ?? []).map(
      (name) => `${input.serverId}/${name}`,
    ),
  );
  const rows = await database
    .select({ ref: pluginGrants.ref, by: pluginGrants.grantedBy })
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.kind, "mcp"),
        eq(pluginGrants.agentId, input.agentId),
        like(
          pluginGrants.ref,
          `${input.serverId.replace(/[\\%_]/g, "\\$&")}/%`,
        ),
      ),
    );
  const todo = rows.filter((row) => row.by !== AUTOMATIC_GRANT);
  const marked = todo
    .filter((row) => !sends.has(row.ref))
    .map((row) => row.ref)
    .sort();
  const leftSend = todo
    .filter((row) => sends.has(row.ref))
    .map((row) => row.ref)
    .sort();
  if (!input.apply) return { marked, leftSend, added: [] };
  for (const ref of marked) {
    await database
      .update(pluginGrants)
      .set({ grantedBy: AUTOMATIC_GRANT, updatedAt: new Date() })
      .where(
        and(
          eq(pluginGrants.kind, "mcp"),
          eq(pluginGrants.agentId, input.agentId),
          eq(pluginGrants.ref, ref),
        ),
      );
    await recordAuditEvent(auditStore, {
      eventType: "configuration.changed",
      targetType: "plugin",
      targetId: ref,
      payload: {
        actor: "mark-automatic-grants",
        change: "plugin_grant_marked_automatic",
        kind: "mcp",
        ref,
        bot: input.agentId,
      },
    });
  }
  // The same rules as at start: a set with a row left unmarked is not topped up.
  const added = await grantDeclaredAutomatically(database, auditStore, {
    agentId: input.agentId,
    serverId: input.serverId,
    reason: "mark_automatic_grants",
  });
  return { marked, leftSend, added };
}

/**
 * A person took a tool away from a Bot by hand: what is left of that Bot's automatic set on the same
 * server becomes theirs, so the next start does not hand the tool back.
 */
export async function keepTrimmedSetByHand(
  database: Database,
  input: { agentId: string; ref: string; by: string },
): Promise<void> {
  const server = serverOfRef(input.ref);
  if (!server) return;
  await database
    .update(pluginGrants)
    .set({ grantedBy: input.by, updatedAt: new Date() })
    .where(
      and(
        eq(pluginGrants.kind, "mcp"),
        eq(pluginGrants.agentId, input.agentId),
        eq(pluginGrants.grantedBy, AUTOMATIC_GRANT),
        sql`split_part(${pluginGrants.ref}, '/', 1) = ${server}`,
      ),
    );
}
