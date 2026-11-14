import { createHash } from "node:crypto";
import { MAX_FILE_BYTES } from "@openbot/shared/attachments";
import { memoryInputSchema } from "../../memory/types";

/**
 * The shape of a parsed import: what the review screen shows and what a later confirm would store.
 * Parsing stores nothing and runs nothing. The design is docs/design/import-from-other-tools.md.
 */

/** The one JSON format read from pasted text. */
export const IMPORT_FORMAT = "freeduet-import/1" as const;

/** Per file: a pasted reply, or one SKILL.md. The same 1 MiB as an attachment. */
export const IMPORT_FILE_MAX_BYTES = MAX_FILE_BYTES;

/** Per item: one Bot's instructions, one skill's body, one fact, or any other text the review keeps. */
export const IMPORT_ITEM_MAX_BYTES = 64 * 1024;

/** Per batch: every Bot, skill and fact the review would show, each counted once. */
export const IMPORT_BATCH_MAX_ITEMS = 50;

/**
 * A fact is a memory, so it takes the memory store's own limit on content. The store checks the same
 * schema for the memories a person writes, so an imported fact fits wherever a typed one does.
 */
export function fitsMemoryLimit(text: string): boolean {
  return memoryInputSchema.safeParse({ content: text }).success;
}

export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export type ImportKind = "bot" | "skill" | "fact";

export interface ImportFlag {
  code: "approval-words" | "dollar-brace" | "non-commercial";
  /** Red is shown in red. A heuristic: the text is kept either way. */
  severity: "red" | "note";
  message: string;
}

export interface ImportLicense {
  /** The licence as the file states it. Null is shown as "none stated". */
  stated: string | null;
  /** Non-commercial licence or wording: kept for the person, excluded from any export or share. */
  restricted: boolean;
}

interface ItemBase {
  kind: ImportKind;
  /** SHA-256 (hex) of the fields as shown. A later confirm compares it with the value the person saw. */
  digest: string;
  source: {
    format: typeof IMPORT_FORMAT | "skill-md";
    fileName: string | null;
  };
  license: ImportLicense;
  flags: ImportFlag[];
}

export interface BotItem extends ItemBase {
  kind: "bot";
  name: string;
  title: string | null;
  instructions: string;
  /** Plain words, as the export gave them. Not a cron: the person confirms a routine (decision 5). */
  schedule: string | null;
}

export interface SkillItem extends ItemBase {
  kind: "skill";
  slug: string;
  description: string;
  body: string;
  author: string | null;
}

export interface FactItem extends ItemBase {
  kind: "fact";
  text: string;
  /** The agent the fact was listed under, when that agent's name passed the checks. */
  fromAgent: string | null;
}

export type ImportItem = BotItem | SkillItem | FactItem;

/** A candidate that was not read. Its reasons name the line where the problem is. */
export interface RefusedItem {
  kind: ImportKind | "file";
  where: string;
  reasons: string[];
}

export type NotImportedReason =
  | "unknown"
  | "dropped"
  | "scripts"
  | "unread-file";

/** A key or file that is listed by name and not used. */
export interface NotImported {
  where: string;
  name: string;
  reason: NotImportedReason;
}

export interface ParsedImport {
  format: typeof IMPORT_FORMAT | "skill-md";
  items: ImportItem[];
  refused: RefusedItem[];
  notImported: NotImported[];
}

/** Either a parsed import, or a refusal of the whole input with one reason. */
export type ImportOutcome =
  | { ok: true; result: ParsedImport }
  | { ok: false; reason: string };

export function refuseAll(reason: string): ImportOutcome {
  return { ok: false, reason };
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A digest over the fields as they are shown, passed with a fixed key order by each caller. Equal
 * fields give an equal digest, and any changed field gives a different one.
 */
export function digestOf(fields: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}
