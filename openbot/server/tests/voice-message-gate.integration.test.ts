import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Message } from "@ag-ui/client";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RunAssertion } from "../src/agents/callback-token";
import { createHandoffDesk } from "../src/agents/handoff";
import { createHandedRequestLoader } from "../src/agents/handoff-request";
import {
  createHandoffRunner,
  type HandoffWork,
} from "../src/agents/handoff-runner";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import { HANDED_OVER, handoffTool } from "../src/agents/handoff-tool";
import { createAgentProfileStore } from "../src/agents/profile-store";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type { ApprovalCandidate } from "../src/approvals/types";
import {
  type AuditInitiator,
  createAuditStore,
  handoffInitiator,
  PERSON_INITIATOR,
} from "../src/audit";
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
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  users,
  workItems,
} from "../src/db/schema";
import { createFullAccess, withFullAccess } from "../src/freeduet/full-access";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import { createPluginStore } from "../src/plugins/store";
import {
  createPrivateShareCheck,
  PRIVATE_SHARE_TOOL_REF,
} from "../src/proactive/private-share";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { FakeGmail } from "./support/fake-imap";

/**
 * WORDS THAT CAME FROM THE MICROPHONE NEVER EARN A SHORTCUT (docs/design/voice.md, D7 and D8).
 *
 * Two shortcuts stand in for a card because the person's own written words ask for the action: a new
 * email whose every recipient is typed in their latest message goes out with no card (docs/M1_PLAN.md
 * D27, and D27a when a member hands it on), and a member the person switched to Full access acts with
 * no card in the person's own live turn (D29). Dictation sent with one press was never read, and a
 * voice call's model writes its own request, so neither is the person writing. The app puts the id
 * prefix `voice-` on such a message, the way a hand-off's envelope carries `handoff-`, and the server
 * treats the turn as no person's own: the card a hand-off gets today.
 *
 * The prefix is written out as a literal in every id below. It is the contract between the app and the
 * server, so a change of it is a change of this file and of the app's tests, not something one side
 * can do alone. A message the person types, or places in the box and sends with the Send button, has
 * the plain id it always had.
 *
 * Everything here runs through the real plugin store, approval store and service, Full access, the
 * hand-off desk and runner and the private-share check, on a real database, with the fake mailbox
 * behind the transport. "Nothing was sent" is read from the mailbox that would have received it.
 * Each case that must ask is named "asks"; each that passes on the source before this change as well
 * is a guard, and says so.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_voice_owner_${suite}`;
/** A second person, whose "ask before making changes" is on, for the table of other actions. */
const tablePerson = `user_voice_table_${suite}`;
/** Otto holds the tool and is switched on; Iris is asked by the person and hands the work on. */
const botId = `agent_voice_otto_${suite}`;
const irisId = `agent_voice_iris_${suite}`;
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const SEND = `${GOOGLE_APP_PASSWORD}/gmail_send_message`;

/** The conversations as their store holds them, by thread, for the hand-off cases (read by the loader). */
const conversations = new Map<string, Message[]>();

const approvals = createApprovalStore(database);
const handedRequest = createHandedRequestLoader({
  database,
  encryptionKey: ENCRYPTION_KEY,
  history: async ({ threadId }) => conversations.get(threadId) ?? [],
});
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  handedRequest,
  audit: createAuditStore(database),
});
const service = createApprovalService(approvals, undefined, undefined, {
  review: async () =>
    JSON.stringify({
      verdict: "proceed",
      preApproved: true,
      safety: "none",
      reason: "Test reviewer.",
    }),
  fullAccess,
});

const gmail = new FakeGmail();
const imapTransport = createGoogleImapTransport({
  imap: gmail.imap,
  smtp: gmail.smtp,
  fetch: async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
  now: () => new Date("2026-10-22T20:00:00Z"),
});
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  approvalGate: (candidate: Parameters<typeof service.gate>[0]) =>
    service.gate(candidate),
  privateShareCheck: withFullAccess(
    createPrivateShareCheck({ approvals }),
    fullAccess,
  ),
  handedRequest,
  verifyUserSecret: async () => ({ ok: true, calendar: false }),
  callVendor: (connection, toolName, args) =>
    imapTransport.callTool(connection, toolName, args),
});

