import { afterEach, describe, expect, test } from "bun:test";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer, type Socket } from "node:net";
import {
  type EgressPolicy,
  egressFor,
  handleEgressPolicyRequest,
  setEgressPolicy,
  setEgressResolver,
  startEgressFilter,
  stopEgressFilter,
} from "../src/egress";

/**
 * A policy that becomes stricter reaches the connections that are already open.
 *
 * Measured on the filter before this change, with a real Chromium and with plain sockets: a tunnel
 * (CONNECT) opened to an address on the home network while "Home and office network access" was on
 * kept carrying data after the switch was turned off, and a page's WebSocket kept echoing. Only a NEW
 * CONNECT was refused. The filter judged a connection once, when it was opened, and forgot it.
 *
 * Now it keeps what it carries, with the address each connection really goes to, and when a policy is
 * pushed it judges every one of them again by the policies in force, with the function a new
 * connection meets, and ends (both sides) the ones that would be refused now. A policy that is wider,
 * or the same, ends nothing.
 *
 * Everything here runs over real sockets on this machine. A connection that stays open is shown by an
 * echo that comes back through it, and one that is closed is shown by the close event at BOTH ends,
 * waited for with a bound (never with a sleep): the bound is only what a failing run waits for, since
 * the filter ends a connection in the same turn as the push.
 */

const BOT = "sales";
const WITHIN_MS = 2_000;

const on: EgressPolicy = {
  mode: "allow_all",
  rules: [],
  allowPrivateNetwork: true,
};
const off: EgressPolicy = { mode: "allow_all", rules: [] };
const denyAll: EgressPolicy = { mode: "deny_all", rules: [] };

/** An allowlist that lets a Bot reach these ports on this machine, and nothing else. */
const allowing = (...ports: number[]): EgressPolicy => ({
  mode: "allowlist_only",
  rules: ports.map((port) => ({
    type: "cidr",
    value: "127.0.0.1/32",
    ports: String(port),
  })),
});

/* ------------------------------------------- the harness ------------------------------------------- */

const cleanups: (() => void | Promise<void>)[] = [];

