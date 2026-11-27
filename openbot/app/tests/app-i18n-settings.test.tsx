import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { ReadAloudSetting } from "@/components/settings/read-aloud-setting";
import { TeamBotConsents } from "@/components/settings/team-bot-consents";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2c: the Settings words follow the app language, with English when none is set. */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

// A Settings page: two of its sections, drawn in one app language.
function drawSettingsPage(language: "it" | "en") {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AppLanguageValue language={language}>
        <TeamBotConsents />
        <ReadAloudSetting />
      </AppLanguageValue>
    </QueryClientProvider>,
  );
}

test("a Settings page reads Italian with the language set to it, and English otherwise", () => {
  const it = drawSettingsPage("it");
  expect(it.getByText("Bot condivisi")).toBeTruthy();
  expect(it.getByRole("button", { name: "Reimposta" })).toBeTruthy();
  expect(it.getByText("Leggi le risposte ad alta voce")).toBeTruthy();
  cleanup();

  const en = drawSettingsPage("en");
  expect(en.getByText("Shared Bots")).toBeTruthy();
  expect(en.getByRole("button", { name: "Reset" })).toBeTruthy();
  expect(en.getByText("Read replies aloud")).toBeTruthy();
});
