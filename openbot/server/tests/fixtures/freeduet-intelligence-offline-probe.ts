/*
 * Run in a fresh process by freeduet-intelligence-offline.test.ts, with the environment FreeDuet
 * ships (FREEDUET_INTELLIGENCE=off, COPILOTKIT_TELEMETRY_DISABLED=true), because CopilotKit decides
 * whether telemetry is on when its module is first loaded, and a test process has loaded it long
 * before any one file could say otherwise.
 *
 * Boots as index.ts wires it, then runs one browser chat turn, one headless turn on the same thread
 * through the same runner, a hop's lock and history, and a memory written and recalled in Postgres.
 * Every outbound request is recorded and answered here, so nothing leaves the machine. Every method
 * of the Intelligence client and runner is watched. Prints one JSON report on the last line.
 */
const requested: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    input instanceof Request ? input.url : new URL(String(input)).href;
  requested.push(url);
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1")
    return realFetch(input, init);
  return new Response("refused by the probe", { status: 503 });
}) as typeof fetch;

// The same order as the server: telemetry.ts before anything that imports the runtime.
await import("../../src/telemetry");
await import("eventsource");
const { AbstractAgent, EventType } = await import("@ag-ui/client");
const { CopilotKitIntelligence, IntelligenceAgentRunner } = await import(
  "@copilotkit/runtime/v2"
);
const { createTurnRunner } = await import("@openbot/toolkit/run-turn");
const { from } = await import("rxjs");
const { createThreadReader } = await import("../../src/channels/thread-status");
const { loadConfig } = await import("../../src/config");
const { mountCopilotRuntime } = await import("../../src/copilot");
const { createDatabase } = await import("../../src/db/client");
const { createThreadBackend, threadReaderClient } = await import(
  "../../src/freeduet/backend"
);
const { guardThreadRoutes } = await import("../../src/freeduet/thread-routes");
const { createLearningAutoAssign, probeLearningContainer } = await import(
  "../../src/learning/auto-assign"
);
const { createLearningSettingsStore } = await import(
  "../../src/learning/settings"
);
const { createMemoryStore } = await import("../../src/memory/store");
const { createSetupSources } = await import("../../src/openduet/setup");
const { createSelfHostBanner } = await import("../../src/self-host-banner");
const { TEST_POOL, testDatabaseUrl } = await import("../support/database");
const { testEnvironment } = await import("../support/environment");
const { createFakeThreadsModule } = await import(
  "../support/fake-local-threads"
);
const { removePeople, seedPerson } = await import("../support/people");

type Input = Parameters<InstanceType<typeof AbstractAgent>["run"]>[0];

class HelloAgent extends AbstractAgent {
  run(input: Input) {
    const messageId = `reply-${input.runId}`;
    return from([
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: "Hello" },
      { type: EventType.TEXT_MESSAGE_END, messageId },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ] as never);
  }
}

/** Every method of a class, recorded when called, still doing what it did. */
const intelligenceCalls: string[] = [];
function watch(prototype: object, label: string) {
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    const original = descriptor?.value;
    if (typeof original !== "function") continue;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value(this: unknown, ...args: unknown[]) {
        intelligenceCalls.push(`${label}.${name}`);
        return original.apply(this, args);
      },
    });
  }
}
watch(CopilotKitIntelligence.prototype, "CopilotKitIntelligence");
watch(IntelligenceAgentRunner.prototype, "IntelligenceAgentRunner");

