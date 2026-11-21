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
import { flatMenuEntries, showsManageGroup } from "@/freeduet/manage-group";
import { Places } from "@/freeduet/wide/team-column";
import type { AgentProfile } from "@/lib/agents/queries";
import { authKeys } from "@/lib/auth/queries";
import { deploymentKeys } from "@/lib/deployment/queries";
import { appConfig } from "@/lib/generated/application-config";
import { ConnectionItem } from "@/routes/_authed/_app/connections.index";
import { settleReactWork } from "./settle-react-work";

/*
 * D129, "three clicks at most": FreeDuet's package lists Bots, Connections, Routines and Approval
 * rules at the top level of the menu (Engines for an administrator), and gives each Bots row a
 * Message button and each one-consent Connections row a Connect button. Any other package keeps
 * Manage and plain rows. The DOM cases follow the loaded package, so run them under both generated
 * configs; the pure cases name the package.
 */

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

const labels = (isAdmin: boolean, tenant: string) =>
  flatMenuEntries(isAdmin, tenant).map((entry) => entry.label);

test("FreeDuet's package gets the four pages at the top level, and Engines only for an administrator", () => {
  expect(labels(false, "freeduet")).toEqual([
    "Bots",
    "Connections",
    "Routines",
    "Approval rules",
  ]);
  expect(labels(true, "freeduet")).toEqual([
    "Bots",
    "Connections",
    "Routines",
    "Approval rules",
    "Engines",
  ]);
  const engines = flatMenuEntries(true, "freeduet").find(
    (entry) => entry.label === "Engines",
  );
  expect(engines?.to).toBe("/admin/engines");
});

test("any other package gets no top-level entries and keeps Manage", () => {
  for (const tenant of ["openduet", "fintech"]) {
    expect(labels(true, tenant)).toEqual([]);
    expect(labels(false, tenant)).toEqual([]);
    expect(showsManageGroup(tenant)).toBe(true);
  }
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
  test(`the phone's menu sheet draws the entries as direct links (${role})`, async () => {
    const view = draw(
      <MenuSheet onNewChannel={() => {}} onOpenChange={() => {}} open />,
      client(role),
    );
    const dialog = await view.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.querySelector('a[href="/settings"]')).not.toBeNull(),
    );
    const link = (to: string) => dialog.querySelector(`a[href="${to}"]`);
    const manage = [...dialog.querySelectorAll("button")].some((b) =>
      /^Manage/.test(b.textContent ?? ""),
    );
    expect(manage).toBe(!flat);
    /* Where Manage stays, its pages are behind the button; the flat menu has no such button. */
    expect(link("/admin/engines") !== null).toBe(flat && role === "admin");
    if (flat) {
      for (const to of [
        "/bots",
        "/connections",
        "/routines",
        "/settings/approvals",
      ])
        expect(link(to)).not.toBeNull();
    }
  });
}

test("the wide column draws the same entries", async () => {
  const view = draw(<Places onNewChannel={() => {}} />, client("admin"));
  await view.findByRole("link", { name: /^Settings/ });
  const has = (to: string) => view.container.querySelector(`a[href="${to}"]`);
  expect(has("/admin/engines") !== null).toBe(flat);
  const manage = [...view.container.querySelectorAll("button")].some((b) =>
    /^Manage/.test(b.textContent ?? ""),
  );
  expect(manage).toBe(!flat);
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
