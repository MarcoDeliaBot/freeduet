import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
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
import { catalogueEntry, classifyTool } from "../src/plugins/catalogue";
import type { AppAccessRequestRecord } from "../src/plugins/plugin-store/app-access";
import { createPluginRoutes } from "../src/plugins/routes";
import { createSharedUseStore } from "../src/plugins/shared-use-store";
import { createPluginStore } from "../src/plugins/store";
import { grantedTools } from "../src/plugins/tools";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * APPROVING A REQUEST IN THE INBOX NEVER GIVES A BOT A TOOL THAT SENDS.
 *
 * The maintainer's decision of 14 November 2026. Before it, the inbox row for a tool a Bot's skill
 * needs and it was never given (issue #102, docs/M1_PLAN.md D31) named each tool and approved
 * exactly those, "a send included, because the press is the choice", and the approve route took any
 * tool the app advertised in `refs`, from the browser or from a direct call. So one press, or one
 * call, could give a member `gmail_send_message`, whichever member the request was for.
 *
 * Now a tool that sends is granted from settings, on the Bot's page for the app, by the person, and
 * from nowhere else. What is a send is read from an explicit list on each catalogue entry
 * (`sendTools`), never from a word in a name; an app with no entry has no list, and there only what
 * the vendor labelled a read can be approved from here. Every other tool is what it was: a write
 * that asks at the call (D33), approvable by naming it.
 *
 * Real Postgres, the real store and the real routes. The vendor is not involved: the rows an app's
 * refresh would write are written directly. Tests whose names carry "(guard)" pin behaviour that did
 * not change and pass on the code from before; every other test here fails on it.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const id = (name: string) => `${name}-${suite}`;

const person = id("person");
const admin = id("admin");
// The member who sends email (Otto, D30): his skill names the send tools.
const otto = id("otto");
// A member who does not send, whose Gmail the person has not switched on.
const penny = id("penny");
// A member who reads Gmail and has a skill naming only reads.
const iris = id("iris");

const SKILL = id("skill-send");
// A server an administrator added by URL: no catalogue entry, so no list of what sends.
const CUSTOM = id("tracker");
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

const BOTS = [otto, penny, iris];
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
  return (await json<{ request: AppAccessRequestRecord }>(response)).request.id;
};

const approve = (requestId: string, body?: unknown) =>
  appAs(admin, "admin").request(
    `/api/plugins/access-requests/${requestId}/approve`,
    post(body),
  );

/** What the settings page does when the person switches one action on for one Bot. */
const allowInSettings = (ref: string, agentId: string, as = admin) =>
  appAs(as, as === admin ? "admin" : "user").request(
    "/api/plugins/grants",
    post({ kind: "mcp", ref, agentId }),
  );

const statusOf = async (requestId: string) =>
  (
    await database
      .select({ status: appAccessRequests.status })
      .from(appAccessRequests)
      .where(eq(appAccessRequests.id, requestId))
  )[0]?.status;

const refusals = () =>
  events.filter((event) => event.eventType === "app_access.refused");

/* ---- the catalogue entries that have something that sends ---- */

/**
 * `held` is the one tool the Bot already has, so the app is READY for it; `newRead` is a tool its
 * skill needs and it was never given; `sends` are the tools that send; `otherWrite` is a write that
 * sends nothing, where the entry has one.
 */
type Case = {
  key: string;
  held: string;
  newRead: string;
  sends: string[];
  otherWrite: string | null;
};
const CASES: Case[] = [
  {
    key: "google-imap",
    held: "gmail_search_messages",
    newRead: "gmail_read_message",
    sends: ["gmail_send_reply", "gmail_send_message"],
    otherWrite: null,
  },
  {
    key: "google-workspace",
    held: "gmail_search_messages",
    newRead: "gmail_read_message",
    sends: ["gmail_send_reply", "gmail_send_message"],
    otherWrite: null,
  },
  {
    key: "notion",
    held: "notion-search",
    newRead: "notion-fetch",
    sends: ["notion-create-comment"],
    otherWrite: "notion-update-page",
  },
  {
    key: "firecrawl",
    held: "firecrawl_search",
    newRead: "firecrawl_scrape",
    sends: [
      "firecrawl_interact",
      "firecrawl_feedback",
      "firecrawl_search_feedback",
    ],
    otherWrite: "firecrawl_crawl",
  },
];

