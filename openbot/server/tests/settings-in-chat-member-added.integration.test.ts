/**
 * The line after a team change: a member added from chat, and its Undo (docs/design/settings-in-chat.md, 8.11),
 * against a real database and the real routes.
 *
 * What is proved here:
 *   - the record holds the member as it was added (name, skills, times), once, and only for the person's own, private,
 *     keyless, just-made member;
 *   - Undo deletes the member and takes its grants back, for the person that added it and nobody else;
 *   - a second Undo of the same change is refused, and writes nothing;
 *   - a member changed again since (edited, or given another grant) is left alone, with the sentence that says so;
 *   - the seven days are exact, and an audit row that cannot be written puts the member back.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  type AuditStore,
  createAuditReader,
  createAuditStore,
} from "../src/audit";
import { createDatabase } from "../src/db/client";
import { agents, users } from "../src/db/schema";
import { agentProfiles } from "../src/db/schema/coworker";
import { pluginGrants } from "../src/db/schema/plugins";
import {
  createSettingChanges,
  MEMBER_RECORD_WINDOW_MS,
  type SettingChanges,
} from "../src/settings-in-chat/changes";
import { createSettingChangeRoutes } from "../src/settings-in-chat/routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `sic-member-${randomUUID()}`;
const DAY_MS = 24 * 60 * 60 * 1000;

const audit = createAuditStore(database);
const reader = createAuditReader(database);
const changes = createSettingChanges({ database, audit, reader });

afterAll(async () => {
  await database.$client.close();
});

async function newPerson(): Promise<string> {
  const id = `${prefix}-${randomUUID()}`;
  await database.insert(users).values({ id, email: `${id}@example.test` });
  return id;
}

/** A member as the proposal card leaves it: private, keyless, the person's own, with its skills granted. */
async function newMember(
  owner: string,
  options: {
    skills?: string[];
    visibility?: "private" | "public";
    config?: Record<string, unknown>;
    imported?: boolean;
  } = {},
): Promise<string> {
  const id = `${prefix}-bot-${randomUUID()}`;
  await database.insert(agents).values({
    id,
    name: "Renewal Desk",
    type: "built_in",
    configuration: options.config ?? { systemPrompt: "Chase invoices." },
  });
  await database.insert(agentProfiles).values({
    agentId: id,
    ownerUserId: owner,
    title: "Accounts Receivable",
    roleDescription: "Chase invoices.",
    avatarSeed: id,
    visibility: options.visibility ?? "private",
    importedMember: options.imported ?? false,
  });
  for (const slug of options.skills ?? ["find-a-document"])
    await database
      .insert(pluginGrants)
      .values({ kind: "skill", ref: slug, agentId: id, grantedBy: owner });
  return id;
}

function routesFor(service: SettingChanges, person: string) {
  const routes = createSettingChangeRoutes(service, async (context, next) => {
    context.set("actor", {
      id: person,
      email: `${person}@example.test`,
    } as never);
    await next();
  });
  return new Hono().route("/", routes);
}

type AnswerBody = {
  error?: string;
  undone?: boolean;
  setting?: string;
  value?: unknown;
  change: {
    changeId: string;
    agentId: string;
    setting: string;
    previousValue: null;
    newValue: string;
    skills: string[];
  };
};

async function record(person: string, agentId: string, service = changes) {
  const response = await routesFor(service, person).request("/members", {
    method: "POST",
    body: JSON.stringify({ agentId }),
    headers: { "content-type": "application/json" },
  });
  return {
    status: response.status,
    body: (await response.json()) as AnswerBody,
  };
}

async function undo(person: string, changeId: string, service = changes) {
  const response = await routesFor(service, person).request(
    `/${changeId}/undo`,
    { method: "POST" },
  );
  return {
    status: response.status,
    body: (await response.json()) as AnswerBody,
  };
}

