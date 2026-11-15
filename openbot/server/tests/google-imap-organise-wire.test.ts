import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { TCPSocketListener, Socket } from "bun";
import { ImapFlow } from "imapflow";
import {
  createGoogleImapTransport,
  type ImapClientLike,
  type ImapOrganiserFactory,
} from "../src/plugins/google-imap";
import {
  binNotConfirmed,
  missingMessages,
  spamNotConfirmed,
} from "../src/plugins/mail-organise";
import { tokenFor } from "./support/fake-imap";

/**
 * Organising a mailbox, over the wire: the real IMAP library, driven by the real transport, against a
 * socket that speaks enough of Gmail's IMAP to be organised.
 *
 * WHY THIS EXISTS. The claim that matters is about the commands that leave this machine: that a mailbox
 * is opened for writing only for the four operations and only for the length of one, that the only
 * commands that change anything are a `CREATE` of a label, a `UID STORE` of Gmail's labels and a
 * `UID STORE` of the Seen flag, and that nothing that deletes, trashes, moves, copies, expunges, renames
 * or appends is ever sent, whatever a Bot asks. The in-memory fake in `support/fake-mail-organiser.ts`
 * shows which methods the transport calls, not what the library turns each into. This file records
 * every command line the library writes and asserts on those, and it is the canary for an `imapflow`
 * upgrade that starts sending something else for the same calls.
 *
 * The server is a test double on 127.0.0.1. It keeps labels and flags per message and decodes each
 * `STORE` it receives, so what is asserted is also what the SERVER understood: a label named
 * `Fatture 2026` must arrive as one label, not two. Nothing leaves this machine.
 */

type Msg = {
  uid: number;
  id: string;
  labels: string[];
  flags: string[];
  from: string;
  subject: string;
};

type Folder = { flags: string; name: string };

const ID_A = "1111111111111111111";
const ID_B = "1111111111111111112";
const ID_C = "1111111111111111113";
const hex = (decimal: string) => BigInt(decimal).toString(16);
const HEX = { a: hex(ID_A), b: hex(ID_B), c: hex(ID_C) };

/** Every client line since the last reset, with its tag. */
const lines: string[] = [];
/** Every client line in the file, for the last test. */
const everyLine: string[] = [];
let messages: Msg[] = [];
let folders: Folder[] = [];
let refuseStore = false;
let refuseCopy = false;
/** Message ids a copy into the Bin or Spam leaves in All Mail, as a server that did not move them. */
let staysAfterCopy: string[] = [];
let alreadyExists: string[] = [];
let server: TCPSocketListener<undefined>;

function reset() {
  lines.length = 0;
  refuseStore = false;
  refuseCopy = false;
  staysAfterCopy = [];
  alreadyExists = [];
  messages = [
    {
      uid: 11,
      id: ID_A,
      labels: ["\\Inbox"],
      flags: [],
      from: "Ana <ana@example.com>",
      subject: "Invoice 42",
    },
    {
      uid: 12,
      id: ID_B,
      labels: ["\\Inbox", "\\Important"],
      flags: ["\\Seen"],
      from: "News <news@example.org>",
      subject: "Weekly digest",
    },
    {
      uid: 13,
      id: ID_C,
      labels: ["FreeDuet"],
      flags: ["\\Seen"],
      from: "Bob <bob@example.net>",
      subject: "Already filed",
    },
  ];
  // Names as the server sends them: modified UTF-7, so `Città` is `Citt&AOA-` and `&` is `&-`.
  folders = [
    { flags: "\\HasNoChildren", name: "INBOX" },
    { flags: "\\Noselect \\HasChildren", name: "[Gmail]" },
    { flags: "\\HasNoChildren \\All", name: "[Gmail]/All Mail" },
    { flags: "\\HasNoChildren \\Drafts", name: "[Gmail]/Drafts" },
    { flags: "\\HasNoChildren \\Sent", name: "[Gmail]/Sent Mail" },
    { flags: "\\HasNoChildren \\Junk", name: "[Gmail]/Spam" },
    { flags: "\\HasNoChildren \\Trash", name: "[Gmail]/Trash" },
    { flags: "\\HasNoChildren", name: "FreeDuet" },
    // A person's own label that the library would take for a special folder from its name alone.
    { flags: "\\HasNoChildren", name: "Archive" },
    { flags: "\\HasNoChildren", name: "Fatture 2026" },
    { flags: "\\HasNoChildren", name: "Citt&AOA-" },
    { flags: "\\HasChildren", name: "Clients" },
    { flags: "\\HasNoChildren", name: "Clients/Acme" },
  ];
}

