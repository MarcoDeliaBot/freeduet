import { IconChevronRight, IconMessage } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import {
  attentionSummary,
  needsInput,
} from "@/components/bot-profile/attention";
import { StalledHandoffRow } from "@/components/bot-profile/stalled-handoff";
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
import { isFreeDuetApp } from "@/freeduet/manage-group";
import { type AgentProfile, agentListQueryOptions } from "@/lib/agents/queries";
import { groupRoster } from "@/lib/agents/roster";
import {
  type BotAttention,
  botAttentionQueryOptions,
} from "@/lib/bot-lifecycle/queries";
import { wantFirstUnread } from "@/lib/channels/first-unread";

/**
 * Every Bot the person can reach, in the one place they are listed: pinned first, then their own,
 * then the ones shared with them, and the ones they hid folded away at the end.
 *
 * This replaces three screens — Bots, Agents and Team Bots — that listed the same Bots three ways.
 */
export function BotRoster({ tenantId }: { tenantId?: string } = {}) {
  const agents = useQuery(agentListQueryOptions());
  const hidden = useQuery(agentListQueryOptions(true));
  const attention = useQuery(botAttentionQueryOptions());
  const byId = new Map((attention.data ?? []).map((bot) => [bot.agentId, bot]));
  /* FreeDuet's package: each row has a Message button of its own, one click to a conversation (D129). */
  const message = isFreeDuetApp(tenantId);

  if (agents.isPending) return null;
  // Only when nothing ever loaded: a failed background refetch keeps the roster it had.
  if (agents.data === undefined) {
    return (
      <p className="mt-6 text-destructive text-sm" role="alert">
        Couldn't load your Bots. Reload the page.
      </p>
    );
  }
  const { needsYou, pinned, yours, shared } = groupRoster(
    agents.data,
    (agentId) => {
      const state = byId.get(agentId);
      return state ? needsInput(state) : 0;
    },
  );
  const yoursPinned = pinned.some((agent) => agent.mine);
  const yoursWaiting = needsYou.some((agent) => agent.mine);

  return (
    <>
      {needsYou.length ? (
        <PageSection title="Needs you">
          <RosterRows agents={needsYou} byId={byId} message={message} />
        </PageSection>
      ) : null}
      {pinned.length ? (
        <PageSection title="Pinned">
          <RosterRows agents={pinned} byId={byId} message={message} />
        </PageSection>
      ) : null}
      <PageSection title="Yours">
        {yours.length ? (
          <RosterRows agents={yours} byId={byId} message={message} />
        ) : (
          <PageEmpty>
            {yoursPinned
              ? "Your Bots are all pinned above."
              : yoursWaiting
                ? "Your Bots are all under Needs you."
                : "You don't have any Bots yet. Create one with New Bot."}
          </PageEmpty>
        )}
      </PageSection>
      <PageSection title="Shared with you">
        {shared.length ? (
          <RosterRows agents={shared} byId={byId} message={message} />
        ) : (
          <PageEmpty>Nobody has shared a Bot with you yet.</PageEmpty>
        )}
      </PageSection>
      {hidden.data?.length ? (
        <HiddenSection agents={hidden.data} byId={byId} message={message} />
      ) : null}
    </>
  );
}

/**
 * The Bots this person hid, folded until asked for: a way back for somebody who hid something, not
 * a fourth list everybody reads past. A Bot's page is where Unhide lives.
 */
function HiddenSection({
  agents,
  byId,
  message,
}: {
  agents: AgentProfile[];
  byId: Map<string, BotAttention>;
  message: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PageSection
      action={
        <Button onClick={() => setOpen(!open)} size="sm" variant="ghost">
          {open ? "Hide" : "Show"}
        </Button>
      }
      description={`${agents.length} ${agents.length === 1 ? "Bot" : "Bots"} you hid. Only your list changes.`}
      title="Hidden"
    >
      {open ? (
        <RosterRows agents={agents} byId={byId} message={message} />
      ) : null}
    </PageSection>
  );
}

function RosterRows({
  agents,
  byId,
  message,
}: {
  agents: AgentProfile[];
  byId: Map<string, BotAttention>;
  /** Draw the Message button beside each row (FreeDuet's package). */
  message: boolean;
}) {
  return (
    <PageRows>
      {agents.map((agent, index) => {
        const state = byId.get(agent.id);
        const summary = state
          ? [state.paused ? "Paused" : "", attentionSummary(state)]
              .filter(Boolean)
              .join(" · ")
          : "";
        const row = (
          <Item
            className={message ? "min-w-0 flex-1" : undefined}
            render={<Link params={{ agentId: agent.id }} to="/bots/$agentId" />}
            size="sm"
          >
            <ItemMedia>
              <AbstractAvatar
                id={agent.id}
                name={agent.name}
                seed={agent.avatarSeed}
                size={28}
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{agent.name}</ItemTitle>
              <ItemDescription>{summary || agent.title}</ItemDescription>
            </ItemContent>
            <ItemActions>
              {state && needsInput(state) > 0 ? (
                <span className="type-caption grid h-[18px] min-w-[18px] place-items-center rounded-full bg-duet-accent px-1.5 font-medium text-duet-on-accent tabular-nums">
                  {needsInput(state)}
                </span>
              ) : null}
              <IconChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        );
        const stalled = state?.stalled ?? [];
        const unreadChannel = state?.unread ? state.unreadChannelId : null;
        return (
          <Fragment key={agent.id}>
            {index > 0 ? <Separator /> : null}
            {message ? (
              <div className="flex items-center gap-1 pr-2">
                {row}
                <Button
                  aria-label={`Message ${agent.name}`}
                  render={(props) => (
                    <Link
                      {...props}
                      search={{ agent: agent.id }}
                      to="/channel/new"
                    />
                  )}
                  className="min-h-11 shrink-0"
                  size="sm"
                  variant="outline"
                >
                  <IconMessage />
                  Message
                </Button>
              </div>
            ) : (
              row
            )}
            {stalled.map((hop) => (
              <StalledHandoffRow
                agentId={agent.id}
                channelId={hop.channelId}
                id={hop.id}
                key={hop.id}
                reason={hop.reason}
                task={hop.task}
                toName={hop.toName}
              />
            ))}
            {unreadChannel && state ? (
              <div
                className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                data-testid="unread-row"
              >
                <IconMessage aria-hidden className="size-4 text-duet-accent" />
                <p className="min-w-0 flex-1 text-sm">
                  {agent.name} wrote in {state.unread}{" "}
                  {state.unread === 1 ? "conversation" : "conversations"} you
                  have not read.
                </p>
                <Button
                  render={(props) => (
                    <Link
                      {...props}
                      onClick={() => wantFirstUnread()}
                      params={{ channelId: unreadChannel }}
                      to="/channel/$channelId"
                    />
                  )}
                  size="sm"
                  variant="outline"
                >
                  Read newest
                </Button>
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </PageRows>
  );
}
