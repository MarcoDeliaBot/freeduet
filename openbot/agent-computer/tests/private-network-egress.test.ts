import { afterEach, describe, expect, test } from "bun:test";
import {
  createServer as createHttpServer,
  type IncomingMessage,
} from "node:http";
import { connect, createServer, type Socket } from "node:net";
import {
  type EgressPolicy,
  egressDecision,
  egressFor,
  egressPolicyFor,
  egressShellEnvironment,
  handleEgressPolicyRequest,
  isAlwaysDenied,
  parseEgressPolicy,
  setEgressPolicy,
  setEgressResolver,
  startEgressFilter,
  stopEgressFilter,
} from "../src/egress";

/**
 * A Bot's computer and the home or office network around it (D36).
 *
 * Under `allow_all` the private and special ranges are refused, on the address the connection really
 * goes to, unless the policy the person's API server pushed carries `allowPrivateNetwork`. The
 * metadata and link-local addresses are refused whatever the policy says, the switch included.
 *
 * Three layers, each with its own questions:
 *
 * - the rule itself, `egressDecision`, with no sockets;
 * - the filter over real sockets, where the filter makes the connection itself: a name is resolved
 *   here, the address that was checked is the address connected to, a redirect is a new connection;
 * - the filter in front of an upstream proxy, where the proxy resolves names and the filter can only
 *   judge what it is given: a literal address, in any spelling.
 *
 * "Never reached" below is a count of connections made to a server on this machine, not a status
 * code: a refusal that still connected first would be no refusal.
 */

const BOT = "sales";
const blocked: EgressPolicy = { mode: "allow_all", rules: [] };
const switchedOn: EgressPolicy = {
  mode: "allow_all",
  rules: [],
  allowPrivateNetwork: true,
};

