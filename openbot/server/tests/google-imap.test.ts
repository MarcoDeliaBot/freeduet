import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import {
  callTool as restCallTool,
  DEFAULT_QUERY,
} from "../src/plugins/google-workspace-rest";
import {
  FAKE_SECRET,
  FakeGmail,
  hexOf,
  secretsOf,
  textMail,
  tokenFor,
} from "./support/fake-imap";

/**
 * Gmail over IMAP and SMTP, asserted without Gmail.
 *
 * Every client is injected through a factory, so no socket is opened and no module is mocked; the
 * fake behind them (`support/fake-imap.ts`) answers as Gmail's IMAP does and records what it was
 * asked. The groups are named for what each protects:
 *
 *   (c) the hosts are the preset's, whatever a row, a secret or an argument says
 *   (d) nothing secret is written into a result, an error or a log
 *   (e) the mailbox is only ever read
 *   (f) a reply stays in its thread and adds nobody
 *   (g) the same five tools answer in the same shapes as the REST adapter
 *   (h) a new message goes to the addresses it was given and nowhere else
 */

const PERSON = "user_maya";
const connection = (token = tokenFor()) => ({
  // The row's address, which this transport must never dial.
  url: "https://imap.gmail.com/",
  token,
  actorId: PERSON,
  botId: "bot_leo",
});

/** A transport over a fresh fake, with a calendar fetcher that records and answers from `answer`. */
function build(options: { answer?: (url: string) => Response } = {}) {
  const gmail = new FakeGmail();
  const fetched: { url: string; init: RequestInit }[] = [];
  const transport = createGoogleImapTransport({
    imap: gmail.imap,
    smtp: gmail.smtp,
    fetch: async (url, init) => {
      fetched.push({ url, init });
      return (
        options.answer?.(url) ??
        new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")
      );
    },
    now: () => new Date("2026-10-22T20:00:00Z"),
  });
  return { gmail, fetched, transport };
}

const ANA = textMail({
  uid: 10,
  emailId: BigInt("0x18f3a0c2d4e5b601").toString(),
  threadId: BigInt("0x18f3a0c2d4e5b600").toString(),
  headers: {
    From: "Ana Pereira <ana@hearthandco.com>",
    To: '"Okafor, Maya" <maya@example.com>, sam@example.com',
    Cc: "leo@example.com",
    "Reply-To": "orders@hearthandco.com",
    Subject: "Friday ship date for the 120 mugs?",
    Date: "Thu, 22 Oct 2026 07:10:00 -0700",
    "Message-ID": "<n01@hearthandco.com>",
    References: "<earlier@hearthandco.com>",
  },
  body: "Hi Maya, can you confirm it's Friday & not later?",
});
const ANA_THREAD = hexOf(ANA.threadId);
const ANA_ID = hexOf(ANA.emailId);

/** Console output for the length of a test, so "never logged" is something observed. */
const logged: string[] = [];
const realConsole = { ...console };
beforeEach(() => {
  logged.length = 0;
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    console[level] = (...parts: unknown[]) => {
      logged.push(parts.map(String).join(" "));
    };
  }
});
afterEach(() => {
  Object.assign(console, realConsole);
});

describe("(c) the hosts are the preset's", () => {
  test("a search, a read and a reply dial Gmail's IMAP and SMTP over implicit TLS, and nothing else", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    gmail.searches.set(DEFAULT_QUERY, [10]);

    await transport.callTool(connection(), "gmail_search_messages", {});
    await transport.callTool(connection(), "gmail_read_message", {
      id: ANA_ID,
    });
    await transport.callTool(connection(), "gmail_send_reply", {
      threadId: ANA_THREAD,
      inReplyTo: ANA_ID,
      to: ["ana@hearthandco.com"],
      subject: "Friday",
      body: "Yes.",
    });

    // One IMAP connection per call: the search, the read, and the look-up of the message answered.
    expect(gmail.clients.length).toBe(3);
    for (const client of gmail.clients) {
      expect({
        host: client.host,
        port: client.port,
        secure: client.secure,
      }).toEqual({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
      });
      expect(client.user).toBe(FAKE_SECRET.address);
    }
    expect(gmail.smtpClients.length).toBe(1);
    expect({
      host: gmail.smtpClients[0]?.host,
      port: gmail.smtpClients[0]?.port,
      secure: gmail.smtpClients[0]?.secure,
    }).toEqual({ host: "smtp.gmail.com", port: 465, secure: true });
  });

  test("the row's address is never dialled: a row edited to name another host reaches nowhere else", async () => {
    const { gmail, fetched, transport } = build();
    gmail.messages = [ANA];
    await transport.callTool(
      { ...connection(), url: "https://evil.example/imap" },
      "gmail_search_messages",
      {},
    );
    await transport.callTool(
      { ...connection(), url: "http://127.0.0.1:9999" },
      "calendar_list_events",
      {},
    );
    expect(gmail.clients.map((client) => client.host)).toEqual([
      "imap.gmail.com",
    ]);
    expect(fetched.map((call) => new URL(call.url).host)).toEqual([
      "calendar.google.com",
    ]);
  });

  test("a stored value that carries a host, a port or a server of its own is read as if it did not", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    const hostile = JSON.stringify({
      v: 1,
      address: FAKE_SECRET.address,
      password: FAKE_SECRET.password,
      host: "evil.example",
      port: 25,
      imap: { host: "evil.example", port: 143, secure: false },
      smtp: { host: "evil.example", port: 25 },
      secure: false,
    });
    await transport.callTool(connection(hostile), "gmail_search_messages", {});
    await transport.callTool(connection(hostile), "gmail_send_reply", {
      threadId: ANA_THREAD,
      inReplyTo: ANA_ID,
      to: ["ana@hearthandco.com"],
      subject: "Friday",
      body: "Yes.",
    });
    for (const client of [...gmail.clients, ...gmail.smtpClients]) {
      expect(client.host.endsWith(".gmail.com")).toBe(true);
      expect(client.secure).toBe(true);
      expect([993, 465]).toContain(client.port);
    }
  });

  test("an argument cannot name a host, a port, a folder or a server", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    await transport.callTool(connection(), "gmail_search_messages", {
      host: "evil.example",
      imapHost: "evil.example",
      port: 143,
      server: "evil.example",
      url: "https://evil.example/",
      mailbox: "INBOX",
      folder: "[Gmail]/Trash",
    });
    expect(gmail.clients.map((client) => client.host)).toEqual([
      "imap.gmail.com",
    ]);
    expect(gmail.opened).toEqual([
      { path: "[Gmail]/All Mail", options: { readOnly: true } },
    ]);
  });

  test("the calendar is fetched only from Google's own address, and a link that is not is refused before any request", async () => {
    const { fetched, transport } = build();
    for (const link of [
      "http://calendar.google.com/calendar/ical/maya%40example.com/private-x/basic.ics",
      "https://evil.example/calendar/ical/maya%40example.com/private-x/basic.ics",
      "https://calendar.google.com.evil.example/calendar/ical/x/basic.ics",
      "https://calendar.google.com@evil.example/calendar/ical/x/basic.ics",
      "https://calendar.google.com:8443/calendar/ical/x/basic.ics",
      "https://calendar.google.com./calendar/ical/x/basic.ics",
      "https://calendar.google.com/other/path/basic.ics",
      "https://calendar.google.com/calendar/ical/../../evil",
      "https://calendar.google.com/calendar/ical/%2e%2e/%2e%2e/evil",
      "file:///etc/passwd",
      "ftp://calendar.google.com/calendar/ical/x/basic.ics",
    ]) {
      const result = await transport.callTool(
        connection(tokenFor({ ...FAKE_SECRET, calendarUrl: link })),
        "calendar_list_events",
        {},
      );
      expect(result.isError).toBe(true);
    }
    expect(fetched).toEqual([]);
  });
});

