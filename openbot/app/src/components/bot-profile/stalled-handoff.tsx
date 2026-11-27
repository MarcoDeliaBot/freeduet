import { IconAlertTriangle, IconMessage } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  dismissHandoffMutationOptions,
  retryHandoffMutationOptions,
} from "@/lib/bot-lifecycle/mutations";

/** The words for a stalled hand-off, in one place so every screen says the same thing (D171). */
export function stalledWhat(toName: string, task: string): string {
  return `${toName} did not finish: ${task}`;
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
  const queryClient = useQueryClient();
  const retry = useMutation(retryHandoffMutationOptions(queryClient));
  const dismiss = useMutation(dismissHandoffMutationOptions(queryClient));
  const busy = retry.isPending || retry.isSuccess || dismiss.isPending;
  return (
    <>
      {retry.isError || dismiss.isError ? (
        <p className="basis-full text-destructive text-sm" role="alert">
          {retry.isError
            ? "Could not try again. It may already be running."
            : "Could not dismiss it. It may already be running."}
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
            ? "Dismissing…"
            : dismiss.isSuccess
              ? "Dismissed"
              : "Dismiss"}
        </Button>
        <Button
          disabled={busy || dismiss.isSuccess}
          onClick={() => retry.mutate({ agentId, id })}
          size="sm"
        >
          {retry.isPending
            ? "Trying again…"
            : retry.isSuccess
              ? "Queued again"
              : "Try again"}
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
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-3 py-2.5"
      data-testid="stalled-handoff"
    >
      <IconAlertTriangle aria-hidden className="size-4 text-duet-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{stalledWhat(toName, task)}</p>
        <p className="text-muted-foreground text-sm">Why: {reason}.</p>
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
              Open conversation
            </Button>
          ) : null
        }
      />
    </div>
  );
}
