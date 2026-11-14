/**
 * A caller on this machine's loopback is answered only under this machine's own names
 * (src/host-guard.ts, docs/M1_PLAN.md D40).
 *
 * THE HOLE these tests stand for: the computer's one gate is the token, the token has a public
 * development default, and nothing read `Host`, so a page whose name was re-pointed at 127.0.0.1 sent
 * the token itself and read the answer of `/exec`. The decisions are asked here of the guard alone,
 * with a stand-in for the server that accepted the connection; `host-guard-http.test.ts` asks the real
 * process, over sockets, with the shell behind it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allowedHostsFrom,
  createHostGuard,
  hostnameOf,
  isLoopbackPeer,
} from "../src/host-guard";

const peer = (address: string) => ({ requestIP: () => ({ address }) });

/** A request under one Host, as `Request` lets one be written: no Host at all is `null`. */
function request(host: string | null) {
  return new Request(
    "http://localhost:4100/exec",
    host === null ? {} : { headers: { host } },
  );
}

describe("reading a Host header", () => {
  test("host and port, the way a browser reads a URL's host", () => {
    expect(hostnameOf("localhost:4100")).toBe("localhost");
    expect(hostnameOf("localhost")).toBe("localhost");
    expect(hostnameOf("Example.COM:8080")).toBe("example.com");
    expect(hostnameOf("127.0.0.1:4100")).toBe("127.0.0.1");
    expect(hostnameOf("[::1]:4100")).toBe("[::1]");
  });

  test("upper case is the same name, and one trailing dot is the name written out in full", () => {
    expect(hostnameOf("LOCALHOST:4100")).toBe("localhost");
    expect(hostnameOf("LocalHost.:4100")).toBe("localhost");
    expect(hostnameOf("localhost..:4100")).toBe("localhost.");
  });

  test("an address is read in its one canonical spelling, IPv6 forms included", () => {
    expect(hostnameOf("[0:0:0:0:0:0:0:1]:4100")).toBe("[::1]");
    expect(hostnameOf("[0000:0000:0000:0000:0000:0000:0000:0001]")).toBe(
      "[::1]",
    );
    expect(hostnameOf("[::FFFF:127.0.0.1]")).toBe("[::ffff:7f00:1]");
    expect(hostnameOf("127.1")).toBe("127.0.0.1");
    expect(hostnameOf("2130706433")).toBe("127.0.0.1");
    expect(hostnameOf("3232235777")).toBe("192.168.1.1");
  });

  test("anything that is not one host and an optional port is nothing", () => {
    for (const header of [
      null,
      "",
      " ",
      "localhost:",
      "localhost:4100:4100",
      "localhost:65536",
      "localhost:99999999",
      "localhost:-1",
      "a@localhost",
      "localhost@evil.example",
      "evil.example@localhost:4100",
      "localhost:4100@evil.example",
      "localhost/",
      "localhost:4100/x",
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
      "localhost:4100, evil.example:4100",
      "[::1",
      "::1",
      "[::1]x",
      "[::1].",
      "[zz]:4100",
      "http://localhost",
      "ｌｏｃａｌｈｏｓｔ",
    ])
      expect(hostnameOf(header)).toBeNull();
  });
});

describe("which peers are loopback", () => {
  test("127.0.0.0/8, ::1 and an IPv4-mapped loopback", () => {
    for (const address of [
      "127.0.0.1",
      "127.8.9.10",
      "::1",
      "::ffff:127.0.0.1",
    ])
      expect(isLoopbackPeer(address)).toBeTrue();
  });

  test("a bridge, a LAN, a public address, nothing and nonsense are not", () => {
    for (const address of [
      "172.17.0.1",
      "192.168.1.10",
      "10.0.0.5",
      "8.8.8.8",
      "::ffff:172.17.0.1",
      "fe80::1",
      "0.0.0.0",
      "::",
      "",
      null,
      undefined,
      "localhost",
      "127.0.0.1.evil.example",
    ])
      expect(isLoopbackPeer(address)).toBeFalse();
  });
});

