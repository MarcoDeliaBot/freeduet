import {
  APP_LANGUAGE_CODES,
  type AppLanguageChoice,
  type AppLanguageCode,
} from "@openbot/shared/user-preferences";

/**
 * The languages of the app's own words (docs/M1_PLAN.md D181): the twelve of the public site
 * (`site/src/site.json`) and of the approval cards (D50). Each is named in its own language, so a
 * person who cannot read the current one still finds theirs in the list.
 */
export const APP_LANGUAGES: readonly {
  code: AppLanguageCode;
  name: string;
}[] = [
  { code: "en", name: "English" },
  { code: "it", name: "Italiano" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "pl", name: "Polski" },
  { code: "tr", name: "Türkçe" },
  { code: "ru", name: "Русский" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
];

export type { AppLanguageChoice, AppLanguageCode };

/** Whether `value` is one of the twelve codes. */
export function isAppLanguage(value: unknown): value is AppLanguageCode {
  return (
    typeof value === "string" &&
    (APP_LANGUAGE_CODES as readonly string[]).includes(value)
  );
}

/** Whether `value` is a code or "auto": what is stored and what the server accepts. */
export function isAppLanguageChoice(
  value: unknown,
): value is AppLanguageChoice {
  return value === "auto" || isAppLanguage(value);
}

/**
 * The language the app draws in: the person's own choice when it is a code, else the first language
 * of `browserLanguages` (`navigator.languages`, most wanted first) whose primary part is one of the
 * twelve ("it-CH" is "it", "zh-TW" is "zh"), else English.
 */
export function resolveAppLanguage(
  choice: unknown,
  browserLanguages: readonly string[] = [],
): AppLanguageCode {
  if (isAppLanguage(choice)) return choice;
  for (const tag of browserLanguages) {
    const primary = String(tag).trim().toLowerCase().split(/[-_]/)[0];
    if (isAppLanguage(primary)) return primary;
  }
  return "en";
}
