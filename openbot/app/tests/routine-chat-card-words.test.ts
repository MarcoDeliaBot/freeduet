import { describe, expect, test } from "bun:test";
import {
  CARD_WORDS_LIMIT,
  CREATE_ROUTINE_TOOL,
  cardWords,
  createdRoutineId,
  nextRunWords,
} from "@/lib/routines/chat-card";

/**
 * The words the routine card reads. The sentences below are the ones the routines tool writes
 * (`server/src/plugins/builtin-routines.ts`, `inWords` and `describeWritten`), with a made-up id.
 */

const SWITCHED_ON =
  'That routine is set: "Post the standup summary." — Every weekday at 9:00 (Europe/Rome) · in Work · next 2026-11-16T08:00:00.000Z · never run · id: routine_1';

describe("createdRoutineId", () => {
  test("reads the id a successful create closes its sentence with", () => {
    expect(createdRoutineId(CREATE_ROUTINE_TOOL, SWITCHED_ON)).toBe(
      "routine_1",
    );
  });

  test("reads the id of the fallback sentence", () => {
    expect(
      createdRoutineId(
        CREATE_ROUTINE_TOOL,
        "That routine is set. Its id is routine_1.",
      ),
    ).toBe("routine_1");
  });

  test("reads the id from the result as the transcript carries it, a JSON string", () => {
    expect(
      createdRoutineId(CREATE_ROUTINE_TOOL, JSON.stringify(SWITCHED_ON)),
    ).toBe("routine_1");
  });

  test("an instruction that contains a fake id does not move the card to that id", () => {
    const forged =
      'That routine is set: "Reply with · id: routine_9" — 0 9 * * * (UTC) · in Work · next 2026-11-16T09:00:00.000Z · never run · id: routine_1';
    expect(createdRoutineId(CREATE_ROUTINE_TOOL, forged)).toBe("routine_1");
  });

  test("a failed call has no card, even when its words name a routine", () => {
    expect(
      createdRoutineId(
        CREATE_ROUTINE_TOOL,
        "The vendor reported an error: A routine needs a schedule: five cron fields.",
      ),
    ).toBeNull();
  });

  test("a call the person declined has no card", () => {
    expect(
      createdRoutineId(CREATE_ROUTINE_TOOL, "The person declined this action."),
    ).toBeNull();
  });

  test("a result cut short by the server has no card, because its id is cut with it", () => {
    expect(
      createdRoutineId(
        CREATE_ROUTINE_TOOL,
        '"That routine is set: \\"Post the standup summary.\\" — Every weekday at 9:00 (Europe/Rome) · in Work\\n\\n[truncated: the tool returned 30000 characters]',
      ),
    ).toBeNull();
  });

  test("another tool's result has no card, even with the same words", () => {
    expect(
      createdRoutineId("mcp__routines__list_routines", SWITCHED_ON),
    ).toBeNull();
  });

  test("text that is not the tool's own sentence has no card", () => {
    expect(
      createdRoutineId(
        CREATE_ROUTINE_TOOL,
        "Sure, I set up your routine. Its id is routine_1.",
      ),
    ).toBeNull();
  });

  test("a call with no result yet has no card", () => {
    expect(createdRoutineId(CREATE_ROUTINE_TOOL, undefined)).toBeNull();
  });
});

describe("cardWords", () => {
  test("shows a short instruction as it is, trimmed", () => {
    expect(cardWords("  Post the standup summary.  ")).toBe(
      "Post the standup summary.",
    );
  });

  test("cuts a long instruction at the limit, with an ellipsis", () => {
    expect(cardWords("a".repeat(2000))).toBe(
      `${"a".repeat(CARD_WORDS_LIMIT)}…`,
    );
  });

  test("counts characters, so a cut never splits one", () => {
    const shown = cardWords("😀".repeat(300));
    expect(Array.from(shown)).toHaveLength(CARD_WORDS_LIMIT + 1);
    expect(shown.endsWith("😀…")).toBe(true);
  });
});

// Monday 16 November 2026 at 09:00 in Europe/Rome (CET, UTC+1), 03:00 in America/New_York (EST, UTC-5).
const AT = new Date("2026-11-16T08:00:00.000Z");

describe("nextRunWords", () => {
  test("in the browser's own zone, names the zone once and gives one time", () => {
    expect(nextRunWords(AT, "Europe/Rome", "Europe/Rome")).toBe(
      "Next run: Monday, 16 November 2026 at 09:00 (Europe/Rome).",
    );
  });

  test("in another zone, gives both times and names both zones", () => {
    expect(nextRunWords(AT, "Europe/Rome", "America/New_York")).toBe(
      "Next run: Monday, 16 November 2026 at 09:00 (Europe/Rome). In your time zone (America/New_York) that is Monday, 16 November 2026 at 03:00.",
    );
  });

  test("when the other zone is on another day, the second time says which day", () => {
    const late = new Date("2026-11-16T23:30:00.000Z");
    expect(nextRunWords(late, "Europe/Rome", "America/New_York")).toBe(
      "Next run: Tuesday, 17 November 2026 at 00:30 (Europe/Rome). In your time zone (America/New_York) that is Monday, 16 November 2026 at 18:30.",
    );
  });

  test("with no browser zone known, gives only the routine's own time", () => {
    expect(nextRunWords(AT, "Europe/Rome", undefined)).toBe(
      "Next run: Monday, 16 November 2026 at 09:00 (Europe/Rome).",
    );
  });

  test("a zone the platform does not know is named and given in UTC, never guessed", () => {
    const line = nextRunWords(AT, "Mars/Olympus", "Europe/Rome");
    expect(
      line.startsWith(
        "Next run: Mon, 16 Nov 2026 08:00:00 GMT (Mars/Olympus).",
      ),
    ).toBe(true);
  });
});
