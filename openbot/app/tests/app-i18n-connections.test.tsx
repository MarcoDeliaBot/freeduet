import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
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
import { cleanup, render } from "@testing-library/react";
import { type T, AppLanguageValue, englishT } from "@/freeduet/i18n/provider";
import { createTranslator } from "@/freeduet/i18n/translate";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { mailRuleStatus } from "@/components/connections/mail-rules-section";
import { directoryReadFailure } from "@/lib/plugins/provider-vocabulary";
import {
  authorizationNoticeFor,
  Route as ListRoute,
} from "@/routes/_authed/_app/connections.index";
import { Route as KeyRoute } from "@/routes/_authed/_app/connections.$key";
import { settleReactWork } from "./settle-react-work";

/**
 * D181 stage 2l: the Connections list, an app's page, the mail rules and the plain functions of the
 * plugins vocabulary read the app language. With none they read English, as every older test relies on.
 */

const originalFetch = globalThis.fetch;
const italian: T = createTranslator(SOURCE, CATALOGS, "it");

const PLUGINS_PAGE = {
  catalogue: [
    {
      key: "google-imap",
      title: "Gmail",
      summary: "Mail and calendar",
      vendor: "Google",
      auth: "user-secret",
    },
  ],
  servers: [
    {
      id: "google-imap",
      title: "Gmail",
      summary: "",
      vendor: "Google",
      url: "x://gmail",
      provenance: "custom",
      authScheme: null,
      tools: [],
    },
  ],
  skills: [],
  botsMayCallBack: true,
  redirectUri: null,
  composioConfigured: false,
  authorizesPerAction: false,
};

const RULE = {
  id: "r1",
  serverId: "google-imap",
  inWords: "From now on, mail from github.com: label GitHub.",
  enabled: true,
  lastRunAt: null,
  lastMatched: 0,
  totalApplied: 0,
  lastError: null,
};

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
beforeEach(() => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0];
      if (path === "/api/plugins") return Response.json(PLUGINS_PAGE);
      if (path === "/api/plugins/connections")
        return Response.json({ connections: [] });
      if (path === "/api/plugins/mail-rules")
        return Response.json({ rules: [RULE] });
      return Response.json({});
    },
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

type Updatable = { update: (options: unknown) => unknown };

function draw(language: "it" | "en", page: "list" | "app") {
  const rootRoute = createRootRoute({ component: Outlet });
  const authedRoute = createRoute({
    id: "/_authed",
    getParentRoute: () => rootRoute,
    component: Outlet,
  });
  const appRoute = createRoute({
    id: "/_app",
    getParentRoute: () => authedRoute,
    component: Outlet,
  });
  const list = (ListRoute as unknown as Updatable).update({
    id: "/connections/",
    path: "/connections/",
    getParentRoute: () => appRoute,
  });
  const one = (KeyRoute as unknown as Updatable).update({
    id: "/connections/$key",
    path: "/connections/$key",
    getParentRoute: () => appRoute,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      authedRoute.addChildren([
        appRoute.addChildren([list as never, one as never]),
      ]),
    ]),
    history: createMemoryHistory({
      initialEntries: [
        page === "list" ? "/connections" : "/connections/google-imap",
      ],
    }),
  });
  return render(
    <QueryClientProvider client={client()}>
      <AppLanguageValue language={language}>
        <RouterProvider router={router as never} />
      </AppLanguageValue>
    </QueryClientProvider>,
  );
}

test("the Connections list and its mail rules read Italian with it, English with en", async () => {
  const it = draw("it", "list");
  expect(await it.findByText("Le tue connessioni")).toBeTruthy();
  expect(await it.findByText("Regole della posta")).toBeTruthy();
  expect(
    await it.findByText("Attiva. Non è ancora stata eseguita."),
  ).toBeTruthy();
  expect(it.queryByText("Your connections")).toBeNull();
  cleanup();
  const en = draw("en", "list");
  expect(await en.findByText("Your connections")).toBeTruthy();
  expect(await en.findByText("Mail rules")).toBeTruthy();
  expect(await en.findByText("On. Has not run yet.")).toBeTruthy();
});

test("an app's connection page, with its secret form, reads Italian with it, English with en", async () => {
  const it = draw("it", "app");
  expect(await it.findByText("Il tuo indirizzo Gmail")).toBeTruthy();
  expect(it.getByText("Cosa permette ai tuoi Bot di fare")).toBeTruthy();
  expect(it.queryByText("Your Gmail address")).toBeNull();
  cleanup();
  const en = draw("en", "app");
  expect(await en.findByText("Your Gmail address")).toBeTruthy();
  expect(en.getByText("What this lets your Bots do")).toBeTruthy();
});

test("the plain functions take a translator and read English without one", () => {
  expect(directoryReadFailure("composio", italian)).toBe(
    italian("admin.vocab.readFailure", { name: "Composio" }),
  );
  expect(directoryReadFailure("composio", italian)).not.toBe(
    directoryReadFailure("composio"),
  );
  expect(directoryReadFailure("composio", italian)).toContain("Composio");
  expect(authorizationNoticeFor("cancelled", italian)).toStartWith(
    "Quell'autorizzazione",
  );
  expect(authorizationNoticeFor("cancelled")).toStartWith(
    "That authorization was cancelled",
  );
  expect(authorizationNoticeFor("toString", italian)).toBeNull();
  const rule = { ...RULE, lastRunAt: null };
  expect(mailRuleStatus(rule, italian)).toBe(
    "Attiva. Non è ancora stata eseguita.",
  );
  expect(mailRuleStatus(rule, englishT)).toBe("On. Has not run yet.");
  expect(mailRuleStatus({ ...rule, enabled: false }, italian)).toBe(
    "Disattivata",
  );
});
