import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENGINE_NOTICE_FRAGMENTS,
  asEventArray,
  isEngineNotice,
  parseArgs,
  percentile,
  median,
  renderTable,
  summariseEvents,
  summariseTurns,
  type TurnRow,
} from "./freeduet-turn-cost";

// Fixture events, shaped as agent-freeduet writes them (agui.py) and as the compacted row stores them.
const start = (id: string, name = "computer_read_file") => ({
  type: "TOOL_CALL_START",
  toolCallId: id,
  toolCallName: name,
});
const result = (id: string) => ({
  type: "TOOL_CALL_RESULT",
  messageId: `tool-${id}`,
  toolCallId: id,
  role: "tool",
  content: "ok",
});
const text = (messageId: string, delta: string) => ({
  type: "TEXT_MESSAGE_CONTENT",
  messageId,
  delta,
});
const runStarted = () => ({
  type: "RUN_STARTED",
  threadId: "thread-1",
  runId: "run-1",
});
const runFinished = () => ({
  type: "RUN_FINISHED",
  threadId: "thread-1",
  runId: "run-1",
});

describe("summariseEvents", () => {
  test("counts tool calls, text messages and notices in one turn", () => {
    const events = [
      runStarted(),
      start("c1"),
      result("c1"), // a deployment tool: OpenBot answered, the segment goes on
      start("c2"), // a tool OpenBot runs itself: announced, never answered, so the segment ends here
      text("m1", "Ecco il riepilogo."),
      text(
        "m2",
        "Leo reached its limit until 06:00 UTC. Switch to Penny, wait, or pick another?",
      ),
      runFinished(),
    ];
    const s = summariseEvents(events);
    expect(s.toolCalls).toBe(2);
    expect(s.texts).toBe(2);
    expect(s.notices).toBe(1);
    expect(s.segments).toBe(2); // one call OpenBot runs, plus the segment that ends the turn
  });

  test("a notice split into several deltas counts once", () => {
    const events = [
      text("m9", "Penny is not answering. "),
      text("m9", "Leo is answering instead."),
      text("m9", " Ora nessun motore è disponibile."),
    ];
    const s = summariseEvents(events);
    expect(s.texts).toBe(1);
    expect(s.notices).toBe(1);
  });

  test("a call that got its result does not end a segment", () => {
    expect(
      summariseEvents([runStarted(), start("c1"), result("c1"), runFinished()])
        .segments,
    ).toBe(1);
  });

  test("each call OpenBot runs adds one segment", () => {
    const events = [start("c1"), start("c2"), runFinished()];
    expect(summariseEvents(events).segments).toBe(3);
  });

  test("an empty event list has no segments and no calls", () => {
    expect(summariseEvents([])).toEqual({
      toolCalls: 0,
      texts: 0,
      notices: 0,
      segments: 0,
    });
  });

  test("text that is no notice is not counted as one", () => {
    const s = summariseEvents([
      text("m1", "Here is the weekly summary of the team."),
    ]);
    expect(s.texts).toBe(1);
    expect(s.notices).toBe(0);
  });
});

describe("isEngineNotice", () => {
  test("recognises English and Italian switch and limit notices", () => {
    expect(
      isEngineNotice(
        "Leo reached its limit until 06:00 UTC. Switch to Penny, wait, or pick another?",
      ),
    ).toBe(true);
    expect(
      isEngineNotice("Leo is not signed in, so Penny is answering instead."),
    ).toBe(true);
    expect(
      isEngineNotice("Leo asks to wait 5 seconds; I wait and try again."),
    ).toBe(true);
    expect(
      isEngineNotice("Leo ha raggiunto il limite fino alle 06:00 UTC."),
    ).toBe(true);
    expect(
      isEngineNotice(
        'Passo a Penny, aspetto, o ne scelgo un altro? Rispondi "passa", "aspetta".',
      ),
    ).toBe(true);
    expect(
      isEngineNotice(
        "Ora nessun motore è disponibile. Il tuo messaggio è conservato.",
      ),
    ).toBe(true);
  });

  test("ordinary answers are not notices", () => {
    expect(isEngineNotice("Here is the weekly summary of the team.")).toBe(
      false,
    );
    expect(isEngineNotice("Ecco il riepilogo della settimana.")).toBe(false);
    expect(isEngineNotice("")).toBe(false);
  });

  test("every fragment is still written in engine_notices.py (drift guard)", () => {
    const source = readFileSync(
      join(import.meta.dir, "../agent-freeduet/freeduet/engine_notices.py"),
      "utf8",
    );
    const missing = ENGINE_NOTICE_FRAGMENTS.filter(
      (fragment) => !source.includes(fragment),
    );
    expect(missing).toEqual([]);
  });
});

