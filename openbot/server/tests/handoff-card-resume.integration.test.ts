/**
 * A CARD RAISED INSIDE A HAND-OFF MUST RUN WHEN THE PERSON ALLOWS IT, AND THE ANSWER MUST COME HOME
 * (docs/M1_PLAN.md D48), against a real database.
 *
 * The incident, on a real installation with sign-in on and a phone: the person asked Iris for a mail
 * job, Iris handed it to Otto, and Otto's write was held on a card. The person pressed Allow once, and
 * nothing happened: the write never ran, nothing came back, Iris kept saying "waiting for Otto". Asked
 * again three times, Otto raised three identical cards.
 *
 * Real: the hand-off queue, the runner and `createHandoffDelivery`; the approval service as the
 * deployment wires it (`createServerApprovalService`) over the real store and policy; the approved
 * action executor; the resume sweep; the signed run of the hop. Stand-ins: the member's model (a fake
 * agent that makes one gated call), the platform's thread runner (it only streams the agent's events),
 * the connector (it counts what really ran) and the conversation lookup, which is the one of
 * `index.ts` in miniature: the asking thread maps to Iris's channel and the hop's scratch thread maps
 * to nothing.
 *
 * "Restart" is a second set of every object over the same database: nothing is held in memory.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { AbstractAgent, BaseEvent } from "@ag-ui/client";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import type { TurnRunner } from "@openbot/toolkit/run-turn";
import { and, eq, like, sql } from "drizzle-orm";
import { Observable } from "rxjs";
import {
  mintRunAssertion,
  readApprovedRunAssertion,
  type RunAssertion,
} from "../src/agents/callback-token";
import { HANDOFF_KIND } from "../src/agents/handoff";
import { createHandoffDelivery } from "../src/agents/handoff-delivery";
import { createHopRelay } from "../src/agents/handoff-resume";
import {
  createHandoffRunner,
  type HandoffWork,
} from "../src/agents/handoff-runner";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import { serverTurnAdmission } from "../src/agents/turn-admission";
import { createApprovedActionExecutor } from "../src/approvals/execute";
import { createApprovalResumeTick } from "../src/approvals/resume-sweep";
import { ALREADY_WAITING, isApprovalRecheck } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalAction,
  ApprovalRefusedError,
  withApprovalContext,
} from "../src/approvals/types";
import { createServerApprovalService } from "../src/approvals/wiring";
import { createAuditStore, handoffInitiator } from "../src/audit";
import { createDatabase } from "../src/db/client";
import { approvalRequests, users, workItems } from "../src/db/schema";
import { PRIVATE_SHARE_TOOL_REF } from "../src/proactive/private-share";
import { createWorkQueue, type WorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const KEY = "k".repeat(44);
const PERSON = `cr-person-${suite}`;
const IRIS = `cr-iris-${suite}`;
const OTTO = `cr-otto-${suite}`;
const CHANNEL = `cr-channel-${suite}`;
const ASK_THREAD = `cr-ask-${suite}`;
const TOOL = "google-imap/gmail_create_label";
const TARGET = { serverId: "google-imap", toolName: "gmail_create_label" };
const OTTO_DONE = "The label GitHub is created.";

const queue = createWorkQueue(database);

/** The conversation lookup of `index.ts`, in miniature: a hop's scratch thread maps to no channel. */
const sourceFor = async (run: {
  botId: string;
  threadId?: string;
  handoff?: unknown;
}) =>
  run.threadId === ASK_THREAD && (run.botId === IRIS || run.handoff)
    ? { channelId: CHANNEL, botId: IRIS }
    : null;

