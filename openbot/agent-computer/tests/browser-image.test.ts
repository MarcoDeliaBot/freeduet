/**
 * The computer image must carry the three browser engines a member checks pages in: Chromium, Firefox and
 * WebKit (the engine Safari uses). Ada's web-release-check runs Firefox and WebKit only when they are in the
 * image, so a Dockerfile that drops one of them would silently turn those checks into "did not run".
 *
 * Static: it reads the Dockerfile text, the same way `openbot/tests/compose.test.ts` does. It does not build the
 * image, which needs Docker and the network; the build's own `RUN ls -d` line is what fails a real build.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dockerfile = readFileSync(
  join(import.meta.dir, "..", "Dockerfile"),
  "utf8",
);

test("the computer image installs Chromium, Firefox and WebKit with Playwright's dependencies", () => {
  expect(dockerfile).toContain('bunx --bun "playwright@');
  expect(dockerfile).toContain("install --with-deps chromium firefox webkit ");
  expect(dockerfile).toContain("ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright");
});

test("the build fails when one of the three browser folders is missing", () => {
  expect(dockerfile).toContain(
    "RUN ls -d /ms-playwright/chromium-* /ms-playwright/firefox-* /ms-playwright/webkit-* >/dev/null",
  );
});
