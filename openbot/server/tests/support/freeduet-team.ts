/**
 * What a test needs to put OpenBot's own wiring in front of a stand-in for agent-freeduet: a fake
 * AG-UI endpoint, a member registered at it, the approval service with an in-memory store, and the
 * coordination tools (`message_bot`) the way index.ts wires them. Shared by the suites that drive a
 * FreeDuet member through the real runtime pieces rather than a hand-made agent.
 */
import type { RunAgentInput } from "@ag-ui/client";
import type { GrantedTool } from "@openbot/toolkit/granted-tool";
import { z } from "zod";
import {
  mintRunAssertion,
  type RunAssertion,
  readRunAssertion,
} from "../../src/agents/callback-token";
import { createCoordinationTools } from "../../src/agents/handoff-tool";
import type { createApprovalService } from "../../src/approvals/service";
import type {
  ApprovalAction,
  ApprovalPolicyOutcome,
  ApprovalPreferences,
  ApprovalRecord,
  ApprovalRule,
  ApprovalStore,
  ApprovalTeamRule,
} from "../../src/approvals/types";
import { type HandoffForRun, standingRoleMessage } from "../../src/copilot";

export const KEY = "freeduet-team-test-key-not-a-real-one";
export const ACTOR = "person-1";
export const MANAGED_TOKEN = "managed-token-for-tests";
export const PERSON = { kind: "person" } as const;

type Reply = (input: RunAgentInput) => Record<string, unknown>[];

/**
 * Answers the way agent-freeduet does (agent-freeduet/freeduet/agui.py, segment.py): SSE data lines
 * with keepalive comments between them, RUN_STARTED first and a plain RUN_FINISHED last (no
 * `outcome`), with what `reply` returns in between. A call OpenBot has to run is announced with
 * TOOL_CALL_START, ARGS and END and never answered: the segment just ends.
 */
export function fakeAgentFreeduet(reply: Reply) {
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

export const said = (id: string, text: string) => [
  { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" },
  { type: "TEXT_MESSAGE_CONTENT", messageId: id, delta: text },
  { type: "TEXT_MESSAGE_END", messageId: id },
];

export const toolCall = (
  id: string,
  name: string,
  args: unknown,
  parentMessageId?: string,
) => [
  {
    type: "TOOL_CALL_START",
    toolCallId: id,
    toolCallName: name,
    ...(parentMessageId ? { parentMessageId } : {}),
  },
  { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) },
  { type: "TOOL_CALL_END", toolCallId: id },
];

export const member = (
  id: string,
  name: string,
  title: string,
  url: string,
) => ({
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

export const makePage: GrantedTool = {
  name: "make_page",
  ref: "openduet/make_page",
  description: "Make a page the person can open.",
  parameters: z.object({ title: z.string() }),
  execute: async () => "page made",
};

/** An in-memory approval store with the policy surface (as approvals-policy.test.ts). */
export function memoryApprovals(
  options: {
    preferences?: Partial<ApprovalPreferences>;
    teamRules?: ApprovalTeamRule[];
    rules?: ApprovalRule[];
  } = {},
) {
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
export function reviewer(answer: object | Error) {
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

export const NEEDS_APPROVAL = {
  verdict: "needs_approval",
  preApproved: false,
  safety: "none",
  reason: "No request text to check it against.",
};

/** The coordination tools as index.ts wires them (coordination-wiring.ts), with a desk that counts. */
export function coordination(
  service: ReturnType<typeof createApprovalService>,
) {
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
export const signRun =
  (depth = 0) =>
  (botId: string, runId: string, threadId: string, previous?: unknown) =>
    typeof previous === "string" && readRunAssertion(previous, KEY)
      ? previous
      : mintRunAssertion(
          { botId, actorId: ACTOR, runId, threadId, depth, initiator: PERSON },
          KEY,
        );
