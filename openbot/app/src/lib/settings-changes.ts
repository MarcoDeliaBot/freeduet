import { queryOptions } from "@tanstack/react-query";
import {
  type ChatNotifyLevel,
  isChatNotifyLevel,
  SETTING_CHANGES_PATH,
  type SettingChangeRecord,
} from "@openbot/shared/setting-change";
import { client, tryClient } from "@/lib/client";

/*
 * The person's own changes made from chat, and the Undo of one (docs/design/settings-in-chat.md, section 8).
 *
 * Both places that show a change read one query: the card under the reply that made it, and the Changes
 * made in chat list in Settings. So an Undo pressed in either place shows in the other after the list is
 * read again.
 */

export const settingChangesKey = ["settings-changes"] as const;

export function settingChangesQueryOptions() {
  return queryOptions({
    queryKey: settingChangesKey,
    queryFn: (): Promise<SettingChangeRecord[]> =>
      client(SETTING_CHANGES_PATH, "changes", {
        fallback: "Could not load the changes made in chat.",
      }),
  });
}

/**
 * What an Undo came back with. A refusal is an answer and not a failure: the server has said why, and the
 * caller shows its sentence. `refused` says it will not change, so the caller takes Undo away.
 */
export type UndoAnswer =
  | { undone: true; value: ChatNotifyLevel }
  | {
      undone: false;
      refused: boolean;
      /** The server's own plain sentence, or null when it reached no answer at all. */
      message: string | null;
    };

/** Puts one change back through the person's own Undo route. A network failure is a failure, not a refusal. */
export async function undoSettingChange(changeId: string): Promise<UndoAnswer> {
  let response: Response;
  try {
    response = await tryClient(
      `${SETTING_CHANGES_PATH}/${encodeURIComponent(changeId)}/undo`,
      { method: "POST" },
    );
  } catch {
    return { undone: false, refused: false, message: null };
  }
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (response.ok) {
    const value = body?.value;
    return isChatNotifyLevel(value)
      ? { undone: true, value }
      : { undone: false, refused: false, message: null };
  }
  return {
    undone: false,
    refused: response.status === 404 || response.status === 409,
    message: typeof body?.error === "string" ? body.error : null,
  };
}
