/**
 * The finding, run end to end: a Bot's computer must not hold the secret that opens another's
 * (SECURITY.md, docs/design/per-computer-token.md).
 *
 * THE HOLE, as the repro this file runs. Every computer, the shared one and each Bot's, took ONE token,
 * `COMPUTER_TOKEN`, and the supervisor put that same value in the environment of every computer it
 * made. A Bot's shell is a child of the computer process, so it reads its parent's environment out of
 * `/proc/<parent>/environ`; the shell's own `env` does not show the token, which the computer scrubs,
 * and that is no help. Prompt injection into one Bot, on a page it was browsing, is enough to run
 * that command. The token it reads opens `/exec` on EVERY other computer, and `/exec` answered 200 and
 * ran the command as root there. On main this file's third test sees exactly that: status 200 where
 * 401 is asked, and `id -u` printing 0 on the other computer.
 *
 * What it uses is the real thing at both ends and nothing in between:
 *
 *   - `environmentFor`, the function the supervisor builds each computer's environment with, given the
 *     environment a supervisor runs in (the deployment's shared `COMPUTER_TOKEN` still among it, as an
 *     installation made before this change has it, and `SUPERVISOR_TOKEN`);
 *   - the real computer process, `agent-computer/src/index.ts`, started with exactly that environment
 *     and nothing else of this machine's, which is what makes "what is in the container's
 *     environment" a fact about the list above and not about whatever this runner has set.
 *
 * Two computers stand for two Bots' containers. What a test cannot stand for is the container
 * boundary: here both are processes of one user, so `alpha`'s shell COULD read `beta`'s `/proc`, and
 * under Docker it cannot, each container having a process table of its own. That boundary is the one
 * the finding assumed and this change leaves as it is; what this checks is that nothing alpha can read
 * is a way into beta.
 *
 * It needs the computer's own dependencies (Playwright is imported at module scope), which the root
 * install does not reach. Without them the suite skips, like the other files that start the process.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { environmentFor } from "../supervisor/src/environment";

const root = join(import.meta.dir, "..");
const computerRoot = join(root, "agent-computer");
const installed = (() => {
  try {
    Bun.resolveSync("playwright", computerRoot);
    return true;
  } catch {
    return false;
  }
})();

/** What the supervisor runs with: the deployment's token, still set, and the supervisor's own. */
const SHARED_COMPUTER_TOKEN = "deployment-shared-computer-token-4f9a1c7e2b8d";
const SUPERVISOR_TOKEN = "supervisor-bearer-token-0e6d3b5a9c1f7284af5e";
const SUPERVISOR_ENVIRONMENT = {
  COMPUTER_TOKEN: SHARED_COMPUTER_TOKEN,
  SUPERVISOR_TOKEN,
  COMPUTER_BROWSER_MODE: "headless",
};

type Computer = {
  botId: string;
  port: number;
  directory: string;
  /** What the supervisor made this computer's environment from, which is also what it tells the server. */
  token: string;
  child: ReturnType<typeof Bun.spawn>;
};

/** `KEY=value` lines to an object, the way a container runtime turns them into an environment. */
function asObject(lines: string[]): Record<string, string> {
  return Object.fromEntries(
    lines.map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port as number;
  await probe.stop(true);
  return port;
}

/** One computer, started with what `environmentFor` gives it and nothing of this machine's but a PATH. */
async function startComputer(botId: string, attempt = 0): Promise<Computer> {
  const directory = await mkdtemp(
    join(tmpdir(), `per-computer-token-e2e-${botId}-`),
  );
  const port = await freePort();
  const environment = asObject(environmentFor(botId, SUPERVISOR_ENVIRONMENT));
  const child = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: computerRoot,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: directory,
      COMPUTER_BROWSER_BACKEND: "managed",
      PORT: String(port),
      PROFILES_DIR: join(directory, "profiles"),
      WORKSPACE_DIR: join(directory, "workspace"),
      ...environment,
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  const end = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) {
      await rm(directory, { recursive: true, force: true });
      // A port another process took between the probe and the bind: once more.
      if (attempt < 4) return startComputer(botId, attempt + 1);
      throw new Error(
        `The computer for ${botId} exited with ${child.exitCode}.`,
      );
    }
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {}
    if (Date.now() > end)
      throw new Error(`The computer for ${botId} never answered.`);
    await Bun.sleep(25);
  }
  return {
    botId,
    port,
    directory,
    token: environment.COMPUTER_TOKEN as string,
    child,
  };
}