/** Wait for something, but not for ever: a run that fails reports what it was waiting for. */
function within<T>(promise: Promise<T>, what: string, ms = WITHIN_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${what} did not happen within ${ms} ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Poll a condition, returning as soon as it holds. For a count that has no event to wait on. */
async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  ms = WITHIN_MS,
) {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`${what} did not hold in ${ms} ms`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

afterEach(async () => {
  // The test's own sockets and servers first, so the filter has nothing left to wait for.
  for (const cleanup of cleanups.splice(0)) await cleanup();
  await Promise.race([
    stopEgressFilter(),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
  setEgressResolver(null);
});

/** The answer a Bot's own request carries: the filter's secret and the Bot in its credentials. */
type Credentials = { bot: string; secret: string };
const asBot = (bot: string): Credentials => ({
  bot,
  secret: egressFor(bot, {})?.password ?? "",
});

type Origin = {
  port: number;
  /** Everything every connection to it has sent. */
  received: () => string;
  /** One per connection it accepted: resolves when that connection has closed at this end. */
  connections: { closed: Promise<void>; destroy: () => void }[];
  /** Resolves when it has accepted at least `n` connections. */
  accepted: (n: number) => Promise<void>;
};

/** A server on this machine that echoes everything back, and keeps what it was sent. */
async function echoOrigin(host = "127.0.0.1", port = 0): Promise<Origin> {
  let received = "";
  const connections: Origin["connections"] = [];
  const waiting: { n: number; resolve: () => void }[] = [];
  const open = new Set<Socket>();
  const server = createServer((socket) => {
    open.add(socket);
    socket.on("error", () => undefined);
    connections.push({
      closed: new Promise<void>((resolve) =>
        socket.once("close", () => {
          open.delete(socket);
          resolve();
        }),
      ),
      destroy: () => socket.destroy(),
    });
    for (const waiter of waiting) {
      if (connections.length >= waiter.n) waiter.resolve();
    }
    socket.on("data", (chunk) => {
      received += chunk.toString();
      socket.write(chunk);
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, host, () => resolve()),
  );
  cleanups.push(async () => {
    for (const socket of open) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    received: () => received,
    connections,
    accepted: (n) =>
      connections.length >= n
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiting.push({ n, resolve })),
  };
}

type Tunnel = {
  socket: Socket;
  /** The status line the filter answered with. */
  status: Promise<string>;
  /** Resolves when the socket has closed. */
  closed: Promise<void>;
  /** What has come back through the tunnel. */
  received: () => string;
  /** Send this and wait for the origin's echo of it to come back through the tunnel. */
  roundTrip: (text: string) => Promise<void>;
};

/** Ask the filter for a tunnel and return at once, without waiting for the answer. */
function beginTunnel(
  filterPort: number,
  target: string,
  as?: Credentials,
): Tunnel {
  const socket = connect(filterPort, "127.0.0.1");
  cleanups.push(() => socket.destroy());
  // What happens to it is read from its events. A reset is an answer here, not a crash.
  socket.on("error", () => undefined);
  const closed = new Promise<void>((resolve) =>
    socket.once("close", () => resolve()),
  );
  let head = "";
  let received = "";
  let answered = false;
  const status = new Promise<string>((resolve) => {
    socket.on("data", (chunk) => {
      if (answered) {
        received += chunk.toString();
        return;
      }
      head += chunk.toString();
      const end = head.indexOf("\r\n\r\n");
      if (end === -1) return;
      answered = true;
      received += head.slice(end + 4);
      resolve(head.slice(0, head.indexOf("\r\n")));
    });
    socket.once("close", () => {
      if (!answered)
        resolve(head.split("\r\n")[0] || "closed without an answer");
    });
  });
  socket.once("connect", () => {
    const auth = as
      ? `Proxy-Authorization: Basic ${Buffer.from(`${as.bot}:${as.secret}`).toString("base64")}\r\n`
      : "";
    socket.write(
      `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`,
    );
  });
  return {
    socket,
    status,
    closed,
    received: () => received,
    roundTrip: (text) =>
      within(
        new Promise<void>((resolve) => {
          const check = () => {
            if (received.includes(text)) {
              socket.off("data", check);
              resolve();
            }
          };
          socket.on("data", check);
          socket.write(text);
          check();
        }),
        `the echo of "${text}" through the tunnel`,
      ),
  };
}

/** Open a tunnel and require the 200. */
async function openTunnel(
  filterPort: number,
  target: string,
  as?: Credentials,
): Promise<Tunnel> {
  const tunnel = beginTunnel(filterPort, target, as);
  const line = await within(tunnel.status, `an answer for CONNECT ${target}`);
  if (!line.includes(" 200 ")) {
    throw new Error(`CONNECT ${target} was answered "${line}"`);
  }
  return tunnel;
}

/** Push a Bot's policy the way the API server does: PUT /egress-policy on the computer. */
async function push(bot: string, policy: EgressPolicy | null) {
  const answer = await handleEgressPolicyRequest(
    bot,
    new Request("http://computer/egress-policy", {
      method: "PUT",
      body: JSON.stringify({ policy }),
    }),
  );
  expect(answer.status).toBe(200);
}

/** Both ends of a tunnel, closed. */
async function closedAtBothEnds(tunnel: Tunnel, farEnd: Promise<void>) {
  await within(tunnel.closed, "the tunnel's near end to close");
  await within(farEnd, "the tunnel's far end to close");
}

type Upstream = {
  port: number;
  /** The authority of every CONNECT it has been asked for. */
  asked: string[];
  askedFor: (n: number) => Promise<void>;
  /** Answer the CONNECTs it was told to hold. */
  release: () => void;
  /** One per connection the filter made to it: resolves when that socket has closed. */
  tunnels: { closed: Promise<void> }[];
};

/**
 * An upstream proxy: it answers every CONNECT with a 200 and echoes, and it can be told to hold its
 * answer, which is how a tunnel is kept in the middle of being set up.
 *
 * A raw TCP server that reads the request line itself: the socket Bun gives an `http` server's
 * `connect` handler emits `end` and never `close` when its peer goes away, which would make "the
 * filter closed its socket to the proxy" impossible to see.
 */
async function upstreamProxy(
  options: { hold?: boolean } = {},
): Promise<Upstream> {
  const asked: string[] = [];
  const tunnels: Upstream["tunnels"] = [];
  const waiting: { n: number; resolve: () => void }[] = [];
  const open = new Set<Socket>();
  let release: () => void = () => undefined;
  const released = options.hold
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  const server = createServer((socket) => {
    open.add(socket);
    socket.on("error", () => undefined);
    // Recorded when the filter connects, so a tunnel that is held can still be waited on.
    tunnels.push({
      closed: new Promise<void>((resolve) =>
        socket.once("close", () => {
          open.delete(socket);
          resolve();
        }),
      ),
    });
    let head = "";
    let answered = false;
    socket.on("data", async (chunk) => {
      if (answered) {
        socket.write(chunk);
        return;
      }
      head += chunk.toString();
      if (!head.includes("\r\n\r\n")) return;
      // `CONNECT host:port HTTP/1.1`
      asked.push(head.split("\r\n")[0]?.split(" ")[1] ?? "");
      for (const waiter of waiting) {
        if (asked.length >= waiter.n) waiter.resolve();
      }
      await released;
      if (socket.destroyed) return;
      answered = true;
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  cleanups.push(async () => {
    for (const socket of open) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    asked,
    askedFor: (n) =>
      asked.length >= n
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiting.push({ n, resolve })),
    release: () => release(),
    tunnels,
  };
}

const behindUpstream = (upstream: Upstream) => ({
  EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${upstream.port}`,
});

/** Every connection an origin has accepted, closed. */
const allClosed = (origin: Origin) =>
  Promise.all(origin.connections.map((connection) => connection.closed));

/* ------------------------------ a tunnel the filter opened itself ------------------------------ */

describe("a tunnel the filter opened itself", () => {
  for (const [who, credentials] of [
    ["carrying a Bot's credentials", true],
    ["carrying none, as a browser's and a shell's arrive", false],
  ] as const) {
    test(`turning the switch off closes a tunnel to the home network at both ends, and what is sent after never arrives (${who})`, async () => {
      const origin = await echoOrigin();
      const filter = await startEgressFilter({ env: {} });
      await push(BOT, on);
      const as = credentials ? asBot(BOT) : undefined;
      const tunnel = await openTunnel(
        filter.port,
        `127.0.0.1:${origin.port}`,
        as,
      );
      await tunnel.roundTrip("before");

      // The person turns the switch off, and the server pushes the new policy to the computer.
      await push(BOT, off);
      // Sent at once, before the close has reached this end: it must not get through.
      tunnel.socket.write("after");

      await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
      expect(origin.received()).toBe("before");
      // And a new one meets the answer it always did.
      const again = beginTunnel(filter.port, `127.0.0.1:${origin.port}`, as);
      expect(await within(again.status, "an answer")).toContain("403");
    });
  }

  test("turning cloud network access off (allow_all to deny_all) closes every tunnel that is open, wherever it goes", async () => {
    const a = await echoOrigin();
    const b = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const tunnels = [
      await openTunnel(filter.port, `127.0.0.1:${a.port}`, asBot(BOT)),
      await openTunnel(filter.port, `127.0.0.1:${a.port}`),
      await openTunnel(filter.port, `127.0.0.1:${b.port}`, asBot(BOT)),
    ];
    for (const [index, tunnel] of tunnels.entries()) {
      await tunnel.roundTrip(`before ${index}`);
    }

    await push(BOT, denyAll);

    await Promise.all(
      tunnels.map((tunnel) => within(tunnel.closed, "a tunnel")),
    );
    await within(allClosed(a), "the first origin's connections to close");
    await within(allClosed(b), "the second origin's connection to close");
  });

  test("an allowlist rule that is removed closes the tunnel it allowed, and only that one", async () => {
    const a = await echoOrigin();
    const b = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, allowing(a.port, b.port));
    const toA = await openTunnel(
      filter.port,
      `127.0.0.1:${a.port}`,
      asBot(BOT),
    );
    const toB = await openTunnel(
      filter.port,
      `127.0.0.1:${b.port}`,
      asBot(BOT),
    );
    await toA.roundTrip("a before");
    await toB.roundTrip("b before");

    await push(BOT, allowing(a.port));
    await closedAtBothEnds(toB, b.connections[0]!.closed);
    // The one the change does not concern carries on.
    await toA.roundTrip("a after");
    expect(b.received()).toBe("b before");

    await push(BOT, allowing());
    await closedAtBothEnds(toA, a.connections[0]!.closed);
  });

  test("a name is judged by the address it was connected to, which is not looked up again", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    let lookups = 0;
    setEgressResolver(async (host) => {
      lookups += 1;
      if (lookups > 1) throw new Error(`asked again for ${host}`);
      return host === "site.example.test" ? ["127.0.0.1"] : [];
    });
    await push(BOT, {
      mode: "allowlist_only",
      rules: [{ type: "domain", value: "site.example.test" }],
    });
    const tunnel = await openTunnel(
      filter.port,
      `site.example.test:${origin.port}`,
      asBot(BOT),
    );
    await tunnel.roundTrip("before");

    // The domain rule is gone, but a range that covers the address it reached is not.
    await push(BOT, allowing(origin.port));
    await tunnel.roundTrip("covered by the range");
    // And now nothing covers it.
    await push(BOT, allowing());
    await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
    expect(lookups).toBe(1);
  });

  test("a policy that becomes wider, or is pushed again as it was, closes nothing (a guard: nothing is closed on main either)", async () => {
    const a = await echoOrigin();
    const b = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, allowing(a.port));
    const tunnel = await openTunnel(
      filter.port,
      `127.0.0.1:${a.port}`,
      asBot(BOT),
    );
    await tunnel.roundTrip("narrow");
    // The server pushes the same policy every 30 seconds.
    await push(BOT, allowing(a.port));
    await tunnel.roundTrip("unchanged");
    await push(BOT, allowing(a.port, b.port));
    await tunnel.roundTrip("a range added");
    await push(BOT, on);
    await tunnel.roundTrip("everything, the home network included");
    // A push for another Bot is not this tunnel's business either.
    await push("someone-else", off);
    await tunnel.roundTrip("another Bot's policy");
    expect(a.connections.length).toBe(1);
  });

  test("a mode that looks wider still ends a tunnel to an address it refuses: the destination decides, not the mode's name", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    // An administrator's own range, which `allowlist_only` honours for the home network.
    await push(BOT, allowing(origin.port));
    const tunnel = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await tunnel.roundTrip("before");

    // `allow_all` without the switch is the internet, and this machine is not.
    await push(BOT, off);
    await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
  });
});

/* ------------------------------------- whose policy it is ------------------------------------- */

describe("whose policy a connection is judged by", () => {
  test("a tunnel that carries a Bot's credentials is judged by that Bot's policy only", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push("a", on);
    await push("b", on);
    const toA = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot("a"),
    );
    const toB = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot("b"),
    );
    await toA.roundTrip("a");
    await toB.roundTrip("b");

    await push("a", off);
    await closedAtBothEnds(toA, origin.connections[0]!.closed);
    await toB.roundTrip("b is allowed still");

    await push("b", denyAll);
    await closedAtBothEnds(toB, origin.connections[1]!.closed);
  });

  test("a tunnel with no credentials is judged by every policy on the computer, as a new connection of its kind is, so the strictest one ends it", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push("a", on);
    await push("b", on);
    const anonymous = await openTunnel(filter.port, `127.0.0.1:${origin.port}`);
    const toA = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot("a"),
    );
    await anonymous.roundTrip("anonymous");
    await toA.roundTrip("a");

    // Bot a still allows it, Bot b no longer does: nothing says whose the anonymous tunnel is.
    await push("b", off);
    await closedAtBothEnds(anonymous, origin.connections[0]!.closed);
    // The same answer a new anonymous connection gets now, and a's own tunnel is not concerned.
    const again = beginTunnel(filter.port, `127.0.0.1:${origin.port}`);
    expect(await within(again.status, "an answer")).toContain("403");
    await toA.roundTrip("a is allowed still");
  });

  test("a stricter policy for a Bot that joins the computer reaches the anonymous tunnels, and not the Bots that already have a policy of their own", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push("a", on);
    const anonymous = await openTunnel(filter.port, `127.0.0.1:${origin.port}`);
    const toA = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot("a"),
    );
    await anonymous.roundTrip("anonymous");
    await toA.roundTrip("a");

    await push("newcomer", denyAll);
    await closedAtBothEnds(anonymous, origin.connections[0]!.closed);
    await toA.roundTrip("a is allowed still");
  });

  test("taking a Bot's policy away ends what it was carrying, since a new connection would be refused until one arrives", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const tunnel = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await tunnel.roundTrip("before");

    await push(BOT, null);
    await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
  });

  test("with EGRESS_POLICY_REQUIRED=0 a computer that was pushed nothing keeps its tunnels, and the first policy brings the block", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({
      env: { EGRESS_POLICY_REQUIRED: "0" },
    });
    const tunnel = await openTunnel(filter.port, `127.0.0.1:${origin.port}`);
    await tunnel.roundTrip("before any policy");

    await push(BOT, on);
    await tunnel.roundTrip("the first policy allows it");
    await push(BOT, off);
    await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
  });
});

/* ------------------------------------ behind an upstream proxy ------------------------------------ */

describe("a tunnel behind an upstream proxy", () => {
  test("to a private address written out, is closed when the switch is turned off, and so is the filter's socket to the proxy", async () => {
    const upstream = await upstreamProxy();
    const filter = await startEgressFilter({ env: behindUpstream(upstream) });
    await push(BOT, on);
    const tunnel = await openTunnel(
      filter.port,
      "192.168.1.20:443",
      asBot(BOT),
    );
    await tunnel.roundTrip("before");

    await push(BOT, off);
    await closedAtBothEnds(tunnel, upstream.tunnels[0]!.closed);
    expect(upstream.asked).toEqual(["192.168.1.20:443"]);
  });

  test("to a name is judged by the name, so a default destination that is dropped closes it and a domain rule that is kept does not", async () => {
    const upstream = await upstreamProxy();
    const filter = await startEgressFilter({ env: behindUpstream(upstream) });
    const intranet: EgressPolicy["rules"] = [
      { type: "domain", value: "intranet.corp.test" },
    ];
    await push(BOT, { mode: "defaults_plus_allowlist", rules: intranet });
    const github = await openTunnel(filter.port, "github.com:443");
    const corp = await openTunnel(filter.port, "intranet.corp.test:443");
    await github.roundTrip("github");
    await corp.roundTrip("intranet");

    // The defaults are gone, the administrator's own domain is not.
    await push(BOT, { mode: "allowlist_only", rules: intranet });
    await closedAtBothEnds(github, upstream.tunnels[0]!.closed);
    await corp.roundTrip("intranet, after");

    await push(BOT, { mode: "allowlist_only", rules: [] });
    await closedAtBothEnds(corp, upstream.tunnels[1]!.closed);
  });

  test("a tunnel that is still being set up when the policy arrives is refused as a CONNECT arriving then would be, and the proxy's answer comes to nothing", async () => {
    const upstream = await upstreamProxy({ hold: true });
    const filter = await startEgressFilter({ env: behindUpstream(upstream) });
    await push(BOT, on);
    const pending = beginTunnel(filter.port, "10.1.2.3:443", asBot(BOT));
    await within(upstream.askedFor(1), "the proxy to be asked for the tunnel");

    await push(BOT, off);
    expect(
      await within(pending.status, "an answer for the pending CONNECT"),
    ).toContain("403");

    // Only now does the proxy answer. The filter drops its socket to it instead of tunnelling.
    upstream.release();
    await within(
      upstream.tunnels[0]!.closed,
      "the filter's socket to the proxy to close",
    );
    expect(pending.received()).not.toContain("Connection Established");
  });
});

/* ------------------------------------- many, and in motion ------------------------------------- */

describe("many tunnels, and tunnels in motion", () => {
  test("forty tunnels, half of them to a destination the new policy refuses: those close, the rest carry on", async () => {
    const kept = await echoOrigin();
    const dropped = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, allowing(kept.port, dropped.port));
    const opened = await Promise.all(
      Array.from({ length: 40 }, async (_, index) => {
        const refused = index % 2 === 1;
        // Half of them carry the Bot's credentials, as a script's would, and half none, as a browser's.
        const tunnel = await openTunnel(
          filter.port,
          `127.0.0.1:${(refused ? dropped : kept).port}`,
          index % 4 < 2 ? asBot(BOT) : undefined,
        );
        await tunnel.roundTrip(`hello ${index}`);
        return { tunnel, refused };
      }),
    );

    await push(BOT, allowing(kept.port));

    await Promise.all(
      opened
        .filter((entry) => entry.refused)
        .map((entry) =>
          within(entry.tunnel.closed, "a refused tunnel to close"),
        ),
    );
    await within(
      allClosed(dropped),
      "the refused destination's connections to close",
    );
    expect(dropped.connections.length).toBe(20);
    await Promise.all(
      opened
        .filter((entry) => !entry.refused)
        .map((entry, index) => entry.tunnel.roundTrip(`still here ${index}`)),
    );
    expect(kept.connections.length).toBe(20);
  });

  test("a tunnel that is closing at either end when the policy arrives is no trouble, and the policy still reaches the others", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const closingNear = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await closingNear.roundTrip("near");
    const closingFar = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
    );
    await closingFar.roundTrip("far");
    const healthy = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await healthy.roundTrip("healthy");

    // In one turn: one tunnel is half-closed by its client, one is dropped by its origin, and the
    // policy arrives, twice over, the second time stricter still.
    closingNear.socket.end();
    origin.connections[1]!.destroy();
    setEgressPolicy(BOT, off);
    setEgressPolicy(BOT, denyAll);

    await closedAtBothEnds(closingNear, origin.connections[0]!.closed);
    await closedAtBothEnds(closingFar, origin.connections[1]!.closed);
    await closedAtBothEnds(healthy, origin.connections[2]!.closed);
  });

  test("a policy that tightens and widens again does not bring a closed tunnel back", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const tunnel = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await tunnel.roundTrip("before");

    await push(BOT, off);
    await push(BOT, on);
    await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
    tunnel.socket.write("too late");
    expect(origin.received()).toBe("before");
  });
});

/* ------------------------------------------ plain HTTP ------------------------------------------ */

type PlainOrigin = {
  port: number;
  /** Requests that reached it. */
  reached: () => number;
  /** One per connection it accepted: resolves when that connection has closed at this end. */
  connections: { closed: Promise<void> }[];
};

/** An HTTP server that answers every request with its own name and keeps every connection open. */
async function plainOrigin(
  name: string,
  host = "127.0.0.1",
  port = 0,
): Promise<PlainOrigin> {
  let reached = 0;
  const connections: PlainOrigin["connections"] = [];
  const open = new Set<Socket>();
  const server = createServer((socket) => {
    open.add(socket);
    socket.on("error", () => undefined);
    connections.push({
      closed: new Promise<void>((resolve) =>
        socket.once("close", () => {
          open.delete(socket);
          resolve();
        }),
      ),
    });
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString();
      while (pending.includes("\r\n\r\n")) {
        pending = pending.slice(pending.indexOf("\r\n\r\n") + 4);
        reached += 1;
        socket.write(
          `HTTP/1.1 200 OK\r\ncontent-length: ${name.length}\r\nconnection: keep-alive\r\n\r\n${name}`,
        );
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, host, () => resolve()),
  );
  cleanups.push(async () => {
    for (const socket of open) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    reached: () => reached,
    connections,
  };
}

/** One plain-HTTP request through the filter, and what answered it. */
function getVia(
  filterPort: number,
  authority: string,
  as?: Credentials,
  path = "/",
) {
  return within(
    new Promise<string>((resolve, reject) => {
      const socket = connect(filterPort, "127.0.0.1", () => {
        const auth = as
          ? `Proxy-Authorization: Basic ${Buffer.from(`${as.bot}:${as.secret}`).toString("base64")}\r\n`
          : "";
        socket.write(
          `GET http://${authority}${path} HTTP/1.1\r\nHost: ${authority}\r\n${auth}Connection: close\r\n\r\n`,
        );
      });
      cleanups.push(() => socket.destroy());
      let seen = "";
      socket.on("data", (chunk) => {
        seen += chunk.toString();
      });
      socket.on("end", () => resolve(seen));
      socket.on("error", reject);
    }),
    `the answer to GET http://${authority}${path}`,
  );
}

const bodyOf = (answer: string) => answer.split("\r\n\r\n")[1] ?? "";

/** A server whose response never ends: a tick every few milliseconds until its client goes. */
async function streamingOrigin() {
  const ended: Promise<void>[] = [];
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    const timer = setInterval(() => response.write("tick\n"), 10);
    ended.push(
      new Promise<void>((resolve) =>
        response.once("close", () => {
          clearInterval(timer);
          resolve();
        }),
      ),
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  cleanups.push(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    ended,
  };
}

describe("plain HTTP", () => {
  test("a response that is still streaming is cut at both ends when the switch is turned off", async () => {
    const stream = await streamingOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const client = connect(filter.port, "127.0.0.1");
    cleanups.push(() => client.destroy());
    client.on("error", () => undefined);
    let seen = "";
    const ticks = () => (seen.match(/tick/g) ?? []).length;
    const closed = new Promise<void>((resolve) =>
      client.once("close", () => resolve()),
    );
    const flowing = new Promise<void>((resolve) =>
      client.on("data", (chunk) => {
        seen += chunk.toString();
        if (ticks() >= 3) resolve();
      }),
    );
    const { bot, secret } = asBot(BOT);
    client.write(
      `GET http://127.0.0.1:${stream.port}/stream HTTP/1.1\r\nHost: 127.0.0.1:${stream.port}\r\nProxy-Authorization: Basic ${Buffer.from(`${bot}:${secret}`).toString("base64")}\r\n\r\n`,
    );
    await within(flowing, "three chunks of the stream");

    await push(BOT, off);

    await within(closed, "the client's end of the stream to close");
    await within(stream.ended[0]!, "the origin's end of the stream to close");
  });

  test("a request leaves on a connection of its own, which ends with it: nothing is kept open to be used for a later one", async () => {
    const origin = await plainOrigin("from the origin");
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);

    expect(bodyOf(await getVia(filter.port, `127.0.0.1:${origin.port}`))).toBe(
      "from the origin",
    );
    // The origin never closes its own side, so this is the filter closing its socket to it.
    await within(
      origin.connections[0]!.closed,
      "the connection that carried the request to close",
    );
    expect(bodyOf(await getVia(filter.port, `127.0.0.1:${origin.port}`))).toBe(
      "from the origin",
    );
    expect(origin.connections.length).toBe(2);
  });

  test("a request goes to the address that was checked for it, not along a connection that was opened for an earlier one", async () => {
    // Two servers on one port, on two addresses of this machine's loopback.
    const first = await plainOrigin("from 127.0.0.1");
    const second = await plainOrigin("from 127.0.0.2", "127.0.0.2", first.port);
    const filter = await startEgressFilter({ env: {} });
    let answer = ["127.0.0.1"];
    setEgressResolver(async () => answer);
    const allowedAddress = (address: string): EgressPolicy => ({
      mode: "allowlist_only",
      rules: [
        { type: "cidr", value: `${address}/32`, ports: String(first.port) },
      ],
    });
    const authority = `rebind.example.test:${first.port}`;

    await push(BOT, allowedAddress("127.0.0.1"));
    expect(bodyOf(await getVia(filter.port, authority))).toBe("from 127.0.0.1");

    // The policy now allows the other address only, and the name has moved to it. The first address
    // is refused, so nothing may be sent to it, however it is reached.
    await push(BOT, allowedAddress("127.0.0.2"));
    answer = ["127.0.0.2"];
    expect(bodyOf(await getVia(filter.port, authority))).toBe("from 127.0.0.2");
    expect(first.reached()).toBe(1);
    expect(second.reached()).toBe(1);
  });
});

/* --------------------------- what the filter keeps, and what it lets go of --------------------------- */

describe("what the filter keeps track of", () => {
  /** The new export is read inside each case, so a build that does not have it fails the case and not the file. */
  const counted = async () =>
    (await import("../src/egress")).openEgressConnectionCount();
  /** For `until`: the count is read through the import above, so the condition is asynchronous. */
  const countIs = (n: number) => async () => (await counted()) === n;

  test("a tunnel is counted while it is open and not after it ends, whichever end ends it", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    expect(await counted()).toBe(0);
    const byClient = await openTunnel(filter.port, `127.0.0.1:${origin.port}`);
    const byOrigin = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await byClient.roundTrip("one");
    await byOrigin.roundTrip("two");
    expect(await counted()).toBe(2);

    byClient.socket.destroy();
    await within(
      origin.connections[0]!.closed,
      "the first tunnel's far end to close",
    );
    await until(countIs(1), "one tunnel counted");

    origin.connections[1]!.destroy();
    await within(byOrigin.closed, "the second tunnel's near end to close");
    await until(countIs(0), "no tunnel counted");
  });

  test("a connection that is refused is never counted, and neither is a request for the metadata address under the most permissive policy", async () => {
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    for (const target of [
      "169.254.169.254:80",
      "[fd00:ec2::254]:80",
      "100.100.100.200:80",
    ]) {
      const refused = beginTunnel(filter.port, target, asBot(BOT));
      expect(await within(refused.status, "an answer")).toContain("403");
    }
    await push(BOT, denyAll);
    expect(
      await within(
        beginTunnel(filter.port, "127.0.0.1:9", asBot(BOT)).status,
        "an answer",
      ),
    ).toContain("403");
    expect(await counted()).toBe(0);
  });

  test("a plain request is counted while it is in flight and not after", async () => {
    const stream = await streamingOrigin();
    const origin = await plainOrigin("done");
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const flowing = connect(filter.port, "127.0.0.1");
    cleanups.push(() => flowing.destroy());
    flowing.on("error", () => undefined);
    const started = new Promise<void>((resolve) =>
      flowing.once("data", () => resolve()),
    );
    flowing.write(
      `GET http://127.0.0.1:${stream.port}/ HTTP/1.1\r\nHost: 127.0.0.1:${stream.port}\r\n\r\n`,
    );
    await within(started, "the stream to start");
    expect(await counted()).toBe(1);

    flowing.destroy();
    await within(stream.ended[0]!, "the origin's end of the stream to close");
    await until(countIs(0), "nothing in flight");
    // And a request that has been answered leaves nothing behind either.
    expect(bodyOf(await getVia(filter.port, `127.0.0.1:${origin.port}`))).toBe(
      "done",
    );
    await until(countIs(0), "nothing in flight after an answered request");
  });

  test("a client that goes away while its tunnel is still being set up leaves nothing behind, and the proxy's late answer is dropped", async () => {
    const upstream = await upstreamProxy({ hold: true });
    const filter = await startEgressFilter({ env: behindUpstream(upstream) });
    await push(BOT, on);
    const pending = beginTunnel(filter.port, "10.1.2.3:443", asBot(BOT));
    await within(upstream.askedFor(1), "the proxy to be asked for the tunnel");
    expect(await counted()).toBe(1);

    pending.socket.destroy();
    await until(countIs(0), "nothing counted");
    upstream.release();
    await within(
      upstream.tunnels[0]!.closed,
      "the filter's socket to the proxy to close",
    );
  });

  test("stopping the filter ends the connections it carries instead of waiting for them", async () => {
    const origin = await echoOrigin();
    const filter = await startEgressFilter({ env: {} });
    await push(BOT, on);
    const tunnel = await openTunnel(
      filter.port,
      `127.0.0.1:${origin.port}`,
      asBot(BOT),
    );
    await tunnel.roundTrip("before");

    await within(stopEgressFilter(), "the filter to stop");
    await closedAtBothEnds(tunnel, origin.connections[0]!.closed);
    expect(await counted()).toBe(0);
  });
});
