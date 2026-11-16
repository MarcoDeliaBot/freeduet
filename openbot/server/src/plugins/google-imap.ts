import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { cutAtCodeUnits } from "../channels/text";
import {
  fetchCalendarText,
  type IcsFetcher,
  listEvents,
  type ParsedCalendar,
  parseCalendar,
} from "./google-ical";
import {
  asJson,
  BODY_CUT_MARKER,
  capBody,
  countArg,
  DEFAULT_MAX_RESULTS,
  DEFAULT_QUERY,
  hiddenFoldersNamed,
  endOfDayIn,
  failure,
  type GmailMessage,
  HEADER_BREAK,
  type Header,
  htmlToText,
  listTools as restListTools,
  MAX_RESULTS,
  METADATA_HEADERS,
  parseNewMessage,
  passedHeaders,
  RFC822_MESSAGE_ID,
  shownHeader,
  summary,
} from "./google-workspace-rest";
import {
  binPath,
  type ImapOrganiserLike,
  organiseOverImap,
  spamPath,
  watchForChanges,
} from "./google-imap-organise";
import {
  allMailPath,
  isOrganiseMessageTool,
  isOrganiseTool,
  LIST_LABELS,
  labelsAnswer,
  type OrganiseDetails,
  ownLabelNames,
  parseOrganiseCall,
  shownMessage,
} from "./mail-organise";
import { type MailPreset, mailPreset } from "./mail-presets";
import type { McpCallResult, McpTool } from "./mcp";
import {
  parseSecret,
  type UserSecret,
  type VerifyOutcome,
  type VerifyUserSecret,
} from "./user-secret";

/**
 * Gmail and Google Calendar, reached with an app password and a secret calendar link.
 *
 * The same five tools as {@link ./google-workspace-rest}, with the same arguments and the same JSON
 * answers, because OpenDuet's own code reads them (triage parses a search, the brief reads the
 * calendar) and a Bot is told the same thing whichever way a person connected. The tool list IS that
 * module's list, and the shapes are produced by that module's own formatters over what IMAP and the
 * calendar file hand back, so a renamed field there is a renamed field here.
 *
 * AN APP PASSWORD IS WIDER THAN ANY OAUTH SCOPE, AND THE TOOLS ARE THE ONLY LIMIT. Google gives the
 * holder the whole mailbox: read, move, delete, send as the person. Nothing the vendor does narrows
 * that, so everything below is written to narrow it here:
 *
 * - The mailbox is opened read-only (IMAP `EXAMINE`), and messages are fetched without marking them
 *   read (`BODY.PEEK`, which imapflow always uses). The only calls this module makes on a mailbox
 *   are LIST, EXAMINE, SEARCH, FETCH and logout. There is no call here that moves, deletes, labels,
 *   flags or appends, and the client type below has no method that could. A test reads this file's
 *   source to keep it so.
 * - Organising a mailbox (labels, archive, read and unread: the tools of {@link ./mail-organise}) is
 *   the one thing that needs a mailbox opened for writing, and it is done by
 *   {@link ./google-imap-organise}, a module of its own with a client type of its own, so that
 *   nothing in THIS file can change a mailbox. This file only hands a call to it, on a second
 *   connection that exists for that one call. Listing the labels and describing the messages a call
 *   names, for the person's card, stay here and stay read-only.
 * - Mail leaves in two ways, `gmail_send_reply` and `gmail_send_message`, both of which the catalogue
 *   names writes, so the approval gate looks at each first. A reply goes inside an existing thread,
 *   to people already on the message being answered, and adds nobody. A new message goes to at most
 *   five plain addresses, with a subject and a plain-text body and nothing else: no Cc, no Bcc, no
 *   attachment, no HTML, no header of the caller's choosing, and always from the connected account.
 *   Both go out over the preset's SMTP host and nothing is appended to a mailbox (Gmail files the
 *   sent copy itself), so the mailbox above stays read-only.
 * - The hosts are the preset's: IMAP and SMTP over implicit TLS, and the calendar only from
 *   Google's own address. No argument, stored value or redirect can name another.
 *
 * NEVER A SECRET IN A SENTENCE. The password, the address and the calendar link are not written into
 * any result, error or log. Every failure below is fixed text; a library's own message is not
 * carried, because it may quote what it was given.
 */

/** Long enough for a slow mailbox, short enough that a Bot's turn is not held open on it. */
const CALL_TIMEOUT_MS = 30_000;
/** The part of a search spent fetching snippets; past it the rest are returned without one. */
const SNIPPET_BUDGET_MS = 20_000;
const SNIPPET_BYTES = 2_048;
const SNIPPET_CHARS = 200;
/** Four bytes a character is the most UTF-8 spends, so this always covers the body cap. */
const BODY_DOWNLOAD_BYTES = 90_000;
/** A Gmail message or thread id, as the REST API and this module spell it: hex. */
const GMAIL_ID = /^[0-9a-f]{1,16}$/i;
/** Parallel to the REST adapter's own cap on how many results a calendar listing returns. */
const CALENDAR_CACHE_MS = 60_000;
const CALENDAR_CACHE_ENTRIES = 200;

export const listNeedsCredential = false;

/** The same list for everybody, and the same list the OAuth adapter offers. */
export async function listTools(): Promise<McpTool[]> {
  return restListTools({ url: "" });
}

/* ------------------------------------------------------------------------------------------------
 * The clients, as narrow as what this module is allowed to do.
 * ---------------------------------------------------------------------------------------------- */

type StructureNode = {
  part?: string | undefined;
  type: string;
  size?: number | undefined;
  disposition?: string | undefined;
  dispositionParameters?: { [key: string]: string } | undefined;
  parameters?: { [key: string]: string } | undefined;
  childNodes?: StructureNode[] | undefined;
};

