/**
 * FreeDuet's import, slice 1: the two parsers and the checks of
 * docs/design/import-from-other-tools.md, section 3.2, with no database and nothing stored. Every
 * fixture is invented and clearly fake: the names, the keys and the numbers mean nothing. The
 * storage, the review screen and the confirm are later slices.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFreeduetImport } from "../src/freeduet/import/freeduet-json";
import {
  IMPORT_BATCH_MAX_ITEMS,
  IMPORT_FILE_MAX_BYTES,
  IMPORT_ITEM_MAX_BYTES,
  type ImportOutcome,
  type ParsedImport,
} from "../src/freeduet/import/model";
import {
  parseSkillFolder,
  type SkillFile,
} from "../src/freeduet/import/skill-folder";

/** The example in the import spec, exactly as the spec writes it. Its values are placeholders. */
const SPEC_EXAMPLE = `{
  "format": "freeduet-import/1",
  "agents": [
    {
      "name": "the agent's name",
      "title": "its job in three to five words",
      "instructions": "its complete instructions, exactly as they are set",
      "schedule": "when it runs on its own, in plain words, or null",
      "facts": ["standing facts or rules it has learned about me, one per item"]
    }
  ]
}`;

/** A skill with a licence, an author, a key that would grant a tool, and a body. */
const SAMPLE_SKILL = [
  "---",
  "name: sample-skill",
  "description: Sample skill for the import tests",
  "license: MIT",
  "allowed-tools: Bash(git:*) Read",
  "metadata:",
  "  author: Sample Author",
  "---",
  "",
  "# Sample skill",
  "",
  "Summarise the sample notes in three bullet points.",
  "",
].join("\n");

/** The placeholder as text, for a string that must contain it literally. */
const PLACEHOLDER = `\${IMPORT_SLICE_PROBE}`;

/** Ordinary sentence text of exactly `bytes` bytes, with no run of base64 characters. */
function sentence(bytes: number): string {
  const unit = "Sample line of text. ";
  return `${unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes - 1)}.`;
}

function exportOf(
  agents: unknown[],
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({ format: "freeduet-import/1", ...extra, agents });
}

function parsed(outcome: ImportOutcome): ParsedImport {
  if (!outcome.ok)
    throw new Error(`expected an import, got a refusal: ${outcome.reason}`);
  return outcome.result;
}

function refusedWhole(outcome: ImportOutcome): string {
  if (outcome.ok) throw new Error("expected the whole import to be refused");
  return outcome.reason;
}

