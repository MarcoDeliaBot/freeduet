import { expect, test } from "bun:test";
import { plainStalledReason } from "../src/activity/stalled-reason";

test("a stored reason becomes plain words, never the raw text (D171)", () => {
  const cases: [string | null, string][] = [
    [
      "AbortError: timed out after 300000 ms",
      "it took longer than the time limit",
    ],
    ["lease expired, no heartbeat", "no sign of life for 10 minutes"],
    ["The Bot is paused, so it did not run.", "its Bot is paused"],
    ["Intelligence platform error 502", "the service behind it had a problem"],
    ["xyzzy 0x7f boom", "it did not finish"],
    [null, "it did not finish"],
  ];
  for (const [raw, plain] of cases) {
    expect(plainStalledReason(raw)).toBe(plain);
    expect(plainStalledReason(raw)).not.toMatch(/Error|0x|\d{3}/);
  }
});
