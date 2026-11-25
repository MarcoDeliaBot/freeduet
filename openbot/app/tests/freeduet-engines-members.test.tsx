import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import type {
  ChangeBlock,
  EngineMode,
  EnginesReading,
  MemberSummary,
  OrderBreakKind,
} from "@/freeduet/engines-text";
import { settleReactWork } from "./settle-react-work";

/**
 * Admin → Engines, the member section (docs/design/engines-dashboard.md, slice 7a): each member's engines in the order they
 * are tried, what is left out and why, one choice for what happens when an engine runs out, an Undo after a change, and
 * the states of a page that may not change anything. The server is a small stand-in that keeps the person's choices the way
 * the real one does, so a click goes out as a request and comes back as a list.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;

/** What the stand-in server holds. */
type Server = {
  members: MemberSummary[];
  canChange: boolean;
  cannotChange: ChangeBlock | null;
  choices: "ok" | "unreadable";
  /** Leave the members out of the answer, as a server that keeps no choices does. */
  withoutMembers: boolean;
  reason: EnginesReading["reason"];
  /** What the next PUT or POST answers instead of working, if set. No `error` is an answer with no sentence in it. */
  refuse: { status: number; error?: string } | null;
  /** D115: the kind of break the next order is judged to be, as the agent would say it. Null: it keeps the group order. */
  orderBreak: OrderBreakKind | null;
  /** The list of Bots does not answer, so a member is named by its id. */
  agentsDown: boolean;
  nextChange: number;
  /** The change each id undoes: the member, the mode it replaced, and the mode it set. */
  changes: Record<
    string,
    { memberId: string; previous: EngineMode | null; mode: EngineMode }
  >;
};

let server: Server;
const sent: { method: string; path: string; body: unknown }[] = [];
/** Every address the page read, in order. */
const reads: string[] = [];

const ENGINES = [
  {
    id: "claude",
    name: "Claude Code",
    kind: "cli" as const,
    state: "ready" as const,
    until: null,
    refusal: null,
  },
  {
    id: "codex",
    name: "Codex",
    kind: "cli" as const,
    state: "signed_out" as const,
    until: null,
    refusal: null,
  },
  {
    id: "gateway",
    name: "A gateway",
    kind: "openai-compatible" as const,
    state: "refused" as const,
    until: null,
    refusal: "A gateway is a paid gateway.",
  },
];

function member(over: Partial<MemberSummary> & { id: string }): MemberSummary {
  return {
    chain: ["claude", "codex"],
    leftOut: [],
    mode: "automatic",
    fileMode: "automatic",
    chosen: false,
    pin: null,
    ownOrder: false,
    recommendedChain: over.chain ?? ["claude", "codex"],
    ...over,
  };
}

const agent = (id: string, name: string) => ({
  id,
  name,
  title: "",
  roleDescription: "",
  avatarSeed: id,
  visibility: "public",
  endpoint: null,
  builtIn: true,
  hasAuth: false,
  hasCallbackToken: false,
  hidden: false,
  pinned: false,
  systemOwned: false,
  canManage: false,
  mine: false,
});

function listing(): EnginesReading {
  if (server.reason) return { reason: server.reason, engines: [] };
  return {
    reason: null,
    engines: ENGINES,
    ...(server.withoutMembers
      ? {}
      : {
          members: server.members,
          choices: { state: server.choices },
          canChange: server.canChange,
          cannotChange: server.cannotChange,
        }),
  };
}

