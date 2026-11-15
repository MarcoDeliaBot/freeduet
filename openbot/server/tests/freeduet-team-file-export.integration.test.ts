import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  type AuthService,
  createRequireUser,
  createRoleRepository,
} from "../src/auth/guards";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  personalMemories,
  pluginGrants,
  skills,
  skillTools,
  userRoles,
  users,
} from "../src/db/schema";
import { readTeamFile } from "../src/freeduet/team-file";
import {
  createTeamFileRoutes,
  useTeamFile,
} from "../src/freeduet/team-file-routes";
import { loadTenantPackage } from "../src/tenant-package";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * GET /api/freeduet/team-file/export (slice S2), through the real guards, the real routes and
 * Postgres. Every file is read back by the real S1 reader against the real team package.
 *
 * The canaries are written into the tables and fields an export must never copy (grants, a
 * memory, the person's name and address, a remote Bot's address, a callback token hash, an avatar
 * seed, another person's Bot). The file must contain none of them.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `tfx-${randomUUID().slice(0, 8)}`;
const admin = `${prefix}-admin`;
/** Owns the members the export must refuse, so they do not spoil the whole-team file of `admin`. */
const badAdmin = `${prefix}-bad-admin`;
const otherAdmin = `${prefix}-admin2`;
const owner = `${prefix}-user`;
const other = `${prefix}-other`;
const people = [admin, badAdmin, otherAdmin, owner, other];
const packageDirectory = join(import.meta.dir, "../../examples/freeduet");

const bots = {
  leo: `${prefix}-leo`,
  wren: `${prefix}-wren`,
  long: `${prefix}-long`,
  tooLong: `${prefix}-too-long`,
  remote: `${prefix}-remote`,
  mail: `${prefix}-mail`,
  others: `${prefix}-others`,
  heavy: `${prefix}-heavy`,
};
const ids = Object.values(bots);

const CANARY = {
  grantServer: `canary-server-${prefix}`,
  grantPerson: `canary-granter-${prefix}`,
  memory: `CANARY-MEMORY-${prefix}`,
  adminEmail: `canary-admin-${prefix}@example.test`,
  adminName: `Canary Admin ${prefix}`,
  endpoint: `https://canary-endpoint-${prefix}.example.invalid/agent`,
  tokenHash: `canary-token-hash-${prefix}`,
  avatarSeed: `canary-avatar-${prefix}`,
  otherJob: `canary-other-job-${prefix}`,
};

const skillSlug = `${prefix}-renewal`;
const heavySlugs = Array.from(
  { length: 20 },
  (_, index) => `${prefix}-heavy-${index}`,
);

const INSTRUCTIONS = [
  "You are Leo for the renewal desk. You check each contract ahead of its renewal date.",
  "How you answer: short sentences, the date first, then the risk, then the next step.",
  "What you never do: sign, pay or cancel anything. Hand those to the person.",
].join("\n\n");

const auth: AuthService = {
  handler: async () => new Response(null, { status: 404 }),
  api: {
    getSession: async ({ headers }) => {
      const id = headers.get("x-test-person");
      if (!id) return null;
      const email = id === admin ? CANARY.adminEmail : `${id}@example.test`;
      const name = id === admin ? CANARY.adminName : id;
      return { user: { id, email, name } };
    },
  },
};

const app = new Hono().route(
  "/api/freeduet/team-file",
  createTeamFileRoutes(createRequireUser(auth, createRoleRepository(database))),
);

async function fetchExport(path: string, person: string | null = admin) {
  return app.request(
    `http://app.test/api/freeduet/team-file${path}`,
    person ? { headers: { "x-test-person": person } } : {},
  );
}

/** A Bot the administrator owns: a `built_in` coworker with its instructions, as the create route stores them. */
function ownedRows(
  id: string,
  name: string,
  owner: string,
  prompt: string,
  title = "Renewal desk",
) {
  return {
    agent: {
      id,
      name,
      type: "built_in" as const,
      configuration: { systemPrompt: prompt },
    },
    profile: {
      agentId: id,
      ownerUserId: owner,
      title,
      roleDescription: `One sentence about ${name}.`,
      avatarSeed: CANARY.avatarSeed,
      visibility: "private" as const,
      callbackTokenHash: CANARY.tokenHash,
    },
  };
}

beforeAll(async () => {
  await database.insert(users).values([
    { id: admin, email: CANARY.adminEmail, name: CANARY.adminName },
    { id: badAdmin, email: `${badAdmin}@example.test`, name: badAdmin },
    { id: otherAdmin, email: `${otherAdmin}@example.test`, name: otherAdmin },
    { id: owner, email: `${owner}@example.test`, name: owner },
    { id: other, email: `${other}@example.test`, name: other },
  ]);
  await database.insert(userRoles).values([
    { userId: admin, role: "admin" },
    { userId: badAdmin, role: "admin" },
    { userId: otherAdmin, role: "admin" },
    { userId: owner, role: "user" },
    { userId: other, role: "user" },
  ]);
  useTeamFile({
    database,
    tenantPackage: await loadTenantPackage(packageDirectory),
  });

  const leo = ownedRows(bots.leo, "Renewal Desk", admin, INSTRUCTIONS);
  const wren = ownedRows(
    bots.wren,
    "Invoice Check",
    admin,
    "You check invoices against the purchase order.",
  );
  const long = ownedRows(
    bots.long,
    "Long Brief",
    admin,
    `${"A long and careful instruction. ".repeat(130)}End.`,
  );
  const tooLong = ownedRows(
    bots.tooLong,
    "Too Long",
    badAdmin,
    "x".repeat(7900),
  );
  const mail = ownedRows(
    bots.mail,
    "Mail Notes",
    badAdmin,
    `Write notes for the person. Write to help@${prefix}.example.test when asked.`,
  );
  const heavy = ownedRows(
    bots.heavy,
    "Heavy Desk",
    badAdmin,
    "A desk with a great deal of reference material.",
  );
  const others = ownedRows(bots.others, "Someone Else", other, CANARY.otherJob);
  const remote = {
    agent: {
      id: bots.remote,
      name: "Remote Desk",
      type: "remote_ag_ui" as const,
      configuration: { endpoint: CANARY.endpoint },
    },
    profile: {
      agentId: bots.remote,
      ownerUserId: admin,
      title: "Remote",
      roleDescription: "A remote desk.",
      avatarSeed: "remote",
      visibility: "private" as const,
    },
  };
  await database
    .insert(agents)
    .values(
      [leo, wren, long, tooLong, mail, heavy, others, remote].map(
        (row) => row.agent,
      ),
    );
  await database
    .insert(agentProfiles)
    .values(
      [leo, wren, long, tooLong, mail, heavy, others, remote].map(
        (row) => row.profile,
      ),
    );

  await database.insert(skills).values([
    {
      id: `${prefix}-skill-renewal`,
      slug: skillSlug,
      title: "Renewal check",
      summary: "Checks a renewal date.",
      instructions: "Read the contract and report its renewal date.",
      ownerUserId: null,
      origin: "yours",
    },
    ...heavySlugs.map((slug, index) => ({
      id: `${prefix}-skill-heavy-${index}`,
      slug,
      title: `Heavy ${index}`,
      summary: "Reference material.",
      instructions: "R".repeat(60_000),
      ownerUserId: badAdmin,
      origin: "yours",
    })),
  ]);
  await database.insert(skillTools).values([
    { skillId: `${prefix}-skill-renewal`, ref: "google-drive/search_files" },
    {
      skillId: `${prefix}-skill-heavy-0`,
      ref: "google-drive/read_file_content",
    },
  ]);
  await database.insert(pluginGrants).values([
    { kind: "skill", ref: skillSlug, agentId: bots.leo, grantedBy: admin },
    ...heavySlugs.map((slug) => ({
      kind: "skill",
      ref: slug,
      agentId: bots.heavy,
      grantedBy: badAdmin,
    })),
    // Canary grant: a tool the person granted. It must never appear, not even as a name.
    {
      kind: "mcp",
      ref: `${CANARY.grantServer}/canary_tool`,
      agentId: bots.leo,
      grantedBy: CANARY.grantPerson,
    },
  ]);
  await database.insert(personalMemories).values({
    id: `${prefix}-memory`,
    ownerUserId: admin,
    content: CANARY.memory,
    provenance: "test",
  });
});

afterAll(async () => {
  await database
    .delete(personalMemories)
    .where(inArray(personalMemories.id, [`${prefix}-memory`]));
  await database.delete(pluginGrants).where(inArray(pluginGrants.agentId, ids));
  await database
    .delete(skills)
    .where(inArray(skills.slug, [skillSlug, ...heavySlugs]));
  await database.delete(agents).where(inArray(agents.id, ids));
  await database.delete(users).where(inArray(users.id, people));
  await database.$client.close();
});

describe("who may download a team file", () => {
  test("a signed-in person who is not an administrator is refused", async () => {
    const response = await fetchExport("/export", owner);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(CANARY.memory);
  });

  test("a request with no session is refused", async () => {
    const response = await fetchExport("/export", null);
    expect(response.status).toBe(401);
  });

  test("an administrator with no member of their own gets one honest sentence", async () => {
    const response = await fetchExport("/export", otherAdmin);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe(
      "You have no member of your own to export yet.",
    );
  });
});

describe("the whole team", () => {
  test("the administrator's members come as one team file, with the download headers", async () => {
    const response = await fetchExport("/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="freeduet-team.json"; filename*=UTF-8''freeduet-team.json`,
    );
    const text = await response.text();
    const reading = readTeamFile(
      text,
      await loadTenantPackage(packageDirectory),
    );
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.file.format).toBe("freeduet-team/1");
    expect(reading.file.hashWasWritten).toBe(true);
    const names = reading.file.members.map((member) => member.name);
    expect(names).toContain("Renewal Desk");
    expect(names).toContain("Invoice Check");
    expect(names).not.toContain("Remote Desk");
    expect(names).not.toContain("Someone Else");
  });

  test("the file carries the author's text: the package paragraphs are not written twice", async () => {
    const text = await (await fetchExport("/export")).text();
    const member = (
      JSON.parse(text).members as { name: string; system_prompt: string }[]
    ).find((entry) => entry.name === "Renewal Desk");
    expect(member?.system_prompt).toBe(INSTRUCTIONS);
    expect(text).not.toContain(
      "Shared rules. Reply in the language the person writes in.",
    );
  });
});

