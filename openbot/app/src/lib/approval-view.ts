import {
  type ApprovalTextId,
  type ApprovalTextValues,
  approvalText,
} from "@openbot/shared/approval-text";
import type { ApprovalRequest } from "./approvals";

/**
 * D50: the MESSAGES on an approval card (its title, what happens, the rule in words) are drawn in the
 * language the person reads, from the shared catalogue (shared/approval-text.ts). Labels and buttons are
 * the app's own words and stay English. `language` is a two-letter code; null, undefined and a language
 * with no table read English, which is what these functions drew before.
 */
export type ApprovalLanguage = string | null | undefined;
const say = (
  language: ApprovalLanguage,
  id: ApprovalTextId,
  values?: ApprovalTextValues,
) => approvalText(id, language, values);

/**
 * How an approval request reads on a card: a title in plain words, the app it is for, the fields a
 * person checks before saying yes (To, Subject), and the body. Built only from what the request
 * carries; anything it cannot place stays in the card's details.
 */
export type ApprovalView = {
  title: string;
  app: string | null;
  kind: "mail" | "browser" | "command" | "other";
  fields: { label: string; value: string }[];
  body: string | null;
};

const RECIPIENT =
  /^(to|recipients?|recipient_?emails?|to_?emails?|to_?address(es)?|email_?to|send_?to)$/i;
const SUBJECT = /^(subject|title)$/i;
const BODY = /^(body|text|message|content|message_?body|html|plain_?text)$/i;
/** Plumbing the person cannot act on: the Bot's own page references and ids. */
const HIDDEN =
  /^(ref|snapshot_?id|element_?ref|id|thread_?id|tool_?call_?id)$/i;
const MAX_FIELDS = 4;

const words = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

const sentence = (parts: string[]) => {
  const text = parts.join(" ");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};

const display = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string")
  )
    return value.join(", ");
  return null;
};

/** The ref the server's private-share check asks under (server/src/proactive/private-share.ts). */
const PRIVATE_SHARE = "openbot/share_private_information";

/** Apps a send can name as `<server id>: <recipients>`, in the words a person knows them by. */
const SENDING_APPS: Record<
  string,
  { app: string; kind: ApprovalView["kind"] }
> = {
  "google-workspace": { app: "Gmail", kind: "mail" },
  // The same Gmail, connected with an app password instead of OAuth.
  "google-imap": { app: "Gmail", kind: "mail" },
  gmail: { app: "Gmail", kind: "mail" },
};

/**
 * A send to other people, as the private-share check asks about it.
 *
 * The check asks before the send itself, so its request carries the audience as `<server id>:
 * <recipients>` and the message in the parts its recipient sees: `to`, `cc`, `bcc`, `subject` and
 * the whole `body` (server/src/proactive/private-share.ts). Read as the message it is: the app, who
 * it goes to, the subject on its own line and the body under it. The content digest is how the
 * server matches a later send to this answer; it means nothing to the person and is left out.
 *
 * A request asked before the parts existed has only the audience and a `preview`, which was the
 * body's first 280 characters with the subject glued on; it is read the old way rather than not at
 * all, since it is already decided.
 */
function describeShare(
  args: Record<string, unknown>,
  language: ApprovalLanguage,
): ApprovalView {
  const audience = display(args.audience) ?? "";
  const split = audience.indexOf(": ");
  const server = split > 0 ? audience.slice(0, split) : "";
  const known = SENDING_APPS[server];
  const to =
    display(args.to) ?? (split > 0 ? audience.slice(split + 2) : audience);
  const fields: ApprovalView["fields"] = [];
  if (to) fields.push({ label: "To", value: to });
  for (const [key, label] of [
    ["cc", "Cc"],
    ["bcc", "Bcc"],
    ["subject", "Subject"],
  ] as const) {
    const value = display(args[key]);
    if (value) fields.push({ label, value });
  }
  return {
    title: say(
      language,
      known?.kind === "mail" ? "view.sendEmail" : "view.sendMessage",
    ),
    app: known?.app ?? (server ? sentence(words(server)) : null),
    kind: known?.kind ?? "other",
    fields,
    // Untrimmed: what is shown is what goes, to the last line break.
    body:
      typeof args.body === "string" && args.body.trim()
        ? args.body
        : display(args.preview),
  };
}

