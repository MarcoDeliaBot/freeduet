/**
 * Which browser engine a read-only page check runs in (D156).
 *
 * Pure, so the server's copy of the list and this one can be compared in a test without a browser.
 * A member's own browser is Chromium and stays so: `firefox` and `webkit` (the engine Safari uses) are
 * only for `computer_read_pages`, to see how a page reads in another engine.
 */
export const BROWSER_ENGINES = ["chromium", "firefox", "webkit"] as const;
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];
export type OtherEngine = Exclude<BrowserEngine, "chromium">;

export type EngineParse =
  | { ok: true; engine: BrowserEngine }
  | { ok: false; error: string };

/** The engine a request names. Absent means Chromium; anything not on the list is refused, never guessed. */
export function parseEngine(input: unknown): EngineParse {
  if (input === undefined || input === null)
    return { ok: true, engine: "chromium" };
  if (
    typeof input === "string" &&
    (BROWSER_ENGINES as readonly string[]).includes(input)
  )
    return { ok: true, engine: input as BrowserEngine };
  return {
    ok: false,
    error: `The engine is one of ${BROWSER_ENGINES.join(", ")}.`,
  };
}
