import { describe, expect, test } from "bun:test";
import { actsOnTheComputer, mutatesBrowser } from "../src/authorisation";
import {
  challengeNotice,
  parseReadPageLimit,
  READ_PAGE_MIN_LIMIT,
  READ_PAGE_TEXT_LIMIT,
} from "../src/read-page";
import { takesATurn } from "../src/turns";

/** The pure parts of `/read-page` (D127). The route itself is in read-page-browser.test.ts. */

describe("the limit a caller may ask for", () => {
  test("is computer_navigate's own, and never more", () => {
    expect(READ_PAGE_TEXT_LIMIT).toBe(6000);
    expect(parseReadPageLimit(undefined)).toEqual({ ok: true, limit: 6000 });
    expect(parseReadPageLimit(4800)).toEqual({ ok: true, limit: 4800 });
    expect(parseReadPageLimit(1_000_000)).toEqual({ ok: true, limit: 6000 });
  });

  test("a stub, a fraction and a non-number are refused", () => {
    for (const bad of [
      0,
      -5,
      READ_PAGE_MIN_LIMIT - 1,
      1.5,
      Number.NaN,
      "6000",
      null,
      [],
    ]) {
      expect(parseReadPageLimit(bad).ok).toBe(false);
    }
  });
});

describe("a human check is reported, never raised", () => {
  test("a Cloudflare challenge and a visible check are said in words that point to computer_navigate", () => {
    const cloudflare = challengeNotice({
      cfMitigated: "challenge",
      text: "",
      visibleChallengeControl: false,
    });
    const visible = challengeNotice({
      text: "Please verify you are human",
      visibleChallengeControl: true,
    });
    for (const notice of [cloudflare, visible]) {
      expect(notice).toContain("not read");
      expect(notice).toContain("computer_navigate");
    }
  });

  test("an ordinary page, and a page that only mentions robots, is not one", () => {
    expect(
      challengeNotice({
        text: "Welcome to our shop",
        visibleChallengeControl: false,
      }),
    ).toBeUndefined();
    expect(
      challengeNotice({
        text: "I'm not a robot is a phrase",
        visibleChallengeControl: false,
      }),
    ).toBeUndefined();
  });
});

describe("the route is held to the rules of a navigation", () => {
  test("refused while a person holds the wheel, taken in turn, and a handback refreshes the snapshot", () => {
    expect(actsOnTheComputer("/read-page")).toBe(true);
    expect(mutatesBrowser("/read-page")).toBe(true);
    expect(takesATurn("POST", "/read-page")).toBe(true);
  });
});
