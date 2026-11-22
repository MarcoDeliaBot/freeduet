import { expect, test } from "bun:test";
import {
  type CalendarSource,
  upcomingRuns,
} from "../../server/src/routines/calendar";
import type { RoutineRecord } from "@/lib/routines/queries";
import {
  blockLabel,
  buildWeek,
  readRememberedView,
  rememberView,
  summaryStatus,
  VIEW_STORAGE_KEY,
  type WeekRun,
  weekDays,
  weekWindow,
} from "@/lib/routines/week-view";

/**
 * The week grid places instants the server's own expansion lists. These tests feed it the REAL server
 * expansion (`upcomingRuns`), so what is checked is what the page would draw, never a second reading of a cron.
 */

const ROME = "Europe/Rome";

function routine(
  id: string,
  schedule: string,
  agentId = "inbox",
): RoutineRecord {
  return {
    id,
    agentId,
    schedule,
    timezone: ROME,
    instruction: `Task ${id}`,
    channel: { id: `c_${id}`, name: id, gone: false },
    enabled: true,
    nextRunAt: "2026-01-01T00:00:00.000Z",
    lastRun: null,
  };
}

function expand(
  now: Date,
  crons: Record<string, string>,
  zone = ROME,
): WeekRun[] {
  const sources: CalendarSource[] = Object.entries(crons).map(([id, cron]) => ({
    id,
    agentId: "inbox",
    cron,
    timezone: zone,
    nextRunAt: now,
  }));
  const window = weekWindow(now);
  const { runs } = upcomingRuns(sources, {
    from: new Date(window.from),
    to: new Date(window.to),
  });
  return runs.map((run) => ({
    routineId: run.routineId,
    agentId: run.agentId,
    at: run.at,
    status: "upcoming" as const,
  }));
}

// Wednesday 18 November 2026, 07:30 in Rome.
const NOW = new Date("2026-11-18T06:30:00Z");

function dayOf(model: ReturnType<typeof buildWeek>, key: string) {
  const column = model.columns.find((c) => c.key === key);
  if (!column) throw new Error(`no column ${key}`);
  return column;
}

test("daily: one block at 09:00 on every day left in the week, weekend drawn", () => {
  const routines = [routine("daily", "Every day at 9:00")];
  const model = buildWeek({
    runs: expand(NOW, { daily: "0 9 * * *" }),
    routines,
    now: NOW,
    zone: ROME,
  });
  const days = model.columns
    .filter((c) => c.blocks.length > 0)
    .map((c) => c.key);
  expect(days).toEqual([
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
    "2026-11-22",
  ]);
  for (const column of model.columns) {
    for (const block of column.blocks) expect(block.startMin).toBe(540);
  }
  expect(model.showWeekend).toBe(true);
});

test("weekdays: Wed, Thu and Fri only, and no weekend columns", () => {
  const model = buildWeek({
    runs: expand(NOW, { wk: "0 9 * * 1-5" }),
    routines: [routine("wk", "Every weekday at 9:00")],
    now: NOW,
    zone: ROME,
  });
  expect(
    model.columns.filter((c) => c.blocks.length).map((c) => c.index),
  ).toEqual([2, 3, 4]);
  expect(model.showWeekend).toBe(false);
});

test("weekly: a Friday 11:00 routine is one block on Friday", () => {
  const model = buildWeek({
    runs: expand(NOW, { w: "0 11 * * 5" }),
    routines: [routine("w", "Every Friday at 11:00")],
    now: NOW,
    zone: ROME,
  });
  const friday = dayOf(model, "2026-11-20");
  expect(friday.blocks.map((b) => b.startMin)).toEqual([660]);
  expect(model.columns.flatMap((c) => c.blocks)).toHaveLength(1);
});

test("monthly on a day: only the 20th of this month falls in the week", () => {
  const model = buildWeek({
    runs: expand(NOW, { m: "30 16 20 * *" }),
    routines: [routine("m", "On the 20th at 16:30")],
    now: NOW,
    zone: ROME,
  });
  const all = model.columns.flatMap((c) => c.blocks);
  expect(all).toHaveLength(1);
  expect(all[0]?.dayKey).toBe("2026-11-20");
  expect(all[0]?.startMin).toBe(16 * 60 + 30);
});

