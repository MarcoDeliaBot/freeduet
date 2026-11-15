import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import type { AuditEventInput, AuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  appAccessRequests,
  credentials,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  skills,
  users,
} from "../src/db/schema";
import type { AppAccess } from "../src/plugins/app-access";
import {
  catalogueEntry,
  classifyTool,
  GOOGLE_APP_PASSWORD,
  GOOGLE_WORKSPACE,
} from "../src/plugins/catalogue";
import {
  ARCHIVE_MESSAGES,
  CREATE_LABEL,
  LABEL_MESSAGES,
  LIST_LABELS,
  MARK_MESSAGES,
} from "../src/plugins/mail-organise";
import { createPluginRoutes } from "../src/plugins/routes";
import { createSharedUseStore } from "../src/plugins/shared-use-store";
import { createPluginStore } from "../src/plugins/store";
import { grantedTools } from "../src/plugins/tools";
import { loadTenantPackage } from "../src/tenant-package";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * WHO ENDS UP WITH THE TOOLS THAT ORGANISE A MAILBOX, through the real routes
 * (docs/design/mail-organise.md).
 *
 * What a Bot may call is the grants it holds. The package seeds none, and a person gives one in one of
 * three ways: from the Bot's page under the app, by pressing the inbox row that names what a skill of
 * the Bot needs, or by pressing it with nothing named. The row names the four tools that change a
 * mailbox and says each changes something; the press with nothing named gives only the reads. The
 * tools that send are, as before, given from settings and from nowhere else. This file holds all of
 * that for both Gmail connections, with the skills Otto is given in the package, and for a member
 * whose skills do not name the tools.
 *
 * Real Postgres, the real store and the real routes. The vendor is not involved: the rows an app's
 * refresh would write are written directly, classified as a refresh classifies them.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const id = (name: string) => `${name}-${suite}`;

const person = id("person");
const admin = id("admin");
// The member whose skills in the package name the tools (Otto), and one whose skill names only reads.
const otto = id("otto");
const reader = id("reader");
const BOTS = [otto, reader];

const READER_SKILL = id("skill-reader");

const WRITES = [CREATE_LABEL, LABEL_MESSAGES, ARCHIVE_MESSAGES, MARK_MESSAGES];
const SENDS = ["gmail_send_reply", "gmail_send_message"];
const CONNECTIONS = [GOOGLE_WORKSPACE, GOOGLE_APP_PASSWORD];

const events: AuditEventInput[] = [];
const audit: AuditStore = {
  insert: async (event) => {
    events.push(event);
  },
};
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: audit,
  credentials: createCredentialStore(database),
  encryptionKey: "x".repeat(44),
  policy: () => policy,
});