const credentialIds: string[] = [];

/**
 * A catalogue entry's connection as a deployment that has it holds it: the row, a credential where
 * the entry needs an OAuth client, and every tool the entry knows, classified as a refresh classifies.
 */
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
  // An app used under each person's own account reads `ready` only once the person has connected it.
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

const ref = (key: string, tool: string) => `${key}/${tool}`;

/** The skill of the member who sends: it names every tool the case needs beyond the one held. */
async function skillFor(c: Case, agentId = otto) {
  await store.installSkill({
    slug: SKILL,
    title: "Send a new message",
    summary: "Write to somebody who has not written first.",
    instructions: "Send it.",
    ownerUserId: null,
    tools: [
      ref(c.key, c.newRead),
      ...c.sends.map((tool) => ref(c.key, tool)),
      ...(c.otherWrite ? [ref(c.key, c.otherWrite)] : []),
    ],
    by: "admin@example.test",
  });
  await store.grant("skill", SKILL, agentId, "admin@example.test");
}

/** The app as an older build left it for this member: the one tool held, the skill that needs more. */
async function setUp(c: Case) {
  await seedEntry(c.key);
  await store.grant("mcp", ref(c.key, c.held), otto, "admin@example.test");
  await skillFor(c);
}

async function clear() {
  await database
    .delete(appAccessRequests)
    .where(inArray(appAccessRequests.requestedBy, [person, admin]));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, BOTS));
  await database.delete(skills).where(eq(skills.slug, SKILL));
  await database
    .delete(mcpServers)
    .where(inArray(mcpServers.id, [...CASES.map((c) => c.key), CUSTOM]));
  // After the servers, which the person's connection rows follow (cascade) and which point at these.
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

