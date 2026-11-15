import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createGoogleImapTransport,
  MAY_HAVE_CHANGED,
} from "../src/plugins/google-imap";
import { organiseOverImap } from "../src/plugins/google-imap-organise";
import {
  LABEL_MESSAGES,
  missingMessages,
  noSuchLabel,
  ORGANISE_REFUSALS,
} from "../src/plugins/mail-organise";
import { tokenFor } from "./support/fake-imap";
import {
  CHANGING_METHODS,
  decimalOf,
  FakeMailbox,
  HEX,
} from "./support/fake-mail-organiser";

/**
 * Organising a mailbox over an app password, asserted without a socket.
 *
 * The transport makes two kinds of connection: one that reads, typed so that nothing on it can change a
 * mailbox, and one made only for the four operations that do. These tests run calls through the real
 * transport over an in-memory mailbox standing behind both, and read off which kind was made, in what
 * mode the mailbox was opened, what each was asked, and what the mailbox looks like afterwards. What goes
 * over the wire, to a real IMAP library, is in `google-imap-organise-wire.test.ts`.
 */

const connection = {
  url: "",
  token: tokenFor(),
  actorId: "user_maya",
  botId: "bot_otto",
};

function setup() {
  const box = new FakeMailbox();
  const transport = createGoogleImapTransport({
    imap: box.imap,
    organiser: box.organiser,
  });
  return { box, transport };
}

/** What a call did to the mailbox, without the connection's own lifecycle. */
const work = (box: FakeMailbox) =>
  box.calls
    .filter(
      (call) => !["connect", "logout", "close", "on"].includes(call.method),
    )
    .map((call) => `${call.via}:${call.method}`);

const json = (text: string) => JSON.parse(text) as unknown;

describe("which connection does what", () => {
  test("listing labels is a read: the reading connection, one LIST, and no mailbox opened", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(
      connection,
      "gmail_list_labels",
      {},
    );
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      labels: ["Clients/Acme", "FreeDuet"],
      alsoAllowed: ["STARRED", "IMPORTANT"],
    });
    expect(work(box)).toEqual(["read:list"]);
    expect(box.readConnections).toHaveLength(1);
    expect(box.writeConnections).toHaveLength(0);
    expect(box.called("mailboxOpen")).toEqual([]);
  });

  test("creating a label is on the changing connection and opens no mailbox", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(connection, "gmail_create_label", {
      name: "Receipts 2026",
    });
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      label: "Receipts 2026",
      created: true,
    });
    expect(work(box)).toEqual(["write:list", "write:mailboxCreate"]);
    expect(box.called("mailboxCreate")[0]?.args).toEqual(["Receipts 2026"]);
    expect(box.called("mailboxOpen")).toEqual([]);
    expect(box.readConnections).toHaveLength(0);
    expect(box.writeConnections).toHaveLength(1);
  });

  test("labelling, archiving and marking open All Mail for writing, once, on the changing connection only", async () => {
    for (const [tool, args] of [
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], addLabels: ["FreeDuet"] },
      ],
      ["gmail_archive_messages", { messageIds: [HEX.a] }],
      ["gmail_mark_messages", { messageIds: [HEX.a], state: "read" }],
    ] as const) {
      const { box, transport } = setup();
      const result = await transport.callTool(connection, tool, args);
      expect(result.isError).toBe(false);
      expect(
        box.called("mailboxOpen").map((call) => [call.via, call.args]),
      ).toEqual([["write", ["[Gmail]/All Mail", { readOnly: false }]]]);
      expect(box.readConnections).toHaveLength(0);
      expect(box.writeConnections).toHaveLength(1);
      expect(box.violations).toEqual([]);
    }
  });

  test("a search and a read still open the mailbox read-only, and never make the changing connection", async () => {
    const { box, transport } = setup();
    await transport.callTool(connection, "gmail_read_message", { id: HEX.a });
    await transport.callTool(connection, "gmail_search_messages", {});
    const opens = box.called("mailboxOpen");
    expect(opens.length).toBeGreaterThan(0);
    for (const open of opens) {
      expect(open.via).toBe("read");
      expect(open.args[1]).toEqual({ readOnly: true });
    }
    expect(box.writeConnections).toHaveLength(0);
    expect(box.changedAnything()).toBe(false);
  });

  test("the reading connection is never asked for a method that changes a mailbox, whatever the call", async () => {
    const { box, transport } = setup();
    for (const [tool, args] of [
      ["gmail_list_labels", {}],
      ["gmail_search_messages", { query: "from:ana" }],
      ["gmail_read_message", { id: HEX.a }],
    ] as const) {
      await transport.callTool(connection, tool, args);
    }
    await transport.describeCall(connection, "gmail_archive_messages", {
      messageIds: [HEX.a],
    });
    for (const call of box.calls) {
      if (call.via === "read") {
        expect(
          (CHANGING_METHODS as readonly string[]).includes(call.method),
        ).toBe(false);
      }
    }
    expect(box.violations).toEqual([]);
  });
});

