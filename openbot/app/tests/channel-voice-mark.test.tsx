import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  spyOn,
  test,
} from "bun:test";
import type { Message, RunAgentInput } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { type InfiniteData, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  type RenderResult,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelChat } from "@/components/channels/channel-chat";
import { stashFirstMessage } from "@/components/channels/transcript-messages";
import { deploymentKeys } from "@/lib/deployment/queries";
import * as recording from "@/lib/dictation/recording";
import {
  type AgentChannel,
  type ChannelPage,
  type ChannelSummary,
  channelKeys,
} from "@/lib/channels/queries";
import * as connection from "@/lib/voice/connection";
import type { VoiceConnection, VoiceEvent } from "@/lib/voice/types";
import { queryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

/**
 * THE ID EACH KIND OF MESSAGE LEAVES THE BROWSER UNDER, THROUGH THE REAL CHANNEL
 * (docs/design/voice.md, D7 and D8).
 *
 * The server decides whether a message is the person's own written request from the id of the
 * person's latest message in the run: the prefix `voice-` says it came from the microphone and never
 * earns a new email with no card or the Full access of a typed turn. So what has to be pinned is what
 * reaches the wire. Everything below the HTTP boundary is real (the provider, the agent, `say` and
 * `deliver`, the conversation view's queue, the composer, the voice session); the fetch is a fixture
 * that records the run inputs, and the recorder, the transcriber and the voice connection are the
 * spied seams: nothing here opens a microphone or a call.
 *
 * THE SPLIT, confirmed against the code. Marked: dictation sent with one press ("Transcribe and
 * send"), and a request the voice call's model writes (`ask_agent`). Not marked: text typed in the box,
 * and dictation placed in the box with "Stop and transcribe" and then sent with the Send button, which
 * the person could read and edit. A prefix is the only place the mark lives, so a plain id is read as
 * "does not start with `voice-`", whatever the id is.
 *
 * THE HARNESS IS THIS REPOSITORY'S, as in `failed-send-attachments.test.tsx`: `GlobalRegistrator`
 * around the file, `cleanup` after each test, `settleReactWork()` before the document goes away.
 */

const NativeResponse = globalThis.Response;

const channel: AgentChannel = {
  id: "voice-mark-channel",
  name: "Voice mark",
  agentIds: ["voice-mark-bot"],
  threadId: "voice-mark-thread",
  active: true,
  lastMessageAt: "2026-09-09T00:00:00.000Z",
};

const opening = {
  id: "opening",
  role: "assistant",
  content: "Stored opening",
} satisfies Message;

/** The run inputs that actually left the browser, in order. */
let runs: RunAgentInput[];
let originalFetch: typeof fetch;

function sse(events: unknown[]) {
  return new NativeResponse(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function finished(input: RunAgentInput) {
  return sse([
    { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
    { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
  ]);
}

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        "http://localhost",
      );
      if (url.pathname === "/api/agents")
        return NativeResponse.json({ agents: [] });
      if (url.pathname === "/api/voice/sessions")
        return NativeResponse.json({ sessions: [], nextCursor: null });
      if (url.pathname === "/api/plugins/for/voice-mark-bot")
        return NativeResponse.json({ skills: [], tools: [] });
      if (url.pathname.endsWith("/info"))
        return NativeResponse.json({
          version: "fixture",
          agents: {
            "voice-mark-bot": { description: "Fixture", capabilities: {} },
          },
          mode: "sse",
          telemetryDisabled: true,
        });
      if (url.pathname.endsWith("/connect"))
        return sse([
          { type: "RUN_STARTED", threadId: channel.threadId, runId: "join" },
          { type: "MESSAGES_SNAPSHOT", messages: [opening] },
          { type: "RUN_FINISHED", threadId: channel.threadId, runId: "join" },
        ]);
      if (url.pathname.endsWith("/run")) {
        const request =
          input instanceof Request ? input : new Request(url, init);
        const body = RunAgentInputSchema.parse(await request.json());
        runs.push(body);
        return finished(body);
      }
      if (/\/api\/channels\/[^/]+\/(activity|busy)$/.test(url.pathname))
        return new NativeResponse(null, { status: 204 });
      if (/\/threads\/[^/]+\/messages$/.test(url.pathname))
        return NativeResponse.json({ messages: [opening] });
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    },
    {
      preconnect() {
        throw new Error("Unexpected fixture preconnect");
      },
    },
  );
});

