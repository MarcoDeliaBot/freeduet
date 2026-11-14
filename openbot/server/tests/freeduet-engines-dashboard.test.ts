/**
 * The Engines page's control (docs/design/engines-dashboard.md, docs/ENGINES_PLAN.md slice 7), through the real routes,
 * the real sign-in guard, a real database and the real audit trail, with a stand-in for agent-freeduet.
 *
 * What is proved here:
 *   - the page is told, for each team member, the engines it will try, in order, the ones left out with one word for why,
 *     the file's mode and the person's own choice laid over it, and whether it may change anything and, if not, why;
 *   - only an administrator at the computer FreeDuet runs on can change a mode: another role, a remote session and a
 *     session behind a tunnel are refused, and then nothing is written and nothing is recorded;
 *   - a change is stored, recorded, undone once, and refused when it is no longer the latest choice;
 *   - nothing secret is in any response, a refusal included: a canary key, an address with a password in it and a token
 *     put everywhere the engines file and the agent's environment keep such things never come back;
 *   - there is no route to store a key, to enable or disable an engine, or to change anything but a member's mode.
 */
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
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createApp } from "../src/app";
import { createAuditReader, createAuditStore } from "../src/audit";
import {
  type AuthService,
  createRequireUser,
  type RoleRepository,
} from "../src/auth/guards";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { enterpriseSettings } from "../src/db/schema";
import {
  createEngineChoices,
  ENGINE_CHANGE_TARGET,
  ENGINE_CHOICES_KEY,
  ENGINE_UNDO_TARGET,
  type EngineChoices,
  readDocument,
} from "../src/freeduet/engine-choices";
import {
  createEnginesRoutes,
  type EnginesReach,
  memberOf,
} from "../src/freeduet/engines-routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";
import { LOOPBACK_PEER } from "./support/loopback-peer";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const audit = createAuditStore(database);
const reader = createAuditReader(database);
const prefix = `ed-${randomUUID()}`;
/** The administrator, and a person who is not one. Neither needs a user row: the trail and the store keep ids only. */
const ADMIN = `${prefix}-admin`;
const PERSON = `${prefix}-person`;

const TOKEN = "stub-agent-token-7f3a";
/** A key as a provider writes one, an address with a password in it, and the name of the variable that holds a key. */
const CANARY_KEY = "sk-ant-api03-CANARYdoNotLeak0123456789abcdefXYZ";
const CANARY_URL = "https://user:CANARYpassword@gateway.example.test:8443/v1";
const CANARY_VARIABLE = "GATEWAY_CANARY_API_KEY";
const SECRETS = [
  CANARY_KEY,
  CANARY_URL,
  "CANARYpassword",
  "gateway.example.test",
  CANARY_VARIABLE,
  TOKEN,
];

/** Everything an engine row and a member row of the agent may carry beside what the page is given. */
const KEPT_WHERE_KEYS_LIVE = {
  api_key: CANARY_KEY,
  api_key_ref: `env:${CANARY_VARIABLE}`,
  base_url: CANARY_URL,
  env: { ANTHROPIC_API_KEY: CANARY_KEY, [CANARY_VARIABLE]: CANARY_KEY },
  headers: { authorization: `Bearer ${CANARY_KEY}` },
  token: CANARY_KEY,
  command: "/home/someone/.claude/bin/claude",
  args: ["--api-key", CANARY_KEY],
  version: "2.1.0 (secret build line)",
  probe_problem: `could not log in with ${CANARY_KEY}`,
};

const ENGINE_ROWS = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "cli",
    state: "ready",
    ...KEPT_WHERE_KEYS_LIVE,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "cli",
    state: "signed_out",
    ...KEPT_WHERE_KEYS_LIVE,
  },
  {
    id: "gateway",
    label: "A gateway",
    kind: "openai-compatible",
    state: "refused",
    refusal: `A gateway is metered, so it is not run. Its key ${CANARY_KEY} at ${CANARY_URL} stays unused.`,
    ...KEPT_WHERE_KEYS_LIVE,
  },
];

const MEMBER_ROWS = [
  {
    id: "iris",
    chain: ["claude", "codex"],
    left_out: [{ id: "gateway", why: "paid_gateway", ...KEPT_WHERE_KEYS_LIVE }],
    mode: "automatic",
    pin: null,
    ...KEPT_WHERE_KEYS_LIVE,
  },
  {
    id: "leo",
    chain: ["claude"],
    left_out: [],
    mode: "ask-first",
    pin: "claude",
  },
];

/** What the agent says for itself: the engines, the members, and that it honours version 1 of the person's choices. */
function agentBody(extra: Record<string, unknown> = {}) {
  return {
    engines: ENGINE_ROWS,
    members: MEMBER_ROWS,
    choices_version: 1,
    problems: [`engines.yaml: ${CANARY_VARIABLE} is set to ${CANARY_KEY}`],
    ...extra,
  };
}

