import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecretConnectionPage } from "@/components/connections/secret-connection-page";
import { settleReactWork } from "./settle-react-work";

/**
 * The form the chat's button opens (docs/design/connect-from-chat.md): it says which member will use
 * the mailbox, sends only that member's id beside what the person typed, and the person's own steps
 * are the button, the app password and Connect.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const KEY = "google-imap";
const PATH = `/api/plugins/servers/${KEY}/secret-connection`;
const originalFetch = global.fetch;
let posts: Record<string, unknown>[];

afterEach(() => {
  global.fetch = originalFetch;
});

function renderPage(bot?: string, eligible = true) {
  posts = [];
  global.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === PATH && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({ connected: true });
      }
      if (path.startsWith(PATH))
        return Response.json({
          connected: false,
          ...(path.includes("?bot=") ? { botEligible: eligible } : {}),
        });
      if (path.startsWith("/api/agents"))
        return Response.json({ agents: [{ id: "inbox", name: "Otto" }] });
      return new Response(null, { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  );
  const root = createRootRoute({
    component: () => (
      <SecretConnectionPage
        back={{ label: "Connections", linkProps: { to: "/connections" } }}
        bot={bot}
        enabled
        entry={{ key: KEY, title: "Gmail", summary: "Mail." }}
      />
    ),
  });
  const connections = createRoute({
    path: "/connections",
    getParentRoute: () => root,
    component: Outlet,
  });
  const router = createRouter({
    routeTree: root.addChildren([connections]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("names the member that will use the mailbox", async () => {
  const view = renderPage("inbox");
  expect(await view.findByText("Otto will use this mailbox.")).toBeTruthy();
});

test("without a member the form says nothing about one", async () => {
  const view = renderPage();
  await view.findByLabelText("Your Gmail address");
  expect(document.querySelector("[data-connect-member]")).toBeNull();
});

test("connecting sends the member's id with what was typed, and says who can read the mail", async () => {
  const view = renderPage("inbox");
  const user = userEvent.setup({ document });
  await user.type(
    await view.findByLabelText("Your Gmail address"),
    "maya@example.com",
  );
  await user.type(view.getByLabelText("App password"), "qwertyuiopasdfgh");
  await user.click(view.getByRole("button", { name: "Connect" }));
  expect(
    await view.findByText(/Connected\. Otto can now read your mail/),
  ).toBeTruthy();
  expect(posts).toEqual([
    {
      address: "maya@example.com",
      appPassword: "qwertyuiopasdfgh",
      calendarUrl: "",
      botId: "inbox",
    },
  ]);
});

test("without a member the request carries no member", async () => {
  const view = renderPage();
  const user = userEvent.setup({ document });
  await user.type(
    await view.findByLabelText("Your Gmail address"),
    "maya@example.com",
  );
  await user.type(view.getByLabelText("App password"), "qwertyuiopasdfgh");
  await user.click(view.getByRole("button", { name: "Connect" }));
  await view.findByText(/Connected\. Bots you allow/);
  expect(posts[0]).not.toHaveProperty("botId");
});

test("a member the server does not accept is not named and not sent", async () => {
  const view = renderPage("someone-elses-bot", false);
  const user = userEvent.setup({ document });
  await user.type(
    await view.findByLabelText("Your Gmail address"),
    "maya@example.com",
  );
  expect(document.querySelector("[data-connect-member]")).toBeNull();
  await user.type(view.getByLabelText("App password"), "qwertyuiopasdfgh");
  await user.click(view.getByRole("button", { name: "Connect" }));
  await view.findByText(/Connected\. Bots you allow/);
  expect(posts[0]).not.toHaveProperty("botId");
});
