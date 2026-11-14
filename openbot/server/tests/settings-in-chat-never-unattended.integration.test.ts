/**
 * A setting is changed only in a conversation with the person (docs/design/settings-in-chat.md, 8.9),
 * through the REAL plugin store, the real approval service, the real Settings transport and change
 * service, a real database, and for hand-offs the real desk, queue, runner and delivery.
 *
 * "The vendor" is `reached`: the one function every call that gets past every gate goes through, and
 * behind it the real Settings transport. What is proved:
 *
 *   - the person's own turn is asked, as before, with Full access on or off, and carried out once when
 *     they allow it (a guard: it holds on main too);
 *   - a routine, a trigger, a check-in, research, a memory run and the deployment are REFUSED before any
 *     card: no card, nothing reached, nothing recorded as a change, one line in the trail;
 *   - a hand-off follows its root and its leg, read from the real chain: the FORWARD hop is refused, the
 *     RELAY of a hop made from the person's own turn is asked as before, and the relay of one made from a
 *     routine, a hop two deep and a run whose signature does not read are refused;
 *   - a call outside any run that can wait is refused in the same sentence;
 *   - a setting added to the list later is covered without being named;
 *   - a card a routine opened before this existed cannot be carried out by answering it now.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import type { AbstractAgent, BaseEvent, Message } from "@ag-ui/client";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Observable } from "rxjs";
import {
  mintRunAssertion,
  readRunAssertion,
} from "../src/agents/callback-token";
import { createHandoffDesk } from "../src/agents/handoff";
import { createHandoffDelivery } from "../src/agents/handoff-delivery";
import {
  createHandoffRunner,
  type HandoffDelivery,
  type HandoffWork,
} from "../src/agents/handoff-runner";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import { handoffTool } from "../src/agents/handoff-tool";
import { createAgentProfileStore } from "../src/agents/profile-store";
import { serverTurnAdmission } from "../src/agents/turn-admission";
import { createApp } from "../src/app";
import { createApprovedActionExecutor } from "../src/approvals/execute";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import { ApprovalRefusedError } from "../src/approvals/types";
import {
  type AuditInitiator,
  createAuditReader,
  createAuditStore,
  handoffInitiator,
} from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { loadConfig } from "../src/config";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  approvalPreferences,
  approvalRequests,
  approvalRules,
  auditEvents,
  mcpServers,
  pluginGrants,
  users,
} from "../src/db/schema";
import { botLifecycle } from "../src/db/schema/lifecycle";
import { workItems } from "../src/db/schema/work";
import { createFullAccess } from "../src/freeduet/full-access";
import {
  callTool as callSettingsTransport,
  useSettingsTools,
} from "../src/plugins/builtin-settings";
import { createPluginStore, PluginRefusedError } from "../src/plugins/store";
import { grantedTools, REFUSAL_MARKER } from "../src/plugins/tools";
import { PRIVATE_SHARE_TOOL_REF } from "../src/proactive/private-share";
import {
  checkInInitiator,
  proactiveInitiator,
  restrictToolsForRun,
} from "../src/proactive/restriction";
import { CHAT_SETTING_NAMES } from "../src/settings-in-chat/allow-list";
import {
  createSettingChanges,
  type SettingChanges,
} from "../src/settings-in-chat/changes";
import { NOT_IN_A_CONVERSATION } from "../src/settings-in-chat/own-turn";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_sna_${suite}`;
/** The member that asks, with Full access on: the worst case for a card that must not be skipped. */
const IRIS = `agent_sna_iris_${suite}`;
/** The member that is asked, with Full access off. */
const OTTO = `agent_sna_otto_${suite}`;
/** A third member, for a hop made from inside a hop. */
const GUS = `agent_sna_gus_${suite}`;
const bots = [IRIS, OTTO, GUS];
const NAMES = new Map([
  [IRIS, `Iris ${suite}`],
  [OTTO, `Otto ${suite}`],
  [GUS, `Gus ${suite}`],
]);
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const SETTINGS = "settings";
const REF = `${SETTINGS}/change_setting`;
const ARGS = { setting: "notifications", value: "needs_input" };

/** Every call that got past every gate and reached the transport, by tool name. */
const reached: string[] = [];

const audit = createAuditStore(database);
const reader = createAuditReader(database);
const changes = createSettingChanges({ database, audit, reader });
const approvals = createApprovalStore(database);
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  handedRequest: async () => null,
  audit,
});
const service = createApprovalService(approvals, undefined, undefined, {
  fullAccess,
  // The deployment's own model says "proceed" about an unremarkable write: what let a routine's
  // write through before D35, so it is what this reviewer says.
  review: async () =>
    JSON.stringify({
      verdict: "proceed",
      preApproved: true,
      safety: "none",
      reason: "Test reviewer.",
    }),
});
const store = createPluginStore({
  brokerProvider: "composio" as const,
  database,
  auditStore: audit,
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  verifyUserSecret: async () => ({ ok: true as const, calendar: false }),
  approvalGate: (candidate) => service.gate(candidate),
  callVendor: (connection, toolName, args) => {
    reached.push(toolName);
    return callSettingsTransport(connection, toolName, args);
  },
});

