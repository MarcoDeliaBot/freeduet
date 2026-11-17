/**
 * Each person's own conversations with the team, and Iris's daily review (issues #25 and #28,
 * docs/M1_PLAN.md D17).
 *
 * WHY PER PERSON. The channels in `channels.yaml` are created as package channels, which by
 * OpenBot's design have no members and are reachable by nobody (`db/schema/core.ts`). Listing them
 * for everybody would make one shared conversation per member, where each person reads the others'
 * requests. So each person gets their own private conversation per package channel, made through the
 * channel store like any conversation a person starts, named and described from `channels.yaml`.
 * Access stays what it is for every conversation: membership.
 *
 * WHICH STORE CALL. A channel with one member goes through `direct`, the store's find-or-create of
 * "this person's one conversation with this Bot alone". It makes the conversation the way `create`
 * does (the call behind "Message <name>"), and it is also where the first-day greeting, the morning
 * brief and a handoff's answer land, so the person never ends up with a second conversation with
 * Iris beside the one Chat shows. A conversation already there is adopted and named, never doubled.
 * A channel with several members, which FreeDuet's package does not have, goes through `create`.
 *
 * ONCE, AND ONLY ONCE. What was made is written into `users.preferences.freeduetTeam`: the package
 * channel id against the conversation made for it, and the daily review's routine id. A later pass
 * makes only what the mark lacks, so a conversation or routine the person deleted stays deleted, a
 * restart repeats nothing, and a member added to the package later is still offered to everybody.
 *
 * THE DAILY REVIEW IS OFFERED, NEVER MADE (D79, docs/M1_PLAN.md section 58). A routine waits for a
 * card (D35), and a pass has no run to hang a card on, so no pass creates one. A person with no daily
 * review gets `dailyReviewProposed` in the mark instead, once: Iris offers the review in words, and
 * when the person says yes her `create_routine` call meets the D35 card. A routine already there,
 * enabled or not, is adopted into the mark as it is; one the person deleted is never made again.
 *
 * TWO REQUESTS AT ONCE. A pass holds a transaction-scoped advisory lock on the person and reads the
 * mark inside it, so a second pass, on this replica or another, waits and then finds the work done.
 * In one process passes run one at a time, so a pass waiting on the lock never holds more than one
 * connection while the store calls it makes need another.
 *
 * WHEN. On the person's `GET /api/me`, the first request the app makes after sign-in on every load
 * (`app/src/lib/auth/queries.ts`), through the onboarding store that route reads. The pass finishes
 * before the app renders, so the conversations exist before Chat asks for the first day. A failure
 * is logged and never fails the request; the next load in a new process tries again.
 */
import { and, eq, sql } from "drizzle-orm";
import { AgentNotFoundError } from "../agents/profile-store";
import type { AgentActor } from "../agents/profile-types";
import {
  type ChannelStore,
  PRIVATE_AGENT_CHANNEL_DESCRIPTION,
} from "../channels/routes";
import type { Database } from "../db/client";
import { channels, users } from "../db/schema";
import type { OnboardingStore } from "../people/onboarding";
import type { RoutineStore } from "../routines/store";
import type { TenantPackage } from "../tenant-package";
import { isFreeDuetPackage } from "./hub-grants";

/** The key in `users.preferences` that records what was made for this person. */
export const TEAM_PREFERENCE = "freeduetTeam";

/** Iris's daily review (D17): the instruction the routine carries, word for word. */
export const DAILY_REVIEW_INSTRUCTION =
  "Daily review. Read team_log for the last 24 hours and give me one summary: what was done, what failed and why, lessons waiting for my approval, and what you already corrected. Keep it short.";

/** Every morning at 08:30. */
export const DAILY_REVIEW_CRON = "30 8 * * *";

/** OpenBot keeps no time zone per person, so the review runs at 08:30 in this one until changed. */
export const DEFAULT_TEAM_TIMEZONE = "Europe/Rome";

/** What was made for one person: package channel id to conversation id, and the routine id. */
export type TeamMark = {
  conversations: Record<string, string>;
  dailyReview?: string;
  /**
   * D79: the server has left the daily review to Iris to offer in words. Set once, when the person
   * has no daily review; from then on no pass makes a routine or looks again.
   */
  dailyReviewProposed?: true;
};

export type PersonTeamDeps = {
  database: Database;
  channels: Pick<ChannelStore, "direct" | "create">;
  routines: Pick<RoutineStore, "listFor">;
  /** The person as the channel and routine stores check them, role included. */
  actorFor: (userId: string) => Promise<AgentActor>;
  tenantPackage: Pick<TenantPackage, "tenantId" | "agents" | "channels">;
};

export type PersonTeam = {
  /** Makes what this person is still missing. Never throws; a failure is logged. */
  ensure(userId: string): Promise<void>;
};

