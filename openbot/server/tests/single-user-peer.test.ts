/**
 * With no sign-in, the person is this machine's loopback, and nothing else.
 *
 * `OPENBOT_SINGLE_USER` admits a request as the one administrator because of where it came from. The
 * server also listens on the Docker bridge (`docker0`, config.ts `listenAddresses`) so the Bots'
 * containers can call back with their tool tokens, and a process inside a Bot's own computer reaches
 * that address too: `GET /api/approvals` from there answered 200 as the person. The rule is in
 * auth/peer.ts: the TCP peer decides, read from the socket, never from a header.
 *
 * Served by the real `startHttpServer` over the real `createApp`. The bridge is stood in for by this
 * machine's own non-loopback address: a listener on it is a real listener on a non-loopback address,
 * and a connection to it comes from that address, which is what a container's connection looks like
 * to the server. A machine with no such address skips those cases, and the ones that hand the app a
 * peer directly still run.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { Hono } from "hono";
import { mintRunAssertion } from "../src/agents/callback-token";
import { createApp } from "../src/app";
import type { ApprovalService } from "../src/approvals/service";
import { isLoopbackPeer, personIsLoopbackOnly } from "../src/auth/peer";
import type { ChannelStore } from "../src/channels/routes";
import { createChannelEventHub } from "../src/channels/events";
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

/** What the routes behind the guard did, so a refusal can be shown to have written nothing. */
type Calls = {
  rules: unknown[];
  decisions: unknown[];
  tools: number;
  copilot: number;
  routines: number;
};

/**
 * The assembled app with a fake behind each door that matters: a person's read and writes
 * (approvals), the runtime, a Bot's tool call, and the worker's hand-off.
 */
function assemble(
  config: DeploymentConfig,
  extra: Record<number, unknown> = {},
) {
  const calls: Calls = {
    rules: [],
    decisions: [],
    tools: 0,
    copilot: 0,
    routines: 0,
  };
  const approvals = {
    inbox: async () => ({ pending: [] }),
    createRule: async (_owner: string, input: unknown) => {
      calls.rules.push(input);
      return { id: "rule-1", ...(input as object) };
    },
    decide: async (_owner: string, id: string, decision: string) => {
      calls.decisions.push({ id, decision });
      return { id, status: "allowed" };
    },
  } as unknown as ApprovalService;
  // Shaped as `createCopilotHonoHandler` builds it: a base path and one catch-all under it.
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
  for (const [index, value] of Object.entries(extra))
    args[Number(index)] = value;
  const app = (
    createApp as (...values: unknown[]) => ReturnType<typeof createApp>
  )(...args);
  return { app, calls };
}

function serve(config: DeploymentConfig, app: ReturnType<typeof createApp>) {
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
    app: { fetch: (request, env) => app.fetch(request, env) },
  });
  return { port, stop: server.stop };
}

type Answer = { status: number; head: string; body: string };
type Request1 = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
};
type Init = Omit<Request1, "path">;

/**
 * One HTTP/1.1 request on a socket of its own, so the headers sent are exactly the ones written and
 * the peer is the address the socket was opened from. An upgrade is answered as soon as its head is.
 */
