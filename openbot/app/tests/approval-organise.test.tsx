import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { describeApproval } from "@/lib/approval-view";
import type { ApprovalRequest } from "@/lib/approvals";

/**
 * The cards that wait on a call which organises a mailbox: create a label, label, archive, mark as
 * read or unread (docs/design/mail-organise.md).
 *
 * The words are a promise to the person, so they are written out here and not read from the view. A
 * card has to say in plain words what happens and to how many messages, list the messages the SERVER
 * read in the mailbox (`action.details`), and never a word a Bot wrote about them: the count and the
 * list come from the details, and the ids the Bot sent only stand in when the server could not read.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(() => cleanup());
afterAll(() => GlobalRegistrator.unregister());

type Details = {
  messages: { from: string; subject: string }[];
  missing: number;
};

const ANA = { from: "Ana <ana@example.com>", subject: "Invoice 42" };
const NEWS = { from: "News <news@example.org>", subject: "Weekly digest" };

function request(
  tool: string,
  args: Record<string, unknown>,
  options: {
    details?: Details;
    source?: "default" | "always_ask";
    server?: "google-imap" | "google-workspace";
  } = {},
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
      toolRef: `${options.server ?? "google-imap"}/${tool}`,
      effect: "write",
      scope: "*",
      threadId: "t",
      args,
      target: {},
      ...(options.details ? { details: options.details } : {}),
      ...(options.source
        ? {
            policy: {
              behaviour: "ask",
              source: options.source,
              reason: "You asked to review changes before they happen.",
            },
          }
        : {}),
    },
  } as unknown as ApprovalRequest;
}

const IDS = ["1a2b3c4d5e6f7a01", "1a2b3c4d5e6f7a02"];

test("archive says what archiving does, to how many, and lists who they are from and what they are about", () => {
  const view = describeApproval(
    request(
      "gmail_archive_messages",
      { messageIds: IDS },
      {
        details: { messages: [ANA, NEWS], missing: 0 },
      },
    ),
  );
  expect(view.title).toBe("Archive 2 messages");
  expect(view.app).toBe("Gmail");
  expect(view.kind).toBe("mail");
  expect(view.fields).toEqual([
    {
      label: "What happens",
      value:
        "They leave the Inbox and stay in All Mail, with their labels. Nothing is deleted.",
    },
  ]);
  expect(view.body).toBe(
    "Ana <ana@example.com>: Invoice 42\nNews <news@example.org>: Weekly digest",
  );
});

test("one message is one message", () => {
  const view = describeApproval(
    request(
      "gmail_archive_messages",
      { messageIds: [IDS[0]] },
      {
        details: { messages: [ANA], missing: 0 },
      },
    ),
  );
  expect(view.title).toBe("Archive 1 message");
});

test("the count is what the server read, not the ids a Bot sent", () => {
  const view = describeApproval(
    request(
      "gmail_archive_messages",
      {
        messageIds: [
          ...IDS,
          "1a2b3c4d5e6f7a03",
          "1a2b3c4d5e6f7a04",
          "1a2b3c4d5e6f7a05",
        ],
      },
      { details: { messages: [ANA, NEWS], missing: 0 } },
    ),
  );
  expect(view.title).toBe("Archive 2 messages");
  expect(view.body?.split("\n")).toHaveLength(2);
});

test("a message the mailbox does not hold is counted, and the card says the call will be refused as it stands", () => {
  const view = describeApproval(
    request(
      "gmail_archive_messages",
      { messageIds: IDS },
      {
        details: { messages: [ANA], missing: 1 },
      },
    ),
  );
  expect(view.title).toBe("Archive 2 messages");
  expect(view.fields).toContainEqual({
    label: "Not found",
    value:
      "1 message of the 2 named is not in your mailbox, so this will be refused as it stands.",
  });
  expect(view.body).toBe("Ana <ana@example.com>: Invoice 42");
});

test("when the server could not read the mailbox, the card says so and shows only how many were named", () => {
  const view = describeApproval(
    request("gmail_archive_messages", { messageIds: [...IDS, IDS[0]] }),
  );
  // The same id twice is one message.
  expect(view.title).toBe("Archive 2 messages");
  expect(view.fields).toContainEqual({
    label: "Messages",
    value:
      "Your mailbox could not be read just now, so who they are from and what they are about is not shown. 2 messages named.",
  });
  expect(view.body).toBeNull();
});

test("a sender or a subject that is missing is said to be missing, not left blank", () => {
  const view = describeApproval(
    request(
      "gmail_archive_messages",
      { messageIds: [IDS[0]] },
      {
        details: { messages: [{ from: "", subject: "" }], missing: 0 },
      },
    ),
  );
  expect(view.body).toBe("Unknown sender: (no subject)");
});

test("mark says only that read or unread changes", () => {
  const read = describeApproval(
    request(
      "gmail_mark_messages",
      { messageIds: IDS, state: "read" },
      {
        details: { messages: [ANA, NEWS], missing: 0 },
      },
    ),
  );
  expect(read.title).toBe("Mark 2 messages as read");
  expect(read.fields).toEqual([
    {
      label: "What happens",
      value: "Only whether they show as read changes. Nothing is deleted.",
    },
  ]);
  const unread = describeApproval(
    request(
      "gmail_mark_messages",
      { messageIds: [IDS[0]], state: "unread" },
      {
        details: { messages: [ANA], missing: 0 },
      },
    ),
  );
  expect(unread.title).toBe("Mark 1 message as unread");
});

test("labelling names the label, whether it is added or taken off, and says nothing is moved or deleted", () => {
  const details = { messages: [ANA, NEWS], missing: 0 };
  const add = describeApproval(
    request(
      "gmail_label_messages",
      { messageIds: IDS, addLabels: ["FreeDuet"] },
      {
        details,
      },
    ),
  );
  expect(add.title).toBe("Add the label “FreeDuet” to 2 messages");
  expect(add.fields).toEqual([
    { label: "Add", value: "FreeDuet" },
    {
      label: "What happens",
      value: "Labels are added or taken off. No message is moved or deleted.",
    },
  ]);

  const remove = describeApproval(
    request(
      "gmail_label_messages",
      { messageIds: [IDS[0]], removeLabels: ["STARRED"] },
      { details: { messages: [ANA], missing: 0 } },
    ),
  );
  expect(remove.title).toBe("Remove the label “STARRED” from 1 message");
  expect(remove.fields[0]).toEqual({ label: "Remove", value: "STARRED" });

  const both = describeApproval(
    request(
      "gmail_label_messages",
      {
        messageIds: IDS,
        addLabels: ["FreeDuet", "Clients/Acme"],
        removeLabels: ["IMPORTANT"],
      },
      { details },
    ),
  );
  expect(both.title).toBe("Change the labels on 2 messages");
  expect(both.fields.slice(0, 2)).toEqual([
    { label: "Add", value: "FreeDuet, Clients/Acme" },
    { label: "Remove", value: "IMPORTANT" },
  ]);
});

test("creating a label changes no message", () => {
  const view = describeApproval(
    request("gmail_create_label", { name: "FreeDuet" }),
  );
  expect(view.title).toBe("Create the label “FreeDuet”");
  expect(view.fields).toEqual([
    {
      label: "What happens",
      value:
        "A new, empty label is added to your Gmail. No message is changed.",
    },
  ]);
  expect(view.body).toBeNull();
});

test("both Gmail connections read the same", () => {
  const options = { details: { messages: [ANA], missing: 0 } };
  const imap = describeApproval(
    request("gmail_archive_messages", { messageIds: [IDS[0]] }, options),
  );
  const oauth = describeApproval(
    request(
      "gmail_archive_messages",
      { messageIds: [IDS[0]] },
      {
        ...options,
        server: "google-workspace",
      },
    ),
  );
  expect(oauth).toEqual(imap);
});

test("an app's own archive tool, or another server's tool of the same name, keeps the generic card", () => {
  for (const toolRef of [
    "gmail/GMAIL_ARCHIVE_MESSAGES",
    "some-server/gmail_archive_messages",
    "google-imap/gmail_search_messages",
  ]) {
    const view = describeApproval({
      action: {
        botId: "bot-1",
        toolRef,
        effect: "write",
        scope: "*",
        threadId: "t",
        args: { messageIds: IDS },
        target: {},
      },
    });
    expect(view.title).not.toMatch(/^Archive \d/);
    expect(view.fields.map((field) => field.label)).not.toContain(
      "What happens",
    );
  }
});

test("the card shows the title, what happens and every message, as text and nothing else", () => {
  const hostile = {
    from: "<b>Ana</b> <ana@example.com>",
    subject: "<img src=x onerror=alert(1)> Invoice",
  };
  const view = render(
    <ApprovalCard
      onDecide={() => {}}
      request={request(
        "gmail_archive_messages",
        { messageIds: IDS },
        {
          details: { messages: [hostile, NEWS], missing: 0 },
          source: "default",
        },
      )}
    />,
  );
  expect(view.getByText("Archive 2 messages")).toBeTruthy();
  expect(
    view.getByText(
      "They leave the Inbox and stay in All Mail, with their labels. Nothing is deleted.",
    ),
  ).toBeTruthy();
  const body = view.getByText(
    (_, element) =>
      element?.tagName === "P" &&
      element.textContent ===
        `${hostile.from}: ${hostile.subject}\nNews <news@example.org>: Weekly digest`,
  );
  // Words from a mail are text: no tag in them became an element of the page.
  expect(body.querySelector("img")).toBeNull();
  expect(body.querySelector("b")).toBeNull();
  expect(view.container.querySelector("img")).toBeNull();
});

test("an archive can be allowed once, refused or always allowed, as any write can", () => {
  const view = render(
    <ApprovalCard
      onDecide={() => {}}
      request={request(
        "gmail_archive_messages",
        { messageIds: IDS },
        {
          details: { messages: [ANA, NEWS], missing: 0 },
          source: "default",
        },
      )}
    />,
  );
  expect(view.getByRole("button", { name: /Allow once/ })).toBeTruthy();
  expect(view.getByRole("button", { name: /Refuse/ })).toBeTruthy();
  expect(view.getByRole("button", { name: /Always allow/ })).toBeTruthy();
});

test("a routine's archive is asked about every time: no Always allow", () => {
  const view = render(
    <ApprovalCard
      onDecide={() => {}}
      request={request(
        "gmail_archive_messages",
        { messageIds: IDS },
        {
          details: { messages: [ANA, NEWS], missing: 0 },
          source: "always_ask",
        },
      )}
    />,
  );
  expect(view.queryByRole("button", { name: /Always allow/ })).toBeNull();
  expect(view.getByRole("button", { name: /Allow once/ })).toBeTruthy();
});

test("the Bin says how many and which, that they can be restored for about 30 days, and that Gmail deletes them after", () => {
  const view = describeApproval(
    request(
      "gmail_bin_messages",
      { messageIds: IDS },
      { details: { messages: [ANA, NEWS], missing: 0 } },
    ),
  );
  expect(view.title).toBe("Move 2 messages to the Bin");
  expect(view.app).toBe("Gmail");
  expect(view.kind).toBe("mail");
  expect(view.fields).toEqual([
    {
      label: "What happens",
      value:
        "They go to your Bin and stay there for about 30 days. You can restore them from it. After that Gmail deletes them for good.",
    },
  ]);
  expect(view.body).toBe(
    "Ana <ana@example.com>: Invoice 42\nNews <news@example.org>: Weekly digest",
  );
  const one = describeApproval(
    request(
      "gmail_bin_messages",
      { messageIds: [IDS[0]] },
      { details: { messages: [ANA], missing: 0 }, server: "google-workspace" },
    ),
  );
  expect(one.title).toBe("Move 1 message to the Bin");
});

test("the Bin's count is the server's, and a message the mailbox does not hold is said", () => {
  const view = describeApproval(
    request(
      "gmail_bin_messages",
      { messageIds: [...IDS, "1a2b3c4d5e6f7a03", "1a2b3c4d5e6f7a04"] },
      { details: { messages: [ANA], missing: 1 } },
    ),
  );
  expect(view.title).toBe("Move 2 messages to the Bin");
  expect(view.fields.some((field) => field.label === "Not found")).toBe(true);
  const unread = describeApproval(
    request("gmail_bin_messages", { messageIds: IDS }),
  );
  expect(unread.title).toBe("Move 2 messages to the Bin");
  expect(
    unread.fields.some((field) =>
      /could not be read just now/.test(field.value),
    ),
  ).toBe(true);
});

test("Spam says how many and which, and that Gmail deletes mail in Spam after about 30 days", () => {
  const view = describeApproval(
    request(
      "gmail_spam_messages",
      { messageIds: IDS },
      { details: { messages: [ANA, NEWS], missing: 0 } },
    ),
  );
  expect(view.title).toBe("Move 2 messages to Spam");
  expect(view.app).toBe("Gmail");
  expect(view.kind).toBe("mail");
  expect(view.fields).toEqual([
    {
      label: "What happens",
      value:
        "They go to your Spam folder. Gmail deletes mail in Spam after about 30 days; until then you can move it back.",
    },
  ]);
  expect(view.body).toBe(
    "Ana <ana@example.com>: Invoice 42\nNews <news@example.org>: Weekly digest",
  );
  const one = describeApproval(
    request(
      "gmail_spam_messages",
      { messageIds: [IDS[0]] },
      { details: { messages: [ANA], missing: 0 }, server: "google-workspace" },
    ),
  );
  expect(one.title).toBe("Move 1 message to Spam");
});

test("Spam's count is the server's, and a message the mailbox does not hold is said", () => {
  const view = describeApproval(
    request(
      "gmail_spam_messages",
      { messageIds: [...IDS, "1a2b3c4d5e6f7a03", "1a2b3c4d5e6f7a04"] },
      { details: { messages: [ANA], missing: 1 } },
    ),
  );
  expect(view.title).toBe("Move 2 messages to Spam");
  expect(view.fields.some((field) => field.label === "Not found")).toBe(true);
  const unread = describeApproval(
    request("gmail_spam_messages", { messageIds: IDS }),
  );
  expect(unread.title).toBe("Move 2 messages to Spam");
  expect(
    unread.fields.some((field) =>
      /could not be read just now/.test(field.value),
    ),
  ).toBe(true);
});

test("another server's tool of the same name keeps the generic card, and the Bin can be always allowed except in a routine", () => {
  const view = describeApproval(
    request(
      "gmail_bin_messages",
      { messageIds: IDS },
      {
        server: "some-server" as "google-imap",
      },
    ),
  );
  expect(view.title).not.toMatch(/Bin/);
  const ask = render(
    <ApprovalCard
      onDecide={() => {}}
      request={request(
        "gmail_bin_messages",
        { messageIds: IDS },
        { details: { messages: [ANA, NEWS], missing: 0 }, source: "default" },
      )}
    />,
  );
  expect(ask.getByRole("button", { name: /Always allow/ })).toBeTruthy();
  cleanup();
  const routine = render(
    <ApprovalCard
      onDecide={() => {}}
      request={request(
        "gmail_bin_messages",
        { messageIds: IDS },
        {
          details: { messages: [ANA, NEWS], missing: 0 },
          source: "always_ask",
        },
      )}
    />,
  );
  expect(routine.queryByRole("button", { name: /Always allow/ })).toBeNull();
});
