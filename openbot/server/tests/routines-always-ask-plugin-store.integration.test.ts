import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
  type ApprovalCandidate,
  ApprovalRefusedError,
} from "../src/approvals/types";
import { type AuditInitiator, createAuditStore } from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  approvalPreferences,
  approvalRequests,
  approvalRules,
  credentials,
  mcpServers,
  mcpUserCredentials,
  pluginGrants,
  users,
} from "../src/db/schema";
import { workItems } from "../src/db/schema/work";
import { createFullAccess, withFullAccess } from "../src/freeduet/full-access";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import {
  callTool as callRoutinesTransport,
  useRoutineTools,
} from "../src/plugins/builtin-routines";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import { createPluginStore } from "../src/plugins/store";
import {
  createPrivateShareCheck,
  PRIVATE_SHARE_TOOL_REF,
  type PrivateShareVerdict,
} from "../src/proactive/private-share";
import { useTriggerTools } from "../src/responsibilities/trigger-tools";
import type { Routine } from "../src/routines/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { FakeGmail } from "./support/fake-imap";

/**
 * D35 (docs/M1_PLAN.md section 18), through the REAL plugin store: the Routines connector, the app
 * password mailbox, the real approval service with Full access on, and the real send check. What the
 * gate-level file (`routines-always-ask.integration.test.ts`) takes as given is proved here: that the
 * plugin store passes the facts the rule needs (the signed run's initiator, and that a write is on the
 * Routines connector) and that a call held for a card never reaches the vendor behind it.
 *
 * "The vendor" is `reached`: the one function every call that gets past the gates goes through, and
 * behind it the real Routines transport (over recording stores) and the real mailbox transport (over a
 * fake mailbox). Findings (a) and (b) are named as in the gate-level file.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_ra_ps_${suite}`;
const FULL = `agent_ra_full_${suite}`;
const NO_PAYMENTS = `agent_ra_nopay_${suite}`;
const PLAIN = `agent_ra_plain_${suite}`;
const bots = [FULL, NO_PAYMENTS, PLAIN];
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const ROUTINES = "routines";

const ROUTINE_TOOLS = [
  "create_routine",
  "list_routines",
  "update_routine",
  "delete_routine",
  "create_trigger",
  "list_triggers",
  "pause_trigger",
  "resume_trigger",
  "delete_trigger",
];

const ROUTINE: Routine = {
  id: "routine_1",
  ownerUserId: owner,
  agentId: PLAIN,
  channelId: "channel_1",
  instruction: "Check the shared inbox.",
  cron: "0 9 * * 1-5",
  timezone: "Europe/Madrid",
  enabled: true,
  nextRunAt: new Date("2026-01-05T08:00:00.000Z"),
  lastRunAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const TRIGGER_ID = "5b0f5a36-8f3e-4b0e-9f53-0a4c1d1e2f30";

/** What reached the stores behind the Routines connector, by name. */
const storeCalls: string[] = [];
/** Every call that got past every gate and reached a transport, by tool name. */
const reached: string[] = [];

const approvals = createApprovalStore(database);
const audit = createAuditStore(database);
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  audit,
});
const service = createApprovalService(approvals, undefined, undefined, {
  fullAccess,
  // The deployment's own model says "proceed" about an unremarkable write: that is what let a
  // routine's write through, so it is what this reviewer says.
  review: async () =>
    JSON.stringify({
      verdict: "proceed",
      preApproved: true,
      safety: "none",
      reason: "Test reviewer.",
    }),
});
const gmail = new FakeGmail();
const imapTransport = createGoogleImapTransport({
  imap: gmail.imap,
  smtp: gmail.smtp,
  fetch: async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
  now: () => new Date("2026-10-22T20:00:00Z"),
});
const baseOptions = {
  brokerProvider: "composio" as const,
  database,
  auditStore: audit,
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  verifyUserSecret: async () => ({ ok: true as const, calendar: false }),
};
const store = createPluginStore({
  ...baseOptions,
  approvalGate: (candidate) => service.gate(candidate),
  privateShareCheck: withFullAccess(
    createPrivateShareCheck({ approvals }),
    fullAccess,
  ),
  callVendor: (connection, toolName, args) => {
    reached.push(toolName);
    return connection.url.startsWith("builtin://")
      ? callRoutinesTransport(connection, toolName, args)
      : imapTransport.callTool(connection, toolName, args);
  },
});

