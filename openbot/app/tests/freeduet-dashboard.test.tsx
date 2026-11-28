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
import { cleanup, render, waitFor } from "@testing-library/react";
import { FreeDuetDashboard } from "@/freeduet/dashboard";
import {
  engineLines,
  headline,
  memberUsage,
  nextRoutine,
  tokensToday,
} from "@/freeduet/dashboard-model";
import type {
  TokenCounts,
  TokenRow,
  TokenUsage,
} from "@/freeduet/engines-tokens-text";
import { settleReactWork } from "./settle-react-work";

/** The Dashboard (D154, stage 1): each card shows what the app's reads return, says "not available" when a read fails, and links to Engines. */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
let answers: Record<string, { status: number; body: unknown }>;

const counts = (input: number, output: number, turns = 1): TokenCounts => ({
  turns,
  reportedTurns: turns,
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  seconds: 10,
});
const zero = counts(0, 0, 0);
const row = (
  member: string | null,
  engine: string,
  cls: TokenRow["class"],
  today: TokenCounts,
): TokenRow => ({
  member,
  engine,
  class: cls,
  today,
  week: today,
});
const usage: TokenUsage = {
  reason: null,
  timezone: "UTC",
  windowDays: 7,
  problem: false,
  rows: [
    row("iris", "claude", "login", counts(60_000, 40_000)),
    row("ada", "openrouter", "free_cloud", counts(200_000, 50_000)),
    row("leo", "claude", "login", counts(10_000, 5_000)),
  ],
  engines: [
    row(null, "claude", "login", counts(70_000, 45_000)),
    row(null, "openrouter", "free_cloud", counts(200_000, 50_000)),
  ],
};
const engines = {
  reason: null,
  engines: [
    {
      id: "claude",
      name: "Claude (subscription)",
      kind: "cli",
      state: "ready",
      until: null,
      refusal: null,
    },
    {
      id: "openrouter",
      name: "OpenRouter free",
      kind: "openai-compatible",
      state: "limited",
      until: null,
      refusal: null,
    },
  ],
  members: [
    { id: "iris", chain: ["claude"] },
    { id: "ada", chain: ["openrouter", "claude"] },
    { id: "leo", chain: ["claude"] },
  ],
};
const inAnHour = new Date(Date.now() + 3_600_000).toISOString();
const ok = (body: unknown) => ({ status: 200, body });

beforeEach(() => {
  answers = {
    "/api/agents": ok({
      agents: [
        { id: "iris", name: "Iris" },
        { id: "ada", name: "Ada" },
        { id: "leo", name: "Leo" },
      ],
    }),
    "/api/bots/attention": ok({
      bots: [
        {
          agentId: "ada",
          name: "Ada",
          questions: 0,
          approvals: 1,
          handoffs: 0,
          unread: 0,
          paused: false,
          notify: "all",
        },
        {
          agentId: "leo",
          name: "Leo",
          questions: 0,
          approvals: 0,
          handoffs: 0,
          unread: 0,
          paused: true,
          notify: "all",
        },
      ],
    }),
    "/api/freeduet/engines/usage": ok(usage),
    "/api/freeduet/engines": ok(engines),
    "/api/routines": ok({
      routines: [
        {
          id: "r1",
          agentId: "iris",
          schedule: "x",
          timezone: "UTC",
          instruction: "Competitor radar",
          channel: { id: "c", name: null, gone: false },
          enabled: true,
          nextRunAt: inAnHour,
          lastRun: null,
        },
      ],
      sweep: { lastSweptAt: null, working: true },
    }),
  };
  global.fetch = (async (input: RequestInfo | URL) => {
    const hit = answers[String(input)];
    return hit
      ? Response.json(hit.body, { status: hit.status })
      : new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function draw() {
  const root = createRootRoute({ component: FreeDuetDashboard });
  const engineRoute = createRoute({
    getParentRoute: () => root,
    path: "/admin/engines",
  });
  const bots = createRoute({ getParentRoute: () => root, path: "/bots" });
  const router = createRouter({
    routeTree: root.addChildren([engineRoute, bots]),
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

test("the cards show what the app's reads return", async () => {
  const page = draw();
  await waitFor(() =>
    expect(page.getByText("1 thing waits for you.")).toBeTruthy(),
  );
  await waitFor(() =>
    expect(page.getByTestId("card-engines").textContent).toContain(
      "Claude (subscription)",
    ),
  );
  await waitFor(() =>
    expect(page.getByTestId("card-routine").textContent).toContain("Iris"),
  );
  expect(page.getByTestId("members-pill").textContent).toContain("3 members");
  // 115,000 + 250,000 reported today, from the per-engine totals.
  expect(page.getByTestId("card-tokens").textContent).toContain("365,000");
  // Saved: the free engine's 250,000 tokens at the reference list price (2 in, 10 out per million).
  expect(page.getByTestId("card-saved").textContent).toContain("250k tokens");
  expect(page.getByTestId("card-waiting").textContent).toContain(
    "Ada: 1 approval",
  );
  expect(page.getByTestId("card-routine").textContent).toContain(
    "Iris · Competitor radar",
  );
  const team = page.getByTestId("card-team").textContent ?? "";
  expect(team).toContain("Waiting for you");
  expect(team).toContain("Paused");
  expect(team).toContain("Available");
  expect(page.getByTestId("card-engines").textContent).toContain(
    "first for 2 members",
  );
  expect(page.getByTestId("card-usage").textContent).toContain("Iris");
});

test("Engines is one click away", async () => {
  const page = draw();
  const link = await waitFor(() => page.getByTestId("engines-link"));
  expect(link.getAttribute("href")).toBe("/admin/engines");
});

test("a read that fails says not available, never a number", async () => {
  answers["/api/freeduet/engines/usage"] = { status: 500, body: {} };
  answers["/api/freeduet/engines"] = { status: 500, body: {} };
  const page = draw();
  await waitFor(() =>
    expect(page.getByTestId("card-tokens").textContent).toContain(
      "not available",
    ),
  );
  expect(page.getByTestId("card-saved").textContent).toContain("not available");
  expect(page.getByTestId("card-engines").textContent).toContain(
    "Not available yet",
  );
  expect(page.getByTestId("card-tokens").textContent).not.toMatch(/\d/);
});

test("no turn counted yet says so instead of zero", async () => {
  answers["/api/freeduet/engines/usage"] = ok({
    ...usage,
    rows: [],
    engines: [],
  });
  const page = draw();
  await waitFor(() =>
    expect(page.getByTestId("card-tokens").textContent).toContain(
      "No turn has been counted",
    ),
  );
});

test("the model: headline, routine, per-member share", () => {
  expect(headline(null)).toContain("Loading");
  expect(headline(0)).toBe("Nothing waits for you.");
  expect(headline(3)).toBe("3 things wait for you.");
  expect(
    nextRoutine(
      { routines: [], sweep: { lastSweptAt: null, working: true } },
      [],
      new Date(),
    ),
  ).toBe("none");
  expect(tokensToday(usage).total).toBe(365_000);
  expect(engineLines({ ...engines, reason: "off" } as never, usage)).toBeNull();
  const members = memberUsage(usage, (id) => id);
  expect(members[0]).toMatchObject({ id: "ada", share: 100 });
  expect(members.at(-1)?.share).toBe(6);
  expect(
    memberUsage({ ...usage, rows: [row("x", "e", "login", zero)] }, (id) => id),
  ).toEqual([]);
});
