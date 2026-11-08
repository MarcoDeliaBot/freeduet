import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeModelBaseUrls } from "../src/copilot";
import { reportModelAvailability } from "../src/model-availability-check";
import {
  pinModelBaseToRouter,
  routerModelBase,
} from "../src/freeduet/model-base";
import { createModelCompleter } from "../src/routing/model";

const LOCAL_KEY = "dummy-local-key-not-a-secret-0123456789";
const OFFICIAL = "https://api.anthropic.com";

/** FreeDuet's `.env.example`, as written: the uncommented `KEY=value` lines. */
function freeDuetDefaults(): Record<string, string> {
  const text = readFileSync(
    join(import.meta.dir, "..", "..", ".env.example"),
    "utf8",
  );
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1]) values[match[1]] = match[2] ?? "";
  }
  return values;
}

/** What start.sh adds to a fresh `.env`, with a dummy value. */
function bootEnvironment(
  exported: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return {
    ...freeDuetDefaults(),
    FREEDUET_LOCAL_KEY: LOCAL_KEY,
    ANTHROPIC_API_KEY: LOCAL_KEY,
    ...exported,
  };
}

/** Records each request instead of sending it, and answers 401, what the leaked key got from Anthropic. */
function recordingFetch() {
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
  return { fetcher, calls };
}

const savedBase = process.env.ANTHROPIC_BASE_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = savedBase;
});

describe("FreeDuet's defaults", () => {
  test("the example points the server's model calls at the router, and the router is on", () => {
    const defaults = freeDuetDefaults();
    expect(defaults.ANTHROPIC_BASE_URL).toBe("http://localhost:4230");
    expect(defaults.FREEDUET_ROUTER).toBe("on");
    expect(defaults.BOT_PROVIDER).toBe("anthropic");
  });

  test("with the router's own address in `.env`, nothing is changed and nothing is logged", () => {
    const environment = bootEnvironment({});
    normalizeModelBaseUrls(environment);
    const lines: string[] = [];
    const before = environment.ANTHROPIC_BASE_URL;
    const pin = pinModelBaseToRouter(environment, (line) => lines.push(line));
    expect(pin).toEqual({ kind: "kept", base: routerModelBase(environment) });
    expect(environment.ANTHROPIC_BASE_URL).toBe(before);
    expect(lines).toEqual([]);
  });
});

describe("pinning the server's Anthropic base to the router", () => {
  test("an exported provider address is replaced, and the log names the host without the value", () => {
    const environment = bootEnvironment({
      ANTHROPIC_BASE_URL: `${OFFICIAL}/v1`,
    });
    normalizeModelBaseUrls(environment);
    const lines: string[] = [];
    const pin = pinModelBaseToRouter(environment, (line) => lines.push(line));
    expect(pin).toEqual({
      kind: "pinned",
      base: "http://localhost:4230/v1",
      was: "api.anthropic.com",
    });
    expect(environment.ANTHROPIC_BASE_URL).toBe("http://localhost:4230/v1");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      type: "model-base-pinned",
      provider: "anthropic",
      base: "http://localhost:4230/v1",
      was: "api.anthropic.com",
    });
    expect(lines[0]).not.toContain(LOCAL_KEY);
  });

  test("a base with credentials in it is logged by host only", () => {
    const environment = bootEnvironment({
      ANTHROPIC_BASE_URL:
        "https://user:secret-token@gateway.example/v1?key=abc",
    });
    const lines: string[] = [];
    pinModelBaseToRouter(environment, (line) => lines.push(line));
    expect(lines[0]).toContain("gateway.example");
    expect(lines[0]).not.toContain("secret-token");
    expect(lines[0]).not.toContain("key=abc");
  });

  test("an unset or blank base is set to the router, the case of a `.env` with no such line", () => {
    for (const exported of [
      { ANTHROPIC_BASE_URL: undefined },
      { ANTHROPIC_BASE_URL: "   " },
    ]) {
      const environment = bootEnvironment(exported);
      normalizeModelBaseUrls(environment);
      const lines: string[] = [];
      pinModelBaseToRouter(environment, (line) => lines.push(line));
      expect(environment.ANTHROPIC_BASE_URL).toBe("http://localhost:4230/v1");
      expect(JSON.parse(lines[0] ?? "{}").was).toBe("unset");
    }
  });

  test("FREEDUET_PORT moves the router's address with it", () => {
    const environment = bootEnvironment({
      FREEDUET_PORT: "4240",
      ANTHROPIC_BASE_URL: OFFICIAL,
    });
    pinModelBaseToRouter(environment, () => {});
    expect(environment.ANTHROPIC_BASE_URL).toBe("http://localhost:4240/v1");
  });

  test("with the router off, the base is left exactly as the environment has it", () => {
    const environment = bootEnvironment({
      FREEDUET_ROUTER: "OFF",
      ANTHROPIC_BASE_URL: OFFICIAL,
    });
    const lines: string[] = [];
    const pin = pinModelBaseToRouter(environment, (line) => lines.push(line));
    expect(pin).toEqual({ kind: "off" });
    expect(environment.ANTHROPIC_BASE_URL).toBe(OFFICIAL);
    expect(lines).toEqual([]);
  });
});

describe("FreeDuet's defaults with an exported Anthropic base", () => {
  // The clean-start test: `.env` copied from `.env.example`, start.sh's keys written, and
  // ANTHROPIC_BASE_URL exported by the shell. Before pinning, the boot check sent the local key to
  // api.anthropic.com and answered 401, and a server call sent its prompt there.
  test("the boot model check makes no request to a provider", async () => {
    const environment = bootEnvironment({ ANTHROPIC_BASE_URL: OFFICIAL });
    normalizeModelBaseUrls(environment);
    pinModelBaseToRouter(environment, () => {});

    const { fetcher, calls } = recordingFetch();
    const lines: string[] = [];
    const outcome = await reportModelAvailability({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      apiKey: async () => environment.ANTHROPIC_API_KEY ?? null,
      environment,
      fetch: fetcher,
      log: (line) => lines.push(line),
    });
    expect(outcome).toEqual({ kind: "skipped" });
    expect(calls).toEqual([]);
    expect(lines).toEqual([]);
  });

  test("a server model call goes to agent-freeduet, with the prompt, and nowhere else", async () => {
    const environment = bootEnvironment({ ANTHROPIC_BASE_URL: OFFICIAL });
    normalizeModelBaseUrls(environment);
    pinModelBaseToRouter(environment, () => {});
    // createModelCompleter reads the process environment, as the server does.
    process.env.ANTHROPIC_BASE_URL = environment.ANTHROPIC_BASE_URL;

    const realFetch = globalThis.fetch;
    const calls: { url: string; xApiKey: string | null; body: string }[] = [];
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        xApiKey: headers.get("x-api-key"),
        body: String(init?.body ?? ""),
      });
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const complete = createModelCompleter({
        model: { provider: "anthropic", defaultModel: "claude-sonnet-5-5" },
        resolveApiKey: async () => LOCAL_KEY,
      });
      expect(await complete("a message the person sent")).toBe("ok");
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4230/v1/messages");
    expect(calls[0]?.xApiKey).toBe(LOCAL_KEY);
    expect(calls[0]?.body).toContain("a message the person sent");
  });
});
