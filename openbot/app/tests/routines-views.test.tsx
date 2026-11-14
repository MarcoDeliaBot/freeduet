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
import { RoutinesList } from "@/components/routines/routines-list";
import { settleReactWork } from "./settle-react-work";

/**
 * The Routines screen's three views over the same routines: the list the page always showed, the next
 * runs over the next fourteen days, and the history of what ran. The last two only read.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const SOON = new Date(Date.now() + 60 * 60_000).toISOString();

const routine = {
  id: "r1",
  agentId: "expenses",
  schedule: "Every weekday at 9:00",
  timezone: "Europe/Rome",
  instruction: "Send me the day's bills",
  channel: { id: "c1", name: "Bills", gone: false },
  enabled: true,
  nextRunAt: SOON,
  lastRun: null,
};

/** Answers the reads the screen makes. `routinesFail` makes the routines read fail. */
function serving(options: { routinesFail?: boolean } = {}) {
  const sent: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    sent.push(url);
    if (url === "/api/routines") {
      if (options.routinesFail)
        return Response.json({ error: "The server is busy." }, { status: 500 });
      return Response.json({
        routines: [routine],
        sweep: { lastSweptAt: new Date().toISOString(), working: true },
      });
    }
    if (url.startsWith("/api/routines/calendar"))
      return Response.json({
        from: new Date().toISOString(),
        to: SOON,
        runs: [{ routineId: "r1", agentId: "expenses", at: SOON }],
        truncated: false,
      });
    if (url.startsWith("/api/routines/runs"))
      return Response.json({
        runs: [
          {
            id: "run_1",
            routineId: "r1",
            agentId: "expenses",
            status: "succeeded",
            startedAt: "2026-11-15T08:00:00.000Z",
            finishedAt: "2026-11-15T08:01:00.000Z",
            error: null,
            source: "schedule",
          },
        ],
      });
    if (url.startsWith("/api/agents"))
      return Response.json({ agents: [{ id: "expenses", name: "Expenses" }] });
    return Response.json({});
  }) as unknown as typeof fetch;
  return sent;
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

test("the list opens first, and the other two views are one press away", async () => {
  serving();
  const view = draw(() => <RoutinesList />);
  expect(await view.findByText("Every weekday at 9:00")).toBeTruthy();
  const switcher = view.getByRole("group", { name: "View" });
  expect(
    within(switcher)
      .getByRole("button", { name: "Routines" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(within(switcher).getByRole("button", { name: "Next runs" }));
  expect(
    within(switcher)
      .getByRole("button", { name: "Next runs" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  // The list's own switch is not drawn in the other views.
  expect(
    view.queryByLabelText("Enable the routine scheduled Every weekday at 9:00"),
  ).toBeNull();
});

test("next runs shows each routine's next run with the Bot that carries it out", async () => {
  const sent = serving();
  const view = draw(() => <RoutinesList />);
  await view.findByText("Every weekday at 9:00");
  fireEvent.click(view.getByRole("button", { name: "Next runs" }));
  expect(await view.findByText("Expenses")).toBeTruthy();
  expect(view.getByText("Send me the day's bills")).toBeTruthy();
  // Across every Bot, so the request names no Bot.
  expect(sent.some((url) => url.startsWith("/api/routines/calendar?"))).toBe(
    true,
  );
  expect(sent.some((url) => url.includes("agentId="))).toBe(false);
});

test("a Bot's page asks only for that Bot's runs, in its history", async () => {
  const sent = serving();
  const view = draw(() => <RoutinesList agentId="expenses" />);
  await view.findByText("Every weekday at 9:00");
  fireEvent.click(view.getByRole("button", { name: "History" }));
  expect(await view.findByText("Succeeded")).toBeTruthy();
  expect(view.getByText(/Scheduled · Expenses/)).toBeTruthy();
  expect(sent).toContain("/api/routines/runs?limit=100&agentId=expenses");
});

test("a routines read that fails says so in every view", async () => {
  serving({ routinesFail: true });
  const view = draw(() => <RoutinesList />);
  const message = "Couldn't load your routines. Reload the page.";
  expect(await view.findByText(message)).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Next runs" }));
  expect(view.getByText(message)).toBeTruthy();
  expect(view.queryByText(/Nothing is scheduled/)).toBeNull();
});