test("every few minutes: one summary block per day, never one block per run", () => {
  const runs = expand(NOW, { busy: "*/15 9-10 * * *" });
  expect(runs.length).toBeGreaterThan(20);
  const model = buildWeek({
    runs,
    routines: [routine("busy", "Every 15 minutes, 9:00 to 10:59")],
    now: NOW,
    zone: ROME,
  });
  for (const column of model.columns) {
    expect(column.blocks.length).toBeLessThanOrEqual(1);
  }
  const thursday = dayOf(model, "2026-11-19").blocks[0];
  expect(thursday?.kind).toBe("summary");
  expect(thursday?.count).toBe(8);
  expect(thursday?.everyMinutes).toBe(15);
  expect(thursday?.startMin).toBe(540);
});

test("hourly and sparser runs stay separate blocks", () => {
  const model = buildWeek({
    runs: expand(NOW, { three: "0 9,13,17 * * 4" }),
    routines: [routine("three", "Thursdays at 9, 13 and 17")],
    now: NOW,
    zone: ROME,
  });
  const thursday = dayOf(model, "2026-11-19");
  expect(thursday.blocks.map((b) => [b.kind, b.startMin])).toEqual([
    ["single", 540],
    ["single", 780],
    ["single", 1020],
  ]);
});

test("a run of a routine the page does not hold is left out", () => {
  const model = buildWeek({
    runs: expand(NOW, { ghost: "0 9 * * *" }),
    routines: [],
    now: NOW,
    zone: ROME,
  });
  expect(model.columns.flatMap((c) => c.blocks)).toHaveLength(0);
  expect(model.next).toBeNull();
});