const PERSON: AuditInitiator = { kind: "person" };
const ROUTINE_RUN: AuditInitiator = { kind: "routine", id: "routine-ps-1" };
const TRIGGER_RUN: AuditInitiator = { kind: "responsibility", id: "goal-1" };

const typed = (content: string): Message => ({
  id: `msg-${randomUUID()}`,
  role: "user",
  content,
});

type Turn = {
  messages?: Message[];
  /** The initiator the run carries. Absent is the person's own live chat turn. */
  initiator?: AuditInitiator;
  threadId?: string;
  runId?: string;
  toolCallId?: string;
};

/** A call inside a run that can wait for the person, as a Bot's turn makes it. */
function inTurn<T>(turn: Turn, run: () => Promise<T>) {
  const context: ApprovalContinuation = {
    runId: turn.runId ?? randomUUID(),
    threadId: turn.threadId ?? `thread-${randomUUID()}`,
    toolCallId: turn.toolCallId ?? randomUUID(),
    toolName: "tool",
    args: {},
    messages: turn.messages ?? [],
    state: {},
    context: [],
    forwardedProps: {},
    ...(turn.initiator ? { initiator: turn.initiator } : {}),
  };
  return withApprovalContext(context, run);
}
/** The same run again, as the continuation after an answer makes it: same run, same tool call. */
const again = (
  turn: Required<Pick<Turn, "runId" | "toolCallId" | "threadId">> & Turn,
) => turn;

const call = (
  botId: string,
  tool: string,
  args: Record<string, unknown>,
  initiator?: AuditInitiator,
) =>
  store.callTool({
    ref: `${ROUTINES}/${tool}`,
    args,
    botId,
    actorId: owner,
    // The way the in-process door passes it: the run's own initiator, and none for the person's turn.
    ...(initiator ? { initiator } : {}),
  });

const pending = async () =>
  (await approvals.list(owner)).filter(
    (request) => request.status === "pending",
  );
async function clearPending() {
  for (const request of await pending())
    await approvals.decide(owner, request.id, "deny");
}
const reset = async () => {
  reached.length = 0;
  storeCalls.length = 0;
  gmail.sent.length = 0;
  await clearPending();
};

const ARGS: Record<string, Record<string, unknown>> = {
  create_routine: {
    instruction: "Check the shared inbox.",
    cron: "0 9 * * 1-5",
  },
  update_routine: { id: ROUTINE.id, enabled: false },
  delete_routine: { id: ROUTINE.id },
  create_trigger: { responsibilityId: "goal-1", kind: "webhook" },
  pause_trigger: { id: TRIGGER_ID },
  resume_trigger: { id: TRIGGER_ID },
  delete_trigger: { id: TRIGGER_ID },
};

let routinesExisted = false;
let mailboxExisted = false;

