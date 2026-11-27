/**
 * What a run resumed after a card may be fed (D176).
 *
 * A resumed run is built from the messages saved with the card. Two things are checked on the way
 * back in, and each one is logged when it changes anything:
 *
 *  - a FORWARD hop's own messages begin at its framing message (`handoff-<run id>`): anything saved
 *    before that is another thread's (the conversation that asked), which the hop was never
 *    handed. Cards saved before D176 carry such messages.
 *  - a size limit, so one resume can never put megabytes on the person's subscription: the oldest
 *    messages are dropped, the newest (the pending call and what led to it) are kept.
 */
import type { Message } from "@ag-ui/client";
import type { ApprovalContinuation } from "@openbot/toolkit/continuation";

/** The most text a resumed run is fed, in characters of its serialised messages. */
export const MAX_RESUME_INPUT_CHARS = 2_000_000;

const FRAMING_ID = /^handoff-/;

/** A forward hop's messages from its own framing message on; unchanged when there is none. */
export function hopOwnMessages(messages: readonly Message[]): Message[] {
  const first = messages.findIndex((message) => FRAMING_ID.test(message.id));
  return first <= 0 ? [...messages] : messages.slice(first);
}

const size = (message: Message): number => JSON.stringify(message).length;

type Toolish = Message & {
  toolCalls?: readonly { id: string }[];
  toolCallId?: string;
};

/**
 * The newest messages that fit `max` characters, as a request a provider accepts: system messages
 * always stay (in front), the last message (the pending tool call) always stays, and after the cut
 * no `tool` result is left without its assistant call and no assistant call without its results.
 */
export function boundResumeMessages(
  messages: readonly Message[],
  max: number = MAX_RESUME_INPUT_CHARS,
): Message[] {
  const system = messages.filter((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system");
  let budget = max - system.reduce((sum, message) => sum + size(message), 0);
  let from = rest.length;
  while (from > 0) {
    const next = size(rest[from - 1] as Message);
    if (next > budget && from < rest.length) break;
    budget -= next;
    from -= 1;
  }
  if (from === 0) return [...messages];
  let kept = rest.slice(from) as Toolish[];
  // A kept tool result whose assistant call was cut cannot be sent: advance past it.
  const calls = new Set(
    kept.flatMap((message) => (message.toolCalls ?? []).map((call) => call.id)),
  );
  kept = kept.filter(
    (message) =>
      !(message.role === "tool" && !calls.has(message.toolCallId ?? "")),
  );
  // An assistant call whose results were cut is dropped too, except the last one: the pending call.
  const answered = new Set(
    kept.flatMap((message) =>
      message.role === "tool" ? [message.toolCallId ?? ""] : [],
    ),
  );
  kept = kept.filter(
    (message, index) =>
      index === kept.length - 1 ||
      !(
        message.role === "assistant" &&
        (message.toolCalls ?? []).some((call) => !answered.has(call.id))
      ),
  );
  return [...system, ...kept];
}

/**
 * The snapshot a resume may run from. `forwardHop` is true when the saved call was a forward hop's.
 * `log` receives one line for each change.
 */
export function guardedSnapshot(
  snapshot: ApprovalContinuation,
  options: {
    forwardHop: boolean;
    max?: number;
    log?: (line: Record<string, unknown>) => void;
  },
): ApprovalContinuation {
  if (!Array.isArray(snapshot.messages)) return snapshot;
  const log = options.log ?? ((line) => console.warn(JSON.stringify(line)));
  let messages = snapshot.messages;
  if (options.forwardHop) {
    const own = hopOwnMessages(messages);
    if (own.length !== messages.length) {
      log({
        type: "resume-input-trimmed",
        reason: "other-thread-messages-before-the-hop",
        threadId: snapshot.threadId,
        dropped: messages.length - own.length,
      });
      messages = own;
    }
  }
  const bounded = boundResumeMessages(messages, options.max);
  if (bounded.length !== messages.length) {
    log({
      type: "resume-input-trimmed",
      reason: "over-size-limit",
      threadId: snapshot.threadId,
      dropped: messages.length - bounded.length,
      limit: options.max ?? MAX_RESUME_INPUT_CHARS,
    });
    messages = bounded;
  }
  return messages === snapshot.messages ? snapshot : { ...snapshot, messages };
}