describe("the rule: allow_all and the private ranges", () => {
  // [host, the range it is in]
  const refused: [string, string][] = [
    ["10.1.2.3", "10.0.0.0/8"],
    ["172.16.0.1", "172.16.0.0/12"],
    ["172.31.255.255", "172.16.0.0/12"],
    ["192.168.1.1", "192.168.0.0/16"],
    ["100.64.0.1", "100.64.0.0/10"],
    ["127.0.0.1", "127.0.0.0/8"],
    ["127.255.255.254", "127.0.0.0/8"],
    ["0.0.0.0", "0.0.0.0/8"],
    ["224.0.0.251", "224.0.0.0/4"],
    ["255.255.255.255", "240.0.0.0/4"],
    ["[::1]", "::1/128"],
    ["::", "::/128"],
    ["[fd12:3456::1]", "fc00::/7"],
    ["[fec0::1]", "fec0::/10"],
    ["[ff02::1]", "ff00::/8"],
    ["[::ffff:10.0.0.1]", "10.0.0.0/8"],
    ["[::ffff:c0a8:101]", "192.168.0.0/16"],
    ["[64:ff9b::a00:1]", "10.0.0.0/8"],
    ["[2002:c0a8:101::]", "192.168.0.0/16"],
    ["2130706433", "127.0.0.0/8"],
    ["0x7f.1", "127.0.0.0/8"],
    ["127.1", "127.0.0.0/8"],
    ["0177.0.0.1", "127.0.0.0/8"],
    ["3232235777", "192.168.0.0/16"],
    ["0xc0a80101", "192.168.0.0/16"],
    ["010.0.0.1", "10.0.0.0/8"],
    ["localhost", "127.0.0.0/8"],
    ["printer.localhost", "127.0.0.0/8"],
    // As the API server hands it over: `URL.host`, with the port.
    ["192.168.1.1:8080", "192.168.0.0/16"],
    ["[::1]:3000", "::1/128"],
  ];

  test("every private and special range is refused, by name of the range and of the setting", () => {
    for (const [host, range] of refused) {
      const decision = egressDecision(blocked, host, 443);
      expect({ host, allowed: decision.allowed }).toEqual({
        host,
        allowed: false,
      });
      expect({ host, range: decision.privateNetwork?.range }).toEqual({
        host,
        range,
      });
      expect(decision.reason).toContain("Home and office network access");
    }
  });

  test("the sentence says what the address is", () => {
    expect(egressDecision(blocked, "192.168.1.1", 443).reason).toBe(
      '192.168.1.1 is a private network address (192.168.0.0/16). A Bot\'s computer may not reach the home or office network unless "Home and office network access" is switched on for its owner.',
    );
  });

  test("the internet is not touched: names, public addresses and the documentation ranges", () => {
    for (const host of [
      "example.com",
      "api.github.com",
      "host.docker.internal",
      "1.1.1.1",
      "8.8.8.8",
      "172.15.0.1",
      "172.32.0.1",
      "100.128.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "[2001:db8::1]",
      "[2606:4700:4700::1111]",
      "[::ffff:8.8.8.8]",
    ]) {
      expect({ host, ...egressDecision(blocked, host, 443) }).toMatchObject({
        host,
        allowed: true,
      });
    }
    // And the first address inside each range next to those, which is where the line is drawn.
    for (const host of [
      "172.16.0.1",
      "172.31.255.255",
      "100.64.0.1",
      "100.127.255.255",
    ]) {
      expect({ host, ...egressDecision(blocked, host, 443) }).toMatchObject({
        host,
        allowed: false,
      });
    }
  });

  test("a name is judged by what it resolved to, and every address must pass", () => {
    for (const resolved of [
      ["127.0.0.1"],
      ["10.0.0.5"],
      ["192.168.1.20"],
      ["172.16.9.9"],
      ["100.64.1.1"],
      ["::1"],
      ["fd00::1"],
      ["::ffff:10.0.0.1"],
      ["203.0.113.9", "10.0.0.5"],
      ["10.0.0.5", "203.0.113.9"],
    ]) {
      const decision = egressDecision(
        blocked,
        "nas.example.test",
        443,
        resolved,
      );
      expect({ resolved, allowed: decision.allowed }).toEqual({
        resolved,
        allowed: false,
      });
      expect(decision.reason).toContain("nas.example.test, which resolves to ");
    }
    expect(
      egressDecision(blocked, "nas.example.test", 443, [
        "203.0.113.9",
        "8.8.8.8",
      ]).allowed,
    ).toBe(true);
    expect(
      egressDecision(blocked, "nas.example.test", 443, ["192.168.1.20"]).reason,
    ).toBe(
      'nas.example.test, which resolves to 192.168.1.20, is a private network address (192.168.0.0/16). A Bot\'s computer may not reach the home or office network unless "Home and office network access" is switched on for its owner.',
    );
  });

  test("the person's switch lets all of that through", () => {
    // Without it, the same destinations are refused, so what changes below is the switch and nothing else.
    for (const [host] of refused) {
      expect({ host, ...egressDecision(blocked, host, 443) }).toMatchObject({
        host,
        allowed: false,
      });
    }
    for (const [host] of refused) {
      // Metadata and link-local are not in this list, and are not lifted by it (below).
      expect({ host, ...egressDecision(switchedOn, host, 443) }).toMatchObject({
        host,
        allowed: true,
      });
    }
    expect(
      egressDecision(switchedOn, "nas.example.test", 443, ["192.168.1.20"])
        .allowed,
    ).toBe(true);
  });

  const metadata = [
    "169.254.169.254",
    "169.254.0.1",
    "100.100.100.200",
    "[fd00:ec2::254]",
    "[fd20:ce::254]",
    "[fe80::1]",
    "[::ffff:169.254.169.254]",
    "[::ffff:a9fe:a9fe]",
    "[64:ff9b::a9fe:a9fe]",
    // The same address written as a number: `connect()` reaches 169.254.169.254 for each.
    "2852039166",
    "0xa9fea9fe",
    "0251.0376.0251.0376",
    "169.254.43518",
    // And with a leading zero read as decimal, which some tools do.
    "0169.0254.0169.0254",
  ];

  test("metadata and link-local are refused under every policy, the switch included", () => {
    for (const host of metadata) {
      for (const policy of [blocked, switchedOn]) {
        const decision = egressDecision(policy, host, 80);
        expect({ host, allowed: decision.allowed }).toEqual({
          host,
          allowed: false,
        });
        expect(decision.reason).toContain("metadata or link-local");
        expect(decision.privateNetwork).toBeUndefined();
      }
    }
    for (const policy of [blocked, switchedOn]) {
      expect(
        egressDecision(policy, "metadata.example.test", 80, ["169.254.169.254"])
          .allowed,
      ).toBe(false);
    }
  });

  test("a number that is an address is read as one by the metadata guard too", () => {
    for (const host of ["2852039166", "0xa9fea9fe", "169.254.43518"]) {
      expect({ host, denied: isAlwaysDenied(host) }).toEqual({
        host,
        denied: true,
      });
    }
    for (const host of ["8.8.8.8", "3232235777", "example.com", "1e100.net"]) {
      expect({ host, denied: isAlwaysDenied(host) }).toEqual({
        host,
        denied: false,
      });
    }
  });

  test("the other modes keep deciding by the administrator's own rules", () => {
    // allow_all is the one mode this is about: there, the switch is what decides.
    expect(
      egressDecision(blocked, "192.168.1.1", 443).privateNetwork,
    ).toMatchObject({ range: "192.168.0.0/16" });
    // deny_all: nothing, with or without the switch.
    for (const policy of [
      { mode: "deny_all", rules: [] },
      { mode: "deny_all", rules: [], allowPrivateNetwork: true },
    ] as EgressPolicy[]) {
      const decision = egressDecision(policy, "192.168.1.1", 443);
      expect(decision.allowed).toBe(false);
      expect(decision.privateNetwork).toBeUndefined();
      expect(decision.reason).toContain("turned off");
    }
    // allowlist_only: a range the administrator wrote out is their explicit permission. One they did
    // not is refused, and by the allowlist rather than by this switch, which has no say here.
    const range: EgressPolicy = {
      mode: "allowlist_only",
      rules: [{ type: "cidr", value: "10.0.0.0/8", ports: "443" }],
    };
    expect(egressDecision(range, "10.1.2.3", 443).allowed).toBe(true);
    for (const policy of [range, { ...range, allowPrivateNetwork: true }]) {
      const refusedByList = egressDecision(policy, "192.168.1.1", 443);
      expect(refusedByList.allowed).toBe(false);
      expect(refusedByList.privateNetwork).toBeUndefined();
      expect(refusedByList.reason).toContain("allowlist");
    }
    // A domain rule is the administrator's too: it allows the name. Pinned because it is a choice
    // (docs/M1_PLAN.md D36): a name they listed that resolves inside the network is theirs to answer for.
    const domain: EgressPolicy = {
      mode: "defaults_plus_allowlist",
      rules: [{ type: "domain", value: "intranet.corp.test" }],
    };
    expect(
      egressDecision(domain, "intranet.corp.test", 443, ["10.1.2.3"]).allowed,
    ).toBe(true);
  });
});

