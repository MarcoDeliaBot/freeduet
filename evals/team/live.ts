/*
 * Drives a running FreeDuet server over its HTTP API, the same routes the web app uses:
 *
 *   GET  /api/me, GET /api/channels                         who the runner is, and how many conversations
 *                                                           that person has that are not evals (run.ts
 *                                                           refuses a real FreeDuet: guardDeployment)
 *   GET  /api/plugins/for/<member>                          the tools the member holds, for `requires`
 *   POST /api/channels {agentIds:[member], name}            new conversation with one Bot, as the
 *                                                           "Message <name>" button's /channel/new does,
 *                                                           named "[eval] <case>" so it is recognisable
 *   POST /api/channels/<channel>/attachments (multipart)    each attached file, as the composer uploads it
 *   POST /api/copilotkit/agent/<member>/run                 each message (AG-UI RunAgentInput), with the
 *                                                           conversation so far, as the web app sends it;
 *                                                           a 409 "Thread lock denied" (the thread is
 *                                                           still finishing a hand-off or a relay) waits
 *                                                           for /connect to say idle and tries again
 *   POST /api/copilotkit/agent/<member>/connect             204 when the thread is idle, {runId} when busy
 *   GET  /api/copilotkit/threads/<thread>/messages?agentId= the stored conversation, tool calls included
 *   GET  /api/memory, DELETE /api/memory/<id>               the person's memories, and forgetting one: before
 *                                                           each run the ones the runner did not find there
 *                                                           at its start are removed (clearMemories)
 *   GET  /api/approvals                                     the approval gate's requests (filtered by thread)
 *   POST /api/approvals/<id>/decision {decision:"deny"}     only with --approvals deny; never allows
 *
 * With `computer` (run.ts sets it unless --no-computer), also what the app does for the Bot's
 * computer (computer.ts): GET /api/computers/<member>/status, /api/agents/<member> and
 * /api/admin/enterprise/me decide whether its computer tools are offered; they go with every run as
 * `tools`; a call the member makes is run through the routes the app's handler uses
 * (/api/computers/<member>/..., /api/approvals/computer/<member> for a change,
 * /api/sign-in-requests) and its result is posted back on a new run, as the app's SDK does.
 */
import type {
  Attachment,
  Case,
  Transcript,
  TranscriptEvent,
  Turn,
} from "./checks";
import { attachmentAsText, missingApps, requestText, turnsOf } from "./checks";
import {
  type AppToolsLoader,
  appToolsLoader,
  type ComputerOffer,
  type ComputerRecord,
  createHttp,
  offerComputer,
  runComputerCall,
  type ToolDefinition,
  toolContent,
} from "./computer";
import { UNKNOWN_ENGINE } from "./engine";

/**
 * A live transcript, with what the member was offered of its computer and every call it made, and
 * the name the server gave the conversation: `tagged` when it kept the runner's "[eval] ..." name.
 */
export type LiveTranscript = Transcript & {
  computer?: ComputerRecord;
  conversation?: { name: string | null; tagged: boolean };
};

/** CopilotKit core's MAX_FOLLOW_UP_DEPTH: the runs the app posts back after tool calls, per send. */
export const MAX_FOLLOW_UPS = 100;

/**
 * What every conversation the runner creates is named with, first: "[eval] basil-2", or
 * "[eval] basil-2 (run 2 of 3)" with --repeat. The guard below does not count these as the person's.
 */
export const EVAL_MARKER = "[eval]";
export const evalConversationName = (caseId: string, run = 1, of = 1) =>
  `${EVAL_MARKER} ${caseId}${of > 1 ? ` (run ${run} of ${of})` : ""}`;
export const isEvalConversation = (channel: {
  name?: unknown;
  summary?: unknown;
}) =>
  [channel.name, channel.summary].some(
    (text) =>
      typeof text === "string" && text.trimStart().startsWith(EVAL_MARKER),
  );

/** The runtime's answer when another run still holds the thread (`run.mjs`: 409 "Thread lock denied"). */
export class ThreadLockedError extends Error {}

/**
 * A turn still running when its time limit (`--timeout`) runs out, while its run's answer streams.
 * runCaseLive catches it and ends the turn as a timeout, grading what the member had said.
 */
export class TurnBudgetError extends Error {}

/**
 * How long a request may take to answer its headers, and a JSON answer to arrive whole: every request
 * but a turn's run. A run's answer is not bounded by this: it streams for as long as the turn takes,
 * and the turn's time limit bounds it (startRun).
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/** A duration as the runner names it in a message: "300 s", "0.3 s". */
export const seconds = (ms: number) => `${Number((ms / 1000).toFixed(3))} s`;

/** A conversation as `GET /api/channels` lists it, in the fields the guard reads. */
export type ListedConversation = {
  name?: unknown;
  summary?: unknown;
  openduetChannel?: unknown;
  agentIds?: unknown;
  lastMessage?: unknown;
  lastMessageAt?: unknown;
};

