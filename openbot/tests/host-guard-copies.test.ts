/**
 * The Host rule is carried in three places and answers the same in all of them
 * (docs/M1_PLAN.md D32 for the server, D40 for the computer and the supervisor).
 *
 * The server has it in `server/src/auth/host-guard.ts`. The computer and the supervisor are separate
 * packages whose images hold their own `src` and nothing else, so they cannot import it: each carries a
 * small copy (`agent-computer/src/host-guard.ts`, `supervisor/src/host-guard.ts`). A copy is only
 * safe while it stays a copy, and this is the test that notices when one stops being: it reads the
 * shared pieces as text and compares them, and it asks every one of the three the same few thousand
 * questions (a header, a peer, a configured name) and requires the same answers.
 *
 * What is allowed to differ is the wording of the 421, the setting that names extra hosts
 * (`TRUSTED_ORIGINS` for the server, `COMPUTER_ALLOWED_HOSTS` and `SUPERVISOR_ALLOWED_HOSTS` for the
 * others) and nothing else.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as computer from "../agent-computer/src/host-guard";
import * as server from "../server/src/auth/host-guard";
import { isLoopbackPeer as serverIsLoopbackPeer } from "../server/src/auth/peer";
import { loadConfig } from "../server/src/config";
import { testEnvironment } from "../server/tests/support/environment";
import * as supervisor from "../supervisor/src/host-guard";

const root = join(import.meta.dir, "..");
const text = (path: string) => readFileSync(join(root, path), "utf8");

const SERVER_GUARD = "server/src/auth/host-guard.ts";
const SERVER_PEER = "server/src/auth/peer.ts";
const COPIES = [
  "agent-computer/src/host-guard.ts",
  "supervisor/src/host-guard.ts",
];

/** Without comments, and with whitespace folded, so a re-wrapped line is not a difference. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One declaration of a file, from its first word to the end of its body or statement. */
function piece(source: string, start: RegExp, end: RegExp): string {
  const from = source.search(start);
  expect(from).toBeGreaterThan(-1);
  const rest = source.slice(from);
  const to = rest.search(end);
  expect(to).toBeGreaterThan(-1);
  return code(rest.slice(0, to + (end.exec(rest)?.[0].length ?? 0)));
}

describe("what the copies share is the same text", () => {
  const original = text(SERVER_GUARD);

  for (const path of COPIES) {
    const copy = text(path);

    test(`${path}: the names that are this machine, and the shape a Host header may have`, () => {
      for (const name of ["OWN_NAMES", "HOST_SHAPE"]) {
        const declaration = new RegExp(`const ${name} =[^;]*;`);
        expect(code(declaration.exec(copy)?.[0] ?? "")).toBe(
          code(declaration.exec(original)?.[0] ?? ""),
        );
        expect(declaration.exec(original)?.[0]).toBeString();
      }
    });

    test(`${path}: how a header is read, and when a name is a loopback address`, () => {
      expect(piece(copy, /export function hostnameOf/, /\n}\n/)).toBe(
        piece(original, /export function hostnameOf/, /\n}\n/),
      );
      expect(piece(copy, /function isLoopbackLiteral/, /\n}\n/)).toBe(
        piece(original, /function isLoopbackLiteral/, /\n}\n/),
      );
    });

    test(`${path}: which peers are loopback`, () => {
      const peer = text(SERVER_PEER);
      expect(piece(copy, /const LOOPBACK =/, /\n\n/)).toBe(
        piece(peer, /const LOOPBACK =/, /\n\n/),
      );
      expect(piece(copy, /export function isLoopbackPeer/, /\n}\n/)).toBe(
        piece(peer, /export function isLoopbackPeer/, /\n}\n/),
      );
    });

    test(`${path}: the decision itself, from the peer and the Host`, () => {
      const decision = (source: string) =>
        piece(source, /if \(\s*hostname !== null &&/, /Response\.json/);
      expect(decision(copy)).toBe(decision(original));
    });
  }
});

/** A stand-in for the server that accepted the connection, with the peer a test names. */
const from = (address: string | null) =>
  address === null ? {} : { requestIP: () => ({ address }) };

/**
 * A request that is only what a guard reads of it. `Request` itself refuses a header such as a leading
 * space or a full-width letter, which a hand-written socket can still send and the guard must answer.
 */
const request = (host: string | null) =>
  ({
    headers: { get: (name: string) => (name === "host" ? host : null) },
  }) as unknown as Request;

const HOSTS = [
  "localhost",
  "LOCALHOST",
  "LocalHost.",
  "localhost..",
  "127.0.0.1",
  "127.8.9.10",
  "127.1",
  "2130706433",
  "0x7f000001",
  "0177.0.0.1",
  "[::1]",
  "[0:0:0:0:0:0:0:1]",
  "[::ffff:127.0.0.1]",
  "[::ffff:7f00:1]",
  "host.docker.internal",
  "HOST.DOCKER.INTERNAL",
  "host.docker.internal.",
  "evil.example",
  "Evil.Example.",
  "localhost.evil.example",
  "127.0.0.1.evil.example",
  "evil.localhost",
  "nas.local",
  "NAS.LOCAL.",
  "nas.local.evil.example",
  "xnas.local",
  "192.168.1.10",
  "192.168.1.11",
  "3232235777",
  "10.0.0.5",
  "0.0.0.0",
  "[::]",
  "[fd00::5]",
  "[fd00::6]",
  "[2001:db8::1]",
  "supervisor",
  "agent-computer",
  "a@localhost",
  "localhost@evil.example",
  "evil.example@localhost",
  "localhost, evil.example",
  "localhost evil.example",
  " localhost",
  "localhost ",
  "localhost/",
  "localhost?x",
  "localhost#x",
  "localhost\\evil.example",
  "localhost%2f.evil.example",
  "[::1",
  "::1",
  "[::1]x",
  "[zz]",
  "http://localhost",
  "ｌｏｃａｌｈｏｓｔ",
  "",
].flatMap((name) => [
  name,
  `${name}:`,
  `${name}:0`,
  `${name}:80`,
  `${name}:4100`,
  `${name}:4300`,
  `${name}:3001`,
  `${name}:65535`,
  `${name}:65536`,
  `${name}:99999`,
  `${name}:100000`,
  `${name}:-1`,
  `${name}:4100:4100`,
]);

