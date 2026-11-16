import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createGoogleImapTransport,
  listTools as imapListTools,
} from "../src/plugins/google-imap";
import { classifyTool, catalogueEntry } from "../src/plugins/catalogue";
import {
  callTool as restCallTool,
  hiddenFoldersNamed,
} from "../src/plugins/google-workspace-rest";
import { calendarConnectedFor, grantedTools } from "../src/plugins/tools";
import { FakeGmail, textMail, tokenFor } from "./support/fake-imap";

/**
 * Reading Spam and the Bin (docs/design/mail-organise.md, "Reading Spam and the Bin", D53): a search
 * that names `in:spam` or `in:trash` reads that folder, read-only, on both ways of connecting Gmail;
 * every other search stays exactly as it was. And the calendar tool is not offered to a person who has
 * no calendar connected.
 */

const connection = {
  url: "https://imap.gmail.com/",
  token: tokenFor(),
  actorId: "user_maya",
  botId: "bot_leo",
};

const mail = (uid: number, subject: string, labels: string[]) =>
  textMail({
    uid,
    emailId: BigInt(`0x18f3a0c2d4e5b6${uid}`).toString(),
    threadId: BigInt(`0x18f3a0c2d4e5b7${uid}`).toString(),
    headers: {
      From: "Offers <offers@example.com>",
      Subject: subject,
      Date: "Thu, 22 Oct 2026 07:10:00 -0700",
    },
    body: `Body of ${subject}`,
    labels,
  });

const INBOX_MAIL = mail(10, "In the inbox", ["\\Inbox"]);
const SPAM_MAIL = mail(21, "Won a prize", ["\\Spam"]);
const BIN_MAIL = mail(31, "Old receipt", ["\\Trash"]);

function build() {
  const gmail = new FakeGmail();
  gmail.hasSpamFolder = true;
  gmail.messages = [INBOX_MAIL];
  gmail.folderMessages.set("[Gmail]/Spam", [SPAM_MAIL]);
  gmail.folderMessages.set("[Gmail]/Trash", [BIN_MAIL]);
  gmail.searchFallback = () => [10];
  const transport = createGoogleImapTransport({
    imap: gmail.imap,
    smtp: gmail.smtp,
    fetch: async () => new Response(""),
    now: () => new Date("2026-10-22T20:00:00Z"),
  });
  return { gmail, transport };
}

const subjects = (result: { text: string }) =>
  (
    JSON.parse(result.text) as {
      messages: { subject: string }[];
    }
  ).messages.map((message) => message.subject);

