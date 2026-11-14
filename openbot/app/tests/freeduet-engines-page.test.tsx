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
import type { EnginesReading } from "@/freeduet/engines-text";
import { settleReactWork } from "./settle-react-work";

/**
 * Admin → Engines (docs/ENGINES_PLAN.md slice 6): one row per engine with a plain sentence for its state, an
 * honest sentence where nothing can be listed, and nothing a person can click to change an engine.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
let answer: { status: number; body: unknown };
const requests: string[] = [];

beforeEach(() => {
  requests.length = 0;
  answer = { status: 200, body: { reason: null, engines: [] } };
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (String(input) !== "/api/freeduet/engines") {
      return new Response(null, { status: 404 });
    }
    return Response.json(answer.body, { status: answer.status });
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

/** A time an hour from now, as the server sends it: UTC, ISO 8601. */
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function serve(reading: EnginesReading) {
  answer = { status: 200, body: reading };
}

test("each engine is one row: its name, and one sentence for its state", async () => {
  serve({
    reason: null,
    engines: [
      {
        id: "claude",
        name: "Claude Code",
        state: "limited",
        until: inAnHour(),
      },
      { id: "backup", name: "Backup engine", state: "signed_out", until: null },
    ],
  });
  const view = draw();

  await waitFor(() => view.getByText("Claude Code"));
  expect(view.getByText("Backup engine")).toBeTruthy();
  expect(
    view.getByText(
      /^Reached its limit until (\d{2}:\d{2}|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2})$/,
    ),
  ).toBeTruthy();
  expect(
    view.getByText("Signed out: sign in again with the engine's own login"),
  ).toBeTruthy();
});

test("nothing in a row can be clicked or changed", async () => {
  serve({
    reason: null,
    engines: [
      { id: "claude", name: "Claude Code", state: "ready", until: null },
    ],
  });
  const view = draw();
  const row = (await waitFor(() => view.getByText("Claude Code"))).closest(
    '[data-slot="item"]',
  );
  expect(row).not.toBeNull();
  expect(
    row?.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"]',
    ).length,
  ).toBe(0);
});

test("the reasons the page lists nothing each say so, and never an error", async () => {
  serve({ reason: "off", engines: [] });
  const off = draw();
  await waitFor(() =>
    off.getByText(
      "The engines are switched off on this installation (FREEDUET_ROUTER=off), so there is nothing to show.",
    ),
  );
  cleanup();

  serve({ reason: "not_set_up", engines: [] });
  const notSetUp = draw();
  await waitFor(() =>
    notSetUp.getByText(
      "No FreeDuet agent is set up on this installation, so there are no engines to show.",
    ),
  );
  cleanup();

  serve({ reason: "unreachable", engines: [] });
  const unreachable = draw();
  await waitFor(() =>
    unreachable.getByText(
      "The FreeDuet agent did not answer, so the engines cannot be read right now. This page asks again every 30 seconds.",
    ),
  );
  expect(unreachable.queryByRole("alert")).toBeNull();
});

test("a list with no engines says there are none yet", async () => {
  serve({ reason: null, engines: [] });
  const view = draw();
  await waitFor(() => view.getByText("No engines are reported yet."));
});

test("a request that fails is said once, in words, and the page keeps its shape", async () => {
  answer = { status: 500, body: { error: "boom" } };
  const view = draw();
  const alert = await waitFor(() => view.getByRole("alert"));
  expect(alert.textContent).toBe("Couldn't load the engines. Reload the page.");
});

test("the page only reads: nothing but GET is sent", async () => {
  serve({
    reason: null,
    engines: [
      { id: "claude", name: "Claude Code", state: "ready", until: null },
    ],
  });
  const view = draw();
  await waitFor(() => view.getByText("Claude Code"));
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((request) => request.startsWith("GET "))).toBe(true);
});
