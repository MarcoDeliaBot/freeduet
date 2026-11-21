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
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import {
  compactTokens,
  CURRENCY_STORAGE_KEY,
  formatDuration,
  formatMoney,
  listPriceUsd,
  NOT_REPORTED,
  savedFor,
  savedTimeText,
  savedTokensText,
  type TokenRow,
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
  seconds: 0,
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
    seconds: 18 * 60,
  });
  const silent = counts({ turns: 2 });
  usage = {
    status: 200,
    body: reading({
      rows: [
        {
          member: "creator",
          engine: "claude-code",
          class: "login",
          today: reported,
          week: counts({
            turns: 9,
            reportedTurns: 8,
            inputTokens: 2_500_000,
            outputTokens: 90_000,
          }),
        },
        {
          member: "creator",
          engine: "local",
          class: "local",
          today: silent,
          week: silent,
        },
      ],
      engines: [
        {
          member: null,
          engine: "claude-code",
          class: "login",
          today: reported,
          week: reported,
        },
      ],
    }),
  };
  const view = draw();

  await waitFor(() => view.getByRole("table", { name: "Tokens" }));
  const table = view.getByRole("table", { name: "Tokens" });
  const text = (table.textContent ?? "").replace(/\u00a0/g, " ");
  expect(text).toContain("Leo"); // the member's name, not its id
  expect(text).toContain("12.3k in · 1.5k out");
  expect(text).toContain("2.5M in · 90k out");
  expect(text).toContain("8 of 9 attempts reported");
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
  await waitFor(() =>
    view.getByText("The token counts are not available now."),
  );
  cleanup();

  usage = { status: 500, body: {} };
  view = draw();
  await waitFor(() =>
    view.getByText("The token counts are not available now."),
  );
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

// ── D126: time, tokens saved, euro or dollars ────────────────────────────────────────────────────────────────

const rowOf = (
  engine: string,
  kind: TokenRow["class"],
  today: TokenCounts,
  week: TokenCounts = today,
  member: string | null = "creator",
): TokenRow => ({ member, engine, class: kind, today, week });

test("durations read '18 min' and '2 h 05 min', round to whole minutes and never say 60 min", () => {
  expect(formatDuration(18 * 60)).toBe("18 min");
  expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 h 05 min");
  expect(formatDuration(59 * 60 + 40)).toBe("1 h 00 min");
  expect(formatDuration(20)).toBe("under 1 min");
  expect(formatDuration(0)).toBeNull();
  expect(formatDuration(Number.NaN)).toBeNull();
});

test("a cell shows its time under the tokens, 'in · out' never breaks, and 'not reported' keeps the time on its line", () => {
  const reported = tokensCell(
    counts({
      turns: 2,
      reportedTurns: 2,
      inputTokens: 1_200,
      outputTokens: 300,
      seconds: 125 * 60,
    }),
  );
  expect(reported.time).toBe("2 h 05 min");
  expect(reported.text).not.toContain(" "); // only non-breaking spaces: "out" cannot wrap alone
  expect(reported.text.replace(/\u00a0/g, " ")).toBe("1.2k in · 300 out");
  const silent = tokensCell(counts({ turns: 1, seconds: 12 * 60 }));
  expect(silent.text.replace(/\u00a0/g, " ")).toBe("not reported · 12 min");
  expect(silent.time).toBeNull();
  expect(tokensCell(counts({ turns: 1 })).text).toBe(NOT_REPORTED); // no time measured: just not reported
});

test("saved: free cloud and local count; a subscription and a metered engine do not", () => {
  const used = counts({
    turns: 2,
    reportedTurns: 2,
    inputTokens: 1_000_000,
    outputTokens: 200_000,
    seconds: 600,
  });
  const rows = [
    rowOf("openrouter", "free_cloud", used),
    rowOf("ollama", "local", used),
    rowOf("claude-code", "login", used),
    rowOf("gateway", "metered", used),
    rowOf("mystery", "other", used),
  ];
  const saved = savedFor(rows, "week");
  expect(saved.inputTokens).toBe(2_000_000);
  expect(saved.outputTokens).toBe(400_000);
  expect(savedTokensText(saved)).toBe("2.4M tokens");
  expect(savedFor([rows[2], rows[3], rows[4]], "week")).toEqual({
    inputTokens: 0,
    outputTokens: 0,
    localUnreportedSeconds: 0,
    cloudUnreportedSeconds: 0,
  });
});

