import {
  IconBulb,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconRadar,
} from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useId, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { type T, useAppLanguage, useT } from "@/freeduet/i18n/provider";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { conversationLabel } from "@/lib/channels/label";
import { channelListQueryOptions } from "@/lib/channels/queries";
import {
  changeProactiveSettingMutationOptions,
  createProactiveSettingMutationOptions,
  type ProactiveSetting,
  proactiveSettingsQueryOptions,
  proactiveSuggestionsQueryOptions,
  resolveSuggestionMutationOptions,
} from "@/lib/proactive";
import { queryClient } from "@/query-client";

/** A date and time as `Date.toLocaleString` drew them, now in the app's language (D181). */
const STAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
};

const intervals: { minutes: number; label: MessageId }[] = [
  { minutes: 60, label: "suggestions.everyHour" },
  { minutes: 240, label: "suggestions.every4Hours" },
  { minutes: 720, label: "suggestions.twiceDay" },
  { minutes: 1440, label: "suggestions.onceDay" },
];
/** The label map, so a closed trigger says "Every 4 hours" rather than 240. */
const intervalItemsOf = (t: T) =>
  intervals.map((interval) => ({
    value: interval.minutes,
    label: t(interval.label),
  }));
const intervalLabel = (minutes: number, t: T) => {
  const known = intervals.find((interval) => interval.minutes === minutes);
  return known
    ? t(known.label)
    : t("suggestions.everyMinutes", { count: minutes });
};
/** The words and the date formatter that the research states read (D181). */
type Words = Pick<ReturnType<typeof useAppLanguage>, "t" | "date">;

/** Next steps a Bot proposed from background research: start one as a task, or dismiss it. */
export function SuggestionsInbox({
  agentId,
}: {
  /** Only this Bot's suggestions, and nothing at all when it has none. */
  agentId?: string;
} = {}) {
  const { t, date } = useAppLanguage();
  const suggestions = useQuery(proactiveSuggestionsQueryOptions());
  const shown = (suggestions.data ?? []).filter(
    (suggestion) => agentId === undefined || suggestion.agentId === agentId,
  );
  const bots = useQuery(agentListQueryOptions());
  const act = useMutation(resolveSuggestionMutationOptions(queryClient));
  const botName = (id: string) =>
    bots.data?.find((bot) => bot.id === id)?.name ?? t("suggestions.yourBot");
  if (agentId !== undefined && shown.length === 0) return null;
  return (
    <PageSection title={t("suggestions.title")}>
      {suggestions.isPending ? null : suggestions.error ? (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {suggestions.error.message}
        </p>
      ) : shown.length ? (
        <PageRows>
          {shown.map((suggestion, index) => (
            <Fragment key={suggestion.id}>
              {index > 0 ? <Separator /> : null}
              <Item size="sm">
                <ItemMedia variant="icon">
                  <IconBulb />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="line-clamp-none">
                    {suggestion.title}
                  </ItemTitle>
                  {suggestion.detail ? (
                    <ItemDescription className="line-clamp-none whitespace-pre-wrap text-foreground">
                      {suggestion.detail}
                    </ItemDescription>
                  ) : null}
                  <ItemDescription className="line-clamp-none">
                    {botName(suggestion.agentId)} ·{" "}
                    {date(new Date(suggestion.createdAt), STAMP_OPTIONS)}
                    {suggestion.sourceApp || suggestion.sourceLink ? (
                      <>
                        {" · "}
                        {t("suggestions.from", {
                          app:
                            suggestion.sourceApp ??
                            t("suggestions.connectedApp"),
                        })}
                        {suggestion.sourceLink && (
                          <>
                            {" · "}
                            <a
                              href={suggestion.sourceLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("suggestions.openRecord")}
                            </a>
                          </>
                        )}
                      </>
                    ) : null}
                  </ItemDescription>
                  {/* A set, so it wraps onto its own line rather than crowding the title. */}
                  <ItemFooter>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({ id: suggestion.id, action: "start" })
                        }
                      >
                        {t("suggestions.startTask")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({ id: suggestion.id, action: "dismiss" })
                        }
                      >
                        {t("stalled.dismiss")}
                      </Button>
                    </div>
                  </ItemFooter>
                </ItemContent>
              </Item>
            </Fragment>
          ))}
        </PageRows>
      ) : (
        <PageEmpty>{t("suggestions.empty")}</PageEmpty>
      )}
      {act.error && (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {act.error.message}
        </p>
      )}
    </PageSection>
  );
}

