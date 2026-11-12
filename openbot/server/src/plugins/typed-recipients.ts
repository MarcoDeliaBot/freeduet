import type { AuditInitiator } from "../audit";
import { plainAddress } from "./mail-address";

/**
 * Whether the person's own written request already names every recipient of a new email.
 *
 * THE DECISION (docs/M1_PLAN.md, D27). "Write to ana@example.com saying good morning" is the person
 * asking for exactly that email to that address, so a second card asking the same thing is noise. When
 * this says yes, `gmail_send_message` goes out without a card. When it says no, for any reason, the
 * person is asked, so every doubt below resolves to no.
 *
 * It is a pure function of what the SERVER holds, never of what the model says about itself:
 *
 * - THE RUN. Only the person's own live chat turn counts: the run's initiator is absent, which is what
 *   a turn started from the app carries. A turn the server started on the person's behalf (a task, a
 *   message delivered from another channel, a group conversation, the continuation after another
 *   approval) carries an explicit initiator and is refused here, as are routines, check-ins, memory
 *   runs and hand-offs, whose own text is written by a Bot. A hand-off is refused because nothing in
 *   the run says the conversation it came from was the person's live chat rather than a group
 *   conversation or a task, so the origin is not established with certainty (see D27's limits).
 * - THE MESSAGE. The person's latest message of that conversation and no other (a window of one): the
 *   one that started this turn. An earlier message cannot be told from a routine's stored prompt or a check-in's text
 *   that now sits in the same history, so none is trusted, and an address typed long ago can never
 *   pre-approve a later send. A hand-off's envelope, a Bot's text, a tool's result and anything read
 *   from mail, calendar or the web are other roles or other ids and are never looked at.
 * - ONLY WHAT WAS TYPED. A message with attachments is a list of parts, not a string, and is refused;
 *   so is a long one, because a pasted mail or document is the commonest way for somebody else's
 *   words to reach a message the person sent, and "write to x@y.com" is short.
 * - THE ADDRESS. Each recipient must be one whole word of that message, equal ignoring case. A
 *   recipient that merely appears inside a longer address, a different domain, an added dot or a
 *   look-alike character is not that word and does not match. Display names are not accepted.
 *
 * What it cannot see, and says so: a message the person sent by tapping a suggestion a Bot wrote is
 * still the person's message in the history, and a pasted address is still in their message. The
 * person's own words are the approval, and the card still shows everything for any other case.
 */

/** A longer message is a paste, not a request, and approves nothing. */
export const MAX_REQUEST_CHARS = 600;
/** The id the deployment gives the envelope of a hand-off, which a Bot wrote (agents/handoff-delivery.ts). */
export const HANDOFF_MESSAGE_ID_PREFIX = "handoff-";
/** The most recipients one email may have; the adapters hold the same number. */
const MAX_RECIPIENTS = 5;

export type ConversationMessage = {
  id?: string | undefined;
  role?: string | undefined;
  content?: unknown;
};

export type TypedRequestInput = {
  /** The recipients exactly as the call carries them. */
  to: unknown;
  /** The messages of the run the call is made in, as the approval context holds them. */
  messages: readonly ConversationMessage[] | undefined;
  /**
   * The initiator of the RUN, from its approval context. Absent for the person's own live chat turn;
   * anything else is a turn the server started, or a Bot's.
   */
  runInitiator: AuditInitiator | undefined;
  /** The initiator the call itself carries: absent or the person's, never a routine's or a hand-off's. */
  callInitiator: AuditInitiator | undefined;
};

/** Separators between the words of a message; an address is one word. */
const WORD_BREAK = /[\s<>()[\]{},;:"'‘’“”«»]+/;

/** The plain addresses a message holds, each as a whole word, lower case. */
export function addressesTypedIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const word of text.split(WORD_BREAK)) {
    const address = plainAddress(word.replace(/^[.!?]+|[.!?]+$/g, ""));
    if (address !== null) found.add(address);
  }
  return found;
}

export function recipientsTypedByPerson(input: TypedRequestInput): boolean {
  // The run: the person's own live chat turn, and a call that is not a routine's or a Bot's.
  if (input.runInitiator !== undefined) return false;
  if (
    input.callInitiator !== undefined &&
    input.callInitiator.kind !== "person"
  )
    return false;

  const recipients = Array.isArray(input.to) ? input.to : [];
  if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS)
    return false;
  const wanted: string[] = [];
  for (const recipient of recipients) {
    const address = plainAddress(recipient);
    if (address === null) return false;
    wanted.push(address);
  }

  // The message: the person's latest, whole and typed.
  const messages = input.messages ?? [];
  let latest: ConversationMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latest = messages[index];
      break;
    }
  }
  if (!latest || typeof latest.content !== "string") return false;
  if (latest.id?.startsWith(HANDOFF_MESSAGE_ID_PREFIX)) return false;
  if (latest.content.length > MAX_REQUEST_CHARS) return false;

  const typed = addressesTypedIn(latest.content);
  return wanted.every((address) => typed.has(address));
}
