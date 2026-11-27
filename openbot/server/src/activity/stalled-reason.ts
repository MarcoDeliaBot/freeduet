/**
 * D171: the stored reason a hand-off gave up, in words a person reads. The raw text is a thrown error
 * message (a timeout, a platform status, a paused Bot); it never reaches the screen. An unknown reason
 * gets the plain default, not the raw text.
 */
export function plainStalledReason(raw: string | null | undefined): string {
  const text = (raw ?? "").toLowerCase();
  if (!text) return "it did not finish";
  if (/paused/.test(text)) return "its Bot is paused";
  if (/time ?out|timed out|time limit|deadline|aborted|\b300\b/.test(text))
    return "it took longer than the time limit";
  if (/lease|no sign|heartbeat|silen|stuck|stalled|idle/.test(text))
    return "no sign of life for 10 minutes";
  if (/busy/.test(text)) return "the conversation stayed busy";
  if (/platform error|\b5\d\d\b|unavailable|overloaded/.test(text))
    return "the service behind it had a problem";
  if (/refus|not allowed|denied|controls/.test(text))
    return "your settings do not allow it";
  if (/could not be built|not found|no such/.test(text))
    return "that Bot could not be started";
  return "it did not finish";
}