describe("(d) nothing secret is written into anything", () => {
  /** What a library's error says when it quotes what it was given, which is the thing to not carry. */
  const quoting = (extra: Record<string, unknown> = {}) =>
    Object.assign(
      new Error(
        `Command failed: LOGIN ${FAKE_SECRET.address} ${FAKE_SECRET.password} ${FAKE_SECRET.calendarUrl}`,
      ),
      {
        response: `a1 NO [AUTHENTICATIONFAILED] ${FAKE_SECRET.password}`,
        responseText: FAKE_SECRET.password,
        stack: `Error: ${FAKE_SECRET.password}\n    at ${FAKE_SECRET.calendarUrl}`,
      },
      extra,
    );

  const ARGS: Record<string, Record<string, unknown>> = {
    gmail_search_messages: {},
    gmail_read_message: { id: ANA_ID },
    gmail_send_reply: {
      threadId: ANA_THREAD,
      inReplyTo: ANA_ID,
      to: ["ana@hearthandco.com"],
      subject: "Friday",
      body: "Yes.",
    },
    gmail_send_message: {
      to: ["ana@example.com"],
      subject: "Good morning",
      body: "Good morning, Ana.",
    },
    calendar_list_events: {},
  };

  const FAILURES: [string, (gmail: FakeGmail) => void][] = [
    [
      "a refused login",
      (gmail) => {
        gmail.connectError = quoting({
          authenticationFailed: true,
          serverResponseCode: "AUTHENTICATIONFAILED",
        });
      },
    ],
    [
      "an unreachable host",
      (gmail) => {
        gmail.connectError = quoting({ code: "ECONNREFUSED" });
      },
    ],
    [
      "an error nobody classified",
      (gmail) => {
        gmail.connectError = quoting();
      },
    ],
    [
      "a failing search",
      (gmail) => {
        gmail.searchError = quoting({ code: "ETIMEOUT" });
      },
    ],
    [
      "a failing logout",
      (gmail) => {
        gmail.logoutError = quoting();
        gmail.connectError = quoting();
      },
    ],
  ];

  test("no failure of any tool carries the password, the calendar link or any part of it, or the address", async () => {
    for (const [, arrange] of FAILURES) {
      for (const [tool, args] of Object.entries(ARGS)) {
        const { gmail, fetched, transport } = build({
          answer: () => {
            throw quoting({ code: "ECONNREFUSED" });
          },
        });
        gmail.messages = [ANA];
        arrange(gmail);
        // The calendar's own failure is the fetcher throwing a message that quotes the address.
        const result = await transport.callTool(connection(), tool, args);
        const everything = `${result.text}\n${logged.join("\n")}`;
        for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
          expect(everything).not.toContain(secret);
        }
        void fetched;
      }
    }
  });

  test("a calendar that cannot be fetched says so without the address it was fetched from", async () => {
    for (const answer of [
      () => {
        throw Object.assign(
          new Error(`connect ECONNREFUSED ${FAKE_SECRET.calendarUrl}`),
          { code: "ECONNREFUSED" },
        );
      },
      () => new Response("", { status: 404 }),
      () => new Response("", { status: 500 }),
      () => new Response("<html>not a calendar</html>"),
      () =>
        new Response(null, {
          status: 302,
          headers: {
            location: `https://evil.example/?u=${FAKE_SECRET.calendarUrl}`,
          },
        }),
    ]) {
      const { transport } = build({ answer });
      const result = await transport.callTool(
        connection(),
        "calendar_list_events",
        {},
      );
      expect(result.isError).toBe(true);
      for (const secret of [
        ...secretsOf(),
        FAKE_SECRET.address,
        "evil.example",
      ]) {
        expect(result.text).not.toContain(secret);
      }
    }
  });

  test("a login Gmail refused is a fixed sentence that tells the person what to do", async () => {
    const { gmail, transport } = build();
    gmail.connectError = quoting({
      authenticationFailed: true,
      serverResponseCode: "AUTHENTICATIONFAILED",
    });
    const result = await transport.callTool(
      connection(),
      "gmail_search_messages",
      {},
    );
    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "Gmail did not accept this address and app password. The app password may have been revoked: make a new one and connect again on the Connections page.",
    );
  });

  test("an SMTP failure is a fixed sentence, says the reply was not sent, and quotes nothing", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    gmail.smtpError = quoting({ code: "EAUTH" });
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      ARGS.gmail_send_reply ?? {},
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("The reply was not sent.");
    for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
      expect(result.text).not.toContain(secret);
    }
    expect(gmail.smtpClosed).toBe(1);
  });

  test("an SMTP failure of a new message is a fixed sentence, says it was not sent, and quotes nothing", async () => {
    const { gmail, transport } = build();
    gmail.smtpError = quoting({ code: "EAUTH" });
    const result = await transport.callTool(
      connection(),
      "gmail_send_message",
      ARGS.gmail_send_message ?? {},
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("The email was not sent.");
    for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
      expect(result.text).not.toContain(secret);
      expect(logged.join("\n")).not.toContain(secret);
    }
    expect(gmail.smtpClosed).toBe(1);
    expect(gmail.sent).toEqual([]);
  });

  test("a stored value that cannot be read is refused without being repeated", async () => {
    const { gmail, transport } = build();
    for (const token of [
      `{"v":1,"address":"${FAKE_SECRET.address}","password":"${FAKE_SECRET.password}"`,
      JSON.stringify({
        v: 2,
        address: "a@example.com",
        password: "hunter2hunter2",
      }),
      "hunter2hunter2",
      "",
    ]) {
      const result = await transport.callTool(
        connection(token),
        "gmail_search_messages",
        {},
      );
      expect(result.isError).toBe(true);
      expect(result.text).not.toContain("hunter2hunter2");
      expect(result.text).not.toContain(FAKE_SECRET.password);
    }
    expect(gmail.clients).toEqual([]);
  });

  test("a call with nobody attributed is refused before anything is opened", async () => {
    const { gmail, fetched, transport } = build();
    const result = await transport.callTool(
      { url: "", token: tokenFor() },
      "gmail_search_messages",
      {},
    );
    expect(result.isError).toBe(true);
    expect(gmail.clients).toEqual([]);
    expect(fetched).toEqual([]);
  });

  test("successful answers do not hold the password or the calendar link, and the tools log nothing", async () => {
    const { gmail, transport } = build({
      answer: () =>
        new Response(
          [
            "BEGIN:VCALENDAR",
            "X-WR-TIMEZONE:Europe/Rome",
            "BEGIN:VEVENT",
            "UID:one@example.com",
            "DTSTART:20261022T210000Z",
            "DTEND:20261022T213000Z",
            "SUMMARY:Glaze review",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
          ].join("\r\n"),
        ),
    });
    gmail.messages = [ANA];
    gmail.searches.set(DEFAULT_QUERY, [10]);
    for (const [tool, args] of Object.entries(ARGS)) {
      const result = await transport.callTool(connection(), tool, args);
      expect(result.isError).toBe(false);
      for (const secret of secretsOf()) {
        expect(result.text).not.toContain(secret);
      }
    }
    expect(logged).toEqual([]);
  });
});

