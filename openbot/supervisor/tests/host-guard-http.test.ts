/**
 * The real supervisor process, asked over sockets under every Host a page could send, with a fake
 * Docker behind it (src/host-guard.ts, docs/M1_PLAN.md D40).
 *
 * THE HOLE, as the repro these tests run: this process holds the Docker socket and answers four verbs
 * behind one bearer token, `SUPERVISOR_TOKEN`, whose development default is public in this repository.
 * Nothing read `Host`. A page at evil.example whose name was re-pointed at 127.0.0.1 has the person's
 * own browser send it same-origin requests, on which it may set any header, the token included, and
 * read the answer. Each such request is made below with the Host that page can only send, from
 * 127.0.0.1, with the public token in hand. Before the guard existed every one of them was answered,
 * and `POST /computers/<bot>/reset` made the daemon remove a Bot's computer and its profile volume.
 *
 * The daemon is a fake: a server on a unix socket in a temporary directory that answers what the
 * supervisor asks of an owned computer and records every call it gets, so "Docker was not asked" is a
 * fact about its log. The process is the real `src/index.ts`, started as a deployment starts it, so the
 * guard is tested where it stands and not where a test would put it. Every request is written by hand on
 * a socket of its own, so a missing Host, two of them and a userinfo trick are sent exactly as written.
 *
 * It needs this directory's own dependencies (Hono and Dockerode), which the root install does not
 * reach. Without them the suite skips; CI installs them for the `tests` job.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { BlockList, connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const installed = (() => {
  try {
    Bun.resolveSync("hono", root);
    Bun.resolveSync("dockerode", root);
    return true;
  } catch {
    return false;
  }
})();

/**
 * The token a page could know: the development default `scripts/start.sh` and `docker-compose.yml`
 * hand out when `.env` sets none, which is public because this repository is.
 */
const KNOWN_TOKEN = "openbot-dev-supervisor-token";

const NAMESPACE = "hostguard";
const BOT = "alpha";
const CONTAINER = `${NAMESPACE}-computer-${BOT}`;
const PROFILE_VOLUME = `${NAMESPACE}-profile-${BOT}`;
const LABELS = {
  "openbot.supervisor": "true",
  "openbot.bot-id": BOT,
  "openbot.namespace": NAMESPACE,
};

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

/**
 * A Docker daemon that owns one computer, the Bot `alpha`'s, and writes down each call it is given.
 * Anything it does not know is answered 500, so a call the supervisor was never meant to make shows.
 */
function fakeDocker(socket: string) {
  const calls: string[] = [];
  let computerThere = true;
  const server = Bun.serve({
    unix: socket,
    fetch(request) {
      const url = new URL(request.url, "http://docker.invalid");
      const path = url.pathname.replace(/^\/v\d+(\.\d+)?/, "");
      calls.push(`${request.method} ${path}`);
      const inspect = /^\/containers\/([^/]+)\/json$/.exec(path);
      if (request.method === "GET" && path === "/_ping")
        return new Response("OK");
      if (request.method === "GET" && path === "/containers/json")
        return Response.json(
          computerThere
            ? [
                {
                  Names: [`/${CONTAINER}`],
                  Labels: LABELS,
                  State: "running",
                  Created: 1_700_000_000,
                  Ports: [],
                },
              ]
            : [],
        );
      // The image is not known to this daemon, which `ensure` reads as "keep the computer as it is".
      if (request.method === "GET" && /^\/images\/.+\/json$/.test(path))
        return Response.json({ message: "No such image" }, { status: 404 });
      if (request.method === "GET" && inspect) {
        return inspect[1] === CONTAINER && computerThere
          ? Response.json({
              State: { Status: "running", Running: true },
              Config: { Labels: LABELS, Env: [] },
              NetworkSettings: { Ports: {} },
              Image: "sha256:fake",
            })
          : Response.json({ message: "No such container" }, { status: 404 });
      }
      if (request.method === "POST" && path === `/containers/${CONTAINER}/stop`)
        return new Response(null, { status: 204 });
      if (request.method === "DELETE" && path === `/containers/${CONTAINER}`) {
        computerThere = false;
        return new Response(null, { status: 204 });
      }
      if (request.method === "DELETE" && path === `/volumes/${PROFILE_VOLUME}`)
        return new Response(null, { status: 204 });
      return Response.json(
        { message: "The fake daemon has no such call." },
        {
          status: 500,
        },
      );
    },
  });
  return {
    calls,
    /** Back to what each test starts from: the computer is there and nothing has been asked. */
    reset() {
      computerThere = true;
      calls.length = 0;
    },
    stop: () => server.stop(true),
  };
}

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

