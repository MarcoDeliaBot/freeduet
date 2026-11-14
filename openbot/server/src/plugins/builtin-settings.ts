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
      "Change one of this person's settings. There are four.",
      "`notifications`: how much this Bot may interrupt the person. Its value is `all` (everything) or",
      "`needs_input` (questions and approvals only).",
      "`name`: what this person calls a member of the team, shown to this person only (the member keeps its",
      "own name everywhere else). Its value is the name, 1 to 40 letters, numbers and spaces. Give `member`",
      "(the member's own name) when the person means another member than you; leave it out for yourself.",
      "Giving a member its own name back clears the name the person chose.",
      "`tone`: how a member talks to this person. Its value is `plain` (the default), `warm` or `formal`. It",
      "changes only the member's own messages to this person, never emails or documents for others, safety",
      "rules, or the wording of approvals. Give `member` as for `name`. `plain` clears the choice.",
      "`language`: the language this person reads, one for the whole team (not per member). Its value is a",
      "two-letter code such as `it` or `en`, or the language's English name, or `default` for the",
      "deployment's own. It tells members which language to write in; the app's own cards are not",
      "translated by it.",
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
            "The setting's name: `notifications`, `name`, `tone` or `language`.",
        },
        member: {
          type: "string",
          description:
            "For `name` and `tone` only: the team member, by its own name. Absent means the Bot making the call.",
        },
        value: {
          type: "string",
          description:
            "The new value. For `notifications`: `all` or `needs_input`. For `tone`: `plain`, `warm` or `formal`. For `language`: a two-letter code, an English name, or `default`.",
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

  const decision = decideSettingRequest(args.setting, args.value, args.member);
  if (!decision.ok) return failure(decision.message);

  const changes = installed;
  if (!changes)
    return failure(
      "Changing settings from chat is not available in this deployment.",
    );

  try {
    if (decision.setting === "name") {
      const named = await changes.changeName({
        ownerUserId,
        callerId: agentId,
        member: decision.member,
        value: decision.value,
      });
      if (named.status === "unchanged")
        return {
          text: "That member already has that name for this person, so nothing changed.",
          isError: false,
          truncated: false,
        };
      return {
        text: settingChangeResult(
          {
            changeId: named.changeId,
            agentId: named.agentId,
            setting: "name",
            previousValue: named.previousValue,
            newValue: named.newValue,
          },
          `Done: the person now sees this member as ${named.newValue ?? "its own name"}. Nobody else does, and you still call it by its own name. The change is recorded as ${named.changeId}, so it can be undone.`,
        ),
        isError: false,
        truncated: false,
      };
    }
    if (decision.setting === "language") {
      const spoken = await changes.changeLanguage({
        ownerUserId,
        callerId: agentId,
        value: decision.value,
      });
      if (spoken.status === "unchanged")
        return {
          text: "That is already this person's language for the team, so nothing changed.",
          isError: false,
          truncated: false,
        };
      return {
        text: settingChangeResult(
          {
            changeId: spoken.changeId,
            agentId: spoken.agentId,
            setting: "language",
            previousValue: spoken.previousValue,
            newValue: spoken.newValue,
          },
          `Done: this person's language for the team is now ${spoken.newValue ?? "the deployment's own"}. It applies from the next message. Cards drawn by the app keep the language they have. The change is recorded as ${spoken.changeId}, so it can be undone.`,
        ),
        isError: false,
        truncated: false,
      };
    }
    if (decision.setting === "tone") {
      const toned = await changes.changeTone({
        ownerUserId,
        callerId: agentId,
        member: decision.member,
        value: decision.value,
      });
      if (toned.status === "unchanged")
        return {
          text: `That member already talks to this person in a ${toned.value} tone, so nothing changed.`,
          isError: false,
          truncated: false,
        };
      return {
        text: settingChangeResult(
          {
            changeId: toned.changeId,
            agentId: toned.agentId,
            setting: "tone",
            previousValue: toned.previousValue,
            newValue: toned.newValue,
          },
          `Done: the tone is now ${toned.newValue}. It applies from the next message, to this member's own messages to this person only. The change is recorded as ${toned.changeId}, so it can be undone.`,
        ),
        isError: false,
        truncated: false,
      };
    }
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