describe("(e) the mailbox is only ever read", () => {
  test("every mailbox is opened read-only, and every call is one of the ten the client type names", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    gmail.searches.set(DEFAULT_QUERY, [10]);

    await transport.callTool(connection(), "gmail_search_messages", {});
    await transport.callTool(connection(), "gmail_read_message", {
      id: ANA_ID,
    });
    await transport.callTool(connection(), "gmail_send_reply", {
      threadId: ANA_THREAD,
      inReplyTo: ANA_ID,
      to: ["ana@hearthandco.com"],
      subject: "Friday",
      body: "Yes.",
    });

    expect(gmail.opened.length).toBeGreaterThan(0);
    for (const opened of gmail.opened) {
      // EXAMINE, not SELECT: the server itself refuses a change to a mailbox opened this way.
      expect(opened.options).toEqual({ readOnly: true });
      expect(opened.path).toBe("[Gmail]/All Mail");
    }
    expect(gmail.violations).toEqual([]);
    for (const method of gmail.methodsCalled()) {
      expect([
        "connect",
        "logout",
        "close",
        "on",
        "list",
        "mailboxOpen",
        "search",
        "fetch",
        "fetchOne",
        "download",
      ]).toContain(method);
    }
  });

  test("a message is asked for by its fields, never as a whole, so nothing marks it read", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    gmail.searches.set(DEFAULT_QUERY, [10]);
    await transport.callTool(connection(), "gmail_search_messages", {});
    await transport.callTool(connection(), "gmail_read_message", {
      id: ANA_ID,
    });
    const allowed = new Set([
      "uid",
      "flags",
      "labels",
      "internalDate",
      "emailId",
      "threadId",
      "bodyStructure",
      "headers",
    ]);
    expect(gmail.fetched.length).toBeGreaterThan(0);
    for (const fetched of gmail.fetched) {
      for (const key of Object.keys(fetched.query)) {
        expect(allowed.has(key)).toBe(true);
      }
      // `source` and `bodyParts` are the options that fetch a whole message or a part by name.
      expect("source" in fetched.query).toBe(false);
      expect("bodyParts" in fetched.query).toBe(false);
    }
  });

  test("the fake's own guard works: reaching for a method the type does not name is caught", () => {
    const { gmail } = build();
    const client = gmail.imap({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      user: "a@example.com",
      pass: "x",
    }) as unknown as Record<string, unknown>;
    expect(() => client.messageDelete).toThrow();
    expect(() => client.messageFlagsAdd).toThrow();
    expect(() => client.messageMove).toThrow();
    expect(gmail.violations).toEqual([
      "messageDelete",
      "messageFlagsAdd",
      "messageMove",
    ]);
  });

  test("a tool that would change a mailbox is refused before a connection is made", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    for (const name of [
      "gmail_delete_message",
      "gmail_trash_message",
      "gmail_move_message",
      "gmail_mark_read",
      "gmail_add_label",
      "gmail_send_message",
      "gmail_create_draft",
      "calendar_create_event",
      "calendar_delete_event",
    ]) {
      const result = await transport.callTool(connection(), name, {
        id: ANA_ID,
      });
      expect(result.isError).toBe(true);
    }
    expect(gmail.clients).toEqual([]);
    expect(gmail.smtpClients).toEqual([]);
  });

  test("arguments that ask for a write change nothing: the mailbox is still opened read-only and the state is untouched", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    gmail.searches.set(DEFAULT_QUERY, [10]);
    const before = JSON.stringify(gmail.messages);
    for (const tool of ["gmail_search_messages", "gmail_read_message"]) {
      await transport.callTool(connection(), tool, {
        id: ANA_ID,
        readOnly: false,
        markRead: true,
        flags: ["\\Seen", "\\Deleted"],
        addLabels: ["Trash"],
        moveTo: "[Gmail]/Trash",
        delete: true,
      });
    }
    expect(
      gmail.opened.every(
        (opened) => JSON.stringify(opened.options) === '{"readOnly":true}',
      ),
    ).toBe(true);
    expect(gmail.violations).toEqual([]);
    expect(JSON.stringify(gmail.messages)).toBe(before);
  });

  test("every connection is closed when its call is done, however it ended", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    await transport.callTool(connection(), "gmail_search_messages", {});
    gmail.searchError = new Error("boom");
    await transport.callTool(connection(), "gmail_search_messages", {});
    gmail.connectError = Object.assign(new Error("no"), {
      code: "ECONNREFUSED",
    });
    await transport.callTool(connection(), "gmail_read_message", {
      id: ANA_ID,
    });
    expect(gmail.logouts).toBe(gmail.clients.length);
  });

  test("a logout that throws falls back to closing the socket", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    gmail.logoutError = new Error("already gone");
    await transport.callTool(connection(), "gmail_search_messages", {});
    expect(gmail.closes).toBe(1);
  });

  test("the module's own source holds no call that changes a mailbox", () => {
    const source = readFileSync(
      new URL("../src/plugins/google-imap.ts", import.meta.url),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
    for (const forbidden of [
      /messageDelete/,
      /messageMove/,
      /messageCopy/,
      /messageFlags(Add|Remove|Set)/,
      /setFlagColor/,
      /mailbox(Create|Delete|Rename|Subscribe|Unsubscribe)/,
      /getMailboxLock/,
      /\.append\(/,
      /\.expunge\(/,
      /\.store\(/,
      /\.idle\(/,
      /readOnly:\s*false/,
      /\bSTORE\b/,
      /\bEXPUNGE\b/,
      /\bAPPEND\b/,
      /\\Deleted/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
    // The one open there is passes the literal.
    expect(source).toMatch(/mailboxOpen\(all, \{ readOnly: true \}\)/);
    expect(source.match(/mailboxOpen\(/g)?.length).toBe(2);
  });
});

describe("(f) a reply stays in its thread and adds nobody", () => {
  const reply = (overrides: Record<string, unknown> = {}) => ({
    threadId: ANA_THREAD,
    inReplyTo: ANA_ID,
    to: ["Ana Pereira <ana@hearthandco.com>"],
    cc: ["sam@example.com"],
    subject: "Friday ship date for the 120 mugs?",
    body: "Hi Ana,\nYes, Friday.\nMaya",
    ...overrides,
  });

  function withParent() {
    const built = build();
    built.gmail.messages = [ANA];
    return built;
  }

  test("sends one message inside the thread, from the parent's own headers", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply(),
    );
    expect(JSON.parse(result.text)).toEqual({
      sent: true,
      id: "",
      threadId: ANA_THREAD,
    });
    expect(gmail.sent).toEqual([
      {
        from: "maya@example.com",
        to: ["Ana Pereira <ana@hearthandco.com>"],
        cc: ["sam@example.com"],
        subject: "Re: Friday ship date for the 120 mugs?",
        text: "Hi Ana,\nYes, Friday.\nMaya",
        inReplyTo: "<n01@hearthandco.com>",
        references: ["<earlier@hearthandco.com>", "<n01@hearthandco.com>"],
        envelope: {
          from: "maya@example.com",
          to: ["ana@hearthandco.com", "sam@example.com"],
        },
      },
    ]);
    // Only the fields of the message being answered that thread a reply were asked for.
    const parentFetch = gmail.fetched.find((entry) => entry.range === "10");
    expect(parentFetch?.query.headers).toEqual([
      "Message-ID",
      "References",
      "In-Reply-To",
      "From",
      "Reply-To",
      "To",
      "Cc",
    ]);
  });

  test("the threading headers come from the mailbox and not from the model: an In-Reply-To in the arguments is only an id to look up", async () => {
    const { gmail, transport } = withParent();
    await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({
        inReplyTo: ANA_ID,
        references: ["<forged@evil.example>"],
        messageId: "<forged@evil.example>",
      }),
    );
    expect(gmail.sent[0]?.inReplyTo).toBe("<n01@hearthandco.com>");
    expect(gmail.sent[0]?.references).toEqual([
      "<earlier@hearthandco.com>",
      "<n01@hearthandco.com>",
    ]);
  });

  test("a recipient that is not on the message is refused, and no SMTP connection is made", async () => {
    for (const stranger of [
      "stranger@evil.example",
      "Ana Pereira <ana@hearthandco.com.evil.example>",
      "ana@hearthandco.co",
      "attacker+ana@hearthandco.com",
    ]) {
      const { gmail, transport } = withParent();
      const result = await transport.callTool(
        connection(),
        "gmail_send_reply",
        reply({ to: ["ana@hearthandco.com", stranger] }),
      );
      expect(result.isError).toBe(true);
      expect(result.text).toContain("not on the message being answered");
      expect(gmail.smtpClients).toEqual([]);
      expect(gmail.sent).toEqual([]);
    }
  });

  test("a stranger in Cc is refused just the same", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({ cc: ["stranger@evil.example"] }),
    );
    expect(result.isError).toBe(true);
    expect(gmail.sent).toEqual([]);
  });

  test("everybody on the message may be answered, whatever case or form they are written in, and the envelope holds exactly them", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({
        to: [
          "ANA@HearthAndCo.com",
          "orders@hearthandco.com",
          '"Okafor, Maya" <Maya@Example.com>',
        ],
        cc: ["Sam@example.com", "LEO@example.com", "sam@example.com"],
      }),
    );
    expect(result.isError).toBe(false);
    expect(gmail.sent[0]?.envelope.to).toEqual([
      "ana@hearthandco.com",
      "orders@hearthandco.com",
      "maya@example.com",
      "sam@example.com",
      "leo@example.com",
    ]);
  });

  test("nothing is added: no Bcc, no other sender, no other header, whatever the arguments say", async () => {
    const { gmail, transport } = withParent();
    await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({
        bcc: ["boss@evil.example"],
        from: "ceo@example.com",
        replyTo: "me@evil.example",
        headers: { "X-Evil": "1" },
        attachments: [{ path: "/etc/passwd" }],
        envelope: { to: ["boss@evil.example"] },
      }),
    );
    const message = gmail.sent[0] as unknown as Record<string, unknown>;
    expect(Object.keys(message).sort()).toEqual([
      "cc",
      "envelope",
      "from",
      "inReplyTo",
      "references",
      "subject",
      "text",
      "to",
    ]);
    expect(message.from).toBe("maya@example.com");
    expect(gmail.sent[0]?.envelope.from).toBe("maya@example.com");
    expect(JSON.stringify(message)).not.toContain("evil");
  });

  test("the person's own address is allowed: answering everybody on a message includes yourself", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({ to: ["ana@hearthandco.com", "maya@example.com"], cc: [] }),
    );
    expect(result.isError).toBe(false);
    expect(gmail.sent[0]?.envelope.to).toEqual([
      "ana@hearthandco.com",
      "maya@example.com",
    ]);
  });

  test("a subject that already says Re: is not prefixed again", async () => {
    const { gmail, transport } = withParent();
    await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({ subject: "RE: Friday" }),
    );
    expect(gmail.sent[0]?.subject).toBe("RE: Friday");
  });

  test("a message in another thread than the one named is refused, and nothing is sent", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({ threadId: "ffff" }),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("The reply was not sent.");
    expect(gmail.smtpClients).toEqual([]);
  });

  test("a message that is not in the mailbox is refused, and nothing is sent", async () => {
    const { gmail, transport } = withParent();
    gmail.messages = [];
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply(),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("The reply was not sent.");
    expect(gmail.smtpClients).toEqual([]);
  });

  test("an id that is not a Gmail id looks nothing up and sends nothing", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({ inReplyTo: "not an id; DELETE" }),
    );
    expect(result.isError).toBe(true);
    expect(
      gmail.searched.filter((entry) => "emailId" in (entry.query as object)),
    ).toEqual([]);
    expect(gmail.smtpClients).toEqual([]);
  });

  test("the parent may be named by its Message-ID, which is searched for as one", async () => {
    const { gmail, transport } = withParent();
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply({ inReplyTo: "<n01@hearthandco.com>" }),
    );
    expect(result.isError).toBe(false);
    expect(gmail.searched).toContainEqual({
      query: { gmailraw: "rfc822msgid:n01@hearthandco.com" },
      options: { uid: true },
    });
  });

  test("a parent with no usable Message-ID cannot be threaded under, and nothing is sent", async () => {
    const { gmail, transport } = withParent();
    gmail.messages = [
      {
        ...ANA,
        headers: ANA.headers.filter(([name]) => name !== "Message-ID"),
      },
    ];
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply(),
    );
    expect(result.isError).toBe(true);
    expect(gmail.smtpClients).toEqual([]);
  });

  test("a line break in a recipient or the subject is refused before any connection is made", async () => {
    for (const bad of [
      { to: ["ana@hearthandco.com\r\nBcc: boss@evil.example"] },
      { cc: ["sam@example.com\nBcc: boss@evil.example"] },
      { subject: "Friday\r\nBcc: boss@evil.example" },
    ]) {
      const { gmail, transport } = withParent();
      const result = await transport.callTool(
        connection(),
        "gmail_send_reply",
        reply(bad),
      );
      expect(result.isError).toBe(true);
      expect(gmail.clients).toEqual([]);
      expect(gmail.smtpClients).toEqual([]);
    }
  });

  test("a reply missing a part it needs is refused before any connection is made", async () => {
    for (const bad of [
      { threadId: "" },
      { inReplyTo: "" },
      { to: [] },
      { to: [42] },
      { subject: "" },
      { body: "   " },
      { to: ["not an address"] },
    ]) {
      const { gmail, transport } = withParent();
      const result = await transport.callTool(
        connection(),
        "gmail_send_reply",
        reply(bad),
      );
      expect(result.isError).toBe(true);
      expect(gmail.clients).toEqual([]);
      expect(gmail.smtpClients).toEqual([]);
    }
  });

  test("a recipient Gmail refuses is reported, not hidden", async () => {
    const { gmail, transport } = withParent();
    gmail.smtpRejected = ["sam@example.com"];
    const result = await transport.callTool(
      connection(),
      "gmail_send_reply",
      reply(),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("refused at least one recipient");
  });

  test("the SMTP connection is closed whether the send worked or not", async () => {
    const { gmail, transport } = withParent();
    await transport.callTool(connection(), "gmail_send_reply", reply());
    gmail.smtpError = Object.assign(new Error("no"), { code: "ECONNECTION" });
    await transport.callTool(connection(), "gmail_send_reply", reply());
    expect(gmail.smtpClosed).toBe(2);
  });
});

