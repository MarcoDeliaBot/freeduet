import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import {
  type EnterpriseControls,
  installEnterpriseControls,
} from "../src/admin/controls";
import { createEnterpriseAdminRoutes } from "../src/admin/routes";
import { createAuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import type { ComputerProvider } from "../src/computer/provider";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  capabilitySettings,
  enterpriseSettings,
  networkPolicies,
  userRoles,
  users,
} from "../src/db/schema";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * "Home and office network access" (D36) from the administrator's screen to the wire, against a real
 * PostgreSQL: the capability row an administrator saves, the snapshot the controls rebuild from it,
 * the policy each person's Bots are under, and the body a running computer is actually sent.
 *
 * The computer here is a socket on loopback that records what it is pushed; the server pushes to it
 * with the same `fetch` it uses in production. Needs a database at the current TS schema
 * (TEST_DATABASE_URL).
 */
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const admin = {
  id: `pn-admin-${suite}`,
  email: `pn-admin-${suite}@acme.test`,
};
const member = {
  id: `pn-member-${suite}`,
  email: `pn-member-${suite}@acme.test`,
};
const outsider = {
  id: `pn-outsider-${suite}`,
  email: `pn-outsider-${suite}@acme.test`,
};
const bot = `pn-bot-${suite}`;
const outsiderBot = `pn-outsider-bot-${suite}`;

/** What each computer was pushed, newest last. */
const pushed: { bot: string | null; body: unknown }[] = [];
const computer = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    pushed.push({
      bot: request.headers.get("x-openbot-bot-id"),
      body: await request.json().catch(() => null),
    });
    return Response.json({ ok: true });
  },
});

const provider: ComputerProvider = {
  name: "fake",
  isolation: "per-bot",
  locate: async () => `http://127.0.0.1:${computer.port}`,
  status: async (botId) => ({ botId, state: "ready" }),
  stop: async () => ({ wasRunning: true }),
  reset: async () => ({ cleared: false }),
  list: async () =>
    [bot, outsiderBot].map((botId) => ({
      botId,
      status: "running" as const,
      url: `http://127.0.0.1:${computer.port}`,
    })),
};

let controls: EnterpriseControls;

async function clean() {
  await database.delete(capabilitySettings);
  await database.delete(enterpriseSettings);
  await database.delete(networkPolicies);
}

beforeAll(async () => {
  await clean();
  await database.insert(users).values([
    { ...admin, name: "Admin" },
    { ...member, name: "Member", groups: ["lab"] },
    { ...outsider, name: "Outsider" },
  ]);
  await database.insert(userRoles).values({ userId: admin.id, role: "admin" });
  for (const [id, owner] of [
    [bot, member],
    [outsiderBot, outsider],
  ] as const) {
    await database.insert(agents).values({
      id,
      name: "Private network test Bot",
      type: "built_in",
      configuration: {},
    });
    await database.insert(agentProfiles).values({
      agentId: id,
      ownerUserId: owner.id,
      title: "Test",
      roleDescription: "Test",
      avatarSeed: "x",
      visibility: "private",
    });
  }
  controls = await installEnterpriseControls({
    database,
    databaseUrl: testDatabaseUrl(),
    auditStore: createAuditStore(database),
    provider,
    builtInModel: "openai/gpt-test",
    env: {},
  });
});

afterAll(async () => {
  // A push the last change started is still on its way: let it land before the computer goes.
  await controls?.pushNetworkPolicies();
  await controls?.stop();
  computer.stop(true);
  await clean();
  await database.delete(agents).where(like(agents.id, `%${suite}%`));
  await database.delete(users).where(like(users.email, `%${suite}%`));
  await database.$client.close();
});

const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
  context,
  next,
) => {
  context.set("actor", { ...admin, role: "admin" });
  await next();
};
const asAdmin = new Hono<{ Variables: AppVariables }>();
asAdmin.route(
  "/api/admin/enterprise",
  createEnterpriseAdminRoutes(requireUser),
);

