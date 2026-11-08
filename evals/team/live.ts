/*
 * Drives a running FreeDuet server over its HTTP API, the same routes the web app uses:
 *
 *   GET  /api/plugins/for/<member>                          the tools the member holds, for `requires`
 *   POST /api/channels {agentIds:[member]}                  new conversation with one Bot, as the
 *                                                           "Message <name>" button's /channel/new does
 *   POST /api/channels/<channel>/attachments (multipart)    each attached file, as the composer uploads it
 *   POST /api/copilotkit/agent/<member>/run                 each message (AG-UI RunAgentInput), with the
 *                                                           conversation so far, as the web app sends it
 *   POST /api/copilotkit/agent/<member>/connect             204 when the thread is idle, {runId} when busy
 *   GET  /api/copilotkit/threads/<thread>/messages?agentId= the stored conversation, tool calls included
 *   GET  /api/approvals                                     the approval gate's requests (filtered by thread)
 *   POST /api/approvals/<id>/decision {decision:"deny"}     only with --approvals deny; never allows
 */
import type {
  Attachment,
  Case,
  Transcript,
  TranscriptEvent,
  Turn,
} from "./checks";
import { attachmentAsText, missingApps, requestText, turnsOf } from "./checks";

export type LiveOptions = {
  server: string;
  engine: string;
  /** Sent as the Cookie header; needed only when the server is not in single-user mode. */
  cookie?: string;
  timeoutMs: number;
  /** `deny` answers every approval the turn opens with deny so the member finishes; `leave` does not. */
  approvals: "deny" | "leave";
  pollMs?: number;
  settleMs?: number;
  /** How long a wait lasts at least: after the first message, and after the runner denies. */
  minWaitMs?: number;
  resumeWaitMs?: number;
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
  options: Pick<LiveOptions, "server" | "cookie" | "fetchImpl">,
) {
  const send = options.fetchImpl ?? fetch;
  const base = options.server.replace(/\/+$/, "");
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
      signal: AbortSignal.timeout(60_000),
    });
  const runInput = (threadId: string, messages: unknown[], extra = {}) => ({
    threadId,
    runId: crypto.randomUUID(),
    messages,
    tools: [],
    context: [],
    state: {},
    forwardedProps: extra,
  });
  const agentPath = (member: string, verb: string) =>
    `/api/copilotkit/agent/${encodeURIComponent(member)}/${verb}`;

  return {
    async createChannel(member: string) {
      const response = await call("/api/channels", {
        method: "POST",
        body: { agentIds: [member] },
      });
      if (!response.ok)
        throw new Error(
          `creating the conversation answered HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      const body = (await response.json()) as {
        channel?: { id?: string; threadId?: string };
      };
      if (!body.channel?.id || !body.channel.threadId)
        throw new Error(
          "creating the conversation returned no channel or thread id",
        );
      return { id: body.channel.id, threadId: body.channel.threadId };
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
          signal: AbortSignal.timeout(60_000),
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
     * runtime keeps the messages it already holds and stores the new one. In Intelligence mode this
     * answers JSON at once; a stream is drained.
     */
    async startRun(member: string, threadId: string, messages: unknown[]) {
      const response = await call(agentPath(member, "run"), {
        method: "POST",
        body: runInput(threadId, messages),
      });
      if (!response.ok)
        throw new Error(
          `starting the turn answered HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      await response.text();
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
 * run claims the thread from ending at once.
 */
async function waitForTurn(
  api: Api,
  member: string,
  threadId: string,
  deadline: number,
  options: {
    pollMs: number;
    settleMs: number;
    minWaitMs: number;
    userMessages: number;
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
        .some((m) => m.role === "assistant" || m.role === "tool");
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

export async function runCaseLive(
  c: Case,
  options: LiveOptions,
): Promise<Transcript> {
  const api = createServerApi(options);
  const log = options.log ?? (() => {});
  const started = Date.now();
  const timing = {
    pollMs: options.pollMs ?? 2000,
    settleMs: options.settleMs ?? 4000,
  };
  const transcript: Transcript = {
    caseId: c.id,
    member: c.member,
    engine: options.engine,
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
  let messages: StoredMessage[] = [];
  let approvals: PublicApproval[] = [];
  const sent: NonNullable<Transcript["attachments"]> = [];
  try {
    const channel = await api.createChannel(c.member);
    transcript.channelId = channel.id;
    transcript.threadId = channel.threadId;
    const turns = turnsOf(c);
    for (const [index, turn] of turns.entries()) {
      // Every turn gets the whole time limit: an earlier turn may be a long search of its own.
      const deadline = Date.now() + options.timeoutMs;
      if (turns.length > 1)
        log(
          `  turn ${index + 1}/${turns.length}: ${turn.request.slice(0, 60)}`,
        );
      const message = await userMessage(api, channel.id, turn, sent);
      await api.startRun(c.member, channel.threadId, [
        ...toRunMessages(messages),
        message,
      ]);
      let timedOut: boolean;
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
      // Deny what the turn asked for so the member finishes and reports; at most three rounds.
      for (
        let round = 0;
        round < 3 && !timedOut && options.approvals === "deny";
        round++
      ) {
        const pending = approvals.filter((a) => a.status === "pending");
        if (pending.length === 0) break;
        for (const a of pending) {
          log(`  deny ${a.id} (${a.action.toolRef})`);
          await api.deny(a.id);
        }
        ({ messages, timedOut } = await waitForTurn(
          api,
          c.member,
          channel.threadId,
          deadline,
          {
            ...timing,
            minWaitMs: options.resumeWaitMs ?? 15_000,
            userMessages: index + 1,
          },
        ));
        approvals = await api.readApprovals(channel.threadId);
      }
      if (timedOut) {
        transcript.status = "timeout";
        transcript.error = `no settled answer to turn ${index + 1} of ${turns.length} within ${Math.round(options.timeoutMs / 1000)} s`;
        break;
      }
    }
  } catch (error) {
    transcript.status = "error";
    transcript.error = error instanceof Error ? error.message : String(error);
  }
  transcript.events = mergeApprovals(messagesToEvents(messages), approvals);
  if (sent.length) transcript.attachments = sent;
  transcript.elapsedMs = Date.now() - started;
  return transcript;
}
