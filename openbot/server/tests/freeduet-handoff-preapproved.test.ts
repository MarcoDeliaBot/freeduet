/**
 * Hand-offs along FreeDuet's hub are pre-approved (docs/M1_PLAN.md, D21), against a real database.
 *
 * On a fresh stack with no standing "always allow", one night of team evals produced 46 approval
 * requests, all for `message_bot`: every member's status report to Iris and some of Iris's hand-offs.
 * The reviewer here answers `needs_approval` to everything, which is what produced them, and each case
 * runs through `wireCoordination` (the wiring index.ts uses) over the real approval service, store,
 * handoff desk, grants and audit trail. Only the person, the Bots and the model are stand-ins.
 *
 * What must hold: a hand-off along a grant the package wrote never asks; every other call to the gate,
 * and every other kind of hand-off, behaves as it did; and the member that receives the work is gated
 * on its own actions.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { HANDED_OVER } from "@openbot/shared/handoff-markers";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import type { RunAssertion } from "../src/agents/callback-token";
import { wireCoordination } from "../src/agents/coordination-wiring";
import { createHandoffDesk } from "../src/agents/handoff";
import { createCoordinationTools } from "../src/agents/handoff-tool";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalCandidate,
  type ApprovalContinuation,
  withApprovalContext,
} from "../src/approvals/types";
import { createAuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  approvalRequests,
  auditEvents,
  pluginGrants,
  users,
  workItems,
} from "../src/db/schema";
import { markFreeDuetPackage } from "../src/freeduet/coordination";
import { FREEDUET_GRANT, seedHubGrants } from "../src/freeduet/hub-grants";
import {
  HUB_HANDOFF_SOURCE,
  hubGrantExists,
  preApproveHubHandoffs,
  resolveHandoffTarget,
} from "../src/freeduet/hub-handoffs";
import { createPluginStore } from "../src/plugins/store";
import type { TenantPackage } from "../src/tenant-package";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { stubBroker } from "./support/stub-broker";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);

// Iris is the member whose id is the tenant id, as in FreeDuet's own package.
const IRIS = `hub-iris-${suite}`;
const PORTIA = `hub-portia-${suite}`;
const GUS = `hub-gus-${suite}`;
const LEO = `hub-leo-${suite}`;
// A Bot the package does not list: no hub grant reaches it or comes from it.
const VERA = `hub-vera-${suite}`;
const TWIN = `hub-twin-${suite}`;
const MEMBERS = [IRIS, PORTIA, GUS, LEO];
const BOTS = [...MEMBERS, VERA, TWIN];
const NAMES: Record<string, string> = {
  [IRIS]: `Iris ${suite}`,
  [PORTIA]: `Portia ${suite}`,
  [GUS]: `Gus ${suite}`,
  [LEO]: `Leo ${suite}`,
  [VERA]: `Vera ${suite}`,
  // Called the same as Gus: two Bots with one name, one of them with a hub grant.
  [TWIN]: `Gus ${suite}`,
};
const PERSON = `hub-person-${suite}`;
const ADMIN = `hub-admin-${suite}`;

const tenantPackage = {
  tenantId: IRIS,
  agents: MEMBERS.map((id) => ({
    id,
    name: NAMES[id] as string,
    title: id,
    roleDescription: id,
    type: "built_in" as const,
    configuration: { systemPrompt: "Help." },
    skills: [],
  })),
  channels: [],
} as unknown as TenantPackage;

const { broker } = stubBroker({ grantIsLocal: true, authorizations: null });
const auditStore = createAuditStore(database);
const pluginStore = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore,
  credentials: {} as never,
  encryptionKey: "x".repeat(44),
  policy: () => ({ mode: "enforce", deny: [], allow: ["true"] }),
  broker,
});
const profiles = createAgentProfileStore(database, undefined);
const actorFor = async (id: string): Promise<AgentActor> => ({
  id,
  role: "user",
});
const desk = createHandoffDesk({
  queue: createWorkQueue(database),
  profiles,
  actorFor,
  mayAddress: async (fromBotId, toBotId) =>
    (
      await pluginStore.botsReachableFrom(fromBotId).catch(() => [] as string[])
    ).includes(toBotId),
  auditStore,
  caps: { maxDepth: 1, maxPerRun: 3 },
});

/** What the reviewer says. The fresh stack's reviewer was shown no request that named the hand-off. */
const NEEDS_APPROVAL = {
  verdict: "needs_approval",
  preApproved: false,
  safety: "none",
  reason: "Nothing the person said asks for this.",
};
const PROCEED = {
  verdict: "proceed",
  preApproved: true,
  safety: "none",
  reason: "The person asked for this.",
};
function reviewer(answer: object) {
  const prompts: string[] = [];
  return {
    prompts,
    review: async (prompt: string) => {
      prompts.push(prompt);
      return JSON.stringify(answer);
    },
  };
}

