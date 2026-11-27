/**
 * D175: a member tests with the browsers already in his computer. The package his shell loads must be the
 * version whose browsers are installed, and `require('playwright')` must work. `image-check/playwright-ready.cjs`
 * is what the Dockerfile runs at build time; these cases run the same script here and in CI with no Docker.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const { check } = require("../image-check/playwright-ready.cjs") as {
  check: (o: { modules?: string; browsers: string; expect?: string }) => {
    version: string;
    found: string[];
  };
};

const dockerfile = readFileSync(join(import.meta.dir, "..", "Dockerfile"), "utf8");
const here = join(import.meta.dir, "..", "node_modules");
const corePkg = require.resolve("playwright-core/package.json", { paths: [here] });
const browsersJson = JSON.parse(
  readFileSync(join(dirname(corePkg), "browsers.json"), "utf8"),
).browsers as { name: string; revision: string }[];
const version = JSON.parse(readFileSync(corePkg, "utf8")).version as string;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pw-ready-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function install(names: string[], skip?: string) {
  for (const n of names) {
    if (n === skip) continue;
    const rev = browsersJson.find((b) => b.name === n)?.revision;
    mkdirSync(join(dir, `${n}-${rev}`));
  }
}

describe("playwright package and browsers agree", () => {
  test("matching revisions and a loadable package pass", () => {
    install(["chromium", "firefox", "webkit"]);
    const r = check({ modules: here, browsers: dir, expect: version });
    expect(r.version).toBe(version);
    expect(r.found).toHaveLength(3);
  });

  test("a browser folder of another revision fails", () => {
    install(["chromium", "firefox"]);
    mkdirSync(join(dir, "webkit-1"));
    expect(() => check({ modules: here, browsers: dir })).toThrow(/webkit-/);
  });

  test("a package version other than the pinned one fails", () => {
    install(["chromium", "firefox", "webkit"]);
    expect(() =>
      check({ modules: here, browsers: dir, expect: "0.0.1" }),
    ).toThrow(/pins 0.0.1/);
  });

  test("a shell with no playwright package fails", () => {
    install(["chromium", "firefox", "webkit"]);
    expect(() => check({ modules: dir, browsers: dir })).toThrow(
      /not installed/,
    );
  });
});

describe("the Dockerfile wires it (D175)", () => {
  test("installs the package from the same ARG that installs the browsers, then checks", () => {
    expect(dockerfile).toContain('"playwright@${PLAYWRIGHT_VERSION}" "@playwright/test@${PLAYWRIGHT_VERSION}"');
    expect(dockerfile).toContain("ENV NODE_PATH=/usr/local/lib/node_modules");
    expect(dockerfile).toContain("ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1");
    expect(dockerfile).toContain(
      'node /opt/image-check/playwright-ready.cjs --expect "${PLAYWRIGHT_VERSION}"',
    );
    expect(dockerfile.match(/PLAYWRIGHT_VERSION=/g)).toHaveLength(1);
  });

  test("the skip switch is set after the browsers are installed", () => {
    expect(dockerfile.indexOf("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1")).toBeGreaterThan(
      dockerfile.indexOf("install --with-deps chromium firefox webkit"),
    );
  });
});

// The `computer (real browser)` job installs the three browsers with this very package version. Where a
// browsers folder with browsers in it exists, the script must agree with it: the real thing, not a fake folder.
const realBrowsers =
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache", "ms-playwright");
const haveReal =
  existsSync(realBrowsers) &&
  ["chromium-", "firefox-", "webkit-"].every((p) =>
    readdirSync(realBrowsers).some((f) => f.startsWith(p)),
  );

test.skipIf(!haveReal)(
  "the browsers the installer put in the browsers folder match the package",
  () => {
    expect(check({ modules: here, browsers: realBrowsers }).version).toBe(version);
  },
);
