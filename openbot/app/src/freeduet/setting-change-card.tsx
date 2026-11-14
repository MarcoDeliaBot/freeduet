import { useRenderTool } from "@copilotkit/react-core/v2";
import {
  CHANGE_SETTING_TOOL,
  type ChatNotifyLevel,
  type SettingChangeResult,
  readSettingChange,
} from "@openbot/shared/setting-change";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { ToolLine } from "@/components/channels/tool-line";
import { DuetCard, Tile } from "@/components/duet/kit";
import { useBotNames } from "@/lib/agents/bot-names";
import {
  settingChangesKey,
  settingChangesQueryOptions,
  undoSettingChange,
} from "@/lib/settings-changes";
import type { CardTextId } from "./person-language/cards";
import { useCardText } from "./person-language/use-card-text";

/*
 * Draws the connector's `change_setting` tool (server/src/plugins/builtin-settings.ts) as the card a Bot
 * leaves under its words after it changed a setting the person allowed (docs/design/settings-in-chat.md,
 * section 8): what changed, from what to what, and an Undo. The contract with the tool is
 * shared/setting-change.ts.
 *
 * UNDO IS THE SERVER'S. The button calls the person's own route (`POST /api/settings-changes/:id/undo`).
 * Its answer is the card's: "Undone", or the route's own sentence when it refuses (already undone, a later
 * change, a change older than seven days, not the person's own), and then no Undo. A failure that reached
 * no answer keeps the button, so the person can try again.
 *
 * AFTER A RELOAD, THE LIST DECIDES. The card reads the same list as the Settings page. A change the list
 * says is undone shows as undone, and one it says cannot be undone shows no button, so a reloaded
 * conversation never offers an Undo that the server would refuse. A change not in the list (only the
 * newest twenty are) keeps the button, and its refusal is the route's sentence.
 */

const parameters = z.object({
  setting: z.string().optional(),
  value: z.string().optional(),
});

/** The card's words for a notification level. */
function levelText(level: ChatNotifyLevel): CardTextId {
  return level === "all" ? "setting.level.all" : "setting.level.needs_input";
}

type CardState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "undone" }
  /** The route refused for good: its sentence is shown and there is no Undo any more. */
  | { kind: "refused"; message: string }
  /** No answer came back: the button stays, so the person can try again. */
  | { kind: "failed" };

/** The card for one change a Bot made from chat. */
export function SettingChangeCard({ change }: { change: SettingChangeResult }) {
  const t = useCardText();
  const botName = useBotNames();
  const queryClient = useQueryClient();
  const list = useQuery(settingChangesQueryOptions());
  const [state, setState] = useState<CardState>({ kind: "idle" });

  const listed = list.data?.find((row) => row.changeId === change.changeId);
  const undone = state.kind === "undone" || listed?.undone === true;
  const refused = state.kind === "refused";
  const noLongerUndoable =
    !undone && !refused && listed !== undefined && !listed.undoable;
  const canUndo = !undone && !refused && !noLongerUndoable;
  const busy = state.kind === "busy";
  const from = t(levelText(change.previousValue));
  const to = t(levelText(change.newValue));

  async function undo() {
    setState({ kind: "busy" });
    const answer = await undoSettingChange(change.changeId);
    if (answer.undone) setState({ kind: "undone" });
    else if (answer.refused)
      setState({
        kind: "refused",
        message: answer.message ?? t("setting.couldNotUndo"),
      });
    else setState({ kind: "failed" });
    // Whatever the answer, the list is read again: the Settings page shows the same change.
    void queryClient.invalidateQueries({ queryKey: settingChangesKey });
  }

  return (
    <DuetCard
      aria-label={t("setting.heading")}
      className="px-4 py-3"
      role="region"
    >
      <div className="flex items-center gap-3">
        <Tile icon="bell" />
        <div className="min-w-0 flex-1">
          <p className="type-row font-semibold">{t("setting.heading")}</p>
          <p className="type-label text-duet-ink-3">
            {t("setting.change", {
              bot: botName(change.agentId),
              from,
              to,
            })}
          </p>
          {undone ? (
            <p
              className="type-label mt-1 font-semibold text-duet-green"
              role="status"
            >
              {t("setting.undone", { value: from })}
            </p>
          ) : null}
          {noLongerUndoable ? (
            <p className="type-label mt-1 text-duet-ink-3">
              {t("setting.noLongerUndoable")}
            </p>
          ) : null}
        </div>
        {canUndo ? (
          <button
            className="type-label min-h-11 shrink-0 rounded-full bg-duet-black px-4 py-2 font-semibold text-duet-on-black transition-[filter,transform,opacity] hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-violet/40 active:scale-[0.98] disabled:opacity-50"
            disabled={busy}
            onClick={undo}
            type="button"
          >
            {busy ? t("setting.undoing") : t("setting.undo")}
          </button>
        ) : null}
      </div>
      {state.kind === "refused" ? (
        <p className="type-label mt-2 text-duet-red" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "failed" ? (
        <p className="type-label mt-2 text-duet-red" role="alert">
          {t("setting.couldNotUndo")}
        </p>
      ) : null}
    </DuetCard>
  );
}

/** The tool's line while the server makes the change: its own component, so it can read the card language. */
function ChangingLine() {
  const t = useCardText();
  return <ToolLine label={t("setting.running")} running />;
}

export function SettingChangeTool() {
  useRenderTool({
    name: CHANGE_SETTING_TOOL,
    parameters,
    render: ({ result, status }) => {
      if (status !== "complete" && result === undefined)
        return <ChangingLine />;
      const change = readSettingChange(result);
      // Nothing for a refusal, or for a change that changed nothing: the member says so in its own words.
      return change ? <SettingChangeCard change={change} /> : null;
    },
  });
  return null;
}
