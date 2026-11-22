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
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { BotRoster } from "@/components/bots/bot-roster";
import { MenuSheet } from "@/components/shell/menu-sheet";
import { showsManageGroup } from "@/freeduet/manage-group";
import { Places } from "@/freeduet/wide/team-column";
import type { AgentProfile } from "@/lib/agents/queries";
import { authKeys } from "@/lib/auth/queries";
import { deploymentKeys } from "@/lib/deployment/queries";
import { appConfig } from "@/lib/generated/application-config";
import { ConnectionItem } from "@/routes/_authed/_app/connections.index";
import { SETTINGS_PLACES } from "@/routes/_authed/settings/index";
import { settleReactWork } from "./settle-react-work";

/*
 * D133, "a short menu": FreeDuet's package draws no Manage group and none of the five pages (Bots,
 * Connections, Routines, Approval rules, Engines) in the side menu or the phone's menu sheet. They
 * live in Settings, which lists each one (Engines for an administrator). The Bots and Connections
 * rows keep their Message and Connect buttons (D129). Any other package keeps Manage and plain rows.
 * The DOM cases follow the loaded package, so run them under both generated configs.
 */

const FIVE_PAGES = [
  "/bots",
  "/connections",
  "/routines",
  "/settings/approvals",
  "/admin/engines",
];

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

test("FreeDuet's package keeps Manage hidden, and any other package keeps it", () => {
  expect(showsManageGroup("freeduet")).toBe(false);
  for (const tenant of ["openduet", "fintech"]) {
    expect(showsManageGroup(tenant)).toBe(true);
  }
});

test("Settings lists each of the five pages, and Engines only for an administrator", () => {
  for (const to of FIVE_PAGES) {
    expect(SETTINGS_PLACES.some((place) => place.to === to)).toBe(true);
  }
  const engines = SETTINGS_PLACES.find(
    (place) => place.to === "/admin/engines",
  );
  expect(engines?.label).toBe("Engines");
  expect(engines?.adminOnly).toBe(true);
});

function client(role: "admin" | "user") {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queries.setQueryData(authKeys.currentUser(), {
    id: "u",
    email: "maya@example.com",
    name: "Maya",
    role,
    onboarding: null,
  });
  queries.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    selfHostBanner: false,
    localEvaluation: true,
  });
  return queries;
}

function draw(ui: ReactNode, queries = client("user")) {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/bots/attention")) return Response.json({ bots: [] });
    return Response.json({});
  }) as unknown as typeof fetch;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

const flat = !showsManageGroup(appConfig.brand.tenantId);

for (const role of ["user", "admin"] as const) {
  test(`the phone's menu sheet draws none of the five pages as a direct link (${role})`, async () => {
    const view = draw(
      <MenuSheet onNewChannel={() => {}} onOpenChange={() => {}} open />,
      client(role),
    );
    const dialog = await view.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.querySelector('a[href="/settings"]')).not.toBeNull(),
    );
    const manage = [...dialog.querySelectorAll("button")].some((b) =>
      /^Manage/.test(b.textContent ?? ""),
    );
    expect(manage).toBe(!flat);
    if (flat) {
      for (const to of FIVE_PAGES)
        expect(dialog.querySelector(`a[href="${to}"]`)).toBeNull();
    }
  });
}

test("the wide column draws none of the five pages as a direct link", async () => {
  const view = draw(<Places onNewChannel={() => {}} />, client("admin"));
  await view.findByRole("link", { name: /^Settings/ });
  const manage = [...view.container.querySelectorAll("button")].some((b) =>
    /^Manage/.test(b.textContent ?? ""),
  );
  expect(manage).toBe(!flat);
  if (flat) {
    for (const to of FIVE_PAGES)
      expect(view.container.querySelector(`a[href="${to}"]`)).toBeNull();
  }
});

function bot(id: string): AgentProfile {
  return {
    id,
    name: id,
    title: "Title",
    roleDescription: "Role",
    roleDescriptionLimit: 1000,
    avatarSeed: "seed",
    visibility: "private",
    endpoint: null,
    builtIn: true,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    pinned: false,
    systemOwned: false,
    canManage: true,
    mine: true,
  };
}

