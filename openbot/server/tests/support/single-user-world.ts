// server/tests/support/single-user-world.ts
//
// One whole installation, in a scratch database, that can be started with no sign-in, stopped, and
// started again with a sign-in provider: what the maintainer's computer is about to do.
//
// WHAT IS REAL. The database (a PostgreSQL schema built by the real migrations, plus the FreeDuet
// thread tables), the stores that write and read it, `createApp` with those stores in the positions
// the real server gives them, and `createAuth` for the provider mode: a sign-in is the real callback
// exchange against a stand-in provider, and what comes back is a real session cookie.
//
// WHAT IS NOT. The provider is a twenty-line server in this file that says whoever the test says is
// signing in (the recipe `freeduet-signin-allowlist-callback.integration.test.ts` uses). It proves
// what this deployment does with an answer, not that Google or Okta gives that answer. There is no
// Bot runtime, no Intelligence, no mail and no browser: what is seeded is data, and what is read is
// what the app's own routes and stores say about it.
//
// A "server" here is a set of freshly built stores and an app over them, the way a process starting
// up builds them, so a cache a process keeps (the team pass remembers whom it has settled) does not
// survive a restart the test is about.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createAgentProfileStore } from "../../src/agents/profile-store";
import { createApprovalQuestions } from "../../src/approvals/questions";
import { createApprovalService } from "../../src/approvals/service";
import { createApprovalStore } from "../../src/approvals/store";
import { createAuditStore } from "../../src/audit";
import { createAuth } from "../../src/auth";
import { DEV_ACTOR, initializeDevActorUser } from "../../src/auth/dev-actor";
import { createRoleRepository } from "../../src/auth/guards";
import { createChannelStore } from "../../src/channels/routes";
import { createThreadIdentity } from "../../src/channels/thread-identity";
import { loadConfig } from "../../src/config";
import { createDatabase, type Database } from "../../src/db/client";
import {
  agentProfiles,
  agents,
  composioConnections,
  workItems,
} from "../../src/db/schema";
import { createFullAccess } from "../../src/freeduet/full-access";
import {
  createPersonTeam,
  teamOnboarding,
} from "../../src/freeduet/person-team";
import { createMemoryStore } from "../../src/memory/store";
import { createPasswordStore } from "../../src/passwords/store";
import { createOnboardingStore } from "../../src/people/onboarding";
import { createRoutineStore } from "../../src/routines/store";
import type { TenantPackage } from "../../src/tenant-package";
import { createUserInstructionsStore } from "../../src/user-instructions";
import { appByName } from "./app-by-name";
import { testEnvironment } from "./environment";
import { LOOPBACK_PEER } from "./loopback-peer";
import { createScratchDatabase } from "./scratch-database";

/** The address of the person who is about to turn sign-in on. */
export const PERSON_ADDRESS = "you@example.com";

/** Where the app thinks it is served. Better Auth checks the origin of a sign-in against it. */
export const BASE_URL = "http://localhost:3001";

/** The package's head and one more member, as FreeDuet's own package has them. */
export const IRIS = "world-iris";
export const PENNY = "world-penny";

const CHANNELS: TenantPackage["channels"] = [
  {
    id: "world-main",
    name: "FreeDuet",
    description:
      "Talk to Iris. She hands work to the team and brings the results back.",
    permittedAgents: [IRIS],
    allowedGroups: ["all"],
  },
  {
    id: "world-books",
    name: "Invoices & bills",
    description:
      "Penny drafts invoices, tracks who owes what and keeps the ledger.",
    permittedAgents: [PENNY],
    allowedGroups: ["all"],
  },
];

function member(id: string, name: string): TenantPackage["agents"][number] {
  return {
    id,
    name,
    title: name,
    roleDescription: name,
    type: "built_in",
    configuration: { systemPrompt: "Help." },
    skills: [],
  };
}

const TENANT_PACKAGE = {
  tenantId: IRIS,
  agents: [member(IRIS, "Iris"), member(PENNY, "Penny")],
  channels: CHANNELS,
};

export type Mode =
  | { kind: "single-user" }
  | {
      kind: "provider";
      /** Who may be an administrator. Defaults to the person's address. */
      adminEmails?: string;
      /** Set, and only these addresses may sign in. */
      signInAllowedEmails?: string;
    };

