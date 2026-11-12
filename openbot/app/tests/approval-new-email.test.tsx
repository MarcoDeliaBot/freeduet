import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { ApprovalCard, FOLD_CHARS } from "@/components/approvals/approval-card";
import type { ApprovalRequest } from "@/lib/approvals";
import { describeApproval } from "@/lib/approval-view";
import { readToolName } from "@/lib/plugins/tool-name";

/**
 * The card a new email waits behind, and what it can and cannot offer.
 *
 * A new email (`gmail_send_message`) that the person's own message did not name goes through the
 * private-share check, asked about every time (docs/M1_PLAN.md, D27). The card has to show the whole
 * email, every recipient, the subject and every character of the body, and has to offer Allow once and
 * Refuse only: the server refuses "Always allow" for it, so a button for it would be a promise nobody
 * keeps.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(() => cleanup());
afterAll(() => GlobalRegistrator.unregister());

const BODY = `Good morning, Ana.\n\n${"The kiln is back and the mugs ship on Tuesday. ".repeat(14)}\nHave a lovely day.\nMaya`;

function request(
  source?: "always_ask" | "default",
  overrides: Record<string, unknown> = {},
): ApprovalRequest {
  return {
    id: "approval-1",
    status: "pending",
    decision: null,
    result: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    action: {
      botId: "bot-1",
      toolRef: "openbot/share_private_information",
      effect: "share_private",
      scope: "external:ana@example.com, bob@example.org",
      threadId: "t",
      args: {
        audience: "google-imap: ana@example.com, bob@example.org",
        recipients: 2,
        to: ["ana@example.com", "bob@example.org"],
        subject: "Good morning",
        body: BODY,
        contentDigest: "9f2c",
        ...overrides,
      },
      target: {},
      ...(source
        ? {
            policy: {
              behaviour: "ask",
              source,
              reason: "A new email is asked about every time.",
            },
          }
        : {}),
    },
  } as unknown as ApprovalRequest;
}

test("the view names every recipient, the subject and the whole body", () => {
  const view = describeApproval(request("always_ask"));
  expect(view.title).toBe("Send email");
  expect(view.fields).toEqual([
    { label: "To", value: "ana@example.com, bob@example.org" },
    { label: "Subject", value: "Good morning" },
  ]);
  expect(view.body).toBe(BODY);
  expect(BODY.length).toBeGreaterThan(FOLD_CHARS);
});

test("copied and hidden recipients, if a call ever carried them, are shown too", () => {
  const view = describeApproval(
    request("always_ask", {
      cc: ["carla@example.com"],
      bcc: ["dan@example.com"],
    }),
  );
  expect(view.fields).toEqual([
    { label: "To", value: "ana@example.com, bob@example.org" },
    { label: "Cc", value: "carla@example.com" },
    { label: "Bcc", value: "dan@example.com" },
    { label: "Subject", value: "Good morning" },
  ]);
});

test("the card holds the whole body and says how much there is, with no cut", () => {
  const view = render(
    <ApprovalCard onDecide={() => {}} request={request("always_ask")} />,
  );
  const body = view.getByText(
    (_, element) => element?.textContent === BODY && element.tagName === "P",
  );
  // Folded for reading, never cut: the last line of the email is in the page.
  expect(body.textContent).toEndWith("Have a lovely day.\nMaya");
  expect(view.getByRole("button", { name: /Show all/ }).textContent).toContain(
    `Show all ${BODY.length.toLocaleString()} characters`,
  );
  expect(view.getByText("ana@example.com, bob@example.org")).toBeTruthy();
  expect(view.getByText("Good morning")).toBeTruthy();
});

test("a new email offers Allow once and Refuse, and no Always allow", () => {
  const view = render(
    <ApprovalCard onDecide={() => {}} request={request("always_ask")} />,
  );
  expect(view.queryByRole("button", { name: /Always allow/ })).toBeNull();
  expect(view.getByRole("button", { name: /Allow once/ })).toBeTruthy();
  expect(view.getByRole("button", { name: /Refuse/ })).toBeTruthy();
});

test("any other send still offers Always allow, so the missing button is the policy's and not the card's", () => {
  const view = render(<ApprovalCard onDecide={() => {}} request={request()} />);
  expect(view.getByRole("button", { name: /Always allow/ })).toBeTruthy();
});

test("the step is named like a reply: it is sending the person's email", () => {
  for (const key of ["google-workspace", "google-imap"]) {
    const ref = `mcp__${key}__gmail_send_message`;
    expect(readToolName(ref, true).label).toBe("Sending your email");
    expect(readToolName(ref).label).toBe("Sent your email");
    expect(readToolName(ref, "plain").label).toBe("Send your email");
  }
});
