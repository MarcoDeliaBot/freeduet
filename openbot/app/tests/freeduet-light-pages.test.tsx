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
  type AnyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { FreeDuetDashboard } from "@/freeduet/dashboard";
import { FreeDuetEngines } from "@/freeduet/engines-section";
import { SettingsHome } from "@/freeduet/settings-home";
import { Route as BotsRoute } from "@/routes/_authed/_app/bots.index";
import { Route as SkillsRoute } from "@/routes/_authed/_app/capabilities.skills";
import { settleReactWork } from "./settle-react-work";

/**
 * D174, stage 3a: Engines, Bots and Capabilities draw in the light design and keep every control.
 * The control lists below were taken from the same pages on main before the change (counted with this
 * test's own `controls` run against main: Bots 5, Capabilities 5, Engines 10, with the app's default build, not the FreeDuet tabbed one), so a control that goes missing, or one that is added, fails here.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const original = global.fetch;
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
const member = (id: string) => ({
  id,
  chain: ["claude"],
  leftOut: [],
  mode: "automatic",
  fileMode: "automatic",
  chosen: false,
  pin: null,
  ownOrder: false,
  recommendedChain: ["claude"],
});
const skill = (n: number) => ({
  id: `s${n}`,
  slug: `skill-${n}`,
  ownerUserId: "user-1",
  title: `Skill ${n}`,
  summary: "A skill.",
  instructions: "x",
  origin: "own",
  installedBy: null,
  grantedTo: [],
  tools: [],
});
const answers: Record<string, unknown> = {
  "/api/me": {
    user: {
      id: "user-1",
      email: "person@example.com",
      role: "admin",
      onboarding: null,
    },
  },
  "/api/freeduet/engines": {
    reason: null,
    engines: [
      {
        id: "claude",
        name: "Claude (subscription)",
        kind: "cli",
        state: "ready",
        until: null,
        refusal: null,
      },
    ],
    members: [member("leo"), member("vera")],
    providers: [
      {
        id: "ollama",
        tag: "local",
        enabled: true,
        baseUrl: "http://localhost:11434",
        model: "qwen",
        keySaved: false,
        needsKey: false,
        cloud: false,
        forMembers: true,
        forAssistants: false,
        blocked: null,
        addressFixed: false,
        useFor: null,
      },
    ],
    canChange: true,
    cannotChange: null,
    choices: { state: "ok" },
  },
  "/api/plugins": {
    catalogue: [],
    servers: [],
    skills: [skill(1), skill(2)],
    botsMayCallBack: true,
    redirectUri: null,
    composioConfigured: false,
    authorizesPerAction: false,
  },
  "/api/agents": {
    agents: [
      { id: "leo", name: "Leo" },
      { id: "vera", name: "Vera" },
    ],
  },
  "/api/bots/attention": { bots: [] },
  "/api/routines": {
    routines: [],
    sweep: { lastSweptAt: null, working: false },
  },
};
beforeEach(() => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const body = answers[String(input).split("?")[0] ?? ""];
    return body === undefined
      ? new Response(null, { status: 404 })
      : json(body);
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = original;
});

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

function draw(page: "bots" | "skills" | "engines" | "dashboard" | "home") {
  const root = createRootRoute({ component: Outlet });
  let start = "/";
  let tree: AnyRoute;
  const routes: Record<string, [{ update: (o: unknown) => unknown }, string]> =
    {
      bots: [BotsRoute as never, "/bots"],
      skills: [SkillsRoute as never, "/capabilities/skills"],
    };
  const hit = routes[page];
  if (hit) {
    start = hit[1];
    tree = root.addChildren([
      hit[0].update({
        id: hit[1],
        path: hit[1],
        getParentRoute: () => root,
      }) as never,
    ]);
  } else {
    const Component = (
      {
        engines: FreeDuetEngines,
        dashboard: FreeDuetDashboard,
        home: () => <SettingsHome isAdmin />,
      } as Record<string, () => React.ReactNode>
    )[page];
    tree = root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/",
        component: Component,
      }),
    ]);
  }
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  return render(
    <QueryClientProvider client={client()}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

/** Every control the person can use, as "tag name": links by address, the rest by their words; the back-link row of the light header is left out. */
function controls(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll(
    "a, button, input, select, textarea, [role=tab], [role=switch]",
  )) {
    if (el.closest(".fdl-crumbs")) continue;
    const word =
      el.tagName === "A"
        ? (el.getAttribute("href") ?? "")
        : (el.getAttribute("aria-label") ??
          el.textContent?.trim() ??
          el.getAttribute("name") ??
          "");
    out.push(`${el.tagName.toLowerCase()} ${word}`.trim());
  }
  return out.sort();
}

