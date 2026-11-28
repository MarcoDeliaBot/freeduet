/**
 * The Tokens section of the Engines page (D102): its sentences and its number formats. Pure, so each is tested on its own.
 *
 * The numbers are what each engine itself reported for each turn (agent-freeduet's usage_counter.py). An engine that reported
 * nothing is "not reported", never zero and never a guess. Days are UTC, as the server counts them.
 */

import { timeLocale } from "./engines-text";
import type { MessageId } from "./i18n/catalogs";
import { englishT, type T } from "./i18n/provider";
import { formatDate, formatNumber } from "./i18n/translate";

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

export const TOKENS_TITLE = englishT("engines.tokens.title");
export const TOKENS_DESCRIPTION = englishT("engines.tokens.description");
export const TOKENS_FALLBACK = englishT("engines.tokens.fallback");
export const TOKENS_EMPTY = englishT("engines.tokens.empty");
export const TOKENS_UNAVAILABLE = englishT("engines.tokens.unavailable");
export const TOKENS_PROBLEM = englishT("engines.tokens.problem");
export const NOT_REPORTED = englishT("engines.tokens.notReported");
export const NOTHING = "—";
export const TOKENS_COLUMNS = {
  member: englishT("engines.members.col.member"),
  engine: englishT("engines.tokens.col.engine"),
  today: englishT("engines.today"),
  week: englishT("engines.tokens.col.week"),
} as const;
export const TOKENS_ALL_ENGINES = englishT("engines.tokens.allMembers");
export const TOKENS_NOTE = englishT("engines.tokens.note");

/** A space that does not break, so "in · out" never wraps with "out" alone on the next line. */
const NBSP = " ";

/**
 * D126. The reference for "what these tokens would have cost on a paid model": ONE declared model and its public list price,
 * and a fixed exchange rate. Nothing is fetched: change these constants (and the design doc, docs/design/token-counter.md,
 * section 6) when a price or the rate changes. The price is a list price per million tokens, not what any engine charged.
 */
export const REFERENCE_MODEL = "Claude Sonnet 5.5";
export const REFERENCE_INPUT_USD_PER_MILLION = 2;
export const REFERENCE_OUTPUT_USD_PER_MILLION = 10;
export const REFERENCE_PRICE_DATE = "21 Nov 2026";
/** The same two dates as calendar days, so each language writes them its own way. */
const REFERENCE_PRICE_DAY = "2026-11-21";
const USD_PER_EUR_DAY = "2026-11-17";
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
  week: englishT("engines.tokens.savedWeek"),
  today: englishT("engines.today"),
} as const;
export const SAVED_NOTE = englishT("engines.tokens.savedNote");
export const CURRENCY_HELP = englishT("engines.tokens.currencyHelp");

