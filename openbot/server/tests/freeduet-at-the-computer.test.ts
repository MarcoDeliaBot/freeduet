/**
 * "At the computer" (docs/design/engines-dashboard.md 6.8): the second lock on changing how the team's engines behave.
 *
 * An administrator may change the choices only from the computer FreeDuet runs on: the connection's own peer, read from
 * the socket and never from a header, is this machine's loopback, and no header a proxy, a tunnel or a load balancer adds
 * is on the request. It is the second lock and not the first: the sign-in (or the pairing of single-user mode) comes
 * before it on every `/api` route.
 */
import { describe, expect, test } from "bun:test";
import { isLoopbackPeer } from "../src/auth/peer";
import { atTheComputer } from "../src/freeduet/at-the-computer";
import { LOOPBACK_PEER } from "./support/loopback-peer";

function peerAt(address: string | null) {
  return { server: { requestIP: () => (address ? { address } : null) } };
}

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3001/api/freeduet/engines", {
    headers,
  });
}

describe("the connection's own peer", () => {
  test("this machine's loopback is the computer", () => {
    for (const address of ["127.0.0.1", "127.8.9.10", "::1"])
      expect(atTheComputer(peerAt(address), request())).toBe(true);
    expect(atTheComputer(LOOPBACK_PEER, request())).toBe(true);
  });

  test("any other address is not: the network, the Docker bridge, a public address, nothing at all", () => {
    for (const address of [
      "192.168.1.20",
      "10.0.0.5",
      "172.17.0.2",
      "100.101.102.103",
      "203.0.113.9",
      "8.8.8.8",
      "fe80::1",
      "2001:db8::1",
      "",
      "localhost",
      "not an address",
      null,
    ])
      expect(atTheComputer(peerAt(address), request())).toBe(false);
  });

  test("it agrees with the rule the sign-in already applies to the peer, for every address", () => {
    for (const address of [
      "127.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "192.168.0.1",
      "0.0.0.0",
      "255.255.255.255",
    ])
      expect(atTheComputer(peerAt(address), request())).toBe(
        isLoopbackPeer(address),
      );
  });

  test("a request made in-process has no peer and is nobody's, and a server that cannot say is not the computer", () => {
    expect(atTheComputer(undefined, request())).toBe(false);
    expect(atTheComputer(null, request())).toBe(false);
    expect(atTheComputer({}, request())).toBe(false);
    expect(atTheComputer({ server: {} }, request())).toBe(false);
    expect(
      atTheComputer(
        {
          server: {
            requestIP: () => {
              throw new Error("the socket is gone");
            },
          },
        },
        request(),
      ),
    ).toBe(false);
  });

  test("the peer is not read from a header: a request that says it is loopback is no more than that", () => {
    expect(
      atTheComputer(
        peerAt("203.0.113.9"),
        request({ host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" }),
      ),
    ).toBe(false);
  });
});

describe("what a proxy, a tunnel or a load balancer adds", () => {
  const INTERMEDIARY = [
    "Forwarded",
    "Via",
    "X-Real-IP",
    "X-Client-IP",
    "True-Client-IP",
    "X-Forwarded-For",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "X-Forwarded-Anything-Else",
    "CF-Connecting-IP",
    "CF-Ray",
    "Cf-Visitor",
    "Tailscale-User-Login",
    "Tailscale-User-Name",
    "Tailscale-Headers-Info",
  ];

  test("each one makes a loopback connection not the computer, whatever its value and however its name is spelled", () => {
    for (const name of INTERMEDIARY) {
      for (const spelled of [name, name.toLowerCase(), name.toUpperCase()])
        expect(
          atTheComputer(LOOPBACK_PEER, request({ [spelled]: "127.0.0.1" })),
        ).toBe(false);
    }
    expect(
      atTheComputer(LOOPBACK_PEER, request({ "X-Forwarded-For": "" })),
    ).toBe(false);
  });

  test("the headers a browser sends to this machine directly do not count against it", () => {
    expect(
      atTheComputer(
        LOOPBACK_PEER,
        request({
          Host: "localhost:3001",
          Origin: "http://localhost:3001",
          Referer: "http://localhost:3001/engines",
          Cookie: "session=abc",
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
          "Accept-Language": "it-IT",
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "cors",
          Authorization: "Bearer not-a-proxy-header",
          "X-Requested-With": "fetch",
          "Cache-Control": "no-cache",
        }),
      ),
    ).toBe(true);
  });
});
