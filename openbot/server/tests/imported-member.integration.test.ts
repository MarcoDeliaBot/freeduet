import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { createImportedMember } from "../src/agents/imported-member";
import {
  type AgentProfileStore,
  createAgentProfileStore,
} from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import { createAgentRoutes } from "../src/agents/routes";
import {
  IMPORTED_ROLE_DESCRIPTION_LIMIT,
  ROLE_DESCRIPTION_LIMIT,
} from "../src/agents/role-description-limit";
import type { AppVariables } from "../src/auth/guards";
import { createDatabase } from "../src/db/client";
import { agentProfiles, agents, users } from "../src/db/schema";
import { TEAM_FILE_LIMITS } from "../src/freeduet/team-file";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The instructions of a Bot imported from a team file, through the real store and the real routes.
 *
 * What is pinned here: the importer's creation path takes up to 8,000 UTF-16 code units; the edit
 * route takes the same for a Bot holding the imported fact and nothing longer for any other; the
 * fact is written by `createImportedMember` only, so no request body can set it or clear it; and a
 * copy of an imported Bot does not inherit the fact. The guards for a Bot made in the app, which
 * this change must not move, are in `agent-instructions-limit.integration.test.ts`.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const store: AgentProfileStore = createAgentProfileStore(database, undefined);
const testPrefix = `imported-member-${randomUUID()}`;
const createdUserIds: string[] = [];

afterEach(async () => {
  // Coworkers first, so their profile rows cascade; then the people who owned them.
  for (const userId of createdUserIds.splice(0)) {
    const owned = await database
      .select({ agentId: agentProfiles.agentId })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerUserId, userId));
    if (owned.length > 0) {
      await database.delete(agents).where(
        inArray(
          agents.id,
          owned.map((row) => row.agentId),
        ),
      );
    }
    await database.delete(users).where(eq(users.id, userId));
  }
});

afterAll(async () => {
  await database.$client.close();
});

async function createOwner(): Promise<AgentActor> {
  const userId = `${testPrefix}-user-${randomUUID()}`;
  await database.insert(users).values({
    id: userId,
    email: `${userId}@example.test`,
    name: "Imported Member Test",
  });
  createdUserIds.push(userId);
  return { id: userId, role: "user" };
}

/** The real routes, for one signed-in person. */
function appFor(owner: AgentActor) {
  const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
    context,
    next,
  ) => {
    context.set("actor", {
      id: owner.id,
      email: `${owner.id}@example.test`,
      role: owner.role,
    });
    await next();
  };
  return new Hono<{ Variables: AppVariables }>().route(
    "/api/agents",
    createAgentRoutes(store, requireUser),
  );
}

const jsonBody = (body: unknown) => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const send = (
  app: ReturnType<typeof appFor>,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
) =>
  app.request(
    `http://openbot.test${path}`,
    body === undefined ? { method } : { method, ...jsonBody(body) },
  );

/** What the edit form sends: the whole profile, as the route parses it. */
function editBody(
  roleDescription: string,
  extra: Record<string, unknown> = {},
) {
  return {
    name: "Renewal Desk",
    title: "Contract renewals",
    roleDescription,
    visibility: "private",
    ...extra,
  };
}

/** Code units, which is what the limits count: `String.length`. */
const ascii = (length: number) => "a".repeat(length);

async function storedFact(agentId: string): Promise<boolean | undefined> {
  const [row] = await database
    .select({ importedMember: agentProfiles.importedMember })
    .from(agentProfiles)
    .where(eq(agentProfiles.agentId, agentId));
  return row?.importedMember;
}

async function storedSystemPrompt(agentId: string): Promise<unknown> {
  const [row] = await database
    .select({ configuration: agents.configuration })
    .from(agents)
    .where(eq(agents.id, agentId));
  return (row?.configuration as { systemPrompt?: unknown } | undefined)
    ?.systemPrompt;
}

