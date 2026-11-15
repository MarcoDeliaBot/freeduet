/**
 * The name a person gives a team member, as only that person sees it (docs/design/settings-in-chat.md,
 * 8.10). Pure: the rules and nothing else.
 *
 * A NAME IS A LABEL THE APP DRAWS. It is never a member's identity: audit rows, the package row and the
 * names members call each other keep the real name. So a name must not be able to pass for anything the
 * app or an approval says, and must not collide with a name the person already sees.
 *
 * The rules, in the order they are checked:
 * 1. Normalised (NFC) and trimmed; 1 to 40 characters after that.
 * 2. Nothing that Unicode ignores when it draws (`INVISIBLE`): the Hangul fillers, which are letters to
 *    Unicode and blank to the eye, joiners, variation selectors, the soft hyphen, bidirectional and tag
 *    characters. A name with one reads exactly like the name without it.
 * 3. Letters, combining marks, digits, and single spaces, apostrophes, full stops and hyphens between
 *    them. Nothing else: no control characters, no markup or punctuation of any kind, no emoji. It
 *    starts with a letter.
 * 4. Not mixed between Latin, Cyrillic and Greek letters: the usual way to write a lookalike.
 * 5. Not a word the app or an approval speaks in (`RESERVED_WORDS`, plurals included), and not such a
 *    word with a space, an apostrophe, a full stop or a hyphen cut into it.
 * 6. Not the name or the alias of another member the person sees, compared without case, accents,
 *    spaces, apostrophes, full stops or hyphens (`foldName`), and not "Iris" for anybody but Iris.
 *
 * LIMIT: a name written wholly in another script that looks like a Latin one is not caught, and neither
 * is a digit or another lookalike in place of a letter ("Ott0"). The person is asked on a card that shows
 * the exact value, and the places where they decide an action show the member's own name beside it; the
 * check stops accidents and a crude imitation, not a determined one.
 */

import { MEMBER_NAME_MAX } from "@openbot/shared/setting-change";

export { MEMBER_NAME_MAX };

/**
 * Words a name may not contain, whole, in any case: what the app and its approvals say in their own
 * voice, and the plurals of the nouns among them ("Approvals" passes for the app as well as "Approval").
 */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  "system",
  "admin",
  "administrator",
  "root",
  "security",
  "server",
  "openbot",
  "freeduet",
  "approval",
  "approve",
  "approved",
  "allow",
  "allowed",
  "deny",
  "denied",
  "refuse",
  "refused",
  "blocked",
  "undo",
  "undone",
  "done",
  "error",
  "warning",
  "alert",
  "notice",
  "note",
  "card",
  "routine",
  "verified",
  "verify",
  "confirm",
  "confirmed",
  "you",
  "me",
  "user",
  "person",
  // The plurals of the nouns above.
  "systems",
  "admins",
  "administrators",
  "roots",
  "securities",
  "servers",
  "openbots",
  "freeduets",
  "approvals",
  "undos",
  "errors",
  "warnings",
  "alerts",
  "notices",
  "notes",
  "cards",
  "routines",
  "users",
  "persons",
  "people",
]);

const ALLOWED =
  /^[\p{L}][\p{L}\p{M}\p{N}]*(?:[ '.-][\p{L}\p{M}\p{N}]+)*[.']?$/u;

/**
 * A character Unicode says to ignore when it draws a string (`Default_Ignorable_Code_Point`): the Hangul
 * fillers (letters to Unicode, blank to the eye), the combining grapheme joiner, joiners and variation
 * selectors, the soft hyphen, the bidirectional controls and the tag characters. "Otto" and "Otto" +
 * U+3164 are two strings and one picture, and an approval card draws only the picture.
 */
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/u;

/** Composed, lower case, without accents or characters that draw nothing. The separators stay, so words can still be told apart. */
function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}|\p{Default_Ignorable_Code_Point}/gu, "")
    .normalize("NFC")
    .toLowerCase();
}

/**
 * The form two names are compared in: `plain`, and without the spaces, apostrophes, full stops and
 * hyphens that may sit between the letters, so "Otto.", "O t t o" and "Ot-to" all fold to "otto".
 */
export function foldName(value: string): string {
  return plain(value).replace(/[ '.-]/g, "");
}

function scriptsOf(value: string): Set<string> {
  const found = new Set<string>();
  for (const letter of value.match(/\p{L}/gu) ?? []) {
    if (/\p{Script=Latin}/u.test(letter)) found.add("latin");
    else if (/\p{Script=Cyrillic}/u.test(letter)) found.add("cyrillic");
    else if (/\p{Script=Greek}/u.test(letter)) found.add("greek");
  }
  return found;
}

export type NameContext = {
  /** The member's own real name. A name equal to it clears the alias. */
  realName: string;
  /** Real names of the other members the person sees. */
  otherRealNames: readonly string[];
  /** Aliases this person gave the other members. */
  otherAliases: readonly string[];
};

export type NameCheck =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

const refuse = (message: string): NameCheck => ({ ok: false, message });

/** Whether a stored value is still well formed, for readers that must not trust the database blindly. */
export function isWellFormedName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.normalize("NFC").trim();
  return (
    trimmed === value &&
    Array.from(trimmed).length >= 1 &&
    Array.from(trimmed).length <= MEMBER_NAME_MAX &&
    !INVISIBLE.test(trimmed) &&
    ALLOWED.test(trimmed)
  );
}

/**
 * The name to store, or why not. `value: null` means "the member's own name": nothing is stored.
 */
export function checkMemberName(raw: unknown, context: NameContext): NameCheck {
  if (typeof raw !== "string") return refuse("Say which name to use.");
  const value = raw.normalize("NFC").trim();
  const length = Array.from(value).length;
  if (length < 1 || length > MEMBER_NAME_MAX)
    return refuse(`A name is 1 to ${MEMBER_NAME_MAX} characters.`);
  if (INVISIBLE.test(value))
    return refuse("A name cannot contain invisible characters.");
  if (!ALLOWED.test(value))
    return refuse(
      "A name is letters, numbers and single spaces, apostrophes, full stops or hyphens, and starts with a letter.",
    );
  if (scriptsOf(value).size > 1)
    return refuse("A name cannot mix Latin, Cyrillic and Greek letters.");
  const folded = foldName(value);
  // A reserved word whole among other words, or the whole name with its separators cut out of it:
  // "Max Approval" and "Appr.oval".
  if (
    plain(value)
      .split(/[ '.-]+/)
      .some((word) => RESERVED_WORDS.has(word)) ||
    RESERVED_WORDS.has(folded)
  )
    return refuse(
      "That name could pass for a message from the app, so it is not allowed.",
    );
  if (folded === foldName(context.realName)) return { ok: true, value: null };
  if (folded === "iris") return refuse("Only Iris is called Iris.");
  if (
    context.otherRealNames.some((name) => foldName(name) === folded) ||
    context.otherAliases.some((name) => foldName(name) === folded)
  )
    return refuse("Another member already has that name.");
  return { ok: true, value };
}
