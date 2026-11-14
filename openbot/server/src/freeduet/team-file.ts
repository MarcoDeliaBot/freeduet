/**
 * Teams and members from one file: slice S1 of docs/design/team-file.md.
 *
 * Two formats, `freeduet-member/1` for one member and `freeduet-team/1` for a list of them, and a
 * strict reader that checks a file against the team package before anybody sees it. The reader
 * refuses what section 3.2 of the design refuses: a `${`, hidden characters, any field a file may not
 * set (an endpoint, a grant, a credential, an approval, Full access, a visibility, a Bot id), a
 * starter member's name, a skill slug the package does not allow, a sending tool. It keeps a tool ref
 * only when some member of the package already holds it, so a file never grants more than the package
 * does. It adds the package's "Email." paragraph and shared rules to every member, word for word, so a
 * file cannot leave them out.
 *
 * It writes nothing. There is no database here, no card and no Bot: the preview is S3 and the create
 * is S4. Reading is pure, so the same text and the same package always give the same answer.
 *
 * The package comes from the existing loader (`tenant-package.ts`). The one thing this reader asks of
 * the loader is `declaredAgents`: every coworker the package declares, including the ones this
 * deployment does not run.
 */
import { createHash } from "node:crypto";
import { DEPLOYMENT_ROUTES } from "../computer/deployment-routes";
import type { DeclaredAgent, TenantPackage } from "../tenant-package";

export const MEMBER_FORMAT = "freeduet-member/1";
export const TEAM_FORMAT = "freeduet-team/1";

/**
 * The sizes a file may have. The byte limits are the design's proposals (section 3.2, marked
 * [assumed] there). The instruction cap is the create form's own limit, which decision 2 leaves
 * open. It is reported, not enforced: the shared rules alone are longer than it (see `notices`).
 */
export const TEAM_FILE_LIMITS = {
  fileBytes: 1_048_576,
  textBytes: 65_536,
  nameCharacters: 60,
  titleCharacters: 120,
  roleDescriptionCharacters: 1000,
  instructionsCharacters: 1000,
} as const;

/** A skill slug. The same pattern the package loader uses (`tenant-package.ts`, `parseTenantSkills`). */
export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** `<serverId>/<toolName>`, the one shape a grant and a declaration share. */
const TOOL_REF_PATTERN = /^[^/\s]+\/[^/\s]+$/;

/** A tool whose name holds one of these words sends something. Only Otto sends email (D30). */
const SENDING_WORDS = new Set(["send", "reply", "forward"]);

/** Control and format characters: invisible, or not text at all. Tab and line feed are allowed. */
const HIDDEN_CHARACTER = /[\p{Cc}\p{Cf}]/gu;

/** The member whose last paragraph is the shared rules, copied word for word (D30). */
const SHARED_RULES_MEMBER = "writer";
/** The member whose "Email." paragraph every member that does not send carries (D30). */
const EMAIL_MEMBER = "bookkeeper";
const SHARED_RULES_START =
  "Shared rules. Reply in the language the person writes in.";
const EMAIL_PARAGRAPH_START = "Email. You do not send email.";

/** A key that names a setting a file must never set. Refused with a sentence that says why. */
const SENSITIVE_KEY =
  /endpoint|url|address|grant|credential|secret|token|password|key|approv|full_access|visib|bot|^id$|^type$|engine|billing/i;

const SKILL_KEYS = ["slug", "title", "summary", "instructions", "tools"];
const TEST_KEYS = ["request", "must", "must_not", "safety"];
const SOURCE_KEYS = ["author", "licence", "derived_from"];
const MEMBER_BODY_KEYS = [
  "name",
  "title",
  "role_description",
  "system_prompt",
  "skills",
  "test_requests",
  "source",
];
const TEAM_KEYS = ["format", "name", "members"];

export type ReadSkill = {
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  /** The tool refs the package holds, in the file's order. */
  tools: string[];
};

