import type {
  ImapClientLike,
  ImapFactory,
  ImapMessage,
  SmtpClientLike,
  SmtpFactory,
  SmtpMessage,
} from "../../src/plugins/google-imap";
import {
  serializeSecret,
  type UserSecret,
} from "../../src/plugins/user-secret";

/**
 * A Gmail mailbox and its SMTP server, in memory, behind the clients the transport is given.
 *
 * What it is for. The transport takes its IMAP, SMTP and calendar clients through factories, so no
 * test here opens a socket and none needs `mock.module`. This file is what stands behind the
 * factories: a mailbox that answers as Gmail's IMAP does (ids in decimal, labels and flags, headers
 * only when asked for them), and a recorder that sees every call the transport makes.
 *
 * The recorder is also the read-only check. The client handed out is a `Proxy` that answers only the
 * ten methods the transport's own client type names, and throws on any other, so a cast that reached
 * for `messageFlagsAdd` or `messageDelete` would be caught here as well as by the type and by the
 * source scan in the transport's test.
 *
 * Every value is invented. Addresses are on `example.com` and the password and calendar link are
 * made up for this file.
 */

export const FAKE_SECRET: UserSecret = {
  address: "maya@example.com",
  password: "qwertyuiopasdfgh",
  calendarUrl:
    "https://calendar.google.com/calendar/ical/maya%40example.com/private-4f9a1c2b7d/basic.ics",
};

/** What the store hands the transport as the token: the secret, serialised as it is in the vault. */
export function tokenFor(secret: UserSecret = FAKE_SECRET): string {
  return serializeSecret(secret);
}

/** The values a result, a log or a row must never contain, as the lines a test searches for. */
export function secretsOf(secret: UserSecret = FAKE_SECRET): string[] {
  const out = [secret.password];
  if (secret.calendarUrl) {
    out.push(secret.calendarUrl, "private-4f9a1c2b7d");
  }
  return out;
}

type StructureNode = NonNullable<ImapMessage["bodyStructure"]>;

export type FakeMail = {
  uid: number;
  /** `X-GM-MSGID`, in decimal as IMAP carries it. */
  emailId: string;
  /** `X-GM-THRID`, in decimal. */
  threadId: string;
  /** Gmail's labels as IMAP names them: `\Inbox`, `\Important`, a person's own. */
  labels?: string[];
  flags?: string[];
  date: string;
  headers: [string, string][];
  structure?: StructureNode;
  parts?: Record<string, string>;
};

/** The hex a Gmail id is spelled in over the REST API, for a decimal `X-GM-*` value. */
export const hexOf = (decimal: string) => BigInt(decimal).toString(16);

/** A text message: its headers, one plain part, and the structure that says so. */
export function textMail(input: {
  uid: number;
  emailId: string;
  threadId: string;
  headers: Record<string, string>;
  body: string;
  labels?: string[];
  flags?: string[];
  date?: string;
}): FakeMail {
  return {
    uid: input.uid,
    emailId: input.emailId,
    threadId: input.threadId,
    labels: input.labels ?? ["\\Inbox"],
    flags: input.flags ?? [],
    date: input.date ?? "2026-10-22T14:10:00.000Z",
    headers: Object.entries(input.headers),
    structure: {
      part: "1",
      type: "text/plain",
      size: Buffer.byteLength(input.body),
    },
    parts: { "1": input.body },
  };
}

/** Every method of the transport's IMAP client type. Anything else is a violation. */
export const ALLOWED_IMAP_METHODS = new Set([
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
]);

export type ImapCall = { method: string; args: unknown[] };
export type ClientOptions = {
  host: string;
  port: number;
  secure: true;
  user: string;
  pass: string;
};

export class FakeGmail {
  messages: FakeMail[] = [];
  /** The answer to a search by its exact `X-GM-RAW` text. Anything else is `searchFallback`. */
  searches = new Map<string, number[]>();
  /** What a search nobody scripted answers: every message, except a category query, which is none. */
  searchFallback: (raw: string) => number[] = (raw) =>
    raw.startsWith("rfc822msgid:")
      ? this.messages
          .filter((message) =>
            message.headers.some(
              ([name, value]) =>
                name.toLowerCase() === "message-id" &&
                value.includes(raw.slice("rfc822msgid:".length)),
            ),
          )
          .map((message) => message.uid)
      : raw.includes("category:")
        ? []
        : this.messages.map((message) => message.uid);

  /** Every call on every client, in order, across connections. */
  calls: ImapCall[] = [];
  /** The options each client was made with. One per connection, so this is the connection count. */
  clients: ClientOptions[] = [];
  opened: { path: string; options: unknown }[] = [];
  searched: { query: unknown; options: unknown }[] = [];
  fetched: { range: string; query: Record<string, unknown> }[] = [];
  downloads: { uid: string; part: string; maxBytes: number }[] = [];
  /** Methods the transport reached for that its client type does not name. Always empty. */
  violations: string[] = [];
  logouts = 0;
  closes = 0;

