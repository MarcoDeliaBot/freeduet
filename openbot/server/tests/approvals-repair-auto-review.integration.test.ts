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
const names = [
  "bugged",
  "chosen",
  "busy",
  "healthy",
  "late",
  "adc",
  "adb",
  "ret",
].map((name) => `${prefix}-${name}`);
const all = names;
const [
  bugged,
  chosen,
  chosenThenBusy,
  healthy,
  lateChoice,
  adoptedChose,
  adoptedBugged,
  retained,
] = names as [string, string, string, string, string, string, string, string];
const oldChose = `${prefix}-old-chose`;
const oldBugged = `${prefix}-old-bugged`;
/** What a repair run needs: the dry run's own count, as the script asks for. */
const apply = async () =>
  repairAutoReview(database, {
    apply: true,
    expect: (await repairAutoReview(database)).candidates,
  });
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
    { ownerUserId: adoptedChose, enabled: true, autoReview: false },
    { ownerUserId: adoptedBugged, enabled: true, autoReview: false },
    { ownerUserId: retained, enabled: true, autoReview: false },
  ]);
  // Adoption moved the rows to a new owner; the events kept the old id (registry.ts). One person had
  // switched it off before, the other had not.
  const settings = (targetId: string, changed: Record<string, unknown>) => ({
    eventType: "approval.settings_changed",
    targetType: "approval_settings",
    targetId,
    actorUserId: targetId,
    payload: { changed, layer: "personal" },
  });
  const adopted = (toId: string, fromId: string) => ({
    eventType: "person.single_user_data_adopted",
    targetType: "person",
    targetId: toId,
    actorUserId: toId,
    payload: { fromId, toId },
  });
  await database
    .insert(auditEvents)
    .values([
      settings(oldChose, { autoReview: false }),
      settings(oldBugged, { enabled: true }),
      adopted(adoptedChose, oldChose),
      adopted(adoptedBugged, oldBugged),
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

test("with audit retention on, apply is refused and changes nothing, and the dry run still counts", async () => {
  const dry = await repairAutoReview(database, { retentionDays: 30 });
  expect(dry.candidates).toBeGreaterThanOrEqual(0);
  expect(dry.refused).toBeUndefined();
  const refused = await repairAutoReview(database, {
    apply: true,
    retentionDays: "30",
    expect: dry.candidates,
  });
  expect(refused).toMatchObject({ repaired: 0, refused: "retention" });
  expect(await flag(retained)).toBeFalse();
  expect(await trail(retained)).toHaveLength(0);
});

test("apply changes nothing when the count is not the one the dry run gave", async () => {
  const dry = await repairAutoReview(database);
  for (const wrong of [dry.candidates + 1, undefined]) {
    const result = await repairAutoReview(database, {
      apply: true,
      expect: wrong,
    });
    expect(result).toMatchObject({ repaired: 0, refused: "expected-count" });
  }
  expect(await flag(retained)).toBeFalse();
});

test("the repair turns the reviewer on only for a row nobody ever switched off, and says so on the trail", async () => {
  expect(await flag(bugged)).toBeFalse();
  const result = await apply();
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
  await apply();
  expect(await trail(bugged)).toHaveLength(1);
  expect(await flag(bugged)).toBeTrue();
  expect(await flag(chosen)).toBeFalse();
});

test("a person who switched it off before the single-user adoption is not repaired after it; one who never did is", async () => {
  await apply();
  expect(await flag(adoptedChose)).toBeFalse();
  expect(await flag(adoptedBugged)).toBeTrue();
});
