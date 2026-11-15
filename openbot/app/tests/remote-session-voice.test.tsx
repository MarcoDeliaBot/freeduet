/**
 * A remote session (docs/design/remote-session-voice.md) is a signed-in browser that is not paired with the
 * computer. The server refuses it the voice chats, the microphone and the call (server/src/auth/remote-limits.ts,
 * `ALL /api/voice/*` and `ALL /api/audio/*`), and `/api/me` says so with `remote`. The chat must then ask for
 * none of them and show none of their errors. A paired browser keeps all three, and a list that really fails
 * still says so.
 *
 * THE HARNESS IS THIS REPOSITORY'S, as in `channel-voice-mark.test.tsx`: the real chat, the real query client, and a
 * fetch fixture that records what left the browser. Nothing here opens a microphone or a call.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import type { Message, RunAgentInput } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { type InfiniteData, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  type RenderResult,
  render,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelChat } from "@/components/channels/channel-chat";
import { type AuthenticatedUser, authKeys } from "@/lib/auth/queries";
import {
  type AgentChannel,
  type ChannelPage,
  type ChannelSummary,
  channelKeys,
} from "@/lib/channels/queries";
import { deploymentKeys } from "@/lib/deployment/queries";
import { queryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

const NativeResponse = globalThis.Response;

const channel: AgentChannel = {
  id: "remote-voice-channel",
  name: "Remote voice",
  agentIds: ["remote-voice-bot"],
  threadId: "remote-voice-thread",
  active: true,
  lastMessageAt: "2026-09-09T00:00:00.000Z",
};

const opening = {
  id: "opening",
  role: "assistant",
  content: "Stored opening",
} satisfies Message;

/** A saved call, as `/api/voice/sessions` lists it. */
const savedCall = {
  id: "call-1",
  anchorMessageId: null,
  channelId: channel.id,
  startedAt: "2026-09-22T12:00:00.000Z",
  endedAt: "2026-09-22T12:01:00.000Z",
  durationSeconds: 60,
  summary: "Planned tomorrow's recording.",
  summaryStatus: "ready",
  transcript: [{ id: "user", role: "user", text: "Let's record tomorrow." }],
};

const VOICE_ERROR = "Couldn’t load voice chats. Reload the page.";
const VOICE_NOTICE =
  "Couldn’t bring in what was said on the call. You may need to repeat it.";
const MICROPHONE = "Dictate a message";
const CALL = "Start voice call";