const PERSON: AuditInitiator = { kind: "person" };
const ROUTINE: AuditInitiator = { kind: "routine", id: "routine-sna-1" };
const TRIGGER: AuditInitiator = { kind: "responsibility", id: "goal-sna-1" };
const MEMORY: AuditInitiator = { kind: "memory", id: "sync-sna-1" };
const DEPLOYMENT: AuditInitiator = { kind: "deployment" };

const typed = (content: string, id = `msg-${randomUUID()}`): Message => ({
  id,
  role: "user",
  content,
});

type Turn = {
  messages?: Message[];
  /** The initiator the run carries. Absent is a turn started from the app. */
  initiator?: AuditInitiator;
  threadId?: string;
  runId?: string;
  toolCallId?: string;
  /** The arguments of the call the run is making: the executor carries an allowed card out from these. */
  args?: Record<string, unknown>;
  /** What the run was started with: for a hop, the deployment's signed statement of it. */
  forwardedProps?: unknown;
};

/** The Settings write tool as a Bot's tool list names it: `mcp__<server>__<tool>`. */
const CHANGE_SETTING_TOOL = `mcp__${SETTINGS}__change_setting`;
const isChangeSetting = (name: string) => name === CHANGE_SETTING_TOOL;

/** A call inside a run that can wait for the person, as a Bot's turn makes it. */
function inTurn<T>(turn: Turn, run: () => Promise<T>) {
  const context: ApprovalContinuation = {
    runId: turn.runId ?? randomUUID(),
    threadId: turn.threadId ?? `thread-${randomUUID()}`,
    toolCallId: turn.toolCallId ?? randomUUID(),
    // The call being made, as the deployment stores it with a card: an allowed card is carried out from it.
    toolName: CHANGE_SETTING_TOOL,
    args: turn.args ?? ARGS,
    messages: turn.messages ?? [],
    state: {},
    context: [],
    forwardedProps: turn.forwardedProps ?? {},
    ...(turn.initiator ? { initiator: turn.initiator } : {}),
  };
  return withApprovalContext(context, run);
}
const fresh = (turn: Turn = {}) => ({
  ...turn,
  runId: randomUUID(),
  toolCallId: randomUUID(),
  threadId: turn.threadId ?? `thread-${randomUUID()}`,
});

/** One call to the Settings connector's write tool, as the store sees it. */
const change = (
  botId: string,
  initiator?: AuditInitiator,
  args: Record<string, unknown> = ARGS,
) =>
  store.callTool({
    ref: REF,
    args,
    botId,
    actorId: owner,
    // The way the in-process door passes it: the run's own initiator, and none for a plain turn.
    ...(initiator ? { initiator } : {}),
  });

/**
 * What the person's answer does next, the way the deployment does it and not a copy of it: the stored
 * card is re-checked by the real executor under the run it was asked in, carried out by the same
 * executor when it still holds, and the Bot is told how it went. Only the Bot's own next turn is not
 * run: what it would be handed is what `told` keeps.
 */
const executor = createApprovedActionExecutor({
  sourceFor: async () => ({}),
  gate: (candidate) => service.gate(candidate),
  computerTools: async () => [],
  hostTools: () => [],
  callTool: (input) => store.callTool(input),
  credentialActorFor: async (actorId) => actorId,
  coordinationCall: async () => null,
  answer: (result) => result.text,
  privateShareToolRef: PRIVATE_SHARE_TOOL_REF,
  refusalMarker: REFUSAL_MARKER,
  personInitiator: { kind: "person" },
});
const told = new Map<string, { content: string; error?: string }>();
async function answerAllowOnce(approvalId: string) {
  await approvals.decide(owner, approvalId, "allow_once");
  await service.resume(owner, approvalId, {
    validate: (action) =>
      service.validateReentry(action, () => executor(action)),
    execute: executor,
    continue: async (input) => {
      told.set(input.approvalId, input.result);
    },
  });
  return told.get(approvalId);
}

/** What the Bot was handed when its allowed card was carried out: an answer, and no error with it. */
function expectCarriedOut(
  heard: { content: string; error?: string } | undefined,
) {
  expect(heard).toBeDefined();
  expect(heard).not.toHaveProperty("error");
}

const pending = async () =>
  (await approvals.list(owner)).filter(
    (request) => request.status === "pending",
  );
async function clearPending() {
  for (const request of await pending())
    await approvals.decide(owner, request.id, "deny");
}