let alpha: Computer;
let beta: Computer;

beforeAll(async () => {
  if (!installed) return;
  // One after the other: each probes for a free port, and two probing together can be handed one.
  alpha = await startComputer("alpha");
  beta = await startComputer("beta");
}, 60_000);

afterAll(async () => {
  if (!installed) return;
  for (const computer of [alpha, beta]) {
    computer.child.kill();
    await computer.child.exited;
    await rm(computer.directory, { recursive: true, force: true });
  }
});

/** A command through `/exec`, as the server's gateway sends it and as a Bot's own shell sends nothing. */
async function exec(computer: Computer, token: string, command: string) {
  const response = await fetch(`http://127.0.0.1:${computer.port}/exec`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-openbot-bot-id": computer.botId,
      "x-openbot-computer-token": token,
    },
    body: JSON.stringify({ command }),
  });
  const text = await response.text();
  return { status: response.status, text };
}

/** What a shell in this computer reads of its parent's environment: the finding's own command. */
const READ_PARENT_ENVIRONMENT = "tr '\\0' '\\n' < /proc/$PPID/environ";

const stdoutOf = (text: string) =>
  (JSON.parse(text) as { stdout: string }).stdout;

describe.skipIf(!installed)(
  "two computers made the way the supervisor makes them",
  () => {
    test("each holds a token of its own, and neither is the deployment's or the supervisor's", () => {
      expect(alpha.token).not.toBe(beta.token);
      for (const computer of [alpha, beta]) {
        expect(computer.token).not.toBe(SHARED_COMPUTER_TOKEN);
        expect(computer.token).not.toBe(SUPERVISOR_TOKEN);
      }
    });

    test("each opens its own `/exec` for its own token, so the refusals below are the token's doing", async () => {
      for (const computer of [alpha, beta]) {
        const ran = await exec(
          computer,
          computer.token,
          "echo ran-in-own-computer",
        );
        expect(ran.status).toBe(200);
        expect(stdoutOf(ran.text)).toBe("ran-in-own-computer\n");
      }
    });
  },
);

describe.skipIf(!installed)(
  "a Bot whose shell reads its own computer's environment",
  () => {
    test("finds in it a token that does NOT open the next Bot's computer, and the command is not run there", async () => {
      // alpha's shell, started by the server with alpha's own token, reads its parent's environment.
      const read = await exec(
        alpha,
        alpha.token,
        `${READ_PARENT_ENVIRONMENT} | grep '^COMPUTER_TOKEN='`,
      );
      expect(read.status).toBe(200);
      const stolen = stdoutOf(read.text)
        .trim()
        .replace(/^COMPUTER_TOKEN=/, "");
      // It really did read a token, and the one alpha holds: a reproduction that read nothing would
      // pass below for the wrong reason.
      expect(stolen).toBe(alpha.token);

      // And presents it to beta's `/exec`, where it would run a command as root.
      const marker = join(beta.directory, "run-in-beta-by-alpha");
      const intoBeta = await exec(
        beta,
        stolen,
        `echo run-in-beta-by-alpha && id -u && touch ${marker}`,
      );
      expect(intoBeta.status).toBe(401);
      expect(intoBeta.text).not.toContain("run-in-beta-by-alpha");
      expect(existsSync(marker)).toBeFalse();
    });

    test("finds nothing of the deployment's shared token or the supervisor's own in the whole environment", async () => {
      for (const computer of [alpha, beta]) {
        const dump = await exec(
          computer,
          computer.token,
          READ_PARENT_ENVIRONMENT,
        );
        expect(dump.status).toBe(200);
        const environment = stdoutOf(dump.text);
        // The dump is the real thing and not an empty read.
        expect(environment).toContain(`COMPUTER_BOT_ID=${computer.botId}`);
        expect(environment).toContain(`COMPUTER_TOKEN=${computer.token}`);
        expect(environment).not.toContain(SHARED_COMPUTER_TOKEN);
        expect(environment).not.toContain(SUPERVISOR_TOKEN);
      }
    });

    test("and the token the deployment still holds opens neither computer", async () => {
      for (const computer of [alpha, beta]) {
        const refused = await exec(
          computer,
          SHARED_COMPUTER_TOKEN,
          "echo ran-for-the-old-token",
        );
        expect(refused.status).toBe(401);
        expect(refused.text).not.toContain("ran-for-the-old-token");
      }
    });
  },
);
