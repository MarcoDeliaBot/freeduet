import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../src/auth/guards";
import { remoteMayReach } from "../src/auth/remote-limits";
import { createAuditStore } from "../src/audit";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  credentials,
  mailRules,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  users,
} from "../src/db/schema";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { CREATE_RULE } from "../src/plugins/mail-rules";
import { createPluginRoutes } from "../src/plugins/routes";
import { createPluginStore } from "../src/plugins/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The person's own list of mail rules (docs/design/mail-rules.md): see them, switch one off or on, delete
 * one, and nothing else. There is no route that makes one. Everything is scoped to the signed-in person, and
 * the whole family sits under /api/plugins, which a remote session may not reach.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const maya = `user_rules_route_${suite}`;
const noor = `user_rules_route_other_${suite}`;
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  policy: () => ({ mode: "enforce", deny: [], allow: ["true"] }),
  verifyUserSecret: async () => ({ ok: true, calendar: false }),
});
const as = (id: string) => {
  const signedIn: MiddlewareHandler<{ Variables: AppVariables }> = async (
    context,
    next,
  ) => {
    context.set("actor", {
      id,
      email: `${id}@rules.test`,
      role: "member",
    } as never);
    await next();
  };
  return new Hono().route(
    "/api/plugins",
    createPluginRoutes(store, signedIn, async () => true),
  );
};
let existed = true;
const make = async (userId: string, args: Record<string, unknown>) =>
  JSON.parse(
    (
      await store.handleRuleTool({
        serverId: GOOGLE_APP_PASSWORD,
        toolName: CREATE_RULE,
        args,
        userId,
      })
    ).text,
  ).ruleId as string;

beforeAll(async () => {
  await database.insert(users).values([
    {
      id: maya,
      email: `${maya}@rules.test`,
      name: "Maya",
      emailVerified: false,
    },
    {
      id: noor,
      email: `${noor}@rules.test`,
      name: "Noor",
      emailVerified: false,
    },
  ]);
  const [row] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  existed = row !== undefined;
  await store.addServer({ key: GOOGLE_APP_PASSWORD, by: maya });
});
afterAll(async () => {
  await database
    .delete(mailRules)
    .where(inArray(mailRules.userId, [maya, noor]));
  await database
    .delete(mcpUserCredentials)
    .where(inArray(mcpUserCredentials.userId, [maya, noor]));
  await database
    .delete(credentials)
    .where(inArray(credentials.keyId, [maya, noor]));
  if (!existed) {
    await database
      .delete(mcpTools)
      .where(eq(mcpTools.serverId, GOOGLE_APP_PASSWORD));
    await database
      .delete(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  }
  await database.delete(users).where(inArray(users.id, [maya, noor]));
  await database.$client.close();
});

describe("the list of mail rules on the person's own page", () => {
  test("lists the person's rules in words, with the last run, and nobody else's", async () => {
    const id = await make(maya, { fromDomain: "github.com", archive: true });
    await make(noor, { fromDomain: "example.net", archive: true });
    const mine = await as(maya).request("/api/plugins/mail-rules");
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as {
      rules: {
        id: string;
        inWords: string;
        enabled: boolean;
        lastRunAt: string | null;
        lastError: string | null;
      }[];
    };
    expect(body.rules.map((r) => r.id)).toEqual([id]);
    expect(body.rules[0]?.inWords).toBe(
      "From now on, mail from the domain github.com: archive.",
    );
    expect(body.rules[0]).toMatchObject({
      enabled: true,
      lastRunAt: null,
      lastError: null,
    });
    const theirs = (await (
      await as(noor).request("/api/plugins/mail-rules")
    ).json()) as { rules: unknown[] };
    expect(theirs.rules).toHaveLength(1);
  });

  test("Disable and Enable switch the rule; Delete removes it", async () => {
    const id = await make(maya, {
      fromDomain: "disable.example.com",
      archive: true,
    });
    const post = (enabled: unknown) =>
      as(maya).request(`/api/plugins/mail-rules/${id}/enabled`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    expect((await post(false)).status).toBe(200);
    expect(
      (await store.listMailRules(maya)).find((r) => r.id === id)?.enabled,
    ).toBe(false);
    expect((await post(true)).status).toBe(200);
    expect(
      (await store.listMailRules(maya)).find((r) => r.id === id)?.enabled,
    ).toBe(true);
    expect((await post("yes")).status).toBe(400);
    expect(
      (
        await as(maya).request(`/api/plugins/mail-rules/${id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      (await store.listMailRules(maya)).find((r) => r.id === id),
    ).toBeUndefined();
  });

  test("another person's rule is a 404 to switch or delete, and stays as it was", async () => {
    const id = await make(maya, {
      fromDomain: "keep.example.com",
      archive: true,
    });
    const res = await as(noor).request(
      `/api/plugins/mail-rules/${id}/enabled`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      },
    );
    expect(res.status).toBe(404);
    expect(
      (
        await as(noor).request(`/api/plugins/mail-rules/${id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);
    expect(
      (await store.listMailRules(maya)).find((r) => r.id === id)?.enabled,
    ).toBe(true);
  });

  test("there is no route that makes a rule", async () => {
    const res = await as(maya).request("/api/plugins/mail-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromDomain: "x.example.com", archive: true }),
    });
    expect([404, 405]).toContain(res.status);
  });

  test("a remote session reaches none of it", () => {
    expect(remoteMayReach("GET", "/api/plugins/mail-rules")).toBe(false);
    expect(remoteMayReach("POST", "/api/plugins/mail-rules/abc/enabled")).toBe(
      false,
    );
    expect(remoteMayReach("DELETE", "/api/plugins/mail-rules/abc")).toBe(false);
  });
});
