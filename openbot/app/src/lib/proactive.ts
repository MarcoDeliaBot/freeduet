import {
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { englishT, type T } from "@/freeduet/i18n/provider";
import { client } from "@/lib/client";
import { taskKeys } from "@/lib/tasks/queries";

export type ProactiveSetting = {
  id: string;
  agentId: string;
  channelId: string;
  focus: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: "idle" | "running" | "succeeded" | "error";
  lastError: string | null;
};
export type ProactiveSuggestion = {
  id: string;
  agentId: string;
  /** The research run that left it; one the person asked for starts with `asked:`. */
  runId?: string;
  title: string;
  detail: string;
  sourceApp: string | null;
  sourceLink: string | null;
  /** The channel the person asked for it in, which it wears as a tag, or null for Everything. */
  fromChannelId?: string | null;
  /** Open until the person starts it or hides it, from any card that shows it. */
  status?: "open" | "started" | "dismissed";
  createdAt: string;
};

/** Whether the person asked for this card themselves, from a conversation or from the + on Tasks. */
export function personAsked(suggestion: Pick<ProactiveSuggestion, "runId">) {
  return suggestion.runId?.startsWith("asked:") ?? false;
}

export const proactiveKeys = {
  settings: ["proactive", "settings"] as const,
  suggestions: ["proactive", "suggestions"] as const,
};

export const proactiveSettingsQueryOptions = (t: T = englishT) =>
  queryOptions({
    queryKey: proactiveKeys.settings,
    queryFn: (): Promise<ProactiveSetting[]> =>
      client("/api/proactive/settings", "settings", {
        fallback: t("proactive.err.settings"),
      }),
    refetchInterval: 30_000,
  });
export const proactiveSuggestionsQueryOptions = (t: T = englishT) =>
  queryOptions({
    queryKey: proactiveKeys.suggestions,
    queryFn: (): Promise<ProactiveSuggestion[]> =>
      client("/api/proactive/suggestions", "suggestions", {
        fallback: t("proactive.err.suggestions"),
      }),
    refetchInterval: 30_000,
  });

/**
 * One suggestion, whatever became of it: how a card in Chat knows it was started or hidden. Under
 * the list's key, so starting or hiding it anywhere refreshes both.
 */
export const proactiveSuggestionQueryOptions = (
  id: string,
  t: T = englishT,
) =>
  queryOptions({
    queryKey: [...proactiveKeys.suggestions, id] as const,
    queryFn: (): Promise<ProactiveSuggestion> =>
      client(
        `/api/proactive/suggestions/${encodeURIComponent(id)}`,
        "suggestion",
        { fallback: t("proactive.err.suggestion") },
      ),
  });

export const createProactiveSetting = (
  input: {
    agentId: string;
    channelId: string;
    focus: string;
    intervalMinutes: number;
  },
  t: T = englishT,
) =>
  client("/api/proactive/settings", {
    method: "POST",
    body: input,
    fallback: t("proactive.err.turnOn"),
  });
export const updateProactiveSetting = (
  id: string,
  input: { enabled?: boolean; intervalMinutes?: number; focus?: string },
  t: T = englishT,
) =>
  client(`/api/proactive/settings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    fallback: t("proactive.err.change"),
  });
export const runProactiveNow = (id: string, t: T = englishT) =>
  client(`/api/proactive/settings/${encodeURIComponent(id)}/run`, {
    method: "POST",
    fallback: t("proactive.err.run"),
  });
export const removeProactiveSetting = (id: string, t: T = englishT) =>
  client(`/api/proactive/settings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallback: t("proactive.err.remove"),
  });
/**
 * Start a suggestion, which opens it as a task in a conversation of its own, or hide it. A Start
 * pressed on a check-in's card says so with `from`, so the task records where it began.
 */
export const resolveSuggestion = (
  id: string,
  action: "start" | "dismiss",
  from?: "check_in",
  t: T = englishT,
) =>
  client(`/api/proactive/suggestions/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    ...(from ? { body: { from } } : {}),
    fallback:
      action === "start"
        ? t("proactive.err.start")
        : t("proactive.err.dismiss"),
  });

/**
 * A setting's research produces suggestions, so a change to either refreshes both. Starting one
 * opens a task, so the person's tasks are read again too.
 */
const settleProactive = (queryClient: QueryClient) => () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: proactiveKeys.settings }),
    queryClient.invalidateQueries({ queryKey: proactiveKeys.suggestions }),
    queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  ]);

/** Start a suggested next step as a task, or dismiss it. */
export const resolveSuggestionMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: ({
      id,
      action,
      from,
    }: {
      id: string;
      action: "start" | "dismiss";
      from?: "check_in";
    }) => resolveSuggestion(id, action, from, t),
    onSuccess: settleProactive(queryClient),
  });

export const createProactiveSettingMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: (input: Parameters<typeof createProactiveSetting>[0]) =>
      createProactiveSetting(input, t),
    onSuccess: settleProactive(queryClient),
  });

/**
 * How often research checks in when one button turns it on: every hour. A check-in reads only what
 * is new since the last one and usually ends with nothing to say, so an hour costs little.
 */
export const DEFAULT_RESEARCH_INTERVAL_MINUTES = 60;

/**
 * Turn a Bot's background research on from one button.
 *
 * A setting the person turned off comes back on as it was. Without one, a new one is made in the
 * conversation `channelId` resolves to. That is only asked for here, because finding or starting the
 * conversation is work a setting that already exists does not need.
 */
export const turnOnResearchMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: async (input: {
      setting: Pick<ProactiveSetting, "id"> | undefined;
      agentId: string;
      focus: string;
      channelId: () => Promise<string>;
    }) =>
      input.setting
        ? updateProactiveSetting(input.setting.id, { enabled: true }, t)
        : createProactiveSetting(
            {
              agentId: input.agentId,
              channelId: await input.channelId(),
              focus: input.focus,
              intervalMinutes: DEFAULT_RESEARCH_INTERVAL_MINUTES,
            },
            t,
          ),
    onSuccess: settleProactive(queryClient),
  });

/** What can be done to one background-research setting from its row. */
export type ProactiveChange =
  | { kind: "toggle" }
  | { kind: "run" }
  | { kind: "remove" }
  | { kind: "interval"; minutes: number };

export const changeProactiveSettingMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: ({
      setting,
      change,
    }: {
      setting: Pick<ProactiveSetting, "id" | "enabled">;
      change: ProactiveChange;
    }) =>
      change.kind === "run"
        ? runProactiveNow(setting.id, t)
        : change.kind === "remove"
          ? removeProactiveSetting(setting.id, t)
          : updateProactiveSetting(
              setting.id,
              change.kind === "toggle"
                ? { enabled: !setting.enabled }
                : { intervalMinutes: change.minutes },
              t,
            ),
    onSuccess: settleProactive(queryClient),
  });
