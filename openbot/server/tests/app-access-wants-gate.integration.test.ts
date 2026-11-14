import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Message } from "@ag-ui/client";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import { type AuditInitiator, createAuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  appAccessRequests,
  approvalPreferences,
  approvalRequests,
  approvalRules,
  credentials,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  skills,
  users,
} from "../src/db/schema";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import { createPluginRoutes } from "../src/plugins/routes";
import { createSharedUseStore } from "../src/plugins/shared-use-store";
import { createPluginStore } from "../src/plugins/store";
import {
  createPrivateShareCheck,
  PRIVATE_SHARE_TOOL_REF,
} from "../src/proactive/private-share";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { FakeGmail } from "./support/fake-imap";

/**
 * A send tool that reaches a Bot through a request still asks (issue #102, and docs/M1_PLAN.md D24, D27).
 *
 * The whole way: a connector connected before `gmail_send_message` existed, the start-up refresh that
 * adds the row and grants nothing, the person's request, the administrator naming the tool, and then
 * the REAL approval gate on the REAL plugin store with the mailbox behind it. The grant is what makes
 * the tool callable and the gate is what decides whether a call goes out: an address the person did not
 * type waits for them with a card and sends nothing, and one their own message names goes out at once
 * exactly as it did before this change — the rule that is the person's own written request.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_wants_gate_${suite}`;
const admin = `user_wants_admin_${suite}`;
const botId = `agent_wants_gate_${suite}`;
const SKILL = `skill-wants-gate-${suite}`;
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

const SEND = `${GOOGLE_APP_PASSWORD}/gmail_send_message`;
const HELD = [
  "gmail_search_messages",
  "gmail_read_message",
  "gmail_send_reply",
  "calendar_list_events",
];

const approvals = createApprovalStore(database);
const service = createApprovalService(approvals, undefined, undefined, {
  review: async () =>
    JSON.stringify({
      verdict: "proceed",
      preApproved: true,
      safety: "none",
      reason: "Test reviewer.",
    }),
});
const gmail = new FakeGmail();
const imapTransport = createGoogleImapTransport({
  imap: gmail.imap,
  smtp: gmail.smtp,
  fetch: async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
  now: () => new Date("2026-10-22T20:00:00Z"),
});
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  approvalGate: (candidate) => service.gate(candidate),
  privateShareCheck: createPrivateShareCheck({ approvals }),
  verifyUserSecret: async () => ({ ok: true, calendar: false }),
  callVendor: (connection, toolName, args) =>
    imapTransport.callTool(connection, toolName, args),
});

function appAs(actorId: string, role: "admin" | "user") {
  const signedIn: MiddlewareHandler<{ Variables: AppVariables }> = async (
    context,
    next,
  ) => {
    context.set("actor", {
      id: actorId,
      email: `${actorId}@example.test`,
      role,
    } as never);
    await next();
  };
  return new Hono().route(
    "/api/plugins",
    createPluginRoutes(
      store,
      signedIn,
      async () => true,
      undefined,
      undefined,
      {
        modes: {} as never,
        use: createSharedUseStore(database, "composio"),
      },
    ),
  );
}

const post = (body?: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const PERSON: AuditInitiator = { kind: "person" };
const typed = (content: string): Message => ({
  id: `msg-${randomUUID()}`,
  role: "user",
  content,
});

/** A send inside a run that can wait for the person, as a Bot's turn makes it. */
function inTurn<T>(messages: Message[], run: () => Promise<T>) {
  const context: ApprovalContinuation = {
    runId: randomUUID(),
    threadId: `thread-${randomUUID()}`,
    toolCallId: randomUUID(),
    toolName: "gmail_send_message",
    args: {},
    messages,
    state: {},
    context: [],
    forwardedProps: {},
  };
  return withApprovalContext(context, run);
}

const email = (to: string[]) => ({
  to,
  subject: "Good morning",
  body: "Good morning, Ana. The mugs ship on Tuesday and I will send the tracking number as soon as I have it. Have a lovely day. Maya",
});
const send = (to: string[]) =>
  store.callTool({
    ref: SEND,
    args: email(to),
    botId,
    actorId: owner,
    initiator: PERSON,
  });
const pending = async () =>
  (await approvals.list(owner)).filter(
    (request) => request.status === "pending",
  );

const grantedRefs = async () =>
  (
    await database
      .select({ ref: pluginGrants.ref, kind: pluginGrants.kind })
      .from(pluginGrants)
      .where(eq(pluginGrants.agentId, botId))
  )
    .filter((grant) => grant.kind === "mcp")
    .map((grant) => grant.ref)
    .sort();

let serverExisted = false;

