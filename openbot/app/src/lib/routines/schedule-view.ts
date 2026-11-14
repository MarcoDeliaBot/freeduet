import type { RoutineRecord } from "./queries";
import type { UpcomingRunRecord } from "./schedule-queries";

/**
 * The calendar and the history as the page draws them: which day a run falls on, how its time reads, and
 * which routine it belongs to. Pure, so the rules have tests and the components only draw.
 *
 * TIMES ARE THE DEVICE'S. The app keeps no time zone per person; a routine's zone is the one its cron is
 * read in. So a time reads in the device's zone, the way every other stamp in the app does. When the
 * routine's zone differs from the device's, its own clock is written beside the time, so "09:00 Europe/Rome"
 * is never taken for the person's own nine o'clock by accident.
 */

/** The calendar looks this far ahead. The server refuses a longer window, so the two must agree. */
export const CALENDAR_DAYS = 14;
/** The most runs one calendar answer holds. The server caps at the same number. */
export const CALENDAR_MAX_RUNS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window the calendar asks for: from now, to fourteen days on. */
export function calendarRange(now: Date): { from: string; to: string } {
  return {
    from: now.toISOString(),
    to: new Date(now.getTime() + CALENDAR_DAYS * DAY_MS).toISOString(),
  };
}

/** The local calendar day of an instant, as a sortable key such as "2026-11-16". */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const weekdayDate = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const stampFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "Today", "Tomorrow", or the weekday and date: the heading over one day's runs. */
export function dayHeading(day: Date, now: Date): string {
  const key = localDayKey(day);
  if (key === localDayKey(now)) return "Today";
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  if (key === localDayKey(tomorrow)) return "Tomorrow";
  return weekdayDate.format(day);
}

export type DayGroup<T> = { key: string; heading: string; items: T[] };

/** Items already in time order, cut into runs of consecutive local days. */
export function groupByDay<T>(
  items: readonly T[],
  at: (item: T) => Date,
  now: Date,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const when = at(item);
    const key = localDayKey(when);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, heading: dayHeading(when, now), items: [item] });
    }
  }
  return groups;
}

/** A time of day in the device's zone: "9:00 AM", or "09:00" where the locale writes it so. */
export function clockOf(at: Date): string {
  return clockFormat.format(at);
}

/** A date and time in the device's zone, for a history row: "16 Nov, 9:00 AM". */
export function stampOf(at: Date): string {
  return stampFormat.format(at);
}

/** The device's IANA zone, or undefined where the platform does not say. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The routine's own clock for an instant, such as "09:00 Europe/Rome", or null when the routine is on the
 * device's zone (nothing to add) or the zone is not one the platform knows.
 */
export function ownClockNote(
  at: Date,
  zone: string,
  device: string | undefined = deviceTimeZone(),
): string | null {
  if (zone === device) return null;
  try {
    const own = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }).format(at);
    return `${own} ${zone}`;
  } catch {
    return null;
  }
}

/** One calendar row: the run, its Bot, and the routine it belongs to. */
export type CalendarRow = {
  routineId: string;
  agentId: string;
  at: Date;
  routine: RoutineRecord;
};

/**
 * The server's upcoming runs joined to the routines the page already has. A run whose routine is not in the
 * list is left out: the list is the page's own view of what exists, and a run without one has nothing to show.
 */
export function calendarRows(
  runs: readonly UpcomingRunRecord[],
  routines: readonly RoutineRecord[],
): CalendarRow[] {
  const byId = routinesById(routines);
  const rows: CalendarRow[] = [];
  for (const run of runs) {
    const routine = byId.get(run.routineId);
    if (routine) {
      rows.push({
        routineId: run.routineId,
        agentId: run.agentId,
        at: new Date(run.at),
        routine,
      });
    }
  }
  return rows;
}

export function routinesById(
  routines: readonly RoutineRecord[],
): Map<string, RoutineRecord> {
  return new Map(routines.map((routine) => [routine.id, routine]));
}

/** "1 routine" or "3 routines". */
export function countRoutines(count: number): string {
  return count === 1 ? "1 routine" : `${count} routines`;
}
