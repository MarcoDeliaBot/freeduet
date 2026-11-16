/**
 * Switch the automatic reviewer back on for people who never switched it off.
 *
 *   bun scripts/repair-auto-review.ts            counts the rows it would change (writes nothing)
 *   bun scripts/repair-auto-review.ts --apply --expect N    changes them (N = the dry run's count)
 *
 * Prints counts only, never a person's id. Safe to run twice. See `approvals/repair-auto-review.ts`
 * for which rows count as "never switched off".
 */
import { repairAutoReview } from "../src/approvals/repair-auto-review";
import { createDatabase } from "../src/db/client";

const apply = process.argv.includes("--apply");
const at = process.argv.indexOf("--expect");
const expectRaw = at >= 0 ? process.argv[at + 1] : undefined;
const expected =
  expectRaw !== undefined && /^\d+$/.test(expectRaw)
    ? Number(expectRaw)
    : undefined;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
// Which database, so nobody applies to the wrong one. Never the password or the full URL.
try {
  const parsed = new URL(url);
  console.log(`Database: ${parsed.host}${parsed.pathname} (no password shown)`);
} catch {
  console.log("Database: (address not readable)");
}
if (apply && expected === undefined) {
  console.error(
    "--apply needs --expect N, where N is the count the dry run printed. Nothing changed.",
  );
  process.exit(1);
}
const database = createDatabase(url);
try {
  const result = await repairAutoReview(database, {
    apply,
    retentionDays: process.env.AUDIT_RETENTION_DAYS,
    expect: expected,
  });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }));
  if (!apply && (process.env.AUDIT_RETENTION_DAYS ?? "").trim() !== "")
    console.log(
      "Note: AUDIT_RETENTION_DAYS is set, so --apply will be refused: old audit events are deleted and cannot show who chose what.",
    );
  if (result.refused === "retention") {
    console.error(
      "Refused: AUDIT_RETENTION_DAYS is set, so old audit events are deleted and a person who switched automatic review off long ago would look as if they never did. Nothing changed.",
    );
    process.exitCode = 1;
  } else if (result.refused === "expected-count") {
    console.error(
      `Refused: the count is ${result.candidates}, not ${expected}. Nothing changed. Run the dry run again.`,
    );
    process.exitCode = 1;
  }
} finally {
  await database.$client.close();
}
