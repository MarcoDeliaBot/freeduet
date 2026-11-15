import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { callTool, describeCall } from "../src/plugins/google-workspace-rest";
import {
  createGoogleImapTransport,
  MAY_HAVE_CHANGED,
} from "../src/plugins/google-imap";
import {
  MAX_ORGANISE_MESSAGES,
  missingMessages,
  noSpamFolder,
  ORGANISE_REFUSALS,
  SPAM_MESSAGES,
  spamNotConfirmed,
} from "../src/plugins/mail-organise";
import { tokenFor } from "./support/fake-imap";
import { FakeMailbox, HEX } from "./support/fake-mail-organiser";

/**
 * `gmail_spam_messages` on both connections, asserted without Google (docs/design/mail-organise.md,
 * "Move to Spam"). Moves only the listed ids to Spam, at most a hundred a call, deletes nothing,
 * never expunges, finds the Spam folder by the server's own flag, and says "not confirmed" when a
 * lookup afterwards still finds a message. Every REST request in this file is held to one allow-list.
 */

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
let refuseModifyFor: string | undefined;

beforeEach(() => {
  everyCall = [];
  refuseModifyFor = undefined;
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
    const modify =
      /^\/gmail\/v1\/users\/me\/messages\/([0-9a-f]+)\/modify$/.exec(
        url.pathname,
      );
    if (modify && call.method === "POST") {
      if (modify[1] === refuseModifyFor) {
        return Response.json(
          { error: { code: 500, message: "backend" } },
          { status: 500 },
        );
      }
      const labels = boxLabels[modify[1] ?? ""];
      if (!labels)
        return Response.json({ error: { code: 404 } }, { status: 404 });
      boxLabels[modify[1] ?? ""] = [
        ...labels.filter((l) => l !== "INBOX"),
        "SPAM",
      ];
      return Response.json({
        id: modify[1],
        labelIds: boxLabels[modify[1] ?? ""],
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
  // The only requests the Spam tool may make: read one message, and modify one named message.
  for (const call of everyCall) {
    const path = call.url.pathname;
    if (/^\/gmail\/v1\/users\/me\/messages\/[0-9a-f]{1,16}$/.test(path)) {
      expect(call.method).toBe("GET");
    } else if (
      /^\/gmail\/v1\/users\/me\/messages\/[0-9a-f]{1,16}\/modify$/.test(path)
    ) {
      expect(call.method).toBe("POST");
      expect(call.body).toEqual({
        addLabelIds: ["SPAM"],
        removeLabelIds: ["INBOX"],
      });
    } else {
      throw new Error(
        `a request the Spam tool may not make: ${call.method} ${path}`,
      );
    }
  }
  expect(everyCall.length).toBeLessThanOrEqual(2 * MAX_ORGANISE_MESSAGES);
});

const shape = (calls: readonly Seen[]) =>
  calls.map((call) => `${call.method} ${call.url.pathname.replace(BASE, "")}`);

describe("moving to Spam over REST", () => {
  test("each named message is looked up, then modified once to add SPAM and leave the Inbox, and only those", async () => {
    const result = await callTool(connection, SPAM_MESSAGES, {
      messageIds: [A, B],
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ spammed: 2 });
    expect(shape(everyCall)).toEqual([
      `GET /messages/${A}`,
      `GET /messages/${B}`,
      `POST /messages/${A}/modify`,
      `POST /messages/${B}/modify`,
    ]);
    expect(boxLabels[A]).toEqual(["UNREAD", "SPAM"]);
    expect(boxLabels[B]).toEqual(["SPAM"]);
    expect(boxLabels[C]).toEqual(["Label_1"]);
  });

  test("the answer says Gmail deletes Spam after about 30 days and that nothing was deleted now", async () => {
    const result = await callTool(connection, SPAM_MESSAGES, {
      messageIds: [A],
    });
    const answer = JSON.parse(result.text) as { note: string };
    expect(answer.note).toContain("Moved to Spam");
    expect(answer.note).toContain("about 30 days");
    expect(answer.note).toContain("Nothing was deleted now");
  });

  test("a hundred are moved and a hundred and one are refused before any request", async () => {
    const hundred = Array.from({ length: 100 }, (_, i) =>
      (0x2000 + i).toString(16),
    );
    for (const id of hundred) boxLabels[id] = ["INBOX"];
    const ok = await callTool(connection, SPAM_MESSAGES, {
      messageIds: hundred,
    });
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.text)).toMatchObject({ spammed: 100 });
    expect(everyCall.filter((c) => c.method === "POST")).toHaveLength(100);

    everyCall = [];
    const refused = await callTool(connection, SPAM_MESSAGES, {
      messageIds: [...hundred, "ffff"],
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(ORGANISE_REFUSALS.tooManyIds);
    expect(everyCall).toEqual([]);
  });

  test("a message that is gone, in the Bin or already in Spam refuses the whole call, and nothing is moved", async () => {
    for (const missing of ["ffffffff", IN_BIN, IN_SPAM]) {
      everyCall = [];
      const result = await callTool(connection, SPAM_MESSAGES, {
        messageIds: [A, missing],
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(missingMessages(1, 2));
      expect(everyCall.some((c) => c.method === "POST")).toBe(false);
      expect(boxLabels[A]).toEqual(["INBOX", "UNREAD"]);
    }
  });

  test("a failure part way says how many were moved and stops", async () => {
    refuseModifyFor = B;
    const result = await callTool(connection, SPAM_MESSAGES, {
      messageIds: [A, B, C],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(
      "Only 1 of the 3 messages were moved to Spam",
    );
    expect(boxLabels[A]).toContain("SPAM");
    expect(boxLabels[C]).toEqual(["Label_1"]);
  });

  test("a field that would reach a search, a folder, a sender or permanence is refused, and costs no request", async () => {
    for (const extra of [
      { query: "from:x" },
      { permanent: true },
      { folder: "Trash" },
      { block: true },
      { addLabelIds: ["TRASH"] },
    ]) {
      const result = await callTool(connection, SPAM_MESSAGES, {
        messageIds: [A],
        ...extra,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(ORGANISE_REFUSALS.extra);
    }
    expect(everyCall).toEqual([]);
  });

  test("the card reads the named messages and modifies nothing", async () => {
    const details = await describeCall(connection, SPAM_MESSAGES, {
      messageIds: [A, "ffffffff"],
    });
    expect(details?.messages).toHaveLength(1);
    expect(details?.missing).toBe(1);
    expect(everyCall.every((c) => c.method === "GET")).toBe(true);
  });
});

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

describe("moving to Spam over IMAP", () => {
  test("only the listed messages are copied into the folder the server flagged \\Junk, once", async () => {
    const { box, transport } = imapSetup();
    const result = await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ spammed: 2 });
    expect(box.copies).toEqual([
      { range: "11,13", destination: "[Gmail]/Spam" },
    ]);
    expect(box.message("1111111111111111111")?.labels).toContain("\\Spam");
    expect(box.message("1111111111111111113")?.labels).toContain("\\Spam");
    expect(box.message("1111111111111111112")?.labels).not.toContain("\\Spam");
    expect(box.violations).toEqual([]);
  });

  test("it never expunges, moves, flags for removal or stores, and never copies into the Bin", async () => {
    const { box, transport } = imapSetup();
    await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a],
    });
    for (const forbidden of [
      "messageFlagsAdd",
      "messageFlagsRemove",
      "messageDelete",
      "messageMove",
      "mailboxCreate",
    ]) {
      expect(box.methodsCalled()).not.toContain(forbidden);
    }
    expect(box.copies.map((c) => c.destination)).toEqual(["[Gmail]/Spam"]);
  });

  test("Spam is found by the server's special-use flag, whatever it is called, and a folder that only looks like it is not it", async () => {
    const renamed = imapSetup();
    for (const folder of renamed.box.folders) {
      if (folder.specialUse === "\\Junk") folder.path = "Courrier indésirable";
    }
    const ok = await renamed.transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(ok.isError).toBe(false);
    expect(renamed.box.copies).toEqual([
      { range: "11", destination: "Courrier indésirable" },
    ]);

    const guessed = imapSetup();
    for (const folder of guessed.box.folders) {
      if (folder.specialUse === "\\Junk") {
        folder.specialUseSource = "name";
      }
    }
    const refused = await guessed.transport.callTool(
      imapConnection,
      SPAM_MESSAGES,
      { messageIds: [HEX.a] },
    );
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(noSpamFolder);
    expect(guessed.box.copies).toEqual([]);
    expect(guessed.box.methodsCalled()).not.toContain("mailboxOpen");
  });

  test("a server that keeps a message in All Mail after the copy is not confirmed: how many, and never that they were moved", async () => {
    const { box, transport } = imapSetup();
    box.staysAfterCopy.add("1111111111111111113");
    const result = await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(spamNotConfirmed(1, 1));
    expect(result.text).not.toContain("Moved to Spam");
  });

  test("a hundred and one are refused before any connection, and a refused copy claims nothing", async () => {
    const { box, transport } = imapSetup();
    const tooMany = Array.from({ length: 101 }, (_, i) =>
      i.toString(16).padStart(4, "0"),
    );
    const refused = await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: tooMany,
    });
    expect(refused.isError).toBe(true);
    expect(box.methodsCalled()).toEqual([]);
    box.copyAnswers = false;
    const result = await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("did not make this change");
    expect(box.message("1111111111111111111")?.labels).toEqual(["\\Inbox"]);
  });

  test("a message already in Spam or the Bin is not found, so a second call changes nothing", async () => {
    const { box, transport } = imapSetup();
    await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a],
    });
    box.copies.length = 0;
    const again = await transport.callTool(imapConnection, SPAM_MESSAGES, {
      messageIds: [HEX.a],
    });
    expect(again.isError).toBe(true);
    expect(again.text).toBe(missingMessages(1, 1));
    expect(box.copies).toEqual([]);
  });

  test("a timeout or a dropped connection after the copy was handed over says that it may have been made", async () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET"]) {
      const { box, transport } = imapSetup();
      box.failures.set(
        "messageCopy",
        Object.assign(new Error("LIBRARY"), { code }),
      );
      const result = await transport.callTool(imapConnection, SPAM_MESSAGES, {
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
      SPAM_MESSAGES,
      { messageIds: [HEX.a, HEX.b] },
    );
    expect(details?.messages).toHaveLength(2);
    expect(box.called("messageCopy")).toEqual([]);
    expect(box.writeConnections).toHaveLength(0);
    expect(box.changedAnything()).toBe(false);
  });
});
