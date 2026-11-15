import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { VisibleChatItem } from "../src/components/channels/chat-messages";
import {
  ToolActivity,
  type ToolGroup,
} from "../src/components/channels/tool-activity";
import { settleReactWork } from "./settle-react-work";

/**
 * A routine written as one step of a run of tool calls is folded into one line. Its card still has to
 * appear, under the fold, and a fold with no routine written in it has none.
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

type ToolItem = Extract<VisibleChatItem, { kind: "tool" }>;

function call(id: string, name: string, result?: string): ToolItem {
  return {
    kind: "tool",
    id,
    toolCall: {
      id,
      type: "function",
      function: { name, arguments: "{}" },
    },
    ...(result === undefined ? {} : { result }),
  };
}

const CREATED = JSON.stringify(
  'That routine is set: "Post the standup summary." — Every weekday at 9:00 (Europe/Rome) · in Work · next 2026-11-16T08:00:00.000Z · never run · id: routine_1',
);

function serving(): { fetched: string[] } {
  const fetched: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(input));
    return Response.json({
      routines: [
        {
          id: "routine_1",
          agentId: "bot_1",
          schedule: "Every weekday at 9:00",
          timezone: "Europe/Rome",
          instruction: "Post the standup summary.",
          channel: { id: "c1", name: "Work", gone: false },
          enabled: true,
          nextRunAt: "2026-11-16T08:00:00.000Z",
          lastRun: null,
        },
      ],
      sweep: { lastSweptAt: null, working: false },
    });
  }) as unknown as typeof fetch;
  return { fetched };
}

test("a routine written as one step of a folded run gets its card under the fold", async () => {
  serving();
  const group: ToolGroup = {
    kind: "tools",
    id: "g",
    steps: [
      call("list", "mcp__routines__list_routines", JSON.stringify("none")),
      call("make", "mcp__routines__create_routine", CREATED),
    ],
  };
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ToolActivity active={false} group={group} />
    </QueryClientProvider>,
  );

  expect(await view.findByText("Post the standup summary.")).toBeTruthy();
  expect(view.getByRole("region", { name: "Routine" }).textContent).toContain(
    "Next run: Monday, 16 November 2026 at 09:00 (Europe/Rome).",
  );
});

test("a folded run that wrote no routine has no card, and reads nothing", () => {
  const { fetched } = serving();
  const group: ToolGroup = {
    kind: "tools",
    id: "g",
    steps: [
      call("list", "mcp__routines__list_routines", JSON.stringify("none")),
    ],
  };
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ToolActivity active={false} group={group} />
    </QueryClientProvider>,
  );

  expect(view.queryByRole("region", { name: "Routine" })).toBeNull();
  // The approvals inbox is read by the fold's own approval slot; no routine is read for it.
  expect(fetched.filter((url) => url.startsWith("/api/routines"))).toEqual([]);
});
