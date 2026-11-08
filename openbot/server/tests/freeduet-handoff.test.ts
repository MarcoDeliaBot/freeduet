import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AbstractAgent, BaseEvent, RunAgentInput } from "@ag-ui/client";
import { HANDED_OVER } from "@openbot/shared/handoff-markers";
import type { GrantedTool } from "@openbot/toolkit/granted-tool";
import { Observable } from "rxjs";
import { z } from "zod";
import { createActorAgentResolver } from "../src/agents/agent-resolver";
import {
  mintRunAssertion,
  type RunAssertion,
  readRunAssertion,
} from "../src/agents/callback-token";
import { createHandoffDelivery } from "../src/agents/handoff-delivery";
import {
  createHandoffRunner,
  type HandoffWork,
} from "../src/agents/handoff-runner";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import { createCoordinationTools } from "../src/agents/handoff-tool";
import type { AgentActor } from "../src/agents/profile-types";
import { createApprovedActionExecutor } from "../src/approvals/execute";
import { createApprovalService } from "../src/approvals/service";
import type {
  ApprovalAction,
  ApprovalPolicyOutcome,
  ApprovalPreferences,
  ApprovalRecord,
  ApprovalRule,
  ApprovalStore,
  ApprovalTeamRule,
} from "../src/approvals/types";
import type { AuditStore } from "../src/audit";
import {
  buildAgents,
  type HandoffForRun,
  standingRoleMessage,
} from "../src/copilot";
import {
  coordinationRunsInBand,
  markFreeDuetPackage,
} from "../src/freeduet/coordination";
import { withRunChannels } from "../src/openduet/run-channel";
import type { WorkItem, WorkQueue } from "../src/work/queue";

