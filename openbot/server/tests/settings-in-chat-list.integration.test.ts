/**
 * Settings in chat, the change list and the seven-day limit on Undo (docs/design/settings-in-chat.md, section 8),
 * against a real database and the real route.
 *
 * What is proved here:
 *   - the list holds the person's own changes, newest first, with the Bot and the value before and after, and
 *     says for each whether it is undone and whether Undo would still work;
 *   - a change a later change moved, or the person moved in the app, is listed with no Undo;
 *   - a change is undoable for seven days and no longer: the limit is exact, and the refusal writes nothing;
 *   - the list is for the signed-in person only, and nobody without one gets a list;
 *   - the tool's success result is the change the card is drawn from.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { readSettingChange } from "@openbot/shared/setting-change";
import { createAuditReader, createAuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import { agents, users } from "../src/db/schema";
import { botLifecycle } from "../src/db/schema/lifecycle";
import { callTool, useSettingsTools } from "../src/plugins/builtin-settings";
import {
  createSettingChanges,
  type SettingChanges,
} from "../src/settings-in-chat/changes";
import { createSettingChangeRoutes } from "../src/settings-in-chat/routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `sic-list-${randomUUID()}`;
const bot = `${prefix}-iris`;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const audit = createAuditStore(database);
const reader = createAuditReader(database);
const changes = createSettingChanges({ database, audit, reader });

/** The same service, with a clock some days after the real one: the seven-day limit seen from later. */
function changesAt(clock: () => Date): SettingChanges {
  return createSettingChanges({ database, audit, reader, now: clock });
}

/** A person of this test, with their own rows and no others. */
async function newPerson(): Promise<string> {
  const id = `${prefix}-${randomUUID()}`;
  await database.insert(users).values({ id, email: `${id}@example.test` });
  return id;
}

/** Puts the level in place without a change, so each test starts from a known value. */
async function setNotify(
  person: string,
  level: "all" | "needs_input" | "none",
) {
  await database
    .insert(botLifecycle)
    .values({ ownerUserId: person, agentId: bot, notify: level })
    .onConflictDoUpdate({
      target: [botLifecycle.ownerUserId, botLifecycle.agentId],
      set: { notify: level },
    });
}

/** The level the database holds for this person and this member. */
async function notifyNow(person: string): Promise<string | null> {
  const [row] = await database
    .select({ notify: botLifecycle.notify })
    .from(botLifecycle)
    .where(
      and(eq(botLifecycle.ownerUserId, person), eq(botLifecycle.agentId, bot)),
    )
    .limit(1);
  return row?.notify ?? null;
}

/** How many undo events the trail holds for one change. */
async function undoEventsFor(changeId: string): Promise<number> {
  const { events } = await reader.list({
    eventType: "configuration.changed",
    targetType: "bot_setting_undo",
    targetId: changeId,
    limit: 5,
  });
  return events.length;
}

/**
 * The real routes as a person (or as nobody). The person is set the way the server's own guard sets it, so the
 * list and the Undo are answered for that person's id alone.
 */
function routesFor(service: SettingChanges, person: string | null) {
  return createSettingChangeRoutes(service, async (context, next) => {
    if (person === null) return context.json({ error: "Sign in first." }, 401);
    context.set("actor", {
      id: person,
      email: `${person}@example.test`,
    } as never);
    await next();
  });
}

type ListedChange = {
  changeId: string;
  agentId: string;
  setting: string;
  previousValue: string;
  newValue: string;
  at: string;
  undone: boolean;
  undoable: boolean;
};

async function listFor(
  person: string,
  service = changes,
): Promise<ListedChange[]> {
  const response = await routesFor(service, person).request("/");
  expect(response.status).toBe(200);
  const body = (await response.json()) as { changes: ListedChange[] };
  return body.changes;
}

