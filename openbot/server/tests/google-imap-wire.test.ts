import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { TCPSocketListener } from "bun";
import { ImapFlow } from "imapflow";
import {
  createGoogleImapTransport,
  type ImapClientLike,
} from "../src/plugins/google-imap";
import { FakeGmail, tokenFor } from "./support/fake-imap";

/**
 * The real IMAP library, driven by the real transport, against a socket that speaks just enough of
 * Gmail's IMAP to be read from.
 *
 * WHY THIS EXISTS. The transport's safety claims are about what goes over the wire: the mailbox is
 * opened with `EXAMINE`, bodies are fetched with `BODY.PEEK` so nothing is marked read, and no
 * command that changes a mailbox is ever sent. The in-memory fake in `support/fake-imap.ts` shows the
 * transport only ever calls ten methods, but not what imapflow turns each of them into. This file
 * closes that gap: it records every command line the library writes, and asserts on those. It is
 * also the canary for an imapflow upgrade, because it fails if a release starts sending something
 * else for the same calls.
 *
 * The server is a test double on 127.0.0.1 and answers the one message below. Nothing leaves this
 * machine. The factory points the library at it where the real one would name Gmail, after checking
 * that the transport asked for Gmail.
 */

const HEADER_BLOCK = (extra = "") =>
  `From: Ana <ana@example.com>\r\nTo: maya@example.com\r\nSubject: Hi\r\nDate: Thu, 22 Oct 2026 07:10:00 -0700\r\nMessage-ID: <a@example.com>\r\n${extra}\r\n`;

const MSGID = "1111111111111111111";
const THRID = "2222222222222222222";

/** What the one message in the mailbox holds, changed by a test before it asks. */
const mailbox = {
  body: "Hello Maya\r\n",
  /** The part's own headers, which imapflow reads to decode a text part. */
  contentHeaders: "",
  charset: "UTF-8",
  encoding: "7BIT",
};

const lines: string[] = [];
let server: TCPSocketListener<undefined>;

function fetchAnswer(items: string): string {
  const out: string[] = ["UID 1"];
  if (/\bFLAGS\b/.test(items)) out.push("FLAGS ()");
  if (/X-GM-LABELS/.test(items)) out.push('X-GM-LABELS ("\\\\Inbox")');
  if (/INTERNALDATE/.test(items)) {
    out.push('INTERNALDATE "22-Oct-2026 14:10:00 +0000"');
  }
  if (/X-GM-MSGID/.test(items)) out.push(`X-GM-MSGID ${MSGID}`);
  if (/X-GM-THRID/.test(items)) out.push(`X-GM-THRID ${THRID}`);
  if (/BODYSTRUCTURE/.test(items)) {
    out.push(
      `BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "${mailbox.charset}") NIL NIL "${mailbox.encoding}" ${mailbox.body.length} 1 NIL NIL NIL NIL)`,
    );
  }
  if (/RFC822\.SIZE/.test(items))
    out.push(`RFC822.SIZE ${mailbox.body.length}`);
  const fields = /BODY\.PEEK\[HEADER\.FIELDS \(([^)]*)\)\]/.exec(items);
  if (fields) {
    const block = HEADER_BLOCK();
    out.push(
      `BODY[HEADER.FIELDS (${fields[1]})] {${block.length}}\r\n${block}`,
    );
  }
  if (/BODY\.PEEK\[HEADER\]/.test(items)) {
    const block = HEADER_BLOCK(
      `Content-Type: text/plain; charset=${mailbox.charset}\r\nContent-Transfer-Encoding: ${mailbox.encoding}\r\n${mailbox.contentHeaders}`,
    );
    out.push(`BODY[HEADER] {${block.length}}\r\n${block}`);
  }
  if (/BODY\.PEEK\[TEXT\]/.test(items)) {
    out.push(`BODY[TEXT]<0> {${mailbox.body.length}}\r\n${mailbox.body}`);
  }
  return `* 1 FETCH (${out.join(" ")})\r\n`;
}

