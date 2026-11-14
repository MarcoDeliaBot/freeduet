/**
 * Teams and members from one file, slice S1 (docs/design/team-file.md, sections 3.1 and 3.2): the two
 * formats and their strict reader. Each refusal of section 3.2 has its own test, and each test names
 * the field the refusal points at.
 *
 * The package is the real one, read through the real loader. Every person, source and request in a
 * fixture is invented. Nothing here reads a database.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentSha256Of,
  MEMBER_FORMAT,
  readTeamFile,
  SKILL_SLUG_PATTERN,
  TEAM_FILE_LIMITS,
  TEAM_FORMAT,
  type ReadTeamFile,
  type TeamFileReading,
  type TeamFileRefusal,
} from "../src/freeduet/team-file";
import {
  expandEnvironment,
  loadTenantPackage,
  type TenantPackage,
  validateTenantPackage,
} from "../src/tenant-package";

const packageDirectory = fileURLToPath(
  new URL("../../examples/freeduet", import.meta.url),
);

const SHARED_RULES_START =
  "Shared rules. Reply in the language the person writes in.";
const EMAIL_START = "Email. You do not send email.";

let tenantPackage: TenantPackage;

beforeAll(async () => {
  tenantPackage = await loadTenantPackage(packageDirectory);
});

/** The package read from disk with the given environment, through the loader's own functions. */
async function packageWith(
  environment: Record<string, string | undefined>,
): Promise<TenantPackage> {
  const read = async (name: string) =>
    expandEnvironment(
      await readFile(join(packageDirectory, name), "utf8"),
      name,
      environment,
    );
  return validateTenantPackage({
    brand: await read("brand.yaml"),
    agents: await read("agents.yaml"),
    channels: await read("channels.yaml"),
    model: await read("model.yaml"),
    knowledge: await read("knowledge.yaml"),
    skills: await read("skills.yaml"),
    agentFiles: [],
    themeCss: "",
  });
}

const AUTHOR_PROMPT =
  "You are the renewal desk. You list the contracts that renew within sixty days and what to check before each.\n\nYou answer in short lists. You never invent a date, a price or a clause.";

function memberDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    format: MEMBER_FORMAT,
    name: "Renewal Desk",
    title: "Contract renewals",
    role_description:
      "Keeps track of contract renewal dates and lists what to check before each one.",
    system_prompt: AUTHOR_PROMPT,
    skills: [],
    test_requests: [
      {
        request: "Which contracts renew this month?",
        must: ["Lists the renewals, or says that none are known."],
        must_not: ["Invents a renewal date."],
      },
    ],
    source: { author: "Example Author", licence: "MIT", derived_from: null },
    ...overrides,
  };
}

/** A member as it sits inside a team file: the same fields, and no format line of its own. */
function teamMemberDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const { format: _format, ...body } = memberDocument(overrides);
  return body;
}

function teamDocument(
  members: Record<string, unknown>[],
): Record<string, unknown> {
  return { format: TEAM_FORMAT, name: "Example Team", members };
}

function fileOf(document: unknown): string {
  return JSON.stringify(document, null, 2);
}

function read(
  text: string,
  tenant: TenantPackage = tenantPackage,
): TeamFileReading {
  return readTeamFile(text, tenant);
}

function refusalOf(reading: TeamFileReading): TeamFileRefusal {
  if (reading.ok) {
    throw new Error(
      `expected a refusal, but the file was read as ${reading.file.format}`,
    );
  }
  return reading.refusal;
}

function fileRead(reading: TeamFileReading): ReadTeamFile {
  if (!reading.ok) {
    throw new Error(
      `expected a file, but it was refused at ${reading.refusal.path}: ${reading.refusal.reason}`,
    );
  }
  return reading.file;
}

/** The two paragraphs the reader must add, copied from the package by the same markers the design names. */
function paragraphsOf(tenant: TenantPackage): {
  email: string;
  shared: string;
} {
  const declared = tenant.declaredAgents ?? [];
  const writer =
    declared.find((agent) => agent.id === "writer")?.systemPrompt ?? "";
  const bookkeeper =
    declared.find((agent) => agent.id === "bookkeeper")?.systemPrompt ?? "";
  const emailStart = bookkeeper.indexOf(EMAIL_START);
  const emailEnd = bookkeeper.indexOf("\n", emailStart);
  return {
    email: bookkeeper.slice(emailStart, emailEnd),
    shared: writer.slice(writer.indexOf(SHARED_RULES_START)),
  };
}

