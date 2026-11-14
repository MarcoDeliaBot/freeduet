/**
 * With no sign-in, the person is a loopback peer that also holds this installation's secret.
 *
 * `single-user-peer.test.ts` shows that a container on the Docker bridge is not the person. On Docker
 * Desktop (Windows, macOS) a container that calls the host's published port is carried through the
 * VM's own proxy, and the server sees 127.0.0.1: a request from a Bot's computer is a loopback
 * request, and the peer rule alone calls it the administrator. The rule here (auth/install-secret.ts,
 * D28) is that where the installation has a secret (`FREEDUET_INSTALL_SECRET`, written by
 * `scripts/start.sh`), a loopback request is the person only when it also carries it, as the cookie a
 * pairing link sets.
 *
 * So the case under test is a request from 127.0.0.1 WITHOUT the cookie: it is what a container on
 * Docker Desktop looks like. The real `startHttpServer` over the real `createApp`, like the peer
 * test; the Docker bridge is stood in for by this machine's own non-loopback address.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { mintRunAssertion } from "../src/agents/callback-token";
import { createApp } from "../src/app";
import type { ApprovalService } from "../src/approvals/service";
import {
  createInstallPairingRoutes,
  installCookieName,
  installSecretSetting,
  PAIRING_REQUIRED,
  personRule,
  personVerdict,
} from "../src/auth/install-secret";
import { createChannelEventHub } from "../src/channels/events";
import type { ChannelStore } from "../src/channels/routes";
import { type DeploymentConfig, loadConfig } from "../src/config";
import { startHttpServer } from "../src/http-server";
import type { RoutineRunner } from "../src/routines/runner";
import { testEnvironment } from "./support/environment";

const TOOL_TOKEN = "deployment-wide-agent-token";
const WORKER_SECRET = "worker-shared-secret-for-this-test";
/** What `openssl rand -hex 32` makes: 64 characters. Recognisable, so a leak is found by searching. */
const SECRET = "d3adb33f".repeat(8);

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

/** A peer, as `server.requestIP` reports it, for a request handed straight to the app. */
const peer = (address: string) => ({
  server: { requestIP: () => ({ address }) },
});

/** The installation's configuration, on a machine with Docker's bridge at this address. */
function withSecret(
  overrides: Record<string, string> = {},
  bridge: string | undefined = "172.17.0.1",
) {
  return loadConfig(
    singleUser({ FREEDUET_INSTALL_SECRET: SECRET, ...overrides }),
    bridgeInterfaces(bridge),
  );
}

const cookieOf = (config: Pick<DeploymentConfig, "port">, value = SECRET) =>
  `${installCookieName(config.port)}=${value}`;

describe("the secret in the configuration", () => {
  test("is read in single-user mode, and a line that is not set is no secret", () => {
    expect(withSecret().installSecret).toBe(SECRET);
    expect(loadConfig(singleUser(), {}).installSecret).toBeUndefined();
    expect(
      loadConfig(singleUser({ FREEDUET_INSTALL_SECRET: "" }), {}).installSecret,
    ).toBeUndefined();
    expect(
      loadConfig(singleUser({ FREEDUET_INSTALL_SECRET: "   " }), {})
        .installSecret,
    ).toBeUndefined();
  });

  test("stops the boot on a value that cannot be a secret, rather than switching the protection off", () => {
    for (const value of [
      "short",
      "x".repeat(31),
      "x".repeat(257),
      `${"x".repeat(40)} ${"y".repeat(10)}`,
      `${"x".repeat(40)};Path=/`,
      `${"x".repeat(40)}=`,
      "é".repeat(40),
    ])
      expect(() =>
        loadConfig(singleUser({ FREEDUET_INSTALL_SECRET: value }), {}),
      ).toThrow(/FREEDUET_INSTALL_SECRET must be 32 to 256/);
    // The message names the variable and the fix, never what was in it.
    try {
      loadConfig(singleUser({ FREEDUET_INSTALL_SECRET: "short-value" }), {});
    } catch (error) {
      expect(String(error)).not.toContain("short-value");
    }
  });

  test("is not asked of a deployment with sign-in, which never has a use for it", () => {
    const config = loadConfig(
      { ...testEnvironment(), FREEDUET_INSTALL_SECRET: SECRET },
      {},
    );
    expect(config.singleUser).toBe(false);
    expect(config.installSecret).toBeUndefined();
    // And a value that would stop a single-user boot is nothing to a deployment that has sign-in.
    expect(
      loadConfig({ ...testEnvironment(), FREEDUET_INSTALL_SECRET: "short" }, {})
        .installSecret,
    ).toBeUndefined();
  });

  test("installSecretSetting answers what the configuration spreads", () => {
    expect(installSecretSetting({}, true)).toEqual({});
    expect(
      installSecretSetting({ FREEDUET_INSTALL_SECRET: SECRET }, true),
    ).toEqual({ installSecret: SECRET });
    expect(
      installSecretSetting({ FREEDUET_INSTALL_SECRET: SECRET }, false),
    ).toEqual({});
  });
});