async function notifyOf(botId: string): Promise<string | null> {
  const [row] = await database
    .select({ notify: botLifecycle.notify })
    .from(botLifecycle)
    .where(
      and(eq(botLifecycle.ownerUserId, owner), eq(botLifecycle.agentId, botId)),
    )
    .limit(1);
  return row?.notify ?? null;
}
async function setNotify(botId: string, level: "all" | "needs_input" | "none") {
  await database
    .insert(botLifecycle)
    .values({ ownerUserId: owner, agentId: botId, notify: level })
    .onConflictDoUpdate({
      target: [botLifecycle.ownerUserId, botLifecycle.agentId],
      set: { notify: level },
    });
}
/** How many setting-change events the trail holds for the person. */
async function changeRecords() {
  const { events } = await reader.list({
    eventType: "configuration.changed",
    targetType: "bot_setting",
    actorUserId: owner,
    limit: 500,
  });
  return events.length;
}
/** The lines the trail holds for settings calls refused outside the person's own turn, oldest first. */
async function refusalsFor(botId: string) {
  return database
    .select({
      payload: auditEvents.payload,
      initiatorKind: auditEvents.initiatorKind,
      initiatorId: auditEvents.initiatorId,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.eventType, "mcp.call_rejected"),
        eq(auditEvents.targetId, REF),
        sql`${auditEvents.payload}->>'actor' = ${owner}`,
        sql`${auditEvents.payload}->>'bot' = ${botId}`,
        sql`${auditEvents.payload}->>'refusal' = 'setting_change_outside_own_turn'`,
      ),
    )
    .orderBy(auditEvents.createdAt);
}

const reset = async () => {
  reached.length = 0;
  await clearPending();
  for (const botId of bots) await setNotify(botId, "all");
};

/** Nothing happened that should not have: no card, nothing reached, nothing changed, nothing recorded. */
async function expectNothingHappened(botId: string, recordsBefore: number) {
  expect(await pending()).toEqual([]);
  expect(reached).toEqual([]);
  expect(await notifyOf(botId)).toBe("all");
  expect(await changeRecords()).toBe(recordsBefore);
}

let settingsExisted = false;

beforeAll(async () => {
  await database.insert(users).values({
    id: owner,
    email: `${owner}@sna.test`,
    name: owner,
    emailVerified: false,
  });
  for (const id of bots) {
    await database.insert(agents).values({
      id,
      name: NAMES.get(id) ?? id,
      type: "built_in",
      configuration: {},
    });
    await database.insert(agentProfiles).values({
      agentId: id,
      title: "",
      roleDescription: "",
      avatarSeed: id,
      visibility: "public",
    });
  }
  const [row] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, SETTINGS));
  if (row) settingsExisted = true;
  await store.addServer({ key: SETTINGS, by: owner });
  for (const botId of bots) await store.grant("mcp", REF, botId, owner);
  // The hand-off grants the desk reads: Iris may ask Otto, Otto may ask Gus.
  await database.insert(pluginGrants).values([
    { kind: "bot", ref: OTTO, agentId: IRIS, grantedBy: "test" },
    { kind: "bot", ref: GUS, agentId: OTTO, grantedBy: "test" },
  ]);
  await fullAccess.set(owner, IRIS, true);
  // The default settings: auto-review on, "ask before making changes" off.
  await service.setPreferences(owner, { enabled: false, autoReview: true });
  useSettingsTools(changes);
});

afterAll(async () => {
  useSettingsTools(null);
  await clearWork();
  const asked = (await approvals.list(owner)).map((request) => request.id);
  if (asked.length > 0)
    await database
      .delete(workItems)
      .where(
        and(
          eq(workItems.kind, "approval.resume"),
          inArray(workItems.key, asked),
        ),
      );
  await database
    .delete(approvalRequests)
    .where(eq(approvalRequests.ownerUserId, owner));
  await database
    .delete(approvalRules)
    .where(eq(approvalRules.ownerUserId, owner));
  await database
    .delete(approvalPreferences)
    .where(eq(approvalPreferences.ownerUserId, owner));
  await database
    .delete(botLifecycle)
    .where(inArray(botLifecycle.agentId, bots));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, bots));
  if (!settingsExisted)
    await database.delete(mcpServers).where(eq(mcpServers.id, SETTINGS));
  await database
    .delete(agentProfiles)
    .where(inArray(agentProfiles.agentId, bots));
  await database.delete(agents).where(inArray(agents.id, bots));
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

beforeEach(reset);

describe("the person's own turn asks, as before (a guard: it holds on main too)", () => {
  // Who a turn says it is, on the run and on the call. Absent is what a turn started from the app
  // carries on both: the deployment names an initiator only for a run somebody else began.
  const shapes: [
    string,
    AuditInitiator | undefined,
    AuditInitiator | undefined,
  ][] = [
    ["a turn started from the app", undefined, undefined],
    [
      "a turn started from the app, call named as the person",
      undefined,
      PERSON,
    ],
    [
      "a turn the person started by writing in a task or from another channel",
      PERSON,
      PERSON,
    ],
  ];
  for (const [shape, runInitiator, callInitiator] of shapes)
    for (const [setting, botId] of [
      ["Full access", IRIS],
      ["no Full access", OTTO],
    ] as const)
      test(`${shape}, with ${setting}: a card first, nothing changes until it is allowed, and then once`, async () => {
        const records = await changeRecords();
        const turn = fresh({
          messages: [typed("Please only interrupt me for questions")],
          ...(runInitiator ? { initiator: runInitiator } : {}),
        });
        const held = await inTurn(turn, () =>
          change(botId, callInitiator),
        ).catch((error: unknown) => error);
        expect(held).toBeInstanceOf(HeadlessToolSuspension);
        // Asked, not done: nothing reached the transport and nothing changed while the card waits.
        expect(reached).toEqual([]);
        expect(await notifyOf(botId)).toBe("all");
        expect(await changeRecords()).toBe(records);
        const asked = await pending();
        expect(asked).toHaveLength(1);
        expect(asked[0]?.action.toolRef).toBe(REF);
        expect(asked[0]?.action.policy).toMatchObject({
          behaviour: "ask",
          source: "always_ask",
        });

        // Allowed, and carried out by the real re-check and the real executor, under the stored run.
        const id = asked[0]?.id as string;
        const heard = await answerAllowOnce(id);
        expectCarriedOut(heard);
        expect(await notifyOf(botId)).toBe("needs_input");
        expect(reached).toEqual(["change_setting"]);
        expect(await changeRecords()).toBe(records + 1);
        // Once means once: answering the same card again carries nothing out.
        await service.resume(owner, id, {
          validate: (action) =>
            service.validateReentry(action, () => executor(action)),
          execute: executor,
          continue: async () => undefined,
        });
        expect(reached).toHaveLength(1);
        expect(await changeRecords()).toBe(records + 1);
      });
});

