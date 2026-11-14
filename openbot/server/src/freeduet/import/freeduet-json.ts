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
  fitsMemoryLimit,
  IMPORT_BATCH_MAX_ITEMS,
  IMPORT_FILE_MAX_BYTES,
  IMPORT_FORMAT,
  type ImportItem,
  type ImportLicense,
  type ImportOutcome,
  isPlainObject,
  type NotImported,
  type RefusedItem,
  refuseAll,
} from "./model";

const TOP_LEVEL_KEYS = new Set(["format", "agents"]);
const AGENT_KEYS = new Set([
  "name",
  "title",
  "instructions",
  "schedule",
  "facts",
  "license",
]);

/** A pasted reply often keeps its byte order mark and the code fence it came in. Neither is content. */
function unwrap(pasted: string): string {
  const bare = pasted.replace(/^﻿/, "").trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(bare);
  return (fenced ? fenced[1] : bare).trim();
}

/**
 * Reads a `freeduet-import/1` export pasted as text. Each agent becomes a Bot item and each
 * non-empty fact a fact item. Nothing is stored here: the review shows what was read and what was
 * refused, and a person confirms before any of it is kept.
 */
export function parseFreeduetImport(pasted: string): ImportOutcome {
  if (byteLength(pasted) > IMPORT_FILE_MAX_BYTES)
    return refuseAll("The import is larger than 1 MiB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrap(pasted));
  } catch {
    return refuseAll(
      "This is not valid JSON. Paste the whole code block that the export gave you.",
    );
  }
  if (!isPlainObject(parsed))
    return refuseAll("The import must be one JSON object.");
  if (parsed.format !== IMPORT_FORMAT)
    return refuseAll(`This is not a ${IMPORT_FORMAT} import.`);
  const agents = parsed.agents;
  if (!Array.isArray(agents))
    return refuseAll('The import has no "agents" list.');

  const items: ImportItem[] = [];
  const refused: RefusedItem[] = [];
  const notImported: NotImported[] = [];
  let candidates = 0;

  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.has(key))
      notImported.push({
        where: "top level",
        name: displayKey(key),
        reason: classifyKey(key),
      });
  }

  for (const [index, agent] of agents.entries()) {
    const where = `agents[${index}]`;
    candidates += 1;
    if (!isPlainObject(agent)) {
      refused.push({
        kind: "bot",
        where,
        reasons: [`${where} is not an object`],
      });
      continue;
    }
    for (const key of Object.keys(agent)) {
      if (!AGENT_KEYS.has(key))
        notImported.push({
          where,
          name: displayKey(key),
          reason: classifyKey(key),
        });
    }

    const reasons: string[] = [];
    const name = readText(agent.name, where, "name", reasons, true);
    const title = readText(agent.title, where, "title", reasons, false);
    const instructions = readText(
      agent.instructions,
      where,
      "instructions",
      reasons,
      true,
    );
    const schedule = readText(
      agent.schedule,
      where,
      "schedule",
      reasons,
      false,
    );
    const licenseText = readText(
      agent.license,
      where,
      "license",
      reasons,
      false,
    );
    const facts: unknown = agent.facts ?? [];
    if (!Array.isArray(facts))
      reasons.push(`${where}: "facts" must be a list of text`);

    const fields: Array<[string, string | null]> = [
      ["name", name],
      ["title", title],
      ["instructions", instructions],
      ["schedule", schedule],
      ["license", licenseText],
    ];
    const botVerdict = mergeVerdicts(
      fields.flatMap(([field, value]): TextVerdict[] =>
        value === null ? [] : [checkText(value, `${where} ${field}`)],
      ),
    );
    reasons.push(...botVerdict.reasons);
    const nameClean =
      name !== null && checkText(name, `${where} name`).reasons.length === 0;

    if (reasons.length > 0 || name === null || instructions === null) {
      refused.push({ kind: "bot", where, reasons });
    } else {
      const license: ImportLicense = {
        stated: licenseText,
        restricted: isRestricted(botVerdict.flags),
      };
      items.push({
        kind: "bot",
        name,
        title,
        instructions,
        schedule,
        source: { format: IMPORT_FORMAT, fileName: null },
        license,
        flags: botVerdict.flags,
        digest: digestOf({
          kind: "bot",
          name,
          title,
          instructions,
          schedule,
          license,
        }),
      });
    }

    // A fact is a standing fact about the person, so it is read even when its agent is refused.
    if (!Array.isArray(facts)) continue;
    for (const [factIndex, fact] of facts.entries()) {
      const factWhere = `${where}.facts[${factIndex}]`;
      if (typeof fact === "string" && fact.trim() === "") continue;
      candidates += 1;
      if (typeof fact !== "string") {
        refused.push({
          kind: "fact",
          where: factWhere,
          reasons: [`${factWhere} is not text`],
        });
        continue;
      }
      const text = fact.trim();
      const verdict = checkText(text, factWhere);
      const factReasons = [...verdict.reasons];
      if (factReasons.length === 0 && !fitsMemoryLimit(text))
        factReasons.push(
          `${factWhere} is longer than a memory's content limit`,
        );
      if (factReasons.length > 0) {
        refused.push({ kind: "fact", where: factWhere, reasons: factReasons });
        continue;
      }
      const license: ImportLicense = {
        stated: null,
        restricted: isRestricted(verdict.flags),
      };
      const fromAgent = nameClean ? name : null;
      items.push({
        kind: "fact",
        text,
        fromAgent,
        source: { format: IMPORT_FORMAT, fileName: null },
        license,
        flags: verdict.flags,
        digest: digestOf({ kind: "fact", text, fromAgent, license }),
      });
    }
  }

  if (candidates > IMPORT_BATCH_MAX_ITEMS)
    return refuseAll(
      `This import has ${candidates} items. A batch holds at most ${IMPORT_BATCH_MAX_ITEMS}; split the export and import it in parts.`,
    );
  return {
    ok: true,
    result: { format: IMPORT_FORMAT, items, refused, notImported },
  };
}
