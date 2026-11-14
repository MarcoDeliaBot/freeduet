import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { type AgentProfile, agentListQueryOptions } from "./queries";

/**
 * Map visible Bot ids to names for admin read surfaces; deleted or hidden ids fall back to the
 * immutable id recorded in the event.
 */

/** Stable query selector so the id-to-name map only rebuilds when the roster changes. */
const toNames = (agents: AgentProfile[]): Map<string, string> =>
  new Map(agents.map((agent) => [agent.id, agent.realName ?? agent.name]));

/** The name as THIS person sees it: the one they gave a team member, when they gave one. */
const toLabels = (agents: AgentProfile[]): Map<string, string> =>
  new Map(agents.map((agent) => [agent.id, agent.name]));

export function useBotLabels(): (botId: string) => string {
  const { data: names } = useQuery({
    ...agentListQueryOptions(),
    select: toLabels,
  });
  return useCallback((botId: string) => names?.get(botId) ?? botId, [names]);
}

/** The member's own name, for admin read surfaces: an alias never stands for it there. */
export function useBotNames(): (botId: string) => string {
  const { data: names } = useQuery({
    ...agentListQueryOptions(),
    select: toNames,
  });

  return useCallback((botId: string) => names?.get(botId) ?? botId, [names]);
}
