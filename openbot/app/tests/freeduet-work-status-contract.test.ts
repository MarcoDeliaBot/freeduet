/**
 * D168 contract: the app's real reader (`workStatusQueryOptions().queryFn`) reads the body the real route
 * sends. Only `fetch` is stubbed, and it answers with the route's own response. Before the envelope fix the
 * app got `undefined` for every poll, so the card could never show.
 */
import { afterEach, expect, test } from "bun:test";
import { workStatusQueryOptions } from "@/freeduet/work-status/status";
import {
  createWorkNotes,
  type HopRow,
} from "../../server/src/freeduet/work-status";
import { createWorkStatusRoutes } from "../../server/src/freeduet/work-status-routes";

const NOW = Date.parse("2026-11-27T10:00:00Z");
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const hop: HopRow = {
  key: "k-contract",
  payload: {
    fromBotId: "iris",
    toBotId: "kai",
    toName: "Kai",
    threadId: "t1",
    runId: "r1",
    task: "Build a small game",
    actorId: "p1",
  },
  attempts: 1,
  claimedBy: "w",
  leaseUntil: new Date(NOW + 60_000),
  finishedAt: null,
  lastError: null,
  updatedAt: new Date(NOW - 4 * 60_000),
};

test("the app's reader gets the handoffs and members the route sends", async () => {
  // The route as the server mounts it: the app's path is what it answers, `/` inside the route.
  const routes = createWorkStatusRoutes(
    async (context, next) => {
      context.set("actor", { id: "p1" } as never);
      return next();
    },
    { hops: async () => [hop], attention: async () => [] },
    createWorkNotes(() => NOW),
    () => NOW,
  );
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requested.push(String(input));
    return routes.request("/", init);
  }) as unknown as typeof fetch;

  const queryFn = workStatusQueryOptions().queryFn as unknown as () => Promise<{
    handoffs: Array<{ id: string; toName: string; state: string }>;
    members: Array<{ agentId: string; state: string }>;
    at: string;
  }>;
  const data = await queryFn();

  expect(requested).toEqual(["/api/freeduet/work-status"]);
  expect(data).toBeDefined();
  expect(data.handoffs.map((row) => row.toName)).toEqual(["Kai"]);
  expect(data.handoffs[0]?.state).toBe("working");
  expect(data.members.map((member) => member.agentId)).toContain("kai");
  expect(data.at).toBe(new Date(NOW).toISOString());
});
