import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  type BaseEvent,
  EventType,
  HttpAgent,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import { inArray } from "drizzle-orm";
import { Observable } from "rxjs";
import { createHandoffDelivery } from "../src/agents/handoff-delivery";
import type { HandoffWork } from "../src/agents/handoff-runner";
import type { AgentProfile } from "../src/agents/profile-types";
import { serverTurnAdmission } from "../src/agents/turn-admission";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import { createServerApprovalService } from "../src/approvals/wiring";
import { createComputerGateway } from "../src/computer/gateway";
import type { CapabilitySwitches } from "../src/computer/offered";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { createFullAccess } from "../src/freeduet/full-access";
import { relayComputerTools } from "../src/freeduet/relay-computer";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * D22 end to end, through the real hand-off delivery, the real headless middleware, the real
 * computer gateway and the real approval store: a relay turn runs in the person's own conversation
 * and its computer is what an ordinary turn of that Bot would get; a gated call waits for the
 * person there, and nothing reaches the computer before they decide.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `relay-${randomUUID().slice(0, 8)}`;
const KEY = "k".repeat(44);
const owner = `${prefix}-owner`;
const stranger = `${prefix}-stranger`;
const jules = `${prefix}-jules`;
const store = createApprovalStore(database);
const service = createApprovalService(store, undefined, async () => {
  throw new Error("nothing is executed by the test's service");
});
const reached: string[] = [];

const gatewayWith = (approvalGate: (candidate: never) => Promise<unknown>) =>
  createComputerGateway({
    provider: {
      name: "test",
      isolation: "per-bot",
      locate: async () => "http://computer:4100",
      status: async (id) => ({ botId: id, state: "ready" }),
      list: async () => [],
      stop: async () => ({ wasRunning: true }),
      reset: async () => ({ cleared: true }),
    },
    auditStore: { insert: async () => undefined },
    policy: () => ({ mode: "enforce", allow: ["true"], deny: [] }),
    approvalGate: approvalGate as never,
    fetchImpl: (async (url: URL | RequestInfo, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      reached.push(path);
      if (path === "/navigate")
        return Response.json({
          url: "https://shop.example/",
          title: "Shop",
          text: "a gift",
          truncated: false,
          elapsedMs: 1,
        });
      return Response.json({
        action: "click",
        url:
          JSON.parse(String(init?.body ?? "{}")).url ?? "https://shop.example/",
        elapsedMs: 1,
      });
    }) as unknown as typeof fetch,
  });
const gateway = gatewayWith((candidate) => service.gate(candidate as never));

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  id: jules,
  name: "Jules",
  title: "Concierge",
  roleDescription: "",
  avatarSeed: "jules",
  visibility: "private",
  ownerUserId: owner,
  systemOwned: false,
  hidden: false,
  pinned: false,
  deletedAt: null,
  endpoint: null,
  hasAuth: false,
  hasCallbackToken: false,
  ...overrides,
});
const actorFor = async (id: string) => ({
  id,
  email: `${id}@example.test`,
  role: "user" as const,
});
const computerFor = (
  options: {
    gateway?: typeof gateway | undefined;
    profile?: AgentProfile | null;
    capabilities?: CapabilitySwitches;
  } = {},
) =>
  relayComputerTools({
    ...(options.capabilities
      ? { capabilitiesOf: async () => options.capabilities }
      : {}),
    computerGateway: "gateway" in options ? options.gateway : gateway,
    agentProfileStore: {
      get: async () =>
        ("profile" in options ? options.profile : profile()) ?? null,
    },
    actorFor: actorFor as never,
    auditStore: { insert: async () => undefined } as never,
  });

beforeAll(async () => {
  await database.insert(users).values([
    { id: owner, email: `${owner}@example.test` },
    { id: stranger, email: `${stranger}@example.test` },
  ]);
  await store.setEnabled(owner, true);
});
afterAll(async () => {
  await database.delete(users).where(inArray(users.id, [owner, stranger]));
  await database.$client.close();
});

const initiator = { kind: "person" as const };
const names = async (
  build: ReturnType<typeof computerFor>,
  agentId = jules,
  ownerUserId = owner,
) =>
  (await build({ ownerUserId, agentId, initiator })).map(
    (t) => t.definition.name,
  );

describe("which computer a relay turn is given", () => {
  test("the Bot's owner gets the computer an ordinary turn gets", async () => {
    const offered = await names(computerFor());
    expect(offered).toContain("computer_navigate");
    expect(offered).toContain("computer_click");
    expect(offered).toContain("computer_snapshot");
  });

  test("a deployment with no computer gives none", async () => {
    expect(await names(computerFor({ gateway: undefined }))).toEqual([]);
  });

  test("a Bot that is not the person's to drive gives none (a teammate of a Team Bot)", async () => {
    const theirs = profile({ ownerUserId: stranger, visibility: "private" });
    expect(await names(computerFor({ profile: theirs }))).toEqual([]);
  });

  test("a Bot that is not available to the person is refused, as a routine's turn is", async () => {
    await expect(names(computerFor({ profile: null }))).rejects.toThrow(
      "not available",
    );
  });
});