beforeEach(() => {
  sent.length = 0;
  reads.length = 0;
  server = {
    members: [
      member({
        id: "iris",
        leftOut: [{ id: "gateway", why: "paid_gateway" }],
      }),
      member({
        id: "leo",
        chain: ["claude"],
        mode: "ask-first",
        fileMode: "ask-first",
      }),
    ],
    canChange: true,
    cannotChange: null,
    choices: "ok",
    withoutMembers: false,
    reason: null,
    refuse: null,
    orderBreak: null,
    agentsDown: false,
    nextChange: 1,
    changes: {},
  };
  global.fetch = Object.assign(
    async (path: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? "GET";
      if (method === "GET") reads.push(url);
      if (method !== "GET")
        sent.push({
          method,
          path: url,
          // null is "no body": a request that carried one is recorded as the body itself.
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
      if (url === "/api/freeduet/engines" && method === "GET")
        return Response.json(listing());
      if (url.startsWith("/api/agents"))
        return server.agentsDown
          ? new Response(null, { status: 500 })
          : Response.json({
              agents: [agent("iris", "Iris"), agent("leo", "Leo")],
            });
      if (server.refuse && method !== "GET")
        return Response.json(
          server.refuse.error === undefined
            ? {}
            : { error: server.refuse.error },
          { status: server.refuse.status },
        );
      const put = /^\/api\/freeduet\/engines\/members\/([^/]+)\/mode$/.exec(
        url,
      );
      if (put && method === "PUT") {
        const memberId = decodeURIComponent(put[1] ?? "");
        const mode = (JSON.parse(String(init?.body)) as { mode: EngineMode })
          .mode;
        const row = server.members.find((entry) => entry.id === memberId);
        if (!row)
          return Response.json({ error: "No such member." }, { status: 400 });
        const changeId = `00000000-0000-4000-8000-${String(server.nextChange++).padStart(12, "0")}`;
        server.changes[changeId] = {
          memberId,
          previous: row.chosen ? row.mode : null,
          mode,
        };
        row.mode = mode;
        row.chosen = true;
        return Response.json({
          status: "changed",
          changeId,
          memberId,
          previous: server.changes[changeId]?.previous ?? null,
          mode,
        });
      }
      const order = /^\/api\/freeduet\/engines\/members\/([^/]+)\/order$/.exec(
        url,
      );
      if (order && method === "PUT") {
        const memberId = decodeURIComponent(order[1] ?? "");
        const asked = JSON.parse(String(init?.body)) as {
          order: string[];
          confirmed?: unknown;
        };
        const next = asked.order;
        const row = server.members.find((entry) => entry.id === memberId);
        if (!row)
          return Response.json({ error: "No such member." }, { status: 404 });
        // The real server refuses what is not a permutation of the chain.
        if (
          next.length !== row.chain.length ||
          [...next].sort().join() !== [...row.chain].sort().join()
        )
          return Response.json(
            { error: "That order is not accepted." },
            { status: 400 },
          );
        const breaks =
          next.join() === row.recommendedChain.join()
            ? null
            : server.orderBreak;
        if (breaks && asked.confirmed !== true)
          return Response.json(
            {
              error:
                "That order puts a free or paid engine before your own logins. Confirm it to use it. Nothing was changed.",
              code: "order_needs_confirmation",
              kind: breaks,
            },
            { status: 409 },
          );
        const changed = next.join() !== row.chain.join();
        row.chain = next;
        row.ownOrder = breaks !== null;
        return Response.json({
          memberId,
          chain: next,
          changed,
          ownOrder: row.ownOrder,
        });
      }
      const undo = /^\/api\/freeduet\/engines\/changes\/([^/]+)\/undo$/.exec(
        url,
      );
      if (undo && method === "POST") {
        const change = server.changes[decodeURIComponent(undo[1] ?? "")];
        const row = server.members.find(
          (entry) => entry.id === change?.memberId,
        );
        if (!change || !row)
          return Response.json(
            { error: "There is no engine change with that id." },
            { status: 404 },
          );
        if (change.previous === null) {
          row.mode = row.fileMode;
          row.chosen = false;
        } else row.mode = change.previous;
        return Response.json({
          status: "undone",
          changeId: undo[1],
          memberId: change.memberId,
          mode: change.previous,
        });
      }
      return new Response(null, { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  global.fetch = originalFetch;
});

function draw() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FreeDuetEngines />
    </QueryClientProvider>,
  );
}

type View = ReturnType<typeof draw>;

const radio = (view: View, label: string, name: string) =>
  view.getByRole("radio", { name: `${label} for ${name}` }) as HTMLInputElement;

/** Which of a member's two answers is selected, by label. */
const selected = (view: View, name: string) =>
  ["Switch automatically", "Ask me first"].filter(
    (label) => radio(view, label, name).checked,
  );

const INTERACTIVE =
  'button, a, input, select, textarea, [role="button"], [role="link"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [contenteditable]';

test("each member is a row: its engines in order by name, what is left out and why, and two answers with one sentence each", async () => {
  const view = draw();
  await view.findByRole("heading", { name: "Who uses what" });
  await view.findByText("Iris");
  expect(view.getByText("Leo")).toBeTruthy();
  expect(
    view.getByRole("list", { name: "Tries Claude Code, then Codex." }),
  ).toBeTruthy();
  expect(
    view.getByRole("list", { name: "Tries only Claude Code." }),
  ).toBeTruthy();
  expect(
    view.getByText(
      "Not used: A gateway, because it is a paid gateway, which FreeDuet does not run yet.",
    ),
  ).toBeTruthy();
  expect(
    view.getAllByText(
      "When an engine runs out, the next one answers and you are told which.",
    ),
  ).toHaveLength(2);
  expect(
    view.getAllByText(
      "When an engine runs out, you are asked: switch, wait, or name another engine.",
    ),
  ).toHaveLength(2);
  expect(selected(view, "Iris")).toEqual(["Switch automatically"]);
  expect(selected(view, "Leo")).toEqual(["Ask me first"]);
  for (const name of ["Iris", "Leo"])
    for (const label of ["Switch automatically", "Ask me first"])
      expect(radio(view, label, name).disabled).toBe(false);
});

test("a member is named by its id when the list of Bots does not answer, and the page says nothing about it", async () => {
  server.agentsDown = true;
  const view = draw();
  await view.findByRole("heading", { name: "Who uses what" });
  expect(view.getByText("leo")).toBeTruthy();
  expect(
    view.getByRole("radio", { name: "Ask me first for leo" }),
  ).toBeTruthy();
  expect(view.queryByRole("alert")).toBeNull();
});

test("a member with one engine is told there is nothing to switch to yet, and that its choice is kept", async () => {
  const view = draw();
  await view.findByText("Leo");
  expect(
    view.getAllByText(
      "Only Claude Code is set up for this member, so there is nothing to switch to yet. Your choice is kept for when there is.",
    ),
  ).toHaveLength(1);
});

test("a pin from the installation's file is said, and the file's value is told from the person's own", async () => {
  server.members = [
    member({ id: "iris", pin: "claude" }),
    member({
      id: "leo",
      mode: "ask-first",
      fileMode: "automatic",
      chosen: true,
    }),
  ];
  const view = draw();
  await view.findByText("Iris");
  expect(
    view.getByText(
      "Pinned to Claude Code by the installation's file: it never switches to another engine.",
    ),
  ).toBeTruthy();
  expect(view.getByText("From the installation's file.")).toBeTruthy();
  expect(
    view.getByText(
      "Your choice. The installation's file says: switch automatically.",
    ),
  ).toBeTruthy();
});

test("choosing the other answer sends one request with the mode and nothing else, says when it applies, and offers an Undo", async () => {
  const view = draw();
  await view.findByText("Iris");
  expect(sent).toEqual([]);
  expect(view.queryByRole("button", { name: /Undo/ })).toBeNull();
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));

  await waitFor(() =>
    expect(sent).toEqual([
      {
        method: "PUT",
        path: "/api/freeduet/engines/members/iris/mode",
        body: { mode: "ask-first" },
      },
    ]),
  );
  await view.findByText("Saved. It applies from the member's next message.");
  await waitFor(() => expect(selected(view, "Iris")).toEqual(["Ask me first"]));
  expect(
    view.getByText(
      "Your choice. The installation's file says: switch automatically.",
    ),
  ).toBeTruthy();
  expect(
    view.getByRole("button", { name: "Undo the change for Iris" }),
  ).toBeTruthy();
  // Leo is as he was.
  expect(selected(view, "Leo")).toEqual(["Ask me first"]);
  expect(view.getAllByText("From the installation's file.")).toHaveLength(1);
});

test("choosing the answer that is already selected sends nothing", async () => {
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Switch automatically", "Iris"));
  expect(sent).toEqual([]);
});

test("Undo sends one request for that change, says so, and goes away", async () => {
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  await user.click(
    await view.findByRole("button", { name: "Undo the change for Iris" }),
  );

  await waitFor(() =>
    expect(sent).toEqual([
      {
        method: "PUT",
        path: "/api/freeduet/engines/members/iris/mode",
        body: { mode: "ask-first" },
      },
      {
        method: "POST",
        path: "/api/freeduet/engines/changes/00000000-0000-4000-8000-000000000001/undo",
        body: null,
      },
    ]),
  );
  await view.findByText(
    "Undone. The previous setting applies from the member's next message.",
  );
  await waitFor(() =>
    expect(selected(view, "Iris")).toEqual(["Switch automatically"]),
  );
  expect(view.queryByRole("button", { name: /Undo/ })).toBeNull();
  expect(view.getAllByText("From the installation's file.")).toHaveLength(2);
});

test("a change the server refuses is said once, in the server's words, and the answer stays where it was", async () => {
  server.refuse = {
    status: 403,
    error: "Change this on the computer FreeDuet runs on. Nothing was changed.",
  };
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  const alert = await view.findByRole("alert");
  expect(alert.textContent).toBe(
    "Change this on the computer FreeDuet runs on. Nothing was changed.",
  );
  expect(view.getAllByRole("alert")).toHaveLength(1);
  expect(selected(view, "Iris")).toEqual(["Switch automatically"]);
  expect(view.queryByText(/^Saved\./)).toBeNull();
  expect(view.queryByRole("button", { name: /Undo/ })).toBeNull();
});

test("an Undo the server refuses is said in its words, and the change stays", async () => {
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  const undoButton = await view.findByRole("button", {
    name: "Undo the change for Iris",
  });
  server.refuse = {
    status: 409,
    error: "That choice has changed since, so nothing was undone.",
  };
  await user.click(undoButton);
  const alert = await view.findByRole("alert");
  expect(alert.textContent).toBe(
    "That choice has changed since, so nothing was undone.",
  );
  expect(selected(view, "Iris")).toEqual(["Ask me first"]);
});

test("a server that gives no sentence is covered by ours", async () => {
  server.refuse = { status: 500 };
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  const alert = await view.findByRole("alert");
  expect(alert.textContent).toBe("Your choice could not be saved.");
});

test("away from the computer every control is disabled, the sentence says where to change it, and a click sends nothing", async () => {
  server.canChange = false;
  server.cannotChange = "not_at_the_computer";
  const view = draw();
  await view.findByText("Iris");
  expect(
    view.getByText("Change these on the computer FreeDuet runs on."),
  ).toBeTruthy();
  for (const name of ["Iris", "Leo"])
    for (const label of ["Switch automatically", "Ask me first"])
      expect(radio(view, label, name).disabled).toBe(true);
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  expect(sent).toEqual([]);
  expect(selected(view, "Iris")).toEqual(["Switch automatically"]);
  // The information is all still there.
  expect(
    view.getByRole("list", { name: "Tries Claude Code, then Codex." }),
  ).toBeTruthy();
});

test("an agent too old to honour a choice leaves the controls disabled and says to update FreeDuet", async () => {
  server.canChange = false;
  server.cannotChange = "agent_too_old";
  const view = draw();
  await view.findByText("Iris");
  expect(view.getByText("Update FreeDuet to change this.")).toBeTruthy();
  expect(radio(view, "Ask me first", "Iris").disabled).toBe(true);
});

test("choices that cannot be read show the file's values, say so in one banner, and leave the controls disabled", async () => {
  server.canChange = false;
  server.cannotChange = "choices_unreadable";
  server.choices = "unreadable";
  const view = draw();
  await view.findByText("Iris");
  expect(
    view.getAllByText(
      "Your choices could not be read, so the installation's settings are in use. Nothing you chose is lost.",
    ),
  ).toHaveLength(1);
  expect(view.queryByRole("alert")).toBeNull();
  expect(radio(view, "Ask me first", "Iris").disabled).toBe(true);
  expect(selected(view, "Iris")).toEqual(["Switch automatically"]);
});

test("a server that keeps no choices gives the read-only page of before: the engines, and no member section or control", async () => {
  server.withoutMembers = true;
  const view = draw();
  await view.findByText("Claude Code");
  expect(view.queryByRole("heading", { name: "Who uses what" })).toBeNull();
  expect(view.container.querySelectorAll(INTERACTIVE).length).toBe(0);
  // It asks for what it asked for before, plus (D102) the token counts and the names for their table. Nothing that changes anything.
  expect(reads).toEqual([
    "/api/freeduet/engines",
    "/api/freeduet/engines/usage",
    "/api/agents",
  ]);
});

test("with no list to show there is no member section", async () => {
  server.reason = "unreachable";
  const view = draw();
  await view.findByText(/did not answer/);
  expect(view.queryByRole("heading", { name: "Who uses what" })).toBeNull();
  expect(view.container.querySelectorAll(INTERACTIVE).length).toBe(0);
  expect(reads).toEqual(["/api/freeduet/engines"]);
});

test("the only controls on the page are the two answers for each member, the arrows that move an engine, and an Undo: no text field, no key field, no switch, no link", async () => {
  const view = draw();
  await view.findByText("Iris");
  const before = Array.from(view.container.querySelectorAll(INTERACTIVE));
  // Four answers, and two arrows for Iris's two engines (Leo has one: nothing to move).
  expect(before).toHaveLength(6);
  expect(before.filter((control) => control.tagName === "INPUT")).toHaveLength(
    4,
  );
  for (const control of before.filter((entry) => entry.tagName === "INPUT"))
    expect((control as HTMLInputElement).type).toBe("radio");
  expect(
    before
      .filter((control) => control.tagName !== "INPUT")
      .map((control) => control.getAttribute("aria-label")),
  ).toEqual(["Move Claude Code down for Iris", "Move Codex up for Iris"]);
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  await view.findByRole("button", { name: "Undo the change for Iris" });
  const after = Array.from(view.container.querySelectorAll(INTERACTIVE));
  expect(after).toHaveLength(7);
  expect(
    after
      .filter((control) => control.tagName !== "INPUT")
      .map((control) => control.tagName),
  ).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  expect(view.container.querySelector('input[type="text"]')).toBeNull();
  expect(view.container.querySelector("textarea")).toBeNull();
  expect(view.container.querySelector("a")).toBeNull();
});

test("the engine cards stay as they were: nothing in them can be clicked", async () => {
  const view = draw();
  await view.findByText("Iris");
  const cards = Array.from(
    view.container.querySelectorAll('[data-slot="engine"]'),
  );
  expect(cards).toHaveLength(3);
  for (const card of cards) {
    expect(card.querySelectorAll(INTERACTIVE).length).toBe(0);
  }
});

test("the members are a table: a column heading for each column, a row heading for each member, and the answers inside the row", async () => {
  const view = draw();
  await view.findByText("Iris");
  const table = view.getByRole("table", { name: "Who uses what" });
  const headings = within(table).getAllByRole("columnheader");
  expect(headings.map((cell) => cell.textContent)).toEqual([
    "Member",
    "Order of engines",
    "When an engine runs out",
  ]);
  for (const heading of headings)
    expect(heading.getAttribute("scope")).toBe("col");
  const rows = within(table).getAllByRole("rowheader");
  expect(rows.map((cell) => cell.textContent)).toEqual(["Iris", "Leo"]);
  for (const cell of rows) expect(cell.getAttribute("scope")).toBe("row");
  // The two answers of each member sit in that member's own row.
  const iris = rows[0]?.closest("tr") as HTMLElement;
  expect(
    within(iris).getByRole("radio", { name: "Ask me first for Iris" }),
  ).toBeTruthy();
  const leo = rows[1]?.closest("tr") as HTMLElement;
  expect(
    within(leo).getByRole("radio", { name: "Switch automatically for Leo" }),
  ).toBeTruthy();
});

test("the engines a member tries are a numbered list in the order they are tried", async () => {
  const view = draw();
  await view.findByText("Iris");
  const list = view.getByRole("list", {
    name: "Tries Claude Code, then Codex.",
  });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "1Claude Code",
    "2Codex",
  ]);
  // The number is for the eye: a screen reader hears the list's order and the names.
  for (const item of items)
    expect(item.querySelector('[aria-hidden="true"]')).not.toBeNull();
});

