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

/** D134: where a run came from. `unknown` is what a day's total holds that no source accounts for (counted before sources were kept). */
export type TokenSource =
  | "person"
  | "routine"
  | "handoff"
  | "other"
  | "unknown";

/** D134: one UTC day of the last seven. */
export type TokenDay = {
  day: string;
  sources: Partial<Record<TokenSource, TokenCounts>>;
  members: Record<string, TokenCounts>;
};

export type TokenUsage = {
  reason: "off" | "not_set_up" | "unreachable" | null;
  timezone: "UTC";
  windowDays: number;
  rows: TokenRow[];
  engines: TokenRow[];
  /** D134: absent from a server that is older than the charts. */
  daily?: TokenDay[];
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

// ── D134: the breakdown and the daily chart ───────────────────────────────────────────────────────────────────

export type Breakdown = "source" | "member";
export type Metric = "tokens" | "time";

export const BREAKDOWN_LABELS: Record<Breakdown, string> = {
  source: "By source",
  member: "By member",
};
export const METRIC_LABELS: Record<Metric, string> = {
  tokens: "Tokens",
  time: "Time",
};
export const SOURCE_ORDER: readonly TokenSource[] = [
  "person",
  "routine",
  "handoff",
  "other",
  "unknown",
];
export const SOURCE_LABELS: Record<TokenSource, string> = {
  person: "You",
  routine: "Routines",
  handoff: "Between members",
  other: "Other",
  unknown: "Before sources were recorded",
};
export const USAGE_TITLE = "Where the last 7 days went";
export const USAGE_NOTE =
  'Shares are of the tokens the engines reported (input plus output); attempts that reported none add time only. "You" is your own messages, "Routines" is routines and check-ins, "Between members" is hand-offs, and "Other" is anything else, such as a deployment\'s own runs.';
export const USAGE_NOTHING = "Nothing was counted in the last 7 days.";
export const CHARTS_FAILED =
  "The usage charts could not be drawn. The table below is not affected.";
export const REST_MEMBERS = "Other members";
export const REST_KEY = "~rest";
/** Said where a weekly gauge would be: the subscription does not tell FreeDuet its limit, so no percentage is shown. */
export const LIMIT_TITLE = "Plan limits";
export const LIMIT_NONE = "No engine is held back by a limit right now.";
export const LIMIT_NOTE =
  "A percentage of your plan's weekly limit is not shown: the subscription does not report it to FreeDuet. An engine says so only when it has reached a limit, with the time it is expected back.";
const MAX_MEMBER_SERIES = 5;

export function metricValue(
  counts: TokenCounts | undefined,
  metric: Metric,
): number {
  if (!counts) return 0;
  return metric === "tokens"
    ? counts.inputTokens + counts.outputTokens
    : counts.seconds;
}

export type SeriesPart = {
  key: string;
  label: string;
  value: number;
  /** 0 to 100, of the whole week's total for this metric; 0 when the total is 0. */
  share: number;
};

export type UsageView = {
  keys: { key: string; label: string }[];
  total: number;
  parts: SeriesPart[];
  /** One entry per day, oldest first, with the value of each key. */
  days: { day: string; values: Record<string, number>; total: number }[];
};

/**
 * The week's breakdown and the daily series, for one way of splitting (by source or by member) and one metric. Pure: the same
 * keys, in the same order, are used by the bar, the legend and the chart, so a colour always means the same thing. By member,
 * the five busiest stay and the rest are one "Other members" part.
 */
export function usageView(
  daily: TokenDay[],
  breakdown: Breakdown,
  metric: Metric,
  memberName: (id: string) => string,
): UsageView {
  const perDay = daily.map((day) => {
    const values: Record<string, number> = {};
    const source = breakdown === "source" ? day.sources : day.members;
    for (const [key, counts] of Object.entries(source)) {
      const value = metricValue(counts, metric);
      if (value > 0) values[key] = value;
    }
    return { day: day.day, values };
  });
  const weekly = new Map<string, number>();
  for (const day of perDay)
    for (const [key, value] of Object.entries(day.values))
      weekly.set(key, (weekly.get(key) ?? 0) + value);
  let ordered: string[];
  if (breakdown === "source") {
    ordered = SOURCE_ORDER.filter((key) => weekly.has(key));
  } else {
    ordered = [...weekly.keys()].sort(
      (a, b) =>
        (weekly.get(b) ?? 0) - (weekly.get(a) ?? 0) || a.localeCompare(b),
    );
  }
  const kept =
    breakdown === "member" ? ordered.slice(0, MAX_MEMBER_SERIES) : ordered;
  const rest = breakdown === "member" ? ordered.slice(MAX_MEMBER_SERIES) : [];
  const days = perDay.map((day) => {
    const values: Record<string, number> = {};
    let restValue = 0;
    for (const [key, value] of Object.entries(day.values)) {
      if (kept.includes(key)) values[key] = value;
      else restValue += value;
    }
    if (restValue > 0) values[REST_KEY] = restValue;
    const total = Object.values(values).reduce((sum, v) => sum + v, 0);
    return { day: day.day, values, total };
  });
  const label = (key: string) =>
    key === REST_KEY
      ? REST_MEMBERS
      : breakdown === "source"
        ? SOURCE_LABELS[key as TokenSource]
        : memberName(key);
  const keys = [...kept, ...(rest.length > 0 ? [REST_KEY] : [])].map((key) => ({
    key,
    label: label(key),
  }));
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const parts = keys.map(({ key, label: text }) => {
    const value = days.reduce((sum, day) => sum + (day.values[key] ?? 0), 0);
    return {
      key,
      label: text,
      value,
      share: total > 0 ? (value / total) * 100 : 0,
    };
  });
  return { keys, total, parts, days };
}

/** "63%", "3.4%", "0.3%" and "under 0.1%": one decimal below ten, none from ten up. */
export function percentText(share: number): string {
  if (!(share > 0)) return "0%";
  if (share < 0.1) return "under 0.1%";
  if (share < 10) return `${share.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(share)}%`;
}

/** The value of one part, in the unit of the metric: "1.2M tokens" or "3 h 20 min". */
export function metricText(value: number, metric: Metric): string {
  if (metric === "tokens") return `${compactTokens(value)} tokens`;
  return formatDuration(value) ?? "0 min";
}

/** "Sat 21" for a UTC day, and "Today" for the last one. A day that is not a date is shown as it is. */
export function dayLabel(day: string, isToday: boolean): string {
  if (isToday) return "Today";
  const moment = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(moment.getTime())) return day;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(moment);
}

/** A round top for the chart's scale: 1, 2, 2.5 or 5 times a power of ten, never below 1. */
export function niceMax(value: number): number {
  if (!(value > 1)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
}
