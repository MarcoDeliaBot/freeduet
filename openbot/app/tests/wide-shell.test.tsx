import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/shell/app-shell";
import { type AgentProfile, agentKeys } from "@/lib/agents/queries";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * D55: the whole shell, at the widths the layout is judged at. Below 1024 it is the phone column with
 * its tab bar and no side column; from 1024 it is the side column beside the screen, and the tab bar
 * is gone because the column carries its three places.
 */

const realFetch = globalThis.fetch;
const realSocket = globalThis.WebSocket;
/** Sockets the shell opened. The shell keeps one open for its conversation list; here it is inert. */
let sockets = 0;
class InertSocket {
  onopen: unknown = null;
  onmessage: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  constructor() {
    sockets += 1;
  }
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
}
beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost:3010" });
  // The shell's channel socket must never reach a real network: in CI nothing listens there, and the
  // refused connection arrives as an unhandled error between tests.
  globalThis.WebSocket = InertSocket as never;
  window.WebSocket = InertSocket as never;
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/openduet/tasks") return Response.json({ tasks: [] });
      if (url.startsWith("/api/bots/attention"))
        return Response.json({ bots: [] });
      if (url === "/api/approvals")
        return Response.json({ enabled: true, requests: [], questions: [] });
      return Response.json({});
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;
});
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = realFetch;
  globalThis.WebSocket = realSocket;
  GlobalRegistrator.unregister();
});

function at(width: number) {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? "0");
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }) as unknown as typeof window.matchMedia;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(currentUserQueryOptions().queryKey, {
    name: "Alex",
    email: "alex@example.com",
    role: "user",
  } as never);
  client.setQueryData(agentKeys.list(false), [
    {
      id: "freeduet",
      name: "Iris",
      title: "Chief of Staff",
      hidden: false,
    } as unknown as AgentProfile,
  ]);
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AppShell>
          <p>The screen</p>
        </AppShell>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/tasks"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

for (const width of [390, 768, 1023]) {
  test(`at ${width} px the shell is the phone column with its tab bar, and no side column`, async () => {
    const view = at(width);
    await view.findByText("The screen");
    await waitFor(() =>
      expect(
        view.container.querySelector("nav[aria-label='Main']"),
      ).not.toBeNull(),
    );
    expect(view.container.querySelector("aside")).toBeNull();
    expect(
      view.container.querySelectorAll("nav[aria-label='Main']"),
    ).toHaveLength(1);
    // The floating tab bar is inside the 430 px column, as it always was.
    const column = view.container.querySelector(
      "nav[aria-label='Main']",
    )?.parentElement;
    expect(column?.className).toContain("max-w-[430px]");
    expect(
      view.container.querySelector("button[aria-label='Menu']"),
    ).not.toBeNull();
  });
}

for (const [width, band] of [
  [1024, "faces"],
  [1280, "full"],
  [1440, "full"],
  [1920, "full"],
] as const) {
  test(`at ${width} px the shell has the ${band} column and no tab bar of its own`, async () => {
    const view = at(width);
    await view.findByText("The screen");
    await waitFor(() =>
      expect(
        view.container.querySelector("nav[aria-label='Main']"),
      ).not.toBeNull(),
    );
    expect(
      view.container.querySelector("aside")?.getAttribute("data-band"),
    ).toBe(band);
    // One "Main" navigation, and it is the column's: the tab bar is not drawn.
    expect(
      view.container.querySelectorAll("nav[aria-label='Main']"),
    ).toHaveLength(1);
    expect(
      view.container.querySelector("nav[aria-label='Main']")?.closest("aside"),
    ).not.toBeNull();
    expect(view.container.innerHTML).not.toContain("max-w-[430px]");
  });
}

test("the shell's socket is the inert one: no test here reaches a network", async () => {
  sockets = 0;
  const view = at(1440);
  await view.findByText("The screen");
  await waitFor(() => expect(sockets).toBeGreaterThan(0));
});
