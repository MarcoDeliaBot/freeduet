/**
 * A run that PAUSES on a tool call, with Intelligence off (#42), against a real Postgres.
 *
 * A pause is not an abrupt end. agent-freeduet announces a call OpenBot has to run (a frontend tool
 * such as `computer_navigate`, `report_refusal`, or an in-band `message_bot` waiting on an approval)
 * with TOOL_CALL_START, ARGS and END, never answers it, and ends the segment with a plain
 * RUN_FINISHED. The runtime's own agent wrapper for a remote Bot (`buildAgents`, with
 * `HeadlessToolsMiddleware`) turns an approval into CUSTOM `openbot.headless.waiting` and a
 * RUN_FINISHED whose outcome is an interrupt. The call stays open until the client's next run, or the
 * approvals resume, brings its result. CopilotKit's Intelligence runner records exactly that.
 *
 * The first version of FreeDuet's thread store closed the call on its own: the events a run's row
 * holds went through `sealRuns`, which answered every open call with
 * `{"status":"error","reason":"missing_terminal_event"}` just before the run's RUN_FINISHED. The
 * live stream was untouched, so a browser saw nothing wrong; the stored conversation held an answer
 * nobody had given, a client reading it believed the call was done, and the history sanitiser kept
 * that first answer over the real one. These tests drive the real wiring (the agent `buildAgents`
 * makes, the approval service and its resume, `createTurnRunner`) with a stand-in for agent-freeduet
 * at the other end of the AG-UI POST, and read the rows back.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import { HANDED_OVER } from "@openbot/shared/handoff-markers";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { createTurnRunner } from "@openbot/toolkit/run-turn";
import { sql } from "drizzle-orm";
import { Observable, type Subscriber } from "rxjs";
import { readRunAssertion } from "../src/agents/callback-token";
import { createApprovedActionExecutor } from "../src/approvals/execute";
import { createApprovalService } from "../src/approvals/service";
import { buildAgents } from "../src/copilot";
import { createDatabase } from "../src/db/client";
import { markFreeDuetPackage } from "../src/freeduet/coordination";
import { LocalIntelligence } from "../src/freeduet/local-intelligence";
import {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
} from "../src/freeduet/threads";
import { sealRuns } from "../src/freeduet/threads/events";
import type { PgAgentRunner } from "../src/freeduet/threads/pg-runner";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import {
  ACTOR,
  coordination,
  fakeAgentFreeduet,
  KEY,
  MANAGED_TOKEN,
  makePage,
  member,
  memoryApprovals,
  NEEDS_APPROVAL,
  PERSON,
  reviewer,
  said,
  signRun,
  toolCall,
} from "./support/freeduet-team";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const threadIds: string[] = [];
const runners: PgAgentRunner[] = [];

const MISSING = "missing_terminal_event";

function boot() {
  const store = createLocalThreadStore(database);
  const runner = createPgAgentRunner({
    database,
    store,
    flushEveryMs: 10,
    flushEveryEvents: 2,
  });
  runners.push(runner);
  return { store, runner };
}

async function newThread(store: ReturnType<typeof boot>["store"]) {
  const threadId = `fd-pause-${randomUUID()}`;
  threadIds.push(threadId);
  await store.getOrCreateThread({
    threadId,
    userId: ACTOR,
    agentId: "freeduet",
  });
  return threadId;
}

beforeAll(async () => {
  await applyFreeDuetThreadMigrations(database);
});

afterAll(async () => {
  for (const runner of runners) {
    for (const threadId of threadIds) await runner.stop({ threadId });
  }
  for (const threadId of threadIds) {
    await database.execute(
      sql`delete from freeduet_thread_locks where thread_id = ${threadId}`,
    );
    await database.execute(
      sql`delete from freeduet_threads where thread_id = ${threadId}`,
    );
  }
  await database.$client.close();
});

function drain(events$: Observable<BaseEvent>): Promise<BaseEvent[]> {
  return new Promise((resolve, reject) => {
    const seen: BaseEvent[] = [];
    events$.subscribe({
      next: (event) => seen.push(event),
      error: reject,
      complete: () => resolve(seen),
    });
  });
}

const typesOf = (events: BaseEvent[]) => events.map((event) => event.type);

/** Every event the thread's rows hold, oldest run first, as the database has them. */
async function storedEventsOf(threadId: string) {
  const rows = [
    ...(await database.execute(
      sql`select run_id, status, events from freeduet_thread_runs where thread_id = ${threadId} order by id`,
    )),
  ] as { run_id: string; status: string; events: BaseEvent[] }[];
  return {
    rows,
    events: rows.flatMap((row) => row.events),
    text: JSON.stringify(rows.map((row) => row.events)),
  };
}

