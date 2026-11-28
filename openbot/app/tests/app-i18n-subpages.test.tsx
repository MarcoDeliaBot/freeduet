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
import { cleanup, render } from "@testing-library/react";
import { RoutinesList } from "@/components/routines/routines-list";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { relativeTime } from "@/lib/relative-time";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2e: the routines list and the relative times speak the app language, English when none is set. */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const TWO_MINUTES_AGO = new Date(Date.now() - 2 * 60_000).toISOString();

/** One routine that last ran two minutes ago, answered for the routines read. */
function serveRoutines() {
  global.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) === "/api/routines")
      return Response.json({
        routines: [
          {
            id: "r1",
            agentId: "expenses",
            schedule: "Every weekday at 9:00",
            timezone: "Europe/Rome",
            instruction: "Send me the day's bills",
            channel: { id: "c1", name: "Bills", gone: false },
            enabled: true,
            nextRunAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            lastRun: {
              status: "succeeded",
              at: TWO_MINUTES_AGO,
              missed: false,
            },
          },
        ],
        sweep: { lastSweptAt: new Date().toISOString(), working: true },
      });
    return Response.json({});
  }) as unknown as typeof fetch;
}

/** The routines list drawn in one app language, under a router because its rows link to conversations. */
function drawList(language: "it" | "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <AppLanguageValue language={language}>
        <RoutinesList />
      </AppLanguageValue>
    ),
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

test("the routines list and its relative times read Italian with the language set to it, and English otherwise", async () => {
  expect(relativeTime(TWO_MINUTES_AGO, "it")).toBe("2 minuti fa");
  serveRoutines();
  const it = drawList("it");
  expect(await it.findByText("Eseguita 2 minuti fa")).toBeTruthy();
  expect(it.getByText("Prossime esecuzioni")).toBeTruthy();
  cleanup();

  expect(relativeTime(TWO_MINUTES_AGO, "en")).toBe("2 minutes ago");
  serveRoutines();
  const en = drawList("en");
  expect(await en.findByText("Ran 2 minutes ago")).toBeTruthy();
  expect(en.getByText("Next runs")).toBeTruthy();
});

test("the first view tab reads List in English and Elenco in Italian, and the page title still reads Routines", async () => {
  serveRoutines();
  const en = drawList("en");
  expect(await en.findByText("Ran 2 minutes ago")).toBeTruthy();
  expect(
    en.getByRole("button", { name: "List" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(en.queryByRole("button", { name: "Routines" })).toBeNull();
  expect(SOURCE["nav.routines"]).toBe("Routines");
  cleanup();

  serveRoutines();
  const it = drawList("it");
  expect(await it.findByText("Eseguita 2 minuti fa")).toBeTruthy();
  expect(
    it.getByRole("button", { name: "Elenco" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(CATALOGS.it?.["nav.routines"]).toBe("Routine");
});
