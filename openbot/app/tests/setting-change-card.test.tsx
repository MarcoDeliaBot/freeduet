import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  CHANGE_SETTING_TOOL,
  type SettingChangeRecord,
  type SettingChangeResult,
  settingChangeResult,
} from "@openbot/shared/setting-change";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { ConversationView } from "@/components/channels/conversation-view";
import { CARD_TABLES } from "@/freeduet/person-language/cards";
import { CardLanguageProvider } from "@/freeduet/person-language/use-card-text";
import {
  SettingChangeCard,
  SettingChangeTool,
} from "@/freeduet/setting-change-card";
import { settleReactWork } from "./settle-react-work";

/**
 * Settings in chat (docs/design/settings-in-chat.md, section 8): the card a Bot's change leaves in the
 * conversation, drawn by the real renderer, and what its Undo does. The server's answers are served by a
 * fake fetch, and every request is recorded, so the test sees what the browser asked for.
 */

const originalFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const CHANGE: SettingChangeResult = {
  changeId: "3d2a6f1e-0000-4000-8000-00000000000a",
  agentId: "iris",
  setting: "notifications",
  previousValue: "all",
  newValue: "needs_input",
};

const RECORD: SettingChangeRecord = {
  ...CHANGE,
  at: "2026-11-14T09:30:00.000Z",
  undone: false,
  undoable: true,
};

/** What the fake server answers, and what was asked of it. */
type Answer = Response | Promise<Response>;
const asked: {
  method: string;
  url: string;
  credentials: RequestCredentials | undefined;
}[] = [];
let undoAnswer: () => Answer = () =>
  Response.json({
    undone: true,
    changeId: CHANGE.changeId,
    setting: "notifications",
    value: "all",
  });
let listAnswer: () => Answer = () => Response.json({ changes: [RECORD] });

beforeEach(() => {
  asked.length = 0;
  undoAnswer = () =>
    Response.json({
      undone: true,
      changeId: CHANGE.changeId,
      setting: "notifications",
      value: "all",
    });
  listAnswer = () => Response.json({ changes: [RECORD] });
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/agents")
        return Response.json({
          agents: [{ id: "iris", name: "Iris" }],
        });
      if (url === "/api/settings-changes" && method === "GET") {
        asked.push({ method, url, credentials: init?.credentials });
        return listAnswer();
      }
      if (url === `/api/settings-changes/${CHANGE.changeId}/undo`) {
        asked.push({ method, url, credentials: init?.credentials });
        return undoAnswer();
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

function card(
  change: SettingChangeResult = CHANGE,
  language: "it" | null = null,
) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queries}>
      <CardLanguageProvider language={language}>
        <SettingChangeCard change={change} />
      </CardLanguageProvider>
    </QueryClientProvider>,
  );
}

const region = (view: ReturnType<typeof card>) =>
  view.findByRole("region", { name: "Notifications changed" });

