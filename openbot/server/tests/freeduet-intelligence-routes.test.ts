/**
 * The runtime's thread routes with FREEDUET_INTELLIGENCE=off (#42): who may read, join, run and stop
 * a conversation, the 409 a busy thread answers, and the app's live-run probe.
 *
 * The real runtime (`mountCopilotRuntime`, SSE mode) behind the real guard, over the in-memory
 * stand-in for the store (support/fake-local-threads.ts). The store's own tests cover Postgres.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from "@ag-ui/client";
import type { Hono } from "hono";
import { Observable } from "rxjs";
import { loadConfig } from "../src/config";
import { mountCopilotRuntime } from "../src/copilot";
import type { Database } from "../src/db/client";
import {
  createThreadBackend,
  type LocalThreadBackend,
  localThreadBackend,
} from "../src/freeduet/backend";
import { isThreadLockDenied } from "../src/freeduet/local-intelligence";
import {
  createThreadGuard,
  guardedRoute,
  guardThreadRoutes,
} from "../src/freeduet/thread-routes";
import { testEnvironment } from "./support/environment";
import {
  createFakeThreadsModule,
  lockDenied,
  unknownThread,
} from "./support/fake-local-threads";

/**
 * Answers "Hello <what you said>", after `gate` opens when one is set: after RUN_STARTED, or before
 * anything at all with `gateFirst`.
 */
class EchoAgent extends AbstractAgent {
  static gate: Promise<void> | undefined;
  static gateFirst = false;
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      void (async () => {
        if (EchoAgent.gateFirst) await EchoAgent.gate;
        observer.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        } as BaseEvent);
        await EchoAgent.gate;
        const last = input.messages.at(-1);
        const messageId = `reply-${input.runId}`;
        observer.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        } as BaseEvent);
        observer.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: `Hello ${typeof last?.content === "string" ? last.content : ""}`,
        } as BaseEvent);
        observer.next({
          type: EventType.TEXT_MESSAGE_END,
          messageId,
        } as BaseEvent);
        observer.next({
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        } as BaseEvent);
        observer.complete();
      })();
    });
  }
}

const config = loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "off" }));

/** The signed-in person is named by a header; no header is nobody. */
const identifyUser = async (request: Request) => {
  const id = request.headers.get("x-test-person");
  if (!id) throw new Error("Not signed in");
  return { id, name: id };
};

let app: Hono;
let fake: ReturnType<typeof createFakeThreadsModule>;
let backend: LocalThreadBackend;
let runtime: ReturnType<typeof mountCopilotRuntime>;

