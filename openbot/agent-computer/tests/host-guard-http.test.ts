/**
 * The real computer process, asked over sockets under every Host a page could send
 * (src/host-guard.ts, docs/M1_PLAN.md D40).
 *
 * THE HOLE, as the repro these tests run: the computer's one gate is `COMPUTER_TOKEN`, whose
 * development default is public in this repository, and nothing read `Host`. A page at evil.example
 * whose name was re-pointed at 127.0.0.1 has the person's own browser send it same-origin requests,
 * on which it may set any header: it sent the token to `/exec` and read the command's output, HTTP
 * 200. Each such request is made below with the Host that page can only send, from 127.0.0.1, with the
 * token in hand. Before the guard existed every one of them was answered, and the command ran.
 *
 * The process is the real `src/index.ts`, started as the container starts it (managed browser,
 * headless), so the guard is tested where it stands and not where a test would put it. It never
 * launches a browser here: no request below reaches one. Every request is written by hand on a socket
 * of its own, so a missing Host, two of them and a userinfo trick are sent exactly as written.
 *
 * It needs this directory's own dependencies (Playwright is imported at module scope), which the
 * root install does not reach. Without them the suite skips, as the other files that start the real
 * process do; CI installs them for the `tests` job.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { BlockList, connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
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

/**
 * The token a page could know: the development default `scripts/start.sh` and `docker-compose.yml`
 * hand out when `.env` sets none, which is public because this repository is.
 */
const KNOWN_TOKEN = "openbot-dev-computer-token";

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

/**
 * This machine's own address that is not loopback: what stands in for another container. Only one the
 * public internet does not route (private space and the documentation ranges, the same ones the test
 * run's network guard lets a raw socket reach), so a test never dials an address that is somebody's.
 */
const UNROUTABLE = new BlockList();
for (const [network, prefix] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.2.0", 24],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
] as const)
  UNROUTABLE.addSubnet(network, prefix, "ipv4");
const OTHER_PEER = Object.values(networkInterfaces())
  .flat()
  .find(
    (entry) =>
      entry &&
      entry.family === "IPv4" &&
      !entry.internal &&
      UNROUTABLE.check(entry.address, "ipv4"),
  )?.address;

type Answer = { status: number; head: string; body: string };

/** One request written exactly as given on a socket of its own, and the answer to it. */
function exchange(
  port: number,
  wire: string,
  address = "127.0.0.1",
): Promise<Answer> {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const [head = "", ...rest] = data.split("\r\n\r\n");
      resolve({
        status: Number(/^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1] ?? 0),
        head,
        body: rest.join("\r\n\r\n"),
      });
    };
    const socket = connect({ host: address, port }, () => socket.write(wire));
    socket.setEncoding("utf8");
    // An answer that never comes is no 421, and the caller says so by its status of 0.
    socket.setTimeout(5000, finish);
    socket.on("data", (chunk: string) => {
      data += chunk;
      const split = data.indexOf("\r\n\r\n");
      if (split === -1) return;
      const head = data.slice(0, split);
      const length = /^content-length:\s*(\d+)/im.exec(head)?.[1];
      if (
        /^HTTP\/1\.[01] 101/.test(head) ||
        (length !== undefined &&
          Buffer.byteLength(data.slice(split + 4)) >= Number(length))
      )
        finish();
    });
    socket.on("close", finish);
    socket.on("error", finish);
  });
}

type Wire = {
  method?: string;
  path?: string;
  version?: "1.0" | "1.1";
  /** In the order sent, so a name can be repeated or left out. */
  headers?: [string, string][];
  body?: string;
};

function written(request: Wire): string {
  const lines = [
    `${request.method ?? "GET"} ${request.path ?? "/health"} HTTP/${request.version ?? "1.1"}`,
    ...(request.headers ?? []).map(([name, value]) => `${name}: ${value}`),
    ...(request.body === undefined
      ? []
      : [`content-length: ${Buffer.byteLength(request.body)}`]),
  ];
  return `${lines.join("\r\n")}\r\n\r\n${request.body ?? ""}`;
}

let counter = 0;

