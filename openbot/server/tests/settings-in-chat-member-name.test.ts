/**
 * The rules for the name a person gives a team member (docs/design/settings-in-chat.md, 8.10).
 * Pure: every rule is one case.
 */
import { describe, expect, test } from "bun:test";
import {
  checkMemberName,
  foldName,
  isWellFormedName,
  type NameContext,
} from "../src/settings-in-chat/member-name";

const context: NameContext = {
  realName: "Leo",
  otherRealNames: ["Otto", "Iris", "Mark"],
  otherAliases: ["Ada"],
};
const refused = (value: unknown, ctx: NameContext = context) => {
  const check = checkMemberName(value, ctx);
  expect(check.ok).toBeFalse();
  return check.ok ? "" : check.message;
};
const accepted = (value: unknown, ctx: NameContext = context) => {
  const check = checkMemberName(value, ctx);
  if (!check.ok) throw new Error(check.message);
  return check.value;
};

describe("a name for a member", () => {
  test("a plain name is kept, trimmed", () => {
    expect(accepted("  Max  ")).toBe("Max");
    expect(accepted("Anna-Maria O'Neil")).toBe("Anna-Maria O'Neil");
    expect(accepted("Zoë")).toBe("Zoë");
  });

  test("1 to 40 characters", () => {
    refused("");
    refused("   ");
    expect(accepted("A".repeat(40))).toBe("A".repeat(40));
    refused("A".repeat(41));
    refused(42);
    refused(undefined);
  });

  test("no control or invisible characters, no line breaks", () => {
    refused("Max\nPay");
    refused("Max\u0000");
    refused("Ma​x");
    refused("Max‮");
    refused("Max x");
    refused("Max\tx");
  });

  test("no markup or punctuation", () => {
    for (const bad of [
      "<b>Max</b>",
      "Max<script>",
      "[Max](http://x)",
      "`Max`",
      "*Max*",
      "Max: hi",
      "Max & Co",
      '"Max"',
      "Max/Ann",
      "{Max}",
      "Max!",
      "Max 🙂",
      "1Max",
    ])
      refused(bad);
  });

  test("two spaces in a row are refused", () => {
    refused("Max  Ann");
  });

  test("it cannot mix Latin with Cyrillic or Greek letters", () => {
    refused("Mаx"); // Cyrillic a
    refused("Ιris"); // Greek capital iota
  });

  test("it cannot pass for a message from the app or an approval", () => {
    for (const bad of [
      "System",
      "Approved",
      "Security Team",
      "Admin",
      "Undo",
      "OpenBot",
      "You",
      "Max Approval",
    ])
      refused(bad);
  });

  test("it cannot equal another member's name or alias, in any case or accent", () => {
    refused("otto");
    refused("OTTO");
    refused("ada");
    refused("ÀDA");
    refused("mark");
  });

  test("only Iris is called Iris", () => {
    refused("Iris");
    refused("iris");
    // Iris herself may keep or take her own name: it is her real name, so it clears the name.
    expect(
      accepted("Iris", {
        realName: "Iris",
        otherRealNames: ["Leo"],
        otherAliases: [],
      }),
    ).toBeNull();
    // Even when Iris is not in the list the person sees.
    refused("Iris", { realName: "Leo", otherRealNames: [], otherAliases: [] });
  });

  test("the member's own name clears the name", () => {
    expect(accepted("leo")).toBeNull();
    expect(accepted("LEO")).toBeNull();
  });

  test("a stored value is re-read strictly", () => {
    expect(isWellFormedName("Max")).toBeTrue();
    expect(isWellFormedName(" Max")).toBeFalse();
    expect(isWellFormedName("<b>")).toBeFalse();
    expect(isWellFormedName(null)).toBeFalse();
    expect(isWellFormedName("A".repeat(41))).toBeFalse();
  });

  test("folding ignores case and accents", () => {
    expect(foldName("ÀDa")).toBe("ada");
  });
});

/**
 * A name that passes for another, or for the app, without being it. The review of this change found
 * the way in: a letter that draws nothing (the Hangul fillers are letters to Unicode and blank to
 * the eye), and a full stop, an apostrophe or a space that the comparison kept. "Otto" and "Otto" +
 * U+3164 are two strings and one picture, and an approval card draws only the picture.
 */
const SAME_AS_ANOTHER = "Another member already has that name.";
const ONLY_IRIS = "Only Iris is called Iris.";
const INVISIBLE = "A name cannot contain invisible characters.";
const IMITATES_THE_APP =
  "That name could pass for a message from the app, so it is not allowed.";