const PERSON: AuditInitiator = { kind: "person" };

/** A message as a run's history holds it. `id` is what tells the server where the words came from. */
const typed = (content: string, id = `msg-${randomUUID()}`): Message => ({
  id,
  role: "user",
  content,
});
/** Dictation sent with one press, or a request the voice call's model wrote: the app's `voice-` id. */
const dictated = (content: string): Message =>
  typed(content, `voice-${randomUUID()}`);
const botSaid = (content: string, id = `msg-${randomUUID()}`): Message => ({
  id,
  role: "assistant",
  content,
});

type Turn = {
  messages: Message[];
  /** The initiator the run carries. Absent is the person's own live chat turn. */
  initiator?: AuditInitiator;
  threadId?: string;
  runId?: string;
  toolCallId?: string;
  forwardedProps?: unknown;
};

/** A send inside a run that can wait for the person, as a Bot's turn makes it. */
function inTurn<T>(turn: Turn, run: () => Promise<T>) {
  const context: ApprovalContinuation = {
    runId: turn.runId ?? randomUUID(),
    threadId: turn.threadId ?? `thread-${randomUUID()}`,
    toolCallId: turn.toolCallId ?? randomUUID(),
    toolName: "gmail_send_message",
    args: {},
    messages: turn.messages,
    state: {},
    context: [],
    forwardedProps: turn.forwardedProps ?? {},
    ...(turn.initiator ? { initiator: turn.initiator } : {}),
  };
  return withApprovalContext(context, run);
}

const BODY =
  "Good morning, Ana. I hope the week starts well. The kiln is back and the mugs ship on Tuesday; I will send the tracking number as soon as I have it. Have a lovely day. Maya";
const email = (overrides: Record<string, unknown> = {}) => ({
  to: ["ana@example.com"],
  subject: "Good morning",
  body: BODY,
  ...overrides,
});
/** The safety floor reads the words of a call, so the email that stands for a payment talks of paying. */
const PAYING = email({
  to: ["bob@example.com"],
  subject: "The kiln invoice",
  body: `${BODY} Please complete the payment of the kiln invoice this week.`,
});
const STRANGER = email({ to: ["bob@example.com"] });

const callNew = (
  args: Record<string, unknown>,
  initiator: AuditInitiator = PERSON,
  member: string = botId,
) =>
  store.callTool({
    ref: SEND,
    args,
    botId: member,
    actorId: owner,
    initiator,
  });

const sent = () =>
  gmail.sent.map((message) => ({
    to: message.to as string[],
    subject: message.subject,
    body: message.text,
  }));
const resetMailbox = () => {
  gmail.sent.length = 0;
};
const pending = async () =>
  (await approvals.list(owner)).filter(
    (request) => request.status === "pending",
  );
/** Refuse whatever is waiting, so one test's question never answers the next one's. */
async function clearPending() {
  for (const request of await pending())
    await approvals.decide(owner, request.id, "deny");
}

