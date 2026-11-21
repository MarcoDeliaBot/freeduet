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
  /** D126: wall-clock seconds of the attempts, measured by the service; there even when no tokens were reported. */
  seconds: number;
};

/** D126: what an engine is. Only `free_cloud` and `local` count as saved. */
export type TokenClass = "free_cloud" | "local" | "login" | "metered" | "other";

export type TokenRow = {
  member: string | null;
  engine: string;
  class: TokenClass;
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
  "Input counts every token the model was given, cached ones included. Each row counts engine attempts: a retry on the same engine counts again. An attempt whose engine reported nothing adds its time and no tokens. Time is measured here, from the start to the end of each attempt.";

/** A space that does not break, so "in · out" never wraps with "out" alone on the next line. */
const NBSP = "\u00a0";

/**
 * D126. The reference for "what these tokens would have cost on a paid model": ONE declared model and its public list price,
 * and a fixed exchange rate. Nothing is fetched: change these constants (and the design doc, docs/design/token-counter.md,
 * section 6) when a price or the rate changes. The price is a list price per million tokens, not what any engine charged.
 */
export const REFERENCE_MODEL = "Claude Sonnet 5.5";
export const REFERENCE_INPUT_USD_PER_MILLION = 2;
export const REFERENCE_OUTPUT_USD_PER_MILLION = 10;
export const REFERENCE_PRICE_DATE = "21 Nov 2026";
export const REFERENCE_PRICE_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/pricing";
/** How many US dollars one euro bought: the ECB euro reference rate of 17 November 2026 (as published by the Banca d'Italia). */
export const USD_PER_EUR = 1.0989;
export const USD_PER_EUR_DATE = "17 Nov 2026";
export const USD_PER_EUR_SOURCE =
  "https://www.bancaditalia.it/compiti/operazioni-cambi/cambio/cambi_rif_20261117";

export type Currency = "eur" | "usd";
export const DEFAULT_CURRENCY: Currency = "eur";
export const CURRENCY_STORAGE_KEY = "freeduet.tokens.currency";

export const SAVED_LABELS = {
  week: "Saved in the last 7 days",
  today: "Today",
} as const;
export const SAVED_NOTE =
  "Saved means tokens that went through free engines, in the cloud or on your own computer. Your Claude Code subscription is a flat rate and paid engines cost money, so neither counts.";
export const CURRENCY_HELP =
  "Click an amount to switch between euros and dollars.";

/** The reference under the saved line, in small text. */
export function referenceLine(): string {
  return `At ${REFERENCE_MODEL} list prices ($${REFERENCE_INPUT_USD_PER_MILLION} in, $${REFERENCE_OUTPUT_USD_PER_MILLION} out per million tokens, ${REFERENCE_PRICE_DATE}); €1 = $${USD_PER_EUR} (${USD_PER_EUR_DATE}).`;
}

/** "18 min", "2 h 05 min", "under 1 min"; null for no time. Whole minutes, rounded, so it never reads "60 min". */
export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** What the tokens would have cost at the reference list price, in US dollars. */
export function listPriceUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * REFERENCE_INPUT_USD_PER_MILLION +
    (outputTokens / 1_000_000) * REFERENCE_OUTPUT_USD_PER_MILLION
  );
}

/** "€3.40" or "$3.72"; "under €0.01" for a positive amount below a cent, "€0.00" for none. */
export function formatMoney(usd: number, currency: Currency): string {
  const symbol = currency === "eur" ? "€" : "$";
  const amount = currency === "eur" ? usd / USD_PER_EUR : usd;
  if (amount > 0 && amount < 0.005) return `under ${symbol}0.01`;
  return `${symbol}${amount.toFixed(2)}`;
}

export type Saved = {
  inputTokens: number;
  outputTokens: number;
  /** Seconds on free engines that reported no tokens at all: shown as time, never turned into tokens. */
  localUnreportedSeconds: number;
  cloudUnreportedSeconds: number;
};

/** D126. The tokens that went through free engines (free cloud and local), from the member rows of one period. A subscription and a
 * metered engine add nothing. A free engine row that reported no tokens adds its time, not tokens. */
export function savedFor(rows: TokenRow[], period: "today" | "week"): Saved {
  const saved: Saved = {
    inputTokens: 0,
    outputTokens: 0,
    localUnreportedSeconds: 0,
    cloudUnreportedSeconds: 0,
  };
  for (const row of rows) {
    if (row.class !== "free_cloud" && row.class !== "local") continue;
    const counts = row[period];
    saved.inputTokens += counts.inputTokens;
    saved.outputTokens += counts.outputTokens;
    if (counts.turns > 0 && counts.reportedTurns === 0) {
      if (row.class === "local") saved.localUnreportedSeconds += counts.seconds;
      else saved.cloudUnreportedSeconds += counts.seconds;
    }
  }
  return saved;
}

/** "1.2M tokens", or null when nothing was saved in tokens. */
export function savedTokensText(saved: Saved): string | null {
  const total = saved.inputTokens + saved.outputTokens;
  return total > 0 ? `${compactTokens(total)} tokens` : null;
}

/** "plus 40 min on your own GPU, tokens not reported" (and the same for a free cloud engine), or null. */
export function savedTimeText(saved: Saved): string | null {
  const parts: string[] = [];
  const local = formatDuration(saved.localUnreportedSeconds);
  if (local) parts.push(`${local} on your own GPU`);
  const cloud = formatDuration(saved.cloudUnreportedSeconds);
  if (cloud) parts.push(`${cloud} on a free cloud engine`);
  return parts.length > 0
    ? `${parts.join(" and ")}, tokens not reported`
    : null;
}

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
  time: string | null;
} {
  if (counts.turns === 0) return { text: NOTHING, note: null, time: null };
  const time = formatDuration(counts.seconds);
  // "not reported" keeps its time on the same line: "not reported · 12 min".
  if (counts.reportedTurns === 0)
    return {
      text: time
        ? `${NOT_REPORTED}${NBSP}·${NBSP}${time.replace(/ /g, NBSP)}`
        : NOT_REPORTED,
      note: null,
      time: null,
    };
  // "in · out" stays together on one line: the spaces do not break.
  const text = `${compactTokens(counts.inputTokens)}${NBSP}in${NBSP}·${NBSP}${compactTokens(counts.outputTokens)}${NBSP}out`;
  const partial =
    counts.reportedTurns < counts.turns
      ? `${counts.reportedTurns} of ${counts.turns} attempts reported`
      : null;
  return { text, note: partial, time };
}
