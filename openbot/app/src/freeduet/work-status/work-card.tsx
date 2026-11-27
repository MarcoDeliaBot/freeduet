import { useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { memberTarget } from "@/freeduet/wide/team";
import { primaryBot } from "@/lib/agents/primary-bot";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { membersNamed } from "@/lib/approvals";
import { channelListQueryOptions } from "@/lib/channels/queries";
import {
  cardLine,
  isActive,
  type WorkHandoff,
  workStatusQueryOptions,
} from "./status";
import "./work-status.css";

/**
 * D168: under a hand-off line, a live card for the member it asked: who, for how long, the last step
 * in plain words, and one click to that member's own conversation. It reads the hop queue through
 * `GET /api/freeduet/work-status`, found by this conversation and the member the line names; a hand-off
 * the server no longer holds draws nothing.
 */
export function HandoffWorkCard({ bot }: { bot: string | undefined }) {
  const threadId = useCopilotChatConfiguration()?.threadId;
  const roster = useQuery(agentListQueryOptions());
  const status = useQuery(workStatusQueryOptions());
  const asked = membersNamed(bot, roster.data);
  const hop = (status.data?.handoffs ?? []).find(
    (each) => each.threadId === threadId && asked.has(each.toBotId),
  );
  if (!hop) return null;
  return <WorkCard hop={hop} active={isActive(status.data)} />;
}

/** The card itself, drawn from one hand-off; exported for its tests. */
export function WorkCard({
  hop,
  active,
  now: fixedNow,
}: {
  hop: WorkHandoff;
  active: boolean;
  now?: number;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || fixedNow !== undefined) return;
    const timer = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [active, fixedNow]);
  const agents = useQuery(agentListQueryOptions());
  const roster = useInfiniteQuery(channelListQueryOptions());
  const member = agents.data?.find((agent) => agent.id === hop.toBotId);
  const target = member
    ? memberTarget(member, primaryBot(agents.data)?.id, roster.data)
    : null;
  const now = fixedNow ?? (tick, Date.now());
  const line = cardLine(hop, now);
  const body = (
    <>
      <span aria-hidden className="fd-ws-dot" data-state={hop.state} />
      <span className="fd-ws-text">
        <span aria-live="polite">{line}</span>
        <span className="fd-ws-title">{hop.title}</span>
      </span>
      {target ? <span className="fd-ws-open">Open</span> : null}
    </>
  );
  const common = {
    className: "fd-ws fd-ws-card",
    "data-state": hop.state,
    "data-testid": "work-card",
    "data-handoff": hop.id,
  } as const;
  if (!target) return <div {...common}>{body}</div>;
  const label = `${line}. Open ${hop.toName}'s conversation`;
  if (target.to === "/")
    return (
      <Link aria-label={label} to="/" {...common}>
        {body}
      </Link>
    );
  if (target.to === "/channel/$channelId")
    return (
      <Link
        aria-label={label}
        params={{ channelId: target.channelId }}
        to="/channel/$channelId"
        {...common}
      >
        {body}
      </Link>
    );
  return (
    <Link
      aria-label={label}
      search={{ agent: target.agent }}
      to="/channel/new"
      {...common}
    >
      {body}
    </Link>
  );
}
