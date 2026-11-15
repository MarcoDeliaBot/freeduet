import { cutAtCodeUnits } from "../channels/text";
import type { McpTool } from "./mcp";

/**
 * Organising a mailbox: labels, archive, read and unread. What both Gmail connections share.
 *
 * Two ways in reach one mailbox, an app password over IMAP ({@link ./google-imap}) and Google sign-in
 * over REST ({@link ./google-workspace-rest}), and a Bot is told the same thing whichever the person
 * used: the same five tools, the same arguments, the same refusals. This module is the one place
 * those are written, and it touches no network and no mailbox. Everything here is a pure function of
 * what a Bot handed in, so the approval gate can ask about a call and the transports can carry it out
 * from one reading of the arguments (docs/design/mail-organise.md).
 *
 * WHAT A BOT MAY DO, AND WHAT IT MAY NOT. It may list the labels, create one, add or remove labels on
 * messages it names, archive messages (take them out of the Inbox, where they stay in All Mail with
 * their labels) and mark them read or unread. There is no tool here that deletes, trashes, reports as
 * spam, forwards, makes a filter, moves a message into some other folder or acts on "everything a
 * search matches": messages are named by id, so the card the person answers can say how many and
 * which. The labels that would delete or hide mail (Trash and Spam) are refused in both directions,
 * and so is every other system label, because each of those has a tool of its own or none.
 *
 * EVERY REFUSAL IS A SENTENCE WRITTEN HERE. None quotes what was handed in: a label name, an id or
 * an extra field may have come from a mail the Bot read, and an error is read back into its model.
 * Nothing is trimmed into shape or corrected; a call that is not right is refused whole, before any
 * connection is made and before anybody is asked.
 */

export const LIST_LABELS = "gmail_list_labels";
export const CREATE_LABEL = "gmail_create_label";
export const LABEL_MESSAGES = "gmail_label_messages";
export const ARCHIVE_MESSAGES = "gmail_archive_messages";
export const MARK_MESSAGES = "gmail_mark_messages";

/** The one tool that only reads. It is granted like any other read. */
export const ORGANISE_READ_TOOLS: readonly string[] = Object.freeze([
  LIST_LABELS,
]);

/**
 * The four that change a mailbox. Each asks the person, as every write does, and none is a send:
 * they are not in the catalogue's `sendTools`, so the approval gate treats them as writes and nothing
 * more (and nothing less: not pre-approved, not covered by the person's typed-address rule for a new
 * email, not granted by the inbox's no-name approve).
 */
export const ORGANISE_WRITE_TOOLS: readonly string[] = Object.freeze([
  CREATE_LABEL,
  LABEL_MESSAGES,
  ARCHIVE_MESSAGES,
  MARK_MESSAGES,
]);

/** The three that act on messages the Bot names, and so have a list the card can show. */
export const ORGANISE_MESSAGE_TOOLS: readonly string[] = Object.freeze([
  LABEL_MESSAGES,
  ARCHIVE_MESSAGES,
  MARK_MESSAGES,
]);

export const isOrganiseTool = (name: string): boolean =>
  ORGANISE_READ_TOOLS.includes(name) || ORGANISE_WRITE_TOOLS.includes(name);

/** Whether the call changes a mailbox and so is asked about. */
export const isOrganiseWrite = (name: string): boolean =>
  ORGANISE_WRITE_TOOLS.includes(name);

/** Whether the call names messages, so the person can be shown which. */
export const isOrganiseMessageTool = (name: string): boolean =>
  ORGANISE_MESSAGE_TOOLS.includes(name);

/** Messages one call may name. A card a person can read is the reason, not Gmail's own limit. */
export const MAX_ORGANISE_MESSAGES = 100;
/** Gmail's own limit on a label's name. */
export const LABEL_NAME_MAX_CHARS = 100;
/** Labels one call may add, and the same for those it removes. */
export const MAX_LABELS_PER_CALL = 5;

/** A Gmail message id as a search returned it: hex, as the REST API spells it. */
const MESSAGE_ID = /^[0-9a-f]{1,16}$/i;

