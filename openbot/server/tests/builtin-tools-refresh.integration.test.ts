import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AuditEventInput, AuditStore } from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agents,
  mcpServers,
  mcpTools,
  pluginGrants,
  users,
} from "../src/db/schema";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { useComposioClient } from "../src/plugins/composio";
import { listTools as imapListTools } from "../src/plugins/google-imap";
import { createPluginStore, type PluginStore } from "../src/plugins/store";
import { listsFromCode } from "../src/plugins/transport";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * A connector connected before a build gave it a tool gets the tool at the next start (issue #102).
 *
 * The connectors whose tool list is the build's own code are brought up to date by `refreshBuiltInTools`
 * and by nothing else; this file drives it against real tables, with the network made impossible so a
 * dial-out is a red rather than a quiet success. What it must never do is as much the subject as what
 * it does: it grants nothing, it writes nothing when nothing differs, it never asks a remote server, and
 * two replicas starting together leave one consistent list.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
// More replicas: each its own pool over the same tables, which is what several servers starting are.
const REPLICAS = 5;
const replicaDatabases = Array.from({ length: REPLICAS }, () =>
  createDatabase(testDatabaseUrl(), TEST_POOL),
);
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

const events: AuditEventInput[] = [];
const audit: AuditStore = {
  insert: async (event) => {
    events.push(event);
  },
};
const eventsOf = (change: string, serverId: string) =>
  events.filter(
    (event) =>
      event.targetId === serverId &&
      (event.payload as { change?: string } | undefined)?.change === change,
  );

const storeOn = (db: typeof database): PluginStore =>
  createPluginStore({
    brokerProvider: "composio",
    database: db,
    auditStore: audit,
    credentials: createCredentialStore(db),
    encryptionKey: "x".repeat(44),
    policy: () => policy,
  });
const store = storeOn(database);

const suite = randomUUID().slice(0, 8);
const person = `user_refresh_${suite}`;
const botA = `agent_refresh_a_${suite}`;
const botB = `agent_refresh_b_${suite}`;
const remote = `remote_${suite}`;
// The catalogue's key for Google Drive, which also lists from code.
const GOOGLE_DRIVE = "google-drive";

/** What the build lists for the app-password Gmail connector, by name. */
const built = async () => (await imapListTools()).map((tool) => tool.name);
/** A tool a model may be offered that is a write, and one that is a read, in that list. */
const SEND = "gmail_send_message";
const SEARCH = "gmail_search_messages";

const stored = async (serverId: string) =>
  database.select().from(mcpTools).where(eq(mcpTools.serverId, serverId));
const storedNames = async (serverId: string) =>
  (await stored(serverId)).map((tool) => tool.name).sort();
const grantsOf = async (...bots: string[]) =>
  (
    await database
      .select({ ref: pluginGrants.ref, agentId: pluginGrants.agentId })
      .from(pluginGrants)
      .where(inArray(pluginGrants.agentId, bots))
  )
    .map((grant) => `${grant.agentId}:${grant.ref}`)
    .sort();

/** Any request this process makes to the outside world, recorded and refused. */
const fetched: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetched.length = 0;
  events.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(input));
    throw new Error("The network is not available in this test.");
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  useComposioClient(null);
});

async function clearConnectors() {
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, [botA, botB]));
  await database
    .delete(mcpServers)
    .where(inArray(mcpServers.id, [GOOGLE_APP_PASSWORD, GOOGLE_DRIVE, remote]));
}

beforeAll(async () => {
  for (const id of [botA, botB])
    await database
      .insert(agents)
      .values({ id, name: id, type: "remote_ag_ui", configuration: {} });
  await database
    .insert(users)
    .values({ id: person, email: `${person}@example.test`, name: person });
  await clearConnectors();
});

afterAll(async () => {
  await clearConnectors();
  await database.delete(agents).where(inArray(agents.id, [botA, botB]));
  await database.delete(users).where(eq(users.id, person));
  for (const replica of replicaDatabases) await replica.$client.close();
  await database.$client.close();
});

