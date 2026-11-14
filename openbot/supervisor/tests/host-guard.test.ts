/**
 * A caller on this machine's loopback is answered only under this machine's own names
 * (src/host-guard.ts, docs/M1_PLAN.md D40).
 *
 * THE HOLE these tests stand for: this process holds the Docker socket and its one gate is
 * `SUPERVISOR_TOKEN`, a token with a public development default, and nothing read `Host`. A page whose
 * name was re-pointed at 127.0.0.1 could send the token itself and reset a Bot's computer. The
 * decisions are asked here of the guard alone, with a stand-in for the server that accepted the
 * connection; `host-guard-http.test.ts` asks the real process, over sockets, with a fake Docker behind
 * it.
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
    "http://localhost:4300/computers",
    host === null ? {} : { headers: { host } },
  );
}

describe("reading a Host header", () => {
  test("host and port, the way a browser reads a URL's host", () => {
    expect(hostnameOf("localhost:4300")).toBe("localhost");
    expect(hostnameOf("localhost")).toBe("localhost");
    expect(hostnameOf("Example.COM:8080")).toBe("example.com");
    expect(hostnameOf("127.0.0.1:4300")).toBe("127.0.0.1");
    expect(hostnameOf("[::1]:4300")).toBe("[::1]");
  });

  test("upper case is the same name, and one trailing dot is the name written out in full", () => {
    expect(hostnameOf("LOCALHOST:4300")).toBe("localhost");
    expect(hostnameOf("LocalHost.:4300")).toBe("localhost");
    expect(hostnameOf("localhost..:4300")).toBe("localhost.");
  });

  test("an address is read in its one canonical spelling, IPv6 forms included", () => {
    expect(hostnameOf("[0:0:0:0:0:0:0:1]:4300")).toBe("[::1]");
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
      "localhost:4300:4300",
      "localhost:65536",
      "localhost:99999999",
      "localhost:-1",
      "a@localhost",
      "localhost@evil.example",
      "evil.example@localhost:4300",
      "localhost:4300@evil.example",
      "localhost/",
      "localhost:4300/x",
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
      "localhost:4300, evil.example:4300",
      "[::1",
      "::1",
      "[::1]x",
      "[::1].",
      "[zz]:4300",
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
      "localhost:4300",
      "LOCALHOST:4300",
      "localhost.:4300",
      "localhost",
      "localhost:4301",
      "localhost:9",
      "127.0.0.1:4300",
      "127.0.0.1:55012",
      "127.1.2.3:4300",
      "127.1",
      "2130706433:4300",
      "[::1]:4300",
      "[0:0:0:0:0:0:0:1]:4300",
      "[::ffff:127.0.0.1]:4300",
      "host.docker.internal:4300",
      "HOST.DOCKER.INTERNAL:4300",
    ])
      expect(guard(request(host), peer("127.0.0.1"))).toBeNull();
  });

  test("every other name is refused with 421, and the answer says which setting to use", async () => {
    for (const host of [
      "evil.example:4300",
      "evil.example",
      "Evil.Example.:4300",
      "localhost.evil.example:4300",
      "127.0.0.1.evil.example:4300",
      "host.docker.internal.evil.example:4300",
      "evil.localhost:4300",
      "localhost..:4300",
      "0.0.0.0:4300",
      "[::]:4300",
      "10.0.0.5:4300",
      "192.168.1.10:4300",
      "3232235777:4300",
      "[2001:db8::1]:4300",
      "8.8.8.8",
      "supervisor:4300",
      "localhost:4300@evil.example",
      "evil.example@localhost:4300",
      "localhost:70000",
      "localhost:",
      "localhost,evil.example",
    ]) {
      const refused = guard(request(host), peer("127.0.0.1"));
      expect(refused?.status).toBe(421);
    }
    const body = await guard(
      request("evil.example:4300"),
      peer("127.0.0.1"),
    )?.json();
    expect(body).toEqual({
      error: expect.stringContaining("SUPERVISOR_ALLOWED_HOSTS"),
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
      expect(guard(request("evil.example:4300"), peer(address))?.status).toBe(
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
      expect(guard(request("supervisor:4300"), peer(address))).toBeNull();
      expect(guard(request("10.244.1.7:4300"), peer(address))).toBeNull();
      expect(guard(request("evil.example:4300"), peer(address))).toBeNull();
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
      expect(guard(request("evil.example:4300"), server)).toBeNull();
  });
});

describe("a name the deployment configured", () => {
  const configured = allowedHostsFrom(
    "nas.local, Box.LOCAL.:4300 ,[fd00::5],192.168.1.10,",
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
      "nas.local:4300",
      "NAS.local.:4300",
      "nas.local:55012",
      "nas.local",
      "box.local",
      "[fd00::5]:4300",
      "192.168.1.10:4300",
      "localhost:4300",
    ])
      expect(guard(request(host), peer("127.0.0.1"))).toBeNull();
    for (const host of [
      "other.local:4300",
      "nas.local.evil.example:4300",
      "evil.example:4300",
      "192.168.1.11:4300",
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
        expect(read.reason).toContain("SUPERVISOR_ALLOWED_HOSTS");
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

  test("the one listener hands Hono only what passed the guard, so no route, token check or verb is reached first", () => {
    expect(code.match(/\bserve\(/g)).toHaveLength(1);
    expect(code.match(/\bapp\.fetch\b/g)).toHaveLength(1);
    expect(code).toMatch(
      /serve\(\{[^}]*fetch:\s*\(request, server\)\s*=>\s*hostGuard\(request, server\)\s*\?\?\s*app\.fetch\(request, server\)/,
    );
  });

  test("the guard is built from the setting that names hosts, and a bad one stops the boot", () => {
    expect(code).toContain(
      "allowedHostsFrom(process.env.SUPERVISOR_ALLOWED_HOSTS)",
    );
    expect(code).toMatch(
      /if \(!allowedHosts\.ok\) \{\s*console\.error\(allowedHosts\.reason\);\s*process\.exit\(1\);\s*\}/,
    );
    expect(code).toContain("createHostGuard(allowedHosts.hosts)");
  });
});
