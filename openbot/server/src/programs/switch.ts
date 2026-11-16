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
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { programsHelperSalts, users } from "../db/schema";

export const PROGRAMS_PREFERENCE = "freeduetPrograms";

/**
 * The example key of `.env.example`, which is public. The helper's secret is derived from the deployment key,
 * so with this one anybody could compute it: the function is not switched on under it. (Duplicated from
 * `config.ts`, which does not export it, rather than changing that upstream file.)
 */
export const PUBLIC_EXAMPLE_KEY =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** Why the function cannot be switched on here. */
export class ProgramsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgramsUnavailableError";
  }
}

export type ProgramsSwitch = ReturnType<typeof createProgramsSwitch>;

export function createProgramsSwitch(deps: {
  database: Database;
  audit?: AuditStore;
  /** The deployment key: the function is not switched on while it is the public example key. */
  deploymentKey: string;
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

  /** The person's salt, or null when there is none (the function is off). */
  async function saltOf(userId: string): Promise<string | null> {
    const [row] = await database
      .select({ salt: programsHelperSalts.salt })
      .from(programsHelperSalts)
      .where(eq(programsHelperSalts.userId, userId))
      .limit(1);
    return row?.salt ?? null;
  }

  async function newSalt(userId: string): Promise<void> {
    const salt = randomBytes(32).toString("hex");
    await database
      .insert(programsHelperSalts)
      .values({ userId, salt })
      .onConflictDoUpdate({
        target: programsHelperSalts.userId,
        set: { salt, createdAt: new Date() },
      });
  }

  return {
    isOn,

    saltOf,

    /**
     * A new salt: the secret of this person's helper changes, and the helper that held the old one is
     * refused from its next poll. Pairing the helper again (slice S2) does this; so does switching on after being off.
     */
    async rotateSalt(userId: string): Promise<void> {
      if (!(await saltOf(userId))) return;
      await newSalt(userId);
    },

    /** Called by the person's own route only. Returns the state afterwards. */
    async set(userId: string, enabled: boolean): Promise<boolean> {
      if (enabled && deps.deploymentKey === PUBLIC_EXAMPLE_KEY)
        throw new ProgramsUnavailableError(
          "This installation still uses the public example key, so programs on this computer cannot be switched on. Set a key of your own first.",
        );
      const wasOn = await isOn(userId);
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
      // Switching on from off (or with no salt) makes a new salt, so a helper that held the old secret is refused from then on.
      // Switching off keeps it: an operation already leased may still be answered (the design's "off" rule),
      // and no poll is answered while off.
      if (enabled && (!wasOn || !(await saltOf(userId)))) await newSalt(userId);
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