/** The atoms and quoted strings of an IMAP list, decoded. */
function tokens(list: string): string[] {
  const out: string[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|([^\s"]+)/g;
  let match: RegExpExecArray | null = pattern.exec(list);
  while (match) {
    out.push(
      match[1] !== undefined
        ? match[1].replace(/\\(.)/g, "$1")
        : (match[2] ?? ""),
    );
    match = pattern.exec(list);
  }
  return out;
}

const quoted = (text: string) => `"${text.replace(/([\\"])/g, "\\$1")}"`;

function uidsOf(range: string): number[] {
  return range.split(",").map(Number);
}

function labelsData(message: Msg) {
  return message.labels.map(quoted).join(" ");
}

function fetchLine(message: Msg, seq: number, items: string): string {
  const out: string[] = [`UID ${message.uid}`];
  if (/X-GM-MSGID/.test(items)) out.push(`X-GM-MSGID ${message.id}`);
  if (/X-GM-LABELS/.test(items))
    out.push(`X-GM-LABELS (${labelsData(message)})`);
  if (/FLAGS/.test(items)) out.push(`FLAGS (${message.flags.join(" ")})`);
  const fields = /BODY\.PEEK\[HEADER\.FIELDS \(([^)]*)\)\]/.exec(items);
  if (fields) {
    const block = `From: ${message.from}\r\nSubject: ${message.subject}\r\n\r\n`;
    out.push(
      `BODY[HEADER.FIELDS (${fields[1]})] {${block.length}}\r\n${block}`,
    );
  }
  return `* ${seq} FETCH (${out.join(" ")})\r\n`;
}

function answer(socket: Socket<undefined>, raw: string) {
  lines.push(raw);
  everyLine.push(raw);
  const [tag, verb, ...rest] = raw.split(" ");
  const v = (verb ?? "").toUpperCase();
  const tail = rest.join(" ");
  const ok = (text = "done") => socket.write(`${tag} OK ${text}\r\n`);

  if (v === "CAPABILITY") {
    socket.write(
      `* CAPABILITY IMAP4rev1 AUTH=PLAIN UIDPLUS SPECIAL-USE X-GM-EXT-1\r\n${tag} OK done\r\n`,
    );
  } else if (v === "AUTHENTICATE" || v === "LOGIN") {
    ok("[CAPABILITY IMAP4rev1 UIDPLUS SPECIAL-USE X-GM-EXT-1] logged in");
  } else if (v === "ID") {
    socket.write(`* ID NIL\r\n${tag} OK done\r\n`);
  } else if (v === "NAMESPACE") {
    socket.write(`* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK done\r\n`);
  } else if (v === "LIST") {
    if (/^""\s+""/.test(tail)) {
      socket.write(`* LIST (\\Noselect) "/" ""\r\n${tag} OK done\r\n`);
    } else {
      const body = folders
        .map((f) => `* LIST (${f.flags}) "/" ${quoted(f.name)}\r\n`)
        .join("");
      socket.write(`${body}${tag} OK done\r\n`);
    }
  } else if (v === "LSUB") {
    ok();
  } else if (v === "SELECT" || v === "EXAMINE") {
    const writable = v === "SELECT";
    socket.write(
      `* ${messages.length} EXISTS\r\n* OK [UIDVALIDITY 1] ok\r\n* OK [UIDNEXT 99999] ok\r\n* FLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen)\r\n${
        writable
          ? "* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen \\*)] ok\r\n"
          : ""
      }${tag} OK [${writable ? "READ-WRITE" : "READ-ONLY"}] done\r\n`,
    );
  } else if (v === "CREATE") {
    const name = tokens(tail)[0] ?? "";
    if (alreadyExists.includes(name)) {
      socket.write(
        `${tag} NO [ALREADYEXISTS] Duplicate folder name ${name}\r\n`,
      );
    } else {
      folders.push({ flags: "\\HasNoChildren", name });
      ok();
    }
  } else if (v === "SUBSCRIBE") {
    ok();
  } else if (v === "UID" && (rest[0] ?? "").toUpperCase() === "SEARCH") {
    const wanted = /X-GM-MSGID (\d+)/.exec(tail)?.[1];
    // Gmail's All Mail does not hold what is in the Bin.
    const found = messages.filter(
      (m) =>
        m.id === wanted &&
        !m.labels.includes("\\Trash") &&
        !m.labels.includes("\\Spam"),
    );
    socket.write(
      `* SEARCH${found.map((m) => ` ${m.uid}`).join("")}\r\n${tag} OK done\r\n`,
    );
  } else if (v === "UID" && (rest[0] ?? "").toUpperCase() === "FETCH") {
    const [, range = "", ...items] = tail.split(" ");
    const wanted = new Set(uidsOf(range));
    const body = messages
      .filter((m) => wanted.has(m.uid))
      .map((m, index) => fetchLine(m, index + 1, items.join(" ")))
      .join("");
    socket.write(`${body}${tag} OK done\r\n`);
  } else if (v === "UID" && (rest[0] ?? "").toUpperCase() === "COPY") {
    const match = /^COPY (\S+) "((?:[^"\\]|\\.)*)"$/i.exec(tail);
    const range = match?.[1] ?? "";
    const destination = (match?.[2] ?? "").replace(/\\(.)/g, "$1");
    const bin = folders.find(
      (f) => f.name === destination && /\\(Trash|Junk)\b/.test(f.flags),
    );
    const label = bin && /\\Junk\b/.test(bin.flags) ? "\\Spam" : "\\Trash";
    if (!match || !bin || refuseCopy) {
      socket.write(`${tag} NO [CANNOT] Could not copy\r\n`);
      return;
    }
    // Gmail: a copy into the Bin puts the message in the Bin.
    for (const message of messages) {
      if (uidsOf(range).includes(message.uid)) {
        if (staysAfterCopy.includes(message.id)) continue;
        if (!message.labels.includes(label)) message.labels.push(label);
      }
    }
    ok();
  } else if (v === "UID" && (rest[0] ?? "").toUpperCase() === "STORE") {
    const match =
      /^UID STORE (\S+) ([+-]?)(FLAGS(?:\.SILENT)?|X-GM-LABELS) \((.*)\)$/i.exec(
        tail.startsWith("UID") ? tail : `UID ${tail}`,
      );
    if (!match || refuseStore) {
      socket.write(`${tag} NO [CANNOT] Could not store\r\n`);
      return;
    }
    const [, range = "", sign = "", item = "", list = ""] = match;
    const values = tokens(list);
    const key = item.toUpperCase() === "X-GM-LABELS" ? "labels" : "flags";
    for (const message of messages) {
      if (!uidsOf(range).includes(message.uid)) continue;
      if (sign === "+") {
        for (const value of values) {
          if (!message[key].includes(value)) message[key].push(value);
        }
      } else if (sign === "-") {
        message[key] = message[key].filter((each) => !values.includes(each));
      } else {
        message[key] = values;
      }
    }
    ok();
  } else if (v === "LOGOUT") {
    socket.write(`* BYE\r\n${tag} OK done\r\n`);
    socket.end();
  } else {
    // Anything else is answered, so that a command nobody expected is seen in `lines` and not mistaken
    // for a hang. The assertions below are what refuse it.
    ok();
  }
}

