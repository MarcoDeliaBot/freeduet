import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { frameCheckIn } from "@openbot/shared/check-in";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { checkInTime } from "@/components/channels/chat-transcript";
import { ConversationSendContext } from "@/components/channels/conversation-send";
import { ConversationView } from "@/components/channels/conversation-view";
import { MorningBriefCard } from "@/components/duet/morning-brief-card";
import {
  ChatSuggestionCard,
  ChatSuggestionProvider,
} from "@/components/shell/chat-suggestion";
import {
  CARD_TABLES,
  type CardLanguage,
  type CardTextId,
  cardDate,
  cardLanguageOf,
  cardText,
  cardTime,
  type SameShape,
} from "@/freeduet/person-language/cards";
import {
  CardLanguageProvider,
  PersonLanguageProvider,
  useCardText,
} from "@/freeduet/person-language/use-card-text";
import {
  briefCard,
  readBrief,
  StartableBrief,
  startRequest,
} from "@/lib/copilot/morning-brief-tool";
import {
  type OfferedTask,
  OfferedTaskCard,
  OfferTaskTool,
} from "@/lib/copilot/offer-task-tool";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * D26 amendment: the morning brief card, the suggestion card and the line above a check-in in the
 * language the deployment names (`FREEDUET_PERSON_LANGUAGE`, read by the app from /api/capabilities).
 *
 * Three things are pinned. With no language, or one with no table, every card renders exactly as it
 * did (the existing card tests run untouched beside this file, and the English is also spelled out
 * here). With `it`, every word the app writes on those cards is Italian: the Italian strings are
 * there and no English string from the table is. And the Italian is right where it has rules: plurals
 * by `Intl.PluralRules`, dates and times in the language's own form.
 */

const originalFetch = globalThis.fetch;
beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