/** A stand-in for agent-freeduet: records each request and answers as the agent does, token checked. */
function stubAgent(body: () => Record<string, unknown> = agentBody) {
  const seen: Request[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      seen.push(request);
      if (request.headers.get("x-openbot-agent-token") !== TOKEN)
        return Response.json({ error: "unauthorised" }, { status: 401 });
      return Response.json(body());
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/`,
    seen,
    stop: () => server.stop(true),
  };
}

const stubs: { stop: () => void }[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

/** The engines the stand-in lists, and the reach that goes to it; `environment` is the server's own, with keys in it. */
function reachTo(
  agent: { url: string },
  environment: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: CANARY_KEY,
    GATEWAY_API_KEY: CANARY_KEY,
    [CANARY_VARIABLE]: CANARY_KEY,
  },
): EnginesReach {
  return {
    environment,
    managedAgent: { endpoint: new URL(agent.url), token: TOKEN },
  };
}

type Who = { role?: "admin" | "user"; signedIn?: boolean; id?: string };

/** The sub-app as the app mounts it, behind the production sign-in guard. `choices` is left out for the read-only page. */
function dashboard(
  who: Who,
  reach: EnginesReach,
  service: EngineChoices | undefined,
) {
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () =>
        who.signedIn === false
          ? null
          : {
              user: {
                id: who.id ?? ADMIN,
                email: "person@openbot.test",
                role: who.role ?? "admin",
              },
            },
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const app = new Hono();
  app.route(
    "/api/freeduet/engines",
    createEnginesRoutes(createRequireUser(auth, roles), () => reach, service),
  );
  return app;
}

/** What one request answered, with the text kept so a test can look for anything in it. */
type Answer = {
  status: number;
  text: string;
  json: Record<string, unknown>;
  headers: Headers;
};

const everySeen: string[] = [];

async function send(
  app: Hono,
  method: "GET" | "PUT" | "POST" | "DELETE" | "PATCH",
  path: string,
  options: {
    body?: unknown;
    raw?: string;
    headers?: Record<string, string>;
    peer?: unknown;
  } = {},
): Promise<Answer> {
  const headers: Record<string, string> = { ...options.headers };
  let body: string | undefined;
  if (options.raw !== undefined) body = options.raw;
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["content-type"] ??= "application/json";
  }
  const response = await app.request(
    `/api/freeduet/engines${path}`,
    { method, headers, body },
    options.peer,
  );
  const text = await response.text();
  everySeen.push(text);
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: the text is what there is.
  }
  return { status: response.status, text, json, headers: response.headers };
}

async function storedDocument() {
  const [row] = await database
    .select({ value: enterpriseSettings.value })
    .from(enterpriseSettings)
    .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY))
    .limit(1);
  return row ? readDocument(row.value) : null;
}

async function clearRow() {
  await database
    .delete(enterpriseSettings)
    .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY));
}

/** How many engine changes and Undos the trail holds for these two people: what a refused request must not add to. */
async function recordedChanges() {
  let total = 0;
  for (const actorUserId of [ADMIN, PERSON]) {
    for (const targetType of [ENGINE_CHANGE_TARGET, ENGINE_UNDO_TARGET]) {
      const { events } = await reader.list({
        eventType: "configuration.changed",
        targetType,
        actorUserId,
        limit: 500,
      });
      total += events.length;
    }
  }
  return total;
}

let choices: EngineChoices;

beforeAll(async () => {
  await clearRow();
});

beforeEach(async () => {
  await clearRow();
  choices = createEngineChoices({ database, audit, reader });
  await choices.load();
});

afterAll(async () => {
  await clearRow();
  await database.$client.close();
});

const AT_THE_COMPUTER = LOOPBACK_PEER;
const ELSEWHERE = {
  server: { requestIP: () => ({ address: "203.0.113.9" }) },
};

/** The page's answer for the two members of the stand-in, before the person has chosen anything. */
const MEMBERS_AS_THE_FILE_HAS_THEM = [
  {
    id: "iris",
    chain: ["claude", "codex"],
    leftOut: [{ id: "gateway", why: "paid_gateway" }],
    mode: "automatic",
    fileMode: "automatic",
    chosen: false,
    pin: null,
  },
  {
    id: "leo",
    chain: ["claude"],
    leftOut: [],
    mode: "ask-first",
    fileMode: "ask-first",
    chosen: false,
    pin: "claude",
  },
];

describe("GET: the members, the choices, and whether the page may change them", () => {
  test("an administrator at the computer gets each member's engines, the file's mode, and that the controls work", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const answer = await send(
      dashboard({}, reachTo(agent), choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.json).toEqual({
      reason: null,
      engines: [
        {
          id: "claude",
          name: "Claude Code",
          kind: "cli",
          state: "ready",
          until: null,
          refusal: null,
        },
        {
          id: "codex",
          name: "Codex",
          kind: "cli",
          state: "signed_out",
          until: null,
          refusal: null,
        },
        {
          id: "gateway",
          name: "A gateway",
          kind: "openai-compatible",
          state: "refused",
          until: null,
          refusal:
            "A gateway is metered, so it is not run. Its key [removed] at [removed] stays unused.",
        },
      ],
      members: MEMBERS_AS_THE_FILE_HAS_THEM,
      choices: { state: "ok" },
      canChange: true,
      cannotChange: null,
    });
    expect(agent.seen).toHaveLength(1);
    expect(agent.seen[0]?.headers.get("x-openbot-agent-token")).toBe(TOKEN);
  });

  test("the person's choice is laid over the file's, and the answer says it is the person's", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    await send(app, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: AT_THE_COMPUTER,
    });
    const answer = await send(app, "GET", "", { peer: AT_THE_COMPUTER });
    const iris = (answer.json.members as Record<string, unknown>[])[0];
    expect(iris).toEqual({
      id: "iris",
      chain: ["claude", "codex"],
      leftOut: [{ id: "gateway", why: "paid_gateway" }],
      mode: "ask-first",
      fileMode: "automatic",
      chosen: true,
      pin: null,
    });
    const leo = (answer.json.members as Record<string, unknown>[])[1];
    expect(leo).toMatchObject({ mode: "ask-first", chosen: false });
  });

  test("a choice the file does not know a member for is kept and not shown, and shows nothing it should not", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    await choices.setMode({
      memberId: "someone-not-in-the-file",
      mode: "automatic",
      actorUserId: ADMIN,
    });
    const answer = await send(app, "GET", "", { peer: AT_THE_COMPUTER });
    expect(
      (answer.json.members as { id: string }[]).map((member) => member.id),
    ).toEqual(["iris", "leo"]);
    expect(answer.text).not.toContain("someone-not-in-the-file");
  });

  test("a remote session sees the same list, and is told it may not change it, and why", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    for (const peer of [undefined, ELSEWHERE]) {
      const answer = await send(app, "GET", "", { peer });
      expect(answer.status).toBe(200);
      expect(answer.json.members).toEqual(MEMBERS_AS_THE_FILE_HAS_THEM);
      expect(answer.json.canChange).toBe(false);
      expect(answer.json.cannotChange).toBe("not_at_the_computer");
    }
  });

  test("a session behind a tunnel or a proxy on this machine is not at the computer either", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    for (const header of [
      "X-Forwarded-For",
      "Forwarded",
      "Via",
      "CF-Connecting-IP",
      "Tailscale-User-Login",
    ]) {
      const answer = await send(app, "GET", "", {
        peer: AT_THE_COMPUTER,
        headers: { [header]: "198.51.100.7" },
      });
      expect(answer.json.canChange).toBe(false);
      expect(answer.json.cannotChange).toBe("not_at_the_computer");
    }
  });

  test("an agent that does not say it honours the choices is too old to be changed through, and the page is told", async () => {
    for (const choicesVersion of [undefined, 0, "1", 1.5, null]) {
      const agent = stubAgent(() => {
        const body = agentBody({ choices_version: choicesVersion });
        if (choicesVersion === undefined) {
          const { choices_version: _gone, ...rest } = body;
          return rest;
        }
        return body;
      });
      stubs.push(agent);
      const answer = await send(
        dashboard({}, reachTo(agent), choices),
        "GET",
        "",
        { peer: AT_THE_COMPUTER },
      );
      expect(answer.json.canChange).toBe(false);
      expect(answer.json.cannotChange).toBe("agent_too_old");
      expect(answer.json.members).toEqual(MEMBERS_AS_THE_FILE_HAS_THEM);
    }
  });

  test("an agent that is newer than this server still counts as honouring what version 1 asks", async () => {
    const agent = stubAgent(() => agentBody({ choices_version: 2 }));
    stubs.push(agent);
    const answer = await send(
      dashboard({}, reachTo(agent), choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(answer.json.canChange).toBe(true);
  });

  test("saved choices that cannot be read are said so, the file's values show, and the page may not change them", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    await database
      .insert(enterpriseSettings)
      .values({
        key: ENGINE_CHOICES_KEY,
        value: sql`${JSON.stringify({ value: { version: 9, members: {} } })}::text::jsonb`,
        updatedBy: "test",
      })
      .onConflictDoUpdate({
        target: enterpriseSettings.key,
        set: {
          value: sql`${JSON.stringify({ value: { version: 9, members: {} } })}::text::jsonb`,
        },
      });
    const answer = await send(
      dashboard({}, reachTo(agent), choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(answer.json.choices).toEqual({ state: "unreadable" });
    expect(answer.json.canChange).toBe(false);
    expect(answer.json.cannotChange).toBe("choices_unreadable");
    expect(answer.json.members).toEqual(MEMBERS_AS_THE_FILE_HAS_THEM);
  });

  test("what is saved is read again for each answer, so a choice made elsewhere shows, and a stale copy mends itself", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const other = createEngineChoices({ database, audit, reader });
    await other.load();
    await other.setMode({
      memberId: "leo",
      mode: "automatic",
      actorUserId: ADMIN,
    });
    expect(choices.current()).toEqual({
      state: "ok",
      members: new Map(),
    });
    const answer = await send(app, "GET", "", { peer: AT_THE_COMPUTER });
    expect((answer.json.members as unknown[])[1]).toMatchObject({
      id: "leo",
      mode: "automatic",
      fileMode: "ask-first",
      chosen: true,
    });
    expect(choices.current().state).toBe("ok");
  });

  test("with no list to show, there is nothing to change: the reason is the old one and the members are empty", async () => {
    const off = await send(
      dashboard(
        {},
        { environment: { FREEDUET_ROUTER: "off" }, managedAgent: undefined },
        choices,
      ),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(off.json).toEqual({
      reason: "off",
      engines: [],
      members: [],
      choices: { state: "ok" },
      canChange: false,
      cannotChange: null,
    });

    const notSetUp = await send(
      dashboard({}, { environment: {}, managedAgent: undefined }, choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(notSetUp.json.reason).toBe("not_set_up");
    expect(notSetUp.json.canChange).toBe(false);

    const closed = stubAgent();
    const closedReach = reachTo(closed);
    closed.stop();
    const unreachable = await send(
      dashboard({}, closedReach, choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(unreachable.json.reason).toBe("unreachable");
    expect(unreachable.json.members).toEqual([]);
    expect(unreachable.json.canChange).toBe(false);
  });

  test("another role gets 403 and the agent is never asked; no sign-in gets 401", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const refused = await send(
      dashboard({ role: "user", id: PERSON }, reachTo(agent), choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(refused.status).toBe(403);
    expect(refused.json).toEqual({ error: "Only an admin can do this." });
    const nobody = await send(
      dashboard({ signedIn: false }, reachTo(agent), choices),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(nobody.status).toBe(401);
    expect(agent.seen).toHaveLength(0);
  });

  test("without a place for the choices the answer is the read-only one of slice 6: no members, nothing to change", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const answer = await send(
      dashboard({}, reachTo(agent), undefined),
      "GET",
      "",
      { peer: AT_THE_COMPUTER },
    );
    expect(Object.keys(answer.json).sort()).toEqual(["engines", "reason"]);
  });
});

describe("PUT a member's mode", () => {
  test("an administrator at the computer changes it: stored, recorded, and answered with what an Undo needs", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const before = await recordedChanges();
    const answer = await send(app, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: AT_THE_COMPUTER,
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.json).toEqual({
      status: "changed",
      changeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      memberId: "iris",
      previous: null,
      mode: "ask-first",
    });
    expect(await storedDocument()).toEqual({ iris: { mode: "ask-first" } });
    expect(await recordedChanges()).toBe(before + 1);
    const { events } = await reader.list({
      eventType: "configuration.changed",
      targetType: ENGINE_CHANGE_TARGET,
      targetId: answer.json.changeId as string,
      actorUserId: ADMIN,
      limit: 5,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.newValue).toBe("ask-first");
    // Changing a choice does not ask the agent anything: the choice is laid on the next run.
    expect(agent.seen).toHaveLength(0);
  });

  test("the mode already chosen is answered as unchanged, and records nothing", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    await send(app, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: AT_THE_COMPUTER,
    });
    const before = await recordedChanges();
    const again = await send(app, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: AT_THE_COMPUTER,
    });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({
      status: "unchanged",
      memberId: "iris",
      mode: "ask-first",
    });
    expect(await recordedChanges()).toBe(before);
  });

  test("another role is refused with 403, and nothing is stored or recorded", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const before = await recordedChanges();
    const answer = await send(
      dashboard({ role: "user", id: PERSON }, reachTo(agent), choices),
      "PUT",
      "/members/iris/mode",
      { body: { mode: "ask-first" }, peer: AT_THE_COMPUTER },
    );
    expect(answer.status).toBe(403);
    expect(answer.json).toEqual({ error: "Only an admin can do this." });
    expect(await storedDocument()).toBeNull();
    expect(await recordedChanges()).toBe(before);
    expect(choices.current()).toEqual({ state: "ok", members: new Map() });
  });

  test("an administrator who is not at the computer is refused with 403, and nothing is stored or recorded", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const before = await recordedChanges();
    const attempts: { peer?: unknown; headers?: Record<string, string> }[] = [
      { peer: undefined },
      { peer: ELSEWHERE },
      { peer: AT_THE_COMPUTER, headers: { "X-Forwarded-For": "198.51.100.7" } },
      { peer: AT_THE_COMPUTER, headers: { Forwarded: "for=198.51.100.7" } },
      {
        peer: AT_THE_COMPUTER,
        headers: { "CF-Connecting-IP": "198.51.100.7" },
      },
      { peer: AT_THE_COMPUTER, headers: { Via: "1.1 proxy" } },
      {
        peer: AT_THE_COMPUTER,
        headers: { "Tailscale-User-Login": "someone@example.test" },
      },
    ];
    for (const attempt of attempts) {
      const answer = await send(app, "PUT", "/members/iris/mode", {
        body: { mode: "ask-first" },
        ...attempt,
      });
      expect(answer.status).toBe(403);
      expect(answer.json).toEqual({
        error:
          "Change this on the computer FreeDuet runs on. Nothing was changed.",
      });
    }
    expect(await storedDocument()).toBeNull();
    expect(await recordedChanges()).toBe(before);
  });

  test("no sign-in is refused with 401 before anything is read", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const answer = await send(
      dashboard({ signedIn: false }, reachTo(agent), choices),
      "PUT",
      "/members/iris/mode",
      { body: { mode: "ask-first" }, peer: AT_THE_COMPUTER },
    );
    expect(answer.status).toBe(401);
    expect(await storedDocument()).toBeNull();
  });

  test("a mode that is not one of the two words, and a body that is not a mode, are refused with 400 and a sentence", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const before = await recordedChanges();
    const bodies: { body?: unknown; raw?: string }[] = [
      { body: { mode: "yolo" } },
      { body: { mode: "" } },
      { body: { mode: "Automatic" } },
      { body: { mode: null } },
      { body: { mode: 1 } },
      { body: { mode: ["automatic"] } },
      { body: {} },
      { body: [] },
      { body: null },
      { body: "automatic" },
      { raw: "not json at all" },
      { raw: "" },
    ];
    for (const attempt of bodies) {
      const answer = await send(app, "PUT", "/members/iris/mode", {
        ...attempt,
        headers: { "content-type": "application/json" },
        peer: AT_THE_COMPUTER,
      });
      expect(answer.status).toBe(400);
      expect(answer.json).toEqual({
        error: "Choose either automatic or ask first.",
      });
    }
    expect(await storedDocument()).toBeNull();
    expect(await recordedChanges()).toBe(before);
  });

  test("a member that is not a member id is refused with 400, however it is spelled in the address", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    for (const member of [
      "Iris",
      "%2e%2e%2fetc",
      "a%20b",
      "iris%0A",
      "-x",
      "x".repeat(65),
      "https%3A%2F%2Fexample.test",
      "iris%3Bdrop",
    ]) {
      const answer = await send(app, "PUT", `/members/${member}/mode`, {
        body: { mode: "ask-first" },
        peer: AT_THE_COMPUTER,
      });
      expect(answer.status).toBe(400);
      expect(answer.json).toEqual({
        error: "That is not a team member this page can change.",
      });
    }
    expect(await storedDocument()).toBeNull();
  });

  test("only the mode is read: a pin, an engine, a key or any other field sent with it is ignored and kept nowhere", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const answer = await send(app, "PUT", "/members/iris/mode", {
      body: {
        mode: "ask-first",
        pin: "claude",
        chain: ["gateway"],
        engine: "gateway",
        enabled: true,
        apiKey: CANARY_KEY,
        api_key: CANARY_KEY,
        baseUrl: CANARY_URL,
      },
      peer: AT_THE_COMPUTER,
    });
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({
      status: "changed",
      changeId: expect.any(String),
      memberId: "iris",
      previous: null,
      mode: "ask-first",
    });
    expect(await storedDocument()).toEqual({ iris: { mode: "ask-first" } });
    const { events } = await reader.list({
      eventType: "configuration.changed",
      targetType: ENGINE_CHANGE_TARGET,
      targetId: answer.json.changeId as string,
      limit: 5,
    });
    expect(JSON.stringify(events)).not.toContain(CANARY_KEY);
    expect(Object.keys(events[0]?.payload ?? {}).sort()).toEqual([
      "change",
      "changeId",
      "memberId",
      "newValue",
      "previousValue",
    ]);
  });

  test("a place that keeps no choices answers 503 with a sentence, after the two guards, and writes nothing", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const readOnly = dashboard({}, reachTo(agent), undefined);
    const answer = await send(readOnly, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: AT_THE_COMPUTER,
    });
    expect(answer.status).toBe(503);
    expect(answer.json).toEqual({
      error:
        "This installation does not keep engine choices, so nothing was changed.",
    });
    const stranger = await send(readOnly, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: undefined,
    });
    expect(stranger.status).toBe(403);
  });
});

describe("POST Undo", () => {
  async function changed(app: Hono, member: string, mode: string) {
    const answer = await send(app, "PUT", `/members/${member}/mode`, {
      body: { mode },
      peer: AT_THE_COMPUTER,
    });
    return answer.json.changeId as string;
  }

  test("puts the old choice back, records it, and a member with no choice before has none again", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const changeId = await changed(app, "iris", "ask-first");
    const before = await recordedChanges();
    const answer = await send(app, "POST", `/changes/${changeId}/undo`, {
      peer: AT_THE_COMPUTER,
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.json).toEqual({
      status: "undone",
      changeId,
      memberId: "iris",
      mode: null,
    });
    expect(await storedDocument()).toEqual({});
    expect(await recordedChanges()).toBe(before + 1);
    const { events } = await reader.list({
      eventType: "configuration.changed",
      targetType: ENGINE_UNDO_TARGET,
      targetId: changeId,
      actorUserId: ADMIN,
      limit: 5,
    });
    expect(events).toHaveLength(1);
  });

  test("a second Undo and an Undo after a later change are refused with 409, and say why", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const first = await changed(app, "iris", "ask-first");
    await send(app, "POST", `/changes/${first}/undo`, {
      peer: AT_THE_COMPUTER,
    });
    const twice = await send(app, "POST", `/changes/${first}/undo`, {
      peer: AT_THE_COMPUTER,
    });
    expect(twice.status).toBe(409);
    expect(String(twice.json.error)).toContain("already been undone");

    const second = await changed(app, "leo", "automatic");
    await changed(app, "leo", "ask-first");
    const stale = await send(app, "POST", `/changes/${second}/undo`, {
      peer: AT_THE_COMPUTER,
    });
    expect(stale.status).toBe(409);
    expect(String(stale.json.error)).toContain("has changed since");
    expect(await storedDocument()).toEqual({ leo: { mode: "ask-first" } });
  });

  test("an id that is no change of ours, however it is spelled, is a 404", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    for (const id of [
      randomUUID(),
      "not-a-uuid",
      "00000000-0000-0000-0000-00000000000",
      `${randomUUID()}x`,
      "%00",
      "..%2F..%2Fetc",
    ]) {
      const answer = await send(app, "POST", `/changes/${id}/undo`, {
        peer: AT_THE_COMPUTER,
      });
      expect(answer.status).toBe(404);
      expect(answer.json).toEqual({
        error: "There is no engine change with that id.",
      });
    }
  });

  test("another role, and an administrator who is not at the computer, are refused with 403 and nothing is undone", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const changeId = await changed(app, "iris", "ask-first");
    const before = await recordedChanges();

    const user = await send(
      dashboard({ role: "user", id: PERSON }, reachTo(agent), choices),
      "POST",
      `/changes/${changeId}/undo`,
      { peer: AT_THE_COMPUTER },
    );
    expect(user.status).toBe(403);
    for (const attempt of [
      { peer: undefined },
      { peer: ELSEWHERE },
      { peer: AT_THE_COMPUTER, headers: { "X-Forwarded-For": "198.51.100.7" } },
    ]) {
      const remote = await send(
        app,
        "POST",
        `/changes/${changeId}/undo`,
        attempt,
      );
      expect(remote.status).toBe(403);
    }
    const anonymous = await send(
      dashboard({ signedIn: false }, reachTo(agent), choices),
      "POST",
      `/changes/${changeId}/undo`,
      { peer: AT_THE_COMPUTER },
    );
    expect(anonymous.status).toBe(401);
    expect(await storedDocument()).toEqual({ iris: { mode: "ask-first" } });
    expect(await recordedChanges()).toBe(before);
  });
});

describe("what the page can and cannot do", () => {
  test("there is no route to store a key, to enable, disable or pin an engine, or to change a chain: every such request is a 404 and nothing is stored", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = dashboard({}, reachTo(agent), choices);
    const before = await recordedChanges();
    const attempts: ["GET" | "PUT" | "POST" | "DELETE" | "PATCH", string][] = [
      ["PUT", "/keys"],
      ["POST", "/keys"],
      ["PUT", "/credentials"],
      ["POST", "/credentials"],
      ["PUT", "/engines/claude"],
      ["POST", "/engines/claude/enable"],
      ["POST", "/engines/claude/disable"],
      ["PUT", "/engines/claude/enabled"],
      ["DELETE", "/engines/claude"],
      ["PUT", "/members/iris/pin"],
      ["PUT", "/members/iris/chain"],
      ["PUT", "/members/iris"],
      ["PATCH", "/members/iris/mode"],
      ["DELETE", "/members/iris/mode"],
      ["POST", "/members/iris/mode"],
      ["PUT", "/changes/00000000-0000-4000-8000-000000000000/undo"],
      ["GET", "/members"],
      ["GET", "/keys"],
    ];
    for (const [method, path] of attempts) {
      const answer = await send(app, method, path, {
        body: { mode: "ask-first", apiKey: CANARY_KEY, enabled: true },
        peer: AT_THE_COMPUTER,
      });
      expect(answer.status).toBe(404);
    }
    expect(await storedDocument()).toBeNull();
    expect(await recordedChanges()).toBe(before);
    const row = await database
      .select()
      .from(enterpriseSettings)
      .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY));
    expect(JSON.stringify(row)).not.toContain(CANARY_KEY);
  });
});

describe("nothing secret is in any response", () => {
  test("a canary key, an address with a password in it, the variable that holds a key, and the token are in no answer, a refusal included", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const reach = reachTo(agent);
    const admin = dashboard({}, reach, choices);
    const person = dashboard({ role: "user", id: PERSON }, reach, choices);
    const seenBefore = everySeen.length;

    const get = await send(admin, "GET", "", { peer: AT_THE_COMPUTER });
    const remote = await send(admin, "GET", "", { peer: ELSEWHERE });
    const changed = await send(admin, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first", apiKey: CANARY_KEY },
      peer: AT_THE_COMPUTER,
    });
    const same = await send(admin, "PUT", "/members/iris/mode", {
      body: { mode: "ask-first" },
      peer: AT_THE_COMPUTER,
    });
    const badMode = await send(admin, "PUT", "/members/iris/mode", {
      body: { mode: CANARY_KEY },
      peer: AT_THE_COMPUTER,
    });
    const badMember = await send(
      admin,
      "PUT",
      `/members/${encodeURIComponent(CANARY_KEY)}/mode`,
      {
        body: { mode: "automatic" },
        peer: AT_THE_COMPUTER,
      },
    );
    const refusedPerson = await send(person, "PUT", "/members/iris/mode", {
      body: { mode: "automatic" },
      peer: AT_THE_COMPUTER,
    });
    const refusedRemote = await send(admin, "PUT", "/members/iris/mode", {
      body: { mode: "automatic" },
      peer: ELSEWHERE,
    });
    const afterChange = await send(admin, "GET", "", { peer: AT_THE_COMPUTER });
    const undone = await send(
      admin,
      "POST",
      `/changes/${changed.json.changeId}/undo`,
      { peer: AT_THE_COMPUTER },
    );
    const again = await send(
      admin,
      "POST",
      `/changes/${changed.json.changeId}/undo`,
      { peer: AT_THE_COMPUTER },
    );
    const unknown = await send(admin, "POST", `/changes/${randomUUID()}/undo`, {
      peer: AT_THE_COMPUTER,
    });
    const keyAsId = await send(
      admin,
      "POST",
      `/changes/${encodeURIComponent(CANARY_KEY)}/undo`,
      {
        peer: AT_THE_COMPUTER,
      },
    );

    const statuses = [
      get,
      remote,
      changed,
      same,
      badMode,
      badMember,
      refusedPerson,
      refusedRemote,
      afterChange,
      undone,
      again,
      unknown,
      keyAsId,
    ].map((answer) => answer.status);
    expect(statuses).toEqual([
      200, 200, 200, 200, 400, 400, 403, 403, 200, 200, 409, 404, 404,
    ]);

    const all = everySeen.slice(seenBefore).join("\n");
    for (const secret of SECRETS) expect(all).not.toContain(secret);
    expect(all).not.toMatch(
      /api[_-]?key|\/home\/someone|Bearer|--api-key|2\.1\.0|probe/i,
    );
    // What was stored and recorded for these changes holds none of it either.
    const rows = await database
      .select()
      .from(enterpriseSettings)
      .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY));
    const trail = await reader.list({
      eventType: "configuration.changed",
      actorUserId: ADMIN,
      limit: 500,
    });
    const kept = JSON.stringify([rows, trail.events]);
    for (const secret of SECRETS) expect(kept).not.toContain(secret);
  });

  test("the member list is built from ids and words alone, however the agent spells a row", () => {
    const row = memberOf({
      id: "iris",
      chain: ["claude", 7, null, { id: "x" }, "", "  codex  "],
      left_out: [
        { id: "gateway", why: "paid_gateway", ...KEPT_WHERE_KEYS_LIVE },
        { id: "other", why: "a word nobody has heard", api_key: CANARY_KEY },
        { id: "third", why: CANARY_KEY },
        "not an object",
        null,
        { why: "locked" },
      ],
      mode: "something else",
      pin: "",
      ...KEPT_WHERE_KEYS_LIVE,
    });
    expect(row).toEqual({
      id: "iris",
      chain: ["claude", "codex"],
      leftOut: [
        { id: "gateway", why: "paid_gateway" },
        { id: "other", why: "other" },
        { id: "third", why: "other" },
      ],
      mode: "automatic",
      pin: null,
    });
    expect(JSON.stringify(row)).not.toContain(CANARY_KEY);
  });

  test("a row that is not a member is no member, and a long list is cut", () => {
    for (const row of [
      null,
      undefined,
      "iris",
      7,
      [],
      {},
      { id: 7 },
      { id: "" },
      { id: "Iris" },
      { id: "../etc" },
      { id: CANARY_KEY.toUpperCase() },
      { id: "x".repeat(65) },
    ])
      expect(memberOf(row)).toBeNull();
    const long = memberOf({
      id: "iris",
      chain: Array.from({ length: 40 }, (_, index) => `engine-${index}`),
      left_out: Array.from({ length: 40 }, (_, index) => ({
        id: `left-${index}`,
        why: "locked",
      })),
    });
    expect(long?.chain).toHaveLength(16);
    expect(long?.leftOut).toHaveLength(16);
  });
});

describe("the whole app", () => {
  const savedRouter = process.env.FREEDUET_ROUTER;
  beforeEach(() => {
    delete process.env.FREEDUET_ROUTER;
  });
  afterEach(() => {
    if (savedRouter === undefined) delete process.env.FREEDUET_ROUTER;
    else process.env.FREEDUET_ROUTER = savedRouter;
  });

  /** `createApp` with the engine choices in the place the server puts them: the `coworker` object, parameter 35. */
  function wholeApp(agent: { url: string }, withChoices: boolean) {
    const config = loadConfig(
      testEnvironment({
        MANAGED_AGENT_AG_UI_URL: agent.url,
        MANAGED_AGENT_TOKEN: TOKEN,
      }),
    );
    const auth: AuthService = {
      handler: () => new Response(null, { status: 204 }),
      api: {
        getSession: async () => ({
          user: {
            id: ADMIN,
            email: "person@openbot.test",
            name: null,
            image: null,
          },
        }),
      },
    };
    const roles: RoleRepository = { rolesForUser: async () => ["admin"] };
    return createApp(
      config,
      auth,
      roles,
      /*
       * Positions 4-34 are the other stores; `coworker` is 35 (the same count as openduet-setup.test.ts). The cast
       * is the one that test makes: the spread hides the position from the type checker.
       */
      ...(Array.from({ length: 31 }) as never[]),
      (withChoices ? { engineChoices: choices } : {}) as never,
    );
  }

  test("createApp mounts the control: an administrator at the computer reads the members and changes a mode through the app", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = wholeApp(agent, true);
    const read = await app.request(
      "/api/freeduet/engines",
      undefined,
      AT_THE_COMPUTER,
    );
    expect(read.status).toBe(200);
    const body = (await read.json()) as Record<string, unknown>;
    expect(body.members).toEqual(MEMBERS_AS_THE_FILE_HAS_THEM);
    expect(body.canChange).toBe(true);

    const change = await app.request(
      "/api/freeduet/engines/members/iris/mode",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "ask-first" }),
      },
      AT_THE_COMPUTER,
    );
    expect(change.status).toBe(200);
    expect(await storedDocument()).toEqual({ iris: { mode: "ask-first" } });
  });

  test("a page on another site cannot change it: the same-origin guard of every change refuses it, and nothing is stored", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = wholeApp(agent, true);
    const crossSite = await app.request(
      "/api/freeduet/engines/members/iris/mode",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ mode: "ask-first" }),
      },
      AT_THE_COMPUTER,
    );
    expect(crossSite.status).toBe(403);
    const disguised = await app.request(
      "/api/freeduet/engines/members/iris/mode",
      {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ mode: "ask-first" }),
      },
      AT_THE_COMPUTER,
    );
    expect(disguised.status).toBe(415);
    expect(await storedDocument()).toBeNull();
  });

  test("a person who is not an administrator is refused through the app, and nothing is stored", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const config = loadConfig(
      testEnvironment({
        MANAGED_AGENT_AG_UI_URL: agent.url,
        MANAGED_AGENT_TOKEN: TOKEN,
      }),
    );
    const auth: AuthService = {
      handler: () => new Response(null, { status: 204 }),
      api: {
        getSession: async () => ({
          user: {
            id: PERSON,
            email: "p@openbot.test",
            name: null,
            image: null,
          },
        }),
      },
    };
    const app = createApp(
      config,
      auth,
      { rolesForUser: async () => ["user"] },
      ...(Array.from({ length: 31 }) as never[]),
      { engineChoices: choices } as never,
    );
    const change = await app.request(
      "/api/freeduet/engines/members/iris/mode",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "ask-first" }),
      },
      AT_THE_COMPUTER,
    );
    expect(change.status).toBe(403);
    expect(await storedDocument()).toBeNull();
    expect(agent.seen).toHaveLength(0);
  });

  test("an app that is not given the choices serves the read-only page of slice 6 and refuses any change", async () => {
    const agent = stubAgent();
    stubs.push(agent);
    const app = wholeApp(agent, false);
    const read = await app.request(
      "/api/freeduet/engines",
      undefined,
      AT_THE_COMPUTER,
    );
    expect(Object.keys((await read.json()) as object).sort()).toEqual([
      "engines",
      "reason",
    ]);
    const change = await app.request(
      "/api/freeduet/engines/members/iris/mode",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "ask-first" }),
      },
      AT_THE_COMPUTER,
    );
    expect(change.status).toBe(503);
    expect(await storedDocument()).toBeNull();
  });
});