/** The environment a mode boots with. A provider means the stand-in one, as Okta. */
export function environmentFor(mode: Mode, issuer: string) {
  if (mode.kind === "single-user") {
    const {
      GOOGLE_OAUTH_CLIENT_ID: _id,
      GOOGLE_OAUTH_CLIENT_SECRET: _secret,
      BETTER_AUTH_SECRET: _auth,
      BETTER_AUTH_URL: _url,
      INITIAL_ADMIN_EMAILS: _admins,
      ...rest
    } = testEnvironment();
    return {
      ...rest,
      OPENBOT_SINGLE_USER: "true",
      FREEDUET_INTELLIGENCE: "off",
    };
  }
  const {
    GOOGLE_OAUTH_CLIENT_ID: _id,
    GOOGLE_OAUTH_CLIENT_SECRET: _secret,
    ...rest
  } = testEnvironment();
  return {
    ...rest,
    OKTA_OAUTH_CLIENT_ID: "okta-client",
    OKTA_OAUTH_CLIENT_SECRET: "okta-client-secret-long-enough",
    OKTA_OAUTH_ISSUER: issuer,
    FREEDUET_INTELLIGENCE: "off",
    INITIAL_ADMIN_EMAILS: mode.adminEmails ?? PERSON_ADDRESS,
    ...(mode.signInAllowedEmails
      ? { SIGNIN_ALLOWED_EMAILS: mode.signInAllowedEmails }
      : {}),
  };
}

/** What a person is shown, read the way the app reads it. */
export type Person = {
  /** The id the app has for this person, from /api/me. */
  id: string;
  email: string;
  role: string;
};

export type World = Awaited<ReturnType<typeof createWorld>>;