/** Every string a root draws that the app wrote: its text nodes, one by one, and its aria-labels. */
function visibleStrings(root: HTMLElement): string[] {
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

/** The English strings of the table that have no placeholder: each is drawn whole, or not at all. */
const PLAIN_ENGLISH = Object.values(CARD_TABLES.en).filter(
  (value): value is string => typeof value === "string" && !value.includes("{"),
);

/**
 * Nothing of the English table is drawn: not a plain string, and not the English form of a template
 * the scenario drew (`rendered`, each written in English with the same values).
 */
function expectNoEnglish(root: HTMLElement, rendered: readonly string[] = []) {
  const drawn = visibleStrings(root);
  for (const english of [...PLAIN_ENGLISH, ...rendered])
    expect(drawn).not.toContain(english);
}

const BRIEF = {
  at: "2026-10-22T08:05:00",
  name: "Maya",
  needsYou: [
    {
      id: "m1",
      threadId: "t1",
      from: "Ana Pereira",
      subject: "Friday ship date?",
      reason: "Ana needs the Friday date confirmed today.",
      decidedBy: "model:test",
    },
  ],
  canWait: ["Ceramics Monthly", "Adobe", "Stripe", "LinkedIn"].map(
    (from, index) => ({
      id: `w${index}`,
      threadId: `tw${index}`,
      from,
      subject: "News",
      reason: "FYI.",
      decidedBy: "rule:bulk",
    }),
  ),
  calendar: [
    {
      id: "e1",
      summary: "Studio visit with Hearth & Co",
      start: "2026-10-22T15:00:00",
      end: "2026-10-22T16:00:00",
    },
    { id: "e2", summary: "Kiln delivery", start: "2026-10-22" },
  ],
  couldNotCheck: [
    { source: "Gmail", why: "Gmail and Google Calendar is not connected." },
  ],
};

function briefOf(overrides: Record<string, unknown> = {}) {
  const parsed = readBrief(JSON.stringify({ ...BRIEF, ...overrides }));
  if (!parsed) throw new Error("not a brief");
  return parsed;
}

const sendNothing = {
  send: mock((_text: string) => true),
  isLatestTurn: () => true,
};

function brief(language: CardLanguage | null, value = briefOf()) {
  return render(
    <CardLanguageProvider language={language}>
      <ConversationSendContext.Provider value={sendNothing}>
        <StartableBrief brief={value} />
      </ConversationSendContext.Provider>
    </CardLanguageProvider>,
  );
}

describe("the table", () => {
  test("every id has an Italian form, with the same placeholders, and none is left as the English", () => {
    const ids = Object.keys(CARD_TABLES.en) as CardTextId[];
    expect(Object.keys(CARD_TABLES.it).sort()).toEqual([...ids].sort());
    const placeholders = (forms: string[]) =>
      [
        ...new Set(
          forms.flatMap((form) =>
            [...form.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
          ),
        ),
      ].sort();
    const formsOf = (value: string | { one: string; other: string }) =>
      typeof value === "string" ? [value] : [value.one, value.other];
    for (const id of ids) {
      const en = CARD_TABLES.en[id];
      const it = CARD_TABLES.it[id];
      // A plural stays a plural and a string a string, so no form is lost to the other shape.
      expect(typeof it).toBe(typeof en);
      const english = formsOf(en);
      const italian = formsOf(it);
      expect(italian).not.toEqual(english);
      // A card that fills `{bot}` or `{count}` must find the same names in both languages.
      expect(placeholders(italian)).toEqual(placeholders(english));
    }
  });

  test("an English-only key, a missing key and a plural written as a string are type errors", () => {
    // The checks are the comments: `tsc` over this file fails when any of them stops being an error.
    // @ts-expect-error `b` is missing
    const missing: SameShape<{ a: string; b: string }> = { a: "x" };
    // @ts-expect-error `c` is not in English
    const extra: SameShape<{ a: string }> = { a: "x", c: "y" };
    // @ts-expect-error English has a plural here, so a plain string is not enough
    const flat: SameShape<{ a: { one: string; other: string } }> = { a: "x" };
    expect([missing, extra, flat]).toHaveLength(3);
  });
});

describe("which language the cards draw in", () => {
  test("a table language is used; English, an unknown code and anything unreadable are today", () => {
    expect(cardLanguageOf("it")).toBe("it");
    expect(cardLanguageOf(" IT ")).toBe("it");
    for (const code of [
      "en",
      "de",
      "it-IT",
      "italian",
      "",
      undefined,
      null,
      42,
    ])
      expect(cardLanguageOf(code)).toBeNull();
  });

  test("a placeholder's value is never read as a placeholder", () => {
    expect(
      cardText("suggestion.from", { source: "{source} {count}" }, "it"),
    ).toBe("Da {source} {count}");
  });
});

describe("plurals, dates and times", () => {
  test("emails that can wait: 0, 1 and 2, in English and in Italian", () => {
    const cases = [
      [0, "0 emails can wait", "0 email possono aspettare"],
      [1, "1 email can wait", "1 email può aspettare"],
      [2, "2 emails can wait", "2 email possono aspettare"],
      [21, "21 emails can wait", "21 email possono aspettare"],
    ] as const;
    for (const [count, english, italian] of cases) {
      expect(cardText("brief.canWait", { count })).toBe(english);
      expect(cardText("brief.canWait", { count }, "it")).toBe(italian);
    }
  });

  test("a plural the language writes with another category falls back to other", () => {
    // Italian's rules call one million "many"; the table spells out one and other only.
    expect(cardText("brief.canWait", { count: 1_000_000 }, "it")).toBe(
      "1000000 email possono aspettare",
    );
  });

  test("the sender list: one more sender is 'un altro', two or more are 'altri N'", () => {
    const names = "Ceramics Monthly, Adobe, Stripe";
    expect(cardText("brief.andMore", { names, count: 1 })).toBe(
      `${names} and 1 more`,
    );
    expect(cardText("brief.andMore", { names, count: 1 }, "it")).toBe(
      `${names} e un altro`,
    );
    expect(cardText("brief.andMore", { names, count: 3 }, "it")).toBe(
      `${names} e altri 3`,
    );
  });

  test("the row for what can wait, from a brief with 0, 1 and 2 emails and with senders over three", () => {
    const mails = (count: number) => BRIEF.canWait.slice(0, count);
    expect(briefCard(briefOf({ canWait: mails(0) }), "it").canWait).toEqual([]);
    expect(briefCard(briefOf({ canWait: mails(1) }), "it").canWait).toEqual([
      expect.objectContaining({
        title: "1 email può aspettare",
        why: "Ceramics Monthly",
      }),
    ]);
    expect(briefCard(briefOf({ canWait: mails(2) }), "it").canWait).toEqual([
      expect.objectContaining({
        title: "2 email possono aspettare",
        why: "Ceramics Monthly, Adobe",
      }),
    ]);
    expect(briefCard(briefOf(), "it").canWait).toEqual([
      expect.objectContaining({
        title: "4 email possono aspettare",
        why: "Ceramics Monthly, Adobe, Stripe e un altro",
      }),
    ]);
  });

  test("a date and a time in Italian; the browser's own when there is no language", () => {
    const at = new Date("2026-10-22T15:00:00");
    expect(cardDate(at, "it")).toBe("giovedì 22 ottobre");
    expect(cardTime(at, "it")).toBe("15:00");
    expect(cardDate(at, null)).toBe(
      at.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    );
    expect(cardTime(at, null)).toBe(
      at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
    expect(checkInTime("2026-10-22T17:32:00.000Z", "it")).toMatch(
      /^\d{2}:\d{2}$/,
    );
    expect(checkInTime("not a time", "it")).toBeNull();
    expect(checkInTime(null, "it")).toBeNull();
  });

  test("'All day' and the three greetings, with and without a name", () => {
    const all = briefCard(briefOf(), "it").today;
    expect(all.map((row) => row.why)).toEqual(["15:00", "Tutto il giorno"]);
    expect(briefCard(briefOf(), null).today[1]?.why).toBe("All day");
    const greet = (at: string, name: string | null) =>
      briefCard(briefOf({ at, name }), "it").greeting;
    expect(greet("2026-10-22T08:05:00", "Maya")).toBe("Buongiorno, Maya.");
    expect(greet("2026-10-22T13:00:00", null)).toBe("Buon pomeriggio.");
    expect(greet("2026-10-22T19:30:00", "Maya")).toBe("Buonasera, Maya.");
  });

  test("what Start sends is the person's own words, in their language", () => {
    const first = briefOf().needsYou[0];
    if (!first) throw new Error("no row");
    expect(startRequest(first, "it")).toBe(
      "Occupati dell'email di Ana Pereira: Friday ship date?",
    );
    expect(startRequest({ ...first, subject: "" }, "it")).toBe(
      "Occupati dell'email di Ana Pereira.",
    );
    expect(startRequest(first)).toBe(
      "Take care of Ana Pereira's email: Friday ship date?",
    );
  });
});

describe("the morning brief card", () => {
  test("with no language, or one with no table, it is the English card, byte for byte", () => {
    const bare = render(
      <ConversationSendContext.Provider value={sendNothing}>
        <StartableBrief brief={briefOf()} />
      </ConversationSendContext.Provider>,
    ).container.innerHTML;
    cleanup();
    for (const code of [null, cardLanguageOf("en"), cardLanguageOf("de")])
      expect(brief(code).container.innerHTML).toBe(bare);
    cleanup();
    const drawn = visibleStrings(brief(null).container);
    for (const english of [
      "Morning brief",
      "Morning, Maya.",
      "Needs you",
      "Can wait",
      "4 emails can wait",
      "Ceramics Monthly, Adobe, Stripe and 1 more",
      "Today",
      "All day",
      "Couldn't check",
      "Start",
      "Start: Ana Pereira · Friday ship date?",
    ])
      expect(drawn).toContain(english);
  });

  test("in Italian every word the app wrote is Italian, and none of the English is left", () => {
    const view = brief("it");
    const drawn = visibleStrings(view.container);
    for (const italian of [
      "Riepilogo del mattino",
      "Buongiorno, Maya.",
      "giovedì 22 ottobre",
      "Hanno bisogno di te",
      "Possono aspettare",
      "4 email possono aspettare",
      "Ceramics Monthly, Adobe, Stripe e un altro",
      "Oggi",
      "15:00",
      "Tutto il giorno",
      "Non ho potuto controllare",
      "Avvia",
      "Avvia: Ana Pereira · Friday ship date?",
    ])
      expect(drawn).toContain(italian);
    // The mail's own words are not the app's: they are drawn as they came.
    expect(drawn).toContain("Ana Pereira · Friday ship date?");
    expect(drawn).toContain("Gmail and Google Calendar is not connected.");
    expectNoEnglish(view.container, [
      "Morning, Maya.",
      "4 emails can wait",
      "Ceramics Monthly, Adobe, Stripe and 1 more",
      "Start: Ana Pereira · Friday ship date?",
      "3:00 PM",
      "Thursday, October 22",
    ]);
  });

  test("the empty brief, and a gap, say so in Italian", () => {
    const quiet = brief(
      "it",
      briefOf({ needsYou: [], canWait: [], calendar: [], couldNotCheck: [] }),
    );
    expect(visibleStrings(quiet.container)).toContain(
      "Niente di nuovo ha bisogno di te e oggi non hai nulla in calendario.",
    );
    expectNoEnglish(quiet.container);
  });

  test("Start sends the Italian request and then reads Avviato", () => {
    const send = mock((_text: string) => true);
    const view = render(
      <CardLanguageProvider language="it">
        <ConversationSendContext.Provider
          value={{ send, isLatestTurn: () => true }}
        >
          <StartableBrief brief={briefOf()} />
        </ConversationSendContext.Provider>
      </CardLanguageProvider>,
    );
    fireEvent.click(
      view.getByRole("button", {
        name: "Avvia: Ana Pereira · Friday ship date?",
      }),
    );
    expect(send).toHaveBeenCalledWith(
      "Occupati dell'email di Ana Pereira: Friday ship date?",
    );
    const done = view.getByRole("button", { name: "Avviato" });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    expectNoEnglish(view.container);
  });

  test("a long brief folds with 'Mostra altre N', and the button's name says where", () => {
    const mail = Array.from({ length: 27 }, (_, index) => ({
      id: `m${index}`,
      threadId: `t${index}`,
      from: `Sender ${index}`,
      subject: `Subject ${index}`,
      reason: `Reason ${index}`,
      decidedBy: "model:triage",
    }));
    const view = render(
      <CardLanguageProvider language="it">
        <MorningBriefCard {...briefCard(briefOf({ needsYou: mail }), "it")} />
      </CardLanguageProvider>,
    );
    expect(view.getByText("Mostra altre 22")).toBeTruthy();
    fireEvent.click(
      view.getByRole("button", {
        name: "Mostra altre 22 in «Hanno bisogno di te»",
      }),
    );
    expect(view.getByText("Sender 26 · Subject 26")).toBeTruthy();
    expectNoEnglish(view.container, [
      "Show 22 more",
      "Show 22 more in Needs you",
    ]);
  });
});

/*
 * The suggestion card, as Chat draws it above the composer and as a check-in offers it in the thread.
 */

const BOT = { id: "openduet", name: "OpenDuet" };
const SUGGESTION = {
  id: "s1",
  agentId: BOT.id,
  title: "Answer Rosa about the glaze substitute",
  detail: "Rosa needs an answer on the Oat Satin substitute by end of day.",
  sourceApp: "Gmail",
  sourceLink: null,
  createdAt: "2026-10-22T08:00:00Z",
};

function serveSuggestion(status: "open" | "started" | "dismissed" = "open") {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api/, "/api");
    if (init?.method === "POST") {
      calls.push(`POST ${path}`);
      return Response.json({ suggestion: { ...SUGGESTION, status } });
    }
    if (path === `/api/proactive/suggestions/${SUGGESTION.id}`)
      return Response.json({ suggestion: { ...SUGGESTION, status } });
    if (path === "/api/proactive/suggestions")
      return Response.json({ suggestions: [SUGGESTION] });
    return Response.json({});
  }) as unknown as typeof fetch;
  return calls;
}

