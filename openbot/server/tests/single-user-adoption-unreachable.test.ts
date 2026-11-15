/**
 * The move is a program a person types, and nothing else can reach it
 * (docs/design/single-user-to-sign-in.md, sections 5 and 6.5).
 *
 * WHY THIS IS A TEST. The move hands everything one person owns to an address. The two ways that
 * could happen without the person meaning it are a request (an HTTP route, anybody who could reach
 * the server) and a start-up (a script, a container command or a migration that ran it for them).
 * Neither exists today, and nothing would say so the day somebody added one, so this reads the
 * source for both:
 *
 *  - no module of the server imports the adoption code, which is what a route or a boot step would
 *    have to do, and no route is named for it;
 *  - nothing the adoption code imports can serve or route a request;
 *  - no file that starts anything (package scripts, shell scripts, compose and Docker files, CI
 *    workflows, the chart) names the script.
 *
 * Each rule has a positive control that plants an offender in a fixture tree and runs the whole scan
 * over it, so the scan is shown to see what it is there to see (see assertion-shape.test.ts).
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { sourceFiles, stripComments } from "./support/source-scan";

const OPENBOT = resolve(import.meta.dir, "..", "..");
const ADOPT_DIR = join("server", "src", "freeduet", "adopt");
const SCRIPT_NAME = "adopt-single-user-data";

/** An import of anything inside the adoption folder, in any of the three ways a module is imported. */
const IMPORTS_ADOPT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`][^"'`]*\/adopt(?:\/[^"'`]*)?["'`]/;

/** A route or a path that is named for the move, as a string literal. */
const ROUTE_FOR_ADOPT = /["'`]\/[^"'`\s]*adopt[^"'`\s]*["'`]/i;

/** What can serve or route a request. The adoption code only ever asks, with `fetch`, and never listens. */
const SERVES =
  /\bfrom\s*["'`](?:hono|express|fastify|koa|node:http|node:https|http|https)["'`]|\bBun\.serve\b|\.listen\s*\(|\bnew\s+Hono\b/;

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "docs",
  "drizzle",
  ".logs",
]);

/** Every file under `root` whose name says it starts something or configures how things start. */
function startupFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(full);
      } else if (
        /\.(sh|ya?ml|toml|json|mjs|cjs|js|ts)$/.test(entry.name) ||
        /^Dockerfile/.test(entry.name)
      ) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found.sort();
}

type Finding = { file: string; why: string };

/** Every way the adoption code could be reached by something other than a person typing its name. */
function scan(root: string): Finding[] {
  const findings: Finding[] = [];

  // 1. The server's own code: no import of the adoption folder, no route named for it.
  const server = join(root, "server", "src");
  for (const file of sourceFiles(server, [".ts", ".tsx"])) {
    if (relative(root, file).startsWith(ADOPT_DIR)) continue;
    const code = stripComments(readFileSync(file, "utf8"));
    if (IMPORTS_ADOPT.test(code))
      findings.push({
        file: relative(root, file),
        why: "imports the adoption code",
      });
    if (ROUTE_FOR_ADOPT.test(code))
      findings.push({
        file: relative(root, file),
        why: "names a route for the move",
      });
  }

  // 2. The adoption code itself: nothing in it serves or routes.
  const adopt = join(root, ADOPT_DIR);
  for (const file of sourceFiles(adopt, [".ts"])) {
    const code = stripComments(readFileSync(file, "utf8"));
    if (SERVES.test(code))
      findings.push({
        file: relative(root, file),
        why: "can serve or route a request",
      });
  }

  // 3. Anything that starts something, or says how: it does not name the script.
  for (const file of startupFiles(root)) {
    const path = relative(root, file);
    if (path.startsWith(join("server", "tests"))) continue;
    if (path.startsWith(ADOPT_DIR)) continue;
    if (path === join("scripts", `${SCRIPT_NAME}.ts`)) continue;
    if (readFileSync(file, "utf8").includes(SCRIPT_NAME))
      findings.push({ file: path, why: "starts the move" });
  }
  return findings;
}

