// server/tests/console-spy-scope.test.ts
/**
 * Guard: no server test spies on the console, or replaces it, at module level.
 *
 * WHY. A spy made while a file loads is not restored by that file, so it is the one shape of console spy that can
 * reach the files after it: the next `spyOn(console, ...)` can get the same spy back with the calls already on
 * it. identity-audit-failure.test.ts read another test's console line this way in CI on pull request #286. #287
 * made that reader robust; this guard keeps the spy out of module scope at its source. A spy made inside a test,
 * a hook or a helper is installed and removed while that code runs, so it is not judged here.
 *
 * HOW. A file that spies on or replaces the console is parsed with the TypeScript parser (typescript is a root
 * devDependency). A regex cannot tell a top-level object literal from a function body, and a guard that
 * misreads one of them is a guard nobody trusts.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import ts from "typescript";
import { sourceFiles } from "./support/source-scan";

const TESTS = import.meta.dir;

/** A file that never mentions the console is not parsed. */
const CONSOLE_USE =
  /spyOn\(\s*(globalThis\.)?console\b|\b(globalThis\.)?console\.\w+\s*=[^=]/;

/** The 1-based lines of `text` where the console is spied on or replaced, outside every function. */
function moduleLevelConsoleLines(text: string): number[] {
  if (!CONSOLE_USE.test(text)) return [];
  const file = ts.createSourceFile(
    "test.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    const spy =
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "spyOn" &&
      /^(globalThis\.)?console$/.test(node.arguments[0]?.getText(file) ?? "");
    const replace =
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      /^(globalThis\.)?console\.\w+$/.test(node.left.getText(file));
    if ((spy || replace) && !insideFunction(node))
      lines.push(
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      );
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

function insideFunction(node: ts.Node): boolean {
  for (let up = node.parent; up; up = up.parent)
    if (ts.isFunctionLike(up)) return true;
  return false;
}

test("no server test spies on the console at module level", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles(TESTS, [".ts"]))
    for (const line of moduleLevelConsoleLines(readFileSync(path, "utf8")))
      offenders.push(`${relative(TESTS, path)}:${line}`);
  expect(offenders).toEqual([]);
});

test("the check names a module-level spy, and passes the same spy inside a hook or a test", () => {
  expect(
    moduleLevelConsoleLines(`const quiet = spyOn(console, "info");`),
  ).toEqual([1]);
  expect(
    moduleLevelConsoleLines(
      `const quiet = {\n  log: spyOn(console, "log"),\n};`,
    ),
  ).toEqual([2]);
  expect(moduleLevelConsoleLines(`console.warn = () => {};`)).toEqual([1]);
  expect(
    moduleLevelConsoleLines(
      `beforeAll(() => {\n  quiet = spyOn(console, "info");\n});`,
    ),
  ).toEqual([]);
  expect(
    moduleLevelConsoleLines(`test("a", () => { console.error = () => {}; });`),
  ).toEqual([]);
});
