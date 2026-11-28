import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { CopilotKitProvider, useCopilotKit } from "@copilotkit/react-core/v2";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { ComputerViewPanel } from "@/components/computer/computer-panel";
import { CommandOutput } from "@/components/computer/command-output";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { AppLanguageValue, englishT } from "@/freeduet/i18n/provider";
import { createTranslator } from "@/freeduet/i18n/translate";
import { resumeHandoffTask } from "@/lib/copilot/handoff-resume";
import { SignInTool } from "@/lib/copilot/sign-in-tool";
import { settleReactWork } from "./settle-react-work";

/**
 * D181 stage 2m: what a member's computer work says in chat (a tool line, the sign-in card), the
 * computer panel and the plain hand-off function read the app language. With no provider they read
 * English, as every older computer test relies on.
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

function offline() {
  global.fetch = Object.assign(
    async () => Response.json({ error: "Not found" }, { status: 404 }),
    { preconnect: originalFetch.preconnect },
  );
}

type Renderer = ComponentType<Record<string, unknown>>;

function Capture({
  tool,
  kept,
}: {
  tool: string;
  kept: { renderer?: Renderer };
}) {
  const { copilotkit } = useCopilotKit();
  kept.renderer = copilotkit.renderToolCalls.find(
    (candidate) => candidate.name === tool,
  )?.render as Renderer | undefined;
  return null;
}

function Providers({ children }: { children: ReactNode }) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queries}>
      <CopilotKitProvider>{children}</CopilotKitProvider>
    </QueryClientProvider>
  );
}

async function signInLine(language: "it" | "en" | null) {
  offline();
  const kept: { renderer?: Renderer } = {};
  const inside = (extra: ReactNode) => (
    <Providers>
      <SignInTool />
      <Capture tool="computer_request_sign_in" kept={kept} />
      {extra}
    </Providers>
  );
  const wrap = (node: ReactNode) =>
    language ? (
      <AppLanguageValue language={language}>{node}</AppLanguageValue>
    ) : (
      node
    );
  const tree = render(wrap(inside(null)));
  await waitFor(() => expect(kept.renderer).toBeDefined());
  const Kept = kept.renderer as Renderer;
  tree.rerender(
    wrap(
      inside(
        <Kept
          name="computer_request_sign_in"
          args={{ site: "https://shop.example" }}
          status="executing"
          toolCallId="call-1"
        />,
      ),
    ),
  );
  return tree;
}

/**
 * The panel mounts its polling sidebar and screen; under CI load the first paint can take longer than 1 s.
 * Each wait may take up to 5 s, so the test itself gets more than bun's default 5 s (`PANEL_TEST_TIMEOUT`).
 */
const LONG_WAIT = { timeout: 5000 };
const PANEL_TEST_TIMEOUT = 30_000;

test("the sign-in line in chat reads Italian, English, and English with no provider", async () => {
  const it = await signInLine("it");
  await it.findByText("In attesa che tu acceda");
  expect(it.queryByText("Waiting for you to sign in")).toBeNull();
  cleanup();

  const en = await signInLine("en");
  await en.findByText("Waiting for you to sign in");
  cleanup();

  const none = await signInLine(null);
  await none.findByText("Waiting for you to sign in");
});

test("the computer panel reads the app language", async () => {
  offline();
  const it = render(
    <AppLanguageValue language="it">
      <ComputerViewPanel agentId="bot-1" name="Leo" />
    </AppLanguageValue>,
  );
  await it.findByLabelText("Barra laterale del Computer", undefined, LONG_WAIT);
  await it.findByText(
    /Ancora niente\. Qui compaiono i comandi/,
    undefined,
    LONG_WAIT,
  );
  await it.findByText("In attesa dello schermo del Bot…", undefined, LONG_WAIT);
  cleanup();

  const en = render(
    <AppLanguageValue language="en">
      <ComputerViewPanel agentId="bot-1" name="Leo" />
    </AppLanguageValue>,
  );
  await en.findByLabelText("Computer sidebar", undefined, LONG_WAIT);
  await en.findByText(
    /Nothing yet\. Commands the Bot runs/,
    undefined,
    LONG_WAIT,
  );
}, PANEL_TEST_TIMEOUT);

test("a command's output notes read the app language, and keep the exit code", () => {
  const view = render(
    <AppLanguageValue language="it">
      <CommandOutput output="" exitCode={2} timedOut truncated />
    </AppLanguageValue>,
  );
  view.getByText("Non ha stampato nulla.");
  view.getByText("È durato troppo ed è stato fermato.");
  view.getByText("Codice di uscita 2.");
});

test("resumeHandoffTask takes a translator and speaks English without one", async () => {
  const italian = createTranslator(SOURCE, CATALOGS, "it");
  const agent = { messages: [], isRunning: false, setMessages: () => {} };
  const pending = { requestId: "r1", toolCallId: "t1" };
  const run = async () => {};
  await expect(
    resumeHandoffTask("bot-1", pending, agent, run, undefined, italian),
  ).rejects.toThrow(
    "La chiamata dello strumento di questo passaggio di mano non è in questa conversazione.",
  );
  await expect(resumeHandoffTask("bot-1", pending, agent, run)).rejects.toThrow(
    "The handoff's tool call is not in this conversation.",
  );
  expect(englishT("computer.handoff.running")).toBe(
    "This task is already running.",
  );
});
