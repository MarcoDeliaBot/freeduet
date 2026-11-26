import { afterEach, describe, expect, test } from "bun:test";
import { BROWSER_ENGINES, parseEngine } from "../src/browser-engine";
import {
  createEngineChecker,
  EngineUnavailableError,
} from "../src/engine-check";
import { stopEgressFilter } from "../src/egress";

/** The parts of the engine check (D156) that need no browser. The real engines are in engine-check-browser.test.ts. */

describe("the engine a request names", () => {
  test("absent means Chromium, and the three engines are accepted", () => {
    expect(parseEngine(undefined)).toEqual({ ok: true, engine: "chromium" });
    expect(parseEngine(null)).toEqual({ ok: true, engine: "chromium" });
    expect(BROWSER_ENGINES).toEqual(["chromium", "firefox", "webkit"]);
    for (const engine of BROWSER_ENGINES)
      expect(parseEngine(engine)).toEqual({ ok: true, engine });
  });

  test("anything else is refused, never guessed", () => {
    for (const bad of ["Firefox", "safari", "", 1, {}, [], "chrome"])
      expect(parseEngine(bad).ok).toBe(false);
  });
});

describe("with no network filter running", () => {
  afterEach(async () => {
    await stopEgressFilter();
  });

  test("Firefox and WebKit are refused, and no browser is started", async () => {
    await stopEgressFilter();
    const checker = createEngineChecker();
    for (const engine of ["firefox", "webkit"] as const) {
      let used = false;
      const outcome = await checker
        .check("bot", engine, async () => {
          used = true;
        })
        .then(
          () => "ran",
          (error: unknown) => error,
        );
      expect(outcome).toBeInstanceOf(EngineUnavailableError);
      expect(String((outcome as Error).message)).toContain("network filter");
      expect(used).toBe(false);
    }
  });
});
