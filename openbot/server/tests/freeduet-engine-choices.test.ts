/**
 * The person's engine choices on the server (docs/design/engines-dashboard.md, docs/ENGINES_PLAN.md slice 7), through a
 * real database and the real audit trail.
 *
 * What is proved here:
 *   - a choice is kept as one small document in `enterprise_settings`, and a new service (a restart) reads it back;
 *   - a change records the member, the value it replaced (null when nothing was chosen) and the value it set, and
 *     Undo puts back exactly the old value, once, and only while the choice is still the one the change set;
 *   - a change whose record cannot be written is taken back, so there is no change the person cannot see or undo;
 *   - a stored document that cannot be read is never written over, and the copy in memory says so;
 *   - only ids and two words go in and out: no other member id, no other mode, no other field;
 *   - changes made together, even by two services over one database, do not lose one another.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  type AuditEventInput,
  type AuditStore,
  createAuditReader,
  createAuditStore,
} from "../src/audit";
import { createDatabase } from "../src/db/client";
import { enterpriseSettings } from "../src/db/schema";
import {
  createEngineChoices,
  ENGINE_CHANGE_TARGET,
  ENGINE_CHOICES_KEY,
  ENGINE_UNDO_TARGET,
  EngineChoiceRefusedError,
  type EngineChoices,
  MAX_MEMBERS,
  readDocument,
} from "../src/freeduet/engine-choices";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `ec-${randomUUID()}`;
/** The administrator whose changes these are. The trail has no foreign key, so no user row is needed. */
const admin = `${prefix}-admin`;

const realAudit = createAuditStore(database);
const reader = createAuditReader(database);

/** The audit store, with a switch that makes it fail, to see what a change does when its record cannot be written. */
function switchableAudit() {
  const state = { down: false };
  const store: AuditStore = {
    insert: async (event: AuditEventInput) => {
      if (state.down) throw new Error("the trail is down");
      await realAudit.insert(event);
    },
  };
  return { state, store };
}

function serviceOver(audit: AuditStore = realAudit): EngineChoices {
  return createEngineChoices({ database, audit, reader });
}

async function storedRow() {
  const [row] = await database
    .select()
    .from(enterpriseSettings)
    .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY))
    .limit(1);
  return row ?? null;
}

/**
 * Puts a raw value in the row, to see what a damaged or foreign document does. Cast from text, as the Bun driver sends a
 * bare number or string as itself and not as JSON.
 */
async function putRaw(value: unknown) {
  const json = sql`${JSON.stringify(value)}::text::jsonb`;
  await database
    .insert(enterpriseSettings)
    .values({ key: ENGINE_CHOICES_KEY, value: json, updatedBy: "test" })
    .onConflictDoUpdate({
      target: enterpriseSettings.key,
      set: { value: json },
    });
}

async function clearRow() {
  await database
    .delete(enterpriseSettings)
    .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY));
}

/** The audit events this administrator's changes left, for one kind of target. */
async function eventsOf(targetType: string, targetId?: string) {
  const { events } = await reader.list({
    eventType: "configuration.changed",
    targetType,
    targetId,
    actorUserId: admin,
    limit: 500,
  });
  return events;
}

async function eventCount() {
  return (
    (await eventsOf(ENGINE_CHANGE_TARGET)).length +
    (await eventsOf(ENGINE_UNDO_TARGET)).length
  );
}

/** What the copy in memory says each member's mode is, as plain pairs (or the word "unreadable"), typed loosely to compare. */
function modes(choices: EngineChoices): unknown {
  const now = choices.current();
  return now.state === "ok" ? Object.fromEntries(now.members) : "unreadable";
}

let choices: EngineChoices;

beforeAll(async () => {
  await clearRow();
});

beforeEach(async () => {
  await clearRow();
  choices = serviceOver();
  await choices.load();
});

afterAll(async () => {
  await clearRow();
  await database.$client.close();
});

