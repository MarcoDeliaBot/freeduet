/**
 * The hand-offs a conversation has open, told to Iris with her run (D185).
 *
 * WHY. Iris must not say "Kai is working" from her own words, and the hand-off claim guard (D184) must
 * not guess from the transcript which hand-offs are open. The server knows: the hop queue (`work_items`,
 * the rows behind the D168 work card) says queued, working, waiting or stuck. So the server puts that
 * fact into the run it starts, in `forwardedProps.openbotOpenHandoffs`, where it already puts the
 * person's language and tone (`person-language.ts`, `person-tone.ts`). agent-freeduet reads it
 * (`agent-freeduet/freeduet/open_handoffs.py`). No route is added and none is widened.
 *
 * SCOPE. Only for Iris's own run (the member `freeduet`), only the hops whose asking thread is the run's
 * own thread, and only the person's own (`ActivityStore.workStatusRows` filters on the owner). A hop in
 * another conversation, or another person's, is never in it. Done hops are not open and are left out.
 *
 * WHAT IT HOLDS. Per hand-off: the asked member's id, its state, when it started, and the time of its
 * last sign of life. No task text, no tool argument, no step label, no path. A caller cannot name it:
 * the middleware drops whatever came in under the key and sets it from the queue.
 *
 * UNKNOWN IS NOT NONE. When the queue cannot be read the key is left out, and agent-freeduet reads that as
 * "unknown" (it falls back to the transcript); an empty `handoffs` list means "none open".
 */
import {
  type AbstractAgent,
  type BaseEvent,
  Middleware,
  type RunAgentInput,
} from "@ag-ui/client";
import { defer, from, type Observable, switchMap } from "rxjs";
import { DEFAULT_MAX_ATTEMPTS } from "../work/queue";
import {
  buildWorkStatus,
  DONE_VISIBLE_MS,
  type HandoffState,
  workNotes,
} from "./work-status";
import type { WorkStatusSources } from "./work-status-routes";

/** The `forwardedProps` key agent-freeduet reads (agent-freeduet/freeduet/open_handoffs.py). */
export const OPEN_HANDOFFS_PROP = "openbotOpenHandoffs";

/** The member whose runs carry it: Iris, the head of the team. */
export const OPEN_HANDOFFS_MEMBER = "freeduet";

export type OpenHandoff = {
  /** The asked member's id. */
  to: string;
  state: Exclude<HandoffState, "done">;
  /** ISO time the work started (or was queued). */
  since: string;
  /** ISO time of the last sign of life. */
  lastEventAt: string;
};

export type OpenHandoffsValue = {
  version: 1;
  handoffs: OpenHandoff[];
  at: string;
};

/** The open hand-offs of one asking thread, for the person the run belongs to. Throws when the queue cannot be read. */
export type LoadOpenHandoffs = (threadId: string) => Promise<OpenHandoff[]>;

/** `forwarded` without whatever a caller put under the key. */
export function withoutOpenHandoffs<T extends Record<string, unknown>>(
  forwarded: T,
): Omit<T, typeof OPEN_HANDOFFS_PROP> {
  const { [OPEN_HANDOFFS_PROP]: _fromCaller, ...own } = forwarded;
  return own;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class OpenHandoffsMiddleware extends Middleware {
  constructor(
    private readonly botId: string,
    private readonly load: LoadOpenHandoffs,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    const forwarded = withoutOpenHandoffs(
      isObject(input.forwardedProps) ? input.forwardedProps : {},
    );
    // Only Iris is told, and only for a thread that has a name.
    if (this.botId !== OPEN_HANDOFFS_MEMBER || !input.threadId)
      return this.runNext({ ...input, forwardedProps: forwarded }, next);
    return defer(() =>
      // A failed read costs a note, not a conversation: the key stays out and the run reads it as unknown.
      from(
        this.load(input.threadId).then(
          (handoffs): OpenHandoffsValue | null => ({
            version: 1,
            handoffs,
            at: new Date(this.now()).toISOString(),
          }),
          () => null,
        ),
      ),
    ).pipe(
      switchMap((value) =>
        this.runNext(
          {
            ...input,
            forwardedProps: value
              ? { ...forwarded, [OPEN_HANDOFFS_PROP]: value }
              : forwarded,
          },
          next,
        ),
      ),
    );
  }
}

/**
 * The reader for one person, from the same two sources as `GET /api/freeduet/work-status`. The states are
 * the ones `buildWorkStatus` decides (the server decides, nobody else); only hops whose asking thread is
 * `threadId` and that are not done are kept.
 */
export function openHandoffsReaderFor(
  sources: WorkStatusSources,
  ownerUserId: string,
  now: () => number = Date.now,
): LoadOpenHandoffs {
  return async (threadId) => {
    const [hops, attention] = await Promise.all([
      sources.hops(ownerUserId, DONE_VISIBLE_MS),
      sources.attention(ownerUserId),
    ]);
    const { handoffs } = buildWorkStatus({
      hops,
      notes: workNotes,
      needsYou: new Map(
        attention.map((row) => [row.agentId, row.questions + row.approvals]),
      ),
      names: new Map(),
      now: now(),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });
    const open: OpenHandoff[] = [];
    for (const hop of handoffs) {
      if (hop.threadId !== threadId || hop.state === "done") continue;
      open.push({
        to: hop.toBotId,
        state: hop.state,
        since: hop.since,
        lastEventAt: hop.lastEventAt ?? hop.since,
      });
    }
    return open;
  };
}