describe("which Hosts a loopback request may use", () => {
  const guard = createHostGuard();

  test("this machine, under every name it has: any port, any spelling", () => {
    for (const host of [
      "localhost:4100",
      "LOCALHOST:4100",
      "localhost.:4100",
      "localhost",
      "localhost:4101",
      "localhost:9",
      "127.0.0.1:4100",
      "127.0.0.1:55012",
      "127.1.2.3:4100",
      "127.1",
      "2130706433:4100",
      "[::1]:4100",
      "[0:0:0:0:0:0:0:1]:4100",
      "[::ffff:127.0.0.1]:4100",
      "host.docker.internal:4100",
      "HOST.DOCKER.INTERNAL:4100",
    ])
      expect(guard(request(host), peer("127.0.0.1"))).toBeNull();
  });

  test("every other name is refused with 421, and the answer says which setting to use", async () => {
    for (const host of [
      "evil.example:4100",
      "evil.example",
      "Evil.Example.:4100",
      "localhost.evil.example:4100",
      "127.0.0.1.evil.example:4100",
      "host.docker.internal.evil.example:4100",
      "evil.localhost:4100",
      "localhost..:4100",
      "0.0.0.0:4100",
      "[::]:4100",
      "10.0.0.5:4100",
      "192.168.1.10:4100",
      "3232235777:4100",
      "[2001:db8::1]:4100",
      "8.8.8.8",
      "agent-computer:4100",
      "localhost:4100@evil.example",
      "evil.example@localhost:4100",
      "localhost:70000",
      "localhost:",
      "localhost,evil.example",
    ]) {
      const refused = guard(request(host), peer("127.0.0.1"));
      expect(refused?.status).toBe(421);
    }
    const body = await guard(
      request("evil.example:4100"),
      peer("127.0.0.1"),
    )?.json();
    expect(body).toEqual({
      error: expect.stringContaining("COMPUTER_ALLOWED_HOSTS"),
    });
  });

  test("no Host at all is refused", () => {
    expect(guard(request(null), peer("127.0.0.1"))?.status).toBe(421);
  });

  test("a loopback peer in any of its spellings is held to it", () => {
    for (const address of [
      "127.0.0.1",
      "127.8.9.10",
      "::1",
      "::ffff:127.0.0.1",
    ])
      expect(guard(request("evil.example:4100"), peer(address))?.status).toBe(
        421,
      );
  });

  test("only a request from loopback is held to it: another container, a kubelet, and no readable peer are not", () => {
    for (const address of [
      "172.17.0.1",
      "172.18.0.5",
      "198.19.255.1",
      "192.168.1.10",
      "10.244.1.1",
      "::ffff:172.17.0.1",
    ]) {
      expect(guard(request("agent-computer:4100"), peer(address))).toBeNull();
      expect(guard(request("10.244.1.7:4100"), peer(address))).toBeNull();
      expect(guard(request("evil.example:4100"), peer(address))).toBeNull();
      expect(guard(request(null), peer(address))).toBeNull();
    }
    for (const server of [
      undefined,
      null,
      {},
      { requestIP: () => null },
      {
        requestIP: () => {
          throw new Error("socket closed");
        },
      },
    ])
      expect(guard(request("evil.example:4100"), server)).toBeNull();
  });
});

describe("a name the deployment configured", () => {
  const configured = allowedHostsFrom(
    "nas.local, Box.LOCAL.:4100 ,[fd00::5],192.168.1.10,",
  );

  test("is read in the spelling the rule compares, and a trailing comma is nothing", () => {
    expect(configured).toEqual({
      ok: true,
      hosts: ["nas.local", "box.local", "[fd00::5]", "192.168.1.10"],
    });
  });

  test("passes on any port, and nothing else does with it", () => {
    const guard = createHostGuard(
      configured.ok ? configured.hosts : ["not read"],
    );
    for (const host of [
      "nas.local:4100",
      "NAS.local.:4100",
      "nas.local:55012",
      "nas.local",
      "box.local",
      "[fd00::5]:4100",
      "192.168.1.10:4100",
      "localhost:4100",
    ])
      expect(guard(request(host), peer("127.0.0.1"))).toBeNull();
    for (const host of [
      "other.local:4100",
      "nas.local.evil.example:4100",
      "evil.example:4100",
      "192.168.1.11:4100",
      "nas.local@evil.example",
      "xnas.local",
    ])
      expect(guard(request(host), peer("127.0.0.1"))?.status).toBe(421);
  });

  test("unset, empty and blank mean no extra names", () => {
    for (const raw of [undefined, "", "  ", ",", " , ,"])
      expect(allowedHostsFrom(raw)).toEqual({ ok: true, hosts: [] });
  });

  test("an entry that is not a host name or an address is an error that names it, never skipped", () => {
    for (const entry of [
      "http://nas.local",
      "nas.local/x",
      "*.local",
      "nas local",
      "a@nas.local",
      "::1",
      "nas.local:99999",
      "nas.local:",
      "[zz]",
    ]) {
      const read = allowedHostsFrom(`ok.local,${entry}`);
      expect(read.ok).toBeFalse();
      if (!read.ok) {
        expect(read.reason).toContain("COMPUTER_ALLOWED_HOSTS");
        expect(read.reason).toContain(JSON.stringify(entry));
      }
    }
  });
});

describe("where the guard stands in the process", () => {
  const source = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
  // Without its comments, which name the calls they stand before.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const handler = code.slice(code.indexOf("async fetch(request, server) {"));

  test("before the URL is read, the token is checked, a route is chosen or a socket is upgraded", () => {
    const guard = handler.indexOf("hostGuard(request, server)");
    expect(guard).toBeGreaterThan(-1);
    for (const later of [
      "new URL(request.url)",
      "matchesToken(",
      "isOpenPath(",
      'url.pathname === "/exec"',
      "server.upgrade(",
    ]) {
      const at = handler.indexOf(later);
      expect(at).toBeGreaterThan(guard);
    }
  });

  test("its answer is returned as it is, and the guard is built from the setting that names hosts", () => {
    expect(handler).toContain("if (misdirected) return misdirected;");
    expect(code).toContain(
      "allowedHostsFrom(process.env.COMPUTER_ALLOWED_HOSTS)",
    );
  });
});
