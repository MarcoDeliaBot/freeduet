import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  saveUserPreferencesMutationOptions,
  useUserPreferences,
} from "@/lib/settings/message-list";
import { CATALOGS, type MessageId, SOURCE } from "./catalogs";
import {
  type AppLanguageChoice,
  type AppLanguageCode,
  isAppLanguageChoice,
  resolveAppLanguage,
} from "./languages";
import { readStoredChoice, storeChoice } from "./stored-choice";
import {
  createTranslator,
  formatDate,
  formatNumber,
  type MessageParams,
} from "./translate";

export type T = (id: MessageId, params?: MessageParams) => string;

type AppLanguageValue = {
  /** The language the app draws in now. */
  language: AppLanguageCode;
  /** What the person chose: a code, or "auto" for the browser's. */
  choice: AppLanguageChoice;
  t: T;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  /** Applied at once, with no reload, and saved with the person's other preferences. */
  setChoice: (choice: AppLanguageChoice) => void;
};

function valueFor(
  choice: AppLanguageChoice,
  browserLanguages: readonly string[],
  setChoice: (choice: AppLanguageChoice) => void,
): AppLanguageValue {
  const language = resolveAppLanguage(choice, browserLanguages);
  return {
    language,
    choice,
    t: createTranslator(SOURCE, CATALOGS, language),
    number: (value, options) => formatNumber(value, language, options),
    date: (value, options) => formatDate(value, language, options),
    setChoice,
  };
}

/** English with no provider above: a component drawn on its own, in a test or a story, reads English. */
const ENGLISH = valueFor("en", [], () => {});

/** The English translator, for a plain function that has no hook (a default the caller may replace). */
export const englishT: T = ENGLISH.t;
const AppLanguageContext = createContext<AppLanguageValue>(ENGLISH);

/** Fixes the language for what is below it. For tests, and for anywhere the language is already known. */
export function AppLanguageValue({
  language,
  children,
}: {
  language: AppLanguageChoice;
  children: ReactNode;
}) {
  const value = useMemo(
    () =>
      valueFor(
        language,
        typeof navigator === "undefined" ? [] : navigator.languages,
        () => {},
      ),
    [language],
  );
  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

/**
 * The language of the app's own words for the signed-in person (D181).
 *
 * The choice is read from this browser at first (so there is no flash of English), then from the
 * person's preferences on the server, which win once they arrive. With no choice, or "auto", the
 * browser's own list of languages decides (`navigator.languages`). A change applies at once, with no
 * reload, because every text below reads this context, and is saved to the server and to this browser.
 */
export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const preferences = useUserPreferences();
  const queryClient = useQueryClient();
  const save = useMutation(
    saveUserPreferencesMutationOptions(queryClient, preferences.userId),
  );
  const [choice, setChoiceState] = useState<AppLanguageChoice>(
    () => readStoredChoice() ?? "auto",
  );
  const served = preferences.data?.appLanguage;
  useEffect(() => {
    if (preferences.data === undefined) return;
    const next = isAppLanguageChoice(served) ? served : "auto";
    setChoiceState(next);
    storeChoice(next);
  }, [preferences.data, served]);
  const setChoice = useCallback(
    (next: AppLanguageChoice) => {
      setChoiceState(next);
      storeChoice(next);
      if (preferences.userId) save.mutate({ appLanguage: next });
    },
    [preferences.userId, save],
  );
  const value = useMemo(
    () =>
      valueFor(
        choice,
        typeof navigator === "undefined" ? [] : navigator.languages,
        setChoice,
      ),
    [choice, setChoice],
  );
  useEffect(() => {
    document.documentElement.lang = value.language;
  }, [value.language]);
  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

export function useAppLanguage(): AppLanguageValue {
  return useContext(AppLanguageContext);
}

/** The translator of the language the app draws in. */
export function useT(): T {
  return useContext(AppLanguageContext).t;
}