let fixture: {
  port: number;
  directory: string;
  child: ReturnType<typeof Bun.spawn>;
};

/** A request under one Host (`null` sends none), from loopback unless an address says otherwise. */
function ask(
  host: string | null,
  options: Omit<Wire, "headers"> & {
    token?: string | null;
    address?: string;
    extra?: [string, string][];
  } = {},
): Promise<Answer> {
  const { token = KNOWN_TOKEN, address, extra = [], ...rest } = options;
  counter += 1;
  return exchange(
    fixture.port,
    written({
      ...rest,
      headers: [
        ...(host === null ? [] : ([["host", host]] as [string, string][])),
        ["connection", "close"],
        // A Bot of its own for each request, so one that is slow on a computer with no guard does not
        // hold up the next in the Bot's queue.
        ["x-openbot-bot-id", `host-guard-${counter}`],
        ...(token === null
          ? []
          : ([["x-openbot-computer-token", token]] as [string, string][])),
        ...extra,
      ],
    }),
    address,
  );
}

const JSON_BODY: [string, string][] = [["content-type", "application/json"]];

/** The command a page would run, writing a file so that "it ran" is a fact about the disk. */
function exec(
  marker: string,
  host: string | null,
  options: { token?: string | null; address?: string } = {},
) {
  return ask(host, {
    method: "POST",
    path: "/exec",
    body: JSON.stringify({ command: `echo page-read-this && touch ${marker}` }),
    extra: JSON_BODY,
    ...options,
  });
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

async function start(
  extraEnvironment: Record<string, string>,
  stderr: "inherit" | "pipe" = "inherit",
) {
  const directory = await mkdtemp(join(tmpdir(), "host-guard-http-"));
  const port = await freePort();
  const child = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: root,
    env: {
      ...process.env,
      COMPUTER_BROWSER_BACKEND: "managed",
      COMPUTER_BROWSER_MODE: "headless",
      COMPUTER_TOKEN: KNOWN_TOKEN,
      PORT: String(port),
      PROFILES_DIR: join(directory, "profiles"),
      WORKSPACE_DIR: join(directory, "workspace"),
      ...extraEnvironment,
    },
    stdout: "ignore",
    stderr,
  });
  return { port, directory, child };
}

beforeAll(async () => {
  if (!installed) return;
  fixture = await start({ COMPUTER_ALLOWED_HOSTS: "nas.local,[fd00::5]" });
  const end = Date.now() + 15_000;
  for (;;) {
    if (fixture.child.exitCode !== null)
      throw new Error(`The computer exited with ${fixture.child.exitCode}.`);
    try {
      if ((await fetch(`http://127.0.0.1:${fixture.port}/health`)).ok) break;
    } catch {}
    if (Date.now() > end) throw new Error("The computer never answered.");
    await Bun.sleep(25);
  }
}, 30_000);

afterAll(async () => {
  if (!installed) return;
  fixture.child.kill();
  await fixture.child.exited;
  await rm(fixture.directory, { recursive: true, force: true });
});

describe.skipIf(!installed)("the route list read from the source", () => {
  test("holds the routes that matter, so the loops below are not asking nothing", () => {
    for (const route of [
      "/exec",
      "/health",
      "/stream",
      "/navigate",
      "/files/write",
      "/computers/reset",
      "/egress-policy",
    ])
      expect(ROUTES).toContain(route);
    expect(ROUTES.length).toBeGreaterThan(20);
  });
});

