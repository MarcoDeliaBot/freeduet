import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { ServerToolLine } from "@/components/channels/chat-transcript";
import { ConversationView } from "@/components/channels/conversation-view";
import {
  CapabilityDemo,
  DEMO_BEAT_MS,
  demoDate,
} from "@/components/onboarding/capability-demo";
import {
  checkInNotice,
  useCheckInNotifications,
} from "@/components/shell/check-in-notifier";
import {
  ChatPresenceProvider,
  stepFor,
  THINKING,
} from "@/components/shell/chat-presence";
import { ShellHeader } from "@/components/shell/header";
import {
  CARD_TABLES,
  type CardLanguage,
  type CardTextId,
  cardDate,
  cardLanguageOf,
  cardText,
} from "@/freeduet/person-language/cards";
import {
  readStoredLanguage,
  STORED_LANGUAGE_KEY,
  storeLanguage,
} from "@/freeduet/person-language/stored-language";
import {
  ownToolLineIds,
  ownToolLineIn,
  TRANSLATED_OWN_TOOLS,
} from "@/freeduet/person-language/tool-lines";
import {
  CardLanguageProvider,
  PersonLanguageProvider,
  useCardText,
} from "@/freeduet/person-language/use-card-text";
import { authKeys } from "@/lib/auth/queries";
import type { CheckIn } from "@/lib/channels/check-in";
import { MorningBriefTool } from "@/lib/copilot/morning-brief-tool";
import { OfferTaskTool } from "@/lib/copilot/offer-task-tool";
import {
  humanise,
  ownToolLabel,
  personToolLabel,
  readToolName,
  stepPhrase,
} from "@/lib/plugins/tool-name";
import { settleReactWork } from "./settle-react-work";

/**
 * D26 amendment, the four leftovers of the cards: the running line of the morning brief and the
 * task offer (and the pill under the header's orb, which says the same words), the browser
 * notification a check-in raises, the onboarding demo's example brief, and the first paint before
 * `/api/capabilities` has answered.
 *
 * For each, the same two things are pinned as for the cards themselves (`freeduet-card-language`):
 * with no language, `en`, or a language with no table, the output is today's English byte for byte;
 * with `it`, the words are Italian and the English is gone.
 */

const originalFetch = globalThis.fetch;
const originalNotification = globalThis.Notification;
const storageDescriptor = () =>
  Object.getOwnPropertyDescriptor(window, "localStorage");
let originalStorage: PropertyDescriptor | undefined;

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  originalStorage = storageDescriptor();
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  globalThis.Notification = originalNotification;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  });
  if (originalStorage)
    Object.defineProperty(window, "localStorage", originalStorage);
  window.localStorage.clear();
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

/** What the server can send, as the language the cards read: none, `en` and `de` all draw English. */
const ENGLISH_LANGUAGES: readonly (CardLanguage | null)[] = [
  null,
  cardLanguageOf(undefined),
  cardLanguageOf("en"),
  cardLanguageOf("de"),
];

const TOOLS = {
  morning_brief: {
    english: {
      running: "Reading your mail and calendar",
      done: "Read your mail and calendar",
    },
    italian: {
      running: "Leggo posta e calendario",
      done: "Ho letto posta e calendario",
    },
  },
  offer_task: {
    english: { running: "Adding a task", done: "Added a task" },
    italian: {
      running: "Aggiungo un'attività",
      done: "Ho aggiunto un'attività",
    },
  },
} as const;

/*
 * ---------------------------------------------------------------------------------------------
 * 1. The running lines
 * ---------------------------------------------------------------------------------------------
 */

