import {
  IconChevronRight,
  IconLink,
  IconPlus,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useId, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { SharedAppNotice } from "@/components/plugins/shared-app-notice";
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
import { type T, useT } from "@/freeduet/i18n/provider";
import type { AgentProfile } from "@/lib/agents/queries";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  assignTeamBotMutationOptions,
  publishTeamBotMutationOptions,
  type TeamBot,
  teamBotLink,
  teamBotsQueryOptions,
  unpublishTeamBotMutationOptions,
} from "@/lib/team-bots";
import { queryClient } from "@/query-client";
import { appConfig } from "@/lib/generated/application-config";

const list = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Who else can use this Bot. Its owner publishes it to the whole team or to named people and groups;
 * an administrator can also pin it at the top of a group's Bots lists. Each chat with a published
 * Bot is private to the person having it; its owner cannot read it.
 */
export function SharingSections({ agent }: { agent: AgentProfile }) {
  const t = useT();
  const data = useQuery(teamBotsQueryOptions());
  const me = useQuery(currentUserQueryOptions()).data;
  const unpublish = useMutation(unpublishTeamBotMutationOptions(queryClient));
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  if (data.isPending) return null;
  if (data.error) {
    return (
      <p className="mt-6 text-destructive text-sm" role="alert">
        {data.error.message}
      </p>
    );
  }
  const published = data.data.teamBots.find((bot) => bot.id === agent.id);
  const publishable = data.data.publishable.some((bot) => bot.id === agent.id);

  return (
    <>
      <PageSection title={t("bot.sharing.published")}>
        {unpublish.error ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {unpublish.error.message}
          </p>
        ) : null}
        {published ? (
          <PageRows>
            <Item size="sm">
              <ItemMedia variant="icon">
                <IconUsersGroup />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {published.audience === "team"
                    ? t("bot.sharing.toWholeTeam")
                    : t("bot.sharing.toPeople", {
                        who: [
                          ...(published.people ?? []),
                          ...(published.groups ?? []).map((group) =>
                            t("bot.sharing.groupNamed", { name: group }),
                          ),
                        ].join(", "),
                      })}
                </ItemTitle>
                <ItemDescription>
                  {published.visibleToTeam
                    ? t("bot.sharing.teamPrivate")
                    : t("bot.sharing.notVisibleYet")}
                </ItemDescription>
              </ItemContent>
              {agent.mine ? (
                <ItemActions>
                  <Button
                    disabled={unpublish.isPending}
                    onClick={() => unpublish.mutate(agent.id)}
                    size="sm"
                    variant="outline"
                  >
                    {t("bot.sharing.unpublish")}
                  </Button>
                </ItemActions>
              ) : null}
            </Item>
            <Separator />
            <Item size="sm">
              <ItemMedia variant="icon">
                <IconLink />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t("bot.sharing.link")}</ItemTitle>
                <ItemDescription>
                  {t("bot.sharing.linkDescription")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(teamBotLink(agent.id))
                      .then(() => setCopied(true))
                  }
                  size="sm"
                  variant="outline"
                >
                  {copied ? t("settings.copied") : t("bot.sharing.copyLink")}
                </Button>
              </ItemActions>
            </Item>
          </PageRows>
        ) : (
          <PageEmpty>
            {agent.visibility === "public"
              ? t("bot.sharing.publicNotPublished", {
                  product: appConfig.brand.productName,
                })
              : agent.mine
                ? t("bot.sharing.onlyYouCanUse")
                : t("bot.sharing.notPublished")}
          </PageEmpty>
        )}
      </PageSection>
      {agent.mine && (published || publishable) ? (
        <PageSection
          description={t("bot.sharing.publishNote")}
          title={
            published
              ? t("bot.sharing.whoPublishedTo")
              : t("bot.sharing.publish")
          }
        >
          {/* More than one value — an audience, then people and groups — so a summary row and a
              dialog rather than a form on the page. */}
          <PageRows>
            <Item
              render={
                <button onClick={() => setPublishing(true)} type="button" />
              }
              size="sm"
            >
              <ItemMedia variant="icon">
                <IconUsersGroup />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t("bot.sharing.audience")}</ItemTitle>
                <ItemDescription>
                  {audienceSummary(published, t)}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <IconChevronRight className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          </PageRows>
          {publishing ? (
            <PublishDialog
              botId={agent.id}
              current={published}
              onClose={() => setPublishing(false)}
            />
          ) : null}
        </PageSection>
      ) : null}
      {me?.role === "admin" && published ? (
        <PageSection
          description={t("bot.sharing.assignDescription")}
          title={t("bot.sharing.assignToGroups")}
        >
          <Assignments bot={published} />
        </PageSection>
      ) : null}
    </>
  );
}

