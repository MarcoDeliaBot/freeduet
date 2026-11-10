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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  APP_PASSWORDS_URL,
  CALENDAR_HELP_URL,
  SecretConnectionPage,
} from "@/components/connections/secret-connection-page";
import { settleReactWork } from "./settle-react-work";

/**
 * The page where a person pastes their Gmail address, an app password and, if they like, their
 * calendar's secret address.
 *
 * WHAT IS PINNED IS WHAT THE PAGE DOES WITH THE SECRETS. The password and the calendar address are
 * credentials from the moment they are typed, so the page draws them as password inputs, sends them
 * once, and keeps none of them: not in the document after a save, not in the query cache, not in the
 * mutation the request ran as. A refusal leaves the person's typing where it was so a typo can be
 * corrected, and says what the server said, which is fixed text that never repeats what was sent.
 *
 * THE HARNESS IS `held-account-disconnect.test.tsx`'s: a memory router so the page's back link has
 * somewhere to point, a real query client, and `fetch` replaced with a recorder.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const KEY = "google-imap";
const STATUS_PATH = `/api/plugins/servers/${KEY}/secret-connection`;

/** Made-up values. The address is on a reserved domain, the password is not a real one. */
const ADDRESS = "maya@example.com";
const PASSWORD = "qwerty uiop asdf ghjk";
const CALENDAR =
  "https://calendar.google.com/calendar/ical/maya%40example.com/private-0123456789abcdef/basic.ics";

const originalFetch = global.fetch;
let connected: { address: string; calendar: boolean } | null;
let posts: { path: string; body: Record<string, unknown> }[];
let answerPost: () => Response;
let queryClient: QueryClient;

