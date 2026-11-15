import {
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { client } from "@/lib/client";
import { pluginKeys } from "./queries";

/**
 * The person's own mail rules: standing rules FreeDuet keeps and applies to their mailbox. There is
 * no way to make one here; a member makes one when the person asks in chat, and the list lets the
 * person stop or delete it.
 */
export type MailRule = {
  id: string;
  serverId: string;
  inWords: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastMatched: number;
  totalApplied: number;
  lastError: string | null;
};

const key = [...pluginKeys.all, "mail-rules"] as const;

export function mailRulesQueryOptions() {
  return queryOptions({
    queryKey: key,
    queryFn: async (): Promise<MailRule[]> => {
      const response = await client("/api/plugins/mail-rules", {
        fallback: "Couldn't load your mail rules.",
      });
      return (await response.json()).rules;
    },
  });
}

export type MailRuleChange =
  | { id: string; change: "enable" | "disable" }
  | { id: string; change: "delete" };

export function changeMailRuleMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async (input: MailRuleChange) => {
      await client(
        input.change === "delete"
          ? `/api/plugins/mail-rules/${encodeURIComponent(input.id)}`
          : `/api/plugins/mail-rules/${encodeURIComponent(input.id)}/enabled`,
        input.change === "delete"
          ? { method: "DELETE", fallback: "Couldn't delete the rule." }
          : {
              method: "POST",
              body: { enabled: input.change === "enable" },
              fallback: "Couldn't change the rule.",
            },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
