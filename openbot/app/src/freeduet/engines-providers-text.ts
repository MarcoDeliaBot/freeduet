/**
 * The provider cards' sentences (D109, docs/design/engines-three-clicks.md). Pure: no React, no request.
 *
 * What a card CAN do is decided by the service and sent as facts (`forMembers`, `blocked`, `keySaved`); this module only says
 * it in English. The facts that never change (a provider's name, what it is, a suggested model) live here.
 */

export type ProviderId =
  | "ollama"
  | "llamacpp"
  | "lmstudio"
  | "groq"
  | "cerebras"
  | "google"
  | "mistral"
  | "openrouter"
  | "cloudflare"
  | "anthropic-api";

export type ProviderTag = "local" | "free" | "trial" | "paid";

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
  { name: string; blurb: string; suggestedModel: string }
> = {
  ollama: {
    name: "Ollama",
    blurb: "Models that run on your own computer.",
    suggestedModel: "",
  },
  llamacpp: {
    name: "llama.cpp server",
    blurb: "A llama.cpp server on your own computer or network.",
    suggestedModel: "",
  },
  lmstudio: {
    name: "LM Studio",
    blurb: "The local server of LM Studio on your own computer.",
    suggestedModel: "",
  },
  groq: {
    name: "Groq",
    blurb: "Fast open models, free with daily limits.",
    suggestedModel: "llama-3.1-8b-instant",
  },
  google: {
    name: "Google AI Studio",
    blurb: "Gemini models, free with limits.",
    suggestedModel: "gemini-2.0-flash",
  },
  mistral: {
    name: "Mistral",
    blurb: "Mistral models on the free plan, with limits.",
    suggestedModel: "mistral-small-latest",
  },
  openrouter: {
    name: "OpenRouter",
    blurb:
      "Only models that cost nothing: an id ending in :free, or openrouter/free.",
    suggestedModel: "openrouter/free",
  },
  cloudflare: {
    name: "Cloudflare Workers AI",
    blurb:
      "Open models on Cloudflare, free with a daily allowance. Put your own account in the address.",
    suggestedModel: "@cf/meta/llama-3.1-8b-instruct",
  },
  cerebras: {
    name: "Cerebras",
    blurb: "Very fast open models.",
    suggestedModel: "",
  },
  "anthropic-api": {
    name: "Anthropic API",
    blurb: "Claude on pay-as-you-go credits.",
    suggestedModel: "",
  },
};

export const TAG_TEXT: Record<
  ProviderTag,
  { label: string; tone: "green" | "blue" | "amber" | "neutral" }
> = {
  local: { label: "Local", tone: "green" },
  free: { label: "Free with limits", tone: "blue" },
  trial: { label: "Trial, needs a card", tone: "amber" },
  paid: { label: "Paid", tone: "neutral" },
};

export const PROVIDERS_TITLE = "Add an engine";
export const PROVIDERS_DESCRIPTION =
  "Switch an engine on, paste its key and press Save, then press Test. A change applies from the next message.";
export const CLOUD_WARNING = "Data sent to this service leaves your computer.";
export const LABELS = {
  address: "Server address",
  model: "Model",
  key: "Key",
  loadList: "Load list",
  save: "Save",
  saveSettings: "Save settings",
  remove: "Remove",
  test: "Test",
} as const;
/** D116: under the OpenRouter model choice. One line: the free list changes often, and a free service may keep what it is sent (D101). */
export const FREE_MODELS_NOTE =
  "Free models change often and may keep what you send.";
export const FREE_MODELS_LOADING =
  "Loading the free models that can use tools.";
/** Where the list came from, when it is not a fresh one. The router `openrouter/free` is always in it. */
export function freeModelsSourceText(source: string): string | null {
  if (source === "stale")
    return "Could not reach OpenRouter just now. This is the last list that was loaded.";
  if (source === "fallback")
    return "Could not reach OpenRouter just now. Only the free router is offered.";
  return null;
}
export const FREE_ROUTER_LABEL =
  "openrouter/free (OpenRouter picks a free model)";
export const KEY_SAVED = "Key saved. It is never shown again.";
export const KEY_PLACEHOLDER = "Paste the key here";
export const NOT_ON_YET_KEY = "Not on yet. Paste the key and press Save.";
export const NOT_ON_YET_SETTINGS =
  "Not on yet. Choose a model and press Save settings.";
export const SETTINGS_SAVED = "Saved. It applies from the next message.";
export const KEY_REMOVED = "Key removed. The engine is off.";
export const LOCKED_OWN_FILE =
  "You wrote an engines file of your own, so these cards only show it. Change it there.";

/** What the card says about who can use it. Members run only on Claude Code and on Anthropic-format engines today. */
export function usersText(
  card: Pick<ProviderView, "blocked" | "forMembers" | "forAssistants">,
): string {
  if (card.blocked === "paid") {
    return "Off until spending caps exist. FreeDuet will not let a paid engine run before then.";
  }
  if (card.blocked === "trial_needs_card") {
    return "Its free tier is a trial that needs a card, so FreeDuet does not offer it as free. It stays off.";
  }
  if (card.forMembers) {
    return "For members: yes, after their Claude login. For the light assistants: yes.";
  }
  return "For members: not yet. For the light assistants: yes.";
}

/** The outcome of Test or Load list, in one sentence, from the closed list the server sends. Never the key, a number or the provider's own words. */
export function checkText(code: string): string {
  switch (code) {
    case "ok":
      return "It answered. It works.";
    case "key_rejected":
      return "The key was not accepted. Check it and save it again.";
    case "model_missing":
      return "The server does not know that model. Check the model name.";
    case "rate_limited":
      return "The limit or the credit is used up for now. Try again later.";
    default:
      return "Nothing answered, or the answer was not understood.";
  }
}

export const FREE_NOTE =
  "\u201cFree\u201d is FreeDuet's label, taken from the provider's terms. Some providers (Google, for one) bill you if billing is switched on for your project.";
export const USE_FOR_TITLE = "Use for";
export const USE_FOR_NONE =
  "No member uses it yet. The light assistants do. Tick the members who may send their work to this service.";

/** What a ticked member sends to a free cloud service. Only the two members whose work is mail or bookings say more. */
export function warningFor(memberId: string): string | null {
  if (memberId === "inbox") return "Sends your mail to this service.";
  if (memberId === "concierge") return "Sends your bookings to this service.";
  return null;
}

export function modelsLoadedText(count: number): string {
  return count === 0
    ? "The list is empty. Type the model name."
    : `${count} ${count === 1 ? "model" : "models"} loaded. Pick one in the box.`;
}

export function cardLabel(name: string, what: string): string {
  return `${name}: ${what}`;
}