/** Everything the deployment builds, built from nothing but the database. Called again, it is a restart. */
function build() {
  /** What really ran at the connector. */
  const labels: string[] = [];
  /** The member runs the approval sweep started again from a saved call. */
  const continued: { threadId: string; resultContent: string }[] = [];
  const notices: string[] = [];
  /** The label the next hop's member tries to create. */
  const next = { label: "GitHub" };

  const service = createServerApprovalService({
    storedApprovals: createApprovalStore(database),
    config: { keyEncryptionKey: KEY },
    sourceForCoordinationRun: sourceFor as never,
    agentProfileStore: { get: async () => ({ name: "Otto" }) } as never,
    actorFor: async (id: string) => ({ id, role: "user" }) as never,
    database,
    authoriseQuestion: async () => undefined,
    routineIntelligence: {} as never,
    approvalComputerTools: async () => [],
    review: async () =>
      JSON.stringify({
        verdict: "needs_approval",
        preApproved: false,
        safety: "none",
        reason: "Nothing the person said asks for this.",
      }),
    notify: async (_scope, input) => {
      notices.push(input.text);
    },
  });

  const executor = createApprovedActionExecutor({
    sourceFor: sourceFor as never,
    gate: (candidate) => service.gate(candidate),
    computerTools: async () => [],
    hostTools: () => [],
    callTool: async (input) => {
      // The connector's own gate, which an approved action passes by its own authority.
      await service.gate({
        actorId: input.actorId,
        botId: input.botId,
        toolRef: input.ref,
        effect: "write",
        scope: "google-imap",
        args: input.args,
        target: TARGET,
      });
      labels.push(String(input.args.name));
      return { text: '{"ok":true}', isError: false };
    },
    credentialActorFor: async (actorId) => actorId,
    coordinationCall: async () => null,
    readRun: (value) => readApprovedRunAssertion(value, KEY),
    answer: (result) => result.text,
    privateShareToolRef: PRIVATE_SHARE_TOOL_REF,
    refusalMarker: "Refused:",
    personInitiator: { kind: "person" },
  });
  const executeApprovedAction = async (action: ApprovalAction) =>
    executor(action);

  /** Otto, run again from the saved call: he says what became of it. */
  const otto: TurnRunner = async ({ threadId, continuation }) => {
    if (!continuation) throw new Error("Only continuations run here.");
    continued.push({ threadId, resultContent: continuation.result.content });
    return {
      replyText: continuation.result.error
        ? `Not done: ${continuation.result.error}`
        : OTTO_DONE,
    };
  };

  /** The sweep, handed the one decision's work item, as the queue hands it after a decision. */
  async function sweep(approvalId: string) {
    const finished = new Set<string>();
    const handed = {
      claim: async () =>
        finished.has(approvalId)
          ? []
          : [
              {
                kind: "approval.resume",
                key: approvalId,
                payload: { ownerUserId: PERSON, approvalId },
                attempts: 1,
              },
            ],
      finish: async () => {
        finished.add(approvalId);
        return true;
      },
      release: async () => true,
    } as unknown as WorkQueue;
    await createApprovalResumeTick({
      approvalQueue: handed,
      approvalOwner: "replica",
      approvalService: service,
      executeApprovedAction,
      database,
      responsibilityStore: {} as never,
      groupConversations: { continueWaiting: (_id, run) => run() },
      approvalContinuationRunner: otto,
      channelStore: { recordActivity: async () => undefined } as never,
      actorFor: async (id: string) => ({ id }) as never,
      relayHop: createHopRelay({
        queue,
        database,
        readRun: (value) => readApprovedRunAssertion(value, KEY),
        askerOf: async (run) => (await sourceFor(run))?.botId ?? null,
      }),
      notify: async () => undefined,
    })();
  }

  /** Otto, delivered a hop: one gated call, in a scratch thread, ending with a pause or a refusal. */
  const ottoAgent = (): AbstractAgent => {
    const agent = {
      threadId: "",
      messages: [] as unknown[],
      setMessages(messages: unknown[]) {
        agent.messages = messages;
      },
      async runAgent(
        input: {
          runId: string;
          threadId: string;
          messages: never[];
          forwardedProps: unknown;
        },
        config: { onEvent: (emitted: { event: object }) => void },
      ) {
        const emit = (event: object) => config.onEvent({ event });
        emit({ type: "RUN_STARTED" });
        const say = (text: string) => {
          emit({ type: "TEXT_MESSAGE_START", messageId: "t" });
          emit({ type: "TEXT_MESSAGE_CONTENT", messageId: "t", delta: text });
          emit({ type: "TEXT_MESSAGE_END", messageId: "t" });
        };
        const args = { name: next.label };
        const continuation = {
          runId: input.runId,
          threadId: input.threadId,
          toolCallId: `call-${randomUUID()}`,
          toolName: "gmail_create_label",
          args,
          messages: input.messages,
          state: {},
          context: [],
          forwardedProps: input.forwardedProps,
          initiator: handoffInitiator(IRIS, { kind: "remote" }),
        };
        try {
          await withApprovalContext(continuation, () =>
            service.gate({
              actorId: PERSON,
              botId: OTTO,
              toolRef: TOOL,
              effect: "write",
              scope: "google-imap",
              args,
              target: TARGET,
            }),
          );
          say("It went through without a card.");
          emit({ type: "RUN_FINISHED" });
        } catch (error) {
          if (error instanceof HeadlessToolSuspension) {
            emit({
              type: "CUSTOM",
              name: "openbot.headless.waiting",
              value: {
                ...error.waiting,
                message: error.message,
                toolCallId: continuation.toolCallId,
              },
            });
            emit({ type: "RUN_FINISHED" });
          } else if (error instanceof ApprovalRefusedError) {
            say(error.message);
            emit({ type: "RUN_FINISHED" });
          } else throw error;
        }
      },
    };
    return agent as unknown as AbstractAgent;
  };

  /** The hand-off sweep. Every answer it carries is kept, by hop key. */
  const delivered: { work: HandoffWork; message: string }[] = [];
  let scratch = 0;
  const hops = createHandoffRunner({
    queue,
    owner: `replica-${randomUUID()}`,
    sign: (work, claim) => signHandoffDeliveryRun(work, KEY, undefined, claim),
    auditStore: createAuditStore(database),
    delivery: createHandoffDelivery({
      admission: serverTurnAdmission,
      agentFor: async (input) =>
        input.botId === OTTO
          ? ottoAgent()
          : ({
              threadId: "",
              setMessages: () => undefined,
              runAgent: async (
                _input: unknown,
                config: { onEvent: (emitted: { event: object }) => void },
              ) => config.onEvent({ event: { type: "RUN_FINISHED" } }),
            } as unknown as AbstractAgent),
      history: async () => [
        { id: "m1", role: "user", content: "Make a label called GitHub." },
      ],
      lock: {
        acquire: async () => ({ runId: `platform-${randomUUID()}` }),
        renew: async () => undefined,
        release: async () => undefined,
      } as never,
      mintThreadId: () => {
        scratch += 1;
        return `scratch-${suite}-${scratch}`;
      },
      newRunId: () => randomUUID(),
      runner: {
        run: (request) =>
          new Observable<BaseEvent>((subscriber) => {
            // As the platform's runner does: the agent's events, one by one, then the end.
            void (
              request.agent.runAgent as unknown as (
                input: unknown,
                config: { onEvent: (emitted: { event: BaseEvent }) => void },
              ) => Promise<void>
            )(request.input, {
              onEvent: ({ event }) => subscriber.next(event),
            }).then(
              () => subscriber.complete(),
              (error: unknown) => subscriber.error(error),
            );
          }),
      },
    }),
  });
  /** What the asking Bot (Iris) is handed in her own conversation, which is what the person is told. */
  const asker = createHandoffRunner({
    queue,
    owner: `replica-${randomUUID()}`,
    sign: () => "signed",
    auditStore: createAuditStore(database),
    delivery: {
      deliver: async ({ work, message }) => {
        delivered.push({ work, message });
        return { answer: null };
      },
    },
  });
  return {
    labels,
    continued,
    notices,
    next,
    service,
    sweep,
    hops,
    asker,
    delivered,
  };
}

