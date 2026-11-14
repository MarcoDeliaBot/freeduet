/**
 * GET /api/freeduet/engines (docs/ENGINES_PLAN.md slice 6): the server asks agent-freeduet for its engines, and
 * the administrator gets only what a person needs. The token goes to agent-freeduet and never back; another role
 * is refused; an agent that is off, not set up or not answering is an honest empty state, never an error page.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createApp } from "../src/app";
import {
  createRequireUser,
  type AuthService,
  type RoleRepository,
} from "../src/auth/guards";
import { loadConfig } from "../src/config";
import {
  cleanRefusal,
  createEnginesRoutes,
  type EnginesReach,
  readEngines,
  stateOf,
  summaryOf,
} from "../src/freeduet/engines-routes";
import { testEnvironment } from "./support/environment";

const TOKEN = "stub-agent-token-7f3a";
const ENGINE_ROWS = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "cli",
    state: "open",
    available: false,
    limited_until: "2026-11-14T16:00:00.123456+00:00",
    last_failure_kind: "usage_limit",
    consecutive_failures: 1,
    installed: true,
    version: "2.1.0 (secret build line)",
    signed_in: true,
    probed_at: "2026-11-14T09:00:00+00:00",
    probe_problem: "a probe problem that a person does not need",
  },
];

/** A stand-in for agent-freeduet: records each request and answers with the given reply. */
function stubAgent(reply: (request: Request) => Response) {
  const seen: Request[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      seen.push(request);
      return reply(request);
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/`,
    seen,
    stop: () => server.stop(true),
  };
}

/** The agent's own answer, checked the way agent-freeduet checks it. */
function listing(
  request: Request,
  rows: readonly unknown[] = ENGINE_ROWS,
): Response {
  if (request.headers.get("x-openbot-agent-token") !== TOKEN) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  return Response.json({ engines: rows, problems: ["file missing"] });
}

/** One request the server made to agent-freeduet, as the test's stand-in recorded it. */
type Captured = { url: string; init: RequestInit };

const stubs: { stop: () => void }[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

function agentReach(url: string, fetcher?: typeof fetch): EnginesReach {
  return {
    environment: {},
    managedAgent: { endpoint: new URL(url), token: TOKEN },
    fetch: fetcher,
  };
}

describe("the breaker's states, named for a person", () => {
  test("each agent state maps to the one state the page can say", () => {
    expect(stateOf("ready", null)).toBe("ready");
    expect(stateOf("degraded", "transient")).toBe("degraded");
    expect(stateOf("half_open", "usage_limit")).toBe("checking");
    expect(stateOf("signed_out", "auth")).toBe("signed_out");
    expect(stateOf("open", "usage_limit")).toBe("limited");
    expect(stateOf("open", "rate_limit")).toBe("limited");
    expect(stateOf("open", "credits")).toBe("out_of_credit");
    expect(stateOf("open", "transient")).toBe("not_answering");
    expect(stateOf("open", null)).toBe("not_answering");
    expect(stateOf("something new", null)).toBe("unknown");
  });

  test("the agent's refused row is named refused, and is not a breaker state", () => {
    expect(stateOf("refused", null)).toBe("refused");
  });

  test("only a waiting state keeps its time, and an unreadable time is no time", () => {
    const limited = summaryOf({
      id: "a",
      label: "A",
      state: "open",
      last_failure_kind: "usage_limit",
      limited_until: "2026-11-14T16:00:00Z",
    });
    expect(limited).toEqual({
      id: "a",
      name: "A",
      kind: "other",
      state: "limited",
      until: "2026-11-14T16:00:00.000Z",
      refusal: null,
    });
    const ready = summaryOf({
      id: "b",
      label: "B",
      state: "ready",
      limited_until: "2026-11-14T16:00:00Z",
    });
    expect(ready).toEqual({
      id: "b",
      name: "B",
      kind: "other",
      state: "ready",
      until: null,
      refusal: null,
    });
    const garbled = summaryOf({
      id: "c",
      state: "open",
      last_failure_kind: "transient",
      limited_until: "soon",
    });
    expect(garbled).toEqual({
      id: "c",
      name: "c",
      kind: "other",
      state: "not_answering",
      until: null,
      refusal: null,
    });
  });

  test("a row without an id is not an engine", () => {
    expect(summaryOf({ label: "no id", state: "ready" })).toBeNull();
    expect(summaryOf("text")).toBeNull();
    expect(summaryOf(null)).toBeNull();
  });
});

/** The rest of the sentence agent-freeduet writes for a paid gateway it will not run (engines.py, PAID_GATEWAY_NOT_RUN). */
const PAID_REST =
  "FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. Free gateways and your own logins work.";
/** The whole sentence for an engine called `my-gateway`, as agent-freeduet writes it (engines.py, paid_gateway_refusal). */
const GATEWAY_SENTENCE = `my-gateway is a paid gateway. ${PAID_REST}`;

/** A refused row, as agent-freeduet lists it (engine_state.py): the breaker's fields, with `refusal` set. */
function refusedRow(id: string, refusal: string) {
  return {
    id,
    label: id,
    kind: "anthropic-compatible",
    state: "refused",
    available: false,
    limited_until: null,
    last_failure_kind: null,
    consecutive_failures: 0,
    installed: null,
    version: null,
    signed_in: null,
    probed_at: null,
    probe_problem: null,
    refusal,
  };
}

describe("an engine's kind: one of agent-freeduet's names, else other", () => {
  test("a known kind is passed by its name", () => {
    expect(
      summaryOf({
        id: "claude",
        label: "Claude Code",
        state: "ready",
        kind: "cli",
      }),
    ).toEqual({
      id: "claude",
      name: "Claude Code",
      kind: "cli",
      state: "ready",
      until: null,
      refusal: null,
    });
    expect(
      summaryOf({ id: "gw", state: "ready", kind: "anthropic-compatible" }),
    ).toEqual({
      id: "gw",
      name: "gw",
      kind: "anthropic-compatible",
      state: "ready",
      until: null,
      refusal: null,
    });
  });

  test("a gateway whose key was refused is signed out, and is still named a gateway", () => {
    expect(
      summaryOf({
        id: "gw",
        state: "signed_out",
        kind: "anthropic-compatible",
        last_failure_kind: "auth",
      }),
    ).toEqual({
      id: "gw",
      name: "gw",
      kind: "anthropic-compatible",
      state: "signed_out",
      until: null,
      refusal: null,
    });
  });

  test("any other kind, a kind spelt differently, a kind that is not text, and no kind are other", () => {
    for (const kind of ["shell", "CLI", "cli ", 7, null, "__proto__"]) {
      expect(summaryOf({ id: "x", state: "ready", kind })).toEqual({
        id: "x",
        name: "x",
        kind: "other",
        state: "ready",
        until: null,
        refusal: null,
      });
    }
    expect(summaryOf({ id: "x", state: "ready" })).toEqual({
      id: "x",
      name: "x",
      kind: "other",
      state: "ready",
      until: null,
      refusal: null,
    });
  });
});

describe("a refused engine's sentence, as the person may see it", () => {
  test("a clean sentence is passed as it is, with its state and no time", () => {
    expect(summaryOf(refusedRow("my-gateway", GATEWAY_SENTENCE))).toEqual({
      id: "my-gateway",
      name: "my-gateway",
      kind: "anthropic-compatible",
      state: "refused",
      until: null,
      refusal: GATEWAY_SENTENCE,
    });
  });

  test("only a refused row carries its sentence", () => {
    expect(
      summaryOf({
        id: "gw",
        state: "ready",
        kind: "anthropic-compatible",
        refusal: GATEWAY_SENTENCE,
      }),
    ).toEqual({
      id: "gw",
      name: "gw",
      kind: "anthropic-compatible",
      state: "ready",
      until: null,
      refusal: null,
    });
    expect(
      summaryOf({ id: "gw", state: "refused", kind: "anthropic-compatible" }),
    ).toEqual({
      id: "gw",
      name: "gw",
      kind: "anthropic-compatible",
      state: "refused",
      until: null,
      refusal: null,
    });
  });

  test("an address, a host name with a port, an e-mail-like text, a key and a long token are replaced by [removed]", () => {
    const names = [
      "https://user:hunter2@203.0.113.7:3001/v1",
      "gw.example.com:8080/v1",
      "203.0.113.7:3001",
      "localhost:3001",
      "[2001:db8::1]:443",
      "ops@example.com",
      "sk-or-v1-0123456789abcdef0123456789abcdef",
      "abcdefghijklmnopqrstuvwxyzABCDEFGH",
    ];
    for (const name of names) {
      expect(cleanRefusal(`${name} is a paid gateway. ${PAID_REST}`)).toBe(
        `[removed] is a paid gateway. ${PAID_REST}`,
      );
    }
  });

  test("an ordinary name is kept whole: hyphens are fine, and a long name without a digit is no token", () => {
    const name = "my-openrouter-gateway-eu";
    expect(cleanRefusal(`${name} is a paid gateway. ${PAID_REST}`)).toBe(
      `${name} is a paid gateway. ${PAID_REST}`,
    );
  });

  test("line breaks and control characters become spaces, so the sentence stays on one line", () => {
    expect(
      cleanRefusal(`my-gateway is\na paid gateway.\u0007\t${PAID_REST}`),
    ).toBe(GATEWAY_SENTENCE);
  });

  test("a sentence longer than 300 characters is cut to 300 or fewer", () => {
    const cleaned = cleanRefusal("word ".repeat(500)) ?? "";
    expect(cleaned.length).toBeLessThanOrEqual(300);
    expect(cleaned.length).toBeGreaterThan(290);
  });

  test("nothing to say, or only spaces and control characters, is no sentence", () => {
    expect(cleanRefusal("")).toBeNull();
    expect(cleanRefusal("  \n\t \u0001 ")).toBeNull();
    expect(summaryOf(refusedRow("gw", "   "))).toEqual({
      id: "gw",
      name: "gw",
      kind: "anthropic-compatible",
      state: "refused",
      until: null,
      refusal: null,
    });
  });
});

describe("readEngines: what the person is told, and never an error", () => {
  test("the router switched off: nothing is asked of the agent", async () => {
    let asked = 0;
    const reading = await readEngines({
      environment: { FREEDUET_ROUTER: "off" },
      managedAgent: { endpoint: new URL("http://127.0.0.1:9/"), token: TOKEN },
      fetch: (async () => {
        asked += 1;
        return Response.json({ engines: [] });
      }) as unknown as typeof fetch,
    });
    expect(reading).toEqual({ reason: "off", engines: [] });
    expect(asked).toBe(0);
  });

  test("no agent set up, or no token: nothing is asked", async () => {
    const noEndpoint = await readEngines({
      environment: {},
      managedAgent: undefined,
    });
    expect(noEndpoint).toEqual({ reason: "not_set_up", engines: [] });
    const noToken = await readEngines({
      environment: {},
      managedAgent: { endpoint: new URL("http://127.0.0.1:9/"), token: "" },
    });
    expect(noToken).toEqual({ reason: "not_set_up", engines: [] });
  });

  test("an agent that refuses, is down, or answers with something else: unreachable", async () => {
    const refused = await readEngines(
      agentReach("http://127.0.0.1:9/", (async () => {
        throw new Error("connect ECONNREFUSED");
      }) as unknown as typeof fetch),
    );
    expect(refused).toEqual({ reason: "unreachable", engines: [] });

    const stopped = stubAgent(() => new Response("busy", { status: 503 }));
    stubs.push(stopped);
    expect(await readEngines(agentReach(stopped.url))).toEqual({
      reason: "unreachable",
      engines: [],
    });

    const notJson = stubAgent(
      () => new Response("<html>not json</html>", { status: 200 }),
    );
    stubs.push(notJson);
    expect(await readEngines(agentReach(notJson.url))).toEqual({
      reason: "unreachable",
      engines: [],
    });

    const noList = stubAgent(() => Response.json({ problems: [] }));
    stubs.push(noList);
    expect(await readEngines(agentReach(noList.url))).toEqual({
      reason: "unreachable",
      engines: [],
    });
  });

  test("the token goes to the agent's own address, with no redirect followed and a time limit", async () => {
    const calls: Captured[] = [];
    const reading = await readEngines({
      environment: {},
      managedAgent: {
        endpoint: new URL("http://127.0.0.1:4230/ag-ui"),
        token: TOKEN,
      },
      fetch: (async (url: URL, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json({ engines: ENGINE_ROWS });
      }) as unknown as typeof fetch,
    });
    expect(reading.reason).toBeNull();
    expect(calls.length).toBe(1);
    const first = calls[0] as Captured;
    expect(first.url).toBe("http://127.0.0.1:4230/engines");
    expect(first.init.redirect).toBe("error");
    expect(first.init.signal).toBeInstanceOf(AbortSignal);
    expect(
      (first.init.headers as Record<string, string>)["x-openbot-agent-token"],
    ).toBe(TOKEN);
  });

  test("a person receives the name, the state and the time, and nothing else from the agent", async () => {
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const reading = await readEngines(agentReach(agent.url));
    expect(reading).toEqual({
      reason: null,
      engines: [
        {
          id: "claude",
          name: "Claude Code",
          kind: "cli",
          state: "limited",
          until: "2026-11-14T16:00:00.123Z",
          refusal: null,
        },
      ],
    });
    const sent = JSON.stringify(reading);
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toContain("secret build line");
    expect(sent).not.toContain("probe problem");
    expect(sent).not.toContain("file missing");
    expect(Object.keys(reading.engines[0] ?? {}).sort()).toEqual([
      "id",
      "kind",
      "name",
      "refusal",
      "state",
      "until",
    ]);
  });

  test("a refused engine reaches the person as its state and its cleaned sentence, with no address or key", async () => {
    const hostile = refusedRow(
      "gw",
      `https://user:hunter2@203.0.113.7:3001/v1 is a paid gateway. ${PAID_REST}`,
    );
    const agent = stubAgent((request) => listing(request, [hostile]));
    stubs.push(agent);
    const reading = await readEngines(agentReach(agent.url));
    expect(reading).toEqual({
      reason: null,
      engines: [
        {
          id: "gw",
          name: "gw",
          kind: "anthropic-compatible",
          state: "refused",
          until: null,
          refusal: `[removed] is a paid gateway. ${PAID_REST}`,
        },
      ],
    });
    const sent = JSON.stringify(reading);
    expect(sent).not.toContain("hunter2");
    expect(sent).not.toContain("203.0.113.7");
  });
});