describe("who the person is", () => {
  const config = withSecret();
  const rule = personRule(config);
  const ask = (address: string, cookie?: string) =>
    personVerdict(
      rule,
      peer(address),
      new Request("http://localhost:3001/api/approvals", {
        headers: cookie === undefined ? {} : { cookie },
      }),
    );

  test("a loopback peer with the secret", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect(ask(address, cookieOf(config))).toBe("person");
  });

  test("the secret among other cookies, in any place", () => {
    const own = cookieOf(config);
    expect(ask("127.0.0.1", `a=1; ${own}; b=2`)).toBe("person");
    expect(ask("127.0.0.1", `${own};b=2`)).toBe("person");
    expect(ask("127.0.0.1", `better-auth.session=x;${own}`)).toBe("person");
    // Two of the name, as a stale one beside a good one: any good one is enough.
    expect(ask("127.0.0.1", `${cookieOf(config, "stale")}; ${own}`)).toBe(
      "person",
    );
  });

  test("a loopback peer without it is not, and is told to pair rather than to sign in", () => {
    expect(ask("127.0.0.1")).toBe("unpaired");
    expect(ask("127.0.0.1", "")).toBe("unpaired");
    expect(ask("127.0.0.1", "a=1; b=2")).toBe("unpaired");
  });

  test("not a value that is nearly it", () => {
    for (const value of [
      SECRET.slice(0, -1),
      `${SECRET}x`,
      SECRET.toUpperCase(),
      SECRET.slice(1),
      "",
      " ",
      `"${SECRET}"`,
    ])
      expect(ask("127.0.0.1", cookieOf(config, value))).toBe("unpaired");
  });

  test("not the secret under another name: another installation's, or no name", () => {
    expect(
      ask("127.0.0.1", `${installCookieName(config.port + 1)}=${SECRET}`),
    ).toBe("unpaired");
    expect(ask("127.0.0.1", `freeduet_install=${SECRET}`)).toBe("unpaired");
    expect(
      ask("127.0.0.1", `x${installCookieName(config.port)}=${SECRET}`),
    ).toBe("unpaired");
    expect(ask("127.0.0.1", SECRET)).toBe("unpaired");
  });

  test("the cookie does not make any other peer the person", () => {
    for (const address of ["172.17.0.1", "192.168.1.10", "10.0.0.5", "::2"])
      expect(ask(address, cookieOf(config))).toBe("elsewhere");
  });

  test("with no peer, nobody is, cookie or not", () => {
    const request = new Request("http://localhost:3001/api/approvals", {
      headers: { cookie: cookieOf(config) },
    });
    for (const env of [undefined, {}, { server: {} }])
      expect(personVerdict(rule, env, request)).toBe("elsewhere");
  });

  test("the cookie is named for the port, so two installations on one machine keep one each", () => {
    const first = personRule(withSecret({ SERVER_PORT: "3001" }));
    const second = personRule(withSecret({ SERVER_PORT: "3101" }));
    expect(first.install?.cookie).toBe("freeduet_install_3001");
    expect(second.install?.cookie).toBe("freeduet_install_3101");
  });
});

