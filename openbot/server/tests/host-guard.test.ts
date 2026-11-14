/**
 * With no sign-in, a request from this machine's loopback is answered only under this machine's own
 * names (auth/host-guard.ts).
 *
 * THE HOLE, in the repro these tests run: the person is whoever connects from loopback
 * (auth/peer.ts), the cross-site guard lets every GET through (auth/same-origin.ts), and nothing read
 * `Host`. A page at evil.example whose name was re-pointed at 127.0.0.1 therefore got the person's own
 * browser to send it same-origin reads (`Sec-Fetch-Site: same-origin`, no `Origin`) and read the
 * answers: `GET /api/approvals`, the runtime, the channel socket. Each is asked below with the Host
 * that page can only send, and answered 200, 200 and 101 before the guard existed.
 *
 * Served by the real `startHttpServer`, over sockets written by hand so the headers are exactly the
 * ones written: a missing Host, two of them, and a userinfo trick cannot be sent any other way. The
 * assembled app (`createApp`) is behind it where the point is that a real route stayed unreached.
 * This sandbox may have no ::1, so `[::1]` is a Host written on a socket to 127.0.0.1.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { Hono } from "hono";
import { mintRunAssertion } from "../src/agents/callback-token";
import { createApp } from "../src/app";
import type { ApprovalService } from "../src/approvals/service";
import { createHostGuard, hostnameOf } from "../src/auth/host-guard";
import { createChannelEventHub } from "../src/channels/events";
import type { ChannelStore } from "../src/channels/routes";
import { type DeploymentConfig, loadConfig } from "../src/config";
import { startHttpServer } from "../src/http-server";
import type { RoutineRunner } from "../src/routines/runner";
import { testEnvironment } from "./support/environment";

const TOOL_TOKEN = "deployment-wide-agent-token";
const WORKER_SECRET = "worker-shared-secret-for-this-test";

/** This machine's own address that is not loopback: what stands in for the Docker bridge. */
const BRIDGE = Object.values(networkInterfaces())
  .flat()
  .find(
    (entry) => entry && entry.family === "IPv4" && !entry.internal,
  )?.address;

function singleUser(overrides: Record<string, string> = {}) {
  const {
    GOOGLE_OAUTH_CLIENT_ID: _id,
    GOOGLE_OAUTH_CLIENT_SECRET: _secret,
    BETTER_AUTH_SECRET: _auth,
    BETTER_AUTH_URL: _url,
    INITIAL_ADMIN_EMAILS: _admins,
    ...rest
  } = testEnvironment();
  return {
    ...rest,
    OPENBOT_SINGLE_USER: "true",
    AGENT_TOOL_TOKEN: TOOL_TOKEN,
    WORKER_SHARED_SECRET: WORKER_SECRET,
    ...overrides,
  };
}

/** What `os.networkInterfaces()` says on a Linux host that has Docker: `docker0` at this address. */
function bridgeInterfaces(address: string | undefined) {
  if (!address) return {};
  return {
    docker0: [
      {
        address,
        netmask: "255.255.255.0",
        family: "IPv4",
        mac: "00:00:00:00:00:00",
        internal: false,
        cidr: `${address}/24`,
      },
    ],
  } as unknown as ReturnType<typeof networkInterfaces>;
}

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port;
  probe.stop(true);
  return port as number;
}

type Answer = { status: number; head: string; body: string };

