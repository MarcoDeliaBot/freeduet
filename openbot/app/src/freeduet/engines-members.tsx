import { WorkspacePicker } from "./workspace";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DuetCard } from "@/components/duet/kit";
import { PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client, tryClient } from "@/lib/client";
import {
  aloneText,
  blockText,
  CLAUDE_CHOICE_NOTE,
  CLAUDE_DEFAULT_OPTION,
  CLAUDE_EFFORT_LABEL,
  CLAUDE_EFFORT_OPTIONS,
  CLAUDE_ENGINE_ID,
  CLAUDE_MODEL_LABEL,
  CLAUDE_MODEL_OPTIONS,
  CLAUDE_SAVED_TEXT,
  type ClaudeChoice,
  claudeEffortLabel,
  claudeModelLabel,
  CHOICES_UNREADABLE,
  chainText,
  ENGINE_MODES,
  type EngineMode,
  type EnginesReading,
  leftOutText,
  MEMBER_COLUMNS,
  MEMBERS_DESCRIPTION,
  MEMBERS_TITLE,
  type MemberSummary,
  modeControlLabel,
  modeGroupLabel,
  moveDownLabel,
  moveUpLabel,
  ORDER_BREAK_KINDS,
  ORDER_CANCEL,
  ORDER_CONFIRM,
  ORDER_NEW_LABEL,
  ORDER_NOTE,
  ORDER_TICK,
  ORDER_WARNING_TEXT,
  ORDER_WARNING_TITLE,
  type OrderBreakKind,
  orderCancelLabel,
  orderConfirmLabel,
  orderTickLabel,
  orderWarningGroupLabel,
  OWN_ORDER_NOTE,
  pinText,
  RECOMMENDED_ORDER_BUTTON,
  recommendedOrderLabel,
  SAVED_TEXT,
  sourceText,
  UNDO_BUTTON,
  UNDONE_TEXT,
  undoLabel,
} from "./engines-text";

/**
 * Each member's engines, and what happens when one runs out (docs/design/engines-dashboard.md, slices 7a and the
 * dashboard's table).
 *
 * One table with a row per member: the engines it will try, in order (numbered pills), the ones left out and why, and one
 * choice, with a sentence for each answer. A change is saved on the server, applies from the member's next message, and
 * offers an Undo. The page holds no choice of its own: it draws what the server says and sends the person's click, so a
 * refused change shows as it was. Nothing here takes text, a key or a switch for an engine: the only controls are the two
 * answers for each member and an Undo, and they are disabled when the server says the person may not change them (not at
 * the computer, an agent too old to honour a choice, or choices it cannot read). The table sits in a box that scrolls on a
 * narrow screen. Kept in app/src/freeduet/ (docs/UPSTREAM_TOUCHES.md).
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

type OrderChange = { memberId: string; chain: string[]; changed: boolean };

/** D115: the server did not refuse the order, it asks the person to confirm it, and says which kind of break it is. */
class OrderNeedsConfirmation extends Error {
  constructor(readonly kind: OrderBreakKind) {
    super("The order needs the person's confirmation.");
  }
}

/**
 * D112, D115: one member's engines in a new order: the whole chain as the page shows it, moved. `confirmed` is sent as
 * the boolean true, and only after the person ticked the box; an order that leaves the group order (logins, then free,
 * then paid) comes back as `OrderNeedsConfirmation` when it is not.
 */
async function setOrder(
  memberId: string,
  order: string[],
  confirmed: boolean,
): Promise<OrderChange> {
  const response = await tryClient(
    `${ENGINES_PATH}/members/${encodeURIComponent(memberId)}/order`,
    {
      method: "PUT",
      body: confirmed ? { order, confirmed: true } : { order },
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
      kind?: string;
    } | null;
    const kind = ORDER_BREAK_KINDS.find((known) => known === body?.kind);
    if (
      response.status === 409 &&
      body?.code === "order_needs_confirmation" &&
      kind
    )
      throw new OrderNeedsConfirmation(kind);
    throw new Error(body?.error ?? "The order could not be saved.");
  }
  return response.json();
}

