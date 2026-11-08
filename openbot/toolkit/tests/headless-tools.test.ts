import { describe, expect, test } from "bun:test";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
  type Tool,
} from "@ag-ui/client";
import { from, type Observable } from "rxjs";
import {
  type HeadlessTool,
  HeadlessToolSuspension,
  HeadlessToolsMiddleware,
} from "../src/headless-tools";

/**
 * Which pending `computer_*` calls the middleware answers.
 *
 * A browser chat offers a remote Bot the computer as frontend tools: they arrive in the run's
 * `input.tools` and the browser runs them. A headless turn has no browser, so a computer call there
 * is the middleware's to answer, with the server-side tool when the turn holds one and a refusal
 * when it does not (an unanswered call would end the turn on a question nobody can answer).
 */

const NAVIGATE: Tool = {
  name: "computer_navigate",
  description: "Open a web page and return its title and readable text.",
  parameters: { type: "object", properties: { url: { type: "string" } } },
};

/** A server tool with `execute`, as copilot.ts hands one over (recall_personal_memory and the like). */
const MEMORY: HeadlessTool = {
  definition: {
    name: "recall_personal_memory",
    description: "Recall what the person asked to be remembered.",
    parameters: { type: "object", properties: {} },
  },
  execute: async () => "Nothing remembered.",
};

const REFUSAL = JSON.stringify({
  ok: false,
  error: "The tool computer_navigate is unavailable for this headless turn.",
});

/** A remote Bot: calls computer_navigate, then answers once the call's result is in its history. */
class ComputerBot extends AbstractAgent {
  readonly requests: RunAgentInput[] = [];
  run(input: RunAgentInput): Observable<BaseEvent> {
    this.requests.push(input);
    const answered = input.messages.some((message) => message.role === "tool");
    const lifecycle = (body: BaseEvent[]): BaseEvent[] => [
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
    return from(
      lifecycle(
        answered
          ? [
              {
                type: EventType.TEXT_MESSAGE_START,
                messageId: "reply",
                role: "assistant",
              },
              {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: "reply",
                delta: "Done.",
              },
              { type: EventType.TEXT_MESSAGE_END, messageId: "reply" },
            ]
          : [
              {
                type: EventType.TOOL_CALL_START,
                toolCallId: "call-nav",
                toolCallName: NAVIGATE.name,
                parentMessageId: "message-nav",
              },
              {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: "call-nav",
                delta: '{"url":"https://example.com"}',
              },
              { type: EventType.TOOL_CALL_END, toolCallId: "call-nav" },
            ],
      ),
    );
  }
}

async function run(bot: ComputerBot, tools: Tool[]) {
  const events: BaseEvent[] = [];
  bot.setMessages([{ id: "u1", role: "user", content: "Open example.com" }]);
  await bot.runAgent(
    { runId: "run-1", tools },
    { onEvent: ({ event }) => void events.push(event) },
  );
  return {
    events,
    types: events.map((event) => event.type),
    results: events.filter(
      (event) => event.type === EventType.TOOL_CALL_RESULT,
    ) as unknown as { toolCallId: string; content: string }[],
  };
}

describe("computer calls in HeadlessToolsMiddleware", () => {
  test("a computer tool the caller offered is left for the caller to run", async () => {
    const bot = new ComputerBot();
    bot.use(new HeadlessToolsMiddleware([MEMORY]));
    const { types, results } = await run(bot, [NAVIGATE]);
    expect(results).toEqual([]);
    expect(types).toContain(EventType.TOOL_CALL_START);
    expect(types.at(-1)).toBe(EventType.RUN_FINISHED);
    // Not continued: the browser runs the call and posts its result in a new run.
    expect(bot.requests).toHaveLength(1);
    expect(bot.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      "computer_navigate",
      "recall_personal_memory",
    ]);
    const pending = bot.messages.flatMap((message) =>
      message.role === "assistant" ? (message.toolCalls ?? []) : [],
    );
    expect(pending.map((call) => call.function.name)).toEqual([
      "computer_navigate",
    ]);
    expect(bot.messages.some((message) => message.role === "tool")).toBe(false);
  });

  test("a headless turn still refuses a computer call nobody offered, and the Bot is told", async () => {
    const bot = new ComputerBot();
    bot.use(new HeadlessToolsMiddleware([MEMORY]));
    const { types, results } = await run(bot, []);
    expect(results).toMatchObject([
      { toolCallId: "call-nav", content: REFUSAL },
    ]);
    expect(
      types.filter((type) => type === EventType.RUN_FINISHED),
    ).toHaveLength(1);
    expect(bot.requests).toHaveLength(2);
    expect(bot.requests[1]?.messages).toContainEqual(
      expect.objectContaining({
        role: "tool",
        toolCallId: "call-nav",
        content: REFUSAL,
        error:
          "The tool computer_navigate is unavailable for this headless turn.",
      }),
    );
  });

  test("a headless turn's own computer tool still runs, and its wait is not answered by the layer outside it", async () => {
    // A remote Bot in a routine: copilot.ts's layer (server tools only) is outside the turn's
    // layer, which holds the server-side computer and is waiting on the person.
    const bot = new ComputerBot();
    let executions = 0;
    const computer: HeadlessTool = {
      definition: NAVIGATE,
      execute: async () => {
        executions += 1;
        throw new HeadlessToolSuspension("Sign in to example.com first.", {
          kind: "computer_handoff",
        });
      },
    };
    bot.use(
      new HeadlessToolsMiddleware([MEMORY]),
      new HeadlessToolsMiddleware([computer]),
    );
    const { events, results } = await run(bot, [NAVIGATE]);
    expect(executions).toBe(1);
    expect(results).toEqual([]);
    expect(bot.requests).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: "interrupt",
        interrupts: [{ toolCallId: "call-nav", reason: "human_input" }],
      },
    });
  });
});