export type ReadTestRequest = {
  request: string;
  must: string[];
  mustNot: string[];
  safety: boolean;
};

export type ReadMember = {
  name: string;
  title: string;
  roleDescription: string;
  /** The author's own instructions, as the file gives them, with the ends trimmed. */
  systemPrompt: string;
  /** What an imported member carries: the author's text, then the "Email." paragraph, then the shared rules. */
  instructions: string;
  instructionsCharacters: number;
  instructionsWithinCap: boolean;
  skills: ReadSkill[];
  testRequests: ReadTestRequest[];
  source: { author: string; licence: string; derivedFrom: string | null };
  /** Tool refs the file names that no member of the package holds. They are left out, and listed here. */
  removedTools: { skill: string; ref: string }[];
  /** A file never certifies itself. A member read from a file stays uncertified until an eval stack says otherwise. */
  certified: false;
};

export type ReadTeamFile = {
  format: typeof MEMBER_FORMAT | typeof TEAM_FORMAT;
  /** The member's name for a member file, the team's name for a team file. */
  name: string;
  members: ReadMember[];
  /** SHA-256 of the file's content without `content_sha256`. Computed for every file. */
  contentSha256: string;
  /** Whether the file carried a hash, which then matched the content. */
  hashWasWritten: boolean;
  /** What the preview must say that is not a refusal: the instruction cap, and the tool refs left out. */
  notices: string[];
};

export type TeamFileRefusal = {
  /** Where in the file: `name`, `skills[1].tools[0]`, `members[2].name`, `line 14`, `file` or `package`. */
  path: string;
  /** One plain-English sentence on what is wrong and what to do about it. */
  reason: string;
};

export type TeamFileReading =
  | { ok: true; file: ReadTeamFile }
  | { ok: false; refusal: TeamFileRefusal };

/** The checks that need the package, worked out once per file. */
type Context = {
  /** Reserved names by their normalised form, with the phrase that says why each is reserved. */
  reserved: Map<string, string>;
  packageSkillSlugs: Set<string>;
  /** Tool refs that some member of the package may hold: the refs of skills attached to a declared member. */
  allowedTools: Set<string>;
  /** The "Email." paragraph, word for word from the package. */
  email: string;
  /** The shared rules, word for word from the package. */
  shared: string;
};

type TextOptions = { multiline?: boolean; max?: number };

type DeclaredSkill = {
  slug: string;
  /** Where the skill sits in the file, for a refusal that names both places. */
  path: string;
  /** The skill as the file declares it, before any tool is left out, so two members can be compared. */
  declared: {
    title: string;
    summary: string;
    instructions: string;
    tools: string[];
  };
};

type MemberReading = { member: ReadMember; declaredSkills: DeclaredSkill[] };

/** One refusal, carrying the path and the sentence. Caught once, at the top, and returned as data. */
class Refusal extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = "Refusal";
    this.path = path;
    this.reason = reason;
  }
}

function refuse(path: string, reason: string): never {
  throw new Refusal(path, reason);
}

/**
 * Reads a team or member file as text, against the team package.
 *
 * Returns the first refusal rather than a list: the reader stops where the file first goes wrong, so
 * every refusal names one field and one thing to fix. Callers decode the file as UTF-8 themselves,
 * strictly, before they pass it here.
 */
export function readTeamFile(
  text: string,
  tenantPackage: TenantPackage,
): TeamFileReading {
  try {
    return { ok: true, file: readDocument(text, tenantPackage) };
  } catch (error) {
    if (error instanceof Refusal) {
      return {
        ok: false,
        refusal: { path: error.path, reason: error.reason },
      };
    }
    throw error;
  }
}