export type ImapMessage = {
  uid: number;
  emailId?: string | undefined;
  threadId?: string | undefined;
  labels?: Set<string> | undefined;
  flags?: Set<string> | undefined;
  internalDate?: Date | string | undefined;
  headers?: Buffer | undefined;
  bodyStructure?: StructureNode | undefined;
};

type FetchQuery = {
  uid: true;
  flags?: true;
  labels?: true;
  internalDate?: true;
  emailId?: true;
  threadId?: true;
  bodyStructure?: true;
  headers: string[];
};

/**
 * What this module may ask of an IMAP connection, and nothing else.
 *
 * Deliberately a subset of imapflow's surface: there is no store, move, copy, delete, flag, label
 * or append here, so code written against this type cannot reach them, and a test double has nothing
 * to implement that could change a mailbox. `mailboxOpen` takes `readOnly: true` as a literal, so
 * a read-write open does not type-check.
 */
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
  list(): Promise<
    {
      path: string;
      specialUse?: string | undefined;
      specialUseSource?: string | undefined;
    }[]
  >;
  mailboxOpen(path: string, options: { readOnly: true }): Promise<unknown>;
  search(
    query: { gmailraw?: string; emailId?: string; all?: true },
    options: { uid: true },
  ): Promise<number[] | false>;
  fetch(
    range: string,
    query: FetchQuery,
    options: { uid: true },
  ): AsyncIterable<ImapMessage>;
  fetchOne(
    uid: string,
    query: FetchQuery,
    options: { uid: true },
  ): Promise<ImapMessage | false>;
  download(
    uid: string,
    part: string,
    options: { uid: true; maxBytes: number },
  ): Promise<{ content?: AsyncIterable<unknown> | undefined }>;
}

export type ImapFactory = (options: {
  host: string;
  port: number;
  secure: true;
  user: string;
  pass: string;
}) => ImapClientLike;

export type SmtpMessage = {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  inReplyTo: string;
  references: string[];
  /** The addresses the message is delivered to, exactly: nothing is added to the headers' own. */
  envelope: { from: string; to: string[] };
};

export interface SmtpClientLike {
  sendMail(message: SmtpMessage): Promise<{
    accepted?: readonly unknown[] | undefined;
    rejected?: readonly unknown[] | undefined;
  }>;
  close(): void;
}

export type SmtpFactory = (options: {
  host: string;
  port: number;
  secure: true;
  user: string;
  pass: string;
}) => SmtpClientLike;

/** What every connection has: opening it, closing it and hearing about an error. */
type Lifecycle = Pick<ImapClientLike, "connect" | "logout" | "close" | "on">;

/** The connection an organising call is made on. It is the same real client, typed by what that call may do. */
export type ImapOrganiserFactory = (options: {
  host: string;
  port: number;
  secure: true;
  user: string;
  pass: string;
}) => Lifecycle & ImapOrganiserLike;

export type TransportDeps = {
  imap: ImapFactory;
  organiser: ImapOrganiserFactory;
  smtp: SmtpFactory;
  fetch: IcsFetcher;
  now: () => Date;
};

const realImap: ImapFactory = (options) =>
  new ImapFlow({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: { user: options.user, pass: options.pass },
    // imapflow logs commands, and a login is one. Nothing here wants its log.
    logger: false,
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  }) as unknown as ImapClientLike;

const realOrganiser: ImapOrganiserFactory = (options) =>
  realImap(options) as unknown as Lifecycle & ImapOrganiserLike;

const realSmtp: SmtpFactory = (options) => {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: { user: options.user, pass: options.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
  });
  return {
    sendMail: (message) => transporter.sendMail(message),
    close: () => transporter.close(),
  };
};

const realDeps: TransportDeps = {
  imap: realImap,
  organiser: realOrganiser,
  smtp: realSmtp,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
};

/* ------------------------------------------------------------------------------------------------
 * Failures: fixed sentences, chosen from the kind of error and never from its words.
 * ---------------------------------------------------------------------------------------------- */

const REFUSED_LOGIN =
  "Gmail did not accept this address and app password. The app password may have been revoked: make a new one and connect again on the Connections page.";
const UNREACHABLE = "Gmail could not be reached.";
const TIMED_OUT = "Gmail did not answer in time.";

class DeadlineError extends Error {}

/** What kind of failure an imapflow or nodemailer error is, from its codes and never its message. */
function failureKind(
  error: unknown,
): "login" | "unreachable" | "timeout" | "other" {
  if (error instanceof DeadlineError) return "timeout";
  const record = (error ?? {}) as Record<string, unknown>;
  if (record.authenticationFailed === true || record.code === "EAUTH") {
    return "login";
  }
  // Gmail answers a bad app password with AUTHENTICATIONFAILED in the response code.
  const text = [record.serverResponseCode, record.responseStatus]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  if (/AUTHENTICATIONFAILED/i.test(text)) return "login";
  const code = typeof record.code === "string" ? record.code : "";
  if (/TIMEDOUT|Timeout/i.test(code) || record.name === "TimeoutError") {
    return "timeout";
  }
  if (
    [
      "ENOTFOUND",
      "ECONNREFUSED",
      "ECONNRESET",
      "ECONNECTION",
      "ESOCKET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "NoConnection",
      "EPIPE",
    ].includes(code)
  ) {
    return "unreachable";
  }
  return "other";
}

function sentenceFor(error: unknown, what: string): string {
  switch (failureKind(error)) {
    case "login":
      return REFUSED_LOGIN;
    case "timeout":
      return TIMED_OUT;
    case "unreachable":
      return UNREACHABLE;
    default:
      return `Gmail refused ${what}.`;
  }
}

/* ------------------------------------------------------------------------------------------------
 * One connection, for the length of one call, and the mailbox on it opened read-only.
 * ---------------------------------------------------------------------------------------------- */

