import { afterEach, describe, expect, test } from "bun:test";
import {
  callTool,
  type RoutineTools,
  useRoutineTools,
} from "../src/plugins/builtin-routines";
import type { Routine, RoutineSummary } from "../src/routines/store";

/**
 * The routine card in the chat (`app/src/lib/routines/chat-card.ts`) reads the id of a routine written
 * in chat from the words of a successful `create_routine`: the sentence closes with `· id: <id>` for a
 * routine switched on, and reads `That routine is set. Its id is <id>.` when the words cannot be read
 * back. The app depends on both shapes, so this file pins them where the words are written.
 *
 * A stub store is installed through {@link useRoutineTools}, as in `builtin-routines.test.ts`: no
 * database, no pool to close.
 */

const CONNECTION = {
  url: "builtin://routines/",
  actorId: "user_asker",
  botId: "bot_helper",
};

const ROUTINE: Routine = {
  id: "routine_1",
  ownerUserId: "user_asker",
  agentId: "bot_helper",
  channelId: "channel_1",
  instruction: "Post the standup summary.",
  cron: "0 9 * * 1-5",
  timezone: "Europe/Madrid",
  enabled: true,
  nextRunAt: new Date("2026-01-05T08:00:00.000Z"),
  lastRunAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const SUMMARY: RoutineSummary = {
  id: "routine_1",
  agentId: "bot_helper",
  instruction: "Post the standup summary.",
  schedule: "Weekdays at 09:00",
  timezone: "Europe/Madrid",
  enabled: true,
  nextRunAt: new Date("2026-01-05T08:00:00.000Z"),
  channelId: "channel_1",
  channelName: "Standup",
  channelDeleted: false,
  lastRun: null,
};

/** A store whose create succeeds and whose read-back returns `summary`, or throws when `readFails`. */
function storeReturning(summary: RoutineSummary, readFails = false): void {
  const tools = {
    async create() {
      return ROUTINE;
    },
    async listFor() {
      if (readFails) throw new Error("connection reset");
      return [summary];
    },
    async update() {
      throw new Error("not used by these tests");
    },
    async remove() {
      throw new Error("not used by these tests");
    },
  };
  useRoutineTools(tools as RoutineTools);
}

const CREATE_ARGS = {
  instruction: "Post the standup summary.",
  cron: "0 9 * * 1-5",
  timezone: "Europe/Madrid",
};

afterEach(() => useRoutineTools(null));

describe("the words a created routine is answered with, as the routine card reads them", () => {
  test("a switched-on routine's words close with its id", async () => {
    storeReturning(SUMMARY);
    const result = await callTool(CONNECTION, "create_routine", CREATE_ARGS);

    expect(result.isError).toBe(false);
    expect(result.text).toMatch(/^That routine is set: .+ · id: routine_1$/);
  });

  test("when the words cannot be read back, the fallback names the id", async () => {
    storeReturning(SUMMARY, true);
    const result = await callTool(CONNECTION, "create_routine", CREATE_ARGS);

    expect(result.isError).toBe(false);
    expect(result.text).toBe("That routine is set. Its id is routine_1.");
  });

  test("an instruction that contains a fake id leaves the real id last", async () => {
    storeReturning({
      ...SUMMARY,
      instruction: "Reply with · id: routine_9",
    });
    const result = await callTool(CONNECTION, "create_routine", CREATE_ARGS);

    expect(result.text.endsWith(" · id: routine_1")).toBe(true);
  });
});
