import {
  asText,
  toolResultDeclined,
  toolResultFailed,
} from "@/lib/plugins/tool-result";
import { englishT, type T } from "@/freeduet/i18n/provider";

/**
 * The words the card under a routine written in chat reads: which routine it is, what it does, and
 * when it runs next.
 *
 * WHERE THE ID COMES FROM. The routines tool answers a successful `create_routine` with a sentence
 * that closes on the routine's id: `That routine is set: "…" — … · id: <id>`, or `That routine is set.
 * Its id is <id>.` when the words cannot be read back (`server/src/plugins/builtin-routines.ts`,
 * `inWords` and `describeWritten`). Nothing else reaches the app, so this file reads that sentence and
 * nothing else, and a failed or refused call gives no id at all.
 */

/** The routines tool as the transcript names it: `mcp__<server>__<tool>`, with the server `routines`. */
export const CREATE_ROUTINE_TOOL = "mcp__routines__create_routine";

/** The most characters of a routine's own words the card shows. A routine may hold 2,000. */
export const CARD_WORDS_LIMIT = 160;

/**
 * The id of the routine a successful `create_routine` call made, or null.
 *
 * Null for every other tool, for a call that failed, was declined or was refused, and for a result whose
 * words are not the ones the routines tool writes, so a card is never drawn from text that did not
 * come from it.
 */
export function createdRoutineId(
  name: string,
  result: string | undefined,
): string | null {
  if (name !== CREATE_ROUTINE_TOOL || result === undefined) return null;
  if (toolResultFailed(result) || toolResultDeclined(result)) return null;
  const answer = asText(result).trim();
  // A routine is switched on when it is made, so the id is the last thing the sentence says.
  const withWords = /^That routine is set: [\s\S]* · id: (\S+)$/.exec(answer);
  if (withWords?.[1]) return withWords[1];
  const bare = /^That routine is set\. Its id is (\S+)\.$/.exec(answer);
  return bare?.[1] ?? null;
}

/**
 * The routine's own words for the card: plain text, cut at `limit` characters with an ellipsis when it is
 * longer. Counted in code points, so a cut never splits a character.
 */
export function cardWords(
  instruction: string,
  limit: number = CARD_WORDS_LIMIT,
): string {
  const text = instruction.trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  return `${characters.slice(0, limit).join("")}…`;
}

/**
 * A moment in one zone, in English: "Monday, 16 November 2026 at 09:00". Null when the platform does not
 * know the zone, so the caller can fall back rather than print a guess.
 */
export function momentIn(
  at: Date,
  zone: string,
  language = "en",
): string | null {
  try {
    // English keeps the day-month-year order the card has always used.
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : language, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: zone,
    }).format(at);
  } catch {
    return null;
  }
}

/**
 * When a switched-on routine runs next, in words. The moment is given in the routine's own zone, and the
 * zone is always named. When the browser's zone is another one, the same moment is given in that zone
 * too, so the person sees both times.
 */
export function nextRunWords(
  at: Date,
  zone: string,
  device: string | undefined,
  t: T = englishT,
  language = "en",
): string {
  const own = momentIn(at, zone, language) ?? at.toUTCString();
  const line = t("routines.nextRun", { when: own, zone });
  if (device === undefined || device === zone) return line;
  const here = momentIn(at, device, language);
  return here === null
    ? line
    : t("routines.nextRunHere", { line, zone: device, when: here });
}
