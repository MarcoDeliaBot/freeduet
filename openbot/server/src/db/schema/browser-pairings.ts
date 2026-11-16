import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./core";

/**
 * Browsers paired with the computer FreeDuet runs on (docs/M1_PLAN.md D49), with sign-in only.
 *
 * One row per paired browser. The browser holds a random token in a cookie; only a hash of it is kept
 * here, so a copy of this table opens nothing. A row is LIVE while it is not revoked, not past
 * `expires_at`, and `secret_tag` is the tag of the installation secret in force: changing the secret
 * therefore ends every pairing at once. `kind` is `computer` (paired by the link `scripts/open.sh`
 * hands out, on the machine) or `device` (paired with a one-time code from a computer pairing).
 */
export const browserPairings = pgTable(
  "browser_pairings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What the person calls it ("Chrome on this computer", "Phone"). Only a name, it decides nothing. */
    label: text("label").notNull(),
    kind: text("kind").$type<"computer" | "device">().notNull(),
    /** SHA-256 of the cookie's token, hex. The token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    /** A tag of the installation secret this pairing was made under; a different secret is a different tag. */
    secretTag: text("secret_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("browser_pairings_user_idx").on(table.userId)],
);
