import { secretKind } from "./checks";
import {
  type BotItem,
  type FactDrop,
  type FactDropCode,
  type FactItem,
  IMPORT_ITEM_MAX_BYTES,
  type ImportFlag,
  type NotImported,
  type ParsedImport,
  type RefusedItem,
  type SkillItem,
} from "./model";

/**
 * The preview a person reads before anything is kept (docs/design/import-from-other-tools.md, slice 2).
 * A pure function of the parser's output and of the facts the person already holds. It stores nothing,
 * sends nothing and runs nothing. Every text it returns comes from the file, so it is bounded and has
 * its control characters and direction marks removed.
 */

/**
 * Facts Iris may hold, imported ones included (decided 14 November 2026). No store enforces it yet:
 * the memory store has no count limit, and the figure 50 in the code is the import batch and the
 * connector batch (see the design document, "Built so far").
 */
export const IMPORT_FACT_CAP = 50;

/** One memory's content limit, as `memoryInputSchema` sets it, in characters. */
const FACT_MAX_CHARS = 6_000;
/** A Bot's instructions or a skill's body: the item limit, counted in characters. */
const LONG_MAX_CHARS = IMPORT_ITEM_MAX_BYTES;
/** A name, a title, a slug or a place in the file. */
const SHORT_MAX_CHARS = 200;
/** A description, a schedule, a reason or a flag. */
const NOTE_MAX_CHARS = 1_000;

/** The facts the person holds now: their number, and their text for the duplicate check. */
export interface HeldFacts {
  /** Every live fact the person holds, enabled or not. */
  count: number;
  /**
   * Their text. It may be shorter than `count` when the read is capped. Above the cap nothing is kept,
   * so the count alone decides the room; the text only decides which reason a fact is dropped for.
   */
  texts: readonly string[];
}

export type PreviewDropCode = FactDropCode | "duplicate" | "repeated" | "cap";

export interface PreviewFlag {
  code: ImportFlag["code"];
  severity: ImportFlag["severity"];
  message: string;
}

export interface PreviewFact {
  where: string;
  fromBot: string | null;
  text: string;
  truncated: boolean;
  /** The digest a later confirm compares with the text it is given. */
  digest: string;
  restricted: boolean;
  flags: PreviewFlag[];
}

export interface PreviewDrop {
  where: string;
  code: PreviewDropCode;
  reason: string;
  /** Shown for a fact dropped by the cap or as a repeat. Null for a secret and for a refused fact. */
  text: string | null;
  truncated: boolean;
  /** The parser's reasons, for a refused fact. They name a line and never the text. */
  reasons: string[];
}

export interface PreviewSchedule {
  where: string;
  fromBot: string;
  text: string;
  truncated: boolean;
  /** Every schedule arrives switched off; the person switches each one on with its card. */
  arrivesSwitchedOff: true;
}

/** An agent found in the file. It is not imported in this slice. */
export interface PreviewBot {
  where: string;
  name: string;
  title: string | null;
  instructions: string;
  truncated: boolean;
  digest: string;
  restricted: boolean;
  flags: PreviewFlag[];
  imported: false;
}

/** A skill found in the file. It is not imported in this slice. */
export interface PreviewSkill {
  where: string;
  slug: string;
  description: string;
  body: string;
  truncated: boolean;
  author: string | null;
  digest: string;
  restricted: boolean;
  flags: PreviewFlag[];
  imported: false;
}

export interface PreviewRefusal {
  kind: RefusedItem["kind"];
  where: string;
  reasons: string[];
}

export interface PreviewNotImported {
  where: string;
  name: string;
  reason: NotImported["reason"];
}

export interface ImportPreview {
  format: ParsedImport["format"];
  facts: {
    cap: number;
    heldBefore: number;
    /** The facts that may still be kept: the cap less those held, and never below zero. */
    room: number;
    /** Those held before, plus those that would be kept. */
    heldAfter: number;
    keep: PreviewFact[];
    drop: PreviewDrop[];
  };
  schedules: PreviewSchedule[];
  bots: PreviewBot[];
  skills: PreviewSkill[];
  refused: PreviewRefusal[];
  notImported: PreviewNotImported[];
}