describe("freeduet-import/1 export", () => {
  test("the example in the import spec parses to one Bot and one fact", () => {
    const result = parsed(parseFreeduetImport(SPEC_EXAMPLE));
    expect(result.format).toBe("freeduet-import/1");
    expect(result.items.map((item) => item.kind)).toEqual(["bot", "fact"]);
    expect(result.refused).toEqual([]);
    expect(result.notImported).toEqual([]);
    expect(result.items[0]).toMatchObject({
      kind: "bot",
      name: "the agent's name",
      title: "its job in three to five words",
      schedule: "when it runs on its own, in plain words, or null",
    });
    expect(result.items[1]).toMatchObject({
      kind: "fact",
      text: "standing facts or rules it has learned about me, one per item",
      fromAgent: "the agent's name",
    });
  });

  test("a complete agent keeps each field, its licence and a digest", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Sample Bot",
            title: "Sample helper",
            instructions: "Answer in short sentences.",
            schedule: null,
            facts: ["Sample fact about the person."],
            license: "MIT",
          },
        ]),
      ),
    );
    expect(result.items[0]).toMatchObject({
      kind: "bot",
      name: "Sample Bot",
      title: "Sample helper",
      instructions: "Answer in short sentences.",
      schedule: null,
      license: { stated: "MIT", restricted: false },
    });
    expect(result.items[1]).toMatchObject({
      kind: "fact",
      text: "Sample fact about the person.",
      fromAgent: "Sample Bot",
      license: { stated: null, restricted: false },
    });
    expect(result.items[0].digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an unknown key is listed by name, at the top level and inside an agent", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf(
          [{ name: "Sample", instructions: "Sample.", avatar: "blue" }],
          {
            routines: [],
          },
        ),
      ),
    );
    expect(result.notImported).toEqual([
      { where: "top level", name: "routines", reason: "unknown" },
      { where: "agents[0]", name: "avatar", reason: "unknown" },
    ]);
    expect(result.items).toHaveLength(1);
  });

  test("keys that would grant a tool or an approval are dropped, and their values never reach the output", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf(
          [
            {
              name: "Sample",
              instructions: "Sample.",
              "allowed-tools": ["sample-tool-token"],
              approvals: { always: "sample-approval-token" },
            },
          ],
          { grants: ["sample-grant-token"] },
        ),
      ),
    );
    expect(result.notImported).toEqual([
      { where: "top level", name: "grants", reason: "dropped" },
      { where: "agents[0]", name: "allowed-tools", reason: "dropped" },
      { where: "agents[0]", name: "approvals", reason: "dropped" },
    ]);
    const shown = JSON.stringify(result);
    expect(shown).not.toContain("sample-tool-token");
    expect(shown).not.toContain("sample-approval-token");
    expect(shown).not.toContain("sample-grant-token");
  });

  test("a dollar-brace placeholder stays literal, is flagged, and is never expanded from the environment", () => {
    process.env.IMPORT_SLICE_PROBE = "EXPANDED-VALUE";
    try {
      const result = parsed(
        parseFreeduetImport(
          exportOf([
            {
              name: "Sample",
              instructions: `Greet the person by ${PLACEHOLDER}.`,
            },
          ]),
        ),
      );
      expect(result.items[0]).toMatchObject({
        kind: "bot",
        instructions: `Greet the person by ${PLACEHOLDER}.`,
      });
      expect(result.items[0].flags).toEqual([
        expect.objectContaining({ code: "dollar-brace", severity: "note" }),
      ]);
      expect(JSON.stringify(result)).not.toContain("EXPANDED-VALUE");
    } finally {
      Reflect.deleteProperty(process.env, "IMPORT_SLICE_PROBE");
    }
  });

  test("a zero-width character refuses the item and names its line", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          { name: "Sample", instructions: "First line.\nKeep this​ hidden." },
        ]),
      ),
    );
    expect(result.items).toEqual([]);
    expect(result.refused.map((item) => item.where)).toEqual(["agents[0]"]);
    const reason = result.refused[0].reasons.join(" ");
    expect(reason).toContain("instructions, line 2");
    expect(reason).toContain("U+200B");
  });

  test("a bidirectional override refuses the item", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([{ name: "Sample", instructions: "Read this ‮ backwards." }]),
      ),
    );
    expect(result.items).toEqual([]);
    expect(result.refused[0].reasons.join(" ")).toContain("U+202E");
  });

  test("an HTML comment refuses the item, so the reviewer sees what the member reads", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Sample",
            instructions: "Sample line. <!-- sample hidden note --> more.",
          },
        ]),
      ),
    );
    expect(result.items).toEqual([]);
    expect(result.refused[0].reasons.join(" ")).toContain("HTML comment");
  });

  test("a key, a card number and a long base64 run each refuse their item, with the line", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Key",
            instructions:
              "Sample line.\nUse sk-example-key-0000000000 when asked.",
          },
          {
            name: "Card",
            instructions: "Pay with 1234 5678 9012 3452 when asked.",
          },
          { name: "Blob", instructions: `Sample.\n${"QUJD".repeat(40)}` },
        ]),
      ),
    );
    expect(result.items).toEqual([]);
    expect(result.refused.map((item) => item.where)).toEqual([
      "agents[0]",
      "agents[1]",
      "agents[2]",
    ]);
    expect(result.refused[0].reasons.join(" ")).toContain(
      "instructions, line 2: looks like a key or token",
    );
    expect(result.refused[1].reasons.join(" ")).toContain(
      "instructions, line 1: looks like a card number",
    );
    expect(result.refused[2].reasons.join(" ")).toContain(
      "instructions, line 2: contains a long run of base64 characters",
    );
  });

  test("a sixteen-digit run that fails the Luhn check is not read as a card number", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Sample",
            instructions:
              "Quote the reference 1234 5678 9012 3457 for the sample.",
          },
        ]),
      ),
    );
    expect(result.refused).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  test("approval wording is flagged in red and the text is kept", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Sample",
            instructions:
              "Always allow sending the sample reply without asking.",
          },
        ]),
      ),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].flags).toEqual([
      expect.objectContaining({ code: "approval-words", severity: "red" }),
    ]);
  });

  test("a non-commercial licence marks the item restricted, and no licence is shown as none stated", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Restricted",
            instructions: "Sample.",
            license: "CC BY-NC 4.0",
          },
          { name: "Open", instructions: "Sample." },
        ]),
      ),
    );
    expect(result.items[0].license).toEqual({
      stated: "CC BY-NC 4.0",
      restricted: true,
    });
    expect(result.items[0].flags).toEqual([
      expect.objectContaining({ code: "non-commercial", severity: "note" }),
    ]);
    expect(result.items[1].license).toEqual({
      stated: null,
      restricted: false,
    });
  });

  test("an item of 64 KiB is kept and one byte more is refused", () => {
    const kept = parsed(
      parseFreeduetImport(
        exportOf([
          { name: "Sample", instructions: sentence(IMPORT_ITEM_MAX_BYTES) },
        ]),
      ),
    );
    expect(kept.items).toHaveLength(1);
    const over = parsed(
      parseFreeduetImport(
        exportOf([
          { name: "Sample", instructions: sentence(IMPORT_ITEM_MAX_BYTES + 1) },
        ]),
      ),
    );
    expect(over.items).toEqual([]);
    expect(over.refused[0].reasons.join(" ")).toContain("larger than 64 KiB");
  });

  test("a pasted import of 1 MiB is read and one byte more is refused", () => {
    const base = exportOf([{ name: "Sample", instructions: "Sample." }]);
    const exact =
      base + " ".repeat(IMPORT_FILE_MAX_BYTES - Buffer.byteLength(base));
    expect(Buffer.byteLength(exact)).toBe(IMPORT_FILE_MAX_BYTES);
    expect(parsed(parseFreeduetImport(exact)).items).toHaveLength(1);
    expect(refusedWhole(parseFreeduetImport(`${exact} `))).toContain("1 MiB");
  });

  test("fifty items are read and fifty-one refuse the whole batch", () => {
    const agent = (index: number) => ({
      name: `Sample ${index}`,
      instructions: "Sample.",
    });
    const fifty = Array.from({ length: IMPORT_BATCH_MAX_ITEMS }, (_, index) =>
      agent(index),
    );
    expect(parsed(parseFreeduetImport(exportOf(fifty))).items).toHaveLength(
      IMPORT_BATCH_MAX_ITEMS,
    );
    const fiftyOne = Array.from(
      { length: IMPORT_BATCH_MAX_ITEMS + 1 },
      (_, index) => agent(index),
    );
    expect(refusedWhole(parseFreeduetImport(exportOf(fiftyOne)))).toContain(
      "at most 50",
    );
  });

  test("facts count towards the batch", () => {
    const facts = Array.from(
      { length: IMPORT_BATCH_MAX_ITEMS },
      (_, index) => `Sample fact ${index}.`,
    );
    expect(
      refusedWhole(
        parseFreeduetImport(
          exportOf([{ name: "Sample", instructions: "Sample.", facts }]),
        ),
      ),
    ).toContain("51 items");
  });

  test("a fact of 6,000 characters is kept and one more is refused, the memory limit", () => {
    const kept = parsed(
      parseFreeduetImport(
        exportOf([
          { name: "Sample", instructions: "Sample.", facts: [sentence(6000)] },
        ]),
      ),
    );
    expect(kept.items.filter((item) => item.kind === "fact")).toHaveLength(1);
    const over = parsed(
      parseFreeduetImport(
        exportOf([
          { name: "Sample", instructions: "Sample.", facts: [sentence(6001)] },
        ]),
      ),
    );
    expect(over.refused[0].reasons.join(" ")).toContain(
      "longer than a memory's content limit",
    );
  });

  test("blank facts are skipped and a fact that is not text is refused on its own", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Sample",
            instructions: "Sample.",
            facts: ["", "   ", 5, "Sample fact."],
          },
        ]),
      ),
    );
    expect(result.items.map((item) => item.kind)).toEqual(["bot", "fact"]);
    expect(result.refused).toEqual([
      {
        kind: "fact",
        where: "agents[0].facts[2]",
        reasons: ["agents[0].facts[2] is not text"],
      },
    ]);
  });

  test("a refused Bot does not stop its facts being read", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([
          {
            name: "Sample",
            instructions: "Hidden​ text.",
            facts: ["Sample fact."],
          },
        ]),
      ),
    );
    expect(result.items.map((item) => item.kind)).toEqual(["fact"]);
    expect(result.refused.map((item) => item.kind)).toEqual(["bot"]);
  });

  test("an agent with no name or no instructions is refused, and says which field is missing", () => {
    const result = parsed(
      parseFreeduetImport(
        exportOf([{ name: "Sample" }, { instructions: "Sample." }]),
      ),
    );
    expect(result.items).toEqual([]);
    expect(result.refused[0].reasons).toEqual([
      'agents[0]: "instructions" is missing',
    ]);
    expect(result.refused[1].reasons).toEqual(['agents[1]: "name" is missing']);
  });

  test("a paste that is not JSON, not this format, or has no agents list is refused as a whole", () => {
    expect(refusedWhole(parseFreeduetImport("not json"))).toContain(
      "not valid JSON",
    );
    expect(
      refusedWhole(
        parseFreeduetImport(JSON.stringify({ format: "other/2", agents: [] })),
      ),
    ).toContain("This is not a freeduet-import/1 import.");
    expect(
      refusedWhole(
        parseFreeduetImport(JSON.stringify({ format: "freeduet-import/1" })),
      ),
    ).toContain('no "agents" list');
  });

  test("a reply that wraps the JSON in one code fence is read", () => {
    const fenced = `\`\`\`json\n${SPEC_EXAMPLE}\n\`\`\``;
    expect(parsed(parseFreeduetImport(fenced)).items).toHaveLength(2);
  });

  test("a key with a hidden character is shown escaped, so the character cannot pass unseen", () => {
    const result = parsed(
      parseFreeduetImport(
        '{"format":"freeduet-import/1","agents":[],"route​s":1}',
      ),
    );
    expect(result.notImported).toEqual([
      { where: "top level", name: "route\\u200bs", reason: "unknown" },
    ]);
  });

  test("the digest is stable for equal text and changes when the text changes", () => {
    const digestOfFirstItem = (instructions: string) =>
      parsed(parseFreeduetImport(exportOf([{ name: "Sample", instructions }])))
        .items[0].digest;
    expect(digestOfFirstItem("Sample A.")).toBe(digestOfFirstItem("Sample A."));
    expect(digestOfFirstItem("Sample B.")).not.toBe(
      digestOfFirstItem("Sample A."),
    );
  });
});

