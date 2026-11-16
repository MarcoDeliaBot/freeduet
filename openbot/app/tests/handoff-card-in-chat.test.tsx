import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotChatConfigurationProvider } from "@copilotkit/react-core/v2";
import { CopilotKitContext } from "@copilotkit/react-core/v2/context";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { lastHandoffLines } from "@/components/approvals/handoff-approvals";
import { ChatTranscript } from "@/components/channels/chat-transcript";
import {
  type ApprovalRequest,
  handoffRequestsWaiting,
  membersNamed,
} from "@/lib/approvals";
import { HANDED_OVER } from "@/lib/copilot/markers";
import { settleReactWork } from "./settle-react-work";

/**
 * D52: the card of a member Iris handed a job to appears in the conversation the person is writing in,
 * under the hand-off line: the same request the Tasks page lists, decided through the same route.
 */

const ASK_THREAD = "ask-thread";
let realFetch: typeof fetch;
let decisions: { id: string; body: unknown }[] = [];
let requests: ApprovalRequest[] = [];

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  realFetch = globalThis.fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  decisions = [];
  requests = [];
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = realFetch;
  GlobalRegistrator.unregister();
});

const roster = [
  { id: "inbox", name: "Otto" },
  { id: "freeduet", name: "Iris" },
];

function request(over: Partial<ApprovalRequest["action"]> = {}, id = "ap-1") {
  return {
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
    action: {
      botId: "inbox",
      toolRef: "google-imap/gmail_create_rule",
      effect: "write",
      scope: "google-imap",
      threadId: "scratch-1",
      toolCallId: `call-${id}`,
      askedIn: ASK_THREAD,
      args: { name: "GitHub" },
      target: {},
      policy: {
        behaviour: "ask",
        source: "review",
        reason: "Nothing asked for this.",
      },
      ...over,
    },
  } as ApprovalRequest;
}

function serving(): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/decision")) {
        decisions.push({
          id: url.split("/").at(-2) as string,
          body: JSON.parse(String(init?.body)),
        });
        // As the server does: the request is no longer waiting.
        requests = requests.map((r) => ({ ...r, status: "approved" }));
        return Response.json({ id: "ap-1", status: "approved" });
      }
      if (url.endsWith("/api/approvals"))
        return Response.json({ enabled: true, requests, questions: [] });
      if (url.startsWith("/api/agents"))
        return Response.json({ agents: roster });
      return Response.json({});
    },
    { preconnect: realFetch.preconnect },
  );
}

const handoff = (bot: string, id = "hand-1"): Message[] => [
  {
    id: `${id}-assistant`,
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id,
        type: "function",
        function: {
          name: "message_bot",
          arguments: JSON.stringify({ bot, task: "Make a rule." }),
        },
      },
    ],
  },
  {
    id: `${id}-result`,
    role: "tool",
    toolCallId: id,
    content: JSON.stringify(`${HANDED_OVER} Otto will answer.`),
  },
];
const talk = (...more: Message[][]): Message[] => [
  { id: "user-1", role: "user", content: "done" },
  ...more.flat(),
];

const noRenderers = {
  copilotkit: {
    // `message_bot` is drawn by the app (HandoffTool), so its line is never folded into a group.
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

function draw(messages: Message[], threadId = ASK_THREAD) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <CopilotKitContext.Provider value={noRenderers}>
      <CopilotChatConfigurationProvider agentId="freeduet" threadId={threadId}>
        <QueryClientProvider client={client}>
          <ChatTranscript messages={messages} />
        </QueryClientProvider>
      </CopilotChatConfigurationProvider>
    </CopilotKitContext.Provider>,
  );
}

test("the waiting card of the member Iris asked is drawn under the hand-off line, with the same buttons", async () => {
  requests = [request()];
  serving();
  const view = draw(talk(handoff("Otto")));
  await waitFor(() => expect(view.getByText("Allow once")).toBeTruthy());
  expect(view.getByText("Refuse")).toBeTruthy();
  expect(
    view.container.querySelectorAll("[data-handoff-approvals]"),
  ).toHaveLength(1);
});

test("deciding it in the chat sends the one decision to the one route, and the card then shows who decided", async () => {
  requests = [request()];
  serving();
  const view = draw(talk(handoff("otto")));
  fireEvent.click(await waitFor(() => view.getByText("Allow once")));
  await waitFor(() =>
    expect(decisions).toEqual([
      { id: "ap-1", body: { decision: "allow_once" } },
    ]),
  );
  await waitFor(() => expect(view.queryByText("Allow once")).toBeNull());
});

test("a card asked in another conversation, for another member, or already decided is not drawn", async () => {
  requests = [
    request({ askedIn: "another-thread" }, "ap-2"),
    request({ botId: "freeduet" }, "ap-3"),
    { ...request({}, "ap-4"), status: "completed" },
  ];
  serving();
  const view = draw(talk(handoff("Otto")));
  await settleReactWork();
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(view.queryByText("Allow once")).toBeNull();
  expect(view.container.querySelector("[data-handoff-approvals]")).toBeNull();
});

test("asked twice, the card is drawn once, under the last line that asked that member", async () => {
  requests = [request()];
  serving();
  const view = draw(talk(handoff("Otto", "hand-1"), handoff("Otto", "hand-2")));
  await waitFor(() => expect(view.getByText("Allow once")).toBeTruthy());
  expect(view.getAllByText("Allow once")).toHaveLength(1);
});

test("a hand-off that was turned away carries no card", () => {
  const items = [
    {
      kind: "tool",
      id: "a",
      toolCall: {
        function: { name: "message_bot", arguments: '{"bot":"Otto"}' },
      },
      result: JSON.stringify("Refused: paused."),
    },
  ];
  expect(lastHandoffLines(items).size).toBe(0);
});

test("the filter reads only this conversation's pending requests of the named members", () => {
  const rows = [
    request(),
    request({ askedIn: undefined }, "ap-5"),
    request({ askedIn: "x" }, "ap-6"),
  ];
  expect(
    handoffRequestsWaiting(rows, ASK_THREAD, new Set(["inbox"])).map(
      (r) => r.id,
    ),
  ).toEqual(["ap-1"]);
  expect(handoffRequestsWaiting(rows, undefined, new Set(["inbox"]))).toEqual(
    [],
  );
  expect(handoffRequestsWaiting(rows, ASK_THREAD, new Set())).toEqual([]);
  expect([...membersNamed(" OTTO ", roster)]).toEqual(["inbox"]);
});
