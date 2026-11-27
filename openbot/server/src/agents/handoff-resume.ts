/**
 * What a hop's answer does when it arrives after the person's decision on a card (D48).
 *
 * A member run for a hand-off (the forward hop) stops when one of its calls needs the person's yes:
 * the card is opened, the run ends with a pause and the hop is over. The person decides later, from
 * the Tasks view, and the approval sweep carries the decision out and runs the member again from the
 * saved call (`approvals/resume-sweep.ts`). That run is in the hop's scratch thread, which nobody
 * watches, so its answer used to end there. This sends it home the way every other hop's answer goes:
 * as a relay on the hand-off queue, to the Bot that asked, in the conversation it was asked in.
 *
 * Which hop it was comes from the signed run the deployment minted for the delivery, kept in the
 * saved call. Nothing a model wrote is read.
 */
import type { OfferedFile } from "@openbot/shared/member-file";
import type { ApprovalContinuation } from "@openbot/toolkit/continuation";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { workItems } from "../db/schema";
import type { WorkQueue } from "../work/queue";
import type { RunAssertion } from "./callback-token";
import { HANDOFF_KIND } from "./handoff";
import { type HandoffWork, relayPayload } from "./handoff-runner";

export function createHopRelay(deps: {
  queue: Pick<WorkQueue, "offer">;
  database: Database;
  readRun: (signed: unknown) => RunAssertion | null;
  /** The Bot of the conversation a hop was asked in, for a hop whose row has been swept away. */
  askerOf: (run: RunAssertion) => Promise<string | null>;
  /**
   * D178: records the files the member offered in the resumed run, as the first run's are (D177), and
   * returns the server's note for the front of the answer, or null. A throw is swallowed.
   */
  offeredFiles?: (input: {
    work: HandoffWork;
    files: readonly OfferedFile[];
  }) => Promise<string | null>;
}) {
  const { queue, database, readRun, askerOf, offeredFiles } = deps;
  /** True when the saved call was a hop's and its answer was queued for the Bot that asked. */
  return async (input: {
    snapshot: ApprovalContinuation;
    approvalId: string;
    answer: string;
    /** D178: `offer_file` results of the resumed run (the sweep read them from the run's own events). */
    files?: readonly OfferedFile[];
  }): Promise<boolean> => {
    const forwarded = input.snapshot.forwardedProps;
    const run =
      forwarded && typeof forwarded === "object" && "openbotRun" in forwarded
        ? readRun((forwarded as { openbotRun?: unknown }).openbotRun)
        : null;
    if (!run?.handoff || !run.threadId) return false;

    const [row] = await database
      .select({ payload: workItems.payload })
      .from(workItems)
      .where(
        and(
          eq(workItems.kind, HANDOFF_KIND),
          eq(workItems.key, run.handoff.key),
        ),
      )
      .limit(1);
    let work = row?.payload as unknown as HandoffWork | undefined;
    // A row that is there but is not a forward hop to this member for this person is a relay or a
    // notice back to the asking Bot, or not this run's: the sweep already wrote what the Bot said
    // into the conversation it was in, so a second relay would make it speak twice.
    if (
      work &&
      (work.toBotId !== run.botId ||
        work.actorId !== run.actorId ||
        work.answerIn !== undefined)
    )
      return false;
    if (!work) {
      // The hop's row is gone (swept after a day): say it from what the signed run knows. The
      // asking Bot is the one of the conversation, found the way the gate finds it.
      const asker = await askerOf(run);
      if (!asker) return false;
      work = {
        fromBotId: asker,
        toBotId: run.botId,
        actorId: run.actorId,
        threadId: run.threadId,
        runId: run.runId,
        depth: run.depth ?? 1,
        ...(run.initiator ? { initiator: run.initiator } : {}),
        task: "a job from earlier in this conversation",
      };
    }
    // D178: the same recorder as the first run's, for this hop's own member only.
    let answer = input.answer;
    if (offeredFiles && input.files && input.files.length > 0) {
      const note = await offeredFiles({ work, files: input.files }).catch(
        () => null,
      );
      if (note) answer = `${note}\n\n${answer}`;
    }
    await queue.offer({
      kind: HANDOFF_KIND,
      // One relay per decision: the sweep that carried this decision out may run its tail twice.
      key: `relay:${run.handoff.key}:card:${input.approvalId}`,
      payload: relayPayload(work, answer) as unknown as Record<string, unknown>,
    });
    return true;
  };
}

/**
 * D176: whether a saved call was a FORWARD hop's, so that its resume is fed only the hop's own
 * messages (`approvals/resume-input-guard.ts`). A relay or a notice back to the asking Bot runs in
 * the asking thread itself and keeps its own tail. A hop whose row has been swept away counts as
 * forward: its saved messages are checked by the framing message, which a relay's tail precedes
 * only with its own conversation.
 */
export function createForwardHopCheck(deps: {
  database: Database;
  readRun: (signed: unknown) => RunAssertion | null;
}) {
  return async (snapshot: ApprovalContinuation): Promise<boolean> => {
    const forwarded = snapshot.forwardedProps;
    const run =
      forwarded && typeof forwarded === "object" && "openbotRun" in forwarded
        ? deps.readRun((forwarded as { openbotRun?: unknown }).openbotRun)
        : null;
    if (!run?.handoff) return false;
    const [row] = await deps.database
      .select({ payload: workItems.payload })
      .from(workItems)
      .where(
        and(
          eq(workItems.kind, HANDOFF_KIND),
          eq(workItems.key, run.handoff.key),
        ),
      )
      .limit(1);
    const work = row?.payload as unknown as HandoffWork | undefined;
    return work ? work.answerIn === undefined : true;
  };
}
