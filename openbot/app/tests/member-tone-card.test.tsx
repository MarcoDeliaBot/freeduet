import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { SettingChangeResult } from "@openbot/shared/setting-change";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, within } from "@testing-library/react";
import { CardLanguageProvider } from "@/freeduet/person-language/use-card-text";
import { SettingChangeCard } from "@/freeduet/setting-change-card";
import { settleReactWork } from "./settle-react-work";

/** The tone a member talks in (docs/design/settings-in-chat.md, 8.10.2): the card says it in fixed words. */

const originalFetch = globalThis.fetch;
beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const CHANGE: SettingChangeResult = {
  changeId: "3d2a6f1e-0000-4000-8000-00000000000c",
  agentId: "otto",
  setting: "tone",
  previousValue: "plain",
  newValue: "warm",
};

beforeEach(() => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agents")
        return Response.json({ agents: [{ id: "otto", name: "Otto" }] });
      if (url === "/api/settings-changes")
        return Response.json({ changes: [] });
      return Response.json({ error: "Not found" }, { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

function card(change: SettingChangeResult, language: "it" | null = null) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queries}>
      <CardLanguageProvider language={language}>
        <SettingChangeCard change={change} />
      </CardLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("the tone card", () => {
  test("says the member, the new tone and the old one, and offers Undo", async () => {
    const view = card(CHANGE);
    const shown = await view.findByRole("region", { name: "Tone changed" });
    expect(
      await within(shown).findByText(
        "Otto now talks to you in a warm tone. It was plain.",
      ),
    ).toBeTruthy();
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  test("the words for the three tones are fixed, in English and in Italian", async () => {
    const formal = card({
      ...CHANGE,
      previousValue: "warm",
      newValue: "formal",
    });
    const shown = await formal.findByRole("region", { name: "Tone changed" });
    expect(
      await within(shown).findByText(
        "Otto now talks to you in a formal tone. It was warm.",
      ),
    ).toBeTruthy();
    cleanup();
    const italian = card(CHANGE, "it");
    const italianCard = await italian.findByRole("region", {
      name: "Tono modificato",
    });
    expect(
      await within(italianCard).findByText(
        "Otto ora ti parla con un tono caloroso. Prima era neutro.",
      ),
    ).toBeTruthy();
  });
});
