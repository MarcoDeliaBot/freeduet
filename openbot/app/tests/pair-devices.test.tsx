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
import { RemoteSessionNotice } from "@/components/channels/remote-session-notice";
import {
  PairDevicesSection,
  PairedBrowsers,
  PairThisBrowser,
} from "@/components/settings/pair-devices";
import { authKeys, type AuthenticatedUser } from "@/lib/auth/queries";
import {
  isLocalAddress,
  pairingLink,
  takeCodeFromAddress,
  whenWords,
} from "@/lib/pairings";
import { settleReactWork } from "./settle-react-work";

/*
 * Pairing a phone or another browser from Settings (docs/M1_PLAN.md D49). The server decides who may see and make what;
 * these tests hold what the page does with its answers, and that the code never travels in an address.
 */

const NativeResponse = globalThis.Response;
const originalFetch = globalThis.fetch;

type Call = { method: string; url: string; body: unknown };
let calls: Call[];
/** What the fake server answers, by "METHOD /path". */
let routes: Record<string, () => Response>;

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost:3010/settings" });
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        "http://localhost:3010",
      );
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url: `${url.pathname}${url.search}`,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const answer = routes[`${method} ${url.pathname}`];
      return answer ? answer() : new NativeResponse("{}", { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});
beforeEach(() => {
  calls = [];
  routes = {};
  window.history.replaceState(null, "", "/settings");
});
afterEach(cleanup);

