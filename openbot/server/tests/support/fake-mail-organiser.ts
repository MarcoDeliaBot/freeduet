import type {
  ImapClientLike,
  ImapFactory,
  ImapOrganiserFactory,
} from "../../src/plugins/google-imap";

/**
 * One Gmail mailbox in memory, behind BOTH connections the IMAP transport can make.
 *
 * The transport reads through one client type and changes a mailbox through another, narrower one, and
 * hands each to its own factory. This stands behind both over the same messages, so a test can run a
 * call through the transport and read off which kind of connection was made, what each was asked, and
 * what the mailbox looks like afterwards.
 *
 * Each client is a `Proxy` that answers only the methods its own type names and records any other as a
 * violation, so a cast that reached for `messageDelete` or `mailboxDelete` is caught here as well as by
 * the types and by the source scans. The READ client has no method that changes a mailbox, and a call
 * to the write methods on it is a violation too.
 *
 * Every value is invented: addresses are on `example.com`.
 */

export type MailboxMessage = {
  uid: number;
  /** `X-GM-MSGID`, in decimal as IMAP carries it. */
  emailId: string;
  /** Gmail's labels as IMAP names them: `\Inbox`, `\Starred`, a person's own. */
  labels: string[];
  flags: string[];
  from: string;
  subject: string;
};

export type Folder = {
  path: string;
  specialUse?: string;
  specialUseSource?: string;
};

export type Call = {
  /** Which connection made it: the one that reads, or the one that may change a mailbox. */
  via: "read" | "write";
  method: string;
  args: unknown[];
};

