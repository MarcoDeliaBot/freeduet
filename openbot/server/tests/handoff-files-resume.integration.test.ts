/**
 * D178: A FILE OFFERED AFTER A CARD IS RECORDED TOO, against a real database and real workspaces.
 *
 * D177 records the files a colleague offers during a forward hop (`handoff-files.ts`), but only for the
 * run the hop started. A hop that stops on a card and is allowed runs on through the approval sweep
 * (`approvals/resume-sweep.ts`), which used to see only the reply text. Live, 27 November 2026: Kai's
 * build stopped on a card, resumed after the person allowed it, and finished there.
 *
 * Real: the hand-off queue, the runner and `createHandoffDelivery`; the approval service as the
 * deployment wires it over the real store and policy; the approved action executor; the resume sweep; the
 * relay (`createHopRelay`) with the real recorder, store and profile rule; both computers' workspaces over
 * real temporary directories (behind a thin gateway that records each call). Stand-in: the member's
 * resumed turn, which reports its tool results through `onToolResult` as the turn runner does
 * (`toolkit/src/run-turn.ts`, covered in `routine-run-turn.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AbstractAgent, BaseEvent } from "@ag-ui/client";
import { offeredFileResult } from "@openbot/shared/member-file";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import type { TurnRunner } from "@openbot/toolkit/run-turn";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { Observable } from "rxjs";
import { createWorkspace } from "../../agent-computer/src/workspace";
import { readApprovedRunAssertion } from "../src/agents/callback-token";
import { HANDOFF_KIND } from "../src/agents/handoff";
import { createHandoffDelivery } from "../src/agents/handoff-delivery";
import {
  createForwardHopCheck,
  createHopRelay,
} from "../src/agents/handoff-resume";
import {
  createHandoffRunner,
  type HandoffWork,
} from "../src/agents/handoff-runner";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import { createAgentProfileStore } from "../src/agents/profile-store";
import { serverTurnAdmission } from "../src/agents/turn-admission";
import { createApprovedActionExecutor } from "../src/approvals/execute";
import { createApprovalResumeTick } from "../src/approvals/resume-sweep";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalAction,
  ApprovalRefusedError,
  withApprovalContext,
} from "../src/approvals/types";
import { createServerApprovalService } from "../src/approvals/wiring";
import { createAuditStore, handoffInitiator } from "../src/audit";
import type { ComputerGateway } from "../src/computer/gateway";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  approvalRequests,
  handoffFileOffers,
  userRoles,
  users,
  workItems,
} from "../src/db/schema";
import {
  createHandoffFileStore,
  handoffFileRecorder,
  offeredNote,
} from "../src/freeduet/handoff-files";
import { PRIVATE_SHARE_TOOL_REF } from "../src/proactive/private-share";
import { createWorkQueue, type WorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const KEY = "k".repeat(44);
const PERSON = `fr-person-${suite}`;
const IRIS = `fr-iris-${suite}`;
const KAI = `fr-kai-${suite}`;
const CHANNEL = `fr-channel-${suite}`;
const ASK_THREAD = `fr-ask-${suite}`;
const TOOL = "google-imap/gmail_create_label";
const TARGET = { serverId: "google-imap", toolName: "gmail_create_label" };
const GAME = "<!doctype html><title>Mattoncini</title><canvas></canvas>";
const KAI_DONE = "The game is built.";
const PATH = "out/mattoncini-pastello.html";

const queue = createWorkQueue(database);
const sourceFor = async (run: {
  botId: string;
  threadId?: string;
  handoff?: unknown;
}) =>
  run.threadId === ASK_THREAD && (run.botId === IRIS || run.handoff)
    ? { channelId: CHANNEL, botId: IRIS }
    : null;

let root = "";
const workspaces = new Map<string, ReturnType<typeof createWorkspace>>();
const dirs = new Map<string, string>();
const gateway: Pick<ComputerGateway, "downloadFile" | "writeFile"> = {
  async downloadFile(botId, _actor, input) {
    const file = await workspaces.get(botId)?.download(input.path);
    if (!file) throw new Error("no computer");
    return { body: file.body.stream(), bytes: file.bytes, name: file.name };
  },
  async writeFile(botId, _actor, input) {
    const done = await workspaces
      .get(botId)
      ?.write(input.path, input.contents, { append: input.append === true });
    if (!done) throw new Error("no computer");
    return done;
  },
};
const store = createHandoffFileStore(database);
const record = handoffFileRecorder({
  computerGateway: gateway,
  agentProfileStore: createAgentProfileStore(database, undefined),
  actorFor: async (id) => ({ id, role: "user" as const }),
  capabilitiesOf: async () => undefined as never,
  store,
});
const recordOfferedFiles = async ({
  work,
  files,
}: Parameters<
  NonNullable<Parameters<typeof createHopRelay>[0]["offeredFiles"]>
>[0]) => {
  const recorded = [];
  for (const file of files) {
    const done = await record({ work, file });
    if (done) recorded.push(done);
  }
  return recorded.length > 0
    ? offeredNote(work.toName ?? work.toBotId, recorded)
    : null;
};

type Offer = { path: string; tool?: string; botId?: string };

/** Everything the deployment builds, built from nothing but the database. */
function build() {
  /** What Kai's resumed run offers, in order. */
  const resumed: { offers: Offer[] } = { offers: [] };
  const service = createServerApprovalService({
    storedApprovals: createApprovalStore(database),
    config: { keyEncryptionKey: KEY },
    sourceForCoordinationRun: sourceFor as never,
    agentProfileStore: { get: async () => ({ name: "Kai" }) } as never,
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
    notify: async () => undefined,
  });
  const executor = createApprovedActionExecutor({
    sourceFor: sourceFor as never,
    gate: (candidate) => service.gate(candidate),
    computerTools: async () => [],
    hostTools: () => [],
    callTool: async (input) => {
      await service.gate({
        actorId: input.actorId,
        botId: input.botId,
        toolRef: input.ref,
        effect: "write",
        scope: "google-imap",
        args: input.args,
        target: TARGET,
      });
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

  /** Kai, run again from the saved call: he offers what the test says, then reports. */
  const kai: TurnRunner = async ({ continuation, onToolResult }) => {
    if (!continuation) throw new Error("Only continuations run here.");
    if (!continuation.result.error)
      for (const [index, offer] of resumed.offers.entries())
        onToolResult?.({
          name: offer.tool ?? "mcp__freeduet__offer_file",
          content: offeredFileResult(
            {
              botId: offer.botId ?? KAI,
              path: offer.path,
              name: offer.path.split("/").pop() ?? "x",
              bytes: 1,
            },
            `note ${index}`,
          ),
        });
    return {
      replyText: continuation.result.error
        ? `Not done: ${continuation.result.error}`
        : KAI_DONE,
    };
  };

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
      approvalContinuationRunner: kai,
      channelStore: { recordActivity: async () => undefined } as never,
      actorFor: async (id: string) => ({ id }) as never,
      relayHop: createHopRelay({
        queue,
        database,
        readRun: (value) => readApprovedRunAssertion(value, KEY),
        askerOf: async (run) => (await sourceFor(run))?.botId ?? null,
        offeredFiles: recordOfferedFiles,
      }),
      forwardHop: createForwardHopCheck({
        database,
        readRun: (value) => readApprovedRunAssertion(value, KEY),
      }),
      notify: async () => undefined,
    })();
  }

  /** Kai, delivered a hop: one gated call that ends in a pause. */
  const kaiAgent = (): AbstractAgent => {
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
        const args = { name: "Games" };
        const continuation = {
          runId: input.runId,
          threadId: input.threadId,
          toolCallId: `call-${randomUUID()}`,
          toolName: "gmail_create_label",
          args,
          messages: [...input.messages],
          state: {},
          context: [],
          forwardedProps: input.forwardedProps,
          initiator: handoffInitiator(IRIS, { kind: "remote" }),
        };
        try {
          await withApprovalContext(continuation, () =>
            service.gate({
              actorId: PERSON,
              botId: KAI,
              toolRef: TOOL,
              effect: "write",
              scope: "google-imap",
              args,
              target: TARGET,
            }),
          );
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
            emit({ type: "RUN_FINISHED" });
          } else throw error;
        }
      },
    };
    return agent as unknown as AbstractAgent;
  };

  let scratch = 0;
  const hops = createHandoffRunner({
    queue,
    owner: `replica-${randomUUID()}`,
    sign: (work, claim) => signHandoffDeliveryRun(work, KEY, undefined, claim),
    auditStore: createAuditStore(database),
    delivery: createHandoffDelivery({
      admission: serverTurnAdmission,
      agentFor: async () => kaiAgent(),
      history: async () => [],
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
      offeredFiles: recordOfferedFiles,
      runner: {
        run: (request) =>
          new Observable<BaseEvent>((subscriber) => {
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
  return { resumed, service, sweep, hops };
}

let counter = 0;
async function handOver() {
  counter += 1;
  const key = `hop:${suite}:${counter}`;
  const work: HandoffWork = {
    fromBotId: IRIS,
    toBotId: KAI,
    actorId: PERSON,
    threadId: ASK_THREAD,
    runId: `fr-run-${suite}-${counter}`,
    depth: 1,
    task: "Build an Arkanoid in one HTML file.",
    toName: "Kai",
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
const offers = () => store.list(PERSON, ASK_THREAD);

async function clean() {
  await database
    .delete(workItems)
    .where(sql`${workItems.payload}->>'actorId' = ${PERSON}`);
  await database
    .delete(approvalRequests)
    .where(eq(approvalRequests.ownerUserId, PERSON));
  await database
    .delete(handoffFileOffers)
    .where(eq(handoffFileOffers.ownerUserId, PERSON));
}

/** A hop that has stopped on its card, with Kai's resumed run set to offer `offered`. */
async function stoppedOnCard(offered: Offer[]) {
  await clean();
  const stack = build();
  stack.resumed.offers = offered;
  const key = await handOver();
  await stack.hops.sweep();
  const [card] = await cards();
  expect(card?.status).toBe("pending");
  return { stack, key, cardId: card?.id as string };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "handoff-files-resume-"));
  for (const id of [IRIS, KAI]) {
    const dir = join(root, id, "workspace");
    await mkdir(dir, { recursive: true });
    dirs.set(id, dir);
    workspaces.set(id, createWorkspace(dir));
  }
  await mkdir(join(dirs.get(KAI) as string, "out"), { recursive: true });
  await writeFile(join(dirs.get(KAI) as string, PATH), GAME);
  await writeFile(join(dirs.get(KAI) as string, "out", "other.html"), GAME);
  await database
    .insert(users)
    .values({ id: PERSON, email: `${PERSON}@example.test` });
  await database.insert(userRoles).values({ userId: PERSON, role: "user" });
  await database.insert(agents).values(
    [IRIS, KAI].map((id) => ({
      id,
      name: id,
      type: "remote_ag_ui" as const,
      configuration: {},
    })),
  );
  await database.insert(agentProfiles).values(
    [IRIS, KAI].map((id) => ({
      agentId: id,
      title: id,
      roleDescription: "",
      avatarSeed: id,
      visibility: "public" as const,
    })),
  );
});
afterAll(async () => {
  await clean();
  await rm(root, { recursive: true, force: true });
  await database.delete(agents).where(inArray(agents.id, [IRIS, KAI]));
  await database.delete(users).where(eq(users.id, PERSON));
  await database.$client.close();
});

describe("a file offered after a card in a hand-off", () => {
  test("is recorded: a card row, a read-only copy for the asker, and the server note in the relay", async () => {
    const { stack, key, cardId } = await stoppedOnCard([{ path: PATH }]);
    expect(await offers()).toEqual([]);

    await stack.service.decide(PERSON, cardId, "allow_once");
    await stack.sweep(cardId);

    const mine = await offers();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      askerBotId: IRIS,
      memberBotId: KAI,
      path: PATH,
      name: "mattoncini-pastello.html",
      copyPath: `in/${KAI}/mattoncini-pastello.html`,
    });
    expect(
      await readFile(
        join(dirs.get(IRIS) as string, "in", KAI, "mattoncini-pastello.html"),
        "utf8",
      ),
    ).toBe(GAME);
    const [home] = await relaysOf(`${key}:card:${cardId}`);
    const text = JSON.stringify(home?.payload);
    expect(text).toContain('Server note: \\"Kai\\" offered this file');
    expect(text).toContain(KAI_DONE);
    expect(text.indexOf("Server note")).toBeLessThan(text.indexOf(KAI_DONE));
  });

  test("is not recorded when the person refuses the card", async () => {
    const { stack, key, cardId } = await stoppedOnCard([{ path: PATH }]);
    await stack.service.decide(PERSON, cardId, "deny");
    await stack.sweep(cardId);
    expect(await offers()).toEqual([]);
    const [home] = await relaysOf(`${key}:card:${cardId}`);
    expect(JSON.stringify(home?.payload)).not.toContain("Server note");
  });

  test("the same file offered twice is one row, and a second file is a second row", async () => {
    const { stack, cardId } = await stoppedOnCard([
      { path: PATH },
      { path: PATH },
      { path: "out/other.html" },
    ]);
    await stack.service.decide(PERSON, cardId, "allow_once");
    await stack.sweep(cardId);
    expect((await offers()).map((row) => row.path).sort()).toEqual([
      PATH,
      "out/other.html",
    ]);
    // The same decision carried out again records nothing more.
    await stack.sweep(cardId);
    expect(await offers()).toHaveLength(2);
  });

  test("a file the first run already recorded stays one row when the resumed run offers it again", async () => {
    const { stack, key, cardId } = await stoppedOnCard([{ path: PATH }]);
    const [waiting] = await relaysOf(key);
    const hop = waiting?.payload as unknown as HandoffWork;
    await record({
      work: { ...hop, fromBotId: IRIS, toBotId: KAI },
      file: {
        botId: KAI,
        path: PATH,
        name: "mattoncini-pastello.html",
        bytes: 1,
      },
    });
    expect(await offers()).toHaveLength(1);
    await stack.service.decide(PERSON, cardId, "allow_once");
    await stack.sweep(cardId);
    expect(await offers()).toHaveLength(1);
  });

  test("a tool of another server that ends in offer_file records nothing", async () => {
    const { stack, cardId } = await stoppedOnCard([
      { path: PATH, tool: "mcp__x__offer_file" },
    ]);
    await stack.service.decide(PERSON, cardId, "allow_once");
    await stack.sweep(cardId);
    expect(await offers()).toEqual([]);
  });

  test("a result that names another member's computer records nothing", async () => {
    const { stack, cardId } = await stoppedOnCard([
      { path: PATH, botId: IRIS },
    ]);
    await stack.service.decide(PERSON, cardId, "allow_once");
    await stack.sweep(cardId);
    expect(await offers()).toEqual([]);
  });
});