beforeEach(() => {
  runs = [];
  // Seeded, so a mounted channel never asks for the capabilities over a network nobody serves: the
  // microphone (`transcription`) and the call button (`voice`) are both on.
  queryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
    voice: true,
  });
  // A page that may open a microphone: the call button is disabled without one.
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: async () => ({}) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

function cacheChannel(on: AgentChannel = channel) {
  const summary: ChannelSummary = {
    ...on,
    summary: null,
    lastMessage: null,
    lastMessageAgentId: "voice-mark-bot",
    lastMessageAt: on.lastMessageAt,
    createdAt: "2026-09-09T00:00:00.000Z",
    pinned: false,
    lastReadAt: null,
  };
  queryClient.setQueryData<InfiniteData<ChannelPage>>(channelKeys.list(), {
    pages: [{ channels: [summary], nextCursor: null }],
    pageParams: [""],
  });
}

type TaskSend = NonNullable<
  NonNullable<Parameters<typeof ChannelChat>[0]["task"]>["send"]
>;

function tree(
  on: AgentChannel,
  task?: Parameters<typeof ChannelChat>[0]["task"],
) {
  return (
    <QueryClientProvider client={queryClient}>
      <CopilotKitProvider runtimeUrl="http://localhost/api/copilotkit">
        <ChannelChat
          channel={on}
          runtimeAgentId="voice-mark-bot"
          {...(task ? { task } : {})}
        />
      </CopilotKitProvider>
    </QueryClientProvider>
  );
}

async function mounted(task?: Parameters<typeof ChannelChat>[0]["task"]) {
  cacheChannel();
  const view = render(tree(channel, task));
  await view.findByText(opening.content);
  return view;
}

/** A channel nobody has opened yet, as the compose screen leaves it: a new id, and its first message stashed. */
let fresh = 0;
function freshChannel(): AgentChannel {
  fresh += 1;
  return { ...channel, id: `voice-mark-new-${fresh}` };
}