function queries(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function dock(language: CardLanguage | null) {
  return render(
    queries(
      <CardLanguageProvider language={language}>
        <ChatSuggestionProvider bot={BOT}>
          <ChatSuggestionCard />
        </ChatSuggestionProvider>
      </CardLanguageProvider>,
    ),
  );
}

describe("the suggestion card above Chat's composer", () => {
  test("with no language, or one with no table, it is the English card", async () => {
    serveSuggestion();
    for (const code of [null, cardLanguageOf("de")]) {
      const view = dock(code);
      await waitFor(() => view.getByText(SUGGESTION.title));
      expect(visibleStrings(view.container)).toEqual(
        expect.arrayContaining([
          "OpenDuet could take this on",
          "From Gmail",
          "Hide",
          "Start",
        ]),
      );
      const marks = (side: string) =>
        view.container.querySelector(`[data-swipe-mark="${side}"]`)
          ?.textContent;
      expect(marks("start")).toBe("Start");
      expect(marks("hide")).toBe("Hide");
      cleanup();
    }
  });

  test("in Italian: the heading, the source, both buttons and both swipe marks", async () => {
    serveSuggestion();
    const view = dock("it");
    await waitFor(() => view.getByText(SUGGESTION.title));
    const drawn = visibleStrings(view.container);
    for (const italian of [
      "OpenDuet potrebbe occuparsene",
      "Da Gmail",
      "Nascondi",
      "Avvia",
    ])
      expect(drawn).toContain(italian);
    // The member's own title and why are drawn as written.
    expect(drawn).toContain(SUGGESTION.title);
    expect(drawn).toContain(SUGGESTION.detail);
    const mark = (side: string) => {
      const element = view.container.querySelector(
        `[data-swipe-mark="${side}"]`,
      );
      if (!element) throw new Error(`no ${side} mark`);
      return element.textContent;
    };
    expect(mark("start")).toBe("Avvia");
    expect(mark("hide")).toBe("Nascondi");
    expectNoEnglish(view.container, [
      "OpenDuet could take this on",
      "From Gmail",
    ]);
    expect(
      view
        .getAllByRole("region")
        .map((region) => region.getAttribute("aria-label")),
    ).toEqual(["OpenDuet potrebbe occuparsene"]);
  });

  test("Start says so in Italian, with the Bot's name, for a moment", async () => {
    const calls = serveSuggestion();
    const view = dock("it");
    await waitFor(() => view.getByRole("button", { name: "Avvia" }));
    fireEvent.click(view.getByRole("button", { name: "Avvia" }));
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toBe(
        "Avviato. OpenDuet ci sta lavorando.",
      ),
    );
    expect(calls).toEqual(["POST /api/proactive/suggestions/s1/start"]);
    expectNoEnglish(view.container, ["Started. OpenDuet is on it."]);
  });

  test("Hide still dismisses, from the Italian button", async () => {
    const calls = serveSuggestion();
    const view = dock("it");
    await waitFor(() => view.getByRole("button", { name: "Nascondi" }));
    fireEvent.click(view.getByRole("button", { name: "Nascondi" }));
    await waitFor(() =>
      expect(calls).toEqual(["POST /api/proactive/suggestions/s1/dismiss"]),
    );
  });
});