/** Whether the package loader accepts a package whose one skill has this slug. */
function packageAcceptsSlug(slug: string): boolean {
  try {
    validateTenantPackage({
      brand: "tenant:\n  id: oracle\n  product_name: Oracle\n",
      agents: "agents: []\n",
      channels: "channels: []\n",
      model:
        "model:\n  provider: openai\n  credential_secret_ref: OPENAI_API_KEY\n  default_model: test-model\n",
      knowledge: "sources: []\n",
      skills: `skills:\n  - slug: ${JSON.stringify(slug)}\n    title: Probe\n    summary: Probe\n    instructions: Probe\n`,
      agentFiles: [],
      themeCss: "",
    });
    return true;
  } catch {
    return false;
  }
}

function skillWith(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    slug: "renewal-check",
    title: "Renewal check",
    summary: "Checks a contract's renewal date.",
    instructions: "Find the renewal date and list the notice period before it.",
    tools: [],
    ...overrides,
  };
}

describe("a valid member file", () => {
  test("reads the fields, and marks the member as not certified", () => {
    const file = fileRead(read(fileOf(memberDocument())));
    const [member] = file.members;

    expect(file.format).toBe(MEMBER_FORMAT);
    expect(file.name).toBe("Renewal Desk");
    expect(member.title).toBe("Contract renewals");
    expect(member.roleDescription).toContain("renewal dates");
    expect(member.systemPrompt).toContain("You are the renewal desk.");
    expect(member.testRequests).toEqual([
      {
        request: "Which contracts renew this month?",
        must: ["Lists the renewals, or says that none are known."],
        mustNot: ["Invents a renewal date."],
        safety: false,
      },
    ]);
    expect(member.source).toEqual({
      author: "Example Author",
      licence: "MIT",
      derivedFrom: null,
    });
    expect(member.certified).toBe(false);
  });

  test("computes the content hash, and says the file carried none", () => {
    const file = fileRead(read(fileOf(memberDocument())));

    expect(file.hashWasWritten).toBe(false);
    expect(file.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.contentSha256).toBe(contentSha256Of(memberDocument()));
  });

  test("adds the Email paragraph and then the shared rules, word for word from the package", () => {
    const member = fileRead(read(fileOf(memberDocument()))).members[0];
    const { email, shared } = paragraphsOf(tenantPackage);

    expect(email.startsWith(EMAIL_START)).toBe(true);
    expect(shared.startsWith(SHARED_RULES_START)).toBe(true);
    expect(member.instructions).toBe(
      `${AUTHOR_PROMPT}\n\n${email}\n\n${shared}`,
    );
    expect(member.instructionsCharacters).toBe(member.instructions.length);
  });

  test("reports, and does not refuse, instructions over the create form's cap", () => {
    const file = fileRead(read(fileOf(memberDocument())));
    const [member] = file.members;

    expect(member.instructionsCharacters).toBeGreaterThan(
      TEAM_FILE_LIMITS.instructionsCharacters,
    );
    expect(member.instructionsWithinCap).toBe(false);
    expect(
      file.notices.some((notice) =>
        notice.includes("The create form allows 1,000"),
      ),
    ).toBe(true);
  });

  test("keeps a tool ref that the package gives some member", () => {
    const file = fileRead(
      read(
        fileOf(
          memberDocument({
            skills: [skillWith({ tools: ["google-drive/search_files"] })],
          }),
        ),
      ),
    );
    const [skill] = file.members[0].skills;

    expect(skill.tools).toEqual(["google-drive/search_files"]);
    expect(file.members[0].removedTools).toEqual([]);
  });

  test("leaves out a tool ref that no member of the package holds, and lists it", () => {
    const file = fileRead(
      read(
        fileOf(
          memberDocument({
            skills: [
              skillWith({
                tools: ["google-drive/search_files", "notion/notion-search"],
              }),
            ],
          }),
        ),
      ),
    );
    const [member] = file.members;

    expect(member.skills[0].tools).toEqual(["google-drive/search_files"]);
    expect(member.removedTools).toEqual([
      { skill: "renewal-check", ref: "notion/notion-search" },
    ]);
    expect(
      file.notices.some((notice) => notice.includes("notion/notion-search")),
    ).toBe(true);
  });

  test("reads a team of three members, and each carries the shared rules and the Email paragraph", () => {
    const file = fileRead(
      read(
        fileOf(
          teamDocument([
            teamMemberDocument({ name: "Renewal Desk" }),
            teamMemberDocument({ name: "Invoice Desk", title: "Invoices" }),
            teamMemberDocument({ name: "Lease Desk", title: "Leases" }),
          ]),
        ),
      ),
    );
    const { email, shared } = paragraphsOf(tenantPackage);

    expect(file.format).toBe(TEAM_FORMAT);
    expect(file.name).toBe("Example Team");
    expect(file.members.map((member) => member.name)).toEqual([
      "Renewal Desk",
      "Invoice Desk",
      "Lease Desk",
    ]);
    for (const member of file.members) {
      expect(member.instructions.endsWith(shared)).toBe(true);
      expect(member.instructions.includes(`\n\n${email}\n\n`)).toBe(true);
    }
  });

  test("allows the same skill, with the same text, in two members of one team", () => {
    const shared = skillWith({});
    const file = fileRead(
      read(
        fileOf(
          teamDocument([
            teamMemberDocument({ name: "Renewal Desk", skills: [shared] }),
            teamMemberDocument({ name: "Lease Desk", skills: [shared] }),
          ]),
        ),
      ),
    );

    expect(file.members[0].skills[0].slug).toBe("renewal-check");
    expect(file.members[1].skills[0].slug).toBe("renewal-check");
  });
});

