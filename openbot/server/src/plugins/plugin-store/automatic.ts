import { and, eq, like, ne, or, isNull, sql } from "drizzle-orm";
import { type AuditStore, recordAuditEvent } from "../../audit";
import type { Database } from "../../db/client";
import { pluginGrants } from "../../db/schema";
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

/**
 * The ONE-OFF for an installation that already has grants: marks a Bot's existing grants on a server
 * as automatic, so later updates top them up. Dry run unless `apply`.
 *
 * It touches only `mcp` rows of that server for that Bot whose mark is not already the automatic one,
 * and never the hub mark. It is run by a person who knows the set was never trimmed by hand; nothing
 * here guesses.
 */
export async function markGrantsAutomatic(
  database: Database,
  auditStore: AuditStore,
  input: { agentId: string; serverId: string; apply: boolean },
): Promise<string[]> {
  const where = and(
    eq(pluginGrants.kind, "mcp"),
    eq(pluginGrants.agentId, input.agentId),
    like(pluginGrants.ref, `${input.serverId.replace(/[\\%_]/g, "\\$&")}/%`),
    or(
      isNull(pluginGrants.grantedBy),
      and(
        ne(pluginGrants.grantedBy, AUTOMATIC_GRANT),
        ne(pluginGrants.grantedBy, "freeduet-package"),
      ),
    ),
  );
  const rows = await database
    .select({ ref: pluginGrants.ref })
    .from(pluginGrants)
    .where(where);
  const refs = rows.map((row) => row.ref).sort();
  if (!input.apply || refs.length === 0) return refs;
  await database
    .update(pluginGrants)
    .set({ grantedBy: AUTOMATIC_GRANT, updatedAt: new Date() })
    .where(where);
  for (const ref of refs) {
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
  return refs;
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
