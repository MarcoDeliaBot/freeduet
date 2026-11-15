/**
 * The "done when" line of a hand-off (docs/design/handoff-done-when.md).
 *
 * One sentence, written by the member who hands a job over, saying what counts as done: "the list has
 * exactly five points". The member who receives the job reads it, the person sees it under the
 * hand-off, and the member who asked is told it again when the answer comes back.
 *
 * ONE DEFINITION, ASKED OF FROM THREE PLACES. The tool that takes it and the desk that stores it
 * (`server/src/agents/handoff-tool.ts`, `handoff.ts`) and the row that draws it
 * (`app/src/lib/copilot/handoff-tool.tsx`) ask this file what a valid line is. A line the server would
 * refuse is therefore never drawn, and a line the server stored is never drawn cut.
 *
 * A LINE IS ONE LINE OF TEXT. Line breaks and every other character that could end a line or hide in
 * one become a space, so a line cannot start a line of its own in the message the receiving member
 * reads ("Task: ..." written inside it would otherwise look like one of the server's own labels). It
 * is bounded, and a line over the bound is refused rather than cut: a sentence cut in the middle can
 * say something else, and the member that wrote it can write it again.
 *
 * WHAT THIS DOES NOT DECIDE. Nothing here, and nothing a line says, grants anything: it is data on the
 * hand-off, never an input to an approval.
 */

/** The longest line, in characters. A finish line is a sentence a person can check, not a brief. */
export const DONE_WHEN_MAX_CHARS = 200;

/*
 * Controls (C0, DEL, C1), the line and paragraph separators, and the bidirectional controls that can
 * make a line read as something it is not. The same set the name of an offered file is cleaned with
 * (`member-file.ts`).
 */
const NOT_IN_A_LINE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this removes.
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * What a line is: absent (nothing was given, or nothing was left of it), the line itself, or refused.
 *
 * Refused is too long, or not text. Both are the writer's to put right, so they are one answer.
 */
export type DoneWhenReading = { ok: true; line?: string } | { ok: false };

/** Reads what the model wrote, or what the row holds, as a line. Never throws, whatever it is given. */
export function readDoneWhen(value: unknown): DoneWhenReading {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string") return { ok: false };
  const line = value.replace(NOT_IN_A_LINE, " ").replace(/\s+/gu, " ").trim();
  if (line === "") return { ok: true };
  if (Array.from(line).length > DONE_WHEN_MAX_CHARS) return { ok: false };
  return { ok: true, line };
}