test("a local model that reported no tokens saves time and no invented tokens", () => {
  const silent = counts({ turns: 3, seconds: 40 * 60 });
  const saved = savedFor([rowOf("ollama", "local", silent)], "week");
  expect(saved.inputTokens + saved.outputTokens).toBe(0);
  expect(savedTokensText(saved)).toBeNull();
  expect(savedTimeText(saved)).toBe(
    "40 min on your own GPU, tokens not reported",
  );
  // A login that reported nothing adds no saved time either.
  expect(
    savedTimeText(savedFor([rowOf("claude-code", "login", silent)], "week")),
  ).toBeNull();
});

test("the price is the declared list price per million tokens, and euros come from the declared rate", () => {
  expect(listPriceUsd(1_000_000, 0)).toBe(2);
  expect(listPriceUsd(0, 1_000_000)).toBe(10);
  expect(formatMoney(4, "usd")).toBe("$4.00");
  expect(formatMoney(4, "eur")).toBe("€3.64"); // 4 / 1.0989
  expect(formatMoney(0.001, "eur")).toBe("under €0.01");
  expect(formatMoney(0, "usd")).toBe("$0.00");
});

function savedBody() {
  const free = counts({
    turns: 3,
    reportedTurns: 3,
    inputTokens: 1_000_000,
    outputTokens: 200_000,
    seconds: 20 * 60,
  });
  const gpu = counts({ turns: 2, seconds: 40 * 60 });
  return reading({
    rows: [
      rowOf("openrouter", "free_cloud", free, free),
      rowOf("local", "local", gpu, gpu),
      rowOf("claude-code", "login", free, free),
    ],
  });
}

test("the saved line, its reference and the euro/dollar button, which is remembered in this browser", async () => {
  window.localStorage.removeItem(CURRENCY_STORAGE_KEY);
  usage = { status: 200, body: savedBody() };
  const view = draw();
  const line = await waitFor(() => view.getByTestId("tokens-saved"));
  const text = (line.textContent ?? "").replace(/\u00a0/g, " ");
  expect(text).toContain(
    "Saved in the last 7 days: 1.2M tokens ≈ €3.64, plus 40 min on your own GPU, tokens not reported",
  );
  expect(text).toContain("At Claude Sonnet 5.5 list prices");
  expect(text).toContain("21 Nov 2026");
  const euro = view.getAllByRole("button", {
    name: /€3\.64\. Show amounts in dollars/,
  });
  fireEvent.click(euro[0]);
  await waitFor(() =>
    view.getAllByRole("button", { name: /\$4\.00\. Show amounts in euros/ }),
  );
  expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("usd");
  cleanup();
  // A new page load reads the choice back.
  const again = draw();
  await waitFor(() => again.getAllByRole("button", { name: /\$4\.00/ }));
  fireEvent.click(again.getAllByRole("button", { name: /\$4\.00/ })[0]);
  await waitFor(() => again.getAllByRole("button", { name: /€3\.64/ }));
  expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("eur");
});

test("a browser that refuses storage still shows euros and still switches", async () => {
  const real = Object.getOwnPropertyDescriptor(window, "localStorage");
  const refusing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: refusing,
    configurable: true,
  });
  try {
    usage = { status: 200, body: savedBody() };
    const view = draw();
    const euro = await waitFor(() =>
      view.getAllByRole("button", { name: /€3\.64/ }),
    );
    fireEvent.click(euro[0]);
    await waitFor(() => view.getAllByRole("button", { name: /\$4\.00/ }));
  } finally {
    if (real) Object.defineProperty(window, "localStorage", real);
  }
});

test("a stored value that is not 'eur' or 'usd' falls back to euros", async () => {
  window.localStorage.setItem(CURRENCY_STORAGE_KEY, "<b>gbp</b>");
  usage = { status: 200, body: savedBody() };
  const view = draw();
  await waitFor(() => view.getAllByRole("button", { name: /€3\.64/ }));
  window.localStorage.removeItem(CURRENCY_STORAGE_KEY);
});

test("the notes say that a retry on the same engine counts again", async () => {
  usage = { status: 200, body: savedBody() };
  const view = draw();
  await waitFor(() =>
    view.getByText(/a retry on the same engine counts again/),
  );
});
