/**
 * The export half of the team file (slice S2 of docs/design/team-file.md): turns members the
 * administrator owns into the formats S1 reads. Pure: no database and no request. The route that
 * reads the rows is `team-file-routes.ts`.
 *
 * WHAT A FILE CARRIES is an allow-list, written here field by field. A member's name, job, title,
 * instructions, skills (slug, title, summary, instructions and the tool NAMES they declare), its
 * source and the file's hash. Nothing else is copied: no grant, connection, memory, lesson, address,
 * identifier, approval rule, Full access choice or setting, and no person's name or e-mail address.
 *
 * INSTRUCTIONS. FreeDuet adds the package's "Email." paragraph and shared rules to every imported
 * member (team-file.ts, section 3.2). The file therefore carries the AUTHOR'S text, without those two
 * paragraphs, so the reader adds them exactly once.
 */
import { contentSha256Of, MEMBER_FORMAT, TEAM_FORMAT } from "./team-file";

/** The marks the reader refuses inside an author's text (team-file.ts). Copied, not imported, so this module needs no package. */
const SHARED_RULES_START =
  "Shared rules. Reply in the language the person writes in.";
const EMAIL_PARAGRAPH_START = "Email. You do not send email.";

/** A tool whose name holds one of these words sends something. The reader refuses it (team-file.ts). */
const SENDING_WORDS = new Set(["send", "reply", "forward"]);

const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Licence and author for a member the administrator made. Neither is a claim the file makes for the person. */
export const UNSTATED = "Not stated";

export type ExportSkill = {
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  /** `<serverId>/<toolName>` names the skill declares. Grants are never passed here. */
  tools: string[];
};

export type ExportMember = {
  name: string;
  title: string;
  roleDescription: string;
  /** The member's own instructions as stored, possibly with the package's paragraphs at the end. */
  instructions: string;
  skills: ExportSkill[];
};

/** The package's paragraphs, word for word, which `authorTextOf` takes away from a stored text. */
export type SharedParagraphs = { email: string; shared: string };

export class ExportRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ExportRefusal";
  }
}

/**
 * The author's text: the stored instructions without the package's "Email." paragraph and shared
 * rules when they close the text, in that order. Returns null when a mark is left inside the text,
 * because then no author's text reproduces the stored one, and the reader would refuse it anyway.
 */
export function authorTextOf(
  instructions: string,
  paragraphs: SharedParagraphs,
): string | null {
  let text = instructions.trim();
  if (text.endsWith(paragraphs.shared)) {
    text = text.slice(0, text.length - paragraphs.shared.length).trimEnd();
  }
  if (text.endsWith(paragraphs.email)) {
    text = text.slice(0, text.length - paragraphs.email.length).trimEnd();
  }
  if (
    text.includes(SHARED_RULES_START) ||
    text.includes(EMAIL_PARAGRAPH_START)
  ) {
    return null;
  }
  return text;
}

/** Who the person is, as far as the scanner needs it: their address and their name. */
export type PersonMarks = { email?: string; name?: string };

/**
 * Refuses any text a file may not carry: an e-mail address, the person's own address, and the
 * person's name as a whole word. A refusal names the field, never the address or the name.
 */
export function scanForPersonalText(
  fields: Record<string, string>,
  person: PersonMarks,
): void {
  const name =
    person.name && person.name.trim().length >= 3
      ? new RegExp(
          `(^|[^\\p{L}\\p{N}])${escapeRegExp(person.name.trim())}($|[^\\p{L}\\p{N}])`,
          "iu",
        )
      : null;
  const address = person.email?.trim().toLowerCase() || null;
  for (const [field, text] of Object.entries(fields)) {
    // Only a text with an "@" can hold an address; the check is skipped otherwise, because the pattern
    // backtracks quadratically over a long run of letters that has no "@" in it.
    if (text.includes("@") && EMAIL_ADDRESS.test(text)) {
      throw new ExportRefusal(
        `${field} contains an e-mail address. A team file never carries one, so remove it from the text.`,
      );
    }
    if (address && text.toLowerCase().includes(address)) {
      throw new ExportRefusal(
        `${field} contains your own e-mail address. A team file never carries one, so remove it from the text.`,
      );
    }
    if (name?.test(text)) {
      throw new ExportRefusal(
        `${field} contains your name. A team file never carries it, so remove it from the text.`,
      );
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The tool names a skill declares, refused when one sends something (the reader would refuse the file). */
export function declaredToolsOf(slug: string, refs: string[]): string[] {
  for (const ref of refs) {
    const tool = ref.slice(ref.indexOf("/") + 1);
    const words = tool
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    if (words.some((word) => SENDING_WORDS.has(word))) {
      throw new ExportRefusal(
        `skill "${slug}" names ${ref}, which sends email. Only Otto sends email, so a member in a file cannot hold a sending tool. Remove that skill from the member.`,
      );
    }
  }
  return refs;
}

/** One member as the file holds it, with the author's text, the job and the skills. */
function memberObject(member: ExportMember, paragraphs: SharedParagraphs) {
  const systemPrompt = authorTextOf(member.instructions, paragraphs);
  if (systemPrompt === null) {
    throw new ExportRefusal(
      `${member.name}: the instructions contain a shared paragraph in the middle of the text, so no author's text can be written from them. Remove the paragraph.`,
    );
  }
  return {
    name: member.name,
    title: member.title,
    role_description: member.roleDescription,
    system_prompt: systemPrompt,
    skills: member.skills.map((skill) => ({
      slug: skill.slug,
      title: skill.title,
      summary: skill.summary,
      instructions: skill.instructions,
      tools: declaredToolsOf(skill.slug, skill.tools),
    })),
    test_requests: [],
    source: { author: UNSTATED, licence: UNSTATED, derived_from: null },
  };
}

/** The text a file holds: JSON with the hash of its own content, and a final newline. */
function serialise(content: Record<string, unknown>): string {
  const withHash = { ...content, content_sha256: contentSha256Of(content) };
  return `${JSON.stringify(withHash, null, 2)}\n`;
}

/** A file for one member. Refused for a member the file cannot carry. */
export function memberFileText(
  member: ExportMember,
  paragraphs: SharedParagraphs,
): string {
  return serialise({
    format: MEMBER_FORMAT,
    ...memberObject(member, paragraphs),
  });
}

/** A team file: one entry per member, under the team's name. */
export function teamFileText(
  teamName: string,
  members: ExportMember[],
  paragraphs: SharedParagraphs,
): string {
  return serialise({
    format: TEAM_FORMAT,
    name: teamName,
    members: members.map((member) => memberObject(member, paragraphs)),
  });
}
