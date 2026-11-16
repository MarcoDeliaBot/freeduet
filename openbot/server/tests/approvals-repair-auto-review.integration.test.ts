import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createApprovalService } from "../src/approvals/service";
import { repairAutoReview } from "../src/approvals/repair-auto-review";
import { createApprovalStore } from "../src/approvals/store";
import { auditEvents, users } from "../src/db/schema/core";
import { createDatabase } from "../src/db/client";
import { approvalPreferences } from "../src/db/schema/approvals";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The one-time repair for rows made by the first-save bug: automatic review off, and nothing on the
 * trail showing the person ever switched it. It must turn on only those rows.
 */
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `repair-${randomUUID()}`;
const [bugged, chosen, chosenThenBusy, healthy, lateChoice] = [
  "bugged",
  "chosen",
  "busy",
  "healthy",
  "late",
].map((name) => `${prefix}-${name}`) as [
  string,
  string,
  string,
  string,
  string,
];
const all = [bugged, chosen, chosenThenBusy, healthy, lateChoice];
const service = createApprovalService(createApprovalStore(database));

const flag = async (owner: string) =>
  (
    await database
      .select({ autoReview: approvalPreferences.autoReview })
      .from(approvalPreferences)
      .where(eq(approvalPreferences.ownerUserId, owner))
  )[0]?.autoReview;
const trail = (owner: string) =>
  database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.targetId, owner),
        eq(auditEvents.eventType, "approval.settings_changed"),
      ),
    );

beforeAll(async () => {
  await database
    .insert(users)
    .values(all.map((id) => ({ id, email: `${id}@example.test` })));
  // Rows as the old code and migration 0049 left them: no audit event, reviewer off.
  await database.insert(approvalPreferences).values([
    { ownerUserId: bugged, enabled: true, autoReview: false },
    { ownerUserId: healthy, enabled: true, autoReview: true },
  ]);
  // A person who really switched it off (the settings page sends { autoReview } alone), then used
  // other switches, which never name autoReview.
  await service.setPreferences(chosen, { autoReview: false });
  await service.setPreferences(chosenThenBusy, { autoReview: false });
  await service.setPreferences(chosenThenBusy, { enabled: true });
  await service.setPreferences(chosenThenBusy, { hostCommands: "never" });
  // Off on purpose, then on, then off again: the last word is theirs, whatever it was.
  await service.setPreferences(lateChoice, { autoReview: true });
  await service.setPreferences(lateChoice, { autoReview: false });
});
afterAll(async () => {
  await database.delete(users).where(inArray(users.id, all));
  await database.$client.close();
});

test("a dry run counts the rows it would change and writes nothing", async () => {
  const before = await Promise.all(all.map(flag));
  const result = await repairAutoReview(database);
  expect(result.repaired).toBe(0);
  expect(result.candidates).toBeGreaterThanOrEqual(1);
  expect(await Promise.all(all.map(flag))).toEqual(before);
  expect(await trail(bugged)).toHaveLength(0);
});

test("the repair turns the reviewer on only for a row nobody ever switched off, and says so on the trail", async () => {
  expect(await flag(bugged)).toBeFalse();
  const result = await repairAutoReview(database, { apply: true });
  expect(result.repaired).toBeGreaterThanOrEqual(1);
  expect(await flag(bugged)).toBeTrue();
  // Chosen off, or off after later saves: untouched.
  expect(await flag(chosen)).toBeFalse();
  expect(await flag(chosenThenBusy)).toBeFalse();
  expect(await flag(lateChoice)).toBeFalse();
  expect(await flag(healthy)).toBeTrue();
  const events = await trail(bugged);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    initiatorKind: "deployment",
    payload: expect.objectContaining({ repaired: { autoReview: true } }),
  });
  expect(await trail(chosen)).toHaveLength(1);
});

test("running it again changes nothing", async () => {
  await repairAutoReview(database, { apply: true });
  expect(await trail(bugged)).toHaveLength(1);
  expect(await flag(bugged)).toBeTrue();
  expect(await flag(chosen)).toBeFalse();
});
