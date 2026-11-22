import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MenuSheet } from "@/components/shell/menu-sheet";
import { showsManageGroup } from "@/freeduet/manage-group";
import { Places } from "@/freeduet/wide/team-column";
import { authKeys } from "@/lib/auth/queries";
import { deploymentKeys } from "@/lib/deployment/queries";
import { appConfig } from "@/lib/generated/application-config";
import { settleReactWork } from "./settle-react-work";

/*
 * Where the Bots unread badge sits. Manage carries it while the group is drawn. Where Manage is
 * hidden (FreeDuet's package, D133), the Settings row carries it instead, in the drawer and the wide
 * column alike; there is no Bots row in the menu then. The test follows the loaded package, so run
 * it under both generated configs.
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

function serving() {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/bots/attention"))
      return Response.json({
        bots: [
          {
            agentId: "openduet",
            name: "OpenDuet",
            questions: 0,
            approvals: 0,
            handoffs: 0,
            unread: 1,
            paused: false,
            notify: {},
          },
        ],
      });
    return Response.json({});
  }) as unknown as typeof fetch;
}

function seeded() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(authKeys.currentUser(), {
    id: "u",
    email: "maya@example.com",
    name: "Maya",
    role: "user",
    onboarding: null,
  });
  client.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    selfHostBanner: false,
    localEvaluation: true,
  });
  return client;
}

function draw(ui: ReactNode) {
  const client = seeded();
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

const unreadDot = (scope: HTMLElement) =>
  within(scope).queryByRole("img", { name: "Unread messages" });

test("the Bots unread dot sits on Settings where Manage is hidden, and on Manage where it is drawn", async () => {
  serving();
  const flat = !showsManageGroup(appConfig.brand.tenantId);

  const drawer = draw(
    <MenuSheet onNewChannel={() => {}} onOpenChange={() => {}} open />,
  );
  const dialog = await drawer.findByRole("dialog");
  const settings = await within(dialog).findByRole("link", {
    name: /^Settings/,
  });
  const manage = within(dialog).queryByRole("button", { name: /^Manage/ });
  expect(manage === null).toBe(flat);
  if (flat) {
    await waitFor(() => expect(unreadDot(settings)).not.toBeNull());
    /* The Bots entry is gone from the menu, hidden or not. */
    expect(
      within(dialog).queryByRole("link", { name: /^Bots/, hidden: true }),
    ).toBeNull();
  } else {
    expect(unreadDot(settings)).toBeNull();
    await waitFor(() =>
      expect(unreadDot(manage as HTMLElement)).not.toBeNull(),
    );
  }
  drawer.unmount();

  const column = draw(<Places onNewChannel={() => {}} />);
  const wideSettings = await column.findByRole("link", { name: /^Settings/ });
  if (flat) {
    await waitFor(() => expect(unreadDot(wideSettings)).not.toBeNull());
  } else {
    expect(unreadDot(wideSettings)).toBeNull();
  }
});
