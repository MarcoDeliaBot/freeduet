import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
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
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { RoutineWeek } from "@/components/routines/routine-week";
import { RoutinesList } from "@/components/routines/routines-list";
import type { RoutineRecord } from "@/lib/routines/queries";
import { VIEW_STORAGE_KEY } from "@/lib/routines/week-view";
import { settleReactWork } from "./settle-react-work";

/** The Routines page's List | Week toggle and the week grid it opens. */

beforeAll(() => GlobalRegistrator.register());
afterEach(() => {
  cleanup();
  localStorage.clear();
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

// Wednesday 18 November 2026, 07:30 in Rome.
const NOW = new Date("2026-11-18T06:30:00Z");
const ZONE = "Europe/Rome";

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
const rivals: RoutineRecord = {
  ...inbox,
  id: "r2",
  agentId: "marketer",
  schedule: "Every Thursday at 15:00",
  instruction: "Rivals",
  channel: { id: "c2", name: "Rivals", gone: false },
};

function serving(routines: RoutineRecord[], calendarRuns: unknown[]) {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/routines")
      return Response.json({
        routines,
        sweep: { lastSweptAt: new Date().toISOString(), working: true },
      });
    if (url.startsWith("/api/routines/calendar"))
      return Response.json({
        from: NOW.toISOString(),
        to: NOW.toISOString(),
        runs: calendarRuns,
        truncated: false,
      });
    if (url.startsWith("/api/routines/runs"))
      return Response.json({
        runs: [
          {
            id: "h1",
            routineId: "r1",
            agentId: "inbox",
            status: "succeeded",
            startedAt: "2026-11-18T05:00:00.000Z",
            finishedAt: "2026-11-18T05:01:00.000Z",
            error: null,
            source: "schedule",
            channelId: "c1",
            missed: false,
          },
        ],
      });
    if (url.startsWith("/api/agents"))
      return Response.json({
        agents: [
          { id: "inbox", name: "Otto" },
          { id: "marketer", name: "Mark" },
        ],
      });
    return Response.json({});
  }) as unknown as typeof fetch;
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

const upcoming = [
  { routineId: "r2", agentId: "marketer", at: "2026-11-19T14:00:00.000Z" },
  { routineId: "r1", agentId: "inbox", at: "2026-11-19T08:00:00.000Z" },
];

test("the list is the default view, and Week is one press away", async () => {
  serving([inbox], upcoming);
  const view = draw(() => <RoutinesList />);
  expect(await view.findByText("Every weekday at 9:00")).toBeTruthy();
  const switcher = view.getByRole("group", { name: "View" });
  expect(
    within(switcher)
      .getByRole("button", { name: "Routines" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(within(switcher).getByRole("button", { name: "Week" }));
  expect(
    within(switcher)
      .getByRole("button", { name: "Week" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(await view.findByLabelText("This week")).toBeTruthy();
});

test("the choice is kept per browser: Week reopens on Week, List writes the list back", async () => {
  serving([inbox], upcoming);
  const first = draw(() => <RoutinesList />);
  await first.findByText("Every weekday at 9:00");
  fireEvent.click(first.getByRole("button", { name: "Week" }));
  expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("week");
  first.unmount();

  const second = draw(() => <RoutinesList />);
  expect(await second.findByLabelText("This week")).toBeTruthy();
  expect(
    second.getByRole("button", { name: "Week" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(second.getByRole("button", { name: "Routines" }));
  expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("routines");
});

test("a browser with storage switched off still opens the list and toggles", async () => {
  serving([inbox], upcoming);
  const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("denied");
    },
  });
  try {
    const view = draw(() => <RoutinesList />);
    expect(await view.findByText("Every weekday at 9:00")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Week" }));
    expect(await view.findByLabelText("This week")).toBeTruthy();
  } finally {
    if (real) Object.defineProperty(globalThis, "localStorage", real);
  }
});

test("each run is a link with a full label, the member in it, a tick on a finished run and the footer names the next run", async () => {
  serving([inbox, rivals], upcoming);
  const view = draw(() => (
    <RoutineWeek now={NOW} routines={[inbox, rivals]} zone={ZONE} />
  ));
  const grid = await view.findByLabelText("This week");
  const block = within(grid).getByRole("link", {
    name: "Inbox, Otto, Thu 09:00, Every weekday at 9:00",
  });
  expect(block.getAttribute("href")).toBe("/channel/c1");
  expect(block.getAttribute("title")).toContain("Otto");
  const finished = within(grid).getByRole("link", {
    name: "Inbox, Otto, Wed 06:00, Every weekday at 9:00, done",
  });
  expect(finished.getAttribute("data-status")).toBe("done");
  const footer = grid.querySelector("[data-next]");
  expect(footer?.textContent).toContain("Next: ");
  expect(footer?.textContent).toContain("Inbox");
  // Thursday 09:00 Rome (08:00Z) comes before Rivals at 15:00.
  expect(footer?.textContent).toContain("09:00");
  // Today is marked, and the now line is drawn once in today's column.
  expect(grid.querySelectorAll("[data-today]").length).toBe(1);
  expect(grid.querySelectorAll("[data-now]").length).toBe(1);
});

test("with nothing left this week the footer says so", async () => {
  serving([inbox], []);
  const view = draw(() => (
    <RoutineWeek now={NOW} routines={[inbox]} zone={ZONE} />
  ));
  // The history still holds today's finished run, so the grid draws, with no next run.
  const grid = await view.findByLabelText("This week");
  expect(grid.textContent).toContain("Nothing else is scheduled this week.");
});

test("empty states: no routines, and none switched on", async () => {
  serving([], []);
  const none = draw(() => <RoutineWeek now={NOW} routines={[]} zone={ZONE} />);
  expect(
    await none.findByText("No routines yet, so nothing is scheduled."),
  ).toBeTruthy();
  none.unmount();
  serving([{ ...inbox, enabled: false }], []);
  const paused = draw(() => (
    <RoutineWeek
      now={NOW}
      routines={[{ ...inbox, id: "other", enabled: false }]}
      zone={ZONE}
    />
  ));
  expect(
    await paused.findByText(
      "None of these routines is switched on, so none will run.",
    ),
  ).toBeTruthy();
});

test("when the history cannot be loaded the week says so instead of staying silent", async () => {
  serving([inbox], upcoming);
  const ok = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).startsWith("/api/routines/runs")
      ? Response.json({ error: "down" }, { status: 500 })
      : ok(input, init)) as typeof fetch;
  const view = draw(() => (
    <RoutineWeek now={NOW} routines={[inbox]} zone={ZONE} />
  ));
  const grid = await view.findByLabelText("This week");
  await within(grid).findByText(/could not be loaded/);
  // The upcoming runs are still drawn.
  expect(within(grid).getByRole("link", { name: /Thu 09:00/ })).toBeTruthy();
});
