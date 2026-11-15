import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useConversationSend } from "@/components/channels/conversation-send";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  cardWords,
  createdRoutineId,
  nextRunWords,
} from "@/lib/routines/chat-card";
import {
  deleteRoutineMutationOptions,
  setRoutineEnabledMutationOptions,
} from "@/lib/routines/mutations";
import { routinesQueryOptions } from "@/lib/routines/queries";
import { deviceTimeZone } from "@/lib/routines/schedule-view";

/**
 * The card under a routine that was written in chat: what it does, when it runs next, and three
 * buttons. It shows the routine as the server has it now, every time it is drawn, so a card in an old
 * conversation says whether the routine is still there, switched on or off.
 *
 * Its buttons are the person's own presses, and they call the routes the Routines page already calls
 * (`server/src/routines/routes.ts`). Edit is the one exception that is not a route: it sends the
 * person's own words through the conversation, so the member changes the routine with `update_routine`
 * and that call asks with its card as always.
 */

/** The longest change the person can send from the card. */
const CHANGE_LIMIT = 1000;

/** The card for a routine a successful `create_routine` call made, and nothing for any other call. */
export function RoutineCreatedCard({
  name,
  result,
}: {
  name: string;
  result?: string;
}) {
  const routineId = createdRoutineId(name, result);
  return routineId === null ? null : <RoutineChatCard routineId={routineId} />;
}

export function RoutineChatCard({
  routineId,
  deviceZone = deviceTimeZone(),
}: {
  routineId: string;
  /** The browser's zone. The card reads it from the browser unless a caller names one. */
  deviceZone?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const routines = useQuery(routinesQueryOptions());
  const setEnabled = useMutation(setRoutineEnabledMutationOptions(queryClient));
  const remove = useMutation(deleteRoutineMutationOptions(queryClient));
  const conversation = useConversationSend();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [change, setChange] = useState("");
  const [changeNote, setChangeNote] = useState<string | null>(null);
  const changeId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  // The safe answer has the focus when the question opens, so Enter does not cancel by accident.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  if (remove.isSuccess) {
    return (
      <CardFrame>
        <p role="status">Routine cancelled</p>
      </CardFrame>
    );
  }

  const page = routines.data;
  if (page === undefined) {
    return (
      <CardFrame>
        {routines.isError ? (
          <p role="alert">
            {routines.error?.message ?? "This routine could not be read."}
          </p>
        ) : (
          <p role="status">Reading this routine…</p>
        )}
      </CardFrame>
    );
  }

  const routine = page.routines.find((candidate) => candidate.id === routineId);
  if (routine === undefined) {
    // A list read again just now may not have the routine yet; "no longer exists" is only said of a list
    // that is settled.
    return (
      <CardFrame>
        <p role="status">
          {routines.isFetching
            ? "Reading this routine…"
            : "This routine no longer exists"}
        </p>
      </CardFrame>
    );
  }

  const busy = setEnabled.isPending || remove.isPending;
  const failure = setEnabled.error ?? remove.error;

  function sendChange() {
    const words = change.trim();
    if (words === "" || !conversation) return;
    if (conversation.send(`Change my routine with id ${routineId}: ${words}`)) {
      setEditing(false);
      setChange("");
      setChangeNote(null);
      return;
    }
    setChangeNote(
      "This conversation cannot take a message right now. Write the change in the message box below.",
    );
  }

  return (
    <CardFrame>
      <p className="font-medium">{cardWords(routine.instruction)}</p>
      <p className="mt-1 text-muted-foreground" role="status">
        {routine.enabled
          ? nextRunWords(
              new Date(routine.nextRunAt),
              routine.timezone,
              deviceZone,
            )
          : "Paused"}
      </p>

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="status">Cancel this routine?</p>
          <Button
            disabled={remove.isPending}
            onClick={() => remove.mutate(routineId)}
            size="sm"
            variant="destructive"
          >
            Yes, cancel it
          </Button>
          <Button
            onClick={() => setConfirming(false)}
            ref={keepRef}
            size="sm"
            variant="outline"
          >
            No, keep it
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() =>
            setEnabled.mutate({ id: routineId, enabled: !routine.enabled })
          }
          size="sm"
          variant="outline"
        >
          {routine.enabled ? "Pause" : "Resume"}
        </Button>
        <Button
          aria-expanded={editing}
          onClick={() => setEditing((open) => !open)}
          size="sm"
          variant="outline"
        >
          Edit
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            remove.reset();
            setConfirming(true);
          }}
          size="sm"
          variant="outline"
        >
          Cancel
        </Button>
      </div>

      {editing ? (
        <div className="mt-3">
          <label className="font-medium" htmlFor={changeId}>
            What should change?
          </label>
          <Textarea
            className="mt-1"
            id={changeId}
            maxLength={CHANGE_LIMIT}
            onChange={(event) => setChange(event.target.value)}
            value={change}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {conversation ? (
              <Button
                disabled={change.trim() === ""}
                onClick={sendChange}
                size="sm"
              >
                Send change
              </Button>
            ) : (
              <p className="text-muted-foreground">
                Write the change in the message box below.
              </p>
            )}
            <Button
              onClick={() => {
                setEditing(false);
                setChangeNote(null);
              }}
              size="sm"
              variant="ghost"
            >
              Close
            </Button>
          </div>
          {changeNote ? <p role="alert">{changeNote}</p> : null}
        </div>
      ) : null}

      {failure ? <p role="alert">{failure.message}</p> : null}
    </CardFrame>
  );
}

function CardFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Routine"
      className="mt-2 max-w-prose rounded-lg border border-border bg-card p-3 text-sm"
    >
      {children}
    </section>
  );
}
