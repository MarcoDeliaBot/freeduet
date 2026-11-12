import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import {
  type CardLanguage,
  type CardText,
  cardLanguageOf,
  cardTextIn,
} from "./cards";

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
 * so the query is read once (`staleTime: Infinity`) and shared with every other reader of it. Until
 * it arrives, and when it fails, the cards are English, as they were.
 */
export function PersonLanguageProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery(deploymentCapabilitiesQueryOptions());
  return (
    <CardLanguageProvider language={cardLanguageOf(data?.personLanguage)}>
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