describe("the words of the two FreeDuet tools' lines", () => {
  test("with no language, `en` or one with no table, every reader of the vocabulary says today's English", () => {
    expect(ENGLISH_LANGUAGES.every((language) => language === null)).toBe(true);
    for (const [name, words] of Object.entries(TOOLS)) {
      for (const language of ENGLISH_LANGUAGES) {
        expect(ownToolLabel(name, true, language)).toBe(words.english.running);
        expect(ownToolLabel(name, false, language)).toBe(words.english.done);
        expect(readToolName(name, true, language).label).toBe(
          words.english.running,
        );
        expect(readToolName(name, false, language).label).toBe(
          words.english.done,
        );
        expect(stepPhrase(name, language)).toBe(words.english.running);
        expect(personToolLabel(name, "running", language)).toBe(
          words.english.running,
        );
        expect(personToolLabel(name, "done", language)).toBe(
          words.english.done,
        );
        expect(personToolLabel(name, "waiting", language)).toBeNull();
      }
      // And the calls that never heard of a language, which is every caller there was.
      expect(ownToolLabel(name, true)).toBe(words.english.running);
      expect(ownToolLabel(name)).toBe(words.english.done);
      expect(readToolName(name, true).label).toBe(words.english.running);
      expect(readToolName(name).label).toBe(words.english.done);
      expect(stepPhrase(name)).toBe(words.english.running);
      expect(personToolLabel(name)).toBe(words.english.done);
    }
  });

  test("in Italian the line, the pill's phrase and the folded summary's words are the same Italian", () => {
    for (const [name, words] of Object.entries(TOOLS)) {
      expect(ownToolLabel(name, true, "it")).toBe(words.italian.running);
      expect(ownToolLabel(name, false, "it")).toBe(words.italian.done);
      expect(readToolName(name, true, "it").label).toBe(words.italian.running);
      expect(readToolName(name, false, "it").label).toBe(words.italian.done);
      expect(stepPhrase(name, "it")).toBe(words.italian.running);
      expect(personToolLabel(name, "running", "it")).toBe(
        words.italian.running,
      );
      expect(personToolLabel(name, "done", "it")).toBe(words.italian.done);
      // A send waits on the person's OK; these two never do.
      expect(personToolLabel(name, "waiting", "it")).toBeNull();
    }
  });

  test("a line for a step that was refused or failed is still its plain name, in either language", () => {
    for (const name of Object.keys(TOOLS))
      for (const language of [null, "it"] as const)
        expect(readToolName(name, "plain", language).label).toBe(
          humanise(name),
        );
  });

  test("the English the table holds is the English of the shared vocabulary, so the two cannot drift", () => {
    expect([...TRANSLATED_OWN_TOOLS].sort() as string[]).toEqual(
      Object.keys(TOOLS).sort(),
    );
    for (const name of TRANSLATED_OWN_TOOLS) {
      const ids = ownToolLineIds(name);
      expect(ownToolLabel(name, true)).toBe(cardText(ids.running));
      expect(ownToolLabel(name, false)).toBe(cardText(ids.done));
      expect(cardText(ids.running, {}, "it")).toBe(TOOLS[name].italian.running);
      expect(cardText(ids.done, {}, "it")).toBe(TOOLS[name].italian.done);
    }
  });

  test("only those two tools are translated: every other word of the vocabulary stays English in Italian", () => {
    const others = [
      "add_tasks",
      "make_page",
      "start_task",
      "recall_personal_memory",
      "remember_personal_fact",
      "show_app_access",
    ];
    for (const name of others) {
      expect(ownToolLineIn(name, true, "it")).toBeNull();
      expect(ownToolLabel(name, true, "it")).toBe(ownToolLabel(name, true));
      expect(ownToolLabel(name, false, "it")).toBe(ownToolLabel(name, false));
      expect(stepPhrase(name, "it")).toBe(stepPhrase(name));
    }
    for (const name of [
      "mcp__google-workspace__gmail_search_messages",
      "mcp__google-workspace__calendar_list_events",
      "mcp__google-workspace__gmail_send_reply",
      "mcp__exa__web_search_exa",
      "computer_navigate",
      "mcp__acme__frobnicate_widgets",
    ]) {
      expect(stepPhrase(name, "it")).toBe(stepPhrase(name));
      expect(readToolName(name, true, "it")).toEqual(readToolName(name, true));
      expect(readToolName(name, false, "it")).toEqual(
        readToolName(name, false),
      );
    }
    expect(ownToolLineIn("toString", true, "it")).toBeNull();
    expect(ownToolLineIn("__proto__", false, "it")).toBeNull();
  });
});