const buffers = new WeakMap<object, string>();

beforeAll(() => {
  server = Bun.listen<undefined>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.write(
          "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN UIDPLUS SPECIAL-USE X-GM-EXT-1] ready\r\n",
        );
      },
      data(socket, data) {
        const text =
          (buffers.get(socket) ?? "") + Buffer.from(data).toString("utf8");
        const parts = text.split("\r\n");
        buffers.set(socket, parts.pop() ?? "");
        for (const raw of parts) if (raw) answer(socket, raw);
      },
    },
  });
});

afterAll(() => {
  server.stop(true);
});

beforeEach(reset);

const asked: { kind: string; host: string; port: number; secure: boolean }[] =
  [];

function realLibrary(kind: string) {
  return (options: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  }) => {
    asked.push({
      kind,
      host: options.host,
      port: options.port,
      secure: options.secure,
    });
    return new ImapFlow({
      host: "127.0.0.1",
      port: server.port,
      secure: false,
      doSTARTTLS: false,
      auth: { user: options.user, pass: options.pass },
      logger: false,
      disableAutoIdle: true,
      disableCompression: true,
    }) as unknown as ImapClientLike;
  };
}

const transport = createGoogleImapTransport({
  imap: realLibrary("read") as never,
  organiser: realLibrary("write") as unknown as ImapOrganiserFactory,
});

const connection = {
  url: "",
  token: tokenFor(),
  actorId: "user_maya",
  botId: "bot_otto",
};

/** The command a line carries, past its tag: `UID STORE`, `SELECT`, `LOGOUT`. */
const commandOf = (line: string) => {
  const [, verb, next] = line.split(" ");
  return verb?.toUpperCase() === "UID"
    ? `UID ${next?.toUpperCase()}`
    : (verb ?? "").toUpperCase();
};

/** The line without its tag. */
const bodyOf = (line: string) => line.slice(line.indexOf(" ") + 1);

/** What every connection does before and after its work, which no test is about. */
const LIFECYCLE = new Set([
  "AUTHENTICATE",
  "LOGIN",
  "CAPABILITY",
  "ID",
  "NAMESPACE",
  "LSUB",
  "LOGOUT",
]);

/** The lines a call sent beyond the connection's own. */
const sent = (from: readonly string[] = lines) =>
  from.filter((line) => !LIFECYCLE.has(commandOf(line))).map(bodyOf);