describe("a search that names Spam or the Bin, over an app password", () => {
  test("in:spam finds the message moved to Spam, read-only, and the default search does not", async () => {
    const { gmail, transport } = build();

    const named = await transport.callTool(
      connection,
      "gmail_search_messages",
      {
        query: "in:spam",
      },
    );
    expect(subjects(named as never)).toEqual(["Won a prize"]);
    expect(gmail.opened).toEqual([
      { path: "[Gmail]/Spam", options: { readOnly: true } },
    ]);

    gmail.opened = [];
    const plain = await transport.callTool(
      connection,
      "gmail_search_messages",
      {},
    );
    expect(subjects(plain as never)).toEqual(["In the inbox"]);
    expect(gmail.opened.map((opened) => opened.path)).toEqual([
      "[Gmail]/All Mail",
    ]);
  });

  test("in:trash finds the message in the Bin and the default search does not", async () => {
    const { gmail, transport } = build();
    const named = await transport.callTool(
      connection,
      "gmail_search_messages",
      {
        query: "in:trash",
      },
    );
    expect(subjects(named as never)).toEqual(["Old receipt"]);
    expect(gmail.opened.map((opened) => opened.path)).toEqual([
      "[Gmail]/Trash",
    ]);
    const plain = await transport.callTool(
      connection,
      "gmail_search_messages",
      {
        query: "Old receipt",
      },
    );
    expect(subjects(plain as never)).not.toContain("Old receipt");
  });

  test("the rest of the query still narrows the search inside the folder", async () => {
    const { gmail, transport } = build();
    await transport.callTool(connection, "gmail_search_messages", {
      query: "in:spam from:offers@example.com",
    });
    expect(gmail.searched[0]?.query).toEqual({
      gmailraw: "from:offers@example.com",
    });
    await transport.callTool(connection, "gmail_search_messages", {
      query: "in:spam",
    });
    expect(gmail.searched[1]?.query).toEqual({ all: true });
  });

  test("an account with no Spam folder gets a plain sentence, not an empty list", async () => {
    const { gmail, transport } = build();
    gmail.hasSpamFolder = false;
    const result = await transport.callTool(
      connection,
      "gmail_search_messages",
      {
        query: "in:spam",
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("did not report a Spam");
    expect(result.text).toContain("does not mean any mail was lost");
    expect(gmail.opened).toEqual([]);
  });

  test("an account with no Bin folder says so too", async () => {
    const { gmail, transport } = build();
    gmail.hasBinFolder = false;
    const result = await transport.callTool(
      connection,
      "gmail_search_messages",
      {
        query: "in:trash",
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("did not report a Bin");
  });

  test("naming both asks for one at a time, and a minus names nothing", async () => {
    const { gmail, transport } = build();
    const both = await transport.callTool(connection, "gmail_search_messages", {
      query: "in:spam in:trash",
    });
    expect(both.isError).toBe(true);
    expect(gmail.opened).toEqual([]);
    expect(hiddenFoldersNamed("-in:spam from:a@b.c")).toEqual({
      spam: false,
      bin: false,
      rest: "-in:spam from:a@b.c",
    });
  });

  test("nothing is ever opened for writing", async () => {
    const { gmail, transport } = build();
    await transport.callTool(connection, "gmail_search_messages", {
      query: "in:spam",
    });
    await transport.callTool(connection, "gmail_search_messages", {
      query: "in:trash",
    });
    expect(gmail.violations).toEqual([]);
    for (const opened of gmail.opened) {
      expect(opened.options).toEqual({ readOnly: true });
    }
  });

  test("the search is still a read, and its description tells a member how to ask", async () => {
    const entry = catalogueEntry("google-imap");
    expect(classifyTool(entry ?? null, "gmail_search_messages", true)).toBe(
      "read",
    );
    const tool = (await imapListTools()).find(
      (listed) => listed.name === "gmail_search_messages",
    );
    expect(tool?.description).toContain("in:spam");
  });
});

describe("a search that names Spam or the Bin, over OAuth", () => {
  const realFetch = globalThis.fetch;
  let listed: URL[] = [];
  beforeEach(() => {
    listed = [];
    globalThis.fetch = (async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/messages")) {
        listed.push(url);
        return Response.json({ messages: [] });
      }
      return Response.json({});
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const rest = { url: "https://www.googleapis.com", token: "t" };

  test("includeSpamTrash is sent only when the query names Spam or the Bin", async () => {
    await restCallTool(rest, "gmail_search_messages", { query: "in:spam" });
    await restCallTool(rest, "gmail_search_messages", {
      query: "in:trash from:a@b.c",
    });
    await restCallTool(rest, "gmail_search_messages", { query: "from:a@b.c" });
    await restCallTool(rest, "gmail_search_messages", {});
    expect(
      listed.map((url) => url.searchParams.get("includeSpamTrash")),
    ).toEqual(["true", "true", null, null]);
    expect(listed[0]?.searchParams.get("q")).toBe("in:spam");
  });
});

describe("the calendar tool is offered only to a person with a calendar", () => {
  const stored = (name: string) => ({
    ref: `google-imap/${name}`,
    toolName: `mcp__google-imap__${name}`,
    description: name,
    inputSchema: { type: "object" },
  });
  const store = {
    listForAgent: async () => ({
      tools: [stored("gmail_search_messages"), stored("calendar_list_events")],
      skills: [],
    }),
  };
  const offered = async (status: unknown): Promise<string[]> =>
    (
      await grantedTools({
        store: store as never,
        botId: "bot_leo",
        actorId: "user_maya",
        calendarConnected: calendarConnectedFor(
          { userSecretStatus: async () => status } as never,
          async () => "user_maya",
        ),
      })
    ).map((tool) => tool.name);

  test("connected without a calendar: the tool is absent and the mail tools stay", async () => {
    expect(
      await offered({ connected: true, address: "m@e.com", calendar: false }),
    ).toEqual(["mcp__google-imap__gmail_search_messages"]);
  });

  test("connected with a calendar: the tool is offered", async () => {
    expect(
      await offered({ connected: true, address: "m@e.com", calendar: true }),
    ).toContain("mcp__google-imap__calendar_list_events");
  });

  test("not connected at all, or a lookup that cannot be made: offered as before", async () => {
    expect(await offered({ connected: false })).toContain(
      "mcp__google-imap__calendar_list_events",
    );
    const failing = calendarConnectedFor(
      {
        userSecretStatus: async () => {
          throw new Error("not a pasted connection");
        },
      } as never,
      async () => "user_maya",
    );
    expect(await failing("google-workspace/calendar_list_events")).toBe(true);
  });

  test("without the option every tool is offered, as before", async () => {
    const all = await grantedTools({
      store: store as never,
      botId: "bot_leo",
      actorId: "user_maya",
    });
    expect(all.length).toBe(2);
  });
});
