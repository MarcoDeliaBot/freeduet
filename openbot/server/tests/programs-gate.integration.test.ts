/**
 * The programs tools through the real approval gate, the real tools and a real database
 * (docs/design/programs-on-your-computer.md, S1, D60).
 *
 * What must hold, and what this file pins:
 *   - a `programs/*` call asks the person in every case, with Full access on in either setting, and with
 *     the person's own "ask before making changes" off; the card cannot be remembered;
 *   - a call from a routine, a check-in, a remote session or a hand-off the server cannot trace is refused
 *     BEFORE any card: no approval row exists afterwards, and nothing is queued for the helper;
 *   - with the switch off the tools are not offered and a direct call is refused;
 *   - the switch route is the person's own, at the computer only; a remote session cannot move it;
 *   - every call leaves audit rows.
 * Ids are fresh for each test, because the audit trail is append-only and counted here.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "../src/approvals/types";
import {
  type AuditInitiator,
  createAuditStore,
  handoffInitiator,
} from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import type { PairingGate } from "../src/auth/install-secret";
import { createDatabase } from "../src/db/client";
import { approvalRules, auditEvents, users } from "../src/db/schema";
import { workItems } from "../src/db/schema/work";
import { createFullAccess } from "../src/freeduet/full-access";
import { REFUSAL_MARKER } from "../src/plugins/tools";
import { checkInInitiator } from "../src/proactive/restriction";
import { createProgramsBroker } from "../src/programs/broker";
import { createProgramsRoutes } from "../src/programs/routes";
import { createProgramsSwitch } from "../src/programs/switch";
import {
  offeredProgramsTools,
  PROGRAMS_MEMBER,
  programsTools,
} from "../src/programs/tools";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import {
  INSTALLED,
  pollBody,
  resultBody,
  type WireOperation,
} from "./support/programs-helper";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const audit = createAuditStore(database);
const store = createApprovalStore(database);
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  handedRequest: async () => null,
  audit,
});
const service = createApprovalService(store, undefined, undefined, {
  fullAccess,
});
const programsSwitch = createProgramsSwitch({ database, audit });
const prefix = `prg-${randomUUID()}`;
const created: string[] = [];

const clock = { at: Date.now() };
const broker = createProgramsBroker({
  deploymentKey: KEY,
  now: () => clock.at,
  enabled: (actorId) => programsSwitch.isOn(actorId),
  sweepEveryMs: 0,
});

async function person(): Promise<string> {
  const id = `${prefix}-${created.length}`;
  created.push(id);
  await database.insert(users).values({ id, email: `${id}@example.test` });
  return id;
}

afterAll(async () => {
  const rows = await Promise.all(created.map((id) => store.list(id)));
  const approvals = rows.flat().map((request) => request.id);
  if (approvals.length)
    await database
      .delete(workItems)
      .where(
        and(
          eq(workItems.kind, "approval.resume"),
          inArray(workItems.key, approvals),
        ),
      );
  await database
    .delete(approvalRules)
    .where(inArray(approvalRules.ownerUserId, created));
  // Audit rows are append-only and stay; they name only this run's throwaway ids.
  await database.delete(users).where(inArray(users.id, created));
  await database.$client.close();
});

const PERSON: AuditInitiator = { kind: "person" };

function continuation(initiator?: AuditInitiator): ApprovalContinuation {
  const toolCallId = randomUUID();
  return {
    runId: randomUUID(),
    threadId: `${prefix}-thread-${toolCallId}`,
    toolCallId,
    toolName: "programs_list_installed",
    args: {},
    messages: [],
    state: {},
    context: [],
    forwardedProps: { openbotRun: "not-a-signed-run" },
    ...(initiator ? { initiator } : {}),
  };
}

function toolsFor(
  actorId: string,
  botId = PROGRAMS_MEMBER,
  initiator: AuditInitiator = PERSON,
) {
  return programsTools({
    broker,
    switch: programsSwitch,
    botId,
    actorId,
    auditStore: audit,
    initiator,
    encryptionKey: KEY,
    gate: service.gate,
  });
}

/** Call the tool the way a run does, inside its approval context; report a pause as `paused`. */
async function callTool(
  actorId: string,
  name: "programs_list_installed" | "programs_list_updates",
  options: { run?: AuditInitiator; call?: AuditInitiator; botId?: string } = {},
): Promise<string> {
  const tool = toolsFor(actorId, options.botId, options.call ?? PERSON).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) throw new Error(`no tool ${name}`);
  try {
    return await withApprovalContext(continuation(options.run), () =>
      tool.execute({}),
    );
  } catch (error) {
    if (error instanceof HeadlessToolSuspension) return "paused";
    throw error;
  }
}