describe("a run nobody is attending is refused before any card", () => {
  const unattended: [string, AuditInitiator][] = [
    ["a routine", ROUTINE],
    ["an event trigger", TRIGGER],
    ["a check-in", checkInInitiator("run-sna")],
    ["background research", proactiveInitiator("run-sna")],
    ["a memory run", MEMORY],
    ["the deployment", DEPLOYMENT],
  ];

  for (const [name, initiator] of unattended)
    for (const [setting, botId] of [
      ["Full access", IRIS],
      ["no Full access", OTTO],
    ] as const)
      test(`${name}, with ${setting}: no card, nothing reached, nothing changed, one line in the trail`, async () => {
        const records = await changeRecords();
        const before = (await refusalsFor(botId)).length;
        const turn = fresh({
          messages: [typed("Please only interrupt me for questions")],
          initiator,
        });
        const refused = await inTurn(turn, () =>
          change(botId, initiator),
        ).catch((error: unknown) => error);
        expect(refused).toBeInstanceOf(PluginRefusedError);
        expect((refused as Error).message).toBe(NOT_IN_A_CONVERSATION);
        await expectNothingHappened(botId, records);

        const lines = await refusalsFor(botId);
        expect(lines).toHaveLength(before + 1);
        const line = lines[lines.length - 1];
        expect(line).toMatchObject({ initiatorKind: initiator.kind });
        expect(line?.payload).toMatchObject({
          refusal: "setting_change_outside_own_turn",
          why: "not_the_persons_run",
          tool: "change_setting",
          decision: { carriedOut: false },
        });
      });

  test("the member is handed one plain sentence it can repeat to the person, as the tool's answer", async () => {
    const tools = await grantedTools({
      store,
      botId: IRIS,
      actorId: owner,
      initiator: ROUTINE,
    });
    const tool = tools.find((candidate) => isChangeSetting(candidate.name));
    if (!tool) throw new Error("the Settings tool was not offered to the Bot");
    const answer = await inTurn(fresh({ initiator: ROUTINE }), () =>
      tool.execute(ARGS),
    );
    expect(answer).toBe(`${REFUSAL_MARKER} ${NOT_IN_A_CONVERSATION}`);
    expect(await pending()).toEqual([]);
    expect(reached).toEqual([]);
  });

  test("a call that carries a routine's initiator but no run that can wait (the callback door) is refused the same way", async () => {
    const records = await changeRecords();
    const refused = await change(IRIS, ROUTINE).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(PluginRefusedError);
    expect((refused as Error).message).toBe(NOT_IN_A_CONVERSATION);
    await expectNothingHappened(IRIS, records);
  });

  test("a call made outside any run that can wait is refused, even as the person, and no card is opened", async () => {
    const records = await changeRecords();
    const refused = await change(IRIS, PERSON).catch((error: unknown) => error);
    // On main the gate refuses it with its own, longer sentence (an ApprovalRefusedError); now the call
    // is refused first, in the one sentence every other run gets.
    expect(refused).not.toBeInstanceOf(ApprovalRefusedError);
    expect(refused).toBeInstanceOf(PluginRefusedError);
    expect((refused as Error).message).toBe(NOT_IN_A_CONVERSATION);
    await expectNothingHappened(IRIS, records);
    const line = (await refusalsFor(IRIS)).pop();
    expect(line?.payload).toMatchObject({ why: "no_conversation" });
  });
});

