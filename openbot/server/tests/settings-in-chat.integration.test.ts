/**
 * Settings in chat, slice 1 (docs/design/settings-in-chat.md), through the real approval service, a real
 * database, the real change tool and the real Undo route.
 *
 * What is proved here:
 *   - a change to an allow-listed setting asks a card first, with Full access on or off, and writes
 *     nothing until the card is answered;
 *   - a setting that is not on the list cannot be changed through the tool, whatever the gate said;
 *   - each change records the old and the new value, and Undo puts back exactly the old value;
 *   - Undo is refused after a later change, after a first Undo, and for anybody but the person.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type { ApprovalCandidate } from "../src/approvals/types";
import { createAuditReader, createAuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import { agents, users } from "../src/db/schema";
import { botLifecycle } from "../src/db/schema/lifecycle";
import { createFullAccess } from "../src/freeduet/full-access";
import { callTool, useSettingsTools } from "../src/plugins/builtin-settings";
import { NOT_ON_THE_LIST } from "../src/settings-in-chat/allow-list";
import { createSettingChangeRoutes } from "../src/settings-in-chat/routes";
import {
  createSettingChanges,
  SettingRefusedError,
} from "../src/settings-in-chat/changes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `sic-${randomUUID()}`;
/** The person whose settings these are. */
const alice = `${prefix}-alice`;
/** Another person, who must not be able to undo Alice's changes. */
const bob = `${prefix}-bob`;
/** The member that asks for the change. */
const bot = `${prefix}-iris`;
const people = [alice, bob];

const audit = createAuditStore(database);
const reader = createAuditReader(database);
const changes = createSettingChanges({ database, audit, reader });
const store = createApprovalStore(database);
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  handedRequest: async () => null,
  audit,
});
const service = createApprovalService(store, undefined, undefined, {
  fullAccess,
});

/** The real gate's answer, and the one card it opened, if it opened one. */
async function gatedOutcome(c: ApprovalCandidate): Promise<string> {
  const paused = await service.gate(c).then(
    () => false,
    (error: unknown) => {
      if (error instanceof HeadlessToolSuspension) return true;
      throw error;
    },
  );
  const requests = (await store.list(c.actorId)).filter(
    (row) => row.action.toolCallId === c.continuation?.toolCallId,
  );
  if (!paused) return requests.length === 0 ? "went through" : "went+card";
  const [request] = requests;
  return requests.length === 1
    ? `${request?.action.policy?.behaviour}/${request?.action.policy?.source}`
    : `${requests.length} cards`;
}

/** A call to the Settings connector, as the plugin store makes it: a write the gate must judge. */
function settingCall(args: Record<string, unknown>): ApprovalCandidate {
  const toolCallId = randomUUID();
  return {
    actorId: alice,
    botId: bot,
    toolRef: "settings/change_setting",
    effect: "write",
    scope: "settings",
    args,
    changesSetting: true,
    continuation: {
      runId: randomUUID(),
      threadId: `${prefix}-thread-${toolCallId}`,
      toolCallId,
      toolName: "settings/change_setting",
      args,
      messages: [],
      state: {},
      context: [],
      forwardedProps: { openbotRun: "signed-assertion" },
    },
  };
}

/** The notification level the database holds for Alice and this member, or null without a row. */
async function notifyNow(): Promise<string | null> {
  const [row] = await database
    .select({ notify: botLifecycle.notify })
    .from(botLifecycle)
    .where(
      and(eq(botLifecycle.ownerUserId, alice), eq(botLifecycle.agentId, bot)),
    )
    .limit(1);
  return row?.notify ?? null;
}

/** Puts the level in place without a change, so each test starts from a known value. */
async function setNotify(level: "all" | "needs_input" | "none") {
  await database
    .insert(botLifecycle)
    .values({ ownerUserId: alice, agentId: bot, notify: level })
    .onConflictDoUpdate({
      target: [botLifecycle.ownerUserId, botLifecycle.agentId],
      set: { notify: level },
    });
}

/** How many setting-change events the trail holds for a person. */
async function settingEventsFor(person: string) {
  const { events } = await reader.list({
    eventType: "configuration.changed",
    targetType: "bot_setting",
    actorUserId: person,
    limit: 500,
  });
  return events.length;
}