/** The two Gmail connections' tools that organise a mailbox (server/src/plugins/mail-organise.ts). */
const ORGANISE_TOOL =
  /^(?:google-imap|google-workspace)\/(gmail_create_label|gmail_label_messages|gmail_archive_messages|gmail_mark_messages|gmail_bin_messages|gmail_spam_messages|gmail_create_rule|gmail_disable_rule)$/;

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : typeof value === "string" && value.trim()
      ? [value.trim()]
      : [];

const flag = (value: unknown) => value === true;
const quote = (value: unknown) =>
  typeof value === "string" ? `\u201c${value}\u201d` : "";

/**
 * A standing rule, in the words the person reads: "From now on, mail from X: label Y and archive." Drawn
 * from the arguments, which the server checked against the rule's own reading before it asked.
 */
function describeRule(
  args: Record<string, unknown>,
  base: { app: string; kind: "mail" },
  language: ApprovalLanguage,
): ApprovalView {
  const and = say(language, "join.and");
  const when: string[] = [];
  if (typeof args.fromAddress === "string")
    when.push(
      say(language, "rule.when.fromAddress", { value: args.fromAddress }),
    );
  if (typeof args.fromDomain === "string")
    when.push(
      say(language, "rule.when.fromDomain", { value: args.fromDomain }),
    );
  if (typeof args.toAddress === "string")
    when.push(say(language, "rule.when.toAddress", { value: args.toAddress }));
  if (typeof args.listId === "string")
    when.push(say(language, "rule.when.listId", { value: quote(args.listId) }));
  if (typeof args.subjectContains === "string")
    when.push(
      say(language, "rule.when.subjectContains", {
        value: quote(args.subjectContains),
      }),
    );
  if (typeof args.words === "string")
    when.push(say(language, "rule.when.words", { value: quote(args.words) }));
  const labels = names(args.addLabels);
  const does = [
    ...(labels.length > 0
      ? [
          say(language, "rule.does.label", {
            names: labels.map((n) => quote(n)).join(", "),
          }),
        ]
      : []),
    ...(flag(args.markRead) ? [say(language, "rule.does.markRead")] : []),
    ...(flag(args.archive) ? [say(language, "rule.does.archive")] : []),
    ...(flag(args.spam) ? [say(language, "rule.does.spam")] : []),
    ...(flag(args.bin) ? [say(language, "rule.does.bin")] : []),
  ];
  const done =
    does.length <= 1
      ? (does[0] ?? say(language, "rule.does.nothing"))
      : `${does.slice(0, -1).join(", ")}${and}${does.at(-1)}`;
  const sentence = say(language, "rule.sentence", {
    when: when.join(and),
    done,
  });
  return {
    ...base,
    title: say(language, "rule.title"),
    fields: [
      { label: "The rule", value: sentence },
      {
        label: "What happens",
        value:
          say(language, "rule.happens") +
          (flag(args.applyToExisting)
            ? say(language, "rule.happens.existing")
            : ""),
      },
    ],
    body: null,
  };
}

/**
 * A call that labels, archives, bins or marks mail, or creates a label, in plain words and with the
 * messages it touches.
 *
 * The count and the list come from what the SERVER read in the mailbox when it opened the request
 * (`action.details`), never from the ids the Bot sent: a Bot asked to describe ten messages could
 * describe others. When the server could not read them, the card says so and shows only how many the
 * Bot named. What the call does is said once, in words, because a person who answers "Archive 12
 * messages" should not have to know what archiving does to a message.
 */
