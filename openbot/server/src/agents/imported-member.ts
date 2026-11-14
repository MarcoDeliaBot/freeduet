import type { AgentProfileStore } from "./profile-store";
import type { AgentActor, AgentProfile } from "./profile-types";
import { parseAgentInput } from "./routes";
import { IMPORTED_ROLE_DESCRIPTION_LIMIT } from "./role-description-limit";

/** What a team file gives for one member, once the reader has checked it. */
export type ImportedMemberInput = {
  name: string;
  title: string;
  /** The composed instructions: the author's text, the Email paragraph and the shared rules. */
  roleDescription: string;
};

/** Refused, with the sentence the edit form would show for the same field. */
export class ImportedMemberRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportedMemberRefusedError";
  }
}

/**
 * Create a coworker from a team file's member, the only way the imported fact is ever written.
 *
 * Not a route: nothing in the HTTP surface calls it, and the fact it writes is the one thing that
 * lets a coworker hold 8,000 characters rather than 1,000. The coworker is private, has no address of
 * its own (it runs on the deployment's Bot, as a coworker made by hand without an address does), and
 * this function writes no grant: grants are separate writes.
 */
export async function createImportedMember(
  store: AgentProfileStore,
  actor: AgentActor,
  input: ImportedMemberInput,
): Promise<AgentProfile> {
  const parsed = parseAgentInput(
    {
      name: input.name,
      title: input.title,
      roleDescription: input.roleDescription,
      visibility: "private",
    },
    false,
    new Set(),
    IMPORTED_ROLE_DESCRIPTION_LIMIT,
  );
  if (!parsed.ok) throw new ImportedMemberRefusedError(parsed.error);
  const { value } = parsed;
  return store.create(actor, {
    name: value.name,
    title: value.title,
    roleDescription: value.roleDescription,
    visibility: "private",
    // A coworker with no address runs on this text, exactly as `POST /api/agents` runs one made by hand.
    systemPrompt: value.roleDescription,
    importedMember: true,
  });
}
