import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import * as ReactCoreV2 from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { observeApprovalAgent } from "@/lib/copilot/approval-context";
import { useFrontendTool } from "@/lib/copilot/approval-tools";

/**
 * The handler the SDK keeps for a computer change.
 *
 * The SDK registers a frontend tool's handler once and never re-registers it when the handler's
 * closure changes, so anything the handler reads from render time is frozen at first render. The
 * handler used to read the "Ask before making changes" switch that way, saw it still loading, and
 * sent every change straight to the computer outside any run; the server then answered "This action
 * needs an authenticated run before it can be approved." This drives the handler the SDK actually
 * kept, captured at first render, with no inbox loaded at all.
 *
 * Spies on the module namespace rather than `mock.module`, because bun cannot take a module mock
 * back off: it would stay installed for every test file walked into the same process afterwards,
 * and those files would get this fake SDK instead of the real one. These spies are restored below.
 */

type Registered = Parameters<typeof ReactCoreV2.useFrontendTool>[0];
const registered: Registered[] = [];
const stopped: unknown[] = [];
const useCopilotKitSpy = spyOn(ReactCoreV2, "useCopilotKit").mockImplementation(
  () =>
    ({
      copilotkit: { stopAgent: (input: unknown) => stopped.push(input) },
    }) as never,
);
function register<T extends Record<string, unknown>>(
  tool: ReactCoreV2.ReactFrontendTool<T>,
) {
  if (!registered.some((entry) => entry.name === tool.name))
    registered.push(tool as unknown as Registered);
}
const useFrontendToolSpy = spyOn(
  ReactCoreV2,
  "useFrontendTool",
).mockImplementation(register);
afterAll(() => {
  useCopilotKitSpy.mockRestore();
  useFrontendToolSpy.mockRestore();
});

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

const direct: unknown[] = [];
function Tools() {
  useFrontendTool({
    name: "computer_click",
    description: "Click",
    handler: async (args: Record<string, unknown>) => {
      direct.push(args);
      return { clicked: true };
    },
  });
  return null;
}

