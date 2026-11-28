import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ResponsibilityDialog } from "@/components/responsibilities/responsibility-dialog";
import {
  FreeDuetFullAccess,
  fullAccessOptions,
} from "@/freeduet/full-access-section";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { type AgentProfile, agentKeys } from "@/lib/agents/queries";
import { describeApproval } from "@/lib/plugins/shared-use";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2g: Full access and a run that waits follow the app language, with English when none is set. */

const realFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
beforeAll(() => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/runs"))
        return Response.json({
          runs: [
            {
              id: "run-1",
              status: "waiting",
              replyText: null,
              error: null,
              waiting: { kind: "approval", requestId: "r1" },
              startedAt: null,
              finishedAt: null,
              createdAt: "2026-11-27T10:00:00Z",
            },
          ],
        });
      if (url.includes("/triggers")) return Response.json({ triggers: [] });
      return Response.json({});
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;
});
afterEach(cleanup);
afterAll(async () => {
  globalThis.fetch = realFetch;
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const iris = {
  id: "freeduet",
  name: "Iris",
  title: "Chief of Staff",
  hidden: false,
  builtIn: true,
  canManage: false,
  mine: false,
  pinned: false,
  systemOwned: true,
  visibility: "public",
} as unknown as AgentProfile;

const goal = {
  id: "g1",
  agentId: "freeduet",
  channelId: "c1",
  threadId: "t1",
  title: "Keep the report fresh",
  instruction: "Do it.",
  successCriteria: "Done.",
  status: "active",
  progress: "",
  lastResult: null,
  subscriptions: [],
  updatedAt: "2026-11-27T10:00:00Z",
} as never;

function draw(language: "it" | "en", node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(agentKeys.list(false), [iris]);
  client.setQueryData(fullAccessOptions().queryKey, {
    bots: { freeduet: { since: "2026-11-20T10:00:00Z", mode: "no_payments" } },
    recent: [],
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AppLanguageValue language={language}>{node}</AppLanguageValue>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("the Full access section reads Italian with the language set to it, and English otherwise", async () => {
  const it = draw("it", <FreeDuetFullAccess />);
  expect(await it.findAllByText("Accesso completo")).toBeTruthy();
  expect(
    it.getByText(/Pagamenti e acquisti chiedono comunque a te/),
  ).toBeTruthy();
  expect(it.queryByText("Done without asking")).toBeNull();
  cleanup();

  const en = draw("en", <FreeDuetFullAccess />);
  expect(await en.findAllByText("Full access")).toBeTruthy();
  expect(en.getByText(/Payments and purchases still ask you/)).toBeTruthy();
});

test("a run that waits names what it waits for in the app language, not a raw token", async () => {
  const it = draw(
    "it",
    <ResponsibilityDialog goal={goal} onClose={() => {}} />,
  );
  fireEvent.click(await it.findByText("Mostra le esecuzioni"));
  await waitFor(() =>
    expect(it.getByText(/In attesa della tua approvazione/)).toBeTruthy(),
  );
  cleanup();

  const en = draw(
    "en",
    <ResponsibilityDialog goal={goal} onClose={() => {}} />,
  );
  fireEvent.click(await en.findByText("View runs"));
  await waitFor(() =>
    expect(en.getByText(/Waiting for your approval\./)).toBeTruthy(),
  );
});

test("who may use a shared account reads English with no provider", () => {
  expect(
    describeApproval({ audience: "owner", outsideInput: true, members: [] }),
  ).toBe("Only its owner, and outside input");
});