/** Every command this module may cause the library to send, and no other. */
const ALLOWED_COMMANDS = new Set([
  "CAPABILITY",
  "AUTHENTICATE",
  "LOGIN",
  "ID",
  "NAMESPACE",
  "LIST",
  "LSUB",
  "SELECT",
  "EXAMINE",
  "UID SEARCH",
  "UID FETCH",
  "UID STORE",
  "UID COPY",
  "CREATE",
  "SUBSCRIBE",
  "LOGOUT",
]);

/** Commands that delete, move, copy, expunge, rename, append or reach outside the mailbox. */
const FORBIDDEN =
  /^(STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE|RENAME|UNSUBSCRIBE|IDLE|ENABLE|CLOSE|UNSELECT|UID MOVE|UID EXPUNGE|NOOP|STARTTLS|COMPRESS|SETQUOTA|SETACL|DELETEACL|SETMETADATA)$/;

/**
 * The only stores allowed: Gmail's labels, and the Seen flag. Nothing that marks a message for
 * removal, files it in Trash or Spam, or is some other flag.
 */
function expectOnlyAllowed(from: readonly string[]) {
  for (const line of from) {
    const command = commandOf(line);
    expect(ALLOWED_COMMANDS.has(command)).toBe(true);
    expect(command).not.toMatch(FORBIDDEN);
    if (command === "UID STORE") {
      const body = bodyOf(line);
      expect(body).toMatch(
        /^UID STORE [0-9,]+ [+-](X-GM-LABELS \(.+\)|FLAGS \(\\Seen\))$/,
      );
    }
    // The one copy there is goes into the Bin the server flagged, and is the only line that names it.
    const isBinCopy =
      command === "UID COPY" &&
      /^UID COPY [0-9,]+ "\[Gmail\]\/Trash"$/.test(bodyOf(line));
    const isSpamCopy =
      command === "UID COPY" &&
      /^UID COPY [0-9,]+ "\[Gmail\]\/Spam"$/.test(bodyOf(line));
    if (command === "UID COPY") expect(isBinCopy || isSpamCopy).toBe(true);
    // Not one of the client's lines names a label or flag that deletes or hides mail.
    expect(line).not.toMatch(/\\(Deleted|Spam|Junk|Draft)\b/i);
    expect(line).not.toMatch(/\[Gmail\]\/(Bin|Drafts)/i);
    if (!isBinCopy) {
      expect(line).not.toMatch(/\\Trash\b/i);
      expect(line).not.toMatch(/\[Gmail\]\/Trash/i);
    }
    if (!isSpamCopy) expect(line).not.toMatch(/\[Gmail\]\/Spam/i);
  }
}

describe("listing and creating labels", () => {
  test("listing is a LIST and nothing else: no mailbox is opened, and the library's guess at a special folder hides no label", async () => {
    const result = await transport.callTool(
      connection,
      "gmail_list_labels",
      {},
    );
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      labels: [
        "Archive",
        "Citt\u00E0",
        "Clients",
        "Clients/Acme",
        "Fatture 2026",
        "FreeDuet",
      ],
      alsoAllowed: ["STARRED", "IMPORTANT"],
    });
    expect(sent()).toEqual(['LIST "" ""', 'LIST "" "*"']);
    expect(lines.map(commandOf)).not.toContain("SELECT");
    expect(lines.map(commandOf)).not.toContain("EXAMINE");
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
    expectOnlyAllowed(lines);
  });

  test("creating a label is a CREATE and a SUBSCRIBE, with no mailbox opened", async () => {
    const result = await transport.callTool(connection, "gmail_create_label", {
      name: "Receipts 2026",
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      label: "Receipts 2026",
      created: true,
    });
    expect(sent()).toEqual([
      'LIST "" ""',
      'LIST "" "*"',
      'CREATE "Receipts 2026"',
      'SUBSCRIBE "Receipts 2026"',
    ]);
    expect(folders.map((f) => f.name)).toContain("Receipts 2026");
    expectOnlyAllowed(lines);
  });

  test("a name with punctuation or an accent is one quoted name on the wire", async () => {
    await transport.callTool(connection, "gmail_create_label", {
      name: "Citt\u00E0 (A) [B] {C}",
    });
    expect(sent().slice(2)).toEqual([
      'CREATE "Citt&AOA- (A) [B] {C}"',
      'SUBSCRIBE "Citt&AOA- (A) [B] {C}"',
    ]);
    expect(folders.at(-1)?.name).toBe("Citt&AOA- (A) [B] {C}");
  });

  test("a label that is there is not created again, in any case", async () => {
    const result = await transport.callTool(connection, "gmail_create_label", {
      name: "fatture 2026",
    });
    expect(JSON.parse(result.text)).toMatchObject({
      label: "Fatture 2026",
      created: false,
    });
    expect(sent()).toEqual(['LIST "" ""', 'LIST "" "*"']);
  });

  test("a label made between the look and the creation, which the server says is already there, is the same success", async () => {
    alreadyExists = ["RaceLabel"];
    const result = await transport.callTool(connection, "gmail_create_label", {
      name: "RaceLabel",
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({
      label: "RaceLabel",
      created: false,
    });
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
  });
});