describe("creating a label", () => {
  test("one that is there, in any case, is a success that says so and is not created again", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(connection, "gmail_create_label", {
      name: "freeduet",
    });
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      label: "FreeDuet",
      created: false,
      note: "A label with this name already exists, so nothing was changed.",
    });
    expect(box.called("mailboxCreate")).toEqual([]);
  });

  test("one the server says was already there is the same success", async () => {
    const { box, transport } = setup();
    box.createdAnswer = { path: "Receipts", created: false };
    const result = await transport.callTool(connection, "gmail_create_label", {
      name: "Receipts",
    });
    expect(result.isError).toBe(false);
    expect(json(result.text)).toMatchObject({
      label: "Receipts",
      created: false,
    });
  });

  test("a label named for a special folder by the library alone is still the person's, and found by its name", async () => {
    const { box, transport } = setup();
    box.folders.push({
      path: "Archive",
      specialUse: "\\Archive",
      specialUseSource: "name",
    });
    const listed = await transport.callTool(
      connection,
      "gmail_list_labels",
      {},
    );
    expect(json(listed.text)).toMatchObject({
      labels: ["Archive", "Clients/Acme", "FreeDuet"],
    });
    const added = await transport.callTool(connection, "gmail_label_messages", {
      messageIds: [HEX.a],
      addLabels: ["archive"],
    });
    expect(added.isError).toBe(false);
    expect(box.called("messageFlagsAdd")[0]?.args[1]).toEqual(["Archive"]);
  });

  test("the folders the server flagged are never listed as labels", async () => {
    const { transport } = setup();
    const listed = await transport.callTool(
      connection,
      "gmail_list_labels",
      {},
    );
    expect(listed.text).not.toContain("Trash");
    expect(listed.text).not.toContain("Spam");
    expect(listed.text).not.toContain("All Mail");
    expect(listed.text).not.toContain("INBOX");
  });
});

describe("labelling", () => {
  test("adding the person's own label: the lookups, then one store on the labels, with the label as the account spells it", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.a, HEX.b],
        addLabels: ["fReEdUeT"],
      },
    );
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({
      labeled: 2,
      added: ["FreeDuet"],
      removed: [],
    });
    expect(work(box)).toEqual([
      "write:list",
      "write:mailboxOpen",
      "write:search",
      "write:search",
      "write:messageFlagsAdd",
    ]);
    expect(box.called("search").map((call) => call.args)).toEqual([
      [{ emailId: decimalOf(HEX.a) }, { uid: true }],
      [{ emailId: decimalOf(HEX.b) }, { uid: true }],
    ]);
    expect(box.called("messageFlagsAdd")[0]?.args).toEqual([
      "11,12",
      ["FreeDuet"],
      { uid: true, useLabels: true },
    ]);
    expect(box.message(decimalOf(HEX.a))?.labels).toEqual([
      "\\Inbox",
      "FreeDuet",
    ]);
    expect(box.message(decimalOf(HEX.b))?.labels).toContain("FreeDuet");
  });

  test("adding and removing in one call, with Starred as Gmail spells it", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.c],
        addLabels: ["Clients/Acme", "starred"],
        removeLabels: ["FreeDuet", "IMPORTANT"],
      },
    );
    expect(result.isError).toBe(false);
    expect(box.called("messageFlagsAdd")[0]?.args).toEqual([
      "13",
      ["Clients/Acme", "\\Starred"],
      { uid: true, useLabels: true },
    ]);
    expect(box.called("messageFlagsRemove")[0]?.args).toEqual([
      "13",
      ["FreeDuet", "\\Important"],
      { uid: true, useLabels: true },
    ]);
    expect(json(result.text)).toEqual({
      labeled: 1,
      added: ["Clients/Acme", "STARRED"],
      removed: ["FreeDuet", "IMPORTANT"],
    });
  });

  test("a label that is not there is refused before the mailbox is opened or one message looked up", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.a],
        addLabels: ["Nonexistent"],
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toBe(noSuchLabel);
    expect(work(box)).toEqual(["write:list"]);
    expect(box.called("mailboxOpen")).toEqual([]);
    expect(box.changedAnything()).toBe(false);
  });

  test("all of the named messages or none: one that is gone refuses the call and changes nothing", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.a, "1a2b3c4d5e6f7aff", HEX.b],
        addLabels: ["FreeDuet"],
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toBe(missingMessages(1, 3));
    expect(box.changedAnything()).toBe(false);
    expect(box.message(decimalOf(HEX.a))?.labels).toEqual(["\\Inbox"]);
  });
});

