import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { agentListQueryOptions } from "@/lib/agents/queries";

/**
 * Each Bot's name by its id, for the "which member ran it" column of the calendar and the history.
 *
 * Visible and hidden Bots are both asked for, so a run by a hidden Bot still names it. A Bot the list does
 * not hold has no entry; a caller says "A Bot" then, rather than an id.
 */
export function useBotNames(): Map<string, string> {
  const visible = useQuery(agentListQueryOptions());
  const hidden = useQuery(agentListQueryOptions(true));
  return useMemo(
    () =>
      new Map(
        [...(visible.data ?? []), ...(hidden.data ?? [])].map(
          (agent) => [agent.id, agent.name] as const,
        ),
      ),
    [visible.data, hidden.data],
  );
}