test("daylight saving: the week the clocks go back keeps seven days and 09:00 stays 09:00", () => {
  // Rome leaves summer time on Sunday 25 October 2026.
  const now = new Date("2026-10-21T05:00:00Z");
  const days = weekDays(now, ROME).map((d) => d.key);
  expect(days).toEqual([
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
  const runs = expand(now, { d: "0 9 * * *" });
  const rome = buildWeek({
    runs,
    routines: [routine("d", "Every day at 9:00")],
    now,
    zone: ROME,
  });
  const starts = rome.columns.flatMap((c) =>
    c.blocks.map((b) => [c.key, b.startMin]),
  );
  expect(starts).toEqual([
    ["2026-10-21", 540],
    ["2026-10-22", 540],
    ["2026-10-23", 540],
    ["2026-10-24", 540],
    ["2026-10-25", 540],
  ]);
  // The same instants on a clock that does not change: Sunday is an hour later than Saturday.
  const utc = buildWeek({
    runs,
    routines: [routine("d", "x")],
    now,
    zone: "UTC",
  });
  expect(utc.columns[5]?.blocks[0]?.startMin).toBe(420);
  expect(utc.columns[6]?.blocks[0]?.startMin).toBe(480);
});

test("daylight saving: a run just before midnight stays on its own day after the change", () => {
  const now = new Date("2026-10-21T05:00:00Z");
  const runs = expand(now, { late: "30 23 * * *" });
  const model = buildWeek({
    runs,
    routines: [routine("late", "x")],
    now,
    zone: ROME,
  });
  expect(model.columns.flatMap((c) => c.blocks.map(() => c.key))).toEqual([
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
});

test("today is marked, and the now line sits at the wall-clock minute", () => {
  const model = buildWeek({
    runs: expand(NOW, { d: "0 9 * * *" }),
    routines: [routine("d", "x")],
    now: NOW,
    zone: ROME,
  });
  expect(model.columns.filter((c) => c.isToday).map((c) => c.key)).toEqual([
    "2026-11-18",
  ]);
  expect(model.nowMin).toBe(7 * 60 + 30);
});

test("next run: the earliest upcoming run, and none when only past runs exist", () => {
  const model = buildWeek({
    runs: [
      ...expand(NOW, { a: "0 15 * * 4", b: "0 9 * * 5" }),
      {
        routineId: "a",
        agentId: "inbox",
        at: new Date("2026-11-18T05:00:00Z"),
        status: "done",
      },
    ],
    routines: [routine("a", "x"), routine("b", "y")],
    now: NOW,
    zone: ROME,
  });
  expect(model.next?.routine.id).toBe("a");
  expect(model.next?.at.toISOString()).toBe("2026-11-19T14:00:00.000Z");
  const none = buildWeek({
    runs: [
      {
        routineId: "a",
        agentId: "inbox",
        at: new Date("2026-11-18T05:00:00Z"),
        status: "done",
      },
    ],
    routines: [routine("a", "x")],
    now: NOW,
    zone: ROME,
  });
  expect(none.next).toBeNull();
  expect(none.columns[2]?.blocks[0]?.status).toBe("done");
});

test("overlapping blocks share the slot side by side", () => {
  const model = buildWeek({
    runs: expand(NOW, { a: "0 9 * * 4", b: "10 9 * * 4" }),
    routines: [routine("a", "x"), routine("b", "y")],
    now: NOW,
    zone: ROME,
  });
  const blocks = dayOf(model, "2026-11-19").blocks;
  expect(blocks.map((b) => [b.lane, b.lanes])).toEqual([
    [0, 2],
    [1, 2],
  ]);
});

test("a block's label names the routine, the member, the time and the schedule", () => {
  const model = buildWeek({
    runs: expand(NOW, { d: "0 9 * * 4" }),
    routines: [routine("d", "Every Thursday at 9:00")],
    now: NOW,
    zone: ROME,
  });
  const block = dayOf(model, "2026-11-19").blocks[0];
  if (!block) throw new Error("no block");
  expect(blockLabel(block, "Otto", ROME, "en-GB")).toBe(
    "Task d, Otto, Thu 09:00, Every Thursday at 9:00",
  );
});

test("the remembered view: the list unless Week was chosen, and a broken store never throws", () => {
  const store = new Map<string, string>();
  const ok = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  expect(readRememberedView(ok)).toBe("routines");
  rememberView("week", ok);
  expect(store.get(VIEW_STORAGE_KEY)).toBe("week");
  expect(readRememberedView(ok)).toBe("week");
  rememberView("routines", ok);
  expect(readRememberedView(ok)).toBe("routines");
  store.set(VIEW_STORAGE_KEY, "garbage");
  expect(readRememberedView(ok)).toBe("routines");
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  expect(readRememberedView(broken)).toBe("routines");
  expect(() => rememberView("week", broken)).not.toThrow();
});

test("a day's summary status: a failure is never hidden, then running, upcoming, done, missed", () => {
  expect(summaryStatus(["done", "failed", "done"])).toBe("failed");
  expect(summaryStatus(["failed", "upcoming"])).toBe("failed");
  expect(summaryStatus(["done", "running", "upcoming"])).toBe("running");
  expect(summaryStatus(["done", "pending", "upcoming"])).toBe("pending");
  expect(summaryStatus(["done", "upcoming"])).toBe("upcoming");
  expect(summaryStatus(["done", "done"])).toBe("done");
  expect(summaryStatus(["missed", "done"])).toBe("missed");
  expect(summaryStatus(["missed", "missed"])).toBe("missed");
});

test("summary blocks of past runs carry the failed and running status", () => {
  const runsOf = (statuses: WeekRun["status"][]): WeekRun[] =>
    statuses.map((status, i) => ({
      routineId: "busy",
      agentId: "inbox",
      at: new Date(Date.UTC(2026, 10, 17, 8, i * 10)),
      status,
    }));
  const build = (statuses: WeekRun["status"][]) =>
    buildWeek({
      runs: runsOf(statuses),
      routines: [routine("busy", "x")],
      now: NOW,
      zone: ROME,
    }).columns.flatMap((c) => c.blocks)[0];
  expect(build(["failed", "failed", "failed"])?.status).toBe("failed");
  expect(build(["done", "done", "running"])?.status).toBe("running");
  expect(build(["done", "done", "done"])?.status).toBe("done");
});

test("a block never ends after midnight: 23:30 is clamped to 24:00", () => {
  const model = buildWeek({
    runs: expand(NOW, { late: "30 23 * * 4" }),
    routines: [routine("late", "x")],
    now: NOW,
    zone: ROME,
  });
  const block = dayOf(model, "2026-11-19").blocks[0];
  expect(block?.startMin).toBe(23 * 60 + 30);
  expect(block?.endMin).toBe(24 * 60);
  expect(model.lastHour).toBe(24);
});
