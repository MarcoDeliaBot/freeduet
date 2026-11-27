import { englishT, type T } from "@/freeduet/i18n/provider";

const RELATIVE_UNITS = [
  { limit: 60_000, divisor: 1_000, unit: "second" },
  { limit: 3_600_000, divisor: 60_000, unit: "minute" },
  { limit: 86_400_000, divisor: 3_600_000, unit: "hour" },
  { limit: 604_800_000, divisor: 86_400_000, unit: "day" },
  { limit: Number.POSITIVE_INFINITY, divisor: 604_800_000, unit: "week" },
] as const;

/** One formatter per language: the app's (D181), or the browser's when none is given. */
const formats = new Map<string | undefined, Intl.RelativeTimeFormat>();
function formatIn(language: string | undefined): Intl.RelativeTimeFormat {
  let format = formats.get(language);
  if (!format) {
    format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    formats.set(language, format);
  }
  return format;
}

/**
 * Locale-aware relative timestamp, e.g. "2 minutes ago", in the app's `language` (D181). Left out, the
 * browser's own, as it was before the app had a language of its own.
 */
export function relativeTime(iso: string, language?: string): string {
  const time = new Date(iso).getTime();
  // An invalid date used to flow into `Math.abs(NaN)` comparisons and `format(-NaN)`, which
  // answers "NaN weeks ago" or throws depending on ICU. Return the input unchanged instead.
  if (!Number.isFinite(time)) return iso;
  const elapsed = Date.now() - time;
  const scale =
    RELATIVE_UNITS.find(({ limit }) => Math.abs(elapsed) < limit) ??
    RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return formatIn(language).format(
    -Math.round(elapsed / scale.divisor),
    scale.unit,
  );
}

/**
 * How long ago, in the few words a group heading has room for: "just now", "1 min ago", "3 hr ago",
 * "yesterday", "4 days ago", "2 wk ago". The words are the catalogue's (`time.*`, D181 stage 2e), in
 * the translator's language, English when `t` is left out. An unreadable time, or one in the future,
 * is "just now".
 */
export function agoShort(
  iso: string,
  now: number = Date.now(),
  t: T = englishT,
): string {
  const time = new Date(iso).getTime();
  const elapsed = Number.isFinite(time) ? now - time : 0;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.yesterday");
  if (days < 7) return t("time.daysAgo", { count: days });
  return t("time.weeksAgo", { count: Math.floor(days / 7) });
}