/** Every peer that matters: loopback in its spellings, a bridge, a LAN, a public address, and none. */
const PEERS = [
  "127.0.0.1",
  "127.8.9.10",
  "::1",
  "::ffff:127.0.0.1",
  "172.17.0.1",
  "172.18.0.5",
  "::ffff:172.17.0.1",
  "192.168.1.10",
  "10.244.1.1",
  "198.19.255.1",
  "8.8.8.8",
  "fe80::1",
  "0.0.0.0",
  "::",
  "localhost",
  "",
  null,
];

describe("the three answer every question the same", () => {
  /** The names a deployment configured, spelled as each one's own setting takes them. */
  const CONFIGURED = ["nas.local", "[fd00::5]", "192.168.1.10"];

  const guards = (() => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const environment = testEnvironment({
        OPENBOT_SINGLE_USER: "true",
        AGENT_TOOL_TOKEN: "deployment-wide-agent-token",
        WORKER_SHARED_SECRET: "worker-shared-secret-for-this-test",
        TRUSTED_ORIGINS: "http://nas.local:3010,http://[fd00::5]:3010",
        OPENBOT_APP_URL: "http://192.168.1.10:3010",
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        BETTER_AUTH_SECRET: undefined,
        BETTER_AUTH_URL: undefined,
        INITIAL_ADMIN_EMAILS: undefined,
      });
      return {
        server: server.createHostGuard(loadConfig(environment, {})),
        computer: computer.createHostGuard(CONFIGURED),
        supervisor: supervisor.createHostGuard(CONFIGURED),
      };
    } finally {
      warn.mockRestore();
    }
  })();

  /** What a guard does with one request: let it on, or the status it answers. */
  function decide(
    guard: (request: Request, server: unknown) => Response | null,
    host: string | null,
    peer: string | null,
  ): string {
    const answer = guard(request(host), from(peer));
    return answer === null ? "on" : String(answer.status);
  }

  test("the table is large enough to mean something", () => {
    expect(HOSTS.length).toBeGreaterThan(600);
    expect(PEERS.length).toBeGreaterThan(15);
  });

  test("the setting that names extra hosts reads the same names the server reads from its origins", () => {
    expect(computer.allowedHostsFrom(CONFIGURED.join(","))).toEqual({
      ok: true,
      hosts: ["nas.local", "[fd00::5]", "192.168.1.10"],
    });
    expect(supervisor.allowedHostsFrom(CONFIGURED.join(","))).toEqual({
      ok: true,
      hosts: ["nas.local", "[fd00::5]", "192.168.1.10"],
    });
  });

  test("reading a Host header", () => {
    const headers = [...HOSTS, null];
    const expected = headers.map((header) => server.hostnameOf(header));
    expect(headers.map((header) => computer.hostnameOf(header))).toEqual(
      expected,
    );
    expect(headers.map((header) => supervisor.hostnameOf(header))).toEqual(
      expected,
    );
    // A table that read nothing would agree with itself: some of these must read.
    expect(
      expected.filter((hostname) => hostname !== null).length,
    ).toBeGreaterThan(200);
    expect(
      expected.filter((hostname) => hostname === null).length,
    ).toBeGreaterThan(400);
  });

  test("which peers are loopback", () => {
    const expected = PEERS.map((peer) => serverIsLoopbackPeer(peer));
    expect(PEERS.map((peer) => computer.isLoopbackPeer(peer))).toEqual(
      expected,
    );
    expect(PEERS.map((peer) => supervisor.isLoopbackPeer(peer))).toEqual(
      expected,
    );
    expect(expected).toContain(true);
    expect(expected).toContain(false);
  });

  test("the decision, for every Host from every peer, with the same names configured", () => {
    const mismatches: string[] = [];
    let refused = 0;
    let passed = 0;
    for (const peer of PEERS) {
      for (const host of [...HOSTS, null]) {
        const answers = {
          server: decide(guards.server, host, peer),
          computer: decide(guards.computer, host, peer),
          supervisor: decide(guards.supervisor, host, peer),
        };
        if (answers.server === "421") refused += 1;
        else passed += 1;
        if (
          answers.computer !== answers.server ||
          answers.supervisor !== answers.server
        )
          mismatches.push(
            `peer ${JSON.stringify(peer)}, Host ${JSON.stringify(host)}: ${JSON.stringify(answers)}`,
          );
      }
    }
    expect(mismatches).toEqual([]);
    // Both outcomes were exercised in volume, or agreeing would prove little.
    expect(refused).toBeGreaterThan(1000);
    expect(passed).toBeGreaterThan(1000);
  });

  test("a refusal is a 421 and a pass is nothing, and nothing else ever comes back", () => {
    const outcomes = new Set<string>();
    for (const peer of PEERS)
      for (const host of [...HOSTS, null])
        for (const guard of Object.values(guards))
          outcomes.add(decide(guard, host, peer));
    expect([...outcomes].sort()).toEqual(["421", "on"]);
  });
});