describe("the policy a computer is pushed", () => {
  afterEach(async () => {
    await stopEgressFilter();
  });

  test("carries the switch only when it is on, and reads back exactly as it was sent", () => {
    const off = parseEgressPolicy({ mode: "allow_all", rules: [] });
    expect(off).toStrictEqual({
      ok: true,
      policy: { mode: "allow_all", rules: [] },
    });
    expect(
      parseEgressPolicy({
        mode: "allow_all",
        rules: [],
        allowPrivateNetwork: false,
      }),
    ).toStrictEqual({ ok: true, policy: { mode: "allow_all", rules: [] } });
    expect(
      parseEgressPolicy({
        mode: "allow_all",
        rules: [],
        allowPrivateNetwork: true,
      }),
    ).toStrictEqual({
      ok: true,
      policy: { mode: "allow_all", rules: [], allowPrivateNetwork: true },
    });
  });

  test("refuses a switch that is not a boolean, rather than guessing what was meant", () => {
    for (const value of ["true", "yes", 1, 0, null, {}, []]) {
      const parsed = parseEgressPolicy({
        mode: "allow_all",
        rules: [],
        allowPrivateNetwork: value,
      });
      expect({ value, ok: parsed.ok }).toEqual({ value, ok: false });
      if (!parsed.ok) expect(parsed.error).toContain("allowPrivateNetwork");
    }
  });

  test("PUT /egress-policy answers with it, and a bad one is a 400 that changes nothing", async () => {
    setEgressPolicy(BOT, blocked);
    const put = (policy: unknown) =>
      handleEgressPolicyRequest(
        BOT,
        new Request("http://computer/egress-policy", {
          method: "PUT",
          body: JSON.stringify({ policy }),
        }),
      );
    const bad = await put({
      mode: "allow_all",
      rules: [],
      allowPrivateNetwork: "yes",
    });
    expect(bad.status).toBe(400);
    expect(egressPolicyFor(BOT)).toEqual(blocked);
    const good = await put({
      mode: "allow_all",
      rules: [],
      allowPrivateNetwork: true,
    });
    expect((await good.json()).policy).toEqual(switchedOn);
    expect(egressPolicyFor(BOT)).toEqual(switchedOn);
  });
});

