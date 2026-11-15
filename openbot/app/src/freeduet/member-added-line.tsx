import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  settingChangesKey,
  settingChangesQueryOptions,
  undoSettingChange,
} from "@/lib/settings-changes";

/*
 * The one line a Bot leaves after the person pressed Create on a proposed member (docs/design/settings-in-chat.md,
 * 8.11): what was added, with Undo and Details. It stands in place of the completed proposal card, so the line is
 * the whole of what stays in the conversation.
 *
 * UNDO IS THE SERVER'S, AND IS THE EXISTING ONE. The button calls the person's own route
 * (`POST /api/settings-changes/:id/undo`, the route the settings cards use). Its answer is the line's: "Undone", or
 * the route's own sentence when it refuses (changed since, already undone, older than seven days).
 *
 * AFTER A RELOAD, THE LIST DECIDES. The line finds its change in the person's list by the member's id, so it needs
 * nothing remembered in the browser. A member with no record (the server refused it, or it is not among the newest
 * twenty) keeps Details and shows no Undo.
 */

type LineState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "undone" }
  | { kind: "refused"; message: string }
  | { kind: "failed" };

const COULD_NOT_UNDO = "Could not undo that just now. Try again in a moment.";

export function MemberAddedLine({
  agentId,
  card,
}: {
  agentId: string;
  /** The completed proposal card, shown instead while the server has no record of this member. */
  card: ReactNode;
}) {
  const queryClient = useQueryClient();
  const list = useQuery(settingChangesQueryOptions());
  const [state, setState] = useState<LineState>({ kind: "idle" });
  const [open, setOpen] = useState(false);

  const found = list.data?.find(
    (row) => row.setting === "member" && row.agentId === agentId,
  );
  const listed = found?.setting === "member" ? found : undefined;
  const undone = state.kind === "undone" || listed?.undone === true;
  const refused = state.kind === "refused";
  const canUndo = listed?.undoable === true && !undone && !refused;
  const busy = state.kind === "busy";

  async function undo() {
    if (!listed) return;
    setState({ kind: "busy" });
    const answer = await undoSettingChange(listed.changeId);
    if (answer.undone) setState({ kind: "undone" });
    else if (answer.refused)
      setState({
        kind: "refused",
        message: answer.message ?? COULD_NOT_UNDO,
      });
    else setState({ kind: "failed" });
    void queryClient.invalidateQueries({ queryKey: settingChangesKey });
  }

  // The line is only for a member the server recorded: what it says is read from that record.
  if (!listed) return <>{card}</>;
  const name = listed.newValue;
  const job = listed.job;
  const skills = listed.skills;

  return (
    <section
      aria-label={`${name} added`}
      className="rounded-lg border border-border px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1">
          {undone ? (
            <span role="status">
              {name} was added and then removed. Undone.
            </span>
          ) : (
            <>{name} was added to your team.</>
          )}
        </p>
        {canUndo ? (
          <button
            className="font-semibold underline underline-offset-4 disabled:opacity-50"
            disabled={busy}
            onClick={undo}
            type="button"
          >
            {busy ? "Undoing…" : "Undo"}
          </button>
        ) : null}
        <button
          aria-expanded={open}
          className="underline underline-offset-4"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          Details
        </button>
      </div>
      {open ? (
        <dl className="mt-2 grid grid-cols-[minmax(0,5rem)_1fr] gap-x-3 gap-y-1 text-muted-foreground text-xs">
          <dt>Name</dt>
          <dd className="break-words">{name}</dd>
          <dt>Job</dt>
          <dd className="break-words">{job}</dd>
          <dt>Skills</dt>
          <dd className="break-words">
            {skills.length > 0 ? skills.map((s) => `/${s}`).join(", ") : "None"}
          </dd>
          <dt>Undo</dt>
          <dd>
            Removes {name}
            {skills.length > 0 ? " and the skills it was given" : ""}. It works
            only while {name} has not been used, shared or changed.
          </dd>
          {!undone ? (
            <dd className="col-span-2">
              <Link
                className="underline underline-offset-4"
                params={{ agentId }}
                to="/bots/$agentId"
              >
                Open {name}
              </Link>
            </dd>
          ) : null}
        </dl>
      ) : null}
      {refused ? (
        <p className="mt-1 text-destructive text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "failed" ? (
        <p className="mt-1 text-destructive text-xs" role="alert">
          {COULD_NOT_UNDO}
        </p>
      ) : null}
    </section>
  );
}