describe.skipIf(!installed)(
  "a page that rebound its name, holding the token",
  () => {
    test("is answered 421 on `/exec`, and the command is NOT run", async () => {
      const marker = join(fixture.directory, "ran-for-a-page");
      const refused = await exec(marker, `evil.example:${fixture.port}`);
      expect(refused.status).toBe(421);
      expect(refused.body).toContain("COMPUTER_ALLOWED_HOSTS");
      expect(refused.body).not.toContain("page-read-this");
      expect(existsSync(marker)).toBeFalse();
    });

    test("the same request under this machine's name runs, so the refusal above is the name's doing", async () => {
      const marker = join(fixture.directory, "ran-for-the-server");
      const ran = await exec(marker, `127.0.0.1:${fixture.port}`);
      expect(ran.status).toBe(200);
      expect(JSON.parse(ran.body)).toMatchObject({
        exitCode: 0,
        stdout: "page-read-this\n",
      });
      expect(existsSync(marker)).toBeTrue();
    });

    test("is answered 421 on every route the computer has, and every method", async () => {
      const answers = await Promise.all(
        ROUTES.flatMap((path) =>
          ["GET", "POST", "PUT", "DELETE"].map(async (method) => ({
            route: `${method} ${path}`,
            answer: await ask(`evil.example:${fixture.port}`, {
              method,
              path,
              ...(method === "GET" ? {} : { body: "{}", extra: JSON_BODY }),
            }),
          })),
        ),
      );
      expect(
        answers
          .filter(({ answer }) => answer.status !== 421)
          .map(({ route, answer }) => `${route} -> ${answer.status}`),
      ).toEqual([]);
    });

    test("is answered 421 on `/health` too, which asks no token", async () => {
      const refused = await ask(`evil.example:${fixture.port}`, {
        path: "/health",
        token: null,
      });
      expect(refused.status).toBe(421);
      expect(refused.body).not.toContain("browser");
    });

    test("has its live-screen socket refused too, before the token is looked at", async () => {
      const upgrade: [string, string][] = [
        ["upgrade", "websocket"],
        ["connection", "Upgrade"],
        ["sec-websocket-version", "13"],
        ["sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="],
      ];
      const stream = `/stream?bot=host-guard&token=${KNOWN_TOKEN}`;
      const refused = await exchange(
        fixture.port,
        written({
          path: stream,
          headers: [["host", `evil.example:${fixture.port}`], ...upgrade],
        }),
      );
      expect(refused.status).toBe(421);
      // The same socket under this machine's name gets as far as the token, which it lacks here.
      const unauthorised = await exchange(
        fixture.port,
        written({
          path: "/stream?bot=host-guard",
          headers: [["host", `127.0.0.1:${fixture.port}`], ...upgrade],
        }),
      );
      expect(unauthorised.status).toBe(401);
    });
  },
);

describe.skipIf(!installed)("this machine's own names, as before", () => {
  test("every spelling of it reaches the token check, and the token still decides", async () => {
    for (const host of [
      `localhost:${fixture.port}`,
      `LOCALHOST:${fixture.port}`,
      `localhost.:${fixture.port}`,
      "localhost",
      `127.0.0.1:${fixture.port}`,
      `127.1:${fixture.port}`,
      `2130706433:${fixture.port}`,
      `[::1]:${fixture.port}`,
      `[0:0:0:0:0:0:0:1]:${fixture.port}`,
      `[::ffff:127.0.0.1]:${fixture.port}`,
      `host.docker.internal:${fixture.port}`,
      // And the one name this deployment configured, with the setting `COMPUTER_ALLOWED_HOSTS`.
      `nas.local:${fixture.port}`,
      `NAS.LOCAL.:${fixture.port}`,
      `[fd00::5]:${fixture.port}`,
    ]) {
      expect((await ask(host, { path: "/health" })).status).toBe(200);
      const marker = join(fixture.directory, "never-written");
      expect((await exec(marker, host, { token: null })).status).toBe(401);
      expect(
        (await exec(marker, host, { token: "not-the-token" })).status,
      ).toBe(401);
      expect(existsSync(marker)).toBeFalse();
    }
  });

  test("the image's own health check, which asks `localhost` from inside, is answered", async () => {
    const answer = await ask(`localhost:${fixture.port}`, {
      path: "/health",
      token: null,
    });
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toMatchObject({ status: "ok" });
  });
});

