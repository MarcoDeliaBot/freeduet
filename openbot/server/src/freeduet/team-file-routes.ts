/**
 * `GET /api/freeduet/team-file/export`: the administrator downloads a member, or the team, as a team
 * file (slice S2 of docs/design/team-file.md). Read-only. It writes nothing and calls no model.
 *
 *   GET /export                 every member the administrator owns that the file can carry, as a team
 *   GET /export?member=<id>     one of the administrator's members, as a member file
 *
 * WHO. Behind `requireUser`, and then `requireAdmin` (403 for anybody else). The members are the ones
 * the administrator OWNS, so one person's Bot never leaves in another person's export. A member the
 * package ships is never exported: its name is reserved in every file (team-file.ts), so its file
 * could never be imported, and the package already gives it to every installation.
 *
 * WHAT IT WILL NOT WRITE, and what it refuses instead: a member that runs at an address of its own (the
 * address is never written); a skill another person wrote, or one the package ships; a sending tool; a
 * text with an e-mail address, the administrator's address or name in it. A refusal is a 409 with one
 * sentence and no secret.
 *
 * THE CHECK. Every file is read back by the S1 reader (`readTeamFile`) against the same package before
 * it is sent. A file the reader would refuse (for example one over 1 MB) is a 409 with the reader's own
 * sentence, so this route never hands out a file FreeDuet would refuse to open.
 *
 * HOW IT IS SENT. As an opaque attachment with the shared download headers (`downloadHeaders`), which
 * set `Cache-Control: private, no-store` and a sanitised file name.
 */
import { downloadHeaders } from "@openbot/shared/file-download";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { Hono, type MiddlewareHandler } from "hono";
import { type AppVariables, requireAdmin } from "../auth/guards";
import type { Database } from "../db/client";
import {
  agentProfiles,
  agents,
  pluginGrants,
  skills,
  skillTools,
} from "../db/schema";
import type { TenantPackage } from "../tenant-package";
import { readTeamFile } from "./team-file";
import {
  type ExportMember,
  ExportRefusal,
  type ExportSkill,
  memberFileText,
  type SharedParagraphs,
  scanForPersonalText,
  teamFileText,
} from "./team-file-export";

/** What the route reads from: the database, and the team package loaded at boot. */
export type TeamFileSource = {
  database: Database;
  tenantPackage: TenantPackage;
};

let source: TeamFileSource | null = null;

/** Called once at boot, as `useEngineChoices` is. Until then the route answers 503. */
export function useTeamFile(next: TeamFileSource | null): void {
  source = next;
}

const EMAIL_PARAGRAPH_START = "Email. You do not send email.";
const SHARED_RULES_START =
  "Shared rules. Reply in the language the person writes in.";

/**
 * The package's "Email." paragraph (from the bookkeeper) and shared rules (from the writer), read the
 * way the reader reads them, so an export takes away exactly the text the reader adds back.
 */
function paragraphsOf(tenantPackage: TenantPackage): SharedParagraphs | null {
  const declared = tenantPackage.declaredAgents ?? [];
  const writer = declared.find((agent) => agent.id === "writer")?.systemPrompt;
  const bookkeeper = declared.find(
    (agent) => agent.id === "bookkeeper",
  )?.systemPrompt;
  if (!writer || !bookkeeper) return null;
  const sharedAt = writer.indexOf(SHARED_RULES_START);
  const emailAt = bookkeeper.indexOf(EMAIL_PARAGRAPH_START);
  if (sharedAt < 0 || emailAt < 0) return null;
  const emailEnd = bookkeeper.indexOf("\n", emailAt);
  return {
    email: (emailEnd < 0
      ? bookkeeper.slice(emailAt)
      : bookkeeper.slice(emailAt, emailEnd)
    ).trim(),
    shared: writer.slice(sharedAt).trim(),
  };
}

