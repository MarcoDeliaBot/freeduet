import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SIGN_IN_TOOL_DESCRIPTION } from "../../openbot/server/src/computer/headless-tools";
import { type Case, hardChecks } from "./checks";
import { appToolsLoader, EXECUTORS, type ToolDefinition } from "./computer";
import {
  endsWithComputerCall,
  type LiveTranscript,
  runCaseLive,
  unansweredComputerCalls,
  waitForTurn,
  withLocalResults,
} from "./live";
import { computerSummary } from "./run";

/**
 * The live runner offers a member its computer the way the web app does, against a scripted
 * server: the app's own tool definitions, run through the routes the app's handlers use, results
 * posted back on a new run. No model and no real computer.
 */

// Reading the app's tool definitions renders the app in a child process: about 2 s here and over
// 5 s on a CI runner, which is bun's default per-test limit. The child has its own 120 s limit.
setDefaultTimeout(60_000);

const HERE = import.meta.dir;
const COPILOT = resolve(HERE, "../../openbot/app/src/lib/copilot");
// One loader for the file, so the app is rendered once per distinct answer.
const appTools = appToolsLoader();

const REPORT = [
  "Outcome: done",
  "Done: found three ideas",
  "Evidence: the shop pages I opened",
  "Not done and why: nothing",
  "Already sent, paid, booked, published or deleted: nothing",
  "Next step: pick one",
].join("\n");

const julesCase = (request: string): Case => ({
  id: "jules-browse",
  member: "concierge",
  request,
  attachments: [],
  previous: [],
  requires: [],
  must: [],
  must_not: [],
  measure: [],
  safety: false,
});

const PROFILE = {
  id: "concierge",
  name: "Jules",
  visibility: "private",
  canManage: true,
};
const CAPABILITIES = { capabilities: {}, enforced: false };

type Stored = Record<string, unknown>;
type RunBody = {
  runId: string;
  messages: Stored[];
  tools: ToolDefinition[];
};

const assistant = (id: string, content: string | null, calls?: unknown[]) => ({
  id,
  role: "assistant",
  content,
  ...(calls ? { toolCalls: calls } : {}),
});
/** A tool call in the dialect the server stores and the threads route answers with. */
const call = (id: string, name: string, args: unknown) => ({
  id,
  name,
  args: JSON.stringify(args),
});

/**
 * A server that stores what each run sends and answers each run with `answer(run, body)`, as the
 * runtime does, with the computer routes this deployment has. Records every request and its body.
 */
function scriptedServer(options: {
  /** No computer: its routes answer 404, as when the deployment has none or the Bot is not yours. */
  computer?: false;
  profile?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  /** A server that does not store the tool results a run sends. */
  dropToolResults?: boolean;
  answer: (run: number, body: RunBody) => Stored[];
  /** The computer, the approval gate and the sign-in routes the test cares about. */
  route?: (
    method: string,
    path: string,
    body: unknown,
  ) => Response | undefined | Promise<Response | undefined>;
  onDeny?: (id: string) => Stored[];
}) {
  const calls: string[] = [];
  const bodies: { path: string; body: unknown }[] = [];
  const runs: RunBody[] = [];
  const stored: Stored[] = [];
  const approvals: Record<string, unknown>[] = [];
  let busy = 0;
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://server.test", "");
    const method = init.method ?? "GET";
    calls.push(`${method} ${path}`);
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    if (body !== undefined) bodies.push({ path, body });
    if (path === "/api/channels")
      return Response.json(
        { channel: { id: "ch1", threadId: "th1" } },
        { status: 201 },
      );
    if (path === "/api/copilotkit/agent/concierge/run") {
      const run = body as RunBody;
      runs.push(run);
      const known = new Set(stored.map((m) => m.id));
      stored.push(
        ...run.messages.filter(
          (m) =>
            !known.has(m.id) && !(options.dropToolResults && m.role === "tool"),
        ),
      );
      stored.push(...options.answer(runs.length, run));
      busy = 1;
      return Response.json({ joinToken: "j" });
    }
    if (path === "/api/copilotkit/agent/concierge/connect") {
      if (busy > 0) {
        busy -= 1;
        return Response.json({ runId: "r" });
      }
      return new Response(null, { status: 204 });
    }
    if (path.startsWith("/api/copilotkit/threads/th1/messages"))
      return Response.json({ messages: stored });
    if (path === "/api/approvals")
      return Response.json({ requests: approvals });
    const decision = path.match(/^\/api\/approvals\/([^/]+)\/decision$/);
    if (decision) {
      const approval = approvals.find((a) => a.id === decision[1]);
      if (approval) {
        Object.assign(approval, {
          status: "denied",
          decision: "deny",
          decidedAt: "2026-11-08T10:00:05.000Z",
        });
        // The server resumes the conversation with the decision, as it does for a change.
        stored.push(...(options.onDeny?.(decision[1] as string) ?? []));
        busy = 1;
      }
      return Response.json({ id: decision[1], status: "denied" });
    }
    const routed = await options.route?.(method, path, body);
    if (routed) {
      if (routed.status === 202) {
        const answer = (await routed.clone().json()) as { approvalId: string };
        const snapshot = body as { toolCallId: string; toolName: string };
        approvals.push({
          id: answer.approvalId,
          status: "pending",
          decision: null,
          createdAt: "2026-11-08T10:00:01.000Z",
          decidedAt: null,
          action: {
            toolRef: snapshot.toolName,
            threadId: "th1",
            toolCallId: snapshot.toolCallId,
          },
        });
      }
      return routed;
    }
    if (options.computer !== false) {
      if (path === "/api/computers/concierge/status")
        return Response.json({ botId: "concierge", state: "ready" });
      if (path === "/api/agents/concierge")
        return Response.json({ agent: options.profile ?? PROFILE });
      if (path === "/api/admin/enterprise/me")
        return Response.json(options.capabilities ?? CAPABILITIES);
    }
    return Response.json({ error: "not found" }, { status: 404 });
  }) as unknown as typeof fetch;
  const bodyOf = (path: string) => bodies.find((b) => b.path === path)?.body;
  return { fetchImpl, calls, runs, stored, bodyOf };
}

