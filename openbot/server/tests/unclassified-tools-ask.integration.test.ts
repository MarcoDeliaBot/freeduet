import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray } from "drizzle-orm";
import { toolNameHitsSafetyWords } from "../src/approvals/policy";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import { createAuditStore } from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore, encryptSecret } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agents,
  approvalPreferences,
  approvalRequests,
  approvalRules,
  credentials,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  users,
} from "../src/db/schema";
import {
  CATALOGUE,
  catalogueEntry,
  classifyTool,
} from "../src/plugins/catalogue";
import {
  type ComposioResult,
  useComposioClient,
} from "../src/plugins/composio";
import { createPluginStore } from "../src/plugins/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * D33: a tool no list calls a read is a write, on every catalogue entry, and a hub's "read" label is
 * not trusted on its own for a name that carries a safety word.
 *
 * Two halves. The first pins `classifyTool` against `fixtures/classification-before.json`, which was
 * generated from the code on main BEFORE this change: every row that is not listed in
 * {@link NOW_WRITES} must classify exactly as it did, which covers both ways of connecting Gmail,
 * Calendar, and the search connectors. The second drives the real plugin store and the real approval
 * service on a real database, so "asks" means a suspended call and one pending card, and "no card"
 * means the vendor was reached with nothing opened.
 */

type Row = {
  entry: string | null;
  tool: string;
  recorded: "read" | "write" | null;
  advertised: boolean;
  before: "read" | "write";
};

const BEFORE: Row[] = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures/classification-before.json"), {
    encoding: "utf8",
  }),
);

/** Advertised tools that were reads by omission on main and are writes now, per entry. */
const NOW_WRITES: Record<string, string[]> = {
  "google-drive": [
    "download_file_content",
    "get_file_permissions",
    "get_shared_drive_metadata",
    "list_file_revisions",
    "list_shared_drives",
    "share_file",
    "trash_file",
    "update_file",
    "zz_unlisted_tool",
  ],
  notion: [
    "notion-connector-search",
    "notion-create-suggested-edit",
    "notion-delete-comment",
    "notion-delete-databases",
    "notion-delete-pages",
    "notion-download-attachment",
    "notion-get-comments",
    "notion-get-file-download-urls",
    "notion-get-self",
    "notion-get-suggested-edit",
    "notion-get-teams",
    "notion-get-users",
    "notion-get-version-changes",
    "notion-list-private-pages",
    "notion-list-recent-pages",
    "notion-list-shared-pages",
    "notion-query-data-sources",
    "notion-resolve-suggested-edit",
    "notion-restore-pages",
    "notion-restore-version",
    "notion-set-comment-reaction",
    "notion-set-discussion-resolved",
    "notion-update-comment",
    "notion-view-version",
    "zz_unlisted_tool",
  ],
  routines: ["run_routine_now", "zz_unlisted_tool"],
};
/** A hub's recorded read whose own name carries a credential, security or money word. */
const HUB_NOW_WRITES = [
  "AUTH0_GET_API_KEYS",
  "OKTA_LIST_PASSWORD_POLICIES",
  "ONEPASSWORD_LIST_VAULTS",
  "STRIPE_LIST_PAYMENT_INTENTS",
];

const after = (row: Row) =>
  classifyTool(
    row.entry === null ? null : catalogueEntry(row.entry),
    row.tool,
    row.advertised,
    row.recorded,
  );

/*
 * Connectors added after this table was generated from main. Each one is classified by its own tests:
 * `settings` (settings in chat, slice 1) in `settings-in-chat-allow-list.test.ts`.
 */
const ADDED_AFTER_TABLE = ["settings"];