/**
 * Opt a Bot in to read-only background research of the apps it can already read.
 *
 * Each opt-in is a row stating its current answer; it opens a dialog to change how often, run it,
 * turn it off or remove it. Opting in is a dialog behind the section's action.
 */
export function ProactiveResearchSettings({
  agentId: fixedBot,
}: {
  /** Only this Bot's research, and a new one is this Bot's without asking. */
  agentId?: string;
} = {}) {
  const t = useT();
  const settings = useQuery(proactiveSettingsQueryOptions());
  const bots = useQuery(agentListQueryOptions());
  const [adding, setAdding] = useState(false);
  const shown = (settings.data ?? []).filter(
    (setting) => fixedBot === undefined || setting.agentId === fixedBot,
  );
  return (
    <PageSection
      action={
        <Button onClick={() => setAdding(true)} size="sm" variant="ghost">
          <IconPlus />
          {t("suggestions.turnOnResearch")}
        </Button>
      }
      description={t("suggestions.researchDescription")}
      title={t("suggestions.researchTitle")}
    >
      {settings.isPending ? null : settings.error ? (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {settings.error.message}
        </p>
      ) : shown.length === 0 ? (
        <PageEmpty>{t("suggestions.researchOff")}</PageEmpty>
      ) : (
        <PageRows>
          {shown.map((setting, index) => (
            <Fragment key={setting.id}>
              {index > 0 ? <Separator /> : null}
              <SettingRow
                setting={setting}
                botName={
                  bots.data?.find((bot) => bot.id === setting.agentId)?.name ??
                  setting.agentId
                }
              />
            </Fragment>
          ))}
        </PageRows>
      )}
      {adding ? (
        <TurnOnResearchDialog
          fixedBot={fixedBot}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </PageSection>
  );
}

/** Which Bot, where its suggestions go, how often, and what to look for. */
function TurnOnResearchDialog({
  fixedBot,
  onClose,
}: {
  fixedBot?: string;
  onClose: () => void;
}) {
  const t = useT();
  const bots = useQuery(agentListQueryOptions());
  const channels = useInfiniteQuery(channelListQueryOptions());
  const [pickedBot, setAgentId] = useState("");
  const agentId = fixedBot ?? pickedBot;
  const [channelId, setChannelId] = useState("");
  const [focus, setFocus] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(240);
  const id = useId();
  const eligibleChannels = (channels.data ?? []).filter(
    (channel) => channel.active && channel.agentIds.includes(agentId),
  );
  const add = useMutation(createProactiveSettingMutationOptions(queryClient));
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("suggestions.turnOnDialog")}</DialogTitle>
          <DialogDescription>
            {t("suggestions.turnOnDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4 overflow-y-auto">
          {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
              direct child of DialogContent and keeps scrolling. */}
          <form
            id={id}
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate(
                { agentId, channelId, focus, intervalMinutes },
                { onSuccess: onClose },
              );
            }}
          >
            <FieldGroup>
              {fixedBot === undefined ? (
                <Field>
                  <FieldLabel htmlFor={`${id}-bot`}>
                    {t("botPage.fallbackTitle")}
                  </FieldLabel>
                  <Select
                    items={bots.data?.map((bot) => ({
                      value: bot.id,
                      label: bot.name,
                    }))}
                    onValueChange={(value) => {
                      setAgentId(value ?? "");
                      setChannelId("");
                    }}
                    required
                    value={agentId || null}
                  >
                    <SelectTrigger className="w-full" id={`${id}-bot`}>
                      <SelectValue placeholder={t("bot.choose")} />
                    </SelectTrigger>
                    <SelectContent>
                      {bots.data?.map((bot) => (
                        <SelectItem key={bot.id} value={bot.id}>
                          {bot.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`${id}-channel`}>
                  {t("suggestions.deliverTo")}
                </FieldLabel>
                <Select
                  items={eligibleChannels.map((channel) => ({
                    value: channel.id,
                    label: conversationLabel(channel),
                  }))}
                  onValueChange={(value) => setChannelId(value ?? "")}
                  required
                  value={channelId || null}
                >
                  <SelectTrigger className="w-full" id={`${id}-channel`}>
                    <SelectValue placeholder={t("suggestions.chooseChannel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {conversationLabel(channel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-interval`}>
                  {t("suggestions.howOften")}
                </FieldLabel>
                <Select
                  items={intervalItemsOf(t)}
                  onValueChange={(value) => {
                    if (value !== null) setIntervalMinutes(value);
                  }}
                  value={intervalMinutes}
                >
                  <SelectTrigger className="w-full" id={`${id}-interval`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {intervals.map((interval) => (
                      <SelectItem
                        key={interval.minutes}
                        value={interval.minutes}
                      >
                        {t(interval.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-focus`}>
                  {t("suggestions.focus")}
                </FieldLabel>
                <Input
                  id={`${id}-focus`}
                  maxLength={1000}
                  value={focus}
                  onChange={(event) => setFocus(event.target.value)}
                  placeholder="Open issues assigned to me and questions waiting on me"
                />
              </Field>
            </FieldGroup>
          </form>
          {add.error && (
            <p role="alert" className="text-destructive text-sm">
              {add.error.message}
            </p>
          )}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            disabled={add.isPending || !agentId || !channelId}
            form={id}
            size="sm"
            type="submit"
          >
            {t("suggestions.turnOnDialog")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Whether it is on, and when it runs next. Stated rather than captured, so it follows the query. */
function researchStatus(setting: ProactiveSetting, { t, date }: Words) {
  return !setting.enabled
    ? t("suggestions.off")
    : setting.lastStatus === "running"
      ? t("suggestions.researchingNow")
      : t("routines.next", {
          when: date(new Date(setting.nextRunAt), STAMP_OPTIONS),
        });
}

/**
 * One Bot's research: a summary of its current answer and a chevron, opening a dialog that changes
 * it. The dialog is the row's sibling, not its child, so a click inside it does not bubble back to
 * the row and reopen it.
 */
function SettingRow({
  setting,
  botName,
}: {
  setting: ProactiveSetting;
  botName: string;
}) {
  const words = useAppLanguage();
  const { t, date } = words;
  const [open, setOpen] = useState(false);
  const id = useId();
  const change = useMutation(
    changeProactiveSettingMutationOptions(queryClient),
  );
  const summary = [
    setting.focus,
    intervalLabel(setting.intervalMinutes, t),
    researchStatus(setting, words),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <Item
        render={
          <button
            onClick={() => {
              // Opening starts clean: the last change's failure is not this visit's.
              change.reset();
              setOpen(true);
            }}
            type="button"
          />
        }
        size="sm"
      >
        <ItemMedia variant="icon">
          <IconRadar />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{botName}</ItemTitle>
          <ItemDescription>{summary}</ItemDescription>
          {setting.lastError ? (
            <ItemDescription className="text-destructive">
              {setting.lastError}
            </ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions>
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("suggestions.researchTitle")}</DialogTitle>
            <DialogDescription>
              {setting.focus ? `${botName} · ${setting.focus}` : botName}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            <Item size="sm" variant="muted">
              <ItemMedia variant="icon">
                <IconClock />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{researchStatus(setting, words)}</ItemTitle>
                {setting.lastRunAt && (
                  <ItemDescription>
                    {t("suggestions.lastRan", {
                      when: date(new Date(setting.lastRunAt), STAMP_OPTIONS),
                    })}
                    {setting.lastStatus === "succeeded"
                      ? ""
                      : ` (${setting.lastStatus})`}
                  </ItemDescription>
                )}
              </ItemContent>
            </Item>
            {setting.lastError && (
              <p role="alert" className="text-destructive text-sm">
                {setting.lastError}
              </p>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-interval`}>
                {t("suggestions.howOften")}
              </FieldLabel>
              {/* Writes on pick: one value, no draft worth holding. */}
              <Select
                disabled={change.isPending}
                items={intervalItemsOf(t)}
                onValueChange={(minutes) => {
                  if (minutes !== null && minutes !== setting.intervalMinutes)
                    change.mutate({
                      setting,
                      change: { kind: "interval", minutes },
                    });
                }}
                value={setting.intervalMinutes}
              >
                <SelectTrigger className="w-full" id={`${id}-interval`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervals.map((interval) => (
                    <SelectItem key={interval.minutes} value={interval.minutes}>
                      {t(interval.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {change.error && (
              <p role="alert" className="text-destructive text-sm">
                {change.error.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button
              size="sm"
              variant="outline"
              disabled={change.isPending}
              onClick={() =>
                change.mutate(
                  { setting, change: { kind: "remove" } },
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              {t("chat.remove")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={change.isPending}
              onClick={() =>
                change.mutate({ setting, change: { kind: "toggle" } })
              }
            >
              {setting.enabled ? t("suggestions.turnOff") : t("profile.turnOn")}
            </Button>
            <Button
              size="sm"
              disabled={!setting.enabled || change.isPending}
              onClick={() =>
                change.mutate({ setting, change: { kind: "run" } })
              }
            >
              {t("routines.runNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