describe("what a search and a read do", () => {
  test("with no arguments a search asks for the last day of the inbox, as the REST adapter does", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    await transport.callTool(connection(), "gmail_search_messages", {});
    expect(gmail.searched[0]).toEqual({
      query: { gmailraw: "in:inbox newer_than:1d" },
      options: { uid: true },
    });
    expect(DEFAULT_QUERY).toBe("in:inbox newer_than:1d");
  });

  test("a query is passed through as Gmail's own search, and the count is held to fifty", async () => {
    const { gmail, transport } = build();
    gmail.messages = Array.from({ length: 80 }, (_, index) =>
      textMail({
        uid: index + 1,
        emailId: String(1000 + index),
        threadId: String(2000 + index),
        headers: { Subject: `s${index}`, From: "a@example.com" },
        body: "x",
      }),
    );
    const result = await transport.callTool(
      connection(),
      "gmail_search_messages",
      { query: "from:ana@hearthandco.com is:unread", maxResults: 500 },
    );
    expect(gmail.searched[0]?.query).toEqual({
      gmailraw: "from:ana@hearthandco.com is:unread",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.messages.length).toBe(50);
    expect(parsed.resultSizeEstimate).toBe(80);
    // Newest first, which in All Mail is the highest uid.
    expect(gmail.fetched[0]?.range.split(",")[0]).toBe("80");
  });

  test("the default is twenty-five", async () => {
    const { gmail, transport } = build();
    gmail.messages = Array.from({ length: 40 }, (_, index) =>
      textMail({
        uid: index + 1,
        emailId: String(1000 + index),
        threadId: String(2000 + index),
        headers: { Subject: `s${index}`, From: "a@example.com" },
        body: "x",
      }),
    );
    const result = await transport.callTool(
      connection(),
      "gmail_search_messages",
      {},
    );
    expect(JSON.parse(result.text).messages.length).toBe(25);
  });

  test("a count that is not a number, and a query with a control character, are refused before any connection", async () => {
    const { gmail, transport } = build();
    for (const args of [
      { maxResults: "many" },
      { maxResults: 0 },
      { maxResults: -3 },
      { query: "from:a\r\nA2 DELETE" },
      { query: "x\u0000y" },
    ]) {
      const result = await transport.callTool(
        connection(),
        "gmail_search_messages",
        args,
      );
      expect(result.isError).toBe(true);
    }
    expect(gmail.clients).toEqual([]);
  });

  test("a read needs an id, and an id that is not hex never reaches a search", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    for (const id of ["", "  ", "zz", "1; DELETE", `${ANA_ID}0000000000`]) {
      const result = await transport.callTool(
        connection(),
        "gmail_read_message",
        { id },
      );
      expect(result.isError).toBe(true);
    }
    expect(
      gmail.searched.filter((entry) => "emailId" in (entry.query as object)),
    ).toEqual([]);
  });

  test("a message that is not there is a sentence, not a crash", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    const result = await transport.callTool(
      connection(),
      "gmail_read_message",
      {
        id: "abcdef",
      },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No message with that id");
  });

  test("a long body is cut at twenty thousand characters, says so, and stays valid JSON", async () => {
    const { gmail, transport } = build();
    gmail.messages = [
      textMail({
        uid: 11,
        emailId: ANA.emailId,
        threadId: ANA.threadId,
        headers: { From: "a@example.com", Subject: "long" },
        body: "word ".repeat(30_000),
      }),
    ];
    const result = await transport.callTool(
      connection(),
      "gmail_read_message",
      {
        id: ANA_ID,
      },
    );
    const parsed = JSON.parse(result.text);
    expect(result.truncated).toBe(true);
    expect(parsed.body.length).toBeLessThanOrEqual(20_100);
    expect((parsed.body as string).includes("[truncated")).toBe(true);
    // The download itself is capped, so a huge message is never pulled whole.
    expect(
      gmail.downloads.every((download) => download.maxBytes <= 90_000),
    ).toBe(true);
  });

  test("the plain part is the body, an attached text file is not, and an HTML-only message is read as its text", async () => {
    const { gmail, transport } = build();
    gmail.messages = [
      {
        ...textMail({
          uid: 12,
          emailId: ANA.emailId,
          threadId: ANA.threadId,
          headers: { From: "a@example.com", Subject: "mixed" },
          body: "",
        }),
        structure: {
          type: "multipart/mixed",
          childNodes: [
            {
              part: "1",
              type: "text/plain",
              disposition: "attachment",
              dispositionParameters: { filename: "notes.txt" },
              size: 10,
            },
            { part: "2", type: "text/plain", size: 12 },
          ],
        },
        parts: { "1": "ATTACHED", "2": "the real body" },
      },
    ];
    const first = await transport.callTool(connection(), "gmail_read_message", {
      id: ANA_ID,
    });
    expect(JSON.parse(first.text).body).toBe("the real body");

    gmail.messages = [
      {
        ...textMail({
          uid: 13,
          emailId: ANA.emailId,
          threadId: ANA.threadId,
          headers: { From: "a@example.com", Subject: "html" },
          body: "",
        }),
        structure: { part: "1", type: "text/html", size: 40 },
        parts: { "1": "<p>Hello <b>Maya</b></p><p>Friday?</p>" },
      },
    ];
    const second = await transport.callTool(
      connection(),
      "gmail_read_message",
      {
        id: ANA_ID,
      },
    );
    expect(JSON.parse(second.text).body).toContain("Hello Maya");
    expect(JSON.parse(second.text).body).not.toContain("<p>");
  });

  test("a tool the transport does not implement is refused without a connection", async () => {
    const { gmail, transport } = build();
    const result = await transport.callTool(connection(), "gmail_forward", {});
    expect(result.isError).toBe(true);
    expect(gmail.clients).toEqual([]);
  });
});

