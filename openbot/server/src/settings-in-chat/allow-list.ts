/**
 * The settings a member may change from chat (docs/design/settings-in-chat.md, slice 1).
 *
 * THE LIST IS CODE. The server decides from the names below and from nothing else: never from what the
 * model says, and never from a name that merely contains a listed one. Every name is matched exactly. A
 * setting that is not here is refused in the same plain sentence whatever it is called, and the person
 * changes it in the app.
 *
 * Decided on 14 November 2026: only harmless settings can be changed from chat. Slice 1 holds one, how
 * much a Bot may interrupt the person. `none` is the person's own choice in the app, so a member cannot
 * set it. Routines and triggers are not here (D35: a card every time), and nothing about approvals, Full
 * access, connections, grants, the computer, the browser, the network, payments or credentials is ever
 * listed.
 */

/** The settings a member may change from chat. Matched exactly. */
export const CHAT_SETTING_NAMES = ["notifications"] as const;
export type ChatSettingName = (typeof CHAT_SETTING_NAMES)[number];

/** The values a member may give `notifications`: everything, or questions and approvals only. */
export const CHAT_NOTIFY_VALUES = ["all", "needs_input"] as const;
export type ChatNotifyValue = (typeof CHAT_NOTIFY_VALUES)[number];

/** The one sentence every refusal of a setting that is not on the list gives, whatever the name. */
export const NOT_ON_THE_LIST =
  "That setting cannot be changed from chat. Only you can change it, in the app's settings.";

export type SettingRequest =
  | { ok: true; setting: ChatSettingName; value: ChatNotifyValue }
  | { ok: false; message: string };

function isChatSettingName(value: string): value is ChatSettingName {
  return (CHAT_SETTING_NAMES as readonly string[]).includes(value);
}

function isChatNotifyValue(value: unknown): value is ChatNotifyValue {
  return (
    typeof value === "string" &&
    (CHAT_NOTIFY_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Whether a member may make this change, and the exact setting and value to write, or the sentence
 * that says why not. Nothing here reads a value the model did not give, and nothing is widened.
 */
export function decideSettingRequest(
  setting: unknown,
  value: unknown,
): SettingRequest {
  if (typeof setting !== "string" || setting.trim() === "")
    return { ok: false, message: "Say which setting to change." };
  if (!isChatSettingName(setting))
    return { ok: false, message: NOT_ON_THE_LIST };
  if (value === "none")
    return {
      ok: false,
      message:
        "none is set in the app, not from chat. Only you can choose it there.",
    };
  if (!isChatNotifyValue(value))
    return {
      ok: false,
      message: "Notifications can only be set to all or needs_input from chat.",
    };
  return { ok: true, setting, value };
}