export type LiveOptions = {
  server: string;
  /**
   * The engine the run certifies: the report's label. A case does not record it as the engine that
   * answered it: the stack reports none (engine.ts, UNKNOWN_ENGINE).
   */
  engine: string;
  /** Sent as the Cookie header; needed only when the server is not in single-user mode. */
  cookie?: string;
  /**
   * The time limit for each turn of a case, from its message to the end of its answer, the run's
   * streamed answer included. A turn still running at the limit ends as a timeout.
   */
  timeoutMs: number;
  /** How long a request may take to answer its headers (REQUEST_TIMEOUT_MS). Tests shorten it. */
  requestTimeoutMs?: number;
  /**
   * The memories the person held before the first run (memoriesHeld): kept. Before each run every
   * other one is removed (clearMemories), so each run starts as the first did. Absent: none removed.
   */
  memories?: { keep: ReadonlySet<string> };
  /** `deny` answers every approval the turn opens with deny so the member finishes; `leave` does not. */
  approvals: "deny" | "leave";
  pollMs?: number;
  /** How often a wait after a computer result is polled (its next step is usually a quick one). Default 500. */
  followUpPollMs?: number;
  settleMs?: number;
  /** How long a wait lasts at least: after the first message, and after the runner denies. */
  minWaitMs?: number;
  resumeWaitMs?: number;
  /**
   * Offer the member its computer tools when the server has a computer for it, as the web app
   * does, and run the calls it makes. Off when absent: run.ts turns it on unless --no-computer.
   */
  computer?: boolean;
  /** Where the app's tool definitions come from: app-computer-tools.ts, unless a test gives one. */
  appTools?: AppToolsLoader;
  /** The conversation's name, sent when it is created: evalConversationName(...) from run.ts. */
  conversationName?: string;
  /**
   * After a 409 "Thread lock denied", the first pause before trying again, once /connect says the
   * thread is idle; it doubles each time up to `lockBackoffMaxMs`, until the turn's time limit.
   */
  lockBackoffMs?: number;
  lockBackoffMaxMs?: number;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
};

type StoredMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  toolCalls?: {
    id?: string;
    type?: string;
    name?: string;
    args?: unknown;
    function?: { name?: string; arguments?: unknown };
  }[];
  toolCallId?: string;
  error?: unknown;
};

export type PublicApproval = {
  id: string;
  status: string;
  decision: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  action: { toolRef?: string; threadId?: string; toolCallId?: string };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A message's text. An attached file stored as a link reads as `[file: <name>]`. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        if ("text" in part)
          return String((part as { text: unknown }).text ?? "");
        const name = (part as { metadata?: { filename?: unknown } }).metadata
          ?.filename;
        return typeof name === "string" ? `\n[file: ${name}]` : "";
      })
      .join("");
  return "";
}

/**
 * The stored conversation in the shape a run takes, as the web app prepares it before its next send
 * (app/src/lib/copilot/thread-messages.ts): a tool call stored as `{id, name, args}` becomes AG-UI's
 * `{id, type: "function", function: {name, arguments}}`, and an assistant turn with `content: null`
 * loses the field.
 */
export function toRunMessages(stored: readonly StoredMessage[]): unknown[] {
  return stored.map((message) => {
    const { content, toolCalls, ...rest } = message;
    const out: Record<string, unknown> = { ...rest };
    if (!(message.role === "assistant" && content === null))
      out.content = content;
    if (Array.isArray(toolCalls) && toolCalls.length)
      out.toolCalls = toolCalls.map((call) =>
        call.function
          ? call
          : {
              id: call.id,
              type: "function",
              function: {
                name: call.name ?? "",
                arguments:
                  typeof call.args === "string"
                    ? call.args
                    : JSON.stringify(call.args ?? {}),
              },
            },
      );
    return out;
  });
}

function argsOf(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** The stored conversation as transcript events, in order. System rows are left out. */
export function messagesToEvents(
  messages: readonly StoredMessage[],
): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      events.push({ type: "user", text: textOf(message.content) });
    } else if (message.role === "assistant") {
      const text = textOf(message.content);
      if (text) events.push({ type: "assistant", text });
      for (const call of message.toolCalls ?? [])
        events.push({
          type: "tool_call",
          id: call.id ?? "",
          name: call.function?.name ?? call.name ?? "",
          args: argsOf(call.function?.arguments ?? call.args),
        });
    } else if (message.role === "tool") {
      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content ?? "");
      events.push({
        type: "tool_result",
        toolCallId: message.toolCallId ?? "",
        content,
        ...(message.error ? { error: String(message.error) } : {}),
      });
    }
  }
  return events;
}

/** A tool result the runner wrote, as the app's SDK keeps it in its own copy of the conversation. */
export type LocalResult = {
  message: { id: string; role: "tool"; toolCallId: string; content: string };
  /** For the transcript only: the SDK sends a failed call's content as "Error: ...", no field. */
  error?: string;
};

/** The SDK's stand-in some agents send for a call the client is to run. Not an answer. */
const isPlaceholder = (content: unknown) =>
  typeof content === "string" && content.trim() === "Forwarded to client";

/**
 * The stored conversation with the results the runner wrote, each right after its call (after the
 * results already there), as the SDK inserts them; a stand-in is replaced. A result the server has
 * stored already is not added twice. `forRun` leaves the transcript-only `error` out.
 */