/**
 * Anything invisible or control in a name: control characters, the line and paragraph separators, and
 * every format character (the bidirectional marks and overrides among them, the zero-width ones, the
 * byte order mark). Such a name looks like another one, or reads backwards.
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
/** Characters a mailbox path cannot carry safely: a backslash, a quote and the two wildcards. */
const PATH_UNSAFE = /[\\"*%]/;

/**
 * Gmail's own labels, by the names a Bot might write for them. The REST API calls them by these
 * identifiers, and IMAP by a backslash and a word; both spellings are matched here without the
 * backslash.
 *
 * `HIDES` are the ones that delete or hide mail. They are refused in both directions, whoever asks.
 * `ALLOWED_SYSTEM` are the two a person marks mail with on purpose and that hide nothing.
 */
const HIDES = new Set(["TRASH", "SPAM", "JUNK"]);
const ALLOWED_SYSTEM = new Set(["STARRED", "IMPORTANT"]);
const OTHER_SYSTEM = new Set([
  "INBOX",
  "SENT",
  "DRAFT",
  "DRAFTS",
  "UNREAD",
  "CHAT",
  "ALL MAIL",
  "CATEGORY_PERSONAL",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
]);

export const ORGANISE_REFUSALS = {
  extra:
    "This tool takes only the fields it names: messages are listed by id, and nothing can be done to everything a search matches. Nothing was changed.",
  noIds:
    "Name the messages by their Gmail ids, as a search returned them. Nothing was changed.",
  badIds:
    "Every message id must be a Gmail id as a search returned it (letters a to f and digits). Nothing was changed.",
  tooManyIds: `At most ${MAX_ORGANISE_MESSAGES} messages can be named in one call. Split them into smaller calls. Nothing was changed.`,
  labelName: `A label name is one line of 1 to ${LABEL_NAME_MAX_CHARS} characters, with no control, invisible or direction-changing character, none of the characters \\ " * %, and no empty part between slashes. Nothing was changed.`,
  reservedName:
    "That name is one of Gmail's own labels or a folder of its own, so it cannot be created. Nothing was changed.",
  hidesMail:
    "Labels that delete or hide mail, Trash and Spam, cannot be added or removed with this tool. Nothing was changed.",
  systemLabel:
    "That is one of Gmail's own labels, which this tool does not change. To take messages out of the Inbox use gmail_archive_messages, and for read and unread use gmail_mark_messages. Nothing was changed.",
  noLabels: "Say which labels to add or remove, by name. Nothing was changed.",
  tooManyLabels: `At most ${MAX_LABELS_PER_CALL} labels can be added, and as many removed, in one call. Nothing was changed.`,
  sameLabel:
    "A label cannot be added and removed in the same call. Nothing was changed.",
  state: 'state must be "read" or "unread". Nothing was changed.',
  noName: "A label needs a name. Nothing was changed.",
} as const;

/**
 * An argument a Bot left empty says nothing, and is the same as leaving it out. The same rule
 * {@link ./google-workspace-rest}'s new-email arguments follow.
 */
const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

export type OrganiseCall =
  | { tool: typeof LIST_LABELS }
  | { tool: typeof CREATE_LABEL; name: string }
  | {
      tool: typeof LABEL_MESSAGES;
      ids: string[];
      add: LabelRef[];
      remove: LabelRef[];
    }
  | { tool: typeof ARCHIVE_MESSAGES; ids: string[] }
  | { tool: typeof MARK_MESSAGES; ids: string[]; state: "read" | "unread" };

/** A call that changes a mailbox: every call but the listing of labels. */
export type OrganiseWriteCall = Exclude<
  OrganiseCall,
  { tool: typeof LIST_LABELS }
>;

/** A label as a call names it: one of the two system labels, or one of the person's own by name. */
export type LabelRef =
  | { kind: "system"; id: "STARRED" | "IMPORTANT" }
  | { kind: "user"; name: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const refuse = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

/** The name of a label of the person's own, or the sentence refusing it. */
export function parseLabelName(value: unknown): Parsed<string> {
  if (value === undefined || value === null) {
    return refuse(ORGANISE_REFUSALS.noName);
  }
  if (typeof value !== "string") return refuse(ORGANISE_REFUSALS.labelName);
  const name = value.trim();
  if (name === "") return refuse(ORGANISE_REFUSALS.noName);
  if (
    name.length > LABEL_NAME_MAX_CHARS ||
    INVISIBLE.test(name) ||
    PATH_UNSAFE.test(name) ||
    name.split("/").some((part) => part.trim() === "")
  ) {
    return refuse(ORGANISE_REFUSALS.labelName);
  }
  const word = name.toUpperCase();
  if (
    HIDES.has(word) ||
    ALLOWED_SYSTEM.has(word) ||
    OTHER_SYSTEM.has(word) ||
    word.startsWith("[GMAIL]") ||
    word.startsWith("[GOOGLE MAIL]")
  ) {
    return refuse(ORGANISE_REFUSALS.reservedName);
  }
  return { ok: true, value: name };
}

/**
 * A label named in a call to add or remove it. Trash and Spam are refused in either spelling, the
 * other system labels as well, and the two a person marks mail with on purpose are allowed.
 */
export function parseLabelRef(value: unknown): Parsed<LabelRef> {
  if (typeof value !== "string") return refuse(ORGANISE_REFUSALS.labelName);
  const text = value.trim();
  // IMAP spells a system label with a backslash, `\Trash`; one is dropped before the name is read.
  const word = (text.startsWith("\\") ? text.slice(1) : text)
    .trim()
    .toUpperCase();
  if (HIDES.has(word)) return refuse(ORGANISE_REFUSALS.hidesMail);
  if (ALLOWED_SYSTEM.has(word)) {
    return { ok: true, value: { kind: "system", id: word as "STARRED" } };
  }
  if (OTHER_SYSTEM.has(word) || word.startsWith("[GMAIL]")) {
    return refuse(ORGANISE_REFUSALS.systemLabel);
  }
  const name = parseLabelName(text);
  if (!name.ok) return name;
  return { ok: true, value: { kind: "user", name: name.value } };
}

/** Message ids, once each and in the order given: 1 to 100 hex ids, or the sentence refusing them. */
export function parseMessageIds(value: unknown): Parsed<string[]> {
  if (isEmpty(value)) return refuse(ORGANISE_REFUSALS.noIds);
  const items = typeof value === "string" ? [value] : value;
  if (!Array.isArray(items)) return refuse(ORGANISE_REFUSALS.noIds);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !MESSAGE_ID.test(item.trim())) {
      return refuse(ORGANISE_REFUSALS.badIds);
    }
    const id = item.trim().toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > MAX_ORGANISE_MESSAGES) {
    return refuse(ORGANISE_REFUSALS.tooManyIds);
  }
  return { ok: true, value: ids };
}