/**
 * FreeDuet's members handing work to each other (docs/M1_PLAN.md §5), driven through OpenBot's own
 * wiring with a stand-in for agent-freeduet at the other end of the AG-UI POST.
 *
 * Three things the maintainer saw fail on a real run, each pinned here:
 *
 * 1. What a hop sends a remote member. The standing role is NOT first: OpenBot's personal-memory and
 *    channel middleware run inside the one that adds it and put their own rows in front, while a
 *    browser chat clones the agent and loses them. agent-freeduet refused every hop for that reason.
 *    The payloads recorded here are the fixtures agent-freeduet's own tests replay
 *    (agent-freeduet/tests/fixtures/handoff_*_run.json); a change on either side fails one of them.
 * 2. Why Iris's `message_bot` to Penny was refused on the callback, and why neither asking again nor
 *    a team rule could have got it through.
 * 3. The fix: a FreeDuet member runs `message_bot` in-band, where the approval gate reads the
 *    conversation and can ask the person; and a member's answer is relayed into Iris's conversation.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "../../agent-freeduet/tests/fixtures");
const KEY = "freeduet-handoff-test-key-not-a-real-one";
const ACTOR = "person-1";
const MANAGED_TOKEN = "managed-token-for-tests";
const PERSON = { kind: "person" } as const;

const REFUSED =
  "Refused. That handoff was not sent: This action needs your approval, but it was not started from a conversation that can ask you. Nothing was done. Ask for it in a chat with this Bot, or change your rules in Settings → Approvals.";

// ── A stand-in for agent-freeduet ───────────────────────────────────────────────────────────────

type Reply = (input: RunAgentInput) => Record<string, unknown>[];

/** Answers the way agent-freeduet does: SSE data lines with keepalive comments between them. */
function fakeAgentFreeduet(reply: Reply) {
  const requests: RunAgentInput[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const input = (await request.json()) as RunAgentInput;
      requests.push(input);
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        ...reply(input),
        { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
      ];
      const body = events
        .map((event) => `data: ${JSON.stringify(event)}\n\n: keepalive\n\n`)
        .join("");
      return new Response(body, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  return {
    requests,
    url: `http://localhost:${server.port}/`,
    [Symbol.dispose]: () => server.stop(true),
  };
}

const said = (id: string, text: string) => [
  { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" },
  { type: "TEXT_MESSAGE_CONTENT", messageId: id, delta: text },
  { type: "TEXT_MESSAGE_END", messageId: id },
];

const toolCall = (id: string, name: string, args: unknown) => [
  { type: "TOOL_CALL_START", toolCallId: id, toolCallName: name },
  { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) },
  { type: "TOOL_CALL_END", toolCallId: id },
];

const member = (id: string, name: string, title: string, url: string) => ({
  id,
  name,
  type: "remote_ag_ui" as const,
  endpoint: url,
  headers: { "x-openbot-agent-token": MANAGED_TOKEN },
  standingMessage: standingRoleMessage({
    id,
    name,
    title,
    roleDescription: `${name}'s role description.`,
  }),
});

const makePage: GrantedTool = {
  name: "make_page",
  ref: "openduet/make_page",
  description: "Make a page the person can open.",
  parameters: z.object({ title: z.string() }),
  execute: async () => "page made",
};

// ── An in-memory approval store with the policy surface (as approvals-policy.test.ts) ──────────

function memoryApprovals(options: {
  preferences?: Partial<ApprovalPreferences>;
  teamRules?: ApprovalTeamRule[];
  rules?: ApprovalRule[];
}) {
  const requests = new Map<string, ApprovalRecord>();
  const decisions: ApprovalPolicyOutcome[] = [];
  const unused = async () => {
    throw new Error("unused");
  };
  const store: ApprovalStore = {
    enabled: async () => options.preferences?.enabled ?? false,
    setEnabled: async () => undefined,
    open: async (action: ApprovalAction) => {
      const existing = [...requests.values()].find(
        (row) => row.action.toolCallId === action.toolCallId,
      );
      if (existing) return existing;
      const row: ApprovalRecord = {
        id: `request-${requests.size + 1}`,
        ownerUserId: action.actorId,
        action,
        status: "pending",
        decision: null,
        result: null,
        createdAt: new Date(),
        decidedAt: null,
        consumedAt: null,
        completedAt: null,
      };
      requests.set(row.id, row);
      return row;
    },
    get: async (_owner, id) => requests.get(id) as ApprovalRecord,
    list: async () => [...requests.values()],
    decide: async (_owner, id, decision) => {
      const row = requests.get(id) as ApprovalRecord;
      Object.assign(row, {
        decision,
        status: decision === "deny" ? "denied" : "approved",
      });
      return row;
    },
    consume: async () => true,
    saveResult: async () => true,
    finish: async () => undefined,
    rules: async () => options.rules ?? [],
    revoke: async () => undefined,
    policy: {
      // OpenBot's defaults when the person has saved nothing (approvals/store.ts).
      preferences: async () => ({
        enabled: false,
        autoReview: true,
        hostCommands: "ask",
        ...options.preferences,
      }),
      setPreferences: unused,
      teamSettings: async () => ({
        enforceAutoReview: false,
        customRulesEnabled: true,
        hostCommandsCap: "allow",
      }),
      setTeamSettings: unused,
      teamRules: async () => options.teamRules ?? [],
      createRule: unused,
      createTeamRule: unused,
      revokeTeamRule: async () => undefined,
      updateRule: unused,
      updateTeamRule: unused,
      findEquivalent: async () => undefined,
      withdrawPending: async () => [],
      recordDecision: async ({ outcome }) => {
        decisions.push(outcome);
      },
    },
  };
  return { store, requests, decisions };
}

/** The reviewer, as the server's model call reaches it: one prompt in, one answer out. */
function reviewer(answer: object | Error) {
  const prompts: string[] = [];
  return {
    prompts,
    review: async (prompt: string) => {
      prompts.push(prompt);
      if (answer instanceof Error) throw answer;
      return JSON.stringify(answer);
    },
  };
}
const PROCEED = {
  verdict: "proceed",
  preApproved: true,
  safety: "none",
  reason: "The person asked for this.",
};
const NEEDS_APPROVAL = {
  verdict: "needs_approval",
  preApproved: false,
  safety: "none",
  reason: "No request text to check it against.",
};

/** The coordination tools as index.ts wires them (coordination-wiring.ts), with a desk that counts. */
function coordination(service: ReturnType<typeof createApprovalService>) {
  const sent: unknown[] = [];
  const tools = createCoordinationTools({
    desk: {
      send: async (input: unknown) => {
        sent.push(input);
        return { ok: true as const, toName: "Penny" };
      },
    } as never,
    caps: { maxDepth: 1, maxPerRun: 3 } as never,
    approvalGate: service.gate,
    botsReachableFrom: async (botId) =>
      botId === "freeduet" ? ["bookkeeper"] : ["freeduet"],
    auditStore: { insert: async () => undefined },
    authoriseRun: async () => true,
    route: async () => ({ reached: "the person in this conversation" }),
  });
  /** `coordinationForActor` in coordination-wiring.ts, for one person. */
  const forRun: HandoffForRun = async (botId, input) => {
    const assertion = readRunAssertion(input.forwardedProps?.openbotRun, KEY);
    const run: RunAssertion = assertion?.handoff
      ? assertion
      : {
          botId,
          actorId: ACTOR,
          runId: input.runId,
          threadId: input.threadId,
          depth: assertion?.depth ?? 0,
          initiator: assertion?.initiator ?? PERSON,
        };
    return (await tools.toolsForRun(run)).map((tool) => ({
      ...tool,
      execute: async (args: unknown) => {
        const result = await tools.call({
          name: tool.name,
          args: args as Record<string, unknown>,
          run,
        });
        if (!result) throw new Error("not dispatched");
        return result.text;
      },
    }));
  };
  return { tools, forRun, sent };
}

/** As `signRunForActor` does: a hop's signed statement is preserved, a person's run gets a new one. */
const signRun =
  (depth = 0) =>
  (botId: string, runId: string, threadId: string, previous?: unknown) =>
    typeof previous === "string" && readRunAssertion(previous, KEY)
      ? previous
      : mintRunAssertion(
          { botId, actorId: ACTOR, runId, threadId, depth, initiator: PERSON },
          KEY,
        );

/** IntelligenceAgentRunner, as far as a hop needs it: `agent.runAgent(input, { onEvent })`. */
const platformRunner = {
  run: ({ agent, input }: { agent: AbstractAgent; input: unknown }) =>
    new Observable<BaseEvent>((subscriber) => {
      agent
        .runAgent(
          input as never,
          {
            onEvent: ({ event }: { event: BaseEvent }) =>
              subscriber.next(event),
          } as never,
        )
        .then(
          () => subscriber.complete(),
          (error: unknown) => subscriber.error(error),
        );
    }),
};

/** A work queue in memory: what is offered is claimed by the next sweep, once. */
function memoryQueue() {
  const items = new Map<
    string,
    { payload: Record<string, unknown>; attempts: number; done: boolean }
  >();
  const queue = {
    offer: async ({
      key,
      payload = {},
    }: {
      key: string;
      payload?: Record<string, unknown>;
    }) => {
      if (items.has(key)) return "already";
      items.set(key, { payload, attempts: 0, done: false });
      return "queued";
    },
    claim: async () =>
      [...items.entries()]
        .filter(([, item]) => !item.done)
        .map(([key, item]) => {
          item.attempts += 1;
          return {
            kind: "bot.message",
            key,
            payload: item.payload,
            attempts: item.attempts,
          } as WorkItem;
        }),
    renew: async () => true,
    finish: async ({ key }: { key: string }) => {
      const item = items.get(key);
      if (item) item.done = true;
      return true;
    },
    release: async () => true,
    purge: async () => 0,
  } as unknown as WorkQueue;
  return { queue, items };
}

/** What a payload is made of, for comparing the one OpenBot sends with the recorded fixture. */
function shapeOf(input: RunAgentInput) {
  const forwarded = input.forwardedProps as Record<string, unknown>;
  return {
    messages: input.messages.map((message) => [message.id, message.role]),
    tools: input.tools.map((tool) => tool.name).sort(),
    context: input.context.map((entry) => entry.description),
    forwardedProps: Object.keys(forwarded).sort(),
    openbotBotId: forwarded.openbotBotId,
    openbotDeploymentTools: forwarded.openbotDeploymentTools,
  };
}

function fixture(name: string): RunAgentInput {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

/** Set FREEDUET_RECORD_FIXTURES=<folder> to write the payloads this file captures there. */
function record(name: string, input: RunAgentInput) {
  const folder = process.env.FREEDUET_RECORD_FIXTURES;
  if (folder)
    writeFileSync(join(folder, name), `${JSON.stringify(input, null, 2)}\n`);
}

// ── 1 and 3: a hop to Penny and the answer relayed to Iris, through OpenBot's own wiring ────────

describe("a hop to a FreeDuet member and the answer coming back", () => {
  test("Penny is sent her standing role behind the person's memory, and her answer reaches Iris's conversation", async () => {
    using agentFreeduet = fakeAgentFreeduet((input) => {
      const botId = (input.forwardedProps as Record<string, unknown>)
        .openbotBotId;
      return botId === "bookkeeper"
        ? said(
            "penny-1",
            "Northwind owes 1,200.00 EUR for March, 41 days late. A polite reminder is drafted on the page Northwind reminder.",
          )
        : said(
            "iris-2",
            "Penny says Northwind owes 1,200.00 EUR for March; her reminder draft is ready for you to check.",
          );
    });
    const { store } = memoryApprovals({});
    const team = coordination(createApprovalService(store));
    const resolver = withRunChannels(
      createActorAgentResolver({
        loadAgents: async () => [
          member("freeduet", "Iris", "Chief of Staff", agentFreeduet.url),
          member("bookkeeper", "Penny", "Bookkeeper", agentFreeduet.url),
        ],
        model: { provider: "anthropic", defaultModel: "claude-test" },
        resolveModelApiKey: async () => null,
        loadToolsForActor: () => async () => [makePage],
        signRunForActor: () => signRun(),
        handoffForActor: () => team.forRun,
        loadPersonalMemoryForActor: () => async () =>
          "The person runs a small design studio and invoices in EUR.",
      }),
      // Iris's conversation is the package channel "FreeDuet"; a hop's scratch thread is no channel.
      async (_owner, threadId) =>
        threadId === "iris-thread"
          ? {
              channelId: "freeduet",
              name: "FreeDuet",
              purpose:
                "Talk to Iris. She hands work to the team and brings the results back.",
            }
          : null,
    );
    const actor = { id: ACTOR, role: "user" } as unknown as AgentActor;
    const announced: {
      actorId: string;
      threadId: string;
      agentId: string;
      text: string;
    }[] = [];
    let runs = 0;
    const delivery = createHandoffDelivery({
      admission: async () => new AbortController().signal,
      agentFor: async ({ botId }) =>
        resolver.resolveAgentForActor(actor, botId),
      history: async ({ threadId }) =>
        threadId === "iris-thread"
          ? [
              {
                id: "person-1",
                role: "user",
                content: "Northwind still hasn't paid March's invoice.",
              },
              {
                id: "iris-1",
                role: "assistant",
                content: "I have asked Penny to check what Northwind owes.",
              },
            ]
          : [],
      runner: platformRunner as never,
      lock: {
        acquire: async ({ runId }: { runId: string }) => ({ runId }),
        renew: async () => true,
        release: async () => undefined,
      } as never,
      mintThreadId: () => "penny-scratch-thread",
      announce: async (input) => {
        announced.push(input);
      },
      newRunId: () => `hop-run-${++runs}`,
    });
    const audit: string[] = [];
    const { queue } = memoryQueue();
    const runner = createHandoffRunner({
      queue,
      delivery,
      owner: "replica-a",
      sign: (work, claim) =>
        signHandoffDeliveryRun(work, KEY, undefined, claim),
      auditStore: {
        insert: async (event) => {
          audit.push(event.eventType);
        },
      } as AuditStore,
    });
    const hop: HandoffWork = {
      fromBotId: "freeduet",
      toBotId: "bookkeeper",
      actorId: ACTOR,
      threadId: "iris-thread",
      runId: "iris-run",
      depth: 1,
      initiator: PERSON,
      task: "Check what Northwind owes for March and draft a polite reminder.",
      constraints: "Do not send anything.",
      expecting: "The amount, how late it is, and where the draft is.",
      fromName: "Iris",
      toName: "Penny",
    };
    await queue.offer({
      kind: "bot.message",
      key: "iris-run:penny",
      payload: hop as unknown as Record<string, unknown>,
    });

    // The forward hop: Penny, in a scratch thread of her own.
    expect((await runner.sweep()).delivered).toEqual(["bookkeeper"]);
    const toPenny = agentFreeduet.requests[0] as RunAgentInput;
    record("handoff_hop_run.json", toPenny);
    // FAULT 2: the first message is the person's memory, not Penny's standing role.
    expect(toPenny.messages[0]?.id).toBe("openbot:personal-memory");
    expect(toPenny.messages[1]?.id).toBe("standing-role:bookkeeper");
    expect(shapeOf(toPenny)).toEqual(shapeOf(fixture("handoff_hop_run.json")));

    // The relay: Iris, in the person's own conversation with her, carrying Penny's answer.
    expect((await runner.sweep()).delivered).toEqual(["freeduet"]);
    const toIris = agentFreeduet.requests[1] as RunAgentInput;
    record("handoff_relay_run.json", toIris);
    expect(toIris.threadId).toBe("iris-thread");
    expect(toIris.messages[0]?.id).toBe("openduet:channel");
    // iris-2 (#19): the relay is a hop at depth 1, and at BOT_HANDOFF_MAX_DEPTH=1 it offers Iris
    // no message_bot. agent-freeduet tells her exactly that (tool_notes.py, test_tool_notes.py).
    expect(
      readRunAssertion(
        (toIris.forwardedProps as Record<string, unknown>).openbotRun,
        KEY,
      )?.depth,
    ).toBe(1);
    expect(toIris.tools.map((tool) => tool.name)).not.toContain("message_bot");
    expect(shapeOf(toIris)).toEqual(shapeOf(fixture("handoff_relay_run.json")));
    const relayed = toIris.messages.at(-1);
    expect(relayed?.role).toBe("user");
    expect(String(relayed?.content)).toContain(
      "It answered:\n\nNorthwind owes 1,200.00 EUR for March, 41 days late.",
    );
    // What Iris said there is announced in her conversation, where the person reads it. (Penny's
    // own turn is announced on her scratch thread, which the wiring maps to no channel.)
    expect(announced.map((entry) => entry.threadId)).toEqual([
      "penny-scratch-thread",
      "iris-thread",
    ]);
    expect(announced.slice(1)).toEqual([
      {
        actorId: ACTOR,
        threadId: "iris-thread",
        agentId: "freeduet",
        text: "Penny says Northwind owes 1,200.00 EUR for March; her reminder draft is ready for you to check.",
      },
    ]);
    expect(
      audit.filter((event) => event === "agent.handoff_delivered"),
    ).toHaveLength(2);
    expect(audit).not.toContain("agent.handoff_failed");
  });

  test("a browser chat clones the agent and keeps the memory and channel rows (#33)", async () => {
    using agentFreeduet = fakeAgentFreeduet(() => said("p", "Hello."));
    const resolver = withRunChannels(
      createActorAgentResolver({
        loadAgents: async () => [
          member("bookkeeper", "Penny", "Bookkeeper", agentFreeduet.url),
        ],
        model: { provider: "anthropic", defaultModel: "claude-test" },
        resolveModelApiKey: async () => null,
        loadPersonalMemoryForActor: () => async () =>
          "The person runs a small design studio and invoices in EUR.",
      }),
      async () => ({
        channelId: "c",
        name: "Invoices",
        purpose: "Penny keeps the invoices.",
      }),
    );
    const actor = { id: ACTOR, role: "user" } as unknown as AgentActor;
    // The runtime's per-request copy (`cloneAgentForRequest` in @copilotkit/runtime). It used to
    // be rebuilt from the constructor's middleware alone and lost the two rows a hop carries;
    // CloningRemoteAgent.clone keeps what `.use()` added (toolkit/src/copilotkit/agents.ts).
    const chat = (
      await resolver.resolveAgentForActor(actor, "bookkeeper")
    ).clone();
    chat.setMessages([{ id: "u1", role: "user", content: "Hi" }]);
    await chat.runAgent({ runId: "chat-run" });
    const toPenny = agentFreeduet.requests[0] as RunAgentInput;
    record("chat_clone_run.json", toPenny);
    expect(toPenny.messages.map((m) => m.id)).toEqual([
      "openduet:channel",
      "openbot:personal-memory",
      "standing-role:bookkeeper",
      "u1",
    ]);
    // Each also as a context entry, as on a hop: agent-freeduet says each once
    // (agent-freeduet/tests/test_handoffs.py replays this payload).
    expect(toPenny.context.map((entry) => entry.description)).toEqual([
      "OpenBot personal memory",
      "OpenDuet channel",
    ]);
    expect(shapeOf(toPenny)).toEqual(shapeOf(fixture("chat_clone_run.json")));
  });
});

// ── iris-2: "the messaging tool was unavailable" ────────────────────────────────────────────────

describe("iris-2: when Iris is not offered message_bot (#19)", () => {
  /*
   * Live run: "Get me a table for four on Friday at eight, somewhere quiet near the office." In one
   * run Iris handed it to Jules; in another she wrote the person a brief to paste, "the messaging
   * tool was unavailable". Her own turn always holds message_bot. The turn that does not is the
   * relay of Jules's answer: OpenBot runs it as a hop at the depth of the hop it answers
   * (handoff-runner.ts, `relay`), and at the default BOT_HANDOFF_MAX_DEPTH=1 `toolsForRun` offers
   * no message_bot there (handoff-tool.ts, `canHandOn`; `handoffTool` returns null at the cap too).
   * Iris could then neither pass Jules's question on nor send his result to Vera, and her prompt's
   * "with neither ... the brief ready to paste" took over. Whether the relay landed before the eval
   * runner stopped reading, and whether Jules's answer needed a follow-up, decided the outcome.
   * Not the fan-out cap (per run, one hop here), not the in-band switch (static per process: off
   * gives the "needs your approval" text, never "unavailable"), not concurrency.
   */
  const team = coordination(createApprovalService(memoryApprovals({}).store));
  const irisRun: RunAssertion = {
    botId: "freeduet",
    actorId: ACTOR,
    runId: "iris-run",
    threadId: "iris-thread",
    depth: 0,
    initiator: PERSON,
  };
  const names = async (run: RunAssertion) =>
    (await team.tools.toolsForRun(run)).map((tool) => tool.name);

  test("Iris's own turn holds message_bot; the relay of Jules's answer does not", async () => {
    // Her turn, and the person's next message after the relay: an ordinary run at depth 0.
    expect(await names(irisRun)).toEqual(["message_bot", "ask_person"]);
    expect(
      await names({
        ...irisRun,
        runId: "relay-run",
        depth: 1,
        handoff: { key: "relay:iris-run:jules", owner: "replica-a" },
      }),
    ).toEqual(["ask_person"]);
  });
});

// ── 2: why the hand-off was refused on the callback ──────────────────────────────────────────────

describe("Iris's message_bot through the callback, with OpenBot's default approval settings", () => {
  // The callback route: no approval context, because no conversation is behind it.
  const irisRun: RunAssertion = {
    botId: "freeduet",
    actorId: ACTOR,
    runId: "iris-run",
    threadId: "iris-thread",
    depth: 0,
  };
  const toPenny = {
    bot: "Penny",
    task: "Check what Northwind owes for March and draft a polite reminder.",
    constraints: "Do not send anything.",
  };

  test("auto-review is shown no request, says ask, and the callback cannot ask: the maintainer's refusal", async () => {
    const { store, decisions } = memoryApprovals({});
    const model = reviewer(NEEDS_APPROVAL);
    const service = createApprovalService(store, undefined, undefined, {
      review: model.review,
    });
    const team = coordination(service);
    const answer = await team.tools.call({
      name: "message_bot",
      args: toPenny,
      run: irisRun,
    });
    expect(answer).toEqual({ text: REFUSED, isError: true });
    expect(decisions).toEqual([
      expect.objectContaining({ behaviour: "ask", source: "auto_review" }),
    ]);
    // The reviewer never sees what the person asked for: the callback carries no conversation.
    expect(model.prompts[0]).toContain(
      "<request>\n(no request text was available)\n</request>",
    );
    expect(team.sent).toHaveLength(0);
  });

  test("a reviewer that is slow or unreachable fails closed to the same refusal", async () => {
    const { store, decisions } = memoryApprovals({});
    const service = createApprovalService(store, undefined, undefined, {
      review: reviewer(new Error("The operation timed out.")).review,
    });
    const answer = await coordination(service).tools.call({
      name: "message_bot",
      args: toPenny,
      run: irisRun,
    });
    expect(answer?.text).toBe(REFUSED);
    expect(decisions[0]).toMatchObject({
      behaviour: "ask",
      source: "auto_review",
      review: { failedClosed: true },
    });
  });

  test("a task that mentions payment is not taken for a payment: the reviewer decides, not the safety floor", async () => {
    const { store, decisions } = memoryApprovals({});
    const model = reviewer(PROCEED);
    const service = createApprovalService(store, undefined, undefined, {
      review: model.review,
    });
    const answer = await coordination(service).tools.call({
      name: "message_bot",
      args: { ...toPenny, task: "Draft a payment reminder for Northwind." },
      run: irisRun,
    });
    expect(answer?.text).not.toBe(REFUSED);
    expect(decisions).toEqual([
      expect.objectContaining({ source: "auto_review" }),
    ]);
    expect(model.prompts).toHaveLength(1);
  });

  test("neither asking the person again nor a team allow rule gets it through the callback", async () => {
    const teamRule: ApprovalTeamRule = {
      id: "freeduet-hub",
      botId: "freeduet",
      toolRef: "bot/message_bot",
      effect: "delegate",
      scope: "*",
      behaviour: "allow",
      revokedAt: null,
      createdAt: new Date(),
      createdBy: "freeduet-package",
    } as ApprovalTeamRule;
    const { store, decisions } = memoryApprovals({ teamRules: [teamRule] });
    const model = reviewer(NEEDS_APPROVAL);
    const service = createApprovalService(store, undefined, undefined, {
      review: model.review,
    });
    const team = coordination(service);
    // Once, and again after the person said yes in the chat: the callback has no way to carry it.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const answer = await team.tools.call({
        name: "message_bot",
        args: toPenny,
        run: irisRun,
      });
      expect(answer?.text).toBe(REFUSED);
    }
    // Auto-review outranks an allow rule (approvals/policy.ts, decideAction).
    expect(decisions.map((decision) => decision.source)).toEqual([
      "auto_review",
      "auto_review",
    ]);
    expect(
      model.prompts.every((prompt) =>
        prompt.includes("(no request text was available)"),
      ),
    ).toBe(true);
    expect(team.sent).toHaveLength(0);
  });
});

