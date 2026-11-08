/**
 * The keep-alive on the event streams of a local deployment (FREEDUET_INTELLIGENCE=off, issue #42).
 *
 * WHY. `Bun.serve` closes a connection that has sent nothing for its idle limit, 10 seconds by default
 * (http-server.ts sets none). With Intelligence off, a run and a connect are each one HTTP response
 * carrying the AG-UI events, so a member that thinks or runs a tool for 10 seconds without emitting an
 * event had its stream cut: the browser and the eval runner saw `ECONNRESET`. With Intelligence on,
 * the events travel over the gateway's WebSocket and these responses are short.
 *
 * WHY THE GUARD WRITES IT, NOT THE RUNTIME. `@copilotkit/runtime` 1.77 writes a keep-alive comment on
 * its SSE responses, but after 15 seconds of silence, which is longer than Bun's limit, and its timer
 * outlives a client that left: the runtime clones every response for an after-request hook
 * (`core/fetch-handler.mjs`), and a cloned body is cancelled only when both branches are. So the
 * runtime's keep-alive is off here (`RUNTIME_KEEP_ALIVE_SECONDS`, read by copilot.ts), and
 * {@link withKeepAlive} writes the comment instead, on a timer that stops when the stream ends, fails,
 * is cancelled or its request is aborted.
 *
 * The interval is OpenTag's heartbeat (delivery/opentag.ts), which keeps the same margin under the same
 * limit.
 */
import { AG_UI_HEARTBEAT_MS } from "../delivery/opentag";

/**
 * The runtime's own `sseKeepAliveIntervalSeconds`, 0: its keep-alive is off, and {@link withKeepAlive}
 * writes the comment in its place. Read once, when the runtime is constructed.
 */
export const RUNTIME_KEEP_ALIVE_SECONDS = 0;

/** Silence, in milliseconds, after which a stream says it is still there. Under Bun's 10 seconds. */
export const SSE_KEEP_ALIVE_MS = AG_UI_HEARTBEAT_MS;

/**
 * An SSE comment: a line that starts with a colon, which a parser drops by spec. The AG-UI client
 * reads only `data:` lines and ignores the rest (`@ag-ui/client` `parseSSEStream`), so a frame of only
 * this line carries no event.
 */
const KEEP_ALIVE_FRAME = new TextEncoder().encode(": keep-alive\n\n");

/**
 * The same response, with a keep-alive comment written whenever its stream has been quiet for
 * `intervalMs`.
 *
 * - Only an event stream is touched (`text/event-stream`, a 2xx); every other response comes back as
 *   it was.
 * - A comment goes in only between two events, never inside one: the bytes sent so far must end on a
 *   blank line. A comment inside an event would split it for the parser.
 * - The timer stops when the stream ends, fails, is cancelled, or the request's `signal` aborts (the
 *   client went away). An abort also cancels the body it was reading, so nothing keeps producing.
 */
export function withKeepAlive(
  response: Response,
  signal: AbortSignal,
  intervalMs = SSE_KEEP_ALIVE_MS,
): Response {
  const isEventStream =
    response.ok &&
    (response.headers.get("content-type") ?? "").includes("text/event-stream");
  if (!isEventStream || !response.body) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let finished = false;
  // The last two characters sent, so a blank line split across two chunks is still seen.
  let tail = "";
  // Whether the bytes sent so far end on a blank line: an event is complete, so a comment may follow.
  let betweenEvents = true;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    finish();
    reader.cancel().catch(() => undefined);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setInterval(() => {
        // A reader that is not keeping up skips the tick rather than queueing frames behind events.
        if (betweenEvents && (controller.desiredSize ?? 0) > 0)
          controller.enqueue(KEEP_ALIVE_FRAME);
      }, intervalMs);
      timer.unref?.();
    },
    async pull(controller) {
      const next = await reader.read().catch((error: unknown) => {
        finish();
        controller.error(error);
        return null;
      });
      if (next === null || finished) return;
      if (next.done) {
        finish();
        controller.close();
        return;
      }
      tail = (tail + decoder.decode(next.value, { stream: true })).slice(-2);
      betweenEvents = tail === "\n\n";
      controller.enqueue(next.value);
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