/** One request written exactly as given on a socket of its own, and the answer to it. */
function exchange(
  port: number,
  wire: string,
  address = "127.0.0.1",
): Promise<Answer> {
  return new Promise((resolve, reject) => {
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
    socket.setTimeout(8000, () => {
      settled = true;
      socket.destroy();
      reject(new Error("timed out"));
    });
    socket.on("data", (chunk: string) => {
      data += chunk;
      // A response whose length is known is complete when that much has arrived, and an upgrade is
      // answered as soon as its head is.
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
    socket.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
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
    `${request.method ?? "GET"} ${request.path ?? "/api/approvals"} HTTP/${request.version ?? "1.1"}`,
    ...(request.headers ?? []).map(([name, value]) => `${name}: ${value}`),
  ];
  return `${lines.join("\r\n")}\r\n\r\n${request.body ?? ""}`;
}

/** A request under one Host, from this machine's loopback unless an address says otherwise. */
function ask(
  port: number,
  host: string | null,
  options: Omit<Wire, "headers"> & {
    headers?: Record<string, string>;
    address?: string;
  } = {},
): Promise<Answer> {
  const { headers = {}, address, ...rest } = options;
  return exchange(
    port,
    written({
      ...rest,
      headers: [
        ...(host === null ? [] : ([["host", host]] as [string, string][])),
        ["connection", "close"],
        ...Object.entries(headers),
      ],
    }),
    address,
  );
}

const JSON_HEADERS = { "content-type": "application/json" };
const RULE = JSON.stringify({ toolRef: "*", behaviour: "allow" });
const UPGRADE = {
  upgrade: "websocket",
  connection: "Upgrade",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
};
/** What a browser sends for a read its own page makes: same-origin, so no `Origin` on a GET. */
const REBOUND_READ = {
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  accept: "application/json",
  "user-agent": "Mozilla/5.0",
};

/** What a counting stand-in for the app was asked, in order. */
function standIn() {
  const reached: string[] = [];
  const app = new Hono().all("*", (context) => {
    reached.push(`${context.req.method} ${context.req.path}`);
    return context.json({ reached: true });
  });
  return { reached, app: { fetch: app.fetch.bind(app) } };
}

function serve(
  config: DeploymentConfig,
  app: {
    fetch: (
      request: Request,
      env: { server: unknown },
    ) => Response | Promise<Response>;
  },
) {
  const port = freePort();
  const server = startHttpServer({
    port,
    config,
    resolveRequestActor: async () => ({
      id: "dev-local-user",
      name: "dev@openbot.local",
      role: "admin" as const,
    }),
    agentProfileStore: {} as never,
    computerGateway: undefined,
    demonstrationStore: {} as never,
    demonstrationRecorder: {} as never,
    app,
  });
  return { port, stop: server.stop };
}

type Calls = {
  rules: unknown[];
  tools: number;
  copilot: number;
  routines: number;
};

/** The assembled app with a fake behind each door that matters, as single-user-peer.test.ts does. */
function assemble(config: DeploymentConfig) {
  const calls: Calls = { rules: [], tools: 0, copilot: 0, routines: 0 };
  const approvals = {
    inbox: async () => ({ pending: [] }),
    createRule: async (_owner: string, input: unknown) => {
      calls.rules.push(input);
      return { id: "rule-1", ...(input as object) };
    },
  } as unknown as ApprovalService;
  const runtime = new Hono().basePath("/api/copilotkit").all("*", (context) => {
    calls.copilot += 1;
    return context.json({ reached: "runtime" });
  });
  const args: unknown[] = new Array(35).fill(undefined);
  args[0] = config;
  args[6] = runtime;
  args[10] = {} as ChannelStore;
  args[11] = createChannelEventHub();
  args[21] = {
    run: async () => {
      calls.routines += 1;
    },
  } as unknown as RoutineRunner;
  args[28] = async () => {
    calls.tools += 1;
    return { text: "tool ran", isError: false };
  };
  args[34] = { approvals };
  const app = (
    createApp as (...values: unknown[]) => ReturnType<typeof createApp>
  )(...args);
  return { app: { fetch: app.fetch.bind(app) }, calls };
}

describe("reading a Host header", () => {
  test("host and port, the way a browser reads a URL's host", () => {
    expect(hostnameOf("localhost:3001")).toBe("localhost");
    expect(hostnameOf("localhost")).toBe("localhost");
    expect(hostnameOf("Example.COM:8080")).toBe("example.com");
    expect(hostnameOf("127.0.0.1:3001")).toBe("127.0.0.1");
    expect(hostnameOf("[::1]:3001")).toBe("[::1]");
  });

  test("upper case is the same name, and one trailing dot is the name written out in full", () => {
    expect(hostnameOf("LOCALHOST:3001")).toBe("localhost");
    expect(hostnameOf("LocalHost.:3001")).toBe("localhost");
    expect(hostnameOf("localhost..:3001")).toBe("localhost.");
  });

  test("an address is read in its one canonical spelling, IPv6 forms included", () => {
    expect(hostnameOf("[0:0:0:0:0:0:0:1]:3001")).toBe("[::1]");
    expect(hostnameOf("[0000:0000:0000:0000:0000:0000:0000:0001]")).toBe(
      "[::1]",
    );
    expect(hostnameOf("[::FFFF:127.0.0.1]")).toBe("[::ffff:7f00:1]");
    expect(hostnameOf("127.1")).toBe("127.0.0.1");
    expect(hostnameOf("2130706433")).toBe("127.0.0.1");
  });

  test("anything that is not one host and an optional port is nothing", () => {
    for (const header of [
      null,
      "",
      " ",
      "localhost:",
      "localhost:3001:3001",
      "localhost:65536",
      "localhost:99999999",
      "localhost:-1",
      "a@localhost",
      "localhost@evil.example",
      "evil.example@localhost:3001",
      "localhost:3001@evil.example",
      "localhost/",
      "localhost:3001/x",
      "localhost?x",
      "localhost#x",
      "localhost\\evil.example",
      "localhost%2f.evil.example",
      "localhost evil.example",
      " localhost",
      "localhost ",
      "localhost\n",
      "lo\tcalhost",
      "localhost, evil.example",
      "localhost:3001, evil.example:3001",
      "[::1",
      "::1",
      "[::1]x",
      "[::1].",
      "[zz]:3001",
      "http://localhost",
      "ｌｏｃａｌｈｏｓｔ",
    ])
      expect(hostnameOf(header)).toBeNull();
  });
});

describe("which Hosts a loopback request may use", () => {
  const guard = createHostGuard(loadConfig(singleUser(), {}));
  const peer = (address: string) => ({ requestIP: () => ({ address }) });
  const ask1 = (host: string | null, ...given: [server?: unknown]) =>
    guard(
      new Request(
        "http://localhost:3001/api/approvals",
        host === null ? {} : { headers: { host } },
      ),
      given.length > 0 ? given[0] : peer("127.0.0.1"),
    );

  test("this machine, under every name it has: any port, any spelling", () => {
    for (const host of [
      "localhost:3001",
      "LOCALHOST:3001",
      "localhost.:3001",
      "localhost",
      "localhost:3010",
      "localhost:9",
      "127.0.0.1:3001",
      "127.0.0.1:3010",
      "127.1.2.3:3001",
      "127.1",
      "2130706433:3001",
      "[::1]:3001",
      "[::1]:3010",
      "[0:0:0:0:0:0:0:1]:3001",
      "[::ffff:127.0.0.1]:3001",
      "host.docker.internal:3001",
      "HOST.DOCKER.INTERNAL:3001",
    ])
      expect(ask1(host)).toBeNull();
  });

  test("every other name is refused with 421, and the answer says which setting to use", async () => {
    for (const host of [
      "evil.example:3001",
      "evil.example",
      "Evil.Example.:3001",
      "localhost.evil.example:3001",
      "127.0.0.1.evil.example:3001",
      "host.docker.internal.evil.example:3001",
      "evil.localhost:3001",
      "localhost..:3001",
      "0.0.0.0:3001",
      "[::]:3001",
      "10.0.0.5:3001",
      "192.168.1.10:3001",
      "[2001:db8::1]:3001",
      "8.8.8.8",
      "localhost:3001@evil.example",
      "evil.example@localhost:3001",
      "localhost:70000",
      "localhost:",
      "localhost,evil.example",
    ]) {
      const refused = ask1(host);
      expect(refused?.status).toBe(421);
    }
    const body = await ask1("evil.example:3001")?.json();
    expect(body).toEqual({ error: expect.stringContaining("TRUSTED_ORIGINS") });
  });

  test("no Host at all is refused", () => {
    expect(ask1(null)?.status).toBe(421);
  });

  test("only a request from loopback is held to it: a Bot's container, and no peer at all, are not", () => {
    for (const address of [
      "172.17.0.1",
      "198.19.255.1",
      "192.168.1.10",
      "::ffff:172.17.0.1",
    ]) {
      expect(ask1("evil.example:3001", peer(address))).toBeNull();
      expect(ask1(null, peer(address))).toBeNull();
    }
    for (const server of [
      undefined,
      {},
      { requestIP: () => null },
      {
        requestIP: () => {
          throw new Error("socket closed");
        },
      },
    ])
      expect(ask1("evil.example:3001", server)).toBeNull();
  });

  test("a loopback peer in any of its spellings is held to it", () => {
    for (const address of [
      "127.0.0.1",
      "127.8.9.10",
      "::1",
      "::ffff:127.0.0.1",
    ])
      expect(ask1("evil.example:3001", peer(address))?.status).toBe(421);
  });

  test("a name the person configured passes, on any port, and nothing else does with it", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const configured = createHostGuard(
        loadConfig(
          singleUser({
            TRUSTED_ORIGINS: "http://nas.local:3010,http://[fd00::5]:3010",
            OPENBOT_APP_URL: "http://192.168.1.10:3010",
          }),
          {},
        ),
      );
      const configuredAsk = (host: string) =>
        configured(
          new Request("http://localhost:3001/api/approvals", {
            headers: { host },
          }),
          peer("127.0.0.1"),
        );
      for (const host of [
        "nas.local:3010",
        "NAS.local.:3010",
        "nas.local:3001",
        "nas.local",
        "[fd00::5]:3010",
        "192.168.1.10:3010",
        "localhost:3001",
      ])
        expect(configuredAsk(host)).toBeNull();
      for (const host of [
        "other.local:3010",
        "nas.local.evil.example:3010",
        "evil.example:3010",
        "192.168.1.11:3010",
      ])
        expect(configuredAsk(host)?.status).toBe(421);
    } finally {
      warn.mockRestore();
    }
  });

  test("a name the public internet answers to cannot be configured with no sign-in at all", () => {
    expect(() =>
      loadConfig(
        singleUser({ TRUSTED_ORIGINS: "https://duet.example.com" }),
        {},
      ),
    ).toThrow("public internet");
  });

  test("not held to it where the person is not a loopback peer: sign-in, or a server opened with OPENBOT_HOST", () => {
    for (const config of [
      loadConfig(testEnvironment(), {}),
      loadConfig(singleUser({ OPENBOT_HOST: "0.0.0.0" }), {}),
      loadConfig(singleUser({ OPENBOT_HOST: "192.168.1.10" }), {}),
    ]) {
      const open = createHostGuard(config);
      expect(
        open(
          new Request("http://localhost:3001/api/approvals", {
            headers: { host: "evil.example:3001" },
          }),
          peer("127.0.0.1"),
        ),
      ).toBeNull();
    }
    expect(
      createHostGuard(
        loadConfig(singleUser({ OPENBOT_HOST: "127.0.0.1,::1" }), {}),
      )(
        new Request("http://localhost:3001/", {
          headers: { host: "evil.example:3001" },
        }),
        peer("127.0.0.1"),
      )?.status,
    ).toBe(421);
  });
});

describe("the front door", () => {
  const config = loadConfig(singleUser(), {});
  const { reached, app } = standIn();
  let port = 0;
  let stop = () => {};

  beforeAll(() => {
    const served = serve(config, app);
    port = served.port;
    stop = served.stop;
  });
  afterAll(() => stop());

  test("a page that rebound its name is answered 421 and nothing behind the door is reached", async () => {
    const before = reached.length;
    for (const path of [
      "/api/approvals",
      "/api/copilotkit/info",
      "/api/me",
      "/api/threads",
      "/health",
      "/api/capabilities",
      "/",
    ]) {
      const answer = await ask(port, `evil.example:${port}`, {
        path,
        headers: REBOUND_READ,
      });
      expect(answer.status).toBe(421);
      expect(answer.body).toContain("TRUSTED_ORIGINS");
    }
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
      expect(
        (await ask(port, `evil.example:${port}`, { method, path: "/api/me" }))
          .status,
      ).toBe(421);
    expect(reached).toHaveLength(before);
  });

  test("the same page's sockets are refused too, the channel socket and the live screen's", async () => {
    const before = reached.length;
    for (const path of [
      "/api/channels/events",
      "/api/computers/bot-1/stream",
    ]) {
      expect(
        (
          await ask(port, `evil.example:${port}`, {
            path,
            headers: UPGRADE,
          })
        ).status,
      ).toBe(421);
      expect(
        (
          await ask(port, `evil.example:${port}`, {
            path,
            headers: { ...UPGRADE, origin: `http://evil.example:${port}` },
          })
        ).status,
      ).toBe(421);
    }
    expect(reached).toHaveLength(before);
  });

  test("this machine's own names reach the app as they did", async () => {
    const before = reached.length;
    const hosts = [
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      `[::1]:${port}`,
      `LOCALHOST:${port}`,
      `localhost.:${port}`,
      "localhost:3010",
      "127.0.0.1:3010",
      "[::1]:3010",
      `host.docker.internal:${port}`,
    ];
    for (const host of hosts)
      expect((await ask(port, host, { headers: REBOUND_READ })).status).toBe(
        200,
      );
    expect(reached).toHaveLength(before + hosts.length);
  });

  test("a socket to the live screen under this machine's own name gets as far as the computer check", async () => {
    // No computer is configured here, which is what the person is told once the Host is let through.
    expect(
      (
        await ask(port, `localhost:${port}`, {
          path: "/api/computers/bot-1/stream",
          headers: UPGRADE,
        })
      ).status,
    ).toBe(503);
  });

  test("a request with no Host, or one that cannot be read, is refused by the guard and not by a crash", async () => {
    const before = reached.length;
    const noHost = await exchange(
      port,
      written({ version: "1.0", headers: [] }),
    );
    expect(noHost.status).toBe(421);
    expect(noHost.body).toContain("TRUSTED_ORIGINS");
    // HTTP/1.1 with no Host is turned away by Bun itself, with 400, before any code of ours.
    expect((await ask(port, null, { path: "/api/me" })).status).toBe(400);
    for (const host of [
      "localhost:3001@evil.example",
      "evil.example@localhost:3001",
      "a@localhost",
      "localhost:3001/x",
      "localhost%2f.evil.example",
      "localhost:99999999",
      "",
    ])
      expect((await ask(port, host)).status).toBe(421);
    expect(reached).toHaveLength(before);
  });

  test("two Host headers are refused whichever comes first, as is a name written after a comma", async () => {
    const before = reached.length;
    for (const hosts of [
      [`localhost:${port}`, "evil.example"],
      ["evil.example", `localhost:${port}`],
      [`localhost:${port}`, `localhost:${port}`],
    ])
      expect(
        (
          await exchange(
            port,
            written({
              headers: [
                ...hosts.map((host) => ["host", host] as [string, string]),
                ["connection", "close"],
              ],
            }),
          )
        ).status,
      ).toBe(421);
    expect((await ask(port, `localhost:${port}, evil.example`)).status).toBe(
      421,
    );
    expect(reached).toHaveLength(before);
  });

  test("an absolute-form target does not change which Host counts", async () => {
    const before = reached.length;
    expect(
      (
        await exchange(
          port,
          written({
            path: "http://localhost/api/approvals",
            headers: [
              ["host", `evil.example:${port}`],
              ["connection", "close"],
            ],
          }),
        )
      ).status,
    ).toBe(421);
    expect(reached).toHaveLength(before);
  });
});

describe("the assembled app behind the front door", () => {
  const config = loadConfig(singleUser(), {});
  const { app, calls } = assemble(config);
  let port = 0;
  let stop = () => {};

  beforeAll(() => {
    const served = serve(config, app);
    port = served.port;
    stop = served.stop;
  });
  afterAll(() => stop());

  test("the repro: a rebound page's reads, which were answered 200, are refused and read nothing", async () => {
    const reads = calls.copilot;
    const evil = `evil.example:${port}`;
    for (const path of ["/api/approvals", "/health", "/api/capabilities"])
      expect(
        (await ask(port, evil, { path, headers: REBOUND_READ })).status,
      ).toBe(421);
    for (const path of [
      "/api/copilotkit",
      "/api/copilotkit/",
      "/api/copilotkit/info",
      "/api/copilotkit/threads",
      "/%61pi/copilotkit/info",
    ])
      expect(
        (await ask(port, evil, { path, headers: REBOUND_READ })).status,
      ).toBe(421);
    expect(
      (
        await ask(port, evil, {
          path: "/api/channels/events",
          headers: UPGRADE,
        })
      ).status,
    ).toBe(421);
    expect(calls.copilot).toBe(reads);
  });

  test("and what the page's own browser would have to write is refused before any rule is stored", async () => {
    const evil = `evil.example:${port}`;
    const answer = await ask(port, evil, {
      method: "POST",
      path: "/api/approvals/rules",
      headers: {
        ...JSON_HEADERS,
        origin: `http://${evil}`,
        "content-length": String(RULE.length),
      },
      body: RULE,
    });
    expect(answer.status).toBe(421);
    expect(calls.rules).toHaveLength(0);
  });

  test("the person's own browser is unchanged, through the server's port and through the app's", async () => {
    for (const host of [
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      `[::1]:${port}`,
      "localhost:3010",
      "127.0.0.1:3010",
      "[::1]:3010",
    ]) {
      expect(
        (
          await ask(port, host, {
            path: "/api/approvals",
            headers: REBOUND_READ,
          })
        ).status,
      ).toBe(200);
      expect((await ask(port, host, { path: "/health" })).status).toBe(200);
      expect(
        (await ask(port, host, { path: "/api/copilotkit/info" })).status,
      ).toBe(200);
      expect(
        (
          await ask(port, host, {
            path: "/api/channels/events",
            headers: UPGRADE,
          })
        ).status,
      ).toBe(101);
    }
    const rule = await ask(port, "localhost:3010", {
      method: "POST",
      path: "/api/approvals/rules",
      headers: {
        ...JSON_HEADERS,
        origin: "http://localhost:3010",
        "content-length": String(RULE.length),
      },
      body: RULE,
    });
    expect(rule.status).toBe(201);
    expect(calls.rules).toHaveLength(1);
  });

  test("a Bot calling back from Docker Desktop, which delivers it from loopback, still gets through with its token", async () => {
    const run = mintRunAssertion(
      { botId: "knowledge", actorId: "usr_7", runId: "run_1" },
      config.keyEncryptionKey,
    );
    const body = JSON.stringify({
      name: "mcp__linear__LINEAR_CREATE_ISSUE",
      args: {},
      run,
    });
    const answer = await ask(port, `host.docker.internal:${port}`, {
      method: "POST",
      path: "/api/agent-tools/call",
      headers: {
        ...JSON_HEADERS,
        "x-openbot-agent-token": TOOL_TOKEN,
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
    });
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({
      text: "tool ran",
      isError: false,
    });
    expect(calls.tools).toBe(1);
  });

  test("the scripts, the worker and the health checks, which all say localhost or 127.0.0.1", async () => {
    expect(
      (await ask(port, `localhost:${port}`, { path: "/health" })).status,
    ).toBe(200);
    const hand = await ask(port, `localhost:${port}`, {
      method: "POST",
      path: "/internal/routines/run",
      headers: {
        ...JSON_HEADERS,
        authorization: `Bearer ${WORKER_SECRET}`,
        "content-length": String(
          Buffer.byteLength(JSON.stringify({ routineRunId: "run-1" })),
        ),
      },
      body: JSON.stringify({ routineRunId: "run-1" }),
    });
    expect(hand.status).toBe(202);
    expect(calls.routines).toBe(1);
  });
});

describe("the installed app's own proxy", () => {
  const config = loadConfig(singleUser(), {});
  const { app } = assemble(config);
  const served = serve(config, app);
  const appPort = freePort();
  const child = Bun.spawn(["bun", "serve.ts"], {
    cwd: `${import.meta.dir}/../../app`,
    env: {
      ...process.env,
      APP_PORT: String(appPort),
      SERVER_PORT: String(served.port),
      OPENBOT_HOST: "127.0.0.1",
    },
    stdout: "pipe",
    stderr: "ignore",
  });

  beforeAll(async () => {
    // `app/serve.ts` says where it listens once it does.
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let said = "";
    while (!said.includes("OpenBot app on")) {
      const { value, done } = await reader.read();
      if (done) break;
      said += decoder.decode(value);
    }
    reader.releaseLock();
  });
  afterAll(() => {
    child.kill();
    served.stop();
  });

  test("passes the page's own Host on, so a rebound page is refused through it and the app's own page is not", async () => {
    const read = (host: string) =>
      fetch(`http://127.0.0.1:${appPort}/api/approvals`, {
        headers: { host, ...REBOUND_READ },
      });
    expect((await read(`localhost:${appPort}`)).status).toBe(200);
    expect((await read(`127.0.0.1:${appPort}`)).status).toBe(200);
    const refused = await read(`evil.example:${appPort}`);
    expect(refused.status).toBe(421);
    expect(await refused.json()).toEqual({
      error: expect.stringContaining("TRUSTED_ORIGINS"),
    });
  });
});

describe("a name the person configured, served for real", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const config = loadConfig(
    singleUser({ TRUSTED_ORIGINS: "http://nas.local:3010" }),
    {},
  );
  warn.mockRestore();
  const { reached, app } = standIn();
  let port = 0;
  let stop = () => {};

  beforeAll(() => {
    const served = serve(config, app);
    port = served.port;
    stop = served.stop;
  });
  afterAll(() => stop());

  test("is let through, and a name that is not configured is not", async () => {
    expect((await ask(port, "nas.local:3010")).status).toBe(200);
    expect((await ask(port, "NAS.LOCAL.:3010")).status).toBe(200);
    expect((await ask(port, "other.local:3010")).status).toBe(421);
    expect(reached).toHaveLength(2);
  });
});

describe("where the person is not a loopback peer", () => {
  test("a deployment with sign-in answers every Host as it did", async () => {
    const { reached, app } = standIn();
    const served = serve(loadConfig(testEnvironment(), {}), app);
    try {
      expect(
        (await ask(served.port, `evil.example:${served.port}`)).status,
      ).toBe(200);
      expect(reached).toHaveLength(1);
    } finally {
      served.stop();
    }
  });

  test("so does a server somebody opened beyond this machine, which has always admitted whoever reaches it", async () => {
    const { reached, app } = standIn();
    const served = serve(
      loadConfig(singleUser({ OPENBOT_HOST: "127.0.0.1,0.0.0.0" }), {}),
      app,
    );
    try {
      expect(
        (await ask(served.port, `evil.example:${served.port}`)).status,
      ).toBe(200);
      expect(reached).toHaveLength(1);
    } finally {
      served.stop();
    }
  });
});

describe.skipIf(!BRIDGE)("a Bot's container on the Docker bridge", () => {
  const config = loadConfig(singleUser(), bridgeInterfaces(BRIDGE));
  const { app, calls } = assemble(config);
  let port = 0;
  let stop = () => {};

  beforeAll(() => {
    const served = serve(config, app);
    port = served.port;
    stop = served.stop;
  });
  afterAll(() => stop());

  const callBack = (host: string) => {
    const run = mintRunAssertion(
      { botId: "knowledge", actorId: "usr_7", runId: "run_1" },
      config.keyEncryptionKey,
    );
    const body = JSON.stringify({
      name: "mcp__linear__LINEAR_CREATE_ISSUE",
      args: {},
      run,
    });
    return ask(port, host, {
      method: "POST",
      path: "/api/agent-tools/call",
      address: BRIDGE as string,
      headers: {
        ...JSON_HEADERS,
        "x-openbot-agent-token": TOOL_TOKEN,
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
    });
  };

  test("calls back with its usual Host and token, as it did", async () => {
    const before = calls.tools;
    expect((await callBack(`host.docker.internal:${port}`)).status).toBe(200);
    expect((await callBack(`${BRIDGE}:${port}`)).status).toBe(200);
    expect(calls.tools).toBe(before + 2);
  });

  test("is not held to the Host rule, because it was never the person: what it may do is what it can prove", async () => {
    const before = calls.tools;
    expect((await callBack(`evil.example:${port}`)).status).toBe(200);
    expect(calls.tools).toBe(before + 1);
    const read = await ask(port, `evil.example:${port}`, {
      path: "/api/approvals",
      address: BRIDGE as string,
    });
    expect(read.status).toBe(401);
    expect(read.body).toContain("Authentication required");
  });
});