beforeAll(() => {
  server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.write(
          "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN UIDPLUS X-GM-EXT-1] ready\r\n",
        );
      },
      data(socket, data) {
        for (const raw of Buffer.from(data).toString("utf8").split("\r\n")) {
          if (!raw) continue;
          lines.push(raw);
          const [tag, verb, ...rest] = raw.split(" ");
          const v = (verb ?? "").toUpperCase();
          const tail = rest.join(" ");
          if (v === "CAPABILITY") {
            socket.write(
              `* CAPABILITY IMAP4rev1 AUTH=PLAIN UIDPLUS X-GM-EXT-1\r\n${tag} OK done\r\n`,
            );
          } else if (v === "AUTHENTICATE" || v === "LOGIN") {
            socket.write(
              `${tag} OK [CAPABILITY IMAP4rev1 UIDPLUS X-GM-EXT-1] logged in\r\n`,
            );
          } else if (v === "ID") {
            socket.write(`* ID NIL\r\n${tag} OK done\r\n`);
          } else if (v === "NAMESPACE") {
            socket.write(
              `* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK done\r\n`,
            );
          } else if (v === "LIST") {
            if (/^""\s+""/.test(tail)) {
              socket.write(`* LIST (\\Noselect) "/" ""\r\n${tag} OK done\r\n`);
            } else if (/"INBOX"/.test(tail)) {
              socket.write(
                `* LIST (\\HasNoChildren) "/" "INBOX"\r\n${tag} OK done\r\n`,
              );
            } else {
              socket.write(
                `* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren \\All) "/" "[Gmail]/All Mail"\r\n* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Trash"\r\n${tag} OK done\r\n`,
              );
            }
          } else if (v === "LSUB") {
            socket.write(`${tag} OK done\r\n`);
          } else if (v === "EXAMINE" || v === "SELECT") {
            socket.write(
              `* 1 EXISTS\r\n* OK [UIDVALIDITY 1] ok\r\n* OK [UIDNEXT 2] ok\r\n* FLAGS (\\Seen)\r\n${tag} OK [${v === "EXAMINE" ? "READ-ONLY" : "READ-WRITE"}] done\r\n`,
            );
          } else if (
            v === "UID" &&
            (rest[0] ?? "").toUpperCase() === "SEARCH"
          ) {
            // Category searches are answered with nothing, so a label here is only ever the message's own.
            const category = /category:/.test(tail);
            socket.write(
              `${category ? "* SEARCH" : "* SEARCH 1"}\r\n${tag} OK done\r\n`,
            );
          } else if (v === "UID" && (rest[0] ?? "").toUpperCase() === "FETCH") {
            socket.write(`${fetchAnswer(tail)}${tag} OK done\r\n`);
          } else if (v === "LOGOUT") {
            socket.write(`* BYE\r\n${tag} OK done\r\n`);
            socket.end();
          } else {
            // Anything else is answered, so that a command nobody expected is seen in `lines` and not
            // mistaken for a hang. The assertions below are what refuse it.
            socket.write(`${tag} OK done\r\n`);
          }
        }
      },
    },
  });
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  lines.length = 0;
  mailbox.body = "Hello Maya\r\n";
  mailbox.contentHeaders = "";
  mailbox.charset = "UTF-8";
  mailbox.encoding = "7BIT";
});

const asked: { host: string; port: number; secure: boolean }[] = [];