type ClaudeChange = { memberId: string; changed: boolean } & ClaudeChoice;

/** D139: one member's Claude model and effort. `null` is the subscription's default. The server checks both against its closed lists. */
async function setClaude(
  memberId: string,
  choice: ClaudeChoice,
): Promise<ClaudeChange> {
  const response = await client(
    `${ENGINES_PATH}/members/${encodeURIComponent(memberId)}/claude`,
    {
      method: "PUT",
      body: choice,
      fallback: "Your choice could not be saved.",
    },
  );
  return response.json();
}

/** An order waiting for the person's yes: what it would be, what it was, and which kind of break it is. */
type PendingOrder = { order: string[]; before: string[]; kind: OrderBreakKind };

/** `chain` with the engine at `at` moved one place, or null when there is no such place. */
function moved(chain: string[], at: number, by: -1 | 1): string[] | null {
  const to = at + by;
  if (to < 0 || to >= chain.length) return null;
  const next = [...chain];
  [next[at], next[to]] = [next[to] as string, next[at] as string];
  return next;
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
  browse = false,
}: {
  reading: EnginesReading;
  browse?: boolean;
  /** Called after a change or an Undo went through, so the page reads the list again. */
  onChanged: () => unknown;
}) {
  const [picked, setPicked] = useState("");
  const agents = useQuery(agentListQueryOptions());
  /** The latest change of each member made on this page, which is the one an Undo can still take back. */
  const [undoable, setUndoable] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<Record<string, string>>({});
  /** The order a member had before its latest move on this page: what Undo puts back (D112). */
  const [orderBefore, setOrderBefore] = useState<Record<string, string[]>>({});
  /** D115: a move that leaves the group order, shown as a warning in the row until it is confirmed or cancelled. */
  const [pending, setPending] = useState<Record<string, PendingOrder>>({});
  /** The "I understand" box of each pending move. It starts empty every time. */
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const clearPending = (memberId: string) => {
    setPending((now) => {
      const { [memberId]: _gone, ...rest } = now;
      return rest;
    });
    setTicked((now) => {
      const { [memberId]: _gone, ...rest } = now;
      return rest;
    });
  };

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
      setOrderBefore((now) => {
        const { [outcome.memberId]: _order, ...rest } = now;
        return rest;
      });
      setSaid((now) => ({ ...now, [outcome.memberId]: SAVED_TEXT }));
      onChanged();
    },
  });
  const claude = useMutation({
    mutationFn: (input: { memberId: string; choice: ClaudeChoice }) =>
      setClaude(input.memberId, input.choice),
    onSuccess: (outcome) => {
      setSaid((now) => ({ ...now, [outcome.memberId]: CLAUDE_SAVED_TEXT }));
      onChanged();
    },
  });
  const reorder = useMutation({
    mutationFn: (input: {
      memberId: string;
      order: string[];
      before: string[];
      undoing: boolean;
      confirmed: boolean;
    }) => setOrder(input.memberId, input.order, input.confirmed),
    onError: (error, input) => {
      if (error instanceof OrderNeedsConfirmation) {
        setTicked((now) => ({ ...now, [input.memberId]: false }));
        setPending((now) => ({
          ...now,
          [input.memberId]: {
            order: input.order,
            before: input.before,
            kind: error.kind,
          },
        }));
      }
    },
    onSuccess: (outcome, input) => {
      clearPending(input.memberId);
      setUndoable((now) => {
        const { [input.memberId]: _mode, ...rest } = now;
        return rest;
      });
      setOrderBefore((now) => {
        const { [input.memberId]: _order, ...rest } = now;
        return input.undoing || !outcome.changed
          ? rest
          : { ...rest, [input.memberId]: input.before };
      });
      setSaid((now) => ({
        ...now,
        [input.memberId]: input.undoing ? UNDONE_TEXT : SAVED_TEXT,
      }));
      // Returned, so the mutation stays pending (arrows and Undo disabled) until the list is read again.
      return onChanged();
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

  const selected =
    members.find((member) => member.id === picked) ??
    members.find((member) => member.id === "freeduet") ??
    members[0];
  const block = reading.cannotChange ?? null;
  const usable = reading.canChange === true;
  const busy =
    change.isPending || undo.isPending || reorder.isPending || claude.isPending;
  // A move that waits for a confirmation is not a failure: it is shown in its row, not as an alert.
  const failure =
    change.error ??
    undo.error ??
    claude.error ??
    (reorder.error instanceof OrderNeedsConfirmation ? null : reorder.error);

  const engineName = (id: string) =>
    reading.engines.find((engine) => engine.id === id)?.name ?? id;
  const memberName = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;

  const choose = (member: MemberSummary, mode: EngineMode) => {
    if (!usable || busy || mode === member.mode) return;
    undo.reset();
    reorder.reset();
    change.mutate({ memberId: member.id, mode });
  };

  const chooseClaude = (member: MemberSummary, choice: ClaudeChoice) => {
    if (!usable || busy) return;
    change.reset();
    undo.reset();
    reorder.reset();
    claude.mutate({ memberId: member.id, choice });
  };

  const move = (member: MemberSummary, at: number, by: -1 | 1) => {
    const order = moved(member.chain, at, by);
    if (!usable || busy || !order) return;
    change.reset();
    undo.reset();
    clearPending(member.id);
    reorder.mutate({
      memberId: member.id,
      order,
      before: member.chain,
      undoing: false,
      confirmed: false,
    });
  };

  const goRecommended = (member: MemberSummary) => {
    if (!usable || busy) return;
    change.reset();
    undo.reset();
    clearPending(member.id);
    reorder.mutate({
      memberId: member.id,
      order: member.recommendedChain,
      before: member.chain,
      undoing: false,
      confirmed: false,
    });
  };

  return (
    <PageSection
      className="mt-0"
      description={MEMBERS_DESCRIPTION}
      title={MEMBERS_TITLE}
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
        <p className="mt-3 text-duet-ink-2 text-sm">{blockText(block)}</p>
      ) : null}
      {usable ? (
        <p className="mt-3 text-duet-ink-2 text-sm">{ORDER_NOTE}</p>
      ) : null}
      {failure ? (
        <p className="mt-3 mb-2 text-destructive text-sm" role="alert">
          {failure.message}
        </p>
      ) : null}
      {browse && selected && (
        <WorkspacePicker
          label="Bot"
          value={selected.id}
          onChange={setPicked}
          options={members.map((member) => ({
            id: member.id,
            label: memberName(member.id),
          }))}
        />
      )}
      <DuetCard className={browse ? "fd-members mt-4" : "mt-4"}>
        <section
          aria-label={MEMBERS_TITLE}
          className="overflow-x-auto px-4 py-2"
        >
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{MEMBERS_TITLE}</caption>
            <thead>
              <tr className="text-left text-duet-ink-2">
                <th className="px-3 py-3 font-medium" scope="col">
                  {MEMBER_COLUMNS.member}
                </th>
                <th className="px-3 py-3 font-medium" scope="col">
                  {MEMBER_COLUMNS.order}
                </th>
                <th className="px-3 py-3 font-medium" scope="col">
                  {MEMBER_COLUMNS.switching}
                </th>
              </tr>
            </thead>
            <tbody>
              {(browse && selected ? [selected] : members).map((member) => {
                const name = memberName(member.id);
                const alone = aloneText(member.chain, engineName);
                const undoId = undoable[member.id];
                const backOrder = orderBefore[member.id];
                const waiting = pending[member.id];
                // A warning belongs to the chain it was made for: if the list changed meanwhile, it is not shown.
                const waitingNow =
                  waiting && waiting.before.join() === member.chain.join()
                    ? waiting
                    : undefined;
                const offRecommended =
                  member.ownOrder &&
                  member.recommendedChain.length === member.chain.length &&
                  member.recommendedChain.join() !== member.chain.join();
                return (
                  <tr
                    className="border-duet-hair-2 border-t align-top"
                    key={member.id}
                  >
                    <th
                      className="whitespace-nowrap px-3 py-4 text-left font-semibold"
                      scope="row"
                    >
                      {name}
                    </th>
                    <td className="px-3 py-4" data-label={MEMBER_COLUMNS.order}>
                      {member.chain.length > 0 ? (
                        <ol
                          aria-label={chainText(member.chain, engineName)}
                          className="flex flex-wrap gap-1.5"
                        >
                          {member.chain.map((id, at) => (
                            <li
                              className="inline-flex items-center gap-1.5 rounded-full border border-duet-hair bg-duet-tile px-2.5 py-1 text-duet-ink"
                              key={id}
                            >
                              <span
                                aria-hidden="true"
                                className="font-semibold text-duet-ink-2"
                              >
                                {at + 1}
                              </span>
                              <span>{engineName(id)}</span>
                              <span className="-mr-1 inline-flex">
                                {at > 0 ? (
                                  <Button
                                    aria-label={moveUpLabel(
                                      engineName(id),
                                      name,
                                    )}
                                    disabled={!usable || busy}
                                    onClick={() => move(member, at, -1)}
                                    size="icon-xs"
                                    variant="ghost"
                                  >
                                    <IconChevronUp />
                                  </Button>
                                ) : null}
                                {at < member.chain.length - 1 ? (
                                  <Button
                                    aria-label={moveDownLabel(
                                      engineName(id),
                                      name,
                                    )}
                                    disabled={!usable || busy}
                                    onClick={() => move(member, at, 1)}
                                    size="icon-xs"
                                    variant="ghost"
                                  >
                                    <IconChevronDown />
                                  </Button>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-duet-ink-2">
                          {chainText(member.chain, engineName)}
                        </p>
                      )}
                      {member.chain.includes(CLAUDE_ENGINE_ID) ? (
                        <div className="mt-2 text-sm">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <label className="inline-flex items-center gap-2 text-duet-ink-2">
                              <span>{CLAUDE_MODEL_LABEL}</span>
                              <select
                                aria-label={claudeModelLabel(name)}
                                className="h-8 rounded-md border border-duet-hair bg-duet-tile px-2 text-duet-ink"
                                disabled={!usable || busy}
                                onChange={(event) =>
                                  chooseClaude(member, {
                                    model:
                                      CLAUDE_MODEL_OPTIONS.find(
                                        (option) =>
                                          option.value === event.target.value,
                                      )?.value ?? null,
                                    effort: member.claude?.effort ?? null,
                                  })
                                }
                                value={member.claude?.model ?? ""}
                              >
                                <option value="">
                                  {CLAUDE_DEFAULT_OPTION}
                                </option>
                                {CLAUDE_MODEL_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="inline-flex items-center gap-2 text-duet-ink-2">
                              <span>{CLAUDE_EFFORT_LABEL}</span>
                              <select
                                aria-label={claudeEffortLabel(name)}
                                className="h-8 rounded-md border border-duet-hair bg-duet-tile px-2 text-duet-ink"
                                disabled={!usable || busy}
                                onChange={(event) =>
                                  chooseClaude(member, {
                                    model: member.claude?.model ?? null,
                                    effort:
                                      CLAUDE_EFFORT_OPTIONS.find(
                                        (option) =>
                                          option.value === event.target.value,
                                      )?.value ?? null,
                                  })
                                }
                                value={member.claude?.effort ?? ""}
                              >
                                <option value="">
                                  {CLAUDE_DEFAULT_OPTION}
                                </option>
                                {CLAUDE_EFFORT_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <p className="mt-1 text-duet-ink-2">
                            {CLAUDE_CHOICE_NOTE}
                          </p>
                        </div>
                      ) : null}
                      {offRecommended ? (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-duet-ink-2 text-sm">
                          <span>{OWN_ORDER_NOTE}</span>
                          <Button
                            aria-label={recommendedOrderLabel(name)}
                            disabled={!usable || busy}
                            onClick={() => goRecommended(member)}
                            size="sm"
                            variant="outline"
                          >
                            {RECOMMENDED_ORDER_BUTTON}
                          </Button>
                        </p>
                      ) : null}
                      {waitingNow ? (
                        <fieldset
                          aria-label={orderWarningGroupLabel(name)}
                          className="mt-3 min-w-0 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-3 text-sm"
                        >
                          <p className="font-semibold">
                            {ORDER_WARNING_TITLE[waitingNow.kind]}
                          </p>
                          <p className="mt-1">
                            {ORDER_WARNING_TEXT[waitingNow.kind]}
                          </p>
                          <p className="mt-1 text-duet-ink-2">
                            {ORDER_NEW_LABEL}{" "}
                            {waitingNow.order.map(engineName).join(", then ")}
                          </p>
                          <label className="mt-2 flex min-h-11 items-start gap-2">
                            <input
                              aria-label={orderTickLabel(name)}
                              checked={ticked[member.id] === true}
                              className="mt-1 size-4"
                              disabled={!usable || busy}
                              onChange={(event) =>
                                setTicked((now) => ({
                                  ...now,
                                  [member.id]: event.target.checked,
                                }))
                              }
                              type="checkbox"
                            />
                            <span>{ORDER_TICK}</span>
                          </label>
                          <div className="mt-1 flex gap-2">
                            <Button
                              aria-label={orderConfirmLabel(name)}
                              disabled={
                                !usable || busy || ticked[member.id] !== true
                              }
                              onClick={() => {
                                if (ticked[member.id] !== true) return;
                                reorder.mutate({
                                  memberId: member.id,
                                  order: waitingNow.order,
                                  before: waitingNow.before,
                                  undoing: false,
                                  confirmed: true,
                                });
                              }}
                              size="sm"
                            >
                              {ORDER_CONFIRM}
                            </Button>
                            <Button
                              aria-label={orderCancelLabel(name)}
                              disabled={busy}
                              onClick={() => {
                                reorder.reset();
                                clearPending(member.id);
                              }}
                              size="sm"
                              variant="outline"
                            >
                              {ORDER_CANCEL}
                            </Button>
                          </div>
                        </fieldset>
                      ) : null}
                      {member.leftOut.map((entry) => (
                        <p
                          className="mt-2 text-duet-ink-2 text-sm"
                          key={entry.id}
                        >
                          {leftOutText(entry, engineName)}
                        </p>
                      ))}
                      {member.pin ? (
                        <p className="mt-2 text-duet-ink-2 text-sm">
                          {pinText(member.pin, engineName)}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className="px-3 py-4"
                      data-label={MEMBER_COLUMNS.switching}
                    >
                      <fieldset className="flex flex-col gap-2 text-sm">
                        <legend className="sr-only">
                          {modeGroupLabel(name)}
                        </legend>
                        {ENGINE_MODES.map(({ mode, label, effect }) => (
                          <label
                            className="flex min-h-11 items-start gap-2"
                            key={mode}
                          >
                            <input
                              aria-label={modeControlLabel(label, name)}
                              checked={member.mode === mode}
                              className="mt-1 size-4"
                              disabled={!usable || busy}
                              name={`engine-mode-${member.id}`}
                              onChange={() => choose(member, mode)}
                              type="radio"
                              value={mode}
                            />
                            <span>
                              <span className="font-medium">{label}</span>
                              <span className="block text-duet-ink-2">
                                {effect}
                              </span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <p className="mt-2 text-duet-ink-2 text-sm">
                        {sourceText(member)}
                      </p>
                      {alone ? (
                        <p className="mt-1 text-duet-ink-2 text-sm">{alone}</p>
                      ) : null}
                      {said[member.id] ? (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span role="status">{said[member.id]}</span>
                          {undoId || backOrder ? (
                            <Button
                              aria-label={undoLabel(name)}
                              disabled={busy}
                              onClick={() => {
                                change.reset();
                                reorder.reset();
                                if (backOrder) {
                                  undo.reset();
                                  reorder.mutate({
                                    memberId: member.id,
                                    order: backOrder,
                                    before: member.chain,
                                    undoing: true,
                                    confirmed: false,
                                  });
                                  return;
                                }
                                if (!undoId) return;
                                undo.mutate({
                                  memberId: member.id,
                                  changeId: undoId,
                                });
                              }}
                              size="sm"
                              variant="outline"
                            >
                              {UNDO_BUTTON}
                            </Button>
                          ) : null}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </DuetCard>
    </PageSection>
  );
}