beforeAll(async () => {
  for (const user of [owner, admin])
    await database.insert(users).values({
      id: user,
      email: `${user}@wants-gate.test`,
      name: user,
      emailVerified: false,
    });
  await database.insert(agents).values({
    id: botId,
    name: botId,
    type: "remote_ag_ui",
    configuration: {},
  });
  await database.insert(agentProfiles).values({
    agentId: botId,
    ownerUserId: owner,
    title: "",
    roleDescription: "",
    avatarSeed: botId,
    visibility: "private",
  });
  const [existing] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  serverExisted = existing !== undefined;
  // Wiped so what follows is this connector as this suite sets it up, whoever used it before.
  await database
    .delete(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  await store.addServer({ key: GOOGLE_APP_PASSWORD, by: owner });
  await store.connectUserSecret({
    serverId: GOOGLE_APP_PASSWORD,
    userId: owner,
    body: { address: "maya@example.com", appPassword: "qwertyuiopasdfgh" },
  });
  // The Bot as an older build set it up: every Gmail tool but the one that sends, and the skill that
  // sends. The skill is saved while the tool is known, as the API requires, and the tool then
  // disappears from the stored list as it was never there for a deployment that predates it.
  await store.installSkill({
    slug: SKILL,
    title: "Send a new email",
    summary: "Write to somebody who has not written first.",
    instructions: "Send it with gmail_send_message.",
    ownerUserId: null,
    tools: [SEND],
    by: owner,
  });
  await store.grant("skill", SKILL, botId, owner);
  for (const name of HELD)
    await store.grant("mcp", `${GOOGLE_APP_PASSWORD}/${name}`, botId, owner);
  await database
    .delete(mcpTools)
    .where(
      and(
        eq(mcpTools.serverId, GOOGLE_APP_PASSWORD),
        eq(mcpTools.name, "gmail_send_message"),
      ),
    );
});

afterAll(async () => {
  await database
    .delete(approvalRequests)
    .where(eq(approvalRequests.ownerUserId, owner));
  await database
    .delete(approvalRules)
    .where(eq(approvalRules.ownerUserId, owner));
  await database
    .delete(approvalPreferences)
    .where(eq(approvalPreferences.ownerUserId, owner));
  await database
    .delete(appAccessRequests)
    .where(inArray(appAccessRequests.requestedBy, [owner, admin]));
  await database.delete(pluginGrants).where(eq(pluginGrants.agentId, botId));
  await database.delete(skills).where(eq(skills.slug, SKILL));
  await database
    .delete(mcpUserCredentials)
    .where(eq(mcpUserCredentials.userId, owner));
  await database
    .delete(credentials)
    .where(
      and(
        eq(credentials.keyId, owner),
        eq(credentials.provider, GOOGLE_APP_PASSWORD),
      ),
    );
  if (!serverExisted)
    await database
      .delete(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  await database.delete(agentProfiles).where(eq(agentProfiles.agentId, botId));
  await database.delete(agents).where(eq(agents.id, botId));
  await database.delete(users).where(inArray(users.id, [owner, admin]));
  await database.$client.close();
});

describe("a send tool that arrived after the Bot was set up", () => {
  test("is added at start, granted to nobody, and then asked for once", async () => {
    // The tool does not exist for this deployment until the start-up refresh.
    expect(
      await database
        .select({ name: mcpTools.name })
        .from(mcpTools)
        .where(
          and(
            eq(mcpTools.serverId, GOOGLE_APP_PASSWORD),
            eq(mcpTools.name, "gmail_send_message"),
          ),
        ),
    ).toEqual([]);
    const before = await grantedRefs();

    await store.refreshBuiltInTools();

    expect(await grantedRefs()).toEqual(before);
    expect(before).not.toContain(SEND);
    const state = await appAs(owner, "user").request(
      `/api/plugins/for/${botId}/apps/${GOOGLE_APP_PASSWORD}`,
    );
    const { app } = (await state.json()) as {
      app: {
        state: string;
        requestKind: string | null;
        wants?: { ref: string; label: string; read: boolean }[];
      };
    };
    expect(app.state).toBe("ready");
    expect(app.requestKind).toBe("grant");
    expect(app.wants).toEqual([
      expect.objectContaining({
        ref: SEND,
        label: "Send a new email",
        // A send is never a read, whatever else the vendor says.
        read: false,
      }),
    ]);
  });

  test("the person asks, the administrator names the tool, and the Bot holds it", async () => {
    const filed = await appAs(owner, "user").request(
      "/api/plugins/access-requests",
      post({ agentId: botId, app: GOOGLE_APP_PASSWORD }),
    );
    expect(filed.status).toBe(201);
    const { request } = (await filed.json()) as { request: { id: string } };

    // Pressed with no tool named, a send is not among the read-only tools, so nothing is given.
    const plain = await appAs(admin, "admin").request(
      `/api/plugins/access-requests/${request.id}/approve`,
      post(),
    );
    expect(plain.status).toBe(409);
    expect(await grantedRefs()).not.toContain(SEND);

    const named = await appAs(admin, "admin").request(
      `/api/plugins/access-requests/${request.id}/approve`,
      post({ refs: [SEND] }),
    );
    expect(named.status).toBe(200);
    expect(await grantedRefs()).toContain(SEND);
  });

  test("an address the person did not type still asks, with a card, and sends nothing", async () => {
    gmail.sent.length = 0;

    const outcome = await inTurn(
      [typed("Please write to my friend Ana and say good morning")],
      () => send(["ana@example.com"]),
    ).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
    expect(gmail.sent).toEqual([]);
    const asked = await pending();
    expect(asked).toHaveLength(1);
    expect(asked[0]?.action.toolRef).toBe(PRIVATE_SHARE_TOOL_REF);
    expect(asked[0]?.action.policy?.source).toBe("always_ask");
    for (const request of asked)
      await approvals.decide(owner, request.id, "deny");
  });

  test("an address their own message names goes out at once, exactly as before", async () => {
    gmail.sent.length = 0;

    const result = await inTurn(
      [typed("Write to ana@example.com saying good morning")],
      () => send(["ana@example.com"]),
    );

    expect(result.isError).toBe(false);
    expect(gmail.sent).toHaveLength(1);
    expect(await pending()).toEqual([]);
  });
});