/** Waits until the rows hold `needle`: the run has got as far as the test needs it to. */
async function untilStored(threadId: string, needle: string) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if ((await storedEventsOf(threadId)).text.includes(needle)) return;
    await Bun.sleep(10);
  }
  throw new Error(`timed out waiting for ${needle} to be stored`);
}

/** The thread's stored messages the way a client turns them back into a conversation. */
async function conversation(
  store: ReturnType<typeof boot>["store"],
  threadId: string,
): Promise<Message[]> {
  return (await store.getThreadMessages(threadId)).map(
    (row) =>
      ({
        id: row.id,
        role: row.role,
        content: row.content ?? "",
        ...(row.toolCalls
          ? {
              toolCalls: row.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: call.args },
              })),
            }
          : {}),
        ...(row.toolCallId ? { toolCallId: row.toolCallId } : {}),
      }) as Message,
  );
}

/** The calls the conversation has made and nothing has answered: what a client still has to run. */
function unanswered(messages: Message[]) {
  const answered = new Set(
    messages.flatMap((message) =>
      message.role === "tool" ? [message.toolCallId] : [],
    ),
  );
  return messages.flatMap((message) =>
    message.role === "assistant"
      ? (message.toolCalls ?? [])
          .filter((call) => !answered.has(call.id))
          .map((call) => call.function.name)
      : [],
  );
}

const toolMessages = (messages: Message[], toolCallId: string) =>
  messages.filter(
    (message) => message.role === "tool" && message.toolCallId === toolCallId,
  );

const environment = {
  url: process.env.MANAGED_AGENT_AG_UI_URL,
  token: process.env.MANAGED_AGENT_TOKEN,
  router: process.env.FREEDUET_ROUTER,
};
const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};
beforeEach(() => {
  process.env.MANAGED_AGENT_TOKEN = MANAGED_TOKEN;
  delete process.env.FREEDUET_ROUTER;
  markFreeDuetPackage(true);
});
afterEach(() => {
  markFreeDuetPackage(false);
  restore("MANAGED_AGENT_AG_UI_URL", environment.url);
  restore("MANAGED_AGENT_TOKEN", environment.token);
  restore("FREEDUET_ROUTER", environment.router);
});

/** Iris, the way the server builds a remote Bot at agent-freeduet, with the team's tools. */
async function irisAt(url: string, team: ReturnType<typeof coordination>) {
  process.env.MANAGED_AGENT_AG_UI_URL = url;
  const agents = await buildAgents(
    [member("freeduet", "Iris", "Chief of Staff", url)],
    { provider: "anthropic", defaultModel: "claude-test" },
    null,
    undefined,
    async () => [makePage],
    signRun(),
    undefined,
    undefined,
    undefined,
    undefined,
    team.forRun,
    undefined,
    PERSON,
  );
  return agents.freeduet as AbstractAgent;
}

// ── A frontend tool call: the browser runs it and sends the result with its next run ─────────────

