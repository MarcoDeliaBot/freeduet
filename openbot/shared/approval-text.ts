/**
 * What a person reads in order to approve or refuse, in the person's language (docs/M1_PLAN.md D50): the MESSAGES on an approval card, never the app's own chrome (buttons, labels and headings stay English).
 *
 * One catalogue for the server and the app: the fixed sentences on an approval card (its title, "what
 * happens", the reason it asks, the buttons) are keyed by id and filled with parameters. English is
 * the source and is complete; every other language of the public site (`approval-text-<code>.ts`: de es fr it ja ko pl pt ru tr zh) is complete too (the type says so).
 *
 * ADDING A LANGUAGE is filling one file: copy `approval-text-it.ts` to `approval-text-<code>.ts`,
 * translate the values, and add one line to `TABLES` below. A table may be PARTIAL (`Partial`): a key
 * it lacks, and a language with no table at all, read English. Nothing here ever returns an empty
 * string: an empty value in a table counts as missing.
 *
 * WHAT THE CATALOGUE IS NOT FOR. The audit trail and the text a MODEL reads as a tool's answer stay
 * English (they must stay comparable between people, and a model reads one language). The English
 * form of a sentence that is both shown on a card and kept for audit is `approvalText(id, "en")`, so
 * the two cannot drift apart. Product and tool names are never translated.
 *
 * `{name}` is filled from the values passed. A plural entry also needs `count`, and picks its form
 * with the language's own rules (`Intl.PluralRules`).
 */
import { APPROVAL_TEXT_DE } from "./approval-text-de";
import { APPROVAL_TEXT_ES } from "./approval-text-es";
import { APPROVAL_TEXT_FR } from "./approval-text-fr";
import { APPROVAL_TEXT_IT } from "./approval-text-it";
import { APPROVAL_TEXT_JA } from "./approval-text-ja";
import { APPROVAL_TEXT_KO } from "./approval-text-ko";
import { APPROVAL_TEXT_PL } from "./approval-text-pl";
import { APPROVAL_TEXT_PT } from "./approval-text-pt";
import { APPROVAL_TEXT_RU } from "./approval-text-ru";
import { APPROVAL_TEXT_TR } from "./approval-text-tr";
import { APPROVAL_TEXT_ZH } from "./approval-text-zh";

export type Plural = {
  one: string;
  other: string;
  zero?: string;
  two?: string;
  few?: string;
  many?: string;
};
export type Entry = string | Plural;