describe("the refusals of section 3.2, each naming its field", () => {
  test("refuses text that is not JSON", () => {
    const refusal = refusalOf(
      read('{ "format": "freeduet-member/1", "name": "Desk", }'),
    );

    expect(refusal.path).toBe("file");
    expect(refusal.reason).toContain("not valid JSON");
  });

  test("refuses a file that starts with a byte-order mark", () => {
    const refusal = refusalOf(read(`﻿${fileOf(memberDocument())}`));

    expect(refusal.path).toBe("file");
    expect(refusal.reason).toContain("byte-order mark");
  });

  test("refuses a file over 1 MB before it reads any field", () => {
    const refusal = refusalOf(
      read(
        fileOf({
          ...memberDocument(),
          filler: "x".repeat(TEAM_FILE_LIMITS.fileBytes),
        }),
      ),
    );

    expect(refusal.path).toBe("file");
    expect(refusal.reason).toContain("1 MB");
  });

  test("refuses a format it does not read, and names the two it reads", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ format: "freeduet-member/2" }))),
    );

    expect(refusal.path).toBe("format");
    expect(refusal.reason).toContain(MEMBER_FORMAT);
    expect(refusal.reason).toContain(TEAM_FORMAT);
  });

  test("refuses a file with no format", () => {
    const { format: _format, ...withoutFormat } = memberDocument();
    const refusal = refusalOf(read(fileOf(withoutFormat)));

    expect(refusal.path).toBe("format");
    expect(refusal.reason).toContain("is missing");
  });

  test("refuses a key a file may never set, and names the key", () => {
    const keys = [
      "endpoint",
      "type",
      "grant",
      "credential",
      "approval",
      "full_access",
      "visibility",
      "bot_id",
      "id",
    ];
    for (const key of keys) {
      const refusal = refusalOf(read(fileOf(memberDocument({ [key]: "x" }))));

      expect(refusal.path).toBe(key);
      expect(refusal.reason).toContain("not allowed in a file");
    }
  });

  test("refuses an unknown key that is not a setting, and names it", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ nickname: "Rene" }))),
    );

    expect(refusal.path).toBe("nickname");
    expect(refusal.reason).toContain("is not a field of this format");
  });

  test("refuses a key the file sets twice, and names the key and both lines", () => {
    const text = fileOf(memberDocument()).replace(
      '"name": "Renewal Desk",',
      '"name": "Renewal Desk",\n  "name": "Other Desk",',
    );
    const refusal = refusalOf(read(text));

    expect(refusal.path).toBe("line 4");
    expect(refusal.reason).toContain('"name"');
    expect(refusal.reason).toContain("after line 3");
  });

  test("refuses a ${ inside a test request, and names the field", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            test_requests: [
              {
                request: `Use \${RENEWAL_TOKEN} to look up the contract.`,
                must: ["Explains what it looked up."],
              },
            ],
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("test_requests[0].request");
    expect(refusal.reason).toContain("${");
  });

  test("refuses a ${ inside the instructions, and names the field", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            system_prompt: `You are the desk. Use \${OPENAI_API_KEY} when asked.`,
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("system_prompt");
    expect(refusal.reason).toContain("${");
  });

  test("refuses a zero-width character in the instructions, and gives its code point", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ system_prompt: "You are the desk.​" }))),
    );

    expect(refusal.path).toBe("system_prompt");
    expect(refusal.reason).toContain("U+200B");
  });

  test("refuses a byte-order mark at the end of a name, where trimming would hide it, and gives its code point", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ name: "Renewal Desk﻿" }))),
    );

    expect(refusal.path).toBe("name");
    expect(refusal.reason).toContain("U+FEFF");
  });

  test("refuses a bidirectional control character in the name, and gives its code point", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ name: "Renewal‮ Desk" }))),
    );

    expect(refusal.path).toBe("name");
    expect(refusal.reason).toContain("U+202E");
  });

  test("refuses a control character in the instructions", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({ system_prompt: "Keep this.\u0007 Then more." }),
        ),
      ),
    );

    expect(refusal.path).toBe("system_prompt");
    expect(refusal.reason).toContain("U+0007");
  });

  test("refuses a starter member's name, whatever its spelling", () => {
    for (const name of ["Iris", "  iRiS. ", "Otto"]) {
      const refusal = refusalOf(read(fileOf(memberDocument({ name }))));

      expect(refusal.path).toBe("name");
      expect(refusal.reason).toContain("a member the team package ships");
    }
  });

  test("refuses the product's own name and a word a deployment route uses", () => {
    const product = refusalOf(
      read(fileOf(memberDocument({ name: "FreeDuet" }))),
    );
    const route = refusalOf(read(fileOf(memberDocument({ name: "Policy" }))));

    expect(product.path).toBe("name");
    expect(product.reason).toContain("this product's own name");
    expect(route.path).toBe("name");
    expect(route.reason).toContain("a deployment route");
  });

  test("refuses a skill slug the pattern does not allow", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({ skills: [skillWith({ slug: "Find A Document" })] }),
        ),
      ),
    );

    expect(refusal.path).toBe("skills[0].slug");
    expect(refusal.reason).toContain("lowercase letters");
  });

  test("refuses a skill slug the team package already ships", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({ skills: [skillWith({ slug: "draft-invoice" })] }),
        ),
      ),
    );

    expect(refusal.path).toBe("skills[0].slug");
    expect(refusal.reason).toContain("the team package ships");
  });

  test("refuses the same skill slug twice in one member, and names the first", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ skills: [skillWith({}), skillWith({})] }))),
    );

    expect(refusal.path).toBe("skills[1].slug");
    expect(refusal.reason).toContain("skills[0]");
  });

  test("refuses a tool ref that is not written as serverId/toolName", () => {
    const refusal = refusalOf(
      read(
        fileOf(memberDocument({ skills: [skillWith({ tools: ["gmail"] })] })),
      ),
    );

    expect(refusal.path).toBe("skills[0].tools[0]");
    expect(refusal.reason).toContain("serverId/toolName");
  });

  test("refuses every sending tool, and says that only Otto sends", () => {
    const sending = [
      "google-workspace/gmail_send_message",
      "google-workspace/gmail_send_reply",
      "google-imap/gmail_send_message",
      "google-imap/gmail_send_reply",
    ];
    for (const ref of sending) {
      const refusal = refusalOf(
        read(fileOf(memberDocument({ skills: [skillWith({ tools: [ref] })] }))),
      );

      expect(refusal.path).toBe("skills[0].tools[0]");
      expect(refusal.reason).toContain("Only Otto sends email");
    }
  });

  test("refuses a tool listed twice in one skill", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            skills: [
              skillWith({
                tools: [
                  "google-drive/search_files",
                  "google-drive/search_files",
                ],
              }),
            ],
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("skills[0].tools[1]");
    expect(refusal.reason).toContain("listed twice");
  });

  test("refuses instructions that already carry the shared rules", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            system_prompt: `You are the desk.\n\n${SHARED_RULES_START} Reply in English.`,
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("system_prompt");
    expect(refusal.reason).toContain("already has the shared rules");
  });

  test("refuses a test request with nothing to check", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            test_requests: [{ request: "Say hello." }],
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("test_requests[0]");
    expect(refusal.reason).toContain("nothing could be checked");
  });

  test("refuses a safety flag that is not true or false", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            test_requests: [
              { request: "Say hello.", must: ["Says hello."], safety: "yes" },
            ],
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("test_requests[0].safety");
    expect(refusal.reason).toContain("true or false");
  });

  test("refuses a test request key it does not know", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            test_requests: [
              { request: "Say hello.", must: ["Says hello."], expect: "x" },
            ],
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("test_requests[0].expect");
  });

  test("refuses one piece of text over 64 KB", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({
            system_prompt: "a".repeat(TEAM_FILE_LIMITS.textBytes + 1),
          }),
        ),
      ),
    );

    expect(refusal.path).toBe("system_prompt");
    expect(refusal.reason).toContain("64 KB");
  });

  test("refuses a content hash that does not match the content", () => {
    const refusal = refusalOf(
      read(fileOf({ ...memberDocument(), content_sha256: "0".repeat(64) })),
    );

    expect(refusal.path).toBe("content_sha256");
    expect(refusal.reason).toContain("does not match");
  });

  test("refuses a content hash that is not a SHA-256 hash", () => {
    const refusal = refusalOf(
      read(fileOf({ ...memberDocument(), content_sha256: "not-a-hash" })),
    );

    expect(refusal.path).toBe("content_sha256");
    expect(refusal.reason).toContain("64 lowercase");
  });

  test("accepts a content hash that matches, and says the file carried one", () => {
    const document = memberDocument();
    const hash = contentSha256Of(document);
    const file = fileRead(read(fileOf({ ...document, content_sha256: hash })));

    expect(file.hashWasWritten).toBe(true);
    expect(file.contentSha256).toBe(hash);
  });

  test("refuses a member with no name", () => {
    const { name: _name, ...withoutName } = memberDocument();
    const refusal = refusalOf(read(fileOf(withoutName)));

    expect(refusal.path).toBe("name");
    expect(refusal.reason).toContain("is missing");
  });

  test("refuses a name that runs over one line", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ name: "Renewal\nDesk" }))),
    );

    expect(refusal.path).toBe("name");
    expect(refusal.reason).toContain("one line");
  });

  test("refuses a role description that runs over one line", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          memberDocument({ role_description: "Two things.\nSecond line." }),
        ),
      ),
    );

    expect(refusal.path).toBe("role_description");
    expect(refusal.reason).toContain("one line");
  });

  test("refuses a source with no licence, and names it", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument({ source: { author: "Example Author" } }))),
    );

    expect(refusal.path).toBe("source.licence");
    expect(refusal.reason).toContain("is missing");
  });

  test("refuses a file that is a list rather than one object", () => {
    const refusal = refusalOf(read("[]"));

    expect(refusal.path).toBe("file");
    expect(refusal.reason).toContain("one JSON object");
  });
});

