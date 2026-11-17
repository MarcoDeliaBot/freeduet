/**
 * A missing FREEDUET_INTELLIGENCE is refused, and nothing is built or opened first (D65).
 *
 * Before D65 an unset, empty or blank switch was read as upstream OpenBot: with the three
 * Intelligence settings present the server ran in Intelligence mode (threads and memory kept by the
 * outside service) although nobody wrote `on`. Three ways of running, one answer each:
 * - missing, with the three settings: refused with one sentence; no Intelligence client, no listener;
 * - `off`, with the three settings: local, the credentials ignored and named in the boot log;
 * - `on`: as before.
 *
 * The first case runs the REAL entry point (`src/index.ts`) in its own process, in an empty
 * directory (so Bun loads no `.env`), with the three settings pointed at a listener this test owns.
 * It talks to nothing outside this machine.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { loadConfig } from "../src/config";
import type { Database } from "../src/db/client";
import { createThreadBackend } from "../src/freeduet/backend";
import { testEnvironment } from "./support/environment";
import { createFakeThreadsModule } from "./support/fake-local-threads";

const ENTRY_POINT = join(import.meta.dir, "..", "src", "index.ts");
const NO_DATABASE = {} as Database;

const MISSING =
  "FREEDUET_INTELLIGENCE is not set. Write FREEDUET_INTELLIGENCE=off in your settings file to keep your conversations on this computer, or FREEDUET_INTELLIGENCE=on to have them kept by the outside CopilotKit Intelligence service. scripts/start.sh writes it for you.";

/** The test environment with the three Intelligence settings and the switch left out entirely. */
function withoutSwitch(overrides: Record<string, string> = {}) {
  const environment = testEnvironment(overrides);
  delete environment.FREEDUET_INTELLIGENCE;
  return environment;
}

/** Whether something accepts a connection on this machine's port. */
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("the real entry point with the switch missing and all three settings present", () => {
  test("refuses to start, says what to write, opens no listener and calls no outside service", async () => {
    let connections = 0;
    const outside = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) =>
      outside.listen(0, "127.0.0.1", resolve),
    );
    const outsidePort = (outside.address() as { port: number }).port;
    const free = createServer();
    await new Promise<void>((resolve) => free.listen(0, "127.0.0.1", resolve));
    const port = (free.address() as { port: number }).port;
    await new Promise<void>((resolve) => free.close(() => resolve()));
    const directory = await mkdtemp(join(tmpdir(), "freeduet-missing-"));
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      child = Bun.spawn([process.execPath, ENTRY_POINT], {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
          HOME: directory,
          ...withoutSwitch({
            PORT: String(port),
            INTELLIGENCE_API_URL: `http://127.0.0.1:${outsidePort}`,
            INTELLIGENCE_GATEWAY_WS_URL: `ws://127.0.0.1:${outsidePort}`,
          }),
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      // A server that started would never exit: wait a bounded time, so a regression fails here
      // instead of hanging, and is stopped in `finally`.
      const running = child;
      const exited = await Promise.race([
        running.exited,
        new Promise<"still running">((resolve) =>
          setTimeout(() => resolve("still running"), 30_000),
        ),
      ]);
      // It stopped by itself, before anything here stopped it.
      expect(exited).not.toBe("still running");
      const code = running.exitCode;
      const stderr = await new Response(
        running.stderr as ReadableStream,
      ).text();
      expect(code).not.toBe(0);
      expect(stderr).toContain(MISSING);
      expect(await listening(port)).toBe(false);
      expect(connections).toBe(0);
    } finally {
      // Stops only the process this test started (by handle, never by pattern); a no-op once it exited.
      child?.kill();
      outside.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("the three ways of running, in process", () => {
  test("missing: loadConfig refuses, so no thread backend and no Intelligence client exist", async () => {
    const constructed = spyOn(CopilotKitIntelligence.prototype, "getThread");
    try {
      expect(() => loadConfig(withoutSwitch())).toThrow(MISSING);
      for (const blank of ["", "   "])
        expect(() =>
          loadConfig(withoutSwitch({ FREEDUET_INTELLIGENCE: blank })),
        ).toThrow(MISSING);
      expect(constructed).not.toHaveBeenCalled();
    } finally {
      constructed.mockRestore();
    }
  });

  test("off with the three settings: local, the credentials ignored and named once in the log", async () => {
    const lines: string[] = [];
    const config = loadConfig(
      testEnvironment({ FREEDUET_INTELLIGENCE: "off" }),
    );
    expect(config.runtime.mode).toBe("local");
    const backend = await createThreadBackend(config, NO_DATABASE, {
      threads: createFakeThreadsModule().module,
      log: (line) => lines.push(line),
    });
    expect(backend.mode).toBe("local");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      type: "freeduet-intelligence-off",
      ignored: ["INTELLIGENCE_API_KEY", "COPILOTKIT_LICENSE_TOKEN"],
    });
  });

  test("on with the three settings: the Intelligence runtime, as before", async () => {
    const config = loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "on" }));
    expect(config.runtime.mode).toBe("intelligence");
    const backend = await createThreadBackend(config, NO_DATABASE);
    expect(backend.mode).toBe("intelligence");
    expect(backend.client).toBeInstanceOf(CopilotKitIntelligence);
  });
});
