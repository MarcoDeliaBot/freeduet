/**
 * D171: the stored reason a hand-off gave up, in words a person reads. The raw text is a thrown error
 * message; it never reaches the screen. An unknown reason gets the plain default, not the raw text.
 *
 * The hop's own texts end in a tail that quotes the last event ("after 7 events, the last tool timed
 * out"), which can hold any word. So the tail is cut off first and only the sentence start is matched.
 */
export function plainStalledReason(raw: string | null | undefined): string {
  const head = (raw ?? "")
    .split(
      /\s+after \d+ events|,\s*the last\b|\s+and never reached its model/,
    )[0]
    .trim();
  const text = head.toLowerCase();
  if (!text) return "it did not finish";
  if (/ did not finish within \d+s\b/.test(text))
    return "it took longer than the time limit";
  const idle = text.match(/ showed no sign of life for (\d+) minutes?\b/);
  if (idle) return `there was no sign of life for ${idle[1]} minutes`;
  if (
    / was still working after .* stopped at the limit for one hand-off/.test(
      text,
    )
  )
    return "it ran past the time limit for one hand-off";
  if (/paused/.test(text)) return "its Bot is paused";
  if (/\bbusy\b/.test(text)) return "the conversation stayed busy";
  if (/platform error|unavailable|overloaded/.test(text))
    return "the service behind it had a problem";
  if (/refus|not allowed|denied/.test(text))
    return "your settings do not allow it";
  return "it did not finish";
}