/* ------------------------------ the filter over real sockets ------------------------------ */

type Origin = {
  port: number;
  reached: () => number;
  close: () => Promise<void>;
};

/** A server on this machine that counts the connections it is given and answers `reached` to a request. */
async function origin(): Promise<Origin> {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.on("error", () => undefined);
    socket.on("data", () => {
      socket.end(
        "HTTP/1.1 200 OK\r\ncontent-length: 7\r\nconnection: close\r\n\r\nreached",
      );
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    reached: () => connections,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function authFor(): string {
  const secret = egressFor(BOT, {})?.password;
  return `Proxy-Authorization: Basic ${Buffer.from(`${BOT}:${secret}`).toString("base64")}\r\n`;
}

/** Send raw bytes to the filter and read what comes back, until it closes or a tunnel opens. */
function exchange(filterPort: number, payload: string, anonymous = false) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(filterPort, "127.0.0.1", () => {
      socket.write(
        payload.replace("\r\n\r\n", `\r\n${anonymous ? "" : authFor()}\r\n`),
      );
    });
    let seen = "";
    const finish = () => {
      socket.destroy();
      resolve(seen);
    };
    socket.setTimeout(4_000, finish);
    socket.on("data", (chunk) => {
      seen += chunk.toString();
      if (seen.includes("200 Connection Established\r\n\r\n")) finish();
    });
    socket.on("end", finish);
    socket.on("error", reject);
  });
}

const tunnel = (filterPort: number, target: string, anonymous = false) =>
  exchange(
    filterPort,
    `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`,
    anonymous,
  );

const fetchVia = (filterPort: number, authority: string, path = "/") =>
  exchange(
    filterPort,
    `GET http://${authority}${path} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`,
  );

const status = (answer: string) => answer.split("\r\n")[0] ?? "";