let counter = 0;
/** What Iris's `message_bot` queued: one hop to Otto from the person's conversation. */
async function handOver(task = "Create the label GitHub.") {
  counter += 1;
  const key = `hop:${suite}:${counter}`;
  const work: HandoffWork = {
    fromBotId: IRIS,
    toBotId: OTTO,
    actorId: PERSON,
    threadId: ASK_THREAD,
    runId: `cr-run-${suite}-${counter}`,
    depth: 1,
    task,
    toName: "Otto",
  };
  await queue.offer({
    kind: HANDOFF_KIND,
    key,
    payload: work as unknown as Record<string, unknown>,
  });
  return key;
}

const cards = () =>
  database
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.ownerUserId, PERSON));
const relaysOf = (key: string) =>
  database
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.kind, HANDOFF_KIND),
        like(workItems.key, `relay:${key}%`),
      ),
    );

async function clean() {
  await database
    .delete(workItems)
    .where(sql`${workItems.payload}->>'actorId' = ${PERSON}`);
  await database
    .delete(approvalRequests)
    .where(eq(approvalRequests.ownerUserId, PERSON));
  await database.delete(users).where(eq(users.id, PERSON));
}
beforeAll(async () => {
  await clean();
  await database
    .insert(users)
    .values({ id: PERSON, email: `${PERSON}@example.test` });
});
afterAll(async () => {
  await clean();
  await database.$client.close();
});