/** The run inputs that actually left the browser, in order. */
let runs: RunAgentInput[];
/** How many times the voice chats were asked for. */
let voiceAsks: number;
/** The answer `/api/voice/sessions` gives this test. */
let voiceAnswer: () => Response;
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
      if (url.pathname === "/api/voice/sessions") {
        voiceAsks += 1;
        return voiceAnswer();
      }
      if (url.pathname === "/api/plugins/for/remote-voice-bot")
        return NativeResponse.json({ skills: [], tools: [] });
      if (url.pathname.endsWith("/info"))
        return NativeResponse.json({
          version: "fixture",
          agents: {
            "remote-voice-bot": { description: "Fixture", capabilities: {} },
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
  voiceAsks = 0;
  voiceAnswer = () => NativeResponse.json({ sessions: [], nextCursor: null });
  // Seeded, so the capabilities are never asked over a network: the microphone and the call are both offered
  // to a paired browser, and the test decides what the browser may reach.
  queryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
    voice: true,
  });
  // A page that may open a microphone, as in the voice mark test.
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

/** The browser's own answer, as `/api/me` gives it: a remote session, or a paired browser. */
function signedIn(remote: boolean) {
  const person: AuthenticatedUser = {
    id: "person-1",
    email: "person@example.test",
    role: "user",
    onboarding: null,
    remote,
  };
  queryClient.setQueryData(authKeys.currentUser(), person);
}

function cacheChannel() {
  const summary: ChannelSummary = {
    ...channel,
    summary: null,
    lastMessage: null,
    lastMessageAgentId: "remote-voice-bot",
    lastMessageAt: channel.lastMessageAt,
    createdAt: "2026-09-09T00:00:00.000Z",
    pinned: false,
    lastReadAt: null,
  };
  queryClient.setQueryData<InfiniteData<ChannelPage>>(channelKeys.list(), {
    pages: [{ channels: [summary], nextCursor: null }],
    pageParams: [""],
  });
}

function tree() {
  return (
    <QueryClientProvider client={queryClient}>
      <CopilotKitProvider runtimeUrl="http://localhost/api/copilotkit">
        <ChannelChat channel={channel} runtimeAgentId="remote-voice-bot" />
      </CopilotKitProvider>
    </QueryClientProvider>
  );
}

async function mounted() {
  cacheChannel();
  const view = render(tree());
  await view.findByText(opening.content);
  return view;
}

async function send(view: RenderResult, text: string) {
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.type(view.getByRole("textbox", { name: "Message" }), text);
  await user.click(view.getByRole("button", { name: "Send message" }));
}

test("a remote session asks for no voice chats, shows no voice error, and is offered neither the microphone nor the call", async () => {
  signedIn(true);
  voiceAnswer = () =>
    NativeResponse.json(
      { error: "Could not load voice chats." },
      { status: 500 },
    );
  const view = await mounted();
  // Sending a message also brings in the voice history, so it must not ask either.
  await send(view, "Hello from a remote browser");
  await waitFor(() => expect(runs).toHaveLength(1));

  expect(voiceAsks).toBe(0);
  expect(view.queryByText(VOICE_ERROR)).toBeNull();
  expect(view.queryByText(VOICE_NOTICE)).toBeNull();
  expect(view.queryByRole("button", { name: MICROPHONE })).toBeNull();
  expect(view.queryByRole("button", { name: CALL })).toBeNull();
});

test("a paired session still shows the voice-chats error when the list really fails", async () => {
  signedIn(false);
  voiceAnswer = () =>
    NativeResponse.json(
      { error: "Could not load voice chats." },
      { status: 500 },
    );
  const view = await mounted();

  expect(
    await view.findByText(VOICE_ERROR, undefined, { timeout: 5000 }),
  ).toBeDefined();
  expect(voiceAsks).toBeGreaterThan(0);
});

test("a paired session loads its voice chats into the conversation", async () => {
  signedIn(false);
  voiceAnswer = () =>
    NativeResponse.json({ sessions: [savedCall], nextCursor: null });
  const view = await mounted();

  expect(
    await view.findByText(savedCall.summary, undefined, { timeout: 5000 }),
  ).toBeDefined();
  expect(view.queryByText(VOICE_ERROR)).toBeNull();
  expect(voiceAsks).toBeGreaterThan(0);
});

test("a paired session is offered the microphone and the call, as before", async () => {
  signedIn(false);
  const view = await mounted();

  expect(view.getByRole("button", { name: MICROPHONE })).toBeDefined();
  expect(view.getByRole("button", { name: CALL })).toBeDefined();
});

/* FreeDuet (D47): the line a remote session reads above the message box. */
const UNPAIRED =
  /This browser is not paired with the computer FreeDuet runs on/;

test("a remote session reads one line saying the browser is not paired, with the command to pair it", async () => {
  signedIn(true);
  const view = await mounted();

  expect(view.getAllByText(UNPAIRED)).toHaveLength(1);
  expect(view.getByText("bash scripts/open.sh")).toBeDefined();
});

test("the unpaired line can be dismissed for the visit and is back on a new visit", async () => {
  signedIn(true);
  const view = await mounted();
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.click(view.getByRole("button", { name: "Dismiss" }));
  expect(view.queryByText(UNPAIRED)).toBeNull();

  view.unmount();
  const again = await mounted();
  expect(again.getAllByText(UNPAIRED)).toHaveLength(1);
});

test("a paired browser, and one where /api/me says nothing about it, read no unpaired line", async () => {
  signedIn(false);
  const paired = await mounted();
  expect(paired.queryByText(UNPAIRED)).toBeNull();
  paired.unmount();
  cleanup();

  // Single-user mode: `remote` is absent from the answer, which the app reads as false.
  queryClient.setQueryData(authKeys.currentUser(), {
    id: "person-1",
    email: "person@example.test",
    role: "user",
    onboarding: null,
  } satisfies AuthenticatedUser);
  const single = await mounted();
  expect(single.queryByText(UNPAIRED)).toBeNull();
});
