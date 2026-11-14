import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ConnectPrompt } from "@openbot/shared/connect-prompt";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { AccessSections } from "@/components/bot-profile/access";
import { AppAccessCard } from "@/components/channels/app-access-card";
import { AccessRequestsSection } from "@/components/plugins/access-requests";
import {
  AppAccessAction,
  appAccessSentence,
} from "@/components/plugins/app-access-action";
import type { AgentProfile } from "@/lib/agents/queries";
import type {
  AppAccess,
  AppAccessRequest,
  AppWant,
} from "@/lib/app-access/queries";
import { appAccess } from "./app-access-fixture";
import { settleReactWork } from "./settle-react-work";

/**
 * A ready app whose Bot is missing a tool its own skills need (issue #102, docs/M1_PLAN.md D31).
 *
 * A build can add a tool to a connector a Bot already holds, and nothing grants it by arriving, so
 * the app is still `ready` — the Bot can use everything it was given — and the server says what is
 * missing in `wants`, with the one `grant` request that asks for it. Every place that draws an app
 * says the same thing and offers the same one button: the Bot's page, the chat card, and the
 * administrator's inbox, where the row names the tools and Approve gives exactly those.
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

const SEND: AppWant = {
  ref: "composio-gmail/GMAIL_SEND_EMAIL",
  name: "GMAIL_SEND_EMAIL",
  label: "Send a new email",
  read: false,
};
const DRAFTS: AppWant = {
  ref: "composio-gmail/GMAIL_LIST_DRAFTS",
  name: "GMAIL_LIST_DRAFTS",
  label: "Send a new email",
  read: true,
};
const REPLY: AppWant = {
  ref: "composio-gmail/GMAIL_REPLY",
  name: "GMAIL_REPLY",
  label: "Answer a customer",
  read: false,
};

/** Gmail, ready, with the tools its skills need and it has not been given. */
const missing = (
  wants: AppWant[] = [SEND],
  overrides: Partial<AppAccess> = {},
) => appAccess({ wants, requestKind: "grant", ...overrides });

type Sent = { method: string; url: string; body: unknown };

function recording(answer: (url: string, method: string) => Response) {
  const sent: Sent[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    sent.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return answer(url, method);
  }) as unknown as typeof fetch;
  return sent;
}

