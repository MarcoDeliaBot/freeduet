import type { McpCallResult } from "../../src/plugins/mcp";

/**
 * A Gmail mailbox in memory that answers the tools the mail-rule job uses, in the shape the two real
 * transports answer them (`gmail_search_messages` with from, to, cc, subject, date, snippet, labels and
 * the passed headers). Every call is written down, so a test can read what the job did to the vendor and
 * what it never asked for. Every value is invented.
 */
export type RuleMessage = {
  id: string;
  from: string;
  to?: string[];
  cc?: string[];
  subject: string;
  listId?: string;
  /** When it arrived, in ms. The search's `after:` and `before:` and the `date` field read it. */
  arrivedAt: number;
  /** The Date header, when it differs from the arrival (a sender's clock). */
  dateHeader?: number;
  snippet?: string;
  inbox: boolean;
  read: boolean;
  labels: string[];
  where: "inbox" | "spam" | "bin" | "archive";
};

export type VendorCall = {
  name: string;
  args: Record<string, unknown>;
  actorId: string | undefined;
  botId: string | undefined;
};

export class FakeRuleMailbox {
  messages: RuleMessage[] = [];
  userLabels: string[] = [];
  calls: VendorCall[] = [];
  /** A tool name whose next answers are errors with this text. */
  failing = new Map<string, string>();
  private counter = 0;

  add(
    over: Partial<RuleMessage> & { from: string; subject: string },
  ): RuleMessage {
    this.counter += 1;
    const message: RuleMessage = {
      id: (0x1000 + this.counter).toString(16),
      arrivedAt: Date.now() + 60_000,
      inbox: true,
      read: false,
      labels: [],
      where: "inbox",
      ...over,
    };
    this.messages.push(message);
    return message;
  }

  named(name: string) {
    return this.calls.filter((call) => call.name === name);
  }

  /** What was asked of the mailbox that changes it. */
  changes() {
    return this.calls.filter(
      (call) =>
        call.name !== "gmail_search_messages" &&
        call.name !== "gmail_list_labels",
    );
  }

  call = async (
    connection: { actorId?: string; botId?: string },
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpCallResult> => {
    this.calls.push({
      name,
      args,
      actorId: connection.actorId,
      botId: connection.botId,
    });
    const failure = this.failing.get(name);
    if (failure) return { text: failure, isError: true, truncated: false };
    const json = (value: unknown): McpCallResult => ({
      text: JSON.stringify(value),
      isError: false,
      truncated: false,
    });
    const refuse = (text: string): McpCallResult => ({
      text,
      isError: true,
      truncated: false,
    });

    if (name === "gmail_search_messages") {
      const query = String(args.query ?? "");
      const after = /after:(\d+)/.exec(query)?.[1];
      const before = /before:(\d+)/.exec(query)?.[1];
      const limit = Number(args.maxResults ?? 25);
      const found = this.messages
        .filter((m) => m.where === "inbox")
        .filter((m) => (after ? m.arrivedAt > Number(after) * 1000 : true))
        .filter((m) => (before ? m.arrivedAt < Number(before) * 1000 : true))
        .sort((a, b) => b.arrivedAt - a.arrivedAt)
        .slice(0, limit);
      return json({
        messages: found.map((m) => ({
          id: m.id,
          threadId: m.id,
          from: m.from,
          to: m.to ?? [],
          cc: m.cc ?? [],
          subject: m.subject,
          date: new Date(m.dateHeader ?? m.arrivedAt).toISOString(),
          snippet: m.snippet ?? "",
          labels: ["INBOX"],
          headers: m.listId ? { "List-Id": m.listId } : {},
        })),
        resultSizeEstimate: found.length,
      });
    }
    if (name === "gmail_list_labels")
      return json({
        labels: [...this.userLabels],
        alsoAllowed: ["STARRED", "IMPORTANT"],
      });
    if (name === "gmail_create_label") {
      const label = String(args.name);
      if (this.userLabels.includes(label))
        return json({ label, created: false });
      this.userLabels.push(label);
      return json({ label, created: true });
    }
    const ids = (args.messageIds as string[] | undefined) ?? [];
    if (ids.length === 0 || ids.length > 100)
      return refuse("Between 1 and 100 messages. Nothing was changed.");
    const picked = ids.map((id) => this.messages.find((m) => m.id === id));
    if (picked.some((m) => !m))
      return refuse(
        "Some named messages are not in this mailbox. Nothing was changed.",
      );
    const all = picked as RuleMessage[];
    if (name === "gmail_label_messages") {
      for (const m of all)
        for (const label of args.addLabels as string[])
          if (!m.labels.includes(label)) m.labels.push(label);
      return json({ labeled: all.length });
    }
    if (name === "gmail_archive_messages") {
      for (const m of all) if (m.where === "inbox") m.where = "archive";
      return json({ archived: all.length });
    }
    if (name === "gmail_mark_messages") {
      for (const m of all) m.read = args.state === "read";
      return json({ marked: all.length });
    }
    if (name === "gmail_spam_messages") {
      for (const m of all) m.where = "spam";
      return json({ spammed: all.length });
    }
    if (name === "gmail_bin_messages") {
      for (const m of all) m.where = "bin";
      return json({ binned: all.length });
    }
    return refuse(`${name} is not a tool this mailbox implements.`);
  };
}