const asked = (id: string, content: string): Message => ({
  id,
  role: "user",
  content,
});

/** The Bot calling one of the two tools and not answered yet: the moment the line and the pill show. */
function running(name: string): Message[] {
  return [
    asked("u1", "What needs me this morning?"),
    {
      id: "a1",
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "call-1", type: "function", function: { name, arguments: "{}" } },
      ],
    },
  ];
}

describe("the pill and the tool's own line, drawn together", () => {
  /** Chat under the header, as the app draws it, inside the card language and with both tools' renderers. */
  function chatWith(language: CardLanguage | null, messages: Message[]) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(authKeys.currentUser(), {
      id: "u",
      email: "",
      name: "Maya",
      role: "user",
      onboarding: null,
    });
    globalThis.fetch = (async () =>
      Response.json({})) as unknown as typeof fetch;
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <ChatPresenceProvider>
            <ShellHeader floating menuOpen={false} onMenu={() => {}} />
            <MorningBriefTool />
            <OfferTaskTool />
            <ConversationView
              busy
              inShell
              messages={messages}
              onSubmit={() => {}}
              pending
            />
          </ChatPresenceProvider>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    const view = render(
      <QueryClientProvider client={client}>
        <CardLanguageProvider language={language}>
          <CopilotKitProvider>
            <RouterProvider router={router as never} />
          </CopilotKitProvider>
        </CardLanguageProvider>
      </QueryClientProvider>,
    );
    const pill = () =>
      view.container.querySelector("[aria-live='polite'] [data-shown]");
    return { view, pill };
  }

  test("in Italian both say the same Italian words while the tool runs", async () => {
    for (const [name, words] of Object.entries(TOOLS)) {
      const { view, pill } = chatWith("it", running(name));
      await waitFor(() =>
        expect(view.getAllByText(words.italian.running).length).toBe(2),
      );
      // One of the two is the pill under the orb, the other is the line in the conversation.
      expect(pill()?.textContent).toBe(words.italian.running);
      const line = view
        .getAllByText(words.italian.running)
        .find((element) => element !== pill());
      expect(line).toBeTruthy();
      expect(view.queryByText(words.english.running)).toBeNull();
      cleanup();
    }
  });

  test("with no language both say today's English, and never disagree", async () => {
    for (const [name, words] of Object.entries(TOOLS)) {
      const { view, pill } = chatWith(null, running(name));
      await waitFor(() =>
        expect(view.getAllByText(words.english.running).length).toBe(2),
      );
      expect(pill()?.textContent).toBe(words.english.running);
      expect(view.queryByText(words.italian.running)).toBeNull();
      cleanup();
    }
  });

  test("`stepFor` takes the language the conversation reads, and with none is what it was", () => {
    const messages = running("morning_brief");
    expect(stepFor(messages, true)).toBe("Reading your mail and calendar");
    expect(stepFor(messages, true, [], null)).toBe(
      "Reading your mail and calendar",
    );
    expect(stepFor(messages, true, [], "it")).toBe("Leggo posta e calendario");
    // The pill's own words that are not these tools' stay English.
    expect(stepFor([asked("u1", "Hi")], true, [], "it")).toBe(THINKING);
    expect(stepFor(messages, false, [], "it")).toBeNull();
  });

  test("a line the transcript draws without a renderer says the same words as the pill", () => {
    for (const [name, words] of Object.entries(TOOLS)) {
      const italian = render(
        <CardLanguageProvider language="it">
          <ServerToolLine name={name} />
        </CardLanguageProvider>,
      );
      expect(italian.getByText(words.italian.running)).toBeTruthy();
      expect(stepPhrase(name, "it")).toBe(words.italian.running);
      cleanup();
      const finished = render(
        <CardLanguageProvider language="it">
          <ServerToolLine name={name} result='"ok"' />
        </CardLanguageProvider>,
      );
      expect(finished.getByText(words.italian.done)).toBeTruthy();
      cleanup();
      const english = render(<ServerToolLine name={name} />);
      expect(english.getByText(words.english.running)).toBeTruthy();
      cleanup();
    }
  });
});