/** The id of the person's latest message in the run that left the browser, or the test fails. */
function sentId(run: RunAgentInput | undefined): string {
  const last = [...(run?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");
  if (!last) throw new Error("the run carried no message of the person's");
  return last.id;
}

const isVoice = (id: string) => id.startsWith("voice-");

/** Runs `run` with a microphone that records and a transcriber that answers `transcript`. */
async function withDictation(
  transcript: string,
  run: (transcribed: () => number) => Promise<void>,
) {
  const supported = spyOn(recording, "recordingSupported").mockReturnValue(
    true,
  );
  const start = spyOn(recording, "startRecording").mockResolvedValue({
    finish: async () => new Blob(["recording"], { type: "audio/webm" }),
    cancel() {},
  });
  const transcribe = spyOn(recording, "transcribeRecording").mockResolvedValue(
    transcript,
  );
  try {
    await run(() => transcribe.mock.calls.length);
  } finally {
    supported.mockRestore();
    start.mockRestore();
    transcribe.mockRestore();
  }
}

async function dictate(
  view: RenderResult,
  press: "Stop and transcribe" | "Transcribe and send",
  transcribed: () => number,
) {
  fireEvent.click(view.getByRole("button", { name: "Dictate a message" }));
  await waitFor(() => expect(view.getByText("Listening")).toBeDefined());
  fireEvent.click(view.getByRole("button", { name: press }));
  await waitFor(() => expect(transcribed()).toBe(1));
}

test("guard: a message typed in the box and sent with the Send button leaves under a plain id", async () => {
  const view = await mounted();
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.type(
    view.getByRole("textbox", { name: "Message" }),
    "Write to ana@example.com saying good morning",
  );
  await user.click(view.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(runs).toHaveLength(1));
  expect(isVoice(sentId(runs[0]))).toBe(false);
});

test('guard: dictation placed in the box with "Stop and transcribe" and sent with the Send button leaves under a plain id', async () => {
  await withDictation("write to ana@example.com", async (transcribed) => {
    const view = await mounted();
    const user = userEvent.setup({ document: view.container.ownerDocument });
    await dictate(view, "Stop and transcribe", transcribed);
    await waitFor(() =>
      expect(
        view.getByRole("textbox", { name: "Message" }).textContent,
      ).toContain("write to ana@example.com"),
    );
    expect(runs).toEqual([]);
    await user.click(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(isVoice(sentId(runs[0]))).toBe(false);
  });
});

test("dictation sent with one press leaves under a `voice-` id, so the server never takes it for the person's own written request", async () => {
  await withDictation("write to ana@example.com", async (transcribed) => {
    const view = await mounted();
    await dictate(view, "Transcribe and send", transcribed);
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(isVoice(sentId(runs[0]))).toBe(true);
    // The id is the only thing that changed: the words are the ones transcribed.
    const last = [...(runs[0]?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user");
    expect(last?.content).toBe("write to ana@example.com");
  });
});

test("a request the voice call's model writes with ask_agent leaves under a `voice-` id", async () => {
  let receive: (event: VoiceEvent) => void = () => {
    throw new Error("the call was never connected");
  };
  const fake: VoiceConnection = {
    stream: new EventTarget() as MediaStream,
    send() {},
    mute() {},
    close() {},
  };
  const connect = spyOn(connection, "connectVoice").mockImplementation(
    async (options) => {
      receive = options.onEvent;
      return fake;
    },
  );
  try {
    const view = await mounted();
    fireEvent.click(view.getByRole("button", { name: "Start voice call" }));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    // The model, not the person, writes this one, in its own words.
    await act(async () => {
      receive({
        type: "response.function_call_arguments.done",
        name: "ask_agent",
        call_id: "call-1",
        arguments: JSON.stringify({
          request: "Send Ana, ana@example.com, a note to say good morning.",
        }),
      });
    });
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(isVoice(sentId(runs[0]))).toBe(true);
    const last = [...(runs[0]?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user");
    expect(last?.content).toBe(
      "Send Ana, ana@example.com, a note to say good morning.",
    );
  } finally {
    connect.mockRestore();
  }
});

/*
 * A TASK'S OWN COMPOSER. A reply on a task's page is not sent through `say`: it is handed to the task
 * (`task.send`) with an id the browser makes, which the server uses for the run's user message
 * (`taskExecutionId`). So the mark has to be on that id as well, or dictation sent with one press on a
 * task would be the one place the decision did not reach.
 */
test("guard: a reply typed on a task's page is handed over under a plain message id", async () => {
  const sent: Parameters<TaskSend>[0][] = [];
  const view = await mounted({
    busy: false,
    durable: true,
    send: async (input) => {
      sent.push(input);
    },
  });
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.type(
    view.getByRole("textbox", { name: "Message" }),
    "Write to ana@example.com",
  );
  await user.click(view.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.text).toBe("Write to ana@example.com");
  expect(isVoice(sent[0]?.messageId ?? "voice-")).toBe(false);
});

test("a reply dictated on a task's page with one press is handed over under a `voice-` message id", async () => {
  await withDictation("write to ana@example.com", async (transcribed) => {
    const sent: Parameters<TaskSend>[0][] = [];
    const view = await mounted({
      busy: false,
      durable: true,
      send: async (input) => {
        sent.push(input);
      },
    });
    await dictate(view, "Transcribe and send", transcribed);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.text).toBe("write to ana@example.com");
    expect(isVoice(sent[0]?.messageId ?? "")).toBe(true);
    // The server accepts the id: letters, digits and hyphens, at most 64 (`task-store.ts`).
    expect(sent[0]?.messageId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});

/*
 * THE FIRST MESSAGE OF A NEW CHANNEL. It is typed or dictated on the compose screen (the home screen,
 * the new-conversation screen, a first day), which stashes it and navigates; the channel that opens
 * sends it. So the mark has to cross that hand-over with the text, or dictation sent with one press on
 * the compose screen would be sent as typed by the channel that follows. The stash is what the
 * screens fill (`first-message-voice-mark.test.tsx` pins that they do); this is what the channel does
 * with it.
 */
test("guard: a first message stashed as typed is sent under a plain id", async () => {
  const fresher = freshChannel();
  cacheChannel(fresher);
  stashFirstMessage(fresher.id, "Write to ana@example.com saying good morning");
  render(tree(fresher));
  await waitFor(() => expect(runs).toHaveLength(1));
  expect(isVoice(sentId(runs[0]))).toBe(false);
});

test("a first message stashed as dictation sent with one press is sent under a `voice-` id", async () => {
  const fresher = freshChannel();
  cacheChannel(fresher);
  stashFirstMessage(
    fresher.id,
    "Write to ana@example.com saying good morning",
    true,
  );
  render(tree(fresher));
  await waitFor(() => expect(runs).toHaveLength(1));
  expect(isVoice(sentId(runs[0]))).toBe(true);
  const last = [...(runs[0]?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");
  expect(last?.content).toBe("Write to ana@example.com saying good morning");
});
