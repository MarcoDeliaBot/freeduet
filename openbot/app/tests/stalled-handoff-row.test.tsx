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
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { BotActivitySections } from "@/components/bot-profile/activity";
import { BotsNavBadge } from "@/components/bot-profile/attention";
import { BotRoster } from "@/components/bots/bot-roster";
import type { AgentProfile } from "@/lib/agents/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * D171: a stalled hand-off says what happened, why in plain words, and fixes in one click. The row on
 * the Bots page and on the Bot's own page, the retry request, and the badge that goes away after it.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const iris = {
  id: "iris",
  name: "Iris",
  title: "Head",
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
} as AgentProfile;

const stalledHop = {
  id: "hop-1",
  toName: "Kai",
  task: "Build an Arkanoid",
  reason: "it took longer than the time limit",
  channelId: "chan-iris",
};
const attention = (stalled: boolean) => ({
  agentId: "iris",
  name: "Iris",
  questions: 0,
  approvals: 0,
  handoffs: stalled ? 1 : 0,
  stalled: stalled ? [stalledHop] : [],
  unread: 7,
  unreadChannelId: "chan-unread",
  paused: false,
  notify: "all",
});

let stalled = true;
const sent: { url: string; body: unknown }[] = [];
beforeEach(() => {
  stalled = true;
  sent.length = 0;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      stalled = false;
      return Response.json({ retried: true });
    }
    if (url.includes("/api/bots/attention"))
      return Response.json({ bots: [attention(stalled)] });
    if (url.endsWith("/activity"))
      return Response.json({
        activity: {
          inProgress: stalled
            ? [
                {
                  id: "hop-1",
                  kind: "handoff",
                  title: "Build an Arkanoid",
                  detail: "Delegated to Kai",
                  status: "failed",
                  at: "2026-11-27T07:00:00Z",
                  channelId: "chan-iris",
                  needsYou: true,
                  stoppable: false,
                  cancellable: false,
                  stalled: {
                    toName: "Kai",
                    reason: "it took longer than the time limit",
                    retryable: true,
                  },
                },
              ]
            : [],
          scheduled: [],
          completed: [],
        },
      });
    return Response.json({ agents: [iris] });
  }) as unknown as typeof fetch;
});

function draw(component: () => React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: component as never,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/bots/$agentId",
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/channel/$channelId",
      component: () => null,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("the Bots page row says what happened, why, and has Try again and Open conversation", async () => {
  const view = draw(() => <BotRoster />);
  expect(
    await view.findByText("Kai did not finish: Build an Arkanoid"),
  ).toBeTruthy();
  expect(
    view.getByText("Why: it took longer than the time limit."),
  ).toBeTruthy();
  expect(view.getByRole("button", { name: "Try again" })).toBeTruthy();
  const open = view.getByText("Open conversation").closest("a") as HTMLElement;
  expect(open.getAttribute("href")).toBe("/channel/chan-iris");
  // No raw error code anywhere on the row.
  expect(view.container.textContent).not.toMatch(/Abort|ECONN|\b300\b/);
});

test("unread says which conversation and opens it", async () => {
  const view = draw(() => <BotRoster />);
  expect(
    await view.findByText(/Iris wrote in 7 conversations you have not read/),
  ).toBeTruthy();
  const read = view.getByText("Read newest").closest("a") as HTMLElement;
  expect(read.getAttribute("href")).toBe("/channel/chan-unread");
});

test("Try again asks the server to re-queue that hop, then the row and the badge are gone", async () => {
  const view = draw(() => (
    <>
      <BotsNavBadge />
      <BotRoster />
    </>
  ));
  const badge = await view.findByRole("img", { name: "1 thing needs you" });
  expect(badge.getAttribute("title")).toContain("1 stalled hand-off");
  expect(badge.getAttribute("title")).not.toContain("unread");
  fireEvent.click(await view.findByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(sent).toEqual([
      { url: "/api/bots/iris/activity/handoffs/retry", body: { id: "hop-1" } },
    ]),
  );
  await waitFor(() =>
    expect(
      view.queryByText("Kai did not finish: Build an Arkanoid"),
    ).toBeNull(),
  );
  await waitFor(() =>
    expect(view.queryByRole("img", { name: /need/ })).toBeNull(),
  );
});

test("the Bot's own page shows the same row under In progress", async () => {
  const view = draw(() => <BotActivitySections agentId="iris" />);
  expect(
    await view.findByText("Kai did not finish: Build an Arkanoid"),
  ).toBeTruthy();
  expect(
    view.getByText("Why: it took longer than the time limit."),
  ).toBeTruthy();
  expect(view.getByRole("button", { name: "Try again" })).toBeTruthy();
});