test("the table sits in a named box that a narrow screen can scroll, and every cell's answer is a focusable control", async () => {
  const view = draw();
  await view.findByText("Iris");
  const box = view.getByRole("region", { name: "Who uses what" });
  expect(box.contains(view.getByRole("table"))).toBe(true);
  // A scrolled-away row is reached by its own answers, which a keyboard can focus: no tabindex is needed on the box.
  expect(box.getAttribute("tabindex")).toBeNull();
  for (const radio of within(box).getAllByRole("radio"))
    expect((radio as HTMLInputElement).disabled).toBe(false);
});

test("the page sends nothing but reads until the person chooses", async () => {
  const view = draw();
  await view.findByText("Iris");
  expect(sent).toEqual([]);
  view.unmount();
});

test("the page says nothing of keys, prices or where to get a key", async () => {
  const view = draw();
  await view.findByText("Iris");
  const text = view.container.textContent ?? "";
  expect(text).not.toMatch(/api[ _-]?key|per token|\$\d|https?:|no api fees/i);
});

// ── D112: the order by hand ──────────────────────────────────────────────────────────────────────

const THREE = ["claude", "codex", "gateway"];
const order = (view: View, memberIndex: number) => {
  const lists = view.getAllByRole("list", { name: /^Tries / });
  return within(lists[memberIndex] as HTMLElement)
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace(/^\d/, ""));
};

