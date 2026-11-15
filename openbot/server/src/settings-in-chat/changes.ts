/**
 * A change to one of the person's settings from chat, and the Undo that puts the old value back
 * (docs/design/settings-in-chat.md, slice 1, rules R3 and R4).
 *
 * THE RECORD. Each change writes one `configuration.changed` audit event that holds the setting, the Bot,
 * the value it replaced and the value it set. Undo finds that event by its change id, so nothing else has
 * to be kept. The trail is append-only, so the record cannot be quietly edited afterwards.
 *
 * COMPARE AND SET. A change, and an Undo, writes only while the value is still the one it expects. So an
 * Undo never overwrites a later change, and two requests racing for the same value cannot both win.
 *
 * WHO. Every row is read and written for one person (`ownerUserId`). Undo looks the change up under that
 * person's own id, so one person can never undo another's change.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  type ChatTone,
  isChatTone,
  type SettingChangeRecord,
} from "@openbot/shared/setting-change";
import type { AuditEvent, AuditReader, AuditStore } from "../audit";
import { recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { agentPreferences, agentProfiles } from "../db/schema/coworker";
import { agents } from "../db/schema/core";
import { botLifecycle } from "../db/schema/lifecycle";
import {
  parseChoice,
  readLanguageChoice,
  swapLanguageChoice,
} from "../freeduet/person-language-choice";
import { checkMemberName, foldName, isWellFormedName } from "./member-name";
import type { ChatNotifyValue, ChatSettingName } from "./allow-list";

/** The audit target of a change, and of the Undo of one. Free-form strings the reader filters on. */
export const SETTING_CHANGE_TARGET = "bot_setting";
export const SETTING_UNDO_TARGET = "bot_setting_undo";

/**
 * How long a change can be undone: seven days from the change (docs/design/settings-in-chat.md, section 6,
 * Q1). After it the Undo route refuses, and the change list shows no Undo.
 */
export const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** How many of the person's changes the list holds, newest first. */
export const CHANGE_LIST_LIMIT = 20;

type NotifyLevel = "all" | "needs_input" | "none";

/**
 * A refusal the person can act on. Its message is a sentence the model repeats as it is. `status` is
 * the HTTP answer the Undo route gives for it.
 */
export class SettingRefusedError extends Error {
  override name = "SettingRefusedError";
  readonly status: 404 | 409;

  constructor(message: string, status: 404 | 409) {
    super(message);
    this.status = status;
  }
}

export type SettingChangeOutcome =
  | {
      status: "changed";
      changeId: string;
      agentId: string;
      setting: "notifications";
      /** Never `none`: a change from none is refused before anything is written. */
      previousValue: ChatNotifyValue;
      newValue: ChatNotifyValue;
    }
  | { status: "unchanged"; setting: "notifications"; value: ChatNotifyValue };

export type SettingUndoOutcome = {
  changeId: string;
  setting: ChatSettingName;
  /** The value the Undo put back: exactly the one the change replaced (null: the member's own name). */
  value: NotifyLevel | string | null;
};

export type NameChangeOutcome =
  | {
      status: "changed";
      changeId: string;
      /** The member named, by its real id. */
      agentId: string;
      setting: "name";
      previousValue: string | null;
      newValue: string | null;
    }
  | { status: "unchanged"; value: string | null };

export type ToneChangeOutcome =
  | {
      status: "changed";
      changeId: string;
      agentId: string;
      setting: "tone";
      previousValue: ChatTone;
      newValue: ChatTone;
    }
  | { status: "unchanged"; value: ChatTone };

export type LanguageChangeOutcome =
  | {
      status: "changed";
      changeId: string;
      /** The Bot that was asked: the language belongs to the person. */
      agentId: string;
      setting: "language";
      previousValue: string | null;
      newValue: string | null;
    }
  | { status: "unchanged"; value: string | null };