function send(host: string, port: number, request: Request1): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      host: `${host}:${port}`,
      connection: "close",
      ...request.headers,
    };
    const body = request.body ?? "";
    if (body) headers["content-length"] = String(Buffer.byteLength(body));
    const lines = [
      `${request.method ?? "GET"} ${request.path} HTTP/1.1`,
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    ];
    let data = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const [head = "", ...rest] = data.split("\r\n\r\n");
      resolve({
        status: Number(/^HTTP\/1\.1 (\d{3})/.exec(head)?.[1] ?? 0),
        head,
        body: rest.join("\r\n\r\n"),
      });
    };
    const socket = connect({ host, port }, () =>
      socket.write(`${lines.join("\r\n")}\r\n\r\n${body}`),
    );
    socket.setEncoding("utf8");
    socket.setTimeout(8000, () => {
      settled = true;
      socket.destroy();
      reject(new Error(`${request.path} on ${host} timed out`));
    });
    socket.on("data", (chunk: string) => {
      data += chunk;
      // A refused upgrade is answered but not closed, so a response whose length is known is
      // complete when that much has arrived, and a 101 is complete with its head.
      const split = data.indexOf("\r\n\r\n");
      if (split === -1) return;
      const head = data.slice(0, split);
      const length = /^content-length:\s*(\d+)/im.exec(head)?.[1];
      if (
        head.startsWith("HTTP/1.1 101") ||
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

const JSON_HEADERS = { "content-type": "application/json" };
const RULE = JSON.stringify({ toolRef: "*", behaviour: "allow" });
const DECISION = JSON.stringify({ decision: "allow_always" });
const UPGRADE = {
  upgrade: "websocket",
  connection: "Upgrade",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
};

describe("which peers are loopback", () => {
  test("127.0.0.0/8, ::1 and an IPv4-mapped loopback, in every spelling a socket reports", () => {
    for (const address of [
      "127.0.0.1",
      "127.1.2.3",
      "127.255.255.254",
      "::1",
      "0:0:0:0:0:0:0:1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
    ])
      expect(isLoopbackPeer(address)).toBe(true);
  });

  test("nothing else is: bridges, LAN, mapped non-loopback, names, junk and nothing", () => {
    for (const address of [
      "172.17.0.1",
      "198.19.255.1",
      "10.0.0.5",
      "192.168.1.10",
      "0.0.0.0",
      "::",
      "::2",
      "::ffff:172.17.0.1",
      "fe80::1",
      "128.0.0.1",
      "126.255.255.255",
      "localhost",
      "127.0.0.1.evil.example",
      "127.0.0.1 ",
      "",
      "not an address",
    ])
      expect(isLoopbackPeer(address)).toBe(false);
    expect(isLoopbackPeer(null)).toBe(false);
    expect(isLoopbackPeer(undefined)).toBe(false);
  });
});

describe("when only loopback is the person", () => {
  test("a default install, and one told to listen on this machine alone", () => {
    const interfaces = bridgeInterfaces("172.17.0.1");
    expect(personIsLoopbackOnly(loadConfig(singleUser(), interfaces))).toBe(
      true,
    );
    expect(
      personIsLoopbackOnly(
        loadConfig(singleUser({ OPENBOT_HOST: "127.0.0.1,::1" }), interfaces),
      ),
    ).toBe(true);
  });

  test("not a server somebody opened beyond this machine, and never a sign-in deployment", () => {
    expect(
      personIsLoopbackOnly(
        loadConfig(singleUser({ OPENBOT_HOST: "0.0.0.0" }), {}),
      ),
    ).toBe(false);
    expect(
      personIsLoopbackOnly(
        loadConfig(singleUser({ OPENBOT_HOST: "192.168.1.10" }), {}),
      ),
    ).toBe(false);
    expect(personIsLoopbackOnly(loadConfig(testEnvironment(), {}))).toBe(false);
  });
});

describe("the guard, handed a peer", () => {
  const config = loadConfig(singleUser(), bridgeInterfaces("172.17.0.1"));
  const ask = (env: unknown) => {
    const { app, calls } = assemble(config);
    return {
      calls,
      status: async () =>
        (await app.request("http://localhost:3001/api/approvals", {}, env))
          .status,
    };
  };
  const peer = (address: string) => ({
    server: { requestIP: () => ({ address }) },
  });

  test("loopback is the person", async () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect(await ask(peer(address)).status()).toBe(200);
  });

  test("any other peer is not", async () => {
    for (const address of ["172.17.0.1", "198.19.255.1", "192.168.1.10", "::2"])
      expect(await ask(peer(address)).status()).toBe(401);
  });

  test("no peer, no person: a server that cannot say, or says nothing, admits nobody", async () => {
    expect(await ask(undefined).status()).toBe(401);
    expect(await ask({}).status()).toBe(401);
    expect(await ask({ server: {} }).status()).toBe(401);
    expect(await ask({ server: { requestIP: () => null } }).status()).toBe(401);
    expect(
      await ask({
        server: {
          requestIP: () => {
            throw new Error("socket closed");
          },
        },
      }).status(),
    ).toBe(401);
  });
});

describe.skipIf(!BRIDGE)("a request from the Docker bridge", () => {
  const config = loadConfig(singleUser(), bridgeInterfaces(BRIDGE));
  const { app, calls } = assemble(config);
  let stop = () => {};
  let port = 0;

  beforeAll(() => {
    const served = serve(config, app);
    port = served.port;
    stop = served.stop;
  });
  afterAll(() => stop());

  const fromBridge = (path: string, init: Init = {}) =>
    send(BRIDGE as string, port, { path, ...init });
  const fromLoopback = (path: string, init: Init = {}) =>
    send("127.0.0.1", port, { path, ...init });

  test("the server listens on the bridge address, as it does in production", () => {
    expect(config.listen.some((entry) => entry.host === BRIDGE)).toBe(true);
    expect(personIsLoopbackOnly(config)).toBe(true);
  });

  test("the person on this machine still reads and writes, with no Origin, as curl and the CLI do", async () => {
    expect((await fromLoopback("/api/approvals")).status).toBe(200);
    expect(
      (
        await fromLoopback("/api/approvals/rules", {
          method: "POST",
          headers: JSON_HEADERS,
          body: RULE,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fromLoopback("/api/approvals/req-1/decision", {
          method: "POST",
          headers: JSON_HEADERS,
          body: DECISION,
        })
      ).status,
    ).toBe(200);
    expect(calls.rules).toHaveLength(1);
    expect(calls.decisions).toHaveLength(1);
  });

  test("is refused a person's read", async () => {
    const answer = await fromBridge("/api/approvals");
    expect(answer.status).toBe(401);
    expect(answer.body).toContain("Authentication required");
  });

  test("writes nothing through a person's write: no rule, no decision", async () => {
    const rules = calls.rules.length;
    const decisions = calls.decisions.length;
    for (const [path, body] of [
      ["/api/approvals/rules", RULE],
      ["/api/approvals/req-1/decision", DECISION],
    ] as const)
      expect(
        (
          await fromBridge(path, {
            method: "POST",
            headers: JSON_HEADERS,
            body,
          })
        ).status,
      ).toBe(401);
    expect(calls.rules).toHaveLength(rules);
    expect(calls.decisions).toHaveLength(decisions);
  });

  test("is refused the runtime on every spelling of its path, before the runtime sees it", async () => {
    const reached = calls.copilot;
    for (const path of [
      "/api/copilotkit",
      "/api/copilotkit/",
      "/api/copilotkit/info",
      "/api/copilotkit/threads",
      "/%61pi/copilotkit/info",
    ])
      expect((await fromBridge(path)).status).toBe(401);
    expect(
      (
        await fromBridge("/api/copilotkit/agent/iris/run", {
          method: "POST",
          headers: JSON_HEADERS,
          body: "{}",
        })
      ).status,
    ).toBe(401);
    expect(calls.copilot).toBe(reached);
    for (const path of ["/api/copilotkit", "/api/copilotkit/info"])
      expect((await fromLoopback(path)).status).toBe(200);
    expect(calls.copilot).toBe(reached + 2);
  });

  test("is not the person however it dresses: forwarded addresses, Host and Origin change nothing", async () => {
    const dressed = {
      "x-forwarded-for": "127.0.0.1",
      "x-real-ip": "127.0.0.1",
      forwarded: "for=127.0.0.1;host=localhost",
      host: `localhost:${port}`,
      origin: "http://localhost:3010",
      "sec-fetch-site": "same-origin",
    };
    const rules = calls.rules.length;
    const reached = calls.copilot;
    expect(
      (await fromBridge("/api/approvals", { headers: dressed })).status,
    ).toBe(401);
    expect(
      (await fromBridge("/api/copilotkit/info", { headers: dressed })).status,
    ).toBe(401);
    expect(
      (
        await fromBridge("/api/approvals/rules", {
          method: "POST",
          headers: { ...JSON_HEADERS, ...dressed },
          body: RULE,
        })
      ).status,
    ).toBe(401);
    expect(calls.rules).toHaveLength(rules);
    expect(calls.copilot).toBe(reached);
  });

  test("is refused the channel socket, and the live screen's, but the person's socket opens", async () => {
    expect(
      (await fromBridge("/api/channels/events", { headers: UPGRADE })).status,
    ).toBe(401);
    expect(
      (
        await fromBridge("/api/channels/events", {
          headers: {
            ...UPGRADE,
            "x-forwarded-for": "127.0.0.1",
            host: `localhost:${port}`,
          },
        })
      ).status,
    ).toBe(401);
    expect(
      (await fromBridge("/api/computers/bot-1/stream", { headers: UPGRADE }))
        .status,
    ).toBe(401);
    expect(
      (await fromLoopback("/api/channels/events", { headers: UPGRADE })).status,
    ).toBe(101);
    // No computer is configured here, which is what the person is told after the peer is let through.
    expect(
      (await fromLoopback("/api/computers/bot-1/stream", { headers: UPGRADE }))
        .status,
    ).toBe(503);
  });

  test("still reaches what does not ask who it is: health, and the worker with its secret", async () => {
    expect((await fromBridge("/health")).status).toBe(200);
    const hand = (secret: string) =>
      fromBridge("/internal/routines/run", {
        method: "POST",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${secret}` },
        body: JSON.stringify({ routineRunId: "run-1" }),
      });
    expect((await hand(WORKER_SECRET)).status).toBe(202);
    expect(calls.routines).toBe(1);
    expect((await hand("a different secret")).status).toBe(401);
    expect(calls.routines).toBe(1);
  });

  test("still calls back as a Bot, with its token and its run; and is refused as before without them", async () => {
    const run = mintRunAssertion(
      { botId: "knowledge", actorId: "usr_7", runId: "run_1" },
      config.keyEncryptionKey,
    );
    const call = (token: string | undefined, assertion: string = run) =>
      fromBridge("/api/agent-tools/call", {
        method: "POST",
        headers: {
          ...JSON_HEADERS,
          ...(token === undefined ? {} : { "x-openbot-agent-token": token }),
        },
        body: JSON.stringify({
          name: "mcp__linear__LINEAR_CREATE_ISSUE",
          args: {},
          run: assertion,
        }),
      });

    const accepted = await call(TOOL_TOKEN);
    expect(accepted.status).toBe(200);
    expect(JSON.parse(accepted.body)).toEqual({
      text: "tool ran",
      isError: false,
    });
    expect(calls.tools).toBe(1);

    expect((await call("not the token")).status).toBe(401);
    expect((await call(undefined)).status).toBe(401);
    expect((await call(TOOL_TOKEN, "not a signed run")).status).toBe(401);
    expect(calls.tools).toBe(1);
  });
});

describe.skipIf(!BRIDGE)("a server somebody opened beyond this machine", () => {
  test("keeps what OPENBOT_HOST has always meant: whoever reaches it is the administrator", async () => {
    // Named explicitly, as a LAN or tailnet address is, and as the container image names every
    // interface. Documented, and said at every boot, so the peer rule leaves it alone.
    const config = loadConfig(
      singleUser({ OPENBOT_HOST: BRIDGE as string }),
      {},
    );
    expect(personIsLoopbackOnly(config)).toBe(false);
    const { app } = assemble(config);
    const served = serve(config, app);
    try {
      expect(
        (await send(BRIDGE as string, served.port, { path: "/api/approvals" }))
          .status,
      ).toBe(200);
      expect(
        (
          await send(BRIDGE as string, served.port, {
            path: "/api/copilotkit/info",
          })
        ).status,
      ).toBe(200);
    } finally {
      served.stop();
    }
  });
});

describe.skipIf(!BRIDGE)("a deployment with sign-in", () => {
  test("asks for a session from every peer alike, as it did before", async () => {
    const config = loadConfig(testEnvironment(), {});
    expect(config.singleUser).toBe(false);
    const auth = {
      handler: async () => new Response("auth"),
      api: {
        getSession: async ({ headers }: { headers: Headers }) =>
          headers.get("x-test-session")
            ? {
                user: {
                  id: "u1",
                  email: "u1@openbot.test",
                  role: "user" as const,
                },
              }
            : null,
      },
    };
    const roles = { rolesForUser: async () => ["user" as const] };
    const { app } = assemble(config, { 1: auth, 2: roles });
    const served = serve(config, app);
    try {
      for (const host of ["127.0.0.1", BRIDGE as string]) {
        expect(
          (await send(host, served.port, { path: "/api/approvals" })).status,
        ).toBe(401);
        expect(
          (
            await send(host, served.port, {
              path: "/api/approvals",
              headers: { "x-test-session": "yes" },
            })
          ).status,
        ).toBe(200);
      }
    } finally {
      served.stop();
    }
  });
});
