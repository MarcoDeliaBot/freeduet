/**
 * Switch the automatic reviewer back on for people who never switched it off.
 *
 *   bun scripts/repair-auto-review.ts            counts the rows it would change (writes nothing)
 *   bun scripts/repair-auto-review.ts --apply    changes them, one audit event each
 *
 * Prints counts only, never a person's id. Safe to run twice. See `approvals/repair-auto-review.ts`
 * for which rows count as "never switched off".
 */
import { repairAutoReview } from "../src/approvals/repair-auto-review";
import { createDatabase } from "../src/db/client";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const database = createDatabase(url);
try {
  const result = await repairAutoReview(database, { apply });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }));
} finally {
  await database.$client.close();
}
