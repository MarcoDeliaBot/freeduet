import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createApprovalQuestions } from "../src/approvals/questions";
import { createApprovalRoutes } from "../src/approvals/routes";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalCandidate,
  type ApprovalContinuation,
  type ApprovalDecision,
  ApprovalRefusedError,
} from "../src/approvals/types";
import type { AppVariables } from "../src/auth/guards";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { workItems } from "../src/db/schema/work";
import { interruptIdForApproval } from "../src/delivery/opentag";
import {
  type OpenTagAgentDeps,
  handleOpenTagRun,
} from "../src/delivery/opentag-agent";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * A voice or transcript is not a card answer (docs/design/voice.md, decision D3, decided 14 November
 * 2026): an approval is answered by a press on its card, never by what a person says, dictates or
 * types. Every word a person might use to mean yes is sent through the three doors a message can come
 * in by, and none of them may decide, release or skip a pending approval:
 *
 * - the Bot's page's card route (`POST /api/approvals/:id/decision`),
 * - the answer to a question the Bot asked (`POST /api/approvals/questions/:id/respond`, and a chat
 *   message that answers a question open in its thread),
 * - a Slack or Teams message (OpenTag's AG-UI run without a card's `forwardedProps.command.resume`).
 *
 * Real Postgres, the real approval service, store, routes and questions. Only the chat transport and the
 * delivery router are stubs, since they are the platform's side of the door and not the approval's.
 * The positive controls show that the same card still decides, once, from the page and from a chat card.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `voice-guard-${randomUUID()}`;
const owner = `${prefix}-owner`;
const botId = `${prefix}-bot`;
const SECRET = `${prefix}-secret`;
const SLACK_USER = "slack:T1:U1";
const keys: string[] = [];

const store = createApprovalStore(database);
const questions = createApprovalQuestions(database, async () => undefined);
const service = createApprovalService(store, questions);

/** Every form a person might speak, dictate or type to mean yes, with the emoji a chat sends. */
const YES_FORMS = [
  "yes",
  "Yes.",
  "YES!",
  " yes ",
  "yes yes",
  "yeah",
  "yep",
  "sure",
  "ok",
  "OK",
  "okay",
  "ok, go ahead",
  "go ahead",
  "do it",
  "approve",
  "approved",
  "approve it",
  "allow",
  "allow always",
  "always allow",
  "confirm",
  "confirmed",
  "yes, always",
  "sì",
  "Sì.",
  "SÌ",
  "si",
  "SI",
  "sí",
  "siii",
  "s ì",
  "sì sempre",
  "sì\n",
  "certo",
  "va bene",
  "vai",
  "procedi",
  "approvo",
  "conferma",
  "confermo",
  "certamente",
  "consento",
  "mandala",
  "fallo",
  "👍",
  ":+1:",
  "✅",
];