describe("a hand-off, through the real desk, queue, runner and delivery", () => {
  type Seen = {
    /** The Bot the run was built for. */
    botId: string;
    /** The conversation the run is in: a scratch one for a forward hop, the asking one for a relay. */
    threadId: string;
    /** The deployment's signed statement of the run, as the delivery sent it. */
    assertion: string;
    work: HandoffWork;
  };
  const seen: Seen[] = [];
  let current: HandoffWork | undefined;

  const stubAgent = (): AbstractAgent => {
    let held: unknown[] = [];
    return {
      threadId: "",
      get messages() {
        return held;
      },
      setMessages(messages: unknown[]) {
        held = messages;
      },
      // The delivery listens at the agent for what the Bot said, and relays it.
      async runAgent(
        _input: unknown,
        config?: { onEvent?: (emitted: unknown) => void },
      ) {
        for (const event of [
          { type: "TEXT_MESSAGE_START" },
          { type: "TEXT_MESSAGE_CONTENT", delta: "It was at two." },
          { type: "TEXT_MESSAGE_END" },
        ])
          config?.onEvent?.({ event });
      },
    } as unknown as AbstractAgent;
  };

  const realDelivery = createHandoffDelivery({
    admission: serverTurnAdmission,
    agentFor: async () => stubAgent(),
    history: async () => [],
    newRunId: () => randomUUID(),
    mintThreadId: () => `scratch-${randomUUID()}`,
    lock: {
      acquire: async () => ({ runId: randomUUID() }),
      renew: async () => undefined,
      release: async () => undefined,
    },
    runner: {
      run: (request) => {
        const input = request.input as {
          forwardedProps: { openbotRun: string };
        };
        const work = current as HandoffWork;
        seen.push({
          botId: work.toBotId,
          threadId: request.threadId,
          assertion: input.forwardedProps.openbotRun,
          work,
        });
        return new Observable<BaseEvent>((subscriber) => {
          void (
            request.agent as unknown as {
              runAgent: (input: unknown, config: object) => Promise<void>;
            }
          )
            .runAgent(request.input, {})
            .then(
              () => {
                subscriber.next({
                  type: "RUN_FINISHED",
                } as unknown as BaseEvent);
                subscriber.complete();
              },
              (error: unknown) => subscriber.error(error),
            );
        });
      },
    },
  });
  /** The real delivery, for this suite's person only: a sweep may meet another suite's leftovers. */
  const delivery: HandoffDelivery = {
    deliver: async (input) => {
      if (input.work.actorId !== owner) return { answer: null };
      current = input.work;
      return realDelivery.deliver(input);
    },
  };
  const queue = createWorkQueue(database);
  const desk = createHandoffDesk({
    queue,
    profiles: createAgentProfileStore(database, undefined),
    actorFor: async (id: string) => ({ id, role: "user" as const }),
    mayAddress: async (fromBotId, toBotId) =>
      (
        await database
          .select({ ref: pluginGrants.ref })
          .from(pluginGrants)
          .where(
            and(
              eq(pluginGrants.kind, "bot"),
              eq(pluginGrants.agentId, fromBotId),
            ),
          )
      ).some((row) => row.ref === toBotId),
    auditStore: audit,
    caps: { maxDepth: 2, maxPerRun: 3 },
  });
  const sweep = () =>
    createHandoffRunner({
      queue,
      owner: `replica-${suite}`,
      sign: (work, claim) =>
        signHandoffDeliveryRun(work, ENCRYPTION_KEY, undefined, claim),
      auditStore: audit,
      delivery,
    }).sweep();

  /** Iris asks Otto, from a run that began as `initiator` says. Delivers the forward hop, then its relay. */
  async function hopFrom(initiator: AuditInitiator | undefined) {
    seen.length = 0;
    const asking = `thread-asking-${randomUUID()}`;
    const tool = handoffTool({
      desk,
      from: {
        botId: IRIS,
        actorId: owner,
        runId: `run-${randomUUID()}`,
        threadId: asking,
        depth: 0,
        ...(initiator ? { initiator } : {}),
      },
      hasSomebodyToAsk: true,
      maxDepth: 2,
      maxPerRun: 3,
    });
    const said = await tool?.execute({
      bot: NAMES.get(OTTO) ?? OTTO,
      task: "find the outage window",
    });
    expect(said).toContain(NAMES.get(OTTO) ?? OTTO);
    await sweep();
    await sweep();
    const forward = seen.find((entry) => entry.botId === OTTO);
    const relay = seen.find((entry) => entry.botId === IRIS);
    if (!forward || !relay)
      throw new Error(
        `the real chain did not deliver both legs: ${JSON.stringify(seen.map((entry) => entry.botId))}`,
      );
    return { asking, forward, relay };
  }

  /** The initiator a hop's run and every call in it carry: the chain the server built, rooted where it began. */
  const chainOf = (entry: Seen) =>
    handoffInitiator(entry.work.fromBotId, entry.work.initiator);

  /**
   * A call made by the Bot a hop's run was built for, inside that run, as the plugin store sees it: the
   * run is in the conversation the delivery put it in, was started with the deployment's signed
   * statement of it, and the call carries the chain's initiator.
   */
  const inHop = (entry: Seen, botId: string) =>
    inTurn(
      {
        messages: [typed("a hop's own envelope", `handoff-${randomUUID()}`)],
        initiator: chainOf(entry),
        runId: randomUUID(),
        toolCallId: randomUUID(),
        threadId: entry.threadId,
        forwardedProps: { openbotRun: entry.assertion },
      },
      () => change(botId, chainOf(entry)),
    ).catch((error: unknown) => error);

  async function clearChain() {
    await database
      .delete(workItems)
      .where(sql`${workItems.payload}->>'actorId' = ${owner}`);
  }
  beforeEach(clearChain);

  test("the FORWARD hop of a hop made from the person's own turn is refused: it runs in a conversation nobody is shown", async () => {
    const { asking, forward } = await hopFrom(PERSON);
    // The real delivery ran the addressed Bot in a conversation of its own, and signed the asking one.
    expect(forward.threadId).not.toBe(asking);
    expect(readRunAssertion(forward.assertion, ENCRYPTION_KEY)).toMatchObject({
      botId: OTTO,
      threadId: asking,
      depth: 1,
      handoff: expect.anything(),
    });

    const records = await changeRecords();
    // Rooted in the person's own turn: the chain says so, and that alone is not enough.
    expect(chainOf(forward)).toMatchObject({ kind: "handoff", origin: PERSON });
    const result = await inHop(forward, OTTO);
    expect(result).toBeInstanceOf(PluginRefusedError);
    expect((result as Error).message).toBe(NOT_IN_A_CONVERSATION);
    await expectNothingHappened(OTTO, records);
    const line = (await refusalsFor(OTTO)).pop();
    expect(line?.payload).toMatchObject({ why: "forward_hop" });
    expect(line).toMatchObject({ initiatorKind: "handoff" });
  });

  test("the RELAY of a hop made from the person's own turn asks, as before: it comes back in the conversation they are in", async () => {
    const { asking, relay } = await hopFrom(PERSON);
    expect(relay.threadId).toBe(asking);
    expect(relay.work.answerIn).toBe(asking);

    const records = await changeRecords();
    const turn = fresh({ threadId: asking });
    const chain = handoffInitiator(relay.work.fromBotId, relay.work.initiator);
    const held = await inTurn(
      {
        ...turn,
        messages: [typed("You asked Otto to help ...", `handoff-${suite}`)],
        initiator: chain,
        forwardedProps: { openbotRun: relay.assertion },
      },
      () => change(IRIS, chain),
    ).catch((error: unknown) => error);
    expect(held).toBeInstanceOf(HeadlessToolSuspension);
    expect(reached).toEqual([]);
    expect(await notifyOf(IRIS)).toBe("all");
    const asked = await pending();
    expect(asked).toHaveLength(1);
    expect(asked[0]?.action.policy).toMatchObject({
      behaviour: "ask",
      source: "always_ask",
    });
    // Answered later, the stored card is re-checked and carried out under the run it was asked in:
    // the signed statement it kept is read again, and nothing about the leg stops it.
    const heard = await answerAllowOnce(asked[0]?.id as string);
    expectCarriedOut(heard);
    expect(await notifyOf(IRIS)).toBe("needs_input");
    expect(reached).toEqual(["change_setting"]);
    expect(await changeRecords()).toBe(records + 1);
  });

  for (const [name, initiator] of [
    ["a routine", ROUTINE],
    ["an event trigger", TRIGGER],
    ["a check-in", checkInInitiator("run-sna-hop")],
  ] as const)
    test(`a hop made from ${name} is refused in both legs, and the relay opens no card either`, async () => {
      const { relay, forward } = await hopFrom(initiator);
      const records = await changeRecords();
      for (const [entry, botId] of [
        [forward, OTTO],
        [relay, IRIS],
      ] as const) {
        expect(chainOf(entry)).toMatchObject({
          kind: "handoff",
          origin: initiator,
        });
        const result = await inHop(entry, botId);
        expect(result).toBeInstanceOf(PluginRefusedError);
        expect((result as Error).message).toBe(NOT_IN_A_CONVERSATION);
        const line = (await refusalsFor(botId)).pop();
        expect(line?.payload).toMatchObject({ why: "not_the_persons_run" });
      }
      await expectNothingHappened(IRIS, records);
      expect(await notifyOf(OTTO)).toBe("all");
    });

  test("the relay of a hop two deep is refused: nothing says that conversation is the person's", async () => {
    const first = await hopFrom(PERSON);
    // Otto, in the hop Iris made, asks Gus: the asking run is Otto's, as the deployment signed it.
    const ottoRun = readRunAssertion(first.forward.assertion, ENCRYPTION_KEY);
    expect(ottoRun).not.toBeNull();
    seen.length = 0;
    const tool = handoffTool({
      desk,
      from: ottoRun as NonNullable<typeof ottoRun>,
      hasSomebodyToAsk: true,
      maxDepth: 2,
      maxPerRun: 3,
    });
    const said = await tool?.execute({
      bot: NAMES.get(GUS) ?? GUS,
      task: "and when did it end",
    });
    expect(said).toContain(NAMES.get(GUS) ?? GUS);
    await sweep();
    await sweep();
    const relay = seen.find((entry) => entry.botId === OTTO);
    expect(relay).toBeDefined();
    const deep = relay as Seen;
    expect(readRunAssertion(deep.assertion, ENCRYPTION_KEY)).toMatchObject({
      depth: 2,
    });

    const records = await changeRecords();
    const result = await inHop(deep, OTTO);
    expect(result).toBeInstanceOf(PluginRefusedError);
    expect((result as Error).message).toBe(NOT_IN_A_CONVERSATION);
    await expectNothingHappened(OTTO, records);
    const line = (await refusalsFor(OTTO)).pop();
    expect(line?.payload).toMatchObject({ why: "untraced_hop" });
  });

  test("a relay whose signed run does not read is refused: forged, from another deployment, or missing", async () => {
    const { asking, relay } = await hopFrom(PERSON);
    const records = await changeRecords();
    const chain = handoffInitiator(relay.work.fromBotId, relay.work.initiator);
    const other = signHandoffDeliveryRun(
      relay.work,
      "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
      undefined,
      { key: "k", owner: "o" },
    );
    for (const openbotRun of [other, "not-a-token", undefined]) {
      const result = await inTurn(
        {
          ...fresh({ threadId: asking }),
          initiator: chain,
          forwardedProps: openbotRun ? { openbotRun } : {},
        },
        () => change(IRIS, chain),
      ).catch((error: unknown) => error);
      expect(result).toBeInstanceOf(PluginRefusedError);
      expect((result as Error).message).toBe(NOT_IN_A_CONVERSATION);
    }
    await expectNothingHappened(IRIS, records);
  });

  test("a relay run for another Bot than the one calling, or another person, is refused", async () => {
    const { asking, relay } = await hopFrom(PERSON);
    const records = await changeRecords();
    const chain = handoffInitiator(relay.work.fromBotId, relay.work.initiator);
    // Gus calls with Iris's relay run in its hands: the run was signed for Iris.
    const result = await inTurn(
      {
        ...fresh({ threadId: asking }),
        initiator: chain,
        forwardedProps: { openbotRun: relay.assertion },
      },
      () => change(GUS, chain),
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(PluginRefusedError);
    expect((result as Error).message).toBe(NOT_IN_A_CONVERSATION);
    await expectNothingHappened(GUS, records);
  });
});

describe("through the real signed-callback route, the door a Bot that runs its own loop uses", () => {
  const TOKEN = `never-unattended-${suite}`;
  const parameters: Parameters<typeof createApp> = [
    loadConfig(
      testEnvironment({
        AGENT_TOOL_TOKEN: TOKEN,
        KEY_ENCRYPTION_KEY: ENCRYPTION_KEY,
      }),
    ),
  ];
  // The trail and the plugin store, the two the route reads: the same ones every other test here uses.
  parameters[12] = audit;
  parameters[14] = store;
  const app = createApp(...parameters);

  /** What a framework Bot's model is handed back when it calls the Settings tool from its own loop. */
  async function call(initiator: AuditInitiator) {
    const response = await app.request("/api/agent-tools/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openbot-agent-token": TOKEN,
      },
      body: JSON.stringify({
        name: `mcp__${SETTINGS}__change_setting`,
        args: ARGS,
        run: mintRunAssertion(
          {
            botId: IRIS,
            actorId: owner,
            threadId: `thread-${randomUUID()}`,
            runId: randomUUID(),
            depth: 0,
            initiator,
          },
          ENCRYPTION_KEY,
        ),
      }),
    });
    return {
      status: response.status,
      body: (await response.json()) as { text: string; isError: boolean },
    };
  }

  for (const [name, initiator] of [
    ["the person", PERSON],
    ["a routine", ROUTINE],
    ["an event trigger", TRIGGER],
    ["a hop made from the person's own turn", handoffInitiator(OTTO, PERSON)],
    ["a hop made from a routine", handoffInitiator(OTTO, ROUTINE)],
  ] as const)
    test(`a settings change called as ${name} is refused in the one sentence, with no card and nothing changed`, async () => {
      const records = await changeRecords();
      const before = (await refusalsFor(IRIS)).length;
      const answer = await call(initiator);
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({
        text: `${REFUSAL_MARKER} ${NOT_IN_A_CONVERSATION}`,
        isError: true,
      });
      await expectNothingHappened(IRIS, records);
      expect(await refusalsFor(IRIS)).toHaveLength(before + 1);
    });
});

