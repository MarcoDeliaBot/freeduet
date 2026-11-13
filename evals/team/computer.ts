/*
 * The Bot's computer, offered and used the way the web app offers and uses it.
 *
 * In a browser chat the app registers the Bot's computer as frontend tools
 * (openbot/app/src/lib/copilot/computer-tools.tsx and sign-in-tool.tsx), offers them on every run
 * when the Bot is the person's to drive and the deployment allows it (computer-available.ts), and
 * when the Bot calls one, runs it against the server's computer routes and posts the result back on
 * a new run (CopilotKit core's processAgentResult). The runner does the same:
 *
 * - The definitions are read from the app (app-computer-tools.ts renders its registrations), so
 *   they are the app's names, descriptions and parameter schemas, and its choice of which to offer.
 * - Each call runs the way the app's handler runs it, through the same routes. A change (click,
 *   type, key, command, file write) goes through the approval gate first, as approval-tools.tsx
 *   sends it, so the runner's deny applies to it like any other approval.
 * - The runner is not a person: it denies approvals, cancels a request for help or a sign-in, and
 *   types no secret, so the Bot hears what it hears when the person says no.
 */
import { resolve } from "node:path";
import type {
  AppToolsInput,
  ServerAnswer,
  ToolDefinition,
} from "./app-computer-tools";

export type { ToolDefinition } from "./app-computer-tools";

/** What a case's member was offered of its computer, and every call it made. In the transcript. */
export type ComputerRecord = {
  offered: boolean;
  /** Why nothing was offered. */
  reason?: string;
  /** The tool names offered on every run of the case. */
  tools: string[];
  /** Tools the app offers that the runner cannot run, so it does not offer them. */
  unsupported?: string[];
  calls: ComputerCall[];
};

export type ComputerCall = {
  toolCallId: string;
  name: string;
  args: unknown;
  /** Each request the call made, as `POST /api/computers/concierge/navigate -> 200`. */
  requests: string[];
  /**
   * `result`: posted back with a follow-up run. `error`: put in the conversation without one, as the
   * SDK does when a handler throws. `waiting`: the approval gate asked; the server resumes the
   * conversation once the approval is decided. `not run`: after a call the gate asked about, which
   * stops the app's run, so the SDK runs no more calls from it.
   */
  outcome: "result" | "error" | "waiting" | "not run";
  /** The tool message's content, as the SDK writes it. */
  content?: string;
  approvalId?: string;
  ms: number;
};

export type ComputerOffer = {
  offered: boolean;
  reason?: string;
  /** Sent as `tools` with every run, exactly as the app's SDK sends them. */
  tools: ToolDefinition[];
  unsupported?: string[];
};

export type Http = (
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
) => Promise<Response>;