describe("where the rule does not apply", () => {
  test("a server somebody opened beyond this machine: whoever reaches it, as OPENBOT_HOST has always said", () => {
    const config = withSecret({ OPENBOT_HOST: "0.0.0.0" });
    expect(config.installSecret).toBe(SECRET);
    const rule = personRule(config);
    expect(rule).toEqual({ loopbackOnly: false });
    expect(
      personVerdict(
        rule,
        peer("192.168.1.10"),
        new Request("http://localhost:3001/api/approvals"),
      ),
    ).toBe("person");
  });

  test("an installation that has no secret yet keeps the peer rule alone", () => {
    const config = loadConfig(singleUser(), bridgeInterfaces("172.17.0.1"));
    const rule = personRule(config);
    expect(rule).toEqual({ loopbackOnly: true });
    const request = new Request("http://localhost:3001/api/approvals");
    expect(personVerdict(rule, peer("127.0.0.1"), request)).toBe("person");
    expect(personVerdict(rule, peer("172.17.0.1"), request)).toBe("elsewhere");
  });

  test("a deployment with sign-in has no rule of its own", () => {
    const config = loadConfig(
      { ...testEnvironment(), FREEDUET_INSTALL_SECRET: SECRET },
      {},
    );
    expect(personRule(config)).toEqual({ loopbackOnly: false });
  });
});

describe("the guard, handed a peer", () => {
  const config = withSecret();
  const ask = (env: unknown, cookie?: string) => {
    const { app } = assemble(config);
    return app.request(
      "http://localhost:3001/api/approvals",
      { headers: cookie === undefined ? {} : { cookie } },
      env,
    );
  };

  test("loopback with the secret is the person", async () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect((await ask(peer(address), cookieOf(config))).status).toBe(200);
  });

  test("loopback without it is refused with a code the app reads, and no secret in the answer", async () => {
    const answer = await ask(peer("127.0.0.1"));
    expect(answer.status).toBe(401);
    const body = await answer.text();
    expect(JSON.parse(body)).toEqual({
      error: expect.stringContaining("scripts/open.sh"),
      code: PAIRING_REQUIRED,
    });
    expect(body).not.toContain(SECRET);
    expect(
      (await ask(peer("127.0.0.1"), cookieOf(config, "wrong"))).status,
    ).toBe(401);
  });

  test("any other peer is refused as before, with the secret or without it", async () => {
    for (const address of ["172.17.0.1", "198.19.255.1", "192.168.1.10"]) {
      for (const cookie of [undefined, cookieOf(config)]) {
        const answer = await ask(peer(address), cookie);
        expect(answer.status).toBe(401);
        const body = (await answer.json()) as { error: string; code?: string };
        expect(body.error).toContain("Authentication required");
        // No hint that pairing would help: this peer cannot be the person.
        expect(body.code).toBeUndefined();
      }
    }
  });

  test("no peer, no person", async () => {
    expect((await ask(undefined, cookieOf(config))).status).toBe(401);
    expect((await ask({}, cookieOf(config))).status).toBe(401);
  });
});

