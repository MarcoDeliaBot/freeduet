/**
 * The wiring over the REAL thread store and Postgres runner (#42), once `threads/index.ts` is in the
 * tree. Skipped before: the wiring was built beside the store, against the contract, and
 * freeduet-intelligence-routes.test.ts covers it with the in-memory stand-in meanwhile.
 *
 * The same promises, against what ships: another person's thread is not there, a run is kept and
 * read back in Intelligence's row shape, a busy thread answers 409 and the live-run probe its run
 * id, a headless turn on the same thread goes through the same runner, and a restart over the same
 * database still has the conversation.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from "@ag-ui/client";
import { createTurnRunner } from "@openbot/toolkit/run-turn";
import { Observable } from "rxjs";
import { loadConfig } from "../src/config";
import { mountCopilotRuntime } from "../src/copilot";
import { createDatabase } from "../src/db/client";
import {
  createThreadBackend,
  localThreadBackend,
} from "../src/freeduet/backend";
import { guardThreadRoutes } from "../src/freeduet/thread-routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";

const STORE_LANDED = existsSync(
  new URL("../src/freeduet/threads/index.ts", import.meta.url),
);

class EchoAgent extends AbstractAgent {
  static gate: Promise<void> | undefined;
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      void (async () => {
        observer.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        } as BaseEvent);
        await EchoAgent.gate;
        const last = input.messages.at(-1);
        const messageId = `reply-${input.runId}`;
        for (const event of [
          { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: `Hello ${typeof last?.content === "string" ? last.content : ""}`,
          },
          { type: EventType.TEXT_MESSAGE_END, messageId },
          {
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
          },
        ])
          observer.next(event as BaseEvent);
        observer.complete();
      })();
    });
  }
}

const config = loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "off" }));
const database = STORE_LANDED
  ? createDatabase(testDatabaseUrl(), TEST_POOL)
  : undefined;
const id = (name: string) => `${name}-${crypto.randomUUID()}`;
const identifyUser = async (request: Request) => {
  const person = request.headers.get("x-test-person");
  if (!person) throw new Error("Not signed in");
  return { id: person, name: person };
};

/** Boots the backend, the runtime and the guard over the test database, as index.ts does. */
async function boot() {
  if (!database) throw new Error("no database");
  const backend = localThreadBackend(
    await createThreadBackend(config, database, { log: () => {} }),
  );
  const runtime = mountCopilotRuntime(
    config,
    {
      resolveAgentsForActor: async () => ({
        bot: new EchoAgent({ agentId: "bot" }),
      }),
      resolveAgentForActor: async () => new EchoAgent({ agentId: "bot" }),
    },
    identifyUser,
    async (request) => ({
      id: request.headers.get("x-test-person") ?? "",
      role: "user",
    }),
    { threadBackend: backend },
  );
  const app = guardThreadRoutes(runtime.handler, backend, identifyUser);
  const call = (
    path: string,
    options: { person?: string; body?: unknown; method?: string } = {},
  ) =>
    app.fetch(
      new Request(`http://localhost/api/copilotkit${path}`, {
        method: options.method ?? (options.body ? "POST" : "GET"),
        headers: {
          "content-type": "application/json",
          ...(options.person ? { "x-test-person": options.person } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
    );
  return { backend, runtime, call };
}

const input = (
  threadId: string,
  runId: string,
  text: string,
  forwardedProps: Record<string, unknown> = {},
) => ({
  threadId,
  runId,
  messages: text ? [{ id: id("msg"), role: "user", content: text }] : [],
  tools: [],
  context: [],
  state: {},
  forwardedProps,
});

afterAll(async () => {
  EchoAgent.gate = undefined;
});

describe.skipIf(!STORE_LANDED)("the wiring over the real store", () => {
  test("a conversation is the owner's alone, and survives a restart", async () => {
    const { call } = await boot();
    const ada = id("ada");
    const ben = id("ben");
    const thread = id("thread");
    const turn = await call("/agent/bot/run", {
      person: ada,
      body: input(thread, id("run"), "Ada"),
    });
    expect(turn.status).toBe(200);
    expect(await turn.text()).toContain("Hello Ada");

    const read = await call(`/threads/${thread}/messages?agentId=bot`, {
      person: ada,
    });
    expect(read.status).toBe(200);
    const { messages } = (await read.json()) as {
      messages: { role: string; content?: unknown }[];
    };
    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "Ada" },
      { role: "assistant", content: "Hello Ada" },
    ]);

    for (const [path, body] of [
      [`/threads/${thread}/messages?agentId=bot`, undefined],
      ["/agent/bot/connect", input(thread, id("join"), "")],
      ["/agent/bot/run", input(thread, id("run"), "Ben")],
    ] as const) {
      const response = await call(path, {
        person: ben,
        ...(body ? { body } : {}),
      });
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Hello Ada");
    }

    // A new process over the same database: the conversation is still there.
    const restarted = await boot();
    const again = await restarted.call(
      `/threads/${thread}/messages?agentId=bot`,
      { person: ada },
    );
    expect(await again.text()).toContain("Hello Ada");
  });

  test("a busy thread: the probe names the run, a second run is 409, then idle again", async () => {
    const { call } = await boot();
    const ada = id("ada");
    const thread = id("thread");
    const probe = () =>
      call("/agent/bot/connect", {
        person: ada,
        body: input(thread, id("probe"), "", { openbotAsk: "live-run" }),
      });
    expect((await probe()).status).toBe(204);

    let open = () => {};
    EchoAgent.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const runId = id("run");
    const running = await call("/agent/bot/run", {
      person: ada,
      body: input(thread, runId, "Ada"),
    });
    expect(running.status).toBe(200);
    expect(await (await probe()).json()).toMatchObject({ runId });

    const refused = await call("/agent/bot/run", {
      person: ada,
      body: input(thread, id("run"), "Again"),
    });
    expect(refused.status).toBe(409);
    expect(await refused.text()).toMatch(/thread lock denied/i);

    open();
    EchoAgent.gate = undefined;
    expect(await running.text()).toContain("Hello Ada");
    expect((await probe()).status).toBe(204);
  });

  test("a headless turn shares the runner and the thread with the browser", async () => {
    const { backend, runtime, call } = await boot();
    const ada = id("ada");
    const thread = id("thread");
    expect(runtime.handoffRunner()).toBe(backend.runner);
    await (
      await call("/agent/bot/run", {
        person: ada,
        body: input(thread, id("run"), "Ada"),
      })
    ).text();
    const runTurn = createTurnRunner({
      admission: async ({ signal }) => signal ?? new AbortController().signal,
      intelligence: backend.client,
      runner: backend.runner,
      buildAgentFor: async () => new EchoAgent({ agentId: "bot" }),
    });
    const reply = await runTurn({
      ownerUserId: ada,
      routineId: "routine",
      agentId: "bot",
      threadId: thread,
      instruction: "Morning",
    });
    expect(reply.replyText).toContain("Hello");
    expect(await backend.store.activeRunId(thread)).toBeNull();
    const history = await runtime.history({ threadId: thread, actorId: ada });
    expect(history.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });
});