function drawRoster(tenantId: string) {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/bots/attention")) return Response.json({ bots: [] });
    return Response.json({
      agents: url.includes("hidden=true") ? [] : [bot("mine")],
    });
  }) as unknown as typeof fetch;
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <BotRoster tenantId={tenantId} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("in FreeDuet's package a Bots row has a Message button that opens a new conversation with that Bot", async () => {
  const view = drawRoster("freeduet");
  const message = await view.findByLabelText("Message mine");
  expect(message.getAttribute("href")).toBe("/channel/new?agent=mine");
  /* The row itself still opens the Bot's page. */
  expect(view.getByText("mine").closest("a")?.getAttribute("href")).toBe(
    "/bots/mine",
  );
});

test("in another package a Bots row has no Message button", async () => {
  const view = drawRoster("openduet");
  await view.findByText("mine");
  expect(view.queryByLabelText("Message mine")).toBeNull();
});

let requests: { url: string; method: string }[];
beforeEach(() => {
  requests = [];
});

function drawConnection(
  row: Parameters<typeof ConnectionItem>[0]["row"],
  quickConnect: boolean,
) {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), method: init?.method ?? "GET" });
    return Response.json({});
  }) as unknown as typeof fetch;
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <ConnectionItem quickConnect={quickConnect} row={row} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

const row = {
  key: "google-workspace",
  title: "Google",
  summary: "Mail and calendar",
  state: "available" as const,
  mark: { kind: "catalogue" as const, key: "google-workspace" },
};

test("a Connect button on the row starts the connection itself, and the row still opens the page", async () => {
  const view = drawConnection(row, true);
  const button = await view.findByRole("button", { name: "Connect Google" });
  fireEvent.click(button);
  await waitFor(() => expect(requests.length).toBe(1));
  expect(requests[0]?.method).toBe("POST");
  expect(requests[0]?.url).toContain(
    "/api/plugins/servers/google-workspace/connect",
  );
  /* The reply held no address: the row says so rather than navigating nowhere. */
  expect(await view.findByRole("alert")).toBeTruthy();
  expect(
    view.getByTestId("account-google-workspace").getAttribute("href"),
  ).toBe("/connections/google-workspace");
});

test("without the quick button the row is the plain link with its label", async () => {
  const view = drawConnection(row, false);
  await view.findByText("Connect");
  expect(view.queryByRole("button", { name: "Connect Google" })).toBeNull();
});

test("a connected row has no Connect button", async () => {
  const view = drawConnection({ ...row, state: "connected" }, true);
  await view.findByText("Connected");
  expect(view.queryByRole("button")).toBeNull();
});

/* A FreeDuet member's row wears its drawn mascot, by the id the member has in agents.yaml, in every section. */
test("every FreeDuet member row of the Bots list shows its mascot, and another Bot keeps the orb", async () => {
  const members: [string, string][] = [
    ["freeduet", "iris"],
    ["inbox", "otto"],
    ["creator", "leo"],
    ["bookkeeper", "penny"],
  ];
  const shared = { ...bot("outsider"), mine: false, canManage: false };
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/bots/attention"))
      return Response.json({
        bots: [
          {
            agentId: "inbox",
            name: "inbox",
            questions: 1,
            approvals: 0,
            handoffs: 0,
            unread: 0,
            paused: false,
            notify: {},
          },
        ],
      });
    return Response.json({
      agents: url.includes("hidden=true")
        ? []
        : [
            ...members.map(([id]) => bot(id)),
            shared,
            { ...bot("sharedmember"), mine: false },
          ],
    });
  }) as unknown as typeof fetch;
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <BotRoster tenantId="freeduet" />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
  await view.findByText("outsider");
  for (const [id, face] of members) {
    const row = view.getByText(id).closest("a");
    expect(row?.querySelector(`svg[data-face="${face}"]`)).not.toBeNull();
  }
  expect(
    view.getByText("outsider").closest("a")?.querySelector("svg[data-face]"),
  ).toBeNull();
});
