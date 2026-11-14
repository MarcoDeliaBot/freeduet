/**
 * Two real computers, each holding a token of its own, asked over sockets with the other's
 * (docs/design/per-computer-token.md).
 *
 * GUARD OF UNCHANGED BEHAVIOUR. Nothing in this directory changed with the per-Bot token: the gate at
 * the top of `fetch` in `src/index.ts` has always compared an offered secret with the one secret this
 * process was started with, and these tests pass on main as they do here. They are here because the
 * whole change leans on that one property, that a computer opens for the token it holds and for no
 * other, and until now it was only ever asked of ONE computer holding ONE secret. With a secret per
 * Bot the question that matters is the one these ask: does the token that opens a Bot's computer also
 * open the next? The supervisor's half (that two computers are given different tokens, and which)
 * is in `supervisor/tests/computer-token*.test.ts`, and the two halves meet in
 * `tests/per-computer-token-isolation.test.ts`, which does fail on main.
 *
 * What is asked, of each computer in turn, with the OTHER computer's token, with the deployment's
 * shared token that every computer held before each had its own, and with none:
 *
 *   - every route the dispatcher names, read from the source so one added later is asked too, under
 *     every method, answered 401, and `/health` the one exception;
 *   - `/exec`, the route a prompt-injected shell would use, in the other spellings of a wrong token
 *     (one character off, a prefix, a longer one, another case, a bearer header, a query), and the
 *     command is NOT run: the file it would write is not on the disk;
 *   - the live-screen socket, whose token rides the query because an upgrade carries no headers,
 *     refused before it is upgraded.
 *
 * And, so that no refusal above is the computer being unreachable: a computer's own token runs the
 * same `/exec`, and reaches the stream's own checks past the gate.
 *
 * The process is the real `src/index.ts`, started as the container starts it (managed browser,
 * headless). No request here reaches a browser. It needs this directory's own dependencies
 * (Playwright is imported at module scope), which the root install does not reach, so without them
 * the suite skips, like the other files that start the real process.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const installed = (() => {
  try {
    Bun.resolveSync("playwright", root);
    return true;
  } catch {
    return false;
  }
})();

/** Same length on purpose, so a refusal is the content being wrong and not the length. */
const tokenOf = (name: string) =>
  createHash("sha256").update(`per-computer-token/${name}`).digest("hex");
const ALPHA = tokenOf("alpha");
const BETA = tokenOf("beta");
/** What every computer held before each had its own: the deployment's `COMPUTER_TOKEN`. */
const SHARED = tokenOf("shared-deployment-token");

/** Every route the dispatcher names, read from the source, so a route added later is asked too. */
const ROUTES = [
  ...new Set(
    [
      ...readFileSync(join(root, "src/index.ts"), "utf8").matchAll(
        /url\.pathname === "(\/[^"]*)"/g,
      ),
    ].map((match) => match[1] as string),
  ),
];
const METHODS = ["GET", "POST", "PUT", "DELETE"];

type Computer = {
  name: string;
  token: string;
  port: number;
  directory: string;
  child: ReturnType<typeof Bun.spawn>;
};

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

/**
 * One real computer. A port another process took between the probe and the bind makes it exit at
 * once, which is retried; anything else is a failure to start and is thrown.
 */
async function start(
  name: string,
  token: string,
  attempt = 0,
): Promise<Computer> {
  const directory = await mkdtemp(
    join(tmpdir(), `per-computer-token-${name}-`),
  );
  const port = await freePort();
  const child = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: root,
    env: {
      ...process.env,
      COMPUTER_BROWSER_BACKEND: "managed",
      COMPUTER_BROWSER_MODE: "headless",
      COMPUTER_TOKEN: token,
      PORT: String(port),
      PROFILES_DIR: join(directory, "profiles"),
      WORKSPACE_DIR: join(directory, "workspace"),
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  const end = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) {
      await rm(directory, { recursive: true, force: true });
      if (attempt < 4) return start(name, token, attempt + 1);
      throw new Error(`The computer ${name} exited with ${child.exitCode}.`);
    }
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {}
    if (Date.now() > end)
      throw new Error(`The computer ${name} never answered.`);
    await Bun.sleep(25);
  }
  return { name, token, port, directory, child };
}

