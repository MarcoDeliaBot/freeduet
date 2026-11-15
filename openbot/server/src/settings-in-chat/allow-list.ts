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

import { languageCodeFrom } from "../freeduet/person-language";
import {
  CHAT_TONES,
  type ChatTone,
  isChatTone,
} from "@openbot/shared/setting-change";

/** The settings a member may change from chat. Matched exactly. */
export const CHAT_SETTING_NAMES = [
  "notifications",
  "name",
  "tone",
  "language",
] as const;
export type ChatSettingName = (typeof CHAT_SETTING_NAMES)[number];

/** The values a member may give `notifications`: everything, or questions and approvals only. */
export const CHAT_NOTIFY_VALUES = ["all", "needs_input"] as const;
export type ChatNotifyValue = (typeof CHAT_NOTIFY_VALUES)[number];

/** The three tones a member may be given from chat (docs/design/settings-in-chat.md, 8.10.2). */
export const CHAT_TONE_VALUES = CHAT_TONES;

/** The one sentence every refusal of a setting that is not on the list gives, whatever the name. */
export const NOT_ON_THE_LIST =
  "That setting cannot be changed from chat. Only you can change it, in the app's settings.";

export type SettingRequest =
  | { ok: true; setting: "notifications"; value: ChatNotifyValue }
  /**
   * A name for a team member, as this person sees it. `member` is the member's id or real name as the
   * model wrote it, or absent for the Bot making the call; the server resolves it against the people's
   * roster. `value` is checked by `member-name.ts`, not here.
   */
  | { ok: true; setting: "name"; value: string; member: string | undefined }
  /**
   * How a team member talks to this person: `plain` (the default), `warm` or `formal`. `member` is as for
   * `name`. Three fixed values and nothing else.
   */
  | { ok: true; setting: "tone"; value: ChatTone; member: string | undefined }
  /**
   * The language this person reads, one for the whole team: a two-letter code from the list D26 accepts, or
   * `null` for `default`, the deployment's own. Never per member.
   */
  | { ok: true; setting: "language"; value: string | null }
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
  member?: unknown,
): SettingRequest {
  if (typeof setting !== "string" || setting.trim() === "")
    return { ok: false, message: "Say which setting to change." };
  if (!isChatSettingName(setting))
    return { ok: false, message: NOT_ON_THE_LIST };
  if (setting === "name") {
    if (typeof value !== "string" || value.trim() === "")
      return { ok: false, message: "Say which name to use." };
    if (member !== undefined && (typeof member !== "string" || !member.trim()))
      return { ok: false, message: "Say which member to name." };
    return {
      ok: true,
      setting: "name",
      value,
      member: typeof member === "string" ? member.trim() : undefined,
    };
  }
  if (setting === "language") {
    const code = languageCodeFrom(value);
    if (code === undefined)
      return {
        ok: false,
        message:
          "Say a language by its two-letter code or its English name, such as it or German, or default for the deployment's own language.",
      };
    return { ok: true, setting: "language", value: code };
  }
  if (setting === "tone") {
    if (!isChatTone(value))
      return {
        ok: false,
        message: "A tone can only be plain, warm or formal.",
      };
    if (member !== undefined && (typeof member !== "string" || !member.trim()))
      return { ok: false, message: "Say which member to change." };
    return {
      ok: true,
      setting: "tone",
      value,
      member: typeof member === "string" ? member.trim() : undefined,
    };
  }
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
