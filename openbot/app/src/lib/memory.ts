import {
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { englishT, type T } from "@/freeduet/i18n/provider";
import { client } from "@/lib/client";
export type MemoryRecord = {
  id: string;
  content: string;
  provenance: string;
  sourceId: string | null;
  enabled: boolean;
  reviewState: "unreviewed" | "confirmed" | "edited";
  /** `intelligence`: held by CopilotKit Intelligence for this person, formed outside OpenBot. */
  formedBy: "person" | "import" | "bot" | "intelligence";
  formedByAgentId: string | null;
  sourceApp: string | null;
  sourceLink: string | null;
  observedAt: string | null;
  updatedAt: string;
};
export type MemorySource = {
  id: string;
  title: string;
  agentId: string;
  toolRef: string;
  enabled: boolean;
  syncStatus: "idle" | "running" | "succeeded" | "error";
  syncError: string | null;
  lastSyncAt: string | null;
};
export type MemorySourceTool = {
  ref: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export const memoryKeys = {
  all: ["memory"] as const,
  sources: ["memory", "sources"] as const,
  available: (id: string) => ["memory", "available", id] as const,
};
export const memoriesQueryOptions = (t: T = englishT) =>
  queryOptions({
    queryKey: memoryKeys.all,
    queryFn: (): Promise<MemoryRecord[]> =>
      client("/api/memory", "memories", { fallback: t("memory.err.load") }),
  });
export const memorySourcesQueryOptions = (t: T = englishT) =>
  queryOptions({
    queryKey: memoryKeys.sources,
    queryFn: (): Promise<MemorySource[]> =>
      client("/api/memory/sources", "sources", {
        fallback: t("memory.err.sources"),
      }),
    refetchInterval: 15_000,
  });
export const availableMemorySourcesQueryOptions = (
  id: string,
  t: T = englishT,
) =>
  queryOptions({
    queryKey: memoryKeys.available(id),
    enabled: !!id,
    queryFn: (): Promise<MemorySourceTool[]> =>
      client(
        `/api/memory/sources/available/${encodeURIComponent(id)}`,
        "tools",
        { fallback: t("memory.err.actions") },
      ),
  });
export const createMemory = (content: string, t: T = englishT) =>
  client("/api/memory", {
    method: "POST",
    body: { content },
    fallback: t("memory.err.create"),
  });
export const updateMemory = (
  id: string,
  input: { content?: string; enabled?: boolean; reviewState?: "confirmed" },
  t: T = englishT,
) =>
  client(`/api/memory/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    fallback: t("memory.err.update"),
  });
export const deleteMemory = (id: string, t: T = englishT) =>
  client(`/api/memory/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallback: t("memory.err.delete"),
  });
export const addMemorySource = (
  input: {
    agentId: string;
    toolRef: string;
    title: string;
    args: Record<string, unknown>;
  },
  t: T = englishT,
) =>
  client("/api/memory/sources", {
    method: "POST",
    body: input,
    fallback: t("memory.err.addSource"),
  });
export const memorySourceAction = (
  id: string,
  action: "sync" | "remove" | "enable" | "disable",
  t: T = englishT,
) =>
  client(
    `/api/memory/sources/${encodeURIComponent(id)}${action === "sync" ? "/sync" : ""}`,
    {
      method:
        action === "sync" ? "POST" : action === "remove" ? "DELETE" : "PATCH",
      ...(action === "enable" || action === "disable"
        ? { body: { enabled: action === "enable" } }
        : {}),
      fallback: t("memory.err.changeSource"),
    },
  );

const settleMemory = (queryClient: QueryClient) => () =>
  queryClient.invalidateQueries({ queryKey: memoryKeys.all });

export const createMemoryMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: (content: string) => createMemory(content, t),
    onSettled: settleMemory(queryClient),
  });
export const updateMemoryMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { content?: string; enabled?: boolean; reviewState?: "confirmed" };
    }) => updateMemory(id, input, t),
    onSettled: settleMemory(queryClient),
  });
export const deleteMemoryMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: (id: string) => deleteMemory(id, t),
    onSettled: settleMemory(queryClient),
  });

/** Opt a Bot in to reading one of its connected apps' actions as a memory source. */
export const addMemorySourceMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: (input: Parameters<typeof addMemorySource>[0]) =>
      addMemorySource(input, t),
    onSuccess: settleMemory(queryClient),
  });

/** Sync, remove, enable or disable one memory source. */
export const memorySourceActionMutationOptions = (
  queryClient: QueryClient,
  t: T = englishT,
) =>
  mutationOptions({
    mutationFn: ({
      sourceId,
      name,
    }: {
      sourceId: string;
      name: "sync" | "remove" | "enable" | "disable";
    }) => memorySourceAction(sourceId, name, t),
    onSuccess: settleMemory(queryClient),
  });
