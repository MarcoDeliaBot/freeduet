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
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EngineProviders } from "@/freeduet/engines-providers";
import {
  checkText,
  PROVIDER_ORDER,
  type ProviderId,
  type ProviderView,
  usersText,
} from "@/freeduet/engines-providers-text";
import type { EnginesReading } from "@/freeduet/engines-text";
import { settleReactWork } from "./settle-react-work";

/**
 * Admin → Engines, the provider cards (D109): three clicks (switch on, paste the key and Save, Test), what each card says
 * about members and about data leaving the computer, a paid or trial card that cannot be switched on, and a key that is
 * never drawn back. The server is a small stand-in that keeps the cards the way the real one answers.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const KEY = "gsk_CANARYkey0123456789abcdef";
const sent: { method: string; path: string; body: unknown }[] = [];
let cards: ProviderView[];
let testAnswer: { ok: boolean; code: string };

function card(id: ProviderId, over: Partial<ProviderView> = {}): ProviderView {
  const local = id === "ollama" || id === "llamacpp" || id === "lmstudio";
  return {
    id,
    tag: local
      ? "local"
      : id === "cerebras"
        ? "trial"
        : id === "anthropic-api"
          ? "paid"
          : "free",
    enabled: false,
    baseUrl: local
      ? "http://host.docker.internal:11434/v1"
      : `https://api.${id}.test/v1`,
    model: "",
    keySaved: false,
    needsKey: !local,
    cloud: !local,
    forMembers: id === "ollama" || id === "openrouter",
    forAssistants: id !== "cerebras" && id !== "anthropic-api",
    blocked:
      id === "cerebras"
        ? "trial_needs_card"
        : id === "anthropic-api"
          ? "paid"
          : null,
    addressFixed: id === "openrouter" || id === "groq",
    useFor:
      id === "openrouter"
        ? { available: ["freeduet", "inbox", "concierge", "chef"], chosen: [] }
        : null,
    ...over,
  };
}

function reading(over: Partial<EnginesReading> = {}): EnginesReading {
  return {
    reason: null,
    engines: [],
    providers: cards,
    canChange: true,
    cannotChange: null,
    ...over,
  };
}

beforeEach(() => {
  sent.length = 0;
  cards = PROVIDER_ORDER.map((id) => card(id));
  testAnswer = { ok: true, code: "ok" };
  global.fetch = Object.assign(
    async (path: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(path), "http://localhost");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.pathname === "/api/agents") return Response.json([]); // the names of the members
      sent.push({ method, path: url.pathname, body });
      const id = url.pathname.split("/")[5] as ProviderId;
      const target = cards.find((entry) => entry.id === id);
      const json = (value: unknown) => Response.json(value);
      if (url.pathname.endsWith("/key") && method === "PUT") {
        if (target) target.keySaved = true;
        return json({ keySaved: true });
      }
      if (url.pathname.endsWith("/key") && method === "DELETE") {
        if (target) Object.assign(target, { keySaved: false, enabled: false });
        return json({ keySaved: false });
      }
      if (url.pathname.endsWith("/models"))
        return json({ ok: true, code: "ok", models: ["m-one", "m-two"] });
      if (url.pathname.endsWith("/test")) return json(testAnswer);
      if (target && method === "PUT") {
        if (Array.isArray(body.members) && target.useFor)
          target.useFor = { ...target.useFor, chosen: body.members };
        Object.assign(target, {
          ...(typeof body.enabled === "boolean"
            ? { enabled: body.enabled }
            : {}),
          ...(body.model ? { model: body.model } : {}),
          ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
        });
        return json({ provider: target });
      }
      return new Response("{}", { status: 404 });
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
});

function Harness({ extra }: { extra?: Partial<EnginesReading> }) {
  const [value, setValue] = useState(() => reading(extra));
  return (
    <EngineProviders
      onChanged={() =>
        setValue(
          reading({
            ...extra,
            providers: cards.map((entry) => ({ ...entry })),
          }),
        )
      }
      reading={value}
    />
  );
}

function draw(extra?: Partial<EnginesReading>) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <Harness extra={extra} />
    </QueryClientProvider>,
  );
}

const cardOf = (view: ReturnType<typeof draw>, name: string) => {
  const heading = view.getByRole("heading", { level: 3, name });
  return within(heading.closest("[data-slot=provider]") as HTMLElement);
};

test("every provider is a card with its tag, in the order of the design", () => {
  const view = draw();
  const names = view
    .getAllByRole("heading", { level: 3 })
    .map((node) => node.textContent);
  expect(names).toEqual([
    "Ollama",
    "llama.cpp server",
    "LM Studio",
    "Groq",
    "Google AI Studio",
    "Mistral",
    "OpenRouter",
    "Cloudflare Workers AI",
    "Cerebras",
    "Anthropic API",
  ]);
  expect(cardOf(view, "Ollama").getByText("Local")).toBeTruthy();
  expect(cardOf(view, "Groq").getByText("Free with limits")).toBeTruthy();
  expect(
    cardOf(view, "Cerebras").getByText("Trial, needs a card"),
  ).toBeTruthy();
  expect(cardOf(view, "Anthropic API").getByText("Paid")).toBeTruthy();
});

test("a cloud card warns that data leaves the computer, a local one does not, and each says who can use it", () => {
  const view = draw();
  expect(
    cardOf(view, "Groq").getByText(
      "Data sent to this service leaves your computer.",
    ),
  ).toBeTruthy();
  expect(
    cardOf(view, "Ollama").queryByText(
      "Data sent to this service leaves your computer.",
    ),
  ).toBeNull();
  expect(cardOf(view, "Groq").getByText(/For members: not yet\./)).toBeTruthy();
  expect(cardOf(view, "Ollama").getByText(/For members: yes/)).toBeTruthy();
  expect(cardOf(view, "OpenRouter").getByText(/For members: yes/)).toBeTruthy();
  expect(usersText(card("lmstudio"))).toMatch(/For members: not yet/);
});

test("a free cloud card says that free is FreeDuet's label and that some providers bill", () => {
  const view = draw();
  expect(
    cardOf(view, "Google AI Studio").getByText(
      /FreeDuet's label.*Google, for one.*bill/,
    ),
  ).toBeTruthy();
  expect(cardOf(view, "Ollama").queryByText(/FreeDuet's label/)).toBeNull();
});

test("a free cloud engine a member can run on is used by nobody until members are ticked, and mail and bookings say so", async () => {
  cards = cards.map((entry) =>
    entry.id === "openrouter"
      ? { ...entry, enabled: true, keySaved: true, model: "openrouter/free" }
      : entry,
  );
  const user = userEvent.setup({ document });
  const view = draw();
  const one = cardOf(view, "OpenRouter");
  expect(one.getByText(/No member uses it yet/)).toBeTruthy();
  for (const box of one.getAllByRole("checkbox"))
    expect((box as HTMLInputElement).checked).toBe(false);
  await user.click(one.getByLabelText("inbox"));
  await waitFor(() => one.getByText("Sends your mail to this service."));
  expect(sent.at(-1)).toMatchObject({
    method: "PUT",
    body: { members: ["inbox"] },
  });
  await user.click(one.getByLabelText("concierge"));
  await waitFor(() => one.getByText("Sends your bookings to this service."));
  expect(sent.at(-1)?.body).toEqual({ members: ["inbox", "concierge"] });
  expect(one.queryByText("Sends your mail to this service.")).toBeTruthy();
  await user.click(one.getByLabelText("inbox"));
  await waitFor(() =>
    expect(one.queryByText("Sends your mail to this service.")).toBeNull(),
  );
  // No other card has the choice: a local engine joins everyone, an OpenAI-format-only engine joins nobody.
  expect(cardOf(view, "Ollama").queryByText("Use for")).toBeNull();
  expect(cardOf(view, "Groq").queryByText("Use for")).toBeNull();
});

test("a paid card and a trial card cannot be switched on and say why, with no field to fill", () => {
  const view = draw();
  for (const [name, why] of [
    ["Anthropic API", /spending caps exist/],
    ["Cerebras", /needs a card, so FreeDuet does not offer it as free/],
  ] as const) {
    const one = cardOf(view, name);
    expect(one.getByRole("switch").hasAttribute("data-disabled")).toBe(true);
    expect(one.getByText(why)).toBeTruthy();
    expect(one.queryByRole("textbox")).toBeNull();
    expect(one.queryByRole("button")).toBeNull();
    expect(
      one.queryByText("Data sent to this service leaves your computer."),
    ).toBeNull();
  }
});

test("three clicks: switch on, paste the key and Save, Test", async () => {
  const user = userEvent.setup({ document });
  const view = draw();
  const groq = cardOf(view, "Groq");

  await user.click(groq.getByRole("switch"));
  expect(sent).toHaveLength(0); // nothing is sent while the key is missing
  expect(
    groq.getByText("Not on yet. Paste the key and press Save."),
  ).toBeTruthy();
  expect(
    (groq.getByRole("button", { name: "Test" }) as HTMLButtonElement).disabled,
  ).toBe(true);

  await user.type(groq.getByLabelText("Key"), KEY);
  await user.click(groq.getByRole("button", { name: "Save" }));
  await waitFor(() => groq.getByText("Key saved. It is never shown again."));
  expect(
    sent.map((call) => `${call.method} ${call.path.split("/providers/")[1]}`),
  ).toEqual(["PUT groq/key", "PUT groq"]);
  expect(sent[0]?.body).toEqual({ key: KEY });
  expect(sent[1]?.body).toMatchObject({
    enabled: true,
    model: "llama-3.1-8b-instant",
  });
  expect(groq.getByRole("switch").getAttribute("aria-checked")).toBe("true");

  // The key is never drawn back: no field holds it, and no text says it.
  expect(view.container.textContent).not.toContain(KEY);
  expect(
    Array.from(view.container.querySelectorAll("input")).some(
      (input) => input.value === KEY,
    ),
  ).toBe(false);
  expect(groq.queryByLabelText("Key")).toBeNull();

  await user.click(groq.getByRole("button", { name: "Test" }));
  await waitFor(() => groq.getByText("It answered. It works."));
});

test("Test says why it failed in words and never shows a key", async () => {
  cards = cards.map((entry) =>
    entry.id === "groq"
      ? { ...entry, enabled: true, keySaved: true, model: "m" }
      : entry,
  );
  testAnswer = { ok: false, code: "key_rejected" };
  const user = userEvent.setup({ document });
  const view = draw();
  await user.click(cardOf(view, "Groq").getByRole("button", { name: "Test" }));
  await waitFor(() => cardOf(view, "Groq").getByText(/key was not accepted/));
  expect(view.container.textContent).not.toContain(KEY);
  for (const code of [
    "ok",
    "key_rejected",
    "model_missing",
    "rate_limited",
    "unreachable",
    "401",
  ]) {
    expect(checkText(code)).not.toMatch(/\d{3}/); // no upstream number is ever said
  }
  expect(checkText("anything else")).toBe(checkText("unreachable"));
});

test("a local card with no key is switched on by choosing a model and saving", async () => {
  const user = userEvent.setup({ document });
  const view = draw();
  const ollama = cardOf(view, "Ollama");
  expect(ollama.queryByLabelText("Key")).toBeNull();
  await user.click(ollama.getByRole("switch"));
  expect(
    ollama.getByText("Not on yet. Choose a model and press Save settings."),
  ).toBeTruthy();
  await user.type(ollama.getByLabelText("Model"), "qwen2.5:7b");
  await user.click(ollama.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(cards.find((entry) => entry.id === "ollama")?.enabled).toBe(true),
  );
  expect(sent.at(-1)?.body).toMatchObject({
    enabled: true,
    model: "qwen2.5:7b",
  });
});

test("Load list fills the model box with what the provider lists", async () => {
  cards = cards.map((entry) =>
    entry.id === "groq" ? { ...entry, keySaved: true } : entry,
  );
  const user = userEvent.setup({ document });
  const view = draw();
  await user.click(
    cardOf(view, "Groq").getByRole("button", { name: "Load list" }),
  );
  await waitFor(() =>
    cardOf(view, "Groq").getByText("2 models loaded. Pick one in the box."),
  );
  const options = Array.from(
    view.container.querySelectorAll("datalist option"),
  ).map((node) => node.getAttribute("value"));
  expect(options).toEqual(["m-one", "m-two"]);
});

test("Remove deletes the key and the card goes off", async () => {
  cards = cards.map((entry) =>
    entry.id === "groq"
      ? { ...entry, enabled: true, keySaved: true, model: "m" }
      : entry,
  );
  const user = userEvent.setup({ document });
  const view = draw();
  const groq = cardOf(view, "Groq");
  await user.click(groq.getByRole("button", { name: "Remove" }));
  await waitFor(() => groq.getByText("Key removed. The engine is off."));
  expect(sent[0]).toMatchObject({ method: "DELETE" });
  expect(groq.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect(groq.getByLabelText("Key")).toBeTruthy();
});

test("a page that may not change anything disables every control and says why", () => {
  const view = draw({ canChange: false, cannotChange: "not_at_the_computer" });
  expect(
    cardOf(view, "Groq").getByRole("switch").hasAttribute("data-disabled"),
  ).toBe(true);
  expect(
    (
      cardOf(view, "Groq").getByRole("button", {
        name: "Load list",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(view.getByText(/Change these on the computer/)).toBeTruthy();
});

test("with an engines file of the person's own the cards only show it", () => {
  const view = draw({ providersLocked: "file_is_yours" });
  expect(view.getByText(/engines file of your own/)).toBeTruthy();
  expect(
    cardOf(view, "Groq").getByRole("switch").hasAttribute("data-disabled"),
  ).toBe(true);
});

test("a server with no cards leaves the section out", () => {
  const view = draw({ providers: [] });
  expect(view.queryByText("Add an engine")).toBeNull();
});
