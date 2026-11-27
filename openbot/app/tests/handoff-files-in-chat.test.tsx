import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotChatConfigurationProvider } from "@copilotkit/react-core/v2";
import { CopilotKitContext } from "@copilotkit/react-core/v2/context";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ChatTranscript } from "@/components/channels/chat-transcript";
import type { HandoffFileRow } from "@/freeduet/handoff-files";
import { HANDED_OVER } from "@/lib/copilot/markers";
import { settleReactWork } from "./settle-react-work";

/**
 * D177: the file a colleague offered while working on a hand-off is drawn under the hand-off line, as the
 * same card as `offer_file`. The file is fetched only when Download is pressed.
 */

const ASK_THREAD = "ask-thread";
let realFetch: typeof fetch;
let files: HandoffFileRow[] = [];
let seen: string[] = [];

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  realFetch = globalThis.fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  files = [];
  seen = [];
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = realFetch;
  GlobalRegistrator.unregister();
});

const roster = [
  { id: "gamedev", name: "Kai" },
  { id: "designer", name: "Lumi" },
  { id: "freeduet", name: "Iris" },
];

const row = (over: Partial<HandoffFileRow> = {}): HandoffFileRow => ({
  id: "f-1",
  askerBotId: "freeduet",
  memberBotId: "gamedev",
  path: "out/mattoncini-pastello.html",
  name: "mattoncini-pastello.html",
  bytes: 24_576,
  copyPath: "in/gamedev/mattoncini-pastello.html",
  copyNote: null,
  createdAt: new Date().toISOString(),
  ...over,
});

function serving(): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/api/freeduet/handoff-files"))
        return Response.json({ files });
      if (url.startsWith("/api/agents"))
        return Response.json({ agents: roster });
      if (url.includes("/api/freeduet/work-status"))
        return Response.json({
          "work-status": { handoffs: [], members: [], at: "" },
        });
      return Response.json({});
    },
    { preconnect: realFetch.preconnect },
  );
}

const handoff = (bot: string): Message[] => [
  {
    id: "hand-1-assistant",
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "hand-1",
        type: "function",
        function: {
          name: "message_bot",
          arguments: JSON.stringify({ bot, task: "Build an Arkanoid." }),
        },
      },
    ],
  },
  {
    id: "hand-1-result",
    role: "tool",
    toolCallId: "hand-1",
    content: JSON.stringify(`${HANDED_OVER} Kai will answer.`),
  },
];

const noRenderers = {
  copilotkit: {
    renderToolCalls: [
      {
        name: "message_bot",
        agentId: undefined,
        args: undefined,
        render: () => <p>hand-off line</p>,
      },
    ],
    subscribe: () => ({ unsubscribe() {} }),
    registerOpenThread: () => ({ unregister() {}, update() {} }),
  },
  executingToolCallIds: new Set<string>(),
} as never;

function draw(messages: Message[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <CopilotKitContext.Provider value={noRenderers}>
      <CopilotChatConfigurationProvider agentId="freeduet" threadId={ASK_THREAD}>
        <QueryClientProvider client={client}>
          <ChatTranscript
            messages={[{ id: "u1", role: "user", content: "go" }, ...messages]}
          />
        </QueryClientProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitContext.Provider>,
  );
}

test("the file Kai offered is a card with Download under the hand-off line, and nothing is fetched until it is pressed", async () => {
  files = [row()];
  serving();
  const view = draw(handoff("Kai"));
  await waitFor(() => expect(view.getByText("Download")).toBeTruthy());
  expect(view.getByText("mattoncini-pastello.html")).toBeTruthy();
  expect(view.container.querySelectorAll("[data-handoff-files]")).toHaveLength(
    1,
  );
  expect(seen.some((url) => url.includes("/files/download"))).toBe(false);
  // The list was asked for this conversation only.
  expect(
    seen.some((url) => url.includes(`handoff-files?thread=${ASK_THREAD}`)),
  ).toBe(true);
});

test("a file of another member, or no file at all, draws nothing", async () => {
  files = [row({ memberBotId: "designer", id: "f-2" })];
  serving();
  const view = draw(handoff("Kai"));
  await settleReactWork();
  await waitFor(() =>
    expect(seen.some((url) => url.includes("handoff-files"))).toBe(true),
  );
  expect(view.queryByText("Download")).toBeNull();
  expect(view.container.querySelector("[data-handoff-files]")).toBeNull();
});
