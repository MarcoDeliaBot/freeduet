import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type {
  ApprovalCandidate,
  ApprovalPreferences,
} from "../src/approvals/types";
import { createDatabase } from "../src/db/client";
import {
  approvalPreferences,
  approvalTeamSettings,
} from "../src/db/schema/approvals";
import { users } from "../src/db/schema/core";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * A person's first save of ANY approval preference must leave every other preference at the product
 * default, not at the database column default. `auto_review` is `false` in the database (migration
 * 0049 added it that way) and `true` in the product (`DEFAULT_PREFERENCES`): the first time somebody
 * saved "Ask before making changes", a row was created with the reviewer off, and a write that no rule
 * covers then ran with no check at all. Nobody had chosen that.
 */
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `prefdef-${randomUUID()}`;
const admin = `${prefix}-admin`;
const people = Array.from({ length: 7 }, (_, index) => `${prefix}-p${index}`);
const store = createApprovalStore(database);
const service = createApprovalService(store);
let priorTeam: typeof approvalTeamSettings.$inferSelect | undefined;

beforeAll(async () => {
  await database
    .insert(users)
    .values(
      [admin, ...people].map((id) => ({ id, email: `${id}@example.test` })),
    );
  [priorTeam] = await database
    .select()
    .from(approvalTeamSettings)
    .where(eq(approvalTeamSettings.id, "team"));
  await database
    .delete(approvalTeamSettings)
    .where(eq(approvalTeamSettings.id, "team"));
});
afterAll(async () => {
  await database
    .delete(approvalTeamSettings)
    .where(eq(approvalTeamSettings.id, "team"));
  if (priorTeam) await database.insert(approvalTeamSettings).values(priorTeam);
  await database.delete(users).where(inArray(users.id, [admin, ...people]));
  await database.$client.close();
});

const DEFAULTS: ApprovalPreferences = {
  enabled: false,
  autoReview: true,
  hostCommands: "ask",
};
const rowOf = async (owner: string) =>
  (
    await database
      .select()
      .from(approvalPreferences)
      .where(eq(approvalPreferences.ownerUserId, owner))
  )[0];

function write(owner: string): ApprovalCandidate {
  const toolCallId = randomUUID();
  return {
    actorId: owner,
    botId: `${prefix}-bot`,
    toolRef: "mcp/gmail/send_email",
    effect: "write",
    scope: "gmail",
    args: { to: "sam@example.com" },
    // The person's own live turn, so no routine floor stands in front of the reviewer.
    continuation: {
      runId: randomUUID(),
      threadId: `${prefix}-thread-${toolCallId}`,
      toolCallId,
      toolName: "mcp/gmail/send_email",
      args: { to: "sam@example.com" },
      messages: [],
      state: {},
      context: [],
      forwardedProps: {},
    },
  };
}
const asks = (promise: Promise<unknown>) =>
  promise.then(
    () => false,
    (error: unknown) => error instanceof HeadlessToolSuspension,
  );

test("saving 'Ask before making changes' on and off leaves the reviewer on and host commands asking", async () => {
  const [owner] = people;
  if (!owner) throw new Error("fixture");
  await service.setPreferences(owner, { enabled: true });
  await service.setPreferences(owner, { enabled: false });
  expect(await store.policy?.preferences(owner)).toEqual(DEFAULTS);
  expect(await rowOf(owner)).toMatchObject({
    enabled: false,
    autoReview: true,
    hostCommands: "ask",
  });
});

test("after that sequence a write no rule covers is still reviewed (no reviewer model here, so it asks)", async () => {
  const owner = people[5];
  if (!owner) throw new Error("fixture");
  await service.setPreferences(owner, { enabled: true });
  await service.setPreferences(owner, { enabled: false });
  // Before the fix the same write ran with source "default" and nobody was asked.
  expect(await asks(service.gate(write(owner)))).toBeTrue();
});

test("the store's own switch (the route used when there is no policy store) writes the product defaults too", async () => {
  const owner = people[1];
  if (!owner) throw new Error("fixture");
  await store.setEnabled(owner, true);
  expect(await rowOf(owner)).toMatchObject({
    enabled: true,
    autoReview: true,
    hostCommands: "ask",
  });
  await store.setEnabled(owner, false);
  expect(await rowOf(owner)).toMatchObject({
    enabled: false,
    autoReview: true,
  });
});

test("every first save, whichever preference it is, leaves the others at their defaults", async () => {
  const [, , a, b] = people;
  if (!a || !b) throw new Error("fixture");
  await service.setPreferences(a, { hostCommands: "never" });
  expect(await store.policy?.preferences(a)).toEqual({
    ...DEFAULTS,
    hostCommands: "never",
  });
  await service.setPreferences(b, { autoReview: false });
  expect(await store.policy?.preferences(b)).toEqual({
    ...DEFAULTS,
    autoReview: false,
  });
});

test("a person who switched the reviewer off on purpose keeps it off through later saves", async () => {
  const owner = people[4];
  if (!owner) throw new Error("fixture");
  await service.setPreferences(owner, { autoReview: false });
  await service.setPreferences(owner, { enabled: true });
  await service.setPreferences(owner, { enabled: false });
  await store.setEnabled(owner, true);
  expect(await rowOf(owner)).toMatchObject({ autoReview: false });
});

test("the team settings' first save keeps the defaults of the fields it did not set", async () => {
  await service.setTeamSettings(admin, { hostCommandsCap: "ask" });
  expect(await store.policy?.teamSettings()).toEqual({
    enforceAutoReview: false,
    customRulesEnabled: true,
    hostCommandsCap: "ask",
  });
  await database
    .delete(approvalTeamSettings)
    .where(eq(approvalTeamSettings.id, "team"));
  await service.setTeamSettings(admin, { enforceAutoReview: true });
  expect(await store.policy?.teamSettings()).toEqual({
    enforceAutoReview: true,
    customRulesEnabled: true,
    hostCommandsCap: "allow",
  });
});

test("a row inserted without naming auto_review gets the product default from the database too (migration 0075)", async () => {
  const owner = people[6];
  if (!owner) throw new Error("fixture");
  await database.insert(approvalPreferences).values({ ownerUserId: owner });
  expect(await rowOf(owner)).toMatchObject({ autoReview: true });
});
