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
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { Route as BoundariesRoute } from "@/routes/_authed/admin/boundaries";
import { Route as PeopleRoute } from "@/routes/_authed/admin/people";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2h: the admin pages read the app language; with none they read English as before. */

const originalFetch = globalThis.fetch;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
beforeEach(() => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/computers/policy"))
        return Response.json({
          policy: { mode: "enforce", deny: [], allow: ["true"] },
        });
      if (path.includes("/api/admin/people"))
        return Response.json({
          people: [
            {
              id: "u1",
              email: "ada@example.com",
              name: null,
              role: "user",
              revoked: false,
              configuredAdmin: false,
              providers: ["google"],
              lastSignedInAt: null,
            },
          ],
          nextCursor: null,
        });
      return Response.json({});
    },
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function draw(page: "boundaries" | "people", language: "it" | "en") {
  const Page = (page === "boundaries" ? BoundariesRoute : PeopleRoute).options
    .component as () => React.ReactNode;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={client}>
          <AppLanguageValue language={language}>
            <Page />
          </AppLanguageValue>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router as never} />);
}

test("the Boundaries page reads Italian with the language set to it, English with en", async () => {
  const it = draw("boundaries", "it");
  expect(await it.findByText("Blocca l'azione")).toBeTruthy();
  expect(it.getByText("Quando una regola corrisponde")).toBeTruthy();
  expect(it.queryByText("Stop the action")).toBeNull();
  cleanup();
  const en = draw("boundaries", "en");
  expect(await en.findByText("Stop the action")).toBeTruthy();
  expect(en.getByText("When a rule matches")).toBeTruthy();
});

test("the People page reads Italian with the language set to it, English with en", async () => {
  const it = draw("people", "it");
  expect(await it.findByText("Ferma i computer")).toBeTruthy();
  expect(it.getByText("Chi c'è")).toBeTruthy();
  expect(it.getByRole("button", { name: "Rimuovi" })).toBeTruthy();
  expect(it.queryByText("Who is here")).toBeNull();
  cleanup();
  const en = draw("people", "en");
  expect(await en.findByText("Stop computers")).toBeTruthy();
  expect(en.getByText("Who is here")).toBeTruthy();
  expect(en.getByRole("button", { name: "Remove" })).toBeTruthy();
});
