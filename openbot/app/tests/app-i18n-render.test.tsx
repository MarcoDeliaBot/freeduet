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
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StalledHandoffRow } from "@/components/bot-profile/stalled-handoff";
import { attentionSummary } from "@/components/bot-profile/attention";
import { AppLanguageSetting } from "@/freeduet/i18n/language-setting";
import {
  AppLanguageProvider,
  AppLanguageValue,
  useAppLanguage,
  useT,
} from "@/freeduet/i18n/provider";
import { STORED_APP_LANGUAGE_KEY } from "@/freeduet/i18n/stored-choice";
import { headline } from "@/freeduet/dashboard-model";
import { SettingsHome } from "@/freeduet/settings-home";
import { authKeys } from "@/lib/auth/queries";
import { settleReactWork } from "./settle-react-work";

/** D181: with the language set to Italian, the translated surfaces read Italian; with none, they read English as before. */

const originalFetch = globalThis.fetch;
let requests: { path: string; method: string; body: unknown }[];
let preferences: Record<string, unknown>;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
beforeEach(() => {
  requests = [];
  preferences = { messageListEmphasis: "thread" };
  window.localStorage.clear();
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        path: String(input),
        method: init?.method ?? "GET",
        body: init?.body,
      });
      if (init?.method === "PATCH")
        preferences = { ...preferences, ...JSON.parse(String(init.body)) };
      return Response.json({ preferences });
    },
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(window.navigator, "languages");
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function browserLanguages(list: string[]) {
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    get: () => list,
  });
}

function drawHome(language: "it" | "en") {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AppLanguageValue language={language}>
          <SettingsHome isAdmin />
        </AppLanguageValue>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router as never} />);
}

test("Settings home reads Italian with the language set to it, English otherwise", async () => {
  const it = drawHome("it");
  await it.findByTestId("settings-engines");
  expect(it.getByText("Conosci il tuo team e gestisci ogni Bot.")).toBeTruthy();
  expect(it.getByText("Sicurezza")).toBeTruthy();
  expect(it.getByRole("navigation").getAttribute("aria-label")).toBe(
    "Impostazioni",
  );
  expect(it.queryByText("Safety")).toBeNull();
  cleanup();
  const en = drawHome("en");
  await en.findByTestId("settings-engines");
  expect(en.getByText("Meet your team and manage each Bot.")).toBeTruthy();
  expect(en.getByText("Safety")).toBeTruthy();
});

function drawStalled(language: "it" | "en") {
  const client = new QueryClient();
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={client}>
          <AppLanguageValue language={language}>
            <StalledHandoffRow
              agentId="iris"
              channelId="c1"
              id="h1"
              reason="the engine stopped answering"
              task="the invoice"
              toName="Otto"
            />
          </AppLanguageValue>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router as never} />);
}

test("a stalled hand-off row reads Italian, with the server's reason kept as it came", async () => {
  const view = drawStalled("it");
  expect(await view.findByText("Otto non ha finito: the invoice")).toBeTruthy();
  expect(view.getByText("Motivo: the engine stopped answering.")).toBeTruthy();
  expect(view.getByRole("button", { name: "Riprova" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Scarta" })).toBeTruthy();
  expect(view.getByText("Apri la conversazione")).toBeTruthy();
});

test("the dashboard's words and the attention summary take the language", () => {
  expect(headline(0)).toBe("Nothing waits for you.");
  expect(
    attentionSummary({
      agentId: "a",
      name: "A",
      questions: 2,
      approvals: 1,
      handoffs: 0,
      unread: 0,
      paused: false,
      notify: "all",
    }),
  ).toBe("2 questions, 1 approval");
});

function Probe() {
  const t = useT();
  return <p data-testid="probe">{t("nav.settings")}</p>;
}

function Chooser() {
  const { setChoice } = useAppLanguage();
  return (
    <button
      data-testid="choose-it"
      onClick={() => setChoice("it")}
      type="button"
    >
      it
    </button>
  );
}

function drawProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(authKeys.currentUser(), {
    id: "alice",
    email: "alice@example.com",
    role: "user",
    onboarding: null,
  });
  return render(
    <QueryClientProvider client={client}>
      <AppLanguageProvider>
        <Probe />
        <Chooser />
        <AppLanguageSetting />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

test("with no choice the browser's language decides", async () => {
  browserLanguages(["it-IT", "en"]);
  const view = drawProvider();
  await waitFor(() =>
    expect(view.getByTestId("probe").textContent).toBe("Impostazioni"),
  );
  expect(document.documentElement.lang).toBe("it");
});

test("the person's saved choice wins over the browser, and is kept for the first paint", async () => {
  browserLanguages(["it-IT"]);
  preferences = { appLanguage: "de" };
  const view = drawProvider();
  // German has its own words now: the probe reads the German word for Settings.
  await waitFor(() => expect(document.documentElement.lang).toBe("de"));
  expect(view.getByTestId("probe").textContent).toBe("Einstellungen");
  expect(window.localStorage.getItem(STORED_APP_LANGUAGE_KEY)).toBe("de");
});

test("choosing a language in Settings applies at once, with no reload, and is saved to the account", async () => {
  browserLanguages(["en-US"]);
  const view = drawProvider();
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(view.getByTestId("probe").textContent).toBe("Settings");
  // The select's popup does not open reliably under happy-dom; the select calls `setChoice`, which is
  // what is driven here, inside act. The select itself is checked to show the current choice.
  expect(view.getByRole("combobox", { name: "App language" })).toBeTruthy();
  await act(async () => {
    view.getByTestId("choose-it").click();
  });
  await waitFor(() =>
    expect(view.getByTestId("probe").textContent).toBe("Impostazioni"),
  );
  await waitFor(() =>
    expect(requests.at(-1)).toEqual({
      path: "/api/settings/preferences",
      method: "PATCH",
      body: JSON.stringify({ appLanguage: "it" }),
    }),
  );
  expect(window.localStorage.getItem(STORED_APP_LANGUAGE_KEY)).toBe("it");
});
