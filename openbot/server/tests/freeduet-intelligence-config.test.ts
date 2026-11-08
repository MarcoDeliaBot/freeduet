/**
 * FREEDUET_INTELLIGENCE (#42): unset is upstream OpenBot, `on` is upstream OpenBot, `off` boots with
 * no Intelligence key and names the keys it ignores once. And what the backend factory hands
 * index.ts in each mode.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CopilotKitIntelligence,
  IntelligenceAgentRunner,
} from "@copilotkit/runtime/v2";
import { loadConfig, type RuntimeCapabilities } from "../src/config";
import { mountCopilotRuntime } from "../src/copilot";
import type { Database } from "../src/db/client";
import {
  createThreadBackend,
  LOCAL_ENTITLEMENTS,
  threadReaderClient,
} from "../src/freeduet/backend";
import { LocalIntelligence } from "../src/freeduet/local-intelligence";
// No effect on this process: FREEDUET_INTELLIGENCE is not set here.
import { telemetryOffWithoutIntelligence } from "../src/freeduet/telemetry-off";
import { setupRows } from "../src/openduet/setup";
import { createFakeThreadsModule } from "./support/fake-local-threads";
import { testEnvironment } from "./support/environment";

const KEYS = [
  "INTELLIGENCE_API_URL",
  "INTELLIGENCE_GATEWAY_WS_URL",
  "INTELLIGENCE_API_KEY",
  "COPILOTKIT_LICENSE_TOKEN",
] as const;

/** The minimum environment with no Intelligence setting at all. */
function withoutIntelligence(overrides: Record<string, string> = {}) {
  const environment = testEnvironment();
  for (const name of KEYS) delete environment[name];
  return { ...environment, ...overrides };
}

const UPSTREAM_SETTINGS = {
  apiUrl: "http://localhost:7100",
  gatewayWsUrl: "ws://localhost:7103",
  apiKey: "tenant-api-key",
  licenseToken: "license-token",
};
const UPSTREAM_RUNTIME: RuntimeCapabilities = {
  mode: "intelligence",
  durableHistory: true,
  intelligence: UPSTREAM_SETTINGS,
};

// The fake store never touches the database it is given.
const NO_DATABASE = {} as Database;

describe("FREEDUET_INTELLIGENCE", () => {
  test("unset is upstream: the Intelligence runtime, exactly", () => {
    expect(loadConfig(testEnvironment()).runtime).toEqual(UPSTREAM_RUNTIME);
  });

  test("on is upstream too", () => {
    expect(
      loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "on" })).runtime,
    ).toEqual(UPSTREAM_RUNTIME);
  });

  test.each([
    ["on", { FREEDUET_INTELLIGENCE: "on" }],
    ["unset", {}],
  ])(
    "%s without keys refuses to start, with upstream's message",
    (_, extra) => {
      expect(() => loadConfig(withoutIntelligence(extra))).toThrow(
        "CopilotKit Intelligence is required and is not configured. Missing: INTELLIGENCE_API_URL, INTELLIGENCE_GATEWAY_WS_URL, INTELLIGENCE_API_KEY",
      );
    },
  );

  test("off without any Intelligence setting boots in local mode", () => {
    const config = loadConfig(
      withoutIntelligence({ FREEDUET_INTELLIGENCE: "off" }),
    );
    expect(config.runtime).toEqual({
      mode: "local",
      durableHistory: true,
      ignoredIntelligenceVariables: [],
    });
    expect("intelligence" in config.runtime).toBe(false);
  });

  test("off is read the way people write it", () => {
    for (const value of ["OFF", " off ", "Off"])
      expect(
        loadConfig(withoutIntelligence({ FREEDUET_INTELLIGENCE: value }))
          .runtime.mode,
      ).toBe("local");
  });

  test.each(["of", "false", "0", "local"])(
    "refuses %p rather than guessing",
    (value) => {
      expect(() =>
        loadConfig(withoutIntelligence({ FREEDUET_INTELLIGENCE: value })),
      ).toThrow('FREEDUET_INTELLIGENCE must be "on" or "off"');
    },
  );

  test("off with keys names the credentials it ignores, and not the shipped addresses", () => {
    const config = loadConfig(
      testEnvironment({ FREEDUET_INTELLIGENCE: "off" }),
    );
    expect(config.runtime).toEqual({
      mode: "local",
      durableHistory: true,
      ignoredIntelligenceVariables: [
        "INTELLIGENCE_API_KEY",
        "COPILOTKIT_LICENSE_TOKEN",
      ],
    });
  });
});