function transportOverTheRealLibrary() {
  const gmail = new FakeGmail();
  const transport = createGoogleImapTransport({
    imap: (options) => {
      asked.push({
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
    },
    smtp: gmail.smtp,
  });
  return { transport, gmail };
}

const connection = {
  url: "",
  token: tokenFor(),
  actorId: "user_maya",
  botId: "bot_leo",
};
const HEX_ID = BigInt(MSGID).toString(16);
const HEX_THREAD = BigInt(THRID).toString(16);

/** The command a line carries, past its tag: `UID FETCH`, `EXAMINE`, `LOGOUT`. */
const commandOf = (line: string) => {
  const [, verb, next] = line.split(" ");
  return verb?.toUpperCase() === "UID"
    ? `UID ${next?.toUpperCase()}`
    : (verb ?? "").toUpperCase();
};

/** Every command this transport may cause the library to send, and no other. */
const ALLOWED_COMMANDS = new Set([
  "CAPABILITY",
  "AUTHENTICATE",
  "LOGIN",
  "ID",
  "NAMESPACE",
  "LIST",
  "LSUB",
  "EXAMINE",
  "UID SEARCH",
  "UID FETCH",
  "LOGOUT",
]);

describe("what goes over the wire", () => {
  test("a search, a read and the look-up behind a reply send only commands that read, and open the mailbox with EXAMINE", async () => {
    const { transport } = transportOverTheRealLibrary();
    const search = await transport.callTool(
      connection,
      "gmail_search_messages",
      {
        query: "from:ana",
      },
    );
    const read = await transport.callTool(connection, "gmail_read_message", {
      id: HEX_ID,
    });
    const reply = await transport.callTool(connection, "gmail_send_reply", {
      threadId: HEX_THREAD,
      inReplyTo: HEX_ID,
      to: ["ana@example.com"],
      subject: "Hi",
      body: "ok",
    });
    expect(search.isError).toBe(false);
    expect(read.isError).toBe(false);
    expect(reply.isError).toBe(false);

    const commands = lines.map(commandOf);
    for (const command of commands) {
      expect(ALLOWED_COMMANDS.has(command)).toBe(true);
    }
    // Read-only, three times over: one open per call, each an EXAMINE.
    expect(commands.filter((command) => command === "EXAMINE").length).toBe(3);
    expect(commands).not.toContain("SELECT");
    // Not one command that changes a mailbox, whatever its spelling.
    // Read off the command, not the line: a header named `List-Unsubscribe` is a field to fetch.
    for (const line of lines) {
      expect(commandOf(line)).not.toMatch(
        /\b(STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE|CREATE|RENAME|SUBSCRIBE|UNSUBSCRIBE|IDLE|ENABLE)\b/i,
      );
    }
    // And each connection says goodbye.
    expect(commands.filter((command) => command === "LOGOUT").length).toBe(3);
  });

  test("every FETCH asks for a body with PEEK, so nothing is marked read", async () => {
    const { transport } = transportOverTheRealLibrary();
    await transport.callTool(connection, "gmail_search_messages", {});
    await transport.callTool(connection, "gmail_read_message", { id: HEX_ID });
    const fetches = lines.filter((line) => commandOf(line) === "UID FETCH");
    expect(fetches.length).toBeGreaterThanOrEqual(3);
    for (const line of fetches) {
      // Every body section is `BODY.PEEK[...]`: a plain `BODY[...]` or an `RFC822`, `RFC822.TEXT` or
      // `RFC822.HEADER` item would set \Seen on the message. `RFC822.SIZE` only reads a number.
      expect(line).not.toMatch(/BODY\[/);
      expect(line).not.toMatch(/RFC822(?!\.SIZE)/);
      expect(line).not.toMatch(/\bBINARY\[/);
    }
    expect(fetches.some((line) => /BODY\.PEEK\[/.test(line))).toBe(true);
  });

  test("Gmail's own extensions carry the search, the ids and the labels", async () => {
    const { transport } = transportOverTheRealLibrary();
    await transport.callTool(connection, "gmail_search_messages", {
      query: "from:ana",
    });
    await transport.callTool(connection, "gmail_read_message", { id: HEX_ID });
    const joined = lines.join("\n");
    expect(joined).toMatch(/UID SEARCH X-GM-RAW from:ana/);
    expect(joined).toContain(`UID SEARCH X-GM-MSGID ${MSGID}`);
    expect(joined).toMatch(
      /UID FETCH 1 \(UID FLAGS BODYSTRUCTURE INTERNALDATE X-GM-MSGID X-GM-THRID X-GM-LABELS BODY\.PEEK\[HEADER\.FIELDS/,
    );
  });

  test("a query is one string to the server, whatever it contains: quotes and brackets cannot start another command", async () => {
    const { transport } = transportOverTheRealLibrary();
    const hostile = 'from:ana") OR (DELETED';
    await transport.callTool(connection, "gmail_search_messages", {
      query: hostile,
    });
    const search = lines.find((line) => /UID SEARCH X-GM-RAW/.test(line));
    expect(search).toContain('X-GM-RAW "from:ana\\") OR (DELETED"');
    for (const line of lines) {
      expect(ALLOWED_COMMANDS.has(commandOf(line))).toBe(true);
    }
  });

  test("the transport asked for Gmail's pinned host, over implicit TLS, every time", async () => {
    asked.length = 0;
    const { transport } = transportOverTheRealLibrary();
    await transport.callTool(connection, "gmail_search_messages", {});
    await transport.callTool(connection, "gmail_read_message", { id: HEX_ID });
    expect(asked).toEqual([
      { host: "imap.gmail.com", port: 993, secure: true },
      { host: "imap.gmail.com", port: 993, secure: true },
    ]);
  });
});

describe("what comes back through the real library", () => {
  test("a search is the REST adapter's shape, with ids in hex and Gmail's labels in the REST spelling", async () => {
    const { transport } = transportOverTheRealLibrary();
    const result = await transport.callTool(
      connection,
      "gmail_search_messages",
      {},
    );
    expect(JSON.parse(result.text)).toEqual({
      messages: [
        {
          id: HEX_ID,
          threadId: HEX_THREAD,
          from: "Ana <ana@example.com>",
          to: ["maya@example.com"],
          cc: [],
          subject: "Hi",
          date: "2026-10-22T14:10:00.000Z",
          snippet: "Hello Maya",
          labels: ["INBOX", "UNREAD"],
          headers: {},
        },
      ],
      resultSizeEstimate: 1,
    });
  });

  test("a read gives the body of a plain message", async () => {
    const { transport } = transportOverTheRealLibrary();
    const result = await transport.callTool(connection, "gmail_read_message", {
      id: HEX_ID,
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.body).toBe("Hello Maya");
    expect(parsed.messageId).toBe("<a@example.com>");
    expect(parsed.id).toBe(HEX_ID);
  });

  test("a body in quoted-printable and another charset is decoded to what was written", async () => {
    mailbox.charset = "ISO-8859-1";
    mailbox.encoding = "QUOTED-PRINTABLE";
    mailbox.body = "Caf=E9 order for Friday=\r\n, please.\r\n";
    const { transport } = transportOverTheRealLibrary();
    const result = await transport.callTool(connection, "gmail_read_message", {
      id: HEX_ID,
    });
    expect(JSON.parse(result.text).body).toBe("Café order for Friday, please.");
  });
});
