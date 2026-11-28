/**
 * The provider cards' sentences (D109, docs/design/engines-three-clicks.md). Pure: no React, no request.
 *
 * What a card CAN do is decided by the service and sent as facts (`forMembers`, `blocked`, `keySaved`); this module only says
 * it in English. The facts that never change (a provider's name, what it is, a suggested model) live here.
 */

import type { MessageId } from "./i18n/catalogs";
import { englishT, type T } from "./i18n/provider";

export type ProviderId =
  | "ollama"
  | "llamacpp"
  | "lmstudio"
  | "freellmapi"
  | "groq"
  | "cerebras"
  | "google"
  | "mistral"
  | "openrouter"
  | "cloudflare"
  | "anthropic-api";

export type ProviderTag = "local" | "router" | "free" | "trial" | "paid";

/** One card as the server sends it (server/src/freeduet/engines-routes.ts, `ProviderView`). Never a key. */
export type ProviderView = {
  id: ProviderId;
  tag: ProviderTag;
  enabled: boolean;
  baseUrl: string;
  model: string;
  keySaved: boolean;
  needsKey: boolean;
  cloud: boolean;
  forMembers: boolean;
  forAssistants: boolean;
  blocked: "paid" | "trial_needs_card" | null;
  addressFixed: boolean;
  /** A free cloud engine a member can run on: who may be chosen and who is. Null for every other card. */
  useFor: { available: string[]; chosen: string[] } | null;
};

/** The order of the cards: your own computer first, then the free services, then the ones that cost or need a card. */
export const PROVIDER_ORDER: readonly ProviderId[] = [
  "ollama",
  "llamacpp",
  "lmstudio",
  "freellmapi",
  "groq",
  "google",
  "mistral",
  "openrouter",
  "cloudflare",
  "cerebras",
  "anthropic-api",
];

/** A model written in the box before the person chooses one, so the three clicks work. It is a suggestion: Test says if it is wrong. */
export const PROVIDER_TEXT: Record<
  ProviderId,
  {
    name: string;
    /** The English sentence; the page reads `providerBlurb`. */
    blurb: string;
    suggestedModel: string;
    /** An example in the empty address box, for a card with no default address. */
    addressPlaceholder?: string;
  }
> = {
  ollama: {
    name: "Ollama",
    blurb: englishT("engines.providers.blurb.ollama"),
    suggestedModel: "",
  },
  llamacpp: {
    name: "llama.cpp server",
    blurb: englishT("engines.providers.blurb.llamacpp"),
    suggestedModel: "",
  },
  lmstudio: {
    name: "LM Studio",
    blurb: englishT("engines.providers.blurb.lmstudio"),
    suggestedModel: "",
  },
  freellmapi: {
    name: "FreeLLMAPI (router on your computer)",
    blurb: englishT("engines.providers.blurb.freellmapi"),
    suggestedModel: "auto",
    addressPlaceholder: "http://localhost:3002/v1",
  },
  groq: {
    name: "Groq",
    blurb: englishT("engines.providers.blurb.groq"),
    suggestedModel: "llama-3.1-8b-instant",
  },
  google: {
    name: "Google AI Studio",
    blurb: englishT("engines.providers.blurb.google"),
    suggestedModel: "gemini-2.0-flash",
  },
  mistral: {
    name: "Mistral",
    blurb: englishT("engines.providers.blurb.mistral"),
    suggestedModel: "mistral-small-latest",
  },
  openrouter: {
    name: "OpenRouter",
    blurb: englishT("engines.providers.blurb.openrouter"),
    suggestedModel: "openrouter/free",
  },
  cloudflare: {
    name: "Cloudflare Workers AI",
    blurb: englishT("engines.providers.blurb.cloudflare"),
    suggestedModel: "@cf/meta/llama-3.1-8b-instruct",
  },
  cerebras: {
    name: "Cerebras",
    blurb: englishT("engines.providers.blurb.cerebras"),
    suggestedModel: "",
  },
  "anthropic-api": {
    name: "Anthropic API",
    blurb: englishT("engines.providers.blurb.anthropic-api"),
    suggestedModel: "",
  },
};

/** A provider's one-line description in the app's language. Its name is a product name and is never translated. */
export function providerBlurb(id: ProviderId, t: T = englishT): string {
  return t(`engines.providers.blurb.${id}`);
}

const TAG_IDS: Record<ProviderTag, MessageId> = {
  local: "engines.providers.tag.local",
  router: "engines.providers.tag.router",
  free: "engines.providers.tag.free",
  trial: "engines.providers.tag.trial",
  paid: "engines.providers.tag.paid",
};
const TAG_TONES: Record<ProviderTag, "green" | "blue" | "amber" | "neutral"> = {
  local: "green",
  router: "amber",
  free: "blue",
  trial: "amber",
  paid: "neutral",
};

