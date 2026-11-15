import { asJson, failure } from "./google-workspace-rest";
import {
  allMailPath,
  ARCHIVE_MESSAGES,
  archivedAnswer,
  CREATE_LABEL,
  createdAnswer,
  LABEL_MESSAGES,
  type LabelRef,
  labeledAnswer,
  MARK_MESSAGES,
  markedAnswer,
  missingMessages,
  noSuchLabel,
  type OrganiseWriteCall,
  ownLabelNames,
} from "./mail-organise";
import type { McpCallResult } from "./mcp";

/**
 * Organising a mailbox over IMAP: the only module that changes one.
 *
 * {@link ./google-imap} reads a mailbox and sends mail, and nothing in it can change a mailbox: its
 * client type has no method that could, and a test reads its source to keep it so. Labels, archive and
 * read-or-unread need a mailbox opened for writing, and that lives here and nowhere else, behind
 * `ImapOrganiserLike`, which is exactly the seven methods these four operations use and no more.
 *
 * WHAT IS SENT, ALL OF IT. A label is created with `CREATE`. A label is added or removed with `UID
 * STORE` on `X-GM-LABELS`, which is how Gmail's own IMAP adds and removes a label without moving a
 * message. Archive removes the Inbox label the same way: the message stays in All Mail, with its
 * other labels. Read and unread add and remove the `\Seen` flag. That is the whole list. No message
 * is ever removed, moved or copied, nothing is expunged, no message is flagged for removal, and the
 * Trash and Spam labels are never an operand: the arguments are refused for naming them before a
 * connection is made ({@link ./mail-organise}), and `operand` below refuses any other system label
 * that might get through, a second time and in the place the command is built. `google-imap-organise-wire.test`
 * runs these operations through the real client against a server that records every command line.
 *
 * ALL OF THE NAMED MESSAGES OR NONE. Each id is looked up first, and one that is not in the mailbox
 * refuses the call whole, so what is changed is never fewer messages than the person was shown. The
 * mailbox is opened for writing once the labels are known and the call is not already refused, and
 * only for the length of the one call: the connection is closed when it is done, however it ended.
 */

/**
 * The same client, and a flag that is set the moment a command that changes a thing is handed to it.
 * From then on a timeout or a dropped connection cannot say the change did not happen, and the answer
 * says so. It lives here because this module is the only one that names those methods.
 */
