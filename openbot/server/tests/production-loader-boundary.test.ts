import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));

/*
 * Starting the production entry loads the whole server graph before it reaches the database. Measured
 * on 14 November 2026 with the junit reporter: alone 3.3 s median, 4.9 s at most (ten runs); under a
 * bounded synthetic CPU load 5.1 s median or more, so the old 5 s kill cut the process short in six of
 * ten runs before it printed the query failure. The kill bound is the only thing that ends a child that
 * does not exit by itself, and it is sized about five times the slowest measured start; the test
 * timeout sits above it so the kill always fires first.
 */
const ENTRY_KILL_MS = 25_000;
const TEST_TIMEOUT_MS = 35_000;

function envFileArgument(envPath: string): string {
  const relativePath = relative(serverRoot, envPath).split(sep).join("/");
  return `--env-file=${relativePath}`;
}

async function runProductionEntry() {
  const proofDir = await mkdtemp(`${tmpdir()}${sep}openbot-loader-boundary-`);
  const envPath = `${proofDir}${sep}synthetic.env`;
  await writeFile(
    envPath,
    [
      "DATABASE_URL=postgres://openbot:openbot@127.0.0.1:1/openbot",
      "KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "OPENBOT_SINGLE_USER=true",
      "MANAGED_AGENT_AG_UI_URL=http://127.0.0.1:4200/ag-ui",
      "MANAGED_AGENT_TOKEN=synthetic-managed-token",
      "COMPUTER_SUPERVISOR_URL=http://127.0.0.1:4300",
      "SUPERVISOR_TOKEN=synthetic-supervisor-token",
      "COMPUTER_TOKEN=synthetic-computer-token",
      "WORKER_SHARED_SECRET=synthetic-worker-secret",
      "AGENT_TOOL_TOKEN=synthetic-tool-token",
      // Must be written (D65); upstream's three settings mean `on`.
      "FREEDUET_INTELLIGENCE=on",
      "INTELLIGENCE_API_URL=http://127.0.0.1:59991",
      "INTELLIGENCE_GATEWAY_WS_URL=ws://127.0.0.1:59992",
      "INTELLIGENCE_API_KEY=synthetic-intelligence-key",
      "TENANT_PACKAGE_DIR=../examples/fintech",
      "PORT=39999",
      "",
    ].join("\n"),
  );

  const proc = Bun.spawn({
    cmd: [
      process.execPath,
      envFileArgument(envPath),
      "src/production-entry.ts",
    ],
    cwd: serverRoot,
    env: {
      PATH: process.env.PATH ?? "",
      ...(process.platform === "win32"
        ? {
            SystemRoot: process.env.SystemRoot ?? "",
            WINDIR: process.env.WINDIR ?? "",
            TEMP: process.env.TEMP ?? "",
            TMP: process.env.TMP ?? "",
          }
        : {}),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // The bound on a child that does not exit by itself. It is a bound on the process, not the claim.
  const timeout = setTimeout(() => proc.kill(), ENTRY_KILL_MS);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  } finally {
    clearTimeout(timeout);
    await rm(proofDir, { recursive: true, force: true });
  }
}

describe("production server loader boundary", () => {
  test(
    "the production-used server entry reaches the configured database boundary after preloading EventSource",
    async () => {
      const result = await runProductionEntry();
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.exitCode).not.toBe(0);
      expect(output).not.toContain("require() async module");
      expect(output).not.toContain("OPENBOT_SERVER_LOADER_SMOKE");
      expect(output).toContain("Failed query: insert into");
      expect(output).toMatch(
        /Connection closed|Failed to connect|ERR_POSTGRES_CONNECTION_REFUSED/,
      );
    },
    TEST_TIMEOUT_MS,
  );
});