/** SHA-256 of a file's content, its keys sorted and its whitespace dropped, so an editor's reformatting does not change it. */
export function contentSha256Of(content: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

function readDocument(
  text: string,
  tenantPackage: TenantPackage,
): ReadTeamFile {
  if (text.charCodeAt(0) === 0xfeff) {
    refuse(
      "file",
      "starts with a byte-order mark, which some editors add to UTF-8 files and which FreeDuet refuses. Save the file again as UTF-8 without a byte-order mark.",
    );
  }
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > TEAM_FILE_LIMITS.fileBytes) {
    refuse(
      "file",
      `is ${bytes.toLocaleString("en-US")} bytes. The limit is 1,048,576 bytes (1 MB), so split the team into more than one file.`,
    );
  }
  const document = parseObject(text);
  const duplicate = findDuplicateKey(text);
  if (duplicate) {
    refuse(
      `line ${duplicate.again}`,
      `sets "${duplicate.key}" a second time, after line ${duplicate.first}. FreeDuet will not guess which value you meant, so keep one of them.`,
    );
  }
  const { content_sha256: writtenHash, ...content } = document;
  if (content.format === undefined) {
    refuse(
      "format",
      `is missing. Add "format": "${MEMBER_FORMAT}" for one member, or "${TEAM_FORMAT}" for a team.`,
    );
  }
  if (content.format !== MEMBER_FORMAT && content.format !== TEAM_FORMAT) {
    refuse(
      "format",
      `is ${JSON.stringify(content.format)}. FreeDuet reads "${MEMBER_FORMAT}" (one member) and "${TEAM_FORMAT}" (a team), and no other version.`,
    );
  }
  const contentSha256 = contentSha256Of(content);
  if (writtenHash !== undefined) {
    if (
      typeof writtenHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(writtenHash)
    ) {
      refuse(
        "content_sha256",
        "must be a SHA-256 hash: 64 lowercase hexadecimal characters.",
      );
    }
    if (writtenHash !== contentSha256) {
      refuse(
        "content_sha256",
        "does not match the rest of the file, so the file was changed after its hash was written. Remove the hash to load the file as a new one, or take the hash from its author.",
      );
    }
  }
  const context = contextFor(tenantPackage);
  const hashWasWritten = writtenHash !== undefined;

  if (content.format === MEMBER_FORMAT) {
    const { member } = readMember(content, "", context, [
      "format",
      ...MEMBER_BODY_KEYS,
    ]);
    return {
      format: MEMBER_FORMAT,
      name: member.name,
      members: [member],
      contentSha256,
      hashWasWritten,
      notices: noticesFor(member),
    };
  }
  return readTeam(content, context, contentSha256, hashWasWritten);
}

function parseObject(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    refuse(
      "file",
      `is not valid JSON, so FreeDuet cannot read it (${detail}). Check the commas, the quotes and the brackets.`,
    );
  }
  if (!isObject(value)) {
    refuse("file", "must hold one JSON object, with curly brackets around it.");
  }
  return value;
}

function readTeam(
  content: Record<string, unknown>,
  context: Context,
  contentSha256: string,
  hashWasWritten: boolean,
): ReadTeamFile {
  checkKeys(content, TEAM_KEYS, "");
  const name = requiredText(content.name, "name", {
    max: TEAM_FILE_LIMITS.nameCharacters,
  });
  if (content.members === undefined) {
    refuse("members", "is missing. A team needs at least one member.");
  }
  const list = objectList(content.members, "members");
  if (list.length === 0) {
    refuse("members", "lists no member. A team needs at least one.");
  }
  const members: ReadMember[] = [];
  const memberNames = new Map<string, string>();
  const teamSkills = new Map<string, DeclaredSkill>();
  for (let index = 0; index < list.length; index += 1) {
    const path = item("members", index);
    const { member, declaredSkills } = readMember(
      list[index],
      path,
      context,
      MEMBER_BODY_KEYS,
    );
    const nameKey = normalisedName(member.name);
    const earlier = memberNames.get(nameKey);
    if (earlier !== undefined) {
      refuse(
        child(path, "name"),
        `is also the name of ${earlier}. Two members in one team need different names.`,
      );
    }
    memberNames.set(nameKey, path);
    for (const skill of declaredSkills) {
      const seen = teamSkills.get(skill.slug);
      if (seen === undefined) {
        teamSkills.set(skill.slug, skill);
      } else if (
        canonicalJson(seen.declared) !== canonicalJson(skill.declared)
      ) {
        refuse(
          child(skill.path, "slug"),
          `is also the slug of a skill in ${seen.path}, with different text. A slug names one skill, so give these two different slugs, or make their text the same.`,
        );
      }
    }
    members.push(member);
  }
  return {
    format: TEAM_FORMAT,
    name,
    members,
    contentSha256,
    hashWasWritten,
    notices: members.flatMap(noticesFor),
  };
}

