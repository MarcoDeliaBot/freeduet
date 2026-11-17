import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allowLoopbackForTests } from "../src/egress";
import { isLoopbackRange, privateRangeOf } from "../src/private-network";

/**
 * D73: the home and office network switch never opens loopback. The one way around it is a hook for
 * tests, and nothing a computer runs may call it.
 */
describe("the loopback rule has no way around it in the program", () => {
  test("allowLoopbackForTests is called by no file under src/ but its own, at any depth", () => {
    const src = join(import.meta.dir, "..", "src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : /\.(ts|tsx|js|mjs)$/.test(entry.name)
            ? [join(dir, entry.name)]
            : [],
      );
    const callers = walk(src)
      .filter((file) => file !== join(src, "egress.ts"))
      .filter((file) =>
        readFileSync(file, "utf8").includes("allowLoopbackForTests"),
      );
    expect(callers).toEqual([]);
  });

  test("it is refused in production", () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => allowLoopbackForTests(true)).toThrow("production");
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  test("isLoopbackRange is the four loopback and this-host ranges, and no private LAN range", () => {
    for (const host of [
      "127.0.0.1",
      "127.255.255.254",
      "localhost",
      "a.localhost",
      "0.0.0.0",
      "[::1]",
      "::",
      "[::127.0.0.1]",
      "[::7f00:1]",
      "[::0.0.0.5]",
      "[::ffff:127.0.0.1]",
      "[64:ff9b::7f00:1]",
      "[2002:7f00:1::]",
      "2130706433",
    ]) {
      const range = privateRangeOf(host);
      expect({ host, loopback: range ? isLoopbackRange(range) : null }).toEqual(
        { host, loopback: true },
      );
    }
    for (const host of [
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "[fd12::1]",
      "[::ffff:10.0.0.1]",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      const range = privateRangeOf(host);
      expect({ host, loopback: range ? isLoopbackRange(range) : null }).toEqual(
        { host, loopback: false },
      );
    }
  });
});
