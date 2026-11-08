/**
 * With FREEDUET_INTELLIGENCE=off nothing goes to CopilotKit (#42), telemetry included.
 *
 * The scenario runs in a fresh process (fixtures/freeduet-intelligence-offline-probe.ts), because
 * CopilotKit decides whether telemetry is on when its module is first loaded, and this test process
 * loaded it long before this file. The probe loads its modules in index.ts's order, so
 * `freeduet/telemetry-off` turns telemetry off when nobody set COPILOTKIT_TELEMETRY_DISABLED, the
 * way a `.env` without that line runs.
 *
 * The probe boots as index.ts wires it (backend, memory, Learning, the self-host banner, the setup
 * checklist, the thread reader, the runtime and its guard), runs one browser chat turn, one headless
 * turn on the same thread through the same runner, a hop's lock and history, and writes and recalls
 * a memory in Postgres. It records every outbound request and every call to the Intelligence client
 * and runner.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testDatabaseUrl } from "./support/database";

const PROBE = join(
  import.meta.dir,
  "fixtures",
  "freeduet-intelligence-offline-probe.ts",
);

/** Runs the probe with FREEDUET_INTELLIGENCE=off, no telemetry setting, and `extra` on top. */
async function runProbe(
  extra: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  // An empty directory, so Bun loads no `.env` into the probe.
  const directory = await mkdtemp(join(tmpdir(), "freeduet-offline-"));
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of [
    "DO_NOT_TRACK",
    "COPILOTKIT_TELEMETRY_DISABLED",
    "COPILOTKIT_TELEMETRY_URL",
    "INTELLIGENCE_API_URL",
    "INTELLIGENCE_GATEWAY_WS_URL",
    "INTELLIGENCE_API_KEY",
  ])
    delete env[key];
  try {
    const child = Bun.spawn([process.execPath, PROBE], {
      cwd: directory,
      env: {
        ...env,
        TEST_DATABASE_URL: testDatabaseUrl(),
        FREEDUET_INTELLIGENCE: "off",
        ...extra,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, stderr).toBe(0);
    const last = stdout.trim().split("\n").at(-1) ?? "{}";
    return JSON.parse(last);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function expectNothingSent(report: Record<string, unknown>) {
  expect(report.error).toBeUndefined();

  // It all worked, without Intelligence.
  expect(report).toMatchObject({
    learning: "off",
    learningRuntime: false,
    banner: true,
    entitlementsAsked: 0,
    info: { status: 200, mode: "sse" },
    turn: { status: 200, said: true },
    known: "known",
    headless: "Hello",
    threadFree: true,
    oneRunner: true,
    hopLock: true,
    history: ["user", "assistant", "user", "assistant"],
    recalled: true,
  });

  // And nothing reached CopilotKit, by any road: no Intelligence call and no telemetry.
  expect(report.intelligenceCalls).toEqual([]);
  expect(report.copilotkitRequests).toEqual([]);
  expect(report.otherRequests).toEqual([]);
}

describe("FREEDUET_INTELLIGENCE=off sends nothing to CopilotKit", () => {
  test("with no telemetry setting at all: boot, a chat turn, a headless turn, a hop and memory", async () => {
    expectNothingSent(await runProbe());
  }, 60_000);

  test("with telemetry turned off by the person, the same", async () => {
    expectNothingSent(
      await runProbe({ COPILOTKIT_TELEMETRY_DISABLED: "true" }),
    );
  }, 60_000);

  test("the same, over the real thread store and Postgres runner", async () => {
    expectNothingSent(await runProbe({ FREEDUET_PROBE_STORE: "real" }));
  }, 60_000);

  // A person who turns telemetry on explicitly gets it, and the watch sees it: the requests are
  // answered inside the probe, so they never leave the machine. Intelligence is still never called.
  test("COPILOTKIT_TELEMETRY_DISABLED=false is the person's choice, and the watch sees it", async () => {
    const report = await runProbe({ COPILOTKIT_TELEMETRY_DISABLED: "false" });
    expect(report.error).toBeUndefined();
    expect(report.copilotkitRequests).toContain(
      "https://telemetry.copilotkit.ai/ingest",
    );
    expect(report.intelligenceCalls).toEqual([]);
  }, 60_000);
});
