import { describe, expect, test } from "bun:test";
import { computerTokenFor } from "../src/computer-token";
import { environmentFor } from "../src/environment";
import { NAMESPACE } from "../src/names";

const KEY = "k".repeat(64);

/**
 * A computer that is given no token refuses to start, so the environment is never built without the
 * key its token is made from; a whitespace-only value used to be dropped here and the child then
 * exited at boot, a crash loop from a value the supervisor had accepted. Invalid
 * `COMPUTER_BROWSER_MODE` was likewise forwarded to crash the child instead of failing fast here.
 */
describe("supervisor environment hardening", () => {
  test("refuses to build an environment without the key a token is made from", () => {
    for (const missing of [undefined, "", "   "]) {
      expect(() =>
        environmentFor("bot-1", {
          SUPERVISOR_TOKEN: missing,
          COMPUTER_BROWSER_MODE: "headless",
        }),
      ).toThrow(/SUPERVISOR_TOKEN is not set/);
    }
  });

  test("a deployment's shared COMPUTER_TOKEN is no substitute for the key", () => {
    expect(() =>
      environmentFor("bot-1", { COMPUTER_TOKEN: "shared-secret" }),
    ).toThrow(/SUPERVISOR_TOKEN is not set/);
  });

  test("trims a padded key, as the supervisor's own check of its callers does", () => {
    expect(
      environmentFor("bot-1", { SUPERVISOR_TOKEN: `  ${KEY}  ` }),
    ).toContain(`COMPUTER_TOKEN=${computerTokenFor(KEY, NAMESPACE, "bot-1")}`);
  });

  test("refuses an invalid browser mode instead of forwarding it", () => {
    expect(() =>
      environmentFor("bot-1", {
        SUPERVISOR_TOKEN: KEY,
        COMPUTER_BROWSER_MODE: "fullscreen",
      }),
    ).toThrow(/headless or headed/);
  });

  test("accepts both valid modes", () => {
    for (const mode of ["headless", "headed"]) {
      expect(
        environmentFor("bot-1", {
          SUPERVISOR_TOKEN: KEY,
          COMPUTER_BROWSER_MODE: mode,
        }),
      ).toContain(`COMPUTER_BROWSER_MODE=${mode}`);
    }
  });
});
