import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { SetupSections } from "@/components/bot-profile/setup";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import type { AgentProfile } from "@/lib/agents/queries";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2d: the Bot pages speak the app language, with English when none is set. */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const BOT: AgentProfile = {
  id: "expenses",
  name: "Expenses",
  title: "Finance",
  roleDescription: "Review receipts.",
  roleDescriptionLimit: 1000,
  avatarSeed: "expenses",
  visibility: "private",
  endpoint: null,
  builtIn: true,
  hasAuth: false,
  hasCallbackToken: false,
  hidden: false,
  pinned: false,
  systemOwned: false,
  canManage: true,
  mine: true,
};

// The Setup page of a Bot: its content, drawn in one app language.
function drawSetupPage(language: "it" | "en") {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AppLanguageValue language={language}>
        <SetupSections agent={BOT} />
      </AppLanguageValue>
    </QueryClientProvider>,
  );
}

test("a Bot's Setup page reads Italian with the language set to it, and English otherwise", () => {
  const it = drawSetupPage("it");
  expect(it.getByText("Identità")).toBeTruthy();
  expect(it.getByText("Connessione")).toBeTruthy();
  cleanup();

  const en = drawSetupPage("en");
  expect(en.getByText("Identity")).toBeTruthy();
  expect(en.getByText("Connection")).toBeTruthy();
});