/** The connector as an older build left it: every tool but the ones named, as `refreshTools` stored them. */
async function connectedBefore(without: string[]) {
  await clearConnectors();
  await store.addServer({ key: GOOGLE_APP_PASSWORD, by: person });
  await database
    .delete(mcpTools)
    .where(
      and(
        eq(mcpTools.serverId, GOOGLE_APP_PASSWORD),
        inArray(mcpTools.name, without),
      ),
    );
  // Held tools, the way a Bot that was set up on that older build holds them.
  for (const name of (await built()).filter((tool) => !without.includes(tool)))
    await database.insert(pluginGrants).values({
      kind: "mcp",
      ref: `${GOOGLE_APP_PASSWORD}/${name}`,
      agentId: botA,
    });
  events.length = 0;
}

describe("which connectors are asked at start", () => {
  test("only the four whose list is the build's own code", () => {
    expect(listsFromCode("google-imap")).toBe(true);
    expect(listsFromCode("google-workspace-rest")).toBe(true);
    expect(listsFromCode("google-drive-rest")).toBe(true);
    expect(listsFromCode("builtin-routines")).toBe(true);
    // A remote server, and both brokers, list over the network: never at start.
    expect(listsFromCode("mcp")).toBe(false);
    expect(listsFromCode("composio")).toBe(false);
    expect(listsFromCode("arcade")).toBe(false);
  });
});

describe("a connector connected before a tool existed", () => {
  test("gets the tool at the next start, and nothing is fetched", async () => {
    await connectedBefore([SEND]);
    expect(await storedNames(GOOGLE_APP_PASSWORD)).not.toContain(SEND);

    const outcome = await store.refreshBuiltInTools();

    expect(await storedNames(GOOGLE_APP_PASSWORD)).toEqual(
      (await built()).sort(),
    );
    expect(outcome.refreshed).toEqual([
      {
        serverId: GOOGLE_APP_PASSWORD,
        added: [SEND],
        changed: [],
        removed: [],
      },
    ]);
    // The new row is the one the build wrote, effect and all, so the approval gate classifies it.
    const row = (await stored(GOOGLE_APP_PASSWORD)).find(
      (tool) => tool.name === SEND,
    );
    expect(row?.description.length).toBeGreaterThan(0);
    expect(fetched).toEqual([]);
  });

  test("is told to the trail once, with what was added and that nothing was granted", async () => {
    await connectedBefore([SEND]);
    await store.refreshBuiltInTools();

    const [event, ...rest] = eventsOf(
      "builtin_tools_refreshed_at_start",
      GOOGLE_APP_PASSWORD,
    );
    expect(rest).toEqual([]);
    expect(event?.payload).toMatchObject({
      server: GOOGLE_APP_PASSWORD,
      added: [SEND],
      removed: [],
      changed: [],
    });
    expect(JSON.stringify(event?.payload)).toContain("Nothing was granted");
  });

  test("a tool that changed in the build is rewritten, and one the build withdrew is removed with its stranded grant recorded", async () => {
    await connectedBefore([]);
    await database
      .update(mcpTools)
      .set({ description: "What an older build said." })
      .where(
        and(
          eq(mcpTools.serverId, GOOGLE_APP_PASSWORD),
          eq(mcpTools.name, SEARCH),
        ),
      );
    await database.insert(mcpTools).values({
      serverId: GOOGLE_APP_PASSWORD,
      name: "gmail_old_tool",
      vendorName: "gmail_old_tool",
      description: "A tool an older build had.",
    });
    await database.insert(pluginGrants).values({
      kind: "mcp",
      ref: `${GOOGLE_APP_PASSWORD}/gmail_old_tool`,
      agentId: botB,
    });

    const outcome = await store.refreshBuiltInTools();

    expect(outcome.refreshed).toEqual([
      {
        serverId: GOOGLE_APP_PASSWORD,
        added: [],
        changed: [SEARCH],
        removed: ["gmail_old_tool"],
      },
    ]);
    const listed = await imapListTools();
    expect(
      (await stored(GOOGLE_APP_PASSWORD)).find((tool) => tool.name === SEARCH)
        ?.description,
    ).toBe(listed.find((tool) => tool.name === SEARCH)?.description);
    expect(await storedNames(GOOGLE_APP_PASSWORD)).not.toContain(
      "gmail_old_tool",
    );
    // The grant is left standing and the trail says it now points at nothing; nobody lost anything.
    expect(await grantsOf(botB)).toEqual([
      `${botB}:${GOOGLE_APP_PASSWORD}/gmail_old_tool`,
    ]);
    expect(
      eventsOf("grants_not_advertised", GOOGLE_APP_PASSWORD)[0]?.payload,
    ).toMatchObject({ refs: [`${GOOGLE_APP_PASSWORD}/gmail_old_tool`] });
  });
});