describe("the filter makes the connection itself", () => {
  afterEach(async () => {
    await stopEgressFilter();
    setEgressResolver(null);
  });

  // Every way of naming this machine's loopback, as a browser or a shell could write it.
  const loopback = (port: number) => [
    `127.0.0.1:${port}`,
    `2130706433:${port}`,
    `0x7f000001:${port}`,
    `0x7f.1:${port}`,
    `127.1:${port}`,
    `0177.0.0.1:${port}`,
    `[::ffff:127.0.0.1]:${port}`,
    `[::ffff:7f00:1]:${port}`,
    `localhost:${port}`,
    `foo.localhost:${port}`,
    `0.0.0.0:${port}`,
    `0:${port}`,
  ];

  test("loopback in every spelling is refused by CONNECT and by plain request, and never connected to", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    setEgressPolicy(BOT, blocked);
    try {
      for (const authority of loopback(target.port)) {
        const tunnelled = await tunnel(filter.port, authority);
        expect({ authority, status: status(tunnelled) }).toEqual({
          authority,
          status: "HTTP/1.1 403 Forbidden",
        });
        expect(tunnelled).toContain("x-openbot-egress: refused");
        const plain = await fetchVia(filter.port, authority);
        expect({ authority, status: status(plain) }).toEqual({
          authority,
          status: "HTTP/1.1 403 Forbidden",
        });
        expect(plain).toContain("x-openbot-egress: refused");
      }
      // The reason a Bot reads names the setting. (`foo.localhost` does not resolve here, so it is
      // refused for that; the others are refused for being what they are.)
      const reason = await tunnel(filter.port, `127.0.0.1:${target.port}`);
      expect(reason).toContain("127.0.0.1 is a loopback address (127.0.0.0/8)");
      expect(reason).toContain("Home and office network access");
      expect(target.reached()).toBe(0);
    } finally {
      await target.close();
    }
  });

  test("a name that resolves to a private address is refused, whatever the answer", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    setEgressPolicy(BOT, blocked);
    let answer: string[] = [];
    setEgressResolver(async () => answer);
    try {
      for (answer of [
        ["127.0.0.1"],
        ["10.0.0.5"],
        ["192.168.1.20"],
        ["172.16.9.9"],
        ["100.64.1.1"],
        ["::1"],
        ["fd00::1"],
        ["::ffff:10.0.0.1"],
        ["127.0.0.1", "203.0.113.9"],
        ["203.0.113.9", "127.0.0.1"],
      ]) {
        const tunnelled = await tunnel(
          filter.port,
          `rebind.example.test:${target.port}`,
        );
        expect({ answer, status: status(tunnelled) }).toEqual({
          answer,
          status: "HTTP/1.1 403 Forbidden",
        });
        expect(tunnelled).toContain("rebind.example.test, which resolves to ");
        const plain = await fetchVia(
          filter.port,
          `rebind.example.test:${target.port}`,
        );
        expect(status(plain)).toBe("HTTP/1.1 403 Forbidden");
      }
      // Nothing was connected to, not even the public address that came first in one answer.
      expect(target.reached()).toBe(0);
    } finally {
      await target.close();
    }
  });

  test("a name is looked up again for every connection, so an answer that changes is caught", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    setEgressPolicy(BOT, blocked);
    const answers = [["10.0.0.5"], ["192.168.1.20"], ["127.0.0.1"]];
    let lookups = 0;
    setEgressResolver(async () => answers[lookups++] ?? []);
    try {
      for (const expected of ["10.0.0.5", "192.168.1.20", "127.0.0.1"]) {
        const refusedNow = await tunnel(
          filter.port,
          `rebind.example.test:${target.port}`,
        );
        expect(status(refusedNow)).toBe("HTTP/1.1 403 Forbidden");
        expect(refusedNow).toContain(`resolves to ${expected}`);
      }
      expect(lookups).toBe(3);
      expect(target.reached()).toBe(0);
    } finally {
      await target.close();
    }
  });

  test("the person's switch lets the same destinations through, and the next connection sees it", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    setEgressPolicy(BOT, blocked);
    const reachable = [
      `127.0.0.1:${target.port}`,
      `2130706433:${target.port}`,
      `0x7f.1:${target.port}`,
      `127.1:${target.port}`,
      `0177.0.0.1:${target.port}`,
      `localhost:${target.port}`,
    ];
    try {
      for (const authority of reachable) {
        expect(status(await tunnel(filter.port, authority))).toBe(
          "HTTP/1.1 403 Forbidden",
        );
      }
      expect(target.reached()).toBe(0);

      // Pushed to the running computer, as the API server does it.
      const pushed = await handleEgressPolicyRequest(
        BOT,
        new Request("http://computer/egress-policy", {
          method: "PUT",
          body: JSON.stringify({ policy: switchedOn }),
        }),
      );
      expect(pushed.status).toBe(200);
      for (const authority of reachable) {
        expect({
          authority,
          status: status(await tunnel(filter.port, authority)),
        }).toEqual({
          authority,
          status: "HTTP/1.1 200 Connection Established",
        });
        expect(await fetchVia(filter.port, authority)).toContain("reached");
      }
      expect(target.reached()).toBeGreaterThanOrEqual(reachable.length * 2);

      // And off again: the very next connection is refused.
      setEgressPolicy(BOT, blocked);
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`)),
      ).toBe("HTTP/1.1 403 Forbidden");
    } finally {
      await target.close();
    }
  });

  test("with the switch on, the address that was checked is the address connected to", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    // Off, the same name is refused: it resolves to this machine, which is inside the network.
    setEgressPolicy(BOT, blocked);
    setEgressResolver(async () => ["127.0.0.1"]);
    expect(
      status(await fetchVia(filter.port, `nas.example.test:${target.port}`)),
    ).toBe("HTTP/1.1 403 Forbidden");
    expect(target.reached()).toBe(0);
    setEgressPolicy(BOT, switchedOn);
    let lookups = 0;
    // Answers once. A connection made by name would ask again, and find nothing.
    setEgressResolver(async (host) => {
      lookups += 1;
      if (lookups > 1) throw new Error(`asked again for ${host}`);
      return ["127.0.0.1"];
    });
    try {
      expect(
        await fetchVia(filter.port, `nas.example.test:${target.port}`),
      ).toContain("reached");
      expect(lookups).toBe(1);
    } finally {
      await target.close();
    }
  });

  test("metadata is refused with the switch on, in every spelling and by name", async () => {
    const filter = await startEgressFilter({ env: {} });
    setEgressPolicy(BOT, switchedOn);
    setEgressResolver(async (host) =>
      host === "metadata.example.test" ? ["169.254.169.254"] : [],
    );
    for (const authority of [
      "169.254.169.254:80",
      "100.100.100.200:80",
      "[fd00:ec2::254]:80",
      "[::ffff:169.254.169.254]:80",
      "[::ffff:a9fe:a9fe]:80",
      "[fe80::1]:80",
      "2852039166:80",
      "0xa9fea9fe:80",
      "0251.0376.0251.0376:80",
      "169.254.43518:80",
      "metadata.example.test:80",
    ]) {
      const tunnelled = await tunnel(filter.port, authority);
      expect({ authority, status: status(tunnelled) }).toEqual({
        authority,
        status: "HTTP/1.1 403 Forbidden",
      });
      expect(tunnelled).toContain("metadata or link-local");
      expect(tunnelled).not.toContain("Home and office network access");
      const plain = await fetchVia(filter.port, authority);
      expect(status(plain)).toBe("HTTP/1.1 403 Forbidden");
    }
  });

  test("a policy from an API server that has never heard of the switch is a block", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    try {
      const pushed = await handleEgressPolicyRequest(
        BOT,
        new Request("http://computer/egress-policy", {
          method: "PUT",
          body: JSON.stringify({ policy: { mode: "allow_all", rules: [] } }),
        }),
      );
      expect(pushed.status).toBe(200);
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`)),
      ).toBe("HTTP/1.1 403 Forbidden");
      expect(target.reached()).toBe(0);
    } finally {
      await target.close();
    }
  });

  test("a shell connection is judged by every policy on the computer, so one that does not allow it refuses it", async () => {
    const target = await origin();
    const filter = await startEgressFilter({ env: {} });
    setEgressPolicy("a", switchedOn);
    setEgressPolicy("b", blocked);
    try {
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`, true)),
      ).toBe("HTTP/1.1 403 Forbidden");
      setEgressPolicy("b", switchedOn);
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`, true)),
      ).toBe("HTTP/1.1 200 Connection Established");
    } finally {
      await target.close();
    }
  });

  test("a computer with no API server, pushed nothing, keeps what it always did; the first policy brings the block", async () => {
    const target = await origin();
    const filter = await startEgressFilter({
      env: { EGRESS_POLICY_REQUIRED: "0" },
    });
    try {
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`)),
      ).toBe("HTTP/1.1 200 Connection Established");
      // Still never the metadata addresses.
      expect(status(await tunnel(filter.port, "169.254.169.254:80"))).toBe(
        "HTTP/1.1 403 Forbidden",
      );
      setEgressPolicy(BOT, blocked);
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`)),
      ).toBe("HTTP/1.1 403 Forbidden");
      setEgressPolicy(BOT, switchedOn);
      expect(
        status(await tunnel(filter.port, `127.0.0.1:${target.port}`)),
      ).toBe("HTTP/1.1 200 Connection Established");
    } finally {
      await target.close();
    }
  });
});