/** The same for every connection this module makes: where it goes and who it logs in as. */
const connectionOptions = (preset: MailPreset, secret: UserSecret) => ({
  host: preset.imap.host,
  port: preset.imap.port,
  secure: preset.imap.secure,
  user: secret.address,
  pass: secret.password,
});

/**
 * Runs `run` on a connection and closes it, however the call ended: the one place a connection's
 * life, its deadline and its failures are handled, so none can be left open and none can carry a
 * library's own words into an answer. `onError` turns what went wrong into the answer for that call.
 *
 * A connection per call rather than a held one: a Bot's calls are minutes apart, a held session is a
 * password in memory for as long as it lives, and Gmail drops an idle one anyway.
 */
async function withConnection<C extends Lifecycle, T>(
  client: C,
  run: (client: C) => Promise<T>,
  onError: (error: unknown) => T,
  deadlineMs = CALL_TIMEOUT_MS,
): Promise<T> {
  // An `error` event with no listener is thrown at the process. The failure that caused it surfaces
  // through the call that was running, which is where it is read.
  client.on("error", () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), deadlineMs);
  });
  const work = (async () => {
    await client.connect();
    return run(client);
  })();
  // A call that outlives its deadline settles later, with nobody to read it.
  work.catch(() => {});
  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    return onError(error);
  } finally {
    clearTimeout(timer);
    // A logout the server does not answer in two seconds is cut off, not waited for.
    let waiting: ReturnType<typeof setTimeout> | undefined;
    try {
      const answered = await Promise.race([
        client.logout().then(() => true),
        new Promise<boolean>((resolve) => {
          waiting = setTimeout(() => resolve(false), 2_000);
        }),
      ]);
      if (!answered) client.close();
    } catch {
      client.close();
    } finally {
      clearTimeout(waiting);
    }
  }
}

/**
 * The person's all-mail folder, opened read-only. All Mail is where every message lives whatever it is
 * labelled, so a search there answers what Gmail's own search does; its name depends on the account's
 * language, which is why it is found by its `\All` flag.
 */
async function openAllMail(client: ImapClientLike): Promise<void> {
  const folders = await client.list();
  await client.mailboxOpen(allMailPath(folders), { readOnly: true });
}

/** Runs `run` against the all-mail folder, opened read-only, and closes the connection. */
async function withMailbox(
  deps: TransportDeps,
  preset: MailPreset,
  secret: UserSecret,
  run: (client: ImapClientLike) => Promise<McpCallResult>,
  what: string,
): Promise<McpCallResult> {
  return withConnection(
    deps.imap(connectionOptions(preset, secret)),
    async (client) => {
      await openAllMail(client);
      return run(client);
    },
    (error) => failure(sentenceFor(error, what)),
  );
}

/* ------------------------------------------------------------------------------------------------
 * Gmail's ids, headers and labels, in the REST API's spelling.
 * ---------------------------------------------------------------------------------------------- */

/** `X-GM-MSGID` and `X-GM-THRID` are decimal; the REST API's ids for the same things are hex. */
function toHex(decimal: string | undefined): string {
  if (!decimal) return "";
  try {
    return BigInt(decimal).toString(16);
  } catch {
    return decimal;
  }
}

function parseHeaders(buffer: Buffer | undefined): Header[] {
  if (!buffer) return [];
  const unfolded = buffer.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const out: Header[] = [];
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    out.push({
      name: line.slice(0, colon).trim(),
      value: line.slice(colon + 1).trim(),
    });
  }
  return out;
}

const SYSTEM_LABELS: ReadonlyMap<string, string> = new Map([
  ["\\inbox", "INBOX"],
  ["\\sent", "SENT"],
  ["\\draft", "DRAFT"],
  ["\\drafts", "DRAFT"],
  ["\\important", "IMPORTANT"],
  ["\\starred", "STARRED"],
  ["\\spam", "SPAM"],
  ["\\trash", "TRASH"],
]);

/**
 * The labels the REST API reports, from IMAP's labels and flags: system labels in capitals, an
 * unread message marked `UNREAD`, and a person's own labels by name.
 */
function labelsOf(
  message: ImapMessage,
  extra: readonly string[] = [],
): string[] {
  const out = new Set<string>();
  for (const label of message.labels ?? []) {
    out.add(SYSTEM_LABELS.get(label.toLowerCase()) ?? label);
  }
  if (message.flags?.has("\\Flagged")) out.add("STARRED");
  for (const label of extra) out.add(label);
  if (message.flags && !message.flags.has("\\Seen")) out.add("UNREAD");
  return [...out];
}

