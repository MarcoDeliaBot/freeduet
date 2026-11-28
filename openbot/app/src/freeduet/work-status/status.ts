import { queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/client";

/*
 * Who is working and on what (D168). The server reads the hop queue and says, per hand-off and per
 * member, a state and a plain step label (server/src/freeduet/work-status.ts); this only draws it.
 * "Stuck" is decided there, once, so the card and the dots always agree.
 */

export type HandoffState = "working" | "waiting" | "stuck" | "queued" | "done";

export type WorkHandoff = {
  id: string;
  fromBotId: string;
  toBotId: string;
  toName: string;
  threadId: string | null;
  state: HandoffState;
  since: string;
  title: string;
  lastStep: { label: string; at: string } | null;
  lastEventAt: string | null;
  /** D172: the hop gave up and waits on the person; the plain reason, as the Bots page says it. */
  stalled?: { reason: string } | null;
};

export type WorkMember = {
  agentId: string;
  name: string;
  state: "working" | "waiting" | "stuck" | "idle";
  since: string | null;
  handoffId: string | null;
  title: string | null;
  lastStep: { label: string; at: string } | null;
};

export type WorkStatus = {
  handoffs: WorkHandoff[];
  members: WorkMember[];
  at: string;
};

/** How often to ask while something runs. */
export const WORK_POLL_MS = 5_000;

/** Something is still open (running, queued, waiting for the person, stuck): worth asking again. Only done and nothing are not. */
export function isActive(data: WorkStatus | undefined): boolean {
  return (data?.handoffs ?? []).some((hop) => hop.state !== "done");
}

/** Every 5 s while something runs; not at all when idle (a new hand-off is found on mount and on focus). */
export function workPollInterval(data: WorkStatus | undefined): number | false {
  return isActive(data) ? WORK_POLL_MS : false;
}

export const workStatusQueryOptions = () =>
  queryOptions({
    queryKey: ["freeduet", "work-status"],
    queryFn: () =>
      client<WorkStatus>("/api/freeduet/work-status", "work-status", {
        fallback: "Could not read who is working.",
      }),
    refetchInterval: (query) => workPollInterval(query.state.data),
    retry: false,
  });

/** "under a minute", "4 min", "2 h 5 min". */
export function elapsedText(sinceIso: string, now: number): string {
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(sinceIso).getTime()) / 60_000),
  );
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** The card's one line, in the order the maintainer asked: member, how long, last step. */
export function cardLine(hop: WorkHandoff, now: number): string {
  const who = hop.toName;
  if (hop.stalled) return `${who} · did not finish`;
  switch (hop.state) {
    case "done":
      return `${who} · done`;
    case "waiting":
      return `${who} · waiting for you`;
    case "queued":
      return `${who} · waiting to start`;
    case "stuck":
      return `${who} · stuck: no sign of life for ${elapsedText(hop.lastEventAt ?? hop.since, now)}`;
    default:
      return `${who} · working for ${elapsedText(hop.since, now)} · last step: ${hop.lastStep?.label ?? "just started"}`;
  }
}

export type DotState = "working" | "waiting" | "idle" | "stuck" | "done";

/** One dot per member: stuck beats waiting for you, which beats working, which beats idle. */
export function dotState(
  work: WorkMember | undefined,
  waitingForYou: boolean,
  busyChannel: boolean,
): DotState {
  if (work?.state === "stuck") return "stuck";
  if (waitingForYou || work?.state === "waiting") return "waiting";
  if (work?.state === "working" || busyChannel) return "working";
  return "idle";
}

export const DOT_TEXT: Record<DotState, string> = {
  working: "Working",
  waiting: "Waiting for you",
  idle: "Idle",
  stuck: "Stuck: no sign of life",
  done: "Done",
};

/** D180: a member whose latest hand-off just finished and who has nothing else going on shows a green ring for a moment. */
export const DONE_RING_WINDOW_MS = 15_000;
export function justDone(
  handoffs: WorkHandoff[],
  agentId: string,
  now: number,
): boolean {
  return handoffs.some(
    (hop) =>
      hop.toBotId === agentId &&
      hop.state === "done" &&
      now - new Date(hop.lastEventAt ?? hop.since).getTime() <=
        DONE_RING_WINDOW_MS,
  );
}

/** What a hover or a screen reader says about a dot. */
export function dotTooltip(state: DotState, work: WorkMember | undefined) {
  if ((state === "working" || state === "stuck") && work?.title)
    return `${DOT_TEXT[state]}: ${work.title}`;
  return DOT_TEXT[state];
}

/**
 * D188: a running hand-off with no sign of life for this long is stuck. The SERVER decides (`STUCK_AFTER_MS` in
 * server/src/freeduet/work-status.ts); the app does not import server code, so this is the same number, pinned equal by
 * `app/tests/freeduet-working-now.test.tsx`. It only sets how far a waiting ring fills; "stuck" itself is the server's word.
 */
export const STUCK_AFTER_MS = 5 * 60 * 1000;

/** The open hand-offs asked from one conversation (`threadId`), or, with none, asked by one member (`fromBotId`). Never "done". */
export function openHandoffs(
  data: WorkStatus | undefined,
  where: { threadId?: string | null; fromBotId?: string | null },
): WorkHandoff[] {
  return (data?.handoffs ?? []).filter(
    (hop) =>
      hop.state !== "done" &&
      (where.threadId
        ? hop.threadId === where.threadId
        : where.fromBotId
          ? hop.fromBotId === where.fromBotId
          : false),
  );
}

/** How far a waiting ring is filled, 0 to 1: full at the stuck threshold. */
export function ringFill(elapsedMs: number): number {
  return Math.min(1, Math.max(0, elapsedMs / STUCK_AFTER_MS));
}

/** The ring's state from the open hand-offs: how long the oldest has waited, and whether the server says any is stuck. */
export function waitOf(
  hops: readonly WorkHandoff[],
  now: number,
): { elapsedMs: number; stuck: boolean } | null {
  if (hops.length === 0) return null;
  const oldest = Math.min(...hops.map((hop) => new Date(hop.since).getTime()));
  return {
    elapsedMs: Math.max(0, now - oldest),
    stuck: hops.some((hop) => hop.state === "stuck"),
  };
}

export const TASK_CLIP = 120;

/** The task as the strip shows it: at most 120 characters. */
export function clipTask(title: string): string {
  const text = title.trim();
  return text.length <= TASK_CLIP ? text : `${text.slice(0, TASK_CLIP - 1)}…`;
}

/** The server's fixed step labels (`stepLabel` in server/src/freeduet/work-status.ts) and the catalogue key that says each in the app language. */
export const STEP_KEYS = {
  "writing a file": "working.step.writing",
  "reading files": "working.step.reading",
  "running a command": "working.step.command",
  "reading a page": "working.step.readPage",
  "using a page": "working.step.usePage",
  searching: "working.step.searching",
  "working on mail": "working.step.mail",
  "checking the calendar": "working.step.calendar",
  "asking a colleague": "working.step.asking",
  "using its notes": "working.step.notes",
  "working on a picture": "working.step.picture",
  "working on a video": "working.step.video",
  working: "working.step.working",
} as const;