const report: Record<string, unknown> = {};
const person = `offline-${crypto.randomUUID()}`;
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
await seedPerson(database, person);
try {
  // Keys present on purpose: off must ignore them, not merely lack them.
  const config = loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "off" }));
  const fake = createFakeThreadsModule();

  // Boot, in index.ts's order.
  const backend = await createThreadBackend(config, database, {
    threads: fake.module,
    log: () => {},
  });
  const learningSettings = createLearningSettingsStore(
    database,
    config.learning,
  );
  const autoAssign = createLearningAutoAssign({
    enabled: config.learningAutoAssign && backend.learning,
    store: learningSettings,
    probe: (containerId) =>
      probeLearningContainer(backend.learningProbe, containerId),
    audit: { record: async () => {} } as never,
  });
  autoAssign.start();
  report.learning = (await autoAssign.check()).state;
  const memory = createMemoryStore(database, { intelligence: backend.memory });
  report.banner = await createSelfHostBanner({
    enabled: true,
    entitlements: () => backend.entitlements.getRuntimeEntitlements(),
  }).shown();
  let entitlementsAsked = 0;
  const setup = createSetupSources({
    productName: "FreeDuet",
    config,
    environment: {},
    model: {
      provider: "anthropic",
      keyId: "anthropic",
      defaultModel: "claude",
      plan: false,
    },
    credentials: { status: async () => [] } as never,
    entitlements: async () => {
      entitlementsAsked++;
      return backend.entitlements.getRuntimeEntitlements();
    },
    plugins: { listServers: async () => [], inspectApp: async () => null },
    primaryBot: "bot",
    computer: false,
    apps: { configured: false, provider: "composio" },
    chat: false,
  });
  await setup.recheck();
  report.entitlementsAsked = entitlementsAsked;

  const identifyUser = async () => ({ id: person, name: "Person" });
  const runtime = mountCopilotRuntime(
    config,
    {
      resolveAgentsForActor: async () => ({
        bot: new HelloAgent({ agentId: "bot" }),
      }),
      resolveAgentForActor: async () => new HelloAgent({ agentId: "bot" }),
    },
    identifyUser,
    async () => ({ id: person, role: "user" }),
    { threadBackend: backend, learningSettings },
  );
  report.learningRuntime = runtime.learning !== undefined;
  const app = guardThreadRoutes(runtime.handler, backend, identifyUser);

  // What the app asks first, then one chat turn.
  const info = await app.fetch(
    new Request("http://localhost/api/copilotkit/info"),
  );
  report.info = {
    status: info.status,
    mode: ((await info.json()) as { mode: string }).mode,
  };
  const turn = await app.fetch(
    new Request("http://localhost/api/copilotkit/agent/bot/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "offline-thread",
        runId: "browser-run",
        messages: [{ id: "m1", role: "user", content: "Hi" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      }),
    }),
  );
  report.turn = {
    status: turn.status,
    said: (await turn.text()).includes("Hello"),
  };
  report.known = await createThreadReader(threadReaderClient(config))(
    "offline-thread",
    person,
  );

  // A routine's turn on the same thread: the adapter's lock, then the one shared runner.
  const runTurn = createTurnRunner({
    admission: async ({ signal }) => signal ?? new AbortController().signal,
    intelligence: backend.client,
    runner: backend.runner,
    buildAgentFor: async () => new HelloAgent({ agentId: "bot" }),
  });
  report.headless = (
    await runTurn({
      ownerUserId: person,
      routineId: "routine",
      agentId: "bot",
      threadId: "offline-thread",
      instruction: "Good morning",
    })
  ).replyText;
  report.locksLeft = fake.store.locks.size;

  // A hop: the same runner, the adapter's lock and history.
  report.oneRunner = runtime.handoffRunner() === backend.runner;
  report.hopLock = await runtime.threadLock.acquire({
    threadId: "offline-scratch",
    runId: "hop-run",
    userId: person,
    agentId: "bot",
  });
  await runtime.threadLock.release({
    threadId: "offline-scratch",
    runId: "hop-run",
  });
  report.history = (
    await runtime.history({ threadId: "offline-thread", actorId: person })
  ).map((message) => message.role);

  // Memory: written and recalled in Postgres alone.
  const fact = await memory.create(person, {
    content: "Prefers Lisbon for offsites",
  });
  report.recalled = (await memory.retrieve(person, [], "lisbon")).some(
    (row) => row.id === fact.id,
  );
} catch (error) {
  report.error =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
  await removePeople(database, [person]);
}

report.intelligenceCalls = intelligenceCalls;
report.copilotkitRequests = requested.filter((url) =>
  new URL(url).hostname.endsWith("copilotkit.ai"),
);
report.otherRequests = requested.filter(
  (url) => !new URL(url).hostname.endsWith("copilotkit.ai"),
);
console.log(JSON.stringify(report));
process.exit(0);

export {};