/** The call asked the person instead of sending: a suspension, one card that cannot be remembered, nothing sent. */
async function expectAsks(turn: Turn, args: Record<string, unknown>) {
  resetMailbox();
  await clearPending();
  const outcome = await inTurn(turn, () => callNew(args)).catch(
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
  expect(sent()).toEqual([]);
  const asked = await pending();
  expect(asked).toHaveLength(1);
  const [card] = asked;
  expect(card?.action.toolRef).toBe(PRIVATE_SHARE_TOOL_REF);
  // Asked about every time: the card can be allowed once or refused, never remembered.
  expect(card?.action.policy?.source).toBe("always_ask");
  await clearPending();
}

/**
 * The send was held for the person, by whichever check got to it first: a suspension, one card of
 * whatever kind, nothing sent. A payment is held by the safety floor with a card of its own, so a case
 * about payments asks only this and leaves the kind of card to the cases above.
 */
async function expectHeld(turn: Turn, args: Record<string, unknown>) {
  resetMailbox();
  await clearPending();
  const outcome = await inTurn(turn, () => callNew(args)).catch(
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
  expect(sent()).toEqual([]);
  expect(await pending()).toHaveLength(1);
  await clearPending();
}

/** The email went out with no card, to exactly these recipients, with this subject and text. */
async function expectSends(
  turn: Turn,
  args: Record<string, unknown> & { to: string[] },
) {
  resetMailbox();
  await clearPending();
  const result = await inTurn(turn, () => callNew(args));
  expect(result.isError).toBe(false);
  expect(JSON.parse(result.text)).toMatchObject({ sent: true });
  expect(sent()).toEqual([
    { to: args.to, subject: String(args.subject), body: String(args.body) },
  ]);
  expect(await pending()).toEqual([]);
}

type Setting = "off" | "full" | "no_payments";
const give = (member: string, setting: Setting, person = owner) =>
  setting === "off"
    ? fullAccess.set(person, member, false)
    : fullAccess.set(person, member, true, setting);

/*
 * A HAND-OFF, as `send-message-approval.integration.test.ts` drives it: the person asks Iris, Iris
 * hands the email to Otto with the real tool and the real desk, the hop waits on the real queue, and
 * the real runner delivers it with the context a delivered run has. The conversation the person
 * typed in is `conversations`, which is what the gate reads the person's message back from.
 */
const queue = createWorkQueue(database);
const replica = `replica-voice-${suite}`;
const deskAudit = createAuditStore(database);
const desk = createHandoffDesk({
  queue,
  profiles: createAgentProfileStore(database, undefined),
  actorFor: async (id: string) => ({ id, role: "user" as const }),
  mayAddress: async () => true,
  auditStore: deskAudit,
  caps: { maxDepth: 3, maxPerRun: 4 },
});

type Origin = { messages: Message[] };
const askedIris = (message: Message): Origin => ({ messages: [message] });

async function handOn(origin: Origin) {
  const threadId = `thread-origin-${randomUUID()}`;
  const runId = `run-${randomUUID()}`;
  conversations.set(threadId, [...origin.messages]);
  const from: RunAssertion = {
    botId: irisId,
    actorId: owner,
    runId,
    threadId,
    depth: 0,
    initiator: PERSON,
  };
  const tool = handoffTool({
    desk,
    from,
    hasSomebodyToAsk: true,
    maxDepth: 3,
    maxPerRun: 4,
  });
  if (!tool) throw new Error("the hand-off tool was not offered");
  const told = await inTurn(
    { messages: origin.messages, threadId, runId },
    () =>
      tool.execute({
        bot: botId,
        task: "Send the email the person asked for",
      }),
  );
  expect(String(told)).toContain(HANDED_OVER);
}

type Delivery = { work: HandoffWork; message: string; assertion: string };
type Delivered = { work: HandoffWork; value?: unknown; error?: unknown };

/** Delivers every hop waiting for this person, as the runner does, and runs Otto in each. */
async function deliverHops(
  member: (hop: Delivery) => Promise<unknown>,
): Promise<Delivered[]> {
  const delivered: Delivered[] = [];
  const runner = createHandoffRunner({
    queue,
    owner: replica,
    auditStore: deskAudit,
    sign: (work, claim) =>
      signHandoffDeliveryRun(work, ENCRYPTION_KEY, undefined, claim),
    delivery: {
      deliver: async ({ work, message, assertion }) => {
        if (work.actorId !== owner)
          throw new Error("a hop that is not this suite's");
        try {
          delivered.push({
            work,
            value: await member({ work, message, assertion }),
          });
        } catch (error) {
          delivered.push({ work, error });
        }
        return { answer: null };
      },
    },
  });
  await runner.sweep();
  return delivered;
}

/** Otto's own call in a delivered hop, with what a delivered run carries. */
function sendsInHop(hop: Delivery, args: Record<string, unknown>) {
  const initiator = handoffInitiator(hop.work.fromBotId, hop.work.initiator);
  return inTurn(
    {
      messages: [
        // What the receiver reads: the conversation so far, then the envelope a Bot wrote.
        ...(conversations.get(hop.work.threadId) ?? []),
        { id: `handoff-${randomUUID()}`, role: "user", content: hop.message },
      ],
      initiator,
      threadId: `scratch-${randomUUID()}`,
      forwardedProps: { openbotRun: hop.assertion },
    },
    () => callNew(args, initiator),
  );
}

/** Asks Iris, hands on, delivers; the first delivered hop is the one the test is about. */
async function viaHop(origin: Origin, args: Record<string, unknown>) {
  resetMailbox();
  await clearPending();
  await handOn(origin);
  const [first] = await deliverHops((hop) => sendsInHop(hop, args));
  if (!first) throw new Error("no hop was delivered");
  return first;
}

/** The send waited for the person: a suspension, one card that cannot be remembered, nothing sent. */
async function expectHopAsks(origin: Origin, args: Record<string, unknown>) {
  const hop = await viaHop(origin, args);
  expect(hop.error).toBeInstanceOf(HeadlessToolSuspension);
  expect(sent()).toEqual([]);
  const asked = await pending();
  expect(asked).toHaveLength(1);
  expect(asked[0]?.action.toolRef).toBe(PRIVATE_SHARE_TOOL_REF);
  expect(asked[0]?.action.policy?.source).toBe("always_ask");
  await clearPending();
}

/** The email went out with no card, to exactly these recipients, with this subject and text. */
async function expectHopSends(
  origin: Origin,
  args: Record<string, unknown> & { to: string[] },
) {
  const hop = await viaHop(origin, args);
  expect(hop.error).toBeUndefined();
  const result = hop.value as { text: string; isError: boolean };
  expect(result.isError).toBe(false);
  expect(JSON.parse(result.text)).toMatchObject({ sent: true });
  expect(sent()).toEqual([
    { to: args.to, subject: String(args.subject), body: String(args.body) },
  ]);
  expect(await pending()).toEqual([]);
}

const credentialIds: string[] = [];
const serverRowExisted: { value: boolean } = { value: false };

beforeAll(async () => {
  await database
    .insert(users)
    .values(
      [owner, tablePerson].map((id) => ({
        id,
        email: `${id}@voice.test`,
        name: "Maya Okafor",
        emailVerified: false,
      })),
    )
    .onConflictDoNothing();
  for (const id of [botId, irisId])
    await database
      .insert(agents)
      .values({ id, name: id, type: "remote_ag_ui", configuration: {} })
      .onConflictDoNothing();
  for (const id of [botId, irisId])
    await database
      .insert(agentProfiles)
      .values({
        agentId: id,
        title: "",
        roleDescription: "",
        avatarSeed: id,
        visibility: "public",
      })
      .onConflictDoNothing();

  // The app-password connection: the person pasted an app password and nothing else.
  const [existing] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  serverRowExisted.value = existing !== undefined;
  await store.addServer({ key: GOOGLE_APP_PASSWORD, by: owner });
  await store.connectUserSecret({
    serverId: GOOGLE_APP_PASSWORD,
    userId: owner,
    body: { address: "maya@example.com", appPassword: "qwertyuiopasdfgh" },
  });
  await database
    .insert(pluginGrants)
    .values({ kind: "mcp", ref: SEND, agentId: botId })
    .onConflictDoNothing();

  // "Ask before making changes" is on for the second person, so an allowed action is one Full access
  // let through (the table of other actions below).
  await service.setPreferences(tablePerson, {
    enabled: true,
    autoReview: false,
  });
});

afterAll(async () => {
  for (const person of [owner, tablePerson]) {
    await database
      .delete(approvalRequests)
      .where(eq(approvalRequests.ownerUserId, person));
    await database
      .delete(approvalRules)
      .where(eq(approvalRules.ownerUserId, person));
    await database
      .delete(approvalPreferences)
      .where(eq(approvalPreferences.ownerUserId, person));
  }
  await database
    .delete(workItems)
    .where(sql`${workItems.payload}->>'actorId' = ${owner}`);
  await database
    .delete(pluginGrants)
    .where(and(eq(pluginGrants.agentId, botId), eq(pluginGrants.ref, SEND)));
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
  for (const id of credentialIds)
    await database.delete(credentials).where(eq(credentials.id, id));
  if (!serverRowExisted.value) {
    await database
      .delete(mcpTools)
      .where(eq(mcpTools.serverId, GOOGLE_APP_PASSWORD));
    await database
      .delete(mcpServers)
      .where(
        and(
          eq(mcpServers.id, GOOGLE_APP_PASSWORD),
          isNull(mcpServers.credentialId),
        ),
      );
  }
  await database
    .delete(agentProfiles)
    .where(inArray(agentProfiles.agentId, [irisId, botId]));
  await database.delete(users).where(inArray(users.id, [owner, tablePerson]));
  await database.delete(agents).where(inArray(agents.id, [botId, irisId]));
  await database.$client.close();
});

describe("D27: a new email the person's own message names", () => {
  const ASKED = "Write to ana@example.com saying good morning";

  test("guard: typed, or placed in the box and sent with the Send button, goes out with no card to exactly those recipients", async () => {
    await give(botId, "off");
    await expectSends({ messages: [typed(ASKED)] }, email());
  });

  test("dictated and sent with one press, never read: asks, though the message names the address", async () => {
    await give(botId, "off");
    await expectAsks({ messages: [dictated(ASKED)] }, email());
  });

  test("written by the voice call's model on the person's behalf: asks, though the request names the address", async () => {
    await give(botId, "off");
    await expectAsks(
      {
        messages: [
          dictated("Send Ana, ana@example.com, a note to say good morning."),
        ],
      },
      email(),
    );
  });

  test("the latest message decides: a typed one after a dictated one goes out, a dictated one after a typed one asks", async () => {
    await give(botId, "off");
    await expectSends(
      {
        messages: [
          dictated("Write to ana@example.com saying hello"),
          botSaid("Writing to Ana now."),
          typed(ASKED),
        ],
      },
      email(),
    );
    await expectAsks(
      {
        messages: [typed(ASKED), botSaid("Done."), dictated(ASKED)],
      },
      email(),
    );
  });

  test("guard: only the person's message carries the mark; an id of that kind on a Bot's or a tool's message changes nothing", async () => {
    await give(botId, "off");
    await expectSends(
      {
        messages: [
          typed(ASKED),
          botSaid("Writing to Ana now.", `voice-${randomUUID()}`),
          {
            id: `voice-${randomUUID()}`,
            role: "tool",
            toolCallId: `call-${randomUUID()}`,
            content: "ok",
          },
        ],
      },
      email(),
    );
  });
});

describe("D27a: Iris hands the email to Otto, made from a message that came from the microphone", () => {
  const ASKED = "can you send an email to ana@example.com saying good morning?";

  test("guard: made from a typed message, Otto's email goes out with no card", async () => {
    await give(botId, "off");
    await expectHopSends(askedIris(typed(ASKED)), email());
  });

  test("made from a dictated message sent with one press: Otto's email asks", async () => {
    await give(botId, "off");
    await expectHopAsks(askedIris(dictated(ASKED)), email());
  });
});

for (const setting of ["full", "no_payments"] as const) {
  describe(`Full access ${setting}: the person's own live turn`, () => {
    beforeAll(() => give(botId, setting));
    afterAll(() => give(botId, "off"));
    const WRITTEN = "write to the team about the kiln";

    test("guard: a typed message gets the switch, so a new email to an address the person never typed goes out with no card", async () => {
      await expectSends({ messages: [typed(WRITTEN)] }, STRANGER);
    });

    test("dictated and sent with one press: asks, to an address the person never typed", async () => {
      await expectAsks({ messages: [dictated(WRITTEN)] }, STRANGER);
    });

    test("dictated and sent with one press: asks, though the message names the address too", async () => {
      await expectAsks(
        { messages: [dictated("Write to bob@example.com about the kiln")] },
        STRANGER,
      );
    });

    test("written by the voice call's model: asks", async () => {
      await expectAsks(
        {
          messages: [
            dictated("Email the team that the kiln is back and mugs ship."),
          ],
        },
        STRANGER,
      );
    });

    // With the switch "without payments" the safety floor holds a payment on the source before this
    // change as well, so there this is a guard; with plain Full access the payment went out.
    test("a payment the voice call's model wrote: is held for the person, and nothing is sent", async () => {
      await expectHeld(
        { messages: [dictated("Pay the kiln invoice and tell Bob.")] },
        PAYING,
      );
    });

    test("the trail: what a voice turn did is not recorded as an action taken with no card", async () => {
      const before = (await fullAccess.recent(owner, 100)).length;
      await expectAsks({ messages: [dictated(WRITTEN)] }, STRANGER);
      expect((await fullAccess.recent(owner, 100)).length).toBe(before);
    });

    test("a Bot's own message, or one a tool wrote, with that id does not take the switch away from a typed turn (guard)", async () => {
      await expectSends(
        {
          messages: [
            typed(WRITTEN),
            botSaid("On it.", `voice-${randomUUID()}`),
          ],
        },
        STRANGER,
      );
    });
  });
}

describe("Full access with a payment, in the person's own typed turn", () => {
  afterAll(() => give(botId, "off"));

  test("guard: plain Full access still sends a typed payment with no card, as decided (D29); the line is where the words came from", async () => {
    await give(botId, "full");
    await expectSends({ messages: [typed("pay the kiln invoice")] }, PAYING);
  });

  test("guard: 'without payments' holds a typed payment, as it holds one with the switch off", async () => {
    await give(botId, "no_payments");
    await expectHeld({ messages: [typed("pay the kiln invoice")] }, PAYING);
    await give(botId, "off");
    await expectHeld({ messages: [typed("pay the kiln invoice")] }, PAYING);
  });
});

describe("Full access: a hand-off made from a message that came from the microphone", () => {
  const ASKED = "can you send an email to ana@example.com saying good morning?";
  afterAll(() => give(botId, "off"));

  for (const setting of ["full", "no_payments"] as const) {
    test(`guard: Otto on ${setting}, handed the work from a typed message, sends to an address the person never typed with no card`, async () => {
      await give(botId, setting);
      await expectHopSends(askedIris(typed(ASKED)), STRANGER);
    });

    test(`Otto on ${setting}, handed the work from a dictated message sent with one press: asks`, async () => {
      await give(botId, setting);
      await expectHopAsks(askedIris(dictated(ASKED)), STRANGER);
    });
  }
});

/*
 * ANY OTHER ACTION, through the approval service alone. The rule lives where Full access decides
 * whether it applies, so it is not only about email: a member on Full access acts with no card in
 * the person's own typed turn and, since the decision of 14 November 2026, in no turn that came from
 * the microphone. The actions are worded so the safety floor reads each the way a real one reads.
 */
describe("any action: Full access does not reach a turn that came from the microphone", () => {
  const ACTIONS = {
    email: {
      toolRef: "mcp/gmail/send_email",
      scope: "gmail",
      args: { to: "sam@example.com", subject: "Hello" },
    },
    book: {
      toolRef: "mcp/hotel/book_room",
      scope: "hotel",
      args: { room: "r12", nights: 2 },
    },
    payment: {
      toolRef: "computer_click",
      scope: "shop.example",
      args: { element: "Pay now" },
    },
    credential: {
      toolRef: "computer_type",
      scope: "bank.example",
      args: { text: "change my account password to hunter2" },
    },
  } as const;
  type Action = keyof typeof ACTIONS;
  const NAMES = Object.keys(ACTIONS) as Action[];
  type Outcome = "allowed" | "asks" | "handed_off";
  /** With the switch off, and in any turn Full access does not reach. */
  const ASKS: Record<Action, Outcome> = {
    email: "asks",
    book: "asks",
    payment: "handed_off",
    credential: "handed_off",
  };
  const FULL: Record<Action, Outcome> = {
    ...ASKS,
    email: "allowed",
    book: "allowed",
    payment: "allowed",
  };
  const NO_PAYMENTS: Record<Action, Outcome> = {
    ...FULL,
    payment: "handed_off",
  };
  const MEMBER: Record<Setting, string> = {
    off: `${botId}-table-off`,
    full: `${botId}-table-full`,
    no_payments: `${botId}-table-no-payments`,
  };

  beforeAll(async () => {
    await give(MEMBER.full, "full", tablePerson);
    await give(MEMBER.no_payments, "no_payments", tablePerson);
  });

  function candidate(
    member: string,
    action: Action,
    messages: Message[],
    initiator?: AuditInitiator,
  ): ApprovalCandidate {
    const toolCallId = randomUUID();
    const { toolRef, scope, args } = ACTIONS[action];
    return {
      actorId: tablePerson,
      botId: member,
      toolRef,
      effect: "write",
      scope,
      args,
      continuation: {
        runId: randomUUID(),
        threadId: `thread-table-${toolCallId}`,
        toolCallId,
        toolName: toolRef,
        args,
        messages,
        state: {},
        context: [],
        forwardedProps: {},
        ...(initiator ? { initiator } : {}),
      },
    };
  }

  /** What the real gate did, read from what it left behind. */
  async function outcomeOf(c: ApprovalCandidate): Promise<Outcome | string> {
    const paused = await service.gate(c).then(
      () => false,
      (error: unknown) => {
        if (error instanceof HeadlessToolSuspension) return true;
        throw error;
      },
    );
    const asked = (await approvals.list(tablePerson)).filter(
      (row) => row.action.toolCallId === c.continuation?.toolCallId,
    );
    if (!paused) return asked.length === 0 ? "allowed" : "allowed-with-card";
    if (asked.length !== 1) return `${asked.length} cards`;
    const seen = `${asked[0]?.action.policy?.behaviour}/${asked[0]?.action.policy?.source}`;
    if (seen === "ask/default") return "asks";
    if (seen === "hand_off/safety") return "handed_off";
    return seen;
  }

  async function observe(
    member: string,
    messages: Message[],
    initiator?: AuditInitiator,
  ) {
    const seen = {} as Record<Action, Outcome | string>;
    for (const action of NAMES)
      seen[action] = await outcomeOf(
        candidate(member, action, messages, initiator),
      );
    return seen;
  }

  test("guard: typed, Full access lifts what it always lifted, in both settings", async () => {
    expect(await observe(MEMBER.full, [typed("go ahead")])).toEqual(FULL);
    expect(await observe(MEMBER.no_payments, [typed("go ahead")])).toEqual(
      NO_PAYMENTS,
    );
  });

  test("dictated and sent with one press: Full access lifts nothing, so every action asks as with the switch off", async () => {
    expect(await observe(MEMBER.full, [dictated("go ahead")])).toEqual(ASKS);
    expect(await observe(MEMBER.no_payments, [dictated("go ahead")])).toEqual(
      ASKS,
    );
  });

  test("a payment the voice call's model asked for is handed to the person, in 'Full access' too", async () => {
    const payment = await outcomeOf(
      candidate(MEMBER.full, "payment", [dictated("Pay the invoice now.")]),
    );
    expect(payment).toBe("handed_off");
  });

  test("guard: with the switch off nothing changes, whoever the words came from", async () => {
    expect(await observe(MEMBER.off, [typed("go ahead")])).toEqual(ASKS);
    expect(await observe(MEMBER.off, [dictated("go ahead")])).toEqual(ASKS);
  });

  test("the app's own task turns carry the person's initiator: a task reply sent from a dictation asks, a typed one is lifted", async () => {
    expect(
      await observe(MEMBER.full, [dictated("go ahead")], PERSON_INITIATOR),
    ).toEqual(ASKS);
    expect(
      await observe(MEMBER.full, [typed("go ahead")], PERSON_INITIATOR),
    ).toEqual(FULL);
  });

  test("guard: a run with no messages at all keeps what it had, because there is no voice message in it", async () => {
    expect(await observe(MEMBER.full, [])).toEqual(FULL);
  });
});