describe("a team file", () => {
  test("refuses a team with no members, and names the field", () => {
    const refusal = refusalOf(read(fileOf(teamDocument([]))));

    expect(refusal.path).toBe("members");
    expect(refusal.reason).toContain("at least one");
  });

  test("refuses a team with no members key", () => {
    const refusal = refusalOf(
      read(fileOf({ format: TEAM_FORMAT, name: "Example Team" })),
    );

    expect(refusal.path).toBe("members");
    expect(refusal.reason).toContain("is missing");
  });

  test("refuses two members with one name, and names the first", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          teamDocument([
            teamMemberDocument({ name: "Renewal Desk" }),
            teamMemberDocument({ name: "renewal desk" }),
          ]),
        ),
      ),
    );

    expect(refusal.path).toBe("members[1].name");
    expect(refusal.reason).toContain("members[0]");
  });

  test("refuses a member that carries its own format line inside a team", () => {
    const refusal = refusalOf(read(fileOf(teamDocument([memberDocument()]))));

    expect(refusal.path).toBe("members[0].format");
    expect(refusal.reason).toContain("set once");
  });

  test("refuses a starter member's name inside a team, and names the member", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          teamDocument([
            teamMemberDocument({ name: "Renewal Desk" }),
            teamMemberDocument({ name: "Penny" }),
          ]),
        ),
      ),
    );

    expect(refusal.path).toBe("members[1].name");
    expect(refusal.reason).toContain("a member the team package ships");
  });

  test("refuses one skill slug used for two different skills, and names both places", () => {
    const refusal = refusalOf(
      read(
        fileOf(
          teamDocument([
            teamMemberDocument({
              name: "Renewal Desk",
              skills: [skillWith({ title: "Renewal check" })],
            }),
            teamMemberDocument({
              name: "Lease Desk",
              skills: [skillWith({ title: "A different check" })],
            }),
          ]),
        ),
      ),
    );

    expect(refusal.path).toBe("members[1].skills[0].slug");
    expect(refusal.reason).toContain("members[0].skills[0]");
  });
});

