import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import {
  type CardLanguage,
  type CardText,
  cardLanguageOf,
  cardTextIn,
} from "./cards";
import { readStoredLanguage, storeLanguage } from "./stored-language";

/**
 * The language the cards draw in, for everything below it (docs/M1_PLAN.md D26 amendment).
 *
 * Null is today's English. It is also what a card reads with no provider above it, so a card drawn
 * on its own, in a test or a story, needs nothing set up and keeps its English text.
 */
const CardLanguageContext = createContext<CardLanguage | null>(null);

/** Gives the cards below a language, or none. For tests and for anywhere the language is already known. */
export function CardLanguageProvider({
  language,
  children,
}: {
  language: CardLanguage | null;
  children: ReactNode;
}) {
  return (
    <CardLanguageContext.Provider value={language}>
      {children}
    </CardLanguageContext.Provider>
  );
}

/**
 * The deployment's language for the cards, read from the server's own answer.
 *
 * `/api/capabilities` carries `personLanguage` when `FREEDUET_PERSON_LANGUAGE` is set (the server
 * validated it at start). It is the server's answer and not the browser's setting on purpose: the
 * person who reads Italian may well use a browser, or a borrowed one, in English, and the members
 * already write in the setting's language. The answer cannot change without the server restarting,
 * so the query is read once (`staleTime: Infinity`) and shared with every other reader of it.
 *
 * UNTIL THE ANSWER COMES, THE LAST ONE. The first paint draws with the code the server gave last
 * time, kept in this browser (`./stored-language.ts`), so a person who reads Italian does not see a
 * card in English and then redrawn. The answer always wins from the moment it arrives, and it
 * replaces the kept code, or removes it when the server sends none (the setting was taken off). A
 * request that fails is not an answer: the kept code stays, and with none kept the cards are
 * English, as they were.
 */
export function PersonLanguageProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery(deploymentCapabilitiesQueryOptions());
  // Read once, when the provider mounts: it is only for the first paint.
  const [remembered] = useState(readStoredLanguage);
  const answered = data !== undefined;
  const served = data?.personLanguage;
  useEffect(() => {
    if (answered) storeLanguage(served ?? null);
  }, [answered, served]);
  return (
    <CardLanguageProvider
      language={cardLanguageOf(answered ? served : remembered)}
    >
      {children}
    </CardLanguageProvider>
  );
}

/** The language the card below draws in: null for English. */
export function useCardLanguage(): CardLanguage | null {
  return useContext(CardLanguageContext);
}

/** `cardText` bound to the language the card draws in. */
export function useCardText(): CardText {
  const language = useCardLanguage();
  return useMemo(() => cardTextIn(language), [language]);
}
