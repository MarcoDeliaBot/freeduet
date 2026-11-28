import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { STUCK_AFTER_MS as SERVER_STUCK_AFTER_MS } from "../../server/src/freeduet/work-status";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import {
  clipTask,
  openHandoffs,
  ringFill,
  STUCK_AFTER_MS,
  type WorkHandoff,
  type WorkStatus,
  waitOf,
} from "@/freeduet/work-status/status";
import { WaitingRing, WorkStrip } from "@/freeduet/work-status/work-strip";
import { settleReactWork } from "./settle-react-work";

/** D188: the "Working now" strip and Iris's waiting ring. The server decides the states; these tests pin what is drawn. */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const NOW = Date.parse("2026-11-28T10:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const hop = (over: Partial<WorkHandoff> = {}): WorkHandoff => ({
  id: "k1",
  fromBotId: "freeduet",
  toBotId: "gamedev",
  toName: "Kai",
  threadId: "t1",
  state: "working",
  since: ago(240),
  title: "Build a small game",
  lastStep: { label: "writing a file", at: ago(20) },
  lastEventAt: ago(20),
  ...over,
});
const status = (...handoffs: WorkHandoff[]): WorkStatus => ({
  handoffs,
  members: [],
  at: ago(0),
});

function draw(ui: React.ReactElement, language: "en" | "it" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppLanguageValue language={language}>{ui}</AppLanguageValue>
    </QueryClientProvider>,
  );
}

test("the app's stuck threshold is the server's", () => {
  expect(STUCK_AFTER_MS).toBe(SERVER_STUCK_AFTER_MS);
});

test("only this conversation's open hand-offs are listed", () => {
  const data = status(
    hop(),
    hop({ id: "k2", threadId: "other" }),
    hop({ id: "k3", state: "done" }),
    hop({ id: "k4", fromBotId: "creator", threadId: null }),
  );
  expect(openHandoffs(data, { threadId: "t1" }).map((h) => h.id)).toEqual([
    "k1",
  ]);
  expect(
    openHandoffs(data, { fromBotId: "freeduet" }).map((h) => h.id),
  ).toEqual(["k1", "k2"]);
  expect(openHandoffs(data, {})).toEqual([]);
  const view = draw(
    <WorkStrip hops={openHandoffs(data, { threadId: "t1" })} now={NOW} />,
  );
  const rows = view.getAllByTestId("working-now-row");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.textContent).toContain("Kai");
  expect(rows[0]?.textContent).toContain("working for 4 min");
  expect(rows[0]?.textContent).toContain("last sign of life 20 s ago");
  expect(rows[0]?.textContent).toContain("Build a small game");
  const region = view.getByTestId("working-now");
  expect(region.getAttribute("role")).toBe("status");
  expect(region.getAttribute("tabindex")).toBeNull();
});

test("with none open the strip says so, in plain words, and is still there", () => {
  const view = draw(<WorkStrip hops={[]} now={NOW} />);
  expect(view.getByTestId("working-now-none").textContent).toBe(
    "Working now: nobody",
  );
});

test("queued, waiting, stuck and a hand-off that gave up each say it", () => {
  const view = draw(
    <WorkStrip
      hops={[
        hop({ id: "a", state: "queued", lastEventAt: null }),
        hop({ id: "b", state: "waiting" }),
        hop({ id: "c", state: "stuck", lastEventAt: ago(330) }),
        hop({
          id: "d",
          state: "waiting",
          stalled: { reason: "it ran out of tries" },
        }),
      ]}
      now={NOW}
    />,
  );
  const text = (id: string) =>
    view.container.querySelector(`[data-handoff="${id}"]`)?.textContent ?? "";
  expect(text("a")).toContain("waiting to start");
  expect(text("b")).toContain("waiting for you");
  expect(text("c")).toContain("stuck: no sign of life for 5 min");
  expect(text("d")).toContain("did not finish");
  expect(text("d")).toContain("Try again");
  expect(text("c")).not.toContain("Try again");
});

test("the strip reads Italian", () => {
  const view = draw(<WorkStrip hops={[hop()]} now={NOW} />, "it");
  const text = view.getByTestId("working-now").textContent ?? "";
  expect(text).toContain("lavora da 4 min");
  expect(text).toContain("ultimo segno di vita 20 s fa");
  cleanup();
  const none = draw(<WorkStrip hops={[]} now={NOW} />, "it");
  expect(none.getByTestId("working-now-none").textContent).toBe(
    "In lavoro adesso: nessuno",
  );
});

test("a task is clipped to 120 characters", () => {
  expect(clipTask("x".repeat(300))).toHaveLength(120);
  expect(clipTask("short")).toBe("short");
});

test("the ring is drawn only while something is open and fills with elapsed time", () => {
  expect(
    draw(<WaitingRing name="Iris" wait={null} />).queryByTestId("waiting-ring"),
  ).toBeNull();
  cleanup();
  expect(waitOf([], NOW)).toBeNull();
  expect(ringFill(0)).toBe(0);
  expect(ringFill(STUCK_AFTER_MS / 2)).toBe(0.5);
  expect(ringFill(STUCK_AFTER_MS * 3)).toBe(1);
  const fills = [0, 150, 300, 900].map((seconds) => {
    const wait = waitOf([hop({ since: ago(seconds) })], NOW);
    const view = draw(<WaitingRing name="Iris" wait={wait} />);
    const fill = Number(
      view.getByTestId("waiting-ring").getAttribute("data-fill"),
    );
    cleanup();
    return fill;
  });
  expect(fills).toEqual([0, 0.5, 1, 1]);
});

test("the ring turns stuck when the server says stuck, and says the minutes", () => {
  const wait = waitOf([hop({ since: ago(240), state: "stuck" })], NOW);
  const ring = draw(<WaitingRing name="Iris" wait={wait} />).getByTestId(
    "waiting-ring",
  );
  expect(ring.getAttribute("data-state")).toBe("stuck");
  expect(ring.getAttribute("aria-label")).toBe(
    "Iris is waiting for a colleague and it looks stuck: 4 min",
  );
  cleanup();
  const calm = draw(
    <WaitingRing name="Iris" wait={waitOf([hop({ since: ago(120) })], NOW)} />,
    "it",
  ).getByTestId("waiting-ring");
  expect(calm.getAttribute("aria-label")).toBe(
    "Iris aspetta un collega: 2 min",
  );
});
