/**
 * The live screen's socket carries the Bot's own computer's token, and no other (docs/design/per-computer-token.md).
 *
 * The real `startHttpServer` proxies a person's socket to the Bot's computer and puts the token in the
 * address it opens inward, because a WebSocket upgrade can carry no header. That token used to be the
 * deployment's one `COMPUTER_TOKEN` for every Bot; it is now the token the supervisor made for this
 * Bot. The computer is a real WebSocket server that writes down the address it was opened with, and the
 * supervisor a record that answers `/ensure` with a token per Bot.
 */
import { describe, expect, test } from "bun:test";
import type { AuditStore } from "../src/audit";
import { createComputerGateway } from "../src/computer/gateway";
import type { ActionPolicy } from "../src/computer/policy";
import { createInMemorySnapshotStore } from "../src/computer/snapshot-store";
import { createDockerSupervisorProvider } from "../src/computer/supervisor";
import { loadConfig } from "../src/config";
import { startHttpServer } from "../src/http-server";
import { testEnvironment } from "./support/environment";

const SHARED = "the-deployment-computer-token";
const tokenOf = (botId: string) => `own-token-of-${botId}`;
const PERMISSIVE: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port;
  probe.stop(true);
  return port as number;
}

function singleUser() {
  const {
    GOOGLE_OAUTH_CLIENT_ID: _id,
    GOOGLE_OAUTH_CLIENT_SECRET: _secret,
    BETTER_AUTH_SECRET: _auth,
    BETTER_AUTH_URL: _url,
    INITIAL_ADMIN_EMAILS: _admins,
    ...rest
  } = testEnvironment();
  return { ...rest, OPENBOT_SINGLE_USER: "true" };
}

/** A computer that takes sockets and writes down the address each one was opened with. */
function fakeComputer() {
  const opened: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, upgrade) {
      const url = new URL(request.url);
      opened.push(`${url.pathname}${url.search}`);
      if (upgrade.upgrade(request)) return undefined;
      return new Response("Expected a WebSocket upgrade.", { status: 400 });
    },
    websocket: {
      open(socket) {
        socket.send("a frame");
      },
      message() {},
    },
  });
  return { opened, port: server.port as number, stop: () => server.stop(true) };
}

function stack(options: { computerPort: number; leaveTokenOut?: boolean }) {
  const supervisorFetch = (async (input: string) => {
    const ensure = /^\/computers\/([^/]+)\/ensure$/.exec(
      new URL(input).pathname,
    );
    if (!ensure) return Response.json({ computers: [] });
    const botId = decodeURIComponent(ensure[1] as string);
    return Response.json({
      botId,
      status: "running",
      url: `http://127.0.0.1:${options.computerPort}`,
      startedAt: "2026-11-14T10:00:00.000Z",
      ...(options.leaveTokenOut ? {} : { token: tokenOf(botId) }),
    });
  }) as unknown as typeof fetch;
  const auditStore: AuditStore = { insert: async () => {} };
  const provider = createDockerSupervisorProvider({
    baseUrl: "http://supervisor:4300",
    fetchImpl: supervisorFetch,
  });
  const gateway = createComputerGateway({
    provider,
    auditStore,
    policy: () => PERMISSIVE,
    snapshots: createInMemorySnapshotStore(),
    token: SHARED,
  });
  const port = freePort();
  const server = startHttpServer({
    port,
    config: {
      ...loadConfig(singleUser(), {}),
      listen: [{ host: "127.0.0.1", required: true, local: true }],
      computer: {
        provider: "docker",
        baseUrl: "http://supervisor:4300",
        allowPrivateHosts: false,
      },
    },
    resolveRequestActor: async () => ({
      id: "dev-local-user",
      name: "dev@openbot.local",
      role: "admin" as const,
    }),
    agentProfileStore: {
      get: async () => ({ visibility: "public", ownerUserId: null }),
    } as never,
    computerGateway: gateway,
    demonstrationStore: { active: async () => undefined } as never,
    demonstrationRecorder: {} as never,
    app: { fetch: () => new Response("the app") },
  });
  return { port, stop: server.stop };
}

/** Opens the person's side of the live screen and says whether a frame came through. */
function watch(port: number, botId: string): Promise<"frame" | "refused"> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/api/computers/${botId}/stream`,
    );
    const end = setTimeout(() => {
      socket.close();
      resolve("refused");
    }, 5_000);
    socket.onmessage = () => {
      clearTimeout(end);
      socket.close();
      resolve("frame");
    };
    socket.onerror = () => {
      clearTimeout(end);
      resolve("refused");
    };
    socket.onclose = () => {
      clearTimeout(end);
      resolve("refused");
    };
  });
}

describe("the live screen of a Bot whose computer has a token of its own", () => {
  test("opens each Bot's computer with that computer's token, and never with the deployment's", async () => {
    const computer = fakeComputer();
    const served = stack({ computerPort: computer.port });
    try {
      expect(await watch(served.port, "alpha")).toBe("frame");
      expect(await watch(served.port, "beta")).toBe("frame");

      expect(computer.opened).toEqual([
        `/stream?bot=alpha&token=${tokenOf("alpha")}`,
        `/stream?bot=beta&token=${tokenOf("beta")}`,
      ]);
      expect(computer.opened.join("\n")).not.toContain(SHARED);
    } finally {
      served.stop();
      computer.stop();
    }
  }, 30_000);

  test("opens nothing when the supervisor cannot say the token, rather than sending another", async () => {
    const computer = fakeComputer();
    const served = stack({ computerPort: computer.port, leaveTokenOut: true });
    try {
      expect(await watch(served.port, "alpha")).toBe("refused");
      expect(computer.opened).toEqual([]);
    } finally {
      served.stop();
      computer.stop();
    }
  }, 30_000);
});