describe.skipIf(!installed)("the spellings that are not this machine", () => {
  const port = () => fixture.port;

  test("userinfo, two Hosts, a list, a trailing dot of two, upper case, a decimal address that is not loopback", async () => {
    const marker = join(fixture.directory, "never-written-either");
    for (const host of [
      `localhost:${port()}@evil.example`,
      `evil.example@localhost:${port()}`,
      `localhost@evil.example`,
      `localhost, evil.example`,
      `localhost:${port()}, evil.example:${port()}`,
      `localhost..:${port()}`,
      `EVIL.EXAMPLE:${port()}`,
      `localhost.evil.example:${port()}`,
      `127.0.0.1.evil.example:${port()}`,
      `evil.localhost:${port()}`,
      `0.0.0.0:${port()}`,
      `[::]:${port()}`,
      `3232235777:${port()}`,
      `10.0.0.5:${port()}`,
      `agent-computer:${port()}`,
      `nas.local.evil.example:${port()}`,
      `localhost:70000`,
      `localhost:`,
    ])
      expect((await exec(marker, host)).status).toBe(421);
    expect(existsSync(marker)).toBeFalse();
  });

  test("two Host headers, the first of them this machine's", async () => {
    const answer = await exchange(
      port(),
      written({
        method: "POST",
        path: "/exec",
        body: JSON.stringify({ command: "true" }),
        headers: [
          ["host", `localhost:${port()}`],
          ["host", "evil.example"],
          ["connection", "close"],
          ["x-openbot-computer-token", KNOWN_TOKEN],
          ...JSON_BODY,
        ],
      }),
    );
    expect(answer.status).toBe(421);
  });

  test("no Host at all: HTTP/1.1 is turned away by Bun itself, HTTP/1.0 reaches the guard and is refused by it", async () => {
    const marker = join(fixture.directory, "never-written-three");
    expect((await exec(marker, null)).status).toBe(400);
    const oldClient = await exchange(
      port(),
      written({
        version: "1.0",
        method: "POST",
        path: "/exec",
        body: JSON.stringify({ command: `touch ${marker}` }),
        headers: [["x-openbot-computer-token", KNOWN_TOKEN], ...JSON_BODY],
      }),
    );
    expect(oldClient.status).toBe(421);
    expect(existsSync(marker)).toBeFalse();
  });
});

describe.skipIf(!installed || !OTHER_PEER)(
  "a caller that is not on loopback, which is another container and not a page",
  () => {
    const from = () =>
      OTHER_PEER === undefined ? {} : { address: OTHER_PEER };

    test("keeps calling by whatever name it has, and the token decides, as it did", async () => {
      for (const host of [
        `agent-computer:${fixture.port}`,
        "openbot-computer-bot:4100",
        "openbot-computer-0.openbot-computer:4100",
        `${OTHER_PEER}:${fixture.port}`,
        `evil.example:${fixture.port}`,
      ]) {
        expect((await ask(host, { path: "/health", ...from() })).status).toBe(
          200,
        );
        const marker = join(fixture.directory, "never-written-four");
        expect(
          (await exec(marker, host, { token: null, ...from() })).status,
        ).toBe(401);
        expect(
          (await exec(marker, host, { token: "not-the-token", ...from() }))
            .status,
        ).toBe(401);
        expect(existsSync(marker)).toBeFalse();
      }
    });

    test("and with the token it runs a command, from a peer that is not loopback", async () => {
      const marker = join(fixture.directory, "ran-for-the-server-by-name");
      const ran = await exec(marker, `agent-computer:${fixture.port}`, from());
      expect(ran.status).toBe(200);
      expect(existsSync(marker)).toBeTrue();
    });
  },
);

describe.skipIf(!installed)(
  "a setting that is not a list of host names",
  () => {
    test("stops the boot and names the entry, and does not start a computer that ignores it", async () => {
      const started = await start(
        { COMPUTER_ALLOWED_HOSTS: "nas.local,http://nas.local:4100" },
        "pipe",
      );
      try {
        const exited = await Promise.race([
          started.child.exited,
          Bun.sleep(8000).then(() => "still running" as const),
        ]);
        expect(exited).toBe(1);
        const said = await new Response(
          started.child.stderr as ReadableStream,
        ).text();
        expect(said).toContain("COMPUTER_ALLOWED_HOSTS");
        expect(said).toContain("http://nas.local:4100");
      } finally {
        started.child.kill();
        await started.child.exited;
        await rm(started.directory, { recursive: true, force: true });
      }
    }, 20_000);
  },
);