describe("a frontend tool call ends the segment", () => {
  const COMPUTER_NAVIGATE = {
    name: "computer_navigate",
    description: "Open a page in the person's browser.",
    parameters: { type: "object", properties: { url: { type: "string" } } },
  };
  const OPENED = '{"ok":true,"title":"Example Domain"}';

  /** What the runtime's SSE handler does with a browser's POST: clone the agent, run it on the runner. */
  function browserRun(
    agent: AbstractAgent,
    runner: PgAgentRunner,
    threadId: string,
    messages: Message[],
  ) {
    const clone = agent.clone();
    clone.agentId = "freeduet";
    clone.setMessages(messages);
    clone.threadId = threadId;
    const input: RunAgentInput = {
      threadId,
      runId: `run-${randomUUID()}`,
      messages,
      tools: [COMPUTER_NAVIGATE],
      context: [],
      state: {},
      forwardedProps: {},
    };
    return {
      input,
      events: drain(runner.run({ threadId, agent: clone, input })),
    };
  }

  /** agent-freeduet: says one line and calls the browser's tool, then, with the result, answers. */
  function irisNavigates() {
    return fakeAgentFreeduet((input) =>
      input.messages.at(-1)?.role === "tool"
        ? said("iris-2", "The page is open.")
        : [
            ...said("iris-1", "Opening the page."),
            ...toolCall(
              "call-nav",
              "computer_navigate",
              { url: "https://example.com" },
              "iris-1",
            ),
          ],
    );
  }

  const ASK: Message = {
    id: "u-1",
    role: "user",
    content: "Open example.com",
  };

  test("the pause is streamed and stored the same way: the call stays open, nothing answers it", async () => {
    using fake = irisNavigates();
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const agent = await irisAt(
      fake.url,
      coordination(createApprovalService(memoryApprovals().store)),
    );

    const paused = browserRun(agent, runner, threadId, [ASK]);
    const live = await paused.events;

    const shape = [
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ];
    expect(typesOf(live)).toEqual(shape);

    const stored = await storedEventsOf(threadId);
    expect(stored.rows.map((row) => row.status)).toEqual(["finished"]);
    expect(typesOf(stored.events)).toEqual(shape);
    expect(stored.text).not.toContain(MISSING);

    // What a client that reads the conversation back sees: a call nobody has answered.
    const messages = await conversation(store, threadId);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(unanswered(messages)).toEqual(["computer_navigate"]);
    // And what a reload replays.
    expect(typesOf(await drain(runner.connect({ threadId })))).toEqual(shape);
  });

  test("the client's next run brings the result, and the Bot is told the real one, once", async () => {
    using fake = irisNavigates();
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const agent = await irisAt(
      fake.url,
      coordination(createApprovalService(memoryApprovals().store)),
    );
    await browserRun(agent, runner, threadId, [ASK]).events;

    // The client reads the conversation back (a reload, or the eval runner's way of working),
    // finds the call unanswered, runs it in the browser and adds the result.
    const history = await conversation(store, threadId);
    expect(unanswered(history)).toEqual(["computer_navigate"]);
    const result: Message = {
      id: "tool-real-1",
      role: "tool",
      toolCallId: "call-nav",
      content: OPENED,
    };
    const followUp = browserRun(agent, runner, threadId, [...history, result]);
    const events = await followUp.events;
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);

    // The Bot read one answer to the call, the real one.
    const seen = fake.requests.at(-1)?.messages ?? [];
    expect(
      toolMessages(seen, "call-nav").map((message) => message.content),
    ).toEqual([OPENED]);

    // The stored conversation holds one answer, the same, and the Bot's reply after it.
    const messages = await conversation(store, threadId);
    expect(
      toolMessages(messages, "call-nav").map((message) => message.content),
    ).toEqual([OPENED]);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(unanswered(messages)).toEqual([]);
    const stored = await storedEventsOf(threadId);
    expect(stored.rows.map((row) => row.status)).toEqual([
      "finished",
      "finished",
    ]);
    expect(stored.text).not.toContain(MISSING);
  });

  test("a browser that sends its own copy of the conversation, with the result it ran, leaves the thread one answer", async () => {
    using fake = irisNavigates();
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const agent = await irisAt(
      fake.url,
      coordination(createApprovalService(memoryApprovals().store)),
    );
    await browserRun(agent, runner, threadId, [ASK]).events;

    // What the browser's SDK holds after the first run: the call as streamed, then the result.
    const called: Message = {
      id: "iris-1",
      role: "assistant",
      content: "Opening the page.",
      toolCalls: [
        {
          id: "call-nav",
          type: "function",
          function: {
            name: "computer_navigate",
            arguments: '{"url":"https://example.com"}',
          },
        },
      ],
    };
    await browserRun(agent, runner, threadId, [
      ASK,
      called,
      {
        id: "tool-real-1",
        role: "tool",
        toolCallId: "call-nav",
        content: OPENED,
      },
    ]).events;

    const messages = await conversation(store, threadId);
    expect(
      toolMessages(messages, "call-nav").map((message) => message.content),
    ).toEqual([OPENED]);
    expect((await storedEventsOf(threadId)).text).not.toContain(MISSING);
  });
});

