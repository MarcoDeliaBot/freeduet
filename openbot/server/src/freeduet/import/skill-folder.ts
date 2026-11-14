import { parseDocument } from "yaml";
import {
  checkText,
  classifyKey,
  displayKey,
  isRestricted,
  mergeVerdicts,
  readText,
  type TextVerdict,
} from "./checks";
import {
  byteLength,
  digestOf,
  IMPORT_BATCH_MAX_ITEMS,
  IMPORT_FILE_MAX_BYTES,
  type ImportItem,
  type ImportLicense,
  type ImportOutcome,
  isPlainObject,
  type NotImported,
  type RefusedItem,
  refuseAll,
  type SkillItem,
} from "./model";

const SKILL_KEYS = new Set(["name", "description", "license", "metadata"]);

/** One file of a picked folder: its path inside the folder, and its text. */
export interface SkillFile {
  path: string;
  text: string;
}

/**
 * Reads a folder of skills, each a `SKILL.md`: the frontmatter gives the name, the description and
 * the licence, and the body after it is the instructions. Only `SKILL.md` is read. A `scripts/`
 * folder is listed and its files are never read, run or copied, and other files are listed as not
 * read.
 */
export function parseSkillFolder(files: readonly SkillFile[]): ImportOutcome {
  const items: ImportItem[] = [];
  const refused: RefusedItem[] = [];
  const notImported: NotImported[] = [];
  let candidates = 0;

  for (const file of files) {
    const segments = file.path.split("/");
    const fileName = segments[segments.length - 1];
    const folder =
      segments.length > 1 ? segments.slice(0, -1).join("/") : "(top folder)";
    if (segments.includes("scripts")) {
      notImported.push({
        where: displayKey(folder),
        name: displayKey(fileName),
        reason: "scripts",
      });
      continue;
    }
    if (fileName !== "SKILL.md") {
      notImported.push({
        where: displayKey(folder),
        name: displayKey(fileName),
        reason: "unread-file",
      });
      continue;
    }

    candidates += 1;
    const where = displayKey(file.path);
    if (byteLength(file.text) > IMPORT_FILE_MAX_BYTES) {
      refused.push({
        kind: "file",
        where,
        reasons: [`${where} is larger than 1 MiB`],
      });
      continue;
    }
    const outcome = readSkillFile(where, file.text, notImported);
    if ("item" in outcome) items.push(outcome.item);
    else refused.push({ kind: "skill", where, reasons: outcome.reasons });
  }

  if (candidates > IMPORT_BATCH_MAX_ITEMS)
    return refuseAll(
      `This folder has ${candidates} skills. A batch holds at most ${IMPORT_BATCH_MAX_ITEMS}; import the folders in parts.`,
    );
  return {
    ok: true,
    result: { format: "skill-md", items, refused, notImported },
  };
}

function readSkillFile(
  where: string,
  rawText: string,
  notImported: NotImported[],
): { item: SkillItem } | { reasons: string[] } {
  const text = rawText.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines[0].trimEnd() !== "---")
    return {
      reasons: [`${where}: the file must start with a line of three dashes`],
    };
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trimEnd() === "---",
  );
  if (closing < 0)
    return {
      reasons: [
        `${where}: the frontmatter is not closed by a line of three dashes`,
      ],
    };

  const meta = readFrontmatter(lines.slice(1, closing).join("\n"));
  if (typeof meta === "string") return { reasons: [`${where}: ${meta}`] };
  for (const key of Object.keys(meta)) {
    if (!SKILL_KEYS.has(key))
      notImported.push({
        where,
        name: displayKey(key),
        reason: classifyKey(key),
      });
  }

  const reasons: string[] = [];
  const name = readText(meta.name, where, "name", reasons, true);
  const description = readText(
    meta.description,
    where,
    "description",
    reasons,
    true,
  );
  const licenseText = readText(meta.license, where, "license", reasons, false);
  let author: string | null = null;
  const metadata = meta.metadata;
  if (metadata !== undefined && metadata !== null) {
    if (isPlainObject(metadata))
      author = readText(
        metadata.author,
        where,
        "metadata.author",
        reasons,
        false,
      );
    else reasons.push(`${where}: "metadata" must be a map`);
  }

  // The body is checked raw, from the line it starts on, so a reported line is the line in the file.
  const bodyText = lines.slice(closing + 1).join("\n");
  if (bodyText.trim() === "")
    reasons.push(`${where}: there are no instructions after the frontmatter`);

  const fields: Array<[string, string | null]> = [
    ["name", name],
    ["description", description],
    ["license", licenseText],
    ["metadata.author", author],
  ];
  const verdicts: TextVerdict[] = fields.flatMap(([field, value]) =>
    value === null ? [] : [checkText(value, `${where} ${field}`)],
  );
  verdicts.push(checkText(bodyText, `${where} instructions`, closing + 2));
  const merged = mergeVerdicts(verdicts);
  reasons.push(...merged.reasons);
  if (reasons.length > 0 || name === null || description === null)
    return { reasons };

  const license: ImportLicense = {
    stated: licenseText,
    restricted: isRestricted(merged.flags),
  };
  const body = bodyText.trim();
  return {
    item: {
      kind: "skill",
      slug: name,
      description,
      body,
      author,
      source: { format: "skill-md", fileName: where },
      license,
      flags: merged.flags,
      digest: digestOf({
        kind: "skill",
        slug: name,
        description,
        body,
        author,
        license,
      }),
    },
  };
}

/**
 * Reads the frontmatter as YAML in the failsafe schema, so every scalar is text and nothing is
 * converted. Aliases are refused, and so are duplicate keys, which YAML would otherwise let the
 * later value win.
 */
function readFrontmatter(yamlText: string): Record<string, unknown> | string {
  try {
    const document = parseDocument(yamlText, {
      schema: "failsafe",
      uniqueKeys: true,
    });
    if (document.errors.length > 0) return "the frontmatter is not valid YAML";
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    return isPlainObject(value)
      ? value
      : "the frontmatter must be key: value lines";
  } catch {
    return "the frontmatter uses YAML aliases or nests too deeply";
  }
}