/** One approval service over the real store, and the coordination tools wired as index.ts wires them. */
function stack(answer: object) {
  const model = reviewer(answer);
  const service = createApprovalService(
    createApprovalStore(database),
    undefined,
    undefined,
    { review: model.review },
  );
  const { coordination } = wireCoordination({
    handoffDesk: desk,
    config: { handoff: { maxDepth: 1, maxPerRun: 3 } } as never,
    approvalService: service,
    agentProfileStore: profiles,
    actorFor,
    channelSourceForRun: async () => null,
    database,
    pluginStore,
    bootAuditStore: auditStore,
    peopleStore: { find: async () => ({ revoked: false }) } as never,
    sourceForCoordinationRun: async (run: RunAssertion) => ({
      channelId: `channel-${suite}`,
      botId: run.botId,
    }),
    channelStore: {} as never,
    notify: async () => undefined,
  });
  return { model, service, coordination };
}

/** The coordination tools as they were before D21: the approval service's own gate, nothing in front. */
function unwrapped(service: ReturnType<typeof createApprovalService>) {
  return createCoordinationTools({
    desk,
    caps: { maxDepth: 1, maxPerRun: 3 },
    approvalGate: service.gate,
    botsReachableFrom: (botId) => pluginStore.botsReachableFrom(botId),
    auditStore,
    authoriseRun: async () => true,
    route: async () => ({ reached: "the person" }),
  });
}

let counter = 0;
function newRun(botId: string): RunAssertion {
  counter += 1;
  return {
    botId,
    actorId: PERSON,
    runId: `run-${suite}-${counter}`,
    threadId: `thread-${suite}-${counter}`,
    depth: 0,
  };
}
function contextOf(
  run: RunAssertion,
  toolName: string,
  args: Record<string, unknown>,
  said = "Handle the Northwind invoice.",
): ApprovalContinuation {
  return {
    runId: run.runId,
    threadId: run.threadId as string,
    toolCallId: `call-${run.runId}`,
    toolName,
    args,
    messages: [{ id: `m-${run.runId}`, role: "user", content: said }],
    state: {},
    context: [],
    forwardedProps: {},
    initiator: { kind: "person" },
  };
}

type Called = { text: string; isError: boolean } | null;
/** A member's `message_bot` call, in-band: with a conversation behind it that the gate can ask. */
function handOff(
  team: ReturnType<typeof stack>["coordination"],
  from: string,
  to: string,
  task = "Check what Northwind owes for March and draft a reminder.",
): { run: RunAssertion; result: Promise<Called> } {
  const run = newRun(from);
  const args = { bot: to, task };
  return {
    run,
    result: withApprovalContext(contextOf(run, "message_bot", args), () =>
      team.call({ name: "message_bot", args, run }),
    ),
  };
}

const suspended = (promise: Promise<unknown>) =>
  promise.then(
    () => false,
    (error: unknown) => error instanceof HeadlessToolSuspension,
  );