// ── An approval: message_bot waits for the person, and the approvals resume carries it on ────────

describe("an approval pauses the run", () => {
  const ask = {
    bot: "Penny",
    task: "Check what Northwind owes for March and draft a polite reminder.",
    constraints: "Do not send anything.",
  };
  const PERSON_SAID =
    "Northwind still hasn't paid March's invoice. Ask Penny to check what they owe and draft a reminder.";

  /** Iris at agent-freeduet: calls message_bot, then says one line once the result is back. */
  async function irisWaitingForApproval() {
    const fake = fakeAgentFreeduet((input) =>
      input.messages.some((message) => message.role === "tool")
        ? said(`iris-${input.runId}`, "Noted.")
        : toolCall("call-penny", "message_bot", ask),
    );
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const approvals = memoryApprovals();
    const service = createApprovalService(
      approvals.store,
      undefined,
      undefined,
      { review: reviewer(NEEDS_APPROVAL).review },
    );
    const team = coordination(service);
    const agent = await irisAt(fake.url, team);
    const runTurn = createTurnRunner({
      admission: async ({ signal }) => signal ?? new AbortController().signal,
      intelligence: new LocalIntelligence(store),
      runner,
      buildAgentFor: async () => agent.clone(),
    });
    const turn = (instruction: string) =>
      runTurn({
        ownerUserId: ACTOR,
        routineId: "test",
        agentId: "freeduet",
        threadId,
        instruction,
        initiator: PERSON,
      });
    return {
      fake,
      store,
      runner,
      threadId,
      approvals,
      service,
      team,
      turn,
      runTurn,
    };
  }

  /** The approvals resume, as resume-sweep.ts runs it: carry the action out, then continue the turn. */
  async function resume(
    f: Awaited<ReturnType<typeof irisWaitingForApproval>>,
    decision: "allow_once" | "deny",
  ) {
    const [request] = await f.approvals.store.list(ACTOR);
    expect(request?.status).toBe("pending");
    await f.service.decide(ACTOR, request?.id as string, decision);
    const execute = createApprovedActionExecutor({
      sourceFor: async () => ({ channelId: "freeduet" }),
      gate: f.service.gate,
      computerTools: async () => [],
      hostTools: () => [],
      callTool: async () => {
        throw new Error("a hand-off is not a connector call");
      },
      credentialActorFor: async (actorId) => actorId,
      coordinationCall: (input) => f.team.tools.call(input),
      readRun: (value) => readRunAssertion(value, KEY),
      answer: (result) => result.text,
      privateShareToolRef: "openbot/private_share",
      refusalMarker: "Refused.",
      personInitiator: PERSON,
    });
    await f.service.resume(ACTOR, request?.id as string, {
      validate: (action) =>
        f.service.validateReentry(action, () => execute(action)),
      execute,
      continue: async ({ continuation, result, messageId }) => {
        await f.runTurn({
          ownerUserId: ACTOR,
          routineId: "approval",
          agentId: "freeduet",
          threadId: continuation.threadId,
          instruction: "",
          initiator: continuation.initiator ?? PERSON,
          continuation: { snapshot: continuation, result, messageId },
        });
      },
    });
  }

  async function pauses(f: Awaited<ReturnType<typeof irisWaitingForApproval>>) {
    const outcome = await f.turn(PERSON_SAID).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
  }

  test("the wait is stored as it was streamed: waiting, then an interrupt, the call open and unanswered", async () => {
    const f = await irisWaitingForApproval();
    using _ = f.fake;
    await pauses(f);

    const stored = await storedEventsOf(f.threadId);
    expect(stored.rows.map((row) => row.status)).toEqual(["finished"]);
    expect(typesOf(stored.events)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.CUSTOM,
      EventType.RUN_FINISHED,
    ]);
    const [, , , , waiting, finished] = stored.events as unknown as [
      unknown,
      unknown,
      unknown,
      unknown,
      { name: string },
      { outcome?: { type: string } },
    ];
    expect(waiting.name).toBe("openbot.headless.waiting");
    expect(finished.outcome?.type).toBe("interrupt");
    expect(stored.text).not.toContain(MISSING);

    const messages = await conversation(f.store, f.threadId);
    expect(unanswered(messages)).toEqual(["message_bot"]);
    expect(f.team.sent).toHaveLength(0);
  });

  test("approved: the hand-off goes out once and the Bot reads its result, the only answer to the call", async () => {
    const f = await irisWaitingForApproval();
    using _ = f.fake;
    await pauses(f);
    await resume(f, "allow_once");

    expect(f.team.sent).toHaveLength(1);
    const seen = f.fake.requests.at(-1)?.messages ?? [];
    const answers = toolMessages(seen, "call-penny");
    expect(answers).toHaveLength(1);
    expect(String(answers[0]?.content)).toStartWith(HANDED_OVER);

    const messages = await conversation(f.store, f.threadId);
    const stored = toolMessages(messages, "call-penny");
    expect(stored).toHaveLength(1);
    expect(String(stored[0]?.content)).toStartWith(HANDED_OVER);
    expect(unanswered(messages)).toEqual([]);
    expect((await storedEventsOf(f.threadId)).text).not.toContain(MISSING);

    // The next turn is seeded from the thread and reads the real answer to the call.
    await f.turn("Thanks.");
    const later = f.fake.requests.at(-1)?.messages ?? [];
    expect(
      toolMessages(later, "call-penny").map((message) => message.content),
    ).toEqual([stored[0]?.content]);
  });

  test("denied: the Bot reads the refusal, the only answer to the call, and nothing is sent", async () => {
    const f = await irisWaitingForApproval();
    using _ = f.fake;
    await pauses(f);
    await resume(f, "deny");

    expect(f.team.sent).toHaveLength(0);
    const seen = f.fake.requests.at(-1)?.messages ?? [];
    const answers = toolMessages(seen, "call-penny");
    expect(answers).toHaveLength(1);
    expect(String(answers[0]?.content)).not.toContain(MISSING);

    const messages = await conversation(f.store, f.threadId);
    expect(
      toolMessages(messages, "call-penny").map((message) => message.content),
    ).toEqual([answers[0]?.content]);
    expect((await storedEventsOf(f.threadId)).text).not.toContain(MISSING);

    await f.turn("Thanks.");
    const later = f.fake.requests.at(-1)?.messages ?? [];
    expect(
      toolMessages(later, "call-penny").map((message) => message.content),
    ).toEqual([answers[0]?.content]);
  });
});