let fixture: {
  port: number;
  directory: string;
  child: ReturnType<typeof Bun.spawn>;
  docker: ReturnType<typeof fakeDocker>;
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
  return exchange(
    fixture.port,
    written({
      ...rest,
      headers: [
        ...(host === null ? [] : ([["host", host]] as [string, string][])),
        ["connection", "close"],
        ...(token === null
          ? []
          : ([["authorization", `Bearer ${token}`]] as [string, string][])),
        ...extra,
      ],
    }),
    address,
  );
}

/** What a page would do with the token: take a Bot's computer and its profile away. */
function reset(
  host: string | null,
  options: { token?: string | null; address?: string; bot?: string } = {},
) {
  const { bot = BOT, ...rest } = options;
  return ask(host, {
    method: "POST",
    path: `/computers/${bot}/reset`,
    body: "{}",
    extra: [["content-type", "application/json"]],
    ...rest,
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

/** The environment of a supervisor that depends on nothing of this machine's own. */
function hermetic(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      /^(SPIRE_|FREEDUET_COMPUTER_|COMPUTER_|SUPERVISOR_|EGRESS_PROXY|DOCKER_)/.test(
        key,
      )
    )
      continue;
    env[key] = value;
  }
  return env;
}

async function start(
  extraEnvironment: Record<string, string>,
  stderr: "inherit" | "pipe" = "inherit",
) {
  const directory = await mkdtemp(join(tmpdir(), "host-guard-supervisor-"));
  const docker = fakeDocker(join(directory, "docker.sock"));
  const port = await freePort();
  const child = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: root,
    env: {
      ...hermetic(),
      COMPUTER_NAMESPACE: NAMESPACE,
      DOCKER_SOCKET: join(directory, "docker.sock"),
      PORT: String(port),
      SUPERVISOR_TOKEN: KNOWN_TOKEN,
      ...extraEnvironment,
    },
    stdout: "ignore",
    stderr,
  });
  return { port, directory, child, docker };
}

beforeAll(async () => {
  if (!installed) return;
  fixture = await start({ SUPERVISOR_ALLOWED_HOSTS: "nas.local,[fd00::5]" });
  const end = Date.now() + 15_000;
  for (;;) {
    if (fixture.child.exitCode !== null)
      throw new Error(`The supervisor exited with ${fixture.child.exitCode}.`);
    try {
      if ((await fetch(`http://127.0.0.1:${fixture.port}/health`)).ok) break;
    } catch {}
    if (Date.now() > end) throw new Error("The supervisor never answered.");
    await Bun.sleep(25);
  }
}, 30_000);

afterAll(async () => {
  if (!installed) return;
  fixture.child.kill();
  await fixture.child.exited;
  fixture.docker.stop();
  await rm(fixture.directory, { recursive: true, force: true });
});

