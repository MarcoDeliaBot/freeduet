/**
 * Full access (docs/FULL_ACCESS.md): an optional switch the person sets for one member, and that
 * member then acts without approval cards. Off by default, per person and per member.
 *
 * WHERE IT IS KEPT. `users.preferences.freeduetFullAccess`, a map from member id to `{ since }`,
 * merged in Postgres like `freeduetTeam` (`person-team.ts`). No table, no migration, and a deleted
 * person takes it with them. Nothing else reads or writes that key: the generic preferences route
 * is a strict object that refuses it.
 *
 * WHO CAN CHANGE IT. Only `set`, and the only caller of `set` is the route in
 * `full-access-routes.ts`, behind the person's own session. No member tool, routine, hand-off,
 * skill or connector reaches it, and `full-access.test.ts` reads the source to hold that.
 *
 * WHEN IT APPLIES. `applies` is asked by the approval gate (`approvals/service.ts`) and by the
 * connector's send check (`withFullAccess` below), and answers yes only for the member the person
 * switched on, in the person's own live turn: no run initiator, or `person` (the app's own
 * computer calls). A routine, a check-in, a memory run, a task and the deployment always ask. A hop
 * made by another member applies it to the receiver only when the server itself traces the hop to
 * the person's own typed message (the D27a mark, loaded by `createHandedRequestLoader`).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  type ApprovalContinuation,
  ApprovalRefusedError,
  currentApprovalContext,
} from "../approvals/types";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { auditEvents, users } from "../db/schema";
import type { CheckPrivateShare } from "../proactive/private-share";

export const FULL_ACCESS_PREFERENCE = "freeduetFullAccess";
/** `outcome.source` of the `approval.evaluated` row an action taken without a card leaves. */
export const FULL_ACCESS_SOURCE = "full_access";
const MAX_MEMBERS = 100;
const MAX_ID = 200;

export type FullAccessSetting = Record<string, { since: string }>;

/** What the person is shown afterwards: one action a member took without asking. */
export type FullAccessAction = {
  at: string;
  bot: string;
  tool: string;
  effect: string;
  scope: string;
};

export type FullAccess = ReturnType<typeof createFullAccess>;

/** A stored value read strictly: only well-formed entries count, anything else is off. */
export function parseSetting(value: unknown): FullAccessSetting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const setting: FullAccessSetting = {};
  for (const [bot, entry] of Object.entries(value)) {
    const since =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as { since?: unknown }).since
        : undefined;
    if (bot && typeof since === "string") setting[bot] = { since };
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

  return {
    list,

    /**
     * Whether this member acts without a card for this person in this turn. Pure checks first, the
     * database only for a turn Full access could apply to.
     */
    async applies(input: {
      actorId: string;
      botId: string;
      continuation: ApprovalContinuation | undefined;
    }): Promise<boolean> {
      const { continuation } = input;
      if (!continuation) return false;
      const initiator = continuation.initiator;
      const ownTurn = initiator === undefined || initiator.kind === "person";
      const handedOn = initiator?.kind === "handoff";
      if (!ownTurn && !(handedOn && deps.handedRequest)) return false;
      if (!(input.botId in (await list(input.actorId)))) return false;
      if (ownTurn) return true;
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
      return loaded !== null && loaded !== undefined;
    },

    /** Turns it on or off for one member of this person. Called by the person's route only. */
    async set(userId: string, botId: string, enabled: boolean) {
      if (!botId || botId.length > MAX_ID)
        throw new ApprovalRefusedError("Choose one of your members.");
      if (enabled) {
        if (!(await deps.known(userId, botId)))
          throw new ApprovalRefusedError("That member is not one of yours.");
        const current = await list(userId);
        if (!(botId in current) && Object.keys(current).length >= MAX_MEMBERS)
          throw new ApprovalRefusedError(
            "Too many members have Full access. Turn some off first.",
          );
      }
      const entry = JSON.stringify({
        [botId]: { since: new Date().toISOString() },
      });
      const key = FULL_ACCESS_PREFERENCE;
      // One statement, so two switches flipped together keep each other.
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
            change: enabled ? "full_access_on" : "full_access_off",
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
 * the person switched on is not asked about its own emails and posts, new emails included. The
 * group and other-person hand-off checks are separate instances and are not wrapped.
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
