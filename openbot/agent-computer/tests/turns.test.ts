import { describe, expect, test } from "bun:test";
import { createSessions } from "../src/sessions";
import {
  createTurnQueue,
  DEFAULT_TURN_WAIT_MS,
  TurnAbandonedError,
  TurnBusyError,
  takesATurn,
} from "../src/turns";

/**
 * One call at a time on a Bot's page.
 *
 * A call that arrives while another is still running on the same Bot's page used to run beside it:
 * a snapshot of a page that was still loading, stamped with a generation the navigation then
 * retired. It now waits for its turn, for a bounded time, and says so in words when the time runs
 * out. These cover the line itself; navigation-settle-browser.test.ts covers it against a browser.
 */

const tick = (ms = 5) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("the line of calls on one page", () => {
  test("a call with nothing ahead of it takes the page at once", async () => {
    const turns = createTurnQueue({ waitMs: 50 });
    const turn = await turns.enter();
    expect(turn.waitedMs).toBe(0);
    expect(turns.busy()).toBe(true);
    turn.release();
    expect(turns.busy()).toBe(false);
  });

  test("calls take the page one at a time, in the order they arrived", async () => {
    const turns = createTurnQueue({ waitMs: 1_000 });
    const order: string[] = [];
    const first = await turns.enter();
    const second = turns.enter().then((turn) => {
      order.push("second");
      return turn;
    });
    const third = turns.enter().then((turn) => {
      order.push("third");
      return turn;
    });
    await tick();
    expect(order).toEqual([]);
    expect(turns.waiting()).toBe(2);

    first.release();
    (await second).release();
    (await third).release();
    expect(order).toEqual(["second", "third"]);
    expect(turns.busy()).toBe(false);
  });

  test("a call that arrives while the page is handed on does not jump the line", async () => {
    const turns = createTurnQueue({ waitMs: 1_000 });
    const first = await turns.enter();
    const queued = turns.enter();
    first.release();
    // The page went to the queued call straight away, so a latecomer finds it held.
    const late = turns.enter();
    await tick();
    expect(turns.waiting()).toBe(1);
    (await queued).release();
    (await late).release();
  });

  test("says how long a call waited", async () => {
    let clock = 1_000;
    const turns = createTurnQueue({ waitMs: 1_000, now: () => clock });
    const first = await turns.enter();
    const second = turns.enter();
    clock += 400;
    first.release();
    expect((await second).waitedMs).toBe(400);
  });

  test("releasing twice hands the page on once", async () => {
    const turns = createTurnQueue({ waitMs: 1_000 });
    const first = await turns.enter();
    const second = turns.enter();
    const third = turns.enter();
    first.release();
    first.release();
    const secondTurn = await second;
    // The second call holds the page; a duplicate release of the first must not have given it to the third.
    expect(turns.waiting()).toBe(1);
    secondTurn.release();
    (await third).release();
  });

  test("a call that waits too long is told the computer is busy, and leaves the line", async () => {
    const turns = createTurnQueue({ waitMs: 20 });
    const holder = await turns.enter();
    const refused = await turns.enter().catch((error) => error as Error);
    expect(refused).toBeInstanceOf(TurnBusyError);
    expect((refused as TurnBusyError).waitedMs).toBeGreaterThanOrEqual(0);
    // Plain words: busy with an earlier action. Not "could not be reached", which it is not.
    expect((refused as Error).message).toContain(
      "still busy with an earlier action",
    );
    expect((refused as Error).message).not.toContain("reached");
    expect(turns.waiting()).toBe(0);
    // The one that was running is unaffected, and the page is free again after it.
    holder.release();
    expect(turns.busy()).toBe(false);
    (await turns.enter()).release();
  });

  test("a caller that goes away while it waits leaves the line, and never takes a turn", async () => {
    const turns = createTurnQueue({ waitMs: 1_000 });
    const holder = await turns.enter();
    const controller = new AbortController();
    const abandoned = turns
      .enter(controller.signal)
      .catch((error) => error as Error);
    const next = turns.enter();
    controller.abort();
    expect(await abandoned).toBeInstanceOf(TurnAbandonedError);
    expect(turns.waiting()).toBe(1);
    holder.release();
    // The turn went to the call behind it, not to the one that left.
    (await next).release();
    expect(turns.busy()).toBe(false);
  });

  test("a caller that is already gone is refused without waiting", async () => {
    const turns = createTurnQueue({ waitMs: 1_000 });
    const controller = new AbortController();
    controller.abort();
    await expect(turns.enter(controller.signal)).rejects.toBeInstanceOf(
      TurnAbandonedError,
    );
    expect(turns.busy()).toBe(false);
  });

  test("a call whose turn comes is not also refused by its own timer", async () => {
    const turns = createTurnQueue({ waitMs: 30 });
    const first = await turns.enter();
    const second = turns.enter();
    await tick(10);
    first.release();
    const turn = await second;
    await tick(60);
    // Still holding the page after its wait would have run out; nobody was refused.
    expect(turns.busy()).toBe(true);
    turn.release();
  });
});

describe("which calls take a turn", () => {
  test("everything that reads or acts on the page does", () => {
    for (const [method, path] of [
      ["POST", "/navigate"],
      ["POST", "/snapshot"],
      ["GET", "/read"],
      ["POST", "/click"],
      ["POST", "/type"],
      ["POST", "/key"],
      ["POST", "/scroll"],
    ]) {
      expect(takesATurn(method, path)).toBe(true);
    }
  });

  test("a person's input, the screen, the shell and the workspace do not", () => {
    for (const [method, path] of [
      ["POST", "/human/click"],
      ["POST", "/human/type"],
      ["POST", "/human/key"],
      ["POST", "/human/scroll"],
      ["POST", "/control/take"],
      ["POST", "/control/release"],
      ["GET", "/screenshot"],
      ["GET", "/health"],
      ["GET", "/run"],
      ["POST", "/exec"],
      ["POST", "/files/write"],
      ["POST", "/computers/stop"],
      // The method is part of the name: a GET of an acting path is not the acting call.
      ["GET", "/navigate"],
      ["POST", "/read"],
    ]) {
      expect(takesATurn(method, path)).toBe(false);
    }
  });
});

describe("each Bot has its own line", () => {
  test("one Bot's long call does not hold up another Bot's", async () => {
    const sessions = createSessions({ isLive: () => true, turnWaitMs: 20 });
    const slow = await sessions.for("slow").turns.enter();
    const other = await sessions.for("other").turns.enter();
    expect(other.waitedMs).toBe(0);
    await expect(sessions.for("slow").turns.enter()).rejects.toBeInstanceOf(
      TurnBusyError,
    );
    slow.release();
    other.release();
  });

  test("the wait is bounded by default", () => {
    expect(DEFAULT_TURN_WAIT_MS).toBeGreaterThan(0);
    // Inside the 45 s the server gives a call, with room left for the call's own work.
    expect(DEFAULT_TURN_WAIT_MS).toBeLessThan(45_000);
  });
});