export async function createWorld() {
  const scratch = await createScratchDatabase({ max: 4 });
  /** The pool the world's stores use. Replaced when "the server" is stopped and started again. */
  let database: Database = scratch.database;

  /** Who the stand-in provider says is signing in. Set before a sign-in starts. */
  let signingIn = PERSON_ADDRESS;
  let issuer = "";
  const idp = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      switch (url.pathname) {
        case "/.well-known/openid-configuration":
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            userinfo_endpoint: `${issuer}/userinfo`,
          });
        case "/authorize": {
          const back = new URL(url.searchParams.get("redirect_uri") ?? "");
          back.searchParams.set("code", "the-code");
          back.searchParams.set("state", url.searchParams.get("state") ?? "");
          return new Response(null, {
            status: 302,
            headers: { location: back.toString() },
          });
        }
        case "/token":
          return Response.json({
            access_token: "the-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid profile email",
          });
        case "/userinfo":
          return Response.json({
            id: `subject-${signingIn}`,
            email: signingIn,
            name: signingIn,
            email_verified: true,
          });
        default:
          return new Response("not found", { status: 404 });
      }
    },
  });
  issuer = `http://127.0.0.1:${idp.port}`;

  // The members the package names, as the boot of a FreeDuet server leaves them.
  for (const agent of TENANT_PACKAGE.agents) {
    await database.insert(agents).values({
      id: agent.id,
      name: agent.name,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
    });
    await database.insert(agentProfiles).values({
      agentId: agent.id,
      title: agent.title,
      roleDescription: agent.roleDescription,
      avatarSeed: agent.id,
      visibility: "public",
    });
  }

  /** The stores a process builds, all over this one database. */
  function stores() {
    const profiles = createAgentProfileStore(database, undefined);
    const channels = createChannelStore(
      database,
      profiles,
      createThreadIdentity("test-deployment"),
    );
    const routines = createRoutineStore(database);
    const team = createPersonTeam({
      database,
      channels,
      routines: {
        create: (input) => routines.create(input),
        listFor: (owner) => routines.listFor(owner),
      },
      actorFor: async (id) => ({ id, role: "user" as const }),
      tenantPackage: TENANT_PACKAGE,
    });
    const approvalStore = createApprovalStore(database);
    const fullAccess = createFullAccess({
      database,
      known: async () => true,
      audit: createAuditStore(database),
    });
    return {
      profiles,
      channels,
      routines,
      onboarding: teamOnboarding(createOnboardingStore(database), team),
      instructions: createUserInstructionsStore(database),
      approvalStore,
      fullAccess,
      approvals: createApprovalService(
        approvalStore,
        createApprovalQuestions(database, async () => undefined),
        undefined,
        { fullAccess },
      ),
      memory: createMemoryStore(database),
      passwords: createPasswordStore(database),
    };
  }

  /** One process: the stores, the app over them, and a way to make a request to it. */
  function boot(mode: Mode) {
    const parts = stores();
    const config = loadConfig(environmentFor(mode, issuer));
    const auth =
      mode.kind === "provider"
        ? createAuth(
            config,
            database,
            async () => false,
            createAuditStore(database),
          )
        : undefined;
    const app = appByName({
      config,
      auth,
      roleRepository:
        mode.kind === "provider" ? createRoleRepository(database) : undefined,
      agentProfileStore: parts.profiles,
      channelStore: parts.channels,
      routineStore: parts.routines,
      onboardingStore: parts.onboarding,
      userInstructions: parts.instructions,
      coworker: { approvals: parts.approvals },
    });

    /** One request. With no sign-in the peer is loopback; with one, a cookie says who is asking. */
    async function request(path: string, init: RequestInit = {}) {
      return mode.kind === "single-user"
        ? app.request(`${BASE_URL}${path}`, init, LOOPBACK_PEER)
        : app.request(`${BASE_URL}${path}`, init);
    }

    /** One sign-in, as a browser does it. Returns the cookie header a browser would then send. */
    async function signIn(email: string) {
      if (!auth) throw new Error("There is no sign-in with no provider.");
      signingIn = email;
      const start = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE_URL },
          body: JSON.stringify({
            provider: "okta",
            callbackURL: "/",
            disableRedirect: true,
          }),
        }),
      );
      const { url } = (await start.json()) as { url: string };
      const startCookie = start.headers
        .getSetCookie()
        .map((header) => header.split(";")[0])
        .join("; ");
      const atProvider = await fetch(url, { redirect: "manual" });
      const callback = atProvider.headers.get("location") ?? "";
      const response = await auth.handler(
        new Request(callback, { headers: { cookie: startCookie } }),
      );
      const cookie = response.headers
        .getSetCookie()
        .map((header) => header.split(";")[0])
        .join("; ");
      return { status: response.status, cookie };
    }

    /** What the app says, for whoever the cookie (or the loopback peer) is. */
    async function get(path: string, cookie?: string) {
      const response = await request(path, {
        headers: cookie ? { cookie } : {},
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    }

    return { ...parts, mode, config, request, get, signIn };
  }

  return {
    get database() {
      return database;
    },
    url: scratch.url,
    /**
     * The settings the adoption command is run with: this installation's database, the mode's
     * provider settings, and a port nothing listens on, which is where "the server" is not.
     */
    environment(
      mode: Mode = { kind: "provider" },
      overrides: Record<string, string> = {},
    ) {
      return {
        ...environmentFor(mode, issuer),
        DATABASE_URL: scratch.url,
        PORT: String(freePort()),
        ...overrides,
      } as Record<string, string | undefined>;
    },
    stores,
    boot,
    /**
     * Stops "the server": closes every connection the world holds, so that nothing is using the
     * database, as it is when the person has stopped the server and the worker. The adoption command
     * refuses while anything else is connected, so it is run in here.
     */
    async disconnect() {
      await database.$client.close().catch(() => undefined);
      await scratch.idle();
    },
    /** Starts "the server" again: a new pool, and stores built over it by the next `boot`. */
    reconnect() {
      database = createDatabase(scratch.url, { max: 4 });
    },
    /** Runs `action` with nothing connected but whatever `action` opens itself. */
    async whileStopped<T>(action: () => Promise<T>): Promise<T> {
      await database.$client.close().catch(() => undefined);
      await scratch.idle();
      try {
        return await action();
      } finally {
        database = createDatabase(scratch.url, { max: 4 });
      }
    },
    /** The dev person's row, as a single-user server's boot leaves it. */
    async startSingleUser() {
      await initializeDevActorUser(database, true);
      return boot({ kind: "single-user" });
    },
    async dispose() {
      idp.stop(true);
      await database.$client.close().catch(() => undefined);
      await scratch.drop();
    },
  };
}

/**
 * What a person who has used FreeDuet with no sign-in has, in every family the app shows them.
 *
 * Seeded through the real stores wherever a store has a call for it, and through the app's own first
 * request for the team (the conversations and the daily review are made by `GET /api/me`, which is
 * how they were made in life). The rest is the smallest row that is real.
 */