describe("archiving", () => {
  test("it opens All Mail for writing, looks each message up, and removes the Inbox label from the labels: that is all", async () => {
    const result = await transport.callTool(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.a, HEX.c],
      },
    );
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      archived: 1,
      alreadyOutOfInbox: 1,
    });
    expect(sent()).toEqual([
      'LIST "" ""',
      'LIST "" "*"',
      'SELECT "[Gmail]/All Mail"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      `UID SEARCH X-GM-MSGID ${ID_C}`,
      "UID FETCH 11,13 (UID X-GM-MSGID X-GM-LABELS)",
      "UID STORE 11,13 -X-GM-LABELS (\\Inbox)",
    ]);
    // What the server understood: the message left the Inbox and kept every other label.
    expect(messages[0]?.labels).toEqual([]);
    expect(messages[1]?.labels).toEqual(["\\Inbox", "\\Important"]);
    expect(messages[2]?.labels).toEqual(["FreeDuet"]);
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
    expectOnlyAllowed(lines);
  });

  test("a hundred messages are a hundred looks and one store", async () => {
    messages = Array.from({ length: 100 }, (_, i) => ({
      uid: 100 + i,
      id: String(2000000000000000000n + BigInt(i)),
      labels: ["\\Inbox"],
      flags: [],
      from: "Many <many@example.com>",
      subject: `Message ${i}`,
    }));
    const ids = messages.map((m) => hex(m.id));
    const result = await transport.callTool(
      connection,
      "gmail_archive_messages",
      {
        messageIds: ids,
      },
    );
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      archived: 100,
      alreadyOutOfInbox: 0,
    });
    const commands = lines.map(commandOf);
    expect(commands.filter((c) => c === "UID SEARCH")).toHaveLength(100);
    expect(commands.filter((c) => c === "UID FETCH")).toHaveLength(1);
    expect(commands.filter((c) => c === "UID STORE")).toHaveLength(1);
    expect(messages.every((m) => m.labels.length === 0)).toBe(true);
    expectOnlyAllowed(lines);
  });
});

describe("binning", () => {
  test("it opens All Mail for writing, looks each message up, and copies them into the folder the server flagged as the Bin with one UID COPY: that is all", async () => {
    const result = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ binned: 2 });
    expect(sent()).toEqual([
      'LIST "" ""',
      'LIST "" "*"',
      'SELECT "[Gmail]/All Mail"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      `UID SEARCH X-GM-MSGID ${ID_C}`,
      'UID COPY 11,13 "[Gmail]/Trash"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      `UID SEARCH X-GM-MSGID ${ID_C}`,
    ]);
    // What the server understood: those two are in the Bin and the third was not touched.
    expect(messages[0]?.labels).toContain("\\Trash");
    expect(messages[2]?.labels).toContain("\\Trash");
    expect(messages[1]?.labels).toEqual(["\\Inbox", "\\Important"]);
    // Nothing was flagged, stored, expunged, moved or sent to Spam.
    const commands = lines.map(commandOf);
    for (const never of [
      "UID STORE",
      "STORE",
      "EXPUNGE",
      "UID EXPUNGE",
      "UID MOVE",
      "MOVE",
    ]) {
      expect(commands).not.toContain(never);
    }
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
    expectOnlyAllowed(lines);
  });

  test("the Bin is the folder the server flagged, never one found by a name: a label of the person's called Trash is not it", async () => {
    folders = folders.map((f) =>
      f.name === "[Gmail]/Trash"
        ? { flags: "\\HasNoChildren", name: "[Gmail]/Bin-without-a-flag" }
        : f,
    );
    folders.push({ flags: "\\HasNoChildren", name: "Trash" });
    const result = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: [HEX.a],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("did not report a Bin");
    // Refused before a mailbox was opened and before anything was sent to it.
    expect(sent()).toEqual(['LIST "" ""', 'LIST "" "*"']);
    expect(lines.map(commandOf)).not.toContain("UID COPY");
    expect(messages.every((m) => !m.labels.includes("\\Trash"))).toBe(true);
  });

  test("a hundred messages are a hundred looks and one copy, and a message the Bin already holds is not found", async () => {
    messages = Array.from({ length: 100 }, (_, i) => ({
      uid: 100 + i,
      id: String(2000000000000000000n + BigInt(i)),
      labels: ["\\Inbox"],
      flags: [],
      from: "Many <many@example.com>",
      subject: `Message ${i}`,
    }));
    const ids = messages.map((m) => hex(m.id));
    const result = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: ids,
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ binned: 100 });
    const commands = lines.map(commandOf);
    expect(commands.filter((c) => c === "UID SEARCH")).toHaveLength(200);
    expect(commands.filter((c) => c === "UID COPY")).toHaveLength(1);
    expect(messages.every((m) => m.labels.includes("\\Trash"))).toBe(true);
    expectOnlyAllowed(lines);

    // A second call finds them gone from All Mail and changes nothing.
    lines.length = 0;
    const again = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: ids.slice(0, 2),
    });
    expect(again.isError).toBe(true);
    expect(again.text).toBe(missingMessages(2, 2));
    expect(lines.map(commandOf)).not.toContain("UID COPY");
  });

  test("a hundred and one are refused before any connection, and a server that refuses the copy makes a failure that claims nothing", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) =>
      i.toString(16).padStart(4, "0"),
    );
    const refused = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: tooMany,
    });
    expect(refused.isError).toBe(true);
    expect(lines).toEqual([]);

    refuseCopy = true;
    const result = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: [HEX.a],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("did not make this change");
    expect(messages[0]?.labels).toEqual(["\\Inbox"]);
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
  });

  test("a message that is gone refuses the whole call, and nothing is copied", async () => {
    const result = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: [HEX.a, "ffffffffffff"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(missingMessages(1, 2));
    expect(lines.map(commandOf)).not.toContain("UID COPY");
    expect(messages.every((m) => !m.labels.includes("\\Trash"))).toBe(true);
  });
});

