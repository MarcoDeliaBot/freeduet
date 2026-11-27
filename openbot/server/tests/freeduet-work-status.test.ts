/** D168: who is working and on what: the label mapping, the states with a fake clock, and `GET /api/freeduet/work-status`. */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  buildWorkStatus,
  createWorkNotes,
  type HopRow,
  handoffNoteKey,
  STUCK_AFTER_MS,
  stepLabel,
} from "../src/freeduet/work-status";
import { createWorkStatusRoutes } from "../src/freeduet/work-status-routes";

const NOW = Date.parse("2026-11-27T10:00:00Z");
const work = {
  fromBotId: "iris",
  toBotId: "kai",
  toName: "Kai",
  threadId: "t1",
  runId: "r1",
  task: "Build a small game",
  actorId: "p1",
};
const hop = (over: Partial<HopRow> = {}, payload: object = work): HopRow => ({
  key: "k1",
  payload,
  attempts: 1,
  claimedBy: "w",
  leaseUntil: new Date(NOW + 60_000),
  finishedAt: null,
  lastError: null,
  updatedAt: new Date(NOW - 4 * 60_000),
  ...over,
});
const build = (
  hops: HopRow[],
  notes: ReturnType<typeof createWorkNotes>,
  now: number,
  needsYou = new Map<string, number>(),
) =>
  buildWorkStatus({
    hops,
    notes,
    needsYou,
    names: new Map(),
    now,
    maxAttempts: 3,
  });

describe("stepLabel", () => {
  test("maps a tool name to plain words and ignores the prefix", () => {
    expect(stepLabel("mcp__freeduet__computer_write_file")).toBe(
      "writing a file",
    );
    expect(stepLabel("computer_read_file")).toBe("reading files");
    expect(stepLabel("computer_run_command")).toBe("running a command");
    expect(stepLabel("computer_navigate")).toBe("reading a page");
    expect(stepLabel("computer_click")).toBe("using a page");
    expect(stepLabel("something_new")).toBe("working");
    expect(stepLabel(undefined)).toBe("working");
  });
});

describe("states with a fake clock", () => {
  test("working, then stuck exactly after five minutes without an event", () => {
    let clock = NOW - 4 * 60_000;
    const notes = createWorkNotes(() => clock);
    const key = handoffNoteKey(work);
    notes.begin(key);
    clock = NOW - 10_000;
    notes.event(key, "TOOL_CALL_START", "computer_write_file");
    const live = build([hop()], notes, NOW);
    expect(live.handoffs[0]?.state).toBe("working");
    expect(live.handoffs[0]?.lastStep?.label).toBe("writing a file");
    expect(live.members[0]).toMatchObject({ agentId: "kai", state: "working" });

    const held = hop({ leaseUntil: new Date(NOW + 20 * 60_000) });
    const later = build([held], notes, clock + STUCK_AFTER_MS - 1);
    expect(later.handoffs[0]?.state).toBe("working");
    const stuck = build([held], notes, clock + STUCK_AFTER_MS);
    expect(stuck.handoffs[0]?.state).toBe("stuck");
    expect(stuck.members[0]?.state).toBe("stuck");
  });

  test("a text event is a sign of life but never a step", () => {
    let clock = NOW - 60_000;
    const notes = createWorkNotes(() => clock);
    const key = handoffNoteKey(work);
    notes.begin(key);
    notes.event(key, "TEXT_MESSAGE_CONTENT");
    expect(notes.get(key)?.step).toBeNull();
    clock = NOW;
    expect(build([hop()], notes, NOW).handoffs[0]?.state).toBe("working");
  });

  test("a card waiting on the person is waiting; a finished hop is done; a stopped one is hidden", () => {
    const notes = createWorkNotes(() => NOW);
    expect(
      build([hop()], notes, NOW, new Map([["kai", 1]])).handoffs[0]?.state,
    ).toBe("waiting");
    const done = build(
      [hop({ finishedAt: new Date(NOW - 60_000) })],
      notes,
      NOW,
    );
    expect(done.handoffs[0]?.state).toBe("done");
    expect(done.members).toEqual([]);
    expect(
      build(
        [
          hop({
            finishedAt: new Date(NOW - 60_000),
            lastError: "Stopped by the person",
          }),
        ],
        notes,
        NOW,
      ).handoffs,
    ).toEqual([]);
    expect(
      build([hop({ finishedAt: new Date(NOW - 3 * 3600_000) })], notes, NOW)
        .handoffs,
    ).toEqual([]);
  });

  test("a queued hop is not running and a hop that gave up needs the person", () => {
    const notes = createWorkNotes(() => NOW);
    expect(
      build(
        [hop({ claimedBy: null, leaseUntil: null, attempts: 0 })],
        notes,
        NOW,
      ).handoffs[0]?.state,
    ).toBe("queued");
    expect(
      build(
        [hop({ claimedBy: null, leaseUntil: null, attempts: 3 })],
        notes,
        NOW,
      ).handoffs[0]?.state,
    ).toBe("waiting");
  });

  test("the label never carries an argument, a path or the task", () => {
    const notes = createWorkNotes(() => NOW);
    const key = handoffNoteKey(work);
    notes.begin(key);
    notes.event(key, "TOOL_CALL_START", "computer_write_file");
    const out = JSON.stringify(
      build([hop()], notes, NOW).handoffs[0]?.lastStep,
    );
    expect(out).not.toMatch(/game|\.js|\/|http/);
  });
});

describe("GET /api/freeduet/work-status", () => {
  const app = (signedIn: boolean, rows: HopRow[] = [hop()]) => {
    const root = new Hono();
    root.route(
      "/api/freeduet/work-status",
      createWorkStatusRoutes(
        async (context, next) => {
          if (!signedIn) return context.json({ error: "no" }, 401);
          context.set("actor", { id: "p1" } as never);
          return next();
        },
        {
          hops: async () => rows,
          attention: async () => [],
        },
        createWorkNotes(() => NOW),
        () => NOW,
      ),
    );
    return root;
  };

  test("nobody signed in is refused", async () => {
    expect((await app(false).request("/api/freeduet/work-status")).status).toBe(
      401,
    );
  });

  test("a signed-in person gets the shape, uncached, with no secret", async () => {
    const response = await app(true).request("/api/freeduet/work-status");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as {
      handoffs: Array<Record<string, unknown>>;
      members: Array<Record<string, unknown>>;
      at: string;
    };
    expect(Object.keys(body).sort()).toEqual(["at", "handoffs", "members"]);
    expect(Object.keys(body.handoffs[0] ?? {}).sort()).toEqual([
      "fromBotId",
      "id",
      "lastEventAt",
      "lastStep",
      "since",
      "state",
      "threadId",
      "title",
      "toBotId",
      "toName",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/actorId|p1"/);
  });

  test("it answers GET only", async () => {
    const response = await app(true).request("/api/freeduet/work-status", {
      method: "POST",
    });
    expect([404, 405]).toContain(response.status);
  });
});
