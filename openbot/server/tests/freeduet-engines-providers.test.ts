/**
 * The provider cards of the Engines page (D109): who may change them, what is forwarded to agent-freeduet, and what
 * never leaves: a key is in no answer and no audit row, a refusal says one sentence from a closed list, and a change
 * that cannot be recorded is not made.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  createRequireUser,
  type AuthService,
  type RoleRepository,
} from "../src/auth/guards";
import type { EngineChoices } from "../src/freeduet/engine-choices";
import {
  createEnginesRoutes,
  type EnginesReach,
} from "../src/freeduet/engines-routes";
import { LOOPBACK_PEER } from "./support/loopback-peer";

const TOKEN = "providers-agent-token";
const KEY = "gsk_CANARYkey0123456789abcdef";
const ADDRESS =
  "https://api.cloudflare.com/client/v4/accounts/ACCOUNTCANARY/ai/v1";

const CARD = {
  id: "groq",
  tag: "free",
  enabled: true,
  baseUrl: ADDRESS,
  model: "llama-3.1-8b-instant",
  keySaved: true,
  needsKey: true,
  cloud: true,
  forMembers: false,
  forAssistants: true,
  blocked: null,
  addressFixed: false,
  useFor: { available: ["freeduet", "inbox", "BAD ID", 5], chosen: ["inbox"] },
  secretPath: "/data/keys/groq",
  key: KEY,
};

type Seen = { method: string; path: string; body: string };
const stubs: { stop: () => void }[] = [];
afterEach(() => {
  for (const stub of stubs.splice(0)) stub.stop();
});

function agent(panel: (request: Request, path: string) => Response) {
  const seen: Seen[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const path = new URL(request.url).pathname;
      seen.push({ method: request.method, path, body: await request.text() });
      if (request.headers.get("x-openbot-agent-token") !== TOKEN)
        return Response.json({ error: "unauthorised" }, { status: 401 });
      if (path === "/engines")
        return Response.json({
          engines: [
            { id: "claude", label: "Claude Code", kind: "cli", state: "ready" },
          ],
          members: [],
          choices_version: 1,
        });
      return panel(request, path);
    },
  });
  stubs.push({ stop: () => server.stop(true) });
  const reach: EnginesReach = {
    environment: {},
    managedAgent: {
      endpoint: new URL(`http://127.0.0.1:${server.port}/`),
      token: TOKEN,
    },
  };
  return {
    seen,
    reach,
    panelCalls: () =>
      seen.filter((call) => call.path.startsWith("/engines/panel")),
  };
}

function setup(
  reach: EnginesReach,
  options: { role?: "admin" | "user"; audit?: boolean } = {},
) {
  const events: Record<string, unknown>[] = [];
  const auth: AuthService = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () => ({
        user: {
          id: "person-1",
          email: "p@openbot.test",
          role: options.role ?? "admin",
        },
      }),
    },
  };
  const roles: RoleRepository = { rolesForUser: async () => [] };
  const choices = {
    load: async () => {},
    current: () => ({ state: "ready", members: new Map() }),
  } as unknown as EngineChoices;
  const app = new Hono();
  app.route(
    "/api/freeduet/engines",
    createEnginesRoutes(
      createRequireUser(auth, roles),
      () => reach,
      choices,
      undefined,
      options.audit === false
        ? undefined
        : { record: async (event) => void events.push(event as never) },
    ),
  );
  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(
      `/api/freeduet/engines${path}`,
      {
        method,
        headers: { "content-type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      LOOPBACK_PEER,
    );
  return { call, events };
}

const ok = (body: unknown) => Response.json(body);

describe("the list", () => {
  test("carries the cards reduced to the closed fields, with a key shown only as saved", async () => {
    const stub = agent((_request, path) =>
      path === "/engines/panel"
        ? ok({
            editable: true,
            reason: null,
            providers: [CARD, { ...CARD, id: "made-up" }],
          })
        : ok({}),
    );
    const { call } = setup(stub.reach);
    const answer = await call("GET", "");
    const text = await answer.text();
    const body = JSON.parse(text);
    expect(body.providers.map((card: { id: string }) => card.id)).toEqual([
      "groq",
    ]);
    expect(body.providers[0].keySaved).toBe(true);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("secretPath");
    expect(text).not.toContain("/data/keys");
    expect(body.providersLocked).toBeNull();
    // The member lists are reduced to member ids: nothing else gets through.
    expect(body.providers[0].useFor).toEqual({
      available: ["freeduet", "inbox"],
      chosen: ["inbox"],
    });
  });

  test("says when the person's own engines file is in use", async () => {
    const stub = agent(() =>
      ok({ editable: false, reason: "file_is_yours", providers: [CARD] }),
    );
    const body = await (await setup(stub.reach).call("GET", "")).json();
    expect(body.providersLocked).toBe("file_is_yours");
  });
});

describe("who may change a card", () => {
  const writes: [string, string, unknown][] = [
    ["PUT", "/providers/groq", { enabled: true }],
    ["PUT", "/providers/groq/key", { key: KEY }],
    ["DELETE", "/providers/groq/key", undefined],
    ["POST", "/providers/groq/models", undefined],
    ["POST", "/providers/groq/test", undefined],
    ["POST", "/providers/openrouter/free-models", undefined],
  ];

  test("a non-administrator is refused on every route and nothing reaches the agent", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call, events } = setup(stub.reach, { role: "user" });
    for (const [method, path, body] of writes)
      expect((await call(method, path, body)).status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("a request through a tunnel is refused on every route and nothing reaches the agent", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call, events } = setup(stub.reach);
    for (const [method, path, body] of writes) {
      const answer = await call(method, path, body, {
        "cf-connecting-ip": "203.0.113.9",
      });
      expect(answer.status).toBe(403);
      expect(await answer.text()).not.toContain(KEY);
    }
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("a provider the service does not know is refused before it is forwarded", async () => {
    const stub = agent(() => ok({}));
    const { call } = setup(stub.reach);
    expect(
      (await call("PUT", "/providers/..%2Fadmin/key", { key: KEY })).status,
    ).toBe(404);
    expect(
      (await call("PUT", "/providers/nothing", { enabled: true })).status,
    ).toBe(404);
    expect(stub.panelCalls()).toHaveLength(0);
  });

  test("with nowhere to record the change, nothing is changed", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call } = setup(stub.reach, { audit: false });
    for (const [method, path, body] of writes.slice(0, 3)) {
      const answer = await call(method, path, body);
      expect(answer.status).toBe(503);
      expect(await answer.text()).not.toContain(KEY);
    }
    expect(stub.panelCalls()).toHaveLength(0);
  });
});

describe("a change", () => {
  test("is forwarded, answered with the card, and recorded without key, address or model", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", "/providers/groq", {
      enabled: true,
      baseUrl: ADDRESS,
      model: "llama-3.1-8b-instant",
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect((await answer.text()).includes("secretPath")).toBe(false);
    expect(JSON.parse(stub.panelCalls()[0]?.body ?? "{}")).toEqual({
      enabled: true,
      baseUrl: ADDRESS,
      model: "llama-3.1-8b-instant",
    });
    expect(events).toHaveLength(1);
    const row = JSON.stringify(events[0]);
    expect(events[0]).toMatchObject({
      eventType: "configuration.changed",
      targetType: "engine_provider",
      targetId: "groq",
      actorUserId: "person-1",
    });
    expect(row).not.toContain("ACCOUNTCANARY");
    expect(row).not.toContain("llama-3.1");
    expect(row).toContain("engine_provider_changed");
  });

  test("of members for a cloud engine is forwarded and recorded by member id", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", "/providers/openrouter", {
      members: ["inbox", "chef", "bad id!", 5],
    });
    expect(answer.status).toBe(200);
    expect(JSON.parse(stub.panelCalls()[0]?.body ?? "{}")).toEqual({
      members: ["inbox", "chef", "bad id!", 5],
    });
    expect(events[0]).toMatchObject({
      payload: {
        change: "engine_provider_changed",
        members: ["inbox", "chef"],
      },
    });
  });

  test("that the agent refuses says one sentence from the closed list, and is not recorded", async () => {
    const stub = agent(() =>
      Response.json({ error: "model_not_free" }, { status: 400 }),
    );
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", "/providers/openrouter", {
      enabled: true,
      model: "x/paid",
    });
    expect(answer.status).toBe(400);
    const body = await answer.json();
    expect(body.code).toBe("model_not_free");
    expect(body.error).toContain("free");
    expect(events).toHaveLength(0);
    const odd = agent(() =>
      Response.json({ error: `leaks ${KEY}` }, { status: 400 }),
    );
    const text = await (
      await setup(odd.reach).call("PUT", "/providers/groq", {})
    ).text();
    expect(text).not.toContain(KEY);
  });

  test("an agent that does not answer is said as one fact, with nothing recorded", async () => {
    const { call, events } = setup({
      environment: {},
      managedAgent: undefined,
    });
    const answer = await call("PUT", "/providers/groq", { enabled: false });
    expect(answer.status).toBe(502);
    expect(events).toHaveLength(0);
  });
});

describe("a list of members longer than 64", () => {
  const SIXTY_FIVE = Array.from({ length: 65 }, (_, index) => `m${index}`);

  test("is recorded in the audit row at most 64 members, the first 64", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", "/providers/openrouter", {
      members: SIXTY_FIVE,
    });
    expect(answer.status).toBe(200);
    expect(events[0]).toBeDefined();
    const recorded = (events[0]!.payload as { members: string[] }).members;
    expect(recorded).toHaveLength(64);
    expect(recorded).toEqual(SIXTY_FIVE.slice(0, 64));
  });

  test("is forwarded at most 64 members", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call } = setup(stub.reach);
    await call("PUT", "/providers/openrouter", { members: SIXTY_FIVE });
    const sent = JSON.parse(stub.panelCalls()[0]?.body ?? "{}") as {
      members: string[];
    };
    expect(sent.members.length).toBeLessThanOrEqual(64);
  });
});

describe("a key", () => {
  test("goes to the agent, comes back as saved only, and is in no audit row", async () => {
    const stub = agent(() => ok({ keySaved: true, key: KEY }));
    const { call, events } = setup(stub.reach);
    const saved = await call("PUT", "/providers/groq/key", { key: KEY });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(JSON.parse(text)).toEqual({ keySaved: true });
    expect(text).not.toContain(KEY);
    expect(JSON.parse(stub.panelCalls()[0]?.body ?? "{}")).toEqual({
      key: KEY,
    });
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(JSON.stringify(events[0])).toContain("engine_key_saved");

    const removed = await call("DELETE", "/providers/groq/key");
    expect(await removed.json()).toEqual({ keySaved: false });
    expect(JSON.stringify(events[1])).toContain("engine_key_removed");
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  test("that is far too long is not read, and a refusal never repeats it", async () => {
    const stub = agent(() =>
      Response.json({ error: "key_shape" }, { status: 400 }),
    );
    const { call } = setup(stub.reach);
    const answer = await call("PUT", "/providers/groq/key", {
      key: "k".repeat(5_000),
    });
    expect(answer.status).toBe(400);
    expect(JSON.parse(stub.panelCalls()[0]?.body ?? "{}")).toEqual({
      key: null,
    });
    expect(await answer.text()).not.toContain("kkkkkkkkkk");
  });
});

describe("Test and Load list", () => {
  test("answer a closed shape: nothing the agent adds gets through", async () => {
    const stub = agent((_request, path) =>
      path.endsWith("/test")
        ? ok({
            ok: true,
            code: "rate_limited",
            status: 429,
            key: KEY,
            body: "raw",
          })
        : ok({ ok: true, code: "ok", models: ["a", "b", 5], key: KEY }),
    );
    const { call, events } = setup(stub.reach);
    const test_ = await (await call("POST", "/providers/groq/test")).text();
    expect(JSON.parse(test_)).toEqual({ ok: false, code: "rate_limited" });
    const odd = agent(() =>
      ok({ ok: true, code: "HTTP 418 teapot", status: 418 }),
    );
    expect(
      await (
        await setup(odd.reach).call("POST", "/providers/groq/test")
      ).json(),
    ).toEqual({
      ok: false,
      code: "unreachable",
    });
    const list = await (await call("POST", "/providers/groq/models")).text();
    expect(JSON.parse(list)).toEqual({
      ok: true,
      code: "ok",
      models: ["a", "b"],
    });
    expect(test_ + list).not.toContain(KEY);
    expect(events).toHaveLength(0);
  });
});

describe("the free models that support tools (D116)", () => {
  test("the list is read through the agent, reduced to free ids and one word for where it came from", async () => {
    const stub = agent((_request, path) =>
      path.endsWith("/free-models")
        ? ok({
            models: [
              "openrouter/free",
              "a/b:free",
              "vendor/paid-model",
              "x/y:free,vendor/paid",
              "bad id:free",
              5,
              `${"a".repeat(130)}/m:free`,
            ],
            source: "live",
            key: KEY,
          })
        : ok({}),
    );
    const { call, events } = setup(stub.reach);
    const text = await (
      await call("POST", "/providers/openrouter/free-models")
    ).text();
    expect(JSON.parse(text)).toEqual({
      models: ["openrouter/free", "a/b:free"],
      source: "live",
    });
    expect(text).not.toContain(KEY);
    expect(stub.panelCalls().map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /engines/panel/openrouter/free-models",
    ]);
    expect(events).toHaveLength(0);
  });

  test("an odd answer is the router alone, and an unknown word for the source is the fallback", async () => {
    const stub = agent(() => ok({ models: "nope", source: "from somewhere" }));
    const { call } = setup(stub.reach);
    expect(
      await (await call("POST", "/providers/openrouter/free-models")).json(),
    ).toEqual({ models: ["openrouter/free"], source: "fallback" });
  });

  test("a model reaches the agent only as a short string", async () => {
    const stub = agent(() => ok({ provider: CARD }));
    const { call } = setup(stub.reach);
    await call("PUT", "/providers/openrouter", { model: { id: "a/b:free" } });
    await call("PUT", "/providers/openrouter", { model: "a".repeat(121) });
    await call("PUT", "/providers/openrouter", { model: "a/b:free" });
    const bodies = stub
      .panelCalls()
      .filter((c) => c.method === "PUT")
      .map((c) => JSON.parse(c.body));
    expect(bodies).toEqual([{}, {}, { model: "a/b:free" }]);
  });
});

describe("the FreeLLMAPI card (D113)", () => {
  const TOKEN_KEY = "freellmapi-CANARYtoken0123456789";
  const ROUTER_ADDRESS = "http://localhost:3999/v1";
  const ROUTER = {
    ...CARD,
    id: "freellmapi",
    tag: "router",
    baseUrl: ROUTER_ADDRESS,
    model: "auto",
    forMembers: true,
    useFor: { available: ["freeduet", "chef"], chosen: [] },
  };

  test("is listed with its router tag, and the token is never in the list", async () => {
    const stub = agent(() =>
      ok({ editable: true, reason: null, providers: [ROUTER] }),
    );
    const text = await (await setup(stub.reach).call("GET", "")).text();
    const card = JSON.parse(text).providers[0];
    expect(card).toMatchObject({
      id: "freellmapi",
      tag: "router",
      cloud: true,
      useFor: { available: ["freeduet", "chef"], chosen: [] },
    });
    expect(text).not.toContain(TOKEN_KEY);
    expect(text).not.toContain("secretPath");
  });

  test("a change is forwarded, recorded without its address or model, and under the same authority as every card", async () => {
    const stub = agent(() => ok({ provider: ROUTER }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", "/providers/freellmapi", {
      enabled: true,
      baseUrl: ROUTER_ADDRESS,
      model: "auto",
    });
    expect(answer.status).toBe(200);
    expect(JSON.parse(stub.panelCalls()[0]?.body ?? "{}")).toEqual({
      enabled: true,
      baseUrl: ROUTER_ADDRESS,
      model: "auto",
    });
    const row = JSON.stringify(events[0]);
    expect(events[0]).toMatchObject({ targetId: "freellmapi" });
    expect(row).not.toContain("localhost");
    expect(row).not.toContain("auto");
    for (const [options, status] of [
      [{ role: "user" as const }, 403],
      [{ audit: false }, 503],
    ] as const) {
      const other = agent(() => ok({ provider: ROUTER }));
      const refused = await setup(other.reach, options).call(
        "PUT",
        "/providers/freellmapi",
        { enabled: true },
      );
      expect(refused.status).toBe(status);
      expect(other.panelCalls()).toHaveLength(0);
    }
  });

  test("a tunnel is refused, and a refused address says one sentence from the closed list", async () => {
    const stub = agent(() => ok({ provider: ROUTER }));
    const tunnelled = await setup(stub.reach).call(
      "PUT",
      "/providers/freellmapi/key",
      { key: TOKEN_KEY },
      { "cf-connecting-ip": "203.0.113.9" },
    );
    expect(tunnelled.status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
    const refusing = agent(() =>
      Response.json({ error: "address_host" }, { status: 400 }),
    );
    const { call, events } = setup(refusing.reach);
    const answer = await call("PUT", "/providers/freellmapi", {
      baseUrl: "http://localhost:3001/v1",
    });
    const body = await answer.json();
    expect(answer.status).toBe(400);
    expect(body.code).toBe("address_host");
    expect(JSON.stringify(body)).not.toContain("3001");
    expect(events).toHaveLength(0);
  });

  test("its token goes to the agent and comes back as saved only, in no audit row", async () => {
    const stub = agent(() => ok({ keySaved: true, key: TOKEN_KEY }));
    const { call, events } = setup(stub.reach);
    const saved = await call("PUT", "/providers/freellmapi/key", {
      key: TOKEN_KEY,
    });
    const text = await saved.text();
    expect(JSON.parse(text)).toEqual({ keySaved: true });
    expect(text).not.toContain(TOKEN_KEY);
    expect(JSON.stringify(events)).not.toContain(TOKEN_KEY);
  });
});