describe("classification against the table generated from main", () => {
  test("the table covers every catalogue entry that main had", () => {
    expect([...new Set(BEFORE.map((row) => row.entry))].sort()).toEqual(
      [
        ...CATALOGUE.map((entry) => entry.key).filter(
          (key) => !ADDED_AFTER_TABLE.includes(key),
        ),
        null,
      ].sort(),
    );
  });

  test("only the listed read-by-omission tools changed, and only to write", () => {
    const changed = BEFORE.filter((row) => after(row) !== row.before);
    expect(changed.every((row) => row.before === "read")).toBe(true);
    expect(changed.every((row) => after(row) === "write")).toBe(true);
    const named = (row: Row) => `${row.entry}/${row.tool}`;
    const expected = [
      ...Object.entries(NOW_WRITES).flatMap(([entry, tools]) =>
        tools.map((tool) => `${entry}/${tool}`),
      ),
      ...HUB_NOW_WRITES.map((tool) => `null/${tool}`),
    ];
    expect([...new Set(changed.map(named))].sort()).toEqual(expected.sort());
  });

  test("Gmail on both connections, Calendar and the search connectors classify exactly as before", () => {
    const unchanged = [
      "google-workspace",
      "google-imap",
      "parallel",
      "parallel-authenticated",
      "exa",
      "exa-authenticated",
      "firecrawl",
      "firecrawl-authenticated",
    ];
    const rows = BEFORE.filter(
      (row) => row.entry !== null && unchanged.includes(row.entry),
    );
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.filter((row) => after(row) !== row.before)).toEqual([]);
    for (const key of ["google-workspace", "google-imap"]) {
      const entry = catalogueEntry(key);
      for (const tool of [
        "gmail_search_messages",
        "gmail_read_message",
        "calendar_list_events",
      ])
        expect(classifyTool(entry, tool, true, null)).toBe("read");
      for (const tool of ["gmail_send_reply", "gmail_send_message"])
        expect(classifyTool(entry, tool, true, null)).toBe("write");
    }
  });

  test("an advertised tool nothing names is a write on every entry, whatever the listing recorded", () => {
    for (const entry of CATALOGUE)
      for (const recorded of [null, "read", "write", ""] as const)
        expect(
          classifyTool(entry, "an_action_nobody_listed", true, recorded),
        ).toBe("write");
  });

  test("every entry carries a read list, and nothing it reads is also a write", () => {
    for (const entry of CATALOGUE) {
      expect(Array.isArray(entry.readTools)).toBe(true);
      expect(
        entry.readTools.filter((name) => entry.writeTools.includes(name)),
      ).toEqual([]);
    }
  });

  test("Drive offers no write: its scope is read-only and its tools are the adapter's four", () => {
    const drive = catalogueEntry("google-drive");
    expect(drive?.auth.kind === "user-oauth" ? drive.auth.scopes : []).toEqual([
      "https://www.googleapis.com/auth/drive.readonly",
    ]);
    expect(drive?.writeTools).toEqual([]);
    expect(drive?.readTools).toEqual([
      "search_files",
      "list_recent_files",
      "get_file_metadata",
      "read_file_content",
    ]);
    for (const tool of ["create_file", "copy_file"])
      expect(classifyTool(drive ?? null, tool, true, "read")).toBe("write");
  });

  test("a hub's read keeps its label unless the name carries a safety word", () => {
    expect(classifyTool(null, "GOOGLEDRIVE_LIST_FILES", true, "read")).toBe(
      "read",
    );
    expect(classifyTool(null, "ONEPASSWORD_LIST_VAULTS", true, "read")).toBe(
      "write",
    );
    expect(classifyTool(null, "ONEPASSWORD_LIST_VAULTS", true, null)).toBe(
      "write",
    );
    expect(toolNameHitsSafetyWords("STRIPE_LIST_PAYMENT_INTENTS")).toBe(true);
    expect(toolNameHitsSafetyWords("SLACK_SEARCH_MESSAGES")).toBe(false);
  });
});

