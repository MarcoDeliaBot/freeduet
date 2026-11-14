import { describe, expect, test } from "bun:test";
import { computerTokenFor } from "../src/computer-token";

/**
 * The token each Bot's computer checks its callers against (docs/design/per-computer-token.md).
 *
 * Every computer used to be given one shared `COMPUTER_TOKEN`, and a Bot's shell can read the
 * environment of the process that started it, so the secret that opened every other Bot's computer
 * sat inside each of them. A token of its own is only worth anything if two Bots never get the same
 * one and a computer that knows its own cannot work out another's.
 */
const KEY = "0123456789abcdef".repeat(4);

describe("the token of one Bot's computer", () => {
  test("is 64 hexadecimal characters, which fit a header and a query string as they are", () => {
    expect(computerTokenFor(KEY, "openbot", "freeduet")).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  test("is the same every time it is asked, so a replaced computer gets the token it had", () => {
    expect(computerTokenFor(KEY, "openbot", "freeduet")).toBe(
      computerTokenFor(KEY, "openbot", "freeduet"),
    );
  });

  test("differs from Bot to Bot", () => {
    const tokens = ["freeduet", "otto", "penny", "Otto", "otto2", "a", "b"].map(
      (bot) => computerTokenFor(KEY, "openbot", bot),
    );
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  test("differs from deployment to deployment, for the same Bot and the same secret", () => {
    expect(computerTokenFor(KEY, "openbot", "otto")).not.toBe(
      computerTokenFor(KEY, "staging", "otto"),
    );
  });

  test("differs when the secret differs", () => {
    expect(computerTokenFor(KEY, "openbot", "otto")).not.toBe(
      computerTokenFor(`${KEY}0`, "openbot", "otto"),
    );
  });

  test("keeps a namespace and a Bot apart however their characters run together", () => {
    // Both are letters, digits, hyphen and underscore only (names.ts), so no separator could be
    // confused with a character of either: ("ab", "c") and ("a", "bc") are different computers.
    expect(computerTokenFor(KEY, "ab", "c")).not.toBe(
      computerTokenFor(KEY, "a", "bc"),
    );
  });

  test("is not the secret, and does not contain it", () => {
    const token = computerTokenFor(KEY, "openbot", "otto");
    expect(token).not.toBe(KEY);
    expect(token).not.toContain(KEY.slice(0, 16));
  });

  test("never changes for a Bot unless the way it is made is changed on purpose", () => {
    // Known answers, worked out with `openssl dgst -sha256 -hmac` and not with this code. Changing the
    // derivation changes the token of every computer, and each is then replaced the next time its
    // Bot is used (files and logins kept, an open page lost), so a change is a decision and not an
    // accident. These three are what has to be updated with it.
    expect(computerTokenFor(KEY, "openbot", "freeduet")).toBe(
      "522dff1948fefd6995e687d3ef17e4c1f678a861bd57a1ec83d412ac6d60efac",
    );
    expect(computerTokenFor(KEY, "openbot", "otto")).toBe(
      "f34fc6954b53908eb4117d79e1629052df7e500d68402358da295c6a23d02b7d",
    );
    expect(computerTokenFor(KEY, "other", "freeduet")).toBe(
      "28f2e493647e8058a66e6bb8c9984e5a872b608f698e1600c5990ee94fb1683b",
    );
  });
});