describe("binning, checked afterwards", () => {
  test("a server that keeps a message in All Mail after the copy is not confirmed: the answer says how many, and never that they were moved", async () => {
    staysAfterCopy = [ID_C];
    const result = await transport.callTool(connection, "gmail_bin_messages", {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(binNotConfirmed(1, 1));
    expect(result.text).not.toContain("Moved to the Bin");
    expect(lines.map(commandOf).filter((c) => c === "UID COPY")).toHaveLength(
      1,
    );
    expectOnlyAllowed(lines);
  });
});

describe("moving to Spam", () => {
  test("one UID COPY into the folder the server flagged \\Junk, looked up before and checked after: that is all", async () => {
    const result = await transport.callTool(connection, "gmail_spam_messages", {
      messageIds: [HEX.a, HEX.c],
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ spammed: 2 });
    expect(sent()).toEqual([
      'LIST "" ""',
      'LIST "" "*"',
      'SELECT "[Gmail]/All Mail"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      `UID SEARCH X-GM-MSGID ${ID_C}`,
      'UID COPY 11,13 "[Gmail]/Spam"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      `UID SEARCH X-GM-MSGID ${ID_C}`,
    ]);
    expect(messages[0]?.labels).toContain("\\Spam");
    expect(messages[2]?.labels).toContain("\\Spam");
    expect(messages[1]?.labels).toEqual(["\\Inbox", "\\Important"]);
    const commands = lines.map(commandOf);
    for (const never of [
      "UID STORE",
      "STORE",
      "EXPUNGE",
      "UID EXPUNGE",
      "UID MOVE",
      "MOVE",
    ]) {
      expect(commands).not.toContain(never);
    }
    expect(lines.some((line) => /\\Deleted/i.test(line))).toBe(false);
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
    expectOnlyAllowed(lines);
  });

  test("Spam is the folder the server flagged, never one found by a name: a label of the person's called Spam is not it", async () => {
    folders = folders.map((f) =>
      f.name === "[Gmail]/Spam"
        ? { flags: "\\HasNoChildren", name: "[Gmail]/Junk-without-a-flag" }
        : f,
    );
    folders.push({ flags: "\\HasNoChildren", name: "Spam" });
    const result = await transport.callTool(connection, "gmail_spam_messages", {
      messageIds: [HEX.a],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("did not report a Spam");
    expect(sent()).toEqual(['LIST "" ""', 'LIST "" "*"']);
    expect(lines.map(commandOf)).not.toContain("UID COPY");
  });

  test("a server that keeps the message in All Mail is not confirmed, and one that refuses the copy claims nothing", async () => {
    staysAfterCopy = [ID_A, ID_C];
    const kept = await transport.callTool(connection, "gmail_spam_messages", {
      messageIds: [HEX.a, HEX.c],
    });
    expect(kept.isError).toBe(true);
    expect(kept.text).toBe(spamNotConfirmed(0, 2));
    expect(kept.text).not.toContain("Moved to Spam");

    staysAfterCopy = [];
    refuseCopy = true;
    const refused = await transport.callTool(
      connection,
      "gmail_spam_messages",
      { messageIds: [HEX.b] },
    );
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("did not make this change");
    expect(messages[1]?.labels).toEqual(["\\Inbox", "\\Important"]);
  });

  test("a message that is gone refuses the whole call, and nothing is copied", async () => {
    const result = await transport.callTool(connection, "gmail_spam_messages", {
      messageIds: [HEX.a, "ffffffffffff"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(missingMessages(1, 2));
    expect(lines.map(commandOf)).not.toContain("UID COPY");
  });
});

describe("marking", () => {
  test("read stores the Seen flag as a flag", async () => {
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.a],
      state: "read",
    });
    expect(result.isError).toBe(false);
    expect(sent().slice(2)).toEqual([
      'SELECT "[Gmail]/All Mail"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      "UID STORE 11 +FLAGS (\\Seen)",
    ]);
    expect(messages[0]?.flags).toEqual(["\\Seen"]);
    expectOnlyAllowed(lines);
  });

  test("unread removes it", async () => {
    await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.b],
      state: "unread",
    });
    expect(sent().at(-1)).toBe("UID STORE 12 -FLAGS (\\Seen)");
    expect(messages[1]?.flags).toEqual([]);
    expectOnlyAllowed(lines);
  });
});

describe("labelling", () => {
  test("labels go as Gmail's own, quoted where they need it and encoded where they are not ASCII, and the server reads each as one label", async () => {
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.a],
        addLabels: ["Fatture 2026", "starred", "Citt\u00E0"],
        removeLabels: ["FreeDuet", "important"],
      },
    );
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      labeled: 1,
      added: ["Fatture 2026", "STARRED", "Citt\u00E0"],
      removed: ["FreeDuet", "IMPORTANT"],
    });
    expect(sent().slice(2)).toEqual([
      'SELECT "[Gmail]/All Mail"',
      `UID SEARCH X-GM-MSGID ${ID_A}`,
      'UID STORE 11 +X-GM-LABELS ("Fatture 2026" \\Starred Citt&AOA-)',
      "UID STORE 11 -X-GM-LABELS (FreeDuet \\Important)",
    ]);
    // "Fatture 2026" is ONE label to the server, and the other two arrived as what they are.
    expect(messages[0]?.labels).toEqual([
      "\\Inbox",
      "Fatture 2026",
      "\\Starred",
      "Citt&AOA-",
    ]);
    expectOnlyAllowed(lines);
  });

  test("a label with punctuation that could read as syntax is stored as that one name", async () => {
    // As the person names each label, and as the server names it: `&` is `&-` in modified UTF-7.
    const cases: [string, string][] = [
      ["A (B) [C]", "A (B) [C]"],
      ["{1}", "{1}"],
      ["100 percent", "100 percent"],
      ["it's, here; there", "it's, here; there"],
      ["A&B", "A&-B"],
    ];
    for (const [, wire] of cases) {
      folders.push({ flags: "\\HasNoChildren", name: wire });
    }
    for (const [name, wire] of cases) {
      const first = messages[0];
      if (!first) throw new Error("the mailbox has no message");
      first.labels = ["\\Inbox"];
      lines.length = 0;
      const result = await transport.callTool(
        connection,
        "gmail_label_messages",
        {
          messageIds: [HEX.a],
          addLabels: [name],
        },
      );
      expect(result.isError).toBe(false);
      expect(first.labels).toEqual(["\\Inbox", wire]);
      expectOnlyAllowed(lines);
    }
  });
});

