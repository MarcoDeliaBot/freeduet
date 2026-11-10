import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agents,
  credentials,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  users,
} from "../src/db/schema";
import { loadConfig } from "../src/config";
import { createMemoryIngestion } from "../src/memory/ingestion";
import { buildMorningBrief } from "../src/openduet/brief";
import {
  createSetupSources,
  type SetupRow,
  setupRows,
} from "../src/openduet/setup";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import { createPluginStore } from "../src/plugins/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";
import { FakeGmail, hexOf, textMail } from "./support/fake-imap";

/**
 * (h) Everything that reads Gmail and Calendar works for a person who has connected only the
 * app-password way.
 *
 * The readers are the places that named the OAuth entry before there was another: the morning brief,
 * the first-day checklist, the app-access state a Bot's page and the chat card read, and a memory
 * source. Each is driven here against the real plugin store on a real database, with the mailbox and
 * the calendar behind the transport's factories, and with NO OAuth connection, client or grant
 * anywhere: the person has pasted an app password and nothing else.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const serverId = GOOGLE_APP_PASSWORD;
const botId = `agent_readers_${suite}`;
const bareBotId = `agent_readers_bare_${suite}`;
const maya = `user_readers_maya_${suite}`;
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const TOOLS = [
  "gmail_search_messages",
  "gmail_read_message",
  "gmail_send_reply",
  "calendar_list_events",
];
const NOW = new Date("2026-10-22T15:00:00Z");

const CALENDAR = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example//Calendar//EN",
  "X-WR-TIMEZONE:America/Los_Angeles",
  "BEGIN:VEVENT",
  "UID:studio@google.com",
  "DTSTART;TZID=America/Los_Angeles:20261022T150000",
  "DTEND;TZID=America/Los_Angeles:20261022T160000",
  "SUMMARY:Studio visit with Hearth & Co",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const gmail = new FakeGmail();
const transport = createGoogleImapTransport({
  imap: gmail.imap,
  smtp: gmail.smtp,
  fetch: async () => new Response(CALENDAR),
  now: () => NOW,
});

const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  verifyUserSecret: async () => ({ ok: true, calendar: true }),
  callVendor: (connection, toolName, args) =>
    transport.callTool(connection, toolName, args),
});

let serverWasThere = false;

beforeAll(async () => {
  const [existing] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId));
  serverWasThere = existing !== undefined;
  for (const id of [botId, bareBotId]) {
    await database
      .insert(agents)
      .values({ id, name: id, type: "remote_ag_ui", configuration: {} })
      .onConflictDoNothing();
  }
  await database
    .insert(users)
    .values({
      id: maya,
      email: `${maya}@example.test`,
      name: "Maya Okafor",
      emailVerified: false,
    })
    .onConflictDoNothing();
  await store.addServer({ key: serverId, by: maya });
  for (const name of TOOLS) {
    await database
      .insert(pluginGrants)
      .values({ kind: "mcp", ref: `${serverId}/${name}`, agentId: botId })
      .onConflictDoNothing();
  }
  gmail.messages = [
    textMail({
      uid: 1,
      emailId: BigInt("0x18f3a0c2d4e5b601").toString(),
      threadId: BigInt("0x18f3a0c2d4e5b600").toString(),
      headers: {
        From: "Ana Pereira <ana@hearthandco.com>",
        To: "maya@example.com",
        Subject: "Friday ship date?",
        Date: "Thu, 22 Oct 2026 07:10:00 -0700",
        "Message-ID": "<n01@hearthandco.com>",
      },
      body: "Can you confirm the mugs still ship Friday? I need to tell stores today.",
    }),
    textMail({
      uid: 2,
      emailId: BigInt("0x18f3a0c2d4e5b6ff").toString(),
      threadId: BigInt("0x18f3a0c2d4e5b6fe").toString(),
      flags: ["\\Seen"],
      date: "2026-10-22T13:30:00.000Z",
      headers: {
        From: "Ceramics Monthly <news@ceramicsmonthly.example>",
        To: "maya@example.com",
        Subject: "10 glazes for fall",
        Date: "Thu, 22 Oct 2026 06:00:00 -0700",
        "List-Unsubscribe": "<mailto:unsubscribe@ceramicsmonthly.example>",
        Precedence: "bulk",
      },
      body: "This month: ten glazes.",
    }),
  ];
  gmail.searches.set("in:inbox newer_than:1d", [1, 2]);
  gmail.searches.set("(in:inbox newer_than:1d) category:promotions", [2]);
});

afterAll(async () => {
  await database
    .delete(mcpUserCredentials)
    .where(
      and(
        eq(mcpUserCredentials.serverId, serverId),
        eq(mcpUserCredentials.userId, maya),
      ),
    );
  await database
    .delete(credentials)
    .where(
      and(eq(credentials.provider, serverId), eq(credentials.keyId, maya)),
    );
  await database.delete(pluginGrants).where(
    and(
      eq(pluginGrants.agentId, botId),
      inArray(
        pluginGrants.ref,
        TOOLS.map((name) => `${serverId}/${name}`),
      ),
    ),
  );
  if (!serverWasThere) {
    await database.delete(mcpTools).where(eq(mcpTools.serverId, serverId));
    await database.delete(mcpServers).where(eq(mcpServers.id, serverId));
  }
  await database.delete(agents).where(inArray(agents.id, [botId, bareBotId]));
  await database.delete(users).where(eq(users.id, maya));
  await database.$client.close();
});

const inspect = (agentId: string) =>
  store.inspectApp({
    app: serverId,
    agentId,
    userId: maya,
    composioConfigured: false,
  });

const connectMaya = () =>
  store.connectUserSecret({
    serverId,
    userId: maya,
    body: {
      address: "maya@example.com",
      appPassword: "qwertyuiopasdfgh",
      calendarUrl:
        "https://calendar.google.com/calendar/ical/maya%40example.com/private-4f9a1c2b7d/basic.ics",
    },
  });

describe("app access, the state a Bot's page and the chat card read", () => {
  test("a Bot without the tools is not granted, whatever the person has done", async () => {
    expect((await inspect(bareBotId))?.access).toMatchObject({
      state: "not_granted",
    });
  });

  test("a Bot with the tools and a person who has pasted nothing: not connected, and it is a personal account connected on the app's own page", async () => {
    const found = await inspect(botId);
    expect(found?.access).toMatchObject({
      key: serverId,
      displayName: "Gmail and Google Calendar (app password)",
      account: "personal",
      connect: "key",
      state: "not_connected",
      unavailable: null,
    });
  });

  test("once the person has pasted a working app password it is ready, with no OAuth client or credential anywhere", async () => {
    await connectMaya();
    expect((await inspect(botId))?.access).toMatchObject({ state: "ready" });
    const [row] = await database
      .select({ credentialId: mcpServers.credentialId })
      .from(mcpServers)
      .where(eq(mcpServers.id, serverId));
    expect(row?.credentialId).toBeNull();
  });

  test("another person is not ready on the strength of this one's", async () => {
    const other = await store.inspectApp({
      app: serverId,
      agentId: botId,
      userId: `someone_else_${suite}`,
      composioConfigured: false,
    });
    expect(other?.access).toMatchObject({ state: "not_connected" });
  });

  test("the connections list names it, so the page, the offboarding sweeps and the memory page see it", async () => {
    const connections = await store.connectionsFor(maya);
    expect(
      connections.some((connection) => connection.serverId === serverId),
    ).toBe(true);
  });
});

describe("the morning brief", () => {
  test("sorts the inbox and reads today's calendar through the app-password tools alone", async () => {
    const asked: string[] = [];
    const brief = await buildMorningBrief(
      {
        callTool: (request) => {
          asked.push(request.ref);
          return store.callTool(request);
        },
        model: "test-model",
        now: () => NOW,
        complete: async () =>
          '{"verdict":"needs_you","reason":"Ana needs the Friday date confirmed today."}',
      },
      {
        actorId: maya,
        botId,
        initiator: { kind: "person" },
        person: { name: "Maya Okafor", email: "maya@example.com" },
      },
    );

    expect(brief.couldNotCheck).toEqual([]);
    expect(brief.checked.mail).toBe(2);
    expect(brief.needsYou.map((item) => item.id)).toEqual([
      hexOf(BigInt("0x18f3a0c2d4e5b601").toString()),
    ]);
    expect(brief.needsYou.map((item) => item.subject)).toEqual([
      "Friday ship date?",
    ]);
    // The promotion is sorted by the rule that reads bulk mail, as it is over OAuth.
    expect(brief.canWait).toEqual([
      expect.objectContaining({
        subject: "10 glazes for fall",
        decidedBy: "rule:bulk",
      }),
    ]);
    expect(brief.calendar.map((event) => event.summary)).toEqual([
      "Studio visit with Hearth & Co",
    ]);
    // The OAuth connector was asked first and refused, and the app-password one answered.
    expect(asked).toEqual([
      "google-workspace/gmail_search_messages",
      "google-imap/gmail_search_messages",
      "google-workspace/calendar_list_events",
      "google-imap/calendar_list_events",
    ]);
  });

  test("a person who has connected neither is told what they have always been told", async () => {
    const brief = await buildMorningBrief(
      {
        callTool: (request) => store.callTool(request),
        model: "test-model",
        now: () => NOW,
        complete: async () => '{"verdict":"needs_you","reason":"x"}',
      },
      {
        actorId: `nobody_${suite}`,
        botId,
        initiator: { kind: "person" },
        person: { name: null, email: null },
      },
    );
    expect(brief.couldNotCheck.map((entry) => entry.source).sort()).toEqual([
      "Gmail",
      "Google Calendar",
    ]);
    expect(brief.needsYou).toEqual([]);
  });
});

describe("the first-day checklist", () => {
  const sources = () =>
    createSetupSources({
      productName: "OpenDuet",
      config: loadConfig(testEnvironment({})),
      environment: testEnvironment({}),
      model: {
        provider: "openai",
        keyId: "openai-api-key",
        defaultModel: "gpt-5.6-terra",
        plan: false,
      },
      credentials: { list: async () => [] },
      entitlements: async () => ({
        status: "ready",
        entitlement: {
          active: true,
          source: "selfHostedDeploymentLicense",
          features: {},
          limits: {},
        },
      }),
      plugins: {
        listServers: () => store.listServers(),
        inspectApp: (request) => store.inspectApp(request),
      },
      primaryBot: botId,
      computer: false,
      apps: { configured: false, provider: "composio" },
      chat: false,
    });

  const gmailRow = async (userId: string): Promise<SetupRow> => {
    const facts = await sources().facts(userId);
    const found = setupRows(facts, {
      productName: "OpenDuet",
      audience: "member",
    }).find((candidate) => candidate.id === "gmail");
    if (!found) throw new Error("no gmail row");
    return found;
  };

  test("a person who has connected with an app password has Gmail and Calendar ready, with no public address and no OAuth client", async () => {
    expect(await gmailRow(maya)).toMatchObject({ ready: true });
  });

  test("a person who has not is sent to connect it the app-password way, not told Google needs setting up first", async () => {
    const row = await gmailRow(`nobody_${suite}`);
    expect(row).toMatchObject({
      ready: false,
      fix: { kind: "connect", serverId },
    });
  });
});

describe("a memory source", () => {
  const ingestion = () =>
    createMemoryIngestion({
      store: {} as never,
      plugins: store,
      canUseBot: async () => true,
    });
  const source = (ownerUserId: string) => ({
    ownerUserId,
    agentId: botId,
    toolRef: `${serverId}/gmail_search_messages`,
  });

  test("can read the mailbox of a person who has connected it", async () => {
    await expect(ingestion().authorize(source(maya))).resolves.toBeDefined();
  });

  test("is refused, with the sentence for reconnecting, for a person who has not", async () => {
    await expect(
      ingestion().authorize(source(`nobody_${suite}`)),
    ).rejects.toThrow(/Reconnect this app/);
  });

  test("is refused once the person ends the connection", async () => {
    await store.disconnectUserSecret({ serverId, userId: maya, by: maya });
    await expect(ingestion().authorize(source(maya))).rejects.toThrow(
      /Reconnect this app/,
    );
  });
});