/** The runner's requests: JSON, the session cookie, recorded when a list is given. */
export function createHttp(
  options: { server: string; cookie?: string; fetchImpl?: typeof fetch },
  record?: string[],
): Http {
  const send = options.fetchImpl ?? fetch;
  const base = options.server.replace(/\/+$/, "");
  return async (path, init = {}) => {
    const method = init.method ?? "GET";
    try {
      const response = await send(`${base}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(init.body !== undefined
            ? { "content-type": "application/json" }
            : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: init.signal ?? AbortSignal.timeout(60_000),
      });
      record?.push(`${method} ${path} -> ${response.status}`);
      return response;
    } catch (error) {
      record?.push(`${method} ${path} -> failed`);
      throw error;
    }
  };
}

// ── The definitions ──────────────────────────────────────────────────────────────────────────────

const APP_TOOLS_SCRIPT = resolve(import.meta.dir, "app-computer-tools.ts");

export type AppToolsLoader = (
  input: AppToolsInput,
) => Promise<ToolDefinition[]>;

/**
 * The tools the app offers for these answers, from app-computer-tools.ts in its own process.
 * Remembered per answer, so members the server answers alike start it once.
 */
export function appToolsLoader(): AppToolsLoader {
  const seen = new Map<string, Promise<ToolDefinition[]>>();
  return (input) => {
    const key = JSON.stringify(input);
    let tools = seen.get(key);
    if (!tools) {
      tools = readAppTools(input);
      seen.set(key, tools);
      tools.catch(() => seen.delete(key));
    }
    return tools;
  };
}

async function readAppTools(input: AppToolsInput): Promise<ToolDefinition[]> {
  const child = Bun.spawn([process.execPath, APP_TOOLS_SCRIPT], {
    cwd: resolve(import.meta.dir, "../.."),
    stdin: new Blob([JSON.stringify(input)]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill(), 120_000);
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  if (code !== 0)
    throw new Error(
      `reading the web app's computer tools failed (exit ${code}): ${stderr.trim().split("\n").slice(0, 6).join(" | ") || "no output"}`,
    );
  const body = JSON.parse(stdout) as { tools?: ToolDefinition[] };
  if (!Array.isArray(body.tools))
    throw new Error("reading the web app's computer tools gave no tool list");
  return body.tools;
}

async function answerOf(
  response: Promise<Response>,
): Promise<ServerAnswer | null> {
  try {
    const answered = await response;
    const body = await answered.json().catch(() => null);
    return { status: answered.status, body };
  } catch {
    return null;
  }
}

/**
 * Whether this member gets its computer, and which tools of it.
 *
 * First, whether this server has a computer for the member at all: its computer routes answer only
 * when the deployment has a computer, and only for a Bot the person may drive (`canUseComputer`).
 * Then what the app offers for the member's profile and the deployment's capabilities, decided by
 * the app's own computer-available.ts.
 */
export async function offerComputer(
  http: Http,
  member: string,
  load: AppToolsLoader,
): Promise<ComputerOffer> {
  const status = await answerOf(
    http(`/api/computers/${encodeURIComponent(member)}/status`),
  );
  const state =
    status &&
    status.status < 300 &&
    status.body &&
    typeof status.body === "object"
      ? (status.body as { state?: unknown }).state
      : undefined;
  if (typeof state !== "string")
    return {
      offered: false,
      reason: `the server has no computer for ${member} (GET /api/computers/${member}/status answered ${status ? `HTTP ${status.status}` : "nothing"})`,
      tools: [],
    };
  const [agent, capabilities] = await Promise.all([
    answerOf(http(`/api/agents/${encodeURIComponent(member)}`)),
    answerOf(http("/api/admin/enterprise/me")),
  ]);
  const offered = await load({ botId: member, agent, capabilities });
  const tools = offered.filter((tool) => Object.hasOwn(EXECUTORS, tool.name));
  const unsupported = offered
    .filter((tool) => !Object.hasOwn(EXECUTORS, tool.name))
    .map((tool) => tool.name);
  return {
    offered: tools.length > 0,
    tools,
    ...(unsupported.length ? { unsupported } : {}),
    ...(tools.length
      ? {}
      : {
          reason: `the app offers ${member} none of them: its computer is not this person's to drive, or the deployment's capabilities are off`,
        }),
  };
}

// ── Running a call ───────────────────────────────────────────────────────────────────────────────

export type CallContext = {
  http: Http;
  botId: string;
  toolCallId: string;
  /** When the turn runs out: a wait for a person stops there. */
  deadline: number;
  pollMs: number;
  /**
   * The conversation as the approval gate wants it for a change (approval-context.ts): the run this
   * call came from and the messages up to it, the call still unanswered.
   */
  approval: (args: Record<string, unknown>) => Record<string, unknown>;
};

export type CallOutcome =
  | { kind: "result"; value: unknown }
  | { kind: "error"; message: string }
  | { kind: "waiting"; approvalId?: string };

type ToolOutcome = Record<string, unknown> & { ok: boolean };
type Executor = (
  context: CallContext,
  args: Record<string, unknown>,
) => Promise<unknown>;

const signalFor = (context: CallContext) =>
  AbortSignal.timeout(Math.max(1000, context.deadline - Date.now()));

/** app/src/lib/computers/call.ts `callComputer`: a refusal and a failure are results, not throws. */
async function callComputer(
  context: CallContext,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ToolOutcome> {
  let response: Response;
  try {
    response = await context.http(`/api/computers/${context.botId}${path}`, {
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.body !== undefined ? { body: init.body } : {}),
      signal: signalFor(context),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    )
      return { ok: false, reason: "Stopped.", stopped: true };
    return {
      ok: false,
      reason: "The assistant's computer could not be reached.",
    };
  }
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok)
    return {
      ok: false,
      reason: (body?.error as string) ?? "That did not work.",
      ...(response.status === 403
        ? { refused: true, rule: body?.rule ?? null }
        : {}),
      ...(response.status === 409
        ? body?.humanHasControl === true
          ? {
              humanHasControl: true,
              requestId: body?.requestId,
              handoff: body?.handoff,
            }
          : body?.snapshotRequired === true
            ? { staleRefs: true, snapshotRequired: true }
            : { staleRefs: true }
        : {}),
    };
  return { ok: true, ...(body ?? {}) };
}

type ControlState = {
  holder?: string;
  secretWanted?: string;
  request?: { id?: string; status?: string; interruption?: string };
};

/** app/src/lib/computers/control.ts `readControl`. */
async function readControl(
  context: CallContext,
  requestId?: string,
): Promise<ControlState | null> {
  try {
    const response = await context.http(
      `/api/computers/${encodeURIComponent(context.botId)}/control${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ""}`,
      { signal: signalFor(context) },
    );
    if (!response.ok) return null;
    const value = (await response
      .json()
      .catch(() => null)) as ControlState | null;
    if (!value || typeof value !== "object" || !("holder" in value))
      return null;
    return value.holder === "bot" || value.holder === "human" ? value : null;
  } catch {
    return null;
  }
}

async function cancelControl(context: CallContext, requestId: string) {
  await context
    .http(
      `/api/computers/${encodeURIComponent(context.botId)}/control/cancel`,
      { method: "POST", body: { requestId }, signal: signalFor(context) },
    )
    .then((response) => response.body?.cancel())
    .catch(() => undefined);
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * app/src/lib/computers/handoff.ts `awaitHandoff`, with the runner as the person: it never takes
 * control, so it cancels a request that is waiting for one, which is what a person pressing Cancel
 * on the take-the-wheel prompt does. The Bot is then told what the app tells it.
 */
async function awaitHandoff(
  context: CallContext,
  requestId: string,
): Promise<ToolOutcome> {
  let failures = 0;
  let declined = false;
  while (Date.now() < context.deadline) {
    const state = await readControl(context, requestId);
    if (!state) {
      if (++failures >= 5)
        return {
          ok: false,
          requestId,
          reconnecting: true,
          reason:
            "The handoff could not be reached. Reopen this conversation and use Resume task to check this request again.",
        };
      await pause(context.pollMs);
      continue;
    }
    failures = 0;
    if (state.request?.id !== requestId)
      return {
        ok: false,
        requestId,
        reason:
          "The computer did not return the requested handoff. Nothing has been marked complete.",
      };
    const status = state.request.status;
    if (status === "completed") {
      const snapshot = await callComputer(context, "/snapshot", {
        method: "POST",
      });
      if (!snapshot.ok)
        return {
          ...snapshot,
          requestId,
          handoffStatus: "completed",
          snapshotRequired: true,
        };
      const next = challengeFrom(snapshot);
      if (next) {
        if (next.requestId === requestId)
          return {
            ok: false,
            requestId,
            reason:
              "The completed request still reports an active challenge. Check the browser before continuing.",
          };
        const resumed = await awaitHandoff(context, next.requestId);
        return { ...resumed, challenge: next };
      }
      return {
        ...snapshot,
        requestId,
        handoffStatus: "completed",
        result:
          "The person handed control back. This fresh snapshot describes the page now.",
      };
    }
    if (status !== "waiting" && status !== "taken")
      return {
        ok: false,
        requestId,
        handoffStatus: status,
        reason:
          state.request.interruption ??
          `The handoff was ${status}. The person has not completed this request.`,
      };
    if (status === "waiting" && !declined) {
      declined = true;
      await cancelControl(context, requestId);
      continue;
    }
    await pause(context.pollMs);
  }
  // The turn ran out first: the app's "stopped waiting", cancelling a request still waiting.
  const current = await readControl(context, requestId);
  if (
    current?.request?.id === requestId &&
    current.request.status === "waiting"
  )
    await cancelControl(context, requestId);
  return {
    ok: false,
    stopped: true,
    requestId,
    reason:
      "Stopped waiting. A person who has control keeps it until they hand back.",
  };
}

type Challenge = { requestId: string; kind: string; reason: string };

function challengeFrom(result: ToolOutcome): Challenge | undefined {
  const value = result.challenge as Record<string, unknown> | undefined;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.requestId !== "string" ||
    (value.kind !== "cloudflare" && value.kind !== "visible-challenge") ||
    typeof value.reason !== "string"
  )
    return undefined;
  return {
    requestId: value.requestId,
    kind: value.kind,
    reason: value.reason,
  };
}

/** handoff.ts `runBrowserRead`. */
async function browserRead(context: CallContext, path: "/read" | "/snapshot") {
  const result = await callComputer(
    context,
    path,
    path === "/snapshot" ? { method: "POST" } : undefined,
  );
  const challenge = challengeFrom(result);
  if (!challenge) return result;
  const resumed = await awaitHandoff(context, challenge.requestId);
  return { ...resumed, challenge, challengeResolved: resumed.ok };
}

const post =
  (path: string, body: (args: Record<string, unknown>) => unknown = (a) => a) =>
  (context: CallContext, args: Record<string, unknown>) =>
    callComputer(context, path, { method: "POST", body: body(args) });

/**
 * How each tool runs, as its handler in the app runs it (file and handler named on each). `gate`:
 * a change, sent to the approval gate, which runs it on the server (the headless tool of the same
 * name in server/src/computer/headless-tools.ts) once it is allowed; see `throughGate`.
 */
export const EXECUTORS: Record<string, Executor | "gate"> = {
  // computer-tools.tsx `computer_navigate` -> handoff.ts `runNavigation`
  computer_navigate: async (context, args) => {
    const result = await callComputer(context, "/navigate", {
      method: "POST",
      body: { url: args.url, toolCallId: context.toolCallId },
    });
    const challenge = challengeFrom(result);
    if (!challenge?.requestId) return result;
    const resumed = await awaitHandoff(context, challenge.requestId);
    return { ...resumed, challenge, challengeResolved: resumed.ok };
  },
  // `computer_read` and `computer_snapshot` -> handoff.ts `runBrowserRead`
  computer_read: (context) => browserRead(context, "/read"),
  computer_snapshot: (context) => browserRead(context, "/snapshot"),
  // The changes (approval-tools.tsx `writes`).
  computer_type: "gate",
  computer_click: "gate",
  computer_key: "gate",
  computer_run_command: "gate",
  computer_write_file: "gate",
  // `callComputer` on the route, as the handler does.
  computer_scroll: post("/scroll"),
  computer_list_files: post("/files/list", (args) => args ?? {}),
  computer_read_file: post("/files/read"),
  // `computer_request_secret`: the masked prompt, then a wait for the person, who never types.
  computer_request_secret: async (context, args) => {
    const asked = await callComputer(context, "/control/secret", {
      method: "POST",
      body: args,
    });
    if (!asked.ok) return asked;
    const state = await readControl(context);
    const label = String(args.label ?? "");
    return {
      ok: true,
      result:
        state && state.secretWanted === undefined
          ? `The person has entered ${label} into the field. It was typed straight into the page and you were not told what it is.`
          : `Nobody entered ${label}. Do not ask for it another way.`,
    };
  },
  // `report_refusal`: audit bookkeeping on the Bot, never a computer action.
  report_refusal: async (context, args) => {
    try {
      const response = await context.http(
        `/api/agents/${encodeURIComponent(context.botId)}/declined`,
        { method: "POST", body: args, signal: signalFor(context) },
      );
      await response.body?.cancel().catch(() => undefined);
      return response.ok
        ? "Recorded. Now tell the person what you decided and why."
        : "That could not be recorded. Tell the person what you decided anyway.";
    } catch {
      return "That could not be recorded. Tell the person what you decided anyway.";
    }
  },
  // `computer_request_help` -> handoff.ts `runHelpRequest`
  computer_request_help: async (context, args) => {
    const asked = await callComputer(context, "/control/request", {
      method: "POST",
      body: { reason: args.reason, toolCallId: context.toolCallId },
    });
    if (!asked.ok) return asked;
    const request = asked.request as { id?: unknown } | undefined;
    if (!request || typeof request.id !== "string")
      return {
        ok: false,
        reason: "The computer did not identify the handoff request.",
      };
    return awaitHandoff(context, request.id);
  },
  // sign-in-tool.tsx `computer_request_sign_in`: the request, then the person, who cancels it.
  computer_request_sign_in: async (context, args) => {
    const response = await context.http("/api/sign-in-requests", {
      method: "POST",
      body: {
        botId: context.botId,
        site: args.site,
        ...(args.reason ? { reason: args.reason } : {}),
        toolCallId: context.toolCallId,
      },
      signal: signalFor(context),
    });
    const body = (await response.json().catch(() => null)) as {
      id?: string;
      error?: string;
    } | null;
    if (!response.ok || !body || typeof body.id !== "string")
      return {
        ok: false,
        reason: body?.error ?? "The sign-in request could not be made.",
      };
    const id = body.id;
    await context
      .http(`/api/sign-in-requests/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        signal: signalFor(context),
      })
      .then((answer) => answer.body?.cancel())
      .catch(() => undefined);
    const read = await context
      .http(`/api/sign-in-requests/${encodeURIComponent(id)}`, {
        signal: signalFor(context),
      })
      .catch(() => null);
    const state = read?.ok
      ? ((await read.json().catch(() => null)) as {
          status?: string;
          origin?: string;
          outcome?: string | null;
        } | null)
      : null;
    if (
      state?.status &&
      ["signed_in", "failed", "cancelled", "expired"].includes(state.status)
    )
      return {
        ok: state.status === "signed_in",
        signedIn: state.status === "signed_in",
        site: state.origin,
        requestId: id,
        result:
          state.outcome ??
          (state.status === "signed_in"
            ? `Signed in to ${state.origin}.`
            : `The sign-in to ${state.origin} did not complete.`),
        note: "You were not told the credentials and must never ask for them another way.",
      };
    return {
      ok: false,
      requestId: id,
      result: "Nobody signed in. Do not ask for the login another way.",
    };
  },
};

/**
 * approval-tools.tsx `failed`: a change the computer could not make is a RESULT the member reads, in
 * the `{ ok: false, reason }` shape of every other refusal, never a throw. The SDK posts nothing back
 * after a handler that threw (the `error` outcome below), so a thrown "Element x is not on the page
 * any more" ended a turn with no word from the member (jules-3).
 */
function failedChange(reason: string): CallOutcome {
  return { kind: "result", value: { ok: false, reason } };
}

/**
 * approval-tools.tsx: a change is sent to the server's gate with the conversation, and the server
 * runs it. 202 means the gate asked the person; the app stops there and the server resumes the
 * conversation once the approval is decided.
 */
async function throughGate(
  context: CallContext,
  args: Record<string, unknown>,
): Promise<CallOutcome> {
  const response = await context.http(
    `/api/approvals/computer/${encodeURIComponent(context.botId)}`,
    {
      method: "POST",
      body: context.approval(args),
      signal: signalFor(context),
    },
  );
  // A body that is not JSON is a failed action like any other (approval-tools.tsx).
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 202)
    return {
      kind: "waiting",
      ...(payload &&
      typeof payload === "object" &&
      typeof (payload as { approvalId?: unknown }).approvalId === "string"
        ? { approvalId: (payload as { approvalId: string }).approvalId }
        : {}),
    };
  if (!response.ok)
    return failedChange(
      payload &&
        typeof payload === "object" &&
        typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "The computer action could not be approved.",
    );
  if (!payload || typeof payload !== "object" || !("result" in payload))
    return failedChange("The computer action returned no result.");
  return { kind: "result", value: (payload as { result: unknown }).result };
}

/** CopilotKit core `parseToolArguments`: empty is `{}`, anything but an object is an error. */
function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw === "" || raw === null || raw === undefined) return {};
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Tool arguments must be a JSON object.");
  return value as Record<string, unknown>;
}

/** Runs one computer call as the app's handler would, and says what to post back. */
export async function runComputerCall(
  context: CallContext,
  name: string,
  rawArgs: unknown,
): Promise<CallOutcome> {
  let args: Record<string, unknown>;
  try {
    args = parseArguments(rawArgs);
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const executor = Object.hasOwn(EXECUTORS, name)
      ? EXECUTORS[name]
      : undefined;
    if (!executor)
      return { kind: "error", message: `The eval runner cannot run ${name}.` };
    if (executor === "gate") return await throughGate(context, args);
    return { kind: "result", value: await executor(context, args) };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** CopilotKit core `toToolResultContent` and its error form: what the tool message carries. */
export function toolContent(outcome: CallOutcome): string {
  if (outcome.kind === "error") return `Error: ${outcome.message}`;
  if (outcome.kind === "waiting") return "";
  const value = outcome.value;
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}