describe("a new tool is never granted by arriving", () => {
  test("not a write, not a read, not to the Bot that holds the rest, not to any other", async () => {
    // A read and a write, both missing from what the older build stored.
    await connectedBefore([SEND, "calendar_list_events"]);
    await database
      .insert(pluginGrants)
      .values({
        kind: "mcp",
        ref: `${GOOGLE_APP_PASSWORD}/${SEARCH}`,
        agentId: botB,
      })
      .onConflictDoNothing();
    const before = await grantsOf(botA, botB);

    const outcome = await store.refreshBuiltInTools();

    expect(outcome.refreshed[0]?.added).toEqual(["calendar_list_events", SEND]);
    // Not one grant row more or less, for either Bot.
    expect(await grantsOf(botA, botB)).toEqual(before);
    for (const bot of [botA, botB]) {
      const offered = (await store.listForAgent(bot)).tools.map(
        (tool) => tool.ref,
      );
      expect(offered).not.toContain(`${GOOGLE_APP_PASSWORD}/${SEND}`);
      expect(offered).not.toContain(
        `${GOOGLE_APP_PASSWORD}/calendar_list_events`,
      );
    }
  });
});

describe("a start that finds nothing to do", () => {
  test("writes nothing: no row rewritten, no stamp moved, nothing in the trail", async () => {
    await connectedBefore([SEND]);
    await store.refreshBuiltInTools();

    const rowsBefore = await stored(GOOGLE_APP_PASSWORD);
    const [serverBefore] = await database
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
    events.length = 0;

    const again = await store.refreshBuiltInTools();

    expect(again.refreshed).toEqual([]);
    expect(again.checked).toBeGreaterThan(0);
    expect(events).toEqual([]);
    const rowsAfter = await stored(GOOGLE_APP_PASSWORD);
    // Rows carry the instant they were written, so a rewritten row is visible even with equal content.
    expect(
      rowsAfter.map((row) => [row.name, row.createdAt.toISOString()]).sort(),
    ).toEqual(
      rowsBefore.map((row) => [row.name, row.createdAt.toISOString()]).sort(),
    );
    const [serverAfter] = await database
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
    expect(serverAfter?.toolsRefreshedAt).toEqual(
      serverBefore?.toolsRefreshedAt,
    );
    expect(serverAfter?.updatedAt).toEqual(serverBefore?.updatedAt);
  });

  test("a row the older build wrote without a vendor name is the same tool, not a different one", async () => {
    // `vendor_name` is nullable and null means "the same as the name": a rolling deploy writes both.
    await connectedBefore([]);
    await database
      .update(mcpTools)
      .set({ vendorName: null })
      .where(eq(mcpTools.serverId, GOOGLE_APP_PASSWORD));

    const outcome = await store.refreshBuiltInTools();

    expect(outcome.refreshed).toEqual([]);
  });

  test("several replicas starting together leave one consistent list and one trail row", async () => {
    await connectedBefore([SEND, SEARCH]);
    const replicas = replicaDatabases.map(storeOn);
    // A start swallows what goes wrong and says so in the log, so "neither died" is read from there.
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...parts: unknown[]) => {
      warned.push(parts.map(String).join(" "));
    };

    let outcomes: Awaited<ReturnType<PluginStore["refreshBuiltInTools"]>>[];
    try {
      outcomes = await Promise.all(
        replicas.map((replica) => replica.refreshBuiltInTools()),
      );
    } finally {
      console.warn = warn;
    }

    // Neither died on the primary key, and the work was done by exactly one of them.
    expect(warned).toEqual([]);
    expect(
      outcomes.flatMap((outcome) =>
        outcome.refreshed.filter((one) => one.serverId === GOOGLE_APP_PASSWORD),
      ),
    ).toHaveLength(1);
    expect(await storedNames(GOOGLE_APP_PASSWORD)).toEqual(
      (await built()).sort(),
    );
    expect(
      eventsOf("builtin_tools_refreshed_at_start", GOOGLE_APP_PASSWORD),
    ).toHaveLength(1);
  });
});

