/**
 * Full access (docs/FULL_ACCESS.md): an optional setting the person gives one member, and that member
 * then acts without approval cards. Off by default, per person and per member. It has two settings:
 * `full`, which also lifts the payments safety requirement, and `no_payments` ("Full access without
 * payments"), which lifts nothing the safety floor holds, so a payment asks exactly as it does with
 * the switch off. Off is the absence of an entry.
 *
 * WHERE IT IS KEPT. `users.preferences.freeduetFullAccess`, a map from member id to an entry, merged in
 * Postgres like `freeduetTeam` (`person-team.ts`). No table, no migration, and a deleted person takes
 * it with them. Nothing else reads or writes that key: the generic preferences route is a strict
 * object that refuses it.
 *
 * WHAT AN ENTRY LOOKS LIKE. Plain Full access is `{ since }`, exactly as it was before the second
 * setting existed, so every entry already stored keeps meaning plain Full access and nothing is
 * rewritten. Full access without payments is `{ mode: "no_payments", at }`. It is written with `at`
 * and without `since` ON PURPOSE: a build from before this setting reads only `{ since }`, so it reads
 * such an entry as off, and putting an older build back never widens a member to plain Full access.
 * Anything this build cannot read (a `true`, a number for the date, a mode it does not know, a mode
 * with no date) is off for that member and for no other.
 *
 * WHO CAN CHANGE IT. Only `set`, and the only caller of `set` is the route in
 * `full-access-routes.ts`, behind the person's own session. No member tool, routine, hand-off,
 * skill or connector reaches it, and `full-access.test.ts` reads the source to hold that.
 *
 * WHEN IT APPLIES. `effective` is asked by the approval gate (`approvals/service.ts`), and `applies`,
 * which is only "is it on at all", by the connector's send check (`withFullAccess` below). Both answer
 * yes only for the member the person switched on, in the person's own live turn: no run initiator, or
 * `person` (the app's own computer calls). A routine, a check-in, a memory run, a task and the
 * deployment always ask. A hop made by another member applies it to the receiver only when the server
 * itself traces the hop to the person's own typed message (the D27a mark, loaded by
 * `createHandedRequestLoader`). Then the stricter of the two members' settings holds for payments: a
 * receiver in plain Full access still asks about a payment when the member that handed the work on is
 * "without payments", and a receiver "without payments" asks whatever the sender is.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  type ApprovalContinuation,
  ApprovalRefusedError,
  currentApprovalContext,
  type FullAccessMode,
} from "../approvals/types";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { auditEvents, users } from "../db/schema";
import type { CheckPrivateShare } from "../proactive/private-share";

export type { FullAccessMode };

export const FULL_ACCESS_PREFERENCE = "freeduetFullAccess";
/** `outcome.source` of the `approval.evaluated` row an action taken without a card leaves. */
export const FULL_ACCESS_SOURCE = "full_access";
const NO_PAYMENTS = "no_payments";
const MAX_MEMBERS = 100;
const MAX_ID = 200;

/**
 * One member's entry, as read. `mode` is absent for plain Full access, which is how every entry
 * written before the second setting existed reads, and is `no_payments` for Full access without
 * payments. `since` is when the person gave it.
 */
export type FullAccessEntry = { since: string; mode?: typeof NO_PAYMENTS };
export type FullAccessSetting = Record<string, FullAccessEntry>;

/** The setting an entry stands for. */
export const modeOf = (entry: FullAccessEntry): FullAccessMode =>
  entry.mode ?? "full";

/** What the person is shown afterwards: one action a member took without asking. */
export type FullAccessAction = {
  at: string;
  bot: string;
  tool: string;
  effect: string;
  scope: string;
};

export type FullAccess = ReturnType<typeof createFullAccess>;

/**
 * A stored value read strictly: only well-formed entries count, anything else is off. The result has
 * no prototype, so a member whose id is `constructor` or `toString` is not found by `in` or by
 * `setting[id]`.
 */
export function parseSetting(value: unknown): FullAccessSetting {
  const setting: FullAccessSetting = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return setting;
  for (const [bot, entry] of Object.entries(value)) {
    if (!bot || !entry || typeof entry !== "object" || Array.isArray(entry))
      continue;
    const { since, mode, at } = entry as {
      since?: unknown;
      mode?: unknown;
      at?: unknown;
    };
    if (mode === undefined) {
      // Plain Full access, as every entry stored before the second setting.
      if (typeof since === "string") setting[bot] = { since };
    } else if (mode === NO_PAYMENTS && typeof at === "string") {
      setting[bot] = { since: at, mode: NO_PAYMENTS };
    }
    // Anything else, a mode this build does not know included, is off for that member.
  }
  return setting;
}

