import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  mock,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MakeScreen } from "@/components/shell/make-screen";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { AppLanguageValue, englishT } from "@/freeduet/i18n/provider";
import { createTranslator } from "@/freeduet/i18n/translate";
import { countRoutines, dayHeading } from "@/lib/routines/schedule-view";
import { blockLabel } from "@/lib/routines/week-view";
import { nextRunWords } from "@/lib/routines/chat-card";
import { cardWordsOf, CARD_WORDS } from "@/freeduet/claude-connect";
import { queryClient } from "@/query-client";
import type { RouterContext } from "@/router-context";
import { Route as OnboardingRoute } from "@/routes/_authed/onboarding";
import { settleReactWork } from "./settle-react-work";

/*
 * `import.meta.glob` is Vite's, and `bun test` has no Vite: stubbed as the other create tests do.
 */
mock.module("@/lib/marks", () => ({
  markFor: (id: string | null | undefined) =>
    id ? `data:image/svg+xml,${id}` : null,
}));
const { NewBotSheet } = await import("@/components/agents/new-bot-sheet");

/**
 * D181 stage 2o: the onboarding page, the new-Bot sheet, the Make screen and the plain functions of
 * the routines and the Claude card read the app language. With no provider they read English, as every
 * older test of these screens relies on.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = globalThis.fetch;
beforeEach(() => {
  queryClient.clear();
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/me")
        return Response.json({
          user: {
            id: "person-1",
            email: "maya@example.com",
            name: "Maya",
            role: "admin",
            onboarding: { step: 0, completedAt: null },
          },
        });
      if (path === "/api/agents")
        return Response.json({ agents: [{ id: "openduet", name: "OpenDuet" }] });
      if (path === "/api/agents/capabilities")
        return Response.json({ capabilities: { builtInAvailable: true } });
      if (path === "/api/capabilities")
        return Response.json({ localEvaluation: false, mode: "local" });
      if (path === "/api/openduet/pages") return Response.json({ pages: [] });
      return Response.json({});
    },
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  queryClient.clear();
});

function inLanguage(language: "it" | "en", node: ReactNode) {
  return <AppLanguageValue language={language}>{node}</AppLanguageValue>;
}

function openOnboarding(language: "it" | "en") {
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
  });
  const authedRoute = createRoute({
    id: "/_authed",
    getParentRoute: () => rootRoute,
    component: Outlet,
  });
  const wired = (
    OnboardingRoute as unknown as {
      update: (options: unknown) => typeof OnboardingRoute;
    }
  ).update({
    id: "/onboarding",
    path: "/onboarding",
    getParentRoute: () => authedRoute,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([authedRoute.addChildren([wired])]),
    history: createMemoryHistory({ initialEntries: ["/onboarding?step=roster"] }),
    context: { queryClient },
  });
  return render(
    inLanguage(
      language,
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    ),
  );
}

test("the onboarding page reads the app language", async () => {
  const it = openOnboarding("it");
  await it.findByRole("heading", { name: "Scegli un Bot o creane uno tuo" });
  expect(it.queryByText("Pick a Bot or make your own")).toBeNull();
  cleanup();
  const en = openOnboarding("en");
  await en.findByRole("heading", { name: "Pick a Bot or make your own" });
});

function inRouter(language: "it" | "en", screen: ReactNode, path = "/") {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path,
    component: () => <>{screen}</>,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    inLanguage(
      language,
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    ),
  );
}

test("the new Bot sheet reads the app language", async () => {
  const sheet = <NewBotSheet onClose={() => {}} onCreated={() => {}} open />;
  const it = inRouter("it", sheet);
  await it.findByText("Dove girerà il tuo Bot?");
  expect(it.getByRole("button", { name: "Continua" })).toBeTruthy();
  cleanup();
  const en = inRouter("en", sheet);
  await en.findByText("Where will your Bot run?");
  expect(en.getByRole("button", { name: "Continue" })).toBeTruthy();
});

test("the Make screen reads the app language", async () => {
  const it = inRouter("it", <MakeScreen />, "/make");
  await it.findByText("Quello che OpenDuet ha creato per te.");
  expect(it.getByRole("button", { name: "Crea qualcosa" })).toBeTruthy();
  cleanup();
  queryClient.clear();
  const en = inRouter("en", <MakeScreen />, "/make");
  await en.findByText("What OpenDuet made for you.");
  expect(en.getByRole("button", { name: "Make something" })).toBeTruthy();
});

const t = createTranslator(SOURCE, CATALOGS, "it");

test("plain functions of the routines take an Italian t and the app language", () => {
  const at = new Date("2026-11-16T08:00:00Z");
  expect(nextRunWords(at, "Europe/Rome", "Europe/Rome", t, "it")).toContain(
    "Prossima esecuzione:",
  );
  expect(nextRunWords(at, "Europe/Rome", "Europe/Rome")).toStartWith(
    "Next run:",
  );
  const now = new Date(2026, 10, 16, 12);
  expect(dayHeading(now, now, t, "it")).toBe("Oggi");
  expect(dayHeading(now, now)).toBe("Today");
  expect(countRoutines(3, t)).toBe("3 routine");
  expect(countRoutines(1)).toBe("1 routine");
  expect(typeof blockLabel).toBe("function");
});

test("the Claude card's words in the catalogue say what the English constants say", () => {
  for (const problem of ["not_connected", "not_installed"] as const) {
    const words = cardWordsOf(problem, englishT);
    expect(words.title).toBe(CARD_WORDS[problem].title);
    expect(words.body).toBe(CARD_WORDS[problem].body);
    expect(cardWordsOf(problem, t).title).not.toBe(words.title);
    // The command to copy is never translated: it is typed into a terminal.
    expect(cardWordsOf(problem, t).command).toBe(CARD_WORDS[problem].command);
  }
});