describe("archiving", () => {
  test("it removes the Inbox label by its store on the labels and nothing else, and says how many were in the Inbox", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.b, HEX.c],
      },
    );
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({ archived: 1, alreadyOutOfInbox: 1 });
    expect(work(box)).toEqual([
      "write:list",
      "write:mailboxOpen",
      "write:search",
      "write:search",
      "write:fetch",
      "write:messageFlagsRemove",
    ]);
    expect(box.called("messageFlagsRemove")[0]?.args).toEqual([
      "12,13",
      ["\\Inbox"],
      { uid: true, useLabels: true },
    ]);
    expect(box.called("messageFlagsAdd")).toEqual([]);
    // It left the Inbox and kept every other label: it is still in All Mail, with them.
    expect(box.message(decimalOf(HEX.b))?.labels).toEqual(["\\Important"]);
    expect(box.message(decimalOf(HEX.c))?.labels).toEqual(["FreeDuet"]);
  });
});

describe("marking", () => {
  test("read adds the Seen flag, as a flag and not a label", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.a],
      state: "read",
    });
    expect(result.isError).toBe(false);
    expect(json(result.text)).toEqual({ marked: 1, as: "read" });
    expect(box.called("messageFlagsAdd")[0]?.args).toEqual([
      "11",
      ["\\Seen"],
      { uid: true },
    ]);
    expect(box.called("messageFlagsRemove")).toEqual([]);
    expect(box.message(decimalOf(HEX.a))?.flags).toEqual(["\\Seen"]);
  });

  test("unread removes the Seen flag", async () => {
    const { box, transport } = setup();
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.b],
      state: "unread",
    });
    expect(result.isError).toBe(false);
    expect(box.called("messageFlagsRemove")[0]?.args).toEqual([
      "12",
      ["\\Seen"],
      { uid: true },
    ]);
    expect(box.called("messageFlagsAdd")).toEqual([]);
    expect(box.message(decimalOf(HEX.b))?.flags).toEqual([]);
  });
});

describe("a call that cannot be carried out costs no connection at all", () => {
  test("every refusal is made before a connection of either kind", async () => {
    const { box, transport } = setup();
    const calls: [string, Record<string, unknown>, string][] = [
      ["gmail_create_label", { name: "" }, ORGANISE_REFUSALS.noName],
      ["gmail_create_label", { name: "Trash" }, ORGANISE_REFUSALS.reservedName],
      ["gmail_create_label", { name: "a\nb" }, ORGANISE_REFUSALS.labelName],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], addLabels: ["TRASH"] },
        ORGANISE_REFUSALS.hidesMail,
      ],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], removeLabels: ["\\Spam"] },
        ORGANISE_REFUSALS.hidesMail,
      ],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], removeLabels: ["INBOX"] },
        ORGANISE_REFUSALS.systemLabel,
      ],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], addLabels: ["X"], query: "in:inbox" },
        ORGANISE_REFUSALS.extra,
      ],
      ["gmail_archive_messages", { messageIds: [] }, ORGANISE_REFUSALS.noIds],
      [
        "gmail_archive_messages",
        { messageIds: ["zz"] },
        ORGANISE_REFUSALS.badIds,
      ],
      [
        "gmail_archive_messages",
        {
          messageIds: Array.from({ length: 101 }, (_, i) =>
            (i + 1).toString(16),
          ),
        },
        ORGANISE_REFUSALS.tooManyIds,
      ],
      [
        "gmail_mark_messages",
        { messageIds: [HEX.a], state: "deleted" },
        ORGANISE_REFUSALS.state,
      ],
    ];
    for (const [tool, args, sentence] of calls) {
      const result = await transport.callTool(connection, tool, args);
      expect(result.isError).toBe(true);
      expect(result.text).toBe(sentence);
    }
    expect(box.readConnections).toHaveLength(0);
    expect(box.writeConnections).toHaveLength(0);
    expect(box.calls).toEqual([]);
  });

  test("a call with nobody attributed, or a secret that cannot be read, is refused before a connection too", async () => {
    const { box, transport } = setup();
    const noActor = await transport.callTool(
      { ...connection, actorId: undefined },
      "gmail_archive_messages",
      { messageIds: [HEX.a] },
    );
    expect(noActor.isError).toBe(true);
    const noSecret = await transport.callTool(
      { ...connection, token: "not a secret" },
      "gmail_archive_messages",
      { messageIds: [HEX.a] },
    );
    expect(noSecret.isError).toBe(true);
    expect(box.writeConnections).toHaveLength(0);
    expect(box.readConnections).toHaveLength(0);
  });
});

