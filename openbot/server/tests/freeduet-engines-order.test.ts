/**
 * D112: the order of a member's engines, changed by hand. Who may (the same guard as every change on the Engines page),
 * what is forwarded to agent-freeduet (the member and the order, nothing else), what is refused before it is forwarded,
 * and that a change that cannot be recorded is not made.
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

const TOKEN = "order-agent-token";

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
const ORDER = ["claude-code", "ollama-member", "openrouter-member"];
const DONE = { member: "chef", chain: ORDER, changed: true };
const URL_ORDER = "/members/chef/order";

describe("who may change an order", () => {
  test("a non-administrator is refused and nothing reaches the agent", async () => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach, { role: "user" });
    expect((await call("PUT", URL_ORDER, { order: ORDER })).status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("a request through a tunnel is refused and nothing reaches the agent", async () => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach);
    const answer = await call(
      "PUT",
      URL_ORDER,
      { order: ORDER },
      { "cf-connecting-ip": "203.0.113.9" },
    );
    expect(answer.status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("an installation that cannot record the change does not make it", async () => {
    const stub = agent(() => ok(DONE));
    const { call } = setup(stub.reach, { audit: false });
    const answer = await call("PUT", URL_ORDER, { order: ORDER });
    expect(answer.status).toBe(503);
    expect(stub.panelCalls()).toHaveLength(0);
  });
});

describe("what is forwarded", () => {
  test("only the member and the order go to the agent, and the change is recorded", async () => {
    const stub = agent(() => ok({ ...DONE, secretPath: "/data/keys/x" }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", URL_ORDER, {
      order: ORDER,
      extra: "ignored",
    });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      memberId: "chef",
      chain: ORDER,
      changed: true,
      ownOrder: false,
    });
    const [sent] = stub.panelCalls();
    expect(sent?.method).toBe("PUT");
    expect(sent?.path).toBe("/engines/panel/members/chef/order");
    expect(JSON.parse(sent?.body ?? "")).toEqual({ order: ORDER });
    expect(sent?.body).not.toContain("extra");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "configuration.changed",
      targetType: "engine_member_order",
      targetId: "chef",
      actorUserId: "person-1",
      payload: { change: "engine_order_changed", newValue: ORDER },
    });
  });

  test("an order that was already in use writes no audit row", async () => {
    const stub = agent(() => ok({ ...DONE, changed: false }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", URL_ORDER, { order: ORDER });
    expect((await answer.json()).changed).toBe(false);
    expect(events).toHaveLength(0);
  });
});

describe("D115: an order outside the logins-first group needs the person's confirmation", () => {
  const FREE_FIRST = ["openrouter-member", "claude-code", "ollama-member"];

  test("confirmed is forwarded only as the boolean true, and nothing else is added", async () => {
    const stub = agent(() => ok({ ...DONE, chain: FREE_FIRST }));
    const { call } = setup(stub.reach);
    await call("PUT", URL_ORDER, { order: FREE_FIRST, confirmed: true });
    await call("PUT", URL_ORDER, { order: FREE_FIRST, confirmed: false });
    await call("PUT", URL_ORDER, { order: FREE_FIRST });
    const bodies = stub.panelCalls().map((sent) => JSON.parse(sent.body));
    expect(bodies).toEqual([
      { order: FREE_FIRST, confirmed: true },
      { order: FREE_FIRST },
      { order: FREE_FIRST },
    ]);
  });

  test.each(["true", 1, "yes", [[true]], { a: 1 }, null])(
    "a confirmed that is %p is refused before it is forwarded",
    async (confirmed) => {
      const stub = agent(() => ok(DONE));
      const { call, events } = setup(stub.reach);
      const answer = await call("PUT", URL_ORDER, {
        order: FREE_FIRST,
        confirmed,
      });
      expect(answer.status).toBe(400);
      expect((await answer.json()).code).toBe("order_shape");
      expect(stub.panelCalls()).toHaveLength(0);
      expect(events).toHaveLength(0);
    },
  );

  test.each(["free_before_login", "paid_before_free_or_login"])(
    "an order that needs confirming comes back as 409 with the kind %s and records nothing",
    async (kind) => {
      const stub = agent(() =>
        Response.json(
          { error: "order_needs_confirmation", kind },
          { status: 409 },
        ),
      );
      const { call, events } = setup(stub.reach);
      const answer = await call("PUT", URL_ORDER, { order: FREE_FIRST });
      expect(answer.status).toBe(409);
      const body = await answer.json();
      expect(body.code).toBe("order_needs_confirmation");
      expect(body.kind).toBe(kind);
      expect(events).toHaveLength(0);
    },
  );

  test("a kind outside the closed pair is not passed on", async () => {
    const stub = agent(() =>
      Response.json(
        { error: "order_needs_confirmation", kind: "<script>" },
        { status: 409 },
      ),
    );
    const { call } = setup(stub.reach);
    const body = await (
      await call("PUT", URL_ORDER, { order: FREE_FIRST })
    ).json();
    expect(body.kind).toBeUndefined();
  });

  test("the audit row says the person confirmed and which kind, as the agent reports it", async () => {
    const stub = agent(() =>
      ok({
        ...DONE,
        chain: FREE_FIRST,
        ownOrder: true,
        confirmedKind: "free_before_login",
      }),
    );
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", URL_ORDER, {
      order: FREE_FIRST,
      confirmed: true,
    });
    expect((await answer.json()).ownOrder).toBe(true);
    expect(events[0]).toMatchObject({
      eventType: "configuration.changed",
      actorUserId: "person-1",
      payload: {
        change: "engine_order_changed",
        newValue: FREE_FIRST,
        ownOrder: true,
        confirmed: true,
        confirmedKind: "free_before_login",
      },
    });
  });

  test("a confirmed:true on an order that needed none is not recorded as a confirmation", async () => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach);
    await call("PUT", URL_ORDER, { order: ORDER, confirmed: true });
    expect(events[0]?.payload).toMatchObject({
      confirmed: false,
      ownOrder: false,
    });
    expect(Object.keys(events[0]?.payload ?? {})).not.toContain(
      "confirmedKind",
    );
  });

  test("the same guard: a non-administrator who sends confirmed:true reaches nothing", async () => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach, { role: "user" });
    const answer = await call("PUT", URL_ORDER, {
      order: FREE_FIRST,
      confirmed: true,
    });
    expect(answer.status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

describe("what is refused", () => {
  test("a bad member or a badly shaped order is refused before it is forwarded", async () => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach);
    expect(
      (await call("PUT", "/members/..%2Fadmin/order", { order: ORDER })).status,
    ).toBe(404);
    expect(
      (await call("PUT", "/members/Chef/order", { order: ORDER })).status,
    ).toBe(404);
    for (const order of [
      undefined,
      "claude-code",
      [5],
      ["a b"],
      [{}],
      Array(40).fill("x"),
    ]) {
      const answer = await call("PUT", URL_ORDER, { order });
      expect(answer.status).toBe(400);
      expect((await answer.json()).code).toBe("order_shape");
    }
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test.each([
    ["order_not_permutation", 400],
    ["order_needs_confirmation", 409],
    ["unknown_member", 404],
    ["file_is_yours", 409],
  ])(
    "the agent's refusal %s is said in one sentence and nothing is recorded",
    async (code, status) => {
      const stub = agent(() => Response.json({ error: code }, { status }));
      const { call, events } = setup(stub.reach);
      const answer = await call("PUT", URL_ORDER, { order: ORDER });
      expect(answer.status).toBe(status);
      const body = await answer.json();
      expect(body.code).toBe(code);
      expect(body.error).toContain(".");
      expect(events).toHaveLength(0);
    },
  );

  test("an agent that does not answer is said so", async () => {
    const { call, events } = setup({
      environment: {},
      managedAgent: undefined,
    });
    const answer = await call("PUT", URL_ORDER, { order: ORDER });
    expect(answer.status).toBe(502);
    expect(events).toHaveLength(0);
  });
});
