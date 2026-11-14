import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { SettingChangeRecord } from "@openbot/shared/setting-change";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  type RenderResult,
  within,
} from "@testing-library/react";
import { ChatChangesSection } from "@/components/settings/chat-changes";
import { settleReactWork } from "./settle-react-work";

/**
 * Settings → Notifications → "Changes made in chat" (docs/design/settings-in-chat.md, section 8): the
 * person's own changes, with Undo where it still works, read from the server's answer. The server is a fake
 * fetch here; every request is recorded.
 */

const originalFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const WHEN = "2026-11-14T09:30:00.000Z";

function change(
  overrides: Partial<SettingChangeRecord> & { changeId: string },
): SettingChangeRecord {
  return {
    agentId: "iris",
    setting: "notifications",
    previousValue: "all",
    newValue: "needs_input",
    at: WHEN,
    undone: false,
    undoable: true,
    ...overrides,
  };
}

/** Undoable: Iris went from everything to only when it needs you. */
const UNDOABLE = change({ changeId: "c-undoable" });
/** Undone: Otto went back from only when it needs you to everything. */
const UNDONE = change({
  changeId: "c-undone",
  agentId: "otto",
  previousValue: "needs_input",
  newValue: "all",
  undone: true,
  undoable: false,
});
/** Too old, or moved on: Iris went from only when it needs you to everything, and Undo is gone. */
const OLD = change({
  changeId: "c-old",
  previousValue: "needs_input",
  newValue: "all",
  undoable: false,
});

const TITLE_UNDOABLE =
  "Iris: notifications went from everything to only when it needs you";
const TITLE_UNDONE =
  "Otto: notifications went from only when it needs you to everything";
const TITLE_OLD =
  "Iris: notifications went from only when it needs you to everything";

type Answer = Response | Promise<Response>;
let listAnswer: () => Answer = () =>
  Response.json({ changes: [UNDOABLE, UNDONE, OLD] });
let undoAnswer: () => Answer = () =>
  Response.json({
    undone: true,
    changeId: "c-undoable",
    setting: "notifications",
    value: "all",
  });
const asked: {
  method: string;
  url: string;
  credentials: RequestCredentials | undefined;
}[] = [];

beforeEach(() => {
  asked.length = 0;
  listAnswer = () => Response.json({ changes: [UNDOABLE, UNDONE, OLD] });
  undoAnswer = () =>
    Response.json({
      undone: true,
      changeId: "c-undoable",
      setting: "notifications",
      value: "all",
    });
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/agents")
        return Response.json({
          agents: [
            { id: "iris", name: "Iris" },
            { id: "otto", name: "Otto" },
          ],
        });
      if (url === "/api/settings-changes") {
        asked.push({ method, url, credentials: init?.credentials });
        return listAnswer();
      }
      if (
        url === "/api/settings-changes/c-undoable/undo" &&
        method === "POST"
      ) {
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

function section(): RenderResult {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queries}>
      <ChatChangesSection />
    </QueryClientProvider>,
  );
}

/** The row a change's title belongs to: the title sits in its content, and the content in the row. */
async function rowOf(view: RenderResult, title: string): Promise<HTMLElement> {
  const found = await view.findByText(title, {
    selector: '[data-slot="item-title"]',
  });
  const row = found.closest('[data-slot="item-content"]')?.parentElement;
  if (!row) throw new Error(`no row holds "${title}"`);
  return row;
}

describe("the list's states", () => {
  test("while the list is read it says so", async () => {
    listAnswer = () => new Promise<Response>(() => {});
    const view = section();

    expect((await view.findByRole("status")).textContent).toBe(
      "Loading changes…",
    );
  });

  test("with no changes it says there are none yet", async () => {
    listAnswer = () => Response.json({ changes: [] });
    const view = section();

    expect(await view.findByText("No changes made in chat yet.")).toBeTruthy();
  });

  test("a list that cannot be read says so, in the server's words", async () => {
    listAnswer = () =>
      Response.json(
        { error: "Could not load the changes made in chat." },
        { status: 500 },
      );
    const view = section();

    expect((await view.findByRole("alert")).textContent).toBe(
      "Could not load the changes made in chat.",
    );
  });
});

describe("the rows", () => {
  test("each change names its Bot, the value before and after, and when it was made", async () => {
    const view = section();

    expect(
      await view.findByText(TITLE_UNDOABLE, {
        selector: '[data-slot="item-title"]',
      }),
    ).toBeTruthy();
    expect(
      view.getByText(TITLE_UNDONE, { selector: '[data-slot="item-title"]' }),
    ).toBeTruthy();
    expect(
      view.getByText(TITLE_OLD, { selector: '[data-slot="item-title"]' }),
    ).toBeTruthy();
    expect(
      view.getAllByText(new Date(WHEN).toLocaleString(), { exact: false }),
    ).toHaveLength(3);
  });

  test("a change that can still be undone has an Undo; an undone one says Undone; an old one says Undo is no longer possible", async () => {
    const view = section();

    const undoable = await rowOf(view, TITLE_UNDOABLE);
    expect(within(undoable).getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(undoable.textContent).not.toContain("Undone");

    const undone = await rowOf(view, TITLE_UNDONE);
    expect(within(undone).queryByRole("button")).toBeNull();
    expect(undone.textContent).toContain("Undone");

    const old = await rowOf(view, TITLE_OLD);
    expect(within(old).queryByRole("button")).toBeNull();
    expect(old.textContent).toContain("Undo is no longer possible");
  });
});

describe("pressing Undo in the list", () => {
  test("it goes to the person's own route, and the row then says Undone", async () => {
    const view = section();
    const row = await rowOf(view, TITLE_UNDOABLE);

    fireEvent.click(within(row).getByRole("button", { name: "Undo" }));

    expect(await within(row).findByText(/Undone/)).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(asked.filter((request) => request.method === "POST")).toEqual([
      {
        method: "POST",
        url: "/api/settings-changes/c-undoable/undo",
        credentials: "include",
      },
    ]);
  });

  test("a refusal is shown in the route's own words under the row, and the Undo goes", async () => {
    undoAnswer = () =>
      Response.json(
        { error: "That change has already been undone." },
        { status: 409 },
      );
    const view = section();
    const row = await rowOf(view, TITLE_UNDOABLE);

    fireEvent.click(within(row).getByRole("button", { name: "Undo" }));

    expect(
      (await within(row).findByText("That change has already been undone."))
        .textContent,
    ).toBe("That change has already been undone.");
    expect(within(row).queryByRole("button")).toBeNull();
  });

  test("a failure that reached no answer says so, and the Undo stays", async () => {
    undoAnswer = () => new Response("", { status: 500 });
    const view = section();
    const row = await rowOf(view, TITLE_UNDOABLE);

    fireEvent.click(within(row).getByRole("button", { name: "Undo" }));

    expect(
      await within(row).findByText("Couldn't undo the change. Try again."),
    ).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Undo" })).toBeTruthy();
  });
});