function gmailMessageOf(
  message: ImapMessage,
  snippet: string,
  extraLabels: readonly string[] = [],
): GmailMessage {
  const received =
    message.internalDate instanceof Date
      ? message.internalDate
      : message.internalDate
        ? new Date(message.internalDate)
        : null;
  return {
    id: toHex(message.emailId),
    threadId: toHex(message.threadId),
    labelIds: labelsOf(message, extraLabels),
    snippet,
    ...(received && Number.isFinite(received.getTime())
      ? { internalDate: String(received.getTime()) }
      : {}),
    payload: { headers: parseHeaders(message.headers) },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Bodies.
 * ---------------------------------------------------------------------------------------------- */

function isAttachment(node: StructureNode): boolean {
  return (
    node.disposition?.toLowerCase() === "attachment" ||
    Boolean(node.dispositionParameters?.filename) ||
    Boolean(node.parameters?.name)
  );
}

/** The first part of this type, depth first, that is not an attachment or an attached message. */
function firstPart(node: StructureNode, type: string): StructureNode | null {
  if (isAttachment(node)) return null;
  if (node.type.toLowerCase() === type) return node;
  if (node.type.toLowerCase() === "message/rfc822") return null;
  for (const child of node.childNodes ?? []) {
    const found = firstPart(child, type);
    if (found) return found;
  }
  return null;
}

async function readText(content: AsyncIterable<unknown>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(
      typeof chunk === "string"
        ? Buffer.from(chunk)
        : Buffer.from(chunk as Uint8Array),
    );
  }
  // A cut can land inside a character; the replacement it leaves is not part of the message.
  return Buffer.concat(chunks).toString("utf8").replace(/�+$/, "");
}

/** The message's text, from its plain part or, with none, its HTML read as text; and the part's size. */
async function bodyOf(
  client: ImapClientLike,
  uid: number,
  structure: StructureNode | undefined,
  maxBytes: number,
): Promise<{ text: string; size: number } | null> {
  if (!structure) return null;
  const plain = firstPart(structure, "text/plain");
  const chosen = plain ?? firstPart(structure, "text/html");
  if (!chosen) return null;
  const download = await client.download(String(uid), chosen.part ?? "1", {
    uid: true,
    maxBytes,
  });
  if (!download.content) return null;
  const raw = await readText(download.content);
  return {
    text:
      chosen === plain ? raw.replace(/\r\n/g, "\n").trim() : htmlToText(raw),
    size: chosen.size ?? 0,
  };
}

/* ------------------------------------------------------------------------------------------------
 * The tools.
 * ---------------------------------------------------------------------------------------------- */

const FETCH_FIELDS = {
  uid: true,
  flags: true,
  labels: true,
  internalDate: true,
  emailId: true,
  threadId: true,
  bodyStructure: true,
  headers: [...METADATA_HEADERS],
} as const satisfies FetchQuery;

/** The categories triage tells noise from people by. IMAP does not list them, so each is searched. */
const CATEGORY_LABELS: readonly (readonly [string, string])[] = [
  ["promotions", "CATEGORY_PROMOTIONS"],
  ["social", "CATEGORY_SOCIAL"],
];

/** A search's arguments, checked before any connection is made, as the REST adapter checks its own. */
function searchArgsOf(
  args: Record<string, unknown>,
):
  | { ok: true; query: string; limit: number | null }
  | { ok: false; result: McpCallResult } {
  const given = args.query;
  const query =
    typeof given === "string" && given.trim() !== "" ? given : DEFAULT_QUERY;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
  if (/[\u0000-\u001f\u007f]/.test(query)) {
    return {
      ok: false,
      result: failure("The search contains a control character."),
    };
  }
  const limit = countArg(args.maxResults);
  if (limit === "invalid") {
    return {
      ok: false,
      result: failure(`maxResults must be a number from 1 to ${MAX_RESULTS}.`),
    };
  }
  return { ok: true, query, limit };
}

const NO_SPAM_TO_SEARCH =
  "Gmail did not report a Spam (Junk) folder for this account, so there is nothing to search there. This does not mean any mail was lost.";
const NO_BIN_TO_SEARCH =
  "Gmail did not report a Bin (Trash) folder for this account, so there is nothing to search there. This does not mean any mail was lost.";
const BOTH_HIDDEN =
  "Search Spam and the Bin one at a time: name only one of in:spam and in:trash in a search.";

/**
 * A search that names Spam or the Bin (`in:spam`, `in:trash`) reads that folder, opened read-only, the
 * folder the server flagged `\Junk` or `\Trash` and none found by its name. Any other search reads All
 * Mail, which holds neither. Null: the search is not about one of them.
 */
function hiddenFolderOf(query: string): "spam" | "bin" | "both" | null {
  const named = hiddenFoldersNamed(query);
  if (named.spam && named.bin) return "both";
  if (named.spam) return "spam";
  if (named.bin) return "bin";
  return null;
}

/** Opens the folder a search reads: All Mail, or Spam or the Bin when the query names one. */
async function openForSearch(
  client: ImapClientLike,
  query: string,
): Promise<McpCallResult | null> {
  const hidden = hiddenFolderOf(query);
  if (hidden === "both") return failure(BOTH_HIDDEN);
  const folders = await client.list();
  const path =
    hidden === null
      ? allMailPath(folders)
      : hidden === "spam"
        ? spamPath(folders)
        : binPath(folders);
  if (path === null) {
    return failure(hidden === "spam" ? NO_SPAM_TO_SEARCH : NO_BIN_TO_SEARCH);
  }
  await client.mailboxOpen(path, { readOnly: true });
  return null;
}

async function searchMessages(
  client: ImapClientLike,
  search: { query: string; limit: number | null },
  now: () => number,
): Promise<McpCallResult> {
  const { limit } = search;
  const hidden = hiddenFolderOf(search.query) !== null;
  // In Spam or the Bin the folder itself is the scope: the words that named it are not searched for.
  const rest = hiddenFoldersNamed(search.query).rest;
  const query = hidden ? rest : search.query;

  const hits =
    (await client.search(
      rest === "" && hidden ? { all: true } : { gmailraw: query },
      {
        uid: true,
      },
    )) || [];
  // The newest are the highest uids in All Mail, where uids follow arrival.
  const selected = [...hits]
    .sort((a, b) => b - a)
    .slice(0, limit ?? DEFAULT_MAX_RESULTS);

  const fetched: ImapMessage[] = [];
  if (selected.length > 0) {
    for await (const message of client.fetch(selected.join(","), FETCH_FIELDS, {
      uid: true,
    })) {
      fetched.push(message);
    }
  }

  const categories = new Map<number, string[]>();
  if (selected.length > 0 && !hidden) {
    for (const [name, label] of CATEGORY_LABELS) {
      const inCategory =
        (await client.search(
          { gmailraw: `(${query}) category:${name}` },
          { uid: true },
        )) || [];
      for (const uid of inCategory) {
        if (selected.includes(uid)) {
          categories.set(uid, [...(categories.get(uid) ?? []), label]);
        }
      }
    }
  }

  const stop = now() + SNIPPET_BUDGET_MS;
  const messages = [];
  for (const message of fetched) {
    let snippet = "";
    if (now() < stop) {
      const body = await bodyOf(
        client,
        message.uid,
        message.bodyStructure,
        SNIPPET_BYTES,
      ).catch(() => null);
      if (body) {
        snippet = cutAtCodeUnits(
          body.text.replace(/\s+/g, " ").trim(),
          SNIPPET_CHARS,
        );
      }
    }
    messages.push({
      at: message.internalDate ? new Date(message.internalDate).getTime() : 0,
      gmail: gmailMessageOf(message, snippet, categories.get(message.uid)),
    });
  }
  messages.sort((left, right) => right.at - left.at);

  return asJson({
    messages: messages.map(({ gmail }) => ({
      ...summary(gmail),
      snippet: gmail.snippet ?? "",
      labels: gmail.labelIds ?? [],
      headers: passedHeaders(gmail),
    })),
    resultSizeEstimate: hits.length,
  });
}

const NOT_FOUND =
  "No message with that id is in this mailbox. It may have been deleted, or the id is not one a search returned.";

/** The uid of the message a Gmail id names, or null. */
async function uidOfId(
  client: ImapClientLike,
  id: string,
): Promise<number | null> {
  if (!GMAIL_ID.test(id)) return null;
  const found = await client.search(
    { emailId: BigInt(`0x${id}`).toString(10) },
    { uid: true },
  );
  return found && found.length > 0 ? (found[0] ?? null) : null;
}

async function readMessage(
  client: ImapClientLike,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) return failure("A message id is needed to read a message.");
  const uid = await uidOfId(client, id);
  if (uid === null) return failure(NOT_FOUND);
  const message = await client.fetchOne(String(uid), FETCH_FIELDS, {
    uid: true,
  });
  if (!message) return failure(NOT_FOUND);

  const body = await bodyOf(
    client,
    uid,
    message.bodyStructure,
    BODY_DOWNLOAD_BYTES,
  );
  const capped = capBody(body?.text ?? "");
  let { body: text, cut } = capped;
  // The download was cut at its byte cap, so what is here is not the whole message even if it is short.
  if (!cut && body && body.size > BODY_DOWNLOAD_BYTES) {
    text += BODY_CUT_MARKER;
    cut = true;
  }
  const gmail = gmailMessageOf(message, "");
  return asJson(
    {
      ...summary(gmail),
      labels: gmail.labelIds ?? [],
      headers: passedHeaders(gmail),
      messageId: shownHeader(gmail.payload?.headers, "Message-ID") ?? "",
      body: text,
    },
    cut,
  );
}