export function withLocalResults(
  stored: readonly StoredMessage[],
  local: ReadonlyMap<string, LocalResult>,
  forRun = false,
): StoredMessage[] {
  if (local.size === 0) return [...stored];
  const answered = new Set(
    stored
      .filter((m) => m.role === "tool" && !isPlaceholder(m.content))
      .map((m) => m.toolCallId),
  );
  const out: StoredMessage[] = [];
  for (let index = 0; index < stored.length; index++) {
    const message = stored[index] as StoredMessage;
    if (
      message.role === "tool" &&
      isPlaceholder(message.content) &&
      local.has(message.toolCallId ?? "")
    )
      continue;
    out.push(message);
    if (message.role !== "assistant" || !message.toolCalls?.length) continue;
    while (stored[index + 1]?.role === "tool") {
      index++;
      const next = stored[index] as StoredMessage;
      if (!(isPlaceholder(next.content) && local.has(next.toolCallId ?? "")))
        out.push(next);
    }
    for (const call of message.toolCalls) {
      const result = call.id ? local.get(call.id) : undefined;
      if (!result || answered.has(call.id)) continue;
      out.push(
        forRun || !result.error
          ? { ...result.message }
          : { ...result.message, error: result.error },
      );
    }
  }
  return out;
}

/** The member's calls to its computer tools in this turn that nothing has answered yet. */
export function unansweredComputerCalls(
  messages: readonly StoredMessage[],
  offered: ReadonlySet<string>,
  handled: ReadonlySet<string>,
): { id: string; name: string; args: unknown }[] {
  const answered = new Set(
    messages
      .filter((m) => m.role === "tool" && !isPlaceholder(m.content))
      .map((m) => m.toolCallId),
  );
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  return messages.slice(lastUser + 1).flatMap((message) =>
    message.role !== "assistant"
      ? []
      : (message.toolCalls ?? []).flatMap((call) => {
          const id = call.id ?? "";
          const name = call.function?.name ?? call.name ?? "";
          return id &&
            offered.has(name) &&
            !answered.has(id) &&
            !handled.has(id)
            ? [{ id, name, args: call.function?.arguments ?? call.args }]
            : [];
        }),
  );
}

/**
 * Whether the stored conversation ends with a call the runner runs next: the last call of the last
 * assistant message is one of `unansweredComputerCalls`. Such a turn is not finished, whatever comes
 * before it, and the runner's next step is to run that call and post its result.
 */
export function endsWithComputerCall(
  messages: readonly StoredMessage[],
  offered: ReadonlySet<string>,
  handled: ReadonlySet<string>,
): boolean {
  const last = messages
    .findLast((m) => m.role === "assistant")
    ?.toolCalls?.at(-1);
  if (!last?.id) return false;
  return unansweredComputerCalls(messages, offered, handled).some(
    (call) => call.id === last.id,
  );
}

/**
 * Places each approval where it happened: asked right after its tool call, decided right before the
 * call's result (the gate runs a call only after its decision). An approval whose call id matches no
 * call in the transcript is added at the end, where it cannot vouch for any call.
 */
export function mergeApprovals(
  events: readonly TranscriptEvent[],
  approvals: readonly PublicApproval[],
): TranscriptEvent[] {
  const asEvents = (a: PublicApproval) => {
    const base = {
      type: "approval" as const,
      id: a.id,
      toolCallId: a.action.toolCallId ?? null,
      toolRef: a.action.toolRef ?? "",
      status: a.status,
      decision: a.decision,
    };
    const pending: TranscriptEvent = {
      ...base,
      phase: "pending",
      status: "pending",
      decision: null,
      at: a.createdAt,
    };
    const decided: TranscriptEvent | null =
      a.status === "pending"
        ? null
        : { ...base, phase: "decided", at: a.decidedAt };
    return { pending, decided };
  };
  const sorted = [...approvals].sort((x, y) =>
    String(x.createdAt).localeCompare(String(y.createdAt)),
  );
  const out: TranscriptEvent[] = [];
  const used = new Set<string>();
  for (const event of events) {
    if (event.type === "tool_result") {
      for (const a of sorted)
        if (
          a.action.toolCallId === event.toolCallId &&
          !used.has(`${a.id}:d`)
        ) {
          const decided = asEvents(a).decided;
          if (decided) out.push(decided);
          used.add(`${a.id}:d`);
        }
    }
    out.push(event);
    if (event.type === "tool_call") {
      for (const a of sorted)
        if (a.action.toolCallId === event.id) {
          out.push(asEvents(a).pending);
          used.add(`${a.id}:p`);
        }
    }
  }
  // Decisions with no result yet (denied and waiting, or still running), then unmatched approvals.
  for (const a of sorted) {
    const { pending, decided } = asEvents(a);
    if (!used.has(`${a.id}:p`)) out.push(pending);
    if (decided && !used.has(`${a.id}:d`)) out.push(decided);
  }
  return out;
}