export type SettingChanges = {
  change(input: {
    ownerUserId: string;
    agentId: string;
    setting: "notifications";
    value: ChatNotifyValue;
  }): Promise<SettingChangeOutcome>;
  /**
   * The name this person gives a team member, shown to this person only. `member` is an id or a real name
   * as written, or absent for `callerId`, the Bot making the call. Every rule of `member-name.ts` applies.
   */
  changeName(input: {
    ownerUserId: string;
    callerId: string;
    member: string | undefined;
    value: string;
  }): Promise<NameChangeOutcome>;
  /**
   * How a team member talks to this person (`plain`, `warm` or `formal`), for this person only. `member` is
   * as for `changeName`. `plain` is the default and clears the choice.
   */
  changeTone(input: {
    ownerUserId: string;
    callerId: string;
    member: string | undefined;
    value: ChatTone;
  }): Promise<ToneChangeOutcome>;
  /**
   * The language this person reads, one for the whole team. `value` is a code from D26's list, or null for the
   * deployment's own. `callerId` is the Bot asked, kept in the record.
   */
  changeLanguage(input: {
    ownerUserId: string;
    callerId: string;
    value: string | null;
  }): Promise<LanguageChangeOutcome>;
  undo(input: {
    ownerUserId: string;
    changeId: string;
  }): Promise<SettingUndoOutcome>;
  /** The person's own last changes, newest first, each with whether it is undone and whether Undo still works. */
  list(input: { ownerUserId: string }): Promise<SettingChangeRecord[]>;
};

/** A chat change only ever holds these two: `none` is refused before anything is written. */
function isChatValue(value: unknown): value is ChatNotifyValue {
  return value === "all" || value === "needs_input";
}

/** The fields a recorded change holds, read back from its audit event. Anything else is unreadable. */
function recordOf(payload: Record<string, unknown>) {
  const { setting, agentId, previousValue, newValue } = payload;
  if (typeof agentId !== "string")
    throw new Error("A recorded setting change could not be read back.");
  if (
    setting === "notifications" &&
    isChatValue(previousValue) &&
    isChatValue(newValue)
  )
    return { setting, agentId, previousValue, newValue } as const;
  if (
    setting === "name" &&
    (previousValue === null || isWellFormedName(previousValue)) &&
    (newValue === null || isWellFormedName(newValue))
  )
    return { setting, agentId, previousValue, newValue } as const;
  if (setting === "tone" && isChatTone(previousValue) && isChatTone(newValue))
    return { setting, agentId, previousValue, newValue } as const;
  if (
    setting === "language" &&
    (previousValue === null || parseChoice(previousValue) !== null) &&
    (newValue === null || parseChoice(newValue) !== null)
  )
    return {
      setting,
      agentId,
      previousValue: previousValue as string | null,
      newValue: newValue as string | null,
    } as const;
  throw new Error("A recorded setting change could not be read back.");
}

/** The change's own id, which is the audit event's target. A row without one cannot be looked up. */
function changeIdOf(event: AuditEvent): string {
  if (event.targetId === null)
    throw new Error("A recorded setting change could not be read back.");
  return event.targetId;
}

/** Whether a change made at `createdAt` can still be undone at `now`: seven days, and no more. */
function withinUndoWindow(createdAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(createdAt) <= UNDO_WINDOW_MS;
}