// ── A run that really ended abruptly is still closed ─────────────────────────────────────────────

type Script = (context: {
  input: RunAgentInput;
  emit: (event: BaseEvent) => void;
  subscriber: Subscriber<BaseEvent>;
}) => void;

/** A Bot whose run is whatever the script emits. `abortRun` ends a run the script left open. */
class ScriptedAgent extends AbstractAgent {
  private open?: Subscriber<BaseEvent>;
  constructor(private readonly script: Script) {
    super({ agentId: "freeduet" });
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      this.open = subscriber;
      this.script({
        input,
        emit: (event) => subscriber.next(event),
        subscriber,
      });
    });
  }
  override abortRun(): void {
    this.open?.complete();
  }
}

/** A run that announces a call and gets as far as its END, which `then` takes on from. */
function announcesACall(then: Script): Script {
  return (context) => {
    const { input, emit } = context;
    emit({
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    } as BaseEvent);
    for (const event of toolCall("call-1", "computer_navigate", {}))
      emit(event as unknown as BaseEvent);
    then(context);
  };
}

async function scripted(threadId: string, script: Script) {
  const agent = new ScriptedAgent(script);
  agent.threadId = threadId;
  const messages: Message[] = [{ id: "u-1", role: "user", content: "Go" }];
  agent.setMessages(messages);
  const input: RunAgentInput = {
    threadId,
    runId: `run-${randomUUID()}`,
    messages,
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
  return { agent, input };
}

describe("a run that really ends without a terminal event", () => {
  const answerOf = (events: BaseEvent[]) =>
    events.find((event) => event.type === EventType.TOOL_CALL_RESULT) as
      | { content: string }
      | undefined;

  test("the Bot's stream fails with a call open: the call is answered with the failure and the run fails", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const { agent, input } = await scripted(
      threadId,
      announcesACall(({ subscriber }) => {
        // After the events above have gone through, as a connection that drops mid-run does.
        setTimeout(() => subscriber.error(new Error("The Bot went away.")), 50);
      }),
    );
    const live = await drain(runner.run({ threadId, agent, input }));
    expect(typesOf(live).slice(-3)).toEqual([
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.RUN_ERROR,
    ]);
    const stored = await storedEventsOf(threadId);
    expect(stored.rows.map((row) => row.status)).toEqual(["failed"]);
    expect(JSON.parse(answerOf(stored.events)?.content ?? "{}")).toEqual({
      status: "error",
      reason: MISSING,
      message: "The Bot went away.",
    });
    expect(typesOf(stored.events).at(-1)).toBe(EventType.RUN_ERROR);
  });

  test("a stop with a call open: the call is answered as stopped and the run is stopped", async () => {
    const { store, runner } = boot();
    const threadId = await newThread(store);
    const { agent, input } = await scripted(
      threadId,
      announcesACall(() => {}),
    );
    const streamed = drain(runner.run({ threadId, agent, input }));
    await untilStored(threadId, "call-1");
    expect(await runner.stop({ threadId, runId: input.runId })).toBe(true);
    await streamed;
    const stored = await storedEventsOf(threadId);
    expect(stored.rows.map((row) => row.status)).toEqual(["stopped"]);
    expect(JSON.parse(answerOf(stored.events)?.content ?? "{}")).toMatchObject({
      status: "stopped",
      reason: "stop_requested",
    });
    expect(typesOf(stored.events).at(-1)).toBe(EventType.RUN_FINISHED);
  });

  test("a process that dies with a call open: the sweep answers it as interrupted and ends the run in error", async () => {
    const crashed = boot();
    const threadId = await newThread(crashed.store);
    const { agent, input } = await scripted(
      threadId,
      announcesACall(({ emit }) =>
        emit({
          type: EventType.TEXT_MESSAGE_START,
          messageId: "m-1",
          role: "assistant",
        } as BaseEvent),
      ),
    );
    drain(crashed.runner.run({ threadId, agent, input })).catch(
      () => undefined,
    );
    await untilStored(threadId, "call-1");

    const restarted = boot();
    try {
      expect(
        await restarted.runner.sweepInterruptedRuns(),
      ).toBeGreaterThanOrEqual(1);
      const stored = await storedEventsOf(threadId);
      expect(stored.rows.map((row) => row.status)).toEqual(["interrupted"]);
      expect(
        JSON.parse(answerOf(stored.events)?.content ?? "{}"),
      ).toMatchObject({ status: "error", reason: MISSING });
      expect(typesOf(stored.events).at(-1)).toBe(EventType.RUN_ERROR);
    } finally {
      await crashed.runner.stop({ threadId });
    }
  });
});