/** The current answer on the Audience row: who it is published to, as a count. */
function audienceSummary(current: TeamBot | undefined, t: T): string {
  if (!current) return t("bot.sharing.notPublishedSummary");
  if (current.audience === "team") return t("bot.sharing.theWholeTeam");
  const people = current.people?.length ?? 0;
  const groups = current.groups?.length ?? 0;
  const parts = [
    people ? t("bot.sharing.peopleCount", { count: people }) : "",
    groups ? t("bot.sharing.groupCount", { count: groups }) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : t("bot.sharing.specificPeople");
}

/**
 * Who a Bot is published to: the whole team, or named people and groups. Mounted only while open,
 * so each opening starts from the current answer rather than from an abandoned edit.
 */
function PublishDialog({
  botId,
  current,
  onClose,
}: {
  botId: string;
  current?: TeamBot;
  onClose: () => void;
}) {
  const t = useT();
  const formId = useId();
  const publish = useMutation(publishTeamBotMutationOptions(queryClient));
  const audiences = {
    team: t("bot.sharing.theWholeTeam"),
    people: t("bot.sharing.specificPeople"),
  } as const;
  const [audience, setAudience] = useState<"team" | "people">(
    current?.audience ?? "team",
  );
  const [emails, setEmails] = useState((current?.people ?? []).join(", "));
  const [groups, setGroups] = useState((current?.groups ?? []).join(", "));
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {current
              ? t("bot.sharing.whoPublishedTo")
              : t("bot.sharing.publish")}
          </DialogTitle>
          <DialogDescription>{t("bot.sharing.publishNote")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4 overflow-y-auto">
          {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
              direct child of DialogContent and keeps scrolling. */}
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              publish.mutate(
                {
                  botId,
                  audience,
                  emails: audience === "people" ? list(emails) : [],
                  groups: audience === "people" ? list(groups) : [],
                },
                { onSuccess: onClose },
              );
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${formId}-audience`}>
                  {t("bot.sharing.publishedTo")}
                </FieldLabel>
                <Select
                  items={audiences}
                  onValueChange={(value) => {
                    if (value === "team" || value === "people") {
                      setAudience(value);
                    }
                  }}
                  value={audience}
                >
                  <SelectTrigger className="w-full" id={`${formId}-audience`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(audiences) as (keyof typeof audiences)[]).map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {audiences[value]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              {audience === "people" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-people`}>
                      {t("bot.sharing.peopleByEmail")}
                    </FieldLabel>
                    <Input
                      id={`${formId}-people`}
                      onChange={(event) => setEmails(event.target.value)}
                      placeholder={t("bot.sharing.commaSeparated")}
                      value={emails}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-groups`}>
                      {t("bot.sharing.groups")}
                    </FieldLabel>
                    <Input
                      id={`${formId}-groups`}
                      onChange={(event) => setGroups(event.target.value)}
                      placeholder={t("bot.sharing.commaSeparated")}
                      value={groups}
                    />
                  </Field>
                </>
              ) : null}
              <SharedAppNotice botId={botId} reason="publish" />
            </FieldGroup>
          </form>
          {publish.error ? (
            <p className="mt-4 text-destructive text-sm" role="alert">
              {publish.error.message}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            disabled={publish.isPending}
            form={formId}
            size="sm"
            type="submit"
          >
            {current ? t("bot.sharing.update") : t("bot.sharing.publishToTeam")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The groups an administrator has pinned this Bot for: one row each with a Remove, and a row that
 * opens a dialog to add one.
 */
function Assignments({ bot }: { bot: TeamBot }) {
  const t = useT();
  const remove = useMutation(assignTeamBotMutationOptions(queryClient));
  const [assigning, setAssigning] = useState(false);
  const assigned = bot.assignments ?? [];
  return (
    <>
      {remove.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {remove.error.message}
        </p>
      ) : null}
      {assigned.length === 0 ? (
        <PageEmpty>{t("bot.sharing.notAssigned")}</PageEmpty>
      ) : null}
      <PageRows>
        {assigned.map((name) => (
          <Fragment key={name}>
            <Item size="sm">
              <ItemMedia variant="icon">
                <IconUsers />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {name === "*" ? t("bot.sharing.wholeTeam") : name}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <Button
                  aria-label={t("bot.sharing.removeNamed", { name })}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate({ botId: bot.id, group: name, remove: true })
                  }
                  size="sm"
                  variant="outline"
                >
                  {t("chat.remove")}
                </Button>
              </ItemActions>
            </Item>
            <Separator />
          </Fragment>
        ))}
        <Item
          render={<button onClick={() => setAssigning(true)} type="button" />}
          size="sm"
        >
          <ItemMedia variant="icon">
            <IconPlus />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t("bot.sharing.assignRow")}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <IconChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
        </Item>
      </PageRows>
      {assigning ? (
        <AssignDialog bot={bot} onClose={() => setAssigning(false)} />
      ) : null}
    </>
  );
}

/** One group to pin this Bot for, or * for the whole team. */
function AssignDialog({ bot, onClose }: { bot: TeamBot; onClose: () => void }) {
  const t = useT();
  const formId = useId();
  const assign = useMutation(assignTeamBotMutationOptions(queryClient));
  const [group, setGroup] = useState("");
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("bot.sharing.assignNamed", { name: bot.name })}
          </DialogTitle>
          <DialogDescription>{t("bot.sharing.assignNote")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4">
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              assign.mutate({ botId: bot.id, group }, { onSuccess: onClose });
            }}
          >
            <Field>
              <FieldLabel htmlFor={`${formId}-group`}>
                {t("bot.sharing.groupOrStar")}
              </FieldLabel>
              <Input
                id={`${formId}-group`}
                onChange={(event) => setGroup(event.target.value)}
                placeholder={t("bot.sharing.wholeTeamPlaceholder")}
                value={group}
              />
            </Field>
          </form>
          {assign.error ? (
            <p className="mt-4 text-destructive text-sm" role="alert">
              {assign.error.message}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            disabled={!group.trim() || assign.isPending}
            form={formId}
            size="sm"
            type="submit"
          >
            {t("bot.sharing.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
