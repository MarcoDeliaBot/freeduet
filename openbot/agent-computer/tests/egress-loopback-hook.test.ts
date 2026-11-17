import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isLoopbackRange, privateRangeOf } from "../src/private-network";

/**
 * D73: the home and office network switch never opens loopback. The one way around it is a hook for
 * tests, and nothing a computer runs may call it.
 */
describe("the loopback rule has no way around it in the program", () => {
  test("allowLoopbackForTests is called by no file under src/ but its own", () => {
    const src = join(import.meta.dir, "..", "src");
    const callers = readdirSync(src)
      .filter((name) => name.endsWith(".ts") && name !== "egress.ts")
      .filter((name) =>
        readFileSync(join(src, name), "utf8").includes("allowLoopbackForTests"),
      );
    expect(callers).toEqual([]);
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
