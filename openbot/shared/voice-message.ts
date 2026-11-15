/**
 * The mark of words that came from the microphone (docs/design/voice.md, D7 and D8).
 *
 * Two shortcuts stand in for an approval card because the person's own WRITTEN words ask for the
 * action: a new email whose every recipient the person typed (docs/M1_PLAN.md D27, D27a), and a member
 * the person switched to Full access acting in the person's own live turn (D29). Words that came from
 * the microphone are not written words. Dictation sent with one press ("Transcribe and send") was
 * never read by the person, and a voice call's model writes its own request in its own words. Neither
 * earns a shortcut: the turn asks with the card, as a hand-off's does.
 *
 * THE MARK is a prefix on the id of the person's message. The app puts it on the message it sends when
 * the words came from the one-press dictation or from the voice call's model; it does not put it on
 * text that was placed in the box and sent with the Send button, which the person could read and edit.
 * The id is what the server already reads for the same purpose (`handoff-` marks a Bot's envelope), it
 * is stored with the message, so a continuation, a reloaded conversation and a hop's record all see
 * it, and it needs no new field.
 *
 * WHAT THE SERVER CAN AND CANNOT KNOW. It sees only the run the browser sent. It never receives the
 * audio of a call or the voice model's tool call, and the dictation route returns text to the browser
 * and sees nothing of what happens to it next. So it cannot tell by itself that a message came from
 * the microphone, and an ABSENT mark is only "the app did not say so". What it can promise is the
 * other direction: nothing a Bot, a tool, a page or a mail contains can SET the mark (the person's
 * message has the id the app gave it, and only the person's own messages are read for it), and a
 * message that carries it never earns either shortcut, on any path that reads the person's message.
 * A client that leaves the mark off is the person's own browser, which D27 already trusts for the
 * message text itself: whoever can send the person's messages can type the address.
 */

/** The id prefix of a message that came from the microphone, as `handoff-` is a Bot's envelope. */
export const VOICE_MESSAGE_ID_PREFIX = "voice-";

/** An id for a message that came from the microphone, made from a fresh id. */
export function markVoiceMessageId(id: string): string {
  return `${VOICE_MESSAGE_ID_PREFIX}${id}`;
}

/** Whether an id carries the mark. Anything that is not a string does not. */
export function isVoiceMessageId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(VOICE_MESSAGE_ID_PREFIX);
}

/**
 * `derived`, marked when `source` is. A server that makes the id of a run's message out of the id the
 * app chose (a task retried under an id of its own, a group's per-Bot turn) must not wash the mark
 * out on the way, or a message from the microphone would come back as typed.
 */
export function keepVoiceMark(source: unknown, derived: string): string {
  return isVoiceMessageId(source) && !isVoiceMessageId(derived)
    ? markVoiceMessageId(derived)
    : derived;
}

/**
 * Whether the person's latest message in these messages came from the microphone. Only a message of
 * the person's is looked at: the id of a Bot's message or a tool's is nothing to this rule. With no
 * message of the person's there is no mark.
 */
export function latestUserMessageIsVoice(
  messages: readonly { role?: unknown; id?: unknown }[] | undefined,
): boolean {
  if (!messages) return false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return isVoiceMessageId(message.id);
  }
  return false;
}
