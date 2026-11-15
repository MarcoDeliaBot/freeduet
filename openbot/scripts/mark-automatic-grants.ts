/**
 * Marks one member's existing grants on one app as automatic, so later updates add the app's new
 * tools to that member by themselves (docs/design/connect-from-chat.md, D45).
 *
 *   bun scripts/mark-automatic-grants.ts --bot otto --server google-imap           dry run: lists, writes nothing
 *   bun scripts/mark-automatic-grants.ts --bot otto --server google-imap --apply   marks them
 *
 * Run from the `openbot` folder, once per member and app, by the person, on purpose. Run it only when
 * that member's set on that app was never trimmed by hand: the command does not guess. It changes only
 * the mark of existing rows (no tool is added or removed), skips rows already marked, and writes one
 * audit row per change.
 */
import { createAuditStore } from "../server/src/audit";
import { createDatabase } from "../server/src/db/client";
import {
  grantDeclaredAutomatically,
  markGrantsAutomatic,
} from "../server/src/plugins/plugin-store/automatic";

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const bot = arg("bot");
const server = arg("server");
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!bot || !server || !url) {
  console.error(
    "Usage: bun scripts/mark-automatic-grants.ts --bot <member id> --server <app id> [--apply]\n(DATABASE_URL must be set.)",
  );
  process.exit(2);
}
const database = createDatabase(url, { max: 1 });
try {
  const refs = await markGrantsAutomatic(database, createAuditStore(database), {
    agentId: bot,
    serverId: server,
    apply,
  });
  if (refs.length === 0) console.log("Nothing to mark.");
  else {
    console.log(
      `${apply ? "Marked" : "Would mark"} ${refs.length} grant(s) of ${bot} on ${server} as automatic:`,
    );
    for (const ref of refs) console.log(`  ${ref}`);
    if (!apply) console.log("Dry run: nothing was written. Add --apply.");
    else {
      // Now, not at the next start: the person has just said this set is the product's to keep current.
      const added = await grantDeclaredAutomatically(
        database,
        createAuditStore(database),
        { agentId: bot, serverId: server, reason: "mark_automatic_grants" },
      );
      console.log(
        `Added ${added.length} tool(s) the app declares and ${bot} lacked.`,
      );
    }
  }
} finally {
  await database.$client.close();
}