describe("(g) the same answers as the REST adapter", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  type Seen = { method: string; url: URL; body: unknown };
  function stubRest(answer: (call: Seen) => unknown): Seen[] {
    const calls: Seen[] = [];
    globalThis.fetch = (async (input: string | URL, options?: RequestInit) => {
      const call: Seen = {
        method: options?.method ?? "GET",
        url: new URL(String(input)),
        body:
          typeof options?.body === "string" ? JSON.parse(options.body) : null,
      };
      calls.push(call);
      return Response.json(answer(call));
    }) as typeof fetch;
    return calls;
  }

  const rest = { url: "https://www.googleapis.com", token: "test-token" };

  /** The same two messages as the REST adapter's own tests use, with ids in hex as Gmail spells them. */
  const M1 = {
    uid: 1,
    emailId: BigInt("0x18f3a0c2d4e5b601").toString(),
    threadId: BigInt("0x18f3a0c2d4e5b600").toString(),
  };
  const M2 = {
    uid: 2,
    emailId: BigInt("0x18f3a0c2d4e5b6ff").toString(),
    threadId: BigInt("0x18f3a0c2d4e5b6fe").toString(),
  };
  const M1_HEADERS = {
    From: "Ana Pereira <ana@hearthandco.com>",
    To: '"Okafor, Maya" <maya@example.com>, sam@example.com',
    Cc: "leo@example.com",
    Subject: "Friday ship date for the 120 mugs?",
    Date: "Thu, 22 Oct 2026 07:10:00 -0700",
    "Message-ID": "<n01@hearthandco.com>",
  };
  const M2_HEADERS = {
    From: "KilnMart <deals@kilnmart.example>",
    To: "maya@example.com",
    Subject: "48 hours only",
    Date: "Thu, 22 Oct 2026 06:00:00 -0700",
    "list-unsubscribe": "<https://kilnmart.example/u>",
    Precedence: "bulk",
  };
  const T1 = Date.parse("2026-10-22T14:30:00Z");
  const T2 = Date.parse("2026-10-22T13:30:00Z");

  function restMetadata(
    id: string,
    threadId: string,
    headers: Record<string, string>,
    extra: Record<string, unknown>,
  ) {
    return {
      id,
      threadId,
      internalDate: "",
      snippet: "",
      payload: {
        headers: Object.entries(headers).map(([name, value]) => ({
          name,
          value,
        })),
      },
      ...extra,
    };
  }

  test("a search answers with the same keys, values and order", async () => {
    const calls = stubRest((call) =>
      call.url.pathname.endsWith("/messages")
        ? {
            messages: [
              { id: hexOf(M1.emailId), threadId: hexOf(M1.threadId) },
              { id: hexOf(M2.emailId), threadId: hexOf(M2.threadId) },
            ],
            resultSizeEstimate: 2,
          }
        : call.url.pathname.endsWith(hexOf(M1.emailId))
          ? restMetadata(hexOf(M1.emailId), hexOf(M1.threadId), M1_HEADERS, {
              labelIds: ["INBOX", "UNREAD"],
              internalDate: String(T1),
              snippet:
                "Hi Maya, can you confirm it&#39;s Friday &amp; not later?",
            })
          : restMetadata(hexOf(M2.emailId), hexOf(M2.threadId), M2_HEADERS, {
              labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
              internalDate: String(T2),
            }),
    );
    const fromRest = await restCallTool(rest, "gmail_search_messages", {});
    expect(calls.length).toBeGreaterThan(0);

    const { gmail, transport } = build();
    gmail.messages = [
      textMail({
        ...M1,
        headers: M1_HEADERS,
        body: "Hi Maya, can you confirm it's Friday & not later?",
        date: new Date(T1).toISOString(),
      }),
      textMail({
        ...M2,
        headers: M2_HEADERS,
        body: "",
        flags: ["\\Seen"],
        date: new Date(T2).toISOString(),
      }),
    ];
    gmail.searches.set(DEFAULT_QUERY, [1, 2]);
    gmail.searches.set(`(${DEFAULT_QUERY}) category:promotions`, [2]);
    const fromImap = await transport.callTool(
      connection(),
      "gmail_search_messages",
      {},
    );

    expect(fromImap.isError).toBe(false);
    expect(JSON.parse(fromImap.text)).toEqual(JSON.parse(fromRest.text));
    expect(fromImap.truncated).toBe(fromRest.truncated);
  });

  test("a read answers with the same keys, values and flag for a cut", async () => {
    stubRest(() => ({
      id: hexOf(M1.emailId),
      threadId: hexOf(M1.threadId),
      labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Ana Pereira <ana@hearthandco.com>" },
          { name: "To", value: "maya@example.com" },
          { name: "Subject", value: "=?UTF-8?B?Q2Fmw6kgb3JkZXI=?=" },
          { name: "Date", value: "Thu, 22 Oct 2026 07:10:00 -0700" },
          { name: "Message-Id", value: "<n01.abc@hearthandco.com>" },
          { name: "Auto-Submitted", value: "auto-generated" },
        ],
        body: {
          data: Buffer.from("Hi Maya,\r\nFriday still works?\r\n").toString(
            "base64url",
          ),
        },
      },
    }));
    const fromRest = await restCallTool(rest, "gmail_read_message", {
      id: hexOf(M1.emailId),
    });

    const { gmail, transport } = build();
    gmail.messages = [
      textMail({
        ...M1,
        labels: ["\\Inbox"],
        flags: ["\\Seen"],
        headers: {
          From: "Ana Pereira <ana@hearthandco.com>",
          To: "maya@example.com",
          Subject: "=?UTF-8?B?Q2Fmw6kgb3JkZXI=?=",
          Date: "Thu, 22 Oct 2026 07:10:00 -0700",
          "Message-Id": "<n01.abc@hearthandco.com>",
          "Auto-Submitted": "auto-generated",
        },
        body: "Hi Maya,\r\nFriday still works?\r\n",
      }),
    ];
    const fromImap = await transport.callTool(
      connection(),
      "gmail_read_message",
      {
        id: hexOf(M1.emailId),
      },
    );

    expect(fromImap.isError).toBe(false);
    expect(JSON.parse(fromImap.text)).toEqual(JSON.parse(fromRest.text));
    expect(fromImap.truncated).toBe(fromRest.truncated);
  });

  test("a sent reply answers with the same three keys, of the same types", async () => {
    stubRest((call) =>
      call.method === "POST"
        ? { id: "sent1", threadId: "t1", labelIds: ["SENT"] }
        : {
            id: "orig1",
            threadId: "t1",
            payload: {
              headers: [{ name: "Message-ID", value: "<n01@hearthandco.com>" }],
            },
          },
    );
    const fromRest = await restCallTool(rest, "gmail_send_reply", {
      threadId: "t1",
      inReplyTo: "orig1",
      to: ["Ana Pereira <ana@hearthandco.com>"],
      subject: "Friday",
      body: "Yes.",
    });

    const { gmail, transport } = build();
    gmail.messages = [ANA];
    const fromImap = await transport.callTool(
      connection(),
      "gmail_send_reply",
      {
        threadId: ANA_THREAD,
        inReplyTo: ANA_ID,
        to: ["Ana Pereira <ana@hearthandco.com>"],
        subject: "Friday",
        body: "Yes.",
      },
    );

    const restShape = JSON.parse(fromRest.text);
    const imapShape = JSON.parse(fromImap.text);
    expect(Object.keys(imapShape)).toEqual(Object.keys(restShape));
    for (const key of Object.keys(restShape)) {
      expect(typeof imapShape[key]).toBe(typeof restShape[key]);
    }
    expect(imapShape.sent).toBe(true);
    expect(imapShape.threadId).toBe(ANA_THREAD);
    expect(fromImap.truncated).toBe(fromRest.truncated);
  });

  test("a sent new message answers with the same three keys, of the same types", async () => {
    stubRest(() => ({ id: "sent9", threadId: "t9", labelIds: ["SENT"] }));
    const message = {
      to: ["ana@example.com"],
      subject: "Good morning",
      body: "Good morning, Ana.",
    };
    const fromRest = await restCallTool(rest, "gmail_send_message", message);

    const { transport } = build();
    const fromImap = await transport.callTool(
      connection(),
      "gmail_send_message",
      message,
    );

    expect(fromImap.isError).toBe(false);
    const restShape = JSON.parse(fromRest.text);
    const imapShape = JSON.parse(fromImap.text);
    expect(Object.keys(imapShape)).toEqual(Object.keys(restShape));
    expect(Object.keys(imapShape)).toEqual(["sent", "id", "threadId"]);
    for (const key of Object.keys(restShape)) {
      expect(typeof imapShape[key]).toBe(typeof restShape[key]);
    }
    expect(imapShape.sent).toBe(true);
    expect(fromImap.truncated).toBe(fromRest.truncated);
  });

  test("a new message is refused with the same sentence, over either adapter, for every bad input", async () => {
    for (const args of [
      { to: [], subject: "s", body: "b" },
      { to: ["Ana <ana@example.com>"], subject: "s", body: "b" },
      {
        to: ["ana@example.com\r\nBcc: x@example.org"],
        subject: "s",
        body: "b",
      },
      {
        to: ["ana@example.com"],
        subject: "s\r\nBcc: x@example.org",
        body: "b",
      },
      { to: ["ana@example.com"], subject: "s", body: "" },
      {
        to: ["ana@example.com"],
        subject: "s",
        body: "b",
        cc: ["x@example.org"],
      },
      { to: ["ana@example.com"], subject: "s".repeat(201), body: "b" },
      { to: ["ana@example.com"], subject: "s", body: "b".repeat(20_001) },
      {
        to: Array.from({ length: 6 }, (_, index) => `p${index}@example.com`),
        subject: "s",
        body: "b",
      },
    ]) {
      const calls = stubRest(() => ({ id: "x" }));
      const fromRest = await restCallTool(rest, "gmail_send_message", args);
      const { gmail, transport } = build();
      const fromImap = await transport.callTool(
        connection(),
        "gmail_send_message",
        args,
      );
      expect(fromImap.isError).toBe(true);
      expect(fromImap.text).toBe(fromRest.text);
      expect(calls).toHaveLength(0);
      expect(gmail.sent).toEqual([]);
      expect(gmail.smtpClients).toEqual([]);
    }
  });
});