describe("a connection is closed however the call ended, and says nothing in the library's words", () => {
  const library = "LIBRARY-INTERNALS-7731 STORE failed at line 42";

  test("a failure at any step ends in a fixed sentence, after which the mailbox is untouched and the connection closed", async () => {
    for (const step of ["connect", "list", "mailboxOpen", "search", "fetch"]) {
      const { box, transport } = setup();
      box.failures.set(step, new Error(library));
      const result = await transport.callTool(
        connection,
        "gmail_archive_messages",
        {
          messageIds: [HEX.a],
        },
      );
      expect(result.isError).toBe(true);
      expect(result.text).toBe("Gmail refused this change.");
      expect(result.text).not.toContain("LIBRARY");
      expect(box.changedAnything()).toBe(false);
      expect(box.logouts).toBe(1);
    }
  });

  test("a store that throws is the same sentence, and the connection is still closed", async () => {
    const { box, transport } = setup();
    box.failures.set("messageFlagsRemove", new Error(library));
    const result = await transport.callTool(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.a],
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Gmail refused this change.");
    expect(box.logouts).toBe(1);
  });

  test("a refused login, an unreachable host and a timeout are told apart, by code and not by words", async () => {
    const kinds: [unknown, RegExp][] = [
      [
        Object.assign(new Error(library), { authenticationFailed: true }),
        /app password/,
      ],
      [
        Object.assign(new Error(library), { code: "ECONNRESET" }),
        /could not be reached/,
      ],
      [
        Object.assign(new Error(library), { code: "ETIMEDOUT" }),
        /did not answer in time/,
      ],
    ];
    for (const [error, sentence] of kinds) {
      const { box, transport } = setup();
      box.failures.set("connect", error);
      const result = await transport.callTool(
        connection,
        "gmail_mark_messages",
        {
          messageIds: [HEX.a],
          state: "read",
        },
      );
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(sentence);
      expect(result.text).not.toContain("LIBRARY");
    }
  });

  test("a timeout or a dropped connection after a change was sent says that it may have been made", async () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET"]) {
      const { box, transport } = setup();
      box.failures.set(
        "messageFlagsAdd",
        Object.assign(new Error(library), { code }),
      );
      const result = await transport.callTool(
        connection,
        "gmail_mark_messages",
        { messageIds: [HEX.a], state: "read" },
      );
      expect(result.isError).toBe(true);
      expect(result.text).toBe(MAY_HAVE_CHANGED);
      expect(result.text).toContain("may have been made");
      expect(result.text).not.toContain("LIBRARY");
    }
  });

  test("a timeout before any command that changes a thing was sent says only that Gmail did not answer", async () => {
    const { box, transport } = setup();
    box.failures.set(
      "search",
      Object.assign(new Error(library), { code: "ETIMEDOUT" }),
    );
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.a],
      state: "read",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/did not answer in time/);
    expect(result.text).not.toContain("may have been made");
    expect(box.changedAnything()).toBe(false);
  });

  test("a logout the server does not answer is cut off after two seconds, and the call still answers", async () => {
    const { box, transport } = setup();
    box.logoutHangs = true;
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.a],
      state: "read",
    });
    expect(result.isError).toBe(false);
    expect(box.logouts).toBe(1);
    expect(box.closes).toBeGreaterThanOrEqual(1);
  });

  test("a server that does not make the change is a failure, and the answer never claims it was made", async () => {
    const { box, transport } = setup();
    box.storeAnswers = false;
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.a],
      state: "read",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Gmail did not make this change.");
    expect(box.message(decimalOf(HEX.a))?.flags).toEqual([]);
  });

  test("a removal that fails after the labels were added says that only part was made", async () => {
    const { box, transport } = setup();
    box.failures.set("messageFlagsRemove", new Error(library));
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.c],
        addLabels: ["Clients/Acme"],
        removeLabels: ["FreeDuet"],
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("only part of this change");
    expect(result.text).not.toContain("LIBRARY");
    expect(box.message(decimalOf(HEX.c))?.labels).toContain("Clients/Acme");
    expect(box.logouts).toBe(1);
  });

  test("a removal the server does not make after the labels were added says that only part was made", async () => {
    const { box, transport } = setup();
    box.removeAnswers = false;
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.c],
        addLabels: ["Clients/Acme"],
        removeLabels: ["FreeDuet"],
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("only part of this change");
    expect(result.text).not.toContain("did not make this change");
    // What was added stays added, and what was to be removed is still there: the sentence says as much.
    const labels = box.message(decimalOf(HEX.c))?.labels ?? [];
    expect(labels).toContain("Clients/Acme");
    expect(labels).toContain("FreeDuet");
  });

  test("every connection that was made is logged out, over a run of mixed calls", async () => {
    const { box, transport } = setup();
    await transport.callTool(connection, "gmail_list_labels", {});
    await transport.callTool(connection, "gmail_create_label", {
      name: "Receipts",
    });
    await transport.callTool(connection, "gmail_archive_messages", {
      messageIds: [HEX.a, HEX.b],
    });
    await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: ["1a2b3c4d5e6f7aff"],
      state: "read",
    });
    await transport.describeCall(connection, "gmail_archive_messages", {
      messageIds: [HEX.a],
    });
    expect(box.logouts).toBe(
      box.readConnections.length + box.writeConnections.length,
    );
    expect(box.logouts).toBe(5);
  });
});

