import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readTeamFile } from "../src/freeduet/team-file";
import {
  authorTextOf,
  declaredToolsOf,
  ExportRefusal,
  memberFileText,
  type SharedParagraphs,
  scanForPersonalText,
} from "../src/freeduet/team-file-export";
import { loadTenantPackage } from "../src/tenant-package";

/** The package's own paragraphs, read as the route reads them: the bookkeeper's "Email." and the writer's shared rules. */
const SHARED_RULES =
  "Shared rules. Reply in the language the person writes in.";
const EMAIL = "Email. You do not send email.";

async function packageParagraphs() {
  const tenantPackage = await loadTenantPackage(
    join(import.meta.dir, "../../examples/freeduet"),
  );
  const declared = tenantPackage.declaredAgents ?? [];
  const writer =
    declared.find((agent) => agent.id === "writer")?.systemPrompt ?? "";
  const bookkeeper =
    declared.find((agent) => agent.id === "bookkeeper")?.systemPrompt ?? "";
  const emailAt = bookkeeper.indexOf(EMAIL);
  const emailEnd = bookkeeper.indexOf("\n", emailAt);
  const paragraphs: SharedParagraphs = {
    email: bookkeeper
      .slice(emailAt, emailEnd < 0 ? undefined : emailEnd)
      .trim(),
    shared: writer.slice(writer.indexOf(SHARED_RULES)).trim(),
  };
  return { tenantPackage, declared, paragraphs };
}

describe("the shipped team's text", () => {
  test("for each shipped member that carries both paragraphs, the author's text composes back to the package's text", async () => {
    const { declared, paragraphs } = await packageParagraphs();
    const carriers = declared.filter((agent) => {
      const prompt = agent.systemPrompt ?? "";
      return (
        prompt.includes(paragraphs.email) && prompt.includes(paragraphs.shared)
      );
    });
    // Iris carries neither paragraph; Otto carries the shared rules and his own Email paragraph.
    expect(carriers.map((agent) => agent.id).sort()).toEqual(
      [
        "bookkeeper",
        "chef",
        "concierge",
        "counsel",
        "creator",
        "fixer",
        "marketer",
        "reviewer",
        "video",
        "writer",
      ].sort(),
    );
    for (const agent of carriers) {
      const prompt = (agent.systemPrompt ?? "").trim();
      const author = authorTextOf(prompt, paragraphs);
      expect(author).not.toBeNull();
      // The same words in the same order. The package joins its paragraphs with one line break and the
      // reader joins them with a blank line, so the comparison ignores the difference in whitespace.
      const words = (value: string) => value.replace(/\s+/g, " ").trim();
      expect(
        words([author, paragraphs.email, paragraphs.shared].join("\n\n")),
      ).toBe(words(prompt));
    }
  });

  test("Otto's sending tools are refused by name before a file is written", async () => {
    const { tenantPackage } = await packageParagraphs();
    const otto = tenantPackage.skills
      .flatMap((skill) => skill.tools)
      .filter((ref) => ref.includes("gmail_send"));
    expect(otto.length).toBeGreaterThan(0);
    expect(() => declaredToolsOf("otto-mail", otto)).toThrow(ExportRefusal);
  });
});

describe("the author's text", () => {
  test("the package's paragraphs are taken away, and only from the end", async () => {
    const { paragraphs } = await packageParagraphs();
    expect(
      authorTextOf(
        `Be brief.\n\n${paragraphs.email}\n\n${paragraphs.shared}`,
        paragraphs,
      ),
    ).toBe("Be brief.");
    expect(authorTextOf("Be brief.", paragraphs)).toBe("Be brief.");
  });

  test("a paragraph left in the middle of the text is refused, because no author's text reproduces it", async () => {
    const { paragraphs } = await packageParagraphs();
    expect(
      authorTextOf(`${paragraphs.shared}\n\nAfter the rules.`, paragraphs),
    ).toBeNull();
  });
});

describe("what a file never carries", () => {
  test("an e-mail address in any field is refused, and the refusal does not echo it", () => {
    const address = "person.name@example.test";
    try {
      scanForPersonalText(
        { "Renewal Desk: instructions": `Write to ${address}.` },
        {},
      );
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ExportRefusal);
      expect((error as ExportRefusal).reason).toContain(
        "Renewal Desk: instructions",
      );
      expect((error as ExportRefusal).reason).not.toContain(address);
    }
  });

  test("the person's own address and name are refused as whole words only", () => {
    expect(() =>
      scanForPersonalText(
        { job: "Ask Marco Rossi first." },
        { name: "Marco Rossi" },
      ),
    ).toThrow(ExportRefusal);
    expect(() =>
      scanForPersonalText({ job: "Marcolino is a town." }, { name: "Marco" }),
    ).not.toThrow();
    expect(() =>
      scanForPersonalText(
        { job: "Mail the Admin@Example.test desk." },
        { email: "admin@example.test" },
      ),
    ).toThrow(ExportRefusal);
  });

  test("a sending word inside a tool name is refused, and a reading tool is not", () => {
    expect(() =>
      declaredToolsOf("mail", ["google-workspace/gmail_read_message"]),
    ).not.toThrow();
    expect(() =>
      declaredToolsOf("mail", ["google-workspace/gmail_forward"]),
    ).toThrow(ExportRefusal);
  });
});

describe("a file made here is read back by the reader", () => {
  test("a synthetic member round-trips with its text, its hash and no certification", async () => {
    const { tenantPackage, paragraphs } = await packageParagraphs();
    const instructions = `You keep the renewal calendar.\n\nAnswer with the date first.`;
    const text = memberFileText(
      {
        name: "Renewal Desk",
        title: "Contract renewals",
        roleDescription: "Keeps the renewal calendar.",
        instructions,
        skills: [],
      },
      paragraphs,
    );
    const reading = readTeamFile(text, tenantPackage);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.file.hashWasWritten).toBe(true);
    expect(reading.file.members[0]?.systemPrompt).toBe(instructions);
    expect(reading.file.members[0]?.instructions).toBe(
      [instructions, paragraphs.email, paragraphs.shared].join("\n\n"),
    );
    expect(reading.file.members[0]?.certified).toBe(false);
  });
});