describe("what is offered, and what is not (documents the finding; update it if the offer is narrowed later)", () => {
  const offered = async (initiator?: AuditInitiator) => {
    const load = () =>
      grantedTools({
        store,
        botId: IRIS,
        actorId: owner,
        ...(initiator ? { initiator } : {}),
      });
    const tools = await restrictToolsForRun(
      initiator,
      load,
      async () => new Set<string>(),
    )();
    return tools.some((tool) => isChangeSetting(tool.name));
  };

  test("a check-in and research are not offered the tool, a routine, a trigger and a hop are: so the call is what refuses", async () => {
    expect(await offered(checkInInitiator("run-offer"))).toBe(false);
    expect(await offered(proactiveInitiator("run-offer"))).toBe(false);
    for (const initiator of [
      undefined,
      PERSON,
      ROUTINE,
      TRIGGER,
      handoffInitiator(IRIS, PERSON),
      handoffInitiator(IRIS, ROUTINE),
    ])
      expect(await offered(initiator)).toBe(true);
  });
});

describe("every setting on the list is covered, now and later", () => {
  test("a setting added to the list is refused in a routine and asked in the person's turn, without being named", async () => {
    const names = CHAT_SETTING_NAMES as unknown as string[];
    const listed = [...names];
    names.push("future_setting");
    const seenByService: string[] = [];
    useSettingsTools({
      async change(input: Parameters<SettingChanges["change"]>[0]) {
        seenByService.push(input.setting);
        return {
          status: "changed",
          changeId: `change-${randomUUID()}`,
          agentId: input.agentId,
          setting: input.setting,
          previousValue: "all",
          newValue: input.value,
        };
      },
    } as unknown as SettingChanges);
    try {
      const args = { setting: "future_setting", value: "all" };
      const routine = await inTurn(fresh({ initiator: ROUTINE }), () =>
        change(IRIS, ROUTINE, args),
      ).catch((error: unknown) => error);
      expect(routine).toBeInstanceOf(PluginRefusedError);
      expect((routine as Error).message).toBe(NOT_IN_A_CONVERSATION);
      expect(await pending()).toEqual([]);
      expect(seenByService).toEqual([]);
      expect(reached).toEqual([]);

      const turn = fresh({ messages: [typed("do the future thing")], args });
      const held = await inTurn(turn, () => change(IRIS, PERSON, args)).catch(
        (error: unknown) => error,
      );
      expect(held).toBeInstanceOf(HeadlessToolSuspension);
      const [asked] = await pending();
      const heard = await answerAllowOnce(asked?.id as string);
      expectCarriedOut(heard);
      expect(seenByService).toEqual(["future_setting"]);
    } finally {
      names.pop();
      useSettingsTools(changes);
    }
    // The list is back as it was: a test that widened it must not leave it widened.
    expect([...(CHAT_SETTING_NAMES as readonly string[])]).toEqual(listed);
  });

  test("a member's name (docs/design/settings-in-chat.md, 8.10): refused in a routine, asked in the person's turn", async () => {
    const args = { setting: "name", member: "Otto", value: "Max" };
    const routine = await inTurn(fresh({ initiator: ROUTINE }), () =>
      change(IRIS, ROUTINE, args),
    ).catch((error: unknown) => error);
    expect(routine).toBeInstanceOf(PluginRefusedError);
    expect((routine as Error).message).toBe(NOT_IN_A_CONVERSATION);
    expect(await pending()).toEqual([]);

    const turn = fresh({ messages: [typed("call Otto Max")], args });
    const held = await inTurn(turn, () => change(IRIS, PERSON, args)).catch(
      (error: unknown) => error,
    );
    expect(held).toBeInstanceOf(HeadlessToolSuspension);
    expect(await pending()).toHaveLength(1);
  });

  test("the refusal does not read the arguments: a name nobody listed gets the same sentence in a routine", async () => {
    const args = { setting: "full_access", value: "on" };
    const routine = await inTurn(fresh({ initiator: ROUTINE }), () =>
      change(IRIS, ROUTINE, args),
    ).catch((error: unknown) => error);
    expect((routine as Error).message).toBe(NOT_IN_A_CONVERSATION);
    expect(await pending()).toEqual([]);
  });
});