/** The mark as stored, read defensively: anything that is not a string id is ignored. */
export function readTeamMark(value: unknown): TeamMark {
  const mark: TeamMark = { conversations: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return mark;
  const stored = value as Record<string, unknown>;
  const conversations = stored.conversations;
  if (
    conversations &&
    typeof conversations === "object" &&
    !Array.isArray(conversations)
  ) {
    for (const [channelId, id] of Object.entries(conversations)) {
      if (typeof id === "string" && id) mark.conversations[channelId] = id;
    }
  }
  if (typeof stored.dailyReview === "string" && stored.dailyReview) {
    mark.dailyReview = stored.dailyReview;
  }
  if (stored.dailyReviewProposed === true) mark.dailyReviewProposed = true;
  return mark;
}

function warn(type: string, detail: Record<string, unknown>) {
  console.warn(JSON.stringify({ type, ...detail }));
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type PackageChannel = PersonTeamDeps["tenantPackage"]["channels"][number];

export function createPersonTeam(deps: PersonTeamDeps): PersonTeam {
  const { database, tenantPackage } = deps;
  const iris = tenantPackage.tenantId;
  /** People whose pass finished in this process. A restart reads the mark again. */
  const settled = new Set<string>();
  /** The pass under way for a person, which a second request for them waits on. */
  const running = new Map<string, Promise<void>>();
  /** One pass at a time in this process: see the note on two requests at once. */
  let tail: Promise<void> = Promise.resolve();

  /** The person's conversation for one package channel, or null when its member is out of reach. */
  async function conversationFor(
    transaction: Transaction,
    actor: AgentActor,
    channel: PackageChannel,
  ): Promise<string | null> {
    const [only, ...more] = channel.permittedAgents;
    if (!only) return null;
    try {
      const made =
        more.length === 0
          ? await deps.channels.direct(actor, only)
          : await deps.channels.create(
              actor,
              channel.permittedAgents,
              transaction,
            );
      // Named only while nobody has given it a purpose of their own.
      await transaction
        .update(channels)
        .set({
          name: channel.name,
          description: channel.description,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(channels.id, made.id),
            eq(channels.description, PRIVATE_AGENT_CHANNEL_DESCRIPTION),
          ),
        );
      return made.id;
    } catch (error) {
      if (!(error instanceof AgentNotFoundError)) throw error;
      warn("freeduet-team-conversation-skipped", {
        userId: actor.id,
        channel: channel.id,
        reason: error.message,
      });
      return null;
    }
  }

  /**
   * The daily review's routine id when one is already there with Iris and this instruction, else null.
   * Nothing is ever made here (D79): the routine is created only by Iris's `create_routine` after the
   * person says yes, and the card of D35 asks first.
   */
  async function existingDailyReview(actor: AgentActor): Promise<string | null> {
    if (!tenantPackage.agents.some((agent) => agent.id === iris)) return null;
    const existing = (await deps.routines.listFor(actor.id)).find(
      (routine) =>
        routine.agentId === iris &&
        routine.instruction === DAILY_REVIEW_INSTRUCTION,
    );
    return existing ? existing.id : null;
  }

  async function pass(userId: string): Promise<void> {
    await database.transaction(
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`freeduet:team:${userId}`}))`,
        );
        const [row] = await transaction
          .select({
            mark: sql<unknown>`${users.preferences} -> ${TEAM_PREFERENCE}`,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!row) return;
        const mark = readTeamMark(row.mark);
        const before = JSON.stringify(mark);
        const actor = await deps.actorFor(userId);

        for (const channel of tenantPackage.channels) {
          if (mark.conversations[channel.id]) continue;
          const id = await conversationFor(transaction, actor, channel);
          if (id) mark.conversations[channel.id] = id;
        }
        if (!mark.dailyReview && !mark.dailyReviewProposed) {
          const id = await existingDailyReview(actor);
          if (id) mark.dailyReview = id;
          else if (tenantPackage.agents.some((agent) => agent.id === iris))
            mark.dailyReviewProposed = true;
        }

        if (JSON.stringify(mark) === before) return;
        await transaction
          .update(users)
          .set({
            /*
             * Merged in Postgres, so the person's own preferences stay as they are. An object, as
             * `user-preferences.ts` passes it: a JSON string here is stored as a jsonb string, and
             * the merge then turns the whole column into an array.
             */
            preferences: sql`${users.preferences} || ${{ [TEAM_PREFERENCE]: mark }}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      },
      { isolationLevel: "read committed" },
    );
  }

  return {
    ensure(userId) {
      if (settled.has(userId)) return Promise.resolve();
      const under = running.get(userId);
      if (under) return under;
      const run = tail
        .then(() => pass(userId))
        .then(
          () => {
            settled.add(userId);
          },
          (error: unknown) => {
            warn("freeduet-team-failed", {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        )
        .finally(() => running.delete(userId));
      tail = run;
      running.set(userId, run);
      return run;
    },
  };
}

/** The onboarding store `/api/me` reads, with the person's team made first. */
export function teamOnboarding(
  onboarding: OnboardingStore,
  team: PersonTeam,
): OnboardingStore {
  return {
    ...onboarding,
    async status(userId) {
      await team.ensure(userId);
      return onboarding.status(userId);
    },
  };
}

/** What index.ts calls: the onboarding store as it was, unless the package is FreeDuet's. */
export function withFreeDuetTeam(
  onboarding: OnboardingStore,
  deps: PersonTeamDeps,
): OnboardingStore {
  if (!isFreeDuetPackage(deps.tenantPackage)) return onboarding;
  return teamOnboarding(onboarding, createPersonTeam(deps));
}
