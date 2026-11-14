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
 * Settings → Approval rules → Full access: three choices for each Bot (off, Full access without
 * payments, Full access), off by default. Raising a Bot's choice shows one warning and a confirm;
 * lowering it, or turning it off, is immediate (docs/FULL_ACCESS.md).
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
  bots: Record<string, { since: string; mode?: "full" | "no_payments" }>;
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

const SINCE = "2026-11-14T10:00:00Z";

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
        if (body?.enabled)
          state.bots[id] = { since: SINCE, mode: body.mode ?? "full" };
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

type View = ReturnType<typeof draw>;
const CHOICES = ["Off", "Full access without payments", "Full access"] as const;
/** Which of a Bot's three choices is selected, by name. */
const selected = (view: View, name: string) =>
  CHOICES.filter(
    (choice) =>
      (
        view.getByRole("radio", {
          name: `${choice} for ${name}`,
        }) as HTMLInputElement
      ).checked,
  );
const radio = (view: View, choice: (typeof CHOICES)[number], name: string) =>
  view.getByRole("radio", { name: `${choice} for ${name}` });

test("it is off for every member, and says the default is the safe one", async () => {
  const view = draw();
  await view.findByText("Jules");
  expect(
    view.getByText(/Safe by default: your Bots ask before they send, pay/),
  ).toBeTruthy();
  for (const name of ["Jules", "Otto"])
    expect(selected(view, name)).toEqual(["Off"]);
  expect(view.queryByText("Secret")).toBeNull();
  expect(view.queryByText("Done without asking")).toBeNull();
});

test("the three choices are plainly worded, and the page says what each one lets a Bot do", async () => {
  const view = draw();
  await view.findByText("Jules");
  for (const name of ["Jules", "Otto"])
    for (const choice of CHOICES)
      expect(radio(view, choice, name).getAttribute("type")).toBe("radio");
  expect(
    view.getByText(/it sends, signs, books and deletes without asking\./),
  ).toBeTruthy();
  expect(view.getByText(/Payments and purchases still ask you\./)).toBeTruthy();
  expect(
    view.getByText(
      /There is no limit on the amount until spending caps exist \(planned for v0\.4\)\./,
    ),
  ).toBeTruthy();
  // Each Bot's own line says what it does now: both are off.
  expect(
    view.getAllByText("Asks before it sends, pays, signs, books or deletes."),
  ).toHaveLength(2);
});

test("Full access shows one warning that says there is no limit on the amount, and sends nothing until it is confirmed", async () => {
  const view = draw();
  await view.findByText("Jules");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Full access", "Jules"));
  expect(
    await view.findByText(
      /Jules will send, pay, sign, book and delete without asking you first/,
    ),
  ).toBeTruthy();
  expect(
    view.getByText(
      /There is no limit on the amount it can pay: spending caps do not exist yet \(they are planned for v0\.4\)/,
    ),
  ).toBeTruthy();
  expect(sent).toEqual([]);
  // The choice that is selected is still the saved one, until the person confirms.
  expect(selected(view, "Jules")).toEqual(["Off"]);

  // Cancel: nothing was saved, and the Bot is still off.
  await user.click(view.getByRole("button", { name: "Cancel" }));
  expect(view.queryByText(/Give Jules Full access\?/)).toBeNull();
  expect(sent).toEqual([]);
  expect(selected(view, "Jules")).toEqual(["Off"]);

  await user.click(radio(view, "Full access", "Jules"));
  await user.click(
    await view.findByRole("button", { name: "Give Full access" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        path: "/api/approvals/full-access/jules",
        method: "PUT",
        body: { enabled: true, mode: "full", confirm: true },
      },
    ]),
  );
  await waitFor(() => expect(selected(view, "Jules")).toEqual(["Full access"]));
  expect(
    view.getByText(
      "Acts without asking, payments included, with no limit on the amount. Since",
      { exact: false },
    ),
  ).toBeTruthy();
  // Only Jules: Otto is as he was.
  expect(selected(view, "Otto")).toEqual(["Off"]);
});

