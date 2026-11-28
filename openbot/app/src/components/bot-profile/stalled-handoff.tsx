import { IconAlertTriangle, IconMessage } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  dismissHandoffMutationOptions,
  retryHandoffMutationOptions,
} from "@/lib/bot-lifecycle/mutations";
import { englishT, type T, useT } from "@/freeduet/i18n/provider";

/** The words for a stalled hand-off, in one place so every screen says the same thing (D171). */
export function stalledWhat(
  toName: string,
  task: string,
  t: T = englishT,
): string {
  return t("stalled.what", { name: toName, task });
}

/**
 * D171/D172: the buttons of a hand-off that gave up, in one place so every screen (the Bots row, the Bot
 * page, the work card) does the same thing: "Try again" puts the same hand-off back once, "Dismiss" lets it
 * go, and `open` is the screen's own "Open conversation" button. The two requests answer 404 for a hand-off
 * that is no longer stalled, which reads as one plain line.
 */
export function StalledActions({
  agentId,
  id,
  open,
}: {
  agentId: string;
  id: string;
  open: ReactNode;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const retry = useMutation(retryHandoffMutationOptions(queryClient));
  const dismiss = useMutation(dismissHandoffMutationOptions(queryClient));
  const busy = retry.isPending || retry.isSuccess || dismiss.isPending;
  return (
    <>
      {retry.isError || dismiss.isError ? (
        <p className="basis-full text-destructive text-sm" role="alert">
          {retry.isError ? t("stalled.retryError") : t("stalled.dismissError")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {open}
        <Button
          disabled={busy || dismiss.isSuccess}
          onClick={() => dismiss.mutate({ agentId, id })}
          size="sm"
          variant="outline"
        >
          {dismiss.isPending
            ? t("stalled.dismissing")
            : dismiss.isSuccess
              ? t("stalled.dismissed")
              : t("stalled.dismiss")}
        </Button>
        <Button
          disabled={busy || dismiss.isSuccess}
          onClick={() => retry.mutate({ agentId, id })}
          size="sm"
        >
          {retry.isPending
            ? t("stalled.retrying")
            : retry.isSuccess
              ? t("stalled.queued")
              : t("stalled.retry")}
        </Button>
      </div>
    </>
  );
}

/**
 * D171: a hand-off that gave up, said plainly. What happened, why in one line, one primary button that
 * fixes it ("Try again" puts that same hand-off back once) and "Open conversation" where the Bot
 * reported it. The reason is already plain words from the server, never an error code.
 */
export function StalledHandoffRow({
  agentId,
  id,
  toName,
  task,
  reason,
  channelId,
}: {
  agentId: string;
  id: string;
  toName: string;
  task: string;
  reason: string;
  channelId: string | null;
}) {
  const t = useT();
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-3 py-2.5"
      data-testid="stalled-handoff"
    >
      <IconAlertTriangle aria-hidden className="size-4 text-duet-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{stalledWhat(toName, task, t)}</p>
        <p className="text-muted-foreground text-sm">
          {t("stalled.why", { reason })}
        </p>
      </div>
      <StalledActions
        agentId={agentId}
        id={id}
        open={
          channelId ? (
            <Button
              render={(props) => (
                <Link
                  {...props}
                  params={{ channelId }}
                  to="/channel/$channelId"
                />
              )}
              size="sm"
              variant="ghost"
            >
              <IconMessage />
              {t("stalled.open")}
            </Button>
          ) : null
        }
      />
    </div>
  );
}