/* ------------------------------- the filter in front of a proxy ------------------------------- */

type Gateway = {
  port: number;
  seen: { method: string; target: string }[];
  redirectTo: { location: string };
  close: () => Promise<void>;
};

/** An upstream proxy that records what it is asked, redirects `/redirect`, and tunnels every CONNECT to nowhere. */
async function gateway(): Promise<Gateway> {
  const seen: Gateway["seen"] = [];
  const redirectTo = { location: "http://192.168.1.1/admin" };
  const server = createHttpServer((request, response) => {
    seen.push({ method: request.method ?? "", target: request.url ?? "" });
    if ((request.url ?? "").endsWith("/redirect")) {
      response.writeHead(302, { location: redirectTo.location }).end();
      return;
    }
    response.end(`gateway answered ${request.url}`);
  });
  server.on("connect", (request: IncomingMessage, client: Socket) => {
    seen.push({ method: "CONNECT", target: request.url ?? "" });
    client.end("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    seen,
    redirectTo,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const locationOf = (answer: string): string =>
  /^location: (.+)$/im.exec(answer)?.[1]?.trim() ?? "";

describe("the filter in front of an upstream proxy", () => {
  afterEach(async () => {
    await stopEgressFilter();
    setEgressResolver(null);
  });

  test("a literal private address, in any spelling, is refused before the proxy is asked", async () => {
    const upstream = await gateway();
    const filter = await startEgressFilter({
      env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${upstream.port}` },
    });
    setEgressPolicy(BOT, blocked);
    try {
      for (const authority of [
        "192.168.1.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
        "100.64.0.1:80",
        "127.0.0.1:80",
        "2130706433:80",
        "0x7f.1:80",
        "0177.0.0.1:80",
        "3232235777:80",
        "localhost:80",
        "0.0.0.0:80",
        "224.0.0.1:80",
        "255.255.255.255:80",
        "[::1]:80",
        "[fd00::1]:80",
        "[::ffff:10.0.0.1]:80",
        "[::ffff:a00:1]:80",
        "[64:ff9b::a00:1]:80",
      ]) {
        const tunnelled = await tunnel(filter.port, authority);
        expect({ authority, status: status(tunnelled) }).toEqual({
          authority,
          status: "HTTP/1.1 403 Forbidden",
        });
        expect(tunnelled).toContain("Home and office network access");
        expect(status(await fetchVia(filter.port, authority))).toBe(
          "HTTP/1.1 403 Forbidden",
        );
      }
      // A leading zero is read both ways in a CONNECT, whose authority is passed on as written: octal
      // says 8.0.0.1, decimal says 10.0.0.1, and either being inside the network is enough. A plain
      // request is not asked this: its URL is rewritten as the URL parser reads it (`8.0.0.1`), and
      // what is judged is what is forwarded.
      expect(status(await tunnel(filter.port, "010.0.0.1:80"))).toBe(
        "HTTP/1.1 403 Forbidden",
      );
      expect(upstream.seen).toEqual([]);
    } finally {
      await upstream.close();
    }
  });

  test("a metadata address written as a number never reaches the proxy, switch on or off", async () => {
    const upstream = await gateway();
    const filter = await startEgressFilter({
      env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${upstream.port}` },
    });
    try {
      for (const policy of [blocked, switchedOn]) {
        setEgressPolicy(BOT, policy);
        for (const authority of [
          "2852039166:80",
          "0xa9fea9fe:80",
          "169.254.43518:80",
          "0251.0376.0251.0376:80",
        ]) {
          expect(status(await tunnel(filter.port, authority))).toBe(
            "HTTP/1.1 403 Forbidden",
          );
          expect(status(await fetchVia(filter.port, authority))).toBe(
            "HTTP/1.1 403 Forbidden",
          );
        }
      }
      expect(upstream.seen).toEqual([]);
    } finally {
      await upstream.close();
    }
  });

  test("a name goes to the proxy, which resolves it: the filter does not pretend to see where it leads", async () => {
    const upstream = await gateway();
    const filter = await startEgressFilter({
      env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${upstream.port}` },
    });
    setEgressPolicy(BOT, blocked);
    try {
      expect(await fetchVia(filter.port, "site.example.test")).toContain(
        "gateway answered http://site.example.test/",
      );
      expect(status(await tunnel(filter.port, "site.example.test:443"))).toBe(
        "HTTP/1.1 200 Connection Established",
      );
      expect(upstream.seen).toEqual([
        { method: "GET", target: "http://site.example.test/" },
        { method: "CONNECT", target: "site.example.test:443" },
      ]);
      // A literal in the same place is something the filter can read, and it does not ask the proxy.
      expect(status(await fetchVia(filter.port, "192.168.1.1"))).toBe(
        "HTTP/1.1 403 Forbidden",
      );
      expect(upstream.seen).toHaveLength(2);
    } finally {
      await upstream.close();
    }
  });

  test("a redirect to a private address is a new connection, and the filter refuses it", async () => {
    const upstream = await gateway();
    const filter = await startEgressFilter({
      env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${upstream.port}` },
    });
    setEgressPolicy(BOT, blocked);
    try {
      for (const location of [
        "http://192.168.1.1/admin",
        "http://10.0.0.1:8080/",
        "http://127.0.0.1:4100/",
        "http://2130706433/",
        "http://[::1]/",
        "http://[::ffff:192.168.1.1]/",
        "http://169.254.169.254/latest/meta-data/",
      ]) {
        upstream.seen.length = 0;
        upstream.redirectTo.location = location;
        // The first hop is a public name and is allowed. The client reads where it is sent next...
        const first = await fetchVia(
          filter.port,
          "site.example.test",
          "/redirect",
        );
        expect(status(first)).toBe("HTTP/1.1 302 Found");
        expect(locationOf(first)).toBe(location);
        // ...and asks the filter for that, which is a connection like any other.
        const url = new URL(location);
        const second = await fetchVia(
          filter.port,
          url.host,
          `${url.pathname}${url.search}`,
        );
        expect({ location, status: status(second) }).toEqual({
          location,
          status: "HTTP/1.1 403 Forbidden",
        });
        expect(upstream.seen).toEqual([
          { method: "GET", target: "http://site.example.test/redirect" },
        ]);
      }
    } finally {
      await upstream.close();
    }
  });

  test("with the switch on a redirect inside the network is followed, and one to metadata is not", async () => {
    const upstream = await gateway();
    const filter = await startEgressFilter({
      env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${upstream.port}` },
    });
    setEgressPolicy(BOT, blocked);
    try {
      upstream.redirectTo.location = "http://192.168.1.1/admin";
      // Off, the redirect's target is refused, and the proxy is never asked for it.
      await fetchVia(filter.port, "site.example.test", "/redirect");
      expect(status(await fetchVia(filter.port, "192.168.1.1", "/admin"))).toBe(
        "HTTP/1.1 403 Forbidden",
      );
      expect(upstream.seen).toHaveLength(1);
      upstream.seen.length = 0;

      setEgressPolicy(BOT, switchedOn);
      const first = await fetchVia(
        filter.port,
        "site.example.test",
        "/redirect",
      );
      expect(locationOf(first)).toBe("http://192.168.1.1/admin");
      expect(await fetchVia(filter.port, "192.168.1.1", "/admin")).toContain(
        "gateway answered http://192.168.1.1/admin",
      );

      upstream.seen.length = 0;
      expect(
        status(
          await fetchVia(filter.port, "169.254.169.254", "/latest/meta-data/"),
        ),
      ).toBe("HTTP/1.1 403 Forbidden");
      expect(upstream.seen).toEqual([]);
    } finally {
      await upstream.close();
    }
  });
});

/* ------------------------------------ the computer's own callers ------------------------------------ */

describe("what the computer's own callers rely on is unchanged", () => {
  afterEach(async () => {
    await stopEgressFilter();
  });

  test("a shell still reaches its own loopback without asking the filter, and everything else asks", async () => {
    const filter = await startEgressFilter({ env: {}, forShell: true });
    const shell = egressShellEnvironment();
    // Loopback is not the network: these never reach the filter, so the block cannot touch them.
    expect(shell.NO_PROXY).toBe("127.0.0.1,localhost,::1");
    expect(shell.no_proxy).toBe("127.0.0.1,localhost,::1");
    // Everything else is asked, which is where `127.0.0.2`, `0.0.0.0` and the private ranges are stopped.
    expect(shell.HTTP_PROXY).toBe(filter.url);
    expect(shell.HTTPS_PROXY).toBe(filter.url);
    expect(Object.keys(shell).sort()).toEqual([
      "HTTPS_PROXY",
      "HTTP_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "no_proxy",
    ]);
    for (const host of ["127.0.0.2", "0.0.0.0", "192.168.1.1", "10.0.0.1"]) {
      expect({
        host,
        allowed: egressDecision(blocked, host, 80).allowed,
      }).toEqual({ host, allowed: false });
    }
  });

  test("the computer's own environment never names the filter, so its own calls are not judged by it", async () => {
    const names = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "http_proxy",
      "https_proxy",
      "ALL_PROXY",
      "all_proxy",
      "NO_PROXY",
      "no_proxy",
    ];
    const before = names.map((name) => process.env[name]);
    await startEgressFilter({ env: {}, forShell: true });
    egressShellEnvironment();
    // Starting the filter for a shell changes nothing about this process: Bun's own `fetch` and
    // `http.request` follow these variables, and the filter must not be in the path of the
    // computer's own traffic (the API server's calls in are inbound, and it makes none out).
    expect(names.map((name) => process.env[name])).toEqual(before);
    // What the filter does judge, a Bot's browser and its shell, now stops at the home network.
    expect(egressDecision(blocked, "192.168.1.1", 80).allowed).toBe(false);
  });
});