beforeAll(async () => {
  await database.insert(users).values({
    id: owner,
    email: `${owner}@ra-ps.test`,
    name: owner,
    emailVerified: false,
  });
  for (const id of bots) {
    await database.insert(agents).values({
      id,
      name: id,
      type: "remote_ag_ui",
      configuration: {},
    });
    await database.insert(agentProfiles).values({
      agentId: id,
      ownerUserId: owner,
      title: "",
      roleDescription: "",
      avatarSeed: id,
      visibility: "private",
    });
  }
  for (const [key, existed] of [
    [ROUTINES, () => (routinesExisted = true)],
    [GOOGLE_APP_PASSWORD, () => (mailboxExisted = true)],
  ] as const) {
    const [row] = await database
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.id, key));
    if (row) existed();
    await store.addServer({ key, by: owner });
  }
  await store.connectUserSecret({
    serverId: GOOGLE_APP_PASSWORD,
    userId: owner,
    body: { address: "maya@example.com", appPassword: "qwertyuiopasdfgh" },
  });
  for (const botId of bots) {
    for (const tool of ROUTINE_TOOLS)
      await store.grant("mcp", `${ROUTINES}/${tool}`, botId, owner);
    for (const tool of ["gmail_send_message", "gmail_send_reply"])
      await store.grant("mcp", `${GOOGLE_APP_PASSWORD}/${tool}`, botId, owner);
  }
  await fullAccess.set(owner, FULL, true);
  await fullAccess.set(owner, NO_PAYMENTS, true, "no_payments");
  // The default settings: auto-review on, "ask before making changes" off.
  await service.setPreferences(owner, { enabled: false, autoReview: true });

  useRoutineTools({
    async create() {
      storeCalls.push("create");
      return ROUTINE;
    },
    async listFor() {
      storeCalls.push("listFor");
      return [];
    },
    async update() {
      storeCalls.push("update");
      return ROUTINE;
    },
    async remove() {
      storeCalls.push("remove");
    },
  });
  const record = {
    id: TRIGGER_ID,
    responsibilityId: "goal-1",
    kind: "webhook" as const,
    config: { kind: "webhook" as const, filter: { eventTypes: [] } },
    hasSecret: true,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  useTriggerTools({
    publicUrl: "https://openbot.example.test",
    emailDomain: null,
    responsibilities: {
      async get(_owner, id) {
        return { id, agentId: PLAIN, title: "Triage" } as never;
      },
    },
    triggers: {
      async create() {
        storeCalls.push("createTrigger");
        return { trigger: record, secret: "never-shown" };
      },
      async listForAgent() {
        storeCalls.push("listTriggers");
        return [];
      },
      async setEnabled(_owner, _id, enabled) {
        storeCalls.push(enabled ? "resumeTrigger" : "pauseTrigger");
        return { ...record, enabled };
      },
      async remove() {
        storeCalls.push("removeTrigger");
      },
    },
  });
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
    .where(inArray(pluginGrants.agentId, bots));
  await database
    .delete(mcpUserCredentials)
    .where(eq(mcpUserCredentials.userId, owner));
  await database
    .delete(credentials)
    .where(
      and(
        eq(credentials.keyId, owner),
        eq(credentials.provider, GOOGLE_APP_PASSWORD),
      ),
    );
  if (!routinesExisted)
    await database.delete(mcpServers).where(eq(mcpServers.id, ROUTINES));
  if (!mailboxExisted)
    await database
      .delete(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  await database
    .delete(agentProfiles)
    .where(inArray(agentProfiles.agentId, bots));
  await database.delete(agents).where(inArray(agents.id, bots));
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

describe("(b) setting up, changing or deleting a routine or a trigger waits for a card, with Full access on or off", () => {
  for (const [setting, botId] of [
    ["Full access", FULL],
    ["Full access without payments", NO_PAYMENTS],
    ["no Full access", PLAIN],
  ] as const)
    test(`create_routine in the person's own turn, with ${setting}: nothing is created until they allow it, and then once`, async () => {
      await reset();
      const turn = {
        messages: [typed("Check the shared inbox every weekday at nine")],
        threadId: `thread-${randomUUID()}`,
        runId: randomUUID(),
        toolCallId: randomUUID(),
      };
      const held = await inTurn(turn, () =>
        call(botId, "create_routine", ARGS.create_routine ?? {}),
      ).catch((error: unknown) => error);
      expect(held).toBeInstanceOf(HeadlessToolSuspension);
      expect(reached).toEqual([]);
      expect(storeCalls).toEqual([]);
      const asked = await pending();
      expect(asked).toHaveLength(1);
      expect(asked[0]?.action.toolRef).toBe(`${ROUTINES}/create_routine`);
      expect(asked[0]?.action.policy).toMatchObject({
        behaviour: "ask",
        source: "always_ask",
      });
      // "Always allow" is refused for it, so nothing is remembered for the next time.
      await expect(
        approvals.decide(owner, asked[0]?.id as string, "allow_always"),
      ).rejects.toBeInstanceOf(ApprovalRefusedError);

      await approvals.decide(owner, asked[0]?.id as string, "allow_once");
      const done = await inTurn(again(turn), () =>
        call(botId, "create_routine", ARGS.create_routine ?? {}),
      );
      expect(done.isError).toBe(false);
      expect(storeCalls.filter((name) => name === "create")).toEqual([
        "create",
      ]);
      expect(reached.filter((name) => name === "create_routine")).toEqual([
        "create_routine",
      ]);
      // Once means once: the same approved call is not carried out a second time.
      const reached1 = reached.length;
      await inTurn(again(turn), () =>
        call(botId, "create_routine", ARGS.create_routine ?? {}),
      );
      expect(reached).toHaveLength(reached1);
    });

  test("every tool that creates, changes, switches or deletes one is held, for the member with Full access", async () => {
    await reset();
    for (const tool of Object.keys(ARGS)) {
      const held = await inTurn({ messages: [typed("set this up")] }, () =>
        call(FULL, tool, ARGS[tool] ?? {}),
      ).catch((error: unknown) => error);
      expect(held).toBeInstanceOf(HeadlessToolSuspension);
    }
    expect(reached).toEqual([]);
    expect(storeCalls).toEqual([]);
    expect(
      (await pending()).map((request) => request.action.toolRef).sort(),
    ).toEqual(
      Object.keys(ARGS)
        .map((tool) => `${ROUTINES}/${tool}`)
        .sort(),
    );
    await clearPending();
  });

  test("the call the app makes when the person has allowed it, which names the person, is held the same way", async () => {
    await reset();
    const held = await inTurn({ messages: [typed("set this up")] }, () =>
      call(FULL, "delete_routine", ARGS.delete_routine ?? {}, PERSON),
    ).catch((error: unknown) => error);
    expect(held).toBeInstanceOf(HeadlessToolSuspension);
    expect(reached).toEqual([]);
    await clearPending();
  });

  test("listing them is a read, and asks nothing, with Full access or without", async () => {
    await reset();
    for (const botId of [FULL, PLAIN])
      for (const tool of ["list_routines", "list_triggers"]) {
        const result = await inTurn(
          { messages: [typed("what is set up?")] },
          () => call(botId, tool, {}),
        );
        expect(result.isError).toBe(false);
      }
    expect(reached).toEqual([
      "list_routines",
      "list_triggers",
      "list_routines",
      "list_triggers",
    ]);
    expect(await pending()).toEqual([]);
  });
});

describe("(a) a routine's or a trigger's write waits for a card", () => {
  for (const [name, initiator] of [
    ["a routine", ROUTINE_RUN],
    ["an event trigger", TRIGGER_RUN],
  ] as const)
    for (const [setting, botId] of [
      ["Full access", FULL],
      ["Full access without payments", NO_PAYMENTS],
    ] as const)
      test(`${name} that rewrites a routine, with ${setting} on for its member: nothing is changed`, async () => {
        await reset();
        const held = await inTurn(
          { messages: [typed("every weekday")], initiator },
          () =>
            call(botId, "update_routine", ARGS.update_routine ?? {}, initiator),
        ).catch((error: unknown) => error);
        expect(held).toBeInstanceOf(HeadlessToolSuspension);
        expect(reached).toEqual([]);
        expect(storeCalls).toEqual([]);
        const [asked] = await pending();
        expect(asked?.action.policy).toMatchObject({
          behaviour: "ask",
          source: "always_ask",
        });
        expect(asked?.action.policy?.reason).toContain(
          "routine or a trigger running on its own",
        );
        await clearPending();
      });

  test("what a routine only reads is not held", async () => {
    await reset();
    const result = await inTurn(
      { messages: [typed("every weekday")], initiator: ROUTINE_RUN },
      () => call(PLAIN, "list_routines", {}, ROUTINE_RUN),
    );
    expect(result.isError).toBe(false);
    expect(reached).toEqual(["list_routines"]);
    expect(await pending()).toEqual([]);
  });

  test("a Routines write made with no run to ask in, as the callback door makes it, is refused and reaches nothing", async () => {
    await reset();
    for (const initiator of [ROUTINE_RUN, TRIGGER_RUN, PERSON, undefined])
      await expect(
        call(PLAIN, "delete_routine", ARGS.delete_routine ?? {}, initiator),
      ).rejects.toThrow("not started from a conversation that can ask you");
    expect(reached).toEqual([]);
    expect(storeCalls).toEqual([]);
    // A read there goes on as it did before.
    const read = await call(PLAIN, "list_routines", {}, ROUTINE_RUN);
    expect(read.isError).toBe(false);
  });
});

describe("what the plugin store tells the gate about a call", () => {
  /**
   * A plugin store over the same servers and grants whose gate only writes down what it was asked and
   * lets everything through. Whether the gate then holds the call is the gate-level file's question;
   * this is the other half, that the store hands it the facts the rule is built on. The gate cannot
   * read them from the call, and a model cannot supply them: each is set from the signed run, the
   * connector's transport or the answer of the send check.
   */
  const asked: ApprovalCandidate[] = [];
  let shareAnswer: PrivateShareVerdict = {
    status: "allowed",
    reason: "Test.",
    byPerson: true,
  };
  const noting = createPluginStore({
    ...baseOptions,
    approvalGate: async (candidate) => {
      asked.push(candidate);
      return undefined;
    },
    privateShareCheck: async () => shareAnswer,
    callVendor: async () => ({ text: "done", isError: false }),
  });
  const callNoting = (
    ref: string,
    args: Record<string, unknown>,
    initiator?: AuditInitiator,
  ) =>
    noting.callTool({
      ref,
      args,
      botId: PLAIN,
      actorId: owner,
      ...(initiator ? { initiator } : {}),
    });
  const NEW_EMAIL = `${GOOGLE_APP_PASSWORD}/gmail_send_message`;
  const NEW_EMAIL_ARGS = {
    to: ["ana@example.com"],
    subject: "Good morning",
    body: "Good morning, Ana. The kiln is back and the mugs ship on Tuesday.",
  };

  test("every write on the Routines connector says it sets up, changes or removes one, and a read does not", async () => {
    asked.length = 0;
    for (const tool of Object.keys(ARGS))
      await callNoting(`${ROUTINES}/${tool}`, ARGS[tool] ?? {});
    for (const tool of ["list_routines", "list_triggers"])
      await callNoting(`${ROUTINES}/${tool}`, {});
    expect(
      asked
        .filter((candidate) => candidate.configuresAutomation === true)
        .map((candidate) => candidate.toolRef)
        .sort(),
    ).toEqual(
      Object.keys(ARGS)
        .map((tool) => `${ROUTINES}/${tool}`)
        .sort(),
    );
    expect(
      asked
        .filter((candidate) => candidate.effect === "read")
        .map((candidate) => candidate.configuresAutomation),
    ).toEqual([undefined, undefined]);
  });

  test("another connector's write never says so, whatever its name", async () => {
    asked.length = 0;
    await callNoting(NEW_EMAIL, NEW_EMAIL_ARGS);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.effect).toBe("write");
    expect(
      asked.some((candidate) => candidate.configuresAutomation === true),
    ).toBe(false);
  });

  test("the run's initiator goes with the call: it is all a call made with no approval context has to say what started it", async () => {
    asked.length = 0;
    await callNoting(
      `${ROUTINES}/delete_routine`,
      ARGS.delete_routine ?? {},
      ROUTINE_RUN,
    );
    await callNoting(
      `${ROUTINES}/delete_routine`,
      ARGS.delete_routine ?? {},
      TRIGGER_RUN,
    );
    await callNoting(
      `${ROUTINES}/delete_routine`,
      ARGS.delete_routine ?? {},
      PERSON,
    );
    await callNoting(`${ROUTINES}/delete_routine`, ARGS.delete_routine ?? {});
    expect(asked.map((candidate) => candidate.initiator)).toEqual([
      ROUTINE_RUN,
      TRIGGER_RUN,
      PERSON,
      undefined,
    ]);
  });

  test("a new email the person just answered on its own card says so, and no other call does", async () => {
    asked.length = 0;
    // Answered by the person on the card: that send, and nothing else, says so.
    await callNoting(NEW_EMAIL, NEW_EMAIL_ARGS, ROUTINE_RUN);
    // Allowed by the check without the person (nothing private in it): not an answer on a card.
    shareAnswer = { status: "allowed", reason: "Only the owner can read it." };
    await callNoting(NEW_EMAIL, NEW_EMAIL_ARGS, ROUTINE_RUN);
    shareAnswer = { status: "allowed", reason: "Test.", byPerson: true };
    // A reply the person answered is not a new email: its answer can be saved as "Always allow".
    await callNoting(
      `${GOOGLE_APP_PASSWORD}/gmail_send_reply`,
      { thread_id: "t1", body: "Thank you, Ana. See you on Tuesday." },
      ROUTINE_RUN,
    );
    expect(asked.map((candidate) => candidate.answeredByCard)).toEqual([
      true,
      undefined,
      undefined,
    ]);
  });
});

describe("a new email in a routine (D27 never applies to one), asked once", () => {
  const BODY =
    "Good morning, Ana. The kiln is back and the mugs ship on Tuesday; I will send the tracking number as soon as I have it. Have a lovely day. Maya";
  const send = (botId: string, initiator?: AuditInitiator) =>
    store.callTool({
      ref: `${GOOGLE_APP_PASSWORD}/gmail_send_message`,
      args: { to: ["ana@example.com"], subject: "Good morning", body: BODY },
      botId,
      actorId: owner,
      ...(initiator ? { initiator } : {}),
    });

  test("the address is typed in the routine's own prompt, and it still asks, once, whatever Full access says", async () => {
    await reset();
    const turn: Turn = {
      messages: [
        typed("Every morning write to ana@example.com saying good morning"),
      ],
      initiator: ROUTINE_RUN,
      threadId: `thread-${randomUUID()}`,
    };
    const held = await inTurn(turn, () => send(FULL, ROUTINE_RUN)).catch(
      (error: unknown) => error,
    );
    expect(held).toBeInstanceOf(HeadlessToolSuspension);
    expect(gmail.sent).toEqual([]);
    const asked = await pending();
    expect(asked).toHaveLength(1);
    expect(asked[0]?.action.toolRef).toBe(PRIVATE_SHARE_TOOL_REF);
    expect(asked[0]?.action.policy?.source).toBe("always_ask");

    // The person allows that card. The email then goes out, and nothing else is asked: a second card
    // for the same email would be noise, and the answer it needs would already be spent.
    await approvals.decide(owner, asked[0]?.id as string, "allow_once");
    const sent = await inTurn({ ...turn, runId: randomUUID() }, () =>
      send(FULL, ROUTINE_RUN),
    );
    expect(sent.isError).toBe(false);
    expect(gmail.sent).toHaveLength(1);
    expect(await pending()).toEqual([]);
  });

  test("in the person's own live turn the same email, with its address typed, goes out with no card, with Full access and without it (D27, as before)", async () => {
    for (const botId of [FULL, PLAIN]) {
      await reset();
      const sent = await inTurn(
        { messages: [typed("Write to ana@example.com saying good morning")] },
        () => send(botId),
      );
      expect(sent.isError).toBe(false);
      expect(gmail.sent).toHaveLength(1);
      expect(await pending()).toEqual([]);
    }
  });
});