/** Characters Unicode says to ignore when drawing, that the old letters-and-marks test let through. */
const DRAWS_NOTHING: [label: string, character: string][] = [
  ["HANGUL FILLER, U+3164", "\u3164"],
  ["HANGUL JUNGSEONG FILLER, U+1160", "\u1160"],
  ["HANGUL CHOSEONG FILLER, U+115F", "\u115F"],
  ["HALFWIDTH HANGUL FILLER, U+FFA0", "\uFFA0"],
  ["COMBINING GRAPHEME JOINER, U+034F", "\u034F"],
  ["VARIATION SELECTOR-16, U+FE0F", "\uFE0F"],
  ["MONGOLIAN FREE VARIATION SELECTOR ONE, U+180B", "\u180B"],
  ["KHMER VOWEL INHERENT AQ, U+17B4", "\u17B4"],
  ["VARIATION SELECTOR-17, U+E0100", "\u{E0100}"],
];

describe("a name that passes for another member, or for the app", () => {
  for (const [label, character] of DRAWS_NOTHING)
    test(`${label} is refused, at the end and inside a name nobody else has`, () => {
      expect(refused(`Kiki${character}`)).toBe(INVISIBLE);
      expect(refused(`Ki${character}ki`)).toBe(INVISIBLE);
    });

  test("another member's name with a character that draws nothing is refused, not mistaken for a new name", () => {
    for (const [, character] of DRAWS_NOTHING) {
      refused(`Otto${character}`);
      refused(`Ot${character}to`);
      refused(`Ada${character}`);
      // The member's own name with one is not "its own name" either: it is a different string.
      refused(`Leo${character}`);
    }
  });

  test("Iris with a character that draws nothing is refused", () => {
    refused("Iris\u3164");
    refused("I\u3164ris");
    refused("Iris\u1160");
    refused("Iris\uFFA0");
  });

  test("another member's name with a full stop, an apostrophe, a hyphen or a space added is still that name", () => {
    for (const bad of [
      "Otto.",
      "Otto'",
      "O.tto",
      "O t t o",
      "Ot-to",
      "Ot'to",
      "OTT.O",
      "Ótt-o",
      "Mark.",
    ])
      expect(refused(bad)).toBe(SAME_AS_ANOTHER);
  });

  test("another member's alias, the same way", () => {
    for (const bad of ["Ada.", "A.da", "Ad-a", "A d a", "ÀD'A"])
      expect(refused(bad)).toBe(SAME_AS_ANOTHER);
  });

  test("Iris with a mark or a space is still Iris, so only Iris may have it", () => {
    for (const bad of ["Iris.", "Iris'", "I ris", "I-ris", "I.r.i.s"])
      expect(refused(bad)).toBe(ONLY_IRIS);
  });

  test("the plural of a word the app speaks in is as reserved as the word", () => {
    for (const bad of [
      "Approvals",
      "Systems",
      "Admins",
      "Administrators",
      "Roots",
      "Securities",
      "Servers",
      "Undos",
      "Errors",
      "Warnings",
      "Alerts",
      "Notices",
      "Notes",
      "Cards",
      "Routines",
      "Users",
      "Persons",
      "People",
      "Max Approvals",
    ])
      expect(refused(bad)).toBe(IMITATES_THE_APP);
  });

  test("a reserved word with a mark or a space inside it is still reserved", () => {
    for (const bad of [
      "Appr.oval",
      "Sys-tem",
      "Ad min",
      "App'roval",
      "S.y.s.t.e.m.s",
    ])
      expect(refused(bad)).toBe(IMITATES_THE_APP);
  });

  test("a stored value with a character that draws nothing is not well formed", () => {
    expect(isWellFormedName("Kiki\u3164")).toBeFalse();
    expect(isWellFormedName("Ki\u034Fki")).toBeFalse();
    expect(isWellFormedName("Kiki")).toBeTrue();
  });

  test("folding ignores separators and characters that draw nothing", () => {
    expect(foldName("Ot-to.")).toBe("otto");
    expect(foldName("O t'to")).toBe("otto");
    expect(foldName("Otto\u3164")).toBe("otto");
    expect(foldName("Ótt\u034Fo")).toBe("otto");
  });

  test("what the new rules must not take away", () => {
    // A mark written apart from its letter is composed with it, and kept.
    expect(accepted("Zoe\u0308")).toBe("Zoë");
    expect(accepted("D'Artagnan")).toBe("D'Artagnan");
    expect(accepted("Ana María")).toBe("Ana María");
    expect(accepted("Jean-Luc")).toBe("Jean-Luc");
    // One script is one script, whichever it is.
    expect(accepted("Мария")).toBe("Мария");
    expect(accepted("Αλέξανδρος")).toBe("Αλέξανδρος");
    // A name that merely contains a short reserved word's letters is not that word.
    expect(accepted("Noted")).toBe("Noted");
    expect(accepted("Systemic")).toBe("Systemic");
  });
});
