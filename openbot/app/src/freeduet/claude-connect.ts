/**
 * "Connect your Claude plan", the words and the reading of answers (docs/design/first-start.md sections 4 and 5, slice S5
 * in its option-(b) form, decision D1). Pure: no React and no request, so each sentence is tested on its own.
 *
 * Nothing here handles a code. The person signs in on Claude's own page in a terminal of their own; FreeDuet shows the
 * command to copy and asks the server to look again (`POST /api/freeduet/engines/claude/check`), which answers whether
 * Claude is installed and signed in and nothing else.
 */

import type { MessageId } from "@/freeduet/i18n/catalogs";
import { englishT, type T } from "@/freeduet/i18n/provider";

/** What the failed turn's sentence says about Claude: not connected, not installed, or neither (null). */
export type ClaudeProblem = "not_connected" | "not_installed";

// The two sentences agent-freeduet gives a run that cannot start (agent-freeduet/freeduet/claude_status.py). Matched by
// their first words, which are the part a person reads first; the rest of a sentence may change without this moving.
const NOT_CONNECTED = "Claude is not connected yet.";
const NOT_INSTALLED = "Claude is not installed on this computer yet.";

export function claudeProblemOf(reason: string): ClaudeProblem | null {
  const text = reason.trim();
  if (text.startsWith(NOT_CONNECTED)) return "not_connected";
  if (text.startsWith(NOT_INSTALLED)) return "not_installed";
  return null;
}

/** The commands the person copies. They run on the computer FreeDuet runs on, from the `openbot` folder. */
export const SIGN_IN_COMMAND =
  "cd openbot && docker compose exec -it agent-freeduet claude";
export const REBUILD_COMMAND = "bash scripts/start.sh";

export const CARD_WORDS = {
  not_connected: {
    title: "Claude is not connected yet",
    body: "You sign in on Claude's own page; FreeDuet never sees your password. Run this once in a terminal on the computer FreeDuet runs on, sign in there, then press Check again.",
    command: SIGN_IN_COMMAND,
  },
  not_installed: {
    title: "Claude is not installed on this computer yet",
    body: "Rebuild the service in a terminal on the computer FreeDuet runs on, then press Check again.",
    command: REBUILD_COMMAND,
  },
} as const;

/** The card's words in the app's language; `CARD_WORDS` is the same text in English. */
export function cardWordsOf(problem: ClaudeProblem, t: T = englishT) {
  const base = CARD_WORDS[problem];
  return {
    title: t(
      problem === "not_connected"
        ? "claude.notConnected.title"
        : "claude.notInstalled.title",
    ),
    body: t(
      problem === "not_connected"
        ? "claude.notConnected.body"
        : "claude.notInstalled.body",
    ),
    command: base.command,
  };
}

export type CheckAnswer = {
  reason: "off" | "not_set_up" | "unreachable" | null;
  installed: boolean | null;
  signedIn: boolean | null;
};

export type CheckOutcome =
  | "connected"
  | "not_connected"
  | "not_installed"
  | "waiting"
  | "elsewhere"
  | "hosted"
  | "no_engine";

/** The answer of the check, or the status of a refused press, as one outcome. */
export function checkOutcome(
  status: number,
  body: Partial<CheckAnswer> | null,
): CheckOutcome {
  if (status === 404) return "hosted";
  if (status === 403) return "elsewhere";
  if (status !== 200 || !body) return "no_engine";
  if (body.reason) return "no_engine";
  if (body.installed === false) return "not_installed";
  if (body.signedIn === true) return "connected";
  if (body.signedIn === false) return "not_connected";
  return "waiting";
}

const OUTCOME_IDS: Record<CheckOutcome, MessageId> = {
  connected: "claude.outcome.connected",
  not_connected: "claude.outcome.notConnected",
  not_installed: "claude.outcome.notInstalled",
  waiting: "claude.outcome.waiting",
  elsewhere: "claude.outcome.elsewhere",
  hosted: "claude.outcome.hosted",
  no_engine: "claude.outcome.noEngine",
};

/** The sentence after Check again, in the app's language; `OUTCOME_WORDS` is the same text in English. */
export function outcomeWordsOf(outcome: CheckOutcome, t: T = englishT): string {
  return t(OUTCOME_IDS[outcome]);
}

/**
 * The colour of the sentence after Check again (the maintainer, 16 November 2026): green when Claude is connected,
 * coral when it is not, grey while FreeDuet could not tell. The sentence stays: colour is never the only signal.
 * The coral is the one the wide approval card uses while it waits (D55): #c8402a on a light card (4.97:1) and
 * #f2907c on a dark one (7.33:1). The green is the existing status token, 5.4:1 and 9.8:1.
 */
export const OUTCOME_CORAL = "text-[#c8402a] dark:text-[#f2907c]";

export const OUTCOME_TONE: Record<CheckOutcome, string> = {
  connected: "text-duet-green",
  not_connected: OUTCOME_CORAL,
  not_installed: OUTCOME_CORAL,
  no_engine: OUTCOME_CORAL,
  elsewhere: OUTCOME_CORAL,
  hosted: OUTCOME_CORAL,
  waiting: "text-duet-ink-3",
};

export const OUTCOME_WORDS: Record<CheckOutcome, string> = {
  connected: "Claude is connected. Send your message again.",
  not_connected: "FreeDuet cannot see the sign-in yet.",
  not_installed: "Claude is still not installed on this computer.",
  waiting: "FreeDuet could not tell yet. Try again in a moment.",
  elsewhere: "Connecting Claude is done at the computer FreeDuet runs on.",
  hosted: "This FreeDuet does not connect a Claude plan.",
  no_engine: "FreeDuet's engine is not running.",
};
