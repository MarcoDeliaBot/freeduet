import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { queryClient } from "@/query-client";

/**
 * The signed-in person, read through the client of the screen that asks. Inside a provider that is the
 * provider's client, so one screen makes one `/api/me` request whoever reads it. Where no provider is
 * mounted (a composer tested on its own) it is the app's own client, the one the composer's other query uses.
 */
export function useCurrentUser() {
  const client = useContext(QueryClientContext) ?? queryClient;
  return useQuery(currentUserQueryOptions(), client);
}