describe.skipIf(!BRIDGE)(
  "a request that arrives as loopback, as a container's does on Docker Desktop",
  () => {
    const config = withSecret({}, BRIDGE);
    const { app, calls } = assemble(config);
    let stop = () => {};
    let port = 0;

    beforeAll(() => {
      const served = serve(config, app);
      port = served.port;
      stop = served.stop;
    });
    afterAll(() => stop());

    const own = { cookie: cookieOf(config) };
    // 127.0.0.1 is the peer in both. What differs is only that one of them holds the secret.
    const container = (path: string, init: Init = {}) =>
      send("127.0.0.1", port, { path, ...init });
    const person = (path: string, init: Init = {}) =>
      send("127.0.0.1", port, {
        path,
        ...init,
        headers: { ...own, ...init.headers },
      });
    const fromBridge = (path: string, init: Init = {}) =>
      send(BRIDGE as string, port, {
        path,
        ...init,
        headers: { ...own, ...init.headers },
      });

    test("the configuration is the production one: loopback, and the bridge for the Bots' callbacks", () => {
      expect(config.singleUser).toBe(true);
      expect(config.installSecret).toBe(SECRET);
      expect(config.listen.some((entry) => entry.host === BRIDGE)).toBe(true);
    });

    test("the person, paired, reads and writes with no Origin, as curl and the scripts do", async () => {
      expect((await person("/api/approvals")).status).toBe(200);
      expect(
        (
          await person("/api/approvals/rules", {
            method: "POST",
            headers: JSON_HEADERS,
            body: RULE,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await person("/api/approvals/req-1/decision", {
            method: "POST",
            headers: JSON_HEADERS,
            body: DECISION,
          })
        ).status,
      ).toBe(200);
      expect(calls.rules).toHaveLength(1);
      expect(calls.decisions).toHaveLength(1);
    });

    test("is refused a person's read, and told to pair", async () => {
      const answer = await container("/api/approvals");
      expect(answer.status).toBe(401);
      expect(answer.body).toContain(PAIRING_REQUIRED);
      expect(answer.body).not.toContain(SECRET);
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
            await container(path, {
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
        expect((await container(path)).status).toBe(401);
      expect(
        (
          await container("/api/copilotkit/agent/iris/run", {
            method: "POST",
            headers: JSON_HEADERS,
            body: "{}",
          })
        ).status,
      ).toBe(401);
      expect(calls.copilot).toBe(reached);
      for (const path of ["/api/copilotkit", "/api/copilotkit/info"])
        expect((await person(path)).status).toBe(200);
      expect(calls.copilot).toBe(reached + 2);
    });

    test("is not the person however it dresses: forwarded addresses, Host, Origin, and a cookie that is not it", async () => {
      const dressed = {
        "x-forwarded-for": "127.0.0.1",
        "x-real-ip": "127.0.0.1",
        forwarded: "for=127.0.0.1;host=localhost",
        host: `localhost:${port}`,
        origin: "http://localhost:3010",
        "sec-fetch-site": "same-origin",
        // Another installation's secret, the right one under the wrong name, the wrong one under the
        // right name: three ways to be close.
        cookie: [
          `${installCookieName(config.port + 1)}=${SECRET}`,
          `freeduet_install=${SECRET}`,
          cookieOf(config, "d3adb33f".repeat(7)),
        ].join("; "),
      };
      const rules = calls.rules.length;
      const reached = calls.copilot;
      expect(
        (await container("/api/approvals", { headers: dressed })).status,
      ).toBe(401);
      expect(
        (await container("/api/copilotkit/info", { headers: dressed })).status,
      ).toBe(401);
      expect(
        (
          await container("/api/approvals/rules", {
            method: "POST",
            headers: { ...JSON_HEADERS, ...dressed },
            body: RULE,
          })
        ).status,
      ).toBe(401);
      expect(calls.rules).toHaveLength(rules);
      expect(calls.copilot).toBe(reached);
    });

    test("is refused the channel socket and the live screen's, and the paired person's opens", async () => {
      expect(
        (await container("/api/channels/events", { headers: UPGRADE })).status,
      ).toBe(401);
      expect(
        (await container("/api/computers/bot-1/stream", { headers: UPGRADE }))
          .status,
      ).toBe(401);
      // The cookie of the wrong value is no better than none.
      expect(
        (
          await container("/api/computers/bot-1/stream", {
            headers: { ...UPGRADE, cookie: cookieOf(config, "wrong") },
          })
        ).status,
      ).toBe(401);
      expect(
        (await person("/api/channels/events", { headers: UPGRADE })).status,
      ).toBe(101);
      // No computer is configured here, which is what the person is told once the secret is let through.
      expect(
        (await person("/api/computers/bot-1/stream", { headers: UPGRADE }))
          .status,
      ).toBe(503);
    });

    test("a request from the bridge is refused whatever it carries, the secret too", async () => {
      expect((await fromBridge("/api/approvals")).status).toBe(401);
      expect((await fromBridge("/api/copilotkit/info")).status).toBe(401);
      expect(
        (await fromBridge("/api/channels/events", { headers: UPGRADE })).status,
      ).toBe(401);
      expect(
        (await fromBridge("/api/computers/bot-1/stream", { headers: UPGRADE }))
          .status,
      ).toBe(401);
    });

    test("still reaches what does not ask who it is: health, and the worker with its secret", async () => {
      expect((await container("/health")).status).toBe(200);
      const hand = (secret: string) =>
        container("/internal/routines/run", {
          method: "POST",
          headers: { ...JSON_HEADERS, authorization: `Bearer ${secret}` },
          body: JSON.stringify({ routineRunId: "run-1" }),
        });
      expect((await hand(WORKER_SECRET)).status).toBe(202);
      expect(calls.routines).toBe(1);
      expect((await hand("a different secret")).status).toBe(401);
      expect(calls.routines).toBe(1);
    });

    test("still calls back as a Bot, with its token and its run, from the bridge and from loopback", async () => {
      const run = mintRunAssertion(
        { botId: "knowledge", actorId: "usr_7", runId: "run_1" },
        config.keyEncryptionKey,
      );
      const call = (reach: typeof container, token: string | undefined) =>
        reach("/api/agent-tools/call", {
          method: "POST",
          headers: {
            ...JSON_HEADERS,
            ...(token === undefined ? {} : { "x-openbot-agent-token": token }),
          },
          body: JSON.stringify({
            name: "mcp__linear__LINEAR_CREATE_ISSUE",
            args: {},
            run,
          }),
        });
      const bridgeNoCookie = (path: string, init: Init = {}) =>
        send(BRIDGE as string, port, { path, ...init });

      expect((await call(container, TOOL_TOKEN)).status).toBe(200);
      expect((await call(bridgeNoCookie, TOOL_TOKEN)).status).toBe(200);
      expect(calls.tools).toBe(2);
      expect((await call(container, "not the token")).status).toBe(401);
      expect((await call(container, undefined)).status).toBe(401);
      expect(calls.tools).toBe(2);
    });
  },
);

describe.skipIf(!BRIDGE)("pairing, on the real server", () => {
  const config = withSecret({}, BRIDGE);
  const { app, calls } = assemble(config);
  let stop = () => {};
  let port = 0;
  const logged: string[] = [];
  const quiet: Array<{ mockRestore: () => void }> = [];

  beforeAll(() => {
    // What the server writes while this runs is kept, so it can be read for the secret.
    for (const method of ["info", "warn", "error"] as const)
      quiet.push(
        spyOn(console, method).mockImplementation((...parts: unknown[]) => {
          logged.push(parts.map(String).join(" "));
        }),
      );
    const served = serve(config, app);
    port = served.port;
    stop = served.stop;
  });
  afterAll(() => {
    stop();
    for (const spy of quiet) spy.mockRestore();
  });

  const loopback = (path: string, init: Init = {}) =>
    send("127.0.0.1", port, { path, ...init });
  const mint = (
    authorization: string | undefined,
    reach: (path: string, init: Init) => Promise<Answer> = loopback,
  ) =>
    reach("/internal/pairing", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });
  const link = async () => {
    const answer = await mint(`Bearer ${SECRET}`);
    expect(answer.status).toBe(200);
    return (JSON.parse(answer.body) as { path: string }).path;
  };
  const setCookie = (answer: Answer) =>
    /^set-cookie:\s*(.*)$/im.exec(answer.head)?.[1];

  test("the launcher gets a link with the secret, and only with it", async () => {
    const answer = await mint(`Bearer ${SECRET}`);
    expect(answer.status).toBe(200);
    expect(answer.head.toLowerCase()).toContain("cache-control: no-store");
    const body = JSON.parse(answer.body) as {
      path: string;
      expiresInSeconds: number;
    };
    expect(body.path).toMatch(/^\/api\/pair\?token=[A-Za-z0-9_-]{43}$/);
    expect(body.expiresInSeconds).toBe(120);
    // The secret is not the link, and is not in the answer.
    expect(answer.head + answer.body).not.toContain(SECRET);
    expect(body.path).not.toContain(SECRET);
  });

  test("a container, which lacks the secret, gets nothing, and the same nothing whatever it got wrong", async () => {
    const refusals = await Promise.all([
      mint(undefined),
      mint("Bearer "),
      mint("Bearer wrong"),
      mint(`Bearer ${SECRET.slice(0, -1)}`),
      mint(`Bearer ${SECRET}x`),
      mint(`Basic ${SECRET}`),
      mint(SECRET),
      // The right secret from a peer that is not this machine's loopback.
      mint(`Bearer ${SECRET}`, (path, init) =>
        send(BRIDGE as string, port, { path, ...init }),
      ),
    ]);
    for (const answer of refusals) {
      expect(answer.status).toBe(401);
      expect(answer.body).toBe(refusals[0]?.body as string);
      expect(setCookie(answer)).toBeUndefined();
    }
  });

  test("a link is exchanged for the cookie, once", async () => {
    const path = await link();
    const first = await loopback(path);
    expect(first.status).toBe(303);
    expect(/^location:\s*\/\s*$/im.test(first.head)).toBe(true);
    const cookie = setCookie(first) as string;
    // Every attribute the design asks for, and none it forbids.
    expect(cookie.split(";")[0]).toBe(cookieOf(config));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api");
    expect(cookie).toMatch(/Max-Age=\d{6,}/);
    expect(cookie).not.toContain("Domain");
    expect(cookie).not.toContain("Secure");
    expect(first.head.toLowerCase()).toContain("referrer-policy: no-referrer");
    expect(first.head.toLowerCase()).toContain("cache-control: no-store");

    // And the browser that has it is the person; the one that does not, is not.
    const jar = cookie.split(";")[0] as string;
    expect(
      (await loopback("/api/approvals", { headers: { cookie: jar } })).status,
    ).toBe(200);
    expect((await loopback("/api/approvals")).status).toBe(401);

    const again = await loopback(path);
    expect(again.status).toBe(401);
    expect(setCookie(again)).toBeUndefined();
    expect(again.body).toContain("scripts/open.sh");
  });

  test("a link that was never minted gets nothing", async () => {
    for (const path of [
      "/api/pair",
      "/api/pair?token=",
      "/api/pair?token=wrong",
      `/api/pair?token=${"A".repeat(43)}`,
      `/api/pair?token=${SECRET}`,
    ]) {
      const answer = await loopback(path);
      expect(answer.status).toBe(401);
      expect(setCookie(answer)).toBeUndefined();
    }
  });

  test("a link opened from another peer gets nothing, and is not used up by it", async () => {
    const path = await link();
    const other = await send(BRIDGE as string, port, { path });
    expect(other.status).toBe(401);
    expect(setCookie(other)).toBeUndefined();
    expect((await loopback(path)).status).toBe(303);
  });

  test("paired, the person is the person on every route #116 guards", async () => {
    const answer = await loopback(await link());
    const jar = (setCookie(answer) as string).split(";")[0] as string;
    const paired = (path: string, init: Init = {}) =>
      loopback(path, { ...init, headers: { cookie: jar, ...init.headers } });
    expect((await paired("/api/approvals")).status).toBe(200);
    expect(
      (
        await paired("/api/approvals/rules", {
          method: "POST",
          headers: JSON_HEADERS,
          body: RULE,
        })
      ).status,
    ).toBe(201);
    expect((await paired("/api/copilotkit/info")).status).toBe(200);
    expect(
      (await paired("/api/channels/events", { headers: UPGRADE })).status,
    ).toBe(101);
    expect(
      (await paired("/api/computers/bot-1/stream", { headers: UPGRADE }))
        .status,
    ).toBe(503);
    expect(calls.rules.length).toBeGreaterThan(0);
  });

  test("says that it paired, and never says with what", async () => {
    await loopback(await link());
    await mint("Bearer wrong");
    await loopback("/api/pair?token=wrong");
    const lines = logged.filter((line) => line.includes("install-pairing"));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const outcome of ["minted", "paired", "refused"])
      expect(
        lines.some((line) => line.includes(`"outcome":"${outcome}"`)),
      ).toBe(true);
    // Nothing the server wrote anywhere in these tests holds the secret or a link.
    for (const line of logged) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toMatch(/token=/);
    }
  });
});

describe("pairing links, on a clock", () => {
  const gate = { secret: SECRET, cookie: installCookieName(3001) };
  const loopbackEnv = peer("127.0.0.1");
  const quietly = <T>(run: () => Promise<T>) => {
    const spy = spyOn(console, "info").mockImplementation(() => {});
    return run().finally(() => spy.mockRestore());
  };

  function pairing() {
    let current = 1_000_000;
    const routes = createInstallPairingRoutes(gate, { now: () => current });
    const mint = async () => {
      const answer = await routes.request(
        "http://localhost:3001/internal/pairing",
        { method: "POST", headers: { authorization: `Bearer ${SECRET}` } },
        loopbackEnv,
      );
      return ((await answer.json()) as { path: string }).path;
    };
    const redeem = (path: string) =>
      routes.request(`http://localhost:3001${path}`, {}, loopbackEnv);
    return {
      mint,
      redeem,
      advance: (ms: number) => {
        current += ms;
      },
    };
  }

  test("good for two minutes, and not a moment longer", () =>
    quietly(async () => {
      const { mint, redeem, advance } = pairing();
      const inTime = await mint();
      const late = await mint();
      advance(119_999);
      expect((await redeem(inTime)).status).toBe(303);
      advance(1);
      expect((await redeem(late)).status).toBe(401);
    }));

  test("good once, however fast the second comes", () =>
    quietly(async () => {
      const { mint, redeem } = pairing();
      const path = await mint();
      const answers = await Promise.all([redeem(path), redeem(path)]);
      expect(answers.map((answer) => answer.status).sort()).toEqual([303, 401]);
    }));

  test("each link is its own: using one does not use another", () =>
    quietly(async () => {
      const { mint, redeem } = pairing();
      const first = await mint();
      const second = await mint();
      expect(first).not.toBe(second);
      expect((await redeem(second)).status).toBe(303);
      expect((await redeem(first)).status).toBe(303);
    }));

  test("only so many are outstanding, and the oldest is the one that goes", () =>
    quietly(async () => {
      const { mint, redeem } = pairing();
      const links: string[] = [];
      for (let count = 0; count < 17; count++) links.push(await mint());
      expect((await redeem(links[0] as string)).status).toBe(401);
      expect((await redeem(links[1] as string)).status).toBe(303);
      expect((await redeem(links[16] as string)).status).toBe(303);
    }));
});

describe("nothing a stranger can reach hands out the secret", () => {
  const config = withSecret();
  const { app } = assemble(config);

  test("the capabilities say that pairing is needed, and are the same for everybody", async () => {
    const answer = await app.request(
      "http://localhost:3001/api/capabilities",
      {},
      peer("127.0.0.1"),
    );
    const text = await answer.text();
    expect(JSON.parse(text)).toMatchObject({ installPairing: true });
    expect(text).not.toContain(SECRET);
  });

  test("every GET route, asked as a container on Docker Desktop and as one on the bridge", async () => {
    const paths = [
      ...new Set(
        app.routes
          .filter(
            (route) =>
              (route.method === "GET" || route.method === "ALL") &&
              !route.path.includes("*"),
          )
          .map((route) => route.path.replace(/:[A-Za-z0-9_]+\??/g, "x")),
      ),
    ];
    // The crawl has to be a crawl: a route table that shrank to a handful would pass for nothing.
    expect(paths.length).toBeGreaterThan(15);
    const quiet = ["info", "error"].map((method) =>
      spyOn(console, method as "info" | "error").mockImplementation(() => {}),
    );
    // A route that never answers (a stream with nothing behind it) is given a moment and left.
    const answered = async (path: string, address: string) => {
      const answer = await app.request(
        `http://localhost:3001${path}`,
        {},
        peer(address),
      );
      return {
        headers: [...answer.headers.entries()]
          .map(([name, value]) => `${name}: ${value}`)
          .join("\n"),
        cookie: answer.headers.get("set-cookie"),
        body: await answer.text(),
      };
    };
    let checked = 0;
    try {
      for (const address of ["127.0.0.1", "172.17.0.1"]) {
        for (const path of paths) {
          const result = await Promise.race([
            answered(path, address).catch(() => null),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 2000),
            ),
          ]);
          if (!result) continue;
          checked += 1;
          expect(result.headers).not.toContain(SECRET);
          expect(result.cookie).toBeNull();
          expect(result.body).not.toContain(SECRET);
        }
      }
    } finally {
      for (const spy of quiet) spy.mockRestore();
    }
    expect(checked).toBeGreaterThan(paths.length);
  }, 120_000);

  test("the crawl only sees what these fakes mount, so the secret is also named in six files of the server and no others", async () => {
    // A route that serialised the configuration, or the secret, would have to be written in one of
    // these files or name it in a new one. A new one fails here, on purpose: look at what it returns.
    const source = join(import.meta.dir, "..", "src");
    const named: string[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: source })) {
      if (
        /installSecret|INSTALL_SECRET|install-secret/.test(
          await Bun.file(join(source, file)).text(),
        )
      )
        named.push(file);
    }
    expect(named.sort()).toEqual([
      "app.ts",
      "auth/dev-actor.ts",
      "auth/install-secret.ts",
      "config.ts",
      "http-server.ts",
      "index.ts",
    ]);
  });

  test("and the way to the cookie is no route that answers without the secret or a link", async () => {
    const quiet = spyOn(console, "info").mockImplementation(() => {});
    try {
      for (const address of ["127.0.0.1", "172.17.0.1"]) {
        const asked = (path: string, init: RequestInit = {}) =>
          app.request(`http://localhost:3001${path}`, init, peer(address));
        expect(
          (await asked("/internal/pairing", { method: "POST" })).status,
        ).toBe(401);
        expect((await asked("/internal/pairing")).status).not.toBe(200);
        expect((await asked("/api/pair")).status).toBe(401);
      }
    } finally {
      quiet.mockRestore();
    }
  });
});