const app = new Hono<{ Variables: AppVariables }>();
app.route(
  "/api/approvals",
  createApprovalRoutes(service, async (context, next) => {
    context.set("actor", {
      id: owner,
      email: `${owner}@example.test`,
      role: "user",
    });
    await next();
  }),
);
const callRoute = (path: string, body: unknown) =>
  app.request(`/api/approvals${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** The chat side: what OpenTag sends for the owner's Slack DM. Stubbed; the approvals behind it are real. */
let slackThread = `${prefix}-slack-initial`;
const decided: { id: string; decision: ApprovalDecision }[] = [];
const answered: string[] = [];
const binding = () => ({
  id: `${prefix}-binding`,
  ownerUserId: owner,
  channelId: `${prefix}-channel`,
  agentId: botId,
  threadId: slackThread,
});
const chat = {
  opentag: {
    authenticates: (header: string | null | undefined) =>
      header === `Bearer ${SECRET}`,
  },
  router: {
    converse: async () => ({
      kind: "replied",
      binding: binding(),
      inboxId: randomUUID(),
      replyText: "",
      extras: { approvals: [], questions: [] },
    }),
    notify: async () => undefined,
  },
  store: {
    findBinding: async (transport: string, realm: string, identity: string) =>
      transport === "slack" && realm === "T1" && identity === "U1"
        ? binding()
        : null,
    botIdentity: async () => ({ name: "Test Bot" }),
  },
  scopeFor: async (
    ownerUserId: string,
    channelId: string,
    agentId: string,
  ) => ({
    ownerUserId,
    channelId,
    agentId,
    threadId: slackThread,
  }),
  approvals: {
    store: { get: (who: string, id: string) => store.get(who, id) },
    decide: async (who: string, id: string, decision: ApprovalDecision) => {
      decided.push({ id, decision });
      return service.decide(who, id, decision);
    },
    answerQuestion: async (who: string, id: string, response: string) => {
      answered.push(id);
      return service.answerQuestion(who, id, response);
    },
    inbox: (who: string) => service.inbox(who),
  },
};
const deps = chat as unknown as OpenTagAgentDeps;

/** A Slack DM run: a text message, or a card's resume when `resume` is given. */
function chatRun(input: { text?: string; resume?: unknown }) {
  return new Request("http://openbot.test/opentag", {
    method: "POST",
    headers: {
      authorization: `Bearer ${SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      threadId: slackThread,
      runId: randomUUID(),
      messages:
        input.text === undefined
          ? []
          : [{ id: randomUUID(), role: "user", content: input.text }],
      context: [
        {
          description: "openbot.sender",
          value: JSON.stringify({
            user: SLACK_USER,
            conversation: { id: "D1", kind: "im" },
            mentioned: false,
          }),
        },
      ],
      tools: [],
      ...(input.resume === undefined
        ? {}
        : { forwardedProps: { command: { resume: input.resume } } }),
    }),
  });
}
async function sendChat(text: string) {
  const response = await handleOpenTagRun(deps, chatRun({ text }));
  return response.text();
}

/** A write the Bot wants to make in a conversation; the gate holds it for the person's card. */
function continuationIn(thread: string, said: string): ApprovalContinuation {
  const toolCallId = randomUUID();
  return {
    runId: randomUUID(),
    threadId: thread,
    toolCallId,
    toolName: "gmail_archive_thread",
    args: { threadId: "lunch" },
    messages: [
      { id: randomUUID(), role: "user", content: said },
      {
        id: randomUUID(),
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: toolCallId,
            type: "function",
            function: {
              name: "gmail_archive_thread",
              arguments: JSON.stringify({ threadId: "lunch" }),
            },
          },
        ],
      },
    ],
    state: {},
    context: [],
    forwardedProps: {},
  };
}
const candidateFor = (
  continuation: ApprovalContinuation,
): ApprovalCandidate => ({
  actorId: owner,
  botId,
  toolRef: "gmail/archive_thread",
  effect: "write",
  scope: "thread:lunch",
  args: { threadId: "lunch" },
  continuation,
});
/** Asks the gate: the card is held, and its request id is returned. */
async function awaitingCard(continuation: ApprovalContinuation) {
  try {
    await service.gate(candidateFor(continuation));
  } catch (error) {
    if (!(error instanceof HeadlessToolSuspension)) throw error;
    const requestId = error.waiting.requestId;
    if (!requestId) throw new Error("The card has no request id.");
    keys.push(requestId);
    return requestId;
  }
  throw new Error("The action ran without a card.");
}
async function openCard(thread = slackThread) {
  return awaitingCard(continuationIn(thread, "Archive the lunch thread"));
}
/** A question the Bot asked the person, as the approvals questions table holds it. */
async function askQuestion(thread: string) {
  const key = randomUUID();
  keys.push(key);
  await database.insert(workItems).values({
    kind: "person.question",
    key,
    payload: {
      actorId: owner,
      botId,
      threadId: thread,
      runId: randomUUID(),
      question: "Shall I archive the lunch thread?",
      mode: "completed_question",
    },
  });
  return key;
}
const statusOf = async (id: string) => (await store.get(owner, id)).status;
const resumesFor = (id: string) =>
  database
    .select()
    .from(workItems)
    .where(and(eq(workItems.kind, "approval.resume"), eq(workItems.key, id)));

