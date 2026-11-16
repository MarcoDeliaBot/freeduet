/**
 * A program on the person's computer is touched only in a conversation with the person
 * (docs/design/programs-on-your-computer.md 4.4 point 3, D60).
 *
 * The same rule as a setting (`settings-in-chat/own-turn.ts`), read by the same function: a routine, a
 * trigger, a check-in, background research, a memory run, the deployment, a remote session, the FORWARD
 * hop of a hand-off, a hand-off the server cannot trace to the person's own message and a call made outside
 * any run that can wait for the person are all refused, BEFORE any card is opened. A person who is not at
 * the desk is not asked. This is stricter than D35, which would have let the person answer a routine's card
 * later.
 *
 * One more case than a setting has: words that came from the microphone (the `voice-` mark on the latest
 * message of the person's, docs/design/voice.md) are not a typed request, so a programs call in such a turn
 * is refused as well.
 *
 * Only facts the server holds decide: the run's initiator and thread (the approval context), the initiator
 * the call arrived with, and the deployment's own signed statement of the run. Never a word of the model's.
 */
import { latestUserMessageIsVoice } from "@openbot/shared/voice-message";
import type { AuditInitiator } from "../audit";
import {
  type RefusedBecause,
  settingChangeRefusal,
} from "../settings-in-chat/own-turn";

/** What the member reads, and repeats to the person as it stands. */
export const NOT_IN_A_CONVERSATION_WITH_YOU =
  "I only do this in a conversation with you.";

export function programsRefusal(input: {
  context:
    | {
        initiator?: AuditInitiator | undefined;
        threadId?: string | undefined;
        forwardedProps?: unknown;
        messages?: readonly { role?: unknown; id?: unknown }[];
      }
    | undefined;
  callInitiator: AuditInitiator | undefined;
  botId: string;
  actorId: string;
  /** The deployment key the run was signed with. */
  encryptionKey: string;
}): { why: RefusedBecause | "voice"; message: string } | null {
  const refused = settingChangeRefusal(input);
  if (refused)
    return { why: refused.why, message: NOT_IN_A_CONVERSATION_WITH_YOU };
  if (
    input.context?.messages &&
    latestUserMessageIsVoice(input.context.messages)
  )
    return { why: "voice", message: NOT_IN_A_CONVERSATION_WITH_YOU };
  return null;
}
