import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  jest,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { RoutineWeek } from "@/components/routines/routine-week";
import type { RoutineRecord } from "@/lib/routines/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * The week calendar without a fixed clock: the page's own 60 s tick, the focus and visibility listeners,
 * a run that passes while the tab is open, and the day that changes at midnight. Fake timers drive the tick.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const ZONE = "Europe/Rome";
// Wednesday 18 November 2026, 07:30 in Rome.
const MORNING = new Date("2026-11-18T06:30:00Z");

const inbox: RoutineRecord = {
  id: "r1",
  agentId: "inbox",
  schedule: "Every weekday at 9:00",
  timezone: ZONE,
  instruction: "Inbox",
  channel: { id: "c1", name: "Inbox", gone: false },
  enabled: true,
  nextRunAt: "2026-11-19T08:00:00.000Z",
  lastRun: null,
};

/** What the fake server holds; each test sets it before it renders or ticks. */
type Server = {
  calendarRuns: unknown[];
  history: unknown[];
  historyDown: boolean;
  calendarHeld: boolean;
  calls: { calendar: number; history: number };
};

function fakeServer(): Server {
  const server: Server = {
    calendarRuns: [],
    history: [],
    historyDown: false,
    calendarHeld: false,
    calls: { calendar: 0, history: 0 },
  };
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/routines")
      return Response.json({
        routines: [inbox],
        sweep: { lastSweptAt: new Date().toISOString(), working: true },
      });
    if (url.startsWith("/api/routines/calendar")) {
      server.calls.calendar += 1;
      if (server.calendarHeld) return new Promise<Response>(() => {});
      return Response.json({
        from: MORNING.toISOString(),
        to: MORNING.toISOString(),
        runs: server.calendarRuns,
        truncated: false,
      });
    }
    if (url.startsWith("/api/routines/runs")) {
      server.calls.history += 1;
      if (server.historyDown)
        return Response.json({ error: "down" }, { status: 500 });
      return Response.json({ runs: server.history });
    }
    if (url.startsWith("/api/agents"))
      return Response.json({ agents: [{ id: "inbox", name: "Otto" }] });
    return Response.json({});
  }) as unknown as typeof fetch;
  return server;
}

