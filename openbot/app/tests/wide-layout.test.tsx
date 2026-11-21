import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  bandForWidth,
  useWideBand,
  useWideBandOfWindow,
} from "@/freeduet/wide/band";
import { WideFrame } from "@/freeduet/wide/frame";
import {
  MASCOT_KEYS,
  MascotSprite,
  MEMBER_MASCOT,
  MemberFace,
  mascotKeyOf,
} from "@/freeduet/wide/mascot";
import drawn from "@/freeduet/wide/mascot-drawn.json";
import { memberStates, memberTarget, orderTeam } from "@/freeduet/wide/team";
import { type AgentProfile, agentKeys } from "@/lib/agents/queries";
import { approvalInboxOptions } from "@/lib/approvals";
import { channelKeys } from "@/lib/channels/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * D55: the wide layout. Below 1024 px nothing is drawn that was not drawn before; from 1024 the team
 * column is there as faces, from 1280 with names and what each member is doing. The thirteen members
 * have the thirteen drawings of 18 November 2026, and a member somebody trained has the plain one.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
const realFetch = globalThis.fetch;
beforeAll(() => {
  // Whatever the frame asks that the test did not seed is answered with an empty reply.
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/openduet/tasks") return Response.json({ tasks: [] });
      if (url.startsWith("/api/bots/attention"))
        return Response.json({ bots: [] });
      return Response.json({});
    },
    {
      preconnect: realFetch.preconnect,
    },
  ) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  await settleReactWork();
  GlobalRegistrator.unregister();
});

/** A window `width` px wide, as `matchMedia` answers the two `min-width` queries the layout asks. */
function windowOf(width: number) {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? "0");
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }) as unknown as typeof window.matchMedia;
}

const TEAM: [string, string, string][] = [
  ["freeduet", "Iris", "Chief of Staff"],
  ["creator", "Leo", "Creator"],
  ["inbox", "Otto", "Inbox"],
  ["counsel", "Portia", "Counsel"],
  ["bookkeeper", "Penny", "Bookkeeper"],
  ["concierge", "Jules", "Concierge"],
  ["writer", "Wren", "Writer"],
  ["fixer", "Gus", "Fixer"],
  ["chef", "Basil", "Chef"],
  ["reviewer", "Vera", "Reviewer"],
  ["marketer", "Mark", "Marketer"],
  ["video", "Cam", "Video maker"],
  ["trainer", "Rex", "Model trainer"],
];

const agent = (id: string, name: string, title: string): AgentProfile =>
  ({
    id,
    name,
    title,
    hidden: false,
    builtIn: true,
    canManage: false,
    mine: false,
    pinned: false,
    systemOwned: true,
    visibility: "public",
  }) as unknown as AgentProfile;

const roster = [
  ...TEAM.map(([id, name, title]) => agent(id, name, title)),
  agent("my-own-1", "Pip", "Trained by me"),
];

const waitingMail = {
  id: "ap-1",
  status: "pending",
  createdAt: "2026-11-16T10:00:00Z",
  action: {
    botId: "inbox",
    toolRef: "gmail/GMAIL_SEND_EMAIL",
    effect: "write",
    scope: "x@example.com",
    threadId: "t",
    args: {},
    target: {},
  },
};

