/**
 * Reading a thread's messages out of the AG-UI events its runs produced.
 *
 * WHY THE CLIENT'S OWN REDUCER. `defaultApplyEvents` from `@ag-ui/client` is what every agent and
 * the browser use to turn events into messages: text, tool calls and their results, reasoning,
 * activity (generative UI, A2UI) and snapshots. Running the same reducer here means the history the
 * server reads back is the history the browser showed, and nothing is reimplemented that AG-UI
 * already maintains. The runtime has no helper of its own for this; its in-memory runner keeps the
 * agent's message array instead, which a restart loses.
 *
 * ONE DIFFERENCE, ON PURPOSE: A SNAPSHOT NEVER DELETES. AG-UI's `MESSAGES_SNAPSHOT` replaces the
 * list, dropping every message it does not name. An agent's snapshot names the conversation its run
 * was given, and a browser run is given what the open tab holds. A routine that wrote into the
 * thread while the tab was open is not in it, so a literal replay would erase the routine's messages
 * from the history. Here a snapshot updates the messages it names and adds the ones that are new,
 * and leaves the rest where they are. The same rule rewrites the snapshot events a replay sends to
 * the browser, so the browser's reducer, which does delete, has nothing left to delete.
 */
import type {
  AbstractAgent,
  AgentSubscriber,
  BaseEvent,
  Message,
  MessagesSnapshotEvent,
  RunAgentInput,
} from "@ag-ui/client";
import { compactEvents, defaultApplyEvents, EventType } from "@ag-ui/client";
import { createRunEventFinalizer } from "@copilotkit/runtime/v2";
import { from } from "rxjs";
import type { StoredThreadMessage } from "./contract";

/** The messages a sequence of events adds up to, and the events with every snapshot made additive. */
export async function reduceEvents(events: BaseEvent[]): Promise<{
  messages: Message[];
  events: BaseEvent[];
}> {
  const rewritten = new Map<BaseEvent, BaseEvent>();
  const additiveSnapshots: AgentSubscriber = {
    onMessagesSnapshotEvent: ({ event, messages }) => {
      const merged = mergeMessages(messages, event.messages);
      rewritten.set(event, { ...event, messages: merged } as BaseEvent);
      // A fresh copy: in test and development the reducer freezes what it hands a subscriber, and
      // it later appends streamed text to these same objects in place.
      return { messages: structuredClone(merged), stopPropagation: true };
    },
  };

  /*
   * The reducer reads two things from the agent: the messages to start from, and a place to put
   * the interrupts a finished run announces. Nothing here runs an agent, so a plain object holding
   * those two is the whole of what it needs.
   */
  const reader = {
    messages: [],
    pendingInterrupts: [],
  } as unknown as AbstractAgent;
  const input: RunAgentInput = {
    threadId: "",
    runId: "",
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };

  /*
   * Taken from every mutation as it passes rather than from the last one, which may carry state
   * alone. A stored history the reducer cannot read to the end still yields every message before
   * the event it stopped on: a thread that shows most of itself beats one that shows nothing.
   */
  let messages: Message[] = [];
  await new Promise<void>((resolve) => {
    defaultApplyEvents(input, from(events), reader, [
      additiveSnapshots,
    ]).subscribe({
      next: (mutation) => {
        if (mutation.messages !== undefined) messages = mutation.messages;
      },
      error: (error: unknown) => {
        console.warn(
          "[freeduet-threads] a stored history could not be read to the end:",
          error instanceof Error ? error.message : error,
        );
        resolve();
      },
      complete: () => resolve(),
    });
  });

  return {
    messages,
    events: events.map((event) => rewritten.get(event) ?? event),
  };
}

/** `current` with `incoming` laid over it by id: matching ids updated in place, new ones appended. */
function mergeMessages(
  current: readonly Message[],
  incoming: MessagesSnapshotEvent["messages"],
): Message[] {
  const byId = new Map(incoming.map((message) => [message.id, message]));
  const merged = current.map((message) => byId.get(message.id) ?? message);
  const present = new Set(current.map((message) => message.id));
  for (const message of incoming) {
    if (!present.has(message.id)) merged.push(message);
  }
  return merged;
}

/**
 * What sealing may add before a terminal event: the END of something the agent started. Never an
 * answer to a tool call, an error for a subagent, or a terminal event of its own.
 */
const SEALING_ENDS: ReadonlySet<string> = new Set([
  EventType.REASONING_MESSAGE_END,
  EventType.REASONING_END,
  EventType.TEXT_MESSAGE_END,
  EventType.TOOL_CALL_END,
]);