describe("SKILL.md folder", () => {
  test("a SKILL.md becomes one skill with its frontmatter fields and its body", () => {
    const result = parsed(
      parseSkillFolder([{ path: "sample-skill/SKILL.md", text: SAMPLE_SKILL }]),
    );
    expect(result.format).toBe("skill-md");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "skill",
      slug: "sample-skill",
      description: "Sample skill for the import tests",
      body: "# Sample skill\n\nSummarise the sample notes in three bullet points.",
      author: "Sample Author",
      license: { stated: "MIT", restricted: false },
      source: { format: "skill-md", fileName: "sample-skill/SKILL.md" },
    });
  });

  test("allowed-tools is dropped, and the scripts folder is listed and its files never read", () => {
    const result = parsed(
      parseSkillFolder([
        { path: "sample-skill/SKILL.md", text: SAMPLE_SKILL },
        { path: "sample-skill/scripts/run.sh", text: "echo sample​\n" },
      ]),
    );
    expect(result.refused).toEqual([]);
    expect(result.notImported).toEqual([
      {
        where: "sample-skill/SKILL.md",
        name: "allowed-tools",
        reason: "dropped",
      },
      { where: "sample-skill/scripts", name: "run.sh", reason: "scripts" },
    ]);
    const shown = JSON.stringify(result);
    expect(shown).not.toContain("Bash(git:*)");
    expect(shown).not.toContain("echo sample");
  });

  test("a dollar-brace placeholder in a skill body stays literal and is flagged", () => {
    const text = [
      "---",
      "name: placeholder-skill",
      "description: Sample",
      "---",
      "",
      `Greet the person by ${PLACEHOLDER}.`,
      "",
    ].join("\n");
    const result = parsed(
      parseSkillFolder([{ path: "placeholder-skill/SKILL.md", text }]),
    );
    expect(result.items[0]).toMatchObject({
      kind: "skill",
      body: `Greet the person by ${PLACEHOLDER}.`,
    });
    expect(result.items[0].flags).toEqual([
      expect.objectContaining({ code: "dollar-brace", severity: "note" }),
    ]);
  });

  test("other files are listed as not read", () => {
    const result = parsed(
      parseSkillFolder([
        { path: "sample-skill/SKILL.md", text: SAMPLE_SKILL },
        { path: "sample-skill/references/guide.md", text: "Sample guide." },
      ]),
    );
    expect(result.notImported).toContainEqual({
      where: "sample-skill/references",
      name: "guide.md",
      reason: "unread-file",
    });
  });

  test("a file without frontmatter, or with frontmatter that is never closed, is refused", () => {
    const bare = parsed(
      parseSkillFolder([
        { path: "bare/SKILL.md", text: "# Bare skill\n\nSample.\n" },
      ]),
    );
    expect(bare.refused[0].reasons[0]).toContain(
      "must start with a line of three dashes",
    );
    const open = parsed(
      parseSkillFolder([
        {
          path: "open/SKILL.md",
          text: "---\nname: open-skill\ndescription: Sample\n",
        },
      ]),
    );
    expect(open.refused[0].reasons[0]).toContain("is not closed");
  });

  test("frontmatter with a YAML alias is refused, not expanded", () => {
    const text = [
      "---",
      "name: alias-skill",
      "description: Sample",
      "metadata: &shared",
      "  author: Sample Author",
      "copy: *shared",
      "---",
      "",
      "Sample body.",
      "",
    ].join("\n");
    const result = parsed(
      parseSkillFolder([{ path: "alias-skill/SKILL.md", text }]),
    );
    expect(result.items).toEqual([]);
    expect(result.refused[0].reasons[0]).toContain("YAML aliases");
  });

  test("a duplicate frontmatter key is refused, so the later value cannot quietly win", () => {
    const text = [
      "---",
      "name: first-name",
      "name: second-name",
      "description: Sample",
      "---",
      "",
      "Sample body.",
      "",
    ].join("\n");
    const result = parsed(parseSkillFolder([{ path: "dupe/SKILL.md", text }]));
    expect(result.refused[0].reasons[0]).toContain("not valid YAML");
  });

  test("a skill with no description is refused", () => {
    const text = "---\nname: no-description\n---\n\nSample body.\n";
    const result = parsed(
      parseSkillFolder([{ path: "no-description/SKILL.md", text }]),
    );
    expect(result.refused[0].reasons).toEqual([
      'no-description/SKILL.md: "description" is missing',
    ]);
  });

  test("a byte order mark and CRLF line endings are read as the same skill", () => {
    const text = `﻿${SAMPLE_SKILL.replace(/\n/g, "\r\n")}`;
    const result = parsed(
      parseSkillFolder([{ path: "sample-skill/SKILL.md", text }]),
    );
    expect(result.items[0]).toMatchObject({
      kind: "skill",
      body: "# Sample skill\n\nSummarise the sample notes in three bullet points.",
    });
  });

  test("a non-commercial licence in a skill marks it restricted", () => {
    const text = [
      "---",
      "name: restricted-skill",
      "description: Sample",
      "license: CC BY-NC-SA 4.0",
      "---",
      "",
      "Sample body.",
      "",
    ].join("\n");
    const result = parsed(
      parseSkillFolder([{ path: "restricted-skill/SKILL.md", text }]),
    );
    expect(result.items[0]).toMatchObject({
      license: { stated: "CC BY-NC-SA 4.0", restricted: true },
    });
  });

  test("a body over 64 KiB is refused", () => {
    const text = `---\nname: long-skill\ndescription: Sample\n---\n\n${sentence(IMPORT_ITEM_MAX_BYTES + 10)}\n`;
    const result = parsed(
      parseSkillFolder([{ path: "long-skill/SKILL.md", text }]),
    );
    expect(result.items).toEqual([]);
    expect(result.refused[0].reasons.join(" ")).toContain("larger than 64 KiB");
  });

  test("a SKILL.md of 1 MiB and one byte is refused", () => {
    const text = `${SAMPLE_SKILL}${sentence(
      IMPORT_FILE_MAX_BYTES + 1 - Buffer.byteLength(SAMPLE_SKILL),
    )}`;
    expect(Buffer.byteLength(text)).toBe(IMPORT_FILE_MAX_BYTES + 1);
    const result = parsed(
      parseSkillFolder([{ path: "sample-skill/SKILL.md", text }]),
    );
    expect(result.items).toEqual([]);
    expect(result.refused[0].reasons[0]).toContain("1 MiB");
  });

  test("fifty skill folders are read and fifty-one refuse the whole batch", () => {
    const folder = (index: number): SkillFile => ({
      path: `skill-${index}/SKILL.md`,
      text: `---\nname: skill-${index}\ndescription: Sample\n---\n\nSample body.\n`,
    });
    const fifty = Array.from({ length: IMPORT_BATCH_MAX_ITEMS }, (_, index) =>
      folder(index),
    );
    expect(parsed(parseSkillFolder(fifty)).items).toHaveLength(
      IMPORT_BATCH_MAX_ITEMS,
    );
    const fiftyOne = Array.from(
      { length: IMPORT_BATCH_MAX_ITEMS + 1 },
      (_, index) => folder(index),
    );
    expect(refusedWhole(parseSkillFolder(fiftyOne))).toContain("at most 50");
  });
});

describe("the rules that hold whatever the spec says", () => {
  test("the import code reads no environment, runs no code and reaches no approval, grant or database layer", () => {
    const folder = fileURLToPath(
      new URL("../src/freeduet/import", import.meta.url),
    );
    const forbidden = [
      /process\.env/,
      /\beval\(/,
      /new Function\(/,
      /from "node:(?:fs|child_process)"/,
      /\bfetch\(/,
      /from "\.\.\/\.\.\/(?:approvals|plugins|db|routines)/,
      /from "\.\.\/\.\.\/memory\/store"/,
      /\b(?:pluginGrants|approvalRules|skillTools|personalMemories)\b/,
    ];
    for (const file of readdirSync(folder)) {
      const source = readFileSync(`${folder}/${file}`, "utf8");
      for (const pattern of forbidden)
        expect({ file, found: pattern.test(source) }).toEqual({
          file,
          found: false,
        });
    }
  });
});