const json = (body: unknown, status = 200) =>
  new NativeResponse(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mounted(ui: React.ReactElement, remote?: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (remote !== undefined)
    queryClient.setQueryData(authKeys.currentUser(), {
      id: "person-1",
      email: "person@example.test",
      role: "admin",
      onboarding: null,
      remote,
    } satisfies AuthenticatedUser);
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const NOW = "2026-11-16T10:00:00.000Z";
const LIST = {
  canPair: true,
  pairings: [
    {
      id: "p-1",
      label: "Chrome on this computer",
      kind: "computer",
      createdAt: NOW,
      lastSeenAt: NOW,
      current: true,
    },
    {
      id: "p-2",
      label: "Phone",
      kind: "device",
      createdAt: NOW,
      lastSeenAt: NOW,
      current: false,
    },
  ],
};

test("the remote notice says a phone is paired from Settings on the computer, and keeps the command", () => {
  const view = mounted(<RemoteSessionNotice remote />);
  expect(
    view.getByText(/open Settings in a browser that is already paired/),
  ).toBeDefined();
  expect(view.getByText("bash scripts/open.sh")).toBeDefined();
  view.unmount();
  expect(
    mounted(<RemoteSessionNotice remote={false} />).container.textContent,
  ).toBe("");
});

test("a browser that is not paired is shown the other end: a code to type, no list and no button to make one", async () => {
  const view = mounted(<PairDevicesSection />, true);
  expect(view.getByText("Pair this browser", { selector: "h2" })).toBeDefined();
  expect(view.queryByText("Make a code")).toBeNull();
  await settleReactWork();
  // It asked for nothing: a remote session is refused the list, so it does not ask.
  expect(calls).toEqual([]);
});

test("a code typed is sent once, in the body of a POST and not in an address, with the name given", async () => {
  routes["POST /api/pairings/redeem"] = () => json({ pairing: { id: "p-9" } });
  const view = mounted(<PairThisBrowser />, true);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.type(view.getByLabelText("Code"), "abcde-fghjk");
  await user.type(view.getByLabelText("Name"), "Maya's phone");
  await user.click(view.getByRole("button", { name: "Pair this browser" }));
  await waitFor(() =>
    expect(
      view.getByText("This browser is paired with the computer."),
    ).toBeDefined(),
  );
  expect(calls).toEqual([
    {
      method: "POST",
      url: "/api/pairings/redeem",
      body: { code: "abcde-fghjk", label: "Maya's phone" },
    },
  ]);
});

test("a code in the link is taken out of the address bar at once, and nothing is sent until the button is pressed", async () => {
  routes["POST /api/pairings/redeem"] = () => json({ pairing: { id: "p-9" } });
  window.history.replaceState(null, "", "/settings#pair=ABCDEFGHJK");
  expect(window.location.hash).toBe("#pair=ABCDEFGHJK");
  const view = mounted(<PairThisBrowser />, true);
  await settleReactWork();
  expect(window.location.hash).toBe("");
  expect(window.location.href).toBe("http://localhost:3010/settings");
  expect((view.getByLabelText("Code") as HTMLInputElement).value).toBe(
    "ABCDEFGHJK",
  );
  expect(calls).toEqual([]);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.click(view.getByRole("button", { name: "Pair this browser" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]?.url).toBe("/api/pairings/redeem");
  expect(calls.map((call) => call.url).join()).not.toContain("ABCDEFGHJK");
});

test("a refused code shows the server's sentence and leaves the page as it was", async () => {
  routes["POST /api/pairings/redeem"] = () =>
    json(
      {
        error:
          "That code is not right, or it has run out. Make a new one on the computer.",
      },
      400,
    );
  const view = mounted(<PairThisBrowser />, true);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.type(view.getByLabelText("Code"), "WRONG");
  await user.click(view.getByRole("button", { name: "Pair this browser" }));
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain("not right"),
  );
  expect(
    view.queryByText("This browser is paired with the computer."),
  ).toBeNull();
});

test("the browser at the computer lists every pairing with its kind and a Revoke, and Revoke asks the server", async () => {
  routes["GET /api/pairings"] = () => json(LIST);
  routes["DELETE /api/pairings/p-2"] = () => json({ revoked: true });
  const view = mounted(<PairedBrowsers />, false);
  await waitFor(() => expect(view.getByText("Phone")).toBeDefined());
  expect(
    view.getByText(/Chrome on this computer \(this browser\)/),
  ).toBeDefined();
  expect(view.getByText(/Computer · made/)).toBeDefined();
  expect(view.getByText(/Phone or other browser · made/)).toBeDefined();
  expect(view.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.click(
    view.getAllByRole("button", { name: "Revoke" })[1] as HTMLElement,
  );
  await waitFor(() =>
    expect(calls.some((call) => call.method === "DELETE")).toBe(true),
  );
  expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
    "/api/pairings/p-2",
  );
});

test("Make a code shows the code, the link with the code in its fragment, a QR code drawn in the page, and the time left", async () => {
  routes["GET /api/pairings"] = () =>
    json({ ...LIST, appUrl: "https://duet.example.test" });
  routes["POST /api/pairings/code"] = () =>
    json({
      code: "ABCDE-FGHJK",
      expiresInSeconds: 120,
      link: "https://duet.example.test/settings#pair=ABCDEFGHJK",
    });
  const view = mounted(<PairedBrowsers />, false);
  await waitFor(() =>
    expect(view.getByRole("button", { name: "Make a code" })).toBeDefined(),
  );
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.click(view.getByRole("button", { name: "Make a code" }));
  await waitFor(() => expect(view.getByText("ABCDE-FGHJK")).toBeDefined());
  expect(
    view.getByText("https://duet.example.test/settings#pair=ABCDEFGHJK"),
  ).toBeDefined();
  const qr = view.getByRole("img", { name: "QR code with the pairing link" });
  expect(qr.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(
    100,
  );
  expect(view.getByText(/runs out in/)).toBeDefined();
  expect(view.queryByText(/only works on this computer/)).toBeNull();
});

test("without a configured address the link is built from this page's, and a local one says a phone cannot use it", async () => {
  routes["GET /api/pairings"] = () => json(LIST);
  routes["POST /api/pairings/code"] = () =>
    json({ code: "ABCDE-FGHJK", expiresInSeconds: 120 });
  const view = mounted(<PairedBrowsers />, false);
  await waitFor(() =>
    expect(view.getByRole("button", { name: "Make a code" })).toBeDefined(),
  );
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.click(view.getByRole("button", { name: "Make a code" }));
  await waitFor(() =>
    expect(
      view.getByText("http://localhost:3010/settings#pair=ABCDEFGHJK"),
    ).toBeDefined(),
  );
  expect(view.getByRole("note").textContent).toContain(
    "only works on this computer",
  );
});

test("a device sees the list, cannot make a code, and may revoke only itself", async () => {
  routes["GET /api/pairings"] = () =>
    json({
      canPair: false,
      pairings: [
        { ...LIST.pairings[0], current: false },
        { ...LIST.pairings[1], current: true },
      ],
    });
  const view = mounted(<PairedBrowsers />, false);
  await waitFor(() =>
    expect(view.getByText(/Phone \(this browser\)/)).toBeDefined(),
  );
  expect(view.queryByRole("button", { name: "Make a code" })).toBeNull();
  expect(view.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
});

test("where the server has nothing to show (403 or 404) the section draws nothing", async () => {
  for (const status of [403, 404]) {
    routes["GET /api/pairings"] = () => json({ error: "no" }, status);
    const view = mounted(<PairedBrowsers />, false);
    await settleReactWork();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(view.container.textContent).toBe("");
    view.unmount();
    calls = [];
  }
});

test("a rename sends the new name", async () => {
  routes["GET /api/pairings"] = () => json(LIST);
  routes["PATCH /api/pairings/p-2"] = () => json({ renamed: true });
  const view = mounted(<PairedBrowsers />, false);
  await waitFor(() => expect(view.getByText("Phone")).toBeDefined());
  const user = userEvent.setup({ document: view.container.ownerDocument });
  await user.click(
    view.getAllByRole("button", { name: "Rename" })[1] as HTMLElement,
  );
  const field = view.getByLabelText("Name");
  await user.clear(field);
  await user.type(field, "Tablet");
  await user.click(view.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(calls.some((call) => call.method === "PATCH")).toBe(true),
  );
  expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
    label: "Tablet",
  });
});

test("the words and the link: the code goes in the fragment, a local address is known, and the time is in plain words", () => {
  expect(pairingLink("https://duet.example.test/", "ABCDE-FGHJK")).toBe(
    "https://duet.example.test/settings#pair=ABCDEFGHJK",
  );
  expect(
    pairingLink("https://duet.example.test/", "ABCDE-FGHJK"),
  ).not.toContain("?");
  for (const local of [
    "http://localhost:3010",
    "http://127.0.0.1:3010",
    "http://[::1]:3010",
  ])
    expect(isLocalAddress(local)).toBe(true);
  expect(isLocalAddress("https://duet.example.test")).toBe(false);
  const now = Date.parse(NOW);
  expect(whenWords(NOW, now)).toBe("just now");
  expect(whenWords(NOW, now + 5 * 60_000)).toBe("5 min ago");
  expect(whenWords(NOW, now + 3 * 3_600_000)).toBe("3 h ago");
  expect(whenWords(NOW, now + 2 * 86_400_000)).toBe("2 d ago");
  expect(whenWords("not a date", now)).toBe("never");
});

test("takeCodeFromAddress rewrites the address before it returns, and takes nothing else from a fragment", () => {
  const seen: string[] = [];
  const fake = (hash: string) => ({
    location: { hash, pathname: "/settings", search: "?a=1" },
    history: {
      replaceState: (_s: unknown, _t: string, url: string) =>
        void seen.push(url),
    },
  });
  expect(takeCodeFromAddress(fake("#pair=ABCDEFGHJK"))).toBe("ABCDEFGHJK");
  expect(seen).toEqual(["/settings?a=1"]);
  for (const hash of [
    "",
    "#other=1",
    "#pair=",
    "#pair=a b",
    "#pair=<script>",
    `#pair=${"A".repeat(60)}`,
  ])
    expect(takeCodeFromAddress(fake(hash))).toBeNull();
  expect(seen).toHaveLength(1);
});