/** The methods of the read client type, which has nothing that changes a mailbox. */
const READ_METHODS = new Set([
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

/** The methods of the narrow client the four operations use, and no more. */
const WRITE_METHODS = new Set([
  "connect",
  "logout",
  "close",
  "on",
  "list",
  "mailboxOpen",
  "mailboxCreate",
  "search",
  "fetch",
  "messageFlagsAdd",
  "messageFlagsRemove",
  "messageCopy",
]);

/** Methods that change a mailbox, asserted never to be called on the read client. */
export const CHANGING_METHODS = [
  "mailboxCreate",
  "messageFlagsAdd",
  "messageFlagsRemove",
  "messageCopy",
] as const;

export const decimalOf = (hex: string) => BigInt(`0x${hex}`).toString(10);
export const hexOfDecimal = (decimal: string) => BigInt(decimal).toString(16);

const ID_A = "1111111111111111111";
const ID_B = "1111111111111111112";
const ID_C = "1111111111111111113";

export const MESSAGE_IDS = { a: ID_A, b: ID_B, c: ID_C } as const;
export const HEX = {
  a: hexOfDecimal(ID_A),
  b: hexOfDecimal(ID_B),
  c: hexOfDecimal(ID_C),
} as const;

export class FakeMailbox {
  folders: Folder[] = [
    { path: "INBOX" },
    {
      path: "[Gmail]/All Mail",
      specialUse: "\\All",
      specialUseSource: "extension",
    },
    {
      path: "[Gmail]/Trash",
      specialUse: "\\Trash",
      specialUseSource: "extension",
    },
    {
      path: "[Gmail]/Spam",
      specialUse: "\\Junk",
      specialUseSource: "extension",
    },
    { path: "FreeDuet" },
    { path: "Clients/Acme" },
  ];

  messages: MailboxMessage[] = [
    {
      uid: 11,
      emailId: ID_A,
      labels: ["\\Inbox"],
      flags: [],
      from: "Ana <ana@example.com>",
      subject: "Invoice 42",
    },
    {
      uid: 12,
      emailId: ID_B,
      labels: ["\\Inbox", "\\Important"],
      flags: ["\\Seen"],
      from: "News <news@example.org>",
      subject: "Weekly digest",
    },
    {
      uid: 13,
      emailId: ID_C,
      labels: ["FreeDuet"],
      flags: ["\\Seen"],
      from: "Bob <bob@example.net>",
      subject: "Already filed",
    },
  ];

  /** Every call on every client, in order, across connections. */
  calls: Call[] = [];
  /** The options each connection was made with, by kind. */
  readConnections: unknown[] = [];
  writeConnections: unknown[] = [];
  /** Methods a client was asked for that its type does not name. Always empty. */
  violations: string[] = [];
  logouts = 0;
  closes = 0;

  /** Thrown by the named method, on either kind of connection, when set. */
  failures = new Map<string, unknown>();
  /** What the changing methods answer: `false` is a server that did not make the change. */
  storeAnswers = true;
  /** What `messageCopy` answers: `false` is a server that did not make the copy. */
  copyAnswers = true;
  /** Email ids a copy leaves in All Mail, whatever the server answered. */
  staysAfterCopy = new Set<string>();
  /** What a removal answers, when the add before it was made: `false` is a server that refused only that. */
  removeAnswers = true;
  /** A server that never answers the logout: the transport must cut the connection off itself. */
  logoutHangs = false;
  /** What `mailboxCreate` answers: `created: false` is a label that was already there. */
  createdAnswer: { path?: string; created?: boolean } | undefined = undefined;

  imap: ImapFactory = (options) => {
    this.readConnections.push({ ...options });
    return this.client(
      "read",
      READ_METHODS,
    ) as unknown as ReturnType<ImapFactory>;
  };

  organiser: ImapOrganiserFactory = (options) => {
    this.writeConnections.push({ ...options });
    return this.client(
      "write",
      WRITE_METHODS,
    ) as unknown as ReturnType<ImapOrganiserFactory>;
  };

  /** The calls made on one method, from either connection. */
  called(method: string): Call[] {
    return this.calls.filter((call) => call.method === method);
  }

  /** The methods called, once each and in first-use order. */
  methodsCalled(): string[] {
    return [...new Set(this.calls.map((call) => call.method))];
  }

  /** Whether any method that changes a mailbox was ever called. */
  changedAnything(): boolean {
    return this.calls.some((call) =>
      (CHANGING_METHODS as readonly string[]).includes(call.method),
    );
  }

  message(emailId: string): MailboxMessage | undefined {
    return this.messages.find((message) => message.emailId === emailId);
  }

  /**
   * What All Mail holds. Gmail's IMAP does not show a message that is in the Bin (or in Spam) in All
   * Mail, so a message the Bin holds is "not found" to a lookup, as it is over REST.
   */
  private visible(): MailboxMessage[] {
    return this.messages.filter(
      (message) =>
        !message.labels.includes("\\Trash") &&
        !message.labels.includes("\\Spam"),
    );
  }

  /** The path of every folder a message was copied into, with the uids, in order. */
  copies: { range: string; destination: string }[] = [];

  private pick(range: string): MailboxMessage[] {
    const wanted = new Set(range.split(",").map(Number));
    return this.visible().filter((message) => wanted.has(message.uid));
  }

  private client(via: "read" | "write", allowed: Set<string>) {
    const target = this.target(via);
    return new Proxy(target, {
      get: (_, property) => {
        if (typeof property !== "string") return undefined;
        if (!allowed.has(property)) {
          this.violations.push(`${via}:${property}`);
          throw new Error(`the ${via} client was asked for ${property}`);
        }
        const method = (target as unknown as Record<string, unknown>)[property];
        return (...args: unknown[]) => {
          this.calls.push({ via, method: property, args });
          const failure = this.failures.get(property);
          if (failure !== undefined && property !== "on") throw failure;
          return (method as (...rest: unknown[]) => unknown).apply(
            target,
            args,
          );
        };
      },
    });
  }

  private target(via: "read" | "write") {
    return {
      connect: async () => undefined,
      logout: async () => {
        this.logouts += 1;
        if (this.logoutHangs) await new Promise<void>(() => {});
      },
      close: () => {
        this.closes += 1;
      },
      on: () => undefined,
      list: async () => this.folders.map((folder) => ({ ...folder })),
      mailboxOpen: async () => ({}),
      mailboxCreate: async (path: string) =>
        this.createdAnswer ?? { path, created: true },
      search: async (query: { emailId?: string }) =>
        this.visible()
          .filter((message) => message.emailId === query.emailId)
          .map((message) => message.uid),
      fetch: (
        range: string,
        query: { uid?: true; labels?: true; headers?: string[] },
      ) => {
        const found = this.pick(range);
        return (async function* () {
          for (const message of found) {
            yield {
              uid: message.uid,
              ...(query.labels ? { labels: new Set(message.labels) } : {}),
              ...(query.headers
                ? {
                    headers: Buffer.from(
                      `From: ${message.from}\r\nSubject: ${message.subject}\r\n\r\n`,
                    ),
                  }
                : {}),
            };
          }
        })();
      },
      fetchOne: async () => {
        throw new Error(`fetchOne is not used here (${via})`);
      },
      download: async () => {
        throw new Error(`download is not used here (${via})`);
      },
      messageFlagsAdd: async (
        range: string,
        flags: string[],
        options: { useLabels?: true },
      ) => {
        if (!this.storeAnswers) return false;
        for (const message of this.pick(range)) {
          const into = options.useLabels ? message.labels : message.flags;
          for (const flag of flags) if (!into.includes(flag)) into.push(flag);
        }
        return true;
      },
      messageCopy: async (range: string, destination: string) => {
        this.copies.push({ range, destination });
        if (!this.copyAnswers) return false;
        // Gmail: a copy into the Bin puts the message in the Bin, which keeps it for about 30 days.
        const target = this.folders.find(
          (folder) =>
            folder.path === destination &&
            (folder.specialUse === "\\Trash" || folder.specialUse === "\\Junk"),
        );
        const label = target?.specialUse === "\\Junk" ? "\\Spam" : "\\Trash";
        if (target) {
          for (const message of this.pick(range)) {
            // A server that answers the copy and still shows the message in All Mail.
            if (this.staysAfterCopy.has(message.emailId)) continue;
            if (!message.labels.includes(label)) message.labels.push(label);
          }
        }
        return { path: destination };
      },
      messageFlagsRemove: async (
        range: string,
        flags: string[],
        options: { useLabels?: true },
      ) => {
        if (!this.storeAnswers || !this.removeAnswers) return false;
        for (const message of this.pick(range)) {
          const key = options.useLabels ? "labels" : "flags";
          message[key] = message[key].filter((each) => !flags.includes(each));
        }
        return true;
      },
    } satisfies Record<string, unknown> as unknown as ImapClientLike &
      Record<string, unknown>;
  }
}
