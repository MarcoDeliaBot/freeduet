import { useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StalledActions } from "@/components/bot-profile/stalled-handoff";
import { type T, useAppLanguage } from "@/freeduet/i18n/provider";
import { MemberPicture } from "@/freeduet/wide/mascot";
import { primaryBot } from "@/lib/agents/primary-bot";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  clipTask,
  type DotState,
  isActive,
  openHandoffs,
  ringFill,
  STEP_KEYS,
  STUCK_AFTER_MS,
  type WorkHandoff,
  waitOf,
  workStatusQueryOptions,
} from "./status";
import { WorkDot } from "./work-dot";
import "./work-status.css";

/**
 * D188: "Working now", a status line fixed above the message box. One row per hand-off asked from THIS conversation
 * that is not done, and one quiet line when there are none, so a claim like "Kai is working" can never stand
 * unchallenged. The states are the server's (D168); this only draws them, from the same query the card uses.
 */
type Say = {
  t: T;
  number: (value: number) => string;
};

/** "under a minute", "4 min", "2 h 5 min", in the app's language. */
export function durationText(ms: number, say: Say): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return say.t("working.underMinute");
  if (minutes < 60) return say.t("working.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest
    ? say.t("working.hoursMinutes", {
        hours: say.number(hours),
        minutes: say.number(rest),
      })
    : say.t("working.hours", { count: hours });
}

/** "20 s" under a minute, else the minutes. */
function agoText(ms: number, say: Say): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60)
    return say.t("working.seconds", { seconds: say.number(seconds) });
  return durationText(ms, say);
}

function ringState(state: WorkHandoff["state"]): DotState {
  return state === "working" || state === "waiting" || state === "stuck"
    ? state
    : "idle";
}

/** The server's step label in the app language; a label this does not know is shown as sent. */
export function stepText(label: string, t: T): string {
  const key = (
    STEP_KEYS as Record<string, (typeof STEP_KEYS)[keyof typeof STEP_KEYS]>
  )[label];
  return key ? t(key) : label;
}

/** The words after the name, for one hand-off. */
export function stripWords(hop: WorkHandoff, now: number, say: Say): string {
  const { t } = say;
  const since = new Date(hop.since).getTime();
  const alive = new Date(hop.lastEventAt ?? hop.since).getTime();
  if (hop.stalled) return t("working.didNotFinish");
  switch (hop.state) {
    case "queued":
      return t("working.queued");
    case "waiting":
      return t("working.waiting");
    case "stuck":
      return t("working.stuck", { duration: durationText(now - alive, say) });
    default: {
      const sign = hop.lastStep
        ? t("working.lastStep", { step: stepText(hop.lastStep.label, t) })
        : t("working.justStarted");
      return `${t("working.for", { duration: durationText(now - since, say) })} · ${hop.lastEventAt ? t("working.signAgo", { duration: agoText(now - alive, say) }) : sign}`;
    }
  }
}

