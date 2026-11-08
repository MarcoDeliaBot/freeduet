/**
 * Where conversations live: CopilotKit Intelligence, or FreeDuet's own Postgres (issue #42).
 *
 * ONE FACTORY, BUILT ONCE AT BOOT. index.ts asks this for the thread client, the runner, memory's
 * Intelligence half and the entitlement answer, instead of building each from
 * `config.runtime.intelligence` at a dozen sites. With FREEDUET_INTELLIGENCE unset or `on` it returns
 * exactly the objects index.ts built before, so upstream behaviour is unchanged.
 *
 * WITH THE SWITCH OFF:
 * - the client is `LocalIntelligence`, the Intelligence-shaped adapter over the thread store;
 * - the runner is ONE `PgAgentRunner` for the process, shared by the runtime (SSE mode), every
 *   headless turn (routines, proactive work, wake-ups, approval and password resumes, team Bots)
 *   and hand-offs, so one in-process view decides which thread is running and live tails work. The
 *   runtime reaches it through `runnerForRuntime`, which only turns a refused lock into an event;
 * - whoever takes a thread's lock releases it: headless turns and hand-offs take it through the
 *   adapter and the runner re-enters it, a browser run is locked and freed by the runner itself;
 * - memory has no Intelligence half: OpenBot's own `personal_memories` table is the whole store;
 * - the entitlement answer is a fixed "not available" that never leaves the process, so the
 *   self-host banner behaves as on a deployment with no paid plan;
 * - FreeDuet's thread migrations run, then runs a previous process left `running` are closed as
 *   interrupted, before anything can start a new one.
 *
 * Nothing here is sent to CopilotKit with the switch off: no client is constructed for it.
 */
import {
  type AgentRunner,
  CopilotKitIntelligence,
  IntelligenceAgentRunner,
} from "@copilotkit/runtime/v2";
import type { DeploymentConfig, IntelligenceSettings } from "../config";
import type { Database } from "../db/client";
import {
  createIntelligenceClient,
  observeIntelligenceAuthentication,
} from "../intelligence-client";
import {
  createIntelligenceMemory,
  type IntelligenceMemory,
} from "../memory/intelligence";
import type { RuntimeEntitlementResponse } from "../self-host-banner";
import { LocalIntelligence, type ThreadClient } from "./local-intelligence";
import { runnerForRuntime } from "./thread-routes";
import type {
  LocalThreadStore,
  PgAgentRunner,
  ThreadsModule,
} from "./threads/contract";
import {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
} from "./threads/index";

/** What the self-host banner and the setup checklist ask about entitlement. */
type EntitlementSource = {
  getRuntimeEntitlements(): Promise<RuntimeEntitlementResponse>;
};

/** The one Learning call boot makes, to probe the configured container. */
type LearningProbe = Pick<CopilotKitIntelligence, "getLearnedSkillsSnapshot">;

type Common = {
  /** What headless turns, hop history, delivery, titles, reports and approvals read threads with. */
  client: ThreadClient;
  /** ONE runner for this process. See the module comment. */
  runner: AgentRunner;
  /** Memory's Intelligence half, or undefined: then OpenBot's own tables are the whole store. */
  memory: IntelligenceMemory | undefined;
  entitlements: EntitlementSource;
  /** Learning is an Intelligence feature. Off without it: nothing is probed or assigned. */
  learning: boolean;
  learningProbe: LearningProbe;
  /** The Intelligence settings. Throws with the switch off, where there are none. */
  intelligence(): IntelligenceSettings;
};

export type ThreadBackend =
  | (Common & { mode: "intelligence" })
  | (Common & {
      mode: "local";
      client: LocalIntelligence;
      runner: PgAgentRunner;
      /** The same runner as the runtime is given it. See `runnerForRuntime` in thread-routes.ts. */
      runtimeRunner: AgentRunner;
      store: LocalThreadStore;
      memory: undefined;
    });

export type LocalThreadBackend = Extract<ThreadBackend, { mode: "local" }>;

/**
 * The local backend the runtime mount was handed. Throws when there is none: a runtime with the
 * switch off and no store would fall back to the SDK's in-memory runner and forget every
 * conversation on restart, which must never pass for working.
 */
export function localThreadBackend(
  backend: ThreadBackend | undefined,
): LocalThreadBackend {
  if (backend?.mode !== "local")
    throw new Error(
      "FREEDUET_INTELLIGENCE=off: the runtime needs FreeDuet's thread backend (createThreadBackend).",
    );
  return backend;
}