// ── What is stored when the Bot itself ends the run ──────────────────────────────────────────────

describe("sealing a run's events for storage", () => {
  const event = (value: Record<string, unknown>) =>
    value as unknown as BaseEvent;
  const started = event({ type: "RUN_STARTED", threadId: "t", runId: "r" });
  const finished = event({ type: "RUN_FINISHED", threadId: "t", runId: "r" });
  const failed = event({ type: "RUN_ERROR", message: "boom" });
  const openCall = [
    event({ type: "TOOL_CALL_START", toolCallId: "c", toolCallName: "x" }),
    event({ type: "TOOL_CALL_ARGS", toolCallId: "c", delta: "{}" }),
    event({ type: "TOOL_CALL_END", toolCallId: "c" }),
  ];

  test("a call that was ended and never answered stays as it is, before RUN_FINISHED or RUN_ERROR", () => {
    for (const terminal of [finished, failed]) {
      const events = [started, ...openCall, terminal];
      expect(sealRuns(events)).toEqual(events);
    }
  });

  test("what the Bot left unclosed is ended before the terminal event, and no answer is made up", () => {
    const events = [
      started,
      event({ type: "TEXT_MESSAGE_START", messageId: "m", role: "assistant" }),
      event({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "Hi" }),
      ...openCall.slice(0, 2),
      finished,
    ];
    expect(typesOf(sealRuns(events))).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TEXT_MESSAGE_END,
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ]);
  });
});
