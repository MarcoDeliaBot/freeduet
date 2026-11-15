import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  type ConversationSend,
  ConversationSendContext,
} from "@/components/channels/conversation-send";
import {
  RoutineChatCard,
  RoutineCreatedCard,
} from "@/components/routines/routine-chat-card";
import { settleReactWork } from "./settle-react-work";

/*
 * Queries bound to the page at the moment a test asks. `screen` is built when this module loads, before
 * happy-dom is registered, so it cannot be used here.
 */
function dom() {
  return within(document.body);
}

/**
 * The card under a routine written in chat. Each state is read from a routines list the server would
 * send, and each press is checked against the route it calls: the existing switch and delete, never a
 * new one.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

/** 08:00 UTC on Monday 16 November 2026: 09:00 in Europe/Rome, 03:00 in America/New_York. */
const MOMENT = "2026-11-16T08:00:00.000Z";

const ACTIVE = {
  id: "routine_1",
  agentId: "bot_1",
  schedule: "Every weekday at 9:00",
  timezone: "Europe/Rome",
  instruction: "Post the standup summary.",
  channel: { id: "c1", name: "Work", gone: false },
  enabled: true,
  nextRunAt: MOMENT,
  lastRun: null,
};

type Sent = { method: string; url: string; body: unknown };

/**
 * A stand-in for the routines routes that keeps state the way the server does: switching a routine
 * changes what the list says, and deleting one removes it. `listStatus` makes the list read fail.
 */
function serving(
  options: {
    routines?: (typeof ACTIVE)[];
    listStatus?: number;
    listError?: string;
  } = {},
) {
  const sent: Sent[] = [];
  let routines = options.routines ?? [ACTIVE];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ method, url, body });
    if (method === "GET" && url === "/api/routines") {
      if (options.listStatus !== undefined) {
        return Response.json(
          { error: options.listError ?? "Refused." },
          { status: options.listStatus },
        );
      }
      return Response.json({
        routines,
        sweep: { lastSweptAt: null, working: false },
      });
    }
    const switching = url.match(/^\/api\/routines\/([^/]+)\/enabled$/);
    if (method === "PUT" && switching) {
      routines = routines.map((routine) =>
        routine.id === switching[1]
          ? { ...routine, enabled: body.enabled as boolean }
          : routine,
      );
      return Response.json({ enabled: body.enabled });
    }
    const deleting = url.match(/^\/api\/routines\/([^/]+)$/);
    if (method === "DELETE" && deleting) {
      routines = routines.filter((routine) => routine.id !== deleting[1]);
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  }) as unknown as typeof fetch;
  return sent;
}

function renderCard(
  options: {
    conversation?: ConversationSend | null;
    deviceZone?: string;
    routineId?: string;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <ConversationSendContext.Provider value={options.conversation ?? null}>
        {children}
      </ConversationSendContext.Provider>
    </QueryClientProvider>
  );
  return render(
    wrap(
      <RoutineChatCard
        deviceZone={options.deviceZone ?? "Europe/Rome"}
        routineId={options.routineId ?? "routine_1"}
      />,
    ),
  );
}

/** The card itself: the one region on the screen that carries the routine's name. */
function card(): HTMLElement {
  return dom().getByRole("region", { name: "Routine" });
}