function readMember(
  value: unknown,
  base: string,
  context: Context,
  keys: readonly string[],
): MemberReading {
  const object = asObject(value, base === "" ? "file" : base);
  checkKeys(object, keys, base);
  const name = memberName(object.name, child(base, "name"), context);
  const title = requiredText(object.title, child(base, "title"), {
    max: TEAM_FILE_LIMITS.titleCharacters,
  });
  const roleDescription = requiredText(
    object.role_description,
    child(base, "role_description"),
    { max: TEAM_FILE_LIMITS.roleDescriptionCharacters },
  );
  const systemPrompt = requiredText(
    object.system_prompt,
    child(base, "system_prompt"),
    { multiline: true },
  );
  if (
    systemPrompt.includes(SHARED_RULES_START) ||
    systemPrompt.includes(EMAIL_PARAGRAPH_START)
  ) {
    refuse(
      child(base, "system_prompt"),
      "already has the shared rules or the Email paragraph. FreeDuet adds both to every imported member, so remove them from this text.",
    );
  }

  const skillsPath = child(base, "skills");
  const skills: ReadSkill[] = [];
  const declaredSkills: DeclaredSkill[] = [];
  const removedTools: { skill: string; ref: string }[] = [];
  const slugs = new Map<string, string>();
  const skillList = objectList(object.skills, skillsPath);
  for (let index = 0; index < skillList.length; index += 1) {
    const path = item(skillsPath, index);
    const reading = readSkill(skillList[index], path, context, slugs);
    skills.push(reading.skill);
    declaredSkills.push(reading.declared);
    for (const ref of reading.removed) {
      removedTools.push({ skill: reading.skill.slug, ref });
    }
  }

  const testsPath = child(base, "test_requests");
  const testRequests = objectList(object.test_requests, testsPath).map(
    (entry, index) => readTestRequest(entry, item(testsPath, index)),
  );
  const source = readSource(object.source, child(base, "source"));

  const instructions = [systemPrompt, context.email, context.shared].join(
    "\n\n",
  );
  return {
    member: {
      name,
      title,
      roleDescription,
      systemPrompt,
      instructions,
      instructionsCharacters: instructions.length,
      instructionsWithinCap:
        instructions.length <= TEAM_FILE_LIMITS.instructionsCharacters,
      skills,
      testRequests,
      source,
      removedTools,
      certified: false,
    },
    declaredSkills,
  };
}

