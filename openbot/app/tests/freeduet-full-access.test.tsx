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
import { FreeDuetFullAccess } from "@/freeduet/full-access-section";
import { settleReactWork } from "./settle-react-work";

/**
 * Settings → Approval rules → Full access: off by default, one warning and a confirm to turn on, and
 * an immediate off (docs/FULL_ACCESS.md).
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
const sent: { path: string; method: string; body: unknown }[] = [];
let state: {
  bots: Record<string, { since: string }>;
  recent: {
    at: string;
    bot: string;
    tool: string;
    effect: string;
    scope: string;
  }[];
};

const agent = (id: string, name: string, over: object = {}) => ({
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
  ...over,
});

beforeEach(() => {
  sent.length = 0;
  state = { bots: {}, recent: [] };
  global.fetch = Object.assign(
    async (path: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(path);
      if (init?.method && init.method !== "GET") {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        sent.push({ path: url, method: init.method, body });
        const id = decodeURIComponent(url.split("/").pop() ?? "");
        if (body?.enabled) state.bots[id] = { since: "2026-11-14T10:00:00Z" };
        else delete state.bots[id];
        return Response.json({ bots: state.bots });
      }
      if (url === "/api/approvals/full-access") return Response.json(state);
      if (url.startsWith("/api/agents"))
        return Response.json({
          agents: [
            agent("jules", "Jules"),
            agent("otto", "Otto"),
            agent("secret", "Secret", { hidden: true }),
          ],
        });
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
      <FreeDuetFullAccess />
    </QueryClientProvider>,
  );
}

test("it is off for every member, and says the default is the safe one", async () => {
  const view = draw();
  await view.findByText("Jules");
  expect(
    view.getByText(/Safe by default: your Bots ask before they send, pay/),
  ).toBeTruthy();
  for (const name of ["Jules", "Otto"])
    expect(
      view
        .getByRole("switch", { name: `Full access for ${name}` })
        .getAttribute("aria-checked"),
    ).toBe("false");
  expect(view.queryByText("Secret")).toBeNull();
  expect(view.queryByText("Done without asking")).toBeNull();
});

test("turning it on shows one warning and sends nothing until it is confirmed", async () => {
  const view = draw();
  await view.findByText("Jules");
  const user = userEvent.setup({ document });
  await user.click(view.getByRole("switch", { name: "Full access for Jules" }));
  const warning = await view.findByText(
    /Jules will send, pay, sign, book and delete without asking you first/,
  );
  expect(warning).toBeTruthy();
  expect(sent).toEqual([]);

  // Cancel: nothing was saved, and the switch is still off.
  await user.click(view.getByRole("button", { name: "Cancel" }));
  expect(view.queryByText(/Give Jules Full access\?/)).toBeNull();
  expect(sent).toEqual([]);

  await user.click(view.getByRole("switch", { name: "Full access for Jules" }));
  await user.click(
    await view.findByRole("button", { name: "Give Full access" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        path: "/api/approvals/full-access/jules",
        method: "PUT",
        body: { enabled: true, confirm: true },
      },
    ]),
  );
  await waitFor(() =>
    expect(
      view
        .getByRole("switch", { name: "Full access for Jules" })
        .getAttribute("aria-checked"),
    ).toBe("true"),
  );
  // Only Jules: Otto is as he was.
  expect(
    view
      .getByRole("switch", { name: "Full access for Otto" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});

test("turning it off is immediate, with no warning", async () => {
  state.bots = { jules: { since: "2026-11-14T10:00:00Z" } };
  const view = draw();
  await view.findByText("Jules");
  const user = userEvent.setup({ document });
  await user.click(
    await view.findByRole("switch", { name: "Full access for Jules" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        path: "/api/approvals/full-access/jules",
        method: "PUT",
        body: { enabled: false },
      },
    ]),
  );
  expect(view.queryByRole("button", { name: "Give Full access" })).toBeNull();
});

test("what a Bot did without asking is listed for the person", async () => {
  state = {
    bots: { jules: { since: "2026-11-14T10:00:00Z" } },
    recent: [
      {
        at: "2026-11-14T10:05:00Z",
        bot: "jules",
        tool: "computer_click",
        effect: "write",
        scope: "hotel.example",
      },
    ],
  };
  const view = draw();
  await view.findByText("Done without asking");
  expect(view.getByText("Jules: computer_click")).toBeTruthy();
});
