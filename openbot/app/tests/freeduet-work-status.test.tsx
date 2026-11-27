import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
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
import {
  cardLine,
  dotState,
  justDone,
  dotTooltip,
  elapsedText,
  type WorkHandoff,
  type WorkMember,
  type WorkStatus,
  workPollInterval,
} from "@/freeduet/work-status/status";
import { WorkCard } from "@/freeduet/work-status/work-card";
import { WorkDot } from "@/freeduet/work-status/work-dot";
import { settleReactWork } from "./settle-react-work";

/** D168: the card's states, the dots' states, a click to the member's conversation, and polling that stops when idle. */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const NOW = Date.parse("2026-11-27T10:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const hop = (over: Partial<WorkHandoff> = {}): WorkHandoff => ({
  id: "k1",
  fromBotId: "freeduet",
  toBotId: "gamedev",
  toName: "Kai",
  threadId: "t1",
  state: "working",
  since: ago(4),
  title: "Build a small game",
  lastStep: { label: "writing a file", at: ago(0) },
  lastEventAt: ago(0),
  ...over,
});
const status = (...handoffs: WorkHandoff[]): WorkStatus => ({
  handoffs,
  members: [],
  at: ago(0),
});

test("the card line says who, how long and the last step", () => {
  expect(cardLine(hop(), NOW)).toBe(
    "Kai · working for 4 min · last step: writing a file",
  );
  expect(cardLine(hop({ lastStep: null, since: ago(0) }), NOW)).toBe(
    "Kai · working for under a minute · last step: just started",
  );
  expect(cardLine(hop({ state: "done" }), NOW)).toBe("Kai · done");
  expect(cardLine(hop({ state: "waiting" }), NOW)).toBe(
    "Kai · waiting for you",
  );
  expect(cardLine(hop({ state: "queued" }), NOW)).toBe(
    "Kai · waiting to start",
  );
  expect(cardLine(hop({ state: "stuck", lastEventAt: ago(5) }), NOW)).toBe(
    "Kai · stuck: no sign of life for 5 min",
  );
  expect(elapsedText(ago(125), NOW)).toBe("2 h 5 min");
});

const member = (state: WorkMember["state"], title: string | null = "Game") =>
  ({
    agentId: "gamedev",
    name: "Kai",
    state,
    since: ago(1),
    handoffId: "k1",
    title,
    lastStep: null,
  }) satisfies WorkMember;

test("a dot is stuck, waiting, working or idle, in that order of weight", () => {
  expect(dotState(undefined, false, false)).toBe("idle");
  expect(dotState(member("working"), false, false)).toBe("working");
  expect(dotState(undefined, false, true)).toBe("working");
  expect(dotState(member("working"), true, false)).toBe("waiting");
  expect(dotState(member("waiting"), false, false)).toBe("waiting");
  expect(dotState(member("stuck"), true, false)).toBe("stuck");
  expect(dotTooltip("working", member("working"))).toBe("Working: Game");
  expect(dotTooltip("idle", undefined)).toBe("Idle");
});

test("idle draws no ring, every other state draws one with its state (D180)", () => {
  expect(
    render(<WorkDot state="idle" title="Idle" />).queryByTestId("work-dot"),
  ).toBeNull();
  cleanup();
  for (const state of ["working", "waiting", "stuck", "done"] as const) {
    const view = render(<WorkDot state={state} title={`t ${state}`} />);
    const ring = view.getByTestId("work-dot");
    expect(ring.getAttribute("data-state")).toBe(state);
    expect(ring.getAttribute("title")).toBe(`t ${state}`);
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    expect(ring.className).toContain("fd-ws-ring");
    cleanup();
  }
});

test("a recently finished hand-off gives the member a done ring, an old one does not", () => {
  const recent = hop({ state: "done", lastEventAt: ago(0) });
  expect(justDone([recent], "gamedev", NOW)).toBe(true);
  expect(justDone([recent], "other", NOW)).toBe(false);
  expect(
    justDone([hop({ state: "done", lastEventAt: ago(5) })], "gamedev", NOW),
  ).toBe(false);
});

test("the ring css animates, has a reduced-motion fallback and no gray dot on faces", () => {
  const css = readFileSync(
    new URL("../src/freeduet/work-status/work-status.css", import.meta.url),
    "utf8",
  );
  expect(css).toContain("prefers-reduced-motion");
  expect(css).toMatch(
    /reduce\) \{[\s\S]*\.fd-ws-ring\[data-state="working"\][\s\S]*animation: none/,
  );
  expect(css).not.toContain("data-on-face");
});

test("polling runs every 5 s while something is open and stops when idle", () => {
  expect(workPollInterval(undefined)).toBe(false);
  expect(workPollInterval(status())).toBe(false);
  expect(workPollInterval(status(hop({ state: "done" })))).toBe(false);
  expect(workPollInterval(status(hop()))).toBe(5000);
  expect(workPollInterval(status(hop({ state: "stuck" })))).toBe(5000);
  expect(
    workPollInterval(status(hop({ state: "done" }), hop({ id: "k2" }))),
  ).toBe(5000);
});

function draw(each: WorkHandoff) {
  global.fetch = (async (input: RequestInfo | URL) =>
    String(input) === "/api/agents"
      ? Response.json({
          agents: [
            { id: "freeduet", name: "Iris" },
            { id: "gamedev", name: "Kai" },
          ],
        })
      : new Response(null, { status: 404 })) as unknown as typeof fetch;
  const root = createRootRoute({
    component: () => <WorkCard active={false} hop={each} now={NOW} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/channel/new" }),
    ]),
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

test("two cards: Kai working and Lumi done, each with its line", async () => {
  const kai = draw(hop());
  await waitFor(() =>
    expect(kai.getByTestId("work-card").textContent).toContain(
      "Kai · working for 4 min · last step: writing a file",
    ),
  );
  cleanup();
  const lumi = draw(
    hop({ toBotId: "designer", toName: "Lumi", state: "done" }),
  );
  await waitFor(() =>
    expect(lumi.getByTestId("work-card").textContent).toContain("Lumi · done"),
  );
  expect(lumi.getByTestId("work-card").getAttribute("data-state")).toBe("done");
});

test("one click on the card opens the member's own conversation", async () => {
  const view = draw(hop());
  await waitFor(() =>
    expect(view.getByTestId("work-card").tagName.toLowerCase()).toBe("a"),
  );
  const link = view.getByTestId("work-card");
  expect(link.getAttribute("href")).toContain("/channel/new");
  expect(link.getAttribute("href")).toContain("gamedev");
  expect(link.getAttribute("aria-label")).toContain("Open Kai's conversation");
});

test("a hop that gave up shows the plain reason and the same buttons as the Bots page, not 'waiting for you' (D172)", async () => {
  const view = draw(
    hop({
      state: "waiting",
      stalled: { reason: "it ran past the time limit for one hand-off" },
    }),
  );
  await waitFor(() =>
    expect(view.getByTestId("work-card").textContent).toContain(
      "Kai · did not finish",
    ),
  );
  const card = view.getByTestId("work-card");
  expect(card.textContent).not.toContain("waiting for you");
  expect(view.getByTestId("work-card-reason").textContent).toBe(
    "Why: it ran past the time limit for one hand-off.",
  );
  expect(view.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  const open = view.getByText("Open conversation").closest("a");
  expect(open?.getAttribute("href")).toContain("gamedev");
});