const requestsOf = (run: RunAssertion) =>
  database
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.ownerUserId, PERSON),
        eq(approvalRequests.runId, run.runId),
      ),
    );
const auditOf = (eventType: string, runId?: string) =>
  database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorUserId, PERSON),
        eq(auditEvents.eventType, eventType as never),
        runId ? sql`${auditEvents.payload}->>'run' = ${runId}` : undefined,
      ),
    );
const hopsFrom = (run: RunAssertion) =>
  database
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.kind, "bot.message"),
        sql`${workItems.payload}->>'runId' = ${run.runId}`,
      ),
    );

async function clean() {
  await database
    .delete(workItems)
    .where(sql`${workItems.payload}->>'actorId' = ${PERSON}`);
  await database.delete(users).where(inArray(users.id, [PERSON, ADMIN]));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, BOTS));
  await database
    .delete(agentProfiles)
    .where(inArray(agentProfiles.agentId, BOTS));
  await database.delete(agents).where(inArray(agents.id, BOTS));
}

beforeAll(async () => {
  await clean();
  for (const id of BOTS) {
    await database.insert(agents).values({
      id,
      name: NAMES[id] as string,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
    });
    await database.insert(agentProfiles).values({
      agentId: id,
      title: id,
      roleDescription: id,
      avatarSeed: id,
      visibility: "public",
    });
  }
  await database
    .insert(users)
    .values([PERSON, ADMIN].map((id) => ({ id, email: `${id}@example.test` })));
  // An admin's grant for a pair the hub also wants, made before the package's sync: it keeps the
  // admin's credit (D14). And one for a Bot the package does not list.
  await database.insert(pluginGrants).values([
    { kind: "bot", ref: LEO, agentId: IRIS, grantedBy: ADMIN },
    { kind: "bot", ref: VERA, agentId: IRIS, grantedBy: ADMIN },
  ]);
  await seedHubGrants(database, tenantPackage);
  // Gus's twin, with the package's mark too (a sync would remove it as stale, so it is added after):
  // the name alone then names two Bots that Iris may reach.
  await database.insert(pluginGrants).values({
    kind: "bot",
    ref: TWIN,
    agentId: IRIS,
    grantedBy: FREEDUET_GRANT,
  });
  markFreeDuetPackage(true);
});

afterAll(async () => {
  markFreeDuetPackage(false);
  await clean();
  await database.$client.end({ timeout: 5 });
});

describe("the grants the package wrote", () => {
  test("the hub is the package's, the admin's grants kept their credit", async () => {
    const rows = await database
      .select({
        agentId: pluginGrants.agentId,
        ref: pluginGrants.ref,
        by: pluginGrants.grantedBy,
      })
      .from(pluginGrants)
      .where(
        and(eq(pluginGrants.kind, "bot"), inArray(pluginGrants.agentId, BOTS)),
      );
    const by = (from: string, to: string) =>
      rows.find((row) => row.agentId === from && row.ref === to)?.by;
    expect(by(IRIS, PORTIA)).toBe(FREEDUET_GRANT);
    expect(by(GUS, IRIS)).toBe(FREEDUET_GRANT);
    // Both pairs were granted by the admin before the sync, and the sync left them theirs.
    expect(by(IRIS, LEO)).toBe(ADMIN);
    expect(by(IRIS, VERA)).toBe(ADMIN);
    expect(by(PORTIA, GUS)).toBeUndefined();
  });
});

describe("on a fresh stack, before D21: the 46 requests", () => {
  test("the reviewer's needs_approval stops Iris to Portia and Gus to Iris at the gate", async () => {
    const { model, service } = stack(NEEDS_APPROVAL);
    const tools = unwrapped(service);
    for (const [from, to] of [
      [IRIS, PORTIA],
      [GUS, IRIS],
    ] as const) {
      const run = newRun(from);
      const args = { bot: to, task: "Report." };
      expect(
        await suspended(
          withApprovalContext(contextOf(run, "message_bot", args), () =>
            tools.call({ name: "message_bot", args, run }),
          ),
        ),
      ).toBe(true);
      const [request] = await requestsOf(run);
      expect(request).toMatchObject({ status: "pending" });
      expect(request?.action).toMatchObject({
        toolRef: "bot/message_bot",
        effect: "delegate",
        policy: { behaviour: "ask", source: "auto_review" },
      });
    }
    expect(model.prompts).toHaveLength(2);
  });
});