const put = (path: string, body: unknown) =>
  asAdmin.request(`/api/admin/enterprise${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * What a Bot's computer is sent by a fresh push.
 *
 * A change already started a push of its own, whose request may have landed before this test looked,
 * so the first call waits that one out and only the second is the one read.
 */
async function pushFor(botId: string): Promise<unknown> {
  await controls.pushNetworkPolicies();
  pushed.length = 0;
  await controls.pushNetworkPolicies();
  return pushed.findLast((push) => push.bot === botId)?.body;
}

const setSwitch = (
  scopeKind: "organization" | "role" | "group",
  scopeId: string,
  allowed: boolean | null,
  capability = "cloudPrivateNetwork",
) => put("/capabilities", { scopeKind, scopeId, capability, allowed });

describe("Home and office network access, from the screen to the computer", () => {
  test("the screen lists it, off by default, and nobody's Bot is told otherwise", async () => {
    const screen = await asAdmin.request("/api/admin/enterprise");
    const listed = (
      (await screen.json()) as {
        capabilities: {
          capability: string;
          title: string;
          default: boolean;
          organization: boolean | null;
        }[];
      }
    ).capabilities.find((entry) => entry.capability === "cloudPrivateNetwork");
    expect(listed).toMatchObject({
      title: "Home and office network access",
      default: false,
      organization: null,
    });
    expect(
      (await controls.capabilitiesFor(member.id)).cloudPrivateNetwork,
    ).toBe(false);
    // The policy a Bot is pushed is what it always was: no key for the switch at all.
    expect(await controls.policyForBot(bot)).toStrictEqual({
      mode: "allow_all",
      rules: [],
    });
  });

  test("an administrator turns it on for everybody, and the computer is pushed the switch", async () => {
    expect((await setSwitch("organization", "", true)).status).toBe(200);
    expect(
      (await controls.capabilitiesFor(member.id)).cloudPrivateNetwork,
    ).toBe(true);
    expect(await controls.policyForBot(bot)).toStrictEqual({
      mode: "allow_all",
      rules: [],
      allowPrivateNetwork: true,
    });

    expect(await pushFor(bot)).toEqual({
      policy: { mode: "allow_all", rules: [], allowPrivateNetwork: true },
    });

    // Cleared, the Bot falls back to the default, and the next push says nothing about the switch.
    expect((await setSwitch("organization", "", null)).status).toBe(200);
    const afterwards = await pushFor(bot);
    expect(afterwards).toEqual({ policy: { mode: "allow_all", rules: [] } });
    expect(JSON.stringify(afterwards)).not.toContain("allowPrivateNetwork");
  });

  test("a group grants it to its members' Bots and to nobody else's", async () => {
    await setSwitch("organization", "", false);
    await setSwitch("group", "lab", true);
    expect(await controls.policyForBot(bot)).toStrictEqual({
      mode: "allow_all",
      rules: [],
      allowPrivateNetwork: true,
    });
    expect(await controls.policyForBot(outsiderBot)).toStrictEqual({
      mode: "allow_all",
      rules: [],
    });
    await setSwitch("group", "lab", null);
    expect(await controls.policyForBot(bot)).toStrictEqual({
      mode: "allow_all",
      rules: [],
    });
    await setSwitch("organization", "", null);
  });

  test("a role row replaces the organization's, so administrators can have it alone", async () => {
    await setSwitch("organization", "", false);
    await setSwitch("role", "admin", true);
    // The Bots' owners here are ordinary users, so the administrators' grant reaches neither.
    expect(
      (await controls.policyForBot(bot)).allowPrivateNetwork,
    ).toBeUndefined();
    expect((await controls.capabilitiesFor(admin.id)).cloudPrivateNetwork).toBe(
      true,
    );
    expect(
      (await controls.capabilitiesFor(member.id)).cloudPrivateNetwork,
    ).toBe(false);
    await setSwitch("role", "admin", null);
    await setSwitch("organization", "", null);
  });

  test("the network capability keeps its meaning: off, a Bot is deny_all and the new switch changes nothing", async () => {
    expect((await setSwitch("organization", "", true)).status).toBe(200);
    expect(
      (await setSwitch("organization", "", false, "cloudNetwork")).status,
    ).toBe(200);
    expect(await controls.policyForBot(bot)).toStrictEqual({
      mode: "deny_all",
      rules: [],
    });
    await setSwitch("organization", "", null, "cloudNetwork");
    await setSwitch("organization", "", null);
  });

  test("an allowlist an administrator saved is pushed as written, whatever the switch says", async () => {
    expect((await setSwitch("organization", "", true)).status).toBe(200);
    expect(
      (
        await put("/network", {
          scopeKind: "organization",
          mode: "allowlist_only",
          rules: [{ type: "domain", value: "example.com" }],
        })
      ).status,
    ).toBe(200);
    expect(await controls.policyForBot(bot)).toStrictEqual({
      mode: "allowlist_only",
      rules: [{ type: "domain", value: "example.com" }],
    });
    await database
      .delete(networkPolicies)
      .where(eq(networkPolicies.scopeKind, "organization"));
    await controls.refresh();
    await setSwitch("organization", "", null);
  });
});
