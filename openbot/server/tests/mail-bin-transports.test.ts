import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { callTool, describeCall } from "../src/plugins/google-workspace-rest";
import {
  createGoogleImapTransport,
  MAY_HAVE_CHANGED,
} from "../src/plugins/google-imap";
import {
  BIN_MESSAGES,
  binNotConfirmed,
  MAX_ORGANISE_MESSAGES,
  missingMessages,
  noBinFolder,
  ORGANISE_REFUSALS,
} from "../src/plugins/mail-organise";
import { tokenFor } from "./support/fake-imap";
import { FakeMailbox, HEX } from "./support/fake-mail-organiser";

/**
 * `gmail_bin_messages` on both connections, asserted without Google (docs/design/mail-organise.md,
 * "Move to the Bin"). Moves only the listed ids to the Bin (Gmail's Trash), at most a hundred a call,
 * never deletes for good, never touches Spam, never expunges, and finds the Bin by the server's own
 * flag. Every request the REST connection makes in this file is held to one allow-list in `afterEach`.
 */

/* ------------------------------------------------------------------------------------------------
 * REST
 * ---------------------------------------------------------------------------------------------- */

const connection = { url: "https://www.googleapis.com", token: "test-token" };
const BASE = "/gmail/v1/users/me";
const A = "1a2b3c4d5e6f7a01";
const B = "1a2b3c4d5e6f7a02";
const C = "1a2b3c4d5e6f7a03";
const IN_BIN = "1a2b3c4d5e6f7a04";
const IN_SPAM = "1a2b3c4d5e6f7a05";

type Seen = { method: string; url: URL; body: unknown };

const realFetch = globalThis.fetch;
let everyCall: Seen[] = [];
let boxLabels: Record<string, string[]> = {};
/** The ids Gmail's `trash` answered for, in order, and one it should refuse. */
let refuseTrashFor: string | undefined;