function draw(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <>{children}</>,
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/connections/$key",
    component: () => null,
  });
  const grants = createRoute({
    getParentRoute: () => root,
    path: "/admin/plugins/$key/bots/$agentId",
    component: () => null,
  });
  const plugin = createRoute({
    getParentRoute: () => root,
    path: "/admin/plugins/$key",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([page, settings, grants, plugin]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("the sentence names what the skills need, once per skill, and says who can give it", () => {
  expect(appAccessSentence(missing([SEND]))).toBe(
    "Ready to use, but this Bot hasn't been given everything its skills need: Send a new email. Only an admin can give it.",
  );
  // Two tools for one skill are one skill: a person reads the skills and not the tools.
  expect(appAccessSentence(missing([SEND, DRAFTS, REPLY]))).toBe(
    "Ready to use, but this Bot hasn't been given everything its skills need: Send a new email, Answer a customer. Only an admin can give it.",
  );
});

test("an app with nothing missing reads as it always did, whether the list is absent or empty", () => {
  expect(appAccessSentence(appAccess())).toBe("Ready to use.");
  expect(appAccessSentence(appAccess({ wants: [] }))).toBe("Ready to use.");
  expect(appAccessSentence(appAccess({ accountHolder: "owner" }))).toBe(
    "Ready to use. This Bot uses its owner's Gmail account.",
  );
});

test("a ready app that lacks a tool offers Request access, naming the Bot and the app and nothing else", async () => {
  const sent = recording(() =>
    Response.json({ request: { id: "req_1" }, created: true }),
  );
  const view = draw(<AppAccessAction access={missing()} agentId="expenses" />);
  fireEvent.click(
    await view.findByRole("button", { name: "Request access to Gmail" }),
  );
  await waitFor(() =>
    expect(sent.find((call) => call.method === "POST")).toEqual({
      method: "POST",
      url: "/api/plugins/access-requests",
      // Not the tools and not the kind: what is asked for is the server's to read.
      body: { agentId: "expenses", app: "composio-gmail" },
    }),
  );
});

test("a pending request for it reads Requested, and Withdraw cancels it", async () => {
  const sent = recording(() => Response.json({ request: { id: "req_9" } }));
  const view = draw(
    <AppAccessAction
      access={missing([SEND], {
        request: {
          id: "req_9",
          kind: "grant",
          createdAt: "2026-11-14T10:00:00.000Z",
        },
      })}
      agentId="expenses"
    />,
  );
  await view.findByText("Requested");
  fireEvent.click(
    view.getByRole("button", { name: "Withdraw request for Gmail" }),
  );
  await waitFor(() =>
    expect(
      sent.some(
        (call) =>
          call.method === "DELETE" &&
          call.url === "/api/plugins/access-requests/req_9",
      ),
    ).toBe(true),
  );
});

test("a ready app with nothing missing still offers nothing to press", async () => {
  const view = draw(
    <AppAccessAction access={appAccess()} agentId="expenses" />,
  );
  await settleReactWork();
  expect(view.queryByRole("button")).toBeNull();
  expect(view.queryByRole("link")).toBeNull();
});

/* ---- the Bot's own page ---- */

const BOT: AgentProfile = {
  id: "expenses",
  name: "Expenses",
  title: "Finance",
  roleDescription: "Receipts.",
  avatarSeed: "e",
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
};

function servingBotPage(apps: AppAccess[]) {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/plugins/for/expenses/apps"))
      return Response.json({ apps });
    if (url.endsWith("/api/plugins/for/expenses"))
      return Response.json({
        tools: [
          {
            ref: "composio-gmail/GMAIL_FETCH_EMAILS",
            toolName: "mcp__composio-gmail__GMAIL_FETCH_EMAILS",
            description: "",
            inputSchema: {},
          },
        ],
        skills: [],
      });
    if (url.includes("/handoff"))
      return Response.json({
        handoff: {
          enabled: false,
          canGrant: false,
          reachable: [],
          grantable: false,
        },
      });
    if (url.includes("/api/agents")) return Response.json({ agents: [] });
    return Response.json({
      user: { id: "me", role: "user", email: "me@example.test", name: "Me" },
    });
  }) as unknown as typeof fetch;
}

const appRow = async (view: ReturnType<typeof draw>, key: string) => {
  await view.findByText("What it can use");
  const found = await view.findByText((_, element) =>
    Boolean(element?.getAttribute("data-app") === key),
  );
  return within(found);
};

test("the Bot's page says what is missing on a ready app, keeps its tool count, and offers the one request", async () => {
  servingBotPage([missing([SEND])]);
  const gmail = await appRow(
    draw(<AccessSections agent={BOT} />),
    "composio-gmail",
  );
  expect(
    gmail.getByText(
      /^Ready to use, but this Bot hasn't been given everything its skills need: Send a new email\. Only an admin can give it\./,
    ),
  ).toBeTruthy();
  expect(gmail.getByText("1 tool")).toBeTruthy();
  expect(
    gmail.getByRole("button", { name: "Request access to Gmail" }),
  ).toBeTruthy();
});

test("the Bot's page offers nothing on a ready app that lacks nothing", async () => {
  servingBotPage([appAccess()]);
  const gmail = await appRow(
    draw(<AccessSections agent={BOT} />),
    "composio-gmail",
  );
  expect(gmail.getByText(/^Ready to use\./)).toBeTruthy();
  expect(gmail.queryByRole("button")).toBeNull();
});

/* ---- the card in the conversation ---- */

const prompt = (overrides: Partial<ConnectPrompt> = {}): ConnectPrompt => ({
  serverId: "composio-gmail",
  title: "Gmail",
  message: "Gmail is ready for this person to use through you.",
  agentId: "expenses",
  reason: "access",
  ...overrides,
});

const drawnCard = (view: ReturnType<typeof draw>) =>
  waitFor(() => {
    const found = view.container.querySelector("[data-app-access]");
    if (!found?.getAttribute("data-state")) throw new Error("not drawn yet");
    return found as HTMLElement;
  });

function servingCard(live: AppAccess) {
  recording((url) =>
    url.includes("/apps/")
      ? Response.json({ app: live })
      : Response.json({ connections: [], redirectUri: null }),
  );
}

test("the card show_app_access draws says what is missing and carries the button that asks for it", async () => {
  servingCard(missing([SEND]));
  const view = draw(<AppAccessCard prompt={prompt()} />);
  const card = await drawnCard(view);
  expect(card.textContent).toContain(
    "Ready to use, but this Bot hasn't been given everything its skills need: Send a new email.",
  );
  expect(
    view.getByRole("button", { name: "Request access to Gmail" }),
  ).toBeTruthy();
});

test("a card from an earlier refusal, over an app that is ready now but still lacks a tool, does not say ask again", async () => {
  servingCard(missing([SEND]));
  const view = draw(<AppAccessCard prompt={prompt({ reason: "connect" })} />);
  const card = await drawnCard(view);
  expect(card.textContent).not.toContain("Ask again and the Bot can use it");
  expect(card.textContent).toContain("everything its skills need");
  expect(
    view.getByRole("button", { name: "Request access to Gmail" }),
  ).toBeTruthy();
});

test("a card from an earlier refusal over an app that is ready and lacks nothing still says ask again, with no button", async () => {
  servingCard(appAccess());
  const view = draw(<AppAccessCard prompt={prompt({ reason: "connect" })} />);
  const card = await drawnCard(view);
  expect(card.textContent).toContain(
    "Gmail is ready now. Ask again and the Bot can use it.",
  );
  expect(view.queryByRole("button")).toBeNull();
});

/* ---- the administrator's inbox ---- */

const filed = (
  overrides: Partial<AppAccessRequest> = {},
): AppAccessRequest => ({
  id: "req_1",
  appKey: "composio-gmail",
  appTitle: "Gmail",
  kind: "grant",
  status: "pending",
  agentId: "expenses",
  botName: "Expenses",
  requestedBy: "u_ada",
  requesterEmail: "ada@example.test",
  requesterName: "Ada",
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  resolvedAt: null,
  resolvedBy: null,
  ...overrides,
});

function servingInbox(requests: AppAccessRequest[]) {
  return recording((url, method) => {
    if (method === "POST" && url.endsWith("/approve"))
      return Response.json({ request: {} });
    if (url.startsWith("/api/plugins/access-requests"))
      return Response.json({
        requests,
        counts: { total: requests.length, byApp: {} },
      });
    return Response.json({});
  });
}

test("a request for a missing tool names the tools, and says approving gives exactly those and which change something", async () => {
  servingInbox([filed({ wants: [SEND, DRAFTS] })]);
  const view = draw(<AccessRequestsSection app="composio-gmail" />);
  const row = within(
    (
      await view.findByText("Give Expenses more of Gmail: Send a new email")
    ).closest("[data-request]") as HTMLElement,
  );
  // The same paragraph says who asked and when, so the note is read inside it.
  expect(
    row.getByText(/Approving gives Expenses exactly these tools/).textContent,
  ).toContain(
    "Approving gives Expenses exactly these tools and nothing else: GMAIL_SEND_EMAIL (changes something), GMAIL_LIST_DRAFTS (read-only).",
  );
  // The old note sends the administrator to a page to choose; this one has already said what.
  expect(row.queryByRole("link")).toBeNull();
  expect(row.queryByText(/only Gmail's read-only actions/)).toBeNull();
});

test("Approve on it sends the named tools, so the press gives what was read and nothing added since", async () => {
  const sent = servingInbox([filed({ wants: [SEND, REPLY] })]);
  const view = draw(<AccessRequestsSection app="composio-gmail" />);
  fireEvent.click(await view.findByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(sent.find((call) => call.url.endsWith("/approve"))).toEqual({
      method: "POST",
      url: "/api/plugins/access-requests/req_1/approve",
      body: { refs: [SEND.ref, REPLY.ref] },
    }),
  );
});

test("a request for the app itself reads and approves as it always did, with no tools named", async () => {
  const sent = servingInbox([filed()]);
  const view = draw(<AccessRequestsSection app="composio-gmail" />);
  expect(await view.findByText("Give Gmail to Expenses")).toBeTruthy();
  expect(
    view.getByText(/Approving gives Expenses only Gmail's read-only actions/),
  ).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Approve" }));
  const approve = await waitFor(() => {
    const call = sent.find((each) => each.url.endsWith("/approve"));
    if (!call) throw new Error("not approved yet");
    return call;
  });
  expect(approve.method).toBe("POST");
  expect(approve.url).toBe("/api/plugins/access-requests/req_1/approve");
  // No tools named: the server gives the Bot the app's read-only ones, as it always did.
  expect(approve.body).toBeUndefined();
});