test("each engine has an arrow up and an arrow down, except that the first has no Up and the last no Down", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  const view = draw();
  await view.findByText("Iris");
  const labels = view
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
  expect(labels).toEqual([
    "Move Claude Code down for Iris",
    "Move Codex up for Iris",
    "Move Codex down for Iris",
    "Move A gateway up for Iris",
  ]);
});

test("an arrow sends the member and the whole new order, nothing else, says when it applies and offers an Undo", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move A gateway up for Iris" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        method: "PUT",
        path: "/api/freeduet/engines/members/iris/order",
        body: { order: ["claude", "gateway", "codex"] },
      },
    ]),
  );
  await view.findByText("Saved. It applies from the member's next message.");
  await waitFor(() =>
    expect(order(view, 0)).toEqual(["Claude Code", "A gateway", "Codex"]),
  );
  expect(
    view.getByRole("button", { name: "Undo the change for Iris" }),
  ).toBeTruthy();
  // The list was read again after the change.
  expect(reads.filter((url) => url === "/api/freeduet/engines").length).toBe(2);
});

test("Undo puts the previous order back with one more request and goes away", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move Claude Code down for Iris" }),
  );
  await user.click(
    await view.findByRole("button", { name: "Undo the change for Iris" }),
  );
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toEqual({
    method: "PUT",
    path: "/api/freeduet/engines/members/iris/order",
    body: { order: THREE },
  });
  await view.findByText(
    "Undone. The previous setting applies from the member's next message.",
  );
  await waitFor(() =>
    expect(order(view, 0)).toEqual(["Claude Code", "Codex", "A gateway"]),
  );
  expect(view.queryByRole("button", { name: /Undo/ })).toBeNull();
});