describe.skipIf(!installed)(
  "a page that rebound its name, holding the token",
  () => {
    test("is answered 421 on reset, and Docker is NOT asked: the computer and its profile stay", async () => {
      fixture.docker.reset();
      const refused = await reset(`evil.example:${fixture.port}`);
      expect(refused.status).toBe(421);
      expect(refused.body).toContain("SUPERVISOR_ALLOWED_HOSTS");
      expect(fixture.docker.calls).toEqual([]);
      // Still there: this machine's own name lists the computer the page tried to remove.
      const listed = await ask(`127.0.0.1:${fixture.port}`, {
        path: "/computers",
      });
      expect(JSON.parse(listed.body)).toMatchObject({
        computers: [{ botId: BOT, container: CONTAINER, status: "running" }],
      });
    });

    test("the same request under this machine's name resets it, so the refusal above is the name's doing", async () => {
      fixture.docker.reset();
      const ran = await reset(`127.0.0.1:${fixture.port}`);
      expect(ran.status).toBe(200);
      expect(JSON.parse(ran.body)).toEqual({ reset: true });
      expect(fixture.docker.calls).toContain(`DELETE /containers/${CONTAINER}`);
      expect(fixture.docker.calls).toContain(
        `DELETE /volumes/${PROFILE_VOLUME}`,
      );
    });

    test("is answered 421 on every verb and on every other path, on every method, and Docker is not asked", async () => {
      const paths = [
        "/health",
        "/computers",
        `/computers/${BOT}/ensure`,
        `/computers/${BOT}/stop`,
        `/computers/${BOT}/reset`,
        "/computers/not.a.bot/ensure",
        "/",
        "/containers/json",
        "/nothing-here",
      ];
      // One at a time, each against a daemon that has the computer: requests that raced each other
      // would have a reset take the computer away from an ensure that is waiting for it.
      const answered: string[] = [];
      for (const path of paths)
        for (const method of [
          "GET",
          "POST",
          "PUT",
          "DELETE",
          "PATCH",
          "OPTIONS",
        ]) {
          fixture.docker.reset();
          const answer = await ask(`evil.example:${fixture.port}`, {
            method,
            path,
            ...(method === "GET"
              ? {}
              : { body: "{}", extra: [["content-type", "application/json"]] }),
          });
          if (answer.status !== 421 || fixture.docker.calls.length > 0)
            answered.push(
              `${method} ${path} -> ${answer.status}, Docker asked ${JSON.stringify(fixture.docker.calls)}`,
            );
        }
      expect(answered).toEqual([]);
    }, 20_000);

    test("is answered 421 on `/health` too, which asks no token, and the daemon is not pinged for it", async () => {
      fixture.docker.reset();
      const refused = await ask(`evil.example:${fixture.port}`, {
        path: "/health",
        token: null,
      });
      expect(refused.status).toBe(421);
      expect(refused.body).not.toContain('"docker"');
      expect(fixture.docker.calls).toEqual([]);
    });

    test("is answered 421 when it asks for a socket upgrade too, before the token is looked at", async () => {
      fixture.docker.reset();
      const upgrade: [string, string][] = [
        ["upgrade", "websocket"],
        ["connection", "Upgrade"],
        ["sec-websocket-version", "13"],
        ["sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="],
      ];
      const refused = await exchange(
        fixture.port,
        written({
          path: "/computers",
          headers: [
            ["host", `evil.example:${fixture.port}`],
            ["authorization", `Bearer ${KNOWN_TOKEN}`],
            ...upgrade,
          ],
        }),
      );
      expect(refused.status).toBe(421);
      // This machine's name gets as far as the token, which it lacks here.
      const unauthorised = await exchange(
        fixture.port,
        written({
          path: "/computers",
          headers: [["host", `127.0.0.1:${fixture.port}`], ...upgrade],
        }),
      );
      expect(unauthorised.status).toBe(401);
      expect(fixture.docker.calls).toEqual([]);
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
      // And the one name this deployment configured, with the setting `SUPERVISOR_ALLOWED_HOSTS`.
      `nas.local:${fixture.port}`,
      `NAS.LOCAL.:${fixture.port}`,
      `[fd00::5]:${fixture.port}`,
    ]) {
      fixture.docker.reset();
      expect(await ask(host, { path: "/health", token: null })).toMatchObject({
        status: 200,
        body: expect.stringContaining('"status":"ok"'),
      });
      expect((await reset(host, { token: null })).status).toBe(401);
      expect((await reset(host, { token: "not-the-token" })).status).toBe(401);
      // The refusals above never reached the daemon: only the health check pinged it.
      expect(fixture.docker.calls).toEqual(["GET /_ping"]);
    }
  });

  test("the verbs answer as they did: list, ensure, stop, reset, a Bot that is not there, an id that is not a Bot id", async () => {
    const host = `localhost:${fixture.port}`;
    fixture.docker.reset();

    const health = await ask(host, { path: "/health", token: null });
    expect(JSON.parse(health.body)).toEqual({ status: "ok", docker: true });

    const listed = await ask(host, { path: "/computers" });
    expect(listed.status).toBe(200);
    expect(JSON.parse(listed.body)).toMatchObject({
      computers: [{ botId: BOT, container: CONTAINER, status: "running" }],
    });

    // A computer that is there and running is handed out as it is, and Docker is asked about it.
    const ensured = await ask(host, {
      method: "POST",
      path: `/computers/${BOT}/ensure`,
      body: "{}",
    });
    expect(ensured.status).toBe(200);
    expect(JSON.parse(ensured.body)).toMatchObject({
      botId: BOT,
      container: CONTAINER,
      status: "running",
    });
    expect(fixture.docker.calls).toContain(`GET /containers/${CONTAINER}/json`);

    const stopped = await ask(host, {
      method: "POST",
      path: `/computers/${BOT}/stop`,
      body: "{}",
    });
    expect(JSON.parse(stopped.body)).toEqual({ stopped: true });
    expect(fixture.docker.calls).toContain(
      `POST /containers/${CONTAINER}/stop`,
    );

    const absentStop = await ask(host, {
      method: "POST",
      path: "/computers/ghost/stop",
      body: "{}",
    });
    expect(JSON.parse(absentStop.body)).toEqual({ stopped: false });
    const absentReset = await reset(host, { bot: "ghost" });
    expect(JSON.parse(absentReset.body)).toEqual({ reset: false });

    const notABot = await ask(host, {
      method: "POST",
      path: "/computers/not.a.bot/ensure",
      body: "{}",
    });
    expect(notABot.status).toBe(400);

    const gone = await reset(host);
    expect(JSON.parse(gone.body)).toEqual({ reset: true });
    expect(fixture.docker.calls).toContain(`DELETE /containers/${CONTAINER}`);
    expect(fixture.docker.calls).toContain(`DELETE /volumes/${PROFILE_VOLUME}`);
    const listedAgain = await ask(host, { path: "/computers" });
    expect(JSON.parse(listedAgain.body)).toEqual({ computers: [] });
  });
});

