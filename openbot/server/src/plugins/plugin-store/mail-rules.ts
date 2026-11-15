import { withoutStatement } from "../../db/query-failure";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  type AuditInitiator,
  DEPLOYMENT_INITIATOR,
  recordAuditEvent,
} from "../../audit";
import { mailRuleApplied, mailRules } from "../../db/schema";
import { tokenHeaderFor } from "../catalogue";
import { cutAtCodeUnits } from "../../channels/text";
import {
  ARCHIVE_MESSAGES,
  BIN_MESSAGES,
  CREATE_LABEL,
  LABEL_MESSAGES,
  LIST_LABELS,
  MARK_MESSAGES,
  MAX_ORGANISE_MESSAGES,
  SPAM_MESSAGES,
} from "../mail-organise";
import {
  CREATE_RULE,
  DISABLE_RULE,
  LIST_RULES,
  MAX_RULES_PER_MAILBOX,
  parseRuleChange,
  parseRuleSpec,
  RULE_REFUSALS,
  type RuleMessage,
  type RuleSpec,
  ruleInWords,
  ruleMatches,
  type StoredRule,
} from "../mail-rules";
import { transportFor } from "../transport";
import type { StoreContext } from "./context";
import { effectiveUrl, PluginRefusedError } from "./model";

/**
 * Mail rules, kept and applied by FreeDuet (docs/design/mail-rules.md, D46).
 *
 * TWO DOORS, ONE LIST. A rule is CREATED, SWITCHED and DELETED through `handleRuleTool`, which the call
 * path reaches only AFTER the mailbox gate (`mailboxChange` in approvals/policy.ts) let the call
 * through: a card, or the person's own typed order read by the reviewer. A rule is APPLIED by
 * `runMailRules`, a timer with no model in it. Because the person ordered the rule through the gate, an
 * application does not ask again. This is an explicit, bounded exception to "routines always ask" (D35):
 * it is not a member's routine, no model reads a message or chooses an action, and the job can call
 * ONLY the tools in {@link JOB_TOOLS}, which cannot send, forward, reply or delete for good.
 */

/** The only calls the job may make to a mailbox. Nothing here sends mail or deletes it for good. */
export const JOB_TOOLS: readonly string[] = Object.freeze([
  "gmail_search_messages",
  LIST_LABELS,
  CREATE_LABEL,
  LABEL_MESSAGES,
  ARCHIVE_MESSAGES,
  MARK_MESSAGES,
  SPAM_MESSAGES,
  BIN_MESSAGES,
]);

/** The name the job's calls carry where a Bot's id would be. It is no member and holds no grant. */
export const JOB_BOT = "freeduet-mail-rules";
/** Messages one rule looks at in a pass: five pages of fifty. Older ones are named in the rule's error. */
export const SCAN_PAGE = 50;
export const SCAN_PAGES = 5;
/** Mail that arrived in the last minutes before a pass is looked at again; `mail_rule_applied` stops repeats. */
const OVERLAP_MS = 5 * 60_000;
const LEASE_MS = 10 * 60_000;
/** After a failed pass a rule waits twice as long each time it fails again: 10 minutes, 20, 40 ... up to 4 hours. */
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 4 * 3_600_000;
/** The mailbox could not be reached or refused the job: the rest of that connection's rules wait too. */
class ConnectionFailure extends Error {}
/** A message dated earlier than this before its rule was made is not new mail, whatever the search said. */
const STALE_MS = 24 * 3_600_000;

type Answer = { text: string; isError: boolean };
const answer = (value: unknown, isError = false): Answer => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  isError,
});

type Found = RuleMessage & { at: number };

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/** The messages a search answered, reduced to the headers a rule reads. Everything else is dropped here. */
export function foundMessages(text: string): Found[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = asRecord(parsed).messages;
  if (!Array.isArray(list)) return [];
  const out: Found[] = [];
  for (const item of list) {
    const one = asRecord(item);
    const id = typeof one.id === "string" ? one.id.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{1,16}$/.test(id)) continue;
    const headers = asRecord(one.headers);
    const date =
      typeof one.date === "string" ? Date.parse(one.date) : Number.NaN;
    out.push({
      id,
      from: typeof one.from === "string" ? one.from : "",
      to: strings(one.to),
      cc: strings(one.cc),
      subject: typeof one.subject === "string" ? one.subject : "",
      listId: typeof headers["List-Id"] === "string" ? headers["List-Id"] : "",
      at: Number.isFinite(date) ? date : 0,
    });
  }
  return out;
}

