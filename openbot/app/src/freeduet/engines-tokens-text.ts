/**
 * The Tokens section of the Engines page (D102): its sentences and its number formats. Pure, so each is tested on its own.
 *
 * The numbers are what each engine itself reported for each turn (agent-freeduet's usage_counter.py). An engine that reported
 * nothing is "not reported", never zero and never a guess. Days are UTC, as the server counts them.
 */

export type TokenCounts = {
  turns: number;
  reportedTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type TokenRow = {
  member: string | null;
  engine: string;
  today: TokenCounts;
  week: TokenCounts;
};

export type TokenUsage = {
  reason: "off" | "not_set_up" | "unreachable" | null;
  timezone: "UTC";
  windowDays: number;
  rows: TokenRow[];
  engines: TokenRow[];
  problem: boolean;
};

export const TOKENS_TITLE = "Tokens";
export const TOKENS_DESCRIPTION =
  "What each member used on each engine, as the engine itself reported it. Days are counted in UTC.";
export const TOKENS_FALLBACK = "The token counts could not be loaded.";
export const TOKENS_EMPTY = "No turn has been counted yet.";
export const TOKENS_UNAVAILABLE = "The token counts are not available now.";
export const TOKENS_PROBLEM =
  "The file that keeps the counts could not be read, so some numbers may be missing.";
export const NOT_REPORTED = "not reported";
export const NOTHING = "—";
export const TOKENS_COLUMNS = {
  member: "Member",
  engine: "Engine",
  today: "Today",
  week: "Last 7 days",
} as const;
export const TOKENS_ALL_ENGINES = "All members";
export const TOKENS_NOTE =
  "Input counts every token the model was given, cached ones included. A turn whose engine reported nothing is counted as a turn and not as tokens.";

/** 1234 -> "1.2k", 1500000 -> "1.5M"; below a thousand the plain number. */
export function compactTokens(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${trim(value / 1_000)}k`;
  return `${trim(value / 1_000_000)}M`;
}

function trim(value: number): string {
  const text = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return text.replace(/\.0$/, "");
}

/** The cell for one period: a dash for no turn, "not reported" when none carried a count, else in and out. */
export function tokensCell(counts: TokenCounts): {
  text: string;
  note: string | null;
} {
  if (counts.turns === 0) return { text: NOTHING, note: null };
  if (counts.reportedTurns === 0) return { text: NOT_REPORTED, note: null };
  const text = `${compactTokens(counts.inputTokens)} in · ${compactTokens(counts.outputTokens)} out`;
  const partial =
    counts.reportedTurns < counts.turns
      ? `${counts.reportedTurns} of ${counts.turns} turns reported`
      : null;
  return { text, note: partial };
}
