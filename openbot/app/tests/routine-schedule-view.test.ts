import { describe, expect, test } from "bun:test";
import type { RoutineRecord } from "@/lib/routines/queries";
import type { UpcomingRunRecord } from "@/lib/routines/schedule-queries";
import {
  CALENDAR_DAYS,
  CALENDAR_MAX_RUNS,
  calendarRange,
  calendarRows,
  clockOf,
  countRoutines,
  dayHeading,
  groupByDay,
  localDayKey,
  ownClockNote,
  routinesById,
  stampOf,
} from "@/lib/routines/schedule-view";

/*
 * Dates are built in the device's own zone, so the day rules hold on any machine that runs the suite.
 * Month is 1-based here, as people write it.
 */
const at = (year: number, month: number, day: number, hour = 9, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

const routine = (overrides: Partial<RoutineRecord> = {}): RoutineRecord => ({
  id: "r1",
  agentId: "expenses",
  schedule: "Every weekday at 9:00",
  timezone: "Europe/Rome",
  instruction: "Send me the day's bills",
  channel: { id: "c1", name: "Bills", gone: false },
  enabled: true,
  nextRunAt: "2026-11-16T08:00:00.000Z",
  lastRun: null,
  ...overrides,
});

describe("the calendar window", () => {
  test("runs from now to fourteen days on, the length the server accepts", () => {
    const now = new Date("2026-11-16T09:00:00.000Z");
    expect(calendarRange(now)).toEqual({
      from: "2026-11-16T09:00:00.000Z",
      to: "2026-11-30T09:00:00.000Z",
    });
    expect(CALENDAR_DAYS).toBe(14);
    expect(CALENDAR_MAX_RUNS).toBe(500);
  });
});

describe("which day a run falls on", () => {
  test("a local day key is the year, month and day, zero-padded", () => {
    expect(localDayKey(at(2026, 1, 5, 0, 0))).toBe("2026-01-05");
    expect(localDayKey(at(2026, 11, 16, 23, 59))).toBe("2026-11-16");
  });

  test("today and tomorrow are named, and later days are named by their date", () => {
    const now = at(2026, 11, 16, 8);
    expect(dayHeading(at(2026, 11, 16, 20), now)).toBe("Today");
    expect(dayHeading(at(2026, 11, 17, 7), now)).toBe("Tomorrow");
    const later = dayHeading(at(2026, 11, 18, 9), now);
    expect(later).not.toBe("Today");
    expect(later).not.toBe("Tomorrow");
    expect(later).toContain("18");
  });

  test("runs are grouped into runs of consecutive local days, in the order given", () => {
    const now = at(2026, 11, 16, 8);
    const items = [
      at(2026, 11, 16, 9),
      at(2026, 11, 16, 17),
      at(2026, 11, 17, 9),
      at(2026, 11, 19, 9),
    ];
    const groups = groupByDay(items, (when) => when, now);
    expect(groups.map((group) => group.key)).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-19",
    ]);
    expect(groups.map((group) => group.heading)).toEqual([
      "Today",
      "Tomorrow",
      dayHeading(at(2026, 11, 19, 9), now),
    ]);
    expect(groups.map((group) => group.items)).toEqual([
      [items[0], items[1]],
      [items[2]],
      [items[3]],
    ]);
  });

  test("no runs make no day groups", () => {
    expect(groupByDay([], (when: Date) => when, at(2026, 11, 16))).toEqual([]);
  });
});

describe("how a time reads", () => {
  test("a clock time is in the device's zone and shows the minutes", () => {
    expect(clockOf(at(2026, 11, 16, 9, 5))).toContain("9:05");
  });

  test("a history stamp names the day, the month and the time", () => {
    const stamp = stampOf(at(2026, 11, 16, 9, 5));
    expect(stamp).toContain("16");
    expect(stamp).toContain("Nov");
    expect(stamp).toContain("9:05");
  });
});

describe("the routine's own clock", () => {
  // 08:00 UTC is 09:00 in Rome in November (CET, UTC+1).
  const instant = new Date("2026-11-16T08:00:00.000Z");

  test("is left out when the routine is on the device's zone", () => {
    expect(ownClockNote(instant, "Europe/Rome", "Europe/Rome")).toBeNull();
  });

  test("is written beside the time when the routine is on another zone", () => {
    const note = ownClockNote(instant, "Europe/Rome", "UTC");
    expect(note).toContain("9:00");
    expect(note).toContain("Europe/Rome");
  });

  test("is left out for a zone the platform does not know", () => {
    expect(ownClockNote(instant, "Not/A_Zone", "UTC")).toBeNull();
  });
});

describe("the calendar's rows", () => {
  test("each run is joined to its routine, in the order the server gave", () => {
    const expenses = routine({ id: "r1" });
    const garden = routine({
      id: "r2",
      agentId: "garden",
      schedule: "Every Monday at 8:00",
    });
    const runs: UpcomingRunRecord[] = [
      { routineId: "r2", agentId: "garden", at: "2026-11-16T07:00:00.000Z" },
      { routineId: "r1", agentId: "expenses", at: "2026-11-16T08:00:00.000Z" },
    ];
    const rows = calendarRows(runs, [expenses, garden]);
    expect(rows.map((row) => row.routineId)).toEqual(["r2", "r1"]);
    expect(rows.map((row) => row.routine)).toEqual([garden, expenses]);
    expect(rows.map((row) => row.agentId)).toEqual(["garden", "expenses"]);
    expect(rows.map((row) => row.at.toISOString())).toEqual([
      "2026-11-16T07:00:00.000Z",
      "2026-11-16T08:00:00.000Z",
    ]);
  });

  test("a run whose routine is not on the page is left out", () => {
    const rows = calendarRows(
      [
        {
          routineId: "gone",
          agentId: "expenses",
          at: "2026-11-16T08:00:00.000Z",
        },
      ],
      [routine({ id: "r1" })],
    );
    expect(rows).toEqual([]);
  });

  test("routines are found by their id", () => {
    const expenses = routine({ id: "r1" });
    const byId = routinesById([expenses]);
    expect(byId.get("r1")).toBe(expenses);
    expect(byId.get("r2")).toBeUndefined();
  });
});

test("counts read as plain words", () => {
  expect(countRoutines(0)).toBe("0 routines");
  expect(countRoutines(1)).toBe("1 routine");
  expect(countRoutines(3)).toBe("3 routines");
});