for (const c of CASES) {
  describe(`${c.key}: the tools that send are never given by a request`, () => {
    test("the card says which of the tools it asks for send, and that they are allowed in settings", async () => {
      await setUp(c);

      const app = await stateOf(otto, c.key);

      expect(app.state).toBe("ready");
      expect(app.requestKind).toBe("grant");
      const wanted = new Map(app.wants?.map((want) => [want.name, want]));
      for (const tool of c.sends)
        expect(wanted.get(tool)).toMatchObject({ settingsOnly: "send" });
      // The reads, and a write that sends nothing, are not marked: the press gives those.
      expect("settingsOnly" in (wanted.get(c.newRead) ?? {})).toBe(false);
      if (c.otherWrite)
        expect("settingsOnly" in (wanted.get(c.otherWrite) ?? {})).toBe(false);

      // The administrator's inbox reads the same, so the row can say it.
      await fileRequest(otto, c.key);
      const inbox = await json<{ requests: AppAccessRequestRecord[] }>(
        await appAs(admin, "admin").request("/api/plugins/access-requests"),
      );
      const row = inbox.requests.find((request) => request.agentId === otto);
      for (const tool of c.sends)
        expect(row?.wants?.find((want) => want.name === tool)).toMatchObject({
          settingsOnly: "send",
        });
    });

    test("a direct call naming one is refused by the server, in plain words, and gives nothing", async () => {
      await setUp(c);
      const requestId = await fileRequest(otto, c.key);
      const before = await heldBy(otto);

      for (const tool of c.sends) {
        const response = await approve(requestId, {
          refs: [ref(c.key, tool)],
        });

        expect(response.status).toBe(403);
        const { error } = await json<{ error: string }>(response);
        expect(error).toContain(tool);
        expect(error).toContain("can send on the person's behalf");
        expect(error).toContain("in settings");
        expect(error).toContain("Bot's page");
        expect(await heldBy(otto)).toEqual(before);
        // It waits, to be allowed where it can be.
        expect(await statusOf(requestId)).toBe("pending");
      }
      expect(refusals().map((event) => event.payload)).toEqual(
        c.sends.map(() =>
          expect.objectContaining({ reason: "settings_only_tool" }),
        ),
      );
    });

    test("naming a send beside a read refuses the whole press, so the read is not given either", async () => {
      await setUp(c);
      const requestId = await fileRequest(otto, c.key);
      const before = await heldBy(otto);

      const response = await approve(requestId, {
        refs: [ref(c.key, c.newRead), ref(c.key, c.sends[0] ?? "")],
      });

      expect(response.status).toBe(403);
      expect(await heldBy(otto)).toEqual(before);
      expect(await statusOf(requestId)).toBe("pending");
    });

    test("a member who holds none of the app is not given one by naming it either", async () => {
      await setUp(c);
      // Penny holds nothing of the app, so her request is the first grant, not a top-up.
      const requestId = await fileRequest(penny, c.key);

      const response = await approve(requestId, {
        refs: [ref(c.key, c.sends[0] ?? "")],
      });

      expect(response.status).toBe(403);
      expect(await heldBy(penny)).toEqual([]);
      expect(await statusOf(requestId)).toBe("pending");
    });

    test("a plain press still gives the reads and nothing that sends (guard)", async () => {
      await setUp(c);
      const requestId = await fileRequest(otto, c.key);

      const response = await approve(requestId);

      expect(response.status).toBe(200);
      expect((await json<{ granted: string[] }>(response)).granted).toEqual([
        ref(c.key, c.newRead),
      ]);
      const held = await heldBy(otto);
      for (const tool of c.sends) expect(held).not.toContain(ref(c.key, tool));
    });

    test("a send recorded as a read by a hand on the column is still not handed out by a plain press", async () => {
      await setUp(c);
      // Penny holds nothing, so a plain press is a first grant: every tool the app marks read-only.
      await database
        .update(mcpTools)
        .set({ effect: "read" })
        .where(
          and(eq(mcpTools.serverId, c.key), inArray(mcpTools.name, c.sends)),
        );
      const requestId = await fileRequest(penny, c.key);

      const response = await approve(requestId);

      expect(response.status).toBe(200);
      const held = await heldBy(penny);
      for (const tool of c.sends) expect(held).not.toContain(ref(c.key, tool));
      expect(held).toContain(ref(c.key, c.held));
    });

    test("the settings page still grants it, and then nothing is asked for", async () => {
      await setUp(c);
      const requestId = await fileRequest(otto, c.key);
      const send = ref(c.key, c.sends[0] ?? "");
      // The inbox does not, whoever presses.
      expect((await approve(requestId, { refs: [send] })).status).toBe(403);
      expect(await heldBy(otto)).not.toContain(send);

      const response = await allowInSettings(send, otto);

      expect(response.status).toBe(200);
      expect(await heldBy(otto)).toContain(send);
      const after = await stateOf(otto, c.key);
      expect(after.wants?.map((want) => want.name) ?? []).not.toContain(
        c.sends[0] ?? "",
      );
      // And the Bot is offered it, which is what the grant is for.
      const offered = (
        await grantedTools({ store, botId: otto, actorId: person })
      ).map((tool) => tool.name);
      expect(offered).toContain(`mcp__${c.key}__${c.sends[0]}`);
    });

    if (c.otherWrite) {
      test("a write that sends nothing is still approved by naming it, in one press (guard)", async () => {
        await setUp(c);
        const requestId = await fileRequest(otto, c.key);
        const write = ref(c.key, c.otherWrite ?? "");

        const response = await approve(requestId, { refs: [write] });

        expect(response.status).toBe(200);
        expect((await json<{ granted: string[] }>(response)).granted).toEqual([
          write,
        ]);
        expect(await heldBy(otto)).toContain(write);
      });
    }
  });
}