describe("createThreadBackend", () => {
  test("off with keys warns once at boot, naming them", async () => {
    const lines: string[] = [];
    await createThreadBackend(
      loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "off" })),
      NO_DATABASE,
      {
        threads: createFakeThreadsModule().module,
        log: (line) => lines.push(line),
      },
    );
    expect(lines).toHaveLength(1);
    const warning = JSON.parse(lines[0] ?? "{}");
    expect(warning).toMatchObject({
      type: "freeduet-intelligence-off",
      ignored: ["INTELLIGENCE_API_KEY", "COPILOTKIT_LICENSE_TOKEN"],
    });
  });

  test("off without keys says nothing", async () => {
    const lines: string[] = [];
    await createThreadBackend(
      loadConfig(withoutIntelligence({ FREEDUET_INTELLIGENCE: "off" })),
      NO_DATABASE,
      {
        threads: createFakeThreadsModule().module,
        log: (line) => lines.push(line),
      },
    );
    expect(lines).toEqual([]);
  });

  test("off: migrations, then the sweep of interrupted runs, before anything is handed out", async () => {
    const fake = createFakeThreadsModule();
    const backend = await createThreadBackend(
      loadConfig(withoutIntelligence({ FREEDUET_INTELLIGENCE: "off" })),
      NO_DATABASE,
      { threads: fake.module },
    );
    expect(fake.order).toEqual(["migrations", "store", "runner", "sweep"]);
    expect(backend.mode).toBe("local");
    expect(backend.runner).toBe(fake.runner);
    expect(backend.client).toBeInstanceOf(LocalIntelligence);
  });

  test("off: no memory, Learning or entitlement goes to Intelligence", async () => {
    const entitlements = spyOn(
      CopilotKitIntelligence.prototype,
      "getRuntimeEntitlements",
    );
    const snapshot = spyOn(
      CopilotKitIntelligence.prototype,
      "getLearnedSkillsSnapshot",
    );
    try {
      const backend = await createThreadBackend(
        loadConfig(withoutIntelligence({ FREEDUET_INTELLIGENCE: "off" })),
        NO_DATABASE,
        { threads: createFakeThreadsModule().module },
      );
      expect(backend.memory).toBeUndefined();
      expect(backend.learning).toBe(false);
      expect(await backend.entitlements.getRuntimeEntitlements()).toEqual(
        LOCAL_ENTITLEMENTS,
      );
      await expect(
        backend.learningProbe.getLearnedSkillsSnapshot({ containerId: "any" }),
      ).rejects.toThrow("FREEDUET_INTELLIGENCE=off");
      expect(() => backend.intelligence()).toThrow("FREEDUET_INTELLIGENCE=off");
      expect(entitlements).not.toHaveBeenCalled();
      expect(snapshot).not.toHaveBeenCalled();
    } finally {
      entitlements.mockRestore();
      snapshot.mockRestore();
    }
  });

  test("on: today's objects, an Intelligence client and runner, and memory's Intelligence half", async () => {
    const config = loadConfig(testEnvironment());
    const backend = await createThreadBackend(config, NO_DATABASE);
    expect(backend.mode).toBe("intelligence");
    expect(backend.client).toBeInstanceOf(CopilotKitIntelligence);
    expect(backend.runner).toBeInstanceOf(IntelligenceAgentRunner);
    expect(backend.memory).toBeDefined();
    expect(backend.learning).toBe(true);
    expect(backend.intelligence()).toEqual(UPSTREAM_SETTINGS);
    expect(threadReaderClient(config)).toBeInstanceOf(CopilotKitIntelligence);
  });

  test("the thread reader of a local configuration is the adapter over its own store", async () => {
    const config = loadConfig(
      withoutIntelligence({ FREEDUET_INTELLIGENCE: "off" }),
    );
    expect(() => threadReaderClient(config)).toThrow("createThreadBackend");
    const backend = await createThreadBackend(config, NO_DATABASE, {
      threads: createFakeThreadsModule().module,
    });
    expect(threadReaderClient(config)).toBe(backend.client);
  });

  test("the runtime refuses to mount with the switch off and no backend, rather than forgetting every conversation", () => {
    const config = loadConfig(
      withoutIntelligence({ FREEDUET_INTELLIGENCE: "off" }),
    );
    expect(() =>
      mountCopilotRuntime(
        config,
        {
          resolveAgentsForActor: async () => ({}),
          resolveAgentForActor: async () => {
            throw new Error("unused");
          },
        },
        async () => ({ id: "person", name: "Person" }),
        async () => ({ id: "person", role: "user" }),
      ),
    ).toThrow("createThreadBackend");
  });
});