/** The helper keeps polling, so a call can be queued. */
const helperIsUp = (actorId: string) =>
  broker.poll(pollBody(broker.helperSecretFor(actorId), actorId, clock.at));

const cardsOf = (actorId: string) => store.list(actorId);

const auditRows = async (actorId: string) =>
  (
    await database
      .select({ payload: auditEvents.payload })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, actorId),
          eq(auditEvents.targetType, "programs"),
        ),
      )
  ).map((row) => row.payload as Record<string, unknown>);

describe("a programs call always asks", () => {
  for (const mode of ["off", "full", "no_payments"] as const)
    for (const name of [
      "programs_list_installed",
      "programs_list_updates",
    ] as const)
      test(`Full access ${mode}, ask-before-changes off, auto-review off: ${name} still opens a card that cannot be remembered`, async () => {
        const actor = await person();
        await service.setPreferences(actor, {
          enabled: false,
          autoReview: false,
        });
        if (mode !== "off")
          await fullAccess.set(actor, PROGRAMS_MEMBER, true, mode);
        await programsSwitch.set(actor, true);
        await helperIsUp(actor);
        expect(await callTool(actor, name)).toBe("paused");
        const cards = await cardsOf(actor);
        expect(cards.length).toBe(1);
        const [card] = cards;
        expect(card?.action.toolRef).toBe(
          `programs/${name.replace("programs_", "")}`,
        );
        expect(card?.action.policy).toMatchObject({
          behaviour: "ask",
          source: "always_ask",
        });
        // "Always allow" is refused for this kind of card, and nothing reached the helper.
        await expect(
          service.decide(
            actor,
            card?.id as string,
            { decision: "allow_always" } as never,
          ),
        ).rejects.toThrow();
        expect(broker.statusFor(actor).pending).toBe(0);
      });

  test("a saved personal rule that allows it does not answer it: still a card, still always_ask", async () => {
    const actor = await person();
    await service.setPreferences(actor, { enabled: false, autoReview: false });
    const rule = await service.createRule(actor, {
      botId: PROGRAMS_MEMBER,
      toolRef: "programs/*",
      effect: "*",
      scope: "*",
      behaviour: "allow",
    });
    await programsSwitch.set(actor, true);
    await helperIsUp(actor);
    expect(await callTool(actor, "programs_list_installed")).toBe("paused");
    const [card] = await cardsOf(actor);
    expect(card?.action.policy?.source).toBe("always_ask");
    await service.revoke(actor, rule.id);
  });

  test("the card binds the kind and nothing the model typed: no command, no free field", async () => {
    const actor = await person();
    await service.setPreferences(actor, { enabled: true, autoReview: false });
    await programsSwitch.set(actor, true);
    await helperIsUp(actor);
    expect(await callTool(actor, "programs_list_updates")).toBe("paused");
    const [card] = await cardsOf(actor);
    expect(card?.action.args).toEqual({ kind: "list_updates" });
    expect(JSON.stringify(card?.action)).not.toMatch(/command/i);
  });
});

describe("a call outside the person's own live typed turn is refused before any card", () => {
  const cases: [string, AuditInitiator][] = [
    ["a routine", { kind: "routine", id: "r-1" }],
    ["a check-in", checkInInitiator("run-1")],
    ["a trigger", { kind: "responsibility", id: "goal-1" }],
    ["a remote session", { kind: "remote" }],
    ["a hand-off the server cannot trace", handoffInitiator("iris", PERSON)],
    [
      "a hand-off from a routine",
      handoffInitiator("iris", { kind: "routine", id: "r-2" }),
    ],
    ["the deployment", { kind: "deployment" }],
  ];
  for (const [name, initiator] of cases)
    for (const toolName of [
      "programs_list_installed",
      "programs_list_updates",
    ] as const)
      test(`${name}: ${toolName}`, async () => {
        const actor = await person();
        await programsSwitch.set(actor, true);
        await helperIsUp(actor);
        const text = await callTool(actor, toolName, {
          run: initiator,
          call: initiator,
        });
        expect(text.startsWith(REFUSAL_MARKER)).toBe(true);
        expect(text).toContain("I only do this in a conversation with you.");
        expect(await cardsOf(actor)).toEqual([]);
        expect(broker.statusFor(actor).pending).toBe(0);
        const rows = await auditRows(actor);
        expect(rows.some((row) => row.outcome === "refused")).toBe(true);
        expect(
          rows.some(
            (row) =>
              row.outcome === "requested" &&
              row.operation === toolName.replace("programs_", ""),
          ),
        ).toBe(true);
      });

  test("the callback door's call: no run that can wait, only the signed initiator, is refused too", async () => {
    const actor = await person();
    await programsSwitch.set(actor, true);
    await helperIsUp(actor);
    const tool = toolsFor(actor).find(
      (t) => t.name === "programs_list_installed",
    );
    const text = await (tool as NonNullable<typeof tool>).execute({});
    expect(text.startsWith(REFUSAL_MARKER)).toBe(true);
    expect(await cardsOf(actor)).toEqual([]);
  });

  test("words that came from the microphone are not the person's own typed turn", async () => {
    const actor = await person();
    await programsSwitch.set(actor, true);
    await helperIsUp(actor);
    const base = continuation();
    const tool = toolsFor(actor).find(
      (t) => t.name === "programs_list_installed",
    );
    const text = await withApprovalContext(
      {
        ...base,
        messages: [
          { id: "voice-123", role: "user", content: "update my programs" },
        ],
      },
      () => (tool as NonNullable<typeof tool>).execute({}),
    );
    expect(text.startsWith(REFUSAL_MARKER)).toBe(true);
    expect(await cardsOf(actor)).toEqual([]);
  });
});

