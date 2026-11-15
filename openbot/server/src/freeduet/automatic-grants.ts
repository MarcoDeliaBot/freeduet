/**
 * Tools an update adds reach the member that holds the mailbox, without the person doing anything
 * (docs/design/connect-from-chat.md, D45).
 *
 * A grant is a `plugin_grants` row, and an update that adds a tool to an app grants it to nobody. The
 * rows the product itself writes (approving an access request with the default set, connecting an app
 * from the chat's button) carry the automatic mark; at start, for FreeDuet's package only, every Bot
 * holding a marked tool of a server is given the tools the catalogue declares for that server and it
 * lacks. Rows without the mark (a set somebody chose by hand, an installation from before the mark)
 * are never touched: `scripts/mark-automatic-grants.ts` is how a person opts an existing set in.
 *
 * A GRANT GIVES A TOOL, NOT AN APPROVAL. Every write still meets the approval gate when it is used,
 * and a tool that sends is never given here (`automaticToolRefs`).
 */
import type { AuditStore } from "../audit";
import type { Database } from "../db/client";
import { topUpAutomaticGrants } from "../plugins/plugin-store/automatic";
import type { TenantPackage } from "../tenant-package";
import { isFreeDuetPackage } from "./hub-grants";

export async function applyAutomaticGrants(
  database: Database,
  auditStore: AuditStore,
  tenantPackage: Pick<TenantPackage, "tenantId">,
): Promise<void> {
  if (!isFreeDuetPackage(tenantPackage)) return;
  const done = await topUpAutomaticGrants(database, auditStore);
  for (const { bot, server, added } of done) {
    console.info(
      JSON.stringify({
        type: "freeduet-automatic-grants",
        bot,
        server,
        added: added.length,
      }),
    );
  }
}