describe("the second guard, where the command is built", () => {
  test("a system label that deletes or hides mail is refused again at the store, whatever got past the arguments", async () => {
    const hostile = [
      { kind: "system", id: "TRASH" },
      { kind: "system", id: "SPAM" },
      { kind: "user", name: "\\Trash" },
      { kind: "user", name: "\\Deleted" },
      { kind: "user", name: "\\Junk" },
    ];
    for (const ref of hostile) {
      for (const field of ["add", "remove"] as const) {
        const { box } = setup();
        // Folders by those names exist, so the lookup finds them and only the guard can refuse.
        box.folders.push(
          { path: "\\Trash" },
          { path: "\\Deleted" },
          { path: "\\Junk" },
        );
        const client = box.organiser({
          host: "imap.gmail.com",
          port: 993,
          secure: true,
          user: "maya@example.com",
          pass: "x",
        });
        const call = {
          tool: LABEL_MESSAGES,
          ids: [HEX.a],
          add: field === "add" ? [ref] : [{ kind: "user", name: "FreeDuet" }],
          remove: field === "remove" ? [ref] : [],
        } as never;
        await expect(organiseOverImap(client, call)).rejects.toThrow();
        // Not one command of any kind reached the mailbox: the guard ran before anything was sent.
        expect(box.changedAnything()).toBe(false);
        expect(box.called("mailboxOpen")).toEqual([]);
      }
    }
  });
});

