/*
 * The computer tools the web app offers a Bot, read from the app itself.
 *
 * Renders the app's own registrations, `ComputerTools` and `SignInTool` (openbot/app/src/lib/copilot),
 * inside the real CopilotKit provider, and prints what the SDK would send as `tools` on the Bot's
 * next run (`copilotkit.buildFrontendTools`). So the names, descriptions and parameter schemas are
 * the app's own, and so is the choice of which of them a Bot is offered (computer-available.ts):
 * the app's hooks read the server's answers for the Bot's profile and the deployment's
 * capabilities, given here, and decide.
 *
 * Its own process, because it needs a DOM: happy-dom replaces fetch, Response and the timers while
 * it is registered, and the runner talks to a real server.
 *
 *   echo '{"botId":"concierge","agent":{"status":200,"body":{"agent":{...}}},"capabilities":null}' \
 *     | bun evals/team/app-computer-tools.ts
 *
 * `agent` and `capabilities` are the server's answers to GET /api/agents/<botId> and
 * GET /api/admin/enterprise/me (status and JSON body); null for one that could not be read, which
 * the app treats as "not known yet", and offers.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type ServerAnswer = { status: number; body: unknown };

export type AppToolsInput = {
  botId: string;
  agent?: ServerAnswer | null;
  capabilities?: ServerAnswer | null;
};

/** One tool as the SDK sends it on a run: AG-UI's `Tool`. */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const APP = resolve(import.meta.dir, "../../openbot/app");
const COPILOT = join(APP, "src/lib/copilot");
/** Written by `bun run generate:app-config` (dev, build and the test suite run it first). */
const GENERATED = join(APP, "src/lib/generated/application-config.ts");

/** A package as the app resolves it, so React and the SDK are the app's own copies. */
const fromApp = (specifier: string) => import(Bun.resolveSync(specifier, APP));

type Core = { buildFrontendTools(agentId?: string): ToolDefinition[] };

async function render(input: AppToolsInput): Promise<ToolDefinition[]> {
  if (!existsSync(GENERATED)) {
    // The brand the app is built with. Nothing about the tools reads it, but the screen view a
    // navigation draws imports it, so a checkout that never ran the app still loads.
    Bun.plugin({
      name: "eval-application-config",
      setup(build) {
        build.module("@/lib/generated/application-config", () => ({
          loader: "js",
          contents:
            'export const appConfig = { brand: { tenantId: "eval", productName: "OpenBot" } };',
        }));
      },
    });
  }
  const { GlobalRegistrator } = await fromApp("@happy-dom/global-registrator");
  GlobalRegistrator.register({ url: "http://openbot.invalid/" });
  const answer = (value: ServerAnswer | null | undefined) =>
    value
      ? new Response(JSON.stringify(value.body), {
          status: value.status,
          headers: { "content-type": "application/json" },
        })
      : new Response('{"error":"Not read by the eval."}', {
          status: 503,
          headers: { "content-type": "application/json" },
        });
  // The two reads computer-available.ts makes; nothing else reaches a server.
  globalThis.fetch = (async (request: string | URL | Request) => {
    const url = new URL(
      request instanceof Request ? request.url : String(request),
      "http://openbot.invalid/",
    );
    if (url.pathname === `/api/agents/${encodeURIComponent(input.botId)}`)
      return answer(input.agent);
    if (url.pathname === "/api/admin/enterprise/me")
      return answer(input.capabilities);
    return answer({ status: 404, body: { error: "Not part of the eval." } });
  }) as typeof fetch;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const React = await fromApp("react");
  const { createRoot } = await fromApp("react-dom/client");
  const { CopilotKitProvider, useCopilotKit } = await fromApp(
    "@copilotkit/react-core/v2",
  );
  const { QueryClient, QueryClientProvider } = await fromApp(
    "@tanstack/react-query",
  );
  const { ComputerTools } = await import(join(COPILOT, "computer-tools.tsx"));
  const { SignInTool } = await import(join(COPILOT, "sign-in-tool.tsx"));
  const { ActiveBotProvider, useActiveBot } = await import(
    join(COPILOT, "active-bot.tsx")
  );
  const { agentQueryOptions } = await import(
    join(APP, "src/lib/agents/queries.ts")
  );
  const { myCapabilitiesQueryOptions } = await import(
    join(APP, "src/lib/enterprise/queries.ts")
  );
  const h = React.createElement;

  /** What the provider offers with nothing registered, so only the two components' tools remain. */
  async function toolsOf(children: unknown[]): Promise<ToolDefinition[]> {
    let core: Core | undefined;
    function Grab() {
      core = useCopilotKit().copilotkit as Core;
      return null;
    }
    // The chat surface declares its Bot; the computer tools and their profile read target it.
    function Declare() {
      useActiveBot(input.botId);
      return null;
    }
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      },
    });
    const root = createRoot(document.createElement("div"));
    await React.act(async () => {
      root.render(
        h(
          QueryClientProvider,
          { client },
          h(
            CopilotKitProvider,
            {},
            h(ActiveBotProvider, {}, h(Declare), ...children, h(Grab)),
          ),
        ),
      );
    });
    // Until both reads have answered and the tools have registered again with what they said.
    const keys = [
      agentQueryOptions(input.botId).queryKey,
      myCapabilitiesQueryOptions().queryKey,
    ];
    for (let tick = 0; tick < 200; tick++) {
      await React.act(() => new Promise((done) => setTimeout(done, 5)));
      const settled = keys.every((key) => {
        const state = client.getQueryState(key);
        return (
          state && state.status !== "pending" && state.fetchStatus === "idle"
        );
      });
      if (settled && tick >= 2) break;
    }
    await React.act(() => new Promise((done) => setTimeout(done, 5)));
    const tools = core?.buildFrontendTools(input.botId) ?? [];
    await React.act(async () => root.unmount());
    client.clear();
    return tools;
  }

  const base = new Set((await toolsOf([])).map((tool) => tool.name));
  const tools = (await toolsOf([h(ComputerTools), h(SignInTool)])).filter(
    (tool) => !base.has(tool.name),
  );
  await GlobalRegistrator.unregister();
  return tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

if (import.meta.main) {
  const input = JSON.parse(await Bun.stdin.text()) as AppToolsInput;
  if (typeof input?.botId !== "string" || !input.botId)
    throw new Error("Give the Bot id as botId.");
  // The app and the SDK talk to the console (a missing runtime URL, a quirks-mode page). Kept off
  // stdout, which carries the answer.
  const quiet = () => {};
  for (const level of ["log", "info", "warn", "error", "debug"] as const)
    console[level] = quiet;
  try {
    const tools = await render(input);
    await Bun.write(Bun.stdout, `${JSON.stringify({ tools })}\n`);
    process.exit(0);
  } catch (error) {
    await Bun.write(
      Bun.stderr,
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  }
}
