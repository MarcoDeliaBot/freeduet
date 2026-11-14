import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { authKeys, authProvidersQueryOptions } from "@/lib/auth/queries";

/*
 * With no sign-in, a browser is the person only once it has been paired with the installation
 * (docs/M1_PLAN.md D28). Until then every request is answered 401 and the app lands here, where
 * "Sign-in isn't set up yet. An admin has to set it up first." would send somebody looking for an
 * administrator who does not exist. The screen says what to do instead, and only when the server says
 * this installation pairs.
 *
 * The Better Auth client is replaced at the module boundary, as `sign-resume.test.tsx` does, because
 * this screen imports it and it is not what is under test.
 */
const realAuthClient = { ...(await import("@/lib/auth/client")) };
mock.module("@/lib/auth/client", () => ({
  providerName: () => "Google",
  signInWith: async () => {},
  signInWithEmailDomain: async () => {},
}));
const { Route } = await import("@/routes/sign");

beforeAll(() => {
  GlobalRegistrator.register();
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL("http://localhost:3010/");
});
afterEach(() => {
  cleanup();
});
afterAll(() => {
  // Module mocks are process-wide in bun: hand the real client back to whatever runs next.
  mock.module("@/lib/auth/client", () => realAuthClient);
  GlobalRegistrator.unregister();
});

function renderSignScreen(options: {
  providers: string[];
  sso: boolean;
  ssoRequired: boolean;
  installPairing?: boolean;
}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(authKeys.providers(), options);
  queryClient.setQueryData(authKeys.currentUser(), null);
  const root = createRootRoute();
  const sign = Route.update({
    id: "/sign",
    path: "/sign",
    getParentRoute: () => root,
  } as never);
  // The route tree is assembled by hand, so its types cannot describe it.
  const router = createRouter({
    routeTree: root.addChildren([sign]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/sign"] }),
  } as never) as never;
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

test("an installation that pairs says to run scripts/open.sh, not to find an administrator", async () => {
  const view = renderSignScreen({
    providers: [],
    sso: false,
    ssoRequired: false,
    installPairing: true,
  });
  expect(await view.findByText(/is not paired with/)).toBeTruthy();
  expect(view.container.textContent).toContain("bash scripts/open.sh");
  expect(view.container.textContent).not.toContain("An admin has to set it up");
});

test("one that does not keeps saying what it always said", async () => {
  const view = renderSignScreen({
    providers: [],
    sso: false,
    ssoRequired: false,
  });
  expect(await view.findByText(/Sign-in isn't set up yet/)).toBeTruthy();
  expect(view.container.textContent).not.toContain("scripts/open.sh");
});

test("the flag is read from the capabilities, and absent is false", async () => {
  const queryFn = authProvidersQueryOptions()
    .queryFn as unknown as () => Promise<{
    installPairing?: boolean;
  }>;
  const answer = async (body: object) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      return await queryFn();
    } finally {
      globalThis.fetch = realFetch;
    }
  };
  expect((await answer({ installPairing: true })).installPairing).toBe(true);
  expect((await answer({ installPairing: false })).installPairing).toBe(false);
  expect((await answer({ authProviders: ["google"] })).installPairing).toBe(
    false,
  );
});
