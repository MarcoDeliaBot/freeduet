/**
 * Reading a page for `computer_read_pages` (D127): the pure parts, so they are tested without a browser.
 *
 * The route in `index.ts` opens one address in the Bot's own tab, reads it the way `/navigate` does
 * (the same egress filter on the load, the same settle rules, the same text and link list) and returns
 * it cut to a limit the caller names. It acts on nothing in the page, and it never raises a request for
 * help: a page that asks for a human check is reported as not read, and the member is told to open it
 * with `computer_navigate`, where the person can be asked.
 */
import { classifyChallenge } from "./challenge";

/**
 * The most text one page gives back, links included. It is `computer_navigate`'s own limit, so a page
 * reads the same through either tool. The server asks for this or less and clamps what it gets back.
 */
export const READ_PAGE_TEXT_LIMIT = 6000;

/** The smallest limit that is worth a page load: under it a page is "not read", not a stub. */
export const READ_PAGE_MIN_LIMIT = 200;

export type ReadPageLimit =
  | { ok: true; limit: number }
  | { ok: false; error: string };

/** The limit the caller asked for: a whole number of characters, never above {@link READ_PAGE_TEXT_LIMIT}. */
export function parseReadPageLimit(input: unknown): ReadPageLimit {
  if (input === undefined) return { ok: true, limit: READ_PAGE_TEXT_LIMIT };
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < READ_PAGE_MIN_LIMIT
  ) {
    return {
      ok: false,
      error: `The limit is a whole number of characters, at least ${READ_PAGE_MIN_LIMIT}.`,
    };
  }
  return { ok: true, limit: Math.min(input, READ_PAGE_TEXT_LIMIT) };
}

/**
 * The sentence for a page that is a human check, or undefined when it is not one. Nothing is raised:
 * a handoff request opened from a batch would wait for the person on a page the member has moved past.
 */
export function challengeNotice(signal: {
  cfMitigated?: string | null;
  text: string;
  visibleChallengeControl: boolean;
}): string | undefined {
  if (!classifyChallenge(signal)) return undefined;
  return "This page asks for a human check, so it was not read. Open it with computer_navigate, which can ask the person to complete the check.";
}