/* The real gate. */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_unclassified_${suite}`;
const botId = `agent_unclassified_${suite}`;
const HUB = `hubtest${suite}`;
const CUSTOM = `customtest${suite}`;
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

const approvals = createApprovalStore(database);
// No reviewer: a write that no rule and no floor decides waits for the person, as the person's own
// "ask before making changes" switch says.
const service = createApprovalService(approvals);

const reached: string[] = [];
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  approvalGate: (candidate) => service.gate(candidate),
  exchangeRefreshToken: async () => ({ accessToken: "test-access-token" }),
  callVendor: async (_connection, toolName) => {
    reached.push(toolName);
    return { text: "ok", isError: false };
  },
});

const vendorAnswered = (): ComposioResult => ({
  data: {},
  error: null,
  successful: true,
});

type Listed = { server: string; name: string; effect: "read" | "write" | null };
const LISTED: Listed[] = [
  { server: "notion", name: "notion-search", effect: null },
  { server: "notion", name: "notion-fetch", effect: null },
  { server: "notion", name: "notion-create-pages", effect: null },
  { server: "notion", name: "notion-delete-pages", effect: null },
  { server: "notion", name: "notion-delete-databases", effect: "read" },
  { server: "notion", name: "notion-brand-new-tool", effect: null },
  { server: "google-drive", name: "search_files", effect: null },
  { server: "google-drive", name: "share_file", effect: null },
  { server: "google-drive", name: "create_file", effect: null },
  { server: "google-drive", name: "trash_file", effect: "read" },
  { server: "routines", name: "list_routines", effect: null },
  { server: "routines", name: "run_routine_now", effect: null },
  { server: HUB, name: "GOOGLEDRIVE_LIST_FILES", effect: "read" },
  { server: HUB, name: "SLACK_SEARCH_MESSAGES", effect: "read" },
  { server: HUB, name: "ONEPASSWORD_LIST_VAULTS", effect: "read" },
  { server: HUB, name: "STRIPE_LIST_PAYMENT_INTENTS", effect: "read" },
  { server: HUB, name: "GITHUB_DELETE_A_REPOSITORY", effect: "write" },
  { server: CUSTOM, name: "custom_unlabelled_tool", effect: null },
];

const createdServers: string[] = [];
const createdTools: { serverId: string; name: string }[] = [];
const credentialIds: string[] = [];
const restoredClient = new Map<string, string | null>();

beforeAll(async () => {
  await database
    .insert(users)
    .values({
      id: owner,
      email: `${owner}@unclassified.test`,
      name: "Test Owner",
      emailVerified: false,
    })
    .onConflictDoNothing();
  await database
    .insert(agents)
    .values({ id: botId, name: botId, type: "remote_ag_ui", configuration: {} })
    .onConflictDoNothing();
  // "Ask before making changes" is off in a fresh store; the person's switch is what these tests turn on.
  await approvals.setEnabled(owner, true);

  const rows: Record<string, typeof mcpServers.$inferInsert> = {
    notion: {
      id: "notion",
      title: "Notion",
      vendor: "Notion",
      url: "https://mcp.notion.com/mcp",
      provenance: "first-party",
    },
    "google-drive": {
      id: "google-drive",
      title: "Google Drive",
      vendor: "Google",
      url: "https://www.googleapis.com/drive/v3",
      provenance: "first-party",
    },
    routines: {
      id: "routines",
      title: "Routines",
      vendor: "OpenBot",
      url: "builtin://routines",
      provenance: "first-party",
    },
    [HUB]: {
      id: HUB,
      title: "Hub test app",
      vendor: "Composio",
      url: `composio://${HUB}`,
      provenance: "composio",
      authScheme: "NO_AUTH",
      accountMode: "personal",
    },
    [CUSTOM]: {
      id: CUSTOM,
      title: "Custom test server",
      vendor: "Custom",
      url: "https://mcp.example.test/mcp",
      provenance: "custom",
    },
  };
  for (const [id, row] of Object.entries(rows)) {
    const [existing] = await database
      .select({ credentialId: mcpServers.credentialId })
      .from(mcpServers)
      .where(eq(mcpServers.id, id));
    if (existing) restoredClient.set(id, existing.credentialId);
    else {
      await database.insert(mcpServers).values(row);
      createdServers.push(id);
    }
  }

  for (const tool of LISTED) {
    const [present] = await database
      .select({ name: mcpTools.name })
      .from(mcpTools)
      .where(
        and(eq(mcpTools.serverId, tool.server), eq(mcpTools.name, tool.name)),
      );
    if (!present) {
      await database.insert(mcpTools).values({
        serverId: tool.server,
        name: tool.name,
        vendorName: tool.name,
        description: tool.name,
        effect: tool.effect,
        ...(tool.server === HUB ? { version: "20260903_00" } : {}),
      });
      createdTools.push({ serverId: tool.server, name: tool.name });
    } else if (tool.effect !== null) {
      await database
        .update(mcpTools)
        .set({ effect: tool.effect })
        .where(
          and(eq(mcpTools.serverId, tool.server), eq(mcpTools.name, tool.name)),
        );
    }
    await database
      .insert(pluginGrants)
      .values({
        kind: "mcp",
        ref: `${tool.server}/${tool.name}`,
        agentId: botId,
      })
      .onConflictDoNothing();
  }

  // The two per-person connectors: the person consented, so the call can go on to the vendor once the
  // gate lets it through.
  for (const id of ["notion", "google-drive"]) {
    const [client] = await database
      .insert(credentials)
      .values({
        kind: "mcp_oauth_client",
        provider: id,
        keyId: `oauth-client-${suite}-${id}`,
        metadata: { clientId: "test-client" },
        encryptedValue: await encryptSecret(
          ENCRYPTION_KEY,
          JSON.stringify({ clientId: "test-client", clientSecret: "secret" }),
        ),
      })
      .returning({ id: credentials.id });
    if (!client) throw new Error("client was not stored");
    credentialIds.push(client.id);
    await database
      .update(mcpServers)
      .set({ credentialId: client.id })
      .where(eq(mcpServers.id, id));
    const [token] = await database
      .insert(credentials)
      .values({
        kind: "mcp_user_token",
        provider: id,
        keyId: owner,
        metadata: {},
        encryptedValue: await encryptSecret(ENCRYPTION_KEY, "refresh-token"),
      })
      .returning({ id: credentials.id });
    if (!token) throw new Error("token was not stored");
    credentialIds.push(token.id);
    await database.insert(mcpUserCredentials).values({
      serverId: id,
      userId: owner,
      credentialId: token.id,
      scope: "test",
    });
  }
});

