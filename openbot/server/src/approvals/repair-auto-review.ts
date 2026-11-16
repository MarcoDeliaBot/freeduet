import { sql } from "drizzle-orm";
import { createAuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";

/**
 * One-time repair for installations hit by the first-save bug (`docs/design/auto-review-default.md`):
 * `setEnabled` used to create a person's `approval_preferences` row with the database default
 * `auto_review = false`, and migration 0049 added the column the same way to every row that already
 * existed, so somebody who only ever used "Ask before making changes" had the automatic reviewer off
 * without choosing it.
 *
 * A person who really switched it off is on the trail: the settings page sends `{ autoReview }` alone,
 * and `setPreferences` writes an `approval.settings_changed` event whose `payload.changed` names it.
 * The audit table is append-only, so that evidence cannot be lost. A row is repaired only when
 * `auto_review` is false AND no such event has ever named `autoReview` for that person. Everything
 * else is left alone, including a row whose trail is missing for any other reason: the repair prefers
 * leaving a reviewer off to switching it on for somebody who chose that.
 *
 * Idempotent: a repaired row is true, so a second run finds nothing. `apply: false` (the default)
 * only counts, and prints no person's id.
 */
export type AutoReviewRepair = { candidates: number; repaired: number };

const NEVER_CHOSEN = sql`
  p.auto_review = false
  AND NOT EXISTS (
    SELECT 1 FROM audit_events e
    WHERE e.event_type = 'approval.settings_changed'
      AND e.target_type = 'approval_settings'
      AND e.target_id = p.owner_user_id
      AND jsonb_exists(e.payload->'changed', 'autoReview')
  )`;

export async function repairAutoReview(
  database: Database,
  options: { apply?: boolean } = {},
): Promise<AutoReviewRepair> {
  if (!options.apply) {
    const rows = await database.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM approval_preferences p WHERE ${NEVER_CHOSEN}`,
    );
    const candidates = Number(rows[0]?.n ?? 0);
    return { candidates, repaired: 0 };
  }
  return database.transaction(async (tx) => {
    const rows = await tx.execute<{ owner_user_id: string }>(sql`
      UPDATE approval_preferences p SET auto_review = true
      WHERE ${NEVER_CHOSEN}
      RETURNING p.owner_user_id`);
    const audit = createAuditStore(tx as unknown as Database);
    for (const row of rows) {
      await recordAuditEvent(audit, {
        eventType: "approval.settings_changed",
        targetType: "approval_settings",
        targetId: row.owner_user_id,
        initiator: { kind: "deployment" },
        payload: {
          repaired: { autoReview: true },
          reason:
            "Automatic review had been left off by a first save, not chosen. Switched back on.",
          layer: "personal",
        },
      });
    }
    return { candidates: rows.length, repaired: rows.length };
  });
}