describe("hand-offs along the hub never ask", () => {
  test("Iris to Portia, by name, on a fresh database: no request, no reviewer, the hop is queued and audited", async () => {
    const { model, coordination } = stack(NEEDS_APPROVAL);
    const { run, result } = handOff(
      coordination,
      IRIS,
      NAMES[PORTIA] as string,
    );
    const answer = await result;
    expect(answer?.isError).toBe(false);
    expect(answer?.text).toStartWith(HANDED_OVER);
    expect(await requestsOf(run)).toHaveLength(0);
    expect(model.prompts).toHaveLength(0);
    // The person can still see it: the hop on the queue (the target's conversation and Activity read
    // it) and the desk's own audit row, as before.
    const [hop] = await hopsFrom(run);
    expect(hop?.payload).toMatchObject({
      fromBotId: IRIS,
      toBotId: PORTIA,
      actorId: PERSON,
      depth: 1,
    });
    expect(
      (await auditOf("agent.handoff_offered", run.runId)).map(
        (row) => row.targetId,
      ),
    ).toEqual([PORTIA]);
    // And the gate's verdict, in the place every other verdict is.
    const [verdict] = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, PERSON),
          eq(auditEvents.eventType, "approval.evaluated"),
          sql`${auditEvents.payload}->'outcome'->>'source' = ${HUB_HANDOFF_SOURCE}`,
          sql`${auditEvents.payload}->>'bot' = ${IRIS}`,
          sql`${auditEvents.payload}->>'scope' = ${NAMES[PORTIA]}`,
        ),
      );
    expect(verdict?.payload).toMatchObject({
      decidedBy: "policy",
      tool: "bot/message_bot",
      effect: "delegate",
      outcome: { behaviour: "allow", source: HUB_HANDOFF_SOURCE },
      grant: { from: IRIS, to: PORTIA, grantedBy: FREEDUET_GRANT },
    });
  });

  test("Gus's status report to Iris, by id and by name, with no request", async () => {
    const { model, coordination } = stack(NEEDS_APPROVAL);
    for (const named of [IRIS, NAMES[IRIS]?.toUpperCase() as string]) {
      const { run, result } = handOff(
        coordination,
        GUS,
        named,
        "Status: done.",
      );
      expect((await result)?.text).toStartWith(HANDED_OVER);
      expect(await requestsOf(run)).toHaveLength(0);
      expect((await hopsFrom(run))[0]?.payload).toMatchObject({
        fromBotId: GUS,
        toBotId: IRIS,
      });
    }
    expect(model.prompts).toHaveLength(0);
  });

  test("a task that mentions a payment is still only a hand-off: nothing is asked for the words", async () => {
    const { coordination } = stack(NEEDS_APPROVAL);
    const { run, result } = handOff(
      coordination,
      IRIS,
      NAMES[PORTIA] as string,
      "Pay Northwind's March invoice by bank transfer.",
    );
    expect((await result)?.text).toStartWith(HANDED_OVER);
    expect(await requestsOf(run)).toHaveLength(0);
  });
});