  /** Thrown by `connect()` when set: what a refused login or an unreachable host looks like. */
  connectError: unknown = null;
  /** Thrown by `logout()` when set. */
  logoutError: unknown = null;
  /** Thrown by `search()` when set. */
  searchError: unknown = null;

  smtpClients: ClientOptions[] = [];
  sent: SmtpMessage[] = [];
  smtpClosed = 0;
  smtpError: unknown = null;
  smtpRejected: string[] = [];

  imap: ImapFactory = (options) => {
    this.clients.push({ ...options });
    return this.proxy();
  };

  smtp: SmtpFactory = (options) => {
    this.smtpClients.push({ ...options });
    const client: SmtpClientLike = {
      sendMail: async (message) => {
        if (this.smtpError) throw this.smtpError;
        this.sent.push(message);
        return {
          accepted: message.envelope.to.filter(
            (address) => !this.smtpRejected.includes(address),
          ),
          rejected: this.smtpRejected,
        };
      },
      close: () => {
        this.smtpClosed += 1;
      },
    };
    return client;
  };

  private proxy(): ImapClientLike {
    const target = this.target();
    return new Proxy(target, {
      get: (_, property) => {
        if (typeof property !== "string") return undefined;
        if (!ALLOWED_IMAP_METHODS.has(property)) {
          this.violations.push(property);
          throw new Error(`the transport reached for ${property}`);
        }
        const method = (target as unknown as Record<string, unknown>)[property];
        return (...args: unknown[]) => {
          this.calls.push({ method: property, args });
          return (method as (...rest: unknown[]) => unknown).apply(
            target,
            args,
          );
        };
      },
    }) as ImapClientLike;
  }

  private select(range: string): FakeMail[] {
    const wanted = new Set(range.split(",").map(Number));
    return this.messages.filter((message) => wanted.has(message.uid));
  }

  private shape(
    message: FakeMail,
    query: Record<string, unknown>,
  ): ImapMessage {
    const out: ImapMessage = { uid: message.uid };
    if (query.flags) out.flags = new Set(message.flags ?? []);
    if (query.labels) out.labels = new Set(message.labels ?? []);
    if (query.internalDate) out.internalDate = new Date(message.date);
    if (query.emailId) out.emailId = message.emailId;
    if (query.threadId) out.threadId = message.threadId;
    if (query.bodyStructure && message.structure) {
      out.bodyStructure = message.structure;
    }
    if (Array.isArray(query.headers)) {
      // As `BODY.PEEK[HEADER.FIELDS (...)]` answers: only the fields asked for, whatever the case.
      const asked = new Set(
        (query.headers as string[]).map((name) => name.toLowerCase()),
      );
      out.headers = Buffer.from(
        `${message.headers
          .filter(([name]) => asked.has(name.toLowerCase()))
          .map(([name, value]) => `${name}: ${value}`)
          .join("\r\n")}\r\n\r\n`,
      );
    }
    return out;
  }

  private target(): ImapClientLike {
    return {
      connect: async () => {
        if (this.connectError) throw this.connectError;
      },
      logout: async () => {
        this.logouts += 1;
        if (this.logoutError) throw this.logoutError;
      },
      close: () => {
        this.closes += 1;
      },
      on: () => undefined,
      list: async () => [
        { path: "INBOX" },
        { path: "[Gmail]/All Mail", specialUse: "\\All" },
        { path: "[Gmail]/Trash", specialUse: "\\Trash" },
      ],
      mailboxOpen: async (path, options) => {
        this.opened.push({ path, options });
        return {};
      },
      search: async (query, options) => {
        this.searched.push({ query, options });
        if (this.searchError) throw this.searchError;
        if (query.emailId !== undefined) {
          return this.messages
            .filter((message) => message.emailId === query.emailId)
            .map((message) => message.uid);
        }
        const raw = query.gmailraw ?? "";
        return this.searches.get(raw) ?? this.searchFallback(raw);
      },
      fetch: (range, query) => {
        this.fetched.push({ range, query: { ...query } });
        const found = this.select(range);
        const shape = (message: FakeMail) => this.shape(message, query);
        return (async function* () {
          for (const message of found) yield shape(message);
        })();
      },
      fetchOne: async (uid, query) => {
        this.fetched.push({ range: uid, query: { ...query } });
        const [found] = this.select(uid);
        return found ? this.shape(found, query) : false;
      },
      download: async (uid, part, options) => {
        this.downloads.push({ uid, part, maxBytes: options.maxBytes });
        const [found] = this.select(uid);
        const text = found?.parts?.[part];
        if (text === undefined) return {};
        const bytes = Buffer.from(text).subarray(0, options.maxBytes);
        return {
          content: (async function* () {
            yield bytes;
          })(),
        };
      },
    };
  }

  /** The methods the transport called, once each and in first-use order. */
  methodsCalled(): string[] {
    return [...new Set(this.calls.map((call) => call.method))];
  }
}