describe("reading what is stored", () => {
  test("a service that has not read anything yet knows nothing: unreadable, so no run carries a choice", () => {
    expect(serviceOver().current()).toEqual({ state: "unreadable" });
  });

  test("with nothing stored the copy is ok and holds no member", () => {
    expect(choices.current().state).toBe("ok");
    expect(modes(choices)).toEqual({});
  });

  test("a choice is stored as one small document, and a new service reads it back", async () => {
    await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    const row = await storedRow();
    expect(row?.value).toEqual({
      value: { version: 1, members: { iris: { mode: "ask-first" } } },
    });
    expect(row?.updatedBy).toBe(admin);

    const restarted = serviceOver();
    expect(restarted.current()).toEqual({ state: "unreadable" });
    await restarted.load();
    expect(modes(restarted)).toEqual({ iris: { mode: "ask-first" } });
  });

  test("a document of another version, or one that is not a document, is unreadable and nothing in it is used", async () => {
    const damaged: unknown[] = [
      { value: { version: 2, members: { iris: { mode: "automatic" } } } },
      { value: { members: { iris: { mode: "automatic" } } } },
      { value: { version: "1", members: { iris: { mode: "automatic" } } } },
      { value: { version: 1 } },
      { value: { version: 1, members: [] } },
      { value: { version: 1, members: "iris" } },
      { value: "automatic" },
      { value: null },
      {},
      "junk",
      7,
    ];
    for (const value of damaged) {
      await putRaw(value);
      await choices.load();
      expect(choices.current()).toEqual({ state: "unreadable" });
    }
  });

  test("an entry that is not a member id with one of the two modes is left out, and the rest is kept", async () => {
    await putRaw({
      value: {
        version: 1,
        members: {
          iris: { mode: "ask-first" },
          leo: { mode: "automatic" },
          Otto: { mode: "automatic" },
          "../x": { mode: "automatic" },
          "": { mode: "automatic" },
          [`m${"x".repeat(80)}`]: { mode: "automatic" },
          penny: { mode: "yolo" },
          jules: { mode: 1 },
          wren: "automatic",
          gus: null,
          basil: {},
        },
      },
    });
    await choices.load();
    expect(modes(choices)).toEqual({
      iris: { mode: "ask-first" },
      leo: { mode: "automatic" },
    });
  });

  test("an entry holds nothing but its mode, whatever else was stored beside it", async () => {
    await putRaw({
      value: {
        version: 1,
        members: {
          iris: { mode: "ask-first", apiKey: "sk-ant-canary", pin: "claude" },
        },
      },
    });
    await choices.load();
    expect(modes(choices)).toEqual({ iris: { mode: "ask-first" } });
  });

  test("readDocument takes at most MAX_MEMBERS entries", () => {
    const members = Object.fromEntries(
      Array.from({ length: MAX_MEMBERS + 20 }, (_, index) => [
        `member-${index}`,
        { mode: "automatic" },
      ]),
    );
    const read = readDocument({ value: { version: 1, members } });
    expect(Object.keys(read ?? {})).toHaveLength(MAX_MEMBERS);
  });

  test("after the row is mended, the next load reads it again", async () => {
    await putRaw({ value: { version: 9, members: {} } });
    await choices.load();
    expect(choices.current().state).toBe("unreadable");
    await putRaw({
      value: { version: 1, members: { leo: { mode: "ask-first" } } },
    });
    await choices.load();
    expect(modes(choices)).toEqual({ leo: { mode: "ask-first" } });
  });

  test("a store that does not answer keeps what was last read, and with nothing read yet says nothing is known", async () => {
    await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    let down = false;
    const flaky = new Proxy(database, {
      get(target, property) {
        if (property === "select" && down)
          return () => {
            throw new Error("the database is not answering");
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const service = createEngineChoices({
      database: flaky,
      audit: realAudit,
      reader,
    });
    await service.load();
    expect(modes(service)).toEqual({ iris: { mode: "ask-first" } });
    down = true;
    await service.load();
    expect(modes(service)).toEqual({ iris: { mode: "ask-first" } });

    const unread = createEngineChoices({
      database: flaky,
      audit: realAudit,
      reader,
    });
    await unread.load();
    expect(unread.current()).toEqual({ state: "unreadable" });
  });
});

describe("a change", () => {
  test("writes the new value, records the member, the old value and the new one, and the copy follows", async () => {
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    expect(outcome.status).toBe("changed");
    if (outcome.status !== "changed") return;
    expect(outcome.previous).toBeNull();
    expect(outcome.mode).toBe("ask-first");
    expect(outcome.memberId).toBe("iris");
    expect(modes(choices)).toEqual({ iris: { mode: "ask-first" } });

    const events = await eventsOf(ENGINE_CHANGE_TARGET, outcome.changeId);
    expect(events).toHaveLength(1);
    expect(events[0]?.actorUserId).toBe(admin);
    expect(events[0]?.payload).toEqual({
      change: "engine_mode_changed",
      changeId: outcome.changeId,
      memberId: "iris",
      previousValue: null,
      newValue: "ask-first",
    });
  });

  test("a second change says what the person had chosen before", async () => {
    await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "automatic",
      actorUserId: admin,
    });
    expect(outcome.status).toBe("changed");
    if (outcome.status !== "changed") return;
    expect(outcome.previous).toBe("ask-first");
    const [event] = await eventsOf(ENGINE_CHANGE_TARGET, outcome.changeId);
    expect(event?.payload.previousValue).toBe("ask-first");
    expect(event?.payload.newValue).toBe("automatic");
  });

  test("the mode the person already chose changes nothing and records nothing", async () => {
    await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    const before = await eventCount();
    const again = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    expect(again).toEqual({
      status: "unchanged",
      memberId: "iris",
      mode: "ask-first",
    });
    expect(await eventCount()).toBe(before);
  });

  test("a choice for one member leaves another member's choice as it was", async () => {
    await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    await choices.setMode({
      memberId: "leo",
      mode: "automatic",
      actorUserId: admin,
    });
    expect(modes(choices)).toEqual({
      iris: { mode: "ask-first" },
      leo: { mode: "automatic" },
    });
    expect((await storedRow())?.value).toEqual({
      value: {
        version: 1,
        members: {
          iris: { mode: "ask-first" },
          leo: { mode: "automatic" },
        },
      },
    });
  });

  test("a member id that is not a member id is refused with 400, and nothing is stored or recorded", async () => {
    const before = await eventCount();
    for (const memberId of [
      "",
      "Iris",
      "../etc/passwd",
      "a b",
      "-lead",
      "_lead",
      "__proto__",
      "x".repeat(65),
      "iris\n",
      "iris;drop",
      "https://example.test",
    ]) {
      const refused = await choices
        .setMode({ memberId, mode: "ask-first", actorUserId: admin })
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
      expect((refused as EngineChoiceRefusedError).status).toBe(400);
    }
    expect(await storedRow()).toBeNull();
    expect(await eventCount()).toBe(before);
  });

  test("a mode that is not one of the two words is refused with 400, and nothing is stored or recorded", async () => {
    const before = await eventCount();
    for (const mode of [
      "yolo",
      "",
      "Automatic",
      "ask first",
      "ask-first ",
      "always",
      null,
      undefined,
      42,
      {},
      ["automatic"],
    ]) {
      const refused = await choices
        .setMode({
          memberId: "iris",
          mode: mode as never,
          actorUserId: admin,
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
      expect((refused as EngineChoiceRefusedError).status).toBe(400);
    }
    expect(await storedRow()).toBeNull();
    expect(await eventCount()).toBe(before);
  });

  test("a member named like an object property is a member like any other, and changes nothing else", async () => {
    const outcome = await choices.setMode({
      memberId: "constructor",
      mode: "ask-first",
      actorUserId: admin,
    });
    expect(outcome.status).toBe("changed");
    if (outcome.status !== "changed") return;
    expect(outcome.previous).toBeNull();
    expect(modes(choices)).toEqual({ constructor: { mode: "ask-first" } });
    await choices.undo({ changeId: outcome.changeId, actorUserId: admin });
    expect(modes(choices)).toEqual({});
  });

  test("a document that cannot be read is never written over: the change is refused with 409 and the row stays as it was", async () => {
    const damaged = { value: { version: 7, members: { iris: "keep me" } } };
    await putRaw(damaged);
    await choices.load();
    const before = await eventCount();
    const refused = await choices
      .setMode({ memberId: "iris", mode: "ask-first", actorUserId: admin })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
    expect((refused as EngineChoiceRefusedError).status).toBe(409);
    expect((await storedRow())?.value).toEqual(damaged);
    expect(choices.current()).toEqual({ state: "unreadable" });
    expect(await eventCount()).toBe(before);
  });

  test("a change whose record cannot be written is taken back, and the error is the record's", async () => {
    const trail = switchableAudit();
    const service = serviceOver(trail.store);
    await service.load();
    await service.setMode({
      memberId: "iris",
      mode: "automatic",
      actorUserId: admin,
    });
    trail.state.down = true;
    const before = await eventCount();
    await expect(
      service.setMode({
        memberId: "iris",
        mode: "ask-first",
        actorUserId: admin,
      }),
    ).rejects.toThrow("the trail is down");
    expect(modes(service)).toEqual({ iris: { mode: "automatic" } });
    expect((await storedRow())?.value).toEqual({
      value: { version: 1, members: { iris: { mode: "automatic" } } },
    });
    expect(await eventCount()).toBe(before);
  });

  test("a first change whose record cannot be written leaves the member with no choice at all", async () => {
    const trail = switchableAudit();
    const service = serviceOver(trail.store);
    await service.load();
    trail.state.down = true;
    await expect(
      service.setMode({
        memberId: "leo",
        mode: "ask-first",
        actorUserId: admin,
      }),
    ).rejects.toThrow("the trail is down");
    expect(modes(service)).toEqual({});
    expect((await storedRow())?.value).toEqual({
      value: { version: 1, members: {} },
    });
  });

  test("no more than MAX_MEMBERS members can have a saved choice, and one who has one can still change it", async () => {
    const members = Object.fromEntries(
      Array.from({ length: MAX_MEMBERS }, (_, index) => [
        `member-${index}`,
        { mode: "automatic" },
      ]),
    );
    await putRaw({ value: { version: 1, members } });
    await choices.load();
    const refused = await choices
      .setMode({ memberId: "one-more", mode: "ask-first", actorUserId: admin })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
    expect((refused as EngineChoiceRefusedError).status).toBe(409);
    const kept = await choices.setMode({
      memberId: "member-3",
      mode: "ask-first",
      actorUserId: admin,
    });
    expect(kept.status).toBe("changed");
    const document = readDocument((await storedRow())?.value);
    expect(document?.["member-3"]).toEqual({ mode: "ask-first" });
    expect(Object.keys(document ?? {})).toHaveLength(MAX_MEMBERS);
  });

  test("changes made together are not lost, here by one service", async () => {
    await Promise.all(
      ["iris", "leo", "otto", "penny", "wren"].map((memberId) =>
        choices.setMode({ memberId, mode: "ask-first", actorUserId: admin }),
      ),
    );
    const expected = {
      iris: { mode: "ask-first" },
      leo: { mode: "ask-first" },
      otto: { mode: "ask-first" },
      penny: { mode: "ask-first" },
      wren: { mode: "ask-first" },
    } as const;
    expect(modes(choices)).toEqual(expected);
    expect(readDocument((await storedRow())?.value)).toEqual(expected);
  });

  test("changes made together are not lost, here by two services over one database", async () => {
    const second = serviceOver();
    await second.load();
    await Promise.all([
      choices.setMode({
        memberId: "iris",
        mode: "ask-first",
        actorUserId: admin,
      }),
      second.setMode({
        memberId: "leo",
        mode: "ask-first",
        actorUserId: admin,
      }),
    ]);
    expect(readDocument((await storedRow())?.value)).toEqual({
      iris: { mode: "ask-first" },
      leo: { mode: "ask-first" },
    });
  });
});

describe("a change made while another is half done", () => {
  /**
   * A database whose transactions stop just before they write, until `release()`. The first change reads the row, then
   * waits; the second one starts then. If nothing holds the second back, it reads the same row, writes its member and
   * is done, and the first then writes over it with what it read earlier: one change is lost.
   */
  function stopsBeforeWriting() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const reading = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const slow = new Proxy(database, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property !== "transaction")
          return typeof value === "function" ? value.bind(target) : value;
        return (callback: (transaction: unknown) => Promise<unknown>) =>
          target.transaction((transaction) =>
            callback(
              new Proxy(transaction, {
                get(inner, name) {
                  if (name === "update")
                    return (table: Parameters<typeof inner.update>[0]) => ({
                      set: (values: Record<string, unknown>) => ({
                        where: async (
                          condition: Parameters<
                            ReturnType<
                              ReturnType<typeof inner.update>["set"]
                            >["where"]
                          >[0],
                        ) => {
                          reached();
                          await gate;
                          return inner
                            .update(table)
                            .set(values)
                            .where(condition);
                        },
                      }),
                    });
                  const member = Reflect.get(inner, name, inner);
                  return typeof member === "function"
                    ? member.bind(inner)
                    : member;
                },
              }),
            ),
          );
      },
    });
    return { slow: slow as typeof database, release, reading };
  }

  test("is not lost: the row is locked from the read to the write, so the second change waits and then adds to the first", async () => {
    // The row has to exist already, so that what holds the second change back is the lock on it and nothing else.
    await choices.setMode({
      memberId: "someone",
      mode: "automatic",
      actorUserId: admin,
    });
    const { slow, release, reading } = stopsBeforeWriting();
    const first = createEngineChoices({
      database: slow,
      audit: realAudit,
      reader,
    });
    await first.load();
    const second = serviceOver();
    await second.load();

    const firstChange = first.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    await reading;
    const secondChange = second.setMode({
      memberId: "leo",
      mode: "ask-first",
      actorUserId: admin,
    });
    // Long enough for the second change to be done if nothing held it back.
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await Promise.all([firstChange, secondChange]);

    expect(readDocument((await storedRow())?.value)).toEqual({
      someone: { mode: "automatic" },
      iris: { mode: "ask-first" },
      leo: { mode: "ask-first" },
    });
  });
});

