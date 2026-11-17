/**
 * D81 (docs/M1_PLAN.md section 60), against PostgreSQL and through the REAL approval gate: Iris holds the
 * Routines connector by default, once; a removal or a trim by hand stays; nothing else changes.
 *
 * The marker is one global row of `enterprise_settings`, so this file clears it before each case and puts back
 * what was there before it ran.
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
import type { Message } from "@ag-ui/client";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray } from "drizzle-orm";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type AuditInitiator,
  createAuditStore,
  REMOTE_INITIATOR,
} from "../src/audit";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agents,
  approvalPreferences,
  approvalRequests,
  approvalRules,
  auditEvents,
  deploymentPackages,
  enterpriseSettings,
  mcpServers,
  pluginGrants,
  users,
} from "../src/db/schema";
import { workItems } from "../src/db/schema/work";
import { createFullAccess } from "../src/freeduet/full-access";
import { FREEDUET_TENANT_ID } from "../src/freeduet/hub-grants";
import {
  applyIrisRoutines,
  IRIS_ROUTINES_KEY,
  seedIrisRoutines,
} from "../src/freeduet/iris-routines";
import {
  callTool as callRoutinesTransport,
  useRoutineTools,
} from "../src/plugins/builtin-routines";
import { AUTOMATIC_GRANT } from "../src/plugins/plugin-store/automatic";
import { createPluginStore } from "../src/plugins/store";
import { useTriggerTools } from "../src/responsibilities/trigger-tools";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const audit = createAuditStore(database);
const suite = randomUUID().slice(0, 8);
const IRIS = `ir-iris-${suite}`;
const OTTO = `ir-otto-${suite}`;
const HAND = `ir-hand-${suite}`;
const USER_MADE = `ir-user-${suite}`;
const owner = `user_ir_${suite}`;
const BOTS = [IRIS, OTTO, HAND, USER_MADE];
const ROUTINES = "routines";
const WRITES = [
  "create_routine",
  "update_routine",
  "delete_routine",
  "create_trigger",
  "pause_trigger",
  "resume_trigger",
  "delete_trigger",
];
const READS = ["list_routines", "list_triggers"];
const ALL = [...READS, ...WRITES].map((tool) => `${ROUTINES}/${tool}`).sort();
const ARGS: Record<string, Record<string, unknown>> = {
  create_routine: { instruction: "Check the inbox.", cron: "0 9 * * 1-5" },
  update_routine: { id: "routine_1", enabled: false },
  delete_routine: { id: "routine_1" },
  create_trigger: { responsibilityId: "goal-1", kind: "webhook" },
  pause_trigger: { id: "5b0f5a36-8f3e-4b0e-9f53-0a4c1d1e2f30" },
  resume_trigger: { id: "5b0f5a36-8f3e-4b0e-9f53-0a4c1d1e2f30" },
  delete_trigger: { id: "5b0f5a36-8f3e-4b0e-9f53-0a4c1d1e2f30" },
};

let madePackage: string | null = null;
let routinesExisted = false;
let markerBefore: unknown;
const reached: string[] = [];
const policy = { mode: "enforce" as const, deny: [], allow: ["true"] };
const approvals = createApprovalStore(database);
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  audit,
});
const service = createApprovalService(approvals, undefined, undefined, {
  fullAccess,
  // The deployment's own model says "proceed", as in the D35 test: a write that gets through has no excuse.
  review: async () =>
    JSON.stringify({
      verdict: "proceed",
      preApproved: true,
      safety: "none",
      reason: "Test reviewer.",
    }),
});
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: audit,
  credentials: createCredentialStore(database),
  encryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  policy: () => policy,
  approvalGate: (candidate) => service.gate(candidate),
  callVendor: (connection, toolName, args) => {
    reached.push(toolName);
    return callRoutinesTransport(connection, toolName, args);
  },
});

const held = async (agentId: string) => {
  const rows = await database
    .select({ ref: pluginGrants.ref, by: pluginGrants.grantedBy })
    .from(pluginGrants)
    .where(eq(pluginGrants.agentId, agentId));
  return new Map(rows.map((row) => [row.ref, row.by]));
};
const marker = async () =>
  (
    await database
      .select()
      .from(enterpriseSettings)
      .where(eq(enterpriseSettings.key, IRIS_ROUTINES_KEY))
  )[0];

beforeAll(async () => {
  const [existing] = await database
    .select({ id: deploymentPackages.id })
    .from(deploymentPackages)
    .where(eq(deploymentPackages.tenantId, FREEDUET_TENANT_ID));
  let packageId = existing?.id;
  if (!packageId) {
    const [made] = await database
      .insert(deploymentPackages)
      .values({ tenantId: FREEDUET_TENANT_ID, sourcePath: "x", checksum: "x" })
      .returning({ id: deploymentPackages.id });
    packageId = made?.id;
    madePackage = packageId ?? null;
  }
  for (const id of [IRIS, OTTO, HAND])
    await database.insert(agents).values({
      id,
      name: id,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
      packageId,
    });
  await database.insert(agents).values({
    id: USER_MADE,
    name: USER_MADE,
    type: "built_in",
    configuration: { systemPrompt: "Help." },
  });
  await database.insert(users).values({
    id: owner,
    email: `${owner}@ir.test`,
    name: owner,
    emailVerified: false,
  });
  markerBefore = (await marker())?.value;
  const [row] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, ROUTINES));
  if (row) routinesExisted = true;
  await store.addServer({ key: ROUTINES, by: owner });
  useRoutineTools({
    async create() {
      return {} as never;
    },
    async listFor() {
      return [];
    },
    async update() {
      return {} as never;
    },
    async remove() {},
  });
  useTriggerTools({
    publicUrl: "https://openbot.example.test",
    emailDomain: null,
    responsibilities: {
      async get(_owner, id) {
        return { id, agentId: IRIS, title: "Triage" } as never;
      },
    },
    triggers: {
      async create() {
        return { trigger: {} as never, secret: "never-shown" };
      },
      async listForAgent() {
        return [];
      },
      async setEnabled() {
        return {} as never;
      },
      async remove() {},
    },
  });
  await service.setPreferences(owner, { enabled: false, autoReview: true });
});

beforeEach(async () => {
  await database
    .delete(enterpriseSettings)
    .where(eq(enterpriseSettings.key, IRIS_ROUTINES_KEY));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, BOTS));
  reached.length = 0;
});

afterAll(async () => {
  useRoutineTools(null);
  useTriggerTools(null);
  await database.delete(workItems).where(
    and(
      eq(workItems.kind, "approval.resume"),
      inArray(
        workItems.key,
        (await approvals.list(owner)).map((request) => request.id),
      ),
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
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, BOTS));
  await database
    .delete(enterpriseSettings)
    .where(eq(enterpriseSettings.key, IRIS_ROUTINES_KEY));
  if (markerBefore !== undefined)
    await database
      .insert(enterpriseSettings)
      .values({ key: IRIS_ROUTINES_KEY, value: markerBefore as never });
  if (!routinesExisted)
    await database.delete(mcpServers).where(eq(mcpServers.id, ROUTINES));
  await database.delete(agents).where(inArray(agents.id, BOTS));
  if (madePackage)
    await database
      .delete(deploymentPackages)
      .where(eq(deploymentPackages.id, madePackage));
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

describe("the first start grants Routines to Iris, once", () => {
  test("Iris gets the two reads and the seven writes, marked automatic, and the marker is written with them", async () => {
    const outcome = await seedIrisRoutines(database, audit, IRIS);
    expect(outcome.status).toBe("granted");
    const rows = await held(IRIS);
    expect([...rows.keys()].sort()).toEqual(ALL);
    expect([...new Set(rows.values())]).toEqual([AUTOMATIC_GRANT]);
    expect((await marker())?.value).toMatchObject({
      value: { version: 1, outcome: "granted" },
    });
    const events = await database
      .select({ payload: auditEvents.payload })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "configuration.changed"),
          inArray(auditEvents.targetId, ALL),
        ),
      );
    expect(
      events.filter(
        (event) =>
          (event.payload as { reason?: string }).reason ===
            "iris_routines_default" &&
          (event.payload as { bot?: string }).bot === IRIS,
      ),
    ).toHaveLength(9);
  });

  test("no other member and no Bot a person made is given anything", async () => {
    await seedIrisRoutines(database, audit, IRIS);
    expect((await held(OTTO)).size).toBe(0);
    expect((await held(HAND)).size).toBe(0);
    expect((await held(USER_MADE)).size).toBe(0);
  });

  test("a Bot that is not a member of FreeDuet's package is refused, and no marker is written", async () => {
    expect((await seedIrisRoutines(database, audit, USER_MADE)).status).toBe(
      "not-applicable",
    );
    expect(await marker()).toBeUndefined();
    expect((await held(USER_MADE)).size).toBe(0);
  });

  test("the plugin store offers Iris the tools with no manual grant, and Otto none", async () => {
    await seedIrisRoutines(database, audit, IRIS);
    const offeredIris = (await store.listForAgent(IRIS)).tools.map(
      (tool) => tool.ref,
    );
    expect(offeredIris).toContain(`${ROUTINES}/create_routine`);
    expect(offeredIris).toContain(`${ROUTINES}/list_routines`);
    expect((await store.listForAgent(OTTO)).tools).toEqual([]);
  });
});

describe("a removal or a trim by hand stays", () => {
  test("a second start adds nothing", async () => {
    await seedIrisRoutines(database, audit, IRIS);
    expect((await seedIrisRoutines(database, audit, IRIS)).status).toBe(
      "already-decided",
    );
    expect((await held(IRIS)).size).toBe(9);
  });

  test("an administrator who removed the whole connector does not get it back at the next start", async () => {
    await seedIrisRoutines(database, audit, IRIS);
    for (const ref of ALL)
      await store.revoke("mcp", ref, IRIS, "admin@example.com");
    expect((await held(IRIS)).size).toBe(0);
    expect((await seedIrisRoutines(database, audit, IRIS)).status).toBe(
      "already-decided",
    );
    expect((await held(IRIS)).size).toBe(0);
  });

  test("one tool taken away by hand is not given back", async () => {
    await seedIrisRoutines(database, audit, IRIS);
    await store.revoke(
      "mcp",
      `${ROUTINES}/create_trigger`,
      IRIS,
      "admin@example.com",
    );
    await seedIrisRoutines(database, audit, IRIS);
    expect((await held(IRIS)).has(`${ROUTINES}/create_trigger`)).toBe(false);
    expect((await held(IRIS)).size).toBe(8);
  });
});

describe("what was already there is never widened", () => {
  test("a Routines grant made by hand is left exactly as it is, and the marker is still written", async () => {
    await database.insert(pluginGrants).values({
      kind: "mcp",
      ref: `${ROUTINES}/list_routines`,
      agentId: IRIS,
      grantedBy: "admin@example.com",
    });
    const outcome = await seedIrisRoutines(database, audit, IRIS);
    expect(outcome.status).toBe("left-as-is");
    expect([...(await held(IRIS))]).toEqual([
      [`${ROUTINES}/list_routines`, "admin@example.com"],
    ]);
    expect((await marker())?.value).toMatchObject({
      value: { outcome: "left-as-is" },
    });
    expect((await seedIrisRoutines(database, audit, IRIS)).status).toBe(
      "already-decided",
    );
    expect((await held(IRIS)).size).toBe(1);
  });
});

describe("only FreeDuet's package, and only with an Iris", () => {
  const member = (id: string) => ({ id });
  test("a package without Iris grants nothing and writes no marker", async () => {
    const outcome = await applyIrisRoutines(database, audit, {
      tenantId: FREEDUET_TENANT_ID,
      agents: [member(OTTO)],
    });
    expect(outcome.status).toBe("not-applicable");
    expect(await marker()).toBeUndefined();
    expect((await held(OTTO)).size).toBe(0);
  });

  test("another package (upstream's example) grants nothing and writes no marker", async () => {
    const outcome = await applyIrisRoutines(database, audit, {
      tenantId: "fintech",
      agents: [member("fintech")],
    });
    expect(outcome.status).toBe("not-applicable");
    expect(await marker()).toBeUndefined();
  });
});

describe("two servers starting together", () => {
  test("make one grant and one marker", async () => {
    const outcomes = await Promise.all([
      seedIrisRoutines(database, audit, IRIS),
      seedIrisRoutines(database, audit, IRIS),
      seedIrisRoutines(database, audit, IRIS),
    ]);
    expect(outcomes.filter((o) => o.status === "granted")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "already-decided")).toHaveLength(
      2,
    );
    expect((await held(IRIS)).size).toBe(9);
    const rows = await database
      .select()
      .from(enterpriseSettings)
      .where(eq(enterpriseSettings.key, IRIS_ROUTINES_KEY));
    expect(rows).toHaveLength(1);
  });
});

describe("the always-ask card is unchanged, through the real gate", () => {
  const typed = (content: string): Message => ({
    id: `msg-${randomUUID()}`,
    role: "user",
    content,
  });
  const inTurn = <T>(
    initiator: AuditInitiator | undefined,
    run: () => Promise<T>,
  ) => {
    const context: ApprovalContinuation = {
      runId: randomUUID(),
      threadId: `thread-${randomUUID()}`,
      toolCallId: randomUUID(),
      toolName: "tool",
      args: {},
      messages: [typed("set this up")],
      state: {},
      context: [],
      forwardedProps: {},
      ...(initiator ? { initiator } : {}),
    };
    return withApprovalContext(context, run);
  };
  const call = (tool: string) =>
    store.callTool({
      ref: `${ROUTINES}/${tool}`,
      args: ARGS[tool] ?? {},
      botId: IRIS,
      actorId: owner,
    });
  const pending = async () =>
    (await approvals.list(owner)).filter((r) => r.status === "pending");
  const clear = async () => {
    for (const request of await pending())
      await approvals.decide(owner, request.id, "deny");
  };

  const initiators: [string, AuditInitiator | undefined][] = [
    ["the person's own live turn", undefined],
    ["a routine's turn", { kind: "routine", id: "routine-ir-1" }],
    ["a check-in's turn", { kind: "responsibility", id: "goal-ir-1" }],
    ["a remote session's turn", REMOTE_INITIATOR],
  ];

  for (const [mode, setup] of [
    ["Full access", async () => fullAccess.set(owner, IRIS, true)],
    [
      "a saved Always allow for every Routines tool",
      async () => {
        await fullAccess.set(owner, IRIS, false);
        await service.createRule(owner, {
          botId: "*",
          toolRef: "routines/*",
          effect: "*",
          scope: "*",
          behaviour: "allow",
        });
      },
    ],
  ] as const)
    for (const [who, initiator] of initiators)
      test(`Iris, granted by default, with ${mode}, in ${who}: each of the seven writes is held and reaches nothing`, async () => {
        await seedIrisRoutines(database, audit, IRIS);
        await setup();
        for (const tool of WRITES) {
          const outcome = await inTurn(initiator, () => call(tool)).catch(
            (error: unknown) => error,
          );
          expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
        }
        expect(reached).toEqual([]);
        expect(
          (await pending()).map((request) => request.action.toolRef).sort(),
        ).toEqual(WRITES.map((tool) => `${ROUTINES}/${tool}`).sort());
        await clear();
        await database
          .update(approvalRules)
          .set({ revokedAt: new Date() })
          .where(eq(approvalRules.ownerUserId, owner));
        await fullAccess.set(owner, IRIS, false);
      });

  test("the two reads go through with no card (what they reveal is in docs/M1_PLAN.md section 60)", async () => {
    await seedIrisRoutines(database, audit, IRIS);
    for (const tool of READS) {
      const result = await inTurn(undefined, () => call(tool));
      expect(result.isError).toBe(false);
    }
    expect(reached).toEqual(READS);
    expect(await pending()).toEqual([]);
  });

  test("a member that holds no grant cannot call the tool at all", async () => {
    const result = await inTurn(undefined, () =>
      store.callTool({
        ref: `${ROUTINES}/create_routine`,
        args: ARGS.create_routine ?? {},
        botId: OTTO,
        actorId: owner,
      }),
    ).catch((error: unknown) => error);
    expect(result instanceof HeadlessToolSuspension).toBe(false);
    expect(reached).toEqual([]);
  });
});