async function importedMemberOf(owner: AgentActor, roleDescription: string) {
  return createImportedMember(store, owner, {
    name: "Renewal Desk",
    title: "Contract renewals",
    roleDescription,
  });
}

describe("createImportedMember", () => {
  test("makes a private coworker that holds the fact, its instructions, and the same text as its built-in prompt", async () => {
    const owner = await createOwner();
    const made = await importedMemberOf(owner, ascii(8000));

    expect(made.visibility).toBe("private");
    expect(made.roleDescription).toBe(ascii(8000));
    expect(made.importedMember).toBe(true);
    expect(await storedFact(made.id)).toBe(true);
    expect(await storedSystemPrompt(made.id)).toBe(ascii(8000));
  });

  test("takes 8,000 characters and refuses 8,001, and says the limit", async () => {
    const owner = await createOwner();

    await expect(importedMemberOf(owner, ascii(8000))).resolves.toMatchObject({
      importedMember: true,
    });
    await expect(importedMemberOf(owner, ascii(8001))).rejects.toThrow(
      "What it does must be text between 1 and 8000 characters.",
    );
  });

  test("counts UTF-16 code units, not bytes: 4,000 emoji fit and 4,001 do not, and 8,000 accented letters fit", async () => {
    const owner = await createOwner();
    const emoji = "\u{1F600}";
    const accented = "é";

    expect(emoji.repeat(4000).length).toBe(8000);
    await expect(
      importedMemberOf(owner, emoji.repeat(4000)),
    ).resolves.toMatchObject({ importedMember: true });
    await expect(
      importedMemberOf(owner, `${emoji.repeat(4000)}a`),
    ).rejects.toThrow("between 1 and 8000 characters.");
    // Two bytes each in UTF-8, one code unit each: 16,000 bytes, and still within the limit.
    expect(new TextEncoder().encode(accented.repeat(8000)).length).toBe(16000);
    await expect(
      importedMemberOf(owner, accented.repeat(8000)),
    ).resolves.toMatchObject({ importedMember: true });
  });

  test("refuses empty instructions and a name past the form's own limit", async () => {
    const owner = await createOwner();

    await expect(importedMemberOf(owner, "   ")).rejects.toThrow(
      "What it does must be text between 1 and 8000 characters.",
    );
    await expect(
      createImportedMember(store, owner, {
        name: ascii(81),
        title: "Contract renewals",
        roleDescription: "Renews contracts.",
      }),
    ).rejects.toThrow("Name must be text between 1 and 80 characters.");
  });
});