describe.skipIf(!installed)("the spellings that are not this machine", () => {
  const port = () => fixture.port;

  test("userinfo, a list, a trailing dot of two, upper case, an address that is not loopback", async () => {
    fixture.docker.reset();
    for (const host of [
      `localhost:${port()}@evil.example`,
      `evil.example@localhost:${port()}`,
      "localhost@evil.example",
      "localhost, evil.example",
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
      `supervisor:${port()}`,
      `nas.local.evil.example:${port()}`,
      "localhost:70000",
      "localhost:",
    ])
      expect((await reset(host)).status).toBe(421);
    expect(fixture.docker.calls).toEqual([]);
  });

  test("two Host headers, the first of them this machine's", async () => {
    fixture.docker.reset();
    const answer = await exchange(
      port(),
      written({
        method: "POST",
        path: `/computers/${BOT}/reset`,
        body: "{}",
        headers: [
          ["host", `localhost:${port()}`],
          ["host", "evil.example"],
          ["connection", "close"],
          ["authorization", `Bearer ${KNOWN_TOKEN}`],
        ],
      }),
    );
    expect(answer.status).toBe(421);
    expect(fixture.docker.calls).toEqual([]);
  });

  test("no Host at all: HTTP/1.1 is turned away by Bun itself, HTTP/1.0 reaches the guard and is refused by it", async () => {
    fixture.docker.reset();
    expect((await reset(null)).status).toBe(400);
    const oldClient = await exchange(
      port(),
      written({
        version: "1.0",
        method: "POST",
        path: `/computers/${BOT}/reset`,
        body: "{}",
        headers: [["authorization", `Bearer ${KNOWN_TOKEN}`]],
      }),
    );
    expect(oldClient.status).toBe(421);
    expect(fixture.docker.calls).toEqual([]);
  });
});

describe.skipIf(!installed || !OTHER_PEER)(
  "a caller that is not on loopback, which is the server in the compose network and not a page",
  () => {
    const from = () =>
      OTHER_PEER === undefined ? {} : { address: OTHER_PEER };

    test("keeps calling by whatever name it has, and the token decides, as it did", async () => {
      for (const host of [
        `supervisor:${fixture.port}`,
        "openbot-supervisor:4300",
        `${OTHER_PEER}:${fixture.port}`,
        `evil.example:${fixture.port}`,
      ]) {
        fixture.docker.reset();
        expect(
          (await ask(host, { path: "/health", token: null, ...from() })).status,
        ).toBe(200);
        expect((await reset(host, { token: null, ...from() })).status).toBe(
          401,
        );
        expect(
          (await reset(host, { token: "not-the-token", ...from() })).status,
        ).toBe(401);
        expect(fixture.docker.calls).toEqual(["GET /_ping"]);
      }
    });

    test("and with the token it lists and resets a computer, from a peer that is not loopback", async () => {
      fixture.docker.reset();
      const host = `supervisor:${fixture.port}`;
      const listed = await ask(host, { path: "/computers", ...from() });
      expect(listed.status).toBe(200);
      expect(JSON.parse(listed.body)).toMatchObject({
        computers: [{ botId: BOT }],
      });
      const gone = await reset(host, from());
      expect(JSON.parse(gone.body)).toEqual({ reset: true });
      expect(fixture.docker.calls).toContain(`DELETE /containers/${CONTAINER}`);
    });
  },
);

describe.skipIf(!installed)(
  "a setting that is not a list of host names",
  () => {
    test("stops the boot and names the entry, and does not start a supervisor that ignores it", async () => {
      const started = await start(
        { SUPERVISOR_ALLOWED_HOSTS: "nas.local,http://nas.local:4300" },
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
        expect(said).toContain("SUPERVISOR_ALLOWED_HOSTS");
        expect(said).toContain("http://nas.local:4300");
      } finally {
        started.child.kill();
        await started.child.exited;
        started.docker.stop();
        await rm(started.directory, { recursive: true, force: true });
      }
    }, 20_000);
  },
);
