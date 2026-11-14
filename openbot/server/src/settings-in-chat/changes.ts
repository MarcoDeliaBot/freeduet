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
import { and, eq, sql } from "drizzle-orm";
import type { AuditReader, AuditStore } from "../audit";
import { recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { botLifecycle } from "../db/schema/lifecycle";
import type { ChatNotifyValue, ChatSettingName } from "./allow-list";

/** The audit target of a change, and of the Undo of one. Free-form strings the reader filters on. */
export const SETTING_CHANGE_TARGET = "bot_setting";
export const SETTING_UNDO_TARGET = "bot_setting_undo";

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
      setting: ChatSettingName;
      previousValue: NotifyLevel;
      newValue: ChatNotifyValue;
    }
  | { status: "unchanged"; setting: ChatSettingName; value: ChatNotifyValue };

export type SettingUndoOutcome = {
  changeId: string;
  setting: ChatSettingName;
  /** The value the Undo put back: exactly the one the change replaced. */
  value: NotifyLevel;
};

export type SettingChanges = {
  change(input: {
    ownerUserId: string;
    agentId: string;
    setting: ChatSettingName;
    value: ChatNotifyValue;
  }): Promise<SettingChangeOutcome>;
  undo(input: {
    ownerUserId: string;
    changeId: string;
  }): Promise<SettingUndoOutcome>;
};

function isNotifyLevel(value: unknown): value is NotifyLevel {
  return value === "all" || value === "needs_input" || value === "none";
}

/** The fields a recorded change holds, read back from its audit event. Anything else is unreadable. */
function recordOf(payload: Record<string, unknown>) {
  const { setting, agentId, previousValue, newValue } = payload;
  if (
    setting !== "notifications" ||
    typeof agentId !== "string" ||
    !isNotifyLevel(previousValue) ||
    !isNotifyLevel(newValue)
  )
    throw new Error("A recorded setting change could not be read back.");
  return {
    setting: "notifications" as const,
    agentId,
    previousValue,
    newValue,
  };
}

export function createSettingChanges(deps: {
  database: Database;
  audit: AuditStore;
  reader: AuditReader;
}): SettingChanges {
  const { database, audit, reader } = deps;

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
        setting,
        previousValue: previous,
        newValue: value,
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
  };
}