function describeOrganise(
  request: Pick<ApprovalRequest, "action">,
  language: ApprovalLanguage,
): ApprovalView | null {
  const tool = ORGANISE_TOOL.exec(request.action.toolRef)?.[1];
  if (!tool) return null;
  const args =
    request.action.args &&
    typeof request.action.args === "object" &&
    !Array.isArray(request.action.args)
      ? (request.action.args as Record<string, unknown>)
      : {};
  const base = { app: "Gmail", kind: "mail" as const };

  if (tool === "gmail_create_rule") return describeRule(args, base, language);
  if (tool === "gmail_disable_rule") {
    const change =
      args.change === "delete"
        ? "delete"
        : args.change === "enable"
          ? "enable"
          : "disable";
    return {
      ...base,
      title: say(language, `rule.${change}.title`),
      fields: [
        {
          label: "What happens",
          value: say(language, `rule.${change}.happens`),
        },
      ],
      body: null,
    };
  }
  if (tool === "gmail_create_label") {
    const [name] = names(args.name);
    return {
      ...base,
      title: name
        ? say(language, "label.title.named", { name: `\u201c${name}\u201d` })
        : say(language, "label.title"),
      fields: [
        {
          label: "What happens",
          value: say(language, "label.happens"),
        },
      ],
      body: null,
    };
  }

  const details = request.action.details;
  const named = names(args.messageIds);
  const total = details
    ? details.messages.length + details.missing
    : new Set(named.map((id) => id.toLowerCase())).size;

  const fields: ApprovalView["fields"] = [];
  let title: string;
  const happens = (id: ApprovalTextId) =>
    fields.push({
      label: "What happens",
      value: say(language, id),
    });
  if (tool === "gmail_archive_messages") {
    title = say(language, "archive.title", { count: total });
    happens("archive.happens");
  } else if (tool === "gmail_spam_messages") {
    title = say(language, "spam.title", { count: total });
    happens("spam.happens");
  } else if (tool === "gmail_bin_messages") {
    title = say(language, "bin.title", { count: total });
    happens("bin.happens");
  } else if (tool === "gmail_mark_messages") {
    title = say(
      language,
      args.state === "unread" ? "mark.unread.title" : "mark.read.title",
      { count: total },
    );
    happens("mark.happens");
  } else {
    const add = names(args.addLabels);
    const remove = names(args.removeLabels);
    const values = (list: string[]) => ({
      count: total,
      name: `\u201c${list[0]}\u201d`,
      labels: list.length,
    });
    title =
      add.length > 0 && remove.length === 0
        ? say(
            language,
            add.length === 1 ? "labels.add.one.title" : "labels.add.many.title",
            values(add),
          )
        : remove.length > 0 && add.length === 0
          ? say(
              language,
              remove.length === 1
                ? "labels.remove.one.title"
                : "labels.remove.many.title",
              values(remove),
            )
          : say(language, "labels.change.title", { count: total });
    if (add.length > 0)
      fields.push({
        label: "Add",
        value: add.join(", "),
      });
    if (remove.length > 0)
      fields.push({
        label: "Remove",
        value: remove.join(", "),
      });
    happens("labels.happens");
  }

  if (!details) {
    fields.push({
      label: "Messages",
      value: say(language, "messages.unreadable", { count: total }),
    });
  } else if (details.missing > 0) {
    fields.push({
      label: "Not found",
      value: say(language, "notFound.text", {
        count: details.missing,
        total,
      }),
    });
  }

  const body = details?.messages.length
    ? details.messages
        .map(
          (m) =>
            `${m.from || "Unknown sender"}: ${m.subject || "(no subject)"}`,
        )
        .join("\n")
    : null;
  return { ...base, title, fields, body };
}

/**
 * Where an action happens, as a person reads it. The scope is the server's matching key, and for a
 * send to other people it carries the share check's `external:` marker, which is plumbing.
 */
export function approvalPlace(
  request: Pick<ApprovalRequest, "action">,
): string {
  return request.action.scope.replace(/^external:/, "");
}