/** The strip itself, from the open hand-offs of one conversation; exported for its tests. */
export function WorkStrip({
  hops,
  now,
  load = "ready",
}: {
  hops: readonly WorkHandoff[];
  now: number;
  /** "nobody" is said only when the server answered; while asking, or when it could not answer, the line says so. */
  load?: "ready" | "loading" | "error";
}) {
  const { t, number } = useAppLanguage();
  const say: Say = { t, number: (value) => number(value) };
  return (
    <section
      aria-label={t("working.region")}
      className="fd-ws fd-ws-strip"
      data-testid="working-now"
      role="status"
    >
      {load !== "ready" ? (
        <span className="fd-ws-strip-none" data-testid="working-now-unknown">
          {t(load === "loading" ? "working.checking" : "working.cantTell")}
        </span>
      ) : hops.length === 0 ? (
        <span className="fd-ws-strip-none" data-testid="working-now-none">
          {t("working.nobody")}
        </span>
      ) : (
        hops.map((hop) => (
          <div
            className="fd-ws-strip-row"
            data-handoff={hop.id}
            data-state={hop.state}
            data-testid="working-now-row"
            key={hop.id}
          >
            <span aria-hidden className="fd-ws-strip-face">
              <MemberPicture agentId={hop.toBotId} size={28} />
              <WorkDot state={ringState(hop.state)} title="" />
            </span>
            <span className="fd-ws-strip-text">
              <span>
                <span className="fd-ws-strip-name">{hop.toName}</span>
                {" · "}
                {stripWords(hop, now, say)}
              </span>
              {hop.title ? (
                <span className="fd-ws-strip-sub">{clipTask(hop.title)}</span>
              ) : null}
              {hop.lastStep && hop.state === "working" ? (
                <span className="fd-ws-strip-sub">
                  {t("working.lastStep", {
                    step: stepText(hop.lastStep.label, t),
                  })}
                </span>
              ) : null}
            </span>
            {hop.stalled ? (
              <StalledActions agentId={hop.fromBotId} id={hop.id} open={null} />
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}

/** A clock that ticks every 15 s while `active`, like the work card's; a fixed `now` never ticks. */
export function useNow(active: boolean, fixed?: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || fixed !== undefined) return;
    const timer = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [active, fixed]);
  return fixed ?? Date.now();
}

/**
 * Mounted above the message box. It draws in a conversation with Iris and in any conversation that has an open
 * hand-off of its own; in another member's conversation with nothing open it says nothing. With no conversation
 * id (a screen outside a chat) it draws nothing.
 */
export function WorkingNowStrip({
  botId,
  now: fixed,
}: {
  botId?: string | undefined;
  now?: number;
}) {
  const threadId = useCopilotChatConfiguration()?.threadId;
  if (!threadId) return null;
  return <Mounted botId={botId} now={fixed} threadId={threadId} />;
}

function Mounted({
  botId,
  now: fixed,
  threadId,
}: {
  botId: string | undefined;
  now: number | undefined;
  threadId: string;
}) {
  const status = useQuery(workStatusQueryOptions());
  const agents = useQuery(agentListQueryOptions());
  const now = useNow(isActive(status.data), fixed);
  const hops = openHandoffs(status.data, { threadId });
  const withIris = botId !== undefined && botId === primaryBot(agents.data)?.id;
  if (!withIris && hops.length === 0) return null;
  const load = status.data ? "ready" : status.isError ? "error" : "loading";
  return (
    <WorkStrip hops={load === "ready" ? hops : []} load={load} now={now} />
  );
}

/** The open hand-offs Iris has asked, for her ring: this conversation's when there is one, else any of hers. */
export function useIrisWait(fixedNow?: number) {
  const threadId = useCopilotChatConfiguration()?.threadId;
  const status = useQuery(workStatusQueryOptions());
  const agents = useQuery(agentListQueryOptions());
  const irisId = primaryBot(agents.data)?.id;
  const now = useNow(isActive(status.data), fixedNow);
  const hops = openHandoffs(status.data, {
    threadId,
    fromBotId: irisId ?? null,
  });
  return {
    irisId,
    name: irisName(agents.data),
    wait: waitOf(hops, now),
    /** No conversation is known here, so the hand-off may be from another one. */
    anyThread: !threadId,
  };
}

function irisName(agents: Parameters<typeof primaryBot>[0]): string {
  return primaryBot(agents)?.name ?? "Iris";
}

/**
 * The waiting ring: it fills with the elapsed time and is full at the stuck threshold (`STUCK_AFTER_MS`); it takes the
 * stuck colour when the server says stuck. A text equivalent says the minutes. Nothing when `wait` is null.
 * Place it inside a position: relative wrapper around the face.
 */
export function WaitingRing({
  name,
  wait,
  anyThread = false,
}: {
  name: string;
  wait: { elapsedMs: number; stuck: boolean } | null;
  /** No conversation is known, so the hand-off may be from another one. */
  anyThread?: boolean;
}) {
  const { t, number } = useAppLanguage();
  if (!wait) return null;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const fill = wait.stuck ? 1 : ringFill(wait.elapsedMs);
  const minutes = number(Math.floor(wait.elapsedMs / 60_000));
  return (
    <svg
      aria-label={t(
        anyThread
          ? "working.ringElsewhere"
          : wait.stuck
            ? "working.ringStuck"
            : "working.ringWaiting",
        {
          name,
          minutes,
        },
      )}
      className="fd-ws-fill"
      data-scope={anyThread ? "any" : "thread"}
      data-fill={fill.toFixed(3)}
      data-limit={STUCK_AFTER_MS}
      data-state={wait.stuck ? "stuck" : "waiting"}
      data-testid="waiting-ring"
      role="img"
      viewBox="0 0 34 34"
    >
      <circle className="fd-ws-fill-track" cx="17" cy="17" r={radius} />
      <circle
        className="fd-ws-fill-arc"
        cx="17"
        cy="17"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fill)}
      />
    </svg>
  );
}
