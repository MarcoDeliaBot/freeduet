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
import { useBotNames, useBotLabels } from "@/lib/agents/bot-names";
import { settleReactWork } from "./settle-react-work";

/** A person's own name for a team member (docs/design/settings-in-chat.md, 8.10): the card and the roster. */

const originalFetch = globalThis.fetch;
beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const CHANGE: SettingChangeResult = {
  changeId: "3d2a6f1e-0000-4000-8000-00000000000b",
  agentId: "otto",
  setting: "name",
  previousValue: null,
  newValue: "Max",
};
let roster: Record<string, unknown>[] = [];

beforeEach(() => {
  roster = [{ id: "otto", name: "Max", realName: "Otto" }];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agents") return Response.json({ agents: roster });
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

describe("the name card", () => {
  test("says which member by its own name, the new name, and offers Undo", async () => {
    const view = card(CHANGE);
    const shown = await view.findByRole("region", { name: "Name changed" });
    expect(
      await within(shown).findByText(
        "You now call Otto Max. It was its own name.",
      ),
    ).toBeTruthy();
    expect(within(shown).getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  test("a name that carries markup is drawn as text, never as an element", async () => {
    const hostile = {
      ...CHANGE,
      newValue: "<img src=x onerror=alert(1)><b>Max</b>",
    };
    const view = card(hostile);
    const shown = await view.findByRole("region", { name: "Name changed" });
    expect(shown.textContent).toContain(
      "<img src=x onerror=alert(1)><b>Max</b>",
    );
    expect(shown.querySelector("img")).toBeNull();
    expect(shown.querySelector("b")).toBeNull();
  });

  test("in Italian the card's words are Italian", async () => {
    const view = card(CHANGE, "it");
    const shown = await view.findByRole("region", { name: "Nome modificato" });
    expect(
      await within(shown).findByText(
        "Ora chiami Otto Max. Prima era il suo nome.",
      ),
    ).toBeTruthy();
  });
});

function Names() {
  const label = useBotLabels();
  const real = useBotNames();
  return (
    <p>
      {label("otto")}|{real("otto")}
    </p>
  );
}

describe("the roster's two readings", () => {
  test("a person's screens use the name they gave, admin read surfaces the member's own", async () => {
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queries}>
        <Names />
      </QueryClientProvider>,
    );
    expect(await view.findByText("Max|Otto")).toBeTruthy();
  });
});
