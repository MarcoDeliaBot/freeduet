import { describe, expect, test } from "bun:test";
import type { AbstractAgent, BaseEvent, Message } from "@ag-ui/client";
import type { HeadlessTool } from "@openbot/toolkit/headless-tools";
import { HeadlessToolsMiddleware } from "@openbot/toolkit/headless-tools";
import { Observable } from "rxjs";
import { createHandoffDelivery } from "../src/agents/handoff-delivery";
import type { HandoffWork } from "../src/agents/handoff-runner";
import { serverTurnAdmission } from "../src/agents/turn-admission";

/**
 * D22 (docs/M1_PLAN.md): a RELAY turn, the answer coming back to the Bot that asked, runs in the
 * person's own conversation and gets the Bot's computer as an ordinary turn there would. The FORWARD
 * hop runs in a scratch thread nobody sees and gets none (it keeps `tools: []`, so #61's note
 * explains it there). Before this, hand-off delivery passed `tools: []` to both, and a member that
 * went on researching after Iris's answer called a tool the CLI did not list (#61).
 */

const FORWARD: HandoffWork = {
  fromBotId: "freeduet",
  toBotId: "concierge",
  actorId: "user-1",
  threadId: "thread-1",
  runId: "run-1",
  depth: 1,
  task: "find three gift ideas",
};
const RELAY: HandoffWork = {
  ...FORWARD,
  fromBotId: "concierge",
  toBotId: "freeduet",
  answerIn: "thread-1",
};
// The relay as the runner makes it: Iris answers, the asking member (Jules) speaks in the thread.
const JULES_RELAY: HandoffWork = {
  ...FORWARD,
  fromBotId: "freeduet",
  toBotId: "concierge",
  answerIn: "thread-1",
  initiator: { kind: "person" },
};

const PRIOR: Message[] = [
  { id: "m1", role: "user", content: "gift for a colleague" },
];
const FINISHED = [{ type: "RUN_FINISHED" }] as unknown as BaseEvent[];

function navigate(): HeadlessTool {
  return {
    definition: {
      name: "computer_navigate",
      description: "Open a web page.",
      parameters: { type: "object", properties: { url: { type: "string" } } },
    },
    execute: async () => "{}",
  };
}

function stubAgent() {
  const used: unknown[] = [];
  const agent = {
    threadId: "",
    messages: [] as unknown[],
    setMessages(messages: unknown[]) {
      agent.messages = messages;
    },
    use(...middleware: unknown[]) {
      used.push(...middleware);
    },
  };
  return { agent: agent as unknown as AbstractAgent, used };
}

function deliver(
  work: HandoffWork,
  toolsForTurn?: Parameters<typeof createHandoffDelivery>[0]["toolsForTurn"],
) {
  const { agent, used } = stubAgent();
  const requests: { input: Record<string, unknown> }[] = [];
  const delivery = createHandoffDelivery({
    admission: serverTurnAdmission,
    ...(toolsForTurn ? { toolsForTurn } : {}),
    agentFor: async () => agent,
    history: async () => PRIOR,
    newRunId: () => "run-2",
    mintThreadId: () => "scratch-thread",
    lock: {
      acquire: async () => ({ runId: "platform-run" }),
      renew: async () => undefined,
      release: async () => undefined,
    },
    runner: {
      run: (request) => {
        requests.push({ input: request.input as Record<string, unknown> });
        return new Observable<BaseEvent>((subscriber) => {
          for (const event of FINISHED) subscriber.next(event);
          subscriber.complete();
        });
      },
    },
  });
  return {
    used,
    requests,
    run: () =>
      delivery.deliver({ work, message: "m", shown: "s", assertion: "signed" }),
  };
}

const names = (input: Record<string, unknown>) =>
  (input.tools as { name: string }[]).map((tool) => tool.name);

describe("the member's computer in a hand-off turn (D22)", () => {
  test("a relay turn offers the member's computer tools and runs them under the headless middleware", async () => {
    const asked: unknown[] = [];
    const turn = deliver(JULES_RELAY, async (input) => {
      asked.push(input);
      return [navigate()];
    });
    await turn.run();
    expect(names(turn.requests[0]?.input ?? {})).toEqual(["computer_navigate"]);
    expect(turn.used).toHaveLength(1);
    expect(turn.used[0]).toBeInstanceOf(HeadlessToolsMiddleware);
    // For the Bot the turn is for, as the person, under the hand-off's own initiator.
    expect(asked).toEqual([
      {
        ownerUserId: "user-1",
        agentId: "concierge",
        initiator: {
          kind: "handoff",
          id: "freeduet",
          origin: { kind: "person" },
        },
      },
    ]);
  });

  test("a notice that speaks in the person's conversation is a relay turn too", async () => {
    const turn = deliver(RELAY, async () => [navigate()]);
    await turn.run();
    expect(names(turn.requests[0]?.input ?? {})).toEqual(["computer_navigate"]);
  });

  test("the forward hop is never asked for a computer and keeps tools: []", async () => {
    let asked = 0;
    const turn = deliver(FORWARD, async () => {
      asked += 1;
      return [navigate()];
    });
    await turn.run();
    expect(asked).toBe(0);
    expect(turn.requests[0]?.input.tools).toEqual([]);
    expect(turn.used).toEqual([]);
  });

  test("a relay for a member with no computer to offer gets none", async () => {
    const turn = deliver(JULES_RELAY, async () => []);
    await turn.run();
    expect(turn.requests[0]?.input.tools).toEqual([]);
    expect(turn.used).toEqual([]);
  });

  test("without a computer source, as upstream has it, no hop gets any tool", async () => {
    const turn = deliver(JULES_RELAY);
    await turn.run();
    expect(turn.requests[0]?.input.tools).toEqual([]);
    expect(turn.used).toEqual([]);
  });

  test("a hidden tool is held by the middleware but not offered to the model", async () => {
    const hidden: HeadlessTool = { ...navigate(), hidden: true };
    const turn = deliver(JULES_RELAY, async () => [hidden]);
    await turn.run();
    expect(turn.requests[0]?.input.tools).toEqual([]);
    expect(turn.used).toHaveLength(1);
  });
});
