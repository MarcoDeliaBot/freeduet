import { queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/client";

/**
 * The calendar and the history: what the routines do next, and what they did. The server owns every time
 * and every owner check; these are the shapes the page reads, and the keys they are cached under.
 *
 * The keys start with "routines", so the invalidation after a switch, a delete or a Run now
 * (`routineKeys.all`) refreshes these as well.
 */

/** One upcoming run. The routine's words come from the routines list the page already holds. */
export type UpcomingRunRecord = {
  routineId: string;
  agentId: string;
  /** An instant, shown in the device's time zone. */
  at: string;
};

export type CalendarRecord = {
  from: string;
  to: string;
  runs: UpcomingRunRecord[];
  /** More runs fall in the window than the answer holds. */
  truncated: boolean;
};

/** One firing in the person's history, with the routine and the Bot it belongs to. */
export type OwnedRunRecord = {
  id: string;
  routineId: string;
  agentId: string;
  status: "running" | "succeeded" | "failed" | "skipped" | "waiting";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  source: "schedule" | "run_now" | "trigger";
};

export function routineCalendarQueryOptions(window: {
  from: string;
  to: string;
  agentId?: string;
}) {
  const params = new URLSearchParams({ from: window.from, to: window.to });
  if (window.agentId) params.set("agentId", window.agentId);
  return queryOptions({
    queryKey: [
      "routines",
      "calendar",
      window.from,
      window.to,
      window.agentId ?? null,
    ] as const,
    queryFn: async (): Promise<CalendarRecord> => {
      // The whole body, not one key of it: `truncated` is part of the answer.
      const response = await client(
        `/api/routines/calendar?${params.toString()}`,
        { fallback: "Your upcoming runs could not be loaded." },
      );
      return (await response.json()) as CalendarRecord;
    },
  });
}

export function routineHistoryQueryOptions(agentId?: string) {
  const params = new URLSearchParams({ limit: "100" });
  if (agentId) params.set("agentId", agentId);
  return queryOptions({
    queryKey: ["routines", "history", agentId ?? null] as const,
    queryFn: (): Promise<OwnedRunRecord[]> =>
      client(`/api/routines/runs?${params.toString()}`, "runs", {
        fallback: "The run history could not be loaded.",
      }),
    // A run in flight settles within minutes; poll while one is open, so "Running" becomes its outcome.
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "running") ? 5_000 : false,
  });
}