function labelRefs(value: unknown): Parsed<LabelRef[]> {
  if (isEmpty(value)) return { ok: true, value: [] };
  const items = typeof value === "string" ? [value] : value;
  if (!Array.isArray(items)) return refuse(ORGANISE_REFUSALS.labelName);
  if (items.length > MAX_LABELS_PER_CALL) {
    return refuse(ORGANISE_REFUSALS.tooManyLabels);
  }
  const refs: LabelRef[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const ref = parseLabelRef(item);
    if (!ref.ok) return ref;
    const key =
      ref.value.kind === "system"
        ? `s:${ref.value.id}`
        : `u:${ref.value.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref.value);
  }
  return { ok: true, value: refs };
}

const FIELDS: Record<string, ReadonlySet<string>> = {
  [LIST_LABELS]: new Set(),
  [CREATE_LABEL]: new Set(["name"]),
  [LABEL_MESSAGES]: new Set(["messageIds", "addLabels", "removeLabels"]),
  [ARCHIVE_MESSAGES]: new Set(["messageIds"]),
  [MARK_MESSAGES]: new Set(["messageIds", "state"]),
};

const sameLabel = (a: LabelRef, b: LabelRef) =>
  a.kind === "system"
    ? b.kind === "system" && a.id === b.id
    : b.kind === "user" && a.name.toLowerCase() === b.name.toLowerCase();

/**
 * One call to an organising tool, read once, or the sentence refusing it.
 *
 * Both transports call this before they connect, and the call path calls it before the approval gate
 * is asked, so nobody is asked about a call that could not be carried out and a refusal costs no
 * connection. A field the tool does not have is refused rather than ignored: what the person is
 * shown is what is done.
 */
export function parseOrganiseCall(
  tool: string,
  args: Record<string, unknown>,
): Parsed<OrganiseCall> {
  const fields = Object.hasOwn(FIELDS, tool) ? FIELDS[tool] : undefined;
  if (!fields) return refuse(ORGANISE_REFUSALS.extra);
  if (tool === LIST_LABELS) return { ok: true, value: { tool: LIST_LABELS } };
  for (const [key, value] of Object.entries(args)) {
    if (!fields.has(key) && !isEmpty(value)) {
      return refuse(ORGANISE_REFUSALS.extra);
    }
  }

  if (tool === CREATE_LABEL) {
    const name = parseLabelName(args.name);
    if (!name.ok) return name;
    return { ok: true, value: { tool: CREATE_LABEL, name: name.value } };
  }

  const ids = parseMessageIds(args.messageIds);
  if (!ids.ok) return ids;

  if (tool === ARCHIVE_MESSAGES) {
    return { ok: true, value: { tool: ARCHIVE_MESSAGES, ids: ids.value } };
  }

  if (tool === MARK_MESSAGES) {
    const state = typeof args.state === "string" ? args.state.trim() : "";
    if (state !== "read" && state !== "unread") {
      return refuse(ORGANISE_REFUSALS.state);
    }
    return {
      ok: true,
      value: { tool: MARK_MESSAGES, ids: ids.value, state },
    };
  }

  const add = labelRefs(args.addLabels);
  if (!add.ok) return add;
  const remove = labelRefs(args.removeLabels);
  if (!remove.ok) return remove;
  if (add.value.length === 0 && remove.value.length === 0) {
    return refuse(ORGANISE_REFUSALS.noLabels);
  }
  if (add.value.some((a) => remove.value.some((r) => sameLabel(a, r)))) {
    return refuse(ORGANISE_REFUSALS.sameLabel);
  }
  return {
    ok: true,
    value: {
      tool: LABEL_MESSAGES,
      ids: ids.value,
      add: add.value,
      remove: remove.value,
    },
  };
}

/**
 * The sentence refusing a call that cannot be carried out, or null. For the call path, which asks
 * nobody about a call that is refused here.
 */
export function organiseRefusal(
  tool: string,
  args: Record<string, unknown>,
): string | null {
  if (!isOrganiseTool(tool)) return null;
  const parsed = parseOrganiseCall(tool, args);
  return parsed.ok ? null : parsed.message;
}

/* ------------------------------------------------------------------------------------------------
 * What the person is shown: the messages as the SERVER read them.
 * ---------------------------------------------------------------------------------------------- */

const SHOWN_FROM_MAX = 120;
const SHOWN_SUBJECT_MAX = 200;

/**
 * One message as the approval card lists it. Read from the mailbox by the server, never taken from
 * what a Bot said about the id: a model asked to describe ten messages could describe others.
 */
export type OrganisedMessage = { from: string; subject: string };

/**
 * What the server found when it looked the named messages up, for the card.
 *
 * `missing` counts ids the mailbox does not hold. A call with any missing id is refused whole when
 * it runs, so what is done is never fewer messages than the card said.
 */
export type OrganiseDetails = {
  messages: OrganisedMessage[];
  missing: number;
};

/** Text from a mail, for a card: no invisible or direction-changing character, one line, cut. */
export function shownText(value: string | undefined, max: number): string {
  const text = (value ?? "")
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : `${cutAtCodeUnits(text, max - 1)}…`;
}

export const shownMessage = (
  from: string | undefined,
  subject: string | undefined,
): OrganisedMessage => ({
  from: shownText(from, SHOWN_FROM_MAX),
  subject: shownText(subject, SHOWN_SUBJECT_MAX),
});

/* ------------------------------------------------------------------------------------------------
 * The answers, written once so both connections say the same thing in the same shape.
 * ---------------------------------------------------------------------------------------------- */

/** Where every message lives, when the account's own name for it cannot be read. */
export const ALL_MAIL_FALLBACK = "[Gmail]/All Mail";

/** A folder as an IMAP listing returns it. */
export type ListedFolder = {
  path: string;
  specialUse?: string | undefined;
  /**
   * How the library decided `specialUse`: "extension" is the server saying so, "name" is the library
   * guessing from the folder's name. Absent for a client that reports only what the server said.
   */
  specialUseSource?: string | undefined;
};

/**
 * The person's own labels among the folders an IMAP listing returns: not the Inbox, not a folder the
 * SERVER marked with a special use (All Mail, Sent, Trash and the rest), and nothing under Gmail's own
 * `[Gmail]` prefix.
 *
 * A special use the library only GUESSED from a name does not count: a person's label called
 * "Archive", "Sent" or "Drafts" is a label of theirs, and would be hidden from them if it did.
 */
export function ownLabelNames(folders: readonly ListedFolder[]): string[] {
  return folders
    .filter(
      (folder) =>
        !(folder.specialUse && folder.specialUseSource !== "name") &&
        folder.path.toUpperCase() !== "INBOX" &&
        !/^\[(gmail|google mail)\]/i.test(folder.path),
    )
    .map((folder) => folder.path);
}

/** What a label call says when the label is not there, for a Bot to act on. */
export const noSuchLabel =
  "No label with that name exists. List the labels with gmail_list_labels, or create it with gmail_create_label first. Nothing was changed.";

/** What a call says when some of the named messages are gone: it is refused whole. */
export const missingMessages = (missing: number, total: number): string =>
  `${missing} of the ${total} named messages are not in this mailbox, so nothing was changed. They may have been deleted, or the ids are not ones a search returned.`;

/** The person's own labels, by name, and the two of Gmail's own that may be added. */
export const labelsAnswer = (names: readonly string[]) => ({
  labels: [...names].sort((a, b) => a.localeCompare(b)),
  alsoAllowed: ["STARRED", "IMPORTANT"],
});

/** Creating a label that is already there is a success, and the answer says so. */
export const createdAnswer = (name: string, created: boolean) =>
  created
    ? { label: name, created: true }
    : {
        label: name,
        created: false,
        note: "A label with this name already exists, so nothing was changed.",
      };

export const labeledAnswer = (
  messages: number,
  added: readonly string[],
  removed: readonly string[],
) => ({ labeled: messages, added: [...added], removed: [...removed] });

export const archivedAnswer = (
  archived: number,
  alreadyOutOfInbox: number,
) => ({
  archived,
  alreadyOutOfInbox,
});

export const markedAnswer = (messages: number, state: "read" | "unread") => ({
  marked: messages,
  as: state,
});

/* ------------------------------------------------------------------------------------------------
 * The tools, as a Bot is told about them.
 * ---------------------------------------------------------------------------------------------- */

const ASKS =
  "It changes the mailbox, so the person is asked first and shown how many messages and which.";

export const ORGANISE_TOOL_DEFINITIONS: readonly McpTool[] = Object.freeze([
  {
    name: LIST_LABELS,
    description:
      "List the labels in your Gmail: your own labels by name, and Gmail's own. Use it to see what exists before you create or apply one. Returns JSON.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: CREATE_LABEL,
    description: `Create a Gmail label. A name with a slash, such as "Clients/Acme", is a label inside another. If the label already exists nothing changes and the answer says so. ${ASKS}`,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          maxLength: LABEL_NAME_MAX_CHARS,
          description: `The new label's name, one line of at most ${LABEL_NAME_MAX_CHARS} characters.`,
        },
      },
      required: ["name"],
    },
  },
  {
    name: LABEL_MESSAGES,
    description: `Add labels to, or remove labels from, messages you name by id. Labels are the person's own existing labels by name (create one first with ${CREATE_LABEL}), or STARRED and IMPORTANT. It cannot delete anything, and Trash and Spam are refused. At most ${MAX_ORGANISE_MESSAGES} messages per call, named by the ids a search or a read returned; there is no way to act on everything a search matches. ${ASKS}`,
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_ORGANISE_MESSAGES,
          description: "The messages' Gmail ids, as a search returned them.",
        },
        addLabels: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_LABELS_PER_CALL,
          description: "Labels to add, by name.",
        },
        removeLabels: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_LABELS_PER_CALL,
          description: "Labels to remove, by name.",
        },
      },
      required: ["messageIds"],
    },
  },
  {
    name: ARCHIVE_MESSAGES,
    description: `Archive messages: take them out of the Inbox. They stay in All Mail with their labels, and nothing is deleted. Name them by id, at most ${MAX_ORGANISE_MESSAGES} per call. ${ASKS}`,
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_ORGANISE_MESSAGES,
          description: "The messages' Gmail ids, as a search returned them.",
        },
      },
      required: ["messageIds"],
    },
  },
  {
    name: MARK_MESSAGES,
    description: `Mark messages read or unread. Name them by id, at most ${MAX_ORGANISE_MESSAGES} per call. ${ASKS}`,
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_ORGANISE_MESSAGES,
          description: "The messages' Gmail ids, as a search returned them.",
        },
        state: {
          type: "string",
          enum: ["read", "unread"],
          description: "What to mark them as.",
        },
      },
      required: ["messageIds", "state"],
    },
  },
]);