test("Full access without payments shows one confirmation that says payments still ask, and sends the setting", async () => {
  const view = draw();
  await view.findByText("Jules");
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Full access without payments", "Jules"));
  expect(
    await view.findByText(
      /Jules will send, sign, book and delete without asking you first\. Payments and purchases still ask you\./,
    ),
  ).toBeTruthy();
  // The warning about the amount belongs to Full access, not to this one.
  expect(
    view.queryByText(/There is no limit on the amount it can pay/),
  ).toBeNull();
  expect(sent).toEqual([]);
  expect(selected(view, "Jules")).toEqual(["Off"]);

  await user.click(
    view.getByRole("button", { name: "Give Full access without payments" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        path: "/api/approvals/full-access/jules",
        method: "PUT",
        body: { enabled: true, mode: "no_payments", confirm: true },
      },
    ]),
  );
  await waitFor(() =>
    expect(selected(view, "Jules")).toEqual(["Full access without payments"]),
  );
  expect(
    view.getByText(
      "Acts without asking, except that payments and purchases still ask you. Since",
      { exact: false },
    ),
  ).toBeTruthy();
  expect(selected(view, "Otto")).toEqual(["Off"]);
});

test("going from Full access without payments to Full access shows the warning again", async () => {
  state.bots = { jules: { since: SINCE, mode: "no_payments" } };
  const view = draw();
  await view.findByText("Jules");
  await waitFor(() =>
    expect(selected(view, "Jules")).toEqual(["Full access without payments"]),
  );
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Full access", "Jules"));
  expect(
    await view.findByText(/There is no limit on the amount it can pay/),
  ).toBeTruthy();
  expect(sent).toEqual([]);
  expect(selected(view, "Jules")).toEqual(["Full access without payments"]);
  await user.click(
    await view.findByRole("button", { name: "Give Full access" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        path: "/api/approvals/full-access/jules",
        method: "PUT",
        body: { enabled: true, mode: "full", confirm: true },
      },
    ]),
  );
  await waitFor(() => expect(selected(view, "Jules")).toEqual(["Full access"]));
});

test("going down from Full access to Full access without payments needs no warning and is immediate", async () => {
  state.bots = { jules: { since: SINCE, mode: "full" } };
  const view = draw();
  await view.findByText("Jules");
  await waitFor(() => expect(selected(view, "Jules")).toEqual(["Full access"]));
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Full access without payments", "Jules"));
  await waitFor(() =>
    expect(sent).toEqual([
      {
        path: "/api/approvals/full-access/jules",
        method: "PUT",
        body: { enabled: true, mode: "no_payments" },
      },
    ]),
  );
  expect(view.queryByRole("button", { name: /^Give / })).toBeNull();
  await waitFor(() =>
    expect(selected(view, "Jules")).toEqual(["Full access without payments"]),
  );
});

test("turning it off is immediate, from either setting, with no warning", async () => {
  for (const mode of ["full", "no_payments"] as const) {
    sent.length = 0;
    state.bots = { jules: { since: SINCE, mode } };
    const view = draw();
    await view.findByText("Jules");
    await waitFor(() =>
      expect(selected(view, "Jules")).toEqual([
        mode === "full" ? "Full access" : "Full access without payments",
      ]),
    );
    const user = userEvent.setup({ document });
    await user.click(radio(view, "Off", "Jules"));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          path: "/api/approvals/full-access/jules",
          method: "PUT",
          body: { enabled: false },
        },
      ]),
    );
    expect(view.queryByRole("button", { name: /^Give / })).toBeNull();
    await waitFor(() => expect(selected(view, "Jules")).toEqual(["Off"]));
    cleanup();
  }
});

test("a server that does not name the setting is read as Full access, the one it always was", async () => {
  state.bots = { jules: { since: SINCE } };
  const view = draw();
  await view.findByText("Jules");
  await waitFor(() => expect(selected(view, "Jules")).toEqual(["Full access"]));
});

test("a question about one Bot is replaced by a choice for another, and dropped by a lowering", async () => {
  state.bots = { otto: { since: SINCE, mode: "full" } };
  const view = draw();
  await view.findByText("Jules");
  await waitFor(() => expect(selected(view, "Otto")).toEqual(["Full access"]));
  const user = userEvent.setup({ document });
  await user.click(radio(view, "Full access", "Jules"));
  expect(await view.findByText(/Give Jules Full access\?/)).toBeTruthy();
  await user.click(radio(view, "Full access without payments", "Jules"));
  expect(
    await view.findByText(/Give Jules Full access without payments\?/),
  ).toBeTruthy();
  expect(view.queryByText(/Give Jules Full access\?/)).toBeNull();
  // Lowering Otto is not a question, and it takes the open one away: it was about something else.
  await user.click(radio(view, "Off", "Otto"));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(
    view.queryByText(/Give Jules Full access without payments\?/),
  ).toBeNull();
  expect(sent[0]).toEqual({
    path: "/api/approvals/full-access/otto",
    method: "PUT",
    body: { enabled: false },
  });
});

test("what a Bot did without asking is listed for the person", async () => {
  state = {
    bots: { jules: { since: SINCE, mode: "no_payments" } },
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