describe("what is refused is refused before anything is sent", () => {
  test("every call that cannot be carried out opens no connection at all", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["gmail_label_messages", { messageIds: [HEX.a], addLabels: ["TRASH"] }],
      ["gmail_label_messages", { messageIds: [HEX.a], addLabels: ["\\Trash"] }],
      ["gmail_label_messages", { messageIds: [HEX.a], removeLabels: ["Spam"] }],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], addLabels: ["\\Deleted"] },
      ],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], removeLabels: ["INBOX"] },
      ],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], addLabels: ["FreeDuet"], all: true },
      ],
      ["gmail_label_messages", { query: "in:inbox", addLabels: ["FreeDuet"] }],
      [
        "gmail_label_messages",
        { messageIds: [HEX.a], addLabels: ["a\r\nA1 DELETE INBOX"] },
      ],
      ["gmail_label_messages", { messageIds: [HEX.a], addLabels: ['a" b'] }],
      ["gmail_create_label", { name: "a\r\nA1 DELETE INBOX" }],
      ["gmail_create_label", { name: 'x" {1}\r\n' }],
      ["gmail_create_label", { name: "wild*" }],
      ["gmail_create_label", { name: "wild%" }],
      ["gmail_create_label", { name: "[Gmail]/Trash" }],
      ["gmail_create_label", { name: "Trash" }],
      ["gmail_archive_messages", { messageIds: ["1 2"] }],
      ["gmail_archive_messages", { messageIds: ["1\r\nA1 EXPUNGE"] }],
      [
        "gmail_archive_messages",
        {
          messageIds: Array.from({ length: 101 }, (_, i) =>
            (i + 1).toString(16),
          ),
        },
      ],
      ["gmail_mark_messages", { messageIds: [HEX.a], state: "deleted" }],
      [
        "gmail_mark_messages",
        { messageIds: [HEX.a], state: "read", folder: "Trash" },
      ],
    ];
    for (const [tool, args] of calls) {
      const result = await transport.callTool(connection, tool, args);
      expect(result.isError).toBe(true);
    }
    expect(lines).toEqual([]);
  });

  test("a message that is gone refuses the whole call, and nothing is stored", async () => {
    const result = await transport.callTool(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.a, "1a2b3c4d5e6f7aff"],
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toBe(missingMessages(1, 2));
    expect(lines.map(commandOf)).not.toContain("UID STORE");
    expect(lines.map(commandOf)).not.toContain("UID FETCH");
    expect(messages[0]?.labels).toEqual(["\\Inbox"]);
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
  });

  test("a label that is not there is refused before the mailbox is opened", async () => {
    const result = await transport.callTool(
      connection,
      "gmail_label_messages",
      {
        messageIds: [HEX.a],
        addLabels: ["Nonexistent"],
      },
    );
    expect(result.isError).toBe(true);
    expect(sent()).toEqual(['LIST "" ""', 'LIST "" "*"']);
    expect(lines.map(commandOf)).not.toContain("SELECT");
  });

  test("a server that refuses the store makes the call a failure that does not claim a change, and the connection is closed", async () => {
    refuseStore = true;
    const result = await transport.callTool(connection, "gmail_mark_messages", {
      messageIds: [HEX.a],
      state: "read",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Gmail did not make this change.");
    expect(messages[0]?.flags).toEqual([]);
    expect(lines.map(commandOf).at(-1)).toBe("LOGOUT");
  });
});