function readSkill(
  value: unknown,
  base: string,
  context: Context,
  slugs: Map<string, string>,
): {
  skill: ReadSkill;
  declared: DeclaredSkill;
  removed: string[];
} {
  const object = asObject(value, base);
  checkKeys(object, SKILL_KEYS, base);
  const slug = requiredText(object.slug, child(base, "slug"));
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    refuse(
      child(base, "slug"),
      "must be lowercase letters, digits and hyphens, 2 to 40 characters, starting and ending with a letter or digit.",
    );
  }
  if (context.packageSkillSlugs.has(slug)) {
    refuse(
      child(base, "slug"),
      `"${slug}" is a skill the team package ships. Choose another slug.`,
    );
  }
  const earlier = slugs.get(slug);
  if (earlier !== undefined) {
    refuse(
      child(base, "slug"),
      `is already the slug of ${earlier} in this member. Each skill needs its own slug.`,
    );
  }
  slugs.set(slug, base);
  const title = requiredText(object.title, child(base, "title"));
  const summary = requiredText(object.summary, child(base, "summary"));
  const instructions = requiredText(
    object.instructions,
    child(base, "instructions"),
    { multiline: true },
  );

  const toolsPath = child(base, "tools");
  const declaredTools: string[] = [];
  const kept: string[] = [];
  const removed: string[] = [];
  const seenTools = new Set<string>();
  const toolList = objectList(object.tools, toolsPath);
  for (let index = 0; index < toolList.length; index += 1) {
    const path = item(toolsPath, index);
    const ref = readText(toolList[index], path, {});
    if (!TOOL_REF_PATTERN.test(ref)) {
      refuse(
        path,
        `"${ref}" must be written as serverId/toolName, such as google-drive/search_files.`,
      );
    }
    if (isSendingTool(ref)) {
      refuse(
        path,
        `"${ref}" sends email. Only Otto sends email in this team, so a member made from a file cannot hold a sending tool.`,
      );
    }
    if (seenTools.has(ref)) {
      refuse(path, `"${ref}" is listed twice in this skill.`);
    }
    seenTools.add(ref);
    declaredTools.push(ref);
    if (context.allowedTools.has(ref)) {
      kept.push(ref);
    } else {
      removed.push(ref);
    }
  }

  return {
    skill: { slug, title, summary, instructions, tools: kept },
    declared: {
      slug,
      path: base,
      declared: { title, summary, instructions, tools: declaredTools },
    },
    removed,
  };
}

function readTestRequest(value: unknown, base: string): ReadTestRequest {
  const object = asObject(value, base);
  checkKeys(object, TEST_KEYS, base);
  const request = requiredText(object.request, child(base, "request"), {
    multiline: true,
  });
  const must = textList(object.must, child(base, "must"));
  const mustNot = textList(object.must_not, child(base, "must_not"));
  const safety = booleanField(object.safety, child(base, "safety"));
  if (must.length + mustNot.length === 0) {
    refuse(
      base,
      'has no "must" or "must_not" line, so nothing could be checked. Add at least one.',
    );
  }
  return { request, must, mustNot, safety };
}

function readSource(value: unknown, base: string): ReadMember["source"] {
  if (value === undefined) {
    refuse(base, "is missing. Name the author and the licence.");
  }
  const object = asObject(value, base);
  checkKeys(object, SOURCE_KEYS, base);
  const author = requiredText(object.author, child(base, "author"));
  const licence = requiredText(object.licence, child(base, "licence"));
  const derived = object.derived_from;
  return {
    author,
    licence,
    derivedFrom:
      derived === undefined || derived === null
        ? null
        : requiredText(derived, child(base, "derived_from")),
  };
}

/**
 * The package facts every file is checked against, read once. A package that lacks what the reader
 * copies from it is refused here, as the package's problem and not the file's.
 */