function julesRelay(
  threadId: string,
  tools: readonly string[] = [],
  computer: ReturnType<typeof computerFor> = computerFor(),
) {
  const requests: RunAgentInput[] = [];
  const agent = new HttpAgent({
    agentId: jules,
    url: "https://agent.example/ag-ui",
    fetch: async (_url, init) => {
      const input = JSON.parse(String(init?.body)) as RunAgentInput;
      requests.push(input);
      const last = input.messages.at(-1);
      const body: BaseEvent[] =
        last?.role === "tool"
          ? ([
              {
                type: EventType.TEXT_MESSAGE_START,
                messageId: "r",
                role: "assistant",
              },
              {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: "r",
                delta: "Done.",
              },
              { type: EventType.TEXT_MESSAGE_END, messageId: "r" },
            ] as BaseEvent[])
          : ([
              {
                type: EventType.TOOL_CALL_START,
                toolCallId: `call-${randomUUID()}`,
                toolCallName: tools[0] ?? "computer_click",
                parentMessageId: "m",
              },
            ] as BaseEvent[]);
      const id = (body[0] as { toolCallId?: string }).toolCallId;
      if (id) {
        body.push(
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: id,
            delta: JSON.stringify(
              tools[0] === "computer_navigate"
                ? { url: "https://shop.example/" }
                : { ref: "e7", snapshotId: 3 },
            ),
          } as BaseEvent,
          { type: EventType.TOOL_CALL_END, toolCallId: id } as BaseEvent,
        );
      }
      const events = [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        },
        ...body,
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const history: Message[] = [
    { id: "u1", role: "user", content: "Leaving present for a colleague" },
  ];
  const delivery = createHandoffDelivery({
    admission: serverTurnAdmission,
    toolsForTurn: computer,
    agentFor: async () => agent,
    history: async () => history,
    newRunId: () => randomUUID(),
    mintThreadId: () => `${prefix}-scratch-${randomUUID()}`,
    lock: {
      acquire: async (input) => ({ runId: input.runId }),
      renew: async () => undefined,
      release: async () => undefined,
    },
    runner: {
      run: ({ agent: selected, input }) =>
        new Observable<BaseEvent>((subscriber) => {
          (selected as HttpAgent)
            .runAgent(input as RunAgentInput, {
              onEvent: ({ event }) => subscriber.next(event),
            })
            .then(
              () => subscriber.complete(),
              (error) => subscriber.error(error),
            );
        }),
    },
  });
  const work = (answerIn?: string): HandoffWork => ({
    fromBotId: "freeduet",
    toBotId: jules,
    actorId: owner,
    threadId,
    runId: randomUUID(),
    depth: 1,
    task: "report",
    ...(answerIn ? { answerIn } : {}),
  });
  return { requests, delivery, work };
}

const pendingIn = async (threadId: string) =>
  (await store.list(owner)).filter(
    (request) =>
      request.action.threadId === threadId && request.status === "pending",
  );

describe("a relay turn that drives the computer", () => {
  test("a read-only call runs, because an ordinary turn would run it", async () => {
    reached.length = 0;
    const threadId = `${prefix}-thread-read`;
    const turn = julesRelay(threadId, ["computer_navigate"]);
    const { answer } = await turn.delivery.deliver({
      work: turn.work(threadId),
      message: "Iris answered: find a third idea",
      assertion: "signed",
    });
    expect(reached).toEqual(["/navigate"]);
    expect(answer).toBe("Done.");
    expect(turn.requests[0]?.tools.map((t) => t.name)).toContain(
      "computer_navigate",
    );
    expect(await pendingIn(threadId)).toEqual([]);
  });

  test("a gated call opens an approval in the person's conversation and nothing reaches the computer", async () => {
    reached.length = 0;
    const threadId = `${prefix}-thread-gated`;
    const turn = julesRelay(threadId, ["computer_click"]);
    await turn.delivery.deliver({
      work: turn.work(threadId),
      message: "Iris answered: go on",
      assertion: "signed",
    });
    const waiting = await pendingIn(threadId);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.action).toMatchObject({
      botId: jules,
      actorId: owner,
      threadId,
      toolRef: "computer_click",
    });
    // Nothing was approved on anybody's behalf, and nothing ran before a decision.
    expect(waiting[0]?.status).toBe("pending");
    expect(reached).toEqual([]);
    // Only the run's own call went to the model: the interrupted turn did not carry on.
    expect(turn.requests).toHaveLength(1);
  });
});

const forward = (turn: ReturnType<typeof julesRelay>, threadId: string) =>
  turn.delivery.deliver({
    work: turn.work(),
    message: "Iris asked you for this",
    assertion: signHandoffDeliveryRun(
      { ...turn.work(), threadId },
      KEY,
      undefined,
      { key: "hop-key", owner: "owner" },
    ),
  });

/*
 * D130: the FORWARD hop, the scratch thread where the colleague does the work, is offered the asked
 * member's computer exactly as the relay is, so a colleague's request can use the member's browser.
 * Its calls meet the same gateway and the same approval gate; a card is drawn in the conversation that
 * asked (D52); and the hop is not the person's own typed turn.
 */
describe("a forward hop that drives the computer (D130)", () => {
  test("a read-only call runs and the model is offered the browser tools", async () => {
    reached.length = 0;
    const threadId = `${prefix}-thread-fwd-read`;
    const turn = julesRelay(threadId, ["computer_navigate"]);
    const { answer } = await forward(turn, threadId);
    expect(reached).toEqual(["/navigate"]);
    expect(answer).toBe("Done.");
    expect(turn.requests[0]?.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["computer_navigate", "computer_read_pages"]),
    );
  });

  test("with the browser switched off no computer tool is offered and a call opens nothing", async () => {
    reached.length = 0;
    const threadId = `${prefix}-thread-fwd-nobrowser`;
    const turn = julesRelay(
      threadId,
      ["computer_navigate"],
      computerFor({ capabilities: { cloudBrowser: false } }),
    );
    await forward(turn, threadId);
    const offered = turn.requests[0]?.tools.map((t) => t.name) ?? [];
    // Files and commands are the computer switch's, not the browser's.
    for (const name of [
      "computer_navigate",
      "computer_read_pages",
      "computer_click",
      "computer_snapshot",
    ])
      expect(offered).not.toContain(name);
    expect(reached).toEqual([]);
  });

  test("with the network switched off opening pages is not offered, the rest of the browser is", async () => {
    const threadId = `${prefix}-thread-fwd-nonet`;
    const turn = julesRelay(
      threadId,
      ["computer_navigate"],
      computerFor({ capabilities: { cloudNetwork: false } }),
    );
    await forward(turn, threadId);
    const offered = turn.requests[0]?.tools.map((t) => t.name) ?? [];
    expect(offered).not.toContain("computer_navigate");
    expect(offered).not.toContain("computer_read_pages");
    expect(offered).toContain("computer_click");
  });

  test("a write call still asks: the card is drawn in the conversation that asked, and nothing runs", async () => {
    reached.length = 0;
    const askNotices: unknown[] = [];
    const asking = `${prefix}-thread-asking`;
    const wired = createServerApprovalService({
      storedApprovals: store,
      config: { keyEncryptionKey: KEY },
      sourceForCoordinationRun: (async (run: { threadId?: string }) =>
        run.threadId === asking
          ? { channelId: `${prefix}-channel`, botId: "iris" }
          : null) as never,
      agentProfileStore: { get: async () => ({ name: "Jules" }) } as never,
      actorFor: actorFor as never,
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
      notify: async (scope, input) => {
        askNotices.push({ scope, input });
      },
    });
    const turn = julesRelay(
      asking,
      ["computer_click"],
      relayComputerTools({
        computerGateway: gatewayWith((candidate) =>
          wired.gate(candidate as never),
        ),
        agentProfileStore: { get: async () => profile() },
        actorFor: actorFor as never,
        auditStore: { insert: async () => undefined } as never,
      }),
    );
    await forward(turn, asking);
    const waiting = (await store.list(owner)).filter(
      (request) =>
        request.status === "pending" && request.action.askedIn === asking,
    );
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.action).toMatchObject({
      botId: jules,
      actorId: owner,
      toolRef: "computer_click",
      askedIn: asking,
    });
    // The scratch thread is the run's own; the card belongs to the asking conversation.
    expect(waiting[0]?.action.threadId).not.toBe(asking);
    expect(askNotices).toHaveLength(1);
    expect(
      (askNotices[0] as { scope: { threadId: string } }).scope.threadId,
    ).toBe(asking);
    expect(reached).toEqual([]);
    expect(turn.requests).toHaveLength(1);
  });

  test("Full access on for the member does not lift the card in a hop the server cannot trace to the person's typed message", async () => {
    reached.length = 0;
    const fullAccess = createFullAccess({
      database,
      known: async () => true,
      handedRequest: async () => null,
    });
    await fullAccess.set(owner, jules, true, "full");
    const withFull = createApprovalService(
      store,
      undefined,
      async () => {
        throw new Error("nothing is executed by the test's service");
      },
      { fullAccess },
    );
    const threadId = `${prefix}-thread-fwd-full`;
    const turn = julesRelay(
      threadId,
      ["computer_click"],
      relayComputerTools({
        computerGateway: gatewayWith((candidate) =>
          withFull.gate(candidate as never),
        ),
        agentProfileStore: { get: async () => profile() },
        actorFor: actorFor as never,
        auditStore: { insert: async () => undefined } as never,
      }),
    );
    const pendingClicks = async () =>
      (await store.list(owner)).filter(
        (request) =>
          request.status === "pending" &&
          request.action.toolRef === "computer_click",
      ).length;
    const before = await pendingClicks();
    await forward(turn, threadId);
    // The card was opened, not skipped, and nothing reached the computer.
    expect(await pendingClicks()).toBe(before + 1);
    expect(reached).toEqual([]);
    await fullAccess.set(owner, jules, false);
  });
});
