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
import { cleanup, render, waitFor } from "@testing-library/react";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import {
  type EnginesReading,
  engineStateText,
  leftOutText,
  orderWarningText,
  untilText,
} from "@/freeduet/engines-text";
import { modelsLoadedText } from "@/freeduet/engines-providers-text";
import {
  formatMoney,
  formatDuration,
  percentText,
} from "@/freeduet/engines-tokens-text";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { createTranslator } from "@/freeduet/i18n/translate";
import { settleReactWork } from "./settle-react-work";

/**
 * D181 stage 2k: the Engines page reads the app language. With none it reads English as before (the older engines
 * tests rely on that); the plain text functions take a `t` and default to English.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
const reading: EnginesReading = {
  reason: null,
  engines: [
    {
      id: "claude-code",
      name: "Claude Code",
      kind: "cli",
      state: "out_of_credit",
      until: null,
      refusal: null,
    },
  ],
  members: [
    {
      id: "freeduet",
      chain: ["claude-code"],
      leftOut: [{ id: "anthropic-api", why: "metered_off" }],
      mode: "ask-first",
      fileMode: "automatic",
      chosen: true,
      pin: null,
      ownOrder: false,
      recommendedChain: ["claude-code"],
    },
  ],
  canChange: true,
  cannotChange: null,
};

beforeEach(() => {
  global.fetch = (async (input: RequestInfo | URL) =>
    String(input) === "/api/freeduet/engines"
      ? Response.json(reading)
      : new Response(null, { status: 404 })) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function draw(language: "it" | "en") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AppLanguageValue language={language}>
        <FreeDuetEngines />
      </AppLanguageValue>
    </QueryClientProvider>,
  );
}

test("in Italian the Engines page speaks Italian, and the server's values stay raw", async () => {
  const view = draw("it");
  await waitFor(() => view.getAllByText("Claude Code"));
  expect(view.getByText("Credito esaurito", { selector: "span" })).toBeTruthy();
  expect(view.getAllByText("Chi usa cosa").length).toBeGreaterThan(0);
  expect(
    view.getByText(
      /^Non usato: .*perché i motori a pagamento sono disattivati\.$/,
    ),
  ).toBeTruthy();
  expect(view.queryByText("Who uses what")).toBeNull();
  // The value a choice sends back is the server's own word, not the Italian label.
  const asks = view.container.querySelectorAll('input[type="radio"]');
  expect(
    Array.from(asks).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["automatic", "ask-first"]);
});

test("in English the same page reads as before", async () => {
  const view = draw("en");
  await waitFor(() => view.getAllByText("Claude Code"));
  expect(view.getAllByText("Who uses what").length).toBeGreaterThan(0);
  expect(
    view.getByText(
      "Not used: anthropic-api, because paid engines are switched off.",
      { exact: false },
    ),
  ).toBeTruthy();
});

const it = createTranslator(SOURCE, CATALOGS, "it");

test("a plain engines function called with an Italian t says the Italian sentence", () => {
  expect(
    engineStateText(
      { state: "out_of_credit", until: null },
      new Date(),
      undefined,
      it,
    ),
  ).toBe("Credito esaurito");
  expect(
    engineStateText(
      { state: "refused", until: null, refusal: "Motivo del server." },
      new Date(),
      undefined,
      it,
      "it",
    ),
  ).toBe("Non eseguito: Motivo del server.");
  expect(leftOutText({ id: "x", why: "cap_zero" }, () => "Groq", it)).toBe(
    "Non usato: Groq, perché il suo tetto di spesa è zero.",
  );
  // Without a t it is English, as before.
  expect(engineStateText({ state: "ready", until: null })).toBe("Ready");
});

test("the paid-order warning keeps every condition in Italian", () => {
  const text = orderWarningText("paid_before_free_or_login", it);
  expect(text).toContain("può costare denaro");
  expect(text).toContain(
    "solo dopo che hai attivato i motori a pagamento e impostato i tuoi limiti",
  );
  expect(it("engines.order.tick")).toBe("Ho capito, usa questo ordine");
});

test("times, money, percentages and plurals follow the language", () => {
  // The time stays in the zone it is asked in; only its words and order follow the language.
  expect(
    untilText(
      "2026-11-15T09:00:00Z",
      new Date("2026-11-20T10:00:00Z"),
      "UTC",
      "it",
    ),
  ).toMatch(/^dom 15 nov, 09:00$/);
  expect(formatMoney(2, "usd", it, "it")).toMatch(/2,00/);
  expect(formatMoney(2, "usd")).toBe("$2.00");
  expect(percentText(3.4, it, "it")).toBe("3,4%");
  expect(formatDuration(125 * 60, it)).toBe("2 h 05 min");
  expect(modelsLoadedText(1, it)).toBe(
    "1 modello caricato. Sceglilo nella casella.",
  );
  expect(modelsLoadedText(3, it)).toBe(
    "3 modelli caricati. Scegline uno nella casella.",
  );
});