describe("a task a check-in offers", () => {
  const OFFERED: OfferedTask = {
    id: SUGGESTION.id,
    title: SUGGESTION.title,
    detail: SUGGESTION.detail,
    source: "Gmail",
    status: "open",
  };
  const offered = (language: CardLanguage | null, withBot: boolean) => {
    const card = <OfferedTaskCard offered={OFFERED} />;
    return render(
      queries(
        <CardLanguageProvider language={language}>
          {withBot ? (
            <ChatSuggestionProvider bot={BOT}>{card}</ChatSuggestionProvider>
          ) : (
            card
          )}
        </CardLanguageProvider>,
      ),
    );
  };

  test("the heading names the Bot, or says it is ready to start, in either language", async () => {
    serveSuggestion();
    const english = offered(null, true);
    await waitFor(() =>
      english.getByRole("region", { name: "OpenDuet could take this on" }),
    );
    cleanup();
    const italian = offered("it", true);
    await waitFor(() =>
      italian.getByRole("region", { name: "OpenDuet potrebbe occuparsene" }),
    );
    expectNoEnglish(italian.container, ["OpenDuet could take this on"]);
    cleanup();
    const outside = offered("it", false);
    await waitFor(() =>
      outside.getByRole("region", { name: "Pronto da avviare" }),
    );
    cleanup();
    expect(
      offered(null, false).getByRole("region", { name: "Ready to start" }),
    ).toBeTruthy();
  });

  test("once answered, the card says Avviato or Nascosto", async () => {
    serveSuggestion("started");
    const started = offered("it", true);
    await waitFor(() => expect(started.getByRole("status")).toBeTruthy());
    expect(started.getByRole("status").textContent).toBe("Avviato");
    expect(within(started.container).queryByRole("button")).toBeNull();
    expectNoEnglish(started.container, ["OpenDuet could take this on"]);
    cleanup();
    serveSuggestion("dismissed");
    const hidden = offered("it", true);
    await waitFor(() =>
      expect(hidden.getByRole("status").textContent).toBe("Nascosto"),
    );
    expectNoEnglish(hidden.container, ["OpenDuet could take this on"]);
  });
});