/** Whether the person was asked about this request, rather than a saved rule deciding it. */
export function personWasAsked(
  request: Pick<ApprovalRequest, "action">,
): boolean {
  return (
    Boolean(request.action.policy) || request.action.toolRef === PRIVATE_SHARE
  );
}

export function describeApproval(
  request: Pick<ApprovalRequest, "action">,
  language?: ApprovalLanguage,
): ApprovalView {
  const { toolRef, args } = request.action;
  if (
    toolRef === PRIVATE_SHARE &&
    args &&
    typeof args === "object" &&
    !Array.isArray(args)
  )
    return describeShare(args as Record<string, unknown>, language);
  const organise = describeOrganise(request, language);
  if (organise) return organise;
  const segments = toolRef.split("/").filter(Boolean);
  const name = segments.at(-1) ?? toolRef;
  const prefix = segments.length > 1 ? segments[0] : null;
  const app =
    prefix && !["host", "bot", "computer"].includes(prefix.toLowerCase())
      ? sentence(words(prefix))
      : null;
  let parts = words(name.replace(/^computer_/, ""));
  // "gmail/GMAIL_SEND_EMAIL" reads "Send email", with Gmail as the app.
  if (prefix && parts[0] === prefix.toLowerCase() && parts.length > 1)
    parts = parts.slice(1);

  const kind: ApprovalView["kind"] = /^computer_/.test(name)
    ? "browser"
    : prefix === "host"
      ? "command"
      : /mail|message|send|reply/i.test(toolRef)
        ? "mail"
        : "other";

  const fields: ApprovalView["fields"] = [];
  let body: string | null = null;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const entries = Object.entries(args as Record<string, unknown>);
    const pick = (pattern: RegExp, label: string) => {
      for (const [key, value] of entries) {
        if (!pattern.test(key)) continue;
        const shown = display(value);
        if (shown) fields.push({ label, value: shown });
        return;
      }
    };
    pick(RECIPIENT, "To");
    pick(/^cc$/i, "Cc");
    pick(/^bcc$/i, "Bcc");
    pick(SUBJECT, "Subject");
    for (const [key, value] of entries) {
      if (!BODY.test(key)) continue;
      body = display(value);
      if (body) break;
    }
    for (const [key, value] of entries) {
      if (fields.length >= MAX_FIELDS) break;
      if ([RECIPIENT, SUBJECT, BODY, HIDDEN].some((test) => test.test(key)))
        continue;
      if (/^b?cc$/i.test(key)) continue;
      const shown = display(value);
      if (shown) fields.push({ label: sentence(words(key)), value: shown });
    }
  }

  return { title: sentence(parts) || toolRef, app, kind, fields, body };
}

/** Who decided, in the person's words, for the line under a decided card. */
export function decisionReceipt(
  request: Pick<ApprovalRequest, "decision">,
): string | null {
  switch (request.decision) {
    case "allow_once":
      return "Allowed once by you";
    case "allow_always":
      return "Always allowed";
    case "deny":
      return "Refused by you";
    case "handled":
      return "You did it yourself";
    default:
      return null;
  }
}

/** How the action ended, as the pill on a decided card shows it. Nothing while it waits. */
export function approvalOutcome(
  request: Pick<ApprovalRequest, "status" | "result" | "action">,
): { label: string; tone: "green" | "red" | "amber" | "blue" } | null {
  switch (request.status) {
    case "completed":
      if (request.result?.error) return { label: "Didn't work", tone: "amber" };
      return {
        label:
          describeApproval(request).kind === "mail" &&
          /send|reply/i.test(request.action.toolRef)
            ? "Sent"
            : "Done",
        tone: "green",
      };
    case "denied":
      return { label: "Refused", tone: "red" };
    case "approved":
    case "consumed":
      return { label: "Allowed", tone: "blue" };
    default:
      return null;
  }
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/** "2:59 PM" today, "Oct 20" before that: the stamp on a card or a row. */
export function clockTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toDateString() === now.toDateString()
    ? timeFormat.format(at)
    : dayFormat.format(at);
}