export function watchForChanges<C extends ImapOrganiserLike>(
  client: C,
): { client: C; sent: () => boolean } {
  let sent = false;
  const changing: ReadonlySet<string | symbol> = new Set([
    "mailboxCreate",
    "messageFlagsAdd",
    "messageFlagsRemove",
  ]);
  const watched = new Proxy(client, {
    get(target, property) {
      const member = Reflect.get(target, property) as unknown;
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => {
        if (changing.has(property)) sent = true;
        return (member as (...rest: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { client: watched, sent: () => sent };
}

/** The narrow client: what the four operations ask of a connection, and nothing else. */
export interface ImapOrganiserLike {
  list(): Promise<
    {
      path: string;
      specialUse?: string | undefined;
      specialUseSource?: string | undefined;
    }[]
  >;
  /** The one open for writing, and the literal says so: a read-only open does not type-check here. */
  mailboxOpen(path: string, options: { readOnly: false }): Promise<unknown>;
  mailboxCreate(
    path: string,
  ): Promise<{ path?: string; created?: boolean } | undefined>;
  search(
    query: { emailId: string },
    options: { uid: true },
  ): Promise<number[] | false>;
  fetch(
    range: string,
    query: { uid: true; labels: true },
    options: { uid: true },
  ): AsyncIterable<{ uid: number; labels?: Set<string> | undefined }>;
  messageFlagsAdd(
    range: string,
    flags: string[],
    options: { uid: true; useLabels?: true },
  ): Promise<boolean>;
  messageFlagsRemove(
    range: string,
    flags: string[],
    options: { uid: true; useLabels?: true },
  ): Promise<boolean>;
}

/** Gmail's spelling, over IMAP, of the labels a call may name. */
const SYSTEM = { STARRED: "\\Starred", IMPORTANT: "\\Important" } as const;
const INBOX = "\\Inbox";
const SEEN = "\\Seen";

/** The system labels and flags a store may carry. Any other that starts with a backslash is refused. */
const SYSTEM_OPERANDS = new Set(
  [INBOX, SEEN, SYSTEM.STARRED, SYSTEM.IMPORTANT].map((label) =>
    label.toLowerCase(),
  ),
);

const NOT_MADE = "Gmail did not make this change.";
/** A label call that adds and removes is two commands: the second can fail after the first was made. */
const PART_MADE =
  "Gmail made only part of this change: the labels were added, but the others were not removed. Look at the messages before trying again.";

/**
 * A label or flag as it goes into a store, or an error. The arguments were refused for naming a
 * system label that deletes or hides mail before this is reached; this is the same rule held where
 * the command is built, so a refusal that regressed upstream still cannot put one on the wire.
 */
function operand(label: string): string {
  if (label.startsWith("\\") && !SYSTEM_OPERANDS.has(label.toLowerCase())) {
    throw new Error("A system label other than the four this module sets.");
  }
  return label;
}

const decimalOf = (id: string) => BigInt(`0x${id}`).toString(10);

/** The uid of each named message, in order, and how many are not in the mailbox. */
async function uidsOf(
  client: ImapOrganiserLike,
  ids: readonly string[],
): Promise<{ uids: number[]; missing: number }> {
  const uids: number[] = [];
  for (const id of ids) {
    const found = await client.search(
      { emailId: decimalOf(id) },
      { uid: true },
    );
    const uid = found && found.length > 0 ? found[0] : undefined;
    if (uid !== undefined) uids.push(uid);
  }
  return { uids, missing: ids.length - uids.length };
}

/** The labels a call names, as this account spells them, or null when one of them is not there. */
function spelled(
  refs: readonly LabelRef[],
  own: readonly string[],
): { labels: string[]; names: string[] } | null {
  const labels: string[] = [];
  const names: string[] = [];
  for (const ref of refs) {
    if (ref.kind === "system") {
      labels.push(SYSTEM[ref.id]);
      names.push(ref.id);
      continue;
    }
    const path = own.find(
      (name) => name.toLowerCase() === ref.name.toLowerCase(),
    );
    if (path === undefined) return null;
    labels.push(path);
    names.push(path);
  }
  return { labels, names };
}

export async function organiseOverImap(
  client: ImapOrganiserLike,
  call: OrganiseWriteCall,
): Promise<McpCallResult> {
  const folders = await client.list();
  const own = ownLabelNames(folders);

  if (call.tool === CREATE_LABEL) {
    const there = own.find(
      (name) => name.toLowerCase() === call.name.toLowerCase(),
    );
    if (there !== undefined) return asJson(createdAnswer(there, false));
    const made = await client.mailboxCreate(call.name);
    return asJson(createdAnswer(call.name, made?.created !== false));
  }

  // What changes is settled first, so a label that is not there is refused before a mailbox is opened.
  let add: string[] = [];
  let remove: string[] = [];
  let addedNames: string[] = [];
  let removedNames: string[] = [];
  if (call.tool === LABEL_MESSAGES) {
    const adding = spelled(call.add, own);
    const removing = spelled(call.remove, own);
    if (!adding || !removing) return failure(noSuchLabel);
    add = adding.labels;
    addedNames = adding.names;
    remove = removing.labels;
    removedNames = removing.names;
  } else if (call.tool === ARCHIVE_MESSAGES) {
    remove = [INBOX];
  } else if (call.state === "read") {
    add = [SEEN];
  } else {
    remove = [SEEN];
  }
  const asLabels = call.tool !== MARK_MESSAGES;
  // The guard on what may be stored runs for every operand before anything is sent or opened, so one
  // that is refused refuses the whole call and not the second half of it.
  const addOperands = add.map(operand);
  const removeOperands = remove.map(operand);

  // Found by the server's own flag, as for a read: a label whose NAME looks like All Mail is not it,
  // and the one folder a change is made in must be the one that holds every message.
  await client.mailboxOpen(allMailPath(folders), { readOnly: false });

  const found = await uidsOf(client, call.ids);
  if (found.missing > 0) {
    return failure(missingMessages(found.missing, call.ids.length));
  }
  const range = found.uids.join(",");

  let inInbox = 0;
  if (call.tool === ARCHIVE_MESSAGES) {
    for await (const message of client.fetch(
      range,
      { uid: true, labels: true },
      { uid: true },
    )) {
      if (
        [...(message.labels ?? [])].some(
          (label) => label.toLowerCase() === INBOX.toLowerCase(),
        )
      ) {
        inInbox++;
      }
    }
  }

  const how = asLabels
    ? { uid: true as const, useLabels: true as const }
    : { uid: true as const };
  if (addOperands.length > 0) {
    if (!(await client.messageFlagsAdd(range, addOperands, how))) {
      return failure(NOT_MADE);
    }
  }
  if (removeOperands.length > 0) {
    // After an add that was made, a removal that fails is not "nothing was changed".
    const madeSome = addOperands.length > 0;
    let removed = false;
    try {
      removed = await client.messageFlagsRemove(range, removeOperands, how);
    } catch (error) {
      if (!madeSome) throw error;
      return failure(PART_MADE);
    }
    if (!removed) return failure(madeSome ? PART_MADE : NOT_MADE);
  }

  if (call.tool === LABEL_MESSAGES) {
    return asJson(labeledAnswer(call.ids.length, addedNames, removedNames));
  }
  if (call.tool === ARCHIVE_MESSAGES) {
    return asJson(archivedAnswer(inInbox, call.ids.length - inInbox));
  }
  return asJson(markedAnswer(call.ids.length, call.state));
}
