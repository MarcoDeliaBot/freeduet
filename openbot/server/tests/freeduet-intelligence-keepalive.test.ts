/**
 * The keep-alive on a run's and a connect's event stream, with FREEDUET_INTELLIGENCE=off (issue #42).
 *
 * Three layers:
 * - the AG-UI client's own parser drops the keep-alive comment (`parseSSEStream`, the parser the
 *   browser's CopilotKit client runs);
 * - `withKeepAlive` in isolation, with a short interval, for what it must and must not do: never write
 *   inside an event, stop its timer when the stream ends, fails or the request aborts;
 * - the real runtime (SSE mode, `mountCopilotRuntime`) behind the real guard (`guardThreadRoutes`),
 *   served by the real `startHttpServer` with Bun's own settings: the idle limit is Bun's default, 10
 *   seconds, and nothing here changes it. The agent says nothing for 12 seconds in the middle of its
 *   run, which is what a member that thinks or runs a tool for that long looks like. Real time, so the
 *   two silent cases take about 12 seconds each.
 *
 * The in-memory store stands in for Postgres (support/fake-local-threads.ts), as in
 * freeduet-intelligence-routes.test.ts.
 */
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  parseSSEStream,
  type RunAgentInput,
} from "@ag-ui/client";
import { lastValueFrom, Observable, toArray } from "rxjs";
import { loadConfig } from "../src/config";
import { mountCopilotRuntime } from "../src/copilot";
import type { Database } from "../src/db/client";
import { BUN_IDLE_TIMEOUT_MS } from "../src/delivery/opentag";
import {
  createThreadBackend,
  type LocalThreadBackend,
  localThreadBackend,
} from "../src/freeduet/backend";
import { SSE_KEEP_ALIVE_MS, withKeepAlive } from "../src/freeduet/keep-alive";
import { guardThreadRoutes } from "../src/freeduet/thread-routes";
import { startHttpServer } from "../src/http-server";
import { testEnvironment } from "./support/environment";
import { createFakeThreadsModule } from "./support/fake-local-threads";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

/** Longer than Bun's default idle limit of 10 seconds, which is what the real-server cases are for. */
const QUIET_MS = 12_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Says it has started, then waits for `hold` before its answer. The timing cases hold for 12 seconds;
 * the abort case holds on a gate the test opens, so nothing is left running when the test ends.
 */
class QuietAgent extends AbstractAgent {
  static hold: () => Promise<void> = () => sleep(QUIET_MS);

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      void (async () => {
        observer.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        } as BaseEvent);
        await QuietAgent.hold();
        const messageId = `reply-${input.runId}`;
        observer.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        } as BaseEvent);
        observer.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: "Done.",
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

/**
 * Counts the intervals of one period that are armed. The keep-alive is one interval, so after its
 * stream ends, fails or its request aborts, none of that period may still be armed.
 */
function trackIntervals(everyMs: number) {
  const armed = new Set<unknown>();
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = ((
    handler: (...args: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ) => {
    const timer = realSet(handler, ms, ...args);
    if (ms === everyMs) armed.add(timer);
    return timer;
  }) as typeof setInterval;
  globalThis.clearInterval = ((timer?: unknown) => {
    armed.delete(timer);
    realClear(timer as Parameters<typeof clearInterval>[0]);
  }) as typeof clearInterval;
  return {
    armed: () => armed.size,
    restore: () => {
      globalThis.setInterval = realSet;
      globalThis.clearInterval = realClear;
    },
  };
}

async function untilDisarmed(timers: { armed: () => number }, ms = 2_000) {
  const deadline = Date.now() + ms;
  while (timers.armed() > 0 && Date.now() < deadline) await sleep(10);
}

const encode = (text: string) => new TextEncoder().encode(text);

/** The text a stream carries, read to its end. */
async function readText(response: Response): Promise<string> {
  return response.text();
}

/**
 * The events the AG-UI client's own parser reads out of `text`, as the browser's CopilotKit client
 * runs it (`parseSSEStream`, which the HTTP agent uses for `text/event-stream`). The source emits after
 * a tick: the parser subscribes to it at once and emits into a plain subject, so a source that emitted
 * synchronously would be lost before anybody listens.
 */
function parsedEvents(text: string): Promise<unknown[]> {
  const source = new Observable<{ type: "data"; data: Uint8Array }>(
    (subscriber) => {
      const timer = setTimeout(() => {
        subscriber.next({ type: "data", data: encode(text) });
        subscriber.complete();
      }, 0);
      return () => clearTimeout(timer);
    },
  );
  return lastValueFrom(parseSSEStream(source as never).pipe(toArray()));
}

/** A stream of the given chunks, one per `pause`, that then ends. */
function chunked(chunks: string[], pauseMs = 0): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encode(chunk));
        if (pauseMs) await sleep(pauseMs);
      }
      controller.close();
    },
  });
}