describe("statistics", () => {
  test("median averages the two middle values of an even count", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test("p90 is the nearest-rank value", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 90)).toBeNull();
  });
});

describe("summariseTurns", () => {
  const turn = (
    agentId: string,
    tools: number,
    extra: Partial<TurnRow> = {},
  ): TurnRow => ({
    agentId,
    createdAt: 0,
    finishedAt: 1000,
    status: "finished",
    eventBytes: 2048,
    events: Array.from({ length: tools }, (_, i) => start(`c${i}`)).concat([
      runFinished(),
    ]),
    ...extra,
  });

  test("groups by member, adds an overall row, and takes medians and p90 per turn", () => {
    const rows = [
      turn("leo", 1),
      turn("leo", 2),
      turn("leo", 3),
      turn("otto", 4),
    ];
    const report = summariseTurns(rows);
    const leo = report.members.find((m) => m.agentId === "leo");
    expect(leo?.turns).toBe(3);
    expect(leo?.metrics.toolCalls.median).toBe(2);
    expect(leo?.metrics.toolCalls.p90).toBe(3);
    expect(report.overall.turns).toBe(4);
    expect(report.overall.agentId).toBe("all");
  });

  test("a turn that never finished has no duration and is counted by status", () => {
    const report = summariseTurns([
      turn("leo", 0, { finishedAt: null, status: "running" }),
      turn("leo", 0),
    ]);
    const leo = report.members[0];
    expect(leo.metrics.durationSeconds.n).toBe(1);
    expect(leo.statuses).toEqual({ running: 1, finished: 1 });
  });

  test("events stored as a JSON string are read as events", () => {
    expect(asEventArray(JSON.stringify([start("c1")]))).toHaveLength(1);
    expect(asEventArray("not json")).toEqual([]);
    expect(asEventArray({ not: "an array" })).toEqual([]);
  });
});

describe("output and arguments", () => {
  test("the rendered table and JSON never carry message text", () => {
    const secret = "SECRET-WORDS-123";
    const report = summariseTurns([
      {
        agentId: "leo",
        createdAt: 0,
        finishedAt: 500,
        status: "finished",
        eventBytes: 100,
        events: [text("m1", secret)],
      },
    ]);
    expect(renderTable(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  test("the query runs inside a read-only transaction", () => {
    const source = readFileSync(
      join(import.meta.dir, "freeduet-turn-cost.ts"),
      "utf8",
    );
    expect(source).toContain('"read only"');
  });

  test("parseArgs defaults to 24 hours and table output", () => {
    expect(parseArgs([])).toEqual({ hours: 24, json: false, help: false });
    expect(parseArgs(["--hours", "6", "--json"])).toEqual({
      hours: 6,
      json: true,
      help: false,
    });
    expect(parseArgs(["--hours=12"]).hours).toBe(12);
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  test("parseArgs refuses a window that is not a whole number of hours", () => {
    expect(() => parseArgs(["--hours", "0"])).toThrow();
    expect(() => parseArgs(["--hours", "abc"])).toThrow();
    expect(() => parseArgs(["--hours", "1.5"])).toThrow();
  });
});