async function settled(view: ReturnType<typeof draw>, text: string) {
  await view.findByText(text, {}, { timeout: 4000 });
  await waitFor(() => {}, { timeout: 100 }).catch(() => {});
}

const PAGES = {
  bots: "Leo",
  skills: "Skill 1",
  engines: "Engines and their state",
} as const;
const EXPECTED: Record<keyof typeof PAGES, string[]> = {
  bots: [
    "a /bots/leo",
    "a /bots/vera",
    "a /bots?new=true",
    "button Download team file",
    "button Show",
  ],
  skills: [
    "a /capabilities/memory",
    "a /capabilities/skills",
    "a /capabilities/skills?new=true",
    "button",
    "button",
  ],
  engines: [
    "button Load list",
    "button Test",
    "input",
    "input",
    "input",
    "input Ask me first for Leo",
    "input Ask me first for Vera",
    "input Switch automatically for Leo",
    "input Switch automatically for Vera",
    "span Switch on Ollama",
  ],
};

for (const page of ["bots", "skills", "engines"] as const) {
  test(`${page}: every control of the page is still there`, async () => {
    const view = draw(page);
    await settled(view, PAGES[page]);
    const found = controls(view.container);
    expect(found).toEqual(EXPECTED[page]);
  });
}

for (const [page, title] of [
  ["bots", "Bots"],
  ["skills", "Capabilities"],
  ["engines", "Engines"],
] as const) {
  test(`${page}: a back link to the settings home, the title and one sentence in the light design`, async () => {
    const view = draw(page);
    await settled(view, PAGES[page]);
    const head = view.container.querySelector("[data-testid=light-header]");
    expect(head).not.toBeNull();
    expect(
      head
        ?.querySelector("[data-testid=back-to-settings]")
        ?.getAttribute("href"),
    ).toBe("/settings");
    expect(head?.textContent).toContain("← Settings");
    expect(head?.querySelector("h1")?.textContent).toBe(title);
    expect(head?.querySelector("p")?.textContent?.length).toBeGreaterThan(20);
    expect(view.container.querySelector(".fdl")).not.toBeNull();
  });
}

test("the dashboard and the settings home still draw, and read the shared tokens", async () => {
  const dash = draw("dashboard");
  await dash.findByText("Team");
  expect(dash.container.querySelector(".fd-dash")).not.toBeNull();
  cleanup();
  const home = draw("home");
  await home.findByTestId("settings-engines");
  expect(home.container.querySelector(".fdh")).not.toBeNull();
  const fs = await import("node:fs");
  const read = (f: string) =>
    fs.readFileSync(new URL(`../src/freeduet/${f}`, import.meta.url), "utf8");
  for (const css of [
    "dashboard.css",
    "settings-home.css",
    "light/light-page.css",
  ]) {
    expect(read(css)).toContain("var(--fdl-");
  }
  const tokens = read("light/tokens.css");
  for (const css of ["dashboard.css", "settings-home.css"]) {
    expect(read(css)).not.toMatch(/#6430ab|#f6f7fb/i);
  }
  expect(tokens).toMatch(/--fdl-accent: #6430ab/);
  expect(tokens).toMatch(/--fdl-bg: #f6f7fb/);
});
