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
import { cleanup, render, waitFor } from "@testing-library/react";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import {
  compactTokens,
  NOT_REPORTED,
  type TokenCounts,
  type TokenUsage,
  tokensCell,
} from "@/freeduet/engines-tokens-text";
import { settleReactWork } from "./settle-react-work";

/**
 * The Tokens section of the Engines page (D102): a table of member by engine with today and the last seven days, "not
 * reported" for an engine that said nothing, and a section that says it is unavailable when the server cannot read the counter.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
let usage: { status: number; body: unknown };

const counts = (over: Partial<TokenCounts> = {}): TokenCounts => ({
  turns: 0,
  reportedTurns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});

beforeEach(() => {
  usage = { status: 200, body: {} };
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
            state: "ready",
            until: null,
            refusal: null,
          },
          {
            id: "local",
            name: "Local model",
            kind: "openai-compatible",
            state: "ready",
            until: null,
            refusal: null,
          },
        ],
      });
    if (url === "/api/freeduet/engines/usage")
      return Response.json(usage.body, { status: usage.status });
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

const reading = (over: Partial<TokenUsage>): TokenUsage => ({
  reason: null,
  timezone: "UTC",
  windowDays: 7,
  rows: [],
  engines: [],
  problem: false,
  ...over,
});

test("the table shows today and seven days per member and engine, and says when an engine reported nothing", async () => {
  const reported = counts({
    turns: 4,
    reportedTurns: 4,
    inputTokens: 12_300,
    outputTokens: 1_500,
  });
  const silent = counts({ turns: 2 });
  usage = {
    status: 200,
    body: reading({
      rows: [
        {
          member: "creator",
          engine: "claude-code",
          today: reported,
          week: counts({
            turns: 9,
            reportedTurns: 8,
            inputTokens: 2_500_000,
            outputTokens: 90_000,
          }),
        },
        { member: "creator", engine: "local", today: silent, week: silent },
      ],
      engines: [{ member: null, engine: "claude-code", today: reported, week: reported }],
    }),
  };
  const view = draw();

  await waitFor(() => view.getByRole("table", { name: "Tokens" }));
  const table = view.getByRole("table", { name: "Tokens" });
  const text = table.textContent ?? "";
  expect(text).toContain("Leo"); // the member's name, not its id
  expect(text).toContain("12.3k in · 1.5k out");
  expect(text).toContain("2.5M in · 90k out");
  expect(text).toContain("8 of 9 turns reported");
  expect(text).toContain(NOT_REPORTED); // the local model said nothing: never a zero
  expect(text).not.toContain("0 in");
  expect(text).toContain("All members");
  expect(view.getByText("Last 7 days")).toBeTruthy();
});

test("with no turn counted yet the section says so, and with no answer it says it is unavailable", async () => {
  usage = { status: 200, body: reading({}) };
  let view = draw();
  await waitFor(() => view.getByText("No turn has been counted yet."));
  cleanup();

  usage = { status: 200, body: reading({ reason: "unreachable" }) };
  view = draw();
  await waitFor(() => view.getByText("The token counts are not available now."));
  cleanup();

  usage = { status: 500, body: {} };
  view = draw();
  await waitFor(() => view.getByText("The token counts are not available now."));
  // The engine cards are still there: the counter never takes the page down.
  expect(view.getByText("Claude Code")).toBeTruthy();
});

test("number formats: whole numbers below a thousand, k and M above, a dash for no turn", () => {
  expect(compactTokens(999)).toBe("999");
  expect(compactTokens(1_234)).toBe("1.2k");
  expect(compactTokens(1_000)).toBe("1k");
  expect(compactTokens(1_500_000)).toBe("1.5M");
  expect(tokensCell(counts()).text).toBe("—");
  expect(tokensCell(counts({ turns: 1 })).text).toBe(NOT_REPORTED);
});
