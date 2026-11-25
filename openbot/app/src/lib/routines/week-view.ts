import type { RoutineRecord } from "./queries";

/**
 * The week grid of the Routines page: which block goes in which day and time slot. Pure, so the rules have
 * tests and the component only draws.
 *
 * NO SECOND SCHEDULER. Every run placed here is an instant the server listed: an upcoming one from the
 * calendar answer (the server expands each cron in the routine's own zone, with the library the sweep fires
 * from), or one that already happened from the run history. This file never reads or expands a cron, and the
 * routine's `schedule` text is shown verbatim. It only decides where an instant falls in the week.
 *
 * TIMES ARE THE PERSON'S ZONE. The grid is built from civil dates (year, month, day), never from "now plus
 * 24 hours", so a day that is 23 or 25 hours long (a daylight-saving change) still has seven columns and each
 * run still falls on its own wall-clock time. A run at 09:00 in the routine's zone before the change and at
 * 09:00 after it is one instant 1 hour apart, and shows in the device's zone as what it is.
 */

/** The server's calendar answers a window of at most fourteen days; eight days from now always reach Sunday. */
const WINDOW_DAYS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The vertical size of one hour in the grid, in pixels. The component and the lane maths share it. */
export const HOUR_PX = 56;
/** How long a single run's block is drawn, in minutes: tall enough for a name and a member. */
export const BLOCK_MINUTES = 45;
/** A routine whose runs on one day are closer than this is drawn as one summary block for that day. */
export const SUMMARY_GAP_MINUTES = 60;
/** The grid always shows at least these hours; it grows to hold an earlier or a later block. */
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 18;

/** The window the week view asks the calendar for: from now to eight days on. */
export function weekWindow(now: Date): { from: string; to: string } {
  return {
    from: now.toISOString(),
    to: new Date(now.getTime() + WINDOW_DAYS * DAY_MS).toISOString(),
  };
}

/**
 * `pending` is a run whose time has passed and that the run history does not hold yet: it was due, and the
 * server's record of it has not arrived. It is not claimed to be running.
 */
export type RunStatus =
  | "upcoming"
  | "done"
  | "failed"
  | "running"
  | "pending"
  | "missed";

/** One run to place: an instant the server gave, and what became of it (upcoming for a future one). */
export type WeekRun = {
  routineId: string;
  agentId: string;
  at: Date;
  status: RunStatus;
};

/** A calendar-day: a civil date with no instant in it. */
type Civil = { year: number; month: number; day: number };

type Parts = Civil & { hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall-clock date and time of an instant in a zone. */
export function partsOf(at: Date, zone: string): Parts {
  const found: Record<string, number> = {};
  for (const part of partsFormatter(zone).formatToParts(at)) {
    if (part.type !== "literal") found[part.type] = Number(part.value);
  }
  return {
    year: found.year ?? 1970,
    month: found.month ?? 1,
    day: found.day ?? 1,
    // Some engines write midnight as 24 even with h23; both mean the start of the day.
    hour: (found.hour ?? 0) % 24,
    minute: found.minute ?? 0,
  };
}

/** The device's IANA zone, or UTC where the platform does not say. */
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function keyOf(day: Civil): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

/** A civil date moved by whole days. Calendar arithmetic only, so it has no daylight-saving error. */
function addDays(day: Civil, days: number): Civil {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

/** 0 for Monday to 6 for Sunday. */
function mondayIndex(day: Civil): number {
  const sunday0 = new Date(
    Date.UTC(day.year, day.month - 1, day.day),
  ).getUTCDay();
  return (sunday0 + 6) % 7;
}

export type WeekDay = {
  key: string;
  /** 0 for Monday to 6 for Sunday. */
  index: number;
  civil: Civil;
  isToday: boolean;
};

/** The seven days of the week that holds `now`, Monday first, in the zone. */
export function weekDays(now: Date, zone: string): WeekDay[] {
  const today = partsOf(now, zone);
  const monday = addDays(today, -mondayIndex(today));
  const todayKey = keyOf(today);
  return Array.from({ length: 7 }, (_, index) => {
    const civil = addDays(monday, index);
    const key = keyOf(civil);
    return { key, index, civil, isToday: key === todayKey };
  });
}

/** A short name for a routine: the first line of its instruction, cut to fit a block. */
export function routineTitle(
  routine: Pick<RoutineRecord, "instruction">,
  limit = 28,
): string {
  const line = (routine.instruction.split("\n")[0] ?? "").trim();
  if (line === "") return "Routine";
  return line.length <= limit ? line : `${line.slice(0, limit - 1).trimEnd()}…`;
}

export type WeekBlock = {
  /** Stable key: the routine, the day and the first minute. */
  id: string;
  routineId: string;
  agentId: string;
  routine: RoutineRecord;
  dayKey: string;
  /** Minutes after local midnight where the block starts, and where it ends in the grid. */
  startMin: number;
  endMin: number;
  /** The first run's instant: what a link or a label says the time is. */
  at: Date;
  kind: "single" | "summary";
  /** Runs the block stands for: 1, or the day's count for a summary. */
  count: number;
  /** For a summary, the usual gap between its runs, in minutes. */
  everyMinutes: number | null;
  /** The status of a single run; for a summary, done when every run is done and upcoming when any is. */
  status: RunStatus;
  doneCount: number;
  /** Side-by-side position where blocks overlap in time. */
  lane: number;
  lanes: number;
};

export type WeekColumn = WeekDay & { blocks: WeekBlock[] };

export type NextRun = { routine: RoutineRecord; agentId: string; at: Date };

export type WeekModel = {
  columns: WeekColumn[];
  /** Saturday and Sunday are drawn only when something falls on one of them. */
  showWeekend: boolean;
  firstHour: number;
  lastHour: number;
  /** Where the "now" line goes: minutes after local midnight. */
  nowMin: number;
  next: NextRun | null;
  routinesOnGrid: number;
};

/** One status for a day's many runs: a failure is never hidden by the runs around it. */
export function summaryStatus(statuses: readonly RunStatus[]): RunStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("upcoming")) return "upcoming";
  if (statuses.every((status) => status === "done")) return "done";
  return "missed";
}

