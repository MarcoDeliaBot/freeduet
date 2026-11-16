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
 * Two things can hide that event, and the repair copes with the first and refuses the second:
 *  - Adoption of the single-user data moves the row to the new owner but the event keeps the old id
 *    (`freeduet/adopt/registry.ts`); the adoption writes `person.single_user_data_adopted` with
 *    `payload.fromId`, and an event on that old id counts as this owner's.
 *  - The audit trail is NOT kept for ever when `AUDIT_RETENTION_DAYS` is set: the hourly sweep deletes
 *    old events, and a choice made before the window is then invisible. With retention on, `apply`
 *    is refused (there is no override); the dry run still counts.
 * A row is repaired only when `auto_review` is false AND no event, on the person's own id or on an id
 * they were adopted from, ever named `autoReview`. The repair prefers leaving a reviewer off to
 * switching it on for somebody who chose that.
 *
 * Idempotent: a repaired row is true, so a second run finds nothing. Dry run by default, and it prints
 * no person's id. `apply` also needs `expect`, the count of the dry run: if the count is not that,
 * nothing changes.
 */
export type AutoReviewRepair = {
  candidates: number;
  repaired: number;
  /** Why `apply` did nothing, when it did not. */
  refused?: "retention" | "expected-count";
};

const NEVER_CHOSEN = sql`
  p.auto_review = false
  AND NOT EXISTS (
    SELECT 1 FROM audit_events e
    WHERE e.event_type = 'approval.settings_changed'
      AND e.target_type = 'approval_settings'
      AND jsonb_exists(e.payload->'changed', 'autoReview')
      AND (
        e.target_id = p.owner_user_id
        OR EXISTS (
          SELECT 1 FROM audit_events a
          WHERE a.event_type = 'person.single_user_data_adopted'
            AND a.target_id = p.owner_user_id
            AND a.payload->>'fromId' = e.target_id
        )
      )
  )`;

export async function repairAutoReview(
  database: Database,
  options: {
    apply?: boolean;
    /** The audit retention setting, as the deployment has it. Set means the trail is trimmed. */
    retentionDays?: number | string | undefined;
    /** The dry run's count; `apply` changes nothing unless the count is still this. */
    expect?: number | undefined;
  } = {},
): Promise<AutoReviewRepair> {
  const retained =
    options.retentionDays !== undefined &&
    `${options.retentionDays}`.trim() !== "";
  if (!options.apply || retained) {
    const rows = await database.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM approval_preferences p WHERE ${NEVER_CHOSEN}`,
    );
    const candidates = Number(rows[0]?.n ?? 0);
    return {
      candidates,
      repaired: 0,
      ...(options.apply ? { refused: "retention" as const } : {}),
    };
  }
  return database.transaction(async (tx) => {
    const counted = await tx.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM approval_preferences p WHERE ${NEVER_CHOSEN}`,
    );
    const candidates = Number(counted[0]?.n ?? 0);
    if (options.expect !== candidates)
      return { candidates, repaired: 0, refused: "expected-count" as const };
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
