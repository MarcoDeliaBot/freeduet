import { describe, expect, test } from "bun:test";
import {
  collectWhenSettled,
  type DocumentHold,
  isNavigationRace,
  PageNotSettledError,
  pageLoadTimeoutMessage,
  pageMovedOn,
  SETTLE_ATTEMPTS,
  type SettlePage,
  watchNavigations,
} from "../src/settle";

/**
 * Reading a page that is still moving.
 *
 * A page that redirects, reloads or rewrites its document right after it loads breaks a read in two
 * ways: the read can be cut in half ("Execution context was destroyed"), and it can finish cleanly on
 * the page that is about to go away. These tests stand up a page that can do either, at a chosen
 * moment, and check what is retried (the read, never anything with a side effect), how often, and
 * what the caller is told when the page never holds still. The browser itself is exercised in
 * navigation-settle-browser.test.ts.
 */

const CONTEXT_GONE = new Error(
  "evaluate: Execution context was destroyed, most likely because of a navigation",
);

/** A page whose main frame can commit a navigation whenever the test says so. */
function movingPage() {
  const main = { name: "main" };
  const listeners = new Set<(frame: unknown) => void>();
  const loads: number[] = [];
  const page: SettlePage = {
    mainFrame: () => main as never,
    on: (_event, listener) => {
      listeners.add(listener);
    },
    off: (_event, listener) => {
      listeners.delete(listener);
    },
    waitForLoadState: async (_state, options) => {
      loads.push(options?.timeout ?? -1);
    },
  };
  return {
    page,
    loads,
    listenerCount: () => listeners.size,
    /** The page commits a navigation, as a script's redirect does. */
    navigate: () => {
      for (const listener of [...listeners]) listener(main);
    },
    /** A navigation in a frame inside the page, which is not the page moving. */
    navigateChildFrame: () => {
      for (const listener of [...listeners]) listener({ name: "child" });
    },
  };
}

const instantly = async () => {};

describe("what counts as the page moving under a call", () => {
  test("Playwright's wording for a destroyed context, and nothing else", () => {
    expect(isNavigationRace(CONTEXT_GONE)).toBe(true);
    expect(
      isNavigationRace(new Error("Cannot find context with specified id")),
    ).toBe(true);
    expect(isNavigationRace(new Error("Frame was detached"))).toBe(true);
    expect(isNavigationRace(new Error("goto: Timeout 30000ms exceeded."))).toBe(
      false,
    );
    expect(isNavigationRace(new Error("Target page has been closed"))).toBe(
      false,
    );
    expect(isNavigationRace("Execution context was destroyed")).toBe(false);
  });

  test("an aborted load is the page moving on only when the page committed a navigation of its own", () => {
    const aborted = new Error("goto: net::ERR_ABORTED at http://example.test/");
    // The page redirected or rewrote itself while goto was waiting: the page is there.
    expect(pageMovedOn(aborted, 1)).toBe(true);
    // Nothing committed: a download, a blocked request or a refused address. That is an error.
    expect(pageMovedOn(aborted, 0)).toBe(false);
    expect(pageMovedOn(new Error("net::ERR_CONNECTION_REFUSED"), 3)).toBe(
      false,
    );
  });

  test("only the main frame's navigations are counted, and the watch stops listening", () => {
    const { page, navigate, navigateChildFrame, listenerCount } = movingPage();
    const watch = watchNavigations(page);
    expect(listenerCount()).toBe(1);
    navigateChildFrame();
    expect(watch.count()).toBe(0);
    navigate();
    navigate();
    expect(watch.count()).toBe(2);
    watch.stop();
    expect(listenerCount()).toBe(0);
    navigate();
    expect(watch.count()).toBe(2);
  });
});

