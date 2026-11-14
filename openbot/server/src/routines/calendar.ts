import { CronExpressionParser } from "cron-parser";

/**
 * The calendar's arithmetic: when each switched-on routine runs next, inside a window the person asked for.
 *
 * NO SECOND SCHEDULER. Every instant listed here is expanded by the same library, in the same zone, from the
 * same stored clock (`nextRunAt`) that the sweep advances. The calendar reads the times the sweep will reach;
 * it never decides one.
 *
 * A PAGE, NOT A FEED. At most fourteen days and at most 500 runs. A routine that fires every fifteen minutes
 * has about 1,344 runs in fourteen days, so the answer says it was truncated rather than sending them all.
 */
export const CALENDAR_MAX_DAYS = 14;
export const CALENDAR_MAX_RUNS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
/** An ISO 8601 instant that names its zone: `2026-11-16T09:00:00Z`, with fractions or an offset. */
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i;

export type CalendarWindow = { from: Date; to: Date };

/** What the calendar reads from one routine. */
export type CalendarSource = {
  id: string;
  agentId: string;
  cron: string;
  timezone: string;
  nextRunAt: Date;
};

export type UpcomingRun = { routineId: string; agentId: string; at: Date };

/**
 * The window a request asks for, or the sentence that refuses it.
 *
 * Both ends default: `from` to now, and `to` to fourteen days after `from`. Each given end must be an
 * instant that names its zone, `to` must come after `from`, and the whole window may not be longer than
 * fourteen days. The sentences are plain because they go straight back to the page.
 */
export function calendarWindow(
  fromText: string | undefined,
  toText: string | undefined,
  now: Date,
): CalendarWindow | string {
  const from = fromText === undefined ? now : instantOf(fromText);
  if (from === null) {
    return "from must be a date and time with a zone, such as 2026-11-16T09:00:00Z.";
  }
  const to =
    toText === undefined
      ? new Date(from.getTime() + CALENDAR_MAX_DAYS * DAY_MS)
      : instantOf(toText);
  if (to === null) {
    return "to must be a date and time with a zone, such as 2026-11-30T09:00:00Z.";
  }
  if (to.getTime() <= from.getTime()) return "to must be later than from.";
  if (to.getTime() - from.getTime() > CALENDAR_MAX_DAYS * DAY_MS) {
    return `Pick a window of ${CALENDAR_MAX_DAYS} days or less.`;
  }
  return { from, to };
}

function instantOf(text: string): Date | null {
  if (!INSTANT.test(text)) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time) : null;
}

/**
 * The runs of the given routines that fall inside the window, earliest first, at most `maxRuns`.
 *
 * A routine starts from its stored clock once that clock is in the future, so its first listed run is the
 * one the page calls "Next". A clock already in the past means the sweep has not caught up yet: the routine
 * is listed from the window's start, and the sweep fires it on its own schedule.
 */
export function upcomingRuns(
  sources: readonly CalendarSource[],
  window: CalendarWindow,
  maxRuns: number = CALENDAR_MAX_RUNS,
): { runs: UpcomingRun[]; truncated: boolean } {
  const runs: UpcomingRun[] = [];
  for (const source of sources) {
    const start = Math.max(window.from.getTime(), source.nextRunAt.getTime());
    // One more than the cap per routine, so the total can tell "exactly the cap" from "more than the cap".
    for (const at of occurrencesBefore(
      source,
      start,
      window.to.getTime(),
      maxRuns + 1,
    )) {
      runs.push({ routineId: source.id, agentId: source.agentId, at });
    }
  }
  runs.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      (a.routineId < b.routineId ? -1 : a.routineId > b.routineId ? 1 : 0),
  );
  const truncated = runs.length > maxRuns;
  return { runs: runs.slice(0, maxRuns), truncated };
}

/**
 * One routine's occurrences from `start` (inclusive) to `end` (exclusive), at most `limit` of them.
 *
 * cron-parser's `next()` is strictly after its `currentDate`, so starting one millisecond before `start`
 * makes an occurrence that falls exactly on `start` count.
 */
function occurrencesBefore(
  source: CalendarSource,
  start: number,
  end: number,
  limit: number,
): Date[] {
  const found: Date[] = [];
  if (start >= end) return found;
  try {
    const expression = CronExpressionParser.parse(source.cron, {
      tz: source.timezone,
      currentDate: new Date(start - 1),
    });
    while (found.length < limit) {
      const at = expression.next().toDate();
      if (at.getTime() >= end) break;
      found.push(at);
    }
  } catch {
    // An expression that no longer reads, or one with no further occurrence, lists what it has reached.
    // Switching such a routine off is the sweep's job, not the calendar's.
  }
  return found;
}