const EN = {
  "view.sendEmail": "Send email",
  "view.sendMessage": "Send a message",
  "rule.title": "Create a mail rule",
  "rule.sentence": "From now on, mail {when}: {done}.",
  "rule.when.fromAddress": "from {value}",
  "rule.when.fromDomain": "from the domain {value}",
  "rule.when.toAddress": "sent to {value}",
  "rule.when.listId": "from the list {value}",
  "rule.when.subjectContains": "with {value} in the subject",
  "rule.when.words": "with the words {value} in the subject or sender",
  "rule.does.label": "label {names}",
  "rule.does.markRead": "mark read",
  "rule.does.archive": "archive",
  "rule.does.spam": "move to Spam",
  "rule.does.bin": "move to the Bin",
  "rule.does.nothing": "do nothing",
  "join.and": " and ",
  "rule.happens":
    "FreeDuet applies it to new mail every few minutes, without asking again, until you switch it off. It is not a Gmail filter. It never forwards, replies or deletes for good.",
  "rule.happens.existing":
    " It is also applied once to the matching mail already in your Inbox.",
  "rule.delete.title": "Delete a mail rule",
  "rule.enable.title": "Switch on a mail rule",
  "rule.disable.title": "Switch off a mail rule",
  "rule.delete.happens":
    "The rule is removed and stops applying to new mail. Mail it already moved stays where it is.",
  "rule.enable.happens":
    "The rule applies again, to mail that arrives from now on.",
  "rule.disable.happens":
    "The rule stops applying to new mail. Mail it already moved stays where it is.",
  // Changes to a mailbox
  "label.title.named": "Create the label {name}",
  "label.title": "Create a label",
  "label.happens":
    "A new, empty label is added to your Gmail. No message is changed.",
  "archive.title": {
    one: "Archive {count} message",
    other: "Archive {count} messages",
  },
  "archive.happens":
    "They leave the Inbox and stay in All Mail, with their labels. Nothing is deleted.",
  "spam.title": {
    one: "Move {count} message to Spam",
    other: "Move {count} messages to Spam",
  },
  "spam.happens":
    "They go to your Spam folder. Gmail deletes mail in Spam after about 30 days; until then you can move it back.",
  "bin.title": {
    one: "Move {count} message to the Bin",
    other: "Move {count} messages to the Bin",
  },
  "bin.happens":
    "They go to your Bin and stay there for about 30 days. You can restore them from it. After that Gmail deletes them for good.",
  "mark.read.title": {
    one: "Mark {count} message as read",
    other: "Mark {count} messages as read",
  },
  "mark.unread.title": {
    one: "Mark {count} message as unread",
    other: "Mark {count} messages as unread",
  },
  "mark.happens": "Only whether they show as read changes. Nothing is deleted.",
  "labels.add.one.title": {
    one: "Add the label {name} to {count} message",
    other: "Add the label {name} to {count} messages",
  },
  "labels.add.many.title": {
    one: "Add {labels} labels to {count} message",
    other: "Add {labels} labels to {count} messages",
  },
  "labels.remove.one.title": {
    one: "Remove the label {name} from {count} message",
    other: "Remove the label {name} from {count} messages",
  },
  "labels.remove.many.title": {
    one: "Remove {labels} labels from {count} message",
    other: "Remove {labels} labels from {count} messages",
  },
  "labels.change.title": {
    one: "Change the labels on {count} message",
    other: "Change the labels on {count} messages",
  },
  "labels.happens":
    "Labels are added or taken off. No message is moved or deleted.",
  "messages.unreadable": {
    one: "Your mailbox could not be read just now, so who they are from and what they are about is not shown. {count} message named.",
    other:
      "Your mailbox could not be read just now, so who they are from and what they are about is not shown. {count} messages named.",
  },
  "notFound.text": {
    one: "{count} message of the {total} named is not in your mailbox, so this will be refused as it stands.",
    other:
      "{count} messages of the {total} named are not in your mailbox, so this will be refused as it stands.",
  },
  // Why a card asks. Every `reason.*` is also the English text the server stores and audits.
  "reason.credentials":
    "Changing a password, passcode, two-factor setting, recovery code or other credential is always done by the person.",
  "reason.securitySettings":
    "Changing security, sharing or access settings on an account is always done by the person.",
  "reason.payments":
    "Paying, purchasing or moving money is always done by the person.",
  "reason.reviewer.credentials":
    "The reviewer found this changes a password, passcode, two-factor setting or other credential, which is always done by the person.",
  "reason.reviewer.securitySettings":
    "The reviewer found this changes security, sharing or access settings, which is always done by the person.",
  "reason.reviewer.payments":
    "The reviewer found this pays, purchases or moves money, which is always done by the person.",
  "reason.fullAccess": "Full access is on for this member.",
  "reason.fullAccessNoPayments":
    "Full access without payments is on for this member.",
  "reason.ruleHandsOff": "A rule hands this kind of action to the person.",
  "reason.ruleAsks": "A rule asks before this kind of action.",
  "reason.ruleAllows": "A rule allows this kind of action.",
  "reason.preApprovedMet":
    "The person asked for this exact action in this run.",
  "reason.preApprovedNotMet":
    "A rule allows this only when the person asked for it, and this run's request did not.",
  "reason.askBeforeChanges": "You asked to review changes before they happen.",
  "reason.noRule": "No rule or preference asks about this.",
  "reason.mailboxNotAsked":
    "You did not ask for this change to your mailbox in your own message, so it asks you first.",
  "reason.unattended":
    "This came from a routine or a trigger running on its own, not from a message you sent, so it always asks you first.",
  "reason.automation":
    "Routines and triggers act later without you, so setting one up, changing it or deleting it always asks you first.",
  "reason.setting":
    "A Bot changing one of your settings from chat always asks you first, with Full access on or off.",
  "reason.remoteWrite":
    "You sent this from a browser that is not paired with the computer FreeDuet runs on, so it always asks you first, whatever Full access or your saved rules say. A browser paired at the computer works as before.",
  "reason.newEmail":
    "A new email is asked about every time. Check who it goes to and what it says, then allow this one or refuse it.",
  "reason.reviewerNone":
    "No reviewer model is configured, so this needs approval.",
  "reason.reviewerInvalid": "The reviewer's answer was not a valid verdict.",
  "reason.reviewerUnreachable":
    "The reviewer could not be reached ({error}), so this needs approval.",
  "remote.answerSentence":
    "A browser that is not paired with the computer FreeDuet runs on can allow an ordinary request once or deny it. This one is answered at the computer, where you can read it in full. It is still waiting there.",
} as const satisfies Record<string, Entry>;

