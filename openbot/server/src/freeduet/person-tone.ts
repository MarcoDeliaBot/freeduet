/**
 * The tone a person chose for a member (docs/design/settings-in-chat.md, 8.10.2).
 *
 * Three fixed values: `plain` (the default: nothing is added to the member, today's behaviour),
 * `warm` and `formal`. The choice is stored per person and member (`agent_preferences.tone`) and
 * reaches the member as ONE short run note, built by agent-freeduet from
 * `forwardedProps.openbotPersonTone` (agent-freeduet/freeduet/person_tone.py), the way D26's person
 * language does. It never rewrites the member's instructions, and it is never read by the approval
 * gate, the cards or the safety text: those do not take the run's forwarded props at all.
 *
 * A run's `forwardedProps` are partly the browser's own, so a caller could name a tone. This middleware
 * drops whatever came in under the key and sets it from the stored choice for the person the run
 * belongs to. `plain` and "nothing stored" both leave the key absent.
 */
import {
  type AbstractAgent,
  type BaseEvent,
  Middleware,
  type RunAgentInput,
} from "@ag-ui/client";
import { defer, from, type Observable, switchMap } from "rxjs";
import { and, eq } from "drizzle-orm";
import type { ChatTone } from "@openbot/shared/setting-change";
import type { Database } from "../db/client";
import { agentPreferences } from "../db/schema/coworker";

/** The `forwardedProps` key agent-freeduet reads (agent-freeduet/freeduet/person_tone.py). */
export const PERSON_TONE_PROP = "openbotPersonTone";

/** What the middleware asks for: this member's tone for the person the run belongs to. */
export type LoadPersonTone = (botId: string) => Promise<ChatTone | null>;

/** `forwarded` without whatever a caller put under the tone key. */
export function withoutPersonTone<T extends Record<string, unknown>>(
  forwarded: T,
): Omit<T, typeof PERSON_TONE_PROP> {
  const { [PERSON_TONE_PROP]: _fromCaller, ...own } = forwarded;
  return own;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class PersonToneMiddleware extends Middleware {
  constructor(
    private readonly botId: string,
    private readonly load: LoadPersonTone,
  ) {
    super();
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    return defer(() =>
      // A failed read costs a manner of speaking, not a conversation: the run goes on as `plain`.
      from(this.load(this.botId).catch(() => null)),
    ).pipe(
      switchMap((tone) => {
        const forwarded = withoutPersonTone(
          isObject(input.forwardedProps) ? input.forwardedProps : {},
        );
        return this.runNext(
          {
            ...input,
            forwardedProps:
              tone === "warm" || tone === "formal"
                ? { ...forwarded, [PERSON_TONE_PROP]: { version: 1, tone } }
                : forwarded,
          },
          next,
        );
      }),
    );
  }
}

/**
 * The reader for one person: this member's stored tone, or null for `plain` and for "never chose".
 * Anything stored that is not `warm` or `formal` reads as null (the column's CHECK keeps it so).
 */
export function personToneReaderFor(
  database: Pick<Database, "select">,
  ownerUserId: string,
): LoadPersonTone {
  return async (botId) => {
    const [row] = await database
      .select({ tone: agentPreferences.tone })
      .from(agentPreferences)
      .where(
        and(
          eq(agentPreferences.userId, ownerUserId),
          eq(agentPreferences.agentId, botId),
        ),
      )
      .limit(1);
    return row?.tone === "warm" || row?.tone === "formal" ? row.tone : null;
  };
}