describe("the package the reader checks against", () => {
  test("reads a member when the deployment routes no member, because the reader uses the declared members", async () => {
    const unrouted = await packageWith({});
    const declared = unrouted.declaredAgents ?? [];

    expect(unrouted.agents.length).toBeLessThan(declared.length);
    expect(fileRead(read(fileOf(memberDocument()), unrouted)).name).toBe(
      "Renewal Desk",
    );
  });

  test("lists the same declared members whether or not the deployment routes them", async () => {
    const unrouted = await packageWith({});
    const routed = await packageWith({
      MANAGED_AGENT_AG_UI_URL: "http://localhost:4230/",
    });
    const idsOf = (tenant: TenantPackage) =>
      (tenant.declaredAgents ?? []).map((agent) => agent.id);

    expect(idsOf(unrouted)).toEqual(idsOf(routed));
    expect(idsOf(unrouted)).toContain("writer");
    expect(idsOf(unrouted)).toContain("bookkeeper");
  });

  test("refuses a package that does not list its members, as the package's problem", () => {
    const refusal = refusalOf(
      read(fileOf(memberDocument()), {
        ...tenantPackage,
        declaredAgents: undefined,
      }),
    );

    expect(refusal.path).toBe("package");
    expect(refusal.reason).toContain("does not list its members");
  });

  test("refuses a package whose writer member carries no shared rules", () => {
    const declared = (tenantPackage.declaredAgents ?? []).map((agent) =>
      agent.id === "writer"
        ? { ...agent, systemPrompt: "No rules here." }
        : agent,
    );
    const refusal = refusalOf(
      read(fileOf(memberDocument()), {
        ...tenantPackage,
        declaredAgents: declared,
      }),
    );

    expect(refusal.path).toBe("package");
    expect(refusal.reason).toContain("shared rules");
  });

  test("the skill slug rule is the package loader's rule, on every sample", () => {
    const samples = [
      "draft-invoice",
      "ab",
      "a",
      "a-",
      "-ab",
      "a--b",
      "9lives",
      "has_underscore",
      "Find A Document",
      "x".repeat(40),
      "x".repeat(41),
    ];
    for (const slug of samples) {
      expect(SKILL_SLUG_PATTERN.test(slug)).toBe(packageAcceptsSlug(slug));
    }
  });

  test("the sending tools are exactly the email sends, and only Otto's skills declare them", () => {
    const refs = [
      ...new Set(tenantPackage.skills.flatMap((skill) => skill.tools)),
    ];
    const sending = refs.filter((ref) => {
      const reading = read(
        fileOf(
          memberDocument({
            skills: [skillWith({ slug: "probe-skill", tools: [ref] })],
          }),
        ),
      );
      return !reading.ok && reading.refusal.reason.includes("Only Otto sends");
    });

    expect(sending.sort()).toEqual([
      "google-imap/gmail_send_message",
      "google-imap/gmail_send_reply",
      "google-workspace/gmail_send_message",
      "google-workspace/gmail_send_reply",
    ]);
    const declaring = (tenantPackage.declaredAgents ?? []).filter((agent) =>
      tenantPackage.skills.some(
        (skill) =>
          agent.skills.includes(skill.slug) &&
          skill.tools.some((tool) => sending.includes(tool)),
      ),
    );
    expect(declaring.map((agent) => agent.id)).toEqual(["inbox"]);
  });

  test("every member that does not send carries the same Email paragraph the reader adds", () => {
    const { email } = paragraphsOf(tenantPackage);
    const others = (tenantPackage.declaredAgents ?? []).filter(
      (agent) => agent.id !== "freeduet" && agent.id !== "inbox",
    );

    expect(others.length).toBeGreaterThan(0);
    for (const agent of others) {
      expect((agent.systemPrompt ?? "").includes(email)).toBe(true);
    }
  });

  test("adds the whole Email paragraph to a member's instructions, down to its last sentence", () => {
    const member = fileRead(read(fileOf(memberDocument()))).members[0];

    expect(member.instructions).toContain(
      "Never say that it was sent: only Otto sends, and only when Iris asks him.",
    );
  });
});