beforeAll(async () => {
  await database.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
  });
  await store.setEnabled(owner, true);
});
afterAll(async () => {
  if (keys.length)
    await database.delete(workItems).where(inArray(workItems.key, keys));
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

test("a card is answered by one of its four decisions: a yes said, dictated or typed is refused and the card stays pending", async () => {
  for (const word of YES_FORMS) {
    const id = await openCard(`${prefix}-card-${randomUUID()}`);
    const response = await callRoute(`/${id}/decision`, { decision: word });
    expect(response.status).toBe(400);
    expect(await statusOf(id)).toBe("pending");
    expect(await resumesFor(id)).toEqual([]);
  }
});

test("a yes answering the Bot's question answers that question only: the card stays pending and nothing is released", async () => {
  for (const word of YES_FORMS) {
    const thread = `${prefix}-question-${randomUUID()}`;
    const id = await openCard(thread);
    const question = await askQuestion(thread);
    const response = await callRoute(`/questions/${question}/respond`, {
      response: word,
    });
    expect(response.status).toBe(200);
    expect(await statusOf(id)).toBe("pending");
    expect(await resumesFor(id)).toEqual([]);
  }
});

test("a Slack or Teams message is not a card answer: sent as text, a yes decides nothing", async () => {
  for (const word of YES_FORMS) {
    slackThread = `${prefix}-slack-${randomUUID()}`;
    decided.length = 0;
    const id = await openCard();
    await sendChat(word);
    expect(decided).toEqual([]);
    expect(await statusOf(id)).toBe("pending");
    expect(await resumesFor(id)).toEqual([]);
  }
});

test("in a Slack DM, a yes answers the open question of that thread and leaves the card pending", async () => {
  slackThread = `${prefix}-slack-question-${randomUUID()}`;
  answered.length = 0;
  decided.length = 0;
  const id = await openCard();
  const question = await askQuestion(slackThread);
  const text = await sendChat("sì");
  expect(text).toContain("I passed your answer");
  expect(answered).toEqual([question]);
  expect(decided).toEqual([]);
  expect(await statusOf(id)).toBe("pending");
});

test("the card still decides: from the Bot's page once, and from the chat card once", async () => {
  slackThread = `${prefix}-positive-${randomUUID()}`;

  const page = continuationIn(slackThread, "Archive the lunch thread");
  const pageCard = await awaitingCard(page);
  const pressed = await callRoute(`/${pageCard}/decision`, {
    decision: "allow_once",
  });
  expect(pressed.status).toBe(200);
  expect(await statusOf(pageCard)).toBe("approved");
  // The press releases the action exactly once: the next run of it is refused.
  const released = await service.gate(candidateFor(page));
  expect(released?.complete).toBeDefined();
  await expect(service.gate(candidateFor(page))).rejects.toBeInstanceOf(
    ApprovalRefusedError,
  );

  decided.length = 0;
  const chatCard = await openCard();
  const reply = await handleOpenTagRun(
    deps,
    chatRun({
      resume: {
        [interruptIdForApproval(chatCard)]: { confirmed: true, by: SLACK_USER },
      },
    }),
  );
  expect(await reply.text()).toContain("Allowed once");
  expect(decided).toEqual([{ id: chatCard, decision: "allow_once" }]);
  expect(await statusOf(chatCard)).toBe("approved");
});

test("after a yes, the same action still waits for its card: it is held again and nothing runs", async () => {
  slackThread = `${prefix}-held-${randomUUID()}`;
  const first = continuationIn(slackThread, "Archive the lunch thread");
  const id = await awaitingCard(first);
  const afterYes: ApprovalContinuation = {
    ...first,
    messages: [
      ...first.messages,
      { id: randomUUID(), role: "user", content: "sì" },
    ],
  };
  expect(await awaitingCard(afterYes)).toBe(id);
  expect(await statusOf(id)).toBe("pending");
});