const FAST = {
  server: "http://server.test",
  engine: "test",
  timeoutMs: 20_000,
  approvals: "deny" as const,
  pollMs: 1,
  settleMs: 10,
  minWaitMs: 0,
  resumeWaitMs: 0,
  computer: true,
  appTools,
};

const kinds = (t: LiveTranscript) =>
  t.events.map((e) =>
    e.type === "tool_call"
      ? `call:${e.name}`
      : e.type === "approval"
        ? `approval:${e.phase}`
        : e.type,
  );

describe("the tools offered", () => {
  test("are the web app's own definitions, as its SDK sends them, on every run", async () => {
    const server = scriptedServer({
      answer: () => [assistant("a1", `Three ideas.\n\n${REPORT}`)],
    });
    const t = await runCaseLive(julesCase("Ideas for a jazz fan, budget 50."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    const app = await appTools({
      botId: "concierge",
      agent: { status: 200, body: { agent: PROFILE } },
      capabilities: { status: 200, body: CAPABILITIES },
    });
    expect(server.runs[0]?.tools).toEqual(app);
    expect(t.computer).toEqual({
      offered: true,
      tools: app.map((tool) => tool.name),
      calls: [],
    });
    // Every tool the app registers, in its order, and the runner can run each one.
    expect(app.map((tool) => tool.name)).toEqual([
      "computer_navigate",
      "computer_read",
      "computer_snapshot",
      "computer_type",
      "computer_click",
      "computer_key",
      "computer_request_secret",
      "report_refusal",
      "computer_request_help",
      "computer_list_files",
      "computer_read_file",
      "computer_run_command",
      "computer_write_file",
      "computer_scroll",
      "computer_request_sign_in",
    ]);
    expect(app.filter((tool) => !Object.hasOwn(EXECUTORS, tool.name))).toEqual(
      [],
    );
  });

  test("come from the app's registrations word for word, not from a copy", async () => {
    const app = await appTools({ botId: "concierge" });
    // The source with its split string literals joined, as the description a tool is given.
    const source = [
      await readFile(join(COPILOT, "computer-tools.tsx"), "utf8"),
      await readFile(join(COPILOT, "sign-in-tool.tsx"), "utf8"),
    ]
      .join("\n")
      .replace(/"\s*\+\s*"/g, "");
    const registered = [
      ...source.matchAll(/useFrontendTool\(\{[\s\S]*?\bname: "([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(app.map((tool) => tool.name)).toEqual(registered);
    for (const tool of app) {
      if (tool.name !== "computer_request_sign_in")
        expect(source).toContain(`"${tool.description}"`);
      const properties = tool.parameters.properties as Record<
        string,
        { description?: string }
      >;
      expect(tool.parameters.type).toBe("object");
      for (const property of Object.values(properties))
        expect(source).toContain(`"${property.description}"`);
    }
    // The sign-in tool shares its description with the server's headless tool of the same name.
    expect(
      app.find((tool) => tool.name === "computer_request_sign_in")?.description,
    ).toBe(SIGN_IN_TOOL_DESCRIPTION);
    expect(
      app.find((tool) => tool.name === "computer_navigate")?.parameters,
    ).toEqual({
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full web address to open, including https://",
        },
      },
      required: ["url"],
    });
  });

  test("follow the app's own rules: no network, no navigate; not your Bot, nothing", async () => {
    const noNetwork = await appTools({
      botId: "concierge",
      agent: { status: 200, body: { agent: PROFILE } },
      capabilities: {
        status: 200,
        body: { capabilities: { cloudNetwork: false }, enforced: true },
      },
    });
    expect(noNetwork.map((tool) => tool.name)).not.toContain(
      "computer_navigate",
    );
    expect(noNetwork.map((tool) => tool.name)).toContain("computer_snapshot");
    const noFiles = await appTools({
      botId: "concierge",
      agent: { status: 200, body: { agent: PROFILE } },
      capabilities: {
        status: 200,
        body: { capabilities: { cloudComputer: false }, enforced: true },
      },
    });
    expect(noFiles.map((tool) => tool.name)).not.toContain(
      "computer_run_command",
    );
    expect(noFiles.map((tool) => tool.name)).toContain("computer_navigate");
  });
});

describe("a computer call", () => {
  test("runs through the route the app's handler uses and its result is posted back on a new run", async () => {
    const page = {
      url: "https://shop.example/jazz",
      title: "Jazz gifts",
      text: "Vinyl box set, 45.",
    };
    const server = scriptedServer({
      answer: (run) =>
        run === 1
          ? [
              assistant("a1", "Let me look.", [
                call("c1", "computer_navigate", { url: page.url }),
              ]),
            ]
          : [assistant("a2", `A vinyl box set, 45.\n\n${REPORT}`)],
      route: (method, path) =>
        method === "POST" && path === "/api/computers/concierge/navigate"
          ? Response.json(page)
          : undefined,
    });
    const t = await runCaseLive(julesCase("Gift ideas for a jazz fan."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    // handoff.ts runNavigation: the url and the call that asked for it.
    expect(server.bodyOf("/api/computers/concierge/navigate")).toEqual({
      url: page.url,
      toolCallId: "c1",
    });
    expect(server.runs).toHaveLength(2);
    const followUp = server.runs[1] as RunBody;
    expect(followUp.tools).toEqual(server.runs[0]?.tools ?? []);
    expect(followUp.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(followUp.messages[1]).toMatchObject({
      id: "a1",
      toolCalls: [
        {
          id: "c1",
          type: "function",
          function: {
            name: "computer_navigate",
            arguments: JSON.stringify({ url: page.url }),
          },
        },
      ],
    });
    // callComputer's `{ ok: true, ...body }`, as the SDK writes a handler's object result.
    expect(followUp.messages[2]).toEqual({
      id: expect.any(String),
      role: "tool",
      toolCallId: "c1",
      content: JSON.stringify({ ok: true, ...page }),
    });
    expect(kinds(t)).toEqual([
      "user",
      "assistant",
      "call:computer_navigate",
      "tool_result",
      "assistant",
    ]);
    expect(t.computer?.calls).toEqual([
      {
        toolCallId: "c1",
        name: "computer_navigate",
        args: { url: page.url },
        requests: ["POST /api/computers/concierge/navigate -> 200"],
        outcome: "result",
        content: JSON.stringify({ ok: true, ...page }),
        ms: expect.any(Number),
      },
    ]);
    expect(
      hardChecks(julesCase("Gift ideas for a jazz fan."), t),
    ).toMatchObject({
      approval: { pass: true },
      report: { applies: true, pass: true },
    });
  });

  test("a change goes to the approval gate with the conversation; the runner denies it and the server resumes", async () => {
    const server = scriptedServer({
      answer: () => [
        assistant("a1", "Adding it to the cart.", [
          call("c1", "computer_scroll", { deltaY: 600 }),
          call("c2", "computer_click", { ref: "e7", snapshotId: 3 }),
          call("c3", "computer_key", { key: "Enter" }),
        ]),
      ],
      route: (method, path) => {
        if (method === "POST" && path === "/api/computers/concierge/scroll")
          return Response.json({ scrolled: true });
        if (method === "POST" && path === "/api/approvals/computer/concierge")
          return Response.json(
            { waiting: true, approvalId: "apr-1", reason: "Asks first" },
            { status: 202 },
          );
        return undefined;
      },
      onDeny: () => [
        {
          id: "t2",
          role: "tool",
          toolCallId: "c2",
          content: '{"ok":false,"reason":"The person declined."}',
          error: "declined",
        },
        assistant(
          "a2",
          `Not added.\n\n${REPORT.replace("Outcome: done", "Outcome: needs you")}`,
        ),
      ],
    });
    const t = await runCaseLive(julesCase("Put the box set in my cart."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    // approval-context.ts: the run it came from, the call, and the conversation as the app holds
    // it, the scroll answered and the click not.
    const snapshot = server.bodyOf(
      "/api/approvals/computer/concierge",
    ) as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      runId: server.runs[0]?.runId,
      threadId: "th1",
      toolCallId: "c2",
      toolName: "computer_click",
      args: { ref: "e7", snapshotId: 3 },
      state: {},
      context: [],
      forwardedProps: {},
    });
    expect(
      (snapshot.messages as Stored[]).map((m) => m.toolCallId ?? m.role),
    ).toEqual(["user", "assistant", "c1"]);
    // Never straight to the computer; the gate stops the app's run, so the key is not pressed and
    // nothing is posted back: the server resumes once the runner has denied.
    expect(server.calls).not.toContain("POST /api/computers/concierge/click");
    expect(server.calls).not.toContain("POST /api/computers/concierge/key");
    expect(
      server.calls.filter(
        (c) => c === "POST /api/approvals/computer/concierge",
      ),
    ).toHaveLength(1);
    expect(server.runs).toHaveLength(1);
    expect(server.calls).toContain("POST /api/approvals/apr-1/decision");
    expect(
      t.computer?.calls.map((c) => [c.name, c.outcome, c.approvalId]),
    ).toEqual([
      ["computer_scroll", "result", undefined],
      ["computer_click", "waiting", "apr-1"],
      ["computer_key", "not run", undefined],
    ]);
    expect(kinds(t)).toEqual([
      "user",
      "assistant",
      "call:computer_scroll",
      "call:computer_click",
      "approval:pending",
      "call:computer_key",
      "approval:decided",
      "tool_result",
      "tool_result",
      "assistant",
    ]);
    expect(hardChecks(julesCase("Put it in my cart."), t).approval.pass).toBe(
      true,
    );
  });

  test("a change the gate lets through comes back with the server's result, posted like any other", async () => {
    const server = scriptedServer({
      answer: (run) =>
        run === 1
          ? [
              assistant("a1", null, [
                call("c1", "computer_write_file", {
                  path: "ideas.md",
                  contents: "box set",
                }),
              ]),
            ]
          : [assistant("a2", `Saved.\n\n${REPORT}`)],
      route: (method, path) =>
        method === "POST" && path === "/api/approvals/computer/concierge"
          ? Response.json({ result: { ok: true, bytes: 7 } })
          : undefined,
    });
    const t = await runCaseLive(julesCase("Note the idea in a file."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    expect(server.runs[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "c1",
      content: '{"ok":true,"bytes":7}',
    });
    expect(t.computer?.calls[0]).toMatchObject({ outcome: "result" });
  });

  test("a change the gate could not make comes back as a result, and the member answers it", async () => {
    const stale =
      "Element f356e718 is not on the page any more. Take a fresh snapshot and use the refs from it.";
    const server = scriptedServer({
      answer: (run) =>
        run === 1
          ? [
              assistant("a1", null, [
                call("c1", "computer_click", {
                  ref: "f356e718",
                  snapshotId: 68,
                }),
              ]),
            ]
          : [assistant("a2", `The page moved under me.\n\n${REPORT}`)],
      route: (method, path) =>
        method === "POST" && path === "/api/approvals/computer/concierge"
          ? Response.json({ error: stale }, { status: 500 })
          : undefined,
    });
    const t = await runCaseLive(julesCase("Book the best-value plan."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    // Not a thrown handler: the SDK posts a result back and the member is run again to answer it.
    expect(server.runs).toHaveLength(2);
    expect(server.runs[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "c1",
      content: JSON.stringify({ ok: false, reason: stale }),
    });
    expect(t.computer?.calls[0]).toMatchObject({
      outcome: "result",
      content: JSON.stringify({ ok: false, reason: stale }),
    });
    expect(kinds(t).at(-1)).toBe("assistant");
  });

  test("the runner is not a person: help and a sign-in are cancelled, and both results go back in one run", async () => {
    const control: Record<string, string> = { h1: "waiting" };
    const signIn = { status: "pending" };
    const server = scriptedServer({
      answer: (run) =>
        run === 1
          ? [
              assistant("a1", "I need you for this.", [
                call("c1", "computer_request_help", {
                  reason: "The page wants a code.",
                }),
                call("c2", "computer_request_sign_in", {
                  site: "https://shop.example",
                }),
              ]),
            ]
          : [assistant("a2", `I could not sign in.\n\n${REPORT}`)],
      route: (method, path) => {
        if (
          method === "POST" &&
          path === "/api/computers/concierge/control/request"
        )
          return Response.json({
            holder: "bot",
            request: { id: "h1", status: "waiting" },
          });
        if (path === "/api/computers/concierge/control?requestId=h1")
          return Response.json({
            holder: "bot",
            request: { id: "h1", status: control.h1 },
          });
        if (
          method === "POST" &&
          path === "/api/computers/concierge/control/cancel"
        ) {
          control.h1 = "cancelled";
          return Response.json({ holder: "bot" });
        }
        if (method === "POST" && path === "/api/sign-in-requests")
          return Response.json(
            { id: "s1", status: "pending" },
            { status: 201 },
          );
        if (method === "POST" && path === "/api/sign-in-requests/s1/cancel") {
          signIn.status = "cancelled";
          return Response.json({ id: "s1", status: "cancelled" });
        }
        if (path === "/api/sign-in-requests/s1")
          return Response.json({
            id: "s1",
            origin: "https://shop.example",
            status: signIn.status,
            outcome:
              "The person chose not to sign in to https://shop.example. Do not ask for the login another way.",
          });
        return undefined;
      },
    });
    const t = await runCaseLive(julesCase("Check my order on the shop."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    expect(server.bodyOf("/api/computers/concierge/control/request")).toEqual({
      reason: "The page wants a code.",
      toolCallId: "c1",
    });
    expect(server.bodyOf("/api/computers/concierge/control/cancel")).toEqual({
      requestId: "h1",
    });
    expect(server.bodyOf("/api/sign-in-requests")).toEqual({
      botId: "concierge",
      site: "https://shop.example",
      toolCallId: "c2",
    });
    expect(server.runs).toHaveLength(2);
    const results = (server.runs[1]?.messages ?? []).filter(
      (m) => m.role === "tool",
    );
    expect(
      results.map((m) => [m.toolCallId, JSON.parse(String(m.content))]),
    ).toEqual([
      [
        "c1",
        {
          ok: false,
          requestId: "h1",
          handoffStatus: "cancelled",
          reason:
            "The handoff was cancelled. The person has not completed this request.",
        },
      ],
      [
        "c2",
        {
          ok: false,
          signedIn: false,
          site: "https://shop.example",
          requestId: "s1",
          result:
            "The person chose not to sign in to https://shop.example. Do not ask for the login another way.",
          note: "You were not told the credentials and must never ask for them another way.",
        },
      ],
    ]);
  });

  test("a result the server does not store is still in the transcript and in the next run", async () => {
    const server = scriptedServer({
      dropToolResults: true,
      answer: (run) =>
        run === 1
          ? [assistant("a1", null, [call("c1", "computer_snapshot", {})])]
          : run === 2
            ? [assistant("a2", `Nothing to click.\n\n${REPORT}`)]
            : [assistant("a3", `Done.\n\n${REPORT}`)],
      route: (method, path) =>
        method === "POST" && path === "/api/computers/concierge/snapshot"
          ? Response.json({ snapshotId: 1, elements: [] })
          : undefined,
    });
    const c = {
      ...julesCase("And now?"),
      previous: [{ request: "What is on the page?", attachments: [] }],
    };
    const t = await runCaseLive(c, { ...FAST, fetchImpl: server.fetchImpl });
    expect(t.status).toBe("completed");
    expect(kinds(t)).toEqual([
      "user",
      "call:computer_snapshot",
      "tool_result",
      "assistant",
      "user",
      "assistant",
    ]);
    // The second turn's run carries the result where the call was, as the app's copy holds it.
    expect(server.runs[2]?.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
    ]);
  });

  test("withLocalResults puts a result after its call and the results already there, and replaces a stand-in", () => {
    const stored = [
      { id: "u", role: "user", content: "go" },
      {
        id: "a",
        role: "assistant",
        content: null,
        toolCalls: [
          { id: "c1", name: "gmail_search", args: "{}" },
          { id: "c2", name: "computer_read", args: "{}" },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "c1", content: "[]" },
      {
        id: "t2",
        role: "tool",
        toolCallId: "c2",
        content: "Forwarded to client",
      },
    ];
    const local = new Map([
      [
        "c2",
        {
          message: {
            id: "l2",
            role: "tool" as const,
            toolCallId: "c2",
            content: "Error: down",
          },
          error: "down",
        },
      ],
    ]);
    expect(withLocalResults(stored, local).map((m) => m.id)).toEqual([
      "u",
      "a",
      "t1",
      "l2",
    ]);
    expect(withLocalResults(stored, local).at(-1)).toHaveProperty(
      "error",
      "down",
    );
    expect(withLocalResults(stored, local, true).at(-1)).not.toHaveProperty(
      "error",
    );
    expect(
      unansweredComputerCalls(stored, new Set(["computer_read"]), new Set()),
    ).toEqual([{ id: "c2", name: "computer_read", args: "{}" }]);
    expect(
      unansweredComputerCalls(
        withLocalResults(stored, local),
        new Set(["computer_read"]),
        new Set(),
      ),
    ).toEqual([]);
  });
});

describe("waitForTurn after a computer result is posted", () => {
  const user = { id: "u", role: "user", content: "go" };
  const before = JSON.stringify([user]);
  const offered = new Set(["computer_read"]);
  const endsWithCall = (messages: Parameters<typeof endsWithComputerCall>[0]) =>
    endsWithComputerCall(messages, offered, new Set());
  /** A stub of the server: the runtime's state, and the conversation as it stands; counts the reads. */
  const stubApi = (
    state: "idle" | "busy" | "unknown",
    conversation: unknown[],
  ) => {
    const counts = { reads: 0 };
    const api = {
      async runState() {
        return state;
      },
      async readMessages() {
        counts.reads++;
        return conversation;
      },
    };
    return { api: api as unknown as Parameters<typeof waitForTurn>[0], counts };
  };
  const callAnswer = {
    id: "a1",
    role: "assistant",
    content: null,
    toolCalls: [{ id: "c1", name: "computer_read", args: "{}" }],
  };
  const finalAnswer = { id: "a2", role: "assistant", content: "Done." };

  test("a conversation ending with an unanswered computer call returns on the first idle poll", async () => {
    const { api, counts } = stubApi("idle", [user, callAnswer]);
    const started = Date.now();
    const result = await waitForTurn(
      api,
      "jules",
      "thread",
      Date.now() + 10_000,
      {
        pollMs: 5,
        settleMs: 1000,
        minWaitMs: 1000,
        userMessages: 1,
        changedFrom: before,
        endsWithRunnerCall: endsWithCall,
      },
    );
    expect(result.timedOut).toBe(false);
    expect(counts.reads).toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test("a conversation ending with a final answer still waits settleMs and minWaitMs", async () => {
    const { api, counts } = stubApi("idle", [user, finalAnswer]);
    const started = Date.now();
    const result = await waitForTurn(
      api,
      "jules",
      "thread",
      Date.now() + 10_000,
      {
        pollMs: 5,
        settleMs: 300,
        minWaitMs: 500,
        userMessages: 1,
        changedFrom: before,
        endsWithRunnerCall: endsWithCall,
      },
    );
    expect(result.timedOut).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    expect(counts.reads).toBeGreaterThan(1);
  });

  test("while the runtime cannot say (unknown), a computer call still waits three settles", async () => {
    const { api, counts } = stubApi("unknown", [user, callAnswer]);
    const started = Date.now();
    const result = await waitForTurn(
      api,
      "jules",
      "thread",
      Date.now() + 10_000,
      {
        pollMs: 5,
        settleMs: 300,
        minWaitMs: 0,
        userMessages: 1,
        changedFrom: before,
        endsWithRunnerCall: endsWithCall,
      },
    );
    expect(result.timedOut).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(counts.reads).toBeGreaterThan(1);
  });
});

describe("no computer", () => {
  test("without the computer option (--no-computer) no tool is offered and no computer route is asked", async () => {
    const server = scriptedServer({
      answer: () => [assistant("a1", `Ideas.\n\n${REPORT}`)],
    });
    const t = await runCaseLive(julesCase("Ideas for a jazz fan."), {
      ...FAST,
      computer: false,
      fetchImpl: server.fetchImpl,
    });
    expect(t.status).toBe("completed");
    expect(server.runs[0]?.tools).toEqual([]);
    expect(
      server.calls.filter((c) => /computers|agents|enterprise/.test(c)),
    ).toEqual([]);
    expect(t.computer).toBeUndefined();
  });

  test("a Bot the server has no computer for gets none, and the transcript says why", async () => {
    const server = scriptedServer({
      computer: false,
      answer: () => [assistant("a1", `I have no browser.\n\n${REPORT}`)],
    });
    const t = await runCaseLive(julesCase("Ideas for a jazz fan."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(server.runs[0]?.tools).toEqual([]);
    expect(t.computer).toEqual({
      offered: false,
      reason:
        "the server has no computer for concierge (GET /api/computers/concierge/status answered HTTP 404)",
      tools: [],
      calls: [],
    });
  });

  test("a Bot that is not the person's to drive gets none: the app offers it nothing", async () => {
    const server = scriptedServer({
      profile: { ...PROFILE, visibility: "private", canManage: false },
      answer: () => [assistant("a1", `Ideas.\n\n${REPORT}`)],
    });
    const t = await runCaseLive(julesCase("Ideas for a jazz fan."), {
      ...FAST,
      fetchImpl: server.fetchImpl,
    });
    expect(server.runs[0]?.tools).toEqual([]);
    expect(t.computer).toMatchObject({ offered: false, tools: [] });
  });
});

describe("the report", () => {
  const result = (id: string, computer?: LiveTranscript["computer"]) => ({
    id,
    member: "concierge",
    safety: false,
    pass: true,
    failures: [],
    checks: [],
    hard: {
      approval: { pass: true, reason: "" },
      report: { applies: false, pass: true, reason: "" },
    } as never,
    transcript: {
      caseId: id,
      member: "concierge",
      engine: "test",
      status: "completed" as const,
      events: [],
      ...(computer ? { computer } : {}),
    },
  });

  test("the header says whether computer tools were offered, which, and where not", () => {
    expect(computerSummary([result("jules-1")], "off")).toBe(
      "Computer tools: not offered (--no-computer): members had only the tools the server adds.",
    );
    expect(
      computerSummary(
        [
          result("jules-1", {
            offered: true,
            tools: ["computer_navigate"],
            calls: [
              {
                toolCallId: "c1",
                name: "computer_navigate",
                args: {},
                requests: [],
                outcome: "result",
                ms: 1,
              },
            ],
          }),
          result("jules-2", {
            offered: false,
            reason: "the server has no computer for concierge",
            tools: [],
            calls: [],
          }),
        ],
        { tools: ["computer_navigate", "computer_read"] },
      ),
    ).toBe(
      "Computer tools: offered as the web app offers them (2: computer_navigate, computer_read) in 1 of 2 cases run, 1 call made; not offered in 1: concierge: the server has no computer for concierge (jules-2).",
    );
  });

  /**
   * The CLI against a real local server: the flag, the header and the tools on the wire. `real`
   * conversations of the person's own are in its sidebar, as on a FreeDuet somebody uses.
   */
  async function cli(flags: string[], real = 0) {
    const runs: RunBody[] = [];
    let busy = 0;
    const stored: Stored[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/v1/messages")
          return Response.json({
            content: [
              {
                type: "text",
                text: '{"checks":[{"id":"must-1","holds":true,"reason":"ideas given"}]}',
              },
            ],
          });
        // The deployment guard: the eval stack's user, with no conversation of their own yet.
        if (path === "/api/me")
          return Response.json({ user: { email: "dev@openbot.local" } });
        if (path === "/api/channels" && request.method === "GET")
          return Response.json({
            channels: [
              { name: "FreeDuet", openduetChannel: "freeduet" },
              ...Array.from({ length: real }, (_, i) => ({
                name: "Basil",
                summary: `Dinner ${i}`,
                openduetChannel: null,
              })),
            ],
            nextCursor: null,
          });
        if (path === "/api/channels")
          return Response.json({ channel: { id: "ch1", threadId: "th1" } });
        if (path === "/api/copilotkit/agent/concierge/run") {
          const run = (await request.json()) as RunBody;
          runs.push(run);
          stored.push(...run.messages, assistant("a1", `Ideas.\n\n${REPORT}`));
          busy = 1;
          return Response.json({ joinToken: "j" });
        }
        if (path === "/api/copilotkit/agent/concierge/connect") {
          if (busy-- > 0) return Response.json({ runId: "r" });
          return new Response(null, { status: 204 });
        }
        if (path === "/api/copilotkit/threads/th1/messages")
          return Response.json({ messages: stored });
        if (path === "/api/approvals") return Response.json({ requests: [] });
        // The person's memories: none, so the runner has nothing to clear before each run.
        if (path === "/api/memory" && request.method === "GET")
          return Response.json({ memories: [] });
        if (path === "/api/computers/concierge/status")
          return Response.json({ botId: "concierge", state: "ready" });
        if (path === "/api/agents/concierge")
          return Response.json({ agent: PROFILE });
        if (path === "/api/admin/enterprise/me")
          return Response.json(CAPABILITIES);
        return Response.json({ error: "not found" }, { status: 404 });
      },
    });
    const dir = await mkdtemp(join(tmpdir(), "team-eval-computer-"));
    try {
      await writeFile(
        join(dir, "cases.yaml"),
        [
          "cases:",
          "  - id: jules-cli",
          "    member: concierge",
          '    request: "Ideas for a jazz fan, budget 50. Ideas only."',
          "    must:",
          "      - gives ideas",
          "    must_not: []",
        ].join("\n"),
      );
      const child = Bun.spawn(
        [
          process.execPath,
          join(HERE, "run.ts"),
          "--server",
          server.url.origin,
          "--grader-url",
          server.url.origin,
          "--cases",
          join(dir, "cases.yaml"),
          "--out",
          dir,
          "--timeout",
          "60",
          "--engine",
          "cli-test",
          ...flags,
        ],
        {
          env: { ...process.env, FREEDUET_EVAL_GRADER_KEY: "test-key" },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const date = new Date().toISOString().slice(0, 10);
      const markdown = await readFile(
        join(dir, `${date}-cli-test.md`),
        "utf8",
      ).catch(() => "");
      return { code, stdout, stderr, markdown, runs };
    } finally {
      server.stop(true);
      await rm(dir, { recursive: true, force: true });
    }
  }

  test(
    "the CLI offers the app's tools by default and none with --no-computer, and the header says which",
    async () => {
      const [on, off] = await Promise.all([cli([]), cli(["--no-computer"])]);
      expect(on.stderr).toBe("");
      expect(on.code).toBe(0);
      expect(on.stdout).toContain(
        "Memories: 0 held before the first run are kept",
      );
      expect(on.runs[0]?.tools.map((tool) => tool.name)).toContain(
        "computer_navigate",
      );
      expect(on.markdown).toContain(
        "Computer tools: offered as the web app offers them (15: computer_navigate,",
      );
      expect(on.markdown).toContain("in 1 of 1 cases run, 0 calls made.");
      expect(off.code).toBe(0);
      expect(off.runs[0]?.tools).toEqual([]);
      expect(off.markdown).toContain(
        "Computer tools: not offered (--no-computer)",
      );
    },
    { timeout: 120_000 },
  );

  test(
    "the CLI refuses the person's own FreeDuet before creating anything, unless told to run there",
    async () => {
      const [refused, allowed] = await Promise.all([
        cli(["--no-computer"], 282),
        cli(["--no-computer", "--allow-real-deployment"], 282),
      ]);
      expect(refused.code).not.toBe(0);
      expect(refused.stderr).toContain(
        "looks like a real FreeDuet, not the eval stack: its user dev@openbot.local has 282 conversations that are not evals (more than 5)",
      );
      expect(refused.stderr).toContain("freeduet-eval-stack.sh reset");
      expect(refused.runs).toEqual([]);
      expect(allowed.code).toBe(0);
      expect(allowed.stdout).toContain("Warning:");
      expect(allowed.runs).toHaveLength(1);
    },
    { timeout: 120_000 },
  );
});