describe("a card raised inside a hand-off", () => {
  test("is allowed once: the write runs once, and the answer is relayed to the Bot that asked", async () => {
    await clean();
    await database
      .insert(users)
      .values({ id: PERSON, email: `${PERSON}@example.test` });
    const stack = build();
    const key = await handOver();

    await stack.hops.sweep();

    // The hop held on one card; nothing ran, and the Bot that asked is told it is waiting.
    const [card] = await cards();
    expect(card?.status).toBe("pending");
    expect(stack.labels).toEqual([]);
    const [waiting] = await relaysOf(key);
    expect(JSON.stringify(waiting?.payload)).toContain("has not finished");

    await stack.service.decide(PERSON, card?.id as string, "allow_once");
    await stack.sweep(card?.id as string);

    // Exactly the one call ran, and Otto went on from its result in the hop's own thread.
    expect(stack.labels).toEqual(["GitHub"]);
    expect(stack.continued).toHaveLength(1);
    expect(stack.continued[0]?.threadId).toStartWith(`scratch-${suite}-`);
    // And what he said came home: a relay to Iris, in the conversation that asked.
    const [home] = await relaysOf(`${key}:card:${card?.id}`);
    expect(home?.payload).toMatchObject({
      fromBotId: OTTO,
      toBotId: IRIS,
      answerIn: ASK_THREAD,
      actorId: PERSON,
    });
    expect(JSON.stringify(home?.payload)).toContain(OTTO_DONE);
    await stack.asker.sweep();
    expect(
      stack.delivered.some(
        (entry) =>
          entry.work.toBotId === IRIS && entry.message.includes(OTTO_DONE),
      ),
    ).toBe(true);

    // Nothing runs twice: the same decision carried out again does nothing.
    await stack.sweep(card?.id as string);
    expect(stack.labels).toEqual(["GitHub"]);
    expect(stack.continued).toHaveLength(1);
    expect((await cards())[0]?.status).toBe("completed");
  });

  test("is allowed after a restart: nothing was held in memory", async () => {
    await clean();
    await database
      .insert(users)
      .values({ id: PERSON, email: `${PERSON}@example.test` });
    const before = build();
    const key = await handOver();
    await before.hops.sweep();
    const [card] = await cards();
    expect(card?.status).toBe("pending");

    // Every object is built again from the database alone.
    const after = build();
    await after.service.decide(PERSON, card?.id as string, "allow_once");
    await after.sweep(card?.id as string);

    expect(after.labels).toEqual(["GitHub"]);
    expect(before.labels).toEqual([]);
    const [home] = await relaysOf(`${key}:card:${card?.id}`);
    expect(JSON.stringify(home?.payload)).toContain(OTTO_DONE);
  });

  test("is refused: nothing runs, and the refusal is relayed as a refusal", async () => {
    await clean();
    await database
      .insert(users)
      .values({ id: PERSON, email: `${PERSON}@example.test` });
    const stack = build();
    const key = await handOver();
    await stack.hops.sweep();
    const [card] = await cards();

    await stack.service.decide(PERSON, card?.id as string, "deny");
    await stack.sweep(card?.id as string);

    expect(stack.labels).toEqual([]);
    const [home] = await relaysOf(`${key}:card:${card?.id}`);
    expect(JSON.stringify(home?.payload)).toContain("Not done:");
    expect(JSON.stringify(home?.payload)).toContain("declined");
    expect(JSON.stringify(home?.payload)).not.toContain(OTTO_DONE);
  });

  test("is not raised twice: the same call from a later hand-off of the same conversation reuses the open card", async () => {
    await clean();
    await database
      .insert(users)
      .values({ id: PERSON, email: `${PERSON}@example.test` });
    const stack = build();
    await handOver();
    await stack.hops.sweep();
    const secondKey = await handOver();
    await stack.hops.sweep();

    expect(await cards()).toHaveLength(1);
    // Otto was told one is already waiting, and Iris is told so by the relay.
    const [relay] = await relaysOf(secondKey);
    expect(JSON.stringify(relay?.payload)).toContain(
      ALREADY_WAITING.slice(0, 40),
    );
    expect(stack.labels).toEqual([]);
  });

  test("is raised again for a different call: cards with other arguments are not merged", async () => {
    await clean();
    await database
      .insert(users)
      .values({ id: PERSON, email: `${PERSON}@example.test` });
    const stack = build();
    await handOver();
    await stack.hops.sweep();
    stack.next.label = "Invoices";
    await handOver();
    await stack.hops.sweep();

    const open = await cards();
    expect(open).toHaveLength(2);
    expect(
      open.map((card) => (card.action.args as { name: string }).name).sort(),
    ).toEqual(["GitHub", "Invoices"]);
  });

  test("is raised again once the earlier card is decided: asking again is a new request", async () => {
    await clean();
    await database
      .insert(users)
      .values({ id: PERSON, email: `${PERSON}@example.test` });
    const stack = build();
    await handOver();
    await stack.hops.sweep();
    const [first] = await cards();
    await stack.service.decide(PERSON, first?.id as string, "deny");
    await stack.sweep(first?.id as string);
    await handOver();
    await stack.hops.sweep();

    expect(await cards()).toHaveLength(2);
  });
});

describe("the signed run that names the conversation", () => {
  test("a forged or foreign run is not read: only the deployment's own signature counts", () => {
    const run: RunAssertion = {
      botId: OTTO,
      actorId: PERSON,
      runId: "r",
      threadId: ASK_THREAD,
      depth: 1,
      handoff: { key: "k", owner: "o" },
    };
    const signed = mintRunAssertion(run, KEY);
    expect(readApprovedRunAssertion(signed, KEY)?.threadId).toBe(ASK_THREAD);
    expect(readApprovedRunAssertion(signed, "j".repeat(44))).toBeNull();
    expect(readApprovedRunAssertion("not-signed", KEY)).toBeNull();
    // `isApprovalRecheck` is imported for the executor's own probe; here it is simply not active.
    expect(isApprovalRecheck()).toBe(false);
  });
});