/*
 * The line above a check-in, drawn by the real transcript.
 */

const CHECKED_AT = "2026-10-22T17:32:00.000Z";

function checkedIn(): Message[] {
  return [
    {
      id: "check-in",
      role: "user",
      content: frameCheckIn({
        checkedAt: CHECKED_AT,
        offers: [
          {
            id: SUGGESTION.id,
            title: SUGGESTION.title,
            why: SUGGESTION.detail,
          },
        ],
      }),
    },
    {
      id: "a1",
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "offer_task",
            arguments: JSON.stringify({ suggestionId: SUGGESTION.id }),
          },
        },
      ],
    },
    {
      id: "t1",
      role: "tool",
      toolCallId: "call-1",
      content: JSON.stringify({
        id: SUGGESTION.id,
        title: SUGGESTION.title,
        detail: SUGGESTION.detail,
        source: "Gmail",
        status: "open",
      }),
    },
    { id: "a2", role: "assistant", content: "Rosa needs an answer today." },
  ];
}

function chat(language: CardLanguage | null) {
  return render(
    queries(
      <CardLanguageProvider language={language}>
        <CopilotKitProvider>
          <OfferTaskTool />
          <ChatSuggestionProvider bot={BOT}>
            <ConversationView messages={checkedIn()} onSubmit={() => {}} />
          </ChatSuggestionProvider>
        </CopilotKitProvider>
      </CardLanguageProvider>,
    ),
  );
}