export const TAG_TEXT = Object.fromEntries(
  (Object.keys(TAG_IDS) as ProviderTag[]).map((tag) => [
    tag,
    { label: englishT(TAG_IDS[tag]), tone: TAG_TONES[tag] },
  ]),
) as Record<
  ProviderTag,
  { label: string; tone: "green" | "blue" | "amber" | "neutral" }
>;

/** A tag's word and tone in the app's language. */
export function tagText(
  tag: ProviderTag,
  t: T = englishT,
): { label: string; tone: "green" | "blue" | "amber" | "neutral" } {
  return { label: t(TAG_IDS[tag]), tone: TAG_TONES[tag] };
}

export const PROVIDERS_TITLE = englishT("engines.providers.title");
export const PROVIDERS_DESCRIPTION = englishT("engines.providers.description");
export const CLOUD_WARNING = englishT("engines.providers.cloudWarning");
/** D113: under the FreeLLMAPI card. The router passes what it is sent on to the free providers the person enabled inside it. */
export const ROUTER_WARNING = englishT("engines.providers.routerWarning");
export const ROUTER_ADVANCED_NOTE = englishT(
  "engines.providers.routerAdvanced",
);
export const ROUTER_ADDRESS_NOTE = englishT("engines.providers.routerAddress");
export const LABELS = {
  address: englishT("engines.providers.address"),
  model: englishT("admin.credentials.model"),
  key: englishT("triggers.key"),
  loadList: englishT("engines.providers.loadList"),
  save: englishT("settings.save"),
  saveSettings: englishT("engines.providers.saveSettings"),
  remove: englishT("admin.boundaries.remove"),
  test: englishT("engines.providers.test"),
} as const;
/** D116: under the OpenRouter model choice. One line: the free list changes often, and a free service may keep what it is sent (D101). */
export const FREE_MODELS_NOTE = englishT("engines.providers.freeModelsNote");
export const FREE_MODELS_LOADING = englishT(
  "engines.providers.freeModelsLoading",
);
/** Where the list came from, when it is not a fresh one. The router `openrouter/free` is always in it. */
export function freeModelsSourceText(
  source: string,
  t: T = englishT,
): string | null {
  if (source === "stale") return t("engines.providers.freeModelsStale");
  if (source === "fallback") return t("engines.providers.freeModelsFallback");
  return null;
}
export const FREE_ROUTER_LABEL = englishT("engines.providers.freeRouterLabel");
export const KEY_SAVED = englishT("engines.providers.keySaved");
export const KEY_PLACEHOLDER = englishT("engines.providers.keyPlaceholder");
export const NOT_ON_YET_KEY = englishT("engines.providers.notOnKey");
export const NOT_ON_YET_SETTINGS = englishT("engines.providers.notOnSettings");
export const SETTINGS_SAVED = englishT("engines.providers.settingsSaved");
export const KEY_REMOVED = englishT("engines.providers.keyRemoved");
export const LOCKED_OWN_FILE = englishT("engines.providers.lockedOwnFile");

/** What the card says about who can use it. Members run only on Claude Code and on Anthropic-format engines today. */
export function usersText(
  card: Pick<ProviderView, "blocked" | "forMembers" | "forAssistants">,
  t: T = englishT,
): string {
  if (card.blocked === "paid") return t("engines.providers.users.paid");
  if (card.blocked === "trial_needs_card")
    return t("engines.providers.users.trial");
  if (card.forMembers) return t("engines.providers.users.members");
  return t("engines.providers.users.notYet");
}

/** The outcome of Test or Load list, in one sentence, from the closed list the server sends. Never the key, a number or the provider's own words. */
export function checkText(code: string, t: T = englishT): string {
  switch (code) {
    case "ok":
      return t("engines.providers.check.ok");
    case "key_rejected":
      return t("engines.providers.check.key_rejected");
    case "model_missing":
      return t("engines.providers.check.model_missing");
    case "rate_limited":
      return t("engines.providers.check.rate_limited");
    default:
      return t("engines.providers.check.other");
  }
}

export const FREE_NOTE = englishT("engines.providers.freeNote");
export const USE_FOR_TITLE = englishT("engines.providers.useFor");
export const USE_FOR_NONE = englishT("engines.providers.useForNone");

/** What a ticked member sends to a free cloud service. Only the two members whose work is mail or bookings say more. */
export function warningFor(memberId: string, t: T = englishT): string | null {
  if (memberId === "inbox") return t("engines.providers.warn.inbox");
  if (memberId === "concierge") return t("engines.providers.warn.concierge");
  return null;
}

export function modelsLoadedText(count: number, t: T = englishT): string {
  return count === 0
    ? t("engines.providers.modelsEmpty")
    : t("engines.providers.modelsLoaded", { count });
}

export function cardLabel(name: string, what: string): string {
  return `${name}: ${what}`;
}