export function createSettingChanges(deps: {
  database: Database;
  audit: AuditStore;
  reader: AuditReader;
  /** The clock the Undo window is measured by. The real clock unless a test gives another. */
  now?: () => Date;
}): SettingChanges {
  const { database, audit, reader } = deps;
  const clock = deps.now ?? (() => new Date());

  async function levelOf(
    ownerUserId: string,
    agentId: string,
  ): Promise<NotifyLevel> {
    const [row] = await database
      .select({ notify: botLifecycle.notify })
      .from(botLifecycle)
      .where(
        and(
          eq(botLifecycle.ownerUserId, ownerUserId),
          eq(botLifecycle.agentId, agentId),
        ),
      )
      .limit(1);
    // No row is the default, which is "all" (the column's own default).
    return row?.notify ?? "all";
  }

  /** Writes `to` only while the level is still `from`. Says whether it did. */
  async function swap(
    ownerUserId: string,
    agentId: string,
    from: NotifyLevel,
    to: NotifyLevel,
  ): Promise<boolean> {
    await database
      .insert(botLifecycle)
      .values({ ownerUserId, agentId })
      .onConflictDoNothing({
        target: [botLifecycle.ownerUserId, botLifecycle.agentId],
      });
    const rows = await database
      .update(botLifecycle)
      .set({ notify: to, updatedAt: sql`now()` })
      .where(
        and(
          eq(botLifecycle.ownerUserId, ownerUserId),
          eq(botLifecycle.agentId, agentId),
          eq(botLifecycle.notify, from),
        ),
      )
      .returning({ agentId: botLifecycle.agentId });
    return rows.length === 1;
  }

  /** The aliases this person gave their members, by member id. */
  async function aliasesOf(
    executor: Pick<Database, "select">,
    ownerUserId: string,
  ): Promise<Map<string, string>> {
    const rows = await executor
      .select({
        agentId: agentPreferences.agentId,
        name: agentPreferences.displayName,
      })
      .from(agentPreferences)
      .where(
        and(
          eq(agentPreferences.userId, ownerUserId),
          isNotNull(agentPreferences.displayName),
        ),
      );
    return new Map(
      rows.flatMap((row) =>
        isWellFormedName(row.name) ? [[row.agentId, row.name] as const] : [],
      ),
    );
  }

  /** The team members, which are the only ones a person names this way. */
  async function teamMembers(executor: Pick<Database, "select">) {
    return executor
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .innerJoin(agentProfiles, eq(agentProfiles.agentId, agents.id))
      .where(and(isNull(agentProfiles.deletedAt), isNotNull(agents.packageId)));
  }

  /** Serializes one person's name changes, so two together cannot both pass the check. */
  async function lockPerson(
    tx: Pick<Database, "execute">,
    ownerUserId: string,
  ) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`member-name:${ownerUserId}`}))`,
    );
  }

  /** Writes `to` as the alias only while it is still `from`. Says whether it did. */
  async function swapName(
    executor: Pick<Database, "insert" | "update">,
    ownerUserId: string,
    agentId: string,
    from: string | null,
    to: string | null,
  ): Promise<boolean> {
    await executor
      .insert(agentPreferences)
      .values({ userId: ownerUserId, agentId })
      .onConflictDoNothing({
        target: [agentPreferences.userId, agentPreferences.agentId],
      });
    const rows = await executor
      .update(agentPreferences)
      .set({ displayName: to })
      .where(
        and(
          eq(agentPreferences.userId, ownerUserId),
          eq(agentPreferences.agentId, agentId),
          from === null
            ? isNull(agentPreferences.displayName)
            : eq(agentPreferences.displayName, from),
        ),
      )
      .returning({ agentId: agentPreferences.agentId });
    return rows.length === 1;
  }

  const nameContextFor = (
    members: { id: string; name: string }[],
    aliases: Map<string, string>,
    target: { id: string; name: string },
  ) => ({
    realName: target.name,
    otherRealNames: members
      .filter((m) => m.id !== target.id)
      .map((m) => m.name),
    otherAliases: [...aliases]
      .filter(([id]) => id !== target.id)
      .map(([, n]) => n),
  });

  /** The one team member a person means, by id, real name or the name they gave it. Throws when none or several. */
  function resolveMember(
    members: { id: string; name: string }[],
    aliases: Map<string, string>,
    given: string,
  ): { id: string; name: string } {
    const reference = given.trim();
    const folded = foldName(reference);
    const matches = members.filter(
      (m) =>
        m.id === reference ||
        foldName(m.name) === folded ||
        foldName(aliases.get(m.id) ?? "\u0000") === folded,
    );
    const exact = matches.filter((m) => m.id === reference);
    const target =
      exact.length === 1
        ? exact[0]
        : matches.length === 1
          ? matches[0]
          : undefined;
    if (!target)
      throw new SettingRefusedError(
        matches.length > 1
          ? "More than one member fits that. Say which one."
          : "That is not a member of the team. You can rename a Bot you made yourself on its own page.",
        404,
      );
    return target;
  }

  /** The tones this person chose, by member id. A member not here is `plain`. */
  async function tonesOf(
    executor: Pick<Database, "select">,
    ownerUserId: string,
  ): Promise<Map<string, ChatTone>> {
    const rows = await executor
      .select({
        agentId: agentPreferences.agentId,
        tone: agentPreferences.tone,
      })
      .from(agentPreferences)
      .where(
        and(
          eq(agentPreferences.userId, ownerUserId),
          isNotNull(agentPreferences.tone),
        ),
      );
    return new Map(
      rows.flatMap((row) =>
        row.tone === "warm" || row.tone === "formal"
          ? [[row.agentId, row.tone] as const]
          : [],
      ),
    );
  }

  /** Writes tone `to` only while it is still `from`. `plain` is no stored value. Says whether it did. */
  async function swapTone(
    executor: Pick<Database, "insert" | "update">,
    ownerUserId: string,
    agentId: string,
    from: ChatTone,
    to: ChatTone,
  ): Promise<boolean> {
    await executor
      .insert(agentPreferences)
      .values({ userId: ownerUserId, agentId })
      .onConflictDoNothing({
        target: [agentPreferences.userId, agentPreferences.agentId],
      });
    const rows = await executor
      .update(agentPreferences)
      .set({ tone: to === "plain" ? null : to })
      .where(
        and(
          eq(agentPreferences.userId, ownerUserId),
          eq(agentPreferences.agentId, agentId),
          from === "plain"
            ? isNull(agentPreferences.tone)
            : eq(agentPreferences.tone, from),
        ),
      )
      .returning({ agentId: agentPreferences.agentId });
    return rows.length === 1;
  }

  async function undoTone(
    ownerUserId: string,
    changeId: string,
    recorded: { agentId: string; previousValue: ChatTone; newValue: ChatTone },
  ) {
    await database.transaction(async (tx) => {
      await lockPerson(tx, ownerUserId);
      const now =
        (await tonesOf(tx, ownerUserId)).get(recorded.agentId) ?? "plain";
      if (now !== recorded.newValue)
        throw new SettingRefusedError(
          `That tone has changed since, so nothing was undone. It is now ${now}.`,
          409,
        );
      await swapTone(
        tx,
        ownerUserId,
        recorded.agentId,
        recorded.newValue,
        recorded.previousValue,
      );
    });
    try {
      await recordAuditEvent(audit, {
        eventType: "configuration.changed",
        targetType: SETTING_UNDO_TARGET,
        targetId: changeId,
        actorUserId: ownerUserId,
        payload: {
          change: "setting_change_undone",
          changeId,
          setting: "tone",
          agentId: recorded.agentId,
          previousValue: recorded.newValue,
          newValue: recorded.previousValue,
        },
      });
    } catch (error) {
      await swapTone(
        database,
        ownerUserId,
        recorded.agentId,
        recorded.previousValue,
        recorded.newValue,
      );
      throw error;
    }
  }

  async function undoLanguage(
    ownerUserId: string,
    changeId: string,
    recorded: {
      agentId: string;
      previousValue: string | null;
      newValue: string | null;
    },
  ) {
    await database.transaction(async (tx) => {
      await lockPerson(tx, ownerUserId);
      const now = await readLanguageChoice(tx, ownerUserId);
      if (now !== recorded.newValue)
        throw new SettingRefusedError(
          `That language has changed since, so nothing was undone. It is now ${now ?? "the deployment's own"}.`,
          409,
        );
      await swapLanguageChoice(
        tx,
        ownerUserId,
        recorded.newValue,
        recorded.previousValue,
      );
    });
    try {
      await recordAuditEvent(audit, {
        eventType: "configuration.changed",
        targetType: SETTING_UNDO_TARGET,
        targetId: changeId,
        actorUserId: ownerUserId,
        payload: {
          change: "setting_change_undone",
          changeId,
          setting: "language",
          agentId: recorded.agentId,
          previousValue: recorded.newValue,
          newValue: recorded.previousValue,
        },
      });
    } catch (error) {
      await swapLanguageChoice(
        database,
        ownerUserId,
        recorded.previousValue,
        recorded.newValue,
      );
      throw error;
    }
  }

  async function undoName(
    ownerUserId: string,
    changeId: string,
    recorded: {
      agentId: string;
      previousValue: string | null;
      newValue: string | null;
    },
  ) {
    await database.transaction(async (tx) => {
      await lockPerson(tx, ownerUserId);
      const aliases = await aliasesOf(tx, ownerUserId);
      const now = aliases.get(recorded.agentId) ?? null;
      if (now !== recorded.newValue)
        throw new SettingRefusedError(
          `That name has changed since, so nothing was undone. It is now ${now ?? "the member's own name"}.`,
          409,
        );
      if (recorded.previousValue !== null) {
        const members = await teamMembers(tx);
        const target = members.find((m) => m.id === recorded.agentId);
        const check = target
          ? checkMemberName(
              recorded.previousValue,
              nameContextFor(members, aliases, target),
            )
          : null;
        if (!check?.ok)
          throw new SettingRefusedError(
            "The earlier name cannot be used any more, so nothing was undone.",
            409,
          );
      }
      await swapName(
        tx,
        ownerUserId,
        recorded.agentId,
        recorded.newValue,
        recorded.previousValue,
      );
    });
    try {
      await recordAuditEvent(audit, {
        eventType: "configuration.changed",
        targetType: SETTING_UNDO_TARGET,
        targetId: changeId,
        actorUserId: ownerUserId,
        payload: {
          change: "setting_change_undone",
          changeId,
          setting: "name",
          agentId: recorded.agentId,
          previousValue: recorded.newValue,
          newValue: recorded.previousValue,
        },
      });
    } catch (error) {
      await swapName(
        database,
        ownerUserId,
        recorded.agentId,
        recorded.previousValue,
        recorded.newValue,
      );
      throw error;
    }
  }

  return {
    async change(input) {
      const { ownerUserId, agentId, setting, value } = input;
      const previous = await levelOf(ownerUserId, agentId);
      if (previous === "none")
        throw new SettingRefusedError(
          "Notifications are set to none in the app, so only you can change them there.",
          409,
        );
      if (previous === value) return { status: "unchanged", setting, value };
      if (!(await swap(ownerUserId, agentId, previous, value)))
        throw new SettingRefusedError(
          "The setting changed a moment ago, so nothing was changed. Ask again to see what it is now.",
          409,
        );

      const changeId = randomUUID();
      try {
        await recordAuditEvent(audit, {
          eventType: "configuration.changed",
          targetType: SETTING_CHANGE_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          payload: {
            change: "setting_changed_in_chat",
            changeId,
            setting,
            agentId,
            previousValue: previous,
            newValue: value,
          },
        });
      } catch (error) {
        // A change with no record is not a change the person can undo, so it is taken back first.
        await swap(ownerUserId, agentId, value, previous);
        throw error;
      }
      return {
        status: "changed",
        changeId,
        agentId,
        setting,
        previousValue: previous,
        newValue: value,
      };
    },

    async changeName(input) {
      const { ownerUserId, callerId, value } = input;
      const outcome = await database.transaction(async (tx) => {
        await lockPerson(tx, ownerUserId);
        const members = await teamMembers(tx);
        const aliases = await aliasesOf(tx, ownerUserId);
        const target = resolveMember(
          members,
          aliases,
          input.member ?? callerId,
        );
        const check = checkMemberName(
          value,
          nameContextFor(members, aliases, target),
        );
        if (!check.ok) throw new SettingRefusedError(check.message, 409);
        const previous = aliases.get(target.id) ?? null;
        if (previous === check.value)
          return { status: "unchanged" as const, value: previous };
        if (
          !(await swapName(tx, ownerUserId, target.id, previous, check.value))
        )
          throw new SettingRefusedError(
            "The name changed a moment ago, so nothing was changed. Ask again.",
            409,
          );
        return {
          status: "changed" as const,
          target,
          previous,
          next: check.value,
        };
      });
      if (outcome.status === "unchanged") return outcome;
      const changeId = randomUUID();
      try {
        await recordAuditEvent(audit, {
          eventType: "configuration.changed",
          targetType: SETTING_CHANGE_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          payload: {
            change: "setting_changed_in_chat",
            changeId,
            setting: "name",
            // Identity stays real: the member's id and its own name, never the name this person gave it.
            agentId: outcome.target.id,
            agentName: outcome.target.name,
            previousValue: outcome.previous,
            newValue: outcome.next,
          },
        });
      } catch (error) {
        await swapName(
          database,
          ownerUserId,
          outcome.target.id,
          outcome.next,
          outcome.previous,
        );
        throw error;
      }
      return {
        status: "changed",
        changeId,
        agentId: outcome.target.id,
        setting: "name",
        previousValue: outcome.previous,
        newValue: outcome.next,
      };
    },

    async changeTone(input) {
      const { ownerUserId, callerId, value } = input;
      const outcome = await database.transaction(async (tx) => {
        await lockPerson(tx, ownerUserId);
        const members = await teamMembers(tx);
        const aliases = await aliasesOf(tx, ownerUserId);
        const target = resolveMember(
          members,
          aliases,
          input.member ?? callerId,
        );
        const previous =
          (await tonesOf(tx, ownerUserId)).get(target.id) ?? "plain";
        if (previous === value)
          return { status: "unchanged" as const, value: previous };
        if (!(await swapTone(tx, ownerUserId, target.id, previous, value)))
          throw new SettingRefusedError(
            "The tone changed a moment ago, so nothing was changed. Ask again.",
            409,
          );
        return { status: "changed" as const, target, previous, next: value };
      });
      if (outcome.status === "unchanged") return outcome;
      const changeId = randomUUID();
      try {
        await recordAuditEvent(audit, {
          eventType: "configuration.changed",
          targetType: SETTING_CHANGE_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          payload: {
            change: "setting_changed_in_chat",
            changeId,
            setting: "tone",
            agentId: outcome.target.id,
            agentName: outcome.target.name,
            previousValue: outcome.previous,
            newValue: outcome.next,
          },
        });
      } catch (error) {
        await swapTone(
          database,
          ownerUserId,
          outcome.target.id,
          outcome.next,
          outcome.previous,
        );
        throw error;
      }
      return {
        status: "changed",
        changeId,
        agentId: outcome.target.id,
        setting: "tone",
        previousValue: outcome.previous,
        newValue: outcome.next,
      };
    },

    async changeLanguage(input) {
      const { ownerUserId, callerId, value } = input;
      const outcome = await database.transaction(async (tx) => {
        await lockPerson(tx, ownerUserId);
        const previous = await readLanguageChoice(tx, ownerUserId);
        if (previous === value)
          return { status: "unchanged" as const, value: previous };
        if (!(await swapLanguageChoice(tx, ownerUserId, previous, value)))
          throw new SettingRefusedError(
            "The language changed a moment ago, so nothing was changed. Ask again.",
            409,
          );
        return { status: "changed" as const, previous, next: value };
      });
      if (outcome.status === "unchanged") return outcome;
      const changeId = randomUUID();
      try {
        await recordAuditEvent(audit, {
          eventType: "configuration.changed",
          targetType: SETTING_CHANGE_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          payload: {
            change: "setting_changed_in_chat",
            changeId,
            setting: "language",
            agentId: callerId,
            previousValue: outcome.previous,
            newValue: outcome.next,
          },
        });
      } catch (error) {
        await swapLanguageChoice(
          database,
          ownerUserId,
          outcome.next,
          outcome.previous,
        );
        throw error;
      }
      return {
        status: "changed",
        changeId,
        agentId: callerId,
        setting: "language",
        previousValue: outcome.previous,
        newValue: outcome.next,
      };
    },

    async undo(input) {
      const { ownerUserId, changeId } = input;
      const [change] = (
        await reader.list({
          eventType: "configuration.changed",
          targetType: SETTING_CHANGE_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          limit: 1,
        })
      ).events;
      if (!change)
        throw new SettingRefusedError(
          "There is no change of yours with that id.",
          404,
        );
      const [undone] = (
        await reader.list({
          eventType: "configuration.changed",
          targetType: SETTING_UNDO_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          limit: 1,
        })
      ).events;
      if (undone)
        throw new SettingRefusedError(
          "That change has already been undone.",
          409,
        );

      const recorded = recordOf(change.payload);
      if (!withinUndoWindow(change.createdAt, clock()))
        throw new SettingRefusedError(
          recorded.setting === "name"
            ? "That change is more than seven days old, so it can no longer be undone. You can still ask for the name you want."
            : recorded.setting === "tone"
              ? "That change is more than seven days old, so it can no longer be undone. You can still ask for the tone you want."
              : recorded.setting === "language"
                ? "That change is more than seven days old, so it can no longer be undone. You can still ask for the language you want."
                : "That change is more than seven days old, so it can no longer be undone. You can still set notifications on the Bot's own page.",
          409,
        );
      if (recorded.setting === "language") {
        await undoLanguage(ownerUserId, changeId, recorded);
        return {
          changeId,
          setting: "language" as const,
          value: recorded.previousValue,
        };
      }
      if (recorded.setting === "tone") {
        await undoTone(ownerUserId, changeId, recorded);
        return {
          changeId,
          setting: "tone" as const,
          value: recorded.previousValue,
        };
      }
      if (recorded.setting === "name") {
        await undoName(ownerUserId, changeId, recorded);
        return {
          changeId,
          setting: "name" as const,
          value: recorded.previousValue,
        };
      }
      if (
        !(await swap(
          ownerUserId,
          recorded.agentId,
          recorded.newValue,
          recorded.previousValue,
        ))
      ) {
        const now = await levelOf(ownerUserId, recorded.agentId);
        throw new SettingRefusedError(
          `That setting has changed since, so nothing was undone. It is now ${now}.`,
          409,
        );
      }
      try {
        await recordAuditEvent(audit, {
          eventType: "configuration.changed",
          targetType: SETTING_UNDO_TARGET,
          targetId: changeId,
          actorUserId: ownerUserId,
          payload: {
            change: "setting_change_undone",
            changeId,
            setting: recorded.setting,
            agentId: recorded.agentId,
            previousValue: recorded.newValue,
            newValue: recorded.previousValue,
          },
        });
      } catch (error) {
        await swap(
          ownerUserId,
          recorded.agentId,
          recorded.previousValue,
          recorded.newValue,
        );
        throw error;
      }
      return {
        changeId,
        setting: recorded.setting,
        value: recorded.previousValue,
      };
    },

    async list(input) {
      const { ownerUserId } = input;
      const { events } = await reader.list({
        eventType: "configuration.changed",
        targetType: SETTING_CHANGE_TARGET,
        actorUserId: ownerUserId,
        limit: CHANGE_LIST_LIMIT,
      });
      if (events.length === 0) return [];

      // Undone is read per change, under the person's own id, so the answer is exact for every row
      // on the page and not only for the undos that happen to be among the newest.
      const rows = await Promise.all(
        events.map(async (event) => {
          const changeId = changeIdOf(event);
          const { events: undos } = await reader.list({
            eventType: "configuration.changed",
            targetType: SETTING_UNDO_TARGET,
            targetId: changeId,
            actorUserId: ownerUserId,
            limit: 1,
          });
          return { event, changeId, undone: undos.length > 0 };
        }),
      );

      const levels = await database
        .select({ agentId: botLifecycle.agentId, notify: botLifecycle.notify })
        .from(botLifecycle)
        .where(eq(botLifecycle.ownerUserId, ownerUserId));
      // No row is the default, as in `levelOf`.
      const levelOfBot = new Map(
        levels.map((row) => [row.agentId, row.notify]),
      );
      const aliases = await aliasesOf(database, ownerUserId);
      const tones = await tonesOf(database, ownerUserId);
      const language = await readLanguageChoice(database, ownerUserId);
      const now = clock();

      return rows.map(({ event, changeId, undone }): SettingChangeRecord => {
        const recorded = recordOf(event.payload);
        // The setting still holds what this change set, so Undo would put the old value back. If a
        // later change moved it, Undo would refuse, so the list shows none.
        const stillSet =
          recorded.setting === "name"
            ? (aliases.get(recorded.agentId) ?? null) === recorded.newValue
            : recorded.setting === "language"
              ? language === recorded.newValue
              : recorded.setting === "tone"
                ? (tones.get(recorded.agentId) ?? "plain") === recorded.newValue
                : (levelOfBot.get(recorded.agentId) ?? "all") ===
                  recorded.newValue;
        const common = {
          changeId,
          agentId: recorded.agentId,
          at: event.createdAt,
          undone,
          undoable:
            !undone && withinUndoWindow(event.createdAt, now) && stillSet,
        };
        return recorded.setting === "name"
          ? { ...common, ...recorded }
          : { ...common, ...recorded };
      });
    },
  };
}
