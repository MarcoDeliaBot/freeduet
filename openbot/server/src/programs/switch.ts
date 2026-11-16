/**
 * The switch for programs on the person's computer (docs/design/programs-on-your-computer.md 6.1, D60): one
 * per person, OFF by default.
 *
 * WHERE IT IS KEPT. `users.preferences.freeduetPrograms`, a small object `{ since }`, written like Full access
 * is (`freeduet/full-access.ts`): one statement in Postgres, no table, no migration. The generic preferences
 * route is a strict object that refuses this key, so only `set` below writes it, and the only caller of `set`
 * is the person's own route (`routes.ts`), which asks that the person is at the computer.
 *
 * READ STRICTLY. Only an object with a text `since` is "on". A `true`, a number, an array, a missing key or
 * anything else this build cannot read is off, for that person only.
 */
import { eq, sql } from "drizzle-orm";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { users } from "../db/schema";

export const PROGRAMS_PREFERENCE = "freeduetPrograms";

export type ProgramsSwitch = ReturnType<typeof createProgramsSwitch>;

export function createProgramsSwitch(deps: {
  database: Database;
  audit?: AuditStore;
}) {
  const { database } = deps;

  async function isOn(userId: string): Promise<boolean> {
    const [row] = await database
      .select({
        value: sql<unknown>`${users.preferences} -> ${PROGRAMS_PREFERENCE}`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const value = row?.value;
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { since?: unknown }).since === "string"
    );
  }

  return {
    isOn,

    /** Called by the person's own route only. Returns the state afterwards. */
    async set(userId: string, enabled: boolean): Promise<boolean> {
      const key = PROGRAMS_PREFERENCE;
      const entry = JSON.stringify({ since: new Date().toISOString() });
      const [saved] = await database
        .update(users)
        .set({
          preferences: enabled
            ? sql`${users.preferences} || jsonb_build_object(${key}::text, ${entry}::text::jsonb)`
            : sql`${users.preferences} - ${key}::text`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (!saved) throw new Error("That person was not found.");
      if (deps.audit)
        await recordAuditEvent(deps.audit, {
          eventType: "configuration.changed",
          targetType: "programs",
          actorUserId: userId,
          payload: {
            change: enabled ? "programs_switch_on" : "programs_switch_off",
          },
        });
      return isOn(userId);
    },
  };
}
