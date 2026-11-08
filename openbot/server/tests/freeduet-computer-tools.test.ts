import { describe, expect, test } from "bun:test";
import {
  type AbstractAgent,
  type BaseEvent,
  EventType,
  type Message,
  type RunAgentInput,
  type Tool,
} from "@ag-ui/client";
import type { GrantedTool } from "@openbot/toolkit/granted-tool";
import { z } from "zod";
import { buildAgents, standingRoleMessage } from "../src/copilot";

/**
 * A remote Bot using the computer the app offers it, in a browser chat.
 *
 * The app registers the computer as frontend tools (app/src/lib/copilot/computer-tools.tsx): they
 * travel in `RunAgentInput.tools` and the browser runs them. Found in a live run: Jules's
 * `computer_navigate` came back "unavailable for this headless turn", because copilot.ts wraps every
 * remote run that holds a server tool in HeadlessToolsMiddleware, which claimed every `computer_*`
 * call. Driven here through `buildAgents` (the `runWith` path) against a stand-in for agent-freeduet,
 * which announces a tool OpenBot has to run and ends the segment with RUN_FINISHED.
 */

const NAVIGATE: Tool = {
  name: "computer_navigate",
  description: "Open a web page and return its title and readable text.",
  parameters: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
};

const PAGE = JSON.stringify({
  ok: true,
  url: "https://example.com/",
  title: "Example Domain",
});

/** A server tool with `execute`, so the run is wrapped in HeadlessToolsMiddleware. */
const makePage: GrantedTool = {
  name: "make_page",
  ref: "openduet/make_page",
  description: "Make a page the person can open.",
  parameters: z.object({ title: z.string() }),
  execute: async () => "page made",
};

/** agent-freeduet: calls computer_navigate, then reads the page once the result is in the history. */
function fakeAgentFreeduet() {
  const requests: RunAgentInput[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const input = (await request.json()) as RunAgentInput;
      requests.push(input);
      const last = input.messages.at(-1);
      const body =
        last?.role === "tool"
          ? [
              {
                type: "TEXT_MESSAGE_START",
                messageId: "j2",
                role: "assistant",
              },
              {
                type: "TEXT_MESSAGE_CONTENT",
                messageId: "j2",
                delta: `The page says: ${last.content}`,
              },
              { type: "TEXT_MESSAGE_END", messageId: "j2" },
            ]
          : [
              {
                type: "TOOL_CALL_START",
                toolCallId: "call-nav",
                toolCallName: "computer_navigate",
              },
              {
                type: "TOOL_CALL_ARGS",
                toolCallId: "call-nav",
                delta: JSON.stringify({ url: "https://example.com" }),
              },
              { type: "TOOL_CALL_END", toolCallId: "call-nav" },
            ];
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        ...body,
        { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  return {
    requests,
    url: `http://localhost:${server.port}/`,
    [Symbol.dispose]: () => server.stop(true),
  };
}

async function jules(url: string) {
  const agents = await buildAgents(
    [
      {
        id: "researcher",
        name: "Jules",
        type: "remote_ag_ui" as const,
        endpoint: url,
        standingMessage: standingRoleMessage({
          id: "researcher",
          name: "Jules",
          title: "Researcher",
          roleDescription: "Jules's role description.",
        }),
      },
    ],
    { provider: "anthropic", defaultModel: "claude-test" },
    null,
    undefined,
    async () => [makePage],
  );
  return agents.researcher as AbstractAgent;
}

/** One POST from the browser: the runtime's per-request copy, run with the app's frontend tools. */
async function post(agent: AbstractAgent, messages: Message[], tools: Tool[]) {
  const chat: AbstractAgent = agent.clone();
  chat.threadId = "chat-thread";
  chat.setMessages(messages);
  const events: BaseEvent[] = [];
  await chat.runAgent({ runId: crypto.randomUUID(), tools }, {
    onEvent: ({ event }: { event: BaseEvent }) => events.push(event),
  } as never);
  return { chat, events, types: events.map((event) => event.type) };
}

const ASK: Message = {
  id: "u1",
  role: "user",
  content: "Open example.com and tell me what it says.",
};

describe("a remote Bot's computer call in a browser chat", () => {
  test("reaches the browser, and the browser's result reaches the Bot on the next POST", async () => {
    using agentFreeduet = fakeAgentFreeduet();
    const agent = await jules(agentFreeduet.url);

    const first = await post(agent, [ASK], [NAVIGATE]);
    expect(agentFreeduet.requests).toHaveLength(1);
    expect(agentFreeduet.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      "computer_navigate",
      "make_page",
    ]);
    // Passed through, not answered: the client sees the call and the end of the run.
    expect(first.types).toContain(EventType.TOOL_CALL_START);
    expect(first.types).not.toContain(EventType.TOOL_CALL_RESULT);
    expect(first.types.at(-1)).toBe(EventType.RUN_FINISHED);
    const call = first.chat.messages
      .flatMap((message) =>
        message.role === "assistant" ? (message.toolCalls ?? []) : [],
      )
      .find((toolCall) => toolCall.id === "call-nav");
    expect(call?.function.name).toBe("computer_navigate");
    expect(first.chat.messages.some((message) => message.role === "tool")).toBe(
      false,
    );

    // The browser runs computer_navigate and posts again with its result.
    const second = await post(
      agent,
      [
        ...first.chat.messages,
        { id: "result-1", role: "tool", toolCallId: "call-nav", content: PAGE },
      ],
      [NAVIGATE],
    );
    expect(agentFreeduet.requests).toHaveLength(2);
    expect(agentFreeduet.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-nav",
      content: PAGE,
    });
    expect(second.types).not.toContain(EventType.TOOL_CALL_RESULT);
    expect(second.types.at(-1)).toBe(EventType.RUN_FINISHED);
  });

  test("without a browser offering it, the call is still answered with the refusal", async () => {
    using agentFreeduet = fakeAgentFreeduet();
    const agent = await jules(agentFreeduet.url);
    const refusal = JSON.stringify({
      ok: false,
      error:
        "The tool computer_navigate is unavailable for this headless turn.",
    });

    const { events } = await post(agent, [ASK], []);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "TOOL_CALL_RESULT",
        toolCallId: "call-nav",
        content: refusal,
      }),
    );
    expect(agentFreeduet.requests).toHaveLength(2);
    expect(agentFreeduet.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-nav",
      content: refusal,
    });
  });
});