/** The sub-app as the app mounts it, behind the production sign-in and role lookup. */
function enginesWith(
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

describe("GET /api/freeduet/engines: administrators only", () => {
  test("no sign-in is refused before anything is read", async () => {
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const response = await enginesWith(
      { signedIn: false },
      agentReach(agent.url),
    ).request("/api/freeduet/engines");
    expect(response.status).toBe(401);
    expect(agent.seen.length).toBe(0);
  });

  test("another role gets 403 and the agent is never asked", async () => {
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const response = await enginesWith(
      { signedIn: true, role: "user" },
      agentReach(agent.url),
    ).request("/api/freeduet/engines");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only an admin can do this.",
    });
    expect(agent.seen.length).toBe(0);
  });

  test("an administrator gets the list, not to be cached, and never the token", async () => {
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const response = await enginesWith(
      { signedIn: true, role: "admin" },
      agentReach(agent.url),
    ).request("/api/freeduet/engines");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain(TOKEN);
    expect(JSON.parse(body)).toEqual({
      reason: null,
      engines: [
        {
          id: "claude",
          name: "Claude Code",
          kind: "cli",
          state: "limited",
          until: "2026-11-14T16:00:00.123Z",
          refusal: null,
        },
      ],
    });
    expect(agent.seen.length).toBe(1);
  });
});

