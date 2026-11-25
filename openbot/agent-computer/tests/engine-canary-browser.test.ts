import { afterEach, describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import {
  createEngineChecker,
  EngineUnavailableError,
} from "../src/engine-check";
import {
  setEgressPolicy,
  startEgressFilter,
  stopEgressFilter,
} from "../src/egress";

/**
 * The canary that decides whether Firefox or WebKit may be used at all (D156), tested with Chromium
 * standing in for the engine, so it runs wherever Chromium does.
 *
 * A browser that honours the proxy passes it and is then used; a browser that ignores its proxy (the
 * failure that cannot be seen from reading the code) is refused, and stays refused, and the page is
 * never opened in it.
 *
 *   OPENBOT_COMPUTER_BROWSER=1 bun test tests/engine-canary-browser.test.ts
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";

describe.skipIf(!asked)("the engine canary", () => {
  afterEach(async () => {
    await stopEgressFilter();
  });

  test("a browser that goes through the filter passes, and is used", async () => {
    await startEgressFilter({ env: {} });
    setEgressPolicy("canary-test", { mode: "allow_all", rules: [] });
    const checker = createEngineChecker((_engine, proxy) =>
      chromium.launch({ headless: true, proxy }),
    );
    const used = await checker.check(
      "canary-test",
      "firefox",
      async () => "ran",
    );
    expect(used).toBe("ran");
  }, 90_000);

  test("a browser that ignores its proxy is refused before any page is opened, and stays refused", async () => {
    await startEgressFilter({ env: {} });
    let launches = 0;
    const checker = createEngineChecker(() => {
      launches += 1;
      return chromium.launch({ headless: true });
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let ran = false;
      const outcome = await checker
        .check("canary-test", "webkit", async () => {
          ran = true;
        })
        .then(
          () => "ran",
          (error: unknown) => error,
        );
      expect(outcome).toBeInstanceOf(EngineUnavailableError);
      expect((outcome as Error).message).toContain("network check");
      expect(ran).toBe(false);
    }
    // One canary launch, and no check browser: the second attempt did not even try.
    expect(launches).toBe(1);
  }, 90_000);
});
