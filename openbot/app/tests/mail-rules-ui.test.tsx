import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MailRulesSection,
  mailRuleStatus,
} from "@/components/connections/mail-rules-section";
import { describeApproval } from "@/lib/approval-view";
import type { ApprovalRequest } from "@/lib/approvals";
import type { MailRule } from "@/lib/plugins/mail-rules";
import { settleReactWork } from "./settle-react-work";

/**
 * Mail rules on screen (docs/design/mail-rules.md): the card that asks before a rule is made says the rule
 * in plain words, and the list on the Connections page shows each rule with its last run and a way to
 * switch it off and to delete it. There is no way to make one here.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const card = (tool: string, args: Record<string, unknown>) =>
  ({
    id: "a1",
    status: "pending",
    decision: null,
    result: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    action: {
      botId: "b",
      toolRef: `google-imap/${tool}`,
      effect: "write",
      scope: "*",
      threadId: "t",
      args,
      target: {},
    },
  }) as unknown as ApprovalRequest;

test("the card for a new rule reads From now on, mail from X: label Y and archive", () => {
  const view = describeApproval(
    card("gmail_create_rule", {
      fromDomain: "github.com",
      addLabels: ["GitHub"],
      archive: true,
    }),
  );
  expect(view.title).toBe("Create a mail rule");
  expect(view.kind).toBe("mail");
  expect(view.fields[0]).toEqual({
    label: "The rule",
    value:
      "From now on, mail from the domain github.com: label “GitHub” and archive.",
  });
  expect(view.fields[1]?.value).toContain("without asking again");
  expect(view.fields[1]?.value).toContain("not a Gmail filter");
  expect(view.fields[1]?.value).toContain("never forwards");
  expect(view.fields[1]?.value).not.toContain("already in your Inbox");
});

test("the card says when the rule is also applied to the mail already in the Inbox", () => {
  const view = describeApproval(
    card("gmail_create_rule", {
      fromAddress: "a@example.com",
      bin: true,
      applyToExisting: true,
    }),
  );
  expect(view.fields[0]?.value).toBe(
    "From now on, mail from a@example.com: move to the Bin.",
  );
  expect(view.fields[1]?.value).toContain(
    "applied once to the matching mail already in your Inbox",
  );
});

test("the card for changing a rule says what happens, and that mail it moved stays", () => {
  for (const [change, title] of [
    ["disable", "Switch off a mail rule"],
    ["enable", "Switch on a mail rule"],
    ["delete", "Delete a mail rule"],
  ] as const) {
    const view = describeApproval(
      card("gmail_disable_rule", { ruleId: "x", change }),
    );
    expect(view.title).toBe(title);
    expect(view.fields[0]?.value.length).toBeGreaterThan(20);
  }
  expect(
    describeApproval(
      card("gmail_disable_rule", { ruleId: "x", change: "delete" }),
    ).fields[0]?.value,
  ).toContain("stays where it is");
});

const RULE: MailRule = {
  id: "rule-1",
  serverId: "google-imap",
  inWords: "From now on, mail from the domain github.com: archive.",
  enabled: true,
  lastRunAt: "2026-11-15T09:05:00.000Z",
  lastMatched: 3,
  totalApplied: 12,
  lastError: null,
};

test("the status line says on or off, the last run and the total", () => {
  expect(mailRuleStatus({ ...RULE, lastRunAt: null })).toBe(
    "On. Has not run yet.",
  );
  expect(mailRuleStatus({ ...RULE, enabled: false })).toBe("Off");
  expect(mailRuleStatus(RULE)).toContain("3 messages. 12 in all.");
  expect(mailRuleStatus({ ...RULE, lastMatched: 1 })).toContain("1 message.");
});

const originalFetch = global.fetch;
let rules: MailRule[];
let sent: { method: string; path: string; body: unknown }[];
beforeEach(() => {
  rules = [{ ...RULE }];
  sent = [];
  global.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/plugins/mail-rules" && !init?.method)
        return Response.json({ rules });
      sent.push({
        method: init?.method ?? "GET",
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const id = path.split("/")[4];
      if (init?.method === "DELETE") rules = rules.filter((r) => r.id !== id);
      else
        rules = rules.map((r) =>
          r.id === id
            ? { ...r, enabled: JSON.parse(String(init?.body)).enabled }
            : r,
        );
      return Response.json({ ok: true });
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const mount = (browse = false) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MailRulesSection browse={browse} />
    </QueryClientProvider>,
  );
};

test("the list shows each rule in words with its last run, and Switch off turns it off", async () => {
  const view = mount();
  await view.findByText(RULE.inWords);
  expect(view.getByText(/Last run/)).toBeTruthy();
  await userEvent.click(view.getByRole("button", { name: "Switch off" }));
  await waitFor(() =>
    expect(sent).toEqual([
      {
        method: "POST",
        path: "/api/plugins/mail-rules/rule-1/enabled",
        body: { enabled: false },
      },
    ]),
  );
  await view.findByRole("button", { name: "Switch on" });
  expect(view.getByText("Off")).toBeTruthy();
});

test("Delete removes the rule from the list", async () => {
  const view = mount();
  await view.findByText(RULE.inWords);
  await userEvent.click(view.getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(sent[0]).toEqual({
      method: "DELETE",
      path: "/api/plugins/mail-rules/rule-1",
      body: null,
    }),
  );
  await waitFor(() => expect(view.queryByText(RULE.inWords)).toBeNull());
});

test("a rule's last error is shown, and with no rules nothing is drawn at all", async () => {
  rules = [{ ...RULE, lastError: "Gmail could not be reached." }];
  const view = mount();
  await view.findByText(/Gmail could not be reached/);
  cleanup();
  rules = [];
  const empty = mount();
  await settleReactWork();
  expect(empty.container.textContent).toBe("");
});

test("the workspace filters rules and keeps a valid page after deleting its last result", async () => {
  rules = Array.from({ length: 7 }, (_, i) => ({
    ...RULE,
    id: `rule-${i + 1}`,
    inWords: `Example mail rule ${i + 1}`,
    enabled: i !== 2,
  }));
  const view = mount(true);
  await view.findByText("Example mail rule 1");
  expect(view.queryByText("Example mail rule 7")).toBeNull();
  const user = userEvent.setup({ document });
  await user.click(view.getByRole("button", { name: "Next" }));
  await user.click(view.getByRole("button", { name: "Delete" }));
  await view.findByText("Example mail rule 1");
  expect(sent[0]?.path).toBe("/api/plugins/mail-rules/rule-7");
  await user.selectOptions(
    view.getByRole("combobox", { name: "Rule status" }),
    "off",
  );
  expect(view.getByText("Example mail rule 3")).toBeTruthy();
  expect(view.queryByText("Example mail rule 1")).toBeNull();
  await user.type(view.getByRole("searchbox"), "unmatched");
  expect(view.getByText("No rules match these filters.")).toBeTruthy();
  expect(sent.length).toBe(1);
});
