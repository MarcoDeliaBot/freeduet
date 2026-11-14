import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type EgressPolicy,
  egressDecision,
} from "../agent-computer/src/egress";
import { environmentFor } from "../supervisor/src/environment";

/**
 * Who calls whom around a Bot's computer, and why the home-network block (D36) breaks none of it.
 *
 * The computer's egress filter judges what a Bot's BROWSER and its SHELL ask for. It now refuses the
 * private ranges, and the addresses the stack itself lives at (the host Docker publishes as
 * `host.docker.internal`, the other containers on a Compose network) are inside those ranges. That is
 * the point for a Bot, and harmless for the stack only if no part of the stack makes its calls
 * through that filter. This file holds the evidence, read off the repository and not from memory, in
 * four steps:
 *
 *   1. The stack's addresses ARE refused when a Bot's browser or shell asks (the new behaviour).
 *   2. Compose gives the computer no route to them by name and no setting that names one.
 *   3. The supervisor hands a computer only what it needs, and no proxy variable.
 *   4. The computer's own process makes no outbound call of its own.
 *
 * docs/M1_PLAN.md D36 lists each caller with the line that makes it. A change here means a caller was
 * added or moved: read that list before editing this one.
 */

const root = join(import.meta.dir, "..");
const read = (...path: string[]) => readFileSync(join(root, ...path), "utf8");

const blocked: EgressPolicy = { mode: "allow_all", rules: [] };

type ComposeService = {
  environment?: Record<string, string>;
  extra_hosts?: string[];
  env_file?: { path: string; required?: boolean }[];
  networks?: string[];
};
const compose = (
  Bun as unknown as {
    YAML: {
      parse: (text: string) => { services: Record<string, ComposeService> };
    };
  }
).YAML.parse(read("docker-compose.yml")).services;

describe("the stack's own addresses, asked for by a Bot's browser or shell", () => {
  test("are refused by default, the host Docker publishes and every container on a network", () => {
    const stack: [string, string, number][] = [
      // The default bridge's gateway, which is the host on Linux.
      ["host.docker.internal", "172.17.0.1", 3001],
      // The host on Docker Desktop.
      ["host.docker.internal", "192.168.65.254", 3001],
      // A container on a Compose network, by service name: the API server's neighbours.
      ["agent-freeduet", "172.18.0.7", 4230],
      ["supervisor", "172.18.0.4", 4101],
      ["postgres", "172.19.0.2", 5432],
    ];
    for (const [name, address, port] of stack) {
      expect(egressDecision(blocked, name, port, [address])).toMatchObject({
        allowed: false,
      });
      // Spelled as the address, which is what a shell command or a link can carry.
      expect(egressDecision(blocked, address, port)).toMatchObject({
        allowed: false,
      });
    }
    // The block is the person's to lift, and the name is judged by where it resolved to.
    const switchedOn: EgressPolicy = { ...blocked, allowPrivateNetwork: true };
    expect(
      egressDecision(switchedOn, "host.docker.internal", 3001, ["172.17.0.1"])
        .allowed,
    ).toBe(true);
  });
});

describe("Compose, for the Bot's computer", () => {
  const computer = compose["agent-computer"];

  test("gives it no name for the host and no address for any other service", () => {
    expect(computer).toBeDefined();
    // No `extra_hosts`, so `host.docker.internal` does not resolve inside it on Linux. The services
    // that do carry it are the ones that call the API server, and none of them is the computer.
    expect(computer?.extra_hosts).toBeUndefined();
    expect(
      Object.entries(compose)
        .filter(([, service]) =>
          service.extra_hosts?.some((entry) =>
            entry.startsWith("host.docker.internal:"),
          ),
        )
        .map(([name]) => name)
        .sort(),
    ).toEqual(["agent-freeduet", "agent-harness", "agent-langgraph"]);
  });

  test("sets only what the computer itself needs, and nothing that points at the API server, the database or a proxy", () => {
    expect(Object.keys(computer?.environment ?? {}).sort()).toEqual([
      "COMPUTER_BROWSER_IDLE_MS",
      "COMPUTER_BROWSER_MODE",
      "COMPUTER_MAX_BROWSERS",
      "COMPUTER_TOKEN",
    ]);
    // Its one `env_file` is the optional per-Bot outbound address list, which is read as
    // `EGRESS_PROXY_<BOT>` and used by the filter as the upstream, never as `HTTP_PROXY`.
    expect(computer?.env_file).toEqual([
      { path: "./egress.env", required: false },
    ]);
    for (const value of Object.values(computer?.environment ?? {})) {
      expect(value).not.toMatch(
        /host\.docker\.internal|postgres|:3001|:4230|:4101|OPENBOT_TOOL_URL/,
      );
    }
  });
});

describe("the supervisor, for each computer it starts", () => {
  test("passes an identity, the token, the browser mode and the per-Bot outbound addresses, and no proxy or address of the stack", () => {
    const variables = environmentFor("sales", {
      COMPUTER_TOKEN: "token",
      COMPUTER_BROWSER_MODE: "headed",
      EGRESS_PROXY_DEFAULT: "http://gateway.example:8080",
      EGRESS_PROXY_SALES: "http://sales.example:8080",
      // What the supervisor's own environment holds and a computer must not inherit.
      HTTP_PROXY: "http://proxy.internal:3128",
      HTTPS_PROXY: "http://proxy.internal:3128",
      NO_PROXY: "localhost",
      OPENBOT_TOOL_URL: "http://host.docker.internal:3001/api/agent-tools/call",
      DATABASE_URL: "postgres://openbot:openbot@postgres:5432/openbot",
    });
    expect(variables.map((entry) => entry.split("=")[0]).sort()).toEqual([
      "COMPUTER_BOT_ID",
      "COMPUTER_BROWSER_MODE",
      "COMPUTER_TOKEN",
      "EGRESS_PROXY_DEFAULT",
      "EGRESS_PROXY_SALES",
    ]);
    expect(variables.join("\n")).not.toMatch(
      /HTTP_PROXY|HTTPS_PROXY|NO_PROXY|host\.docker\.internal|postgres/,
    );
  });
});

describe("the computer's own process", () => {
  /**
   * Network primitives, outside the two files whose job is the filter. A new line here is a call
   * that does not go through the filter, because the process's own environment never names it.
   */
  const OUTBOUND =
    /(^|[^A-Za-z_.])fetch\(|\.fetch\(|https?\.(request|get)\(|http2\.connect\(|net\.(connect|createConnection)\(|tls\.connect\(|Bun\.connect|new WebSocket\(|new EventSource\(|XMLHttpRequest|undici|node-fetch/;

  test("makes no outbound call of its own, so nothing it needs from the stack passes through the filter", () => {
    const found: string[] = [];
    // Every source file, so a file added tomorrow is scanned too. `egress.ts` is the filter and
    // `private-network.ts` is its address classifier.
    for (const file of readdirSync(join(root, "agent-computer", "src"))) {
      if (
        !file.endsWith(".ts") ||
        file === "egress.ts" ||
        file === "private-network.ts"
      )
        continue;
      for (const line of read("agent-computer", "src", file).split("\n")) {
        if (OUTBOUND.test(line)) found.push(`${file}: ${line.trim()}`);
      }
    }
    // The one match is the computer's own HTTP server answering its callers (the API server, the
    // supervisor, a health check), which is inbound.
    expect(found).toEqual(["index.ts: async fetch(request, server) {"]);
  });
});