describe("editing an imported coworker", () => {
  test("takes 8,000 characters on the edit route and refuses 8,001, with the same count on code units", async () => {
    const owner = await createOwner();
    const made = await importedMemberOf(owner, ascii(1000));
    const app = appFor(owner);

    const accepted = await send(
      app,
      "PATCH",
      `/api/agents/${made.id}`,
      editBody(ascii(8000)),
    );
    expect(accepted.status).toBe(200);
    expect((await store.get(owner, made.id))?.roleDescription).toBe(
      ascii(8000),
    );

    const refused = await send(
      app,
      "PATCH",
      `/api/agents/${made.id}`,
      editBody(ascii(8001)),
    );
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: "What it does must be text between 1 and 8000 characters.",
    });

    const emoji = "\u{1F600}";
    const emojiAccepted = await send(
      app,
      "PATCH",
      `/api/agents/${made.id}`,
      editBody(emoji.repeat(4000)),
    );
    expect(emojiAccepted.status).toBe(200);
    const emojiRefused = await send(
      app,
      "PATCH",
      `/api/agents/${made.id}`,
      editBody(`${emoji.repeat(4000)}a`),
    );
    expect(emojiRefused.status).toBe(400);
  });

  test("a body that claims the fact is ignored, so an edit cannot clear it", async () => {
    const owner = await createOwner();
    const made = await importedMemberOf(owner, ascii(1000));
    const app = appFor(owner);

    const response = await send(
      app,
      "PATCH",
      `/api/agents/${made.id}`,
      editBody(ascii(8000), { importedMember: false, imported: false }),
    );

    expect(response.status).toBe(200);
    expect(await storedFact(made.id)).toBe(true);
    // Still held to the imported limit on the next edit, which proves the fact is still there.
    const next = await send(
      app,
      "PATCH",
      `/api/agents/${made.id}`,
      editBody(ascii(8000)),
    );
    expect(next.status).toBe(200);
  });

  test("a copy of an imported coworker keeps its text while unchanged, and a changed text is held to 1,000", async () => {
    const owner = await createOwner();
    const original = await importedMemberOf(owner, ascii(8000));
    const app = appFor(owner);

    const duplicated = await send(
      app,
      "POST",
      `/api/agents/${original.id}/duplicate`,
    );
    expect(duplicated.status).toBe(201);
    const copy = (await duplicated.json()) as { agent: { id: string } };
    // The copy is a new coworker made by a copy, so it does not hold the fact.
    expect(await storedFact(copy.agent.id)).toBe(false);

    const renamed = await send(app, "PATCH", `/api/agents/${copy.agent.id}`, {
      ...editBody(ascii(8000)),
      name: "Renewal Copy",
    });
    expect(renamed.status).toBe(200);

    const changed = await send(
      app,
      "PATCH",
      `/api/agents/${copy.agent.id}`,
      editBody("b".repeat(1001)),
    );
    expect(changed.status).toBe(400);
    expect(await changed.json()).toEqual({
      error: "What it does must be text between 1 and 1000 characters.",
    });

    const shortened = await send(
      app,
      "PATCH",
      `/api/agents/${copy.agent.id}`,
      editBody("b".repeat(1000)),
    );
    expect(shortened.status).toBe(200);
  });
});

describe("the limit a coworker reports", () => {
  test("names 8,000 for an imported coworker and 1,000 for one made in the app", async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const made = await importedMemberOf(owner, ascii(1000));
    const handMade = await send(app, "POST", "/api/agents", {
      name: "Expense Manager",
      title: "Finance Operations",
      roleDescription: "Reviews receipts.",
      visibility: "private",
    });
    expect(handMade.status).toBe(201);
    const handMadeId = ((await handMade.json()) as { agent: { id: string } })
      .agent.id;

    const importedRead = (await (
      await send(app, "GET", `/api/agents/${made.id}`)
    ).json()) as { agent: { roleDescriptionLimit: number } };
    const handMadeRead = (await (
      await send(app, "GET", `/api/agents/${handMadeId}`)
    ).json()) as { agent: { roleDescriptionLimit: number } };

    expect(importedRead.agent.roleDescriptionLimit).toBe(8000);
    expect(handMadeRead.agent.roleDescriptionLimit).toBe(1000);
  });

  test("a body that claims the fact on create does not make the coworker imported", async () => {
    const owner = await createOwner();
    const app = appFor(owner);

    const response = await send(app, "POST", "/api/agents", {
      name: "Expense Manager",
      title: "Finance Operations",
      roleDescription: ascii(1000),
      visibility: "private",
      importedMember: true,
    });
    expect(response.status).toBe(201);
    const id = ((await response.json()) as { agent: { id: string } }).agent.id;

    expect(await storedFact(id)).toBe(false);
  });
});

describe("the reader and the server share one pair of limits", () => {
  test("the imported limit is the team-file reader's instruction limit, and the app's limit is its create limit", () => {
    expect(IMPORTED_ROLE_DESCRIPTION_LIMIT).toBe(
      TEAM_FILE_LIMITS.instructionsCharacters,
    );
    expect(ROLE_DESCRIPTION_LIMIT).toBe(TEAM_FILE_LIMITS.createTextCharacters);
  });
});