const eventStream = (body: ReadableStream<Uint8Array>) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

describe("the keep-alive", () => {
  test("is written before Bun's idle limit closes a quiet connection", () => {
    // Bun's default is 10 seconds, and nothing in this suite changes it. A comment every few seconds
    // keeps a stream that is silent for a long time open, and this is the margin the tests rely on.
    expect(SSE_KEEP_ALIVE_MS).toBeLessThan(BUN_IDLE_TIMEOUT_MS);
  });

  test("is a comment the AG-UI client's parser drops, so no event is invented", async () => {
    const events = await parsedEvents(
      [
        ": keep-alive\n\n",
        'data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}\n\n',
        ": keep-alive\n\n",
        ": keep-alive\n\n",
        'data: {"type":"RUN_FINISHED","threadId":"t","runId":"r"}\n\n',
      ].join(""),
    );
    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      { type: "RUN_FINISHED", threadId: "t", runId: "r" },
    ]);
  });
});

describe("withKeepAlive", () => {
  const every = 30;

  test("writes its comment between events and never inside one", async () => {
    // The first event is cut in two, with several ticks in the gap: none may land inside it.
    const source = chunked(
      ['data: {"type":"A",', '"n":1}\n\n', 'data: {"type":"B"}\n\n'],
      120,
    );
    const timers = trackIntervals(every);
    try {
      const text = await readText(
        withKeepAlive(eventStream(source), new AbortController().signal, every),
      );
      expect(text).toContain(": keep-alive\n\n");
      // A comment is only ever right after a blank line, or at the very start.
      const comments = [...text.matchAll(/: keep-alive\n\n/g)];
      for (const match of comments) {
        const before = text.slice(0, match.index);
        expect(before === "" || before.endsWith("\n\n")).toBe(true);
      }
      expect(await parsedEvents(text)).toEqual([
        { type: "A", n: 1 },
        { type: "B" },
      ]);
    } finally {
      timers.restore();
    }
  });

  test("leaves a response that is not an event stream as it was", () => {
    const response = Response.json({ ok: true });
    expect(withKeepAlive(response, new AbortController().signal, every)).toBe(
      response,
    );
  });

  test("ends with its source and clears its timer", async () => {
    const timers = trackIntervals(every);
    try {
      const text = await readText(
        withKeepAlive(
          eventStream(chunked(['data: {"type":"A"}\n\n'], 80)),
          new AbortController().signal,
          every,
        ),
      );
      // The event is whole, and a comment after it is fine: the pause is longer than the interval.
      expect(text).toContain('data: {"type":"A"}\n\n');
      expect(timers.armed()).toBe(0);
    } finally {
      timers.restore();
    }
  });

  test("fails with its source and clears its timer", async () => {
    const timers = trackIntervals(every);
    try {
      const failing = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encode('data: {"type":"A"}\n\n'));
          await sleep(80);
          controller.error(new Error("upstream failed"));
        },
      });
      const response = withKeepAlive(
        eventStream(failing),
        new AbortController().signal,
        every,
      );
      await expect(readText(response)).rejects.toThrow("upstream failed");
      expect(timers.armed()).toBe(0);
    } finally {
      timers.restore();
    }
  });

  test("cancels its source and clears its timer when the request aborts", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('data: {"type":"A"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const timers = trackIntervals(every);
    try {
      const controller = new AbortController();
      const response = withKeepAlive(
        eventStream(source),
        controller.signal,
        every,
      );
      const reader = response.body?.getReader();
      expect((await reader?.read())?.done).toBe(false);
      await sleep(3 * every);
      expect(timers.armed()).toBe(1);

      controller.abort();
      await untilDisarmed(timers);
      expect(timers.armed()).toBe(0);
      expect(cancelled).toBe(true);
    } finally {
      timers.restore();
    }
  });

  test("does nothing at all for a request that was already aborted", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('data: {"type":"A"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const timers = trackIntervals(every);
    try {
      const controller = new AbortController();
      controller.abort();
      withKeepAlive(eventStream(source), controller.signal, every);
      await sleep(3 * every);
      expect(timers.armed()).toBe(0);
      expect(cancelled).toBe(true);
    } finally {
      timers.restore();
    }
  });
});