let alpha: Computer;
let beta: Computer;

beforeAll(async () => {
  if (!installed) return;
  // One after the other: each probes for a free port, and two probing together can be handed one.
  alpha = await start("alpha", ALPHA);
  beta = await start("beta", BETA);
}, 60_000);

afterAll(async () => {
  if (!installed) return;
  for (const computer of [alpha, beta]) {
    computer.child.kill();
    await computer.child.exited;
    await rm(computer.directory, { recursive: true, force: true });
  }
});

/** What a caller can show as its token: where, and what. `null` shows none. */
type Presented =
  | { as: "header"; token: string | null }
  | { as: "bearer"; token: string }
  | { as: "query"; token: string };

function ask(
  computer: Computer,
  method: string,
  path: string,
  presented: Presented,
  body?: string,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {
    "x-openbot-bot-id": "per-computer-token",
    ...(body === undefined ? {} : { "content-type": "application/json" }),
  };
  let target = path;
  if (presented.as === "header" && presented.token !== null)
    headers["x-openbot-computer-token"] = presented.token;
  if (presented.as === "bearer")
    headers.authorization = `Bearer ${presented.token}`;
  if (presented.as === "query")
    target += `${path.includes("?") ? "&" : "?"}token=${presented.token}`;
  return fetch(`http://127.0.0.1:${computer.port}${target}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  }).then(async (response) => ({
    status: response.status,
    text: await response.text(),
  }));
}

/** The command a prompt-injected shell would run, writing a file so "it ran" is a fact about the disk. */
function exec(computer: Computer, marker: string, presented: Presented) {
  return ask(
    computer,
    "POST",
    "/exec",
    presented,
    JSON.stringify({ command: `echo ran-here && touch ${marker}` }),
  );
}

/** The two computers, each with the tokens that are NOT its own. */
const strangers = (computer: Computer) => [
  { label: "no token", token: null },
  {
    label: "the other computer's token",
    token: computer === alpha ? BETA : ALPHA,
  },
  { label: "the deployment's shared token", token: SHARED },
];

describe.skipIf(!installed)("the route list read from the source", () => {
  test("holds the routes that matter, so the loops below are not asking nothing", () => {
    for (const route of [
      "/exec",
      "/health",
      "/stream",
      "/navigate",
      "/egress-policy",
    ])
      expect(ROUTES).toContain(route);
    expect(ROUTES.length).toBeGreaterThan(20);
  });
});

describe.skipIf(!installed)("a computer opens for its own token", () => {
  test("each runs `/exec` for its own token, which is what makes the refusals below mean something", async () => {
    for (const computer of [alpha, beta]) {
      const marker = join(computer.directory, "ran-for-its-own");
      const ran = await exec(computer, marker, {
        as: "header",
        token: computer.token,
      });
      expect(ran.status).toBe(200);
      expect(JSON.parse(ran.text)).toMatchObject({
        exitCode: 0,
        stdout: "ran-here\n",
      });
      expect(existsSync(marker)).toBeTrue();
    }
  });

  test("and `/health` answers with no token at all, as the container's own check needs", async () => {
    for (const computer of [alpha, beta]) {
      const answer = await ask(computer, "GET", "/health", {
        as: "header",
        token: null,
      });
      expect(answer.status).toBe(200);
    }
  });

  test("its own token reaches the live-screen socket's own checks, past the gate", async () => {
    // No upgrade is asked for, so what answers is the stream's own refusal (400), not the gate's (401),
    // and no browser is reached.
    for (const computer of [alpha, beta]) {
      const answer = await ask(
        computer,
        "GET",
        "/stream?bot=per-computer-token",
        {
          as: "query",
          token: computer.token,
        },
      );
      expect(answer.status).toBe(400);
    }
  });
});

describe.skipIf(!installed)(
  "the other computer's token, the shared one and none",
  () => {
    test("are refused 401 on every route, every method, by each computer; `/health` alone answers", async () => {
      const answers = (
        await Promise.all(
          [alpha, beta].flatMap((computer) =>
            ROUTES.flatMap((path) =>
              METHODS.flatMap((method) =>
                strangers(computer).map(async ({ label, token }) => ({
                  route: `${computer.name} ${method} ${path} with ${label}`,
                  path,
                  answer: await ask(
                    computer,
                    method,
                    path,
                    { as: "header", token },
                    method === "GET" ? undefined : "{}",
                  ),
                })),
              ),
            ),
          ),
        )
      ).filter(
        ({ path, answer }) =>
          answer.status !== (path === "/health" ? 200 : 401),
      );
      expect(
        answers.map(({ route, answer }) => `${route} -> ${answer.status}`),
      ).toEqual([]);
    });

    test("are refused on `/exec` in every spelling a caller has, and the command is NOT run", async () => {
      for (const computer of [alpha, beta]) {
        const own = computer.token;
        const other = computer === alpha ? BETA : ALPHA;
        const marker = join(computer.directory, "never-written");
        const spellings: [string, Presented][] = [
          ["the other computer's token", { as: "header", token: other }],
          [
            "the other computer's token as a bearer",
            { as: "bearer", token: other },
          ],
          ["the shared token", { as: "header", token: SHARED }],
          ["the shared token as a bearer", { as: "bearer", token: SHARED }],
          // The query is read for the stream and for nothing else.
          ["its own token in the query", { as: "query", token: own }],
          [
            "one character off its own",
            {
              as: "header",
              token: `${own.slice(0, -1)}${own.endsWith("0") ? "1" : "0"}`,
            },
          ],
          ["a prefix of its own", { as: "header", token: own.slice(0, 32) }],
          ["its own with more after it", { as: "header", token: `${own}0` }],
          [
            "its own in another case",
            { as: "header", token: own.toUpperCase() },
          ],
        ];
        for (const [label, presented] of spellings) {
          const refused = await exec(computer, marker, presented);
          expect(`${label}: ${refused.status}`).toBe(`${label}: 401`);
          expect(refused.text).not.toContain("ran-here");
        }
        expect(existsSync(marker)).toBeFalse();
      }
    });

    test("are refused on the live-screen socket before it is upgraded", async () => {
      const upgrade: [string, string][] = [
        ["upgrade", "websocket"],
        ["connection", "Upgrade"],
        ["sec-websocket-version", "13"],
        ["sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="],
      ];
      for (const computer of [alpha, beta]) {
        const other = computer === alpha ? BETA : ALPHA;
        for (const [label, token] of [
          ["the other computer's token", other],
          ["the shared token", SHARED],
          ["no token", null],
        ] as const) {
          const query = token === null ? "" : `&token=${token}`;
          const refused = await upgradeStatus(
            computer.port,
            `/stream?bot=per-computer-token${query}`,
            upgrade,
          );
          expect(`${computer.name} with ${label}: ${refused}`).toBe(
            `${computer.name} with ${label}: 401`,
          );
        }
      }
    });
  },
);

/** The status line of the answer to a websocket upgrade written by hand, on a socket of its own. */
function upgradeStatus(
  port: number,
  path: string,
  headers: [string, string][],
): Promise<number> {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(Number(/^HTTP\/1\.[01] (\d{3})/.exec(data)?.[1] ?? 0));
    };
    const socket = connect({ host: "127.0.0.1", port }, () =>
      socket.write(
        `${[`GET ${path} HTTP/1.1`, `host: 127.0.0.1:${port}`, ...headers.map(([name, value]) => `${name}: ${value}`)].join("\r\n")}\r\n\r\n`,
      ),
    );
    socket.setEncoding("utf8");
    // An answer that never comes is no 401, and the caller says so by its status of 0.
    socket.setTimeout(5000, finish);
    socket.on("data", (chunk: string) => {
      data += chunk;
      if (data.includes("\r\n")) finish();
    });
    socket.on("close", finish);
    socket.on("error", finish);
  });
}