describe("what is not single-user stays as it was", () => {
  const signedIn = {
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

  test("a deployment with sign-in asks for a session from every peer, with or without the cookie, and has no pairing", async () => {
    const config = loadConfig(
      { ...testEnvironment(), FREEDUET_INSTALL_SECRET: SECRET },
      {},
    );
    expect(config.singleUser).toBe(false);
    const { app } = assemble(config, { 1: signedIn, 2: roles });
    for (const address of ["127.0.0.1", "172.17.0.1"]) {
      for (const cookie of [
        undefined,
        `freeduet_install_${config.port}=${SECRET}`,
      ]) {
        const headers: Record<string, string> = cookie ? { cookie } : {};
        const without = await app.request(
          "http://localhost:3001/api/approvals",
          { headers },
          peer(address),
        );
        expect(without.status).toBe(401);
        expect(await without.text()).not.toContain(PAIRING_REQUIRED);
        const withSession = await app.request(
          "http://localhost:3001/api/approvals",
          { headers: { ...headers, "x-test-session": "yes" } },
          peer(address),
        );
        expect(withSession.status).toBe(200);
      }
    }
    // No door, rather than a door that always refuses; and the capabilities do not claim one.
    for (const [method, path] of [
      ["POST", "/internal/pairing"],
      ["GET", "/api/pair?token=anything"],
    ] as const)
      expect(
        (
          await app.request(
            `http://localhost:3001${path}`,
            { method, headers: { authorization: `Bearer ${SECRET}` } },
            peer("127.0.0.1"),
          )
        ).status,
      ).toBe(404);
    const capabilities = await app.request(
      "http://localhost:3001/api/capabilities",
      {},
      peer("127.0.0.1"),
    );
    expect(await capabilities.json()).not.toHaveProperty("installPairing");
  });

  test("a server somebody opened beyond this machine admits whoever reaches it, secret or not, and has no pairing", async () => {
    const config = withSecret({ OPENBOT_HOST: "0.0.0.0" }, undefined);
    const { app } = assemble(config);
    for (const address of ["127.0.0.1", "192.168.1.10"]) {
      expect(
        (
          await app.request(
            "http://localhost:3001/api/approvals",
            {},
            peer(address),
          )
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await app.request(
          "http://localhost:3001/internal/pairing",
          {
            method: "POST",
            headers: { authorization: `Bearer ${SECRET}` },
          },
          peer("127.0.0.1"),
        )
      ).status,
    ).toBe(404);
    const capabilities = await app.request(
      "http://localhost:3001/api/capabilities",
      {},
      peer("127.0.0.1"),
    );
    expect(await capabilities.json()).not.toHaveProperty("installPairing");
  });

  test("an installation that has no secret yet is the person on loopback alone, and has no pairing", async () => {
    const config = loadConfig(singleUser(), bridgeInterfaces("172.17.0.1"));
    const { app } = assemble(config);
    const ask = (address: string, path = "/api/approvals") =>
      app.request(`http://localhost:3001${path}`, {}, peer(address));
    expect((await ask("127.0.0.1")).status).toBe(200);
    expect((await ask("172.17.0.1")).status).toBe(401);
    expect((await ask("127.0.0.1", "/api/pair?token=x")).status).toBe(404);
    expect(
      await (await ask("127.0.0.1", "/api/capabilities")).json(),
    ).not.toHaveProperty("installPairing");
  });
});
