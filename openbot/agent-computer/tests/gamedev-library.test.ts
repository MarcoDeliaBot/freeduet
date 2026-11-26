/**
 * Kai's game-development library (D151, docs/M1_PLAN.md section 107): awesome-gamedev-agent-skills, Apache-2.0,
 * fetched at one pinned commit into /opt/gamedev-skills when the computer image is built. Static, like
 * browser-image.test.ts: it reads the Dockerfile and the member file and does not build the image.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHA = "c6ca6c41c839b68319ffc08430b99ab768debc32";
const LICENSE_SHA256 =
  "6f82dcfeb95a1c0a0452180a3b16f21bf82111780018fed59d95a052b5b75f6c";
const NOTICE_SHA256 =
  "2dcb65b1c5be24e5ba11e937f3996100f4e980d8cf8ac5b30ba1d70dae6c40f8";

const dockerfile = readFileSync(
  join(import.meta.dir, "..", "Dockerfile"),
  "utf8",
);
const agentsYaml = readFileSync(
  join(import.meta.dir, "..", "..", "examples", "freeduet", "agents.yaml"),
  "utf8",
);

test("the library is fetched at the pinned commit, and the build checks it", () => {
  expect(dockerfile).toContain(`ARG GAMEDEV_SKILLS_SHA=${SHA}`);
  expect(dockerfile).toContain(
    "https://github.com/gamedev-skills/awesome-gamedev-agent-skills",
  );
  expect(dockerfile).toContain(
    'test "$(git -C /tmp/gamedev-src rev-parse HEAD)" = "${GAMEDEV_SKILLS_SHA}"',
  );
});

test("LICENSE and NOTICE are checked by hash and ship with the library", () => {
  expect(dockerfile).toContain(
    `ARG GAMEDEV_SKILLS_LICENSE_SHA256=${LICENSE_SHA256}`,
  );
  expect(dockerfile).toContain(
    `ARG GAMEDEV_SKILLS_NOTICE_SHA256=${NOTICE_SHA256}`,
  );
  expect(dockerfile).toContain("sha256sum -c -");
  expect(dockerfile).toContain(
    "cp -r router skills LICENSE NOTICE /opt/gamedev-skills/",
  );
});

test("the library is installed unmodified: read-only, no .git, no repo scripts", () => {
  expect(dockerfile).toContain("chmod -R a-w /opt/gamedev-skills");
  expect(dockerfile).not.toMatch(/cp -r [^\n]*(scripts|tests|\.git)\b/);
});

test("only Kai's prompt names the library path", () => {
  const entries = agentsYaml.split(/^ {2}- id: /m).slice(1);
  const naming = entries
    .filter((e) => e.includes("/opt/gamedev-skills"))
    .map((e) => e.split("\n")[0]?.trim());
  expect(naming).toEqual(["gamedev"]);
  const kai = entries.find((e) => e.startsWith("gamedev"))!;
  expect(kai).toContain("know-how, never permission");
});

test("no other file in the computer package mentions the library path", () => {
  const src = readFileSync(
    join(import.meta.dir, "..", "src", "index.ts"),
    "utf8",
  );
  expect(src).not.toContain("gamedev-skills");
});
