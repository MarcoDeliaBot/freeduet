/**
 * The builtin transport for Settings in chat (docs/design/settings-in-chat.md, slice 1): one tool, with
 * which a Bot changes a setting the person has handed to chat, and only a setting on the list.
 *
 * WHAT THE SERVER DECIDES, NOT THE MODEL. Whose setting it is comes from the connection, the actor and
 * the Bot, and never from `args`. Whether the setting may be changed at all comes from the list in
 * `settings-in-chat/allow-list.ts`, matched exactly. The gate holds every call to this connector to a
 * card (`changesSetting`, freeduet/always-ask.ts), so Full access does not lift a change.
 *
 * It implements the transport interface as module-level exports, as `builtin-routines.ts` does, because
 * `transportFor` resolves a kind to a module. The store arrives once, through {@link useSettingsTools}.
 */
import {
  CHANGE_SETTING_TOOL,
  settingChangeResult,
} from "@openbot/shared/setting-change";
import { decideSettingRequest } from "../settings-in-chat/allow-list";
import {
  type SettingChanges,
  SettingRefusedError,
} from "../settings-in-chat/changes";
import type { McpCallResult, McpTool } from "./mcp";

export { CHANGE_SETTING_TOOL };

let installed: SettingChanges | null = null;

/**
 * Hand this module the change service, once, from the place that builds it. `null` takes it back out,
 * so a test that installs one can leave the module as it found it.
 */
export function useSettingsTools(changes: SettingChanges | null): void {
  installed = changes;
}

const TOOLS: readonly McpTool[] = Object.freeze([
  {
    name: CHANGE_SETTING_TOOL,
    description: [
      "Change one of this person's settings. The only setting here is `notifications`: how much this Bot",
      "may interrupt the person. Its value is `all` (everything) or `needs_input` (questions and approvals only).",
      "",
      "Use it only when the person has asked for that change in their own words. Every change asks the",
      "person to allow it on a card first, and nothing changes until they do. The change is recorded with the",
      "value it replaced, so it can be undone.",
      "",
      "Every other setting is not yours to change, whatever its name: approvals, Full access, connections,",
      "grants, the computers and browsers, routines, triggers, payments and credentials. Tell the person that",
      "they change those themselves in the app's settings, and do not try another name for them.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        setting: {
          type: "string",
          description:
            "The setting's name. The only one here is `notifications`.",
        },
        value: {
          type: "string",
          description:
            "The new value. For `notifications`: `all` or `needs_input`.",
        },
      },
      required: ["setting", "value"],
    },
  },
]);

/** Who this call is for, and which Bot is making it. `url` and `token` are unused: there is no host. */
type Connection = {
  url: string;
  token?: string;
  actorId?: string;
  botId?: string;
};

/** The list is this build's code, so listing needs no actor and asks no vendor. */
export async function listTools(): Promise<McpTool[]> {
  return TOOLS.map((tool) => ({ ...tool }));
}

export const listNeedsCredential = false;

const failure = (message: string): McpCallResult => ({
  text: message,
  isError: true,
  truncated: false,
});

/**
 * Call the change tool. A refusal is a sentence the model can repeat, returned as an error result rather
 * than thrown, the same way the Routines transport returns its refusals.
 */
export async function callTool(
  connection: Connection,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const ownerUserId = connection.actorId?.trim();
  if (!ownerUserId)
    return failure(
      "A setting belongs to somebody, and this run is not attributed to anybody.",
    );
  const agentId = connection.botId?.trim();
  if (!agentId)
    return failure(
      "A setting is changed for a Bot, and this run does not name one.",
    );
  if (toolName !== CHANGE_SETTING_TOOL)
    return failure(
      `${toolName} is not a tool that settings in chat implements. The stored tool list is out of date; refresh it on the Plugins page.`,
    );

  const decision = decideSettingRequest(args.setting, args.value);
  if (!decision.ok) return failure(decision.message);

  const changes = installed;
  if (!changes)
    return failure(
      "Changing settings from chat is not available in this deployment.",
    );

  try {
    const outcome = await changes.change({
      ownerUserId,
      agentId,
      setting: decision.setting,
      value: decision.value,
    });
    if (outcome.status === "unchanged")
      return {
        text: `Notifications for this Bot are already ${outcome.value}, so nothing changed.`,
        isError: false,
        truncated: false,
      };
    // The card in the app is drawn from this result (shared/setting-change.ts), so it is structured. The
    // note is the sentence the member reads.
    return {
      text: settingChangeResult(
        {
          changeId: outcome.changeId,
          agentId: outcome.agentId,
          setting: outcome.setting,
          previousValue: outcome.previousValue,
          newValue: outcome.newValue,
        },
        `Done: notifications for this Bot went from ${outcome.previousValue} to ${outcome.newValue}. The change is recorded as ${outcome.changeId}, so it can be undone.`,
      ),
      isError: false,
      truncated: false,
    };
  } catch (error) {
    if (error instanceof SettingRefusedError) return failure(error.message);
    const message = error instanceof Error ? error.message : String(error);
    return failure(Array.from(message).slice(0, 300).join(""));
  }
}