describe("a card a routine opened before this existed", () => {
  test("allowing it now carries nothing out: the real re-check refuses it, the Bot is told in the same sentence, and nothing changes", async () => {
    const records = await changeRecords();
    // The card as the gate opened it before: a routine's settings change, asked and waiting.
    const messages = [typed("every morning at nine")];
    const turn = fresh({ messages, initiator: ROUTINE });
    const continuation: ApprovalContinuation = {
      runId: turn.runId,
      threadId: turn.threadId,
      toolCallId: turn.toolCallId,
      toolName: CHANGE_SETTING_TOOL,
      args: ARGS,
      messages,
      state: {},
      context: [],
      forwardedProps: {},
      initiator: ROUTINE,
    };
    const held = await service
      .gate({
        actorId: owner,
        botId: IRIS,
        toolRef: REF,
        effect: "write",
        scope: SETTINGS,
        args: ARGS,
        target: {
          serverId: SETTINGS,
          toolName: "change_setting",
          url: "builtin://settings",
          effect: "write",
        },
        continuation,
        initiator: ROUTINE,
        changesSetting: true,
      })
      .catch((error: unknown) => error);
    expect(held).toBeInstanceOf(HeadlessToolSuspension);
    const [asked] = await pending();
    expect(asked?.action.policy).toMatchObject({ source: "always_ask" });

    // The person allows it, after the deployment was updated. The real resume re-checks it first.
    const heard = await answerAllowOnce(asked?.id as string);
    expect(heard?.error).toBe(
      `Not done: ${NOT_IN_A_CONVERSATION} Ask the person again if it is still needed.`,
    );
    expect(reached).toEqual([]);
    expect(await notifyOf(IRIS)).toBe("all");
    expect(await changeRecords()).toBe(records);
  });
});

async function clearWork() {
  await database
    .delete(workItems)
    .where(sql`${workItems.payload}->>'actorId' = ${owner}`);
}
