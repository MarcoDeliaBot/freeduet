/**
 * Marks one FreeDuet member's existing grants on one Gmail app (google-imap or google-workspace) as automatic, so later updates add the app's new
 * tools to that member by themselves (docs/design/connect-from-chat.md, D45).
 *
 *   bun scripts/mark-automatic-grants.ts --bot inbox --server google-imap           dry run: lists, writes nothing
 *   bun scripts/mark-automatic-grants.ts --bot inbox --server google-imap --apply   marks them
 *
 * Run from the `openbot` folder, once per member and app, by the person, on purpose. Run it only when
 * that member's set on that app was never trimmed by hand: the command does not guess. It changes only
 * the mark of existing rows (never a row for a tool that sends), skips rows already marked, writes one
 * audit row per change, and with --apply then adds the declared tools the member lacks (when every row of
 * the set is marked). It refuses a Bot that does not exist or is not a member of FreeDuet's team.
 */
import { createAuditStore } from "../server/src/audit";
import { createDatabase } from "../server/src/db/client";
import {
  MarkRefused,
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
let code = 0;
try {
  const done = await markGrantsAutomatic(database, createAuditStore(database), {
    agentId: bot,
    serverId: server,
    apply,
  });
  if (done.marked.length === 0 && done.added.length === 0) {
    console.log(
      `Nothing was ${apply ? "done" : "to do"}: no grant of ${bot} on ${server} needed marking.`,
    );
  } else {
    console.log(
      `${apply ? "Marked" : "Would mark"} ${done.marked.length} grant(s) of ${bot} on ${server} as automatic:`,
    );
    for (const ref of done.marked) console.log(`  ${ref}`);
    if (!apply) console.log("Dry run: nothing was written. Add --apply.");
    else
      console.log(
        `Added ${done.added.length} tool(s) the app declares and ${bot} lacked.`,
      );
  }
  if (done.leftSend.length > 0) {
    console.log(
      `Left as they are (a tool that sends is never relabelled): ${done.leftSend.join(", ")}.`,
    );
    console.log(
      "While any grant of this member on this app is not marked, updates do not add tools to it.",
    );
  }
} catch (error) {
  if (error instanceof MarkRefused) {
    console.error(`Refused: ${error.message} Nothing was changed.`);
    code = 2;
  } else throw error;
} finally {
  await database.$client.close();
}
process.exit(code);