function contextFor(tenantPackage: TenantPackage): Context {
  const declared = tenantPackage.declaredAgents;
  if (declared === undefined) {
    refuse(
      "package",
      "does not list its members, so a file cannot be checked against it. This is a problem with the team package, not with the file.",
    );
  }
  const reserved = new Map<string, string>();
  const reserve = (label: string, why: string) => {
    const key = normalisedName(label);
    if (key && !reserved.has(key)) reserved.set(key, why);
  };
  for (const agent of declared) {
    reserve(agent.name, "the name of a member the team package ships");
  }
  reserve(tenantPackage.productName, "this product's own name");
  for (const route of DEPLOYMENT_ROUTES) {
    reserve(route, "a word a deployment route uses");
  }

  const shared = promptFor(declared, SHARED_RULES_MEMBER);
  const sharedAt = shared === null ? -1 : shared.indexOf(SHARED_RULES_START);
  if (shared === null || sharedAt < 0) {
    refuse(
      "package",
      `has no shared rules to add: the member "${SHARED_RULES_MEMBER}" does not carry them, so an imported member cannot get them.`,
    );
  }
  const bookkeeper = promptFor(declared, EMAIL_MEMBER);
  const emailAt =
    bookkeeper === null ? -1 : bookkeeper.indexOf(EMAIL_PARAGRAPH_START);
  if (bookkeeper === null || emailAt < 0) {
    refuse(
      "package",
      `has no "Email." paragraph to add: the member "${EMAIL_MEMBER}" does not carry it, so an imported member cannot get it.`,
    );
  }
  const emailEnd = bookkeeper.indexOf("\n", emailAt);
  const attached = new Set(declared.flatMap((agent) => agent.skills));
  return {
    reserved,
    packageSkillSlugs: new Set(tenantPackage.skills.map((skill) => skill.slug)),
    allowedTools: new Set(
      tenantPackage.skills
        .filter((skill) => attached.has(skill.slug))
        .flatMap((skill) => skill.tools),
    ),
    email: (emailEnd < 0
      ? bookkeeper.slice(emailAt)
      : bookkeeper.slice(emailAt, emailEnd)
    ).trim(),
    shared: shared.slice(sharedAt).trim(),
  };
}

function promptFor(declared: DeclaredAgent[], id: string): string | null {
  return declared.find((agent) => agent.id === id)?.systemPrompt ?? null;
}

function memberName(value: unknown, path: string, context: Context): string {
  const name = requiredText(value, path, {
    max: TEAM_FILE_LIMITS.nameCharacters,
  });
  const key = normalisedName(name);
  if (key === "") {
    refuse(path, "needs at least one letter or digit.");
  }
  const reserved = context.reserved.get(key);
  if (reserved !== undefined) {
    refuse(path, `"${name}" is ${reserved}. Choose another name.`);
  }
  return name;
}

/** A name compared without case, spacing, punctuation or accents, so that "iRiS." is "Iris". */
function normalisedName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** A tool is a sending one when its name holds a sending word: `gmail_send_message`, `gmail_send_reply`. */
function isSendingTool(ref: string): boolean {
  const tool = ref.slice(ref.indexOf("/") + 1);
  const words = tool
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((word) => SENDING_WORDS.has(word));
}

function requiredText(
  value: unknown,
  path: string,
  options: TextOptions = {},
): string {
  if (value === undefined) {
    refuse(path, "is missing. Add it.");
  }
  return readText(value, path, options);
}

function readText(value: unknown, path: string, options: TextOptions): string {
  if (typeof value !== "string") {
    refuse(path, "must be text, in double quotes.");
  }
  // Checked before the trim: trimming would drop a byte-order mark at either end without a word, and
  // the text the person approves must be the text the file holds.
  const hidden = firstHidden(value);
  if (hidden !== undefined) {
    refuse(
      path,
      `contains the invisible or control character U+${hexOf(hidden)}. FreeDuet refuses those, so the text you approve is the text you read. Remove it.`,
    );
  }
  const text = value.trim();
  if (text === "") {
    refuse(path, "must not be empty.");
  }
  if (text.includes("${")) {
    refuse(
      path,
      'contains "${", which FreeDuet fills in from its own settings. Remove that text.',
    );
  }
  if (!options.multiline && text.includes("\n")) {
    refuse(path, "must be one line.");
  }
  if (options.max !== undefined && text.length > options.max) {
    refuse(path, `is ${text.length} characters. The limit is ${options.max}.`);
  }
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > TEAM_FILE_LIMITS.textBytes) {
    refuse(
      path,
      `is ${bytes.toLocaleString("en-US")} bytes. The limit for one piece of text is 64 KB.`,
    );
  }
  return text;
}