export type ApprovalTextId = keyof typeof EN;
export type ApprovalTextTable = Partial<Record<ApprovalTextId, Entry>>;
/** A complete table: every id, a string where English has a string and a plural where English has one. */
export type CompleteApprovalTextTable = {
  [K in ApprovalTextId]: (typeof EN)[K] extends string ? string : Plural;
};
export type ApprovalTextValues = Readonly<Record<string, string | number>>;

/** The languages that have a table. English is the source and needs none. */
const TABLES: Readonly<Record<string, ApprovalTextTable>> = {
  de: APPROVAL_TEXT_DE,
  es: APPROVAL_TEXT_ES,
  fr: APPROVAL_TEXT_FR,
  it: APPROVAL_TEXT_IT,
  ja: APPROVAL_TEXT_JA,
  ko: APPROVAL_TEXT_KO,
  pl: APPROVAL_TEXT_PL,
  pt: APPROVAL_TEXT_PT,
  ru: APPROVAL_TEXT_RU,
  tr: APPROVAL_TEXT_TR,
  zh: APPROVAL_TEXT_ZH,
};

/** The two-letter code in `language` (`it`, `it-IT`, `IT`), or null. */
export function approvalLanguageCode(
  language: string | null | undefined,
): string | null {
  const code = language?.trim().slice(0, 2).toLowerCase();
  return code && /^[a-z]{2}$/.test(code) ? code : null;
}

/** Whether a language other than English has a table here. */
export function hasApprovalText(language: string | null | undefined): boolean {
  const code = approvalLanguageCode(language);
  return code !== null && code !== "en" && code in TABLES;
}

function usable(entry: Entry | undefined): entry is Entry {
  if (entry === undefined) return false;
  return typeof entry === "string"
    ? entry.length > 0
    : typeof entry.other === "string" && entry.other.length > 0;
}

function pick(
  entry: Entry,
  language: string,
  values: ApprovalTextValues,
): string {
  if (typeof entry === "string") return entry;
  const count = Number(values.count);
  const category = Number.isFinite(count)
    ? new Intl.PluralRules(language).select(count)
    : "other";
  const form = entry[category];
  return typeof form === "string" && form.length > 0 ? form : entry.other;
}

function fill(template: string, values: ApprovalTextValues): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}

/**
 * One fixed sentence in `language`: the table's when it has the id, English otherwise. A language with
 * no table, null and undefined read English, which is today's text exactly.
 */
export function approvalText(
  id: ApprovalTextId,
  language: string | null | undefined,
  values: ApprovalTextValues = {},
): string {
  const code = approvalLanguageCode(language);
  const table = code && code !== "en" ? TABLES[code] : undefined;
  const entry = table?.[id];
  if (usable(entry)) return fill(pick(entry, code as string, values), values);
  return fill(pick(EN[id], "en", values), values);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const REASON_PATTERNS = (Object.keys(EN) as ApprovalTextId[])
  .filter((id) => id.startsWith("reason.") && typeof EN[id] === "string")
  .map((id) => ({
    id,
    pattern: new RegExp(
      `^${(EN[id] as string)
        .split(/\{\w+\}/)
        .map(escape)
        .join("([\\s\\S]+)")}$`,
    ),
    names: [...(EN[id] as string).matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
  }));

/**
 * The card's stored reason, in `language`. A reason the server stored is English; when it is one of the
 * fixed ones above it is shown in the person's language, and any other text (a reason the reviewer
 * wrote, one stored by older code that no longer matches) is shown as it was stored. A card stored
 * before this existed therefore still renders, and the stored text is never changed.
 */
export function localizedReason(
  stored: string,
  language: string | null | undefined,
): string {
  if (!hasApprovalText(language)) return stored;
  for (const { id, pattern, names } of REASON_PATTERNS) {
    const match = pattern.exec(stored);
    if (!match) continue;
    const values: Record<string, string> = {};
    names.forEach((name, index) => {
      values[name] = match[index + 1] ?? "";
    });
    return approvalText(id, language, values);
  }
  return stored;
}

/** Every id and its English form, for tests and tooling. */
export const APPROVAL_TEXT_IDS = Object.keys(EN) as ApprovalTextId[];
export const APPROVAL_TEXT_EN: CompleteApprovalTextTable = EN;