const MINUTES_PER_DAY = 24 * 60;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Overlapping blocks of one day get lanes so two routines at the same hour sit side by side. */
function layOut(blocks: WeekBlock[]): void {
  blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster: WeekBlock[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const block of cluster) block.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const block of blocks) {
    if (cluster.length > 0 && block.startMin >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    block.lane = lane;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  close();
}

/**
 * The week as the grid draws it.
 *
 * `runs` are instants the server gave (upcoming from the calendar, past from the history). A run whose
 * routine the page does not hold is left out, and so is a run outside this week. A routine that runs more often
 * than hourly on a day is one summary block for that day, never one block per run.
 */
export function buildWeek(input: {
  runs: readonly WeekRun[];
  routines: readonly RoutineRecord[];
  now: Date;
  zone: string;
}): WeekModel {
  const { runs, routines, now, zone } = input;
  const days = weekDays(now, zone);
  const dayKeys = new Set(days.map((day) => day.key));
  const byId = new Map(routines.map((routine) => [routine.id, routine]));

  // Group by routine and day.
  const groups = new Map<
    string,
    { routine: RoutineRecord; dayKey: string; items: (WeekRun & Parts)[] }
  >();
  for (const run of runs) {
    const routine = byId.get(run.routineId);
    if (!routine) continue;
    const parts = partsOf(run.at, zone);
    const dayKey = keyOf(parts);
    if (!dayKeys.has(dayKey)) continue;
    const id = `${run.routineId}|${dayKey}`;
    const group = groups.get(id) ?? { routine, dayKey, items: [] };
    group.items.push({ ...run, ...parts });
    groups.set(id, group);
  }

  const blocksByDay = new Map<string, WeekBlock[]>(
    days.map((day) => [day.key, []]),
  );
  for (const group of groups.values()) {
    const items = group.items.sort((a, b) => a.at.getTime() - b.at.getTime());
    const minutes = items.map((item) => item.hour * 60 + item.minute);
    const gaps = minutes
      .slice(1)
      .map((minute, i) => minute - (minutes[i] ?? 0));
    const frequent =
      items.length >= 2 && Math.min(...gaps) < SUMMARY_GAP_MINUTES;
    const list = blocksByDay.get(group.dayKey);
    if (!list) continue;
    const base = {
      routineId: group.routine.id,
      routine: group.routine,
      dayKey: group.dayKey,
      lane: 0,
      lanes: 1,
    };
    if (frequent) {
      const first = items[0] as WeekRun;
      const startMin = minutes[0] ?? 0;
      const lastMin = minutes[minutes.length - 1] ?? startMin;
      const doneCount = items.filter((item) => item.status === "done").length;
      list.push({
        ...base,
        id: `${group.routine.id}|${group.dayKey}|summary`,
        agentId: first.agentId,
        startMin,
        endMin: Math.min(
          MINUTES_PER_DAY,
          Math.max(lastMin + 1, startMin + BLOCK_MINUTES),
        ),
        at: first.at,
        kind: "summary",
        count: items.length,
        everyMinutes: Math.max(1, Math.round(median(gaps))),
        status: summaryStatus(items.map((item) => item.status)),
        doneCount,
      });
    } else {
      items.forEach((item, i) => {
        const startMin = minutes[i] ?? 0;
        list.push({
          ...base,
          id: `${group.routine.id}|${group.dayKey}|${startMin}`,
          agentId: item.agentId,
          startMin,
          // A block never runs past midnight into the next day's column.
          endMin: Math.min(MINUTES_PER_DAY, startMin + BLOCK_MINUTES),
          at: item.at,
          kind: "single",
          count: 1,
          everyMinutes: null,
          status: item.status,
          doneCount: item.status === "done" ? 1 : 0,
        });
      });
    }
  }

  const columns: WeekColumn[] = days.map((day) => {
    const blocks = blocksByDay.get(day.key) ?? [];
    layOut(blocks);
    return { ...day, blocks };
  });

  const all = columns.flatMap((column) => column.blocks);
  const showWeekend = columns.some(
    (column) => column.index >= 5 && column.blocks.length > 0,
  );
  const today = partsOf(now, zone);
  const nowMin = today.hour * 60 + today.minute;
  // The grid grows to hold the "now" line too, so it is never cut off before the first block of the day.
  const earliest = Math.min(
    DEFAULT_FIRST_HOUR * 60,
    nowMin,
    ...all.map((b) => b.startMin),
  );
  const latest = Math.max(
    DEFAULT_LAST_HOUR * 60,
    nowMin,
    ...all.map((b) => b.endMin),
  );
  const firstHour = Math.floor(earliest / 60);
  const lastHour = Math.min(24, Math.ceil(latest / 60));
  const upcoming = runs
    .filter(
      (run) => run.status === "upcoming" && run.at.getTime() > now.getTime(),
    )
    .filter((run) => byId.has(run.routineId))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const nextRoutine = upcoming ? byId.get(upcoming.routineId) : undefined;

  return {
    columns,
    showWeekend,
    firstHour,
    lastHour,
    nowMin,
    next:
      upcoming && nextRoutine
        ? { routine: nextRoutine, agentId: upcoming.agentId, at: upcoming.at }
        : null,
    routinesOnGrid: new Set(all.map((block) => block.routineId)).size,
  };
}

/** "09:00" for a minute count. The grid's hour labels and block times read the same way. */
export function minuteLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "Thu 15:00": a weekday and a clock time in the zone, for the footer and the labels. */
export function dayAndClock(at: Date, zone: string, locale?: string): string {
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
  }).format(at);
  const clock = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return `${day} ${clock}`;
}

