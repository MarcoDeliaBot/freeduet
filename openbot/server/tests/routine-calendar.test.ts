import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../src/auth/guards";
import {
  CALENDAR_MAX_RUNS,
  type CalendarSource,
  calendarWindow,
  upcomingRuns,
} from "../src/routines/calendar";
import { createRoutineRoutes } from "../src/routines/routes";
import type {
  OwnedRunSummary,
  RoutineSchedule,
  RoutineStore,
} from "../src/routines/store";

const DAY_MS = 24 * 60 * 60 * 1000;

function source(overrides: Partial<CalendarSource> = {}): CalendarSource {
  return {
    id: "routine-a",
    agentId: "agent-iris",
    cron: "0 9 * * *",
    timezone: "UTC",
    nextRunAt: new Date("2027-03-01T09:00:00.000Z"),
    ...overrides,
  };
}

/** A window of whole days from a fixed start, so every expectation below is a literal instant. */
function window(fromIso: string, days: number) {
  const from = new Date(fromIso);
  return { from, to: new Date(from.getTime() + days * DAY_MS) };
}

function listed(runs: { routineId: string; at: Date }[]) {
  return runs.map((run) => [run.routineId, run.at.toISOString()]);
}

describe("calendarWindow", () => {
  const now = new Date("2026-11-16T10:30:00.000Z");

  test("defaults to the fourteen days after now", () => {
    const range = calendarWindow(undefined, undefined, now);
    expect(range).toEqual({
      from: now,
      to: new Date("2026-11-30T10:30:00.000Z"),
    });
  });

  test("takes both ends as instants that name their zone", () => {
    const range = calendarWindow(
      "2026-11-16T09:00:00Z",
      "2026-11-20T09:00:00+01:00",
      now,
    );
    expect(range).toEqual({
      from: new Date("2026-11-16T09:00:00.000Z"),
      to: new Date("2026-11-20T08:00:00.000Z"),
    });
  });

  test("refuses a start that has no zone, or is not a date", () => {
    expect(calendarWindow("2026-11-16T09:00:00", undefined, now)).toBe(
      "from must be a date and time with a zone, such as 2026-11-16T09:00:00Z.",
    );
    expect(calendarWindow("tomorrow", undefined, now)).toBe(
      "from must be a date and time with a zone, such as 2026-11-16T09:00:00Z.",
    );
  });

  test("refuses an end that is not later than the start", () => {
    expect(
      calendarWindow("2026-11-16T09:00:00Z", "2026-11-16T09:00:00Z", now),
    ).toBe("to must be later than from.");
  });

  test("refuses a window longer than fourteen days, and takes exactly fourteen", () => {
    expect(
      calendarWindow("2026-11-16T00:00:00Z", "2026-12-01T00:00:01Z", now),
    ).toBe("Pick a window of 14 days or less.");
    expect(
      calendarWindow("2026-11-16T00:00:00Z", "2026-11-30T00:00:00Z", now),
    ).toEqual({
      from: new Date("2026-11-16T00:00:00.000Z"),
      to: new Date("2026-11-30T00:00:00.000Z"),
    });
  });
});