function textList(value: unknown, path: string): string[] {
  return objectList(value, path).map((entry, index) =>
    readText(entry, item(path, index), { multiline: false }),
  );
}

function booleanField(value: unknown, path: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    refuse(path, "must be true or false.");
  }
  return value;
}

/** A list, which may be left out (it is then empty). Anything else is refused. */
function objectList(value: unknown, path: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    refuse(path, "must be a list, in square brackets.");
  }
  return value;
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) {
    refuse(path, "must be an object, in curly brackets.");
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  base: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      refuse(child(base, key), unknownKeyReason(key));
    }
  }
}

function unknownKeyReason(key: string): string {
  if (key === "format") {
    return "is set once, at the top of the file, not in a member. Remove it.";
  }
  if (SENSITIVE_KEY.test(key)) {
    return `is not allowed in a file. A file cannot set an endpoint, a type, a grant, a credential, an approval, Full access, a visibility or a Bot id. Remove "${key}".`;
  }
  return `is not a field of this format. Remove "${key}", or check its spelling.`;
}

function noticesFor(member: ReadMember): string[] {
  const notes: string[] = [];
  if (!member.instructionsWithinCap) {
    notes.push(
      `${member.name}: its instructions, with the Email paragraph and the shared rules added, are ${member.instructionsCharacters.toLocaleString("en-US")} characters. The create form allows ${TEAM_FILE_LIMITS.instructionsCharacters.toLocaleString("en-US")}, so this member cannot be created until that limit changes.`,
    );
  }
  for (const removed of member.removedTools) {
    notes.push(
      `${member.name}: skill "${removed.skill}" names ${removed.ref}, which no member of this team package holds, so it is left out.`,
    );
  }
  return notes;
}

function child(base: string, key: string): string {
  return base === "" ? key : `${base}.${key}`;
}

function item(base: string, index: number): string {
  return `${base}[${index}]`;
}

function firstHidden(text: string): string | undefined {
  for (const match of text.matchAll(HIDDEN_CHARACTER)) {
    const character = match[0];
    if (character !== "\n" && character !== "\t") return character;
  }
  return undefined;
}

function hexOf(character: string): string {
  return (character.codePointAt(0) ?? 0)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
}

type DuplicateKey = { key: string; first: number; again: number };

/**
 * The first key that an object sets twice, with the lines of both.
 *
 * `JSON.parse` keeps the last of two equal keys without a word, so a file could show one value on
 * the card and run another. The text is already valid JSON when this runs, so the scan can be simple:
 * it tracks the open brackets, and a string followed by a colon inside an object is a key.
 */
function findDuplicateKey(text: string): DuplicateKey | undefined {
  const open: Array<Map<string, number> | null> = [];
  let line = 1;
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === "\n") {
      line += 1;
      index += 1;
    } else if (character === "{") {
      open.push(new Map());
      index += 1;
    } else if (character === "[") {
      open.push(null);
      index += 1;
    } else if (character === "}" || character === "]") {
      open.pop();
      index += 1;
    } else if (character === '"') {
      const start = index;
      const startLine = line;
      index += 1;
      while (index < text.length && text.charAt(index) !== '"') {
        index += text.charAt(index) === "\\" ? 2 : 1;
      }
      index += 1;
      const scope = open[open.length - 1];
      let next = index;
      while (next < text.length && " \t\r\n".includes(text.charAt(next))) {
        next += 1;
      }
      if (scope && text.charAt(next) === ":") {
        const key = JSON.parse(text.slice(start, index)) as string;
        const first = scope.get(key);
        if (first !== undefined) return { key, first, again: startLine };
        scope.set(key, startLine);
      }
    } else {
      index += 1;
    }
  }
  return undefined;
}

/** JSON with keys sorted at every depth and no whitespace: the same content always gives the same text. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isObject(value)) {
    const pairs = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}