/** The file name, from the member's name, in plain ASCII so nothing can break the header. */
function fileNameFor(member: ExportMember | null): string {
  if (!member) return "freeduet-team.json";
  const slug = member.name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "member"}.json`;
}

type OwnedRow = {
  id: string;
  name: string;
  type: string;
  packageId: string | null;
  title: string;
  roleDescription: string;
  configuration: unknown;
};

/** The instructions as stored: `configuration.systemPrompt`, which the create route writes for a Bot with no address. */
function storedInstructions(configuration: unknown): string {
  const prompt = (configuration as { systemPrompt?: unknown } | null)
    ?.systemPrompt;
  return typeof prompt === "string" ? prompt.trim() : "";
}

export function createTeamFileRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);

  routes.get(
    "/export",
    async (context: Context<{ Variables: AppVariables }>) => {
      const refusal = requireAdmin(context);
      if (refusal) return refusal;
      if (!source) {
        return context.json(
          { error: "The team file is not available on this server yet." },
          503,
        );
      }
      const { database, tenantPackage } = source;
      const paragraphs = paragraphsOf(tenantPackage);
      if (!paragraphs) {
        return context.json(
          {
            error:
              "The team package does not carry the shared paragraphs, so a team file cannot be made.",
          },
          503,
        );
      }
      const actor = context.var.actor;
      const memberId = context.req.query("member");

      const owned: OwnedRow[] = await database
        .select({
          id: agents.id,
          name: agents.name,
          type: agents.type,
          packageId: agents.packageId,
          title: agentProfiles.title,
          roleDescription: agentProfiles.roleDescription,
          configuration: agents.configuration,
        })
        .from(agentProfiles)
        .innerJoin(agents, eq(agents.id, agentProfiles.agentId))
        .where(
          and(
            eq(agentProfiles.ownerUserId, actor.id),
            isNull(agentProfiles.deletedAt),
          ),
        )
        .orderBy(agents.name);

      let selected: OwnedRow[];
      if (memberId !== undefined) {
        const row = owned.find((candidate) => candidate.id === memberId);
        if (!row) {
          return context.json(
            { error: "No member of yours has that id." },
            404,
          );
        }
        if (row.packageId !== null) {
          return context.json(
            {
              error: `${row.name} ships with FreeDuet, so it is not written to a file.`,
            },
            409,
          );
        }
        if (row.type !== "built_in") {
          return context.json(
            {
              error: `${row.name} runs at an address of its own. The address is never written to a file, so it cannot be exported.`,
            },
            409,
          );
        }
        selected = [row];
      } else {
        selected = owned.filter(
          (row) => row.packageId === null && row.type === "built_in",
        );
        if (selected.length === 0) {
          return context.json(
            { error: "You have no member of your own to export yet." },
            409,
          );
        }
      }

      const skillSlugsOfPackage = new Set(
        tenantPackage.skills.map((skill) => skill.slug),
      );
      try {
        const members: ExportMember[] = [];
        const fields: Record<string, string> = {};
        for (const row of selected) {
          const instructions = storedInstructions(row.configuration);
          if (instructions === "") {
            throw new ExportRefusal(
              `${row.name} has no instructions to export.`,
            );
          }
          const grants = await database
            .select({ ref: pluginGrants.ref })
            .from(pluginGrants)
            .where(
              and(
                eq(pluginGrants.agentId, row.id),
                eq(pluginGrants.kind, "skill"),
              ),
            );
          const slugs = grants.map((grant) => grant.ref);
          const held = slugs.length
            ? await database
                .select({
                  id: skills.id,
                  slug: skills.slug,
                  title: skills.title,
                  summary: skills.summary,
                  instructions: skills.instructions,
                  ownerUserId: skills.ownerUserId,
                })
                .from(skills)
                .where(inArray(skills.slug, slugs))
            : [];
          const memberSkills: ExportSkill[] = [];
          for (const skill of held) {
            if (skill.ownerUserId !== null && skill.ownerUserId !== actor.id) {
              throw new ExportRefusal(
                `${row.name} uses a skill that another person wrote. Remove it from the member before exporting.`,
              );
            }
            if (skillSlugsOfPackage.has(skill.slug)) {
              throw new ExportRefusal(
                `${row.name} uses the skill "${skill.slug}", which the team package ships, so a file cannot carry it. Remove it from the member.`,
              );
            }
            const declared = await database
              .select({ ref: skillTools.ref })
              .from(skillTools)
              .where(eq(skillTools.skillId, skill.id));
            memberSkills.push({
              slug: skill.slug,
              title: skill.title,
              summary: skill.summary,
              instructions: skill.instructions,
              tools: declared.map((tool) => tool.ref),
            });
          }
          const member: ExportMember = {
            name: row.name,
            title: row.title,
            roleDescription: row.roleDescription,
            instructions,
            skills: memberSkills,
          };
          members.push(member);
          fields[`${row.name}: name`] = member.name;
          fields[`${row.name}: title`] = member.title;
          fields[`${row.name}: job`] = member.roleDescription;
          fields[`${row.name}: instructions`] = member.instructions;
          for (const skill of memberSkills) {
            fields[`${row.name}: skill ${skill.slug}`] =
              `${skill.title}\n${skill.summary}\n${skill.instructions}`;
          }
        }
        scanForPersonalText(fields, {
          email: actor.email ?? undefined,
          name: actor.name ?? undefined,
        });

        const text =
          memberId !== undefined
            ? memberFileText(members[0] as ExportMember, paragraphs)
            : teamFileText(tenantPackage.productName, members, paragraphs);

        // The file must be one the reader accepts, or it is not sent.
        const reading = readTeamFile(text, tenantPackage);
        if (!reading.ok) {
          return context.json(
            { error: `${reading.refusal.path}: ${reading.refusal.reason}` },
            409,
          );
        }

        const bytes = new TextEncoder().encode(text);
        return new Response(bytes, {
          headers: downloadHeaders(
            fileNameFor(memberId !== undefined ? (members[0] ?? null) : null),
            bytes.byteLength,
          ),
        });
      } catch (error) {
        if (error instanceof ExportRefusal) {
          return context.json({ error: error.reason }, 409);
        }
        throw error;
      }
    },
  );

  return routes;
}