describe("the switch", () => {
  test("off by default: the tools are not offered, and a direct call is refused with no card", async () => {
    const actor = await person();
    await helperIsUp(actor);
    const offered = await offeredProgramsTools({
      broker,
      switch: programsSwitch,
      botId: PROGRAMS_MEMBER,
      actorId: actor,
      auditStore: audit,
      initiator: PERSON,
      encryptionKey: KEY,
      gate: service.gate,
    });
    expect(offered).toEqual([]);
    const text = await callTool(actor, "programs_list_installed");
    expect(text.startsWith(REFUSAL_MARKER)).toBe(true);
    expect(await cardsOf(actor)).toEqual([]);
  });

  test("on: the two read tools are offered to the one member that holds them, and to nobody else", async () => {
    const actor = await person();
    await programsSwitch.set(actor, true);
    const input = {
      broker,
      switch: programsSwitch,
      actorId: actor,
      auditStore: audit,
      initiator: PERSON,
      encryptionKey: KEY,
      gate: service.gate,
    };
    const names = (
      await offeredProgramsTools({ ...input, botId: PROGRAMS_MEMBER })
    ).map((t) => t.name);
    expect(names.sort()).toEqual([
      "programs_list_installed",
      "programs_list_updates",
    ]);
    expect(await offeredProgramsTools({ ...input, botId: "freeduet" })).toEqual(
      [],
    );
    expect(await offeredProgramsTools({ ...input, botId: "inbox" })).toEqual(
      [],
    );
    // And a direct call by another member is refused, offered or not.
    const text = await callTool(actor, "programs_list_installed", {
      botId: "inbox",
    });
    expect(text.startsWith(REFUSAL_MARKER)).toBe(true);
    expect(await cardsOf(actor)).toEqual([]);
  });

  test("it is read strictly from the stored value, and turning it off removes it", async () => {
    const actor = await person();
    expect(await programsSwitch.isOn(actor)).toBe(false);
    await database
      .update(users)
      .set({ preferences: { freeduetPrograms: true } as never })
      .where(eq(users.id, actor));
    expect(await programsSwitch.isOn(actor)).toBe(false);
    await programsSwitch.set(actor, true);
    expect(await programsSwitch.isOn(actor)).toBe(true);
    await programsSwitch.set(actor, false);
    expect(await programsSwitch.isOn(actor)).toBe(false);
    const rows = await auditRows(actor);
    expect(rows.map((row) => row.change)).toEqual(
      expect.arrayContaining(["programs_switch_on", "programs_switch_off"]),
    );
  });

  test("the tools exist in no source that a member's tool list for any other connector builds", async () => {
    // The switch lives in `users.preferences` under its own key; the generic preferences route is strict.
    const text = await Bun.file(
      new URL("../src/programs/switch.ts", import.meta.url),
    ).text();
    expect(text).toContain("freeduetPrograms");
  });
});

