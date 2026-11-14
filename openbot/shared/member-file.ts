/**
 * A file a member made in its own computer and offers to the person (docs/M1_PLAN.md, D38).
 *
 * The contract between the tool that offers it (`server/src/freeduet/member-files.ts`) and the card
 * that draws it (`app/src/freeduet/member-file-card.tsx`), kept in one file so the two cannot drift.
 *
 * WHAT TRAVELS. Four facts: whose computer, the path inside that computer's workspace as the member
 * named it, the name the person will see, and the size when the server looked. Never the content and
 * never a link. The card asks for the file with the signed-in person's own session when the button is
 * pressed, through the computer download route that already exists, and that route decides again:
 * who may use the Bot, what the computer policy allows, and where the path lands.
 */

export const OFFER_FILE_TOOL = "offer_file";

export type OfferedFile = {
  /** The member whose computer holds the file. */
  botId: string;
  /** The path as the member gave it, relative to the workspace of that computer. */
  path: string;
  /** What the person sees and what the saved file is called: the last part of the path. */
  name: string;
  /** The size in bytes at the moment the server checked the file. */
  bytes: number;
};

/** The longest path the tool takes, in characters. A path is a label for a file, not a payload. */
export const OFFERED_PATH_MAX = 1024;
const NAME_MAX = 255;
const BOT_ID_MAX = 200;

/*
 * Controls (C0, DEL, C1), the line and paragraph separators, and the bidirectional controls that can
 * make a name read as something it is not ("video" + U+202E + "4pm" shows as "video" followed by a
 * reversed "mp4").
 */
const UNSAFE_IN_NAME =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this removes.
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * The name a downloaded file is saved under, from the name the computer reported.
 *
 * A path separator becomes an underscore, so a name can never land a file in another folder on the
 * person's device; controls and bidirectional controls are dropped; and the result is bounded. Never
 * empty: a name with nothing left is `download`, which is what the route's own header falls back to.
 */
export function savedFileName(name: string): string {
  const cleaned = Array.from(name.normalize("NFC").replace(UNSAFE_IN_NAME, ""))
    .map((character) =>
      character === "/" || character === "\\" ? "_" : character,
    )
    .join("")
    .trim();
  const bounded = Array.from(cleaned).slice(0, NAME_MAX).join("").trim();
  return bounded === "" || bounded === "." || bounded === ".."
    ? "download"
    : bounded;
}

/**
 * The tool's success result: the file the card is drawn from, and a note that is for the member.
 * A refusal is a sentence that starts `Refused.` instead and draws nothing.
 */
export function offeredFileResult(file: OfferedFile, note: string): string {
  return JSON.stringify({ ...file, note });
}

/** The card's file out of the tool's result text, or null for a refusal or anything else. */
export function readOfferedFile(result: unknown): OfferedFile | null {
  if (typeof result !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(result);
    // A server tool's text can arrive JSON-encoded once more on the way through the runtime.
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { botId, path, name, bytes } = value as Record<string, unknown>;
  if (
    typeof botId !== "string" ||
    botId.length === 0 ||
    botId.length > BOT_ID_MAX ||
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > OFFERED_PATH_MAX ||
    typeof name !== "string" ||
    name.length === 0 ||
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0
  )
    return null;
  // Whatever the result said, what is drawn and saved is a name that is safe to save.
  return { botId, path, name: savedFileName(name), bytes };
}

/**
 * Where the Download button fetches the file: the computer download route
 * (`server/src/computer/routes.ts`), which answers only a signed-in person who may use that Bot's
 * computer. A path on the same origin and nothing more: not a link that works for anyone else.
 */
export function offeredFileUrl(
  file: Pick<OfferedFile, "botId" | "path">,
): string {
  return `/api/computers/${encodeURIComponent(file.botId)}/files/download?path=${encodeURIComponent(file.path)}`;
}