describe("the member who sends, and the ones who do not (D30)", () => {
  const gmail = CASES[0] as Case;
  const send = ref(gmail.key, "gmail_send_message");

  test("(guard) after the person allows it for the sender in settings, nobody else holds a send tool, and nobody else is offered one", async () => {
    await setUp(gmail);
    // The members who are not the sender hold Gmail's reads, as the person set them up.
    for (const other of [penny, iris])
      await store.grant(
        "mcp",
        ref(gmail.key, gmail.held),
        other,
        "admin@example.test",
      );
    expect((await allowInSettings(send, otto)).status).toBe(200);

    expect(await heldBy(otto)).toContain(send);
    for (const other of [penny, iris]) {
      expect(await heldBy(other)).toEqual([ref(gmail.key, gmail.held)]);
      const offered = (
        await grantedTools({ store, botId: other, actorId: person })
      ).map((tool) => tool.name);
      expect(offered.filter((name) => name.includes("gmail_send"))).toEqual([]);
      // And their skills do not ask for one: nothing in the inbox is waiting on a send for them.
      expect("wants" in (await stateOf(other, gmail.key))).toBe(false);
    }
  });

  test("another member's request cannot be answered with one either, before or after the sender's grant", async () => {
    await setUp(gmail);
    const requestId = await fileRequest(penny, gmail.key);
    expect((await approve(requestId, { refs: [send] })).status).toBe(403);
    expect((await allowInSettings(send, otto)).status).toBe(200);

    // The same request, answered again after the sender was given it: still refused.
    expect((await approve(requestId, { refs: [send] })).status).toBe(403);

    expect(await heldBy(penny)).toEqual([]);
    // Pressed plain, it gives Penny the reads and still no send.
    const plain = await approve(requestId);
    expect(plain.status).toBe(200);
    expect(await heldBy(penny)).not.toContain(send);
  });

  test("only an administrator can allow it in settings (guard)", async () => {
    await setUp(gmail);

    const response = await allowInSettings(send, otto, person);

    expect(response.status).toBe(403);
    expect(await heldBy(otto)).not.toContain(send);
  });
});

describe("an app with no entry has no list, so only what its vendor labelled a read is approved from the inbox", () => {
  const NEW_READ = "get_thing";
  const WRITE = "change_thing";
  const HELD = "read_thing";
  const custom = (tool: string) => `${CUSTOM}/${tool}`;

  async function seedCustom() {
    await database.insert(mcpServers).values({
      id: CUSTOM,
      title: "Tracker",
      vendor: "Test",
      url: "https://mcp.example.invalid/tracker",
      provenance: "custom",
    });
    await database.insert(mcpTools).values(
      [
        { name: HELD, effect: "read" },
        { name: NEW_READ, effect: "read" },
        { name: WRITE, effect: "write" },
      ].map((tool) => ({
        serverId: CUSTOM,
        name: tool.name,
        vendorName: tool.name,
        description: tool.name,
        effect: tool.effect,
      })),
    );
    await store.grant("mcp", custom(HELD), otto, "admin@example.test");
    await store.installSkill({
      slug: SKILL,
      title: "Update the tracker",
      summary: "Change things.",
      instructions: "Do it.",
      ownerUserId: null,
      tools: [custom(NEW_READ), custom(WRITE)],
      by: "admin@example.test",
    });
    await store.grant("skill", SKILL, otto, "admin@example.test");
  }

  test("a write is marked, a read is not, and naming the write is refused with the reason", async () => {
    await seedCustom();
    const app = await stateOf(otto, CUSTOM);
    const wanted = new Map(app.wants?.map((want) => [want.name, want]));
    expect(wanted.get(WRITE)).toMatchObject({ settingsOnly: "unreviewed" });
    expect("settingsOnly" in (wanted.get(NEW_READ) ?? {})).toBe(false);
    const requestId = await fileRequest(otto, CUSTOM);

    const response = await approve(requestId, { refs: [custom(WRITE)] });

    expect(response.status).toBe(403);
    const { error } = await json<{ error: string }>(response);
    expect(error).toContain(WRITE);
    expect(error).toContain("No reviewed list says what");
    expect(error).toContain("in settings");
    expect(await heldBy(otto)).toEqual([custom(HELD)]);
  });

  test("the read is approved in one press, and the write is allowed in settings (guard)", async () => {
    await seedCustom();
    const requestId = await fileRequest(otto, CUSTOM);

    const plain = await approve(requestId);
    expect(plain.status).toBe(200);
    expect(await heldBy(otto)).toEqual([custom(HELD), custom(NEW_READ)].sort());

    expect((await allowInSettings(custom(WRITE), otto)).status).toBe(200);
    expect(await heldBy(otto)).toContain(custom(WRITE));
  });
});