// ── 3: the fix, message_bot in-band for FreeDuet's members ──────────────────────────────────────

describe("a FreeDuet member runs message_bot in-band, under the approval gate", () => {
  const saved = {
    url: process.env.MANAGED_AGENT_AG_UI_URL,
    token: process.env.MANAGED_AGENT_TOKEN,
    router: process.env.FREEDUET_ROUTER,
  };
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  beforeEach(() => {
    process.env.MANAGED_AGENT_TOKEN = MANAGED_TOKEN;
    delete process.env.FREEDUET_ROUTER;
    markFreeDuetPackage(true);
  });
  afterEach(() => {
    markFreeDuetPackage(false);
    restore("MANAGED_AGENT_AG_UI_URL", saved.url);
    restore("MANAGED_AGENT_TOKEN", saved.token);
    restore("FREEDUET_ROUTER", saved.router);
  });

  const ask = {
    bot: "Penny",
    task: "Check what Northwind owes for March and draft a polite reminder.",
    constraints: "Do not send anything.",
  };
  const PERSON_SAID =
    "Northwind still hasn't paid March's invoice. Ask Penny to check what they owe and draft a reminder.";

  /** Iris at agent-freeduet: calls message_bot, then says one line once the result is back. */
  async function iris(review: { review: (prompt: string) => Promise<string> }) {
    const agentFreeduet = fakeAgentFreeduet((input) =>
      input.messages.at(-1)?.role === "tool"
        ? said("iris-2", "Penny has the Northwind invoice.")
        : toolCall("call-penny", "message_bot", ask),
    );
    process.env.MANAGED_AGENT_AG_UI_URL = agentFreeduet.url;
    const approvals = memoryApprovals({});
    const service = createApprovalService(
      approvals.store,
      undefined,
      undefined,
      { review: review.review },
    );
    const team = coordination(service);
    const agents = await buildAgents(
      [member("freeduet", "Iris", "Chief of Staff", agentFreeduet.url)],
      { provider: "anthropic", defaultModel: "claude-test" },
      null,
      undefined,
      async () => [makePage],
      signRun(),
      undefined,
      undefined,
      undefined,
      undefined,
      team.forRun,
      undefined,
      PERSON,
    );
    const agent = agents.freeduet as AbstractAgent;
    agent.threadId = "iris-thread";
    agent.setMessages([{ id: "person-1", role: "user", content: PERSON_SAID }]);
    const events: BaseEvent[] = [];
    const run = () =>
      agent.runAgent({ runId: "iris-run" }, {
        onEvent: ({ event }: { event: BaseEvent }) => events.push(event),
      } as never);
    return { agentFreeduet, approvals, service, team, events, run };
  }

  test("the gate reads what the person asked, and the hand-off goes out", async () => {
    const review = reviewer(PROCEED);
    const f = await iris(review);
    using _ = f.agentFreeduet;
    await f.run();
    const [first, second] = f.agentFreeduet.requests;
    // message_bot is no longer a callback tool for agent-freeduet; ask_person still is.
    expect(first?.forwardedProps.openbotDeploymentTools).toEqual([
      "ask_person",
    ]);
    expect(first?.tools.map((tool) => tool.name)).toContain("message_bot");
    expect(review.prompts[0]).toContain(PERSON_SAID);
    expect(f.approvals.decisions[0]).toMatchObject({ behaviour: "allow" });
    expect(f.team.sent).toHaveLength(1);
    const result = second?.messages.at(-1);
    expect(result?.role).toBe("tool");
    expect(String(result?.content)).toStartWith(HANDED_OVER);
  });

  test("when the gate says ask, the run waits for the person and the approved hand-off goes out once", async () => {
    const f = await iris(reviewer(NEEDS_APPROVAL));
    using _ = f.agentFreeduet;
    await f.run();
    expect(f.team.sent).toHaveLength(0);
    expect(
      f.events.some(
        (event) =>
          event.type === "CUSTOM" &&
          (event as { name?: string }).name === "openbot.headless.waiting",
      ),
    ).toBe(true);
    const [request] = await f.approvals.store.list(ACTOR);
    expect(request?.status).toBe("pending");
    expect(request?.action).toMatchObject({
      toolRef: "bot/message_bot",
      scope: "Penny",
      toolCallId: "call-penny",
      threadId: "iris-thread",
    });

    // The person allows it once: OpenBot's own resume carries it out (approvals/execute.ts).
    await f.service.decide(ACTOR, request?.id as string, "allow_once");
    const execute = createApprovedActionExecutor({
      sourceFor: async () => ({ channelId: "freeduet" }),
      gate: f.service.gate,
      computerTools: async () => [],
      hostTools: () => [],
      callTool: async () => {
        throw new Error("a hand-off is not a connector call");
      },
      credentialActorFor: async (actorId) => actorId,
      coordinationCall: (input) => f.team.tools.call(input),
      readRun: (value) => readRunAssertion(value, KEY),
      answer: (result) => result.text,
      privateShareToolRef: "openbot/private_share",
      refusalMarker: "Refused.",
      personInitiator: PERSON,
    });
    const continued: { content: string; error?: string }[] = [];
    await f.service.resume(ACTOR, request?.id as string, {
      validate: (action) =>
        f.service.validateReentry(action, () => execute(action)),
      execute,
      continue: async (input) => {
        continued.push(input.result);
      },
    });
    expect(f.team.sent).toHaveLength(1);
    expect(continued[0]?.content).toStartWith(HANDED_OVER);
  });

  test("every other Bot and package keeps the signed callback", async () => {
    const review = reviewer(PROCEED);
    markFreeDuetPackage(false);
    const f = await iris(review);
    using _ = f.agentFreeduet;
    await f.run();
    expect(
      f.agentFreeduet.requests[0]?.forwardedProps.openbotDeploymentTools,
    ).toEqual(["message_bot", "ask_person"]);
    expect(f.team.sent).toHaveLength(0);
  });

  test("only agent-freeduet, with the deployment token, while the router is on", () => {
    process.env.MANAGED_AGENT_AG_UI_URL = "http://localhost:4230/";
    const at = (endpoint: string, token = MANAGED_TOKEN) => [
      ...coordinationRunsInBand({
        endpoint,
        headers: { "x-openbot-agent-token": token },
      }),
    ];
    expect(at("http://localhost:4230")).toEqual(["message_bot"]);
    expect(at("http://localhost:8123/ag-ui")).toEqual([]);
    expect(at("http://localhost:4230/", "someone-else")).toEqual([]);
    process.env.FREEDUET_ROUTER = "off";
    expect(at("http://localhost:4230/")).toEqual([]);
    delete process.env.FREEDUET_ROUTER;
    markFreeDuetPackage(false);
    expect(at("http://localhost:4230/")).toEqual([]);
  });
});
