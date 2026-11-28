import { expect, test } from "bun:test";
import { plainStalledReason } from "../src/activity/stalled-reason";

test("the real hop texts become plain words, and the tail cannot change the class (D171)", () => {
  const cases: [string, string][] = [
    // handoff-delivery.ts on main
    [
      "kai did not finish within 300s after 7 events, the last tool_result",
      "it took longer than the time limit",
    ],
    [
      "kai did not finish within 300s and never reached its model",
      "it took longer than the time limit",
    ],
    // D170 (handoff-idle-limit-d170)
    [
      "kai showed no sign of life for 10 minutes after 12 events, the last tool_call",
      "there was no sign of life for 10 minutes",
    ],
    [
      "kai was still working after 25 minutes and was stopped at the limit for one hand-off after 40 events, the last text",
      "it ran past the time limit for one hand-off",
    ],
    // a tail that holds other class words must not misclassify
    [
      "kai did not finish within 300s after 3 events, the last request timed out and was paused and busy",
      "it took longer than the time limit",
    ],
    ["The Bot is paused, so it did not run.", "its Bot is paused"],
    ["Intelligence platform error 502", "the service behind it had a problem"],
    ["xyzzy 0x7f boom", "it did not finish"],
  ];
  for (const [raw, plain] of cases) {
    expect(plainStalledReason(raw)).toBe(plain);
    expect(plainStalledReason(raw)).not.toMatch(/Error|0x|tool_|\d{3}/);
  }
  expect(plainStalledReason(null)).toBe("it did not finish");
});
