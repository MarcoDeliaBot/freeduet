/**
 * One call at a time on a Bot's page, in the order the calls arrived.
 *
 * A Bot has one browser page, and every call that reads or acts on it assumes the page it sees is the
 * page the previous call left. Two calls running at once break that quietly: a snapshot that arrives
 * while a navigation is still loading describes the page that is about to go away and is stamped with
 * a generation the navigation then retires, and a click that arrives during one lands on whatever the
 * document has become. The model does this to itself more often than it seems to, because a call it
 * gave up on (a caller that stopped waiting, a retry after a failure) is still running when the next
 * one is made.
 *
 * So a call waits for the one before it. The wait is bounded, because a call that waits for ever is
 * the hang this exists to prevent: past the bound the caller is told, in plain words, that the Bot's
 * computer is still busy with an earlier call, which is true, and which is not what "could not be
 * reached" says about a computer that is working. A caller that goes away while it waits leaves the
 * line at once and never takes a turn it cannot use.
 *
 * A person taking the wheel is not a turn. Their input and the live screen do not queue here, and a
 * waiting call checks the wheel only when its turn comes (index.ts), after the wait.
 *
 * Its own module with no browser in it, so the rules are tested directly (turns.test.ts).
 */

/**
 * The longest a call waits for the one ahead of it unless told otherwise.
 *
 * The server gives a call 45 s in all, and the longest thing ahead of a call is a navigation (30 s
 * to load, then at most 8 s of reading). 25 s is long enough for most of that and still leaves the
 * waiting call time to do its own work inside its 45 s, so a call that has to give up says so itself
 * instead of being cut off by the server's deadline with no explanation.
 */
export const DEFAULT_TURN_WAIT_MS = 25_000;

/** The wait ran out: the earlier call is still going. Not a fault of the computer. */
export class TurnBusyError extends Error {
  constructor(readonly waitedMs: number) {
    super(
      "This computer is still busy with an earlier action. Wait a moment and try again.",
    );
    this.name = "TurnBusyError";
  }
}

/** The caller went away while it waited. */
export class TurnAbandonedError extends Error {
  constructor() {
    super("Stopped.");
    this.name = "TurnAbandonedError";
  }
}

/**
 * The calls that wait for a turn: everything a Bot does that reads or acts on its page.
 *
 * Named by method and path, like the lists in authorisation.ts, so a route added later is outside the
 * line until somebody puts it here, which is the safe way round: the line only ever makes a call wait.
 * Left out on purpose: a person's input (`/human/*`) and the live screen, which are the person's and
 * must never queue behind the Bot; the screenshot, which Chromium takes beside a navigation without
 * harm; the shell and the workspace, which are not the page.
 */
const TURN_ROUTES = new Set([
  "POST /navigate",
  "POST /snapshot",
  "GET /read",
  "POST /click",
  "POST /type",
  "POST /key",
  "POST /scroll",
]);

export function takesATurn(method: string, pathname: string): boolean {
  return TURN_ROUTES.has(`${method} ${pathname}`);
}

export type Turn = {
  /** Hands the page to the next call. Safe to call twice. */
  release(): void;
  /** How long this call waited for its turn. Zero when nothing was ahead of it. */
  waitedMs: number;
};

export type TurnQueue = {
  enter(signal?: AbortSignal): Promise<Turn>;
  /** How many calls are waiting, not counting the one running. For a log line. */
  waiting(): number;
  /** Whether a call holds the page now. */
  busy(): boolean;
};

export type TurnQueueOptions = {
  /** The longest a call waits for its turn. */
  waitMs: number;
  now?: () => number;
};

export function createTurnQueue(options: TurnQueueOptions): TurnQueue {
  const now = options.now ?? Date.now;
  type Waiter = { grant(): void };
  let held = false;
  const line: Waiter[] = [];

  function turn(waitedMs: number): Turn {
    let released = false;
    return {
      waitedMs,
      release() {
        if (released) return;
        released = true;
        // Handed straight on, so the page is never free for a call that arrives in between to jump the line.
        const next = line.shift();
        if (next) next.grant();
        else held = false;
      },
    };
  }

  return {
    enter(signal) {
      if (signal?.aborted) return Promise.reject(new TurnAbandonedError());
      if (!held && line.length === 0) {
        held = true;
        return Promise.resolve(turn(0));
      }
      const started = now();
      return new Promise<Turn>((resolve, reject) => {
        const leave = () => {
          const at = line.indexOf(waiter);
          if (at >= 0) line.splice(at, 1);
        };
        const waiter: Waiter = {
          grant() {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(turn(now() - started));
          },
        };
        const timer = setTimeout(() => {
          leave();
          signal?.removeEventListener("abort", onAbort);
          reject(new TurnBusyError(now() - started));
        }, options.waitMs);
        // Housekeeping must never be the reason the process stays up.
        timer.unref?.();
        const onAbort = () => {
          clearTimeout(timer);
          leave();
          reject(new TurnAbandonedError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        line.push(waiter);
      });
    },
    waiting: () => line.length,
    busy: () => held,
  };
}