export function createServerApi(
  options: Pick<
    LiveOptions,
    "server" | "cookie" | "fetchImpl" | "requestTimeoutMs"
  >,
) {
  const send = options.fetchImpl ?? fetch;
  const base = options.server.replace(/\/+$/, "");
  const requestMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    send(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(init.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(requestMs),
    });
  const runInput = (
    threadId: string,
    messages: unknown[],
    extra = {},
    tools: readonly ToolDefinition[] = [],
  ) => ({
    threadId,
    runId: crypto.randomUUID(),
    messages,
    tools,
    context: [],
    state: {},
    forwardedProps: extra,
  });
  const agentPath = (member: string, verb: string) =>
    `/api/copilotkit/agent/${encodeURIComponent(member)}/${verb}`;

  return {
    /**
     * A new conversation with the member. `name` is sent with it; a server that names conversations
     * after their Bots ignores it, and the answer says which name it kept.
     */
    async createChannel(member: string, name?: string) {
      const response = await call("/api/channels", {
        method: "POST",
        body: { agentIds: [member], ...(name ? { name } : {}) },
      });
      if (!response.ok)
        throw new Error(
          `creating the conversation answered HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      const body = (await response.json()) as {
        channel?: { id?: string; threadId?: string; name?: unknown };
      };
      if (!body.channel?.id || !body.channel.threadId)
        throw new Error(
          "creating the conversation returned no channel or thread id",
        );
      return {
        id: body.channel.id,
        threadId: body.channel.threadId,
        name: typeof body.channel.name === "string" ? body.channel.name : null,
      };
    },
    /**
     * Who the server says the runner is (`GET /api/me`), and how many of that person's
     * conversations are neither built in (a package channel), nor named as evals, nor left out by
     * `skip`. Counting stops once it passes `stopAfter`, so a sidebar of hundreds costs one or two
     * pages.
     */
    async countPersonConversations(
      stopAfter = Number.POSITIVE_INFINITY,
      skip: (channel: ListedConversation) => boolean = () => false,
    ) {
      const me = await call("/api/me");
      if (!me.ok) throw new Error(`GET /api/me answered HTTP ${me.status}`);
      const { user } = (await me.json()) as {
        user?: { id?: unknown; email?: unknown; name?: unknown };
      };
      const who = [user?.email, user?.name, user?.id].find(
        (value): value is string => typeof value === "string" && value !== "",
      );
      let conversations = 0;
      let cursor = "";
      do {
        const response = await call(
          `/api/channels?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (!response.ok)
          throw new Error(`GET /api/channels answered HTTP ${response.status}`);
        const page = (await response.json()) as {
          channels?: ListedConversation[];
          nextCursor?: unknown;
        };
        conversations += (page.channels ?? []).filter(
          (channel) =>
            !channel.openduetChannel &&
            !isEvalConversation(channel) &&
            !skip(channel),
        ).length;
        cursor = typeof page.nextCursor === "string" ? page.nextCursor : "";
      } while (cursor && conversations <= stopAfter);
      return { user: who ?? "unknown", conversations, complete: !cursor };
    },
    /**
     * The tools the member holds (its grants), or null when they cannot be read. Built-in tools that
     * every Bot has are not in this list; it is what `requires` is checked against.
     */
    async readTools(
      member: string,
    ): Promise<{ name: string; description?: string }[] | null> {
      try {
        const response = await call(
          `/api/plugins/for/${encodeURIComponent(member)}`,
        );
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return null;
        }
        const body = (await response.json()) as {
          tools?: {
            ref?: unknown;
            toolName?: unknown;
            description?: unknown;
          }[];
        };
        if (!Array.isArray(body?.tools)) return null;
        return body.tools.flatMap((tool) => {
          const name =
            typeof tool.toolName === "string" && tool.toolName
              ? tool.toolName
              : typeof tool.ref === "string"
                ? tool.ref
                : "";
          if (!name) return [];
          return [
            {
              name,
              ...(typeof tool.description === "string"
                ? { description: tool.description }
                : {}),
            },
          ];
        });
      } catch {
        return null;
      }
    },
    /**
     * Uploads one attached file the way the composer does, and returns the message part that points
     * at it. The server puts the file's text in its place before the member sees the message.
     */
    async upload(channelId: string, attachment: Attachment, group: string) {
      const form = new FormData();
      form.append(
        "file",
        new File([attachment.text], attachment.name, {
          type: attachment.mimeType,
        }),
      );
      form.append("uploadGroup", group);
      const response = await send(
        `${base}/api/channels/${encodeURIComponent(channelId)}/attachments`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            ...(options.cookie ? { cookie: options.cookie } : {}),
          },
          body: form,
          signal: AbortSignal.timeout(requestMs),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
        name?: unknown;
        mimeType?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok || typeof body?.id !== "string" || !body.id)
        throw new Error(
          `uploading ${attachment.name} answered HTTP ${response.status}${typeof body?.error === "string" ? `: ${body.error}` : ""}`,
        );
      return {
        type: "document",
        source: {
          type: "url",
          value: `/api/attachments/${body.id}`,
          mimeType:
            typeof body.mimeType === "string"
              ? body.mimeType
              : attachment.mimeType,
        },
        metadata: { attachmentId: body.id, filename: attachment.name },
      };
    },
    /**
     * Starts a turn with the conversation so far and the new message, as the web app does: the
     * runtime keeps the messages it already holds and stores the new one. `tools` are the frontend
     * tools offered, as the app's SDK sends them on every run. Answers the run id it sent.
     *
     * The request must answer its headers within REQUEST_TIMEOUT_MS. The answer is then read as it
     * arrives (readRunAnswer), and only the turn's time limit, `deadline`, bounds it: with Intelligence
     * off the run is one event stream that lasts as long as the member works, so a request limit on
     * the whole body cut every long turn. Past the deadline the stream is cancelled and this throws
     * TurnBudgetError.
     */
    async startRun(
      member: string,
      threadId: string,
      messages: unknown[],
      tools: readonly ToolDefinition[],
      deadline: number,
    ) {
      const input = runInput(threadId, messages, {}, tools);
      const controller = new AbortController();
      // Why the run was stopped, when it was. A holder rather than a bare `let`, which TypeScript
      // would read as still unset inside the timers.
      const state: { stopped?: Error } = {};
      const stop = (reason: Error) => {
        state.stopped ??= reason;
        controller.abort(reason);
      };
      const headers = setTimeout(
        () =>
          stop(
            new Error(
              `starting the turn did not answer within ${seconds(requestMs)}`,
            ),
          ),
        requestMs,
      );
      const budget = setTimeout(
        () => stop(new TurnBudgetError()),
        Math.max(0, deadline - Date.now()),
      );
      try {
        const response = await untilAborted(
          send(`${base}${agentPath(member, "run")}`, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              ...(options.cookie ? { cookie: options.cookie } : {}),
            },
            body: JSON.stringify(input),
            signal: controller.signal,
          }),
          controller.signal,
        );
        clearTimeout(headers);
        if (!response.ok) {
          const message = `starting the turn answered HTTP ${response.status}: ${(await untilAborted(response.text(), controller.signal)).slice(0, 200)}`;
          // Another run still holds the thread: the previous turn, or a hand-off or relay it set off.
          if (response.status === 409 && /thread lock denied/i.test(message))
            throw new ThreadLockedError(message);
          throw new Error(message);
        }
        await readRunAnswer(response.body, controller.signal);
        if (state.stopped) throw state.stopped;
        return input.runId;
      } catch (error) {
        throw state.stopped ?? error;
      } finally {
        clearTimeout(headers);
        clearTimeout(budget);
      }
    },
    /** The memories the person holds, as `GET /api/memory` lists them: those not forgotten. */
    async listMemories(): Promise<{ id: string }[]> {
      const response = await call("/api/memory");
      if (!response.ok)
        throw new Error(
          `listing the memories answered HTTP ${response.status}`,
        );
      const body = (await response.json()) as { memories?: unknown };
      if (!Array.isArray(body.memories))
        throw new Error("listing the memories returned no list");
      return body.memories.flatMap((memory: unknown) => {
        const id = (memory as { id?: unknown } | null)?.id;
        return typeof id === "string" && id ? [{ id }] : [];
      });
    },
    /**
     * Forgets one memory (`DELETE /api/memory/<id>`). The store keeps a forgotten memory as a
     * tombstone rather than deleting its row, so a memory a Bot formed (save_observed_memory) is also
     * refused when the same content is saved again. An id already gone is not an error.
     */
    async deleteMemory(id: string) {
      const response = await call(`/api/memory/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok && response.status !== 404)
        throw new Error(`removing a memory answered HTTP ${response.status}`);
    },
    async runState(
      member: string,
      threadId: string,
    ): Promise<"idle" | "busy" | "unknown"> {
      try {
        const response = await call(agentPath(member, "connect"), {
          method: "POST",
          body: runInput(threadId, [], { openbotAsk: "live-run" }),
        });
        if (response.status === 204) return "idle";
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        ) {
          await response.body?.cancel().catch(() => undefined);
          return "unknown";
        }
        const answer = (await response.json()) as { runId?: unknown };
        return typeof answer.runId === "string" && answer.runId
          ? "busy"
          : "idle";
      } catch {
        return "unknown";
      }
    },
    async readMessages(
      member: string,
      threadId: string,
    ): Promise<StoredMessage[]> {
      const response = await call(
        `/api/copilotkit/threads/${encodeURIComponent(threadId)}/messages?agentId=${encodeURIComponent(member)}`,
      );
      if (!response.ok)
        throw new Error(
          `reading the conversation answered HTTP ${response.status}`,
        );
      const body = (await response.json()) as { messages?: unknown };
      return Array.isArray(body.messages)
        ? (body.messages as StoredMessage[])
        : [];
    },
    async readApprovals(threadId: string): Promise<PublicApproval[]> {
      const response = await call("/api/approvals");
      if (response.status === 404) return [];
      if (!response.ok)
        throw new Error(`reading approvals answered HTTP ${response.status}`);
      const body = (await response.json()) as { requests?: PublicApproval[] };
      return (body.requests ?? []).filter(
        (r) => r.action?.threadId === threadId,
      );
    },
    async deny(id: string) {
      const response = await call(
        `/api/approvals/${encodeURIComponent(id)}/decision`,
        {
          method: "POST",
          body: { decision: "deny" },
        },
      );
      if (!response.ok)
        throw new Error(`denying ${id} answered HTTP ${response.status}`);
    },
  };
}

type Api = ReturnType<typeof createServerApi>;

/**
 * Waits until the turn has ended: the runtime says the thread is idle (or cannot say), the
 * conversation holds the turn's message (`userMessages` messages from the person) and something
 * after it, and nothing has changed for `settleMs`. `minWaitMs` keeps a wait that starts before the
 * run claims the thread from ending at once. `changedFrom`, after a tool result was posted: the
 * stored conversation as it was then, which the run has to change before its answer counts.
 * `endsWithRunnerCall`, with `changedFrom`: whether the conversation ends with a call the runner
 * runs next. Then the turn is not finished, so once the runtime says idle the wait returns at once
 * instead of waiting for `settleMs` and `minWaitMs`.
 */
export async function waitForTurn(
  api: Api,
  member: string,
  threadId: string,
  deadline: number,
  options: {
    pollMs: number;
    settleMs: number;
    minWaitMs: number;
    userMessages: number;
    changedFrom?: string;
    endsWithRunnerCall?: (messages: StoredMessage[]) => boolean;
  },
): Promise<{ messages: StoredMessage[]; timedOut: boolean }> {
  const started = Date.now();
  let messages: StoredMessage[] = [];
  let signature = "";
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(options.pollMs);
    const state = await api.runState(member, threadId);
    messages = await api.readMessages(member, threadId).catch(() => messages);
    const next = JSON.stringify(messages);
    if (
      state === "idle" &&
      next !== options.changedFrom &&
      options.endsWithRunnerCall?.(messages)
    )
      return { messages, timedOut: false };
    if (state === "busy" || next !== signature) {
      signature = next;
      stableSince = Date.now();
      continue;
    }
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    const answered =
      messages.filter((m) => m.role === "user").length >=
        options.userMessages &&
      messages
        .slice(lastUser + 1)
        .some((m) => m.role === "assistant" || m.role === "tool") &&
      next !== options.changedFrom;
    const settle =
      state === "unknown" ? options.settleMs * 3 : options.settleMs;
    if (
      answered &&
      Date.now() - stableSince >= settle &&
      Date.now() - started >= options.minWaitMs
    )
      return { messages, timedOut: false };
    if (
      !answered &&
      state === "idle" &&
      Date.now() - started >= Math.max(options.minWaitMs, options.settleMs * 10)
    )
      return { messages, timedOut: false };
  }
  return { messages, timedOut: true };
}

/** Polls /connect, as waitForTurn does, until the thread is not busy or the deadline passes. */
async function waitUntilIdle(
  api: Api,
  member: string,
  threadId: string,
  deadline: number,
  pollMs: number,
) {
  while (Date.now() < deadline) {
    if ((await api.runState(member, threadId)) !== "busy") return;
    await sleep(pollMs);
  }
}

/**
 * `promise`, or the reason `signal` aborted with as soon as it does, so a transport that ignores the
 * signal still lets the turn end.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Whether a line of an event stream is the end of its run: a RUN_FINISHED or a RUN_ERROR event. */
function endsRun(line: string): boolean {
  if (!line.startsWith("data:")) return false;
  try {
    const event = JSON.parse(line.slice("data:".length)) as { type?: unknown };
    return event.type === "RUN_FINISHED" || event.type === "RUN_ERROR";
  } catch {
    return false;
  }
}

/**
 * Reads a run's answer until the run is over. An event stream (Intelligence off) is over at its
 * RUN_FINISHED or RUN_ERROR, where its connection is let go, or at the end of the stream. A JSON
 * answer (Intelligence on) is read to its end. Stops early when `signal` aborts.
 */
async function readRunAnswer(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const cancel = () => reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await untilAborted(reader.read(), signal);
      if (done) return;
      pending += decoder.decode(value, { stream: true });
      let end = pending.indexOf("\n");
      while (end !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (endsRun(line)) {
          await cancel();
          return;
        }
        end = pending.indexOf("\n");
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/** Passes over the memory list before the runner gives up. Each pass removes what the list shows. */
const MEMORY_CLEAR_PASSES = 10;

/**
 * The ids of the memories the person holds before the first run. Every run keeps these and nothing
 * else (LiveOptions.memories): what was here before the runner started is not the runner's to remove.
 */
export async function memoriesHeld(
  options: Pick<LiveOptions, "server" | "cookie" | "fetchImpl">,
): Promise<ReadonlySet<string>> {
  const memories = await createServerApi(options).listMemories();
  return new Set(memories.map((memory) => memory.id));
}

/**
 * Removes every memory of the person that is not in `keep`, and answers how many it removed. The
 * list shows a bounded number of memories, so it is read again until nothing outside `keep` is left.
 * A memory the server will not remove fails the run, rather than letting it start with what an earlier
 * run saved.
 */
export async function clearMemories(
  api: Api,
  keep: ReadonlySet<string>,
): Promise<number> {
  let removed = 0;
  for (let pass = 0; pass < MEMORY_CLEAR_PASSES; pass++) {
    const stale = (await api.listMemories()).filter(
      (memory) => !keep.has(memory.id),
    );
    if (stale.length === 0) return removed;
    for (const memory of stale) {
      await api.deleteMemory(memory.id);
      removed++;
    }
  }
  throw new Error(
    `memories saved by earlier runs were still there after ${MEMORY_CLEAR_PASSES} passes of removing them`,
  );
}

/**
 * The new user message of a turn. Attached files are uploaded through the composer's route and
 * sent as parts that point at them; a file the route refuses (an older server, a full upload
 * queue) is put in the message as the same text the server would have put there, and the
 * transcript says so.
 */
async function userMessage(
  api: Api,
  channelId: string,
  turn: Turn,
  sent: NonNullable<Transcript["attachments"]>,
) {
  const text = requestText(turn.request, turn.attachments);
  if (turn.attachments.length === 0)
    return { id: crypto.randomUUID(), role: "user", content: text };
  const group = crypto.randomUUID();
  const parts: unknown[] = [{ type: "text", text }];
  for (const attachment of turn.attachments) {
    try {
      parts.push(await api.upload(channelId, attachment, group));
      sent.push({ name: attachment.name, via: "upload" });
    } catch (error) {
      parts.push({ type: "text", text: attachmentAsText(attachment) });
      sent.push({
        name: attachment.name,
        via: "inline",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { id: crypto.randomUUID(), role: "user", content: parts };
}

let sharedAppTools: AppToolsLoader | undefined;

/**
 * What the member is offered of its computer, for the transcript and for every run. A failure to
 * read the app's tools offers none and says why; run.ts checks they can be read before it starts.
 */
async function computerFor(
  member: string,
  options: LiveOptions,
): Promise<ComputerOffer> {
  try {
    sharedAppTools ??= appToolsLoader();
    return await offerComputer(
      createHttp(options),
      member,
      options.appTools ?? sharedAppTools,
    );
  } catch (error) {
    return {
      offered: false,
      reason: error instanceof Error ? error.message : String(error),
      tools: [],
    };
  }
}

export async function runCaseLive(
  c: Case,
  options: LiveOptions,
): Promise<LiveTranscript> {
  const api = createServerApi(options);
  const log = options.log ?? (() => {});
  const started = Date.now();
  const timing = {
    pollMs: options.pollMs ?? 2000,
    settleMs: options.settleMs ?? 4000,
  };
  const transcript: LiveTranscript = {
    caseId: c.id,
    member: c.member,
    // The engine that answered: the stack reports none, so it is never the one asked for (engine.ts).
    engine: UNKNOWN_ENGINE,
    status: "completed",
    events: [],
  };
  const tools = await api.readTools(c.member);
  if (tools) transcript.tools = tools;
  // A case that needs an app the member does not hold is not run: it is reported as skipped.
  if (c.requires.length && tools && missingApps(c, transcript).length) {
    transcript.elapsedMs = Date.now() - started;
    return transcript;
  }
  // The Bot's computer, offered as the web app offers it, or nothing (--no-computer).
  const computer = options.computer
    ? await computerFor(c.member, options)
    : undefined;
  const offered: readonly ToolDefinition[] = computer?.tools ?? [];
  const offeredNames = new Set(offered.map((tool) => tool.name));
  if (computer) {
    transcript.computer = {
      offered: computer.offered,
      ...(computer.reason ? { reason: computer.reason } : {}),
      tools: offered.map((tool) => tool.name),
      ...(computer.unsupported ? { unsupported: computer.unsupported } : {}),
      calls: [],
    };
    log(
      computer.offered
        ? `  computer: ${offered.length} tools offered${computer.unsupported ? `; the runner cannot run ${computer.unsupported.join(", ")}` : ""}`
        : `  computer: not offered, ${computer.reason}`,
    );
  }
  // The results the runner wrote, kept as the app keeps its own copy (see withLocalResults).
  const local = new Map<string, LocalResult>();
  const handled = new Set<string>();
  let messages: StoredMessage[] = [];
  let approvals: PublicApproval[] = [];
  const sent: NonNullable<Transcript["attachments"]> = [];
  try {
    // The run starts without what the earlier runs saved. This comes before any of its own messages,
    // so a case's earlier turns (its seeds) are sent after the clear, and are not removed by it.
    if (options.memories) {
      const removed = await clearMemories(api, options.memories.keep);
      if (removed) log(`  memories: removed ${removed} saved by earlier runs`);
    }
    const channel = await api.createChannel(c.member, options.conversationName);
    transcript.channelId = channel.id;
    transcript.threadId = channel.threadId;
    if (options.conversationName)
      transcript.conversation = {
        name: channel.name,
        tagged: channel.name === options.conversationName,
      };
    const runMessages = () =>
      toRunMessages(withLocalResults(messages, local, true));
    /*
     * Starts a run with the conversation so far (and the turn's new message), as the app does. When
     * the runtime refuses it with 409 "Thread lock denied" (the previous turn, or a hand-off or relay
     * it set off, still holds the thread: jules-3), it waits for /connect to say idle, reads the
     * conversation again (the relay may have added to it) and tries again, with a pause that doubles
     * each time, until the turn's time limit.
     *
     * Answers the run id, or undefined when the turn's time limit ran out while the run streamed: the
     * conversation and the approvals as they stand are read then, and the turn is a timeout.
     */
    const startTurn = async (deadline: number, message?: unknown) => {
      let pause = options.lockBackoffMs ?? 2000;
      for (let attempt = 1; ; attempt++) {
        try {
          return await api.startRun(
            c.member,
            channel.threadId,
            [...runMessages(), ...(message === undefined ? [] : [message])],
            offered,
            deadline,
          );
        } catch (error) {
          if (error instanceof TurnBudgetError) {
            messages = await api
              .readMessages(c.member, channel.threadId)
              .catch(() => messages);
            approvals = await api
              .readApprovals(channel.threadId)
              .catch(() => approvals);
            return undefined;
          }
          if (!(error instanceof ThreadLockedError)) throw error;
          if (Date.now() >= deadline)
            throw new Error(
              `${error.message} (the thread was still held after ${attempt} ${attempt === 1 ? "try" : "tries"})`,
            );
          log(
            `  the thread is still busy (409 Thread lock denied): waiting to try again (${attempt})`,
          );
          await waitUntilIdle(
            api,
            c.member,
            channel.threadId,
            deadline,
            timing.pollMs,
          );
          await sleep(Math.max(0, Math.min(pause, deadline - Date.now())));
          pause = Math.min(pause * 2, options.lockBackoffMaxMs ?? 16_000);
          messages = await api
            .readMessages(c.member, channel.threadId)
            .catch(() => messages);
        }
      }
    };
    const turns = turnsOf(c);
    for (const [index, turn] of turns.entries()) {
      // Every turn gets the whole time limit: an earlier turn may be a long search of its own.
      const deadline = Date.now() + options.timeoutMs;
      if (turns.length > 1)
        log(
          `  turn ${index + 1}/${turns.length}: ${turn.request.slice(0, 60)}`,
        );
      const message = await userMessage(api, channel.id, turn, sent);
      const started = await startTurn(deadline, message);
      let timedOut = started === undefined;
      let runId = started ?? "";
      if (started !== undefined) {
        ({ messages, timedOut } = await waitForTurn(
          api,
          c.member,
          channel.threadId,
          deadline,
          {
            ...timing,
            minWaitMs: options.minWaitMs ?? 5000,
            userMessages: index + 1,
          },
        ));
        approvals = await api.readApprovals(channel.threadId);
      }
      /*
       * Carry the turn on, as the app does, until nothing is left to answer: run the member's
       * computer calls and post their results back (as many follow-ups as the app's SDK allows), and
       * deny what the turn asked for so the member finishes and reports (at most three rounds).
       */
      let followUps = 0;
      let denials = 0;
      while (!timedOut) {
        const calls =
          followUps < MAX_FOLLOW_UPS
            ? unansweredComputerCalls(
                withLocalResults(messages, local),
                offeredNames,
                handled,
              )
            : [];
        let followUp = false;
        let gateAsked = false;
        for (const call of calls) {
          handled.add(call.id);
          /*
           * When the gate asks, the app stops the run (approval-tools.tsx `stopAgent`), and the SDK
           * runs none of the calls after it and posts nothing back: the server resumes once the
           * approval is decided, and never asks the browser to run the rest.
           */
          if (gateAsked) {
            transcript.computer?.calls.push({
              toolCallId: call.id,
              name: call.name,
              args: argsOf(call.args),
              requests: [],
              outcome: "not run",
              ms: 0,
            });
            continue;
          }
          const requests: string[] = [];
          const callStarted = Date.now();
          const outcome = await runComputerCall(
            {
              http: createHttp(options, requests),
              botId: c.member,
              toolCallId: call.id,
              deadline,
              pollMs: timing.pollMs,
              // approval-context.ts: the run the call came from and the conversation as it stands.
              approval: (args) => ({
                runId,
                threadId: channel.threadId,
                toolCallId: call.id,
                toolName: call.name,
                args,
                messages: runMessages(),
                state: {},
                context: [],
                forwardedProps: {},
              }),
            },
            call.name,
            call.args,
          );
          const content = toolContent(outcome);
          transcript.computer?.calls.push({
            toolCallId: call.id,
            name: call.name,
            args: argsOf(call.args),
            requests,
            outcome: outcome.kind,
            ...(outcome.kind === "waiting"
              ? outcome.approvalId
                ? { approvalId: outcome.approvalId }
                : {}
              : { content }),
            ms: Date.now() - callStarted,
          });
          log(
            `  ${call.name}: ${outcome.kind === "waiting" ? "waiting for approval" : outcome.kind}`,
          );
          if (outcome.kind === "waiting") {
            gateAsked = true;
            continue;
          }
          local.set(call.id, {
            message: {
              id: crypto.randomUUID(),
              role: "tool",
              toolCallId: call.id,
              content,
            },
            ...(outcome.kind === "error" ? { error: outcome.message } : {}),
          });
          // The SDK posts back after a result, not after a handler that threw.
          if (outcome.kind === "result") followUp = true;
        }
        if (gateAsked) followUp = false;
        const before = JSON.stringify(messages);
        if (followUp) {
          followUps++;
          const next = await startTurn(deadline);
          if (next === undefined) {
            timedOut = true;
            break;
          }
          runId = next;
        }
        // The gate just opened an approval for a change: read it, so it is denied with the rest.
        if (gateAsked) approvals = await api.readApprovals(channel.threadId);
        const pending =
          options.approvals === "deny" && denials < 3
            ? approvals.filter((a) => a.status === "pending")
            : [];
        for (const a of pending) {
          log(`  deny ${a.id} (${a.action.toolRef})`);
          await api.deny(a.id);
        }
        if (pending.length) denials++;
        if (!followUp && pending.length === 0) break;
        ({ messages, timedOut } = await waitForTurn(
          api,
          c.member,
          channel.threadId,
          deadline,
          {
            ...timing,
            pollMs: followUp ? (options.followUpPollMs ?? 500) : timing.pollMs,
            minWaitMs: followUp
              ? (options.minWaitMs ?? 5000)
              : (options.resumeWaitMs ?? 15_000),
            userMessages: index + 1,
            // The loop runs the call next only while it has follow-ups left (see `calls` above).
            ...(followUp
              ? {
                  changedFrom: before,
                  endsWithRunnerCall: (stored: StoredMessage[]) =>
                    followUps < MAX_FOLLOW_UPS &&
                    endsWithComputerCall(
                      withLocalResults(stored, local),
                      offeredNames,
                      handled,
                    ),
                }
              : {}),
          },
        ));
        approvals = await api.readApprovals(channel.threadId);
      }
      if (timedOut) {
        transcript.status = "timeout";
        transcript.error = `turn ${index + 1} of ${turns.length} did not finish within ${seconds(options.timeoutMs)}, the time limit for each turn (--timeout)`;
        break;
      }
    }
  } catch (error) {
    transcript.status = "error";
    transcript.error = error instanceof Error ? error.message : String(error);
  }
  transcript.events = mergeApprovals(
    messagesToEvents(withLocalResults(messages, local)),
    approvals,
  );
  if (sent.length) transcript.attachments = sent;
  transcript.elapsedMs = Date.now() - started;
  return transcript;
}
