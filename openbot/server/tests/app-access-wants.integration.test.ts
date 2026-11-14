import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { readConnectPrompt } from "@openbot/shared/connect-prompt";
import { and, eq, inArray } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import type { AuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  appAccessRequests,
  mcpServers,
  mcpTools,
  pluginGrants,
  skills,
  users,
} from "../src/db/schema";
import type { AppAccess } from "../src/plugins/app-access";
import { appAccessTools } from "../src/plugins/app-access-tool";
import type { AppAccessRequestRecord } from "../src/plugins/plugin-store/app-access";
import { createPluginRoutes } from "../src/plugins/routes";
import { createSharedUseStore } from "../src/plugins/shared-use-store";
import { createPluginStore } from "../src/plugins/store";
import { grantedTools } from "../src/plugins/tools";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * A tool a Bot's own skill needs, that the app offers and the Bot was never given (issue #102).
 *
 * A build can add a tool to a connector a Bot already holds, and a tool is never granted by arriving.
 * What must hold for the person, through the real routes and tables: the app is still READY, because
 * the Bot can use everything it holds; the card carries the one request for the rest, once; nothing is
 * granted until an administrator answers it; and what one press gives is the tools the row names, with
 * a plain press giving only the read-only ones, exactly as a first grant does.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const id = (name: string) => `${name}-${suite}`;

const person = id("person");
const admin = id("admin");
const bot = id("bot");
const bare = id("bare");
const SERVER = id("tracker");
const OTHER = id("other-server");
const SKILL = id("skill-send");
const UNHELD_SKILL = id("skill-unheld");

const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const audit: AuditStore = { insert: async () => {} };
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: audit,
  credentials: createCredentialStore(database),
  encryptionKey: "x".repeat(44),
  policy: () => policy,
});

const ref = (name: string, server = SERVER) => `${server}/${name}`;
const HELD = "read_thing";
const NEW_READ = "get_thing";
const NEW_WRITE = "send_thing";

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

