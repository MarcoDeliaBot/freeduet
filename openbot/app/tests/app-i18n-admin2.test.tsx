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
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { Route as EnterpriseRoute } from "@/routes/_authed/admin/enterprise";
import { Route as PluginsRoute } from "@/routes/_authed/admin/plugins/index";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2i: the enterprise and plugin pages read the app language; with none they read English as before. */

const originalFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
beforeEach(() => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/admin/enterprise/models/usage"))
        return Response.json({ summary: [], rows: [] });
      if (path.includes("/api/admin/enterprise"))
        return Response.json({
          capabilities: [],
          settings: {
            ssoRequired: false,
            mcpAllowlist: { enabled: false, servers: [] },
            modelAllowlist: { enabled: false, models: [] },
            actionRecording: false,
            inactiveComputerDays: 0,
          },
          groups: [],
          network: [],
          defaultDestinations: [],
          mcpServers: [],
          builtInModel: null,
          scim: {
            configured: false,
            connectionId: "",
            baseUrl: null,
            rotating: false,
          },
          otel: { configured: false },
          actionRecordRetentionDays: 30,
        });
      if (path.includes("/api/plugins/connections"))
        return Response.json({ connections: [] });
      if (path.endsWith("/api/plugins"))
        return Response.json({
          servers: [],
          catalogue: [],
          composioConfigured: false,
        });
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

function draw(page: "enterprise" | "plugins", language: "it" | "en") {
  const Page = (page === "enterprise" ? EnterpriseRoute : PluginsRoute).options
    .component as () => React.ReactNode;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={client}>
          <AppLanguageValue language={language}>
            <Page />
          </AppLanguageValue>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router as never} />);
}

test("the Enterprise page reads Italian with the language set to it, English with en", async () => {
  const it = draw("enterprise", "it");
  expect(await it.findByText("Richiedi SSO")).toBeTruthy();
  expect(it.getByText("Controlli aziendali")).toBeTruthy();
  expect(it.queryByText("Require SSO")).toBeNull();
  cleanup();
  const en = draw("enterprise", "en");
  expect(await en.findByText("Require SSO")).toBeTruthy();
  expect(en.getByText("Enterprise controls")).toBeTruthy();
});

test("the Plugins page reads Italian with the language set to it, English with en", async () => {
  const it = draw("plugins", "it");
  expect(
    await it.findByText(
      "Ancora niente di collegato. Scegline uno dall'elenco qui sotto.",
    ),
  ).toBeTruthy();
  expect(
    it.queryByText("Nothing connected yet. Pick one from the list below."),
  ).toBeNull();
  cleanup();
  const en = draw("plugins", "en");
  expect(
    await en.findByText("Nothing connected yet. Pick one from the list below."),
  ).toBeTruthy();
});