/*
 * ---------------------------------------------------------------------------------------------
 * 2. The check-in notification
 * ---------------------------------------------------------------------------------------------
 */

describe("the check-in browser notification", () => {
  const offer = (id: string, title: string) => ({ id, title, why: "" });
  const checkIn = (count: number): CheckIn => ({
    checkedAt: new Date().toISOString(),
    offers: Array.from({ length: count }, (_, index) =>
      offer(`s${index}`, index === 0 ? "Reply to Rosa" : `Task ${index}`),
    ),
  });

  test("with no language, `en` or one with no table it is today's text, singular and plural alike", () => {
    for (const language of ENGLISH_LANGUAGES) {
      expect(checkInNotice("OpenDuet", checkIn(1), language)).toEqual({
        title: "OpenDuet",
        body: "Reply to Rosa",
      });
      expect(checkInNotice("OpenDuet", checkIn(2), language)?.body).toBe(
        "Reply to Rosa, and 1 more",
      );
      expect(checkInNotice("OpenDuet", checkIn(4), language)?.body).toBe(
        "Reply to Rosa, and 3 more",
      );
    }
    expect(checkInNotice("OpenDuet", checkIn(2))?.body).toBe(
      "Reply to Rosa, and 1 more",
    );
    expect(
      checkInNotice("OpenDuet", { checkedAt: null, offers: [] }, "it"),
    ).toBeNull();
  });

  test("in Italian one more is 'un'altra' and several are 'altre N'; the task's own title is left alone", () => {
    expect(checkInNotice("OpenDuet", checkIn(1), "it")).toEqual({
      title: "OpenDuet",
      body: "Reply to Rosa",
    });
    expect(checkInNotice("OpenDuet", checkIn(2), "it")?.body).toBe(
      "Reply to Rosa e un'altra",
    );
    expect(checkInNotice("OpenDuet", checkIn(3), "it")?.body).toBe(
      "Reply to Rosa e altre 2",
    );
    expect(checkInNotice("OpenDuet", checkIn(12), "it")?.body).toBe(
      "Reply to Rosa e altre 11",
    );
  });

  test("a title that looks like a placeholder is never expanded", () => {
    const tricky: CheckIn = {
      checkedAt: new Date().toISOString(),
      offers: [offer("a", "Pay {count} $& {title}"), offer("b", "Other")],
    };
    expect(checkInNotice("Bot", tricky, null)?.body).toBe(
      "Pay {count} $& {title}, and 1 more",
    );
    expect(checkInNotice("Bot", tricky, "it")?.body).toBe(
      "Pay {count} $& {title} e un'altra",
    );
  });

  /** The hook, as Chat mounts it, inside whatever language is given; returns what the page notified. */
  function mount(language: CardLanguage | null) {
    const shown: { title: string; body?: string }[] = [];
    class FakeNotification {
      static permission = "granted";
      constructor(title: string, init?: { body?: string }) {
        shown.push({ title, ...(init?.body ? { body: init.body } : {}) });
      }
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    let arrived: (checkIn: CheckIn) => void = () => {};
    function Notifying() {
      arrived = useCheckInNotifications({ name: "OpenDuet", muted: false });
      return null;
    }
    const tree = (value: CardLanguage | null) => (
      <CardLanguageProvider language={value}>
        <Notifying />
      </CardLanguageProvider>
    );
    const view = render(tree(language));
    return {
      shown,
      arrive: (value: CheckIn) => arrived(value),
      switchTo: (value: CardLanguage | null) => view.rerender(tree(value)),
    };
  }

  test("the hook reads the card language from where it runs, and each notification is in the language of the moment", () => {
    const italian = mount("it");
    italian.arrive(checkIn(2));
    expect(italian.shown).toEqual([
      { title: "OpenDuet", body: "Reply to Rosa e un'altra" },
    ]);
    cleanup();

    const english = mount(null);
    english.arrive(checkIn(3));
    expect(english.shown).toEqual([
      { title: "OpenDuet", body: "Reply to Rosa, and 2 more" },
    ]);
    // The language arrives after the page opened (the server answered): the next one follows it.
    english.switchTo("it");
    english.arrive({
      checkedAt: new Date().toISOString(),
      offers: [offer("x", "Call Ana"), offer("y", "Book"), offer("z", "Pay")],
    });
    expect(english.shown.at(-1)).toEqual({
      title: "OpenDuet",
      body: "Call Ana e altre 2",
    });
  });

  test("with no provider above it the hook is English, as it was", () => {
    const shown: string[] = [];
    class FakeNotification {
      static permission = "granted";
      constructor(_title: string, init?: { body?: string }) {
        shown.push(init?.body ?? "");
      }
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    let arrived: (value: CheckIn) => void = () => {};
    function Bare() {
      arrived = useCheckInNotifications({ name: "OpenDuet", muted: false });
      return null;
    }
    render(<Bare />);
    arrived(checkIn(2));
    expect(shown).toEqual(["Reply to Rosa, and 1 more"]);
  });
});

/*
 * ---------------------------------------------------------------------------------------------
 * 3. The onboarding demo
 * ---------------------------------------------------------------------------------------------
 */

/** Every string a root draws that the app wrote: text nodes, and the names a screen reader reads. */
function drawn(root: HTMLElement): string[] {
  const found: string[] = [];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const node of Array.from(element.childNodes)) {
      const text = node.nodeType === 3 ? node.textContent?.trim() : "";
      if (text) found.push(text);
    }
    const label = element.getAttribute("aria-label");
    if (label) found.push(label);
  }
  return found;
}

