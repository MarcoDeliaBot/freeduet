# The automatic reviewer stays on until a person switches it off

## What went wrong

`DEFAULT_PREFERENCES` (`openbot/server/src/approvals/store.ts`) says a person with no saved preferences has
the automatic reviewer on (`autoReview: true`), "Ask before making changes" off, host commands "ask". That
applies only while the person has no row in `approval_preferences`.

`setEnabled` created the row with `{ ownerUserId, enabled }` only, so `auto_review` took the database default,
`false` (migration 0049). The settings page's "Ask before making changes" switch goes through
`service.setPreferences`, which calls `setEnabled` first. After the first save of that one switch the row existed
with the reviewer off, and `preferences()` returned the row. The person never touched the Auto-review switch.

Effect (`approvals/policy.ts`, end of `decide`): with the reviewer off and "ask before every change" off, a write
that no rule covers and no always-ask path catches is allowed with source `default`, so the reviewer never runs.
That contradicts the promise that sends, signatures, bookings and deletions are checked by default.

Migration 0049 added `auto_review` to rows that already existed with `DEFAULT false`, so every person who had saved
"Ask before making changes" before it is in the same state.

## Other setters, checked

| Setter | First insert | Verdict |
|---|---|---|
| `setEnabled` (store, and the legacy route when there is no policy store) | `{ ownerUserId, enabled }` only | Bug, fixed |
| `policy.setPreferences` (auto-review switch, host commands) | Merges the input over `preferences()` (code defaults) and writes all three columns | Correct, guarded by a test |
| `policy.setTeamSettings` | Merges over `teamSettings()` (`DEFAULT_TEAM`); DB defaults equal `DEFAULT_TEAM` (false, true, allow) | Correct, guarded by a test |

## The fix

- `setEnabled` writes `DEFAULT_PREFERENCES` for what it did not set on the first insert; the update changes only `enabled`.
- Migration `0075_approval_auto_review_default` sets the column default to `true`. It is additive and rewrites no row.
  Reason: the code default alone leaves the next raw insert, or the next new setter, one forgotten column away from the
  same bug; the database and the product should say the same thing.

## Rows already created

Nothing on the row tells a mistake from a choice (`approval_preferences` has no timestamps). The trail does: the
settings page sends `{ autoReview }` alone, and `setPreferences` writes an `approval.settings_changed` event whose
`payload.changed` names `autoReview`. The audit table is append-only, but it is not kept for ever: with `AUDIT_RETENTION_DAYS` set the hourly sweep deletes old events. A row with `auto_review = false` and no such
event for that person was never switched off by them.

`repairAutoReview` (`approvals/repair-auto-review.ts`, run by `scripts/repair-auto-review.ts`) turns the reviewer on
for exactly those rows and writes one `approval.settings_changed` event each (initiator `deployment`,
`payload.repaired`). Idempotent. It prints counts only, and first the database host and name (never the password).

- Dry run by default. `--apply` needs `--expect N`, the count the dry run printed; any other count changes nothing.
- With `AUDIT_RETENTION_DAYS` set, `--apply` is refused with no override: a choice made before the window would have
  no event left and the person would be flipped. The dry run still counts and says why apply is refused.
- Single-user adoption moves the preference rows to the new owner while events keep the old id
  (`freeduet/adopt/registry.ts`). The adoption writes `person.single_user_data_adopted` (target = new id,
  `payload.fromId`); an event naming `autoReview` on that `fromId` counts as the new owner's choice.

It is not run automatically: it makes the product stricter for existing people, so the maintainer chooses when.

**What a person sees after the repair.** In their own live turn, a write that no rule covers is now checked by the
reviewer: one more model call per such write, and more cards when the reviewer cannot tell or finds the write
consequential. Routines and check-ins are unchanged (they always ask, D35), and mail rules applied by the server timer
are unaffected. They can switch Auto-review off again in Settings.

Read-only count of affected rows (no personal data; ignores the adoption case, the script counts it):

```sql
SELECT count(*) FROM approval_preferences p
WHERE p.auto_review = false
  AND NOT EXISTS (
    SELECT 1 FROM audit_events e
    WHERE e.event_type = 'approval.settings_changed'
      AND e.target_type = 'approval_settings'
      AND e.target_id = p.owner_user_id
      AND jsonb_exists(e.payload->'changed', 'autoReview'));
```

Limits of the signal: a row whose trail was lost some other way (a database restored without the audit table) is read as
"never chosen" and would be turned on. A person who switched it off by a direct SQL edit is read the same way.

## Built so far

- Fix, migration, repair module and script, tests (`approvals-preference-defaults.integration.test.ts`,
  `approvals-repair-auto-review.integration.test.ts`).
- Not built: a notice in the Settings page. The Auto-review switch already shows its real state; with the repair
  available a notice is not needed for the maintainer's own installation.
- Not verified: the repair against a copy of a real installation's data; the reviewer's behaviour with a real model.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| When to run the repair | Run `--apply --expect N` by hand once per installation after the dry run; from the release step; never | By hand, after a dry run that prints the count | It switches on a check people may have grown used to being without; counts only; the person can switch it off in Settings. Refused when audit retention is on |
| Treat a row with no trail as "never chosen" | Yes (as built); no, leave every existing row | Yes | The trail records every click of the real switch; the only misreads need a lost trail or a raw SQL edit |
