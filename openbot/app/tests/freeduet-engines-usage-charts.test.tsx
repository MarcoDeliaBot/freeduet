import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import { heldEngines } from "@/freeduet/engines-usage-charts";
import {
  dayLabel,
  metricText,
  niceMax,
  percentText,
  REST_KEY,
  type TokenCounts,
  type TokenDay,
  type TokenUsage,
  usageView,
} from "@/freeduet/engines-tokens-text";
import { settleReactWork } from "./settle-react-work";

/**
 * D134: the usage charts of the Tokens section. The numbers here are invented. The page shows the share of each source or member,
 * seven days, the engines held by a limit in the engine cards' own words, and never a percentage of a plan's weekly limit.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const counts = (over: Partial<TokenCounts> = {}): TokenCounts => ({
  turns: 1,
  reportedTurns: 1,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  seconds: 0,
  ...over,
});
const tokens = (input: number, output = 0, seconds = 0) =>
  counts({ inputTokens: input, outputTokens: output, seconds });

const names = (id: string) => ({ creator: "Leo", chef: "Basil" })[id] ?? id;

describe("usageView", () => {
  const days: TokenDay[] = [
    {
      day: "2026-11-20",
      sources: { person: tokens(600, 100), routine: tokens(200) },
      members: { creator: tokens(700, 100), chef: tokens(200) },
    },
    {
      day: "2026-11-21",
      sources: {
        person: tokens(100),
        handoff: tokens(100),
        unknown: tokens(0),
      },
      members: { creator: tokens(100), chef: tokens(100) },
    },
  ];

  test("by source: shares of the reported tokens, in a fixed order, and a part with nothing is left out", () => {
    const view = usageView(days, "source", "tokens", names);
    expect(view.total).toBe(1100);
    expect(view.parts.map((p) => [p.label, Math.round(p.share)])).toEqual([
      ["You", 73],
      ["Routines", 18],
      ["Between members", 9],
    ]);
    expect(view.days[1]?.values).toEqual({ person: 100, handoff: 100 });
  });

  test("by member: the busiest first, named, and the rest in one part past five", () => {
    const view = usageView(days, "member", "tokens", names);
    expect(view.parts.map((p) => p.label)).toEqual(["Leo", "Basil"]);
    const many: TokenDay = {
      day: "2026-11-21",
      sources: {},
      members: Object.fromEntries(
        ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => [
          id,
          tokens(100 - i),
        ]),
      ),
    };
    const wide = usageView([many], "member", "tokens", names);
    expect(wide.keys.length).toBe(6);
    expect(wide.keys[5]?.key).toBe(REST_KEY);
    expect(wide.parts[5]?.value).toBe(95 + 94);
    expect(wide.parts.reduce((s, p) => s + p.share, 0)).toBeCloseTo(100);
  });

  test("time is its own measure, and an empty week has a zero total and no shares", () => {
    const view = usageView(
      [
        {
          day: "2026-11-21",
          sources: { routine: tokens(0, 0, 600) },
          members: {},
        },
      ],
      "source",
      "time",
      names,
    );
    expect(view.parts[0]).toMatchObject({
      label: "Routines",
      value: 600,
      share: 100,
    });
    expect(usageView([], "source", "tokens", names)).toMatchObject({
      total: 0,
      parts: [],
    });
  });
});

test("the text helpers: shares, durations, day names, a round top", () => {
  expect(percentText(63.2)).toBe("63%");
  expect(percentText(3.44)).toBe("3.4%");
  expect(percentText(0.04)).toBe("under 0.1%");
  expect(percentText(0)).toBe("0%");
  expect(metricText(1_200_000, "tokens")).toBe("1.2M tokens");
  expect(metricText(3 * 3600 + 1200, "time")).toBe("3 h 20 min");
  expect(dayLabel("2026-11-21", false)).toBe("Sat 21");
  expect(dayLabel("2026-11-21", true)).toBe("Today");
  expect(dayLabel("nonsense", false)).toBe("nonsense");
  expect(niceMax(0)).toBe(1);
  expect(niceMax(730)).toBe(1000);
  expect(niceMax(1900)).toBe(2000);
  expect(niceMax(2100)).toBe(2500);
});

test("an engine held by a limit is said in the engine card's own words; a ready one is not listed", () => {
  const held = heldEngines(
    [
      {
        id: "claude-code",
        name: "Claude Code",
        state: "limited",
        until: "2026-11-22T07:00:00Z",
      },
      { id: "local", name: "Local model", state: "ready", until: null },
    ],
    new Date("2026-11-22T05:00:00Z"),
  );
  expect(held).toHaveLength(1);
  expect(held[0]?.text).toMatch(
    /^Claude Code: Reached its limit until \d\d:\d\d$/,
  );
});

const originalFetch = global.fetch;
let usage: TokenUsage;
let engineState: "ready" | "limited" = "ready";

const base = (over: Partial<TokenUsage> = {}): TokenUsage => ({
  reason: null,
  timezone: "UTC",
  windowDays: 7,
  rows: [
    {
      member: "creator",
      engine: "claude-code",
      class: "login",
      today: tokens(100),
      week: tokens(1100),
    },
  ],
  engines: [],
  daily: [
    {
      day: "2026-11-20",
      sources: { person: tokens(600, 100), routine: tokens(200) },
      members: { creator: tokens(900) },
    },
    {
      day: "2026-11-21",
      sources: { person: tokens(100), handoff: tokens(100) },
      members: { creator: tokens(200) },
    },
  ],
  problem: false,
  ...over,
});

beforeEach(() => {
  engineState = "ready";
  usage = base();
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/freeduet/engines")
      return Response.json({
        reason: null,
        engines: [
          {
            id: "claude-code",
            name: "Claude Code",
            kind: "cli",
            state: engineState,
            until: engineState === "limited" ? "2099-01-01T07:00:00Z" : null,
            refusal: null,
          },
        ],
      });
    if (url === "/api/freeduet/engines/usage") return Response.json(usage);
    if (url.startsWith("/api/agents"))
      return Response.json({
        agents: [
          {
            id: "creator",
            name: "Leo",
            description: "",
            bio: "",
            channels: [],
          },
        ],
      });
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function draw() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FreeDuetEngines />
    </QueryClientProvider>,
  );
}

test("the page shows the bar with percentages, the legend, and seven-day chart, split by source first", async () => {
  const view = draw();
  await waitFor(() => view.getByTestId("usage-charts"));
  const legend = (view.getByTestId("usage-legend").textContent ?? "").replace(
    /\u00a0/g,
    " ",
  );
  expect(legend).toContain("You");
  expect(legend).toContain("73%");
  expect(legend).toContain("Routines");
  expect(legend).toContain("Between members");
  expect(view.getByTestId("usage-bar").getAttribute("aria-label")).toContain(
    "You 73%",
  );
  expect(view.getAllByTestId("usage-day")).toHaveLength(2);
});

test("the toggle changes the split to members, by name, and to time", async () => {
  const view = draw();
  await waitFor(() => view.getByTestId("usage-charts"));
  fireEvent.click(view.getByRole("button", { name: "By member" }));
  expect(view.getByTestId("usage-legend").textContent).toContain("Leo");
  expect(view.getByTestId("usage-legend").textContent).toContain("100%");
  expect(
    view
      .getByRole("button", { name: "By member" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    view
      .getByRole("button", { name: "By source" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

test("no percentage of a weekly limit is drawn: the page says why, and lists a held engine in the card's words", async () => {
  engineState = "limited";
  const view = draw();
  await waitFor(() => view.getByTestId("usage-limits"));
  await waitFor(() => view.getByTestId("usage-held"));
  expect(view.getByTestId("usage-held").textContent).toMatch(
    /^Claude Code: Reached its limit until /,
  );
  const limits = view.getByTestId("usage-limits").textContent ?? "";
  expect(limits).toContain("not shown");
  expect(limits).toContain("does not report it");
  expect(view.queryByText(/of your weekly limit/i)).toBeNull();
});

test("a ready engine says nothing is held", async () => {
  const view = draw();
  await waitFor(() => view.getByTestId("usage-limits"));
  expect(view.getByTestId("usage-limits").textContent).toContain(
    "No engine is held back",
  );
  expect(view.queryByTestId("usage-held")).toBeNull();
});

test("a server with no daily series still shows the table and the limits, and no chart", async () => {
  usage = base({ daily: undefined });
  const view = draw();
  await waitFor(() => view.getByRole("table", { name: "Tokens" }));
  await waitFor(() => view.getByTestId("usage-limits"));
  expect(view.queryByTestId("usage-charts")).toBeNull();
});

test("a week with nothing counted says so", async () => {
  usage = base({ daily: [{ day: "2026-11-21", sources: {}, members: {} }] });
  const view = draw();
  await waitFor(() => view.getByTestId("usage-charts"));
  expect(view.getByTestId("usage-charts").textContent).toContain(
    "Nothing was counted",
  );
  expect(view.queryByTestId("usage-chart")).toBeNull();
});

test("a chart that throws does not take the table down", async () => {
  // A day whose counts are not numbers is what the server never sends; the boundary is for what nobody expected.
  usage = base({
    daily: [
      {
        day: "2026-11-21",
        sources: null as unknown as TokenDay["sources"],
        members: {},
      },
    ],
  });
  const view = draw();
  await waitFor(() => view.getByRole("table", { name: "Tokens" }));
  expect(view.getByTestId("usage-charts-failed")).toBeTruthy();
});