describe("reading until the page holds still", () => {
  test("a page that is already still is read once", async () => {
    const { page } = movingPage();
    let reads = 0;
    const result = await collectWhenSettled(
      page,
      async () => {
        reads += 1;
        return "page";
      },
      { sleep: instantly },
    );
    expect(result).toEqual({ value: "page", attempts: 1 });
    expect(reads).toBe(1);
  });

  test("a read cut in half by a redirect is read again on the page that arrived", async () => {
    const { page, navigate } = movingPage();
    let reads = 0;
    const result = await collectWhenSettled(
      page,
      async () => {
        reads += 1;
        if (reads === 1) {
          navigate();
          throw CONTEXT_GONE;
        }
        return "landing";
      },
      { sleep: instantly },
    );
    expect(result).toEqual({ value: "landing", attempts: 2 });
  });

  test("a read that finished on the old page, before a redirect landed, is not handed over", async () => {
    // The case the error never shows: the read succeeded, and the page moved on right after. With a
    // quiet pause the redirect is seen and the read is made again.
    const { page, navigate } = movingPage();
    let reads = 0;
    const result = await collectWhenSettled(
      page,
      async () => `read ${++reads}`,
      {
        quietMs: 250,
        sleep: async () => {
          // The redirect lands during the first pause only.
          if (reads === 1) navigate();
        },
      },
    );
    expect(result).toEqual({ value: "read 2", attempts: 2 });
  });

  test("a navigation counted while the read ran retries it even when the error is not Playwright's usual wording", async () => {
    const { page, navigate } = movingPage();
    let reads = 0;
    const result = await collectWhenSettled(
      page,
      async () => {
        reads += 1;
        if (reads === 1) {
          navigate();
          throw new Error("Protocol error (Runtime.callFunctionOn): gone");
        }
        return "settled";
      },
      { sleep: instantly },
    );
    expect(result.value).toBe("settled");
  });

  test("any other error comes straight through, unchanged, and is not retried", async () => {
    const { page } = movingPage();
    let reads = 0;
    const failure = new Error(
      "Local Chrome computer tools can access only web pages.",
    );
    await expect(
      collectWhenSettled(
        page,
        async () => {
          reads += 1;
          throw failure;
        },
        { sleep: instantly },
      ),
    ).rejects.toBe(failure);
    expect(reads).toBe(1);
  });

  test("a page that never stops navigating ends after the bound, in plain words, not as a missing element", async () => {
    const { page, navigate } = movingPage();
    let reads = 0;
    const attempt = collectWhenSettled(
      page,
      async () => {
        reads += 1;
        navigate();
        throw CONTEXT_GONE;
      },
      { sleep: instantly },
    );
    await expect(attempt).rejects.toBeInstanceOf(PageNotSettledError);
    expect(reads).toBe(SETTLE_ATTEMPTS);
    const error = await attempt.catch((caught) => caught as Error);
    expect(error.message).toContain("kept reloading or redirecting");
    // Neither of the sentences it used to be reported as.
    expect(error.message).not.toContain("element");
    expect(error.message).not.toContain("snapshot");
    expect(error.message).not.toContain("Timeout");
  });

  test("a read that keeps succeeding but keeps being followed by a navigation is refused too", async () => {
    const { page, navigate } = movingPage();
    let reads = 0;
    await expect(
      collectWhenSettled(page, async () => ++reads, {
        quietMs: 250,
        sleep: async () => navigate(),
      }),
    ).rejects.toBeInstanceOf(PageNotSettledError);
    expect(reads).toBe(SETTLE_ATTEMPTS);
  });

  test("the attempts are bounded by time as well: a page that has used the budget is not read again", async () => {
    const { page, navigate } = movingPage();
    let clock = 0;
    let reads = 0;
    await expect(
      collectWhenSettled(
        page,
        async () => {
          reads += 1;
          clock += 5_000;
          navigate();
          throw CONTEXT_GONE;
        },
        { budgetMs: 8_000, attempts: 10, now: () => clock, sleep: instantly },
      ),
    ).rejects.toBeInstanceOf(PageNotSettledError);
    // The first read always happens; the second starts with 3 s left; the third has none.
    expect(reads).toBe(2);
  });

  test("each attempt waits for a document that is still arriving, but never longer than the time left", async () => {
    const { page, navigate, loads } = movingPage();
    let clock = 0;
    let reads = 0;
    await collectWhenSettled(
      page,
      async () => {
        reads += 1;
        clock += 6_000;
        if (reads === 1) {
          navigate();
          throw CONTEXT_GONE;
        }
        return "ok";
      },
      {
        budgetMs: 8_000,
        loadWaitMs: 3_000,
        now: () => clock,
        sleep: instantly,
      },
    );
    expect(loads).toEqual([3_000, 2_000]);
  });

  test("a document that never finishes loading is read as it is: waiting for it is not an error", async () => {
    const { page } = movingPage();
    page.waitForLoadState = async () => {
      throw new Error("Timeout 3000ms exceeded.");
    };
    const result = await collectWhenSettled(page, async () => "as is", {
      sleep: instantly,
    });
    expect(result.value).toBe("as is");
  });

  test("a caller that went away is not read for", async () => {
    const { page } = movingPage();
    const controller = new AbortController();
    controller.abort();
    let reads = 0;
    await expect(
      collectWhenSettled(
        page,
        async () => {
          reads += 1;
          return "never";
        },
        { signal: controller.signal, sleep: instantly },
      ),
    ).rejects.toThrow("Stopped.");
    expect(reads).toBe(0);
  });

  test("its own watch stops listening when it ends, and one it was given is left to its owner", async () => {
    const own = movingPage();
    await collectWhenSettled(own.page, async () => 1, { sleep: instantly });
    expect(own.listenerCount()).toBe(0);

    const given = movingPage();
    const watch = watchNavigations(given.page);
    await collectWhenSettled(given.page, async () => 1, {
      watch,
      sleep: instantly,
    });
    expect(given.listenerCount()).toBe(1);
    watch.stop();
  });
});

