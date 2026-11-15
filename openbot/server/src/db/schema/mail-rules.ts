import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { RuleSpec } from "../../plugins/mail-rules";
import { users } from "./core";
import { jsonb } from "./json";
import { mcpServers } from "./plugins";

/**
 * Mail rules (docs/design/mail-rules.md): standing rules FreeDuet keeps for one person's mailbox
 * connection and applies itself. `spec` is validated by `parseRuleSpec` before it is stored; the
 * table has no column for forwarding or sending, so none can be kept here.
 */
export const mailRules = pgTable(
  "mail_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    spec: jsonb("spec").$type<RuleSpec>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Mail that arrived before this is not looked at (until the backfill, when the person ordered one). */
    watermarkAt: timestamp("watermark_at", { withTimezone: true }).notNull(),
    /** The person's order also covered the matching mail already in the Inbox: one pass, then false. */
    backfillPending: boolean("backfill_pending").notNull().default(false),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastMatched: integer("last_matched").notNull().default(0),
    lastApplied: integer("last_applied").notNull().default(0),
    totalApplied: integer("total_applied").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [index("mail_rules_user_idx").on(table.userId, table.serverId)],
);

/** The messages a rule has already handled, so a second pass over the same mail does nothing. */
export const mailRuleApplied = pgTable(
  "mail_rule_applied",
  {
    ruleId: text("rule_id")
      .notNull()
      .references(() => mailRules.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ruleId, table.messageId] })],
);
