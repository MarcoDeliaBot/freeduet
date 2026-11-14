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