async function undoFor(person: string, changeId: string, service = changes) {
  const response = await routesFor(service, person).request(
    `/${changeId}/undo`,
    { method: "POST" },
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

/** One change of the person's, made through the service, which the test can then read back. */
async function changeOf(
  person: string,
  from: "all" | "needs_input",
  to: "all" | "needs_input",
) {
  await setNotify(person, from);
  const outcome = await changes.change({
    ownerUserId: person,
    agentId: bot,
    setting: "notifications",
    value: to,
  });
  if (outcome.status !== "changed") throw new Error("expected a change");
  return outcome.changeId;
}

beforeAll(async () => {
  await database.insert(agents).values({
    id: bot,
    name: "List test member",
    type: "built_in",
    configuration: {},
  });
});

afterAll(async () => {
  await database.delete(botLifecycle).where(eq(botLifecycle.agentId, bot));
  useSettingsTools(null);
  await database.$client.close();
});

describe("the change list: the person's own changes", () => {
  test("lists them newest first, with the Bot, the value before and after, and what Undo still does", async () => {
    const person = await newPerson();
    await setNotify(person, "all");
    const first = await changes.change({
      ownerUserId: person,
      agentId: bot,
      setting: "notifications",
      value: "needs_input",
    });
    const second = await changes.change({
      ownerUserId: person,
      agentId: bot,
      setting: "notifications",
      value: "all",
    });
    if (first.status !== "changed" || second.status !== "changed")
      throw new Error("expected two changes");

    const listed = await listFor(person);

    expect(listed.map((row) => row.changeId)).toEqual([
      second.changeId,
      first.changeId,
    ]);
    // The newer change is the one that set the value now, so Undo still works on it.
    expect(listed[0]).toMatchObject({
      agentId: bot,
      setting: "notifications",
      previousValue: "needs_input",
      newValue: "all",
      undone: false,
      undoable: true,
    });
    // The older one was moved on by the newer, so its Undo would refuse: the list shows none.
    expect(listed[1]).toMatchObject({
      previousValue: "all",
      newValue: "needs_input",
      undone: false,
      undoable: false,
    });
    expect(Number.isNaN(Date.parse(listed[0]?.at ?? ""))).toBeFalse();
  });

  test("an undone change is listed as undone, and has no Undo", async () => {
    const person = await newPerson();
    const changeId = await changeOf(person, "all", "needs_input");
    expect((await undoFor(person, changeId)).status).toBe(200);

    const [row] = await listFor(person);
    expect(row).toMatchObject({ changeId, undone: true, undoable: false });
  });

  test("a change the person moved in the app is listed with no Undo", async () => {
    const person = await newPerson();
    await changeOf(person, "all", "needs_input");
    await setNotify(person, "none");

    const [row] = await listFor(person);
    expect(row).toMatchObject({ undone: false, undoable: false });
  });

  test("the list holds at most twenty changes, the newest", async () => {
    const person = await newPerson();
    await setNotify(person, "all");
    const made: string[] = [];
    for (let index = 0; index < 21; index += 1) {
      const outcome = await changes.change({
        ownerUserId: person,
        agentId: bot,
        setting: "notifications",
        value: index % 2 === 0 ? "needs_input" : "all",
      });
      if (outcome.status !== "changed") throw new Error("expected a change");
      made.push(outcome.changeId);
    }
    const listed = await listFor(person);
    expect(listed).toHaveLength(20);
    expect(listed[0]?.changeId).toBe(made[20]);
    expect(listed.map((row) => row.changeId)).not.toContain(made[0]);
  });

  test("another person gets none of these changes, and cannot undo them", async () => {
    const alice = await newPerson();
    const bob = await newPerson();
    const changeId = await changeOf(alice, "all", "needs_input");

    expect(await listFor(bob)).toEqual([]);
    const refused = await undoFor(bob, changeId);
    expect(refused.status).toBe(404);
    expect(await notifyNow(alice)).toBe("needs_input");
  });

  test("with nobody signed in there is no list at all", async () => {
    const response = await routesFor(changes, null).request("/");
    expect(response.status).toBe(401);
  });

  test("the list is served at the path the app reads it from", async () => {
    const person = await newPerson();
    const changeId = await changeOf(person, "all", "needs_input");
    const app = new Hono();
    app.route("/api/settings-changes", routesFor(changes, person));

    const response = await app.request("/api/settings-changes");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { changes: ListedChange[] };
    expect(body.changes.map((row) => row.changeId)).toEqual([changeId]);
  });
});

describe("the seven-day limit on Undo", () => {
  test("a change older than seven days is listed with no Undo, and its Undo is refused in plain words", async () => {
    const person = await newPerson();
    const changeId = await changeOf(person, "all", "needs_input");
    const [created] = await listFor(person);
    const createdAt = Date.parse(created?.at ?? "");
    const later = changesAt(() => new Date(createdAt + 7 * DAY_MS + MINUTE_MS));

    const [row] = await listFor(person, later);
    expect(row).toMatchObject({ changeId, undone: false, undoable: false });

    const refused = await undoFor(person, changeId, later);
    expect(refused.status).toBe(409);
    expect(String(refused.body.error)).toContain("more than seven days old");
    expect(String(refused.body.error)).toContain("Bot's own page");
    expect(await notifyNow(person)).toBe("needs_input");
    expect(await undoEventsFor(changeId)).toBe(0);
  });

  test("the limit is exact: a change six days and twenty-three hours old can be undone, one at seven days and a minute cannot", async () => {
    const within = await newPerson();
    const withinChange = await changeOf(within, "all", "needs_input");
    const [withinRow] = await listFor(within);
    const withinAt = Date.parse(withinRow?.at ?? "");
    const justInside = changesAt(
      () => new Date(withinAt + 7 * DAY_MS - MINUTE_MS),
    );
    const undone = await undoFor(within, withinChange, justInside);
    expect(undone.status).toBe(200);
    expect(await notifyNow(within)).toBe("all");

    const beyond = await newPerson();
    const beyondChange = await changeOf(beyond, "all", "needs_input");
    const [beyondRow] = await listFor(beyond);
    const beyondAt = Date.parse(beyondRow?.at ?? "");
    const justOutside = changesAt(
      () => new Date(beyondAt + 7 * DAY_MS + MINUTE_MS),
    );
    const refused = await undoFor(beyond, beyondChange, justOutside);
    expect(refused.status).toBe(409);
    expect(await notifyNow(beyond)).toBe("needs_input");
  });

  test("a change inside the seven days is listed as undoable, and its Undo still restores the value", async () => {
    const person = await newPerson();
    const changeId = await changeOf(person, "all", "needs_input");
    const [row] = await listFor(person);
    expect(row).toMatchObject({ changeId, undoable: true });

    const undone = await undoFor(person, changeId);
    expect(undone.status).toBe(200);
    expect(undone.body.value).toBe("all");
    expect(await notifyNow(person)).toBe("all");
  });
});

describe("the tool's success result is the change the card is drawn from", () => {
  test("it reads back as the change, the Bot and the two values, and the list holds the same change id", async () => {
    const person = await newPerson();
    await setNotify(person, "all");
    useSettingsTools(changes);
    const result = await callTool(
      { url: "", actorId: person, botId: bot },
      "change_setting",
      { setting: "notifications", value: "needs_input" },
    );
    expect(result.isError).toBeFalse();

    const [listed] = await listFor(person);
    expect(readSettingChange(result.text)).toEqual({
      changeId: listed?.changeId ?? "",
      agentId: bot,
      setting: "notifications",
      previousValue: "all",
      newValue: "needs_input",
    });
  });

  test("a refusal is a plain sentence and records no change, so it draws no card and lists nothing", async () => {
    const person = await newPerson();
    await setNotify(person, "none");
    useSettingsTools(changes);
    const result = await callTool(
      { url: "", actorId: person, botId: bot },
      "change_setting",
      { setting: "notifications", value: "all" },
    );
    expect(result.isError).toBeTrue();
    expect(readSettingChange(result.text)).toBeNull();
    expect(await listFor(person)).toEqual([]);
  });
});
