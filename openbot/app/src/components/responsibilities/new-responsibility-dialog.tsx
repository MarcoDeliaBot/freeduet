import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { type T, useT } from "@/freeduet/i18n/provider";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { conversationLabel } from "@/lib/channels/label";
import { channelListQueryOptions } from "@/lib/channels/queries";
import {
  createResponsibilityMutationOptions,
  type ResponsibilityRecord,
} from "@/lib/responsibilities";
import { queryClient } from "@/query-client";

type Source = "none" | ResponsibilityRecord["subscriptions"][number]["source"];

/** The event sources a new responsibility can subscribe to, in the order they are offered. */
const SOURCES = {
  none: "responsibilities.new.source.none",
  github: null,
  slack: null,
  connector: "responsibilities.source.connector",
  schedule: "responsibilities.source.schedule",
} as const satisfies Partial<Record<Source, MessageId | null>>;
/** A product name stays as it is (`null` above); every other source has a catalogue key. */
const sourceName = (value: keyof typeof SOURCES, t: T): string => {
  const id = SOURCES[value];
  return id === null ? (value === "github" ? "GitHub" : "Slack") : t(id);
};

/**
 * A new responsibility: where it runs, what it is for, and what — if anything — starts it on its
 * own. Given a Bot, the Bot is not asked for and only conversations that Bot is in are offered.
 */
export function NewResponsibilityDialog({
  agentId: fixedBot,
  onClose,
}: {
  agentId?: string;
  onClose: () => void;
}) {
  const t = useT();
  const formId = useId();
  const bots = useQuery(agentListQueryOptions());
  const channels = useInfiniteQuery(channelListQueryOptions());
  const [channelId, setChannelId] = useState("");
  const [pickedBot, setAgentId] = useState("");
  const agentId = fixedBot ?? pickedBot;
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [source, setSource] = useState<Source>("none");
  const [eventType, setEventType] = useState("");
  const selectedChannel = channels.data?.find(
    (channel) => channel.id === channelId,
  );
  const availableBots =
    bots.data?.filter((bot) => selectedChannel?.agentIds.includes(bot.id)) ??
    [];
  const offered =
    channels.data?.filter(
      (channel) =>
        channel.active &&
        (fixedBot === undefined || channel.agentIds.includes(fixedBot)),
    ) ?? [];
  const create = useMutation(createResponsibilityMutationOptions(queryClient));
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("responsibilities.new")}</DialogTitle>
          <DialogDescription>
            {t("responsibilities.new.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4 overflow-y-auto">
          {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
              direct child of DialogContent and keeps scrolling. */}
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(
                {
                  channelId,
                  agentId,
                  title,
                  instruction,
                  successCriteria,
                  subscriptions:
                    source === "none" ? [] : [{ source, eventType }],
                },
                { onSuccess: onClose },
              );
            }}
          >
            <FieldGroup>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${formId}-conversation`}>
                    {t("reaching.conversation")}
                  </FieldLabel>
                  <Select
                    items={Object.fromEntries(
                      offered.map((channel) => [
                        channel.id,
                        conversationLabel(channel),
                      ]),
                    )}
                    onValueChange={(value) => {
                      setChannelId(value ?? "");
                      setAgentId("");
                    }}
                    required
                    value={channelId || null}
                  >
                    <SelectTrigger
                      className="w-full"
                      id={`${formId}-conversation`}
                    >
                      <SelectValue
                        placeholder={t(
                          "responsibilities.new.chooseConversation",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {offered.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {conversationLabel(channel)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {fixedBot === undefined ? (
                  <Field>
                    <FieldLabel htmlFor={`${formId}-bot`}>
                      {t("approvals.field.bot")}
                    </FieldLabel>
                    <Select
                      items={Object.fromEntries(
                        availableBots.map((bot) => [bot.id, bot.name]),
                      )}
                      onValueChange={(value) => setAgentId(value ?? "")}
                      required
                      value={agentId || null}
                    >
                      <SelectTrigger className="w-full" id={`${formId}-bot`}>
                        <SelectValue placeholder={t("bot.choose")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBots.map((bot) => (
                          <SelectItem key={bot.id} value={bot.id}>
                            {bot.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </FieldGroup>
              {channels.hasNextPage && (
                <Button
                  className="w-fit"
                  onClick={() => channels.fetchNextPage()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("responsibilities.new.loadMore")}
                </Button>
              )}
              {(channels.error || bots.error) && (
                <p role="alert" className="text-destructive text-sm">
                  {channels.error?.message ?? bots.error?.message}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor={`${formId}-title`}>
                  {t("responsibilities.field.title")}
                </FieldLabel>
                <Input
                  id={`${formId}-title`}
                  required
                  maxLength={160}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("responsibilities.new.titleExample")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-instruction`}>
                  {t("responsibilities.field.instruction")}
                </FieldLabel>
                <Textarea
                  id={`${formId}-instruction`}
                  required
                  maxLength={6000}
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-criteria`}>
                  {t("responsibilities.field.criteria")}
                </FieldLabel>
                <Textarea
                  id={`${formId}-criteria`}
                  required
                  maxLength={3000}
                  value={successCriteria}
                  onChange={(event) => setSuccessCriteria(event.target.value)}
                  placeholder={t("responsibilities.new.criteriaExample")}
                />
              </Field>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${formId}-source`}>
                    {t("responsibilities.new.eventSource")}
                  </FieldLabel>
                  <Select
                    items={Object.fromEntries(
                      (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map(
                        (key) => [key, sourceName(key, t)],
                      ),
                    )}
                    onValueChange={(value) => {
                      if (value && value in SOURCES) setSource(value as Source);
                    }}
                    value={source}
                  >
                    <SelectTrigger className="w-full" id={`${formId}-source`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {sourceName(value, t)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  {source === "github" && (
                    <FieldDescription>
                      {t("responsibilities.new.githubHelp", {
                        link: "\u0001",
                      })
                        .split("\u0001")
                        .flatMap((part, index) =>
                          index === 0
                            ? [part]
                            : [
                                <Link key="link" to="/connections">
                                  {t("nav.connections")}
                                </Link>,
                                part,
                              ],
                        )}
                    </FieldDescription>
                  )}
                </Field>
                {source !== "none" && (
                  <Field>
                    <FieldLabel htmlFor={`${formId}-event`}>
                      {t("responsibilities.new.eventType")}
                    </FieldLabel>
                    <Input
                      id={`${formId}-event`}
                      required
                      maxLength={128}
                      value={eventType}
                      onChange={(event) => setEventType(event.target.value)}
                      placeholder={
                        source === "github"
                          ? "issues.opened"
                          : t("responsibilities.new.eventType")
                      }
                    />
                  </Field>
                )}
              </FieldGroup>
            </FieldGroup>
          </form>
          {create.error && (
            <p role="alert" className="text-destructive text-sm">
              {create.error.message}
            </p>
          )}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            disabled={create.isPending}
            form={formId}
            size="sm"
            type="submit"
          >
            {create.isPending
              ? t("responsibilities.new.creating")
              : t("responsibilities.new.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
