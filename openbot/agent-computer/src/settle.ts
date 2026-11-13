/**
 * Reading a page that may still be moving.
 *
 * A page that redirects from a script, reloads itself or rewrites its whole document right after it
 * loads is the normal case on a travel site, a consent wall or a login hop, and it breaks a read in
 * two ways. The read can be cut in half by the navigation (Playwright answers "Execution context was
 * destroyed, most likely because of a navigation"), and it can finish cleanly on the page that was
 * about to go away, so the Bot is handed the copy of a page that is no longer there.
 *
 * Both are the same problem and have the same answer: read again. Reading is what is repeated and
 * nothing else. A click, a typed value or a navigation is never run twice here, which is the line
 * between retrying a copy of the page and acting on it twice. The callers hand over a read-only
 * closure, and anything with a side effect (raising a challenge, minting the generation) runs once,
 * after the page has settled.
 *
 * Bounded three ways, so a page that never stops moving ends as an answer rather than as a hang: a
 * number of attempts, a total time, and a wait for the document of each attempt. Inside the bounds
 * the answer is the page that finally held still. Outside them it is a refusal that says what
 * happened in plain words, and not a missing element, which it was before.
 *
 * Only a type import of Playwright, so the rules are tested without a browser (settle.test.ts).
 */
import type { Page } from "playwright";

/** How many times a read is attempted: the first, and up to three more after the page moved. */
export const SETTLE_ATTEMPTS = 4;

/**
 * The most time all the attempts may take together, apart from the navigation itself.
 *
 * A navigation is bounded by `NAVIGATION_TIMEOUT_MS` (30 s) and the server gives a call 45 s, so the
 * reading that follows has to fit in what is left. 8 s keeps the whole call under 40 s.
 */
export const SETTLE_BUDGET_MS = 8_000;

/** How long each attempt waits for a document that is still arriving before it reads what is there. */
export const SETTLE_LOAD_WAIT_MS = 3_000;

/**
 * How long a freshly navigated page is given to move on again after it was read.
 *
 * A script that redirects "right after load" does it within a frame or two of `DOMContentLoaded`,
 * which is when `goto` answers, so a read that took 5 ms can finish on the old page before the
 * redirect lands. A quarter of a second catches those. A redirect that fires later than that is a
 * second page, and the Bot reads it with the next call. Used by a navigation only: a read the Bot asks
 * for on a page that is already open does not pay it.
 */
export const SETTLE_QUIET_MS = 250;

/** The part of a page this module needs, so a test can stand one up without a browser. */
export type SettlePage = Pick<Page, "mainFrame" | "waitForLoadState"> & {
  on(event: "framenavigated", listener: (frame: unknown) => void): unknown;
  off(event: "framenavigated", listener: (frame: unknown) => void): unknown;
};

/** What a caller sees when the page never held still. Plain words: the page is the problem. */
export class PageNotSettledError extends Error {
  constructor(readonly attempts: number) {
    super(
      "The page kept reloading or redirecting while it was being read, so there was no steady page to copy. Try the address again in a moment, or open a more direct address.",
    );
    this.name = "PageNotSettledError";
  }
}

/** A navigation that does not finish in time, said as the page's fault and not as a missing element. */
export function pageLoadTimeoutMessage(timeoutMs: number): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `The page did not finish loading within ${seconds} ${seconds === 1 ? "second" : "seconds"}. Try the address again in a moment, or open a different page.`;
}

/**
 * Playwright's own wording for "the page changed under this call".
 *
 * Matched on text because Playwright raises these as plain errors with no code to test. The list is
 * the messages seen from a context that went away mid-call; a message that is not on it is still
 * treated as a race when a navigation was counted while the call ran (see `collectWhenSettled`).
 */
const NAVIGATION_RACE =
  /Execution context was destroyed|most likely because of a navigation|Cannot find context with specified id|frame (?:was |has been |got )?detached/i;

export function isNavigationRace(error: unknown): boolean {
  return error instanceof Error && NAVIGATION_RACE.test(error.message);
}

/**
 * A load that was cut off before it committed by a navigation the open page started for itself.
 *
 * Playwright names both addresses in this message, and an address carries a query string, so it is
 * not repeated to anybody: the caller is told what happened, in the words below.
 */
const INTERRUPTED_LOAD = /is interrupted by another navigation/i;

export function isInterruptedByAnotherNavigation(error: unknown): boolean {
  return error instanceof Error && INTERRUPTED_LOAD.test(error.message);
}

/**
 * What the caller is told when the page that was open moved on by itself while the new address was
 * loading. The new address never loaded, so nothing is read, and nothing is retried here: opening an
 * address again is the Bot's own decision, since the first request may already have reached the site.
 */
export const PAGE_MOVED_AWAY_MESSAGE =
  "The page that was open moved on by itself while the new address was loading, so the new address did not load. Try the address again.";

/** A load Playwright gave up on because the page, not the caller, started another one. */
const SUPERSEDED_LOAD = /net::ERR_ABORTED/i;

