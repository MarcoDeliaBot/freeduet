/**
 * GET /api/freeduet/engines/usage (D102, the token counter): administrators only, read through agent-freeduet's
 * `GET /engines/usage` with the deployment token, reduced to numbers and ids. The token never goes back to the browser, and
 * an agent that is off, not set up or not answering is an honest empty answer.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  type AuthService,
  createRequireUser,
  type RoleRepository,
} from "../src/auth/guards";
import {
  createEnginesRoutes,
  type EnginesReach,
  readUsage,
} from "../src/freeduet/engines-routes";

const TOKEN = "stub-agent-token-7f3a";
const COUNTS = {
  turns: 3,
  reported_turns: 2,
  input_tokens: 1200,
  output_tokens: 300,
  cache_read_tokens: 40,
  cache_write_tokens: 5,
  seconds: 1105,
};
const AGENT_ANSWER = {
  timezone: "UTC",
  today: "2026-11-21",
  window_days: 7,
  rows: [
    {
      member: "creator",
      engine: "claude-code",
      class: "login",
      today: COUNTS,
      week: { ...COUNTS, turns: 9, seconds: 7300 },
      text: "a message the person wrote",
    },
    {
      member: "chef",
      engine: "local",
      class: "local",
      today: COUNTS,
      week: COUNTS,
    },
    {
      member: "chef",
      engine: "odd",
      class: "<script>",
      today: { ...COUNTS, seconds: "12", reported_turns: 0 },
      week: { ...COUNTS, seconds: -3 },
    },
    { member: "../etc/passwd", engine: "x", today: COUNTS, week: COUNTS },
  ],
  engines: [
    { engine: "claude-code", class: "login", today: COUNTS, week: COUNTS },
  ],
  daily: [
    {
      day: "2026-11-20",
      sources: {
        person: COUNTS,
        routine: { ...COUNTS, input_tokens: -5 },
        "<b>": COUNTS,
        unknown: COUNTS,
      },
      members: { creator: COUNTS, "../x": COUNTS },
      text: "a message the person wrote",
    },
    { day: "not-a-day", sources: {}, members: {} },
    { day: "2026-11-21", sources: "x", members: null },
    "nonsense",
  ],
  problem: false,
};

const stubs: { stop: () => void }[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

function stubAgent(reply: (request: Request) => Response) {
  const seen: Request[] = [];
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      seen.push(request);
      paths.push(new URL(request.url).pathname);
      return reply(request);
    },
  });
  const stub = {
    url: `http://127.0.0.1:${server.port}/`,
    seen,
    paths,
    stop: () => server.stop(true),
  };
  stubs.push(stub);
  return stub;
}

function answer(request: Request): Response {
  if (request.headers.get("x-openbot-agent-token") !== TOKEN)
    return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(AGENT_ANSWER);
}

function reachTo(
  url: string,
  environment: Record<string, string | undefined> = {},
): EnginesReach {
  return {
    environment,
    managedAgent: { endpoint: new URL(url), token: TOKEN },
  };
}

function appWith(
  session: { role?: "admin" | "user"; signedIn: boolean },
  reach: EnginesReach,
) {
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () =>
        session.signedIn
          ? {
              user: {
                id: "person-1",
                email: "person@openbot.test",
                role: session.role,
              },
            }
          : null,
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const app = new Hono();
  app.route(
    "/api/freeduet/engines",
    createEnginesRoutes(createRequireUser(auth, roles), () => reach),
  );
  return app;
}

describe("GET /api/freeduet/engines/usage: the same authority as the Engines page", () => {
  test("no sign-in is refused and the agent is not asked", async () => {
    const agent = stubAgent(answer);
    const response = await appWith(
      { signedIn: false },
      reachTo(agent.url),
    ).request("/api/freeduet/engines/usage");
    expect(response.status).toBe(401);
    expect(agent.seen.length).toBe(0);
  });

  test("another role gets 403 and the agent is not asked", async () => {
    const agent = stubAgent(answer);
    const response = await appWith(
      { signedIn: true, role: "user" },
      reachTo(agent.url),
    ).request("/api/freeduet/engines/usage");
    expect(response.status).toBe(403);
    expect(agent.seen.length).toBe(0);
  });

  test("an administrator gets numbers by member and engine, not cached, never the token or a text", async () => {
    const agent = stubAgent(answer);
    const response = await appWith(
      { signedIn: true, role: "admin" },
      reachTo(agent.url),
    ).request("/api/freeduet/engines/usage");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("a message the person wrote");
    const body = JSON.parse(text);
    expect(body.reason).toBeNull();
    expect(body.timezone).toBe("UTC");
    // The row with a member id that is not an id is dropped.
    expect(body.rows.map((row: { member: string }) => row.member)).toEqual([
      "creator",
      "chef",
      "chef",
    ]);
    // D126: a class that is not one of the five is "other"; a time that is not a whole count is 0.
    expect(body.rows[2].class).toBe("other");
    expect(body.rows[2].today.seconds).toBe(0);
    expect(body.rows[2].week.seconds).toBe(0);
    expect(body.rows[1].class).toBe("local");
    expect(body.rows[0]).toEqual({
      member: "creator",
      engine: "claude-code",
      class: "login",
      today: {
        turns: 3,
        reportedTurns: 2,
        inputTokens: 1200,
        outputTokens: 300,
        cacheReadTokens: 40,
        cacheWriteTokens: 5,
        seconds: 1105,
      },
      week: {
        turns: 9,
        reportedTurns: 2,
        inputTokens: 1200,
        outputTokens: 300,
        cacheReadTokens: 40,
        cacheWriteTokens: 5,
        seconds: 7300,
      },
    });
    expect(body.engines[0].engine).toBe("claude-code");
    // D134: the daily series keeps real days, the five source words, member ids and whole counts, and nothing else.
    expect(body.daily.map((d: { day: string }) => d.day)).toEqual([
      "2026-11-20",
      "2026-11-21",
    ]);
    expect(Object.keys(body.daily[0].sources)).toEqual([
      "person",
      "routine",
      "unknown",
    ]);
    expect(body.daily[0].sources.person.inputTokens).toBe(1200);
    expect(body.daily[0].sources.routine.inputTokens).toBe(0);
    expect(Object.keys(body.daily[0].members)).toEqual(["creator"]);
    expect(body.daily[1]).toEqual({ day: "2026-11-21", sources: {}, members: {} });
    expect(text).not.toContain("<b>");
    expect(agent.seen.length).toBe(1);
    expect(agent.paths).toEqual(["/engines/usage"]);
  });
});

describe("readUsage", () => {
  test("the router off, no agent and an agent that does not answer are one reason each, with no numbers", async () => {
    const agent = stubAgent(answer);
    const off = await readUsage(reachTo(agent.url, { FREEDUET_ROUTER: "off" }));
    expect(off).toMatchObject({ reason: "off", rows: [] });
    expect(agent.seen.length).toBe(0);
    const notSetUp = await readUsage({
      environment: {},
      managedAgent: undefined,
    });
    expect(notSetUp).toMatchObject({ reason: "not_set_up", rows: [] });
    const broken = stubAgent(() => new Response("nope", { status: 500 }));
    expect(await readUsage(reachTo(broken.url))).toMatchObject({
      reason: "unreachable",
      rows: [],
    });
    const notJson = stubAgent(() => new Response("<html>"));
    expect(await readUsage(reachTo(notJson.url))).toMatchObject({
      reason: "unreachable",
    });
  });

  test("a number that is not a whole count is read as zero, never passed on", async () => {
    const odd = stubAgent(() =>
      Response.json({
        rows: [
          {
            member: "chef",
            engine: "e",
            today: { turns: -1, input_tokens: "9", output_tokens: 1.5 },
            week: null,
          },
        ],
        engines: [],
        problem: true,
      }),
    );
    const usage = await readUsage(reachTo(odd.url));
    expect(usage.problem).toBe(true);
    expect(usage.rows[0].today).toEqual({
      turns: 0,
      reportedTurns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      seconds: 0,
    });
    expect(usage.rows[0].class).toBe("other");
  });

  test("an agent that sends no daily series (an older one) still reads, with an empty one", async () => {
    const older = stubAgent(() => Response.json({ rows: [], engines: [] }));
    expect(await readUsage(reachTo(older.url))).toMatchObject({
      reason: null,
      daily: [],
    });
  });
});
