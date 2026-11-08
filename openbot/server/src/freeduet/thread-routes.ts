/**
 * Who may use a conversation, when the runtime runs without CopilotKit Intelligence (issue #42).
 *
 * WHY THIS EXISTS. In Intelligence mode the runtime asks `identifyUser` on every run, join and stop,
 * and Intelligence scopes each thread to that person. In SSE mode, which FREEDUET_INTELLIGENCE=off
 * uses, it does neither: `/agent/:id/connect` replays any thread id it is given, `/run` runs in it,
 * and the thread routes answer from the runner with no user at all (`@copilotkit/runtime` 1.77,
 * `handlers/sse/*.mjs`, `handlers/intelligence/threads.mjs`). Left alone, anybody signed in could
 * read or write anybody's conversation by its id.
 *
 * SO THE COPILOT HANDLER IS WRAPPED. Before a request reaches the runtime:
 * - `run`, `connect` and `stop` need a signed-in person (the same `identifyUser` the runtime is given
 *   in Intelligence mode), and a thread that is somebody else's answers 404, as it did with
 *   Intelligence, where another person's thread is simply not there;
 * - `run` creates the thread for that person. A thread another run holds answers 409 "Thread lock
 *   denied", as Intelligence did; the app and the eval runner wait and try again on exactly that.
 *   The guard does NOT take the lock: whoever takes it releases it (`threads/pg-runner.ts`), and a
 *   browser run is the runner's own to lock and free. So the guard asks the store who holds the
 *   thread, and the race it cannot see (two runs in the same instant) is caught where the runner
 *   refuses: `ThreadLockDeniedError`, thrown by `run()` or sent down its stream, which
 *   `runnerForRuntime` turns into one recognisable event and the guard into the same 409;
 * - the app's live-run probe (`connect` with `forwardedProps.openbotAsk === "live-run"`,
 *   `app/src/lib/channels/follow-turn.ts`) answers 204 when the thread is idle and `{ runId }` when a
 *   run holds it, the two answers Intelligence's join gave, instead of a replay;
 * - `GET /threads/:id/messages` and `GET /threads` are answered from the store in Intelligence's row
 *   shape. The other thread routes have no local counterpart and answer 501.
 *
 * Everything else (`/info`, suggestions, transcription) goes to the runtime untouched, as it did in
 * Intelligence mode. With Intelligence on, the handler is returned unchanged.
 */
import { type BaseEvent, EventType } from "@ag-ui/client";
import type { AgentRunner } from "@copilotkit/runtime/v2";
import { Hono } from "hono";
import { catchError, defer, of, throwError } from "rxjs";
import type { IdentifyUser } from "../copilot";
import type { LocalThreadBackend, ThreadBackend } from "./backend";
import { isThreadLockDenied } from "./local-intelligence";

export const COPILOT_BASE_PATH = "/api/copilotkit";

/** The code on the event a refused run becomes. Read back by the guard below, nowhere else. */
export const LOCK_DENIED_CODE = "THREAD_LOCK_DENIED";

/**
 * How long the guard waits for a run's first event before handing the stream on. A refusal is
 * there at once (thrown, or after one lock query); a run that is working may take longer to say
 * anything, and then it is simply passed through.
 */
const FIRST_EVENT_WAIT_MS = 2_000;

/**
 * The shared runner as the runtime is given it: the SAME instance, with a refused lock turned into
 * an event.
 *
 * Without this the runtime's SSE handler meets `ThreadLockDeniedError` as a thrown error or a
 * stream error, logs it and closes a 200 stream with nothing in it, and the person's message
 * vanishes. As an event it reaches the guard, which answers 409 as Intelligence did. Every other
 * error passes through unchanged, and `connect`, `isRunning` and `stop` go straight to the runner.
 */
export function runnerForRuntime(runner: AgentRunner): AgentRunner {
  return {
    run: (request) =>
      defer(() => runner.run(request)).pipe(
        catchError((error: unknown) =>
          isThreadLockDenied(error)
            ? of({
                type: EventType.RUN_ERROR,
                message: "Thread lock denied",
                code: LOCK_DENIED_CODE,
              } as BaseEvent)
            : throwError(() => error),
        ),
      ),
    connect: (request) => runner.connect(request),
    isRunning: (request) => runner.isRunning(request),
    stop: (request) => runner.stop(request),
  };
}

