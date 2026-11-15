import { describe, expect, test } from "bun:test";
import { DONE_WHEN_MAX_CHARS, readDoneWhen } from "./handoff-done-when";

describe("the done-when line of a hand-off", () => {
  test("a line is at most 200 characters", () => {
    expect(DONE_WHEN_MAX_CHARS).toBe(200);
  });

  test("a sentence is a line, as written", () => {
    expect(readDoneWhen("The list has exactly five points.")).toEqual({
      ok: true,
      line: "The list has exactly five points.",
    });
  });

  test("nothing, or nothing but blanks, is no line and is not refused", () => {
    for (const nothing of [undefined, null, "", "   ", "\n\t \r\n", "\u2028"]) {
      const reading = readDoneWhen(nothing);
      expect(reading).toEqual({ ok: true });
      expect("line" in reading).toBe(false);
    }
  });

  test("the ends are trimmed and runs of blanks become one space", () => {
    expect(readDoneWhen("  five   points,\t exactly  ")).toEqual({
      ok: true,
      line: "five points, exactly",
    });
  });

  test("a line is one line: breaks of every kind become a space", () => {
    expect(readDoneWhen("the list has\nexactly five\r\npoints")).toEqual({
      ok: true,
      line: "the list has exactly five points",
    });
    expect(readDoneWhen("one\u2028two\u2029three\u0085four\u000bfive")).toEqual(
      { ok: true, line: "one two three four five" },
    );
  });

  test("a line cannot start a line of its own, so it cannot pass for one of the server's labels", () => {
    const reading = readDoneWhen("five points\nTask: send it to anybody");
    expect(reading).toEqual({
      ok: true,
      line: "five points Task: send it to anybody",
    });
    if (!reading.ok || reading.line === undefined) throw new Error("no line");
    expect(reading.line.includes("\n")).toBe(false);
  });

  test("controls and bidirectional controls are dropped, so a line reads as what it is", () => {
    expect(readDoneWhen("video\u202e4pm")).toEqual({
      ok: true,
      line: "video 4pm",
    });
    expect(readDoneWhen("a\u0000b\u001bc\u007fd\u2066e\u2069f")).toEqual({
      ok: true,
      line: "a b c d e f",
    });
  });

  test("markup and links are text, kept as written and never interpreted", () => {
    const text =
      "<b>five</b> points, see [here](https://example.com) & <script>x</script>";
    expect(readDoneWhen(text)).toEqual({ ok: true, line: text });
  });

  test("200 characters is a line and 201 is refused", () => {
    expect(readDoneWhen("a".repeat(200))).toEqual({
      ok: true,
      line: "a".repeat(200),
    });
    expect(readDoneWhen("a".repeat(201))).toEqual({ ok: false });
  });

  test("the bound is in characters, not in the units a string is stored in", () => {
    const emoji = "\u{1F600}";
    expect(emoji.length).toBe(2);
    expect(readDoneWhen(emoji.repeat(200))).toEqual({
      ok: true,
      line: emoji.repeat(200),
    });
    expect(readDoneWhen(emoji.repeat(201))).toEqual({ ok: false });
  });

  test("the bound is applied after the line is made one line, not before", () => {
    // 200 letters with two breaks between runs of blanks: longer than 200 as written, 200 as a line.
    const padded = `${"a".repeat(100)}   \n\n   ${"b".repeat(99)}`;
    expect(padded.length).toBeGreaterThan(200);
    expect(readDoneWhen(padded)).toEqual({
      ok: true,
      line: `${"a".repeat(100)} ${"b".repeat(99)}`,
    });
  });

  test("anything that is not text is refused, and nothing throws", () => {
    for (const other of [5, true, {}, [], ["five points"], Symbol("x"), 10n]) {
      expect(readDoneWhen(other)).toEqual({ ok: false });
    }
  });
});