/**
 * Whether a `goto` that failed was cut short by the page moving on, and not by the address.
 *
 * `net::ERR_ABORTED` is also what a download, a blocked frame and a refused request look like, and
 * calling those a success would hand the Bot the page it was already on. So the error alone is not
 * enough: the page must also have committed a navigation of its own while the load was awaited
 * (`committed`, from {@link watchNavigations}). A load that was aborted with nothing committed is
 * the address failing, and stays an error.
 */
export function pageMovedOn(error: unknown, committed: number): boolean {
  return (
    committed > 0 &&
    error instanceof Error &&
    SUPERSEDED_LOAD.test(error.message)
  );
}

/** A count of the navigations the page's main frame has committed since the watch began. */
export type NavigationWatch = {
  count(): number;
  stop(): void;
};

export function watchNavigations(page: SettlePage): NavigationWatch {
  const main = page.mainFrame();
  let committed = 0;
  const onNavigated = (frame: unknown) => {
    if (frame === main) committed += 1;
  };
  page.on("framenavigated", onNavigated);
  return {
    count: () => committed,
    stop: () => {
      page.off("framenavigated", onNavigated);
    },
  };
}

/**
 * A hold on the page's document as it was when a read began, to tell afterwards whether it was
 * replaced.
 *
 * A site that swaps its whole body once its script has run does not navigate, so `framenavigated`
 * never says so, and a read that finished before the swap describes a page that has already gone.
 * `intact` answers whether the document the read was made on is still the one on screen.
 */
export type DocumentHold = {
  intact(): Promise<boolean>;
  release(): Promise<void>;
};

export type SettleOptions = {
  attempts?: number;
  budgetMs?: number;
  loadWaitMs?: number;
  /** A pause after a successful read in which the page may still move on. Zero for an open page. */
  quietMs?: number;
  /** The caller going away. Checked between attempts: a read already running is not interrupted. */
  signal?: AbortSignal;
  /** A watch the caller already holds, for example one that also covered the navigation. */
  watch?: NavigationWatch;
  /**
   * Takes a hold on the document before each read, checked after the quiet pause. Without one only
   * navigations count as the page moving.
   */
  holdDocument?: () => Promise<DocumentHold>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Run a read-only collection until the page holds still around it.
 *
 * An attempt counts when no navigation was committed while it ran, the document it read was not
 * replaced, and the page then stayed quiet for `quietMs`. A read that threw is retried when the page
 * moved during it or the error is Playwright's wording for that; any other error is the caller's to
 * see, immediately and unchanged.
 *
 * Two kinds of moving are told apart, because they deserve different answers. A page that keeps
 * navigating has no copy worth handing over, so it ends in a refusal. A page that only keeps
 * replacing its own document is alive and readable: when the attempts run out the newest read is
 * returned, because an error would take away a page that works.
 */
export async function collectWhenSettled<T>(
  page: SettlePage,
  collect: () => Promise<T>,
  options: SettleOptions = {},
): Promise<{ value: T; attempts: number }> {
  const attempts = options.attempts ?? SETTLE_ATTEMPTS;
  const budgetMs = options.budgetMs ?? SETTLE_BUDGET_MS;
  const loadWaitMs = options.loadWaitMs ?? SETTLE_LOAD_WAIT_MS;
  const quietMs = options.quietMs ?? 0;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? pause;
  const deadline = now() + budgetMs;
  const watch = options.watch ?? watchNavigations(page);
  // The newest read of a page that was navigating no more but kept swapping its document.
  let newest: { value: T; attempts: number } | undefined;
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (options.signal?.aborted) throw new Error("Stopped.");
      // The first attempt always runs. A later one needs time left, or the bound is only on paper.
      const left = deadline - now();
      if (attempt > 1 && left <= 0) break;
      // A document that is still arriving is waited for, bounded; one that has arrived answers at
      // once. A page that never finishes loading is read as it is: the wait is not an error.
      await page
        .waitForLoadState("domcontentloaded", {
          timeout: Math.max(1, Math.min(loadWaitMs, left)),
        })
        .catch(() => undefined);
      const before = watch.count();
      // Not being able to hold the document is not a reason to refuse the read.
      const hold = await options.holdDocument?.().catch(() => undefined);
      try {
        const value = await collect();
        if (quietMs > 0) await sleep(quietMs);
        if (watch.count() !== before) {
          newest = undefined;
        } else if (hold && !(await hold.intact().catch(() => false))) {
          newest = { value, attempts: attempt };
        } else {
          return { value, attempts: attempt };
        }
      } catch (error) {
        const moved = watch.count() !== before;
        if (!moved && !isNavigationRace(error)) throw error;
        newest = undefined;
      } finally {
        await hold?.release().catch(() => undefined);
      }
    }
    if (newest) return newest;
    throw new PageNotSettledError(attempts);
  } finally {
    if (!options.watch) watch.stop();
  }
}