describe("a connector that is somebody else's to ask", () => {
  test("a remote MCP server is not contacted at start, and keeps the list it had", async () => {
    await clearConnectors();
    await database.insert(mcpServers).values({
      id: remote,
      title: "A remote server",
      vendor: "Somebody",
      url: "https://mcp.example.invalid/mcp",
      provenance: "custom",
    });
    await database.insert(mcpTools).values({
      serverId: remote,
      name: "old_search",
      vendorName: "old_search",
      description: "What it said when it was added.",
    });
    const [before] = await database
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, remote));

    const outcome = await store.refreshBuiltInTools();

    expect(fetched).toEqual([]);
    expect(outcome.refreshed.map((one) => one.serverId)).not.toContain(remote);
    expect(await storedNames(remote)).toEqual(["old_search"]);
    const [after] = await database
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, remote));
    expect(after?.toolsRefreshedAt).toEqual(before?.toolsRefreshedAt);
    expect(after?.lastError).toBeNull();
  });

  test("a brokered app's vendor is not asked either", async () => {
    await clearConnectors();
    const brokered = `composio-refresh_${suite}`;
    await database.insert(mcpServers).values({
      id: brokered,
      title: "A brokered app",
      vendor: "Composio",
      url: `composio://refresh_${suite}`,
      provenance: "composio",
      authScheme: "OAUTH2",
      accountMode: "personal",
    });
    const asked: string[] = [];
    // Every member a listing could reach is a record and a refusal.
    useComposioClient(
      new Proxy(
        {},
        {
          get: (_target, member) => {
            asked.push(String(member));
            throw new Error("The broker must not be asked at start.");
          },
        },
      ) as never,
    );

    try {
      await store.refreshBuiltInTools();
    } finally {
      await database.delete(mcpServers).where(eq(mcpServers.id, brokered));
    }

    expect(asked).toEqual([]);
    expect(fetched).toEqual([]);
  });
});

describe("a start that cannot be allowed to fail", () => {
  test("a connector whose catalogue entry is gone is skipped, and the others are still brought up to date", async () => {
    await connectedBefore([SEND]);
    const gone = `gone_${suite}`;
    await database.insert(mcpServers).values({
      id: gone,
      title: "Left behind by a build that dropped it",
      vendor: "Nobody",
      url: "https://nowhere.example.invalid/",
      provenance: "first-party",
    });
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...parts: unknown[]) => {
      warned.push(parts.map(String).join(" "));
    };

    try {
      const outcome = await store.refreshBuiltInTools();
      expect(outcome.refreshed.map((one) => one.serverId)).toEqual([
        GOOGLE_APP_PASSWORD,
      ]);
    } finally {
      console.warn = warn;
      await database.delete(mcpServers).where(eq(mcpServers.id, gone));
    }

    expect(await storedNames(GOOGLE_APP_PASSWORD)).toContain(SEND);
    expect(fetched).toEqual([]);
    // Said once, with the connector named and no statement in it.
    expect(warned.filter((line) => line.includes(gone))).toHaveLength(1);
    expect(warned.join("\n")).not.toContain("Failed query");
  });

  test("Drive, which lists from code too, is brought up to date the same way", async () => {
    await clearConnectors();
    await store.addServer({ key: GOOGLE_DRIVE, by: person });
    const [one] = await stored(GOOGLE_DRIVE);
    if (!one) throw new Error("Drive stored no tools");
    await database
      .delete(mcpTools)
      .where(
        and(eq(mcpTools.serverId, GOOGLE_DRIVE), eq(mcpTools.name, one.name)),
      );

    const outcome = await store.refreshBuiltInTools();

    expect(
      outcome.refreshed.find((change) => change.serverId === GOOGLE_DRIVE)
        ?.added,
    ).toEqual([one.name]);
    expect(await storedNames(GOOGLE_DRIVE)).toContain(one.name);
  });
});