describe("telemetry with Intelligence off", () => {
  test.each([
    ["unset", {}, "true", true],
    ["empty", { COPILOTKIT_TELEMETRY_DISABLED: "" }, "true", true],
    [
      "false, chosen",
      { COPILOTKIT_TELEMETRY_DISABLED: "false" },
      "false",
      false,
    ],
    ["0, chosen", { COPILOTKIT_TELEMETRY_DISABLED: "0" }, "0", false],
    ["true", { COPILOTKIT_TELEMETRY_DISABLED: "true" }, "true", false],
  ] as const)("COPILOTKIT_TELEMETRY_DISABLED %s", (_, set, after, changed) => {
    const environment: Record<string, string | undefined> = {
      FREEDUET_INTELLIGENCE: "off",
      ...set,
    };
    expect(telemetryOffWithoutIntelligence(environment)).toBe(changed);
    expect(environment.COPILOTKIT_TELEMETRY_DISABLED).toBe(after);
  });

  test.each([
    ["unset", {}],
    ["on", { FREEDUET_INTELLIGENCE: "on" }],
  ])("is left to upstream with the switch %s", (_, set) => {
    const environment: Record<string, string | undefined> = { ...set };
    expect(telemetryOffWithoutIntelligence(environment)).toBe(false);
    expect(environment.COPILOTKIT_TELEMETRY_DISABLED).toBeUndefined();
  });

  test("index.ts loads the switch before anything that can load the runtime", () => {
    const source = readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    const imports = [...source.matchAll(/^import [^;]*?["']([^"']+)["'];/gms)]
      .map((match) => match[1])
      .filter((specifier) => specifier !== undefined);
    expect(imports.slice(0, 2)).toEqual([
      "./telemetry",
      "./freeduet/telemetry-off",
    ]);
  });
});

describe("Learning settings with Intelligence off", () => {
  test.each([
    ["the token alone", { INTELLIGENCE_SERVICE_TOKEN: "service-token" }],
    ["the project alone", { INTELLIGENCE_PROJECT_ID: "not-a-number" }],
    [
      "a malformed Learning container",
      { CPK_INTELLIGENCE_LEARNING_CONTAINER_ID: "Not A Container" },
    ],
  ])("%s does not stop the server; it is named as ignored", async (_, set) => {
    const environment = withoutIntelligence({
      FREEDUET_INTELLIGENCE: "off",
      ...set,
    });
    const config = loadConfig(environment);
    expect(config.learningSetup).toBeUndefined();
    expect(config.learning).toBeUndefined();
    const lines: string[] = [];
    await createThreadBackend(config, NO_DATABASE, {
      threads: createFakeThreadsModule().module,
      log: (line) => lines.push(line),
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}").ignored).toEqual(Object.keys(set));
  });

  test("with Intelligence the half-set pair still refuses, as upstream", () => {
    expect(() =>
      loadConfig(
        testEnvironment({ INTELLIGENCE_SERVICE_TOKEN: "service-token" }),
      ),
    ).toThrow(
      "INTELLIGENCE_SERVICE_TOKEN and INTELLIGENCE_PROJECT_ID go together",
    );
  });
});

describe("the setup checklist with Intelligence off", () => {
  test("says off on purpose, ready and not required, rather than unreachable", () => {
    const [row] = setupRows(
      {
        intelligence: { state: "local" },
        model: {
          provider: "anthropic",
          source: "environment",
          verdict: "available",
          model: "claude",
        },
        google: { publicUrl: false, added: false, client: false },
        gmail: null,
        primaryBot: "iris",
        computer: false,
        apps: { configured: false, provider: "composio" },
        chat: false,
      },
      { productName: "FreeDuet", audience: "admin" },
    );
    expect(row).toMatchObject({
      id: "intelligence",
      status: "ready",
      ready: true,
      required: false,
      fix: null,
      detail:
        "Off. FreeDuet keeps your conversations and what it remembers on its own server.",
    });
  });
});
