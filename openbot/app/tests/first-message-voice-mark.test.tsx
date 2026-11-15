import "./home-fallback-routing.fixture";

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
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  type RenderResult,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupChat } from "@/components/channels/group-chat";
import * as transcript from "@/components/channels/transcript-messages";
import { type AgentProfile, agentKeys } from "@/lib/agents/queries";
import { deploymentKeys } from "@/lib/deployment/queries";
import * as recording from "@/lib/dictation/recording";
import { type GroupConversation, groupKeys } from "@/lib/groups";
import { queryClient as appQueryClient } from "@/query-client";
import { Route as HomeRoute } from "@/routes/_authed/_app/start";
import { settleReactWork } from "./settle-react-work";

/**
 * THE FIRST MESSAGE OF A CONVERSATION, AND A GROUP'S MESSAGES, CARRY THE MARK TOO
 * (docs/design/voice.md, D7 and D8).
 *
 * The composer marks a draft that was dictated and sent with one press ("Transcribe and send"). A
 * message sent from the conversation the person is in becomes a run with a `voice-` id in
 * `channel-voice-mark.test.tsx`. Three places send a draft without being that conversation, and each
 * would have turned dictation into typed words if it dropped the mark on the way:
 *
 * - the compose screens (home, new conversation, first day) stash the first message and navigate; the
 *   channel that opens sends it. They hand the stash the words and the mark;
 * - a group conversation posts the message to the server under an id the browser makes, and the
 *   server hands each Bot that id as the person's message;
 * - a new group's first message is posted from the compose screen.
 *
 * What is pinned here is what each of them hands over. The stash is read through a spy on the one call
 * the screens make (`stashFirstMessage(channelId, text, voice)`), and the group's post through the
 * fixture's fetch. Nothing here opens a microphone: the recorder and the transcriber are the spied
 * seams, as in `composer-voice-mark.test.tsx`. Each case that is typed is a guard.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const originalFetch = global.fetch;

// The composer asks the app's own client for what the deployment offers, whatever provider it sits
// under, so the microphone is turned on there.
beforeEach(() =>
  appQueryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
  }),
);
afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
  appQueryClient.clear();
});

afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

/** Runs `run` with a microphone that records and a transcriber that answers `transcript`. */
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

/** Starts a recording and presses the one-press button, by the name the person reads. */
async function dictateAndSend(view: RenderResult, transcribed: () => number) {
  // Found rather than got: the home screen is a route, and draws a moment after it is rendered.
  fireEvent.click(
    await view.findByRole("button", { name: "Dictate a message" }),
  );
  await waitFor(() => expect(view.getByText("Listening")).toBeDefined());
  fireEvent.click(view.getByRole("button", { name: "Transcribe and send" }));
  await waitFor(() => expect(transcribed()).toBe(1));
}

async function typeAndSend(view: RenderResult, text: string) {
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.type(await view.findByRole("textbox", { name: "Message" }), text);
  await user.click(await view.findByRole("button", { name: "Send message" }));
}

/* ------------------------------------------------------------------ the stash */

test("the stash hands back the words with whether they came from the microphone, once", () => {
  transcript.stashFirstMessage("stash-voice", "dictated words", true);
  expect(transcript.takeFirstDraft("stash-voice")).toEqual({
    text: "dictated words",
    voice: true,
  });
  expect(transcript.takeFirstDraft("stash-voice")).toBeNull();
});

test("guard: words stashed with no mark are typed words, and the text alone is still what takeFirstMessage gives", () => {
  transcript.stashFirstMessage("stash-typed", "typed words");
  expect(transcript.takeFirstDraft("stash-typed")).toEqual({
    text: "typed words",
    voice: false,
  });
  transcript.stashFirstMessage("stash-typed-text", "typed words", false);
  expect(transcript.takeFirstMessage("stash-typed-text")).toBe("typed words");
  expect(transcript.takeFirstMessage("stash-typed-text")).toBeNull();
});

/* ------------------------------------------------------------ the home screen */

function agent(
  overrides: Partial<AgentProfile> & { id: string },
): AgentProfile {
  return {
    avatarSeed: "seed",
    builtIn: false,
    canManage: true,
    endpoint: null,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    pinned: false,
    mine: true,
    name: "Agent",
    roleDescription: "Role",
    systemOwned: false,
    title: "Title",
    visibility: "public",
    ...overrides,
  };
}

function homeClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  client.setQueryData(agentKeys.list(false), [
    agent({ id: "own-public", name: "Own Public" }),
  ]);
  return client;
}

function renderHome(client: QueryClient) {
  const rootRoute = createRootRoute({ component: HomeRoute.options.component });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function serveHome() {
  global.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/route")
        return Response.json({
          agentId: "own-public",
          fallback: false,
          name: "Own Public",
          reason: "matched",
          viaMention: false,
        });
      if (url === "/api/channels")
        return Response.json({
          channel: {
            busy: false,
            id: "home-channel",
            lastMessage: null,
            lastMessageAt: null,
            participantIds: ["own-public"],
            pinned: false,
            threadId: "home-thread",
            title: null,
            unread: false,
          },
        });
      throw new Error(`Unexpected fetch: ${url}`);
    },
    { preconnect: originalFetch.preconnect },
  );
}

test("guard: a first message typed on the home screen is stashed as typed words", async () => {
  const stash = spyOn(transcript, "stashFirstMessage");
  try {
    serveHome();
    const view = renderHome(homeClient());
    await typeAndSend(view, "write to ana@example.com saying hello");
    await waitFor(() => expect(stash).toHaveBeenCalledTimes(1));
    expect(stash.mock.calls[0]?.[1]).toBe(
      "write to ana@example.com saying hello",
    );
    expect(stash.mock.calls[0]?.[2] === true).toBe(false);
  } finally {
    stash.mockRestore();
  }
});

test("a first message sent from the home screen with one press of dictation is stashed as words from the microphone", async () => {
  const stash = spyOn(transcript, "stashFirstMessage");
  try {
    await withDictation("write to ana@example.com", async (transcribed) => {
      serveHome();
      const view = renderHome(homeClient());
      await dictateAndSend(view, transcribed);
      await waitFor(() => expect(stash).toHaveBeenCalledTimes(1));
      expect(stash.mock.calls[0]?.[1]).toBe("write to ana@example.com");
      expect(stash.mock.calls[0]?.[2]).toBe(true);
    });
  } finally {
    stash.mockRestore();
  }
});

/* ------------------------------------------------------------ a group chat */

const GROUP = "voice-mark-group";

function groupClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  const conversation: GroupConversation = {
    bots: [
      { id: "ada", name: "Ada" },
      { id: "grace", name: "Grace" },
    ],
    people: [],
    messages: [],
  };
  client.setQueryData(groupKeys.detail(GROUP), conversation);
  return client;
}

/** The bodies posted to the group, as the server would receive them. */
function serveGroup(posted: { id: string; text: string }[]) {
  global.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === `/api/groups/${GROUP}` && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return Response.json({ id: "queued", queued: true });
      }
      if (url === `/api/groups/${GROUP}`)
        return Response.json({ bots: [], people: [], messages: [] });
      if (url === "/api/me") return Response.json({ user: null });
      throw new Error(`Unexpected fetch: ${url}`);
    },
    { preconnect: originalFetch.preconnect },
  );
}

test("guard: a message typed in a group is posted under a plain id", async () => {
  const posted: { id: string; text: string }[] = [];
  serveGroup(posted);
  const view = render(
    <QueryClientProvider client={groupClient()}>
      <GroupChat channelId={GROUP} />
    </QueryClientProvider>,
  );
  await typeAndSend(view, "tell everyone hello");
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]?.text).toBe("tell everyone hello");
  expect(posted[0]?.id.startsWith("voice-")).toBe(false);
});

test("a message sent in a group with one press of dictation is posted under a `voice-` id, which the server hands each Bot", async () => {
  await withDictation("tell everyone hello", async (transcribed) => {
    const posted: { id: string; text: string }[] = [];
    serveGroup(posted);
    const view = render(
      <QueryClientProvider client={groupClient()}>
        <GroupChat channelId={GROUP} />
      </QueryClientProvider>,
    );
    await dictateAndSend(view, transcribed);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.text).toBe("tell everyone hello");
    expect(posted[0]?.id.startsWith("voice-")).toBe(true);
    // The server takes an id of up to 160 characters (`channels/group.ts`).
    expect(posted[0]?.id.length).toBeLessThanOrEqual(160);
  });
});