beforeEach(() => {
  everyCall = [];
  refuseTrashFor = undefined;
  boxLabels = {
    [A]: ["INBOX", "UNREAD"],
    [B]: ["INBOX"],
    [C]: ["Label_1"],
    [IN_BIN]: ["TRASH"],
    [IN_SPAM]: ["SPAM"],
  };
  globalThis.fetch = (async (input: string | URL, options?: RequestInit) => {
    const url = new URL(String(input));
    const call: Seen = {
      method: options?.method ?? "GET",
      url,
      body: typeof options?.body === "string" ? JSON.parse(options.body) : null,
    };
    everyCall.push(call);
    const one = /^\/gmail\/v1\/users\/me\/messages\/([0-9a-f]+)$/.exec(
      url.pathname,
    );
    if (one && call.method === "GET") {
      const labels = boxLabels[one[1] ?? ""];
      if (!labels) {
        return Response.json(
          { error: { code: 404, message: "gone" } },
          { status: 404 },
        );
      }
      return Response.json({
        id: one[1],
        labelIds: labels,
        payload: {
          headers: [
            { name: "From", value: "Ana <ana@example.com>" },
            { name: "Subject", value: `About ${one[1]}` },
          ],
        },
      });
    }
    const trash = /^\/gmail\/v1\/users\/me\/messages\/([0-9a-f]+)\/trash$/.exec(
      url.pathname,
    );
    if (trash && call.method === "POST") {
      if (trash[1] === refuseTrashFor) {
        return Response.json(
          { error: { code: 500, message: "backend" } },
          { status: 500 },
        );
      }
      const labels = boxLabels[trash[1] ?? ""];
      if (!labels)
        return Response.json({ error: { code: 404 } }, { status: 404 });
      boxLabels[trash[1] ?? ""] = [
        ...labels.filter((l) => l !== "INBOX"),
        "TRASH",
      ];
      return Response.json({
        id: trash[1],
        labelIds: boxLabels[trash[1] ?? ""],
      });
    }
    return Response.json(
      { error: { code: 404, message: "no route" } },
      { status: 404 },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  // The only requests the Bin tool may make: read one message, and trash one named message.
  for (const call of everyCall) {
    const path = call.url.pathname;
    if (/^\/gmail\/v1\/users\/me\/messages\/[0-9a-f]{1,16}$/.test(path)) {
      expect(call.method).toBe("GET");
    } else if (
      /^\/gmail\/v1\/users\/me\/messages\/[0-9a-f]{1,16}\/trash$/.test(path)
    ) {
      expect(call.method).toBe("POST");
      expect(call.body).toEqual({});
    } else {
      throw new Error(
        `a request the Bin tool may not make: ${call.method} ${path}`,
      );
    }
  }
  expect(everyCall.length).toBeLessThanOrEqual(2 * MAX_ORGANISE_MESSAGES);
});

const shape = (calls: readonly Seen[]) =>
  calls.map((call) => `${call.method} ${call.url.pathname.replace(BASE, "")}`);

describe("binning over REST", () => {
  test("each named message is looked up, then trashed with Gmail's own trash call, and only those", async () => {
    const result = await callTool(connection, BIN_MESSAGES, {
      messageIds: [A, B],
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ binned: 2 });
    expect(shape(everyCall)).toEqual([
      `GET /messages/${A}`,
      `GET /messages/${B}`,
      `POST /messages/${A}/trash`,
      `POST /messages/${B}/trash`,
    ]);
    expect(boxLabels[A]).toContain("TRASH");
    expect(boxLabels[B]).toContain("TRASH");
    // The message that was not named is untouched.
    expect(boxLabels[C]).toEqual(["Label_1"]);
  });

  test("the answer says the Bin keeps them about 30 days and that nothing was deleted now", async () => {
    const result = await callTool(connection, BIN_MESSAGES, {
      messageIds: [A],
    });
    const answer = JSON.parse(result.text) as { note: string };
    expect(answer.note).toContain("about 30 days");
    expect(answer.note).toContain("Nothing was deleted now");
  });

  test("a hundred are trashed and a hundred and one are refused before any request", async () => {
    const hundred = Array.from({ length: 100 }, (_, i) =>
      (0x2000 + i).toString(16),
    );
    for (const id of hundred) boxLabels[id] = ["INBOX"];
    const ok = await callTool(connection, BIN_MESSAGES, {
      messageIds: hundred,
    });
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.text)).toMatchObject({ binned: 100 });
    expect(everyCall.filter((c) => c.method === "POST")).toHaveLength(100);

    everyCall = [];
    const refused = await callTool(connection, BIN_MESSAGES, {
      messageIds: [...hundred, "ffff"],
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(ORGANISE_REFUSALS.tooManyIds);
    expect(everyCall).toEqual([]);
  });

  test("a message that is gone, in the Bin or in Spam refuses the whole call, and nothing is trashed", async () => {
    for (const missing of ["ffffffff", IN_BIN, IN_SPAM]) {
      everyCall = [];
      const result = await callTool(connection, BIN_MESSAGES, {
        messageIds: [A, missing],
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(missingMessages(1, 2));
      expect(everyCall.some((c) => c.method === "POST")).toBe(false);
      expect(boxLabels[A]).toEqual(["INBOX", "UNREAD"]);
    }
  });

  test("a message in Spam is never trashed, and Spam is never named in a request", async () => {
    await callTool(connection, BIN_MESSAGES, { messageIds: [A, IN_SPAM] });
    expect(JSON.stringify(everyCall)).not.toMatch(/SPAM/);
    expect(boxLabels[IN_SPAM]).toEqual(["SPAM"]);
  });

  test("a failure part way says how many were moved and stops", async () => {
    refuseTrashFor = B;
    const result = await callTool(connection, BIN_MESSAGES, {
      messageIds: [A, B, C],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(
      "Only 1 of the 3 messages were moved to the Bin",
    );
    expect(boxLabels[A]).toContain("TRASH");
    expect(boxLabels[C]).toEqual(["Label_1"]);
  });

  test("a field that would reach a search, a folder or permanence is refused, and costs no request", async () => {
    for (const extra of [
      { query: "from:x" },
      { permanent: true },
      { folder: "Spam" },
    ]) {
      const result = await callTool(connection, BIN_MESSAGES, {
        messageIds: [A],
        ...extra,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(ORGANISE_REFUSALS.extra);
    }
    expect(everyCall).toEqual([]);
  });

  test("the card reads the named messages and trashes nothing", async () => {
    const details = await describeCall(connection, BIN_MESSAGES, {
      messageIds: [A, "ffffffff"],
    });
    expect(details?.messages).toHaveLength(1);
    expect(details?.missing).toBe(1);
    expect(everyCall.every((c) => c.method === "GET")).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------------
 * IMAP, against the in-memory mailbox
 * ---------------------------------------------------------------------------------------------- */

const imapConnection = {
  url: "",
  token: tokenFor(),
  actorId: "user_maya",
  botId: "bot_otto",
};

function imapSetup() {
  const box = new FakeMailbox();
  const transport = createGoogleImapTransport({
    imap: box.imap,
    organiser: box.organiser,
  });
  return { box, transport };
}

describe("binning over IMAP", () => {
  test("only the listed messages are copied into the folder the server flagged as the Bin, once", async () => {
    const { box, transport } = imapSetup();
    const result = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ binned: 2 });
    expect(box.copies).toEqual([
      { range: "11,13", destination: "[Gmail]/Trash" },
    ]);
    expect(box.message("1111111111111111111")?.labels).toContain("\\Trash");
    expect(box.message("1111111111111111113")?.labels).toContain("\\Trash");
    expect(box.message("1111111111111111112")?.labels).not.toContain("\\Trash");
    expect(box.violations).toEqual([]);
  });

  test("it never expunges, moves, flags for removal or stores, and never opens or names Spam", async () => {
    const { box, transport } = imapSetup();
    await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(box.methodsCalled().sort()).toEqual(
      [
        "connect",
        "list",
        "logout",
        "mailboxOpen",
        "messageCopy",
        "search",
        "on",
        "close",
      ]
        .filter((m) => box.methodsCalled().includes(m))
        .sort(),
    );
    for (const forbidden of [
      "messageFlagsAdd",
      "messageFlagsRemove",
      "messageDelete",
      "messageMove",
      "expunge",
      "mailboxDelete",
    ]) {
      expect(box.called(forbidden)).toEqual([]);
    }
    expect(JSON.stringify(box.calls)).not.toMatch(/Spam|Junk|Deleted/);
    // The mailbox was opened once, for writing, in All Mail.
    expect(box.called("mailboxOpen").map((c) => c.args)).toEqual([
      ["[Gmail]/All Mail", { readOnly: false }],
    ]);
  });

  test("the Bin is found by the server's special-use flag, whatever it is called", async () => {
    const { box, transport } = imapSetup();
    box.folders = box.folders.map((f) =>
      f.specialUse === "\\Trash" ? { ...f, path: "[Gmail]/Corbeille" } : f,
    );
    const result = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(result.isError).toBe(false);
    expect(box.copies).toEqual([
      { range: "11", destination: "[Gmail]/Corbeille" },
    ]);
  });

  test("a folder that only looks like the Bin, by name or by the library's guess, is not it: nothing is copied", async () => {
    const { box, transport } = imapSetup();
    box.folders = box.folders
      .filter((f) => f.specialUse !== "\\Trash")
      .concat([
        { path: "Trash" },
        {
          path: "[Gmail]/Trash",
          specialUse: "\\Trash",
          specialUseSource: "name",
        },
      ]);
    const result = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(noBinFolder);
    expect(box.copies).toEqual([]);
    // Refused before a mailbox was opened.
    expect(box.called("mailboxOpen")).toEqual([]);
  });

  test("a hundred and one are refused before any connection; a gone message refuses the whole call; a refused copy claims nothing", async () => {
    const { box, transport } = imapSetup();
    const tooMany = Array.from({ length: MAX_ORGANISE_MESSAGES + 1 }, (_, i) =>
      i.toString(16).padStart(4, "0"),
    );
    const refused = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: tooMany,
    });
    expect(refused.text).toBe(ORGANISE_REFUSALS.tooManyIds);
    expect(box.writeConnections).toHaveLength(0);

    const gone = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a, "ffffffffffff"],
    });
    expect(gone.text).toBe(missingMessages(1, 2));
    expect(box.copies).toEqual([]);

    box.copyAnswers = false;
    const failed = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain("did not make this change");
    expect(box.message("1111111111111111111")?.labels).toEqual(["\\Inbox"]);
  });

  test("a message already in the Bin is not found, so a second call changes nothing", async () => {
    const { box, transport } = imapSetup();
    await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a],
    });
    box.copies.length = 0;
    const again = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(again.isError).toBe(true);
    expect(again.text).toBe(missingMessages(1, 1));
    expect(box.copies).toEqual([]);
  });

  test("a server that keeps a message in All Mail after the copy is not confirmed: how many, and never that they were moved", async () => {
    const { box, transport } = imapSetup();
    box.staysAfterCopy.add("1111111111111111113");
    const result = await transport.callTool(imapConnection, BIN_MESSAGES, {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(binNotConfirmed(1, 1));
    expect(result.text).not.toContain("Moved to the Bin");
  });

  test("a timeout or a dropped connection after the copy was handed over says that it may have been made", async () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET"]) {
      const { box, transport } = imapSetup();
      box.failures.set(
        "messageCopy",
        Object.assign(new Error("LIBRARY"), { code }),
      );
      const result = await transport.callTool(imapConnection, BIN_MESSAGES, {
        messageIds: [HEX.a],
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(MAY_HAVE_CHANGED);
    }
  });

  test("the reading connection is never asked to copy, and the card reads read-only", async () => {
    const { box, transport } = imapSetup();
    const details = await transport.describeCall?.(
      imapConnection,
      BIN_MESSAGES,
      {
        messageIds: [HEX.a, HEX.b],
      },
    );
    expect(details?.messages).toHaveLength(2);
    expect(box.called("messageCopy")).toEqual([]);
    expect(box.writeConnections).toHaveLength(0);
    expect(box.changedAnything()).toBe(false);
  });
});
