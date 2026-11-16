import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { approvalInboxOptions } from "@/lib/approvals";
import { useCardLanguage } from "./use-card-text";

/**
 * The language an APPROVAL CARD is drawn in (docs/M1_PLAN.md D50): what a person reads in order to
 * approve or refuse is in the language they read, and the rest of the app stays English.
 *
 * The server says which: the approvals inbox carries `language`, the person's own choice
 * (`users.preferences.freeduetLanguage`) else the deployment's `FREEDUET_PERSON_LANGUAGE`, and nothing
 * when neither is set. Read from the inbox the app already holds, so a card never waits on a second
 * request; until it answers, the card language the capabilities gave (D26) is used, then English.
 *
 * Null is English, and so is what a card reads with no provider above it (a test, a story).
 */
const ApprovalLanguageContext = createContext<string | null>(null);

/** Gives the cards below a language, or none (English). For tests and anywhere it is already known. */
export function ApprovalLanguageValue({
  children,
  language,
}: {
  children: ReactNode;
  language: string | null;
}) {
  return (
    <ApprovalLanguageContext.Provider value={language}>
      {children}
    </ApprovalLanguageContext.Provider>
  );
}

/** The language of the signed-in person's approval cards, from the inbox the app already reads. */
export function ApprovalLanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data } = useQuery(approvalInboxOptions());
  const card = useCardLanguage();
  return (
    <ApprovalLanguageValue language={data?.language ?? card ?? null}>
      {children}
    </ApprovalLanguageValue>
  );
}

/** The two-letter code the approval card below draws in, or null for English. */
export function useApprovalLanguage(): string | null {
  return useContext(ApprovalLanguageContext);
}