function appAs(actorId: string, role: "admin" | "user" = "user") {
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

const json = async <T>(response: Response) => (await response.json()) as T;
const post = (body?: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const ref = (key: string, tool: string) => `${key}/${tool}`;

const heldBy = async (agentId: string) =>
  (
    await database
      .select({ ref: pluginGrants.ref, kind: pluginGrants.kind })
      .from(pluginGrants)
      .where(eq(pluginGrants.agentId, agentId))
  )
    .filter((grant) => grant.kind === "mcp")
    .map((grant) => grant.ref)
    .sort();

const stateOf = async (agentId: string, app: string): Promise<AppAccess> => {
  const response = await appAs(person).request(
    `/api/plugins/for/${agentId}/apps/${app}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { app: AppAccess }).app;
};

const fileRequest = async (agentId: string, app: string) => {
  const response = await appAs(person).request(
    "/api/plugins/access-requests",
    post({ agentId, app }),
  );
  expect(response.status).toBe(201);
  return (await json<{ request: { id: string } }>(response)).request.id;
};

const approve = (requestId: string, body?: unknown) =>
  appAs(admin, "admin").request(
    `/api/plugins/access-requests/${requestId}/approve`,
    post(body),
  );

/** What the settings page does when the person switches one action on for one Bot. */
const allowInSettings = (toolRef: string, agentId: string) =>
  appAs(admin, "admin").request(
    "/api/plugins/grants",
    post({ kind: "mcp", ref: toolRef, agentId }),
  );

const credentialIds: string[] = [];

/** A catalogue entry's connection as a deployment that has it holds it, every tool classified as a refresh does. */
async function seedEntry(key: string) {
  const entry = catalogueEntry(key);
  if (!entry) throw new Error(`${key} is not in the catalogue`);
  await database.delete(mcpServers).where(eq(mcpServers.id, key));
  let credentialId: string | null = null;
  if (
    entry.auth.kind === "user-oauth" &&
    entry.auth.clientRegistration !== "dynamic"
  ) {
    const [client] = await database
      .insert(credentials)
      .values({
        kind: "mcp_oauth_client",
        provider: key,
        keyId: `oauth-client-${suite}-${key}`,
        metadata: {},
        encryptedValue: "not-read-by-these-tests",
      })
      .returning({ id: credentials.id });
    if (!client) throw new Error("client was not stored");
    credentialIds.push(client.id);
    credentialId = client.id;
  }
  await database.insert(mcpServers).values({
    id: key,
    title: entry.title,
    vendor: entry.vendor,
    url: `${entry.host ?? "https://example.invalid"}${entry.path === "/" ? "" : entry.path}`,
    provenance: "first-party",
    credentialId,
  });
  if (entry.auth.kind === "user-oauth" || entry.auth.kind === "user-secret") {
    const [token] = await database
      .insert(credentials)
      .values({
        kind: "mcp_user_token",
        provider: key,
        keyId: `${person}-${key}`,
        metadata: {},
        encryptedValue: "not-read-by-these-tests",
      })
      .returning({ id: credentials.id });
    if (!token) throw new Error("token was not stored");
    credentialIds.push(token.id);
    await database.insert(mcpUserCredentials).values({
      serverId: key,
      userId: person,
      credentialId: token.id,
      scope: "",
    });
  }
  const names = [...new Set([...entry.readTools, ...entry.writeTools])];
  await database.insert(mcpTools).values(
    names.map((name) => ({
      serverId: key,
      name,
      vendorName: name,
      description: name,
      effect: classifyTool(entry, name, true, null),
    })),
  );
}

const packageDirectory = fileURLToPath(
  new URL("../../examples/freeduet", import.meta.url),
);

/** The skills the package gives Otto, as the package declares them (every tool ref, both connections). */
async function ottosSkills() {
  const previous = process.env.MANAGED_AGENT_AG_UI_URL;
  process.env.MANAGED_AGENT_AG_UI_URL = "http://localhost:4230/";
  try {
    const tenantPackage = await loadTenantPackage(packageDirectory);
    const member = tenantPackage.agents.find((agent) => agent.id === "inbox");
    if (!member) throw new Error("the package has no member inbox");
    return tenantPackage.skills.filter((skill) =>
      member.skills.includes(skill.slug),
    );
  } finally {
    if (previous === undefined) delete process.env.MANAGED_AGENT_AG_UI_URL;
    else process.env.MANAGED_AGENT_AG_UI_URL = previous;
  }
}

const slugsInstalled: string[] = [];

/** One connection, Otto holding the one tool he had before, and the package's skills given to him. */
async function setUp(key: string) {
  await seedEntry(key);
  await store.grant(
    "mcp",
    ref(key, "gmail_search_messages"),
    otto,
    "admin@example.test",
  );
  for (const skill of await ottosSkills()) {
    const slug = `${skill.slug}-${suite}`;
    await store.installSkill({
      slug,
      title: skill.title,
      summary: skill.summary,
      instructions: skill.instructions,
      ownerUserId: null,
      // The package names both connections' tools; this one is seeded, so the other's are left out.
      tools: skill.tools.filter((tool) => tool.startsWith(`${key}/`)),
      by: "admin@example.test",
    });
    slugsInstalled.push(slug);
    await store.grant("skill", slug, otto, "admin@example.test");
  }
}

/** A member whose one skill names only reads, so nothing about the four is ever asked for her. */
async function setUpReader(key: string) {
  await store.installSkill({
    slug: READER_SKILL,
    title: "Read my mail",
    summary: "Read.",
    instructions: "Read it.",
    ownerUserId: null,
    tools: [ref(key, "gmail_read_message"), ref(key, LIST_LABELS)],
    by: "admin@example.test",
  });
  await store.grant("skill", READER_SKILL, reader, "admin@example.test");
}

async function clear() {
  await database
    .delete(appAccessRequests)
    .where(inArray(appAccessRequests.requestedBy, [person, admin]));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, BOTS));
  await database
    .delete(skills)
    .where(inArray(skills.slug, [READER_SKILL, ...slugsInstalled]));
  slugsInstalled.length = 0;
  await database.delete(mcpServers).where(inArray(mcpServers.id, CONNECTIONS));
  if (credentialIds.length > 0)
    await database
      .delete(credentials)
      .where(inArray(credentials.id, credentialIds));
  credentialIds.length = 0;
  events.length = 0;
}

beforeAll(async () => {
  for (const user of [person, admin])
    await database.insert(users).values({
      id: user,
      email: `${user}@example.test`,
      name: user,
      emailVerified: true,
    });
  for (const agent of BOTS) {
    await database.insert(agents).values({
      id: agent,
      name: `Bot ${agent}`,
      type: "built_in",
      configuration: {},
    });
    await database.insert(agentProfiles).values({
      agentId: agent,
      ownerUserId: person,
      visibility: "private",
      title: "Helper",
      roleDescription: "Helper",
      avatarSeed: "x",
    });
  }
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await database.delete(agents).where(inArray(agents.id, BOTS));
  await database.delete(users).where(inArray(users.id, [person, admin]));
  await database.$client.close();
});

for (const key of CONNECTIONS) {
  describe(`${key}: who is given the tools that organise a mailbox`, () => {
    test("the package seeds none: before anything is pressed Otto holds only what he held", async () => {
      await setUp(key);

      expect(await heldBy(otto)).toEqual([ref(key, "gmail_search_messages")]);
      const offered = (
        await grantedTools({ store, botId: otto, actorId: person })
      ).map((tool) => tool.name);
      for (const tool of [LIST_LABELS, ...WRITES])
        expect(offered).not.toContain(`mcp__${key}__${tool}`);
    });

    test("the inbox row names the four that change a mailbox as writes, the listing as a read, and holds none back", async () => {
      await setUp(key);

      const app = await stateOf(otto, key);

      expect(app.state).toBe("ready");
      expect(app.requestKind).toBe("grant");
      const wanted = new Map(app.wants?.map((want) => [want.name, want]));
      expect(wanted.get(LIST_LABELS)?.read).toBe(true);
      for (const tool of WRITES) {
        const want = wanted.get(tool);
        // Named, so the person sees it; a write, so the row says it changes something; not a send.
        expect(want?.read).toBe(false);
        expect("settingsOnly" in (want ?? {})).toBe(false);
      }
      // The sends are held back exactly as before: allowed from settings, never by a press.
      for (const tool of SENDS)
        expect(wanted.get(tool)).toMatchObject({ settingsOnly: "send" });
    });

    test("a press with nothing named gives the reads and not one of the four writes, nor a send", async () => {
      await setUp(key);
      const requestId = await fileRequest(otto, key);

      const response = await approve(requestId);

      expect(response.status).toBe(200);
      const granted = (await json<{ granted: string[] }>(response)).granted;
      expect(granted).toContain(ref(key, LIST_LABELS));
      expect(granted).toContain(ref(key, "gmail_read_message"));
      for (const tool of [...WRITES, ...SENDS])
        expect(granted).not.toContain(ref(key, tool));
      const held = await heldBy(otto);
      for (const tool of [...WRITES, ...SENDS])
        expect(held).not.toContain(ref(key, tool));
      const offered = (
        await grantedTools({ store, botId: otto, actorId: person })
      ).map((tool) => tool.name);
      expect(offered).toContain(`mcp__${key}__${LIST_LABELS}`);
      for (const tool of WRITES)
        expect(offered).not.toContain(`mcp__${key}__${tool}`);
    });

    test("naming one of the four gives exactly that one, and nothing else of them", async () => {
      await setUp(key);
      const requestId = await fileRequest(otto, key);

      const response = await approve(requestId, {
        refs: [ref(key, ARCHIVE_MESSAGES)],
      });

      expect(response.status).toBe(200);
      expect((await json<{ granted: string[] }>(response)).granted).toEqual([
        ref(key, ARCHIVE_MESSAGES),
      ]);
      const held = await heldBy(otto);
      expect(held).toContain(ref(key, ARCHIVE_MESSAGES));
      for (const tool of WRITES.filter((tool) => tool !== ARCHIVE_MESSAGES))
        expect(held).not.toContain(ref(key, tool));
    });

    test("the press the row's button makes, naming every tool it lists but the sends, gives the four because the person pressed it", async () => {
      await setUp(key);
      const requestId = await fileRequest(otto, key);
      // What the inbox row sends: every tool the row names, less the ones held back for settings.
      const row = (await stateOf(otto, key)).wants?.filter(
        (want) => !want.settingsOnly,
      );
      expect(row?.map((want) => want.name)).toEqual(
        expect.arrayContaining([LIST_LABELS, ...WRITES]),
      );

      const response = await approve(requestId, {
        refs: row?.map((want) => want.ref),
      });

      expect(response.status).toBe(200);
      const held = await heldBy(otto);
      for (const tool of [LIST_LABELS, ...WRITES])
        expect(held).toContain(ref(key, tool));
      for (const tool of SENDS) expect(held).not.toContain(ref(key, tool));
    });

    test("a member whose skills do not name them is not asked for them, and a press with nothing named gives her none", async () => {
      await setUp(key);
      await setUpReader(key);
      const app = await stateOf(reader, key);
      // Nothing of the four is waiting on her: the row is made from what her own skills name.
      expect(
        (app.wants ?? [])
          .map((want) => want.name)
          .filter((name) => WRITES.includes(name)),
      ).toEqual([]);

      const requestId = await fileRequest(reader, key);
      const response = await approve(requestId);

      expect(response.status).toBe(200);
      const held = await heldBy(reader);
      expect(held).toContain(ref(key, LIST_LABELS));
      for (const tool of [...WRITES, ...SENDS])
        expect(held).not.toContain(ref(key, tool));
      const offered = (
        await grantedTools({ store, botId: reader, actorId: person })
      ).map((tool) => tool.name);
      for (const tool of [...WRITES, ...SENDS])
        expect(offered).not.toContain(`mcp__${key}__${tool}`);
    });

    test("a send is still refused to a press that names it, beside the four", async () => {
      await setUp(key);
      const requestId = await fileRequest(otto, key);
      const before = await heldBy(otto);

      const response = await approve(requestId, {
        refs: [ref(key, ARCHIVE_MESSAGES), ref(key, "gmail_send_message")],
      });

      expect(response.status).toBe(403);
      // The whole press is refused, so the write named beside it is not given either.
      expect(await heldBy(otto)).toEqual(before);
    });

    test("the settings page gives the one the person chooses, and only to the member they choose", async () => {
      await setUp(key);
      await setUpReader(key);

      const response = await allowInSettings(ref(key, MARK_MESSAGES), otto);

      expect(response.status).toBe(200);
      expect(await heldBy(otto)).toContain(ref(key, MARK_MESSAGES));
      expect(await heldBy(reader)).not.toContain(ref(key, MARK_MESSAGES));
    });

    test("approving is not what makes a call go through: a grant is the offer, the approval card is asked at the call", async () => {
      await setUp(key);
      // The classification a call is gated by: the four are writes, so each is asked at the call.
      const entry = catalogueEntry(key);
      for (const tool of WRITES)
        expect(classifyTool(entry ?? null, tool, true, null)).toBe("write");
      expect(classifyTool(entry ?? null, LIST_LABELS, true, null)).toBe("read");
      const rows = await database
        .select({ name: mcpTools.name, effect: mcpTools.effect })
        .from(mcpTools)
        .where(
          and(eq(mcpTools.serverId, key), inArray(mcpTools.name, [...WRITES])),
        );
      expect(rows.map((row) => row.effect)).toEqual(WRITES.map(() => "write"));
    });
  });
}