test("a move the server refuses is said in its words and the order stays", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  server.refuse = {
    status: 400,
    error: "That order is not accepted. Nothing was changed.",
  };
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move Codex up for Iris" }),
  );
  await view.findByRole("alert");
  expect(view.getByRole("alert").textContent).toContain(
    "That order is not accepted",
  );
  expect(order(view, 0)).toEqual(["Claude Code", "Codex", "A gateway"]);
  expect(view.queryByRole("button", { name: /Undo/ })).toBeNull();
});

test("away from the computer the arrows are not offered and nothing is sent", async () => {
  server.canChange = false;
  server.cannotChange = "not_at_the_computer";
  server.members = [member({ id: "iris", chain: THREE })];
  const view = draw();
  await view.findByText("Iris");
  for (const button of view.getAllByRole("button"))
    expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(sent).toEqual([]);
});

test("a member with one engine has nothing to move", async () => {
  server.members = [member({ id: "leo", chain: ["claude"] })];
  const view = draw();
  await view.findByText("Leo");
  expect(view.queryAllByRole("button")).toHaveLength(0);
});

test("the arrows and Undo stay disabled until the list has been read again after a move", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  const view = draw();
  await view.findByText("Iris");
  // From now on the list is held back until the test lets it through.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const before = global.fetch;
  global.fetch = Object.assign(
    async (path: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(path) === "/api/freeduet/engines" && !init?.method) await gate;
      return before(path, init);
    },
    { preconnect: originalFetch.preconnect },
  );
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move Codex up for Iris" }),
  );
  await waitFor(() => expect(sent).toHaveLength(1));
  // The save went through; the list is still being read: the row is still the old chain, and nothing can be pressed.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(order(view, 0)).toEqual(["Claude Code", "Codex", "A gateway"]);
  for (const button of view.getAllByRole("button"))
    expect((button as HTMLButtonElement).disabled).toBe(true);
  release();
  await waitFor(() =>
    expect(order(view, 0)).toEqual(["Codex", "Claude Code", "A gateway"]),
  );
  await waitFor(() =>
    expect(
      (
        view.getByRole("button", {
          name: "Move Claude Code up for Iris",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  global.fetch = before;
});

// ── D115: the person's own order, with a warning and a confirmation ─────────────────────────────

const FREE_FIRST = ["gateway", "claude", "codex"];

const warning = (view: View) =>
  view.getByRole("group", { name: "Confirm the new order for Iris" });

test("a move that leaves the group order shows a warning in the row, not an alert, and nothing is written yet", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  server.orderBreak = "free_before_login";
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move A gateway up for Iris" }),
  );
  await view.findByRole("group", { name: "Confirm the new order for Iris" });
  expect(view.queryByRole("alert")).toBeNull();
  const box = warning(view);
  expect(box.textContent).toContain(
    "A free engine would answer before your own login",
  );
  expect(box.textContent).toContain("may keep them");
  expect(box.textContent).toContain("lower quality");
  expect(box.textContent).toContain(
    "New order: Claude Code, then A gateway, then Codex",
  );
  // the first request was the plain order, with no confirmation in it
  expect(sent).toEqual([
    {
      method: "PUT",
      path: "/api/freeduet/engines/members/iris/order",
      body: { order: ["claude", "gateway", "codex"] },
    },
  ]);
  expect(order(view, 0)).toEqual(["Claude Code", "Codex", "A gateway"]);
});

test("a paid-first move says every message may cost money from the first one", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  server.orderBreak = "paid_before_free_or_login";
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move A gateway up for Iris" }),
  );
  const box = await view.findByRole("group", {
    name: "Confirm the new order for Iris",
  });
  expect(box.textContent).toContain(
    "A paid engine would come before a free engine or a login",
  );
  expect(box.textContent).toContain(
    "every message may cost money from the first one",
  );
  expect(box.textContent).not.toContain("may keep them");
});

