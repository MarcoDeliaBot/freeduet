import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { WideFrame } from "@/freeduet/wide/frame";
import { type AgentProfile, agentKeys } from "@/lib/agents/queries";
import { approvalInboxOptions } from "@/lib/approvals";
import { channelKeys } from "@/lib/channels/queries";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2b: the team column's own words follow the app language, with English when none is set. */

const realFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
beforeAll(() => {
  // Whatever the column asks that the test did not seed is answered with an empty reply.
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/openduet/tasks") return Response.json({ tasks: [] });
      if (url.startsWith("/api/bots/attention"))
        return Response.json({ bots: [] });
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

function drawColumn(language: "it" | "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(agentKeys.list(false), [iris]);
  client.setQueryData(approvalInboxOptions().queryKey, {
    enabled: true,
    requests: [],
    rules: [],
    teamRules: [],
    questions: [],
  });
  client.setQueryData(channelKeys.list(), {
    pages: [{ channels: [], nextCursor: null }],
    pageParams: [""],
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AppLanguageValue language={language}>
          <WideFrame
            band="full"
            onMenu={() => {}}
            onNewChannel={() => {}}
            tab="chat"
          >
            <p>Right side</p>
          </WideFrame>
        </AppLanguageValue>
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

test("the team column reads Italian with the language set to it, and English otherwise", async () => {
  const it = drawColumn("it");
  expect(await it.findByText("Impostazioni")).toBeTruthy();
  expect(it.container.querySelector("aside")?.getAttribute("aria-label")).toBe(
    "Il tuo team",
  );
  cleanup();

  const en = drawColumn("en");
  expect(await en.findByText("Settings")).toBeTruthy();
  expect(en.container.querySelector("aside")?.getAttribute("aria-label")).toBe(
    "Your team",
  );
});
