import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { WaitingForYou } from "@/components/approvals/waiting";
import { queryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

/**
 * The approvals inbox names a member the person renamed by that name AND its own
 * (docs/design/settings-in-chat.md, 8.10.1): it is where they decide an action, so a label of their
 * own must not be able to stand for another member there.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(() => {
  cleanup();
  queryClient.clear();
  global.fetch = originalFetch;
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;

const AGENTS = [
  { id: "scout", name: "Kiki", realName: "Scout" },
  { id: "otto", name: "Otto" },
];

function serving(inbox: Record<string, unknown>) {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/approvals") return Response.json(inbox);
    if (url.startsWith("/api/agents")) return Response.json({ agents: AGENTS });
    return Response.json({});
  }) as unknown as typeof fetch;
}

const request = (botId: string) => ({
  id: `request-${botId}`,
  status: "pending",
  decision: null,
  result: null,
  createdAt: new Date().toISOString(),
  decidedAt: null,
  action: {
    botId,
    toolRef: "gmail/GMAIL_SEND_EMAIL",
    effect: "write",
    scope: "ana@hearth.example",
    threadId: "thread",
    toolCallId: `call-${botId}`,
    args: { subject: "Ship date" },
    target: {},
    policy: { behaviour: "ask", source: "rule", reason: "Emails ask first." },
  },
});

const question = (botId: string) => ({
  id: `question-${botId}`,
  botId,
  threadId: `thread-${botId}`,
  question: "Which deck?",
  createdAt: new Date().toISOString(),
});

function draw() {
  return render(
    <QueryClientProvider client={queryClient}>
      <WaitingForYou />
    </QueryClientProvider>,
  );
}

test("an action waiting on the person names a renamed member by both names", async () => {
  serving({ requests: [request("scout"), request("otto")], questions: [] });
  const view = draw();

  expect(await view.findByText(/Kiki \(Scout\) wants to/)).toBeTruthy();
  // A member nobody renamed is as it was.
  expect(view.getByText(/^Otto wants to/)).toBeTruthy();
});

test("a question waiting on the person names a renamed member by both names", async () => {
  serving({ requests: [], questions: [question("scout"), question("otto")] });
  const view = draw();

  expect(
    await view.findByText(/Kiki \(Scout\) asks: Which deck\?/),
  ).toBeTruthy();
  expect(view.getByText(/^Otto asks: Which deck\?/)).toBeTruthy();
});