function draw(page: () => ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: page,
  });
  const channel = createRoute({
    getParentRoute: () => root,
    path: "/channel/$channelId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, channel]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

/** The grid as it is on screen now: a tick can replace the element, so a grid captured earlier can be stale. */
function gridNow(view: { container: HTMLElement }) {
  return view.container.querySelector<HTMLElement>('[aria-label="This week"]');
}

/** Lets React, react-query and the router finish the work a tick started, with fake timers still running. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      // react-query batches its notifications on a zero-delay timer, which the fake clock holds.
      jest.advanceTimersByTime(0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
  }
}

/** Moves the system clock to `at` and fires the page's 60 s tick once. */
async function tickTo(at: string) {
  setSystemTime(new Date(at));
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  await settle();
}

const passedAt = "2026-11-18T06:45:00.000Z";

test("unmount clears the 60 s tick and removes the focus and visibility listeners", async () => {
  jest.useFakeTimers();
  setSystemTime(MORNING);
  fakeServer();
  const timers = spyOn(globalThis, "setInterval");
  const cleared = spyOn(globalThis, "clearInterval");
  const added = spyOn(window, "addEventListener");
  const docAdded = spyOn(document, "addEventListener");
  const removed = spyOn(window, "removeEventListener");
  const docRemoved = spyOn(document, "removeEventListener");
  try {
    const view = draw(() => (
      <RoutineWeek routines={[inbox]} zone={ZONE} />
    ));
    await settle();
    const tick = timers.mock.results.length;
    expect(tick).toBeGreaterThan(0);
    const timerId = timers.mock.results.at(-1)?.value;
    const focus = added.mock.calls.find((c) => c[0] === "focus")?.[1];
    const visible = docAdded.mock.calls.find(
      (c) => c[0] === "visibilitychange",
    )?.[1];
    expect(focus).toBeDefined();
    expect(visible).toBeDefined();

    view.unmount();
    expect(cleared.mock.calls.some((c) => c[0] === timerId)).toBe(true);
    expect(removed.mock.calls.some((c) => c[1] === focus)).toBe(true);
    expect(docRemoved.mock.calls.some((c) => c[1] === visible)).toBe(true);
  } finally {
    timers.mockRestore();
    cleared.mockRestore();
    added.mockRestore();
    docAdded.mockRestore();
    removed.mockRestore();
    docRemoved.mockRestore();
  }
});

test("a run that passes while the tab is open stays on the grid as pending until the history has it", async () => {
  jest.useFakeTimers();
  setSystemTime(MORNING);
  const server = fakeServer();
  server.calendarRuns = [
    { routineId: "r1", agentId: "inbox", at: passedAt },
  ];
  const view = draw(() => <RoutineWeek routines={[inbox]} zone={ZONE} />);
  await settle();
  expect(gridNow(view)?.querySelector('[data-status="upcoming"]')).not.toBeNull();

  // The run's time passes; the history does not hold it yet.
  await tickTo("2026-11-18T06:50:00.000Z");
  expect(gridNow(view)?.querySelector('[data-status="upcoming"]')).toBeNull();
  expect(gridNow(view)?.querySelector('[data-status="pending"]')).not.toBeNull();
  expect(gridNow(view)?.textContent).toContain("Inbox");

  // The history catches up; a later tick refetches it and the placeholder becomes the recorded run.
  server.history = [
    {
      id: "h2",
      routineId: "r1",
      agentId: "inbox",
      status: "succeeded",
      startedAt: "2026-11-18T06:45:20.000Z",
      finishedAt: "2026-11-18T06:46:00.000Z",
      error: null,
      source: "schedule",
      channelId: "c1",
      missed: false,
    },
  ];
  await tickTo("2026-11-18T06:51:00.000Z");
  expect(gridNow(view)?.querySelector('[data-status="pending"]')).toBeNull();
  expect(gridNow(view)?.querySelectorAll('[data-status="done"]').length).toBe(1);
});

test("a history that cannot be loaded keeps a passed run on the grid as pending", async () => {
  jest.useFakeTimers();
  setSystemTime(MORNING);
  const server = fakeServer();
  server.historyDown = true;
  server.calendarRuns = [
    { routineId: "r1", agentId: "inbox", at: passedAt },
  ];
  const view = draw(() => <RoutineWeek routines={[inbox]} zone={ZONE} />);
  await settle();
  await tickTo("2026-11-18T06:50:00.000Z");
  expect(gridNow(view)?.querySelector('[data-status="pending"]')).not.toBeNull();
  expect(gridNow(view)?.textContent).toContain("could not be loaded");
});

test("at midnight the grid stays on screen while the new day's runs load", async () => {
  jest.useFakeTimers();
  // Wednesday 23:59:30 in Rome.
  setSystemTime(new Date("2026-11-18T22:59:30.000Z"));
  const server = fakeServer();
  server.calendarRuns = [
    { routineId: "r1", agentId: "inbox", at: "2026-11-19T08:00:00.000Z" },
  ];
  const view = draw(() => <RoutineWeek routines={[inbox]} zone={ZONE} />);
  await settle();
  expect(view.getByLabelText("This week")).toBeTruthy();

  // The day changes; the calendar for the new day is held, so it is still loading.
  server.calendarHeld = true;
  await tickTo("2026-11-18T23:00:30.000Z");
  expect(server.calls.calendar).toBeGreaterThan(1);
  expect(view.queryByLabelText("This week")).not.toBeNull();
});

test("while a run is pending, each 60 s tick refetches the history", async () => {
  jest.useFakeTimers();
  setSystemTime(MORNING);
  const server = fakeServer();
  server.calendarRuns = [
    { routineId: "r1", agentId: "inbox", at: passedAt },
  ];
  draw(() => <RoutineWeek routines={[inbox]} zone={ZONE} />);
  await settle();
  const before = server.calls.history;
  await tickTo("2026-11-18T06:50:00.000Z");
  expect(server.calls.history).toBeGreaterThan(before);
});

