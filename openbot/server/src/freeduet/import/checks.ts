import { byteLength, type ImportFlag, IMPORT_ITEM_MAX_BYTES } from "./model";

/**
 * The checks on text an import keeps (docs/design/import-from-other-tools.md, section 3.2). A
 * refusal names the line it was found on and the item is not read. A flag is shown beside the text,
 * and the text is kept. These are heuristics and none of them is the boundary: the approval gate on
 * each action is.
 */

/** Zero-width and bidirectional control characters. A leading byte order mark is removed first. */
const HIDDEN_CHARACTER = /[​-‏‪-‮⁠-⁤⁦-⁩؜﻿]/;

/** Strings shaped like the keys of common services, and a generic `api_key = value` line. */
const KEY_SHAPED: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-/+=.]{16,}/i,
];

/** Thirteen to nineteen digits, with single spaces or hyphens between them. Luhn decides. */
const CARD_SHAPED = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;

/** A run of base64 characters too long to be a word or a path. */
const LONG_BASE64 = /[A-Za-z0-9+/]{120,}/;

const DOLLAR_BRACE = /\$\{/;

const APPROVAL_WORDS: readonly RegExp[] = [
  /\balways (?:allow|approve|accept|run|send|pay)\b/i,
  /\b(?:do not|don't|never) ask\b/i,
  /\bwithout (?:asking|approval|confirmation|permission)\b/i,
  /\b(?:auto-?approve|pre-?approved|skip (?:the )?approval|no approval needed)\b/i,
  /\bfull access\b/i,
  /\bgrant (?:yourself|you|the (?:bot|member)|access|permission|tools?)\b/i,
  /\bnon chiedere\b|\bnon chiedermi\b|\bsenza (?:chiedere|chiedermi|approvazione|conferma)\b|\bsempre (?:consentit|approvat|permess)/i,
];

const NON_COMMERCIAL =
  /non[- ]?commercial|not for commercial|\bCC[ -]?BY[ -]?NC\b/i;

/** Dropped, not listed as unknown: a key that would grant a tool, an approval, a policy or Full access. */
const DROPPED_KEY_WORDS = /tool|allow|approv|grant|polic|fullaccess|permission/;

export interface TextVerdict {
  reasons: string[];
  flags: ImportFlag[];
}

export function mergeVerdicts(verdicts: readonly TextVerdict[]): TextVerdict {
  return {
    reasons: verdicts.flatMap((verdict) => verdict.reasons),
    flags: verdicts.flatMap((verdict) => verdict.flags),
  };
}

export function isRestricted(flags: readonly ImportFlag[]): boolean {
  return flags.some((flag) => flag.code === "non-commercial");
}

/**
 * Checks one text. `label` names the field for the reader; `firstLine` is the line of the file the
 * text starts on, so a reported line is a line the reader can find.
 */
export function checkText(
  text: string,
  label: string,
  firstLine = 1,
): TextVerdict {
  const reasons: string[] = [];
  const flags: ImportFlag[] = [];
  const flagged = new Set<ImportFlag["code"]>();
  if (byteLength(text) > IMPORT_ITEM_MAX_BYTES)
    reasons.push(`${label} is larger than 64 KiB`);
  for (const [index, line] of text.split("\n").entries()) {
    const at = `${label}, line ${firstLine + index}`;
    const hidden = HIDDEN_CHARACTER.exec(line);
    if (hidden)
      reasons.push(
        `${at}: contains a hidden or direction control character (${codePointLabel(hidden[0])})`,
      );
    if (line.includes("<!--")) reasons.push(`${at}: contains an HTML comment`);
    if (KEY_SHAPED.some((pattern) => pattern.test(line)))
      reasons.push(`${at}: looks like a key or token`);
    if (
      [...line.matchAll(CARD_SHAPED)].some((match) =>
        luhnValid(match[0].replace(/[ -]/g, "")),
      )
    )
      reasons.push(`${at}: looks like a card number`);
    if (LONG_BASE64.test(line))
      reasons.push(`${at}: contains a long run of base64 characters`);

    const folded = line.replace(/[‘’]/g, "'");
    if (
      !flagged.has("approval-words") &&
      APPROVAL_WORDS.some((pattern) => pattern.test(folded))
    ) {
      flagged.add("approval-words");
      flags.push({
        code: "approval-words",
        severity: "red",
        message: `${at}: asks to change approvals or to grant tools. A heuristic, not a boundary.`,
      });
    }
    if (!flagged.has("dollar-brace") && DOLLAR_BRACE.test(line)) {
      flagged.add("dollar-brace");
      flags.push({
        code: "dollar-brace",
        severity: "note",
        message: `${at}: contains a dollar-brace placeholder. It is kept as written and never expanded.`,
      });
    }
    if (!flagged.has("non-commercial") && NON_COMMERCIAL.test(line)) {
      flagged.add("non-commercial");
      flags.push({
        code: "non-commercial",
        severity: "note",
        message: `${at}: non-commercial licence or wording. Kept for the person; excluded from any export or share.`,
      });
    }
  }
  return { reasons, flags };
}

/**
 * Reads one text field: trimmed, or null when it is absent or blank. A value of another type is a
 * reason to refuse the item, and so is a missing required field.
 */
export function readText(
  value: unknown,
  where: string,
  field: string,
  reasons: string[],
  required: boolean,
): string | null {
  if (value === undefined || value === null) {
    if (required) reasons.push(`${where}: "${field}" is missing`);
    return null;
  }
  if (typeof value !== "string") {
    reasons.push(`${where}: "${field}" must be text`);
    return null;
  }
  const text = value.trim();
  if (text === "") {
    if (required) reasons.push(`${where}: "${field}" is empty`);
    return null;
  }
  return text;
}

/** Whether an unknown key would grant something (dropped) or is just not used (unknown). */
export function classifyKey(key: string): "dropped" | "unknown" {
  return DROPPED_KEY_WORDS.test(key.toLowerCase().replace(/[^a-z]/g, ""))
    ? "dropped"
    : "unknown";
}

/**
 * A key or a file name as the review shows it: printable ASCII, with every other character escaped,
 * so a hidden character in a name cannot pass unseen.
 */
export function displayKey(key: string): string {
  const shown = key.replace(
    /[^\x20-\x7e]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return shown.length > 64 ? `${shown.slice(0, 64)}...` : shown;
}

function codePointLabel(character: string): string {
  const code = character.codePointAt(0) ?? 0;
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
