/**
 * Image check (D175): the `playwright` npm package a member's shell can load must be the version whose
 * browsers are installed in the browsers folder, and `require('playwright')` must work from there.
 *
 * Why: Playwright names each browser's folder after a revision that belongs to one package version. A
 * member who runs `npx playwright` with no package installed gets the newest one from npm, whose
 * revisions do not match, and is then asked to download a browser (an approval card, a stopped job).
 * Usage: node playwright-ready.cjs [--modules DIR] [--browsers DIR] [--expect VERSION]
 * Exit 0 with a line of facts when everything agrees, exit 1 with the reason otherwise.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED = ["chromium", "firefox", "webkit"];

function check({ modules, browsers, expect }) {
  const paths = modules ? [modules] : undefined;
  let pkgJson;
  try {
    pkgJson = require.resolve("playwright/package.json", { paths });
  } catch {
    throw new Error(
      `the playwright package is not installed for the shell (searched ${modules || "NODE_PATH"})`,
    );
  }
  const version = JSON.parse(fs.readFileSync(pkgJson, "utf8")).version;
  if (expect && version !== expect) {
    throw new Error(
      `playwright package is ${version} but the image pins ${expect}`,
    );
  }
  const corePkg = require.resolve("playwright-core/package.json", {
    paths: [path.dirname(pkgJson)],
  });
  const coreVersion = JSON.parse(fs.readFileSync(corePkg, "utf8")).version;
  if (coreVersion !== version) {
    throw new Error(
      `playwright ${version} runs on playwright-core ${coreVersion}`,
    );
  }
  const list = JSON.parse(
    fs.readFileSync(path.join(path.dirname(corePkg), "browsers.json"), "utf8"),
  ).browsers;
  const folders = fs.existsSync(browsers) ? fs.readdirSync(browsers) : [];
  const found = [];
  for (const name of REQUIRED) {
    const entry = list.find((b) => b.name === name);
    if (!entry) throw new Error(`playwright ${version} lists no ${name}`);
    const revisions = new Set([
      String(entry.revision),
      ...Object.values(entry.revisionOverrides || {}).map(String),
    ]);
    const dir = folders.find((f) =>
      [...revisions].some((r) => f === `${name}-${r}`),
    );
    if (!dir) {
      throw new Error(
        `playwright ${version} needs ${name}-${entry.revision} in ${browsers}, which holds: ${folders.join(" ") || "nothing"}`,
      );
    }
    found.push(dir);
  }
  // Loading it is the last proof: a package that resolves but cannot be required still stops a test.
  const loaded = require(require.resolve("playwright", { paths }));
  if (typeof loaded.chromium?.launch !== "function") {
    throw new Error("require('playwright') did not give chromium.launch");
  }
  return { version, found };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  try {
    const result = check({
      modules: argValue("--modules"),
      browsers:
        argValue("--browsers") ||
        process.env.PLAYWRIGHT_BROWSERS_PATH ||
        "/ms-playwright",
      expect: argValue("--expect"),
    });
    console.log(
      `playwright ${result.version} matches browsers: ${result.found.join(" ")}`,
    );
  } catch (error) {
    console.error(`playwright image check failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { check };
