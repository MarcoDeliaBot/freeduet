import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  spyOn,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  type RenderResult,
  render,
  waitFor,
} from "@testing-library/react";
import * as ChannelChatModule from "@/components/channels/channel-chat";
import * as transcript from "@/components/channels/transcript-messages";
import { ChatPresenceProvider } from "@/components/shell/chat-presence";
import { ChatScreen } from "@/components/shell/chat-screen";
import { agentKeys } from "@/lib/agents/queries";
import { type ChannelSummary, channelKeys } from "@/lib/channels/queries";
import { deploymentKeys } from "@/lib/deployment/queries";
import * as recording from "@/lib/dictation/recording";
import { queryClient as appQueryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

/**
 * THE FIRST MESSAGE OF A FIRST DAY (docs/design/voice.md, D7 and D8).
 *
 * Chat opened on nothing starts a conversation from the composer on the page, stashes the message
 * and hands it to the channel that opens. A message sent with the one-press "Transcribe and send" is
 * still words from the microphone when that channel sends it, so the screen has to say so in the
 * stash. The harness is `first-day.test.tsx`'s: the conversation is a stand-in, because drawing it
 * takes a whole CopilotKit runtime, and the person's account is left loading so that the Bot's own
 * greeting does not start first. The stash is read through a spy on the one call the screen makes.
 */

const channelChat = spyOn(ChannelChatModule, "ChannelChat");

const BOT = {
  id: "openduet",
  name: "OpenDuet",
  title: "Your proactive assistant",
  roleDescription: "",
  avatarSeed: "openduet",
  visibility: "private",
  endpoint: null,
  builtIn: true,
  hasAuth: false,
};

const CREATED: ChannelSummary = {
  id: "voice-mark-first-day",
  name: "OpenDuet",
  agentIds: [BOT.id],
  threadId: "thread-voice-mark-first-day",
  active: true,
  lastMessageAt: null,
  summary: null,
  lastMessage: null,
  lastMessageAgentId: null,
  createdAt: "2026-10-22T09:00:00.000Z",
  pinned: false,
  lastReadAt: null,
};

const originalFetch = global.fetch;

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  channelChat.mockImplementation((({
    channel,
  }: {
    channel: { id: string };
  }) => <div data-channel={channel.id} data-testid="ongoing-chat" />) as never);
});

beforeEach(() =>
  // The composer asks the app's own client for what the deployment offers: the microphone is on.
  appQueryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
  }),
);

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  window.localStorage.clear();
  appQueryClient.clear();
});

afterAll(async () => {
  channelChat.mockRestore();
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function serve() {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    // The account never answers, so the first-day greeting never starts ahead of the person.
    if (path === "/api/me") return new Promise<Response>(() => {});
    if (path === "/api/route" && method === "POST")
      return Response.json({
        agentId: BOT.id,
        name: BOT.name,
        reason: "named by the person asking",
        fallback: false,
        viaMention: true,
      });
    if (path === "/api/channels/first-day" && method === "POST")
      return Response.json({ start: { channel: CREATED, claimed: true } });
    if (path.startsWith("/api/channels"))
      return Response.json({ channels: [], nextCursor: null });
    if (path === "/api/bots/attention") return Response.json({ bots: [] });
    if (path.startsWith("/api/plugins/for/"))
      return Response.json({
        app: { key: path.split("/").pop(), state: "needs_setup" },
      });
    return Response.json({});
  }) as unknown as typeof fetch;
}

function openChat() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(agentKeys.list(false), [BOT]);
  client.setQueryData(channelKeys.list(), {
    pages: [{ channels: [], nextCursor: null }],
    pageParams: [""],
  });
  serve();
  return render(
    <QueryClientProvider client={client}>
      <ChatPresenceProvider>
        <ChatScreen />
      </ChatPresenceProvider>
    </QueryClientProvider>,
  );
}

/** Pastes the words into the composer's editor, as `first-day.test.tsx` does. */
function typeInto(container: HTMLElement, words: string) {
  const editor = container.querySelector("[contenteditable]") as HTMLElement;
  editor.focus();
  const caret = document.createRange();
  caret.selectNodeContents(editor);
  caret.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
  const clipboardData = {
    files: [],
    items: [],
    types: ["text/plain"],
    getData: (type: string) => (type === "text/plain" ? words : ""),
  };
  editor.dispatchEvent(
    Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
      clipboardData,
    }),
  );
}

/** Runs `run` with a microphone that records and a transcriber that answers `said`. */
async function withDictation(
  said: string,
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
    said,
  );
  try {
    await run(() => transcribe.mock.calls.length);
  } finally {
    cleanup();
    supported.mockRestore();
    start.mockRestore();
    transcribe.mockRestore();
  }
}

/**
 * The shell's composer is the compact glass one, which takes a spoken message in a sheet: "Speak a
 * message" opens it and starts the recording, and the sheet's own "Send" is the one press that
 * transcribes and sends.
 */
async function speakAndSend(view: RenderResult, transcribed: () => number) {
  fireEvent.click(await view.findByRole("button", { name: "Speak a message" }));
  const send = await view.findByRole("button", { name: "Stop and send" });
  await waitFor(() => expect(send.hasAttribute("disabled")).toBe(false));
  fireEvent.click(send);
  await waitFor(() => expect(transcribed()).toBe(1));
}

test("guard: a first message typed on the first-day screen is stashed as typed words", async () => {
  const stash = spyOn(transcript, "stashFirstMessage");
  try {
    const view = openChat();
    await act(async () => typeInto(view.container, "write to ana@example.com"));
    // Found before the act, not inside it: a `findBy` inside `act` switches the act environment off.
    const send = await view.findByRole("button", { name: "Send message" });
    await act(async () => {
      fireEvent.click(send);
    });
    await view.findByTestId("ongoing-chat");
    expect(stash).toHaveBeenCalledTimes(1);
    expect(stash.mock.calls[0]?.[0]).toBe(CREATED.id);
    expect(stash.mock.calls[0]?.[1]).toBe("write to ana@example.com");
    expect(stash.mock.calls[0]?.[2] === true).toBe(false);
  } finally {
    stash.mockRestore();
  }
});

test("a first message spoken on the first-day screen and sent with the sheet's Send is stashed as words from the microphone", async () => {
  const stash = spyOn(transcript, "stashFirstMessage");
  try {
    await withDictation("write to ana@example.com", async (transcribed) => {
      const view = openChat();
      await speakAndSend(view, transcribed);
      await view.findByTestId("ongoing-chat");
      expect(stash).toHaveBeenCalledTimes(1);
      expect(stash.mock.calls[0]?.[0]).toBe(CREATED.id);
      expect(stash.mock.calls[0]?.[1]).toBe("write to ana@example.com");
      expect(stash.mock.calls[0]?.[2]).toBe(true);
    });
  } finally {
    stash.mockRestore();
  }
});
