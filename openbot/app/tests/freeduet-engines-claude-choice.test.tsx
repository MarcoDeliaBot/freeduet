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
  ClaudeChoice,
  EnginesReading,
  MemberSummary,
} from "@/freeduet/engines-text";
import { settleReactWork } from "./settle-react-work";

/**
 * D139: on a member's row, two small selects (Model, Effort) beside the Claude Code engine and nowhere else. A choice goes out
 * as one PUT with the two words (or null for the subscription's default), and the page reads the list again.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
const sent: { method: string; path: string; body: unknown }[] = [];
let members: MemberSummary[];
let canChange = true;
let refuse = false;

const row = (over: Partial<MemberSummary> & { id: string }): MemberSummary => ({
  chain: ["claude-code"],
  leftOut: [],
  mode: "automatic",
  fileMode: "automatic",
  chosen: false,
  pin: null,
  ownOrder: false,
  recommendedChain: over.chain ?? ["claude-code"],
  claude: { model: null, effort: null },
  ...over,
});

beforeEach(() => {
  sent.length = 0;
  canChange = true;
  refuse = false;
  members = [
    row({ id: "iris" }),
    row({ id: "leo", chain: ["codex"], claude: undefined }),
  ];
  global.fetch = Object.assign(
    async (path: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? "GET";
      if (url === "/api/freeduet/engines" && method === "GET")
        return Response.json({
          reason: null,
          engines: [
            {
              id: "claude-code",
              name: "Claude Code",
              kind: "cli",
              state: "ready",
              until: null,
              refusal: null,
            },
            {
              id: "codex",
              name: "Codex",
              kind: "cli",
              state: "ready",
              until: null,
              refusal: null,
            },
          ],
          members,
          choices: { state: "ok" },
          canChange,
          cannotChange: canChange ? null : "not_at_the_computer",
        } satisfies EnginesReading);
      if (url.startsWith("/api/agents")) return Response.json({ agents: [] });
      const put = /^\/api\/freeduet\/engines\/members\/([^/]+)\/claude$/.exec(
        url,
      );
      if (put && method === "PUT") {
        const body = JSON.parse(String(init?.body)) as ClaudeChoice;
        sent.push({ method, path: url, body });
        if (refuse)
          return Response.json(
            {
              error:
                "That model or effort is not one of the choices. Nothing was changed.",
              code: "claude_choice_invalid",
            },
            { status: 400 },
          );
        const found = members.find((entry) => entry.id === put[1]);
        if (found) found.claude = body;
        return Response.json({ memberId: put[1], ...body, changed: true });
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

const model = (view: ReturnType<typeof draw>, name: string) =>
  view.getByRole("combobox", {
    name: `Claude model for ${name}`,
  }) as HTMLSelectElement;
const effort = (view: ReturnType<typeof draw>, name: string) =>
  view.getByRole("combobox", {
    name: `Claude effort for ${name}`,
  }) as HTMLSelectElement;

test("the selects are on a row that has Claude Code and on no other, and offer only the closed lists", async () => {
  const view = draw();
  await view.findByText("iris");
  expect([...model(view, "iris").options].map((o) => o.value)).toEqual([
    "",
    "haiku",
    "sonnet",
    "opus",
  ]);
  expect([...effort(view, "iris").options].map((o) => o.value)).toEqual([
    "",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  expect(model(view, "iris").value).toBe("");
  expect(
    view.queryByRole("combobox", { name: "Claude model for leo" }),
  ).toBeNull();
  expect(view.getAllByRole("combobox")).toHaveLength(2);
});

test("choosing a model sends the two words, keeps the effort, and shows the saved choice", async () => {
  const view = draw();
  await view.findByText("iris");
  const user = userEvent.setup({ document });
  await user.selectOptions(effort(view, "iris"), "high");
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({
    method: "PUT",
    path: "/api/freeduet/engines/members/iris/claude",
    body: { model: null, effort: "high" },
  });
  await waitFor(() => expect(effort(view, "iris").value).toBe("high"));
  await user.selectOptions(model(view, "iris"), "sonnet");
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]?.body).toEqual({ model: "sonnet", effort: "high" });
  await user.selectOptions(model(view, "iris"), "");
  await waitFor(() => expect(sent).toHaveLength(3));
  expect(sent[2]?.body).toEqual({ model: null, effort: "high" });
});

test("a page that may not change anything shows the selects disabled and sends nothing", async () => {
  canChange = false;
  const view = draw();
  await view.findByText("iris");
  expect(model(view, "iris").disabled).toBe(true);
  expect(effort(view, "iris").disabled).toBe(true);
  expect(sent).toHaveLength(0);
});

test("a refusal is said in the server's sentence", async () => {
  refuse = true;
  const view = draw();
  await view.findByText("iris");
  await userEvent
    .setup({ document })
    .selectOptions(model(view, "iris"), "opus");
  await view.findByText(/not one of the choices/);
});
