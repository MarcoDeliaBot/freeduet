import { type AppLanguageChoice, isAppLanguageChoice } from "./languages";

/**
 * The app language the person chose, kept in this browser for the first paint (D181), the way
 * `person-language/stored-language.ts` keeps the cards' language. The server's copy
 * (`users.preferences.appLanguage`) wins as soon as it is read. Every access is guarded: a browser
 * that blocks storage has nothing kept and the app follows the browser's languages.
 */
export const STORED_APP_LANGUAGE_KEY = "freeduet.app-language";

export function readStoredChoice(): AppLanguageChoice | null {
  try {
    const value = window.localStorage.getItem(STORED_APP_LANGUAGE_KEY);
    return isAppLanguageChoice(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeChoice(choice: AppLanguageChoice | null): void {
  try {
    if (choice) window.localStorage.setItem(STORED_APP_LANGUAGE_KEY, choice);
    else window.localStorage.removeItem(STORED_APP_LANGUAGE_KEY);
  } catch {
    // Nothing kept: the first paint follows the browser, as it does for a new person.
  }
}
