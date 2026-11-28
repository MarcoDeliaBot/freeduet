import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { englishT, type T } from "@/freeduet/i18n/provider";
import { client } from "@/lib/client";
import { routineKeys } from "./queries";

/**
 * Writes against a person's own standing instructions.
 *
 * THERE IS NO CREATE AND NO EDIT HERE, on purpose: this page only shows and stops. Making a routine
 * and changing one are conversational, through the `RoutineTools` a Bot calls mid-chat — see
 * `server/src/routines/routes.ts` for the full reasoning.
 */

function invalidateRoutines(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: routineKeys.all });
}

/** Switch one routine on or off. Immediate; there is no save. */
export function setRoutineEnabledMutationOptions(
  queryClient: QueryClient,
  t: T = englishT,
) {
  return mutationOptions({
    mutationFn: (variables: { id: string; enabled: boolean }) =>
      client(`/api/routines/${encodeURIComponent(variables.id)}/enabled`, {
        method: "PUT",
        body: { enabled: variables.enabled },
        fallback: t("routines.err.change"),
      }),
    onSuccess: () => invalidateRoutines(queryClient),
  });
}

export function deleteRoutineMutationOptions(
  queryClient: QueryClient,
  t: T = englishT,
) {
  return mutationOptions({
    mutationFn: (id: string) =>
      client(`/api/routines/${encodeURIComponent(id)}`, {
        method: "DELETE",
        fallback: t("routines.err.change"),
      }),
    onSuccess: () => invalidateRoutines(queryClient),
  });
}

/**
 * Run now — the Test button. This DOES REAL WORK: the Bot carries out the instruction in the
 * routine's channel exactly as a scheduled firing would. Refused for a paused routine.
 */
export function runRoutineNowMutationOptions(
  queryClient: QueryClient,
  t: T = englishT,
) {
  return mutationOptions({
    mutationFn: (id: string) =>
      client(`/api/routines/${encodeURIComponent(id)}/run`, {
        method: "POST",
        fallback: t("routines.err.start"),
      }),
    onSuccess: () => invalidateRoutines(queryClient),
  });
}