describe("everything else is as it was", () => {
  test("a hand-off to a Bot with no hub grant is refused by the desk exactly as today", async () => {
    // Gus to Portia: member to member, which the hub never grants. The reviewer lets it reach the desk.
    const { coordination, service } = stack(PROCEED);
    const { run, result } = handOff(coordination, GUS, NAMES[PORTIA] as string);
    const answer = await result;
    const control = newRun(GUS);
    const args = {
      bot: NAMES[PORTIA],
      task: "Check what Northwind owes for March and draft a reminder.",
    };
    const controlAnswer = await withApprovalContext(
      contextOf(control, "message_bot", args),
      () =>
        unwrapped(service).call({ name: "message_bot", args, run: control }),
    );
    expect(answer?.isError).toBe(true);
    expect(answer?.text).toContain(
      `You have not been given ${NAMES[PORTIA]} to hand work to. An administrator grants that.`,
    );
    expect(answer).toEqual(controlAnswer);
    expect(await hopsFrom(run)).toHaveLength(0);
    // The gate decided it, not the hub: no pre-approval row.
    expect(await auditOf("approval.evaluated", run.runId)).toHaveLength(0);
  });

  test("and where the reviewer says ask, member to member still asks the person", async () => {
    const { coordination } = stack(NEEDS_APPROVAL);
    const { run, result } = handOff(coordination, GUS, NAMES[PORTIA] as string);
    expect(await suspended(result)).toBe(true);
    const [request] = await requestsOf(run);
    expect(request?.action.policy).toMatchObject({
      behaviour: "ask",
      source: "auto_review",
    });
  });

  test("a grant an admin made by hand keeps the gate's behaviour, also over a pair the hub wants", async () => {
    // Iris to Leo and Iris to Vera were granted by the admin; Leo and Vera are not hub grants.
    for (const to of [LEO, VERA]) {
      const asked = stack(NEEDS_APPROVAL);
      const first = handOff(asked.coordination, IRIS, NAMES[to] as string);
      expect(await suspended(first.result)).toBe(true);
      expect(await requestsOf(first.run)).toHaveLength(1);
      expect(await hopsFrom(first.run)).toHaveLength(0);

      // And where the reviewer says proceed it goes out, as it does today.
      const allowed = stack(PROCEED);
      const second = handOff(allowed.coordination, IRIS, NAMES[to] as string);
      expect((await second.result)?.text).toStartWith(HANDED_OVER);
      expect(allowed.model.prompts).toHaveLength(1);
    }
    expect(await hubGrantExists(database, IRIS, LEO)).toBe(false);
    expect(await hubGrantExists(database, IRIS, VERA)).toBe(false);
  });

  test("a non-FreeDuet package keeps upstream behaviour, whatever the grant rows say", async () => {
    markFreeDuetPackage(false);
    try {
      const { model, coordination } = stack(NEEDS_APPROVAL);
      const { run, result } = handOff(
        coordination,
        IRIS,
        NAMES[PORTIA] as string,
      );
      expect(await suspended(result)).toBe(true);
      expect(await requestsOf(run)).toHaveLength(1);
      expect(model.prompts).toHaveLength(1);
      // The hub's own audit row carries the run; there is none for this one.
      expect(await auditOf("approval.evaluated", run.runId)).toHaveLength(0);
      expect((await requestsOf(run))[0]?.action.policy).toMatchObject({
        behaviour: "ask",
        source: "auto_review",
      });
    } finally {
      markFreeDuetPackage(true);
    }
  });

  test("a name two Bots share is not pre-approved: the gate asks, and the desk refuses it as ambiguous", async () => {
    const asked = stack(NEEDS_APPROVAL);
    const first = handOff(asked.coordination, IRIS, NAMES[GUS] as string);
    expect(await suspended(first.result)).toBe(true);
    const allowed = stack(PROCEED);
    const second = handOff(allowed.coordination, IRIS, NAMES[GUS] as string);
    const answer = await second.result;
    expect(answer?.isError).toBe(true);
    expect(answer?.text).toContain("More than one Bot is called");
    expect(await hopsFrom(second.run)).toHaveLength(0);
    // The id still names exactly one of them.
    const byId = handOff(allowed.coordination, IRIS, GUS);
    expect((await byId.result)?.text).toStartWith(HANDED_OVER);
  });

  test("the depth cap is the desk's, unchanged: a hand-off from a hop is refused after the gate lets it by", async () => {
    const { service } = stack(NEEDS_APPROVAL);
    const tools = createCoordinationTools({
      desk,
      caps: { maxDepth: 1, maxPerRun: 3 },
      approvalGate: preApproveHubHandoffs(service.gate, {
        database,
        profiles,
        actorFor,
        audit: auditStore,
      }),
      botsReachableFrom: (botId) => pluginStore.botsReachableFrom(botId),
      auditStore,
      authoriseRun: async () => true,
      route: async () => ({ reached: "the person" }),
    });
    const deep: RunAssertion = { ...newRun(PORTIA), depth: 1 };
    // Not offered at the cap, and refused if a stale schema calls it anyway.
    expect((await tools.toolsForRun(deep)).map((tool) => tool.name)).toEqual([
      "ask_person",
    ]);
    const args = { bot: NAMES[IRIS], task: "Report." };
    const refused = await withApprovalContext(
      contextOf(deep, "message_bot", args),
      () => tools.call({ name: "message_bot", args, run: deep }),
    );
    expect(refused?.isError).toBe(true);
    expect(refused?.text).toContain("already 1 Bot deep");
    expect(await hopsFrom(deep)).toHaveLength(0);
  });

  test("an approval that was opened before D21 is re-checked by the gate, not waved through", async () => {
    // Opened with the package not marked, then decided and re-checked with it marked.
    markFreeDuetPackage(false);
    const { coordination, service } = stack(NEEDS_APPROVAL);
    const { run, result } = handOff(
      coordination,
      IRIS,
      NAMES[PORTIA] as string,
    );
    expect(await suspended(result)).toBe(true);
    const [request] = await requestsOf(run);
    markFreeDuetPackage(true);
    const gate = preApproveHubHandoffs(service.gate, {
      database,
      profiles,
      actorFor,
      audit: auditStore,
    });
    const action = request?.action as NonNullable<typeof request>["action"];
    const checked = await service.validateReentry(action, () =>
      gate({
        actorId: action.actorId,
        botId: action.botId,
        toolRef: action.toolRef,
        effect: action.effect,
        scope: action.scope,
        args: action.args,
        target: action.target,
        continuation: action.continuation,
      }),
    );
    expect(checked).toMatchObject({
      toolRef: "bot/message_bot",
      actionDigest: action.actionDigest,
    });
  });
});