export function createFullAccess(deps: {
  database: Database;
  /** Whether this member is one the person can open. Asked only when turning it on. */
  known: (userId: string, botId: string) => Promise<boolean>;
  /**
   * The person's own message a hop was made from, loaded from the conversation it was made in
   * (`agents/handoff-request.ts`). Absent, a hop never gets Full access.
   */
  handedRequest?: (input: {
    assertion: unknown;
    botId: string;
    actorId: string;
  }) => Promise<unknown | null>;
  audit?: AuditStore;
}) {
  const { database } = deps;

  async function list(userId: string): Promise<FullAccessSetting> {
    const [row] = await database
      .select({
        setting: sql<unknown>`${users.preferences} -> ${FULL_ACCESS_PREFERENCE}`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return parseSetting(row?.setting);
  }

  /**
   * The setting in force for this member in this turn, or undefined when Full access does not apply.
   * Pure checks first, the database only for a turn Full access could apply to.
   */
  async function effective(input: {
    actorId: string;
    botId: string;
    continuation: ApprovalContinuation | undefined;
  }): Promise<FullAccessMode | undefined> {
    const { continuation } = input;
    if (!continuation) return undefined;
    const initiator = continuation.initiator;
    const ownTurn = initiator === undefined || initiator.kind === "person";
    const handedOn = initiator?.kind === "handoff";
    if (!ownTurn && !(handedOn && deps.handedRequest)) return undefined;
    // One read, so the member and the one that handed the work on are judged from the same state.
    const setting = await list(input.actorId);
    const entry = setting[input.botId];
    if (!entry) return undefined;
    const own = modeOf(entry);
    if (ownTurn) return own;
    const forwarded = continuation.forwardedProps as
      | { openbotRun?: unknown }
      | null
      | undefined;
    const loaded = await deps
      .handedRequest?.({
        assertion: forwarded?.openbotRun,
        botId: input.botId,
        actorId: input.actorId,
      })
      .catch(() => null);
    if (loaded === null || loaded === undefined) return undefined;
    // The stricter of the two settings holds for payments, so handing a payment to a member that is
    // in plain Full access does not get round a sender that asked to be asked. A sender with Full
    // access off adds nothing: the receiver's own setting stands, as it always did.
    const sender =
      initiator?.kind === "handoff" ? setting[initiator.id] : undefined;
    return sender !== undefined && modeOf(sender) === NO_PAYMENTS
      ? NO_PAYMENTS
      : own;
  }

  return {
    list,

    effective,

    /** Whether Full access applies at all, in either setting. The connector's send check asks this. */
    async applies(input: {
      actorId: string;
      botId: string;
      continuation: ApprovalContinuation | undefined;
    }): Promise<boolean> {
      return (await effective(input)) !== undefined;
    },

    /**
     * Turns it on, in one of its two settings, or off for one member of this person. `true` with no
     * mode is plain Full access, as it was before the second setting. Called by the person's route only.
     */
    async set(
      userId: string,
      botId: string,
      enabled: boolean,
      mode: FullAccessMode = "full",
    ) {
      if (!botId || botId.length > MAX_ID)
        throw new ApprovalRefusedError("Choose one of your members.");
      if (enabled) {
        if (mode !== "full" && mode !== NO_PAYMENTS)
          throw new ApprovalRefusedError("Choose a kind of Full access.");
        if (!(await deps.known(userId, botId)))
          throw new ApprovalRefusedError("That member is not one of yours.");
        const current = await list(userId);
        if (!(botId in current) && Object.keys(current).length >= MAX_MEMBERS)
          throw new ApprovalRefusedError(
            "Too many members have Full access. Turn some off first.",
          );
      }
      const stamp = new Date().toISOString();
      const entry = JSON.stringify({
        [botId]:
          mode === NO_PAYMENTS
            ? { mode: NO_PAYMENTS, at: stamp }
            : { since: stamp },
      });
      const key = FULL_ACCESS_PREFERENCE;
      // One statement, so two switches flipped together keep each other. An entry is replaced whole,
      // so changing a member's setting leaves nothing of the old one behind.
      const [saved] = await database
        .update(users)
        .set({
          preferences: enabled
            ? sql`${users.preferences} || jsonb_build_object(${key}::text, coalesce(${users.preferences} -> ${key}, '{}'::jsonb) || ${entry}::text::jsonb)`
            : sql`${users.preferences} || jsonb_build_object(${key}::text, coalesce(${users.preferences} -> ${key}, '{}'::jsonb) - ${botId}::text)`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (!saved) throw new ApprovalRefusedError("That person was not found.");
      if (deps.audit)
        await recordAuditEvent(deps.audit, {
          eventType: "configuration.changed",
          targetType: "full_access",
          targetId: botId,
          actorUserId: userId,
          payload: {
            change: !enabled
              ? "full_access_off"
              : mode === NO_PAYMENTS
                ? "full_access_no_payments_on"
                : "full_access_on",
            bot: botId,
          },
        });
      return list(userId);
    },

    /** The last actions members took without asking this person, newest first. */
    async recent(userId: string, limit = 20): Promise<FullAccessAction[]> {
      const rows = await database
        .select({ at: auditEvents.createdAt, payload: auditEvents.payload })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.actorUserId, userId),
            eq(auditEvents.eventType, "approval.evaluated"),
            sql`${auditEvents.payload} -> 'outcome' ->> 'source' = ${FULL_ACCESS_SOURCE}`,
          ),
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(Math.min(Math.max(limit, 1), 100));
      const text = (value: unknown) => (typeof value === "string" ? value : "");
      return rows.map(({ at, payload }) => ({
        at: at.toISOString(),
        bot: text(payload.bot),
        tool: text(payload.tool),
        effect: text(payload.effect),
        scope: text(payload.scope),
      }));
    },
  };
}

/**
 * The connector's check before a send to other people, with Full access in front of it: a member
 * the person switched on, in either setting, is not asked about its own emails and posts, new
 * emails included. A payment is not decided here: the approval gate holds it for a member "without
 * payments". The group and other-person hand-off checks are separate instances and are not wrapped.
 */
export function withFullAccess(
  check: CheckPrivateShare,
  fullAccess: Pick<FullAccess, "applies">,
): CheckPrivateShare {
  return async (input) =>
    (await fullAccess.applies({
      actorId: input.ownerUserId,
      botId: input.botId,
      continuation: input.continuation ?? currentApprovalContext(),
    }))
      ? {
          status: "allowed",
          reason: "Full access is on for this member.",
          byPerson: true,
        }
      : check(input);
}
