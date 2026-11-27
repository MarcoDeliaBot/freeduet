import { IconAlertTriangle, IconMessage } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { retryHandoffMutationOptions } from "@/lib/bot-lifecycle/mutations";

/** The words for a stalled hand-off, in one place so every screen says the same thing (D171). */
export function stalledWhat(toName: string, task: string): string {
  return `${toName} did not finish: ${task}`;
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
  const retry = useMutation(retryHandoffMutationOptions(useQueryClient()));
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-3 py-2.5"
      data-testid="stalled-handoff"
    >
      <IconAlertTriangle aria-hidden className="size-4 text-duet-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{stalledWhat(toName, task)}</p>
        <p className="text-muted-foreground text-sm">Why: {reason}.</p>
        {retry.isError ? (
          <p className="text-destructive text-sm" role="alert">
            Could not try again. It may already be running.
          </p>
        ) : null}
      </div>
      {channelId ? (
        <Button
          render={(props) => (
            <Link {...props} params={{ channelId }} to="/channel/$channelId" />
          )}
          size="sm"
          variant="ghost"
        >
          <IconMessage />
          Open conversation
        </Button>
      ) : null}
      <Button
        disabled={retry.isPending || retry.isSuccess}
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
  );
}