describe("delegation never launders an account action", () => {
  const sendEmail = (botId: string, run: RunAssertion): ApprovalCandidate => ({
    actorId: PERSON,
    botId,
    toolRef: "mcp/gmail/send_email",
    effect: "write",
    scope: "gmail",
    args: { to: "accounts@northwind.example", subject: "March reminder" },
    continuation: contextOf(
      run,
      "mcp/gmail/send_email",
      { to: "accounts@northwind.example" },
      "Iris asked: email the March reminder to Northwind.",
    ),
  });

  test("Iris hands Portia a task that ends in an email: the hand-off passes, Portia's send asks", async () => {
    const { coordination, service } = stack(NEEDS_APPROVAL);
    const { run: irisRun, result } = handOff(
      coordination,
      IRIS,
      NAMES[PORTIA] as string,
      "Email the March reminder to accounts@northwind.example.",
    );
    expect((await result)?.text).toStartWith(HANDED_OVER);
    expect(await requestsOf(irisRun)).toHaveLength(0);

    // The hop's run, in Portia: its own conversation, its own call, the same gate.
    const portiaRun = newRun(PORTIA);
    const gate = preApproveHubHandoffs(service.gate, {
      database,
      profiles,
      actorFor,
      audit: auditStore,
    });
    expect(await suspended(gate(sendEmail(PORTIA, portiaRun)))).toBe(true);
    const [request] = await requestsOf(portiaRun);
    expect(request).toMatchObject({ ownerUserId: PERSON, status: "pending" });
    expect(request?.action).toMatchObject({
      botId: PORTIA,
      toolRef: "mcp/gmail/send_email",
      policy: { behaviour: "ask" },
    });
  });

  test("a payment is handed to the person by the safety floor, with no reviewer asked", async () => {
    const { model, service } = stack(PROCEED);
    const gate = preApproveHubHandoffs(service.gate, {
      database,
      profiles,
      actorFor,
      audit: auditStore,
    });
    const run = newRun(PORTIA);
    const candidate: ApprovalCandidate = {
      ...sendEmail(PORTIA, run),
      toolRef: "mcp/bank/send_payment",
      scope: "bank",
      args: { invoice: "March", amount: 1200 },
    };
    expect(await suspended(gate(candidate))).toBe(true);
    const [request] = await requestsOf(run);
    expect(request?.action.policy).toMatchObject({
      behaviour: "hand_off",
      source: "safety",
    });
    expect(model.prompts).toHaveLength(0);
  });

  test("only the hand-off is let through: the same tool from another Bot, or another effect, is the gate's", async () => {
    const { service } = stack(NEEDS_APPROVAL);
    const gate = preApproveHubHandoffs(service.gate, {
      database,
      profiles,
      actorFor,
      audit: auditStore,
    });
    const asks = async (over: Partial<ApprovalCandidate>) => {
      const run = newRun(IRIS);
      const base: ApprovalCandidate = {
        actorId: PERSON,
        botId: IRIS,
        toolRef: "bot/message_bot",
        effect: "delegate",
        scope: NAMES[PORTIA] as string,
        args: { bot: NAMES[PORTIA], task: "Report." },
        target: { bot: NAMES[PORTIA] },
        continuation: contextOf(run, "message_bot", { bot: NAMES[PORTIA] }),
      };
      return suspended(gate({ ...base, ...over }));
    };
    // The hand-off itself is let through (no suspension), and each variation below is not.
    expect(await asks({})).toBe(false);
    expect(await asks({ effect: "write" })).toBe(true);
    expect(await asks({ toolRef: "bot/ask_person" })).toBe(true);
    expect(await asks({ toolRef: "mcp/gmail/send_email" })).toBe(true);
    // From a Bot the hub does not name, and to one it does not reach.
    expect(await asks({ botId: PORTIA })).toBe(true);
    expect(await asks({ scope: NAMES[VERA] as string })).toBe(true);
    expect(await asks({ scope: "nobody here" })).toBe(true);
  });
});