describe("Undo", () => {
  test("puts back what the change replaced; with nothing chosen before, the member has no choice again", async () => {
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    const undone = await choices.undo({
      changeId: outcome.changeId,
      actorUserId: admin,
    });
    expect(undone).toEqual({
      status: "undone",
      changeId: outcome.changeId,
      memberId: "iris",
      mode: null,
    });
    expect(modes(choices)).toEqual({});
    expect((await storedRow())?.value).toEqual({
      value: { version: 1, members: {} },
    });
    const [event] = await eventsOf(ENGINE_UNDO_TARGET, outcome.changeId);
    expect(event?.actorUserId).toBe(admin);
    expect(event?.payload).toEqual({
      change: "engine_mode_change_undone",
      changeId: outcome.changeId,
      memberId: "iris",
      previousValue: "ask-first",
      newValue: null,
    });
  });

  test("puts back a choice the person had made before", async () => {
    await choices.setMode({
      memberId: "iris",
      mode: "automatic",
      actorUserId: admin,
    });
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    const undone = await choices.undo({
      changeId: outcome.changeId,
      actorUserId: admin,
    });
    expect(undone.mode).toBe("automatic");
    expect(modes(choices)).toEqual({ iris: { mode: "automatic" } });
  });

  test("touches only the member of that change", async () => {
    await choices.setMode({
      memberId: "leo",
      mode: "ask-first",
      actorUserId: admin,
    });
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    await choices.undo({ changeId: outcome.changeId, actorUserId: admin });
    expect(modes(choices)).toEqual({ leo: { mode: "ask-first" } });
  });

  test("a second Undo of the same change is refused with 409, and nothing moves", async () => {
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    await choices.undo({ changeId: outcome.changeId, actorUserId: admin });
    const before = await eventCount();
    const refused = await choices
      .undo({ changeId: outcome.changeId, actorUserId: admin })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
    expect((refused as EngineChoiceRefusedError).status).toBe(409);
    expect((refused as Error).message).toContain("already been undone");
    expect(await eventCount()).toBe(before);
    expect(modes(choices)).toEqual({});
  });

  test("is refused after a later change, with 409, and the later choice stays", async () => {
    const first = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (first.status !== "changed") throw new Error("expected a change");
    await choices.setMode({
      memberId: "iris",
      mode: "automatic",
      actorUserId: admin,
    });
    const refused = await choices
      .undo({ changeId: first.changeId, actorUserId: admin })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
    expect((refused as EngineChoiceRefusedError).status).toBe(409);
    expect((refused as Error).message).toContain("has changed since");
    expect(modes(choices)).toEqual({ iris: { mode: "automatic" } });
  });

  test("an id that is no change of ours is a 404: unknown, or the id of another kind of record", async () => {
    for (const changeId of [randomUUID(), "not-an-id", ""]) {
      const refused = await choices.undo({ changeId, actorUserId: admin }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
      expect((refused as EngineChoiceRefusedError).status).toBe(404);
    }
    // A change of something else that happens to carry an id: not an engine change, so not undone here.
    const otherId = randomUUID();
    await realAudit.insert({
      eventType: "configuration.changed",
      targetType: "bot_setting",
      targetId: otherId,
      actorUserId: admin,
      payload: { memberId: "iris", previousValue: null, newValue: "ask-first" },
    });
    const refused = await choices
      .undo({ changeId: otherId, actorUserId: admin })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((refused as EngineChoiceRefusedError).status).toBe(404);
    expect(modes(choices)).toEqual({});
  });

  test("a recorded change that cannot be read back is refused with 409, not guessed", async () => {
    const changeId = randomUUID();
    await realAudit.insert({
      eventType: "configuration.changed",
      targetType: ENGINE_CHANGE_TARGET,
      targetId: changeId,
      actorUserId: admin,
      payload: {
        change: "engine_mode_changed",
        changeId,
        memberId: "../iris",
        previousValue: null,
        newValue: "ask-first",
      },
    });
    const refused = await choices.undo({ changeId, actorUserId: admin }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
    expect((refused as EngineChoiceRefusedError).status).toBe(409);
    expect(modes(choices)).toEqual({});
  });

  test("is refused with 409 while the stored document cannot be read, and the row stays as it was", async () => {
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    const damaged = { value: { version: 3, members: {} } };
    await putRaw(damaged);
    await choices.load();
    const refused = await choices
      .undo({ changeId: outcome.changeId, actorUserId: admin })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(EngineChoiceRefusedError);
    expect((refused as EngineChoiceRefusedError).status).toBe(409);
    expect((await storedRow())?.value).toEqual(damaged);
  });

  test("an Undo whose record cannot be written is taken back, and the change can be undone again later", async () => {
    const trail = switchableAudit();
    const service = serviceOver(trail.store);
    await service.load();
    const outcome = await service.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    trail.state.down = true;
    await expect(
      service.undo({ changeId: outcome.changeId, actorUserId: admin }),
    ).rejects.toThrow("the trail is down");
    expect(modes(service)).toEqual({ iris: { mode: "ask-first" } });
    expect(await eventsOf(ENGINE_UNDO_TARGET, outcome.changeId)).toHaveLength(
      0,
    );

    trail.state.down = false;
    const undone = await service.undo({
      changeId: outcome.changeId,
      actorUserId: admin,
    });
    expect(undone.mode).toBeNull();
    expect(modes(service)).toEqual({});
  });
});

describe("what is stored and recorded holds nothing but ids and the two words", () => {
  test("the row's document and the audit payloads have exactly the known fields, with no key, address or path", async () => {
    const outcome = await choices.setMode({
      memberId: "iris",
      mode: "ask-first",
      actorUserId: admin,
    });
    if (outcome.status !== "changed") throw new Error("expected a change");
    await choices.undo({ changeId: outcome.changeId, actorUserId: admin });
    await choices.setMode({
      memberId: "leo",
      mode: "automatic",
      actorUserId: admin,
    });

    const document = (await storedRow())?.value as {
      value: { version: number; members: Record<string, object> };
    };
    expect(Object.keys(document)).toEqual(["value"]);
    expect(Object.keys(document.value).sort()).toEqual(["members", "version"]);
    for (const entry of Object.values(document.value.members))
      expect(Object.keys(entry)).toEqual(["mode"]);

    const changes = await eventsOf(ENGINE_CHANGE_TARGET);
    const undos = await eventsOf(ENGINE_UNDO_TARGET);
    for (const event of [...changes, ...undos]) {
      expect(Object.keys(event.payload).sort()).toEqual([
        "change",
        "changeId",
        "memberId",
        "newValue",
        "previousValue",
      ]);
    }
    const everything = JSON.stringify([document, changes, undos]);
    expect(everything).not.toMatch(
      /:\/\/|\/home|\\\\|api[_-]?key|token|secret/i,
    );
  });
});