const DEMO_ENGLISH = [
  "Your day, at a glance.",
  "Confirm the delivery",
  "Ana needs a yes for Friday.",
  "Studio visit at 2",
  "The samples are ready.",
  "Needs you",
  "Today",
];

const DEMO_ITALIAN = [
  "La tua giornata, in breve.",
  "Conferma la consegna",
  "Ana aspetta un sì per venerdì.",
  "Visita in studio alle 14",
  "I campioni sono pronti.",
  "Hanno bisogno di te",
  "Oggi",
];

describe("the onboarding demo", () => {
  const demo = (
    kind: "brief" | "search" | "approval" | "task",
    lang: CardLanguage | null,
  ) =>
    render(
      <CardLanguageProvider language={lang}>
        <CapabilityDemo kind={kind} />
      </CardLanguageProvider>,
    );
  const finish = () =>
    act(() => {
      jest.advanceTimersByTime(DEMO_BEAT_MS * 2);
    });

  test("with no language, `en` or one with no table the brief demo is today's, row for row", () => {
    jest.useFakeTimers();
    for (const language of ENGLISH_LANGUAGES) {
      const view = demo("brief", language);
      const strings = drawn(view.container);
      for (const text of DEMO_ENGLISH) expect(strings).toContain(text);
      expect(strings).toContain(demoDate(new Date()));
      expect(strings).toContain("Searching your email");
      expect(strings).toContain(
        "Example: a morning brief arrives with a delivery to confirm and a studio visit today",
      );
      finish();
      expect(drawn(view.container)).toContain("Here's what needs you today");
      for (const text of DEMO_ITALIAN)
        expect(drawn(view.container)).not.toContain(text);
      cleanup();
    }
    // With no provider at all: the demo drawn on its own, in a test or a story.
    const bare = render(<CapabilityDemo kind="brief" />);
    expect(drawn(bare.container)).toContain("Confirm the delivery");
  });

  test("with no language the date is the browser's own, as it always was", () => {
    const now = new Date(2026, 9, 22, 12);
    expect(demoDate(now)).toBe(
      now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    );
    expect(demoDate(now, null)).toBe(demoDate(now));
  });

  test("in Italian the headings, the rows, the date, the caption and the label are all Italian", () => {
    jest.useFakeTimers();
    const view = demo("brief", "it");
    let strings = drawn(view.container);
    for (const text of DEMO_ITALIAN) expect(strings).toContain(text);
    expect(strings).toContain(demoDate(new Date(), "it"));
    expect(strings).toContain("Cerco tra le tue email");
    expect(strings).toContain(
      "Esempio: arriva un riepilogo del mattino con una consegna da confermare e una visita in studio oggi",
    );
    finish();
    strings = drawn(view.container);
    expect(strings).toContain("Ecco cosa ti aspetta oggi");
    // None of the demo's English is left, row or heading or caption.
    for (const text of [
      ...DEMO_ENGLISH,
      "Searching your email",
      "Here's what needs you today",
      "Example: a morning brief arrives with a delivery to confirm and a studio visit today",
    ])
      expect(strings).not.toContain(text);
    expect(strings).not.toContain(demoDate(new Date()));
  });

  test("the search demo draws the same brief, with its own Italian label", () => {
    const view = demo("search", "it");
    const strings = drawn(view.container);
    expect(strings).toContain(
      "Esempio: il Bot cerca tra le tue email, poi ti porta un riepilogo del mattino",
    );
    for (const text of DEMO_ITALIAN) expect(strings).toContain(text);
    expect(strings).not.toContain(
      "Example: the Bot searches your email, then brings you a morning brief",
    );
  });

  test("the date is the language's own: 'giovedì 22 ottobre'", () => {
    const now = new Date(2026, 9, 22, 12);
    expect(demoDate(now, "it")).toBe("giovedì 22 ottobre");
    expect(demoDate(now, "it")).toBe(cardDate(now, "it"));
  });

  test("the approval and task demos draw cards the table does not translate, and stay English whole", () => {
    for (const kind of ["approval", "task"] as const) {
      const english = drawn(demo(kind, null).container);
      cleanup();
      const italian = drawn(demo(kind, "it").container);
      expect(italian).toEqual(english);
      cleanup();
    }
    expect(drawn(demo("approval", "it").container)).toContain(
      "Example: the Bot asks before sending an email, with Refuse and Allow once",
    );
  });
});

