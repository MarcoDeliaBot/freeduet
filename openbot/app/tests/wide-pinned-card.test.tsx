import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { InlineApproval } from "@/components/approvals/inline-approval";
import { type WideBand, WideProvider } from "@/freeduet/wide/band";
import {
  PinnedApprovalsProvider,
  PinnedApprovalsSlot,
} from "@/freeduet/wide/pinned";
import type { ApprovalRequest } from "@/lib/approvals";
import { settleReactWork } from "./settle-react-work";

/**
 * D55: on a wide screen the waiting card is pinned at the top of the conversation it belongs to. It is
 * the one request of the one inbox, drawn by the one card and decided through the one route: pinning
 * is a place. Its buttons are the ones the server offers for that request, no more and no fewer.
 */

let realFetch: typeof fetch;
let requests: ApprovalRequest[] = [];
let decisions: { id: string; body: unknown }[] = [];

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  realFetch = globalThis.fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  requests = [];
  decisions = [];
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = realFetch;
  GlobalRegistrator.unregister();
});

function request(
  over: Partial<ApprovalRequest["action"]> = {},
  status = "pending",
): ApprovalRequest {
  return {
    id: "ap-1",
    status,
    createdAt: "2026-11-16T10:00:00Z",
    action: {
      botId: "inbox",
      toolRef: "google-imap/gmail_send_reply",
      effect: "write",
      scope: "x@example.com",
      threadId: "t",
      toolCallId: "call-1",
      args: { to: "x@example.com", subject: "Visit", body: "Tuesday works." },
      target: {},
      policy: { behaviour: "ask", source: "review", reason: "Sends mail." },
      ...over,
    },
  } as ApprovalRequest;
}

function serving() {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/decision")) {
        decisions.push({
          id: url.split("/").at(-2) as string,
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({ id: "ap-1", status: "approved" });
      }
      if (url.endsWith("/api/approvals"))
        return Response.json({ enabled: true, requests, questions: [] });
      return Response.json({});
    },
    { preconnect: realFetch.preconnect },
  );
}

function conversation(band: WideBand, body: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const inner = (
    <div>
      <PinnedApprovalsSlot />
      <div data-testid="flow">{body}</div>
    </div>
  );
  return render(
    <QueryClientProvider client={client}>
      {band === "off" ? (
        inner
      ) : (
        <WideProvider value={band}>
          <PinnedApprovalsProvider>{inner}</PinnedApprovalsProvider>
        </WideProvider>
      )}
    </QueryClientProvider>,
  );
}

const line = <p>the tool's own line</p>;

test("wide: the waiting card is in the strip at the top, not in the flow, and it is the one request", async () => {
  requests = [request()];
  serving();
  const view = conversation(
    "full",
    <InlineApproval fallback={line} toolCallId="call-1" />,
  );
  const strip = view.container.querySelector("[data-pinned-approvals]");
  expect(strip).not.toBeNull();
  await waitFor(() =>
    expect(
      strip?.querySelector("[aria-label='Waiting for your approval']"),
    ).not.toBeNull(),
  );
  // Not a second card: nothing of it stays in the flow.
  expect(view.getByTestId("flow").textContent).toBe("");
  // The card is first in the conversation.
  expect(view.container.firstElementChild?.firstElementChild).toBe(
    strip as Element,
  );
});

test("wide: Allow once decides the same request through the same route as Tasks", async () => {
  requests = [request()];
  serving();
  const view = conversation(
    "full",
    <InlineApproval fallback={line} toolCallId="call-1" />,
  );
  fireEvent.click(await view.findByRole("button", { name: "Allow once" }));
  await waitFor(() => expect(decisions).toHaveLength(1));
  expect(decisions[0]).toEqual({
    id: "ap-1",
    body: { decision: "allow_once" },
  });
});

test("wide: the buttons are exactly what the card offers today, with the real labels", async () => {
  requests = [request()];
  serving();
  const ask = conversation(
    "full",
    <InlineApproval fallback={line} toolCallId="call-1" />,
  );
  await ask.findByRole("button", { name: "Allow once" });
  expect(ask.getAllByRole("button").map((b) => b.textContent)).toEqual(
    expect.arrayContaining(["Refuse", "Allow once", "Always allow"]),
  );
  cleanup();
  // A new email is asked every time: there is nothing to always allow, wide or not.
  requests = [
    request({
      policy: { behaviour: "ask", source: "always_ask", reason: "New mail." },
    }),
  ];
  const every = conversation(
    "full",
    <InlineApproval fallback={line} toolCallId="call-1" />,
  );
  await every.findByRole("button", { name: "Allow once" });
  expect(every.queryByRole("button", { name: "Always allow" })).toBeNull();
  cleanup();
  // A hand-off card keeps its own two answers.
  requests = [
    request({
      policy: { behaviour: "hand_off", source: "rule", reason: "Yours." },
    }),
  ];
  const hand = conversation(
    "full",
    <InlineApproval fallback={line} toolCallId="call-1" />,
  );
  await hand.findByRole("button", { name: "I did it myself" });
  expect(hand.getByRole("button", { name: "Don't do it" })).toBeTruthy();
  expect(hand.queryByRole("button", { name: "Allow once" })).toBeNull();
});

test("below 1024 the card stays in the flow exactly as before, with no strip", async () => {
  requests = [request()];
  serving();
  const view = conversation(
    "off",
    <InlineApproval fallback={line} toolCallId="call-1" />,
  );
  await view.findByRole("button", { name: "Allow once" });
  expect(view.container.querySelector("[data-pinned-approvals]")).toBeNull();
  expect(
    view
      .getByTestId("flow")
      .querySelector("[aria-label='Waiting for your approval']"),
  ).not.toBeNull();
  // The phone card has no coral edge and no "Waiting for your OK" line.
  expect(view.container.innerHTML).not.toContain("wide-coral");
  expect(view.queryByText("Waiting for your OK")).toBeNull();
});

test("wide: the edge is coral while it waits, and green once it is done", () => {
  const view = render(
    <WideProvider value="full">
      <ApprovalCard request={request()} onDecide={() => {}} />
    </WideProvider>,
  );
  const waiting = view.getByLabelText("Waiting for your approval");
  expect(waiting.className).toContain("border-l-[var(--wide-coral)]");
  expect(waiting.className).not.toContain("border-l-duet-green");
  expect(view.getByText("Waiting for your OK")).toBeTruthy();
  cleanup();
  const done = render(
    <WideProvider value="full">
      <ApprovalCard request={request({}, "completed")} />
    </WideProvider>,
  );
  const card = done.container.firstElementChild as HTMLElement;
  expect(card.className).toContain("border-l-duet-green");
  expect(card.className).not.toContain("border-l-[var(--wide-coral)]");
});