describe("the card", () => {
  test("says what changed, from what to what, for which Bot, and offers Undo", async () => {
    const view = card();

    const shown = await region(view);
    expect(
      await within(shown).findByText(
        "Iris's notifications went from everything to only when it needs you.",
      ),
    ).toBeTruthy();
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();
    // Nothing is undone until the person presses it.
    expect(asked.filter((request) => request.method === "POST")).toEqual([]);
  });

  test("pressing Undo calls the person's own route, and the card says Undone", async () => {
    const view = card();
    const shown = await region(view);

    fireEvent.click(within(shown).getByRole("button", { name: "Undo" }));

    expect(await within(shown).findByRole("status")).toBeTruthy();
    expect(within(shown).getByRole("status").textContent).toBe(
      "Undone. Notifications are back to everything.",
    );
    expect(within(shown).queryByRole("button")).toBeNull();
    expect(asked.filter((request) => request.method === "POST")).toEqual([
      {
        method: "POST",
        url: `/api/settings-changes/${CHANGE.changeId}/undo`,
        credentials: "include",
      },
    ]);
  });

  test("while the route answers, the button says Undoing and cannot be pressed again", async () => {
    let release: (response: Response) => void = () => {};
    undoAnswer = () => new Promise<Response>((resolve) => (release = resolve));
    const view = card();
    const shown = await region(view);

    fireEvent.click(within(shown).getByRole("button", { name: "Undo" }));
    const waiting = await within(shown).findByRole("button", {
      name: "Undoing…",
    });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(waiting);
    expect(asked.filter((request) => request.method === "POST").length).toBe(1);

    release(
      Response.json({
        undone: true,
        changeId: CHANGE.changeId,
        setting: "notifications",
        value: "all",
      }),
    );
    await within(shown).findByRole("status");
  });

  test("a refusal is shown in the route's own words, and takes the button away", async () => {
    undoAnswer = () =>
      Response.json(
        {
          error:
            "That setting has changed since, so nothing was undone. It is now needs_input.",
        },
        { status: 409 },
      );
    const view = card();
    const shown = await region(view);

    fireEvent.click(within(shown).getByRole("button", { name: "Undo" }));

    const alert = await within(shown).findByRole("alert");
    expect(alert.textContent).toBe(
      "That setting has changed since, so nothing was undone. It is now needs_input.",
    );
    expect(within(shown).queryByRole("button")).toBeNull();
    expect(within(shown).queryByRole("status")).toBeNull();
  });

  test("a failure that reached no answer says so, and the button stays so the person can try again", async () => {
    undoAnswer = () => new Response("", { status: 500 });
    const view = card();
    const shown = await region(view);

    fireEvent.click(within(shown).getByRole("button", { name: "Undo" }));

    expect((await within(shown).findByRole("alert")).textContent).toBe(
      "Couldn't undo the change. Try again.",
    );
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();

    undoAnswer = () =>
      Response.json({
        undone: true,
        changeId: CHANGE.changeId,
        setting: "notifications",
        value: "all",
      });
    fireEvent.click(within(shown).getByRole("button", { name: "Undo" }));
    expect(await within(shown).findByRole("status")).toBeTruthy();
    expect(within(shown).queryByRole("alert")).toBeNull();
  });

  test("a network failure is a failure too, in the card's words and not the browser's", async () => {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/undo"))
          throw new TypeError("Failed to fetch");
        asked.push({
          method: init?.method ?? "GET",
          url: String(input),
          credentials: init?.credentials,
        });
        return Response.json({ changes: [RECORD] });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    const view = card();
    const shown = await region(view);

    fireEvent.click(within(shown).getByRole("button", { name: "Undo" }));

    expect((await within(shown).findByRole("alert")).textContent).toBe(
      "Couldn't undo the change. Try again.",
    );
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  test("after a reload, a change the list says is undone reads Undone and offers no Undo", async () => {
    listAnswer = () =>
      Response.json({
        changes: [{ ...RECORD, undone: true, undoable: false }],
      });
    const view = card();
    const shown = await region(view);

    expect(await within(shown).findByRole("status")).toBeTruthy();
    expect(within(shown).getByRole("status").textContent).toBe(
      "Undone. Notifications are back to everything.",
    );
    expect(within(shown).queryByRole("button")).toBeNull();
    expect(asked.filter((request) => request.method === "POST")).toEqual([]);
  });

  test("a change the list says can no longer be undone offers no Undo, and says why", async () => {
    listAnswer = () =>
      Response.json({ changes: [{ ...RECORD, undoable: false }] });
    const view = card();
    const shown = await region(view);

    expect(
      await within(shown).findByText("Undo is no longer possible."),
    ).toBeTruthy();
    expect(within(shown).queryByRole("button")).toBeNull();
  });

  test("a change the list says can be undone keeps its button", async () => {
    const view = card();
    const shown = await region(view);

    await within(shown).findByText(
      "Iris's notifications went from everything to only when it needs you.",
    );
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(
      asked.filter((request) => request.method === "GET").length,
    ).toBeGreaterThan(0);
  });

  test("in Italian every word the card wrote is Italian", async () => {
    const view = card(CHANGE, "it");

    const shown = await view.findByRole("region", {
      name: CARD_TABLES.it["setting.heading"] as string,
    });
    expect(
      await within(shown).findByText(
        "Le notifiche di Iris sono passate da ogni aggiornamento a solo quando ha bisogno di te.",
      ),
    ).toBeTruthy();
    expect(
      within(shown).getByRole("button", {
        name: CARD_TABLES.it["setting.undo"] as string,
      }),
    ).toBeTruthy();
    expect(within(shown).queryByText(/went from/)).toBeNull();
  });
});

const CALL = {
  id: "call-1",
  type: "function" as const,
  function: {
    name: CHANGE_SETTING_TOOL,
    arguments: JSON.stringify({
      setting: "notifications",
      value: "needs_input",
    }),
  },
};

function transcript(result: string | null): Message[] {
  return [
    { id: "u1", role: "user", content: "Send me less, please." },
    { id: "a1", role: "assistant", content: "", toolCalls: [CALL] },
    ...(result === null
      ? []
      : [
          {
            id: "t1",
            role: "tool" as const,
            toolCallId: CALL.id,
            content: result,
          },
          {
            id: "a2",
            role: "assistant" as const,
            content: "Done. I will only ping you when I need you.",
          },
        ]),
  ];
}

function Chat({ messages }: { messages: Message[] }) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queries}>
      <CopilotKitProvider>
        <SettingChangeTool />
        <ConversationView messages={messages} onSubmit={() => {}} />
      </CopilotKitProvider>
    </QueryClientProvider>
  );
}

describe("the change_setting tool in the conversation", () => {
  test("a finished change is the card, with the member's words after it and its note not shown", async () => {
    const view = render(
      <Chat
        messages={transcript(
          settingChangeResult(CHANGE, "A note for the member."),
        )}
      />,
    );

    const shown = await view.findByRole("region", {
      name: "Notifications changed",
    });
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(
      view.getByText("Done. I will only ping you when I need you."),
    ).toBeTruthy();
    expect(view.queryByText("A note for the member.")).toBeNull();
  });

  test("a result the runtime encoded once more is the card too", async () => {
    const view = render(
      <Chat
        messages={transcript(
          JSON.stringify(settingChangeResult(CHANGE, "A note.")),
        )}
      />,
    );

    expect(
      await view.findByRole("region", { name: "Notifications changed" }),
    ).toBeTruthy();
  });

  test("a refusal draws no card: the member says so in its own words", async () => {
    const view = render(
      <Chat
        messages={transcript(
          "That setting cannot be changed from chat. Only you can change it, in the app's settings.",
        )}
      />,
    );

    expect(
      view.queryByRole("region", { name: "Notifications changed" }),
    ).toBeNull();
    expect(view.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  test("while the change is being made the tool says so, and draws no card yet", async () => {
    const view = render(<Chat messages={transcript(null)} />);

    expect(await view.findByText("Changing a setting")).toBeTruthy();
    expect(
      view.queryByRole("region", { name: "Notifications changed" }),
    ).toBeNull();
  });
});