describe("one member", () => {
  test("a member comes as a member file, read back by the reader with its own text", async () => {
    const response = await fetchExport(`/export?member=${bots.leo}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      'filename="renewal-desk.json"',
    );
    const reading = readTeamFile(
      await response.text(),
      await loadTenantPackage(packageDirectory),
    );
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.file.format).toBe("freeduet-member/1");
    expect(reading.file.members[0]?.systemPrompt).toBe(INSTRUCTIONS);
    expect(reading.file.members[0]?.instructions.startsWith(INSTRUCTIONS)).toBe(
      true,
    );
    expect(reading.file.members[0]?.certified).toBe(false);
  });

  test("a skill comes with its declared tool names, and the grant of a tool does not", async () => {
    const text = await (await fetchExport(`/export?member=${bots.leo}`)).text();
    expect(text).toContain("google-drive/search_files");
    expect(text).not.toContain(CANARY.grantServer);
    expect(text).not.toContain("canary_tool");
    expect(text).not.toContain(CANARY.grantPerson);
  });

  test("a member with long instructions is accepted, and the reader says it cannot be created yet", async () => {
    const response = await fetchExport(`/export?member=${bots.long}`);
    expect(response.status).toBe(200);
    const reading = readTeamFile(
      await response.text(),
      await loadTenantPackage(packageDirectory),
    );
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.file.members[0]?.instructionsCharacters).toBeGreaterThan(
      1000,
    );
    expect(reading.file.notices.join(" ")).toContain("cannot be created yet");
  });

  test("instructions the reader would refuse are refused here, with the reader's sentence", async () => {
    const response = await fetchExport(
      `/export?member=${bots.tooLong}`,
      badAdmin,
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain(
      "shorten the system prompt by",
    );
  });

  test("a member whose text holds an e-mail address is refused, and the address is not echoed", async () => {
    const response = await fetchExport(`/export?member=${bots.mail}`, badAdmin);
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toContain("e-mail address");
    expect(body).not.toContain(`help@${prefix}`);
  });

  test("a member that runs at an address is refused, and the address never appears", async () => {
    const response = await fetchExport(`/export?member=${bots.remote}`);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(CANARY.endpoint);
  });

  test("another person's member is not found, not refused", async () => {
    const response = await fetchExport(`/export?member=${bots.others}`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(CANARY.otherJob);
  });

  test("a skill over the reader's 1 MB bound is refused by the reader's own sentence", async () => {
    const response = await fetchExport(
      `/export?member=${bots.heavy}`,
      badAdmin,
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain(
      "The limit is 1,048,576 bytes",
    );
  });
});

describe("what a file never carries", () => {
  test("no canary appears in the team file or in a member file", async () => {
    const canaries = Object.values(CANARY);
    const team = await (await fetchExport("/export")).text();
    const member = await (
      await fetchExport(`/export?member=${bots.leo}`)
    ).text();
    for (const canary of canaries) {
      expect(team).not.toContain(canary);
      expect(member).not.toContain(canary);
    }
    for (const id of ids) {
      expect(team).not.toContain(id);
      expect(member).not.toContain(id);
    }
    for (const person of people) {
      expect(team).not.toContain(person);
    }
  });
});
