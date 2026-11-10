import {
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { client } from "@/lib/client";
import { invalidatePlugins } from "./mutations";
import { pluginKeys } from "./queries";

/**
 * Connecting an app by pasting what it is reached with: an address, an app password and, optionally,
 * a calendar's secret address (Gmail and Google Calendar, the app-password way).
 *
 * In its own file because nothing here is an OAuth consent or a broker's key form, and the
 * mutations module's own test insists every factory in it is one of those.
 *
 * WHAT COMES BACK IS THE ADDRESS AND NOTHING ELSE. The server never returns the password or the
 * calendar link, so there is no read here that could put either into the query cache.
 */

export type SecretConnection =
  | { connected: false }
  | {
      connected: true;
      /** The mailbox the person's Bots read. The only part of the secret the server ever sends back. */
      address: string;
      /** Whether a calendar's secret address is attached. A yes or a no, never the address. */
      calendar: boolean;
      connectedAt: string;
    };

/**
 * Whether this person has pasted a working secret for this app. Under the plugins key, so every
 * write there refreshes it.
 */
export function secretConnectionQueryOptions(serverId: string) {
  return queryOptions({
    queryKey: [...pluginKeys.all, "secret-connection", serverId] as const,
    queryFn: async (): Promise<SecretConnection> => {
      const response = await client(
        `/api/plugins/servers/${encodeURIComponent(serverId)}/secret-connection`,
        { fallback: "Couldn't load whether you've connected this." },
      );
      return response.json();
    },
  });
}

/** What the form sends. All three are secrets from the moment they are typed. */
export type SecretInput = {
  serverId: string;
  address: string;
  appPassword: string;
  /** Empty when no calendar was given. */
  calendarUrl: string;
};

/**
 * Check what was pasted and keep it, or say plainly why not.
 *
 * THE PASTED VALUES REACH NO QUERY CACHE, NO ROUTER STATE AND NO LOCAL STORAGE, and this erases its
 * own input for the reason `connectBrokeredWithFieldsMutationOptions` does: a mutation keeps the
 * variables it was called with for as long as its observer lives, and a refusal leaves the form open
 * for as long as somebody spends correcting a password. The `finally` is what makes "the request
 * body is the whole of its life here" true. It replaces the fields on the variables object, which is
 * made fresh for each press, so the copy the form is holding is untouched and a refused password is
 * still there to be corrected. `gcTime: 0` is the other half: the cache drops the mutation itself
 * the moment nothing observes it.
 *
 * The refusal reaches the person as the server's sentence, which is fixed text that never repeats
 * what was sent.
 */
export function connectSecretMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    gcTime: 0,
    mutationFn: async (variables: SecretInput): Promise<void> => {
      try {
        await client(
          `/api/plugins/servers/${encodeURIComponent(variables.serverId)}/secret-connection`,
          {
            method: "POST",
            body: {
              address: variables.address,
              appPassword: variables.appPassword,
              calendarUrl: variables.calendarUrl,
            },
            fallback: "Couldn't connect that account. Nothing was saved.",
          },
        );
      } finally {
        variables.appPassword = "";
        variables.calendarUrl = "";
      }
    },
    onSettled: () => invalidatePlugins(queryClient),
  });
}