let fixture: string;

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), "adopt-unreachable-"));
  for (const directory of [
    join("server", "src", "freeduet", "adopt"),
    join("server", "src", "routes"),
    "scripts",
  ]) {
    mkdirSync(join(fixture, directory), { recursive: true });
  }
  writeFileSync(
    join(fixture, ADOPT_DIR, "command.ts"),
    'import { readPlan } from "./plan";\nexport const main = () => readPlan;\n',
  );
  writeFileSync(
    join(fixture, "scripts", `${SCRIPT_NAME}.ts`),
    'import { main } from "../server/src/freeduet/adopt/command";\nmain();\n',
  );
});

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

test("nothing in the server imports the move, names a route for it, or can start it", () => {
  // The scan has to be looking at the real tree: a wrong root would find nothing and pass.
  expect(
    sourceFiles(join(OPENBOT, "server", "src"), [".ts"]).length,
  ).toBeGreaterThan(100);
  const starting = startupFiles(OPENBOT).map((file) => relative(OPENBOT, file));
  expect(starting).toContain("package.json");
  expect(starting).toContain(join("scripts", "start.sh"));
  expect(starting).toContain("docker-compose.yml");
  expect(starting).toContain("Dockerfile");
  expect(starting).toContain(join("scripts", `${SCRIPT_NAME}.ts`));

  expect(scan(OPENBOT)).toEqual([]);
});

test("the scan sees an import of the move from a route, in every spelling of an import", () => {
  const route = join(fixture, "server", "src", "routes", "people.ts");
  for (const spelling of [
    'import { main } from "../freeduet/adopt/command";',
    'const { main } = await import("../freeduet/adopt/command");',
    'const { main } = require("../freeduet/adopt/command");',
    'export * from "../freeduet/adopt";',
  ]) {
    writeFileSync(route, `${spelling}\n`);
    expect(scan(fixture)).toEqual([
      {
        file: join("server", "src", "routes", "people.ts"),
        why: "imports the adoption code",
      },
    ]);
  }
  // A comment that mentions it is not an import.
  writeFileSync(route, '// see "../freeduet/adopt/command"\nexport {};\n');
  expect(scan(fixture)).toEqual([]);
});

test("the scan sees a route named for the move", () => {
  const route = join(fixture, "server", "src", "routes", "admin.ts");
  writeFileSync(
    route,
    'routes.post("/api/admin/adopt-single-user", handler);\n',
  );
  expect(scan(fixture)).toEqual([
    {
      file: join("server", "src", "routes", "admin.ts"),
      why: "names a route for the move",
    },
  ]);
  rmSync(route);
});

test("the scan sees a server inside the move itself", () => {
  const command = join(fixture, ADOPT_DIR, "command.ts");
  const clean = readFileSync(command, "utf8");
  for (const offender of [
    'import { Hono } from "hono";',
    "Bun.serve({ fetch });",
    'import http from "node:http";',
    "server.listen(3000);",
  ]) {
    writeFileSync(command, `${clean}${offender}\n`);
    expect(scan(fixture)).toEqual([
      {
        file: join(ADOPT_DIR, "command.ts"),
        why: "can serve or route a request",
      },
    ]);
  }
  writeFileSync(command, clean);
});

test("the scan sees the script named by something that starts things", () => {
  for (const [name, text] of [
    [
      "package.json",
      `{ "scripts": { "start": "bun scripts/${SCRIPT_NAME}.ts --to x" } }`,
    ],
    [
      join("scripts", "start.sh"),
      `bun scripts/${SCRIPT_NAME}.ts --to "$EMAIL"`,
    ],
    ["docker-compose.yml", `command: bun scripts/${SCRIPT_NAME}.ts`],
    ["Dockerfile", `CMD ["bun", "scripts/${SCRIPT_NAME}.ts"]`],
    [
      join(".github", "workflows", "ci.yml"),
      `run: bun scripts/${SCRIPT_NAME}.ts`,
    ],
  ] as const) {
    const file = join(fixture, name);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
    expect(scan(fixture)).toEqual([{ file: name, why: "starts the move" }]);
    rmSync(file);
  }
});