/* ------------------------------------------------------------------------------------------------
 * Organising a mailbox (docs/design/mail-organise.md): what stays read-only here, and the hand-off.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Longer than a read, because naming a message to the server is one command for each. A call that
 * outlives it before the first command that changes a thing was sent changed nothing; after that it
 * may have changed it, and the answer says so (`MAY_HAVE_CHANGED`).
 */
const ORGANISE_TIMEOUT_MS = 60_000;

/** A change was sent and the connection then failed or timed out: nobody can say whether it was made. */
export const MAY_HAVE_CHANGED =
  "Gmail did not confirm the change after it was sent, so it may have been made. Look in Gmail before asking again.";

/** The person's own labels, by name. A LIST and nothing else: no mailbox is opened. */
async function listLabels(
  deps: TransportDeps,
  preset: MailPreset,
  secret: UserSecret,
): Promise<McpCallResult> {
  return withConnection(
    deps.imap(connectionOptions(preset, secret)),
    async (client) => asJson(labelsAnswer(ownLabelNames(await client.list()))),
    (error) => failure(sentenceFor(error, "this request")),
  );
}

/**
 * The messages a call names, as the mailbox holds them, for the approval card: who each is from and
 * what it is about, read here from the mailbox and never taken from a Bot's words. Read-only like
 * every read in this module.
 */
async function describeMessages(
  client: ImapClientLike,
  ids: readonly string[],
): Promise<OrganiseDetails> {
  const uids: number[] = [];
  for (const id of ids) {
    const uid = await uidOfId(client, id);
    if (uid !== null) uids.push(uid);
  }
  // A server answers in the mailbox's order whatever order a range names, so each is set against its
  // uid and listed in the order the call named them, as the REST connection does.
  const shown = new Map<number, OrganiseDetails["messages"][number]>();
  if (uids.length > 0) {
    for await (const message of client.fetch(
      uids.join(","),
      { uid: true, headers: ["From", "Subject"] },
      { uid: true },
    )) {
      const headers = parseHeaders(message.headers);
      shown.set(
        message.uid,
        shownMessage(
          shownHeader(headers, "From"),
          shownHeader(headers, "Subject"),
        ),
      );
    }
  }
  const messages = uids.flatMap((uid) => {
    const one = shown.get(uid);
    return one ? [one] : [];
  });
  return { messages, missing: ids.length - uids.length };
}

/** A call that changes a mailbox, on the connection made for it, which is closed when it is done. */
async function organise(
  deps: TransportDeps,
  preset: MailPreset,
  secret: UserSecret,
  call: Parameters<typeof organiseOverImap>[1],
): Promise<McpCallResult> {
  const client = deps.organiser(connectionOptions(preset, secret));
  // Set the moment a command that changes a thing is handed to the connection: from then on a failure
  // that is not Gmail's own refusal cannot say the change did not happen.
  const watch = watchForChanges(client);
  return withConnection(
    watch.client,
    (opened) => organiseOverImap(opened, call),
    (error) => {
      const kind = failureKind(error);
      return watch.sent() && (kind === "timeout" || kind === "unreachable")
        ? failure(MAY_HAVE_CHANGED)
        : failure(sentenceFor(error, "this change"));
    },
    ORGANISE_TIMEOUT_MS,
  );
}