afterEach(() => useComposioClient(null));

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
  await database.delete(pluginGrants).where(eq(pluginGrants.agentId, botId));
  await database
    .delete(mcpUserCredentials)
    .where(eq(mcpUserCredentials.userId, owner));
  for (const [id, before] of restoredClient)
    await database
      .update(mcpServers)
      .set({ credentialId: before })
      .where(eq(mcpServers.id, id));
  for (const id of ["notion", "google-drive"])
    if (!restoredClient.has(id))
      await database
        .update(mcpServers)
        .set({ credentialId: null })
        .where(eq(mcpServers.id, id));
  for (const id of credentialIds)
    await database.delete(credentials).where(eq(credentials.id, id));
  for (const tool of createdTools)
    await database
      .delete(mcpTools)
      .where(
        and(eq(mcpTools.serverId, tool.serverId), eq(mcpTools.name, tool.name)),
      );
  if (createdServers.length > 0)
    await database
      .delete(mcpServers)
      .where(inArray(mcpServers.id, createdServers));
  await database.delete(agents).where(eq(agents.id, botId));
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

const pending = async () =>
  (await approvals.list(owner)).filter(
    (request) => request.status === "pending",
  );

async function clearPending() {
  for (const request of await pending())
    await approvals.decide(owner, request.id, "deny");
  reached.length = 0;
}

function call(server: string, name: string) {
  useComposioClient({
    listActions: async () => [],
    execute: async ({ slug }) => {
      reached.push(slug);
      return vendorAnswered();
    },
  });
  const context: ApprovalContinuation = {
    runId: randomUUID(),
    threadId: `thread-${randomUUID()}`,
    toolCallId: randomUUID(),
    toolName: name,
    args: {},
    messages: [{ id: `m-${randomUUID()}`, role: "user", content: "go ahead" }],
    state: {},
    context: [],
    forwardedProps: {},
  };
  return withApprovalContext(context, () =>
    store.callTool({
      ref: `${server}/${name}`,
      args: {},
      botId,
      actorId: owner,
      initiator: { kind: "person" },
    }),
  );
}

/** The call asked the person instead of running: a suspension, one pending card, nothing at the vendor. */
async function expectAsks(server: string, name: string) {
  await clearPending();
  let thrown: unknown;
  try {
    await call(server, name);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(HeadlessToolSuspension);
  expect((await pending()).length).toBe(1);
  expect(reached).toEqual([]);
}

/** The call went through with no card: the vendor was reached and nothing was opened. */
async function expectNoCard(server: string, name: string) {
  await clearPending();
  const result = await call(server, name);
  expect(result.isError).toBe(false);
  expect(await pending()).toEqual([]);
  expect(reached).toEqual([name]);
}

describe("the real gate, Notion", () => {
  test("a search and a fetch run with no card", async () => {
    await expectNoCard("notion", "notion-search");
    await expectNoCard("notion", "notion-fetch");
  });
  test("a page deletion nobody listed asks", async () => {
    await expectAsks("notion", "notion-delete-pages");
  });
  test("a database deletion asks even where the listing recorded it as a read", async () => {
    await expectAsks("notion", "notion-delete-databases");
  });
  test("a tool Notion adds tomorrow asks", async () => {
    await expectAsks("notion", "notion-brand-new-tool");
  });
  test("a creation on the write list still asks", async () => {
    await expectAsks("notion", "notion-create-pages");
  });
});

describe("the real gate, Drive", () => {
  test("a search runs with no card", async () => {
    await expectNoCard("google-drive", "search_files");
  });
  test("a share the connector does not offer asks", async () => {
    await expectAsks("google-drive", "share_file");
  });
  test("a creation asks", async () => {
    await expectAsks("google-drive", "create_file");
  });
  test("a trash recorded as a read asks", async () => {
    await expectAsks("google-drive", "trash_file");
  });
});

describe("the real gate, routines", () => {
  test("listing routines runs with no card", async () => {
    await expectNoCard("routines", "list_routines");
  });
  test("a tool the entry does not name asks", async () => {
    await expectAsks("routines", "run_routine_now");
  });
});

describe("the real gate, a hub's tools", () => {
  test("a plain read runs with no card", async () => {
    await expectNoCard(HUB, "GOOGLEDRIVE_LIST_FILES");
    await expectNoCard(HUB, "SLACK_SEARCH_MESSAGES");
  });
  test("a read about vault or payment objects is not taken on the label alone and asks", async () => {
    await expectAsks(HUB, "ONEPASSWORD_LIST_VAULTS");
    await expectAsks(HUB, "STRIPE_LIST_PAYMENT_INTENTS");
  });
  test("a labelled write asks", async () => {
    await expectAsks(HUB, "GITHUB_DELETE_A_REPOSITORY");
  });
});

describe("the real gate, a server an administrator added by URL", () => {
  test("a tool nobody labelled asks", async () => {
    await expectAsks(CUSTOM, "custom_unlabelled_tool");
  });
});