describe("which Bot a hand-off names", () => {
  const bot = (id: string, name: string, over: object = {}) => ({
    id,
    name,
    hidden: false,
    deletedAt: null,
    ...over,
  });
  const roster = [
    bot("Iris", "Iris"),
    bot("gus-1", "Gus"),
    bot("gus-2", "Gus"),
    bot("leo", "Leo"),
    bot("ghost", "Ghost", { hidden: true }),
    bot("gone", "Gone", { deletedAt: new Date() }),
  ];
  const named = (value: string, from = "leo") =>
    resolveHandoffTarget(roster, from, value);

  test("an id is exact and a name is not case-sensitive", () => {
    expect(named("iris")).toBe("Iris");
    expect(named("  IRIS ")).toBe("Iris");
    expect(named("gus-2")).toBe("gus-2");
    expect(named("GUS-2")).toBe("gus-2");
  });
  test("two visible Bots of one name are nobody, as the desk refuses it", () => {
    expect(named("Gus")).toBeUndefined();
    expect(named("gus")).toBeUndefined();
  });
  test("a hidden, deleted, missing or own Bot is nobody", () => {
    expect(named("ghost")).toBeUndefined();
    expect(named("Gone")).toBeUndefined();
    expect(named("nobody")).toBeUndefined();
    expect(named("leo")).toBeUndefined();
    expect(named("Leo")).toBeUndefined();
  });
});
