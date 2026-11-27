export type MessageListEmphasis = "agent" | "thread";

/**
 * The languages the app's own words can be shown in (D181): the twelve of the public site and of the approval
 * cards (D50). English is the source of every catalogue.
 */
export const APP_LANGUAGE_CODES = [
  "en",
  "it",
  "es",
  "fr",
  "de",
  "pt",
  "pl",
  "tr",
  "ru",
  "zh",
  "ja",
  "ko",
] as const;

export type AppLanguageCode = (typeof APP_LANGUAGE_CODES)[number];

/** A language code, or "auto" to follow the browser's own list of languages. */
export type AppLanguageChoice = AppLanguageCode | "auto";

export type UserPreferences = {
  messageListEmphasis: MessageListEmphasis;
  /** Whether this person closed the banner offering help self-hosting OpenBot. */
  selfHostBannerDismissed: boolean;
  /** The language of the app's own words (D181). Absent, or "auto", follows the browser. */
  appLanguage?: AppLanguageChoice;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  messageListEmphasis: "thread",
  selfHostBannerDismissed: false,
};