const STATUS_WORDS: Record<RunStatus, string> = {
  upcoming: "",
  done: "done",
  failed: "failed",
  running: "running now",
  pending: "due, not yet recorded",
  missed: "missed",
};

/**
 * What a block says to a screen reader and in its tooltip: "Inbox, Otto, Thu 09:00, Every weekday at 9:00".
 * Colour is never the only cue: the member's name is in it, and so is the state of a run that has happened.
 */
export function blockLabel(
  block: WeekBlock,
  memberName: string,
  zone: string,
  locale?: string,
): string {
  const parts = [routineTitle(block.routine), memberName];
  if (block.kind === "summary") {
    parts.push(
      `${block.count} runs on ${dayAndClock(block.at, zone, locale).split(" ")[0]}, about every ${block.everyMinutes} minutes`,
    );
  } else {
    parts.push(dayAndClock(block.at, zone, locale));
  }
  parts.push(block.routine.schedule);
  const status =
    block.kind === "summary"
      ? block.doneCount > 0
        ? `${block.doneCount} of ${block.count} done`
        : ""
      : STATUS_WORDS[block.status];
  if (status) parts.push(status);
  return parts.join(", ");
}

/**
 * One hue per member, so the same member is the same colour in every block. The team's own members take the
 * hues in the order the home page lists them; any other Bot takes one from its id.
 */
const TEAM_HUES: Readonly<Record<string, number>> = {
  freeduet: 255,
  inbox: 25,
  counsel: 300,
  bookkeeper: 150,
  concierge: 205,
  writer: 345,
  fixer: 75,
  chef: 50,
  reviewer: 180,
  marketer: 10,
  video: 280,
  trainer: 120,
  webdev: 160,
  gamedev: 95,
  designer: 245,
  creator: 230,
};

export function memberHue(agentId: string): number {
  const own = TEAM_HUES[agentId];
  if (own !== undefined) return own;
  let hash = 0x811c9dc5;
  for (const char of agentId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/** Where the choice of view is kept in the browser, and the two values the week toggle uses. */
export const VIEW_STORAGE_KEY = "freeduet.routines.view";
export type RememberedView = "routines" | "week";

/** The view the person last chose between List and Week, or the list. Never throws: storage may be off. */
export function readRememberedView(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): RememberedView {
  try {
    return storage?.getItem(VIEW_STORAGE_KEY) === "week" ? "week" : "routines";
  } catch {
    return "routines";
  }
}

export function rememberView(
  view: RememberedView,
  storage: Pick<Storage, "setItem"> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private browsing or a full store: the choice lasts for this visit only.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