beforeEach(() => {
  connected = null;
  posts = [];
  answerPost = () => Response.json({ connected: true });
  global.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === STATUS_PATH && init?.method === "POST") {
        posts.push({
          path,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        const response = answerPost();
        if (response.ok) connected = { address: ADDRESS, calendar: true };
        return response;
      }
      if (path === STATUS_PATH) {
        return Response.json(
          connected
            ? {
                connected: true,
                connectedAt: "2026-10-20T09:00:00Z",
                ...connected,
              }
            : { connected: false },
        );
      }
      return new Response(null, { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

const entry = {
  key: KEY,
  title: "Gmail and Google Calendar (app password)",
  summary: "Mail and calendar of whoever is asking, with an app password.",
};

function renderPage(enabled = true) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <SecretConnectionPage
        back={{ label: "Connections", linkProps: { to: "/connections" } }}
        enabled={enabled}
        entry={entry}
      />
    ),
  });
  const connections = createRoute({
    path: "/connections",
    getParentRoute: () => rootRoute,
    component: Outlet,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([connections]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

type View = ReturnType<typeof renderPage>;

async function fill(view: View, user: ReturnType<typeof userEvent.setup>) {
  await user.type(await view.findByLabelText("Your Gmail address"), ADDRESS);
  await user.type(view.getByLabelText("App password"), PASSWORD);
  await user.type(
    view.getByLabelText("Calendar secret address (optional)"),
    CALENDAR,
  );
}

test("the form asks for the three things, draws both secrets as password boxes, and links Google's two pages", async () => {
  const view = renderPage();

  const address = await view.findByLabelText("Your Gmail address");
  const password = view.getByLabelText("App password");
  const calendar = view.getByLabelText("Calendar secret address (optional)");

  expect(address.getAttribute("type")).toBe("email");
  // The two secrets are never drawn in the clear, and the browser is told not to offer to keep them.
  expect(password.getAttribute("type")).toBe("password");
  expect(calendar.getAttribute("type")).toBe("password");
  expect(password.getAttribute("autocomplete")).toBe("new-password");

  const hrefs = Array.from(document.querySelectorAll("a")).map((link) =>
    link.getAttribute("href"),
  );
  expect(hrefs).toContain(APP_PASSWORDS_URL);
  expect(hrefs).toContain(CALENDAR_HELP_URL);
  // Two short instructions, and they say 2-Step Verification is needed first.
  expect(document.body.textContent).toContain("2-Step Verification");
  expect(view.getByRole("button", { name: "Connect" })).toBeTruthy();
});

test("saving sends the three values once to the app's own address and then keeps none of them", async () => {
  const view = renderPage();
  const user = userEvent.setup({ document });
  await fill(view, user);
  await user.click(view.getByRole("button", { name: "Connect" }));

  expect(
    await view.findByText(/Connected\. Bots you allow can now read your mail/),
  ).toBeTruthy();

  expect(posts).toHaveLength(1);
  expect(posts[0]?.body).toEqual({
    address: ADDRESS,
    appPassword: PASSWORD,
    calendarUrl: CALENDAR,
  });

  // The form is gone, so nothing typed is left in the document ...
  await waitFor(() =>
    expect(document.querySelectorAll("input[type=password]")).toHaveLength(0),
  );
  expect(document.body.textContent).not.toContain(PASSWORD);
  expect(document.body.textContent).not.toContain(CALENDAR);
  for (const input of Array.from(document.querySelectorAll("input"))) {
    expect(input.value).not.toContain("qwerty");
    expect(input.value).not.toContain("private-0123456789abcdef");
  }
  // ... and the page now reads back the address alone.
  expect(await view.findByText(/Connected as maya@example\.com/)).toBeTruthy();
  expect(document.body.textContent).toContain("Your calendar is connected too");
});

test("the request's variables are erased once it has been sent, and no secret is left in any cache", async () => {
  const view = renderPage();
  const user = userEvent.setup({ document });
  await fill(view, user);
  await user.click(view.getByRole("button", { name: "Connect" }));
  await view.findByText(/Connected\. Bots you allow can now read your mail/);

  // `gcTime: 0` drops the mutation itself; whatever is still held must not carry a secret.
  const held = JSON.stringify(
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state.variables ?? null),
  );
  expect(held).not.toContain("qwerty");
  expect(held).not.toContain("private-0123456789abcdef");

  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  );
  expect(cached).not.toContain("qwerty");
  expect(cached).not.toContain("private-0123456789abcdef");
  expect(cached).not.toContain("appPassword");
});

test("a refusal shows the server's sentence, keeps the typing for a correction, and says nothing was saved", async () => {
  answerPost = () =>
    Response.json(
      {
        error:
          "Gmail did not accept that address and app password. Nothing was saved.",
      },
      { status: 422 },
    );
  const view = renderPage();
  const user = userEvent.setup({ document });
  await fill(view, user);
  await user.click(view.getByRole("button", { name: "Connect" }));

  const alert = await view.findByRole("alert");
  expect(alert.textContent).toBe(
    "Gmail did not accept that address and app password. Nothing was saved.",
  );
  // The sentence does not repeat anything the person sent.
  expect(alert.textContent).not.toContain("qwerty");
  expect(alert.textContent).not.toContain(ADDRESS);

  // The form is still open, with what was typed still there to be corrected.
  expect((view.getByLabelText("App password") as HTMLInputElement).value).toBe(
    PASSWORD,
  );
  expect(
    (view.getByLabelText("Your Gmail address") as HTMLInputElement).value,
  ).toBe(ADDRESS);
  expect(connected).toBeNull();
  expect(view.queryByText(/Connected as/)).toBeNull();
});

test("a connected person sees their address and whether a calendar is attached, never a secret", async () => {
  connected = { address: ADDRESS, calendar: false };
  const view = renderPage();

  expect(await view.findByText(/Connected as maya@example\.com/)).toBeTruthy();
  expect(document.body.textContent).toContain("No calendar is connected");
  // No form while connected: nothing to type into, nothing to read back.
  expect(document.querySelectorAll("input")).toHaveLength(0);
  expect(await view.findByRole("button", { name: /Connected/ })).toBeTruthy();
});

test("an app an administrator has not turned on draws no form and asks nothing of the server", async () => {
  const view = renderPage(false);

  expect(
    await view.findByText(/An admin has to turn this on first/),
  ).toBeTruthy();
  expect(document.querySelectorAll("input")).toHaveLength(0);
  expect(view.queryByRole("button", { name: "Connect" })).toBeNull();
  expect(posts).toHaveLength(0);
});
