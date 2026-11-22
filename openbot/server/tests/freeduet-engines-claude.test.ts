/**
 * D139: one member's optional Claude model and effort. Who may change it (the same guard as every change on the Engines
 * page), that only a word of the two closed lists (or null, the subscription's default) is ever forwarded to agent-freeduet,
 * that what is written is read back from the agent's answer, and that a change that cannot be recorded is not made.
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

const TOKEN = "claude-agent-token";

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
const DONE = { member: "chef", model: "sonnet", effort: "high", changed: true };
const URL_CLAUDE = "/members/chef/claude";

describe("who may change a member's Claude model", () => {
  test("a non-administrator is refused and nothing reaches the agent", async () => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach, { role: "user" });
    expect((await call("PUT", URL_CLAUDE, { model: "opus" })).status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("a request through a tunnel is refused and nothing reaches the agent", async () => {
    const stub = agent(() => ok(DONE));
    const { call } = setup(stub.reach);
    const answer = await call(
      "PUT",
      URL_CLAUDE,
      { model: "opus" },
      { "cf-connecting-ip": "203.0.113.9" },
    );
    expect(answer.status).toBe(403);
    expect(stub.panelCalls()).toHaveLength(0);
  });

  test("an installation that cannot record the change does not make it", async () => {
    const stub = agent(() => ok(DONE));
    const { call } = setup(stub.reach, { audit: false });
    expect((await call("PUT", URL_CLAUDE, { model: "opus" })).status).toBe(503);
    expect(stub.panelCalls()).toHaveLength(0);
  });
});

describe("what is forwarded", () => {
  test("only the two words go to the agent, the answer is read back and the change is recorded", async () => {
    const stub = agent(() => ok({ ...DONE, secretPath: "/data/keys/x" }));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", URL_CLAUDE, {
      model: "sonnet",
      effort: "high",
      extra: "ignored",
    });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      memberId: "chef",
      model: "sonnet",
      effort: "high",
      changed: true,
    });
    const [sent] = stub.panelCalls();
    expect(sent?.path).toBe("/engines/panel/members/chef/claude");
    expect(JSON.parse(sent?.body ?? "")).toEqual({
      model: "sonnet",
      effort: "high",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "configuration.changed",
      targetType: "engine_member_claude",
      targetId: "chef",
      actorUserId: "person-1",
      payload: {
        change: "engine_claude_choice_changed",
        newValue: { model: "sonnet", effort: "high" },
      },
    });
  });

  test("an empty body is the subscription's default: both words go as null", async () => {
    const stub = agent(() =>
      ok({ member: "chef", model: null, effort: null, changed: true }),
    );
    const { call } = setup(stub.reach);
    expect((await call("PUT", URL_CLAUDE, {})).status).toBe(200);
    expect(JSON.parse(stub.panelCalls()[0]?.body ?? "")).toEqual({
      model: null,
      effort: null,
    });
  });

  test("a choice that was already in use writes no audit row", async () => {
    const stub = agent(() => ok({ ...DONE, changed: false }));
    const { call, events } = setup(stub.reach);
    expect(
      (await (await call("PUT", URL_CLAUDE, { model: "sonnet" })).json())
        .changed,
    ).toBe(false);
    expect(events).toHaveLength(0);
  });

  test("a word the agent answers that is off the lists is not passed on", async () => {
    const stub = agent(() => ok({ ...DONE, model: "--evil", effort: "x" }));
    const { call } = setup(stub.reach);
    const body = await (
      await call("PUT", URL_CLAUDE, { model: "opus" })
    ).json();
    expect([body.model, body.effort]).toEqual([null, null]);
  });
});

describe("what is refused before it is forwarded", () => {
  test.each([
    { model: "claude-opus-4-1" },
    { model: "Opus" },
    { model: "--dangerously-skip-permissions" },
    { model: "opus --effort max" },
    { model: 5 },
    { model: ["opus"] },
    { effort: "extreme" },
    { effort: "" },
    { effort: { a: 1 } },
    { model: "default" },
  ])("%j is refused and nothing reaches the agent", async (body) => {
    const stub = agent(() => ok(DONE));
    const { call, events } = setup(stub.reach);
    const answer = await call("PUT", URL_CLAUDE, body);
    expect(answer.status).toBe(400);
    expect((await answer.json()).code).toBe("claude_choice_invalid");
    expect(stub.panelCalls()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("a member id that is not one is refused", async () => {
    const stub = agent(() => ok(DONE));
    const { call } = setup(stub.reach);
    expect(
      (await call("PUT", "/members/a%20b/claude", { model: "opus" })).status,
    ).toBe(404);
    expect(stub.panelCalls()).toHaveLength(0);
  });

  test.each([
    ["claude_choice_invalid", 400],
    ["unknown_member", 404],
    ["file_is_yours", 409],
  ])(
    "the agent's refusal %s is said in one sentence and nothing is recorded",
    async (code, status) => {
      const stub = agent(() => Response.json({ error: code }, { status }));
      const { call, events } = setup(stub.reach);
      const answer = await call("PUT", URL_CLAUDE, { model: "opus" });
      expect(answer.status).toBe(status);
      expect((await answer.json()).code).toBe(code);
      expect(events).toHaveLength(0);
    },
  );

  test("an agent that does not answer is said so", async () => {
    const { call, events } = setup({
      environment: {},
      managedAgent: undefined,
    });
    expect((await call("PUT", URL_CLAUDE, { model: "opus" })).status).toBe(502);
    expect(events).toHaveLength(0);
  });
});
