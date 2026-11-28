import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { BotApprovalRules } from "@/components/approvals/bot-rules";
import { ApprovalSettings } from "@/components/approvals/settings";
import { summaryFor } from "@/components/responsibilities/responsibility-dialog";
import { AppLanguageValue, englishT } from "@/freeduet/i18n/provider";
import { createTranslator } from "@/freeduet/i18n/translate";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2f: the approval rules page speaks the app language; English (no provider, or "en") reads as before. */

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

const rule = (
  id: string,
  botId: string,
  toolRef: string,
  behaviour = "ask",
) => ({
  id,
  botId,
  toolRef,
  effect: "*",
  scope: "*",
  behaviour,
});

function serving() {
  global.fetch = (async () =>
    Response.json({
      enabled: true,
      requests: [],
      questions: [],
      rules: [rule("every", "*", "mcp/slack/*", "pre_approved")],
      teamRules: [rule("team", "*", "mcp/drive/share", "allow")],
      preferences: { enabled: true, autoReview: false, hostCommands: "ask" },
      team: {
        enforceAutoReview: false,
        customRulesEnabled: true,
        hostCommandsCap: "allow",
      },
      hostCommands: "ask",
    })) as unknown as typeof fetch;
}

function draw(language: "it" | "en", page: "settings" | "bot") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: createRootRoute({
      component: () => (
        <AppLanguageValue language={language}>
          {page === "settings" ? (
            <ApprovalSettings />
          ) : (
            <BotApprovalRules agentId="expenses" />
          )}
        </AppLanguageValue>
      ),
    }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("the approval rules page reads Italian with the language set to it", async () => {
  serving();
  const view = draw("it", "settings");
  expect(await view.findByText("Prima che un Bot agisca")).toBeTruthy();
  expect(view.getByText("Regole per ogni Bot")).toBeTruthy();
  expect(view.getByText("Chiedi prima di fare modifiche")).toBeTruthy();
  // A team rule says it is the team's, and what it does, in Italian.
  expect(
    view.getByText("Agisci senza chiedere (regola del team)"),
  ).toBeTruthy();
  expect(view.getByText("Bloccata")).toBeTruthy();
  expect(view.queryByText("Before a Bot acts")).toBeNull();
});

test("the same page reads English with the language set to en", async () => {
  serving();
  const view = draw("en", "settings");
  expect(await view.findByText("Before a Bot acts")).toBeTruthy();
  expect(view.getByText("Rules for every Bot")).toBeTruthy();
  expect(view.getByText("Take action without asking (team rule)")).toBeTruthy();
  expect(view.queryByText("Prima che un Bot agisca")).toBeNull();
});

test("a Bot's rules page reads Italian, with the add-rule row", async () => {
  serving();
  const view = draw("it", "bot");
  expect(await view.findByText("Aggiungi una regola")).toBeTruthy();
  expect(view.getByText("Regole")).toBeTruthy();
});

test("a responsibility's summary reads Italian through the translator and English by default", () => {
  const goal = {
    status: "paused",
    subscriptions: [],
  } as unknown as Parameters<typeof summaryFor>[0];
  const it = createTranslator(SOURCE, CATALOGS, "it");
  expect(summaryFor(goal, [], it)).toBe(
    "In pausa · Niente la avvia finché non la riprendi",
  );
  expect(summaryFor(goal, [], englishT)).toBe(
    "Paused · Nothing starts it until you resume it",
  );
});
