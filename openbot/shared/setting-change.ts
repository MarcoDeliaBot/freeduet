/**
 * A change to one of the person's settings made from chat, and the Undo that puts it back
 * (docs/design/settings-in-chat.md, section 8).
 *
 * The contract between the connector that makes the change (`server/src/plugins/builtin-settings.ts`),
 * the Undo route and the change list (`server/src/settings-in-chat/`), and the app that draws them
 * (`app/src/freeduet/setting-change-card.tsx`, `app/src/components/settings/chat-changes.tsx`). It lives
 * in one file so the three cannot drift.
 *
 * WHAT TRAVELS. Which Bot, which setting, the value it had, the value it has now, and the id of the
 * change. Nothing else: no credential, and no setting the chat list does not hold.
 */

/** The tool a Bot calls to make the change. The card is drawn from its result. */
export const CHANGE_SETTING_TOOL = "change_setting";

/** The routes: the list is read at this path, and one change is undone at `${path}/:changeId/undo`. */
export const SETTING_CHANGES_PATH = "/api/settings-changes";

/**
 * The two levels a change from chat can set or take back. `none` is the person's own choice in the
 * app, so a chat change never starts from it or ends on it (server/src/settings-in-chat/allow-list.ts).
 */
export type ChatNotifyLevel = "all" | "needs_input";

/** What a successful change tells the card: the change, the Bot, and the value before and after it. */
export type SettingChangeResult = {
  changeId: string;
  agentId: string;
  setting: "notifications";
  previousValue: ChatNotifyLevel;
  newValue: ChatNotifyLevel;
};

/** One change in the list, newest first. Undo is shown only where `undoable` says so. */
export type SettingChangeRecord = SettingChangeResult & {
  /** When the change was made, as the server's ISO time. */
  at: string;
  /** Whether the person has already undone it. */
  undone: boolean;
  /**
   * Whether Undo would put the value back now: the change is not undone, it is within seven days, and
   * the setting still holds the value the change set. The server decides it; the app only shows it.
   */
  undoable: boolean;
};

/**
 * The tool's success result: the change the card is drawn from, and a note that is for the member.
 * A refusal, or a change that changed nothing, is a sentence instead and draws no card.
 */
export function settingChangeResult(
  change: SettingChangeResult,
  note: string,
): string {
  return JSON.stringify({ ...change, note });
}

export function isChatNotifyLevel(value: unknown): value is ChatNotifyLevel {
  return value === "all" || value === "needs_input";
}

const CHANGE_ID_MAX = 200;
const AGENT_ID_MAX = 200;

/** The card's change out of the tool's result text, or null for a refusal or anything else. */
export function readSettingChange(result: unknown): SettingChangeResult | null {
  if (typeof result !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(result);
    // A server tool's text can arrive JSON-encoded once more on the way through the runtime.
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { changeId, agentId, setting, previousValue, newValue } =
    value as Record<string, unknown>;
  if (
    typeof changeId !== "string" ||
    changeId.length === 0 ||
    changeId.length > CHANGE_ID_MAX ||
    typeof agentId !== "string" ||
    agentId.length === 0 ||
    agentId.length > AGENT_ID_MAX ||
    setting !== "notifications" ||
    !isChatNotifyLevel(previousValue) ||
    !isChatNotifyLevel(newValue)
  )
    return null;
  return { changeId, agentId, setting, previousValue, newValue };
}