export async function seedAsSingleUser(
  world: World,
  server: ReturnType<World["boot"]>,
) {
  const owner = DEV_ACTOR.id;
  const { database } = world;

  // The first request after opening the app: the team's conversations, the daily review, onboarding.
  const me = await server.get("/api/me");
  if (me.status !== 200) throw new Error("The single-user app did not answer.");

  await server.instructions.write(owner, "Always answer in two sentences.");
  const memory = await server.memory.create(owner, {
    content: "My accountant is called Lucia.",
  });
  await server.passwords.saveLogin({
    ownerUserId: owner,
    origin: "https://bank.example.com",
    username: "me",
    encryptedPassword: "sealed-not-a-real-password",
  });
  const rule = await server.approvalStore.policy.createRule(owner, {
    botId: PENNY,
    toolRef: "gmail",
    effect: "send",
    scope: "*",
    behaviour: "allow",
  });
  await server.fullAccess.set(owner, IRIS, true);
  const routine = await server.routines.create({
    ownerUserId: owner,
    agentId: PENNY,
    instruction: "Every Friday, list the invoices still unpaid.",
    cron: "0 9 * * 5",
    timezone: "Europe/Rome",
  });
  // A question Iris asked and the person has not answered yet.
  await database.insert(workItems).values({
    kind: "person.question",
    key: randomUUID(),
    payload: {
      actorId: owner,
      botId: IRIS,
      threadId: randomUUID(),
      runId: randomUUID(),
      question: "Which account should I use for the refund?",
      mode: "completed_question",
    },
  });
  // A connected app: the broker's record that this person said yes to it.
  await database
    .insert(composioConnections)
    .values({ toolkit: "gmail", userId: owner });
  // A Bot the person made, which is theirs.
  const myBot = `world-my-bot-${randomUUID().slice(0, 8)}`;
  await database.insert(agents).values({
    id: myBot,
    name: "My bot",
    type: "built_in",
    configuration: { systemPrompt: "Help." },
  });
  await database.insert(agentProfiles).values({
    agentId: myBot,
    ownerUserId: owner,
    title: "My bot",
    roleDescription: "Mine",
    avatarSeed: myBot,
    visibility: "private",
  });

  return { memoryId: memory.id, ruleId: rule.id, routineId: routine.id, myBot };
}

/** The user row for an address, or undefined. */
export async function userByEmail(database: Database, email: string) {
  const { users } = await import("../../src/db/schema");
  const [row] = await database
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row;
}

/** A port nothing is listening on at this moment. */
export function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

/**
 * Every table's row count and a hash of its rows, so a test can say "nothing was written" and mean
 * every table. Rows are hashed as text, in the text's own order.
 */
export async function snapshot(database: Database, only?: readonly string[]) {
  const tables = (await database.execute(sql`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by 1
  `)) as unknown as { name: string }[];
  const taken: Record<string, string> = {};
  for (const { name } of tables) {
    if (only && !only.includes(name)) continue;
    const [row] = (await database.execute(
      sql`select count(*)::int as n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from ${sql.identifier(name)} t`,
    )) as unknown as { n: number; h: string }[];
    taken[name] = `${row?.n}:${row?.h}`;
  }
  return taken;
}

/** What a person is shown, read through the app's own routes and stores. */
export type Seen = {
  conversations: string[];
  instructions: string;
  routines: string[];
  rules: number;
  questions: number;
  fullAccessBots: string[];
  memories: number;
  savedLogins: number;
  /** The Bots this person made, as the Bots list shows them to this person. */
  bots: string[];
};

export async function seenBy(
  server: ReturnType<World["boot"]>,
  userId: string,
  cookie?: string,
): Promise<Seen> {
  const channels = (await server.get("/api/channels", cookie)).body as {
    channels: { id: string }[];
  };
  const instructions = (await server.get("/api/settings/instructions", cookie))
    .body as { instructions: string };
  const routineList = (await server.get("/api/routines", cookie)).body as {
    routines: { id: string }[];
  };
  const approvals = (await server.get("/api/approvals", cookie)).body as {
    rules: unknown[];
    questions: unknown[];
  };
  const fullAccess = (await server.get("/api/approvals/full-access", cookie))
    .body as { bots: Record<string, unknown> };
  return {
    conversations: channels.channels.map((channel) => channel.id).sort(),
    instructions: instructions.instructions,
    routines: routineList.routines.map((routine) => routine.id).sort(),
    rules: approvals.rules.length,
    questions: approvals.questions.length,
    fullAccessBots: Object.keys(fullAccess.bots).sort(),
    memories: (await server.memory.list(userId)).length,
    savedLogins: (await server.passwords.logins(userId)).length,
    bots: (await server.profiles.list({ id: userId, role: "user" }))
      .filter((profile) => profile.ownerUserId === userId)
      .map((profile) => profile.id)
      .sort(),
  };
}