/**
 * Every run's events closed before its terminal event, for storage.
 *
 * AG-UI lets an agent end a run with RUN_ERROR while a text message or a tool call is still open.
 * Compaction then moves the open message to the end of the run's events, AFTER the RUN_ERROR, and a
 * replay that carries anything after a RUN_ERROR is refused by the browser's event verifier. So
 * what is stored ends what was left open just before the run ended. The live stream is not touched:
 * the browser that watched the run already received it as the agent sent it.
 *
 * A TOOL_CALL_RESULT IS NEVER MADE UP HERE. A call that was announced and ended but has no result
 * when the Bot's own RUN_FINISHED arrives is not a call that failed: it is a call OpenBot has to run
 * (a frontend tool, `report_refusal`) or one that waits for the person (an approval, which ends the
 * run with an interrupt). It stays open, as in the runtime's own runners and in Intelligence, until
 * the client's next run or the approvals resume brings the real result. The finalizer's answer for
 * an open call, `{"status":"error","reason":"missing_terminal_event"}`, was stored here once, before
 * every such RUN_FINISHED: a client that read the conversation back found the call answered, never
 * ran it, and the history sanitiser kept that first answer over the real one.
 *
 * Runs that did end abruptly (the Bot's stream failed, a stop, a lost lock, a dead process) are
 * closed, with their answers and a RUN_ERROR or a cancelled RUN_FINISHED, before their events reach
 * this function: by the runner's `finish` and by `endLastRun`.
 */
export function sealRuns(events: BaseEvent[]): BaseEvent[] {
  const sealed: BaseEvent[] = [];
  let finalizer = createRunEventFinalizer();
  for (const event of events) {
    if (event.type === EventType.RUN_STARTED) {
      finalizer = createRunEventFinalizer();
    }
    if (
      event.type === EventType.RUN_ERROR ||
      event.type === EventType.RUN_FINISHED
    ) {
      const closers = finalizer
        .finalize()
        .filter((closer) => SEALING_ENDS.has(closer.type));
      sealed.push(...closers, event);
      finalizer = createRunEventFinalizer();
      continue;
    }
    finalizer.observe(event);
    sealed.push(event);
  }
  return sealed;
}

/**
 * The events with the last run in them ended, if it never was: open messages and tool calls closed
 * and a RUN_ERROR carrying `message`. A row can hold more than one attempt of the same run id, so
 * only the attempt after the last RUN_STARTED is looked at.
 */
export function endLastRun(events: BaseEvent[], message: string): BaseEvent[] {
  // A run that recorded nothing has nothing to end, and a lone RUN_ERROR would be a turn nobody took.
  if (events.length === 0) return [];
  let start = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === EventType.RUN_STARTED) {
      start = index;
      break;
    }
  }
  const finalizer = createRunEventFinalizer();
  for (const event of events.slice(start)) finalizer.observe(event);
  return [...events, ...finalizer.finalize({ interruptionMessage: message })];
}

/** What a run's row holds: its own events, sealed and compacted. */
export function storedEvents(events: BaseEvent[]): BaseEvent[] {
  return compactEvents(sealRuns(events));
}

/** The message ids a run's events already put in the thread, including its input messages. */
export function messageIdsIn(events: BaseEvent[], into: Set<string>): void {
  for (const event of events) {
    if ("messageId" in event && typeof event.messageId === "string") {
      into.add(event.messageId);
    }
    if (event.type === EventType.RUN_STARTED) {
      const messages =
        (event as { input?: { messages?: { id: string }[] } }).input
          ?.messages ?? [];
      for (const message of messages) into.add(message.id);
    }
  }
}

/**
 * One AG-UI message in the row shape Intelligence returned (`ThreadMessage`), which every reader in
 * OpenBot already converts back: `toolCalls` flattened to `{ id, name, args }` with the arguments as
 * JSON text, and no `content` on an assistant row that only called tools.
 */
export function toStoredMessage(message: Message): StoredThreadMessage {
  const row: StoredThreadMessage = { id: message.id, role: message.role };
  const toolCalls =
    message.role === "assistant" ? (message.toolCalls ?? []) : [];
  const content = (message as { content?: unknown }).content;
  const toolCallOnly =
    toolCalls.length > 0 && (content === undefined || content === "");
  if (content !== undefined && !toolCallOnly) row.content = content;
  if (message.role === "activity") row.activityType = message.activityType;
  if (toolCalls.length > 0) {
    row.toolCalls = toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      args: call.function.arguments,
    }));
  }
  if (message.role === "tool") row.toolCallId = message.toolCallId;
  return row;
}
