import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client } from "@/lib/client";
import {
  aloneText,
  blockText,
  CHOICES_UNREADABLE,
  chainText,
  ENGINE_MODES,
  type EngineMode,
  type EnginesReading,
  leftOutText,
  type MemberSummary,
  pinText,
  SAVED_TEXT,
  sourceText,
  UNDONE_TEXT,
} from "./engines-text";

/**
 * Each member's engines, and what happens when one runs out (docs/design/engines-dashboard.md, slice 7a).
 *
 * One row per member: the engines it will try, in order, the ones left out and why, and one choice, with a sentence for
 * each answer. A change is saved on the server, applies from the member's next message, and offers an Undo. The page
 * holds no choice of its own: it draws what the server says and sends the person's click, so a refused change shows as it
 * was. Nothing here takes text, a key or a switch for an engine: the only controls are the two answers for each member
 * and an Undo, and they are disabled when the server says the person may not change them (not at the computer, an agent
 * too old to honour a choice, or choices it cannot read). Kept in app/src/freeduet/ (docs/UPSTREAM_TOUCHES.md).
 */

const ENGINES_PATH = "/api/freeduet/engines";

type ModeChange =
  | {
      status: "changed";
      changeId: string;
      memberId: string;
      previous: EngineMode | null;
      mode: EngineMode;
    }
  | { status: "unchanged"; memberId: string; mode: EngineMode };

async function setMode(
  memberId: string,
  mode: EngineMode,
): Promise<ModeChange> {
  const response = await client(
    `${ENGINES_PATH}/members/${encodeURIComponent(memberId)}/mode`,
    {
      method: "PUT",
      body: { mode },
      fallback: "Your choice could not be saved.",
    },
  );
  return response.json();
}

async function undoChange(changeId: string): Promise<void> {
  await client(`${ENGINES_PATH}/changes/${encodeURIComponent(changeId)}/undo`, {
    method: "POST",
    fallback: "That change could not be undone.",
  });
}

export function EngineMembers({
  reading,
  onChanged,
}: {
  reading: EnginesReading;
  /** Called after a change or an Undo went through, so the page reads the list again. */
  onChanged: () => void;
}) {
  const agents = useQuery(agentListQueryOptions());
  /** The latest change of each member made on this page, which is the one an Undo can still take back. */
  const [undoable, setUndoable] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<Record<string, string>>({});

  const change = useMutation({
    mutationFn: (input: { memberId: string; mode: EngineMode }) =>
      setMode(input.memberId, input.mode),
    onSuccess: (outcome) => {
      setUndoable((now) => {
        const { [outcome.memberId]: _before, ...rest } = now;
        return outcome.status === "changed"
          ? { ...rest, [outcome.memberId]: outcome.changeId }
          : rest;
      });
      setSaid((now) => ({ ...now, [outcome.memberId]: SAVED_TEXT }));
      onChanged();
    },
  });
  const undo = useMutation({
    mutationFn: (input: { memberId: string; changeId: string }) =>
      undoChange(input.changeId),
    onSuccess: (_done, input) => {
      setUndoable((now) => {
        const { [input.memberId]: _undone, ...rest } = now;
        return rest;
      });
      setSaid((now) => ({ ...now, [input.memberId]: UNDONE_TEXT }));
      onChanged();
    },
  });

  const members = reading.members ?? [];
  if (reading.reason || members.length === 0) return null;

  const block = reading.cannotChange ?? null;
  const usable = reading.canChange === true;
  const busy = change.isPending || undo.isPending;
  const failure = change.error ?? undo.error;

  const engineName = (id: string) =>
    reading.engines.find((engine) => engine.id === id)?.name ?? id;
  const memberName = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;

  const choose = (member: MemberSummary, mode: EngineMode) => {
    if (!usable || busy || mode === member.mode) return;
    undo.reset();
    change.mutate({ memberId: member.id, mode });
  };

  return (
    <PageSection
      description="The engines each member tries, in the order it tries them, and what happens when one runs out. A change applies from the member's next message, and you can undo it."
      title="Each member's engines"
    >
      {reading.choices?.state === "unreadable" ? (
        <p
          className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          role="status"
        >
          {CHOICES_UNREADABLE}
        </p>
      ) : null}
      {!usable && block && block !== "choices_unreadable" ? (
        <p className="mt-3 text-muted-foreground text-sm">{blockText(block)}</p>
      ) : null}
      {failure ? (
        <p className="mt-3 mb-2 text-destructive text-sm" role="alert">
          {failure.message}
        </p>
      ) : null}
      <PageRows>
        {members.map((member, index) => {
          const name = memberName(member.id);
          const alone = aloneText(member.chain, engineName);
          const undoId = undoable[member.id];
          return (
            <React.Fragment key={member.id}>
              <Item size="sm">
                <ItemContent>
                  <ItemTitle>{name}</ItemTitle>
                  <ItemDescription className="line-clamp-none">
                    {chainText(member.chain, engineName)}
                  </ItemDescription>
                  {member.leftOut.map((entry) => (
                    <p className="text-muted-foreground text-sm" key={entry.id}>
                      {leftOutText(entry, engineName)}
                    </p>
                  ))}
                  {member.pin ? (
                    <p className="text-muted-foreground text-sm">
                      {pinText(member.pin, engineName)}
                    </p>
                  ) : null}
                  <fieldset className="mt-2 flex flex-col gap-2 text-sm">
                    <legend className="mb-1 font-medium">
                      When an engine runs out
                    </legend>
                    {ENGINE_MODES.map(({ mode, label, effect }) => (
                      <label className="flex items-start gap-2" key={mode}>
                        <input
                          aria-label={`${label} for ${name}`}
                          checked={member.mode === mode}
                          className="mt-1"
                          disabled={!usable || busy}
                          name={`engine-mode-${member.id}`}
                          onChange={() => choose(member, mode)}
                          type="radio"
                          value={mode}
                        />
                        <span>
                          <span className="font-medium">{label}</span>
                          <span className="block text-muted-foreground">
                            {effect}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {sourceText(member)}
                  </p>
                  {alone ? (
                    <p className="text-muted-foreground text-sm">{alone}</p>
                  ) : null}
                  {said[member.id] ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span role="status">{said[member.id]}</span>
                      {undoId ? (
                        <Button
                          aria-label={`Undo the change for ${name}`}
                          disabled={busy}
                          onClick={() => {
                            change.reset();
                            undo.mutate({
                              memberId: member.id,
                              changeId: undoId,
                            });
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Undo
                        </Button>
                      ) : null}
                    </p>
                  ) : null}
                </ItemContent>
              </Item>
              {index !== members.length - 1 && <Separator />}
            </React.Fragment>
          );
        })}
      </PageRows>
    </PageSection>
  );
}
