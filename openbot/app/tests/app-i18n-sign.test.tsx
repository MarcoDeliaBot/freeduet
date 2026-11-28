import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { STORED_APP_LANGUAGE_KEY } from "@/freeduet/i18n/stored-choice";
import { authKeys } from "@/lib/auth/queries";
import { appConfig } from "@/lib/generated/application-config";
import { settleReactWork } from "./settle-react-work";

/*
 * D181: the sign-in page sits outside `_authed`, where the language provider is mounted, so it picks
 * its own language: the choice saved in this browser, else the browser's `navigator.languages`, else
 * English. The person is signed out here, so there is no server answer to wait for.
 *
 * The Better Auth client is replaced at the module boundary, as `sign-pairing.test.tsx` does, because
 * this screen imports it and it is not what is under test.
 */
const realAuthClient = { ...(await import("@/lib/auth/client")) };
mock.module("@/lib/auth/client", () => ({
  providerName: () => "Google",
  signInWith: async () => {},
  signInWithEmailDomain: async () => {},
}));
const { Route } = await import("@/routes/sign");

const product = appConfig.brand.productName;

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost:3010/" });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(window.navigator, "languages");
  document.documentElement.removeAttribute("lang");
});
afterAll(async () => {
  await settleReactWork();
  // Module mocks are process-wide in bun: hand the real client back to whatever runs next.
  mock.module("@/lib/auth/client", () => realAuthClient);
  GlobalRegistrator.unregister();
});

function browserLanguages(list: string[]) {
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    get: () => list,
  });
}

/** The sign-in page on `/sign`, with Google as the one way in. */
function renderSignPage() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(authKeys.providers(), {
    providers: ["google"],
    sso: false,
    ssoRequired: false,
  });
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

test("a browser set to Italian draws the sign-in page in Italian", async () => {
  browserLanguages(["it-IT", "en"]);
  const view = renderSignPage();
  expect(await view.findByText(`Accedi a ${product}`)).toBeTruthy();
  expect(view.getByText("Continua con Google")).toBeTruthy();
  await waitFor(() => expect(document.documentElement.lang).toBe("it"));
});

test("a browser set to English keeps the sign-in page in English", async () => {
  browserLanguages(["en-US", "en"]);
  const view = renderSignPage();
  expect(await view.findByText(`Sign in to ${product}`)).toBeTruthy();
  expect(view.getByText("Continue with Google")).toBeTruthy();
});

test("a language saved in this browser beats the browser's list", async () => {
  window.localStorage.setItem(STORED_APP_LANGUAGE_KEY, "de");
  browserLanguages(["it-IT"]);
  const view = renderSignPage();
  expect(await view.findByText(`Bei ${product} anmelden`)).toBeTruthy();
  expect(view.getByText("Weiter mit Google")).toBeTruthy();
  await waitFor(() => expect(document.documentElement.lang).toBe("de"));
});