/** The address inside `Name <address>`, or a bare address, lower-cased. */
function bareAddress(entry: string): string | null {
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(entry);
  const bare = /([^\s<>,;"']+@[^\s<>,;"']+)/.exec(entry);
  return (angled?.[1] ?? bare?.[1])?.toLowerCase() ?? null;
}

const REPLY_FIELDS = {
  uid: true,
  emailId: true,
  threadId: true,
  headers: [
    "Message-ID",
    "References",
    "In-Reply-To",
    "From",
    "Reply-To",
    "To",
    "Cc",
  ],
} as const satisfies FetchQuery;

/**
 * Every address on the message being answered, plus the person's own.
 *
 * A reply goes to people already on the conversation and to nobody else. The person's own address
 * is allowed because replying to everybody includes yourself on a message you wrote.
 */
function participantsOf(
  headers: readonly Header[] | undefined,
  own: string,
): Set<string> {
  const out = new Set<string>([own.toLowerCase()]);
  for (const name of ["From", "Reply-To", "To", "Cc"]) {
    const value = headers?.find(
      (header) => header.name?.toLowerCase() === name.toLowerCase(),
    )?.value;
    if (!value) continue;
    for (const part of value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const address = bareAddress(part);
      if (address) out.add(address);
    }
  }
  return out;
}

function listArg(value: unknown): string[] | "invalid" {
  if (value === undefined || value === null) return [];
  const items = typeof value === "string" ? [value] : value;
  if (!Array.isArray(items)) return "invalid";
  if (!items.every((item) => typeof item === "string")) return "invalid";
  return items.map((item: string) => item.trim()).filter(Boolean);
}

async function sendReply(
  deps: TransportDeps,
  preset: MailPreset,
  secret: UserSecret,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const text = (key: string): string | null => {
    const value = args[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };
  const threadId = text("threadId");
  const inReplyTo = text("inReplyTo");
  const subject = text("subject");
  const body = typeof args.body === "string" ? args.body : "";
  const to = listArg(args.to);
  const cc = listArg(args.cc);

  if (!threadId || !inReplyTo) {
    return failure(
      "A reply needs the thread id and the Gmail id of the message being answered.",
    );
  }
  if (to === "invalid" || cc === "invalid") {
    return failure("Recipients must be a list of addresses.");
  }
  if (to.length === 0) return failure("A reply needs at least one recipient.");
  if (!subject) return failure("A reply needs a subject.");
  if (body.trim() === "") return failure("A reply needs something to say.");
  // A line break in a recipient or the subject would end that header and start another.
  if ([...to, ...cc, subject].some((value) => HEADER_BREAK.test(value))) {
    return failure(
      "A recipient or the subject contains a line break, which would add a header nobody approved. The reply was not sent.",
    );
  }
  if (![...to, ...cc].every((address) => address.includes("@"))) {
    return failure("Every recipient needs an email address.");
  }

  /*
   * The message being answered, found in the mailbox and read for the ids that thread the reply.
   * Asked of the mailbox rather than taken as arguments, so a reply cannot be threaded under a
   * message that is not there, and so it can be checked to belong to the thread it is filed in.
   */
  const parent = await withMailbox(
    deps,
    preset,
    secret,
    async (client) => {
      let uid: number | null;
      if (RFC822_MESSAGE_ID.test(inReplyTo)) {
        const found = await client.search(
          { gmailraw: `rfc822msgid:${inReplyTo.replace(/^<|>$/g, "")}` },
          { uid: true },
        );
        uid = found && found.length > 0 ? (found[0] ?? null) : null;
        if (uid === null) {
          return failure(
            "No message in this mailbox has that Message-ID, so there is nothing to reply to. The reply was not sent.",
          );
        }
      } else {
        uid = await uidOfId(client, inReplyTo);
        if (uid === null) return failure(NOT_FOUND);
      }
      const message = await client.fetchOne(String(uid), REPLY_FIELDS, {
        uid: true,
      });
      if (!message) return failure(NOT_FOUND);
      return asJson({
        threadId: toHex(message.threadId),
        headers: parseHeaders(message.headers),
      });
    },
    "this request",
  );
  if (parent.isError) {
    return failure(
      parent.text.endsWith("The reply was not sent.")
        ? parent.text
        : `${parent.text} The reply was not sent.`,
    );
  }
  const found = JSON.parse(parent.text) as {
    threadId: string;
    headers: Header[];
  };

  if (found.threadId && found.threadId !== threadId.toLowerCase()) {
    return failure(
      `The message being answered is in thread ${found.threadId}, not ${threadId}. The reply was not sent.`,
    );
  }
  const parentMessageId = found.headers
    .find((header) => header.name?.toLowerCase() === "message-id")
    ?.value?.trim();
  if (!parentMessageId || HEADER_BREAK.test(parentMessageId)) {
    return failure(
      "The message being answered has no usable Message-ID, so a reply could not be threaded under it. The reply was not sent.",
    );
  }

  // Nobody joins a conversation through this tool.
  const allowed = participantsOf(found.headers, secret.address);
  const envelopeTo: string[] = [];
  for (const entry of [...to, ...cc]) {
    const address = bareAddress(entry);
    if (!address || !allowed.has(address)) {
      return failure(
        "A recipient is not on the message being answered. A reply goes only to people already on it, so it was not sent.",
      );
    }
    if (!envelopeTo.includes(address)) envelopeTo.push(address);
  }

  const chain = (
    found.headers.find((header) => header.name?.toLowerCase() === "references")
      ?.value ??
    found.headers.find((header) => header.name?.toLowerCase() === "in-reply-to")
      ?.value ??
    ""
  )
    .trim()
    .split(/\s+/)
    .filter((id) => id && !HEADER_BREAK.test(id));

  const smtp = deps.smtp({
    host: preset.smtp.host,
    port: preset.smtp.port,
    secure: preset.smtp.secure,
    user: secret.address,
    pass: secret.password,
  });
  try {
    const info = await smtp.sendMail({
      from: secret.address,
      to,
      cc,
      subject: /^re:/i.test(subject.trim())
        ? subject.trim()
        : `Re: ${subject.trim()}`,
      text: body,
      inReplyTo: parentMessageId,
      references: [...chain, parentMessageId],
      envelope: { from: secret.address, to: envelopeTo },
    });
    if (info.rejected && info.rejected.length > 0) {
      return failure(
        "Gmail refused at least one recipient. The reply went to the others.",
      );
    }
  } catch (error) {
    return failure(
      `${sentenceFor(error, "this reply")} The reply was not sent.`,
    );
  } finally {
    smtp.close();
  }
  // Gmail files the sent message on its own side; there is no id to read back over SMTP.
  return asJson({ sent: true, id: "", threadId });
}

/**
 * A new message: the arguments checked by the same function the REST adapter uses, then one SMTP
 * send from the connected account to exactly those addresses. The envelope is the list that was
 * validated and nothing is added to it, and the message has no Cc, no Bcc and no threading headers.
 */
async function sendMessage(
  deps: TransportDeps,
  preset: MailPreset,
  secret: UserSecret,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const parsed = parseNewMessage(args);
  if (!parsed.ok) return parsed.result;
  const smtp = deps.smtp({
    host: preset.smtp.host,
    port: preset.smtp.port,
    secure: preset.smtp.secure,
    user: secret.address,
    pass: secret.password,
  });
  try {
    const info = await smtp.sendMail({
      from: secret.address,
      to: parsed.to,
      cc: [],
      subject: parsed.subject,
      text: parsed.body,
      inReplyTo: "",
      references: [],
      envelope: { from: secret.address, to: parsed.to },
    });
    if (info.rejected && info.rejected.length > 0) {
      return failure(
        "Gmail refused at least one recipient. The email went to the others.",
      );
    }
  } catch (error) {
    return failure(
      `${sentenceFor(error, "this email")} The email was not sent.`,
    );
  } finally {
    smtp.close();
  }
  // Gmail files the sent message on its own side; there is no id to read back over SMTP.
  return asJson({ sent: true, id: "", threadId: "" });
}

/* ------------------------------------------------------------------------------------------------
 * The calendar.
 * ---------------------------------------------------------------------------------------------- */

type CachedCalendar = { link: string; at: number; parsed: ParsedCalendar };

async function listCalendarEvents(
  deps: TransportDeps,
  preset: MailPreset,
  secret: UserSecret,
  actorId: string,
  cache: Map<string, CachedCalendar>,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  if (!secret.calendarUrl) {
    return failure(
      "No calendar was connected. Add the calendar's secret address in iCal format on the Connections page.",
    );
  }
  const limit = countArg(args.maxResults);
  if (limit === "invalid") {
    return failure(`maxResults must be a number from 1 to ${MAX_RESULTS}.`);
  }
  const bound = (key: "timeMin" | "timeMax"): Date | null | "invalid" => {
    const value = args[key];
    if (typeof value !== "string" || value.trim() === "") return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed) : "invalid";
  };
  const givenMin = bound("timeMin");
  const givenMax = bound("timeMax");
  if (givenMin === "invalid" || givenMax === "invalid") {
    return failure("timeMin and timeMax must be ISO 8601 date-times.");
  }

  const now = deps.now().getTime();
  let cached = cache.get(actorId);
  if (
    !cached ||
    cached.link !== secret.calendarUrl ||
    now - cached.at > CALENDAR_CACHE_MS
  ) {
    const fetched = await fetchCalendarText(
      secret.calendarUrl,
      preset,
      deps.fetch,
    );
    if (!fetched.ok) return failure(fetched.message);
    let parsed: ParsedCalendar;
    try {
      parsed = parseCalendar(fetched.text);
    } catch {
      return failure(
        "That address did not return a calendar this app can read.",
      );
    }
    cached = { link: secret.calendarUrl, at: now, parsed };
    if (cache.size >= CALENDAR_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.delete(actorId);
    cache.set(actorId, cached);
  }

  const timeMin = givenMin ?? deps.now();
  let timeMax = givenMax;
  let zone: { timeZone: string; note?: string } | null = null;
  const calendarZone = cached.parsed.timeZone;
  if (timeMax === null) {
    if (calendarZone) {
      zone = { timeZone: calendarZone };
      timeMax = endOfDayIn(timeMin, calendarZone);
    } else {
      zone = {
        timeZone: "UTC",
        note: `Your calendar's time zone could not be read, so today was taken to end at midnight UTC. ${cached.parsed.zoneNote ?? ""}`.trim(),
      };
      timeMax = endOfDayIn(timeMin, "UTC");
    }
  }
  if (timeMax.getTime() <= timeMin.getTime()) {
    return failure("timeMax must be later than timeMin.");
  }

  return asJson({
    ...zone,
    events: listEvents(
      cached.parsed,
      { timeMin, timeMax },
      limit,
      calendarZone ?? "UTC",
    ),
  });
}

/* ------------------------------------------------------------------------------------------------
 * The transport, and what checks a secret before it is stored.
 * ---------------------------------------------------------------------------------------------- */

export type GoogleImapTransport = {
  listNeedsCredential: false;
  listTools: () => Promise<McpTool[]>;
  /** What the approval card shows about a call that names messages; see {@link describeMessages}. */
  describeCall: (
    connection: {
      url: string;
      token?: string;
      tokenHeader?: string;
      actorId?: string;
      botId?: string;
    },
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<OrganiseDetails | undefined>;
  callTool: (
    connection: {
      url: string;
      token?: string;
      tokenHeader?: string;
      actorId?: string;
      botId?: string;
    },
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<McpCallResult>;
};

export function createGoogleImapTransport(
  overrides: Partial<TransportDeps> = {},
): GoogleImapTransport {
  const deps: TransportDeps = { ...realDeps, ...overrides };
  const preset = mailPreset("gmail");
  // Per person, for a minute: a brief asks the calendar once and a conversation may ask again.
  const calendars = new Map<string, CachedCalendar>();

  return {
    listNeedsCredential,
    listTools,
    async describeCall(connection, toolName, args) {
      if (!connection.actorId || !isOrganiseMessageTool(toolName)) return;
      const parsed = parseOrganiseCall(toolName, args);
      if (!parsed.ok || !("ids" in parsed.value)) return;
      const secret = parseSecret(connection.token);
      if (!secret) return;
      const ids = parsed.value.ids;
      return withConnection(
        deps.imap(connectionOptions(preset, secret)),
        async (client) => {
          await openAllMail(client);
          return describeMessages(client, ids);
        },
        // Not being able to read them is not a failure of the call: the card says so instead.
        () => undefined,
      );
    },
    async callTool(connection, toolName, args) {
      /*
       * The token is the person's own secret, decrypted by the store for this call and for nothing
       * else. A call with nobody attributed is refused here as a last line, as the store refuses it
       * first: a mailbox is somebody's.
       */
      const actorId = connection.actorId;
      if (!actorId) {
        return failure(
          "Gmail answers as the person asking, and this run is not attributed to anybody.",
        );
      }
      const secret = parseSecret(connection.token);
      if (!secret) {
        return failure(
          "Your Gmail connection could not be read. Connect it again on the Connections page.",
        );
      }

      if (isOrganiseTool(toolName)) {
        // Read once, before any connection is made: a call that cannot be carried out costs none.
        const parsed = parseOrganiseCall(toolName, args);
        if (!parsed.ok) return failure(parsed.message);
        if (parsed.value.tool === LIST_LABELS) {
          return listLabels(deps, preset, secret);
        }
        return organise(deps, preset, secret, parsed.value);
      }
      if (toolName === "gmail_search_messages") {
        const search = searchArgsOf(args);
        if (!search.ok) return search.result;
        return withConnection(
          deps.imap(connectionOptions(preset, secret)),
          async (client) => {
            const refused = await openForSearch(client, search.query);
            if (refused) return refused;
            return searchMessages(client, search, () => deps.now().getTime());
          },
          (error) => failure(sentenceFor(error, "this search")),
        );
      }
      if (toolName === "gmail_read_message") {
        return withMailbox(
          deps,
          preset,
          secret,
          (client) => readMessage(client, args),
          "this request",
        );
      }
      if (toolName === "gmail_send_reply") {
        return sendReply(deps, preset, secret, args);
      }
      if (toolName === "gmail_send_message") {
        return sendMessage(deps, preset, secret, args);
      }
      if (toolName === "calendar_list_events") {
        return listCalendarEvents(
          deps,
          preset,
          secret,
          actorId,
          calendars,
          args,
        );
      }
      return failure(
        `${toolName} is not a tool this connector implements. The stored tool list is out of date; refresh it on the Plugins page.`,
      );
    },
  };
}

const shared = createGoogleImapTransport();

/** The module is the transport, as the registry reads it. */
export const callTool = shared.callTool;
export const describeCall = shared.describeCall;

/**
 * Whether a pasted secret works, before anything is stored.
 *
 * One IMAP login, and one fetch of the calendar when a link was given. Answers with fixed sentences
 * only. Nothing is written anywhere.
 */
export function createSecretVerifier(
  overrides: Partial<TransportDeps> = {},
): VerifyUserSecret {
  const deps: TransportDeps = { ...realDeps, ...overrides };
  return async (preset, secret): Promise<VerifyOutcome> => {
    const client = deps.imap({
      host: preset.imap.host,
      port: preset.imap.port,
      secure: preset.imap.secure,
      user: secret.address,
      pass: secret.password,
    });
    client.on("error", () => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError()), CALL_TIMEOUT_MS);
    });
    const login = client.connect();
    login.catch(() => {});
    try {
      await Promise.race([login, deadline]);
    } catch (error) {
      const kind = failureKind(error);
      return {
        ok: false,
        status: kind === "login" ? 422 : 502,
        message:
          kind === "login"
            ? "Gmail did not accept that address and app password. Check that 2-Step Verification is on, and paste the app password, not your usual password."
            : kind === "timeout"
              ? "Gmail did not answer in time, so nothing was saved. Try again."
              : "Couldn't reach Gmail to check it, so nothing was saved. Try again.",
      };
    } finally {
      clearTimeout(timer);
      try {
        await Promise.race([
          client.logout(),
          new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
        ]);
      } catch {
        client.close();
      }
    }

    if (!secret.calendarUrl) return { ok: true, calendar: false };
    const fetched = await fetchCalendarText(
      secret.calendarUrl,
      preset,
      deps.fetch,
    );
    if (!fetched.ok) {
      return {
        ok: false,
        status: 422,
        message: `${fetched.message} Nothing was saved.`,
      };
    }
    try {
      parseCalendar(fetched.text);
    } catch {
      return {
        ok: false,
        status: 422,
        message:
          "That address did not return a calendar this app can read. Nothing was saved.",
      };
    }
    return { ok: true, calendar: true };
  };
}

/** The verifier a deployment uses: the real Gmail. */
export const verifyUserSecret: VerifyUserSecret = createSecretVerifier();