function draw(width: number, children: ReactNode = <p>Right side</p>) {
  windowOf(width);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(agentKeys.list(false), roster);
  client.setQueryData(approvalInboxOptions().queryKey, {
    enabled: true,
    requests: [waitingMail],
    rules: [],
    teamRules: [],
    questions: [],
  });
  client.setQueryData(channelKeys.list(), {
    pages: [{ channels: [], nextCursor: null }],
    pageParams: [""],
  });
  function Frame() {
    const band = useWideBandOfWindow();
    return (
      <WideFrame
        band={band}
        onMenu={() => {}}
        onNewChannel={() => {}}
        tab="chat"
      >
        {children}
      </WideFrame>
    );
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Frame }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("the three bands: phone and tablet below 1024, faces to 1279, the full column from 1280", () => {
  expect(bandForWidth(390)).toBe("off");
  expect(bandForWidth(768)).toBe("off");
  expect(bandForWidth(1023)).toBe("off");
  expect(bandForWidth(1024)).toBe("faces");
  expect(bandForWidth(1279)).toBe("faces");
  expect(bandForWidth(1280)).toBe("full");
  expect(bandForWidth(1920)).toBe("full");
});

test("the window's band follows matchMedia at 390, 1023, 1024, 1279, 1280 and 1920", () => {
  const seen: Record<number, string> = {};
  for (const width of [390, 1023, 1024, 1279, 1280, 1920]) {
    windowOf(width);
    function Probe() {
      seen[width] = useWideBandOfWindow();
      return null;
    }
    render(<Probe />);
    cleanup();
  }
  expect(seen).toEqual({
    390: "off",
    1023: "off",
    1024: "faces",
    1279: "faces",
    1280: "full",
    1920: "full",
  });
});

test("outside the wide frame the band is off, so a card or a conversation is what it was", () => {
  let band = "";
  function Probe() {
    band = useWideBand();
    return null;
  }
  render(<Probe />);
  expect(band).toBe("off");
});

test("below 1024 the frame draws its children and nothing else: no column, no sprite", async () => {
  const view = draw(1023);
  expect(await view.findByText("Right side")).toBeTruthy();
  expect(view.container.querySelector("aside")).toBeNull();
  expect(view.container.querySelector("[data-wide-frame]")).toBeNull();
  expect(view.container.querySelector("svg")).toBeNull();
  cleanup();
  const phone = draw(390);
  await phone.findByText("Right side");
  expect(phone.container.querySelector("aside")).toBeNull();
});

test("at 1280 the column lists all thirteen members, plus one of the person's own, with names and states", async () => {
  const view = draw(1280);
  const list = await view.findByTestId("team-list");
  const rows = within(list).getAllByRole("link");
  expect(rows).toHaveLength(14);
  const names = rows.map(
    (row) => row.getAttribute("aria-label")?.split(",")[0],
  );
  expect(names.slice(0, 13)).toEqual([
    "Iris",
    "Otto",
    "Portia",
    "Penny",
    "Jules",
    "Wren",
    "Vera",
    "Gus",
    "Basil",
    "Mark",
    "Cam",
    "Rex",
    "Leo",
  ]);
  expect(names[13]).toBe("Pip");
  // Otto has a card waiting in the inbox: his state says so, the others show their job.
  expect(within(list).getByText("Waiting for you")).toBeTruthy();
  expect(within(list).getByText("Chief of Staff")).toBeTruthy();
  const column = view.container.querySelector("aside");
  expect(column?.getAttribute("data-band")).toBe("full");
});

test("from 1024 to 1279 the column is faces and icons, and every row still has its name for a screen reader", async () => {
  const view = draw(1100);
  const list = await view.findByTestId("team-list");
  const rows = within(list).getAllByRole("link");
  expect(rows).toHaveLength(14);
  expect(view.container.querySelector("aside")?.getAttribute("data-band")).toBe(
    "faces",
  );
  // No visible name in a row, but the accessible name carries the member and the state.
  expect(rows[1]?.textContent).toBe("");
  expect(rows[1]?.getAttribute("aria-label")).toBe("Otto, Waiting for you");
  const main = within(
    view.container.querySelector("nav[aria-label='Main']") as HTMLElement,
  );
  expect(
    main.getAllByRole("link").map((link) => link.getAttribute("href")),
  ).toEqual(["/", "/tasks", "/make"]);
});

test("the column's three destinations are the tab bar's three, with Tasks' count in full", async () => {
  const view = draw(1440);
  const nav = await view.findByRole("navigation", { name: "Main" });
  const links = within(nav).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/",
    "/tasks",
    "/make",
  ]);
  expect(links.map((link) => link.textContent?.replace(/\d+$/, ""))).toEqual([
    "Chat",
    "Tasks",
    "Make",
  ]);
});

test("the faces come from the drawings: thirteen art keys, every member mapped to its own", () => {
  expect(MASCOT_KEYS).toHaveLength(13);
  const ids = TEAM.map(([id]) => id);
  const keys = ids.map((id) => mascotKeyOf(id));
  expect(new Set(keys).size).toBe(13);
  for (const key of keys) expect(MASCOT_KEYS).toContain(key as string);
  expect(Object.keys(MEMBER_MASCOT).sort()).toEqual([...ids].sort());
});

test("each of the thirteen faces draws its own symbol, and a trained member gets the plain face", () => {
  const view = render(
    <div>
      <MascotSprite />
      {[...TEAM.map(([id]) => id), "my-own-1"].map((id) => (
        <MemberFace agentId={id} key={id} />
      ))}
    </div>,
  );
  const faces = [...view.container.querySelectorAll("svg[data-face]")];
  expect(faces.map((face) => face.getAttribute("data-face"))).toEqual([
    "iris",
    "leo",
    "otto",
    "portia",
    "penny",
    "jules",
    "wren",
    "gus",
    "basil",
    "vera",
    "mark",
    "video",
    "rex",
    "neutral",
  ]);
  // Every face points at a symbol the sprite really defines.
  for (const face of faces) {
    const target = face.querySelector("use")?.getAttribute("href") ?? "";
    expect(view.container.querySelector(target)).not.toBeNull();
  }
  expect(Object.keys(drawn.team)).toHaveLength(13);
});

test("the order, the states and where a row goes", () => {
  expect(
    orderTeam(roster)
      .map((a) => a.name)
      .slice(0, 3),
  ).toEqual(["Iris", "Otto", "Portia"]);
  const states = memberStates(
    {
      enabled: true,
      requests: [waitingMail],
      rules: [],
      teamRules: [],
      questions: [],
    } as never,
    [{ id: "c1", busy: true, agentIds: ["writer"] }] as never,
  );
  expect(states.get("inbox")).toBe("waiting");
  expect(states.get("writer")).toBe("working");
  expect(states.get("chef")).toBeUndefined();
  const iris = roster[0] as AgentProfile;
  const otto = roster.find((a) => a.id === "inbox") as AgentProfile;
  expect(memberTarget(iris, "freeduet", [])).toEqual({ to: "/" });
  expect(memberTarget(otto, "freeduet", [])).toEqual({
    to: "/channel/new",
    agent: "inbox",
  });
  expect(
    memberTarget(otto, "freeduet", [
      { id: "old", active: true, agentIds: ["inbox"], taskId: null },
    ] as never),
  ).toEqual({ to: "/channel/$channelId", channelId: "old" });
  // A task's own conversation is not the member's conversation.
  expect(
    memberTarget(otto, "freeduet", [
      { id: "t1", active: true, agentIds: ["inbox"], taskId: "task" },
    ] as never),
  ).toEqual({ to: "/channel/new", agent: "inbox" });
});
void act;