beforeEach(async () => {
  fake = createFakeThreadsModule();
  EchoAgent.gate = undefined;
  EchoAgent.gateFirst = false;
  backend = localThreadBackend(
    await createThreadBackend(config, {} as Database, {
      threads: fake.module,
      log: () => {},
    }),
  );
  runtime = mountCopilotRuntime(
    config,
    {
      resolveAgentsForActor: async () => ({
        bot: new EchoAgent({ agentId: "bot" }),
        other: new EchoAgent({ agentId: "other" }),
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
  app = guardThreadRoutes(runtime.handler, backend, identifyUser);
});

function call(
  path: string,
  options: { person?: string; method?: string; body?: unknown } = {},
) {
  return app.fetch(
    new Request(`http://localhost/api/copilotkit${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(options.person ? { "x-test-person": options.person } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    }),
  );
}

const runInput = (
  threadId: string,
  runId: string,
  text = "Ada",
  forwardedProps: Record<string, unknown> = {},
) => ({
  threadId,
  runId,
  messages: text ? [{ id: `msg-${runId}`, role: "user", content: text }] : [],
  tools: [],
  context: [],
  state: {},
  forwardedProps,
});

const probe = (person: string, threadId: string, agent = "bot") =>
  call(`/agent/${agent}/connect`, {
    person,
    body: runInput(threadId, crypto.randomUUID(), "", {
      openbotAsk: "live-run",
    }),
  });

/** A run by `person`, read to its end. */
async function chat(person: string, threadId: string, runId: string) {
  const response = await call("/agent/bot/run", {
    person,
    body: runInput(threadId, runId),
  });
  return { status: response.status, text: await response.text() };
}

describe("one chat turn, kept in FreeDuet's store", () => {
  test("streams the answer and keeps both messages, in Intelligence's row shape", async () => {
    const turn = await chat("ada", "thread-1", "run-1");
    expect(turn.status).toBe(200);
    expect(turn.text).toContain("Hello Ada");

    const read = await call("/threads/thread-1/messages?agentId=bot", {
      person: "ada",
    });
    expect(read.status).toBe(200);
    const { messages } = (await read.json()) as {
      messages: { id: string; role: string; content?: unknown }[];
    };
    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "Ada" },
      { role: "assistant", content: "Hello Ada" },
    ]);
    expect(fake.store.threads.get("thread-1")).toMatchObject({
      userId: "ada",
      agentId: "bot",
    });
    // The run is over, so the thread is free again.
    expect(fake.store.locks.size).toBe(0);
  });

  test("a thread nobody has run yet reads as empty", async () => {
    const read = await call("/threads/never-used/messages?agentId=bot", {
      person: "ada",
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ messages: [] });
  });

  test("lists the person's own threads and nobody else's", async () => {
    await chat("ada", "thread-ada", "run-a");
    await chat("ben", "thread-ben", "run-b");
    const listed = (await (
      await call("/threads?agentId=bot", { person: "ada" })
    ).json()) as { threads: { id: string }[] };
    expect(listed.threads.map((thread) => thread.id)).toEqual(["thread-ada"]);
  });
});

describe("another person's conversation is not there", () => {
  beforeEach(async () => {
    expect((await chat("ada", "thread-ada", "run-ada")).status).toBe(200);
  });

  test("its messages answer 404", async () => {
    const read = await call("/threads/thread-ada/messages?agentId=bot", {
      person: "ben",
    });
    expect(read.status).toBe(404);
    expect(await read.text()).not.toContain("Hello Ada");
  });

  test("joining it answers 404, and so does the live-run probe", async () => {
    const join = await call("/agent/bot/connect", {
      person: "ben",
      body: runInput("thread-ada", "join-1", ""),
    });
    expect(join.status).toBe(404);
    expect(await join.text()).not.toContain("Hello Ada");
    expect((await probe("ben", "thread-ada")).status).toBe(404);
  });

  test("running in it answers 404 and nothing reaches the runner", async () => {
    const runs = fake.runner.runs.length;
    const turn = await chat("ben", "thread-ada", "run-ben");
    expect(turn.status).toBe(404);
    expect(fake.runner.runs.length).toBe(runs);
    expect(fake.store.threads.get("thread-ada")?.userId).toBe("ada");
  });

  test("stopping it answers 404", async () => {
    const stop = await call("/agent/bot/stop/thread-ada", {
      person: "ben",
      method: "POST",
    });
    expect(stop.status).toBe(404);
  });

  test("the owner still reads it", async () => {
    const read = await call("/threads/thread-ada/messages?agentId=bot", {
      person: "ada",
    });
    expect(read.status).toBe(200);
    expect(await read.text()).toContain("Hello Ada");
  });

  test("another Bot's run in it is refused", async () => {
    const turn = await call("/agent/other/run", {
      person: "ada",
      body: runInput("thread-ada", "run-other"),
    });
    expect(turn.status).toBe(403);
  });
});

describe("nobody signed in", () => {
  test.each([
    ["/agent/bot/run", runInput("t", "r")],
    ["/agent/bot/connect", runInput("t", "r", "")],
    ["/threads/t/messages", undefined],
    ["/threads", undefined],
  ])("%s answers 401", async (path, body) => {
    const response = await call(path, body ? { body } : {});
    expect(response.status).toBe(401);
  });

  test("the runtime still describes itself", async () => {
    const info = await call("/info");
    expect(info.status).toBe(200);
    expect(((await info.json()) as { mode: string }).mode).toBe("sse");
  });
});

describe("a busy thread", () => {
  test("the live-run probe answers 204 when idle and { runId } while a run holds the thread", async () => {
    expect((await probe("ada", "thread-busy")).status).toBe(204);
    await chat("ada", "thread-busy", "first");
    expect((await probe("ada", "thread-busy")).status).toBe(204);

    let open = () => {};
    EchoAgent.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const running = await call("/agent/bot/run", {
      person: "ada",
      body: runInput("thread-busy", "second"),
    });
    expect(running.status).toBe(200);
    const busy = await probe("ada", "thread-busy");
    expect(busy.status).toBe(200);
    expect(busy.headers.get("content-type")).toContain("application/json");
    expect(await busy.json()).toMatchObject({ runId: "second" });

    // Another run while that one holds the thread: 409, as Intelligence answered.
    const refused = await chat("ada", "thread-busy", "third");
    expect(refused.status).toBe(409);
    expect(refused.text).toMatch(/thread lock denied/i);
    expect(fake.runner.runs).not.toContain("third");

    open();
    expect(await running.text()).toContain("Hello Ada");
    expect((await probe("ada", "thread-busy")).status).toBe(204);
    expect((await chat("ada", "thread-busy", "fourth")).status).toBe(200);
  });

  test("a lock taken by a headless turn (a routine, a hand-off) refuses a browser run with 409", async () => {
    await chat("ada", "thread-routine", "first");
    await fake.store.acquireLock({
      threadId: "thread-routine",
      runId: "routine-run",
      userId: "ada",
      agentId: "bot",
      ttlSeconds: 120,
    });
    expect(await (await probe("ada", "thread-routine")).json()).toMatchObject({
      runId: "routine-run",
    });
    const refused = await chat("ada", "thread-routine", "browser-run");
    expect(refused.status).toBe(409);
    expect(JSON.parse(refused.text)).toMatchObject({
      error: "Thread lock denied",
    });
  });

  test("a run the runtime refuses before running leaves no lock behind", async () => {
    const refused = await call("/agent/nobody/run", {
      person: "ada",
      body: runInput("thread-nobody", "run-nobody"),
    });
    expect(refused.status).toBe(404);
    expect(fake.store.locks.has("thread-nobody")).toBe(false);
  });

  test("the guard takes no lock: a browser run is locked and freed by the runner", async () => {
    let open = () => {};
    EchoAgent.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const running = await call("/agent/bot/run", {
      person: "ada",
      body: runInput("thread-own", "own-run"),
    });
    expect(fake.store.locks.get("thread-own")?.runId).toBe("own-run");
    open();
    await running.text();
    expect(fake.store.locks.has("thread-own")).toBe(false);
  });

  /**
   * Two runs in the same instant both pass the store's answer; the runner refuses the second. Seen
   * here by making the store answer "idle" to the guard alone.
   */
  test("a refusal the runner throws, because this process runs the thread, is still a 409", async () => {
    let open = () => {};
    EchoAgent.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const first = await call("/agent/bot/run", {
      person: "ada",
      body: runInput("thread-race", "race-1"),
    });
    const activeRunId = fake.store.activeRunId;
    const isRunning = fake.runner.isRunning;
    fake.store.activeRunId = async () => null;
    fake.runner.isRunning = async () => false;
    try {
      const second = await chat("ada", "thread-race", "race-2");
      expect(second.status).toBe(409);
      expect(JSON.parse(second.text)).toMatchObject({
        error: "Thread lock denied",
      });
    } finally {
      fake.store.activeRunId = activeRunId;
      fake.runner.isRunning = isRunning;
    }
    open();
    expect(await first.text()).toContain("Hello Ada");
  });

  test("a refusal on the runner's stream, because another process holds the lock, is still a 409", async () => {
    await chat("ada", "thread-elsewhere", "first");
    await fake.store.acquireLock({
      threadId: "thread-elsewhere",
      runId: "other-process-run",
      userId: "ada",
      agentId: "bot",
      ttlSeconds: 120,
    });
    const activeRunId = fake.store.activeRunId;
    const isRunning = fake.runner.isRunning;
    let asked = 0;
    // The guard's own question answers idle; the runner's, a moment later, sees the holder.
    fake.store.activeRunId = async (threadId) =>
      asked++ === 0 ? null : activeRunId(threadId);
    fake.runner.isRunning = async () => false;
    try {
      const refused = await chat("ada", "thread-elsewhere", "this-process-run");
      expect(refused.status).toBe(409);
      expect(fake.runner.runs).not.toContain("this-process-run");
    } finally {
      fake.store.activeRunId = activeRunId;
      fake.runner.isRunning = isRunning;
    }
  });

  test("a run that says nothing for a while is handed on, and every byte still arrives", async () => {
    const guard = createThreadGuard({
      backend,
      identifyUser,
      forward: async (request) => runtime.handler.fetch(request),
      firstEventWaitMs: 20,
    });
    let open = () => {};
    EchoAgent.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    EchoAgent.gateFirst = true;
    const response = await guard(
      new Request("http://localhost/api/copilotkit/agent/bot/run", {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-person": "ada" },
        body: JSON.stringify(runInput("thread-slow", "slow-run")),
      }),
    );
    expect(response.status).toBe(200);
    open();
    const text = await response.text();
    expect(text).toContain("RUN_STARTED");
    expect(text).toContain("Hello Ada");
  });
});

describe("thread routes the store does not have", () => {
  test.each([
    ["GET", "/threads/t/events"],
    ["GET", "/threads/t/state"],
    ["POST", "/threads/t/archive"],
    ["POST", "/threads/clear"],
    ["POST", "/threads/subscribe"],
    ["PATCH", "/threads/t"],
    ["DELETE", "/threads/t"],
  ])("%s %s answers 501", async (method, path) => {
    const response = await call(path, { person: "ada", method });
    expect(response.status).toBe(501);
  });
});

describe("the guard reads paths as the runtime's router does", () => {
  test.each([
    ["/api/copilotkit/agent/bot/run", { kind: "run", agentId: "bot" }],
    ["/api/copilotkit/x/agent/bot/run", { kind: "run", agentId: "bot" }],
    [
      "/api/copilotkit/agent/a%20b/connect",
      { kind: "connect", agentId: "a b" },
    ],
    [
      "/api/copilotkit/agent/bot/stop/t1",
      { kind: "stop", agentId: "bot", threadId: "t1" },
    ],
    [
      "/api/copilotkit/threads/t1/messages",
      { kind: "messages", threadId: "t1" },
    ],
    ["/api/copilotkit/threads", { kind: "list" }],
    ["/api/copilotkit/threads/clear", { kind: "unsupported" }],
    ["/api/copilotkit/agent/bot/run/info", { kind: "other" }],
    ["/api/copilotkit/info", { kind: "other" }],
    ["/api/copilotkit/agent/bot/suggest", { kind: "other" }],
    ["/api/copilotkitx/agent/bot/run", { kind: "other" }],
  ])("%s", (path, expected) => {
    expect(guardedRoute(path, "/api/copilotkit")).toEqual(expected as never);
  });
});

describe("the store's errors, as the contract names them", () => {
  test("a lock denial is recognised by the store's error and by the adapter's 409", () => {
    const platform = Object.assign(new Error("busy"), {
      name: "PlatformRequestError",
      status: 409,
    });
    expect(isThreadLockDenied(lockDenied())).toBe(true);
    expect(isThreadLockDenied(platform)).toBe(true);
    expect(isThreadLockDenied(unknownThread())).toBe(false);
    expect(isThreadLockDenied(new Error("busy"))).toBe(false);
  });

  test("ThreadOwnershipError, somebody else creating the same id in the same instant, answers 404", async () => {
    await chat("ada", "thread-contested", "run-ada");
    const getThread = fake.store.getThread;
    // The guard's and the adapter's first reads see no thread; the create then meets the owner.
    let reads = 0;
    fake.store.getThread = async (threadId) =>
      reads++ < 2 ? null : getThread(threadId);
    try {
      const turn = await chat("ben", "thread-contested", "run-ben");
      expect(turn.status).toBe(404);
      expect(turn.text).not.toContain("Hello Ada");
    } finally {
      fake.store.getThread = getThread;
    }
    expect(fake.runner.runs).not.toContain("run-ben");
  });
});