/** The whole app, as the server starts it: the route mounted in `createApp` beside the other administrator routes. */
function appWith(
  role: "admin" | "user",
  environment: Record<string, string | undefined>,
) {
  const config = loadConfig(testEnvironment(environment));
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () => ({
        user: {
          id: "person-1",
          email: "person@openbot.test",
          name: null,
          image: null,
        },
      }),
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [role] };
  // Every store after these is optional in createApp; the Engines route needs none of them.
  return createApp(config, auth, roles);
}

describe("createApp mounts the route behind the same guard", () => {
  const savedRouter = process.env.FREEDUET_ROUTER;
  afterEach(() => {
    if (savedRouter === undefined) delete process.env.FREEDUET_ROUTER;
    else process.env.FREEDUET_ROUTER = savedRouter;
  });

  test("an administrator reads the agent's list through the app", async () => {
    delete process.env.FREEDUET_ROUTER;
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const app = appWith("admin", {
      MANAGED_AGENT_AG_UI_URL: agent.url,
      MANAGED_AGENT_TOKEN: TOKEN,
    });
    const response = await app.request("/api/freeduet/engines");
    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual({
      reason: null,
      engines: [
        {
          id: "claude",
          name: "Claude Code",
          kind: "cli",
          state: "limited",
          until: "2026-11-14T16:00:00.123Z",
          refusal: null,
        },
      ],
    });
    expect(agent.seen.length).toBe(1);
    const sent = agent.seen[0] as Request;
    expect(sent.headers.get("x-openbot-agent-token")).toBe(TOKEN);
  });

  test("another role is refused through the app, and the agent is not asked", async () => {
    delete process.env.FREEDUET_ROUTER;
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const app = appWith("user", {
      MANAGED_AGENT_AG_UI_URL: agent.url,
      MANAGED_AGENT_TOKEN: TOKEN,
    });
    const response = await app.request("/api/freeduet/engines");
    expect(response.status).toBe(403);
    expect(agent.seen.length).toBe(0);
  });

  test("the router switched off is an honest empty state through the app", async () => {
    process.env.FREEDUET_ROUTER = "off";
    const agent = stubAgent((request) => listing(request));
    stubs.push(agent);
    const app = appWith("admin", {
      MANAGED_AGENT_AG_UI_URL: agent.url,
      MANAGED_AGENT_TOKEN: TOKEN,
    });
    const response = await app.request("/api/freeduet/engines");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reason: "off", engines: [] });
    expect(agent.seen.length).toBe(0);
  });

  test("an agent that is down is an honest empty state, not a 500", async () => {
    delete process.env.FREEDUET_ROUTER;
    const closed = stubAgent(() => new Response(null, { status: 204 }));
    const url = closed.url;
    closed.stop();
    const app = appWith("admin", {
      MANAGED_AGENT_AG_UI_URL: url,
      MANAGED_AGENT_TOKEN: TOKEN,
    });
    const response = await app.request("/api/freeduet/engines");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reason: "unreachable",
      engines: [],
    });
  });
});
