import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./core";

/**
 * A file a colleague offered while working on a hand-off (docs/M1_PLAN.md D177).
 *
 * One row per file: whose hand-off (`owner_user_id`), the conversation that asked (`thread_id`), the Bot
 * that asked (`asker_bot_id`) and the member whose computer holds the file (`member_bot_id`), the path in
 * that member's workspace and the facts the card draws. NEVER THE BYTES and never a link: the card's
 * Download button goes through the computer download route, which decides again.
 *
 * `copy_path` is where the server put a read-only copy for the Bot that asked, in that Bot's OWN
 * workspace (`in/<member>/<name>`), so it can check the delivery (D159). Null with a `copy_note` that says
 * why no copy was made (binary, over the write limit, a script, the asker's computer is off).
 */
export const handoffFileOffers = pgTable(
  "handoff_file_offers",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    hopRunId: text("hop_run_id").notNull(),
    askerBotId: text("asker_bot_id").notNull(),
    memberBotId: text("member_bot_id").notNull(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    copyPath: text("copy_path"),
    copyNote: text("copy_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("handoff_file_offers_thread_idx").on(table.ownerUserId, table.threadId),
    uniqueIndex("handoff_file_offers_once").on(
      table.ownerUserId,
      table.threadId,
      table.hopRunId,
      table.memberBotId,
      table.path,
    ),
  ],
);