describe("a check-in in Chat", () => {
  test("the line above it is today's English with no language", async () => {
    serveSuggestion();
    const view = chat(null);
    const line = await view.findByText(/^Checked your mail and calendar/);
    expect(line.textContent).toBe(
      `Checked your mail and calendar · ${checkInTime(CHECKED_AT)}`,
    );
  });

  test("in Italian the line, its time and the card it ends on are all Italian", async () => {
    serveSuggestion();
    const view = chat("it");
    const line = await view.findByText(/^Ho controllato posta e calendario/);
    expect(line.textContent).toBe(
      `Ho controllato posta e calendario · ${checkInTime(CHECKED_AT, "it")}`,
    );
    expect(line.textContent).toMatch(/ · \d{2}:\d{2}$/);
    const card = await view.findByRole("region", {
      name: "OpenDuet potrebbe occuparsene",
    });
    expect(within(card).getByText("Da Gmail")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Avvia" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Nascondi" })).toBeTruthy();
    expectNoEnglish(view.container, [
      "Checked your mail and calendar",
      "OpenDuet could take this on",
      "From Gmail",
    ]);
  });
});

/*
 * How the language reaches the app: the server's /api/capabilities, read once.
 */

function Probe() {
  const t = useCardText();
  return <p>{t("brief.today")}</p>;
}

function serveCapabilities(body: Record<string, unknown>) {
  let asked = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/capabilities")) {
      asked += 1;
      return Response.json({ generativeUi: true, ...body });
    }
    return Response.json({});
  }) as unknown as typeof fetch;
  return () => asked;
}

describe("the app learns the language from the server", () => {
  test("a code the server sends reaches the cards; none, or one without a table, leaves English", async () => {
    for (const [body, expected] of [
      [{ personLanguage: "it" }, "Oggi"],
      [{}, "Today"],
      [{ personLanguage: "de" }, "Today"],
      [{ personLanguage: "en" }, "Today"],
    ] as const) {
      const asked = serveCapabilities(body);
      const view = render(
        queries(
          <PersonLanguageProvider>
            <Probe />
          </PersonLanguageProvider>,
        ),
      );
      await waitFor(() => expect(asked()).toBe(1));
      await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
      cleanup();
    }
  });

  test("the query keeps a two-letter lowercase code and nothing else", async () => {
    const read = async (personLanguage: unknown) => {
      serveCapabilities({ personLanguage });
      const client = new QueryClient();
      return client.fetchQuery(deploymentCapabilitiesQueryOptions());
    };
    expect((await read("it")).personLanguage).toBe("it");
    for (const value of ["Italian", "IT", "it-IT", "<b>", "", 7, null]) {
      const capabilities = await read(value);
      expect("personLanguage" in capabilities).toBe(false);
    }
    serveCapabilities({});
    const unset = await new QueryClient().fetchQuery(
      deploymentCapabilitiesQueryOptions(),
    );
    expect("personLanguage" in unset).toBe(false);
  });

  test("a server that cannot answer leaves the cards in English", async () => {
    globalThis.fetch = (async () =>
      new Response("down", { status: 500 })) as unknown as typeof fetch;
    const view = render(
      queries(
        <PersonLanguageProvider>
          <Probe />
        </PersonLanguageProvider>,
      ),
    );
    await settleReactWork();
    expect(view.getByText("Today")).toBeTruthy();
  });
});
