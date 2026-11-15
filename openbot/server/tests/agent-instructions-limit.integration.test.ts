import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import { createAgentRoutes } from "../src/agents/routes";
import type { AppVariables } from "../src/auth/guards";
import { createDatabase } from "../src/db/client";
import { agentProfiles, agents, users } from "../src/db/schema";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * Guards of unchanged behaviour: a Bot made in the app keeps 1,000 characters on create and on edit,
 * and nothing a request body says lifts that. These use only the store and the routes that exist
 * today, so they pass on main as well as on the branch.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const store = createAgentProfileStore(database, undefined);
const testPrefix = `agent-limit-${randomUUID()}`;
const createdUserIds: string[] = [];

afterEach(async () => {
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
    name: "Instructions Limit Test",
  });
  createdUserIds.push(userId);
  return { id: userId, role: "user" };
}

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

function send(
  app: ReturnType<typeof appFor>,
  method: "POST" | "PATCH",
  path: string,
  body: Record<string, unknown>,
) {
  return app.request(`http://openbot.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function handMadeBody(
  roleDescription: string,
  extra: Record<string, unknown> = {},
) {
  return {
    name: "Expense Manager",
    title: "Finance Operations",
    roleDescription,
    visibility: "private",
    ...extra,
  };
}

const limitMessage = "What it does must be text between 1 and 1000 characters.";

describe("a Bot made in the app", () => {
  test("takes 1,000 characters on create and refuses 1,001", async () => {
    const app = appFor(await createOwner());

    const accepted = await send(
      app,
      "POST",
      "/api/agents",
      handMadeBody("a".repeat(1000)),
    );
    expect(accepted.status).toBe(201);

    const refused = await send(
      app,
      "POST",
      "/api/agents",
      handMadeBody("a".repeat(1001)),
    );
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: limitMessage });
  });

  test("takes 1,000 characters on edit and refuses 1,001", async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const created = await send(
      app,
      "POST",
      "/api/agents",
      handMadeBody("Reviews receipts."),
    );
    const id = ((await created.json()) as { agent: { id: string } }).agent.id;

    const accepted = await send(
      app,
      "PATCH",
      `/api/agents/${id}`,
      handMadeBody("a".repeat(1000)),
    );
    expect(accepted.status).toBe(200);

    const refused = await send(
      app,
      "PATCH",
      `/api/agents/${id}`,
      handMadeBody("a".repeat(1001)),
    );
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: limitMessage });
  });

  test("keeps 1,000 when a body claims the imported fact, on create and on edit", async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const claim = { importedMember: true, imported: true };

    const refusedOnCreate = await send(
      app,
      "POST",
      "/api/agents",
      handMadeBody("a".repeat(1001), claim),
    );
    expect(refusedOnCreate.status).toBe(400);

    const created = await send(
      app,
      "POST",
      "/api/agents",
      handMadeBody("Reviews receipts.", claim),
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { agent: { id: string } }).agent.id;

    const refusedOnEdit = await send(
      app,
      "PATCH",
      `/api/agents/${id}`,
      handMadeBody("a".repeat(1001), claim),
    );
    expect(refusedOnEdit.status).toBe(400);
    expect(await refusedOnEdit.json()).toEqual({ error: limitMessage });
  });
});