/*
 * ---------------------------------------------------------------------------------------------
 * 4. The first paint
 * ---------------------------------------------------------------------------------------------
 */

function Probe() {
  const t = useCardText();
  return <p>{t("brief.today")}</p>;
}

/**
 * `/api/capabilities` held until the test lets it answer, so the page can be looked at in the moment
 * the request is out. `answer` takes the body the server sends, or "down" for a server that fails.
 */
function holdCapabilities() {
  let answer: (body: Record<string, unknown> | "down") => void = () => {};
  let asked = 0;
  const held = new Promise<Response>((resolve) => {
    answer = (body) =>
      resolve(
        body === "down"
          ? new Response("down", { status: 500 })
          : Response.json({ generativeUi: true, ...body }),
      );
  });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/capabilities")) {
      asked += 1;
      return held;
    }
    return Response.json({});
  }) as unknown as typeof fetch;
  return { answer, asked: () => asked };
}

function provider(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <PersonLanguageProvider>
        <Probe />
      </PersonLanguageProvider>
    </QueryClientProvider>,
  );
}

const kept = () => window.localStorage.getItem(STORED_LANGUAGE_KEY);

describe("the first paint, before the server has answered", () => {
  test("with nothing kept the first paint is English, then the answer redraws it and is kept", async () => {
    const server = holdCapabilities();
    const view = provider();
    expect(view.getByText("Today")).toBeTruthy();
    expect(kept()).toBeNull();
    server.answer({ personLanguage: "it" });
    await waitFor(() => expect(view.getByText("Oggi")).toBeTruthy());
    await waitFor(() => expect(kept()).toBe("it"));
    expect(server.asked()).toBe(1);
  });

  test("a code kept from last time draws the first paint at once, and the answer keeps it", async () => {
    window.localStorage.setItem(STORED_LANGUAGE_KEY, "it");
    const server = holdCapabilities();
    const view = provider();
    // Nothing has come back yet, and the card is already Italian.
    expect(view.getByText("Oggi")).toBeTruthy();
    expect(view.queryByText("Today")).toBeNull();
    server.answer({ personLanguage: "it" });
    await settleReactWork();
    expect(view.getByText("Oggi")).toBeTruthy();
    expect(kept()).toBe("it");
    expect(server.asked()).toBe(1);
  });

  test("a second visit after an answer draws Italian from the first frame", async () => {
    const first = holdCapabilities();
    const view = provider();
    first.answer({ personLanguage: "it" });
    await waitFor(() => expect(kept()).toBe("it"));
    cleanup();
    view.unmount();
    // A reload: a new page, a new query client, the request out again.
    holdCapabilities();
    const reloaded = provider();
    expect(reloaded.getByText("Oggi")).toBeTruthy();
  });

  test("a kept value that is not two lowercase letters is ignored", async () => {
    for (const bad of ["IT", "ita", "it-IT", "<b>", "", " it", "i1", "it\n"]) {
      window.localStorage.setItem(STORED_LANGUAGE_KEY, bad);
      expect(readStoredLanguage()).toBeNull();
      const server = holdCapabilities();
      const view = provider();
      expect(view.getByText("Today")).toBeTruthy();
      server.answer({});
      await waitFor(() => expect(kept()).toBeNull());
      cleanup();
    }
  });

  test("a kept code that has no table draws English, as the server's own `de` does", () => {
    window.localStorage.setItem(STORED_LANGUAGE_KEY, "de");
    holdCapabilities();
    expect(provider().getByText("Today")).toBeTruthy();
  });

  test("the server's answer always wins, and replaces or clears what was kept", async () => {
    const cases: [
      string | null,
      Record<string, unknown>,
      string,
      string | null,
    ][] = [
      // kept, what the server sends, what is drawn after, what is kept after
      ["it", {}, "Today", null],
      ["it", { personLanguage: "en" }, "Today", "en"],
      ["it", { personLanguage: "de" }, "Today", "de"],
      ["de", { personLanguage: "it" }, "Oggi", "it"],
      [null, { personLanguage: "it" }, "Oggi", "it"],
      ["it", { personLanguage: "it" }, "Oggi", "it"],
    ];
    for (const [before, body, shown, after] of cases) {
      if (before) window.localStorage.setItem(STORED_LANGUAGE_KEY, before);
      const server = holdCapabilities();
      const view = provider();
      server.answer(body);
      await waitFor(() => expect(view.getByText(shown)).toBeTruthy());
      await waitFor(() => expect(kept()).toBe(after));
      cleanup();
      window.localStorage.clear();
    }
  });

  test("a server that is too old to send the field, or sends junk, clears what was kept", async () => {
    for (const body of [
      {},
      { personLanguage: "Italian" },
      { personLanguage: 7 },
    ]) {
      window.localStorage.setItem(STORED_LANGUAGE_KEY, "it");
      const server = holdCapabilities();
      const view = provider();
      server.answer(body);
      await waitFor(() => expect(view.getByText("Today")).toBeTruthy());
      await waitFor(() => expect(kept()).toBeNull());
      cleanup();
    }
  });

  test("a request that fails is not an answer: what was kept stays, and with nothing kept it is English", async () => {
    window.localStorage.setItem(STORED_LANGUAGE_KEY, "it");
    const down = holdCapabilities();
    const view = provider();
    down.answer("down");
    await settleReactWork();
    expect(view.getByText("Oggi")).toBeTruthy();
    expect(kept()).toBe("it");
    cleanup();

    window.localStorage.clear();
    const alsoDown = holdCapabilities();
    const bare = provider();
    alsoDown.answer("down");
    await settleReactWork();
    expect(bare.getByText("Today")).toBeTruthy();
    expect(kept()).toBeNull();
  });

  test("storage that throws does not break the page", async () => {
    const refusals: Record<string, () => Storage> = {
      // A blocked browser: touching `localStorage` at all throws a SecurityError.
      "localStorage itself throws": () => {
        throw new DOMException("denied", "SecurityError");
      },
      // A full or read-only one: reading works and finds nothing, writing throws.
      "every call throws": () =>
        ({
          getItem: () => {
            throw new DOMException("denied", "SecurityError");
          },
          setItem: () => {
            throw new DOMException("full", "QuotaExceededError");
          },
          removeItem: () => {
            throw new DOMException("denied", "SecurityError");
          },
        }) as unknown as Storage,
      "only writing throws": () =>
        ({
          getItem: () => "it",
          setItem: () => {
            throw new DOMException("full", "QuotaExceededError");
          },
          removeItem: () => {
            throw new DOMException("full", "QuotaExceededError");
          },
        }) as unknown as Storage,
    };
    for (const [name, make] of Object.entries(refusals)) {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: make,
      });
      const server = holdCapabilities();
      const view = provider();
      // The first paint either has the kept code (writing-only failure) or is English.
      expect(
        view.queryByText(name === "only writing throws" ? "Oggi" : "Today"),
      ).toBeTruthy();
      server.answer({ personLanguage: "it" });
      await waitFor(() => expect(view.getByText("Oggi")).toBeTruthy());
      cleanup();
      if (originalStorage)
        Object.defineProperty(window, "localStorage", originalStorage);
    }
  });
});