describe("a page that swaps its own document without navigating", () => {
  function holdThatReports(...verdicts: boolean[]) {
    const holds: string[] = [];
    const queue = [...verdicts];
    return {
      holds,
      holdDocument: async (): Promise<DocumentHold> => {
        holds.push("held");
        return {
          intact: async () => queue.shift() ?? true,
          release: async () => {
            holds.push("released");
          },
        };
      },
    };
  }

  test("a read made before the swap is made again after it", async () => {
    const { page } = movingPage();
    const { holdDocument, holds } = holdThatReports(false, true);
    let reads = 0;
    const result = await collectWhenSettled(
      page,
      async () => `body ${++reads}`,
      {
        quietMs: 250,
        sleep: instantly,
        holdDocument,
      },
    );
    expect(result).toEqual({ value: "body 2", attempts: 2 });
    // Every hold is given back, including the one that found the document replaced.
    expect(holds).toEqual(["held", "released", "held", "released"]);
  });

  test("a page that only keeps swapping its body is still readable: the newest read comes back, not an error", async () => {
    const { page } = movingPage();
    const { holdDocument } = holdThatReports(false, false, false, false);
    let reads = 0;
    const result = await collectWhenSettled(
      page,
      async () => `body ${++reads}`,
      {
        quietMs: 250,
        sleep: instantly,
        holdDocument,
      },
    );
    expect(result).toEqual({
      value: `body ${SETTLE_ATTEMPTS}`,
      attempts: SETTLE_ATTEMPTS,
    });
  });

  test("but once it navigates, the newest swap-only read is gone with the page it described", async () => {
    const { page, navigate } = movingPage();
    // Intact is never asked on the navigating attempts: the navigation count answers first.
    const { holdDocument } = holdThatReports(false);
    let reads = 0;
    await expect(
      collectWhenSettled(page, async () => ++reads, {
        quietMs: 250,
        holdDocument,
        sleep: async () => {
          if (reads >= 2) navigate();
        },
      }),
    ).rejects.toBeInstanceOf(PageNotSettledError);
  });

  test("a document that cannot be held is read without the check", async () => {
    const { page } = movingPage();
    const result = await collectWhenSettled(page, async () => "plain", {
      quietMs: 250,
      sleep: instantly,
      holdDocument: async () => {
        throw new Error("Execution context was destroyed");
      },
    });
    expect(result).toEqual({ value: "plain", attempts: 1 });
  });
});

describe("what a page that was too slow is told", () => {
  test("names the seconds it waited and does not call it a missing element", () => {
    const message = pageLoadTimeoutMessage(30_000);
    expect(message).toContain("30 seconds");
    expect(message).toContain("did not finish loading");
    expect(message).not.toContain("element");
    expect(message).not.toContain("Timeout");
    expect(pageLoadTimeoutMessage(400)).toContain("within 1 second.");
  });
});