async function deletedAt(agentId: string): Promise<Date | null> {
  const [row] = await database
    .select({ deletedAt: agentProfiles.deletedAt })
    .from(agentProfiles)
    .where(eq(agentProfiles.agentId, agentId));
  return row?.deletedAt ?? null;
}

async function grantCount(agentId: string): Promise<number> {
  return (
    await database
      .select()
      .from(pluginGrants)
      .where(eq(pluginGrants.agentId, agentId))
  ).length;
}

async function undoEvents(changeId: string): Promise<number> {
  return (
    await reader.list({
      eventType: "configuration.changed",
      targetType: "bot_setting_undo",
      targetId: changeId,
      limit: 5,
    })
  ).events.length;
}

async function listFor(person: string) {
  const response = await routesFor(changes, person).request("/");
  return ((await response.json()) as { changes: Record<string, unknown>[] })
    .changes;
}

describe("recording a member added from chat", () => {
  test("holds the member as it was added, and shows in the person's list with Undo", async () => {
    const person = await newPerson();
    const member = await newMember(person, { skills: ["a-skill", "b-skill"] });

    const answer = await record(person, member);

    expect(answer.status).toBe(201);
    expect(answer.body.change).toMatchObject({
      changeId: `member-${member}`,
      agentId: member,
      setting: "member",
      previousValue: null,
      newValue: "Renewal Desk",
      skills: ["a-skill", "b-skill"],
    });
    const [listed] = await listFor(person);
    expect(listed).toMatchObject({
      changeId: `member-${member}`,
      setting: "member",
      newValue: "Renewal Desk",
      undone: false,
      undoable: true,
    });
  });

  test("is written once: a second record of the same member is refused", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    expect((await record(person, member)).status).toBe(201);

    const again = await record(person, member);

    expect(again.status).toBe(409);
    expect(await listFor(person)).toHaveLength(1);
  });

  test("is refused for a member that is not the person's own, new, private and keyless", async () => {
    const person = await newPerson();
    const other = await newPerson();
    const refusals: [string, string][] = [
      ["another person's member", await newMember(other)],
      ["a public member", await newMember(person, { visibility: "public" })],
      [
        "a member holding a key",
        await newMember(person, {
          config: { endpoint: "https://x.test", auth: { ref: "k" } },
        }),
      ],
      ["an imported member", await newMember(person, { imported: true })],
      ["a member that does not exist", `${prefix}-nobody`],
    ];
    for (const [label, id] of refusals) {
      const answer = await record(person, id);
      expect([label, answer.status]).toEqual([label, 404]);
    }
    expect(await listFor(person)).toHaveLength(0);
  });

  test("is refused for a member made long ago, and for a deleted one", async () => {
    const person = await newPerson();
    const old = await newMember(person);
    const late = createSettingChanges({
      database,
      audit,
      reader,
      now: () => new Date(Date.now() + MEMBER_RECORD_WINDOW_MS + 60_000),
    });
    expect((await record(person, old, late)).status).toBe(404);

    const gone = await newMember(person);
    await database
      .update(agentProfiles)
      .set({ deletedAt: new Date() })
      .where(eq(agentProfiles.agentId, gone));
    expect((await record(person, gone)).status).toBe(404);
  });

  test("a request with no member id is a 400", async () => {
    const person = await newPerson();
    const response = await routesFor(changes, person).request("/members", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(400);
  });
});