describe("upcomingRuns", () => {
  test("lists each run inside the window, earliest first, with its routine and Bot", () => {
    const { runs, truncated } = upcomingRuns(
      [
        source({ id: "morning", cron: "0 9 * * *" }),
        source({
          id: "lunch",
          agentId: "agent-leo",
          cron: "30 12 * * *",
          nextRunAt: new Date("2027-03-01T12:30:00.000Z"),
        }),
      ],
      window("2027-03-01T00:00:00.000Z", 3),
    );

    expect(truncated).toBe(false);
    expect(listed(runs)).toEqual([
      ["morning", "2027-03-01T09:00:00.000Z"],
      ["lunch", "2027-03-01T12:30:00.000Z"],
      ["morning", "2027-03-02T09:00:00.000Z"],
      ["lunch", "2027-03-02T12:30:00.000Z"],
      ["morning", "2027-03-03T09:00:00.000Z"],
      ["lunch", "2027-03-03T12:30:00.000Z"],
    ]);
    expect(runs.map((run) => run.agentId)).toEqual([
      "agent-iris",
      "agent-leo",
      "agent-iris",
      "agent-leo",
      "agent-iris",
      "agent-leo",
    ]);
  });

  test("starts from the stored clock once it is in the future, so the first run is the page's Next", () => {
    const { runs } = upcomingRuns(
      [
        source({
          cron: "0 9 * * *",
          nextRunAt: new Date("2027-03-02T09:00:00.000Z"),
        }),
      ],
      window("2027-03-01T00:00:00.000Z", 3),
    );

    expect(listed(runs)[0]).toEqual(["routine-a", "2027-03-02T09:00:00.000Z"]);
  });

  test("lists a routine that is due but not yet swept from the start of the window", () => {
    const { runs } = upcomingRuns(
      [
        source({
          cron: "0 9 * * *",
          nextRunAt: new Date("2026-12-01T09:00:00.000Z"),
        }),
      ],
      window("2027-03-01T00:00:00.000Z", 2),
    );

    expect(listed(runs)).toEqual([
      ["routine-a", "2027-03-01T09:00:00.000Z"],
      ["routine-a", "2027-03-02T09:00:00.000Z"],
    ]);
  });

  test("keeps a local nine o'clock at nine across the spring clock change in the routine's zone", () => {
    const { runs } = upcomingRuns(
      [
        source({
          cron: "0 9 * * *",
          timezone: "Europe/Rome",
          nextRunAt: new Date("2027-03-26T08:00:00.000Z"),
        }),
      ],
      window("2027-03-26T00:00:00.000Z", 5),
    );

    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(runs.map((run) => clock.format(run.at))).toEqual([
      "09:00",
      "09:00",
      "09:00",
      "09:00",
      "09:00",
    ]);
    // Italy moves its clock forward on 28 March 2027, so the same local nine is an hour earlier in UTC after it.
    expect(listed(runs).map((pair) => pair[1])).toEqual([
      "2027-03-26T08:00:00.000Z",
      "2027-03-27T08:00:00.000Z",
      "2027-03-28T07:00:00.000Z",
      "2027-03-29T07:00:00.000Z",
      "2027-03-30T07:00:00.000Z",
    ]);
  });

  test("leaves out the window's end, which is not part of it", () => {
    const { runs } = upcomingRuns([source({ cron: "0 9 * * *" })], {
      from: new Date("2027-03-01T00:00:00.000Z"),
      to: new Date("2027-03-02T09:00:00.000Z"),
    });

    expect(listed(runs)).toEqual([["routine-a", "2027-03-01T09:00:00.000Z"]]);
  });

  test("caps the answer at the limit and says it was truncated", () => {
    // Every fifteen minutes for fourteen days is 1,344 runs; the answer holds 500 and says there were more.
    const { runs, truncated } = upcomingRuns(
      [
        source({
          cron: "*/15 * * * *",
          nextRunAt: new Date("2027-03-01T00:00:00.000Z"),
        }),
      ],
      window("2027-03-01T00:00:00.000Z", 14),
    );

    expect(runs).toHaveLength(CALENDAR_MAX_RUNS);
    expect(truncated).toBe(true);
    expect(runs[0]?.at.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(runs[CALENDAR_MAX_RUNS - 1]?.at.toISOString()).toBe(
      "2027-03-06T04:45:00.000Z",
    );
  });

  test("is not truncated when the runs fill the cap exactly", () => {
    // Five hundred runs fifteen minutes apart fill a window of exactly 125 hours with no run to spare.
    const { runs, truncated } = upcomingRuns(
      [
        source({
          cron: "*/15 * * * *",
          nextRunAt: new Date("2027-03-01T00:00:00.000Z"),
        }),
      ],
      {
        from: new Date("2027-03-01T00:00:00.000Z"),
        to: new Date("2027-03-06T05:00:00.000Z"),
      },
    );

    expect(runs).toHaveLength(CALENDAR_MAX_RUNS);
    expect(truncated).toBe(false);
  });

  test("leaves out a routine whose schedule cannot be read, and still lists the rest", () => {
    const { runs } = upcomingRuns(
      [
        source({ id: "broken", cron: "not a schedule" }),
        source({ id: "fine", cron: "0 9 * * *" }),
      ],
      window("2027-03-01T00:00:00.000Z", 1),
    );

    expect(listed(runs)).toEqual([["fine", "2027-03-01T09:00:00.000Z"]]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * GET /calendar and GET /runs, against a store that answers from memory. The owner guard itself is
 * tested against real Postgres in routine-history.integration.test.ts.
 * ---------------------------------------------------------------------------------------------- */

const actor = {
  id: "user-1",
  email: "member@openbot.test",
  role: "user",
} as const;

function schedule(overrides: Partial<RoutineSchedule> = {}): RoutineSchedule {
  return {
    id: "routine-1",
    agentId: "agent-iris",
    cron: "0 9 * * *",
    timezone: "UTC",
    enabled: true,
    nextRunAt: new Date("2027-03-01T09:00:00.000Z"),
    ...overrides,
  };
}

function firing(overrides: Partial<OwnedRunSummary> = {}): OwnedRunSummary {
  return {
    id: "routine_run-1",
    routineId: "routine-1",
    agentId: "agent-iris",
    status: "succeeded",
    startedAt: new Date("2027-02-28T09:00:00.000Z"),
    finishedAt: new Date("2027-02-28T09:00:40.000Z"),
    error: null,
    source: "schedule",
    ...overrides,
  };
}

type Calls = [method: string, ...arguments_: unknown[]][];

function fakeStore(data: {
  schedules?: RoutineSchedule[];
  runs?: OwnedRunSummary[];
}): { store: RoutineStore; calls: Calls } {
  const calls: Calls = [];
  const store = {
    async scheduleFor(ownerUserId: string) {
      calls.push(["scheduleFor", ownerUserId]);
      return data.schedules ?? [];
    },
    async listRunsFor(ownerUserId: string, limit?: number, agentId?: string) {
      calls.push(["listRunsFor", ownerUserId, limit, agentId ?? null]);
      return data.runs ?? [];
    },
  } as unknown as RoutineStore;
  return { store, calls };
}

const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
  context,
  next,
) => {
  context.set("actor", actor);
  await next();
};

function appFor(store: RoutineStore) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/", createRoutineRoutes(store, requireUser));
  return app;
}

const ASK = "from=2027-03-01T00:00:00Z&to=2027-03-03T00:00:00Z";

describe("GET /calendar", () => {
  test("refuses a window it cannot read, with the sentence for it", async () => {
    const { store } = fakeStore({});
    const response = await appFor(store).request(
      "http://openbot.test/calendar?from=yesterday",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "from must be a date and time with a zone, such as 2026-11-16T09:00:00Z.",
    });
  });

  test("lists the switched-on routines only, asking the store for the caller's own", async () => {
    const { store, calls } = fakeStore({
      schedules: [
        schedule({ id: "on", enabled: true }),
        schedule({ id: "off", enabled: false }),
      ],
    });
    const response = await appFor(store).request(
      `http://openbot.test/calendar?${ASK}`,
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([["scheduleFor", actor.id]]);
    expect(await response.json()).toEqual({
      from: "2027-03-01T00:00:00.000Z",
      to: "2027-03-03T00:00:00.000Z",
      runs: [
        {
          routineId: "on",
          agentId: "agent-iris",
          at: "2027-03-01T09:00:00.000Z",
        },
        {
          routineId: "on",
          agentId: "agent-iris",
          at: "2027-03-02T09:00:00.000Z",
        },
      ],
      truncated: false,
    });
  });

  test("keeps one Bot's routines when asked, so the cap counts only them", async () => {
    const { store } = fakeStore({
      schedules: [
        schedule({ id: "iris", agentId: "agent-iris" }),
        schedule({ id: "leo", agentId: "agent-leo" }),
      ],
    });
    const response = await appFor(store).request(
      `http://openbot.test/calendar?${ASK}&agentId=agent-leo`,
    );
    const body = (await response.json()) as { runs: { routineId: string }[] };

    expect(body.runs.map((item) => item.routineId)).toEqual(["leo", "leo"]);
  });

  test("refuses an empty Bot filter", async () => {
    const { store } = fakeStore({});
    const response = await appFor(store).request(
      `http://openbot.test/calendar?${ASK}&agentId=%20`,
    );

    expect(response.status).toBe(400);
  });
});

describe("GET /runs", () => {
  test("answers the caller's runs in the page's shape, an open run as running", async () => {
    const { store, calls } = fakeStore({
      runs: [
        firing({ id: "open", status: null, finishedAt: null }),
        firing({
          id: "parked",
          status: "waiting",
          error: null,
        }),
      ],
    });
    const response = await appFor(store).request("http://openbot.test/runs");

    expect(calls).toEqual([["listRunsFor", actor.id, 50, null]]);
    expect(await response.json()).toEqual({
      runs: [
        {
          id: "open",
          routineId: "routine-1",
          agentId: "agent-iris",
          status: "running",
          startedAt: "2027-02-28T09:00:00.000Z",
          finishedAt: null,
          error: null,
          source: "schedule",
        },
        {
          id: "parked",
          routineId: "routine-1",
          agentId: "agent-iris",
          status: "waiting",
          startedAt: "2027-02-28T09:00:00.000Z",
          finishedAt: "2027-02-28T09:00:40.000Z",
          error: null,
          source: "schedule",
        },
      ],
    });
  });

  test("passes the limit and the Bot filter to the store", async () => {
    const { store, calls } = fakeStore({});
    await appFor(store).request(
      "http://openbot.test/runs?limit=100&agentId=agent-leo",
    );

    expect(calls).toEqual([["listRunsFor", actor.id, 100, "agent-leo"]]);
  });

  test("refuses a limit that is not a whole number from 1 to 100", async () => {
    const { store, calls } = fakeStore({});
    for (const limit of ["0", "101", "ten", "2.5", "-3"]) {
      const response = await appFor(store).request(
        `http://openbot.test/runs?limit=${limit}`,
      );
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});
