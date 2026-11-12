/**
 * The last language the server gave, kept in this browser for the first paint (docs/M1_PLAN.md D26
 * amendment).
 *
 * The language arrives from `/api/capabilities`, a request that has to finish before a card knows
 * it, so for a moment a card drew English and was then redrawn. What is kept here is only the
 * two-letter code the server last answered with, under one key, and the first paint draws with it
 * while the request is out. The server's answer always wins: `PersonLanguageProvider` replaces the
 * kept code with the answer, or removes it when the answer has none. Nothing about the person is
 * stored, and a value that is not two lowercase letters is never believed (the same check the
 * capabilities query makes on the way in).
 *
 * Every read and write is guarded: a browser that blocks storage (private windows, a policy, a full
 * quota) simply has nothing kept, and the page draws as it did before this existed.
 */
export const STORED_LANGUAGE_KEY = "freeduet.person-language";

/** The same check `deploymentCapabilitiesQueryOptions` makes on the server's answer. */
const LANGUAGE_CODE = /^[a-z]{2}$/;

/** The kept code, or null when none is kept, it is not two lowercase letters, or storage refuses. */
export function readStoredLanguage(): string | null {
  try {
    const value = window.localStorage.getItem(STORED_LANGUAGE_KEY);
    return typeof value === "string" && LANGUAGE_CODE.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Keeps `code` for the next first paint, or forgets the kept one for null (and for anything else). */
export function storeLanguage(code: string | null): void {
  try {
    if (typeof code === "string" && LANGUAGE_CODE.test(code))
      window.localStorage.setItem(STORED_LANGUAGE_KEY, code);
    else window.localStorage.removeItem(STORED_LANGUAGE_KEY);
  } catch {
    // Nothing kept: the next first paint is English until the server answers, as it always was.
  }
}
