import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngineSections } from "@/freeduet/engines-section";
import type { EnginesReading, MemberSummary } from "@/freeduet/engines-text";
import type { ProviderView } from "@/freeduet/engines-providers-text";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { WorkspaceTabs } from "@/freeduet/workspace";
import { settleReactWork } from "./settle-react-work";

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

test("tabs open on demand, support the keyboard and keep an unsaved field", async () => {
  const view = render(
    <WorkspaceTabs
      label="Preferences"
      views={[
        {
          id: "general",
          label: "General",
          icon: "settings",
          content: <p>Overview</p>,
        },
        {
          id: "writing",
          label: "Writing",
          icon: "page",
          content: <input aria-label="Instructions" />,
        },
      ]}
    />,
  );
  expect(view.queryByLabelText("Instructions")).toBeNull();
  const user = userEvent.setup({ document });
  await user.click(view.getByRole("tab", { name: "General" }));
  await user.keyboard("{ArrowRight}");
  expect(
    view.getByRole("tab", { name: "Writing" }).getAttribute("aria-selected"),
  ).toBe("true");
  await user.type(view.getByRole("textbox"), "Draft");
  await user.click(view.getByRole("tab", { name: "General" }));
  expect(view.queryByRole("textbox")).toBeNull();
  await user.click(view.getByRole("tab", { name: "Writing" }));
  expect((view.getByRole("textbox") as HTMLInputElement).value).toBe("Draft");
});

test("the engine browser shows one provider or member at a time and keeps the server's read-only state", async () => {
  const provider = (id: ProviderView["id"]): ProviderView => ({
    id,
    tag: "local",
    enabled: false,
    baseUrl: "",
    model: "",
    keySaved: false,
    needsKey: false,
    cloud: false,
    forMembers: true,
    forAssistants: false,
    blocked: null,
    addressFixed: false,
    useFor: null,
  });
  const member = (id: string): MemberSummary => ({
    id,
    chain: ["local"],
    leftOut: [],
    mode: "automatic",
    fileMode: "automatic",
    chosen: false,
    pin: null,
    ownOrder: false,
    recommendedChain: ["local"],
  });
  const reading: EnginesReading = {
    reason: null,
    engines: [
      {
        id: "local",
        name: "Local engine",
        kind: "cli",
        state: "ready",
        until: null,
        refusal: null,
      },
    ],
    providers: [provider("ollama"), provider("lmstudio")],
    members: [member("writer"), member("freeduet")],
    canChange: false,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const profile = {
    roleDescription: "",
    roleDescriptionLimit: 1000,
    visibility: "public" as const,
    endpoint: null,
    builtIn: true,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    pinned: false,
    systemOwned: true,
    canManage: false,
    mine: false,
  };
  client.setQueryData(agentListQueryOptions().queryKey, [
    {
      ...profile,
      id: "freeduet",
      name: "Iris",
      title: "Chief of Staff",
      avatarSeed: "iris",
    },
    {
      ...profile,
      id: "writer",
      name: "Wren",
      title: "Writer",
      avatarSeed: "wren",
    },
  ]);
  const view = render(
    <QueryClientProvider client={client}>
      <EngineSections
        workspace
        reading={reading}
        now={new Date()}
        onChanged={() => {}}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ document });
  expect(view.getByRole("heading", { name: "Local engine" })).toBeTruthy();
  await user.click(view.getByRole("tab", { name: "Providers" }));
  await user.selectOptions(view.getByLabelText("Provider"), "lmstudio");
  expect(view.getByRole("heading", { name: "LM Studio" })).toBeTruthy();
  expect(view.queryByRole("heading", { name: "Ollama" })).toBeNull();
  expect(
    view
      .getByRole("switch", { name: "Switch on LM Studio" })
      .hasAttribute("data-disabled"),
  ).toBe(true);
  await user.click(view.getByRole("tab", { name: "Bot assignments" }));
  expect(view.getByRole("rowheader", { name: "Iris" })).toBeTruthy();
  await user.selectOptions(view.getByLabelText("Bot"), "writer");
  expect(view.getByRole("rowheader", { name: "Wren" })).toBeTruthy();
  expect(view.queryByRole("rowheader", { name: "Iris" })).toBeNull();
  await user.click(view.getByRole("tab", { name: "Providers" }));
  expect(view.getByRole("heading", { name: "LM Studio" })).toBeTruthy();
});