describe("(h) a new message goes to the addresses it was given and nowhere else", () => {
  const message = (overrides: Record<string, unknown> = {}) => ({
    to: ["ana@example.com"],
    subject: "Good morning",
    body: "Good morning, Ana.\nHave a lovely day.",
    ...overrides,
  });

  test("one SMTP send from the connected account, to exactly the given addresses, with no copies and no threading", async () => {
    const { gmail, transport } = build();
    const result = await transport.callTool(
      connection(),
      "gmail_send_message",
      message({
        to: ["Ana@Example.com", "bob@example.org", "ana@example.com"],
      }),
    );
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      sent: true,
      id: "",
      threadId: "",
    });
    expect(gmail.sent).toEqual([
      {
        from: "maya@example.com",
        to: ["Ana@Example.com", "bob@example.org"],
        cc: [],
        subject: "Good morning",
        text: "Good morning, Ana.\nHave a lovely day.",
        inReplyTo: "",
        references: [],
        envelope: {
          from: "maya@example.com",
          to: ["Ana@Example.com", "bob@example.org"],
        },
      },
    ]);
    expect(gmail.smtpClosed).toBe(1);
  });

  test("it dials the preset's SMTP host and no IMAP host at all, so the mailbox is never opened", async () => {
    const { gmail, transport } = build();
    gmail.messages = [ANA];
    await transport.callTool(connection(), "gmail_send_message", message());
    expect(gmail.clients).toEqual([]);
    expect(gmail.opened).toEqual([]);
    expect(gmail.fetched).toEqual([]);
    expect(gmail.methodsCalled()).toEqual([]);
    expect(gmail.violations).toEqual([]);
    expect(gmail.smtpClients.length).toBe(1);
    expect({
      host: gmail.smtpClients[0]?.host,
      port: gmail.smtpClients[0]?.port,
      secure: gmail.smtpClients[0]?.secure,
      user: gmail.smtpClients[0]?.user,
    }).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: FAKE_SECRET.address,
    });
  });

  test("a host, a from or an envelope in the arguments is never obeyed", async () => {
    const { gmail, transport } = build();
    const result = await transport.callTool(
      connection(),
      "gmail_send_message",
      message({
        host: "evil.example",
        from: "boss@example.org",
        envelope: { to: ["spy@example.org"] },
      }),
    );
    // Fields this tool does not send are refused, not ignored.
    expect(result.isError).toBe(true);
    expect(gmail.sent).toEqual([]);
    expect(gmail.smtpClients).toEqual([]);
  });

  test("a recipient Gmail refuses is reported, and the others are said to have it", async () => {
    const { gmail, transport } = build();
    gmail.smtpRejected = ["bob@example.org"];
    const result = await transport.callTool(
      connection(),
      "gmail_send_message",
      message({ to: ["ana@example.com", "bob@example.org"] }),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "Gmail refused at least one recipient. The email went to the others.",
    );
  });

  test("a send that fails says it was not sent and leaves nothing recorded as sent", async () => {
    const { gmail, transport } = build();
    gmail.smtpError = new Error("socket hang up");
    const result = await transport.callTool(
      connection(),
      "gmail_send_message",
      message(),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("The email was not sent.");
    expect(gmail.sent).toEqual([]);
  });
});