describe("a run or a connect that is quiet longer than Bun's idle limit", () => {
  let server: { addresses: string[]; stop: () => void };
  let baseUrl: string;
  let backend: LocalThreadBackend;
  const config = loadConfig(testEnvironment({ FREEDUET_INTELLIGENCE: "off" }));

  /** The signed-in person is named by a header; no header is nobody. */
  const identifyUser = async (request: Request) => {
    const id = request.headers.get("x-test-person");
    if (!id) throw new Error("Not signed in");
    return { id, name: id };
  };

  const runInput = (threadId: string, runId: string, messages = true) => ({
    threadId,
    runId,
    messages: messages
      ? [{ id: `msg-${runId}`, role: "user", content: "Ada" }]
      : [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  });

  beforeAll(async () => {
    // A free port for the real server: bind 0, read it, let it go.
    const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
    const port = probe.port ?? 0;
    probe.stop(true);

    const fake = createFakeThreadsModule();
    backend = localThreadBackend(
      await createThreadBackend(config, {} as Database, {
        threads: fake.module,
        log: () => {},
      }),
    );
    const runtime = mountCopilotRuntime(
      config,
      {
        resolveAgentsForActor: async () => ({
          bot: new QuietAgent({ agentId: "bot" }),
        }),
        resolveAgentForActor: async () => new QuietAgent({ agentId: "bot" }),
      },
      identifyUser,
      async (request) => ({
        id: request.headers.get("x-test-person") ?? "",
        role: "user",
      }),
      { threadBackend: backend },
    );
    const app = guardThreadRoutes(runtime.handler, backend, identifyUser);
    server = startHttpServer({
      port,
      config: {
        ...config,
        listen: [{ host: "127.0.0.1", required: true, local: true }],
      },
      resolveRequestActor: async () => ({
        id: "ada",
        name: "ada",
        role: "user",
      }),
      agentProfileStore: undefined as never,
      computerGateway: undefined,
      demonstrationStore: undefined as never,
      demonstrationRecorder: undefined as never,
      app,
    });
    baseUrl = `http://127.0.0.1:${port}/api/copilotkit`;
  });

  afterAll(() => {
    server.stop();
  });

  beforeEach(() => {
    QuietAgent.hold = () => sleep(QUIET_MS);
  });

  function post(
    path: string,
    person: string,
    body: unknown,
    signal?: AbortSignal,
  ) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-person": person },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  test("a run still reaches RUN_FINISHED on the same connection, and its timer ends with it", async () => {
    const timers = trackIntervals(SSE_KEEP_ALIVE_MS);
    try {
      const response = await post(
        "/agent/bot/run",
        "ada",
        runInput("thread-quiet", "quiet-run"),
      );
      expect(response.status).toBe(200);
      // A socket Bun closes for idleness rejects this read; nothing here should throw.
      const text = await response.text();
      expect(text).toContain("RUN_STARTED");
      expect(text).toContain("RUN_FINISHED");
      expect(timers.armed()).toBe(0);
    } finally {
      timers.restore();
    }
  }, 30_000);

  test("a connect on a busy thread stays open through the same silence", async () => {
    const running = await post(
      "/agent/bot/run",
      "ada",
      runInput("thread-busy-quiet", "busy-run"),
    );
    expect(running.status).toBe(200);
    const runText = running.text();

    const connected = await post(
      "/agent/bot/connect",
      "ada",
      runInput("thread-busy-quiet", crypto.randomUUID(), false),
    );
    expect(connected.status).toBe(200);
    const [connectText, endOfRun] = await Promise.all([
      connected.text(),
      runText,
    ]);
    expect(connectText).toContain("RUN_STARTED");
    expect(connectText).toContain("RUN_FINISHED");
    expect(endOfRun).toContain("RUN_FINISHED");
  }, 30_000);

  test("a client that goes away mid-run clears the keep-alive timer", async () => {
    let finish = () => {};
    QuietAgent.hold = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const timers = trackIntervals(SSE_KEEP_ALIVE_MS);
    try {
      const controller = new AbortController();
      const response = await post(
        "/agent/bot/run",
        "ada",
        runInput("thread-abort", "abort-run"),
        controller.signal,
      );
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      const decoder = new TextDecoder();
      let seen = "";
      while (!seen.includes("RUN_STARTED")) {
        const next = await reader?.read();
        if (!next || next.done) break;
        seen += decoder.decode(next.value);
      }
      // Quiet now, so the keep-alive is armed: the probe must see it, or the next check proves nothing.
      expect(timers.armed()).toBeGreaterThan(0);

      controller.abort();
      await reader?.cancel().catch(() => undefined);
      await untilDisarmed(timers);
      expect(timers.armed()).toBe(0);
    } finally {
      finish();
      timers.restore();
    }
  }, 15_000);
});