/** A calendar day in the language's own way ("21 Nov 2026" in English), in UTC so it never moves with the time zone. */
function dayText(day: string, language: string): string {
  return formatDate(new Date(`${day}T00:00:00Z`), timeLocale(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** An amount of money with its symbol, without a fixed number of decimals. */
function priceText(
  amount: number,
  currency: "EUR" | "USD",
  language: string,
): string {
  return formatNumber(amount, language, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/** The reference under the saved line, in small text. */
export function referenceLine(t: T = englishT, language = "en"): string {
  return t("engines.tokens.reference", {
    model: REFERENCE_MODEL,
    input: priceText(REFERENCE_INPUT_USD_PER_MILLION, "USD", language),
    output: priceText(REFERENCE_OUTPUT_USD_PER_MILLION, "USD", language),
    date: dayText(REFERENCE_PRICE_DAY, language),
    euro: priceText(1, "EUR", language),
    rate: priceText(USD_PER_EUR, "USD", language),
    rateDate: dayText(USD_PER_EUR_DAY, language),
  });
}

/** "18 min", "2 h 05 min", "under 1 min"; null for no time. Whole minutes, rounded, so it never reads "60 min". */
export function formatDuration(
  seconds: number,
  t: T = englishT,
): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t("engines.dur.under");
  if (minutes < 60) return t("engines.dur.min", { minutes });
  return t("engines.dur.hourMin", {
    hours: Math.floor(minutes / 60),
    minutes: String(minutes % 60).padStart(2, "0"),
  });
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
export function formatMoney(
  usd: number,
  currency: Currency,
  t: T = englishT,
  language = "en",
): string {
  const code = currency === "eur" ? "EUR" : "USD";
  const amount = currency === "eur" ? usd / USD_PER_EUR : usd;
  const money = (value: number) =>
    formatNumber(value, language, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (amount > 0 && amount < 0.005)
    return t("engines.tokens.under", { amount: money(0.01) });
  return money(amount);
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
export function savedTokensText(
  saved: Saved,
  t: T = englishT,
  language = "en",
): string | null {
  const total = saved.inputTokens + saved.outputTokens;
  return total > 0
    ? t("engines.tokens.amount", { amount: compactTokens(total, language) })
    : null;
}

/** "plus 40 min on your own GPU, tokens not reported" (and the same for a free cloud engine), or null. */
export function savedTimeText(saved: Saved, t: T = englishT): string | null {
  const parts: string[] = [];
  const local = formatDuration(saved.localUnreportedSeconds, t);
  if (local) parts.push(t("engines.tokens.timeLocal", { time: local }));
  const cloud = formatDuration(saved.cloudUnreportedSeconds, t);
  if (cloud) parts.push(t("engines.tokens.timeCloud", { time: cloud }));
  return parts.length > 0
    ? t("engines.tokens.timeTail", {
        parts: parts.join(t("engines.tokens.and")),
      })
    : null;
}

/** 1234 -> "1.2k", 1500000 -> "1.5M"; below a thousand the plain number. The decimal mark follows the language. */
export function compactTokens(value: number, language = "en"): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${trim(value / 1_000, language)}k`;
  return `${trim(value / 1_000_000, language)}M`;
}

function trim(value: number, language: string): string {
  const digits = value >= 100 ? 0 : 1;
  return formatNumber(Number(value.toFixed(digits)), language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

/** The cell for one period: a dash for no turn, "not reported" when none carried a count, else in and out. */
export function tokensCell(
  counts: TokenCounts,
  t: T = englishT,
  language = "en",
): {
  text: string;
  note: string | null;
  time: string | null;
} {
  if (counts.turns === 0) return { text: NOTHING, note: null, time: null };
  const time = formatDuration(counts.seconds, t);
  const notReported = t("engines.tokens.notReported");
  // "not reported" keeps its time on the same line: "not reported · 12 min".
  if (counts.reportedTurns === 0)
    return {
      text: time
        ? `${notReported.replace(/ /g, NBSP)}${NBSP}·${NBSP}${time.replace(/ /g, NBSP)}`
        : notReported,
      note: null,
      time: null,
    };
  // "in · out" stays together on one line: the spaces do not break.
  const text = t("engines.tokens.cell", {
    input: compactTokens(counts.inputTokens, language),
    output: compactTokens(counts.outputTokens, language),
  });
  const partial =
    counts.reportedTurns < counts.turns
      ? t("engines.tokens.partial", {
          reported: counts.reportedTurns,
          total: counts.turns,
        })
      : null;
  return { text, note: partial, time };
}

// ── D134: the breakdown and the daily chart ───────────────────────────────────────────────────────────────────

export type Breakdown = "source" | "member";
export type Metric = "tokens" | "time";

const BREAKDOWN_IDS: Record<Breakdown, MessageId> = {
  source: "engines.usage.bySource",
  member: "engines.usage.byMember",
};
const METRIC_IDS: Record<Metric, MessageId> = {
  tokens: "engines.tokens.title",
  time: "engines.usage.time",
};
/** The words for each choice in the app's language; the values are what the page keeps. */
export const breakdownLabels = (
  t: T = englishT,
): Record<Breakdown, string> => ({
  source: t(BREAKDOWN_IDS.source),
  member: t(BREAKDOWN_IDS.member),
});
export const metricLabels = (t: T = englishT): Record<Metric, string> => ({
  tokens: t(METRIC_IDS.tokens),
  time: t(METRIC_IDS.time),
});
export const BREAKDOWN_LABELS: Record<Breakdown, string> = breakdownLabels();
export const METRIC_LABELS: Record<Metric, string> = metricLabels();
export const SOURCE_ORDER: readonly TokenSource[] = [
  "person",
  "routine",
  "handoff",
  "other",
  "unknown",
];
const SOURCE_IDS: Record<TokenSource, MessageId> = {
  person: "engines.usage.source.person",
  routine: "engines.usage.source.routine",
  handoff: "engines.usage.source.handoff",
  other: "engines.usage.source.other",
  unknown: "engines.usage.source.unknown",
};
export const sourceLabels = (t: T = englishT): Record<TokenSource, string> => ({
  person: t(SOURCE_IDS.person),
  routine: t(SOURCE_IDS.routine),
  handoff: t(SOURCE_IDS.handoff),
  other: t(SOURCE_IDS.other),
  unknown: t(SOURCE_IDS.unknown),
});
export const SOURCE_LABELS: Record<TokenSource, string> = sourceLabels();
export const USAGE_TITLE = englishT("engines.usage.title");
export const USAGE_NOTE = englishT("engines.usage.note");
export const USAGE_NOTHING = englishT("engines.usage.nothing");
export const CHARTS_FAILED = englishT("engines.usage.chartsFailed");
export const REST_MEMBERS = englishT("engines.usage.restMembers");
export const REST_KEY = "~rest";
/** Said where a weekly gauge would be: the subscription does not tell FreeDuet its limit, so no percentage is shown. */
export const LIMIT_TITLE = englishT("engines.usage.limitTitle");
export const LIMIT_NONE = englishT("engines.usage.limitNone");
export const LIMIT_NOTE = englishT("engines.usage.limitNote");
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
  t: T = englishT,
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
      ? t("engines.usage.restMembers")
      : breakdown === "source"
        ? t(SOURCE_IDS[key as TokenSource])
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
export function percentText(
  share: number,
  t: T = englishT,
  language = "en",
): string {
  const percent = (value: number, digits: number) =>
    `${formatNumber(value, language, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
      useGrouping: false,
    })}%`;
  if (!(share > 0)) return "0%";
  if (share < 0.1)
    return t("engines.tokens.under", { amount: percent(0.1, 1) });
  if (share < 10) return percent(Number(share.toFixed(1)), 1);
  return percent(Math.round(share), 0);
}

/** The value of one part, in the unit of the metric: "1.2M tokens" or "3 h 20 min". */
export function metricText(
  value: number,
  metric: Metric,
  t: T = englishT,
  language = "en",
): string {
  if (metric === "tokens")
    return t("engines.tokens.amount", {
      amount: compactTokens(value, language),
    });
  return formatDuration(value, t) ?? t("engines.dur.min", { minutes: 0 });
}

/** "Sat 21" for a UTC day, and "Today" for the last one. A day that is not a date is shown as it is. */
export function dayLabel(
  day: string,
  isToday: boolean,
  t: T = englishT,
  language = "en",
): string {
  if (isToday) return t("engines.today");
  const moment = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(moment.getTime())) return day;
  return formatDate(moment, timeLocale(language), {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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
