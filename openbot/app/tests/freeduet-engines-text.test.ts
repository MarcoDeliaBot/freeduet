import { describe, expect, test } from "bun:test";
import {
  engineReasonText,
  engineStateText,
  untilText,
} from "@/freeduet/engines-text";

/**
 * The Engines page's sentences (docs/ENGINES_PLAN.md slice 6). 14 November 2026 at 10:00 UTC is 11:00 in Rome and
 * 05:00 in New York, and every time below is given explicitly, so the wording and the zone are checked, not the
 * machine that runs the test.
 */
const NOW = new Date("2026-11-14T10:00:00Z");
const ROME = "Europe/Rome";

describe("what each engine's state says", () => {
  test("a limit says when it ends, in the person's own time zone", () => {
    // 16:00 UTC is 17:00 in Rome, the same day.
    expect(
      engineStateText(
        { state: "limited", until: "2026-11-14T16:00:00.000Z" },
        NOW,
        ROME,
      ),
    ).toBe("Reached its limit until 17:00");
  });

  test("a failure that trips the breaker says when it tries again", () => {
    // 15:05 UTC is 16:05 in Rome.
    expect(
      engineStateText(
        { state: "not_answering", until: "2026-11-14T15:05:00.000Z" },
        NOW,
        ROME,
      ),
    ).toBe("Not answering, trying again at 16:05");
  });

  test("the same instant reads at the person's own clock", () => {
    // New York is UTC-5 on 14 November (US daylight saving ended on 1 November), so 16:00 UTC is 11:00.
    expect(untilText("2026-11-14T16:00:00.000Z", NOW, "America/New_York")).toBe(
      "11:00",
    );
  });

  test("a time on another day names the day", () => {
    // 08:00 UTC on the 15th is 09:00 in Rome.
    expect(
      engineStateText(
        { state: "limited", until: "2026-11-15T08:00:00.000Z" },
        NOW,
        ROME,
      ),
    ).toBe("Reached its limit until Sun 15 Nov, 09:00");
  });

  test("a waiting state with no time still reads as a sentence", () => {
    expect(engineStateText({ state: "limited", until: null }, NOW, ROME)).toBe(
      "Reached its limit for now",
    );
    expect(
      engineStateText({ state: "not_answering", until: null }, NOW, ROME),
    ).toBe("Not answering for now");
  });

  test("an out-of-credit engine says it is out, and when it is tried again", () => {
    expect(
      engineStateText(
        { state: "out_of_credit", until: "2026-11-14T16:00:00.000Z" },
        NOW,
        ROME,
      ),
    ).toBe("Out of credit, trying again at 17:00");
  });

  test("the states that need no time read plainly", () => {
    expect(engineStateText({ state: "ready", until: null }, NOW, ROME)).toBe(
      "Ready",
    );
    expect(engineStateText({ state: "degraded", until: null }, NOW, ROME)).toBe(
      "Ready, but it has had recent errors",
    );
    expect(engineStateText({ state: "checking", until: null }, NOW, ROME)).toBe(
      "Checking whether it answers again",
    );
    expect(
      engineStateText({ state: "signed_out", until: null }, NOW, ROME),
    ).toBe("Signed out: sign in again with the engine's own login");
    expect(engineStateText({ state: "unknown", until: null }, NOW, ROME)).toBe(
      "State not known",
    );
  });

  test("a time that is not a time is no time", () => {
    expect(untilText("not a time", NOW, ROME)).toBeNull();
  });
});

describe("a gateway's rejected key, and an engine that is not run", () => {
  const GATEWAY_REFUSAL =
    "my-gateway is a paid gateway. FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. Free gateways and your own logins work.";

  test("a gateway that refused its key is told to check the key, not to sign in", () => {
    expect(
      engineStateText(
        {
          state: "signed_out",
          until: null,
          kind: "anthropic-compatible",
          refusal: null,
        },
        NOW,
        ROME,
      ),
    ).toBe("Its gateway did not accept the key. Check the key you gave it.");
  });

  test("the Claude engine signed out keeps its own sign-in sentence", () => {
    expect(
      engineStateText(
        { state: "signed_out", until: null, kind: "cli", refusal: null },
        NOW,
        ROME,
      ),
    ).toBe("Signed out: sign in again with the engine's own login");
  });

  test("a gateway in any other state reads as it did", () => {
    expect(
      engineStateText(
        {
          state: "limited",
          until: "2026-11-14T16:00:00.000Z",
          kind: "anthropic-compatible",
          refusal: null,
        },
        NOW,
        ROME,
      ),
    ).toBe("Reached its limit until 17:00");
  });

  test("a refused engine says it is not run, and gives the reason", () => {
    expect(
      engineStateText(
        {
          state: "refused",
          until: null,
          kind: "anthropic-compatible",
          refusal: GATEWAY_REFUSAL,
        },
        NOW,
        ROME,
      ),
    ).toBe(`Not run: ${GATEWAY_REFUSAL}`);
  });

  test("a refused engine with no reason says the reason is not known", () => {
    expect(
      engineStateText(
        {
          state: "refused",
          until: null,
          kind: "anthropic-compatible",
          refusal: null,
        },
        NOW,
        ROME,
      ),
    ).toBe("Not run: the reason is not known.");
  });
});

describe("why the page lists nothing", () => {
  test("each reason is one plain sentence", () => {
    expect(engineReasonText("off")).toBe(
      "The engines are switched off on this installation (FREEDUET_ROUTER=off), so there is nothing to show.",
    );
    expect(engineReasonText("not_set_up")).toBe(
      "No FreeDuet agent is set up on this installation, so there are no engines to show.",
    );
    expect(engineReasonText("unreachable")).toBe(
      "The FreeDuet agent did not answer, so the engines cannot be read right now. This page asks again every 30 seconds.",
    );
  });
});