describe("what the approval card is told, over an app password", () => {
  test("the sender and subject of each named message, as read from the mailbox, in the order named", async () => {
    const { box, transport } = setup();
    for (const [tool, args] of [
      [
        "gmail_label_messages",
        { messageIds: [HEX.b, HEX.a], addLabels: ["FreeDuet"] },
      ],
      ["gmail_archive_messages", { messageIds: [HEX.b, HEX.a] }],
      ["gmail_mark_messages", { messageIds: [HEX.b, HEX.a], state: "read" }],
    ] as const) {
      const details = await transport.describeCall(connection, tool, args);
      expect(details).toEqual({
        messages: [
          { from: "News <news@example.org>", subject: "Weekly digest" },
          { from: "Ana <ana@example.com>", subject: "Invoice 42" },
        ],
        missing: 0,
      });
    }
    // It only reads: the reading connection, the mailbox opened read-only, and nothing that changes.
    expect(box.writeConnections).toHaveLength(0);
    for (const open of box.called("mailboxOpen")) {
      expect(open.args[1]).toEqual({ readOnly: true });
    }
    expect(box.changedAnything()).toBe(false);
  });

  test("ids the mailbox does not hold are counted, not listed", async () => {
    const { transport } = setup();
    const details = await transport.describeCall(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.a, "1a2b3c4d5e6f7aff"],
      },
    );
    expect(details?.missing).toBe(1);
    expect(details?.messages).toEqual([
      { from: "Ana <ana@example.com>", subject: "Invoice 42" },
    ]);
  });

  test("a call that names no messages, cannot be carried out, or has nobody or no secret behind it reads nothing", async () => {
    const { box, transport } = setup();
    expect(
      await transport.describeCall(connection, "gmail_list_labels", {}),
    ).toBeUndefined();
    expect(
      await transport.describeCall(connection, "gmail_create_label", {
        name: "X",
      }),
    ).toBeUndefined();
    expect(
      await transport.describeCall(connection, "gmail_label_messages", {
        messageIds: [HEX.a],
        addLabels: ["TRASH"],
      }),
    ).toBeUndefined();
    expect(
      await transport.describeCall(connection, "gmail_search_messages", {}),
    ).toBeUndefined();
    expect(
      await transport.describeCall(
        { ...connection, actorId: undefined },
        "gmail_archive_messages",
        { messageIds: [HEX.a] },
      ),
    ).toBeUndefined();
    expect(
      await transport.describeCall(
        { ...connection, token: "not a secret" },
        "gmail_archive_messages",
        { messageIds: [HEX.a] },
      ),
    ).toBeUndefined();
    expect(box.readConnections).toHaveLength(0);
    expect(box.writeConnections).toHaveLength(0);
  });

  test("a mailbox that cannot be read leaves the card to say so, and the connection is closed", async () => {
    const { box, transport } = setup();
    box.failures.set("search", new Error("anything"));
    const details = await transport.describeCall(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.a],
      },
    );
    expect(details).toBeUndefined();
    expect(box.logouts).toBe(1);
  });
});

describe("the source of the module that changes a mailbox", () => {
  const source = readFileSync(
    new URL("../src/plugins/google-imap-organise.ts", import.meta.url),
    "utf8",
  );
  /** The code without its comments: a comment may say what the module never does. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("it calls exactly the eight client methods its five operations need, four of which change a mailbox", () => {
    const called = new Set(
      [...code.matchAll(/client\.(\w+)\(/g)].map((match) => match[1]),
    );
    expect([...called].sort()).toEqual(
      [
        "fetch",
        "list",
        "mailboxCreate",
        "mailboxOpen",
        "messageCopy",
        "messageFlagsAdd",
        "messageFlagsRemove",
        "search",
      ].sort(),
    );
  });

  test("the one copy there is goes to the Bin the server flagged, after the messages were found, and nothing else is copied or moved", () => {
    expect([...code.matchAll(/client\.messageCopy\(/g)]).toHaveLength(1);
    expect(code).toContain("client.messageCopy(range, bin, { uid: true })");
    // The Bin is the folder carrying the server's own flag, never one found by a name.
    expect([...code.matchAll(/\\\\Trash/g)]).toHaveLength(1);
    expect(code).toContain(
      'folder.specialUse === "\\\\Trash" && folder.specialUseSource !== "name"',
    );
    expect(code.match(/\bTrash\b/g)).toHaveLength(1);
  });

  test("it never names a method that removes, moves, expunges, renames or appends, or a flag that marks mail for removal, and never touches Spam", () => {
    for (const forbidden of [
      "messageDelete",
      "messageMove",
      "messageFlagsSet",
      "mailboxDelete",
      "mailboxRename",
      "mailboxClose",
      "expunge",
      "append",
      ".store(",
      ".move(",
      ".copy(",
      "\\\\Deleted",
      "\\\\Spam",
      "\\\\Junk",
      "Spam",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  test("the mailbox it opens is opened for writing, and the literal says so", () => {
    expect(code.match(/client\.mailboxOpen\(/g)?.length).toBe(1);
    expect(code).toContain("{ readOnly: false }");
    expect(code).not.toContain("readOnly: true");
  });
});
