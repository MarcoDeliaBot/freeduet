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
}) {
  const { queue, database, readRun, askerOf } = deps;
  /** True when the saved call was a hop's and its answer was queued for the Bot that asked. */
  return async (input: {
    snapshot: ApprovalContinuation;
    approvalId: string;
    answer: string;
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
    if (
      !work ||
      work.toBotId !== run.botId ||
      work.actorId !== run.actorId ||
      work.answerIn !== undefined
    ) {
      // The hop's row is gone (swept after a day) or is not this run's: say it from what the signed
      // run knows. The asking Bot is the one of the conversation, found the way the gate finds it.
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
    await queue.offer({
      kind: HANDOFF_KIND,
      // One relay per decision: the sweep that carried this decision out may run its tail twice.
      key: `relay:${run.handoff.key}:card:${input.approvalId}`,
      payload: relayPayload(work, input.answer) as unknown as Record<
        string,
        unknown
      >,
    });
    return true;
  };
}