const toStored = (row: typeof mailRules.$inferSelect): StoredRule => ({
  id: row.id,
  spec: row.spec,
  enabled: row.enabled,
  createdAt: row.createdAt.toISOString(),
  lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
  lastMatched: row.lastMatched,
  lastApplied: row.lastApplied,
  totalApplied: row.totalApplied,
  lastError: row.lastError,
  applyToExisting: row.backfillPending,
});

export function mailRuleMethods(context: StoreContext) {
  const {
    database,
    auditStore,
    injectedVendor,
    requireServer,
    connectionTokenFor,
  } = context;

  /** The server's entry, refusing every connection a rule cannot be kept for. */
  async function mailboxOf(serverId: string) {
    const found = await requireServer(serverId);
    const transport = found.access.transport;
    if (transport !== "google-imap" && transport !== "google-workspace-rest") {
      throw new PluginRefusedError(
        "Mail rules can be kept only for a Gmail connection.",
        null,
      );
    }
    return found;
  }

  async function rulesOf(userId: string, serverId?: string) {
    const rows = await database
      .select()
      .from(mailRules)
      .where(
        serverId
          ? and(eq(mailRules.userId, userId), eq(mailRules.serverId, serverId))
          : eq(mailRules.userId, userId),
      )
      .orderBy(asc(mailRules.createdAt));
    return rows;
  }

  const methods = {
    /** The person's rules, for the screen and the list tool, in the words the person reads. */
    async listMailRules(userId: string, serverId?: string) {
      return (await rulesOf(userId, serverId)).map((row) => ({
        ...toStored(row),
        serverId: row.serverId,
        inWords: ruleInWords(row.spec),
      }));
    },

    /**
     * One of the three rule tools, carried out after the gate. The rules are the asking person's own:
     * every query is scoped by `userId`, so another person's rule is neither listed nor changed.
     */
    async handleRuleTool(input: {
      serverId: string;
      toolName: string;
      args: Record<string, unknown>;
      userId: string;
      initiator?: AuditInitiator;
    }): Promise<Answer> {
      const { serverId, toolName, userId } = input;
      await mailboxOf(serverId);
      if (!userId) {
        return answer("Rules belong to a person, and this run has none.", true);
      }
      if (toolName === LIST_RULES) {
        const rules = await methods.listMailRules(userId, serverId);
        return answer({
          rules: rules.map((rule) => ({
            id: rule.id,
            rule: rule.inWords,
            on: rule.enabled,
            lastRunAt: rule.lastRunAt,
            lastMatched: rule.lastMatched,
            totalApplied: rule.totalApplied,
            lastError: rule.lastError,
          })),
          note: "These rules are kept and applied by FreeDuet, not by Gmail.",
        });
      }
      if (toolName === CREATE_RULE) {
        const parsed = parseRuleSpec(input.args);
        if (!parsed.ok) return answer(parsed.message, true);
        const [{ n }] = (await database
          .select({ n: sql<number>`count(*)::int` })
          .from(mailRules)
          .where(
            and(eq(mailRules.userId, userId), eq(mailRules.serverId, serverId)),
          )) as [{ n: number }];
        if (n >= MAX_RULES_PER_MAILBOX) {
          return answer(RULE_REFUSALS.tooMany, true);
        }
        const id = randomUUID();
        const { applyToExisting, ...spec } = parsed.value;
        await database.insert(mailRules).values({
          id,
          userId,
          serverId,
          spec,
          watermarkAt: new Date(),
          backfillPending: applyToExisting,
        });
        await recordAuditEvent(auditStore, {
          eventType: "mail_rule.created",
          targetType: "mail_rule",
          targetId: id,
          actorUserId: userId,
          ...(input.initiator ? { initiator: input.initiator } : {}),
          payload: {
            server: serverId,
            applyToExisting,
            actions: actionNames(spec),
          },
        });
        return answer({
          ruleId: id,
          rule: ruleInWords(spec, applyToExisting),
          note: "FreeDuet keeps and applies this rule itself, to new mail every few minutes. Gmail does not know about it and has no filter for it.",
        });
      }
      if (toolName === DISABLE_RULE) {
        const parsed = parseRuleChange(input.args);
        if (!parsed.ok) return answer(parsed.message, true);
        const done = await methods.changeMailRule(
          userId,
          parsed.value.ruleId,
          parsed.value.change,
          input.initiator,
          serverId,
        );
        return done
          ? answer({ ruleId: parsed.value.ruleId, done: parsed.value.change })
          : answer(RULE_REFUSALS.noRule, true);
      }
      return answer(RULE_REFUSALS.extra, true);
    },

    /** Switch a rule off or on, or delete it. False when the person has no such rule. */
    async changeMailRule(
      userId: string,
      ruleId: string,
      change: "disable" | "enable" | "delete",
      initiator?: AuditInitiator,
      serverId?: string,
    ): Promise<boolean> {
      const where = and(
        eq(mailRules.id, ruleId),
        eq(mailRules.userId, userId),
        ...(serverId ? [eq(mailRules.serverId, serverId)] : []),
      );
      const [row] = await database.select().from(mailRules).where(where);
      if (!row) return false;
      if (change === "delete") {
        await database.delete(mailRules).where(where);
      } else {
        await database
          .update(mailRules)
          .set({
            enabled: change === "enable",
            // Switched back on, a rule looks at mail from now: what arrived while it was off is not new.
            // It never starts a backfill nobody ordered, and a failure it had is forgotten.
            // An enable of a rule that is already on changes nothing.
            ...(change === "enable" && !row.enabled
              ? {
                  watermarkAt: new Date(),
                  backfillPending: false,
                  failures: 0,
                  leasedUntil: null,
                }
              : {}),
          })
          .where(where);
      }
      await recordAuditEvent(auditStore, {
        eventType:
          change === "delete" ? "mail_rule.deleted" : "mail_rule.changed",
        targetType: "mail_rule",
        targetId: ruleId,
        actorUserId: userId,
        ...(initiator ? { initiator } : {}),
        payload: { server: row.serverId, change },
      });
      return true;
    },

    /**
     * One pass of the timer: every enabled rule that no other pass holds, carried out against its own
     * person's own mailbox. Deterministic: headers in, five fixed actions out, no model, no card.
     */
    async runMailRules(input: { now?: Date } = {}) {
      const now = input.now ?? new Date();
      const claimed = await database
        .update(mailRules)
        .set({ leasedUntil: new Date(now.getTime() + LEASE_MS) })
        .where(
          and(
            eq(mailRules.enabled, true),
            or(isNull(mailRules.leasedUntil), lt(mailRules.leasedUntil, now)),
          ),
        )
        .returning();
      const groups = new Map<string, typeof claimed>();
      for (const rule of claimed) {
        const key = `${rule.userId}\u0000${rule.serverId}`;
        groups.set(key, [...(groups.get(key) ?? []), rule]);
      }
      let applied = 0;
      for (const rules of groups.values()) {
        rules.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const first = rules[0];
        if (!first) continue;
        applied += await runGroup(first.userId, first.serverId, rules, now);
      }
      return { rules: claimed.length, applied };
    },
  };
  return methods;

  async function runGroup(
    userId: string,
    serverId: string,
    rules: (typeof mailRules.$inferSelect)[],
    now: Date,
  ): Promise<number> {
    let call: (name: string, args: Record<string, unknown>) => Promise<Answer>;
    try {
      const { row, entry, access } = await mailboxOf(serverId);
      const { token, vendorUserId } = await connectionTokenFor(
        row,
        entry,
        userId,
        access,
        null,
      );
      call = async (name, args) => {
        // The one place the job reaches a mailbox. A name off the list is a bug, never a call.
        if (!JOB_TOOLS.includes(name)) {
          throw new Error("mail rule job: a tool outside its list");
        }
        const vendor =
          injectedVendor ?? transportFor(access.transport).callTool;
        const result = await vendor(
          {
            url: effectiveUrl(row, entry),
            token,
            tokenHeader: tokenHeaderFor(entry),
            actorId: vendorUserId ?? userId,
            botId: JOB_BOT,
          },
          name,
          args,
        );
        return { text: result.text, isError: result.isError };
      };
    } catch (error) {
      for (const rule of rules) {
        await finish(rule, now, {
          matched: 0,
          applied: 0,
          error: reasonOf(error),
          advance: false,
        });
      }
      return 0;
    }

    let total = 0;
    // Messages a rule of this pass moved out of the Inbox for good, so a later rule leaves them alone.
    const removed = new Set<string>();
    for (const [at, rule] of rules.entries()) {
      try {
        total += await runRule(rule, call, now, removed);
      } catch (error) {
        // The failing rule says why (a search the mailbox refused has already been recorded). A connection
        // that fails once is not tried again by every other rule of the pass: they wait with it.
        if (!(error instanceof ConnectionFailure)) {
          await finish(rule, now, {
            matched: 0,
            applied: 0,
            error: reasonOf(error),
            advance: false,
          });
        }
        const why = reasonOf(error);
        for (const rest of rules.slice(at + 1)) {
          await finish(rest, now, {
            matched: 0,
            applied: 0,
            error: why,
            advance: false,
          });
        }
        break;
      }
    }
    return total;
  }

  async function runRule(
    rule: typeof mailRules.$inferSelect,
    call: (name: string, args: Record<string, unknown>) => Promise<Answer>,
    now: Date,
    removed: Set<string>,
  ): Promise<number> {
    const backfill = rule.backfillPending;
    const since = backfill ? null : rule.watermarkAt;
    const found = new Map<string, Found>();
    let before: number | null = null;
    let truncated = false;
    for (let page = 0; page < SCAN_PAGES; page++) {
      const query = [
        "in:inbox",
        ...(since ? [`after:${Math.floor(since.getTime() / 1000)}`] : []),
        ...(before ? [`before:${before}`] : []),
      ].join(" ");
      const result = await call("gmail_search_messages", {
        query,
        maxResults: SCAN_PAGE,
      });
      if (result.isError) {
        await finish(rule, now, {
          matched: 0,
          applied: 0,
          error: result.text,
          advance: false,
        });
        throw new ConnectionFailure(result.text);
      }
      const messages = foundMessages(result.text);
      let fresh = 0;
      for (const message of messages) {
        if (!found.has(message.id)) {
          found.set(message.id, message);
          fresh++;
        }
      }
      if (messages.length < SCAN_PAGE || fresh === 0) break;
      const oldest = Math.min(
        ...messages.map((m) => m.at).filter((at) => at > 0),
      );
      if (!Number.isFinite(oldest)) break;
      before = Math.floor(oldest / 1000) + 1;
      if (page === SCAN_PAGES - 1) truncated = true;
    }

    const floor = backfill ? 0 : rule.createdAt.getTime() - STALE_MS;
    const candidates = [...found.values()].filter(
      (message) =>
        !removed.has(message.id) &&
        (message.at === 0 || message.at >= floor) &&
        ruleMatches(rule.spec.conditions, message),
    );
    const ids = candidates.map((message) => message.id);
    const already = new Set<string>();
    if (ids.length > 0) {
      const rows = await database
        .select({ id: mailRuleApplied.messageId })
        .from(mailRuleApplied)
        .where(
          and(
            eq(mailRuleApplied.ruleId, rule.id),
            inArray(mailRuleApplied.messageId, ids),
          ),
        );
      for (const row of rows) already.add(row.id);
    }
    const todo = ids.filter((id) => !already.has(id));
    let applied = 0;
    let error: string | null = null;
    for (let at = 0; at < todo.length && !error; at += MAX_ORGANISE_MESSAGES) {
      const chunk = todo.slice(at, at + MAX_ORGANISE_MESSAGES);
      error = await carryOut(rule.spec, chunk, call);
      if (error === null) {
        await database
          .insert(mailRuleApplied)
          .values(chunk.map((messageId) => ({ ruleId: rule.id, messageId })))
          .onConflictDoNothing();
        applied += chunk.length;
        if (rule.spec.actions.spam || rule.spec.actions.bin) {
          for (const id of chunk) removed.add(id);
        }
      }
    }
    await finish(rule, now, {
      matched: todo.length,
      applied,
      error:
        error ??
        (truncated
          ? `More than ${SCAN_PAGE * SCAN_PAGES} messages were new; the oldest were not looked at in this pass.`
          : null),
      advance: error === null,
      backfillDone: backfill && error === null,
      note: error === null,
    });
    return applied;
  }

  /** The rule's actions on these messages, in a fixed order, or the first sentence that went wrong. */
  async function carryOut(
    spec: RuleSpec,
    ids: string[],
    call: (name: string, args: Record<string, unknown>) => Promise<Answer>,
  ): Promise<string | null> {
    const { actions } = spec;
    const step = async (name: string, args: Record<string, unknown>) => {
      const result = await call(name, args);
      return result.isError ? cutAtCodeUnits(result.text, 300) : null;
    };
    if (actions.addLabels.length > 0) {
      const listed = await call(LIST_LABELS, {});
      if (listed.isError) return cutAtCodeUnits(listed.text, 300);
      const have = new Set(
        strings(asRecord(safeJson(listed.text)).labels).map((name) =>
          name.toLowerCase(),
        ),
      );
      for (const label of actions.addLabels) {
        if (have.has(label.toLowerCase())) continue;
        const made = await step(CREATE_LABEL, { name: label });
        if (made) return made;
      }
      const failed = await step(LABEL_MESSAGES, {
        messageIds: ids,
        addLabels: actions.addLabels,
      });
      if (failed) return failed;
    }
    if (actions.markRead) {
      const failed = await step(MARK_MESSAGES, {
        messageIds: ids,
        state: "read",
      });
      if (failed) return failed;
    }
    if (actions.archive && !actions.spam && !actions.bin) {
      const failed = await step(ARCHIVE_MESSAGES, { messageIds: ids });
      if (failed) return failed;
    }
    if (actions.spam) {
      const failed = await step(SPAM_MESSAGES, { messageIds: ids });
      if (failed) return failed;
    }
    if (actions.bin) {
      const failed = await step(BIN_MESSAGES, { messageIds: ids });
      if (failed) return failed;
    }
    return null;
  }

  async function finish(
    rule: typeof mailRules.$inferSelect,
    now: Date,
    result: {
      matched: number;
      applied: number;
      error: string | null;
      advance: boolean;
      backfillDone?: boolean;
      /** A note on a pass that worked (more mail than it could look at), not a failure: no backoff. */
      note?: boolean;
    },
  ) {
    const failed = result.error !== null && result.note !== true;
    const failures = failed ? rule.failures + 1 : 0;
    await database
      .update(mailRules)
      .set({
        failures,
        leasedUntil: failed
          ? new Date(
              now.getTime() +
                Math.min(BACKOFF_BASE_MS * 2 ** failures, BACKOFF_MAX_MS),
            )
          : null,
        lastRunAt: now,
        lastMatched: result.matched,
        lastApplied: result.applied,
        totalApplied: sql`${mailRules.totalApplied} + ${result.applied}`,
        lastError: result.error ? cutAtCodeUnits(result.error, 400) : null,
        ...(result.advance
          ? {
              watermarkAt: new Date(
                Math.max(
                  rule.watermarkAt.getTime(),
                  now.getTime() - OVERLAP_MS,
                ),
              ),
            }
          : {}),
        ...(result.backfillDone ? { backfillPending: false } : {}),
      })
      .where(eq(mailRules.id, rule.id));
    // An audit row when something happened or the state changed: the first failure of a run of failures, a
    // recovery, an application. A rule that keeps failing is not a row on every pass; `lastError` shows it.
    const firstFailure = failed && rule.failures === 0;
    const recovered = !failed && rule.failures > 0;
    if (firstFailure || (!failed && (result.applied > 0 || recovered))) {
      await recordAuditEvent(auditStore, {
        eventType: failed ? "mail_rule.failed" : "mail_rule.applied",
        targetType: "mail_rule",
        targetId: rule.id,
        actorUserId: rule.userId,
        initiator: DEPLOYMENT_INITIATOR,
        payload: {
          server: rule.serverId,
          matched: result.matched,
          applied: result.applied,
          actions: actionNames(rule.spec),
          backfill: rule.backfillPending,
          ...(recovered ? { recovered: true } : {}),
          ...(result.error
            ? { failure: cutAtCodeUnits(result.error, 200) }
            : {}),
        },
      });
    }
  }
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const reasonOf = (error: unknown): string =>
  error instanceof PluginRefusedError
    ? withoutStatement(error)
    : "The mailbox could not be reached for this rule.";

/** The names of a rule's actions, for the trail: never a label's name or an address. */
function actionNames(spec: RuleSpec): string[] {
  const { actions } = spec;
  return [
    ...(actions.addLabels.length > 0 ? ["label"] : []),
    ...(actions.markRead ? ["mark_read"] : []),
    ...(actions.archive ? ["archive"] : []),
    ...(actions.spam ? ["spam"] : []),
    ...(actions.bin ? ["bin"] : []),
  ];
}