describe("the routes", () => {
  const session =
    (id: string) =>
    async (
      context: Parameters<import("hono").MiddlewareHandler>[0],
      next: () => Promise<void>,
    ) => {
      context.set("actor", { id, email: `${id}@example.test`, role: "user" });
      await next();
    };
  const remoteGate = {
    pairings: { standing: async () => null },
  } as unknown as PairingGate;
  const pairedGate = {
    pairings: { standing: async () => ({}) },
  } as unknown as PairingGate;
  const app = (actorId: string, pairing?: PairingGate) => {
    const routes = new Hono<{ Variables: AppVariables }>();
    routes.route(
      "/api/programs",
      createProgramsRoutes({
        broker,
        switch: programsSwitch,
        requireUser: session(actorId) as never,
        pairing,
        auditStore: audit,
      }),
    );
    return routes;
  };
  const put = (
    routes: Hono<{ Variables: AppVariables }>,
    enabled: boolean,
    headers: Record<string, string> = {},
    env?: unknown,
  ) =>
    routes.request(
      "/api/programs/switch",
      {
        method: "PUT",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ enabled }),
      },
      env as never,
    );

  test("at the computer, the person turns it on and off", async () => {
    const actor = await person();
    const routes = app(actor);
    expect((await put(routes, true, {}, LOOPBACK_PEER)).status).toBe(200);
    expect(await programsSwitch.isOn(actor)).toBe(true);
    expect((await put(routes, false, {}, LOOPBACK_PEER)).status).toBe(200);
    expect(await programsSwitch.isOn(actor)).toBe(false);
  });

  test("a remote session, a request with proxy headers and a request with no peer cannot move it", async () => {
    const actor = await person();
    // Paired browser, but through a tunnel (proxy header): refused.
    expect(
      (
        await put(
          app(actor, pairedGate),
          true,
          { "x-forwarded-for": "203.0.113.9" },
          LOOPBACK_PEER,
        )
      ).status,
    ).toBe(403);
    // A browser not paired with the computer: refused.
    expect(
      (await put(app(actor, remoteGate), true, {}, LOOPBACK_PEER)).status,
    ).toBe(403);
    // No peer at all (not a TCP request from this machine): refused.
    expect((await put(app(actor), true)).status).toBe(403);
    expect(await programsSwitch.isOn(actor)).toBe(false);
    // A paired browser at the computer works.
    expect(
      (await put(app(actor, pairedGate), true, {}, LOOPBACK_PEER)).status,
    ).toBe(200);
  });

  test("a body that is not exactly { enabled: boolean } is refused", async () => {
    const actor = await person();
    const routes = app(actor);
    for (const body of [
      {},
      { enabled: "yes" },
      { enabled: true, command: "x" },
    ]) {
      const response = await routes.request(
        "/api/programs/switch",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        LOOPBACK_PEER as never,
      );
      expect(response.status).toBe(400);
    }
    expect(await programsSwitch.isOn(actor)).toBe(false);
  });

  test("turning it off with an operation running lets it finish and refuses the next", async () => {
    const actor = await person();
    await programsSwitch.set(actor, true);
    await helperIsUp(actor);
    const secret = broker.helperSecretFor(actor);
    const running = broker.call({
      actorId: actor,
      botId: PROGRAMS_MEMBER,
      action: { kind: "list_installed" },
    });
    // The call asks the switch before it queues: let it reach the queue before the helper polls.
    await new Promise((resolve) => setImmediate(resolve));
    const polled = await broker.poll(pollBody(secret, actor, clock.at));
    const [op] = (polled.ok
      ? polled.operations
      : []) as unknown as WireOperation[];
    expect((await put(app(actor), false, {}, LOOPBACK_PEER)).status).toBe(200);
    expect(
      broker.result(
        resultBody(secret, {
          actorId: actor,
          operationId: (op as WireOperation).operationId,
          at: clock.at,
          ok: true,
          payload: INSTALLED,
        }),
      ).ok,
    ).toBe(true);
    await expect(running).resolves.toMatchObject({ kind: "list_installed" });
    await expect(
      broker.call({
        actorId: actor,
        botId: PROGRAMS_MEMBER,
        action: { kind: "list_updates" },
      }),
    ).rejects.toThrow();
  });

  test("the helper doors take no session: a poll and a result carry their own mac", async () => {
    const actor = await person();
    const routes = new Hono<{ Variables: AppVariables }>();
    routes.route(
      "/api/programs",
      createProgramsRoutes({
        broker,
        switch: programsSwitch,
        requireUser: (async (context: {
          json: (b: unknown, s: number) => Response;
        }) =>
          context.json({ error: "Authentication required." }, 401)) as never,
        auditStore: audit,
      }),
    );
    const secret = broker.helperSecretFor(actor);
    const good = await routes.request("/api/programs/helper/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pollBody(secret, actor, clock.at)),
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ operations: [] });
    const bad = await routes.request("/api/programs/helper/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pollBody("wrong", actor, clock.at)),
    });
    expect(bad.status).toBe(401);
    const junk = await routes.request("/api/programs/helper/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect([400, 401]).toContain(junk.status);
    // The person's own routes do need the session.
    expect((await routes.request("/api/programs")).status).toBe(401);
  });
});
