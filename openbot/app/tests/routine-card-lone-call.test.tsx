import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotKitContext } from "@copilotkit/react-core/v2/context";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ChatTranscript } from "@/components/channels/chat-transcript";
import { settleReactWork } from "./settle-react-work";

/**
 * A routine written as the only call of its turn keeps a line of its own, and that line carries the
 * routine's card under it. A lone call that wrote no routine draws no card and reads no routine. The
 * folded run has its own test (routine-card-folded-run.test.tsx).
 */

const CREATE = "mcp__routines__create_routine";
const LIST = "mcp__routines__list_routines";

/** The sentence the routines tool answers a successful create with, as the transcript carries it. */
const CREATED = JSON.stringify(
  'That routine is set: "Post the standup summary." — Every weekday at 9:00 (Europe/Rome) · in Work · next 2026-11-16T08:00:00.000Z · never run · id: routine_1',
);

let realFetch: typeof fetch;
let fetched: string[] = [];

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  realFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  fetched = [];
});

afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = realFetch;
  GlobalRegistrator.unregister();
});

/** Serves the one routine the create made, and an empty approvals inbox. */
function serving(): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      fetched.push(url);
      if (url.endsWith("/api/approvals")) {
        return Response.json({ enabled: true, requests: [], questions: [] });
      }
      if (url.startsWith("/api/routines")) {
        return Response.json({
          routines: [
            {
              id: "routine_1",
              agentId: "bot_1",
              schedule: "Every weekday at 9:00",
              timezone: "Europe/Rome",
              instruction: "Post the standup summary.",
              channel: { id: "c1", name: "Work", gone: false },
              enabled: true,
              nextRunAt: "2026-11-16T08:00:00.000Z",
              lastRun: null,
            },
          ],
          sweep: { lastSweptAt: null, working: false },
        });
      }
      return Response.json({});
    },
    { preconnect: realFetch.preconnect },
  );
}

/** The person's message, then the Bot's one call, then the call's result. */
function turn(name: string, args: object, result: string): Message[] {
  return [
    {
      id: "user-1",
      role: "user",
      content: "Every weekday at 9, post the standup summary",
    },
    {
      id: "assistant-1",
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "toolu_1",
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    { id: "result-1", role: "tool", toolCallId: "toolu_1", content: result },
  ];
}

/** The transcript asks CopilotKit for a renderer per call. None is registered here, so each call is drawn by the transcript's own line. */
const noRenderers = {
  copilotkit: {
    renderToolCalls: [],
    subscribe: () => ({ unsubscribe() {} }),
  },
  executingToolCallIds: new Set<string>(),
} as never;

function draw(messages: Message[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <CopilotKitContext.Provider value={noRenderers}>
      <QueryClientProvider client={client}>
        <ChatTranscript messages={messages} />
      </QueryClientProvider>
    </CopilotKitContext.Provider>,
  );
}

test("a routine written as the only call of its turn gets its card under its line", async () => {
  serving();
  const view = draw(
    turn(
      CREATE,
      { instruction: "Post the standup summary.", schedule: "0 9 * * 1-5" },
      CREATED,
    ),
  );
  await waitFor(() =>
    expect(view.getByRole("region", { name: "Routine" }).textContent).toContain(
      "Next run: Monday, 16 November 2026 at 09:00 (Europe/Rome).",
    ),
  );
});

test("a lone call that wrote no routine draws no card and reads no routine", async () => {
  serving();
  const view = draw(turn(LIST, {}, JSON.stringify("none")));
  await settleReactWork();
  expect(view.queryByRole("region", { name: "Routine" })).toBeNull();
  expect(fetched.filter((url) => url.startsWith("/api/routines"))).toEqual([]);
});
