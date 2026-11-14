import { IconBell } from "@tabler/icons-react";
import type {
  ChatNotifyLevel,
  SettingChangeRecord,
} from "@openbot/shared/setting-change";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useBotNames } from "@/lib/agents/bot-names";
import {
  settingChangesKey,
  settingChangesQueryOptions,
  undoSettingChange,
} from "@/lib/settings-changes";

/*
 * "Changes made in chat": every notification change a Bot made from chat, newest first, with Undo where
 * Undo still works (docs/design/settings-in-chat.md, section 8). It sits on the Notifications page, where
 * the person sets how their Bots reach them. The list is the person's own; the server reads it for them
 * alone. Its words are English, like the rest of the Settings page; the card in the chat is the one that
 * follows the person's language.
 */

const LEVEL: Record<ChatNotifyLevel, string> = {
  all: "everything",
  needs_input: "only when it needs you",
};

const UNDO_FAILED = "Couldn't undo the change. Try again.";

type RowState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "undone" }
  /** The server refused for good: its sentence is shown and Undo is gone. */
  | { kind: "refused"; message: string }
  /** No answer came back: Undo stays, so the person can try again. */
  | { kind: "failed" };

function ChangeRow({
  change,
  botName,
}: {
  change: SettingChangeRecord;
  botName: string;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const undone = change.undone || state.kind === "undone";
  const showUndo = !undone && change.undoable && state.kind !== "refused";

  async function undo() {
    setState({ kind: "busy" });
    const answer = await undoSettingChange(change.changeId);
    if (answer.undone) setState({ kind: "undone" });
    else if (answer.refused)
      setState({ kind: "refused", message: answer.message ?? UNDO_FAILED });
    else setState({ kind: "failed" });
    void queryClient.invalidateQueries({ queryKey: settingChangesKey });
  }

  const status = undone
    ? "Undone"
    : change.undoable
      ? null
      : "Undo is no longer possible";

  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        <IconBell />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {botName}: notifications went from {LEVEL[change.previousValue]} to{" "}
          {LEVEL[change.newValue]}
        </ItemTitle>
        <ItemDescription>
          {new Date(change.at).toLocaleString()}
          {status ? ` · ${status}` : null}
        </ItemDescription>
        {state.kind === "refused" ? (
          <ItemDescription className="line-clamp-none text-destructive">
            {state.message}
          </ItemDescription>
        ) : null}
        {state.kind === "failed" ? (
          <ItemDescription className="line-clamp-none text-destructive">
            {UNDO_FAILED}
          </ItemDescription>
        ) : null}
      </ItemContent>
      {showUndo ? (
        <ItemActions>
          <Button
            disabled={state.kind === "busy"}
            onClick={undo}
            size="sm"
            variant="outline"
          >
            {state.kind === "busy" ? "Undoing…" : "Undo"}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function ChatChangesSection() {
  const list = useQuery(settingChangesQueryOptions());
  const botName = useBotNames();
  return (
    <PageSection
      description="Settings a Bot changed from chat. Undo puts the old value back for seven days, and only while the setting still holds the value the change set."
      title="Changes made in chat"
    >
      {list.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {list.error.message}
        </p>
      ) : null}
      {list.isPending ? (
        <p className="mt-4 text-muted-foreground text-sm" role="status">
          Loading changes…
        </p>
      ) : null}
      {list.data && list.data.length === 0 ? (
        <PageEmpty>No changes made in chat yet.</PageEmpty>
      ) : null}
      {list.data && list.data.length > 0 ? (
        <PageRows>
          {list.data.map((change, index) => (
            <Fragment key={change.changeId}>
              {index > 0 ? <Separator /> : null}
              <ChangeRow botName={botName(change.agentId)} change={change} />
            </Fragment>
          ))}
        </PageRows>
      ) : null}
    </PageSection>
  );
}