/** The answer for a deployment that has no Intelligence to ask. Never sent anywhere. */
export const LOCAL_ENTITLEMENTS: RuntimeEntitlementResponse = {
  status: "unavailable",
  error: {
    code: "FREEDUET_INTELLIGENCE_OFF",
    message: "CopilotKit Intelligence is off (FREEDUET_INTELLIGENCE=off).",
    retryable: false,
  },
};

const INTELLIGENCE_OFF =
  "CopilotKit Intelligence is off (FREEDUET_INTELLIGENCE=off).";

/**
 * The backend each configuration was booted with, for the one reader outside index.ts that cannot
 * be handed it: app.ts's `/api/threads/:id`. Keyed by the configuration object, so two servers in
 * one test process never see each other's store.
 */
const booted = new WeakMap<DeploymentConfig, ThreadBackend>();

/** The store's module (`./threads/index.ts`), by the names `ThreadsModule` fixes and no others. */
const THREAD_STORE: ThreadsModule = {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
};

export async function createThreadBackend(
  config: DeploymentConfig,
  database: Database,
  options: {
    /** The store's module; tests may pass a stand-in. FreeDuet's own store otherwise. */
    threads?: ThreadsModule;
    log?: (line: string) => void;
  } = {},
): Promise<ThreadBackend> {
  const log = options.log ?? ((line: string) => console.warn(line));
  const { runtime } = config;
  let backend: ThreadBackend;

  if (runtime.mode === "intelligence") {
    const settings = runtime.intelligence;
    // The pair index.ts built for headless turns before this file existed, built the same way.
    const client = observeIntelligenceAuthentication(
      new CopilotKitIntelligence({
        apiUrl: settings.apiUrl,
        wsUrl: settings.gatewayWsUrl,
        apiKey: settings.apiKey,
      }),
    );
    backend = {
      mode: "intelligence",
      client,
      runner: new IntelligenceAgentRunner({
        url: client.ɵgetRunnerWsUrl(),
        authToken: client.ɵgetRunnerAuthToken(),
      }),
      // Each its own client, as before: the constructor opens nothing.
      memory: createIntelligenceMemory({
        client: createIntelligenceClient(settings),
      }),
      entitlements: createIntelligenceClient(settings),
      learning: true,
      learningProbe: createIntelligenceClient(settings),
      intelligence: () => settings,
    };
  } else {
    const threads = options.threads ?? THREAD_STORE;
    // Tables first, then close what a previous process left running, then accept work.
    await threads.applyFreeDuetThreadMigrations(database);
    const store = threads.createLocalThreadStore(database);
    const runner = threads.createPgAgentRunner({ database, store });
    const interrupted = await runner.sweepInterruptedRuns();
    if (interrupted > 0)
      log(
        JSON.stringify({
          type: "freeduet-threads-interrupted",
          interrupted,
          note: "Runs the previous server left running were marked interrupted. What they wrote is kept.",
        }),
      );
    if (runtime.ignoredIntelligenceVariables.length > 0)
      log(
        JSON.stringify({
          type: "freeduet-intelligence-off",
          ignored: runtime.ignoredIntelligenceVariables,
          note: "FREEDUET_INTELLIGENCE=off: these variables are set and not used. Conversations and memory are kept in this server's own database. Set FREEDUET_INTELLIGENCE=on to use CopilotKit Intelligence.",
        }),
      );
    backend = {
      mode: "local",
      client: new LocalIntelligence(store),
      runner,
      runtimeRunner: runnerForRuntime(runner),
      store,
      memory: undefined,
      entitlements: { getRuntimeEntitlements: async () => LOCAL_ENTITLEMENTS },
      learning: false,
      learningProbe: {
        getLearnedSkillsSnapshot: async () => {
          throw new Error(INTELLIGENCE_OFF);
        },
      },
      intelligence: () => {
        throw new Error(INTELLIGENCE_OFF);
      },
    };
  }
  booted.set(config, backend);
  return backend;
}

/**
 * What `/api/threads/:id` asks whether a remembered thread still exists. With Intelligence, the
 * client app.ts built before; with the switch off, the adapter over the store this configuration
 * booted with.
 */
export function threadReaderClient(
  config: DeploymentConfig,
): Pick<ThreadClient, "getThread"> {
  if (config.runtime.mode === "intelligence")
    return createIntelligenceClient(config.runtime.intelligence);
  const backend = booted.get(config);
  if (!backend)
    throw new Error(
      "FREEDUET_INTELLIGENCE=off: the thread store must be started (createThreadBackend) before the app is built.",
    );
  return backend.client;
}
