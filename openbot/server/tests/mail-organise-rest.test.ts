import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  callTool,
  describeCall,
} from "../src/plugins/google-workspace-rest";
import {
  missingMessages,
  noSuchLabel,
  ORGANISE_REFUSALS,
} from "../src/plugins/mail-organise";
import { transportFor } from "../src/plugins/transport";

/**
 * Organising a mailbox over Google's REST API, asserted without Google.
 *
 * `fetch` is replaced by a small Gmail that keeps labels and messages and records every request it
 * receives. What is under test is the translation: which requests each tool becomes, with which bodies,
 * and that nothing else can ever be asked of Gmail. Every request made by every test in this file is
 * held to one allow-list in `afterEach`, so a path that deletes, trashes, forwards or filters would fail
 * the test that reached it, whatever that test was about.
 */

const connection = { url: "https://www.googleapis.com", token: "test-token" };
const BASE = "/gmail/v1/users/me";

const A = "1a2b3c4d5e6f7a01";
const B = "1a2b3c4d5e6f7a02";
const C = "1a2b3c4d5e6f7a03";

type Seen = {
  method: string;
  url: URL;
  authorization: string | null;
  body: unknown;
};

type BatchModify = {
  ids: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

type FakeLabel = { id: string; name: string; type: "user" | "system" };
type FakeMessage = { labels: string[]; from: string; subject: string };
type Mailbox = { labels: FakeLabel[]; messages: Record<string, FakeMessage> };

const realFetch = globalThis.fetch;
let everyCall: Seen[] = [];
let escapedToNetwork: string[] = [];

beforeEach(() => {
  everyCall = [];
  escapedToNetwork = [];
  globalThis.fetch = (async (input: string | URL): Promise<Response> => {
    escapedToNetwork.push(String(input));
    throw new Error(`unstubbed fetch escaped to the network: ${String(input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  expect(escapedToNetwork).toEqual([]);
  assertOnlyWhatOrganisingMayAsk(everyCall);
});

/**
 * The only requests an organising tool may make, whatever it was asked: read the labels, create one,
 * read one message's sender and subject, and change labels on named messages. Never another method,
 * another path, a label id that deletes or hides mail, or more than a hundred messages.
 */
function assertOnlyWhatOrganisingMayAsk(calls: readonly Seen[]) {
  for (const call of calls) {
    const path = call.url.pathname;
    expect(call.url.origin).toBe("https://www.googleapis.com");
    expect(call.authorization).toBe("Bearer test-token");
    if (path === `${BASE}/labels`) {
      expect(["GET", "POST"]).toContain(call.method);
      if (call.method === "POST") {
        expect(Object.keys(call.body as object).sort()).toEqual([
          "labelListVisibility",
          "messageListVisibility",
          "name",
        ]);
      }
    } else if (/^\/gmail\/v1\/users\/me\/messages\/[0-9a-f]{1,16}$/.test(path)) {
      expect(call.method).toBe("GET");
      expect(call.body).toBeNull();
    } else if (path === `${BASE}/messages/batchModify`) {
      expect(call.method).toBe("POST");
      const body = call.body as BatchModify;
      for (const key of Object.keys(body)) {
        expect(["ids", "addLabelIds", "removeLabelIds"]).toContain(key);
      }
      expect(body.ids.length).toBeGreaterThan(0);
      expect(body.ids.length).toBeLessThanOrEqual(100);
      for (const id of body.ids) expect(id).toMatch(/^[0-9a-f]{1,16}$/);
      const labels = [
        ...(body.addLabelIds ?? []),
        ...(body.removeLabelIds ?? []),
      ];
      for (const label of labels) {
        expect(label).toMatch(/^(Label_\d+|STARRED|IMPORTANT|INBOX|UNREAD)$/);
      }
      // The Inbox only ever leaves a message, which is what archiving is.
      expect(body.addLabelIds ?? []).not.toContain("INBOX");
    } else {
      throw new Error(
        `a request no organising tool may make: ${call.method} ${path}`,
      );
    }
  }
}

function stubGoogle(answer: (call: Seen) => unknown): Seen[] {
  const calls: Seen[] = [];
  globalThis.fetch = (async (input: string | URL, options?: RequestInit) => {
    const call: Seen = {
      method: options?.method ?? "GET",
      url: new URL(String(input)),
      authorization: new Headers(options?.headers).get("authorization"),
      body: typeof options?.body === "string" ? JSON.parse(options.body) : null,
    };
    calls.push(call);
    everyCall.push(call);
    const reply = answer(call);
    return reply instanceof Response ? reply : Response.json(reply);
  }) as typeof fetch;
  return calls;
}

const gone = () =>
  Response.json(
    { error: { code: 404, message: "Requested entity was not found." } },
    { status: 404 },
  );

function mailbox(): Mailbox {
  return {
    labels: [
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "SPAM", name: "SPAM", type: "system" },
      { id: "TRASH", name: "TRASH", type: "system" },
      { id: "UNREAD", name: "UNREAD", type: "system" },
      { id: "STARRED", name: "STARRED", type: "system" },
      { id: "Label_1", name: "FreeDuet", type: "user" },
      { id: "Label_2", name: "Clients/Acme", type: "user" },
    ],
    messages: {
      [A]: {
        labels: ["INBOX", "UNREAD"],
        from: "Ana <ana@example.com>",
        subject: "Invoice 42",
      },
      [B]: {
        labels: ["INBOX"],
        from: "News <news@example.org>",
        subject: "Weekly digest",
      },
      [C]: {
        labels: ["Label_1"],
        from: "Bob <bob@example.net>",
        subject: "Already filed",
      },
    },
  };
}

/** A Gmail holding `box`. `before` may answer a request itself; the mailbox answers the rest. */
function serve(box: Mailbox, before?: (call: Seen) => Response | undefined) {
  const modified: BatchModify[] = [];
  const calls = stubGoogle((call) => {
    const early = before?.(call);
    if (early) return early;
    const path = call.url.pathname;
    if (path === `${BASE}/labels` && call.method === "GET") {
      return { labels: box.labels };
    }
    if (path === `${BASE}/labels` && call.method === "POST") {
      const label: FakeLabel = {
        id: `Label_${box.labels.length + 1}`,
        name: (call.body as { name: string }).name,
        type: "user",
      };
      box.labels.push(label);
      return label;
    }
    const one = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(path);
    if (one && call.method === "GET") {
      const message = box.messages[one[1]];
      if (!message) return gone();
      return {
        id: one[1],
        threadId: `thread-${one[1]}`,
        labelIds: message.labels,
        internalDate: "1792656600000",
        payload: {
          mimeType: "text/plain",
          headers: [
            { name: "From", value: message.from },
            { name: "Subject", value: message.subject },
          ],
        },
      };
    }
    if (path === `${BASE}/messages/batchModify` && call.method === "POST") {
      modified.push(call.body as BatchModify);
      return new Response(null, { status: 204 });
    }
    return Response.json(
      { error: { code: 404, message: `no route ${call.method} ${path}` } },
      { status: 404 },
    );
  });
  return { calls, modified };
}

const shape = (calls: readonly Seen[]) =>
  calls.map((call) => `${call.method} ${call.url.pathname.replace(BASE, "")}`);

const json = (text: string) => JSON.parse(text) as unknown;

describe("listing and creating labels", () => {
  test("listing asks for the labels once and answers the person's own, sorted, and what else may be added", async () => {
    const { calls } = serve(mailbox());
    const result = await callTool(connection, "gmail_list_labels", {});
    expect(shape(calls)).toEqual(["GET /labels"]);
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      labels: ["Clients/Acme", "FreeDuet"],
      alsoAllowed: ["STARRED", "IMPORTANT"],
    });
    // Gmail's own labels are not the person's, and are not listed.
    expect(result.text).not.toContain("TRASH");
    expect(result.text).not.toContain("SPAM");
  });

  test("creating a label that is not there looks first, then makes it with the name as given", async () => {
    const box = mailbox();
    const { calls } = serve(box);
    const result = await callTool(connection, "gmail_create_label", {
      name: "  Receipts 2026 ",
    });
    expect(shape(calls)).toEqual(["GET /labels", "POST /labels"]);
    expect(calls[1]?.body).toEqual({
      name: "Receipts 2026",
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    });
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({ label: "Receipts 2026", created: true });
    expect(box.labels.map((label) => label.name)).toContain("Receipts 2026");
  });

  test("creating a label that is there, in any case, is a success that says so and changes nothing", async () => {
    const box = mailbox();
    const { calls } = serve(box);
    const result = await callTool(connection, "gmail_create_label", {
      name: "freeduet",
    });
    expect(shape(calls)).toEqual(["GET /labels"]);
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      label: "FreeDuet",
      created: false,
      note: "A label with this name already exists, so nothing was changed.",
    });
    expect(box.labels).toHaveLength(7);
  });

  test("a name taken between the look and the creation (409) is the same success", async () => {
    const { calls } = serve(mailbox(), (call) =>
      call.method === "POST" && call.url.pathname === `${BASE}/labels`
        ? Response.json(
            { error: { code: 409, message: "Label name exists or conflicts" } },
            { status: 409 },
          )
        : undefined,
    );
    const result = await callTool(connection, "gmail_create_label", {
      name: "Receipts",
    });
    expect(shape(calls)).toEqual(["GET /labels", "POST /labels"]);
    expect(result.isError).toBe(false);
    expect(json(result.text)).toMatchObject({ label: "Receipts", created: false });
  });

  test("a name that is refused costs no request at all, and the refusal quotes nothing", async () => {
    const { calls } = serve(mailbox());
    const refused: [unknown, string][] = [
      ["", ORGANISE_REFUSALS.noName],
      ["   ", ORGANISE_REFUSALS.noName],
      [undefined, ORGANISE_REFUSALS.noName],
      ["a".repeat(101), ORGANISE_REFUSALS.labelName],
      ["bad\nname", ORGANISE_REFUSALS.labelName],
      ["inv\u202Eoice", ORGANISE_REFUSALS.labelName],
      ["zero\u200Bwidth", ORGANISE_REFUSALS.labelName],
      ["A//B", ORGANISE_REFUSALS.labelName],
      ["wild*", ORGANISE_REFUSALS.labelName],
      ["Trash", ORGANISE_REFUSALS.reservedName],
      ["[Gmail]/Trash", ORGANISE_REFUSALS.reservedName],
      ["INBOX", ORGANISE_REFUSALS.reservedName],
    ];
    for (const [name, sentence] of refused) {
      const result = await callTool(connection, "gmail_create_label", { name });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(sentence);
    }
    expect(calls).toEqual([]);
  });

  test("a label made with a hundred characters is accepted, and one with a hundred and one is not", async () => {
    const { calls } = serve(mailbox());
    const hundred = "n".repeat(100);
    const ok = await callTool(connection, "gmail_create_label", { name: hundred });
    expect(ok.isError).toBe(false);
    expect(calls[1]?.body).toMatchObject({ name: hundred });
  });

  test("Google's refusal of the scope is said in Google's words with the way out, and nothing is retried", async () => {
    const { calls } = serve(mailbox(), (call) =>
      call.method === "POST"
        ? Response.json(
            {
              error: {
                code: 403,
                message: "Request had insufficient authentication scopes.",
                errors: [{ reason: "insufficientPermissions" }],
              },
            },
            { status: 403 },
          )
        : undefined,
    );
    const result = await callTool(connection, "gmail_create_label", {
      name: "Receipts",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("insufficient authentication scopes");
    expect(result.text).toContain("Reconnecting");
    expect(shape(calls)).toEqual(["GET /labels", "POST /labels"]);
  });
});

describe("labelling messages", () => {
  test("adding one of the person's labels: labels, each message's sender and subject, then one change", async () => {
    const box = mailbox();
    const { calls, modified } = serve(box);
    const result = await callTool(connection, "gmail_label_messages", {
      messageIds: [A, B],
      addLabels: ["FreeDuet"],
    });
    expect(shape(calls)).toEqual([
      "GET /labels",
      `GET /messages/${A}`,
      `GET /messages/${B}`,
      "POST /messages/batchModify",
    ]);
    for (const call of calls.slice(1, 3)) {
      expect(call.url.searchParams.get("format")).toBe("metadata");
      expect(call.url.searchParams.getAll("metadataHeaders")).toEqual([
        "From",
        "Subject",
      ]);
    }
    expect(modified).toEqual([{ ids: [A, B], addLabelIds: ["Label_1"] }]);
    expect(Object.keys(calls[3]?.body as object).sort()).toEqual([
      "addLabelIds",
      "ids",
    ]);
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      labeled: 2,
      added: ["FreeDuet"],
      removed: [],
    });
  });

  test("adding and removing in one call, with Starred by its own name", async () => {
    const { modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_label_messages", {
      messageIds: [C],
      addLabels: ["Clients/Acme", "starred"],
      removeLabels: ["FreeDuet"],
    });
    expect(result.isError).toBe(false);
    expect(modified).toEqual([
      {
        ids: [C],
        addLabelIds: ["Label_2", "STARRED"],
        removeLabelIds: ["Label_1"],
      },
    ]);
    expect(json(result.text)).toEqual({
      labeled: 1,
      added: ["Clients/Acme", "STARRED"],
      removed: ["FreeDuet"],
    });
  });

  test("a label is found by its name in any case, and the answer carries the name it has", async () => {
    const { modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_label_messages", {
      messageIds: [A],
      addLabels: ["fReEdUeT"],
    });
    expect(modified).toEqual([{ ids: [A], addLabelIds: ["Label_1"] }]);
    expect(json(result.text)).toMatchObject({ added: ["FreeDuet"] });
  });

  test("ids are lower-cased and listed once, in the order given", async () => {
    const { modified } = serve(mailbox());
    await callTool(connection, "gmail_label_messages", {
      messageIds: [A.toUpperCase(), B, A],
      addLabels: ["FreeDuet"],
    });
    expect(modified).toEqual([{ ids: [A, B], addLabelIds: ["Label_1"] }]);
  });

  test("a label that is not there is refused before one message is read, and says how to make it", async () => {
    const { calls, modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_label_messages", {
      messageIds: [A],
      addLabels: ["Nonexistent"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(noSuchLabel);
    expect(result.text).toContain("gmail_create_label");
    expect(shape(calls)).toEqual(["GET /labels"]);
    expect(modified).toEqual([]);
  });

  test("a message that is gone refuses the whole call: all of the named messages or none", async () => {
    const { calls, modified } = serve(mailbox());
    const missingId = "1a2b3c4d5e6f7aff";
    const result = await callTool(connection, "gmail_label_messages", {
      messageIds: [A, missingId, B],
      addLabels: ["FreeDuet"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(missingMessages(1, 3));
    expect(result.text).toContain("1 of the 3");
    expect(modified).toEqual([]);
    expect(shape(calls)).not.toContain("POST /messages/batchModify");
  });

  test("every message gone is the same refusal, counted", async () => {
    const { modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_archive_messages", {
      messageIds: ["aa", "bb"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(missingMessages(2, 2));
    expect(modified).toEqual([]);
  });

  test("a failure that is not a missing message ends the call and changes nothing", async () => {
    const { modified } = serve(mailbox(), (call) =>
      call.url.pathname.includes("/messages/")
        ? Response.json(
            { error: { code: 401, message: "Invalid Credentials" } },
            { status: 401 },
          )
        : undefined,
    );
    const result = await callTool(connection, "gmail_label_messages", {
      messageIds: [A],
      addLabels: ["FreeDuet"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("401");
    expect(modified).toEqual([]);
  });

  test("Google refusing the change for a scope the person did not grant says so and how to fix it", async () => {
    const { calls } = serve(mailbox(), (call) =>
      call.url.pathname === `${BASE}/messages/batchModify`
        ? Response.json(
            {
              error: {
                code: 403,
                message: "Request had insufficient authentication scopes.",
                errors: [{ reason: "insufficientPermissions" }],
              },
            },
            { status: 403 },
          )
        : undefined,
    );
    const result = await callTool(connection, "gmail_archive_messages", {
      messageIds: [A],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("insufficient authentication scopes");
    expect(result.text).toContain("Reconnecting");
    // One attempt: the change is not retried and nothing else is tried in its place.
    expect(shape(calls).filter((line) => line.startsWith("POST"))).toEqual([
      "POST /messages/batchModify",
    ]);
  });

  test("Trash and Spam, in either spelling and either direction, cost no request", async () => {
    const { calls } = serve(mailbox());
    for (const field of ["addLabels", "removeLabels"]) {
      for (const label of ["TRASH", "Trash", "\\Trash", "SPAM", "\\Spam", "Junk"]) {
        const result = await callTool(connection, "gmail_label_messages", {
          messageIds: [A],
          [field]: ["FreeDuet", label],
        });
        expect(result.isError).toBe(true);
        expect(result.text).toBe(ORGANISE_REFUSALS.hidesMail);
      }
    }
    expect(calls).toEqual([]);
  });

  test("Gmail's other own labels cost no request and point to the tool that does the job", async () => {
    const { calls } = serve(mailbox());
    for (const [field, label] of [
      ["removeLabels", "INBOX"],
      ["addLabels", "UNREAD"],
      ["addLabels", "SENT"],
      ["addLabels", "CATEGORY_SOCIAL"],
    ]) {
      const result = await callTool(connection, "gmail_label_messages", {
        messageIds: [A],
        [field as string]: [label],
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(ORGANISE_REFUSALS.systemLabel);
    }
    expect(calls).toEqual([]);
  });

  test("a hundred messages go in one change, and a hundred and one are refused whole", async () => {
    const ids = Array.from({ length: 100 }, (_, i) =>
      (0x1000 + i).toString(16),
    );
    const box = mailbox();
    for (const id of ids) {
      box.messages[id] = {
        labels: ["INBOX"],
        from: "Many <many@example.com>",
        subject: `Message ${id}`,
      };
    }
    const { calls, modified } = serve(box);
    const done = await callTool(connection, "gmail_archive_messages", {
      messageIds: ids,
    });
    expect(done.isError).toBe(false);
    expect(modified).toHaveLength(1);
    expect(modified[0]?.ids).toEqual(ids);
    expect(json(done.text)).toEqual({ archived: 100, alreadyOutOfInbox: 0 });
    expect(shape(calls).filter((line) => line.startsWith("GET /messages/"))).toHaveLength(100);

    const before = calls.length;
    const refused = await callTool(connection, "gmail_archive_messages", {
      messageIds: [...ids, "ffff"],
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(ORGANISE_REFUSALS.tooManyIds);
    expect(calls).toHaveLength(before);
  });

  test("a call that is not exactly one the tool takes costs no request", async () => {
    const { calls } = serve(mailbox());
    const attempts: Record<string, unknown>[] = [
      { messageIds: [A], addLabels: ["FreeDuet"], query: "in:inbox" },
      { messageIds: [A], addLabels: ["FreeDuet"], all: true },
      { messageIds: [A], addLabels: ["FreeDuet"], threadIds: [A] },
      { messageIds: [A], addLabels: ["FreeDuet"], moveTo: "Trash" },
      { query: "from:newsletter", addLabels: ["FreeDuet"] },
      { messageIds: [], addLabels: ["FreeDuet"] },
      { messageIds: [A] },
      { messageIds: ["not-an-id"], addLabels: ["FreeDuet"] },
      { messageIds: [A], addLabels: ["FreeDuet"], removeLabels: ["FreeDuet"] },
    ];
    for (const args of attempts) {
      const result = await callTool(connection, "gmail_label_messages", args);
      expect(result.isError).toBe(true);
      expect(result.text).toEndWith("Nothing was changed.");
    }
    expect(calls).toEqual([]);
  });
});

describe("archiving messages", () => {
  test("it removes the Inbox label and nothing else, and counts what was in the Inbox", async () => {
    const { calls, modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_archive_messages", {
      messageIds: [A, C],
    });
    expect(shape(calls)).toEqual([
      `GET /messages/${A}`,
      `GET /messages/${C}`,
      "POST /messages/batchModify",
    ]);
    expect(modified).toEqual([{ ids: [A, C], removeLabelIds: ["INBOX"] }]);
    expect(Object.keys(calls[2]?.body as object).sort()).toEqual([
      "ids",
      "removeLabelIds",
    ]);
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({ archived: 1, alreadyOutOfInbox: 1 });
  });

  test("it asks for no label lookup: archiving names no label", async () => {
    const { calls } = serve(mailbox());
    await callTool(connection, "gmail_archive_messages", { messageIds: [B] });
    expect(shape(calls)).not.toContain("GET /labels");
  });
});

describe("marking messages read or unread", () => {
  test("read removes UNREAD", async () => {
    const { calls, modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_mark_messages", {
      messageIds: [A, B],
      state: "read",
    });
    expect(shape(calls).at(-1)).toBe("POST /messages/batchModify");
    expect(modified).toEqual([{ ids: [A, B], removeLabelIds: ["UNREAD"] }]);
    expect(json(result.text)).toEqual({ marked: 2, as: "read" });
  });

  test("unread adds UNREAD", async () => {
    const { modified } = serve(mailbox());
    const result = await callTool(connection, "gmail_mark_messages", {
      messageIds: [C],
      state: "unread",
    });
    expect(modified).toEqual([{ ids: [C], addLabelIds: ["UNREAD"] }]);
    expect(json(result.text)).toEqual({ marked: 1, as: "unread" });
  });

  test("any other state is refused before a request", async () => {
    const { calls } = serve(mailbox());
    for (const state of ["READ", "deleted", "spam", "", undefined, 1]) {
      const result = await callTool(connection, "gmail_mark_messages", {
        messageIds: [A],
        state,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(ORGANISE_REFUSALS.state);
    }
    expect(calls).toEqual([]);
  });
});

describe("whatever a tool is asked, these are the only requests it can make", () => {
  test("a battery of hostile and malformed calls to all five tools never leaves the allow-list", async () => {
    const box = mailbox();
    const { modified } = serve(box);
    const hostile: [string, Record<string, unknown>][] = [];
    const tools = [
      "gmail_list_labels",
      "gmail_create_label",
      "gmail_label_messages",
      "gmail_archive_messages",
      "gmail_mark_messages",
    ];
    const odd: unknown[] = [
      undefined,
      null,
      "",
      "TRASH",
      "\\Deleted",
      "../../messages/trash",
      "1a/../../x",
      ["TRASH"],
      [A, "TRASH"],
      ["__proto__"],
      { toString: 1 },
      Array.from({ length: 150 }, (_, i) => i.toString(16)),
      "SPAM\u0000",
      "x".repeat(5000),
    ];
    for (const tool of tools) {
      for (const value of odd) {
        for (const key of [
          "name",
          "messageIds",
          "addLabels",
          "removeLabels",
          "state",
          "query",
          "threadId",
          "labelIds",
          "destination",
        ]) {
          hostile.push([tool, { [key]: value }]);
          hostile.push([tool, { messageIds: [A], [key]: value }]);
        }
      }
    }
    for (const [tool, args] of hostile) {
      const result = await callTool(connection, tool, args);
      expect(typeof result.text).toBe("string");
      expect(typeof result.isError).toBe("boolean");
    }
    // Nothing a hostile call could say put mail in Trash or Spam, or took one thing out of the Inbox
    // that was not named.
    for (const change of modified) {
      expect(JSON.stringify(change)).not.toMatch(/TRASH|SPAM/);
    }
    for (const message of Object.values(box.messages)) {
      expect(message.labels).not.toContain("TRASH");
      expect(message.labels).not.toContain("SPAM");
    }
  });

  test("the REST module names no endpoint that deletes, trashes, forwards, filters or sends under an organising tool", () => {
    const source = readFileSync(
      new URL("../src/plugins/google-workspace-rest.ts", import.meta.url),
      "utf8",
    );
    const organising = source.slice(
      source.indexOf("Organising a mailbox: labels, archive, read and unread"),
      source.indexOf("export async function callTool"),
    );
    expect(organising.length).toBeGreaterThan(3000);
    for (const forbidden of [
      "batchDelete",
      "/trash",
      "/untrash",
      "/delete",
      '"DELETE"',
      "method: 'DELETE'",
      "/filters",
      "forwardingAddresses",
      "/settings",
      "/send",
      "/drafts",
      "/modify",
      "TRASH",
      "SPAM",
    ]) {
      // `TRASH` and `SPAM` appear nowhere in the organising code: refusing them is the parser's job.
      expect(organising).not.toContain(forbidden);
    }
    expect(organising).toContain("/messages/batchModify");
  });
});

describe("what the approval card is told", () => {
  test("the sender and subject of each named message, as this server read them, in the order named", async () => {
    const { calls } = serve(mailbox());
    for (const tool of [
      ["gmail_label_messages", { messageIds: [B, A], addLabels: ["FreeDuet"] }],
      ["gmail_archive_messages", { messageIds: [B, A] }],
      ["gmail_mark_messages", { messageIds: [B, A], state: "read" }],
    ] as const) {
      calls.length = 0;
      const details = await describeCall(connection, tool[0], tool[1]);
      expect(details).toEqual({
        messages: [
          { from: "News <news@example.org>", subject: "Weekly digest" },
          { from: "Ana <ana@example.com>", subject: "Invoice 42" },
        ],
        missing: 0,
      });
      // It reads and nothing else.
      expect(shape(calls).sort()).toEqual(
        [`GET /messages/${A}`, `GET /messages/${B}`].sort(),
      );
    }
  });

  test("ids the mailbox does not hold are counted, not listed", async () => {
    serve(mailbox());
    const details = await describeCall(connection, "gmail_archive_messages", {
      messageIds: [A, "1a2b3c4d5e6f7aff", B],
    });
    expect(details?.missing).toBe(1);
    expect(details?.messages.map((m) => m.subject)).toEqual([
      "Invoice 42",
      "Weekly digest",
    ]);
  });

  test("a sender and a subject are one clean line: invisible and direction-changing characters never reach the card", async () => {
    const box = mailbox();
    box.messages[A] = {
      labels: ["INBOX"],
      from: `Ana\u202E <ana@example.com>`,
      subject: `Invoice\u200B 42\u2028${"x".repeat(400)}`,
    };
    serve(box);
    const details = await describeCall(connection, "gmail_archive_messages", {
      messageIds: [A],
    });
    const shown = details?.messages[0];
    expect(shown?.from).toBe("Ana <ana@example.com>");
    expect(shown?.subject.startsWith("Invoice 42 xxx")).toBe(true);
    expect(shown?.subject.length).toBeLessThanOrEqual(200);
    expect(shown?.subject).not.toMatch(/[\u200B\u2028\u202E]/);
  });

  test("a call that names no messages, or cannot be carried out, reads nothing", async () => {
    const { calls } = serve(mailbox());
    expect(await describeCall(connection, "gmail_list_labels", {})).toBeUndefined();
    expect(
      await describeCall(connection, "gmail_create_label", { name: "X" }),
    ).toBeUndefined();
    expect(
      await describeCall(connection, "gmail_label_messages", {
        messageIds: [A],
        addLabels: ["TRASH"],
      }),
    ).toBeUndefined();
    expect(
      await describeCall(connection, "gmail_archive_messages", {
        messageIds: [A],
        query: "everything",
      }),
    ).toBeUndefined();
    expect(
      await describeCall(connection, "gmail_search_messages", { query: "a" }),
    ).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("a mailbox that cannot be read leaves the card to say so, and never fails the call", async () => {
    serve(mailbox(), () =>
      Response.json(
        { error: { code: 401, message: "Invalid Credentials" } },
        { status: 401 },
      ),
    );
    const details = await describeCall(connection, "gmail_archive_messages", {
      messageIds: [A],
    });
    expect(details).toBeUndefined();
  });

  test("the transport table hands the card the same reader", () => {
    expect(transportFor("google-workspace-rest").describeCall).toBe(describeCall);
  });
});
