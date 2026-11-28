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
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import { useBotLabels, useBotNames } from "@/lib/agents/bot-names";
import {
  settingChangesKey,
  settingChangesQueryOptions,
  undoSettingChange,
} from "@/lib/settings-changes";

/*
 * "Changes made in chat": every notification change a Bot made from chat, newest first, with Undo where
 * Undo still works (docs/design/settings-in-chat.md, section 8). It sits on the Notifications page, where
 * the person sets how their Bots reach them. The list is the person's own; the server reads it for them
 * alone. Its words come from the app's catalogue (D181), like the rest of the Settings page; the card in the
 * chat is the one that follows the person's language.
 */

const LEVEL: Record<ChatNotifyLevel, MessageId> = {
  all: "settings.levelAll",
  needs_input: "settings.levelNeedsInput",
};

/** Local time to the second, as `Date.prototype.toLocaleString()` drew it, in the app's language. */
const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
};

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
  const { t, date } = useAppLanguage();
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const undone = change.undone || state.kind === "undone";
  const showUndo = !undone && change.undoable && state.kind !== "refused";

  async function undo() {
    setState({ kind: "busy" });
    const answer = await undoSettingChange(change.changeId);
    if (answer.undone) setState({ kind: "undone" });
    else if (answer.refused)
      setState({
        kind: "refused",
        message: answer.message ?? t("settings.undoFailed"),
      });
    else setState({ kind: "failed" });
    void queryClient.invalidateQueries({ queryKey: settingChangesKey });
  }

  const status = undone
    ? t("settings.undone")
    : change.undoable
      ? null
      : t("settings.undoGone");

  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        <IconBell />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {change.setting === "member"
            ? t("settings.memberAdded", { member: String(change.newValue) })
            : change.setting === "name"
              ? t("settings.nameChanged", {
                  bot: botName,
                  from: change.previousValue ?? t("settings.nameOwn"),
                  to: change.newValue ?? t("settings.nameOwn"),
                })
              : change.setting === "language"
                ? t("settings.languageChanged", {
                    from: change.previousValue ?? t("settings.deploymentOwn"),
                    to: change.newValue ?? t("settings.deploymentOwn"),
                  })
                : change.setting === "tone"
                  ? t("settings.toneChanged", {
                      bot: botName,
                      from: String(change.previousValue),
                      to: String(change.newValue),
                    })
                  : t("settings.notifyChanged", {
                      bot: botName,
                      from: t(LEVEL[change.previousValue]),
                      to: t(LEVEL[change.newValue]),
                    })}
        </ItemTitle>
        <ItemDescription>
          {date(new Date(change.at), DATE_TIME)}
          {status ? ` · ${status}` : null}
        </ItemDescription>
        {state.kind === "refused" ? (
          <ItemDescription className="line-clamp-none text-destructive">
            {state.message}
          </ItemDescription>
        ) : null}
        {state.kind === "failed" ? (
          <ItemDescription className="line-clamp-none text-destructive">
            {t("settings.undoFailed")}
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
            {state.kind === "busy" ? t("settings.undoing") : t("settings.undo")}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function ChatChangesSection() {
  const list = useQuery(settingChangesQueryOptions());
  const { t } = useAppLanguage();
  const botLabel = useBotLabels();
  const botReal = useBotNames();
  const botName = (change: SettingChangeRecord) =>
    change.setting === "name"
      ? botReal(change.agentId)
      : botLabel(change.agentId);
  return (
    <PageSection
      description={t("settings.changesDescription")}
      title={t("settings.changesTitle")}
    >
      {list.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {list.error.message}
        </p>
      ) : null}
      {list.isPending ? (
        <p className="mt-4 text-muted-foreground text-sm" role="status">
          {t("settings.changesLoading")}
        </p>
      ) : null}
      {list.data && list.data.length === 0 ? (
        <PageEmpty>{t("settings.changesEmpty")}</PageEmpty>
      ) : null}
      {list.data && list.data.length > 0 ? (
        <PageRows>
          {list.data.map((change, index) => (
            <Fragment key={change.changeId}>
              {index > 0 ? <Separator /> : null}
              <ChangeRow botName={botName(change)} change={change} />
            </Fragment>
          ))}
        </PageRows>
      ) : null}
    </PageSection>
  );
}
