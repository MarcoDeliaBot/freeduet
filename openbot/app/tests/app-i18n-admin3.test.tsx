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
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { Route as ComputersRoute } from "@/routes/_authed/admin/computers";
import { Route as ToolRoute } from "@/routes/_authed/admin/plugins/$key_.tools.$tool";
import { settleReactWork } from "./settle-react-work";

/**
 * D181 stage 2j: the Computers page and a plugin tool page read the app language. With none they
 * read English as before, which every older test of these pages relies on.
 */

const originalFetch = globalThis.fetch;

const PLUGINS_PAGE = {
  catalogue: [],
  servers: [
    {
      id: "slack",
      title: "Slack",
      tools: [
        {
          name: "list_channels",
          ref: "slack.list_channels",
          effect: "read",
          description: "",
          destructive: false,
          grantedTo: [],
        },
      ],
    },
  ],
  skills: [],
  botsMayCallBack: true,
  redirectUri: null,
  composioConfigured: false,
  authorizesPerAction: false,
};

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
beforeEach(() => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0];
      if (path === "/api/computers/fleet")
        return Response.json({ computers: [], isolation: "per-bot" });
      if (path === "/api/host-access")
        return Response.json({ connected: false, grants: [], pending: [] });
      if (path === "/api/plugins") return Response.json(PLUGINS_PAGE);
      if (path.startsWith("/api/agents")) return Response.json({ agents: [] });
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

function drawComputers(language: "it" | "en") {
  const Page = ComputersRoute.options.component as () => React.ReactNode;
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={client()}>
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

type Updatable = { update: (options: unknown) => unknown };

function drawTool(language: "it" | "en") {
  const rootRoute = createRootRoute({ component: Outlet });
  const authedRoute = createRoute({
    id: "/_authed",
    getParentRoute: () => rootRoute,
    component: Outlet,
  });
  const adminRoute = createRoute({
    path: "/admin",
    getParentRoute: () => authedRoute,
    component: Outlet,
  });
  const tool = (ToolRoute as unknown as Updatable).update({
    id: "/plugins/$key_/tools/$tool",
    path: "/plugins/$key/tools/$tool",
    getParentRoute: () => adminRoute,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      authedRoute.addChildren([adminRoute.addChildren([tool as never])]),
    ]),
    history: createMemoryHistory({
      initialEntries: ["/admin/plugins/slack/tools/list_channels"],
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

test("the Computers page reads Italian with the language set to it, English with en", async () => {
  const it = drawComputers("it");
  expect(
    await it.findByText(
      "Ogni Bot ha il proprio computer, con il proprio container, i propri file e il proprio profilo del browser.",
    ),
  ).toBeTruthy();
  expect(it.getByText("Cartelle su questo computer")).toBeTruthy();
  expect(it.queryByText("Folders on this computer")).toBeNull();
  cleanup();
  const en = drawComputers("en");
  expect(
    await en.findByText(
      "Each Bot has its own computer, with its own container, files and browser profile.",
    ),
  ).toBeTruthy();
  expect(en.getByText("Folders on this computer")).toBeTruthy();
});

test("a plugin tool page reads Italian with the language set to it, English with en", async () => {
  const it = drawTool("it");
  expect(await it.findByText("Che cosa fa")).toBeTruthy();
  expect(it.getByText("Assistenti")).toBeTruthy();
  expect(it.queryByText("What it does")).toBeNull();
  cleanup();
  const en = drawTool("en");
  expect(await en.findByText("What it does")).toBeTruthy();
  expect(en.getByText("Bots")).toBeTruthy();
});