describe("Undo of a member added from chat", () => {
  test("puts back exactly what was there before: the member is gone and its grants with it", async () => {
    const person = await newPerson();
    const member = await newMember(person, { skills: ["a-skill", "b-skill"] });
    const { body } = await record(person, member);

    const answer = await undo(person, body.change.changeId);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      undone: true,
      setting: "member",
      value: null,
    });
    expect(await deletedAt(member)).not.toBeNull();
    expect(await grantCount(member)).toBe(0);
    expect(await undoEvents(body.change.changeId)).toBe(1);
    const [listed] = await listFor(person);
    expect(listed).toMatchObject({ undone: true, undoable: false });
  });

  test("a second Undo of the same change is refused, and writes nothing", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);
    await undo(person, body.change.changeId);

    const second = await undo(person, body.change.changeId);

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("That change has already been undone.");
    expect(await undoEvents(body.change.changeId)).toBe(1);
  });

  test("a member edited since is left alone, with the sentence that says so", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);
    await database
      .update(agentProfiles)
      .set({ title: "Changed", updatedAt: new Date(Date.now() + 5000) })
      .where(eq(agentProfiles.agentId, member));

    const answer = await undo(person, body.change.changeId);

    expect(answer.status).toBe(409);
    expect(answer.body.error).toContain("changed since");
    expect(await deletedAt(member)).toBeNull();
    expect(await grantCount(member)).toBe(1);
    expect(await undoEvents(body.change.changeId)).toBe(0);
    const [listed] = await listFor(person);
    expect(listed).toMatchObject({ undone: false, undoable: false });
  });

  test("a member renamed since (its agent row, not its profile) is left alone too", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);
    await database
      .update(agents)
      .set({ name: "Renamed", updatedAt: new Date(Date.now() + 5000) })
      .where(eq(agents.id, member));

    const answer = await undo(person, body.change.changeId);

    expect(answer.status).toBe(409);
    expect(await deletedAt(member)).toBeNull();
  });

  test("a member given another grant since is left alone too", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);
    await database.insert(pluginGrants).values({
      kind: "skill",
      ref: "later",
      agentId: member,
      grantedBy: person,
    });

    const answer = await undo(person, body.change.changeId);

    expect(answer.status).toBe(409);
    expect(await deletedAt(member)).toBeNull();
    expect(await grantCount(member)).toBe(2);
  });

  test("a member the person already deleted by hand is not deleted twice", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);
    await database
      .update(agentProfiles)
      .set({ deletedAt: new Date() })
      .where(eq(agentProfiles.agentId, member));

    const answer = await undo(person, body.change.changeId);

    expect(answer.status).toBe(409);
    expect(await undoEvents(body.change.changeId)).toBe(0);
  });

  test("another person's Undo finds no such change and touches nothing", async () => {
    const person = await newPerson();
    const stranger = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);

    const answer = await undo(stranger, body.change.changeId);

    expect(answer.status).toBe(404);
    expect(await deletedAt(member)).toBeNull();
    expect(await listFor(stranger)).toHaveLength(0);
  });

  test("lasts seven days, exactly", async () => {
    const person = await newPerson();
    const member = await newMember(person);
    const { body } = await record(person, member);
    const at = (ms: number) =>
      createSettingChanges({
        database,
        audit,
        reader,
        now: () => new Date(Date.now() + ms),
      });

    const late = await undo(
      person,
      body.change.changeId,
      at(7 * DAY_MS + 60_000),
    );

    expect(late.status).toBe(409);
    expect(late.body.error).toContain("more than seven days");
    expect(await deletedAt(member)).toBeNull();
    const fine = await undo(
      person,
      body.change.changeId,
      at(7 * DAY_MS - 60_000),
    );
    expect(fine.status).toBe(200);
  });

  test("an audit row that cannot be written puts the member back", async () => {
    const person = await newPerson();
    const member = await newMember(person, { skills: ["a-skill", "b-skill"] });
    const { body } = await record(person, member);
    const failing: AuditStore = {
      insert: async () => {
        throw new Error("trail down");
      },
    };
    const broken = createSettingChanges({ database, audit: failing, reader });

    await expect(
      broken.undo({ ownerUserId: person, changeId: body.change.changeId }),
    ).rejects.toThrow("trail down");

    expect(await deletedAt(member)).toBeNull();
    expect(await grantCount(member)).toBe(2);
    const [listed] = await listFor(person);
    expect(listed).toMatchObject({ undone: false, undoable: true });
  });
});