describe("the kept code itself", () => {
  test("is one two-letter code under one key, validated on the way out and on the way in", () => {
    expect(readStoredLanguage()).toBeNull();
    storeLanguage("it");
    expect(kept()).toBe("it");
    expect(readStoredLanguage()).toBe("it");
    storeLanguage("de");
    expect(readStoredLanguage()).toBe("de");
    // Anything that is not two lowercase letters is not kept; it forgets what was.
    for (const bad of ["IT", "ita", "", "it-IT", "<script>"]) {
      storeLanguage("it");
      storeLanguage(bad);
      expect(kept()).toBeNull();
    }
    storeLanguage("it");
    storeLanguage(null);
    expect(kept()).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  test("keeps nothing but the code", () => {
    storeLanguage("it");
    expect(window.localStorage.length).toBe(1);
    expect(kept()).toBe("it");
  });

  test("a throwing store reads as nothing kept and swallows the write", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(readStoredLanguage()).toBeNull();
    expect(() => storeLanguage("it")).not.toThrow();
    expect(() => storeLanguage(null)).not.toThrow();
  });

  test("every id the demo, the notification and the two tools added has an Italian form of its own", () => {
    const added: CardTextId[] = [
      "checkIn.notification.more",
      "tool.morningBrief.running",
      "tool.morningBrief.done",
      "tool.offerTask.running",
      "tool.offerTask.done",
      "demo.greeting",
      "demo.delivery.title",
      "demo.delivery.why",
      "demo.visit.title",
      "demo.visit.why",
      "demo.caption.searching",
      "demo.caption.done",
      "demo.label.brief",
      "demo.label.search",
    ];
    for (const id of added)
      expect(JSON.stringify(CARD_TABLES.it[id])).not.toBe(
        JSON.stringify(CARD_TABLES.en[id]),
      );
  });
});