describe("the four states", () => {
  test("an active routine says what it does, when it runs next, and offers Pause, Edit and Cancel", async () => {
    serving();
    renderCard();

    expect(await dom().findByText("Post the standup summary.")).toBeTruthy();
    const status = within(card()).getByRole("status");
    expect(status.textContent).toMatch(
      /^Next run: Monday, 16 November 2026 at 09:00 \(Europe\/Rome\)\.$/,
    );
    expect(within(card()).queryByText("Paused")).toBeNull();
    expect(dom().getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(dom().getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(dom().getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  test("a paused routine says Paused, with no next run, and offers Resume", async () => {
    serving({ routines: [{ ...ACTIVE, enabled: false }] });
    renderCard();

    expect(await dom().findByText("Paused")).toBeTruthy();
    expect(dom().queryByText(/Next run:/)).toBeNull();
    expect(dom().getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(dom().queryByRole("button", { name: "Pause" })).toBeNull();
  });

  test("a cancelled routine is one line, and nothing else is left of the card", async () => {
    serving();
    renderCard();
    fireEvent.click(await dom().findByRole("button", { name: "Cancel" }));
    fireEvent.click(dom().getByRole("button", { name: "Yes, cancel it" }));

    expect(await dom().findByText("Routine cancelled")).toBeTruthy();
    expect(card().textContent).toBe("Routine cancelled");
    expect(dom().queryByRole("button")).toBeNull();
  });

  test("a routine deleted elsewhere reads that it no longer exists", async () => {
    serving({ routines: [] });
    renderCard();

    expect(
      await dom().findByText("This routine no longer exists"),
    ).toBeTruthy();
    expect(card().textContent).toBe("This routine no longer exists");
    expect(dom().queryByRole("button")).toBeNull();
  });

  test("a list that cannot be read is an error, never 'no longer exists'", async () => {
    serving({
      listStatus: 403,
      listError: "Routines are not open to this session.",
    });
    renderCard();

    expect(
      await dom().findByText("Routines are not open to this session."),
    ).toBeTruthy();
    expect(dom().queryByText("This routine no longer exists")).toBeNull();
  });
});

describe("the time zone line", () => {
  test("in the browser's own zone, gives one time and names the zone", async () => {
    serving();
    renderCard({ deviceZone: "Europe/Rome" });

    await dom().findByText("Post the standup summary.");
    const status = within(card()).getByRole("status");
    expect(status.textContent).toContain("09:00 (Europe/Rome).");
    expect(status.textContent).not.toContain("In your time zone");
  });

  test("in another zone, gives both times, naming both zones", async () => {
    serving();
    renderCard({ deviceZone: "America/New_York" });

    await dom().findByText("Post the standup summary.");
    const status = within(card()).getByRole("status");
    expect(status.textContent).toContain("09:00 (Europe/Rome).");
    expect(status.textContent).toContain(
      "In your time zone (America/New_York) that is Monday, 16 November 2026 at 03:00.",
    );
    expect(status.textContent).toContain("03:00.");
  });
});

describe("Cancel asks first, inside the card", () => {
  test("nothing is deleted until 'Yes, cancel it' is pressed, and the safe answer has the focus", async () => {
    const sent = serving();
    renderCard();
    fireEvent.click(await dom().findByRole("button", { name: "Cancel" }));

    expect(dom().getByText("Cancel this routine?")).toBeTruthy();
    expect(dom().getByRole("button", { name: "Yes, cancel it" })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("No, keep it");
    expect(sent.some((call) => call.method === "DELETE")).toBe(false);
  });

  test("'No, keep it' closes the question and deletes nothing", async () => {
    const sent = serving();
    renderCard();
    fireEvent.click(await dom().findByRole("button", { name: "Cancel" }));
    fireEvent.click(dom().getByRole("button", { name: "No, keep it" }));

    expect(dom().queryByText("Cancel this routine?")).toBeNull();
    expect(await dom().findByRole("button", { name: "Pause" })).toBeTruthy();
    expect(sent.some((call) => call.method === "DELETE")).toBe(false);
  });
});

describe("each button calls the existing route with the routine's id", () => {
  test("Pause switches the routine off through the enabled route, and Resume switches it on", async () => {
    const sent = serving();
    renderCard();
    fireEvent.click(await dom().findByRole("button", { name: "Pause" }));

    expect(await dom().findByText("Paused")).toBeTruthy();
    expect(sent).toContainEqual({
      method: "PUT",
      url: "/api/routines/routine_1/enabled",
      body: { enabled: false },
    });

    fireEvent.click(dom().getByRole("button", { name: "Resume" }));
    expect(await dom().findByText(/Next run:/)).toBeTruthy();
    expect(sent).toContainEqual({
      method: "PUT",
      url: "/api/routines/routine_1/enabled",
      body: { enabled: true },
    });
  });

  test("Cancel, once confirmed, deletes the routine through the delete route", async () => {
    const sent = serving();
    renderCard();
    fireEvent.click(await dom().findByRole("button", { name: "Cancel" }));
    fireEvent.click(dom().getByRole("button", { name: "Yes, cancel it" }));

    expect(await dom().findByText("Routine cancelled")).toBeTruthy();
    expect(sent).toContainEqual({
      method: "DELETE",
      url: "/api/routines/routine_1",
      body: undefined,
    });
  });
});

describe("Edit sends the person's change through the conversation", () => {
  test("it names the routine by its id and sends the person's words, and calls no route", async () => {
    const sent = serving();
    const messages: string[] = [];
    const conversation: ConversationSend = {
      send: (text) => {
        messages.push(text);
        return true;
      },
      isLatestTurn: () => true,
    };
    renderCard({ conversation });
    fireEvent.click(await dom().findByRole("button", { name: "Edit" }));
    await userEvent
      .setup({ document })
      .type(dom().getByLabelText("What should change?"), "make it 10:00");
    fireEvent.click(dom().getByRole("button", { name: "Send change" }));

    expect(messages).toEqual([
      "Change my routine with id routine_1: make it 10:00",
    ]);
    expect(dom().queryByLabelText("What should change?")).toBeNull();
    expect(sent.filter((call) => call.method !== "GET")).toEqual([]);
  });

  test("with no conversation to send into, it says where to write the change and offers no send", async () => {
    serving();
    renderCard({ conversation: null });
    fireEvent.click(await dom().findByRole("button", { name: "Edit" }));

    expect(
      dom().getByText("Write the change in the message box below."),
    ).toBeTruthy();
    expect(dom().queryByRole("button", { name: "Send change" })).toBeNull();
  });

  test("a conversation that cannot take the message says so and keeps the words", async () => {
    serving();
    renderCard({
      conversation: {
        send: () => false,
        isLatestTurn: () => true,
      },
    });
    fireEvent.click(await dom().findByRole("button", { name: "Edit" }));
    await userEvent
      .setup({ document })
      .type(dom().getByLabelText("What should change?"), "make it 10:00");
    fireEvent.click(dom().getByRole("button", { name: "Send change" }));

    expect(
      await dom().findByText(
        "This conversation cannot take a message right now. Write the change in the message box below.",
      ),
    ).toBeTruthy();
    expect(
      (dom().getByLabelText("What should change?") as HTMLTextAreaElement)
        .value,
    ).toBe("make it 10:00");
  });
});

describe("what the card shows of the routine's words", () => {
  test("the routine's own words are text, never markup", async () => {
    serving({
      routines: [{ ...ACTIVE, instruction: "<b>Post</b> the summary." }],
    });
    renderCard();

    expect(await dom().findByText("<b>Post</b> the summary.")).toBeTruthy();
    expect(card().querySelector("b")).toBeNull();
  });

  test("a long instruction is cut for the card", async () => {
    serving({ routines: [{ ...ACTIVE, instruction: "a".repeat(400) }] });
    renderCard();

    await dom().findByRole("button", { name: "Pause" });
    expect(card().textContent?.startsWith(`${"a".repeat(160)}…`)).toBe(true);
    expect(card().textContent).not.toContain("a".repeat(161));
  });
});

describe("RoutineCreatedCard draws the card only for a created routine", () => {
  test("a successful create draws the card", async () => {
    serving();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RoutineCreatedCard
          name="mcp__routines__create_routine"
          result={
            'That routine is set: "Post the standup summary." — Every weekday at 9:00 (Europe/Rome) · in Work · next 2026-11-16T08:00:00.000Z · never run · id: routine_1'
          }
        />
      </QueryClientProvider>,
    );

    expect(await dom().findByText("Post the standup summary.")).toBeTruthy();
  });

  test("a failed create draws nothing", () => {
    serving();
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <RoutineCreatedCard
          name="mcp__routines__create_routine"
          result="The vendor reported an error: A routine needs a schedule."
        />
      </QueryClientProvider>,
    );

    expect(container.innerHTML).toBe("");
  });
});