/** Whether one SSE frame is the event `runnerForRuntime` makes of a refused lock. */
function isLockDeniedFrame(frame: string): boolean {
  for (const line of frame.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const event = JSON.parse(line.slice(5)) as {
        type?: unknown;
        code?: unknown;
      };
      return (
        event.type === EventType.RUN_ERROR && event.code === LOCK_DENIED_CODE
      );
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Reads a run's stream up to its first event, at most `waitMs`, and says whether that event is a
 * refused lock. Otherwise hands back a response that still carries every byte, the ones read
 * included, so the browser sees the stream it would have seen.
 */
async function lockDeniedAtStart(
  response: Response,
  waitMs: number,
): Promise<{ denied: boolean; response: Response }> {
  const body = response.body;
  if (!body) return { denied: false, response };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let text = "";
  let done = false;
  let pending: ReturnType<typeof reader.read> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), waitMs);
  });
  try {
    while (!text.includes("\n\n")) {
      pending ??= reader.read();
      const next = await Promise.race([pending, late]);
      if (next === "late") break;
      pending = undefined;
      if (next.done) {
        done = true;
        break;
      }
      chunks.push(next.value);
      text += decoder.decode(next.value, { stream: true });
    }
  } finally {
    clearTimeout(timer);
  }
  if (isLockDeniedFrame(text.split("\n\n")[0] ?? "")) {
    await reader.cancel().catch(() => undefined);
    return { denied: true, response };
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (done) controller.close();
    },
    async pull(controller) {
      // A read started before the wait ran out is the next chunk; a second read would skip it.
      const next = await (pending ?? reader.read());
      pending = undefined;
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return {
    denied: false,
    response: new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  };
}

/**
 * Which runtime route a path is, matched the way the runtime matches it (`core/fetch-router.mjs`):
 * on its last segments, in the same order. A guard that read paths differently from the router
 * behind it could be walked around.
 */
type GuardedRoute =
  | { kind: "run" | "connect"; agentId: string }
  | { kind: "stop"; agentId: string; threadId: string }
  | { kind: "messages"; threadId: string }
  | { kind: "list" }
  | { kind: "unsupported" }
  | { kind: "other" };

function decode(segment: string | undefined): string | null {
  if (segment === undefined) return null;
  try {
    return decodeURIComponent(segment) || null;
  } catch {
    return null;
  }
}

export function guardedRoute(pathname: string, basePath: string): GuardedRoute {
  if (!pathname.startsWith(basePath)) return { kind: "other" };
  const rest = pathname.slice(basePath.length);
  if (rest.length > 0 && !rest.startsWith("/")) return { kind: "other" };
  const s = rest.split("/").filter(Boolean);
  const n = s.length;
  const last = s[n - 1];
  // The runtime's own routes that are checked before the agent routes, and need no guard here.
  if (
    n >= 1 &&
    [
      "info",
      "inspector-metadata",
      "inspector-learning",
      "transcribe",
      "cpk-debug-events",
    ].includes(last ?? "")
  )
    return { kind: "other" };
  if (
    n >= 3 &&
    s[n - 3] === "agent" &&
    (last === "run" || last === "connect")
  ) {
    const agentId = decode(s[n - 2]);
    return agentId ? { kind: last, agentId } : { kind: "other" };
  }
  if (n >= 3 && s[n - 3] === "agent" && last === "suggest")
    return { kind: "other" };
  if (n >= 3 && s[n - 3] === "trajectory" && last === "connect")
    return { kind: "other" };
  if (n >= 4 && s[n - 4] === "agent" && s[n - 2] === "stop") {
    const agentId = decode(s[n - 3]);
    const threadId = decode(last);
    return agentId && threadId
      ? { kind: "stop", agentId, threadId }
      : { kind: "other" };
  }
  if (n >= 2 && s[n - 2] === "threads" && last === "subscribe")
    return { kind: "unsupported" };
  if (n >= 3 && s[n - 3] === "threads" && last === "messages") {
    const threadId = decode(s[n - 2]);
    return threadId ? { kind: "messages", threadId } : { kind: "other" };
  }
  if (
    n >= 3 &&
    s[n - 3] === "threads" &&
    ["events", "state", "archive"].includes(last ?? "")
  )
    return { kind: "unsupported" };
  // `threads/clear`, and updating or deleting one thread.
  if (n >= 2 && s[n - 2] === "threads") return { kind: "unsupported" };
  if (n >= 1 && last === "threads") return { kind: "list" };
  return { kind: "other" };
}

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

const SIGN_IN = () =>
  json(401, { error: "Unauthorized", message: "Sign in to continue." });
const NOT_FOUND = () =>
  json(404, {
    error: "Thread not found",
    message: "This conversation isn't available.",
  });
const OTHER_BOT = () =>
  json(403, {
    error: "Thread access denied",
    message: "This conversation belongs to another Bot.",
  });
const LOCKED = () =>
  json(409, {
    error: "Thread lock denied",
    message:
      "This Bot is still working in this conversation. Wait for it, or stop it first.",
  });
const UNSUPPORTED = () =>
  json(501, {
    error: "Not available",
    message: "This isn't available without CopilotKit Intelligence.",
  });
const BAD_REQUEST = () =>
  json(400, {
    error: "Invalid request body",
    message: "Couldn't read the request.",
  });

/** The fields of a run or join body the guard reads. The runtime validates the rest itself. */
async function readInput(request: Request): Promise<{
  threadId: string;
  runId?: string;
  forwardedProps?: Record<string, unknown>;
} | null> {
  try {
    const body: unknown = await request.clone().json();
    if (!body || typeof body !== "object") return null;
    const { threadId, runId, forwardedProps } = body as Record<string, unknown>;
    if (typeof threadId !== "string" || !threadId.trim()) return null;
    return {
      threadId,
      ...(typeof runId === "string" && runId.trim() ? { runId } : {}),
      ...(forwardedProps && typeof forwardedProps === "object"
        ? { forwardedProps: forwardedProps as Record<string, unknown> }
        : {}),
    };
  } catch {
    return null;
  }
}