const PARSER_REASON: Record<FactDropCode, string> = {
  blank: "Blank: there is nothing to keep.",
  "not-text": "Not text: the export gives something other than text here.",
  "too-long": "Longer than one memory's content limit (6,000 characters).",
  secret:
    "Looks like a password, token or card number: never proposed. Its text is not shown.",
  check: "Refused by a check on its text. The reasons name the line.",
};

/**
 * Text as the preview returns it: a tab becomes a space, line breaks are kept, every other control
 * character and every direction or zero-width mark is removed, and the result is no longer than `max`
 * characters. Every text that comes from the file passes through here.
 */
export function displayText(
  value: string,
  max: number,
): { text: string; truncated: boolean } {
  let cleaned = "";
  for (const character of value) {
    if (character === "\t") cleaned += " ";
    else if (character === "\n" || !isStrippedCode(character.codePointAt(0)))
      cleaned += character;
  }
  const characters = Array.from(cleaned);
  if (characters.length <= max) return { text: cleaned, truncated: false };
  // The ellipsis takes one of the `max` characters, so the result is never longer than `max`.
  return {
    text: `${characters.slice(0, max - 1).join("")}…`,
    truncated: true,
  };
}

function isStrippedCode(code: number | undefined): boolean {
  const value = code ?? 0;
  return (
    value < 0x20 || // C0 controls; the tab and the line break are handled first
    (value >= 0x7f && value <= 0x9f) || // DEL and the C1 controls
    (value >= 0x200b && value <= 0x200f) || // zero-width and direction marks
    (value >= 0x202a && value <= 0x202e) || // embedding and override marks
    (value >= 0x2060 && value <= 0x206f) || // word joiner, invisible operators, isolates
    value === 0x061c ||
    value === 0xfeff
  );
}

/** Two facts are the same when they read the same, whatever their case or spacing. */
export function sameFactKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function note(value: string): string {
  return displayText(value, NOTE_MAX_CHARS).text;
}

function shortText(value: string): string {
  return displayText(value, SHORT_MAX_CHARS).text;
}

function previewFlag(flag: ImportFlag): PreviewFlag {
  return {
    code: flag.code,
    severity: flag.severity,
    message: note(flag.message),
  };
}

function capReason(room: number, held: number): string {
  if (room === 0)
    return `No room: ${held} facts are already held, and the cap is ${IMPORT_FACT_CAP}.`;
  return `Past the room left: ${room} more fit under the cap of ${IMPORT_FACT_CAP}, after the ${held} already held.`;
}

function parserDrop(drop: FactDrop): PreviewDrop {
  return {
    where: shortText(drop.where),
    code: drop.code,
    reason: PARSER_REASON[drop.code],
    text: null,
    truncated: false,
    reasons: drop.reasons.map(note),
  };
}

function textDrop(
  item: FactItem,
  code: "duplicate" | "repeated" | "cap",
  reason: string,
): PreviewDrop {
  const shown = displayText(item.text, FACT_MAX_CHARS);
  return {
    where: shortText(item.where),
    code,
    reason,
    text: shown.text,
    truncated: shown.truncated,
    reasons: [],
  };
}

function secretDrop(item: FactItem, kind: string): PreviewDrop {
  return {
    where: shortText(item.where),
    code: "secret",
    reason: `Looks like ${kind}: never proposed. Its text is not shown.`,
    text: null,
    truncated: false,
    reasons: [],
  };
}

function previewFact(item: FactItem): PreviewFact {
  const shown = displayText(item.text, FACT_MAX_CHARS);
  return {
    where: shortText(item.where),
    fromBot: item.fromAgent === null ? null : shortText(item.fromAgent),
    text: shown.text,
    truncated: shown.truncated,
    digest: item.digest,
    restricted: item.license.restricted,
    flags: item.flags.map(previewFlag),
  };
}

