import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./core";

/**
 * The salt of one person's programs helper (docs/design/programs-on-your-computer.md, S1, D60).
 *
 * The helper's signing secret is derived from the deployment key AND this salt (`programs/broker.ts`), so it
 * cannot be computed from a person's id and the deployment key alone, and one person's helper can be
 * revoked without touching anyone else's: a new salt is a new secret, and the old helper's mac no longer
 * verifies. A row is made when the person switches the function on and removed when they switch it off;
 * pairing the helper again (slice S2) replaces it. The salt is not the secret: it is useless without the
 * deployment key, and no route returns it.
 */
export const programsHelperSalts = pgTable("programs_helper_salts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 32 random bytes, hex. */
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