describe("what the approval card reads, over the wire", () => {
  test("it opens the mailbox with EXAMINE, fetches only the sender and the subject with PEEK, and stores nothing", async () => {
    const details = await transport.describeCall(
      connection,
      "gmail_archive_messages",
      {
        messageIds: [HEX.b, HEX.a],
      },
    );
    expect(details).toEqual({
      messages: [
        { from: "News <news@example.org>", subject: "Weekly digest" },
        { from: "Ana <ana@example.com>", subject: "Invoice 42" },
      ],
      missing: 0,
    });
    const commands = lines.map(commandOf);
    expect(commands).toContain("EXAMINE");
    expect(commands).not.toContain("SELECT");
    expect(commands).not.toContain("UID STORE");
    expect(commands).not.toContain("CREATE");
    const fetches = lines.filter((line) => commandOf(line) === "UID FETCH");
    expect(fetches).toHaveLength(1);
    expect(fetches[0]).toMatch(/BODY\.PEEK\[HEADER\.FIELDS \(From Subject\)\]/);
    expect(fetches[0]).not.toMatch(/BODY\[/);
    expect(messages[0]?.labels).toEqual(["\\Inbox"]);
    expectOnlyAllowed(lines);
  });
});

describe("the connection the transport asked for", () => {
  test("Gmail's pinned host over implicit TLS, for the reading connection and for the changing one", async () => {
    asked.length = 0;
    await transport.callTool(connection, "gmail_list_labels", {});
    await transport.callTool(connection, "gmail_archive_messages", {
      messageIds: [HEX.a],
    });
    expect(asked).toEqual([
      { kind: "read", host: "imap.gmail.com", port: 993, secure: true },
      { kind: "write", host: "imap.gmail.com", port: 993, secure: true },
    ]);
  });
});

/**
 * Last on purpose: it reads every line every test in this file made the library send, valid calls and
 * hostile ones, and holds the whole of it to one list.
 */
describe("everything this file made the library send", () => {
  test("nothing that deletes, moves, copies, expunges, renames or appends, and no store but the two allowed", () => {
    expect(everyLine.length).toBeGreaterThan(60);
    expectOnlyAllowed(everyLine);
    const commands = new Set(everyLine.map(commandOf));
    for (const forbidden of [
      "STORE",
      "COPY",
      "MOVE",
      "EXPUNGE",
      "APPEND",
      "DELETE",
      "RENAME",
      "UID MOVE",
      "UID EXPUNGE",
      "CLOSE",
    ]) {
      expect(commands.has(forbidden)).toBe(false);
    }
    // And what it did send was every kind of thing it is meant to.
    for (const used of [
      "SELECT",
      "EXAMINE",
      "UID STORE",
      "UID COPY",
      "CREATE",
      "UID SEARCH",
    ]) {
      expect(commands.has(used)).toBe(true);
    }
  });
});