function previewBot(item: BotItem): PreviewBot {
  const instructions = displayText(item.instructions, LONG_MAX_CHARS);
  return {
    where: shortText(item.where),
    name: shortText(item.name),
    title: item.title === null ? null : shortText(item.title),
    instructions: instructions.text,
    truncated: instructions.truncated,
    digest: item.digest,
    restricted: item.license.restricted,
    flags: item.flags.map(previewFlag),
    imported: false,
  };
}

function previewSkill(item: SkillItem): PreviewSkill {
  const body = displayText(item.body, LONG_MAX_CHARS);
  return {
    where: shortText(item.source.fileName ?? item.slug),
    slug: shortText(item.slug),
    description: note(item.description),
    body: body.text,
    truncated: body.truncated,
    author: item.author === null ? null : shortText(item.author),
    digest: item.digest,
    restricted: item.license.restricted,
    flags: item.flags.map(previewFlag),
    imported: false,
  };
}

/**
 * The preview of a parsed import against the facts the person already holds. Order of checks for each
 * fact the parser kept: a secret is never proposed; a fact the person already holds is a duplicate; a
 * repeat within the import is a repeat; then the cap takes the first facts that fit the room left.
 * Facts the parser did not keep are listed with the parser's code.
 */
export function previewImport(
  parsed: ParsedImport,
  held: HeldFacts,
): ImportPreview {
  const room = Math.max(0, IMPORT_FACT_CAP - held.count);
  const heldKeys = new Set(held.texts.map(sameFactKey));
  const seen = new Set<string>();
  const drop: PreviewDrop[] = parsed.factDrops.map(parserDrop);
  const candidates: FactItem[] = [];

  for (const item of parsed.items) {
    if (item.kind !== "fact") continue;
    const kind = secretKind(item.text);
    if (kind !== null) {
      drop.push(secretDrop(item, kind));
      continue;
    }
    const key = sameFactKey(item.text);
    if (heldKeys.has(key)) {
      drop.push(textDrop(item, "duplicate", "The same text is already held."));
      continue;
    }
    if (seen.has(key)) {
      drop.push(
        textDrop(
          item,
          "repeated",
          "The same text appears earlier in this import.",
        ),
      );
      continue;
    }
    seen.add(key);
    candidates.push(item);
  }

  const keep = candidates.slice(0, room);
  for (const item of candidates.slice(room))
    drop.push(textDrop(item, "cap", capReason(room, held.count)));

  const schedules: PreviewSchedule[] = [];
  const bots: PreviewBot[] = [];
  const skills: PreviewSkill[] = [];
  for (const item of parsed.items) {
    if (item.kind === "bot") {
      bots.push(previewBot(item));
      if (item.schedule !== null) {
        const text = displayText(item.schedule, NOTE_MAX_CHARS);
        schedules.push({
          where: shortText(`${item.where}.schedule`),
          fromBot: shortText(item.name),
          text: text.text,
          truncated: text.truncated,
          arrivesSwitchedOff: true,
        });
      }
    } else if (item.kind === "skill") {
      skills.push(previewSkill(item));
    }
  }

  return {
    format: parsed.format,
    facts: {
      cap: IMPORT_FACT_CAP,
      heldBefore: held.count,
      room,
      heldAfter: held.count + keep.length,
      keep: keep.map(previewFact),
      drop,
    },
    schedules,
    bots,
    skills,
    refused: parsed.refused.map((refusal) => ({
      kind: refusal.kind,
      where: shortText(refusal.where),
      reasons: refusal.reasons.map(note),
    })),
    notImported: parsed.notImported.map((entry) => ({
      where: shortText(entry.where),
      name: shortText(entry.name),
      reason: entry.reason,
    })),
  };
}