/** A response that is the run's event stream, rather than a refusal the runtime answered itself. */
const isEventStream = (response: Response) =>
  response.ok &&
  (response.headers.get("content-type") ?? "").includes("text/event-stream");

export function createThreadGuard(options: {
  backend: LocalThreadBackend;
  identifyUser: IdentifyUser;
  /** The runtime's own handler, reached only once the guard lets a request through. */
  forward: (request: Request) => Promise<Response>;
  basePath?: string;
  /** See FIRST_EVENT_WAIT_MS; a test shortens it. */
  firstEventWaitMs?: number;
}) {
  const { backend, identifyUser, forward } = options;
  const { store, client, runner } = backend;
  const basePath = options.basePath ?? COPILOT_BASE_PATH;
  const firstEventWaitMs = options.firstEventWaitMs ?? FIRST_EVENT_WAIT_MS;

  const whoIsAsking = async (request: Request) => {
    try {
      const user = await identifyUser(request);
      return user.id ? user : null;
    } catch {
      return null;
    }
  };

  return async (request: Request): Promise<Response> => {
    const route = guardedRoute(new URL(request.url).pathname, basePath);
    if (route.kind === "other" || request.method === "OPTIONS")
      return forward(request);
    const user = await whoIsAsking(request);
    if (!user) return SIGN_IN();

    if (route.kind === "unsupported") return UNSUPPORTED();

    if (route.kind === "list") {
      if (request.method !== "GET") return UNSUPPORTED();
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit"));
      const page = await store.listThreads({
        userId: user.id,
        ...(url.searchParams.get("agentId")
          ? { agentId: url.searchParams.get("agentId") as string }
          : {}),
        ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
        ...(url.searchParams.get("cursor")
          ? { cursor: url.searchParams.get("cursor") as string }
          : {}),
      });
      return Response.json({
        threads: page.threads.map((thread) => ({
          id: thread.threadId,
          name: thread.name,
          agentId: thread.agentId,
          createdById: thread.userId,
          archived: false,
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      });
    }

    if (route.kind === "messages") {
      if (request.method !== "GET") return UNSUPPORTED();
      const thread = await store.getThread(route.threadId);
      if (thread && thread.userId !== user.id) return NOT_FOUND();
      // A thread nobody has run yet reads as empty, as IntelligenceKnowingANewThread made it read.
      return Response.json({
        messages: thread ? await store.getThreadMessages(route.threadId) : [],
      });
    }

    if (route.kind === "stop") {
      const thread = await store.getThread(route.threadId);
      if (!thread || thread.userId !== user.id) return NOT_FOUND();
      if (thread.agentId !== route.agentId) return OTHER_BOT();
      return forward(request);
    }

    const input = await readInput(request);
    if (!input) return BAD_REQUEST();
    const thread = await store.getThread(input.threadId);
    if (thread && thread.userId !== user.id) return NOT_FOUND();
    if (thread && thread.agentId !== route.agentId) return OTHER_BOT();

    if (route.kind === "connect") {
      if (input.forwardedProps?.openbotAsk === "live-run") {
        const runId = thread ? await store.activeRunId(thread.threadId) : null;
        return runId
          ? Response.json({ threadId: input.threadId, runId })
          : new Response(null, { status: 204 });
      }
      return forward(request);
    }

    // A run. The runner needs the thread's row, with its owner, before it can take the lock.
    if (!input.runId) return BAD_REQUEST();
    try {
      await client.getOrCreateThread({
        threadId: input.threadId,
        userId: user.id,
        agentId: route.agentId,
      });
    } catch (error) {
      if ((error as { status?: unknown } | null)?.status === 404)
        return NOT_FOUND();
      throw error;
    }
    // Held by a headless turn, a hop, or a run in this process that has not taken the lock yet.
    if (
      (await store.activeRunId(input.threadId)) !== null ||
      (await runner.isRunning({ threadId: input.threadId }))
    )
      return LOCKED();
    let response: Response;
    try {
      response = await forward(request);
    } catch (error) {
      if (isThreadLockDenied(error)) return LOCKED();
      throw error;
    }
    if (!isEventStream(response)) return response;
    const read = await lockDeniedAtStart(response, firstEventWaitMs);
    return read.denied ? LOCKED() : read.response;
  };
}

/**
 * The copilot handler, guarded when the switch is off. With Intelligence it is returned as it is:
 * Intelligence checks the person itself.
 */
export function guardThreadRoutes(
  handler: Hono,
  backend: ThreadBackend,
  identifyUser: IdentifyUser,
  basePath: string = COPILOT_BASE_PATH,
): Hono {
  if (backend.mode !== "local") return handler;
  const guard = createThreadGuard({
    backend,
    identifyUser,
    basePath,
    forward: async (request) => handler.fetch(request),
  });
  const guarded = new Hono();
  guarded.all(`${basePath}/*`, (context) => guard(context.req.raw));
  guarded.all(basePath, (context) => handler.fetch(context.req.raw));
  return guarded;
}
