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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProposedBotCard } from "@/components/agents/proposed-bot";
import { MemberAddedLine } from "@/freeduet/member-added-line";
import { botCardAnswer } from "@/lib/agents/proposal";
import { recordMemberAdded } from "@/lib/settings-changes";
import { settleReactWork } from "./settle-react-work";

/**
 * The line a member added from chat leaves behind (docs/design/settings-in-chat.md, 8.11): one line with Undo
 * and Details, drawn from the person's own list of changes. The server's answers are served by a fake fetch,
 * and every request is recorded.
 */

const originalFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const RECORD: SettingChangeRecord = {
  changeId: "member-agent_1",
  agentId: "agent_1",
  setting: "member",
  previousValue: null,
  newValue: "Renewal Desk",
  skills: ["find-a-document"],
  job: "Accounts Receivable",
  at: "2026-11-15T09:30:00.000Z",
  undone: false,
  undoable: true,
};

const asked: { method: string; url: string; body: string | null }[] = [];
let list: () => SettingChangeRecord[];
let undoAnswer: () => Response;

beforeEach(() => {
  asked.length = 0;
  list = () => [RECORD];
  undoAnswer = () =>
    Response.json({
      undone: true,
      changeId: RECORD.changeId,
      setting: "member",
      value: null,
    });
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/settings-changes")) {
        asked.push({
          method,
          url,
          body: typeof init?.body === "string" ? init.body : null,
        });
        if (method === "GET") return Response.json({ changes: list() });
        if (url.endsWith("/undo")) return undoAnswer();
        return Response.json({ change: RECORD }, { status: 201 });
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

function routed(node: ReactNode) {
  const rootRoute = createRootRoute({ component: Outlet });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => node,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const card = <p>Completed card</p>;
const line = () => <MemberAddedLine agentId="agent_1" card={card} />;

const posts = () => asked.filter((request) => request.method === "POST");

describe("the line", () => {
  test("says what was added and offers Undo and Details, and nothing is undone until pressed", async () => {
    const view = routed(line());

    const shown = await view.findByRole("region", {
      name: "Renewal Desk added",
    });
    expect(shown.textContent).toContain("Renewal Desk was added to your team.");
    expect(await view.findByRole("button", { name: "Undo" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Details" })).toBeTruthy();
    expect(posts()).toEqual([]);
  });

  test("Details shows the job, the skills and the link, and hides again", async () => {
    const view = routed(line());
    const details = await view.findByRole("button", { name: "Details" });

    fireEvent.click(details);

    expect(await view.findByText("Accounts Receivable")).toBeTruthy();
    expect(view.getByText("/find-a-document")).toBeTruthy();
    expect(view.getByText("Open Renewal Desk")).toBeTruthy();
    // Said exactly: what Undo removes, and when it works.
    expect(
      view.getByText(/Removes Renewal Desk and the skills it was given/)
        .textContent,
    ).toContain("only while Renewal Desk has not been used, shared or changed");
    fireEvent.click(details);
    expect(view.queryByText("Accounts Receivable")).toBeNull();
  });

  test("Undo calls the person's own route with the change id, and the line says it is undone", async () => {
    const view = routed(line());
    fireEvent.click(await view.findByRole("button", { name: "Undo" }));

    const status = await view.findByRole("status");

    expect(status.textContent).toBe(
      "Renewal Desk was added and then removed. Undone.",
    );
    expect(posts()).toEqual([
      {
        method: "POST",
        url: "/api/settings-changes/member-agent_1/undo",
        body: null,
      },
    ]);
    expect(view.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  test("a refusal shows the server's own sentence and takes Undo away", async () => {
    undoAnswer = () =>
      Response.json(
        {
          error:
            "That member has been changed since it was added, or is already gone, so nothing was undone.",
        },
        { status: 409 },
      );
    const view = routed(line());
    fireEvent.click(await view.findByRole("button", { name: "Undo" }));

    const alert = await view.findByRole("alert");

    expect(alert.textContent).toContain("changed since");
    expect(view.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  test("a failure that reached no answer keeps the button, so the person can try again", async () => {
    undoAnswer = () => {
      throw new Error("offline");
    };
    const view = routed(line());
    fireEvent.click(await view.findByRole("button", { name: "Undo" }));

    const alert = await view.findByRole("alert");

    expect(alert.textContent).toContain("Could not undo");
    expect(view.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  test("after a reload the list decides: undone shows as undone, a changed member shows no Undo", async () => {
    list = () => [{ ...RECORD, undone: true, undoable: false }];
    const undone = routed(line());
    expect((await undone.findByRole("status")).textContent).toContain(
      "Undone.",
    );
    expect(undone.queryByRole("button", { name: "Undo" })).toBeNull();
    cleanup();

    list = () => [{ ...RECORD, undoable: false }];
    const changed = routed(line());
    await changed.findByRole("button", { name: "Details" });
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(changed.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  test("a member the server has no record of shows the completed card, not the line", async () => {
    list = () => [];
    const view = routed(line());

    expect(await view.findByText("Completed card")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(view.queryByRole("button", { name: "Details" })).toBeNull();
  });

  test("the line is drawn from the server's record, not from anything the model wrote", async () => {
    list = () => [{ ...RECORD, newValue: "Server Name", job: "Server Job" }];
    const view = routed(line());

    expect(
      (await view.findByRole("region", { name: "Server Name added" }))
        .textContent,
    ).toContain("Server Name was added to your team.");
    fireEvent.click(view.getByRole("button", { name: "Details" }));
    expect(await view.findByText("Server Job")).toBeTruthy();
  });
});

describe("the proposal card", () => {
  const answer = botCardAnswer.created({
    agentId: "agent_1",
    name: "Renewal Desk",
    granted: [],
    failed: [],
  });

  test("a created member shows the line in place of the completed card", async () => {
    const view = routed(
      <ProposedBotCard
        args={{ name: "Renewal Desk" }}
        create={async () => {
          throw new Error("not used");
        }}
        line={(_id, completed) => (
          <MemberAddedLine agentId="agent_1" card={completed} />
        )}
        result={answer}
      />,
    );

    expect(
      (await view.findByRole("region", { name: "Renewal Desk added" }))
        .textContent,
    ).toContain("was added to your team");
    expect(view.queryByText("Done")).toBeNull();
  });

  test("a created member the server did not record keeps the completed card", async () => {
    list = () => [];
    const view = routed(
      <ProposedBotCard
        args={{ name: "Renewal Desk" }}
        create={async () => {
          throw new Error("not used");
        }}
        line={(_id, completed) => (
          <MemberAddedLine agentId="agent_1" card={completed} />
        )}
        result={answer}
      />,
    );

    expect(await view.findByText("Done")).toBeTruthy();
    expect(
      view.queryByRole("region", { name: "Renewal Desk added" }),
    ).toBeNull();
  });

  test("a declined proposal still shows the completed card, not the line", async () => {
    const view = routed(
      <ProposedBotCard
        args={{ name: "Renewal Desk" }}
        create={async () => {
          throw new Error("not used");
        }}
        line={(_id, completed) => (
          <MemberAddedLine agentId="agent_1" card={completed} />
        )}
        result={botCardAnswer.declined()}
      />,
    );

    expect(await view.findByText("Done")).toBeTruthy();
    expect(
      view.queryByRole("region", { name: "Renewal Desk added" }),
    ).toBeNull();
  });
});

describe("recording", () => {
  test("posts the member id to the person's own route and says whether it was recorded", async () => {
    expect(await recordMemberAdded("agent_1")).toBe(true);
    expect(posts()).toEqual([
      {
        method: "POST",
        url: "/api/settings-changes/members",
        body: JSON.stringify({ agentId: "agent_1" }),
      },
    ]);
  });

  test("a refusal or a failure is false and never throws", async () => {
    globalThis.fetch = Object.assign(
      async () => Response.json({ error: "no" }, { status: 404 }),
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    expect(await recordMemberAdded("agent_1")).toBe(false);
    globalThis.fetch = Object.assign(
      async () => {
        throw new Error("offline");
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    expect(await recordMemberAdded("agent_1")).toBe(false);
  });
});