test("a change goes to the server's gate even when nothing about approvals has loaded", async () => {
  const posted: { path: string; body: unknown }[] = [];
  const originalFetch = global.fetch;
  global.fetch = Object.assign(
    async (path: Parameters<typeof fetch>[0], init?: RequestInit) => {
      posted.push({
        path: String(path),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Response.json(
        { waiting: true, approvalId: "approval-1" },
        { status: 202 },
      );
    },
    { preconnect: originalFetch.preconnect },
  );
  try {
    const queries = new QueryClient();
    const invalidated: unknown[] = [];
    const invalidate = queries.invalidateQueries.bind(queries);
    queries.invalidateQueries = ((filters?: unknown) => {
      invalidated.push(filters);
      return invalidate(filters as never);
    }) as typeof queries.invalidateQueries;
    render(
      <QueryClientProvider client={queries}>
        <Tools />
      </QueryClientProvider>,
    );
    const tool = registered.find((entry) => entry.name === "computer_click");
    // The shape of the SDK's agent the handler reads: its subscriber hooks, thread and history.
    const toolCall = {
      id: "click-call",
      type: "function" as const,
      function: {
        name: "computer_click",
        arguments: '{"ref":"e7","snapshotId":3}',
      },
    };
    const subscribers: {
      onRunInitialized?: (input: { input: unknown }) => void;
    }[] = [];
    const agent = {
      threadId: "thread",
      state: {},
      messages: [
        { id: "u1", role: "user", content: "Submit the form" },
        { id: "a1", role: "assistant", content: "", toolCalls: [toolCall] },
      ],
      subscribe: (subscriber: (typeof subscribers)[number]) => {
        subscribers.push(subscriber);
        return { unsubscribe: () => undefined };
      },
    };
    const stop = observeApprovalAgent(agent as never);
    for (const subscriber of subscribers)
      subscriber.onRunInitialized?.({
        input: {
          runId: "run-1",
          threadId: "thread",
          messages: agent.messages,
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      });
    const result = await tool?.handler?.({ ref: "e7", snapshotId: 3 }, {
      agent,
      toolCall,
    } as never);
    stop();
    expect(direct).toEqual([]);
    expect(posted).toEqual([
      {
        path: "/api/approvals/computer/default",
        body: expect.objectContaining({
          runId: "run-1",
          threadId: "thread",
          toolCallId: "click-call",
          toolName: "computer_click",
          args: { ref: "e7", snapshotId: 3 },
        }),
      },
    ]);
    expect(result).toEqual({ waiting: true });
    expect(stopped).toHaveLength(1);
    // The card is drawn now, not on the inbox's next poll.
    expect(invalidated).toEqual([{ queryKey: ["approvals"] }]);
  } finally {
    global.fetch = originalFetch;
  }
});

/**
 * A change the server's gate could not make is a result for the Bot, never a throw.
 *
 * The SDK turns a handler that throws into an "Error: <message>" tool message and runs no follow-up
 * (core executeSpecificTool: `if (!handlerResult.error && tool?.followUp !== false) return true`), so
 * the conversation ended on the message with nothing from the Bot. Found in a live run (jules-3): a
 * click on a page that had moved answered "Element f356e718 is not on the page any more" through the
 * gate's 500, the handler threw it, and the booking turn ended in silence.
 */
async function handlerAnswer(answer: Response) {
  const originalFetch = global.fetch;
  global.fetch = Object.assign(async () => answer, {
    preconnect: originalFetch.preconnect,
  });
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Tools />
      </QueryClientProvider>,
    );
    const tool = registered.find((entry) => entry.name === "computer_click");
    const toolCall = {
      id: "click-call",
      type: "function" as const,
      function: {
        name: "computer_click",
        arguments: '{"ref":"f356e718","snapshotId":68}',
      },
    };
    const subscribers: {
      onRunInitialized?: (input: { input: unknown }) => void;
    }[] = [];
    const agent = {
      threadId: "thread",
      state: {},
      messages: [
        { id: "u1", role: "user", content: "Book the best-value plan." },
        { id: "a1", role: "assistant", content: "", toolCalls: [toolCall] },
      ],
      subscribe: (subscriber: (typeof subscribers)[number]) => {
        subscribers.push(subscriber);
        return { unsubscribe: () => undefined };
      },
    };
    const stop = observeApprovalAgent(agent as never);
    for (const subscriber of subscribers)
      subscriber.onRunInitialized?.({
        input: {
          runId: "run-1",
          threadId: "thread",
          messages: agent.messages,
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      });
    try {
      return await tool?.handler?.({ ref: "f356e718", snapshotId: 68 }, {
        agent,
        toolCall,
      } as never);
    } finally {
      stop();
    }
  } finally {
    global.fetch = originalFetch;
  }
}

test("a change the computer could not make comes back as a result the Bot reads, not a throw", async () => {
  const stale =
    "Element f356e718 is not on the page any more. Take a fresh snapshot and use the refs from it.";
  const result = await handlerAnswer(
    Response.json({ error: stale }, { status: 500 }),
  );
  expect(result).toEqual({ ok: false, reason: stale });
});

test("a gate answer with no reason, no result or no JSON at all is a failed result too", async () => {
  expect(await handlerAnswer(Response.json({}, { status: 500 }))).toEqual({
    ok: false,
    reason: "The computer action could not be approved.",
  });
  expect(
    await handlerAnswer(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    ),
  ).toEqual({
    ok: false,
    reason: "The computer action could not be approved.",
  });
  expect(await handlerAnswer(Response.json({ done: true }))).toEqual({
    ok: false,
    reason: "The computer action returned no result.",
  });
});

test("a change the gate lets through still returns the server's result", async () => {
  expect(
    await handlerAnswer(
      Response.json({ result: { ok: true, clicked: "Book" } }),
    ),
  ).toEqual({ ok: true, clicked: "Book" });
});