test("Confirm stays disabled until the box is ticked, then sends the same order with confirmed true", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  server.orderBreak = "free_before_login";
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move A gateway up for Iris" }),
  );
  await view.findByRole("group", { name: "Confirm the new order for Iris" });
  const tick = view.getByRole("checkbox", {
    name: "I understand, use this order for Iris",
  }) as HTMLInputElement;
  const confirm = view.getByRole("button", {
    name: "Confirm the new order for Iris",
  }) as HTMLButtonElement;
  expect(tick.checked).toBe(false);
  expect(confirm.disabled).toBe(true);
  await user.click(confirm);
  expect(sent).toHaveLength(1); // a disabled button sends nothing
  await user.click(tick);
  expect(confirm.disabled).toBe(false);
  await user.click(confirm);
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toEqual({
    method: "PUT",
    path: "/api/freeduet/engines/members/iris/order",
    body: { order: ["claude", "gateway", "codex"], confirmed: true },
  });
  await view.findByText("Saved. It applies from the member's next message.");
  await waitFor(() =>
    expect(order(view, 0)).toEqual(["Claude Code", "A gateway", "Codex"]),
  );
  expect(
    view.queryByRole("group", { name: "Confirm the new order for Iris" }),
  ).toBeNull();
});

test("Cancel leaves the order as it was and sends nothing more", async () => {
  server.members = [member({ id: "iris", chain: THREE })];
  server.orderBreak = "free_before_login";
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move A gateway up for Iris" }),
  );
  await view.findByRole("group", { name: "Confirm the new order for Iris" });
  await user.click(
    view.getByRole("checkbox", {
      name: "I understand, use this order for Iris",
    }),
  );
  await user.click(
    view.getByRole("button", { name: "Cancel the new order for Iris" }),
  );
  expect(
    view.queryByRole("group", { name: "Confirm the new order for Iris" }),
  ).toBeNull();
  expect(sent).toHaveLength(1);
  expect(order(view, 0)).toEqual(["Claude Code", "Codex", "A gateway"]);
  // a new move starts with an empty box
  await user.click(
    view.getByRole("button", { name: "Move A gateway up for Iris" }),
  );
  await view.findByRole("group", { name: "Confirm the new order for Iris" });
  expect(
    (
      view.getByRole("checkbox", {
        name: "I understand, use this order for Iris",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

test("a member on an own order says so and goes back to the recommended order in one press, without a confirmation", async () => {
  server.members = [
    member({
      id: "iris",
      chain: FREE_FIRST,
      ownOrder: true,
      recommendedChain: THREE,
    }),
    member({ id: "leo", chain: ["claude"] }),
  ];
  server.orderBreak = "free_before_login";
  const view = draw();
  await view.findByText("Iris");
  expect(view.getAllByText("Your order: logins are not first")).toHaveLength(1);
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Use the recommended order for Iris" }),
  );
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.body).toEqual({ order: THREE });
  await view.findByText("Saved. It applies from the member's next message.");
  await waitFor(() =>
    expect(view.queryByText("Your order: logins are not first")).toBeNull(),
  );
  expect(order(view, 0)).toEqual(["Claude Code", "Codex", "A gateway"]);
});

test("a member whose order is the recommended one shows no own-order note", async () => {
  server.members = [
    member({
      id: "iris",
      chain: THREE,
      ownOrder: true,
      recommendedChain: THREE,
    }),
  ];
  const view = draw();
  await view.findByText("Iris");
  expect(view.queryByText("Your order: logins are not first")).toBeNull();
});

test("away from the computer the warning's controls and the way back are disabled", async () => {
  server.canChange = false;
  server.cannotChange = "not_at_the_computer";
  server.members = [
    member({
      id: "iris",
      chain: FREE_FIRST,
      ownOrder: true,
      recommendedChain: THREE,
    }),
  ];
  const view = draw();
  await view.findByText("Iris");
  expect(
    (
      view.getByRole("button", {
        name: "Use the recommended order for Iris",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

const OWN = ["claude", "gateway", "codex"];
const ORDER_PATH = "/api/freeduet/engines/members/iris/order";

/** A member on an own order goes back to the recommended one (no break), so its Undo would go back into the own order. */
async function undoIntoOwnOrder() {
  server.members = [
    member({ id: "iris", chain: OWN, recommendedChain: THREE, ownOrder: true }),
  ];
  server.orderBreak = "free_before_login";
  const view = draw();
  await view.findByText("Iris");
  const user = userEvent.setup({ document });
  await user.click(
    view.getByRole("button", { name: "Move A gateway down for Iris" }),
  );
  await waitFor(() => expect(order(view, 0)).toEqual(THREE.map(nameOf)));
  await user.click(
    await view.findByRole("button", { name: "Undo the change for Iris" }),
  );
  await view.findByRole("group", { name: "Confirm the new order for Iris" });
  return { view, user };
}
const nameOf = (id: string) =>
  ({ claude: "Claude Code", codex: "Codex", gateway: "A gateway" })[
    id
  ] as string;

test("Undo back into an out-of-group order asks again: the warning shows, no confirmed is sent, and the order stays", async () => {
  const { view } = await undoIntoOwnOrder();
  expect(view.queryByRole("alert")).toBeNull();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual({
    method: "PUT",
    path: ORDER_PATH,
    body: { order: OWN },
  });
  expect(order(view, 0)).toEqual(THREE.map(nameOf));
});

test("after the tick and Confirm, the Undo sends confirmed true and says Undone", async () => {
  const { view, user } = await undoIntoOwnOrder();
  await user.click(
    view.getByRole("checkbox", {
      name: "I understand, use this order for Iris",
    }),
  );
  await user.click(
    view.getByRole("button", { name: "Confirm the new order for Iris" }),
  );
  await waitFor(() => expect(sent).toHaveLength(3));
  expect(sent[2]).toEqual({
    method: "PUT",
    path: ORDER_PATH,
    body: { order: OWN, confirmed: true },
  });
  await view.findByText(
    "Undone. The previous setting applies from the member's next message.",
  );
  await waitFor(() => expect(order(view, 0)).toEqual(OWN.map(nameOf)));
});

test("Cancel on an Undo's warning leaves the current order and sends nothing more", async () => {
  const { view, user } = await undoIntoOwnOrder();
  await user.click(
    view.getByRole("button", { name: "Cancel the new order for Iris" }),
  );
  expect(
    view.queryByRole("group", { name: "Confirm the new order for Iris" }),
  ).toBeNull();
  expect(sent).toHaveLength(2);
  expect(order(view, 0)).toEqual(THREE.map(nameOf));
});

test("a 409 with a missing or unknown kind is an ordinary error: the server's sentence, no confirmation warning", async () => {
  for (const kind of [undefined, "something_new"]) {
    server.members = [member({ id: "iris", chain: THREE })];
    const base = global.fetch;
    global.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input).endsWith("/order") &&
          (init?.method ?? "GET") === "PUT"
        )
          return Response.json(
            { error: "Not saved.", code: "order_needs_confirmation", kind },
            { status: 409 },
          );
        return base(input, init);
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    const view = draw();
    await view.findByText("Iris");
    const user = userEvent.setup({ document });
    await user.click(
      view.getByRole("button", { name: "Move A gateway up for Iris" }),
    );
    const alert = await view.findByRole("alert");
    expect(alert.textContent).toContain("Not saved.");
    expect(
      view.queryByRole("group", { name: "Confirm the new order for Iris" }),
    ).toBeNull();
    view.unmount();
    global.fetch = base;
  }
});