const stateOf = async (agentId = bot, app = SERVER): Promise<AppAccess> => {
  const response = await appAs(person).request(
    `/api/plugins/for/${agentId}/apps/${app}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { app: AppAccess }).app;
};

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

/** The server, its tools, the Bot holding one of them, and a skill of the Bot's naming two more. */
async function seed(options: { skillDeclares?: string[] } = {}) {
  await database.insert(mcpServers).values({
    id: SERVER,
    title: "Tracker",
    vendor: "Test",
    url: "https://mcp.example.invalid/tracker",
    provenance: "custom",
  });
  await database.insert(mcpTools).values([
    {
      serverId: SERVER,
      name: HELD,
      vendorName: HELD,
      description: "Read.",
      effect: "read",
    },
    {
      serverId: SERVER,
      name: NEW_READ,
      vendorName: NEW_READ,
      description: "Get.",
      effect: "read",
    },
    {
      serverId: SERVER,
      name: NEW_WRITE,
      vendorName: NEW_WRITE,
      description: "Send.",
      effect: "write",
    },
  ]);
  await store.grant("mcp", ref(HELD), bot, "admin@example.test");
  await store.installSkill({
    slug: SKILL,
    title: "Send a new message",
    summary: "Send one.",
    instructions: "Send it.",
    ownerUserId: null,
    tools: options.skillDeclares ?? [ref(NEW_READ), ref(NEW_WRITE)],
    by: "admin@example.test",
  });
  await store.grant("skill", SKILL, bot, "admin@example.test");
}

async function clear() {
  await database
    .delete(appAccessRequests)
    .where(inArray(appAccessRequests.requestedBy, [person, admin]));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, [bot, bare]));
  await database
    .delete(skills)
    .where(inArray(skills.slug, [SKILL, UNHELD_SKILL]));
  await database
    .delete(mcpServers)
    .where(inArray(mcpServers.id, [SERVER, OTHER]));
}

beforeAll(async () => {
  for (const user of [person, admin])
    await database.insert(users).values({
      id: user,
      email: `${user}@example.test`,
      name: user,
      emailVerified: true,
    });
  for (const agent of [bot, bare]) {
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
  await database.delete(agents).where(inArray(agents.id, [bot, bare]));
  await database.delete(users).where(inArray(users.id, [person, admin]));
  await database.$client.close();
});

describe("what the card says about an app the Bot can use but lacks tools of", () => {
  test("is still ready, names the tools its skill needs, and offers the one request", async () => {
    await seed();

    const app = await stateOf();

    expect(app.state).toBe("ready");
    expect(app.granted).toBe(true);
    expect(app.wants).toEqual([
      {
        ref: ref(NEW_READ),
        name: NEW_READ,
        label: "Send a new message",
        read: true,
      },
      {
        ref: ref(NEW_WRITE),
        name: NEW_WRITE,
        label: "Send a new message",
        read: false,
      },
    ]);
    expect(app.requestKind).toBe("grant");
    expect(app.request).toBeNull();
  });

  test("says nothing at all about wanted tools when there are none", async () => {
    await seed({ skillDeclares: [ref(HELD)] });

    const app = await stateOf();

    expect(app.state).toBe("ready");
    expect(app.requestKind).toBeNull();
    // Absent, not empty: every app that is not this case reads as it always did.
    expect("wants" in app).toBe(false);
  });

  test("a tool nothing offers is not asked for", async () => {
    await seed({ skillDeclares: [ref(NEW_WRITE)] });
    // The skill still says it needs the tool; the app no longer offers it.
    await database
      .delete(mcpTools)
      .where(and(eq(mcpTools.serverId, SERVER), eq(mcpTools.name, NEW_WRITE)));

    const app = await stateOf();

    expect(app.requestKind).toBeNull();
    expect("wants" in app).toBe(false);
  });

  test("a skill the Bot does not hold asks for nothing", async () => {
    await seed({ skillDeclares: [ref(HELD)] });
    await store.installSkill({
      slug: UNHELD_SKILL,
      title: "Somebody else's skill",
      summary: "Not this Bot's.",
      instructions: "No.",
      ownerUserId: null,
      tools: [ref(NEW_WRITE)],
      by: "admin@example.test",
    });

    const app = await stateOf();

    expect("wants" in app).toBe(false);
    expect(app.requestKind).toBeNull();
  });

  test("a Bot that holds none of the app keeps the request it always had", async () => {
    await seed();
    await store.grant("skill", SKILL, bare, "admin@example.test");

    const app = await stateOf(bare);

    expect(app.state).toBe("not_granted");
    expect(app.requestKind).toBe("grant");
    expect("wants" in app).toBe(false);
  });

  test("a skill naming tools of an app the Bot is not on does not put that app in front of the person", async () => {
    await seed({ skillDeclares: [ref(HELD)] });
    await database.insert(mcpServers).values({
      id: OTHER,
      title: "Another tool",
      vendor: "Test",
      url: "https://mcp.example.invalid/other",
      provenance: "custom",
    });
    await database.insert(mcpTools).values({
      serverId: OTHER,
      name: "wanted_elsewhere",
      vendorName: "wanted_elsewhere",
      description: "x",
      effect: "read",
    });
    await store.installSkill({
      slug: SKILL,
      title: "Send a new message",
      summary: "Send one.",
      instructions: "Send it.",
      ownerUserId: null,
      tools: [ref(HELD), ref("wanted_elsewhere", OTHER)],
      by: "admin@example.test",
    });

    const held = await stateOf(bot, SERVER);

    expect("wants" in held).toBe(false);
  });
});

describe("asking for them", () => {
  test("files one request, however many times it is pressed, and grants nothing", async () => {
    await seed();
    const before = await heldBy(bot);

    const first = await appAs(person).request(
      "/api/plugins/access-requests",
      post({ agentId: bot, app: SERVER }),
    );
    const second = await appAs(person).request(
      "/api/plugins/access-requests",
      post({ agentId: bot, app: SERVER }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const filed = await json<{
      request: AppAccessRequestRecord;
      created: boolean;
    }>(first);
    const again = await json<{
      request: AppAccessRequestRecord;
      created: boolean;
    }>(second);
    expect(filed.created).toBe(true);
    expect(filed.request.kind).toBe("grant");
    expect(again.created).toBe(false);
    expect(again.request.id).toBe(filed.request.id);
    // Not one grant more, and the card now reads as Requested.
    expect(await heldBy(bot)).toEqual(before);
    expect((await stateOf()).request?.id).toBe(filed.request.id);
  });

  test("the administrator's inbox names the tools the request asks for", async () => {
    await seed();
    await appAs(person).request(
      "/api/plugins/access-requests",
      post({ agentId: bot, app: SERVER }),
    );

    const inbox = await json<{ requests: AppAccessRequestRecord[] }>(
      await appAs(admin, "admin").request("/api/plugins/access-requests"),
    );

    expect(inbox.requests).toHaveLength(1);
    expect(inbox.requests[0]?.wants?.map((want) => want.name)).toEqual([
      NEW_READ,
      NEW_WRITE,
    ]);
  });

  test("a request for an app with nothing wanted is still refused as there being nothing to ask", async () => {
    await seed({ skillDeclares: [ref(HELD)] });

    const response = await appAs(person).request(
      "/api/plugins/access-requests",
      post({ agentId: bot, app: SERVER }),
    );

    expect(response.status).toBe(409);
  });
});

describe("answering it", () => {
  const fileRequest = async () => {
    const filed = await json<{ request: AppAccessRequestRecord }>(
      await appAs(person).request(
        "/api/plugins/access-requests",
        post({ agentId: bot, app: SERVER }),
      ),
    );
    return filed.request.id;
  };

  test("only an administrator can", async () => {
    await seed();
    const requestId = await fileRequest();

    const response = await appAs(person).request(
      `/api/plugins/access-requests/${requestId}/approve`,
      post(),
    );

    expect(response.status).toBe(403);
    expect(await heldBy(bot)).toEqual([ref(HELD)]);
  });

  test("a plain press gives the read-only tools it needs and not the one that writes", async () => {
    await seed();
    const requestId = await fileRequest();

    const response = await appAs(admin, "admin").request(
      `/api/plugins/access-requests/${requestId}/approve`,
      post(),
    );

    expect(response.status).toBe(200);
    expect((await json<{ granted: string[] }>(response)).granted).toEqual([
      ref(NEW_READ),
    ]);
    expect(await heldBy(bot)).toEqual([ref(HELD), ref(NEW_READ)].sort());
    // What is still missing is still asked for, as a new request.
    expect((await stateOf()).wants?.map((want) => want.name)).toEqual([
      NEW_WRITE,
    ]);
  });

  test("naming the tools gives exactly those, a write included, and the Bot is then offered them", async () => {
    await seed();
    const requestId = await fileRequest();

    const response = await appAs(admin, "admin").request(
      `/api/plugins/access-requests/${requestId}/approve`,
      post({ refs: [ref(NEW_READ), ref(NEW_WRITE)] }),
    );

    expect(response.status).toBe(200);
    expect(await heldBy(bot)).toEqual(
      [ref(HELD), ref(NEW_READ), ref(NEW_WRITE)].sort(),
    );
    const app = await stateOf();
    expect(app.requestKind).toBeNull();
    expect("wants" in app).toBe(false);
    // Offered to the model only now.
    const offered = (
      await grantedTools({ store, botId: bot, actorId: person })
    ).map((tool) => tool.name);
    expect(offered).toContain(`mcp__${SERVER}__${NEW_WRITE}`);
  });

  test("a plain press with only writes wanted gives nothing and leaves the request waiting", async () => {
    await seed({ skillDeclares: [ref(NEW_WRITE)] });
    const requestId = await fileRequest();

    const response = await appAs(admin, "admin").request(
      `/api/plugins/access-requests/${requestId}/approve`,
      post(),
    );

    expect(response.status).toBe(409);
    expect((await json<{ error: string }>(response)).error).toContain(
      NEW_WRITE,
    );
    expect(await heldBy(bot)).toEqual([ref(HELD)]);
    const [still] = await database
      .select({ status: appAccessRequests.status })
      .from(appAccessRequests)
      .where(eq(appAccessRequests.id, requestId));
    expect(still?.status).toBe("pending");
  });

  test("a tool outside the app is refused rather than dropped", async () => {
    await seed();
    const requestId = await fileRequest();

    const response = await appAs(admin, "admin").request(
      `/api/plugins/access-requests/${requestId}/approve`,
      post({ refs: [ref("not_a_tool")] }),
    );

    expect(response.status).toBe(400);
    expect(await heldBy(bot)).toEqual([ref(HELD)]);
  });
});

describe("what the Bot is told, and by whom", () => {
  async function toldBy(singleUser: boolean) {
    const [tool] = appAccessTools({
      store,
      botId: bot,
      actorId: person,
      composioConfigured: false,
      singleUser,
    });
    if (!tool) throw new Error("no tool");
    return String(await tool.execute({ app: SERVER }));
  }

  test("names the tool and the skill, puts the card in front of the person, and grants nothing", async () => {
    await seed();
    const before = await heldBy(bot);

    const told = await toldBy(false);

    const prompt = readConnectPrompt(told);
    expect(prompt?.serverId).toBe(SERVER);
    expect(prompt?.agentId).toBe(bot);
    expect(prompt?.reason).toBe("access");
    expect(told).toContain(`${NEW_WRITE} (Send a new message)`);
    expect(told).toContain("lets them ask an administrator");
    expect(told).not.toContain("only one here");
    expect(await heldBy(bot)).toEqual(before);
  });

  test("on a one-person deployment says they can allow it themselves", async () => {
    await seed();

    const told = await toldBy(true);

    expect(told).toContain("only one here");
    expect(told).toContain("they can allow them themselves");
    expect(told).not.toContain("lets them ask an administrator");
    expect(told).toContain(NEW_READ);
  });

  test("an app with nothing wanted is told exactly as it always was", async () => {
    await seed({ skillDeclares: [ref(HELD)] });

    const told = await toldBy(false);

    expect(told).toContain("is ready for this person to use through you.");
    expect(told).not.toContain("except for");
  });
});
