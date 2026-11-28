import type { Entries, Plural, SameShape } from "../person-language/cards";
import type { AppLanguageCode } from "./languages";

/**
 * The i18n layer of the app (docs/M1_PLAN.md D181): the same shapes as the approval and card
 * catalogues (D26, D50), applied to the app's own words.
 *
 * English is the source (`./catalogs/en.ts`). Every other catalogue has exactly the same keys. A
 * value that is missing or empty falls back to English, and an id that no catalogue has reads as
 * English too, so the screen never shows a key name or a blank. Placeholders are `{name}`, filled in
 * one pass (a value that contains `{x}` is never expanded). A plural entry takes its form from
 * `params.count` by the language's own rules (`Intl.PluralRules`).
 */
export type { Entries, Plural, SameShape };

export type MessageParams = Readonly<Record<string, string | number>>;

/** One catalogue: English's keys and no others. An empty string, or an empty `other`, is "not translated yet". */
export type Catalog<T extends Entries> = SameShape<T>;

const pluralRules = new Map<string, Intl.PluralRules>();

function pluralFormOf(language: string, count: number): string {
  let rules = pluralRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return rules.select(count);
}

/** The template a catalogue holds for `count`/no count, or "" when the entry is empty. */
function templateOf(
  entry: string | Plural | undefined,
  language: string,
  params: MessageParams,
): string {
  if (entry === undefined) return "";
  if (typeof entry === "string") return entry;
  const count = Number(params.count);
  const form = Number.isFinite(count) ? pluralFormOf(language, count) : "other";
  return entry[form as keyof Plural] || entry.other || "";
}

function fill(template: string, params: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

export type Translator<Id extends string> = (
  id: Id,
  params?: MessageParams,
) => string;

/**
 * A translator over `source` (English) and `catalogs`. `language` is a code with a catalogue, or
 * anything else for English.
 */
export function createTranslator<T extends Entries>(
  source: T,
  catalogs: Partial<Record<AppLanguageCode, Catalog<T>>>,
  language: string,
): Translator<Extract<keyof T, string>> {
  const own = Object.hasOwn(catalogs, language)
    ? (catalogs as Record<string, Catalog<T>>)[language]
    : undefined;
  return (id, params = {}) => {
    const wanted = own
      ? templateOf((own as Entries)[id], language, params)
      : "";
    if (wanted) return fill(wanted, params);
    return fill(templateOf(source[id], "en", params), params);
  };
}

/** A number in the app's language (`Intl.NumberFormat`), English for a language the browser does not know. */
export function formatNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(language, options).format(value);
  } catch {
    return new Intl.NumberFormat("en", options).format(value);
  }
}

/** A date or time in the app's language (`Intl.DateTimeFormat`). */
export function formatDate(
  value: Date | number,
  language: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(language, options).format(value);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(value);
  }
}