/** Undo through the real route, as a person with the given id. */
async function undoAs(person: string, changeId: string) {
  const routes = createSettingChangeRoutes(changes, async (context, next) => {
    context.set("actor", {
      id: person,
      email: `${person}@example.test`,
    } as never);
    await next();
  });
  const response = await routes.request(`/${changeId}/undo`, {
    method: "POST",
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

beforeAll(async () => {
  await database
    .insert(users)
    .values(people.map((id) => ({ id, email: `${id}@example.test` })));
  await database.insert(agents).values({
    id: bot,
    name: "Settings test member",
    type: "built_in",
    configuration: {},
  });
  await service.setPreferences(alice, { enabled: false, autoReview: false });
  await service.setPreferences(bob, { enabled: false, autoReview: false });
});

afterEach(async () => {
  await fullAccess.set(alice, bot, false);
  useSettingsTools(null);
});

afterAll(async () => {
  await database.delete(botLifecycle).where(eq(botLifecycle.agentId, bot));
  useSettingsTools(null);
  await database.$client.close();
});

describe("a change to an allow-listed setting: the record and the Undo", () => {
  test("a change writes the new value and records the old and the new one", async () => {
    await setNotify("all");
    const before = await settingEventsFor(alice);
    const outcome = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    expect(outcome.status).toBe("changed");
    if (outcome.status !== "changed") return;
    expect(outcome.previousValue).toBe("all");
    expect(outcome.newValue).toBe("needs_input");
    expect(await notifyNow()).toBe("needs_input");

    const { events } = await reader.list({
      eventType: "configuration.changed",
      targetType: "bot_setting",
      targetId: outcome.changeId,
      actorUserId: alice,
      limit: 5,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.previousValue).toBe("all");
    expect(events[0]?.payload.newValue).toBe("needs_input");
    expect(events[0]?.payload.agentId).toBe(bot);
    expect(await settingEventsFor(alice)).toBe(before + 1);
  });

  test("a change to none is refused, writes nothing and records nothing", async () => {
    await setNotify("none");
    const before = await settingEventsFor(alice);
    await expect(
      changes.change({
        ownerUserId: alice,
        agentId: bot,
        setting: "notifications",
        value: "all",
      }),
    ).rejects.toBeInstanceOf(SettingRefusedError);
    expect(await notifyNow()).toBe("none");
    expect(await settingEventsFor(alice)).toBe(before);
  });

  test("Undo restores the exact previous value, here all", async () => {
    await setNotify("all");
    const outcome = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    const undone = await changes.undo({
      ownerUserId: alice,
      changeId: outcome.changeId,
    });
    expect(undone.value).toBe("all");
    expect(await notifyNow()).toBe("all");
  });

  test("Undo restores the exact previous value, here needs_input", async () => {
    await setNotify("needs_input");
    const outcome = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "all",
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    await changes.undo({ ownerUserId: alice, changeId: outcome.changeId });
    expect(await notifyNow()).toBe("needs_input");
  });

  test("a second Undo of the same change is refused", async () => {
    await setNotify("all");
    const outcome = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    await changes.undo({ ownerUserId: alice, changeId: outcome.changeId });
    const again = await undoAs(alice, outcome.changeId);
    expect(again.status).toBe(409);
    expect(String(again.body.error)).toContain("already been undone");
    expect(await notifyNow()).toBe("all");
  });

  test("Undo is refused after a later change, and says what the setting is now", async () => {
    await setNotify("all");
    const first = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    if (first.status !== "changed") throw new Error("expected a change");
    await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "all",
    });
    const undone = await undoAs(alice, first.changeId);
    expect(undone.status).toBe(409);
    expect(String(undone.body.error)).toContain("has changed since");
    expect(String(undone.body.error)).toContain("It is now all");
    expect(await notifyNow()).toBe("all");
  });

  test("another person cannot undo the change, and is told there is no such change of theirs", async () => {
    await setNotify("all");
    const outcome = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    const refused = await undoAs(bob, outcome.changeId);
    expect(refused.status).toBe(404);
    expect(await notifyNow()).toBe("needs_input");
  });
});

describe("through the real gate and the tool: a card every time, and no security setting", () => {
  test("Full access on: a change of notifications asks a card and writes nothing yet", async () => {
    await fullAccess.set(alice, bot, true);
    await setNotify("all");
    const outcome = await gatedOutcome(
      settingCall({ setting: "notifications", value: "needs_input" }),
    );
    expect(outcome).toBe("ask/always_ask");
    expect(await notifyNow()).toBe("all");
  });

  test("Full access off: a change of notifications asks a card as well", async () => {
    await setNotify("all");
    const outcome = await gatedOutcome(
      settingCall({ setting: "notifications", value: "needs_input" }),
    );
    expect(outcome).toBe("ask/always_ask");
    expect(await notifyNow()).toBe("all");
  });

  for (const fullOn of [true, false])
    test(`security settings are never changed, with Full access ${fullOn ? "on" : "off"}`, async () => {
      await fullAccess.set(alice, bot, fullOn);
      await setNotify("all");
      const before = await settingEventsFor(alice);
      for (const setting of [
        "fullAccess",
        "approvals",
        "computer",
        "connections",
        "routines",
        "payments",
      ]) {
        // The gate holds the call to a card, or hands it to the person when a safety word is in it
        // (the "payments" key is one), so nothing runs without the person's answer either way.
        expect(["ask/always_ask", "hand_off/safety"]).toContain(
          await gatedOutcome(settingCall({ setting, value: "full" })),
        );
        // And if the call ran anyway, the tool itself refuses a key that is not on the list.
        useSettingsTools(changes);
        const result = await callTool(
          { url: "", actorId: alice, botId: bot },
          "change_setting",
          { setting, value: "full" },
        );
        expect(result.isError).toBeTrue();
        expect(result.text).toBe(NOT_ON_THE_LIST);
        expect(result.text).toContain("app's settings");
      }
      expect(await notifyNow()).toBe("all");
      expect(await settingEventsFor(alice)).toBe(before);
    });

  test("the tool records a change for an allow-listed setting and tells the model the change id", async () => {
    await setNotify("all");
    useSettingsTools(changes);
    const result = await callTool(
      { url: "", actorId: alice, botId: bot },
      "change_setting",
      { setting: "notifications", value: "needs_input" },
    );
    expect(result.isError).toBeFalse();
    expect(result.text).toContain("needs_input");
    expect(result.text).toContain("all");
    expect(await notifyNow()).toBe("needs_input");
  });

  test("the route answers the person's own Undo with the restored value", async () => {
    await setNotify("all");
    const outcome = await changes.change({
      ownerUserId: alice,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    const undone = await undoAs(alice, outcome.changeId);
    expect(undone.status).toBe(200);
    expect(undone.body.undone).toBeTrue();
    expect(undone.body.value).toBe("all");
    expect(await notifyNow()).toBe("all");
  });
});
