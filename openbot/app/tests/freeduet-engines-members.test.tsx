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
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import type {
  ChangeBlock,
  EngineMode,
  EnginesReading,
  MemberSummary,
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
  await view.findByText("Each member's engines");
  await view.findByText("Iris");
  expect(view.getByText("Leo")).toBeTruthy();
  expect(view.getByText("Tries Claude Code, then Codex.")).toBeTruthy();
  expect(view.getByText("Tries only Claude Code.")).toBeTruthy();
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
  await view.findByText("Each member's engines");
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
  expect(view.getByText("Tries Claude Code, then Codex.")).toBeTruthy();
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
  expect(view.queryByText("Each member's engines")).toBeNull();
  expect(view.container.querySelectorAll(INTERACTIVE).length).toBe(0);
  // It asks for what it asked for before and nothing more.
  expect(reads).toEqual(["/api/freeduet/engines"]);
});

test("with no list to show there is no member section", async () => {
  server.reason = "unreachable";
  const view = draw();
  await view.findByText(/did not answer/);
  expect(view.queryByText("Each member's engines")).toBeNull();
  expect(view.container.querySelectorAll(INTERACTIVE).length).toBe(0);
  expect(reads).toEqual(["/api/freeduet/engines"]);
});

test("the only controls on the page are the two answers for each member and an Undo: no text field, no key field, no switch, no link", async () => {
  const view = draw();
  await view.findByText("Iris");
  const before = Array.from(view.container.querySelectorAll(INTERACTIVE));
  expect(before).toHaveLength(4);
  for (const control of before) {
    expect(control.tagName).toBe("INPUT");
    expect((control as HTMLInputElement).type).toBe("radio");
  }
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Ask me first", "Iris"));
  await view.findByRole("button", { name: "Undo the change for Iris" });
  const after = Array.from(view.container.querySelectorAll(INTERACTIVE));
  expect(after).toHaveLength(5);
  expect(
    after
      .filter((control) => control.tagName !== "INPUT")
      .map((control) => control.tagName),
  ).toEqual(["BUTTON"]);
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  expect(view.container.querySelector('input[type="text"]')).toBeNull();
  expect(view.container.querySelector("textarea")).toBeNull();
  expect(view.container.querySelector("a")).toBeNull();
});

test("the engine rows stay as they were: nothing in them can be clicked", async () => {
  const view = draw();
  await view.findByText("Iris");
  for (const name of ["Claude Code", "Codex", "A gateway"]) {
    const row = view.getByText(name).closest('[data-slot="item"]');
    expect(row).not.toBeNull();
    expect(row?.querySelectorAll(INTERACTIVE).length).toBe(0);
  }
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
