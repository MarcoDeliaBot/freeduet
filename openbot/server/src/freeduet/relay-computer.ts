/**
 * The member's computer in a relay turn (docs/M1_PLAN.md, D22).
 *
 * A member that reports to Iris with `message_bot` gets Iris's answer back as a RELAY: a turn of the
 * member in the person's own conversation (`agents/handoff-runner.ts`, `relay`, `answerIn`). It used
 * to carry no computer tool (`handoff-delivery.ts` passed `tools: []`), so a member that went on
 * researching there called a tool the CLI did not list and said its browser had broken (#61).
 *
 * This is the same computer an ordinary turn of that member gets from the server when nobody has a
 * browser open: the one `toolsForTurn` of a routine, a wake-up or a group turn builds
 * (`index.ts`, `createHeadlessComputerTools`). Nothing is added to it:
 *
 * - none when the deployment has no computer, or the Bot is not the person's to drive
 *   (`canUseComputer`: a Team Bot's teammate uses the Bot, not its owner's signed-in computer);
 * - every call goes through the computer gateway and the approval gate, so a click, a typed word,
 *   a command or a purchase step asks the person in this conversation, and nothing runs before they
 *   decide. D21's pre-approval is for `bot/message_bot` only (`hub-handoffs.ts`) and never reaches a
 *   computer or an account action.
 *
 * The forward hop (the scratch thread nobody sees) is never asked: `handoff-delivery.ts`.
 */
import type { HeadlessTool } from "@openbot/toolkit/headless-tools";
import { canUseComputer } from "../agents/computer-access";
import type { AgentProfileStore } from "../agents/profile-store";
import type { AgentActor } from "../agents/profile-types";
import type { AuditInitiator, AuditStore } from "../audit";
import type { ComputerGateway } from "../computer/gateway";
import {
  createHeadlessComputerTools,
  type HeadlessSignInRequester,
} from "../computer/headless-tools";

export function relayComputerTools(deps: {
  /** Absent when the deployment has no computer. */
  computerGateway: ComputerGateway | undefined;
  agentProfileStore: Pick<AgentProfileStore, "get">;
  actorFor: (ownerUserId: string) => Promise<AgentActor>;
  auditStore: AuditStore;
  signInService?: HeadlessSignInRequester | undefined;
}) {
  const { computerGateway, agentProfileStore, actorFor, auditStore } = deps;
  return async ({
    ownerUserId,
    agentId,
    initiator,
  }: {
    ownerUserId: string;
    agentId: string;
    initiator: AuditInitiator;
  }): Promise<HeadlessTool[]> => {
    if (!computerGateway) return [];
    const actor = await actorFor(ownerUserId);
    const profile = await agentProfileStore.get(actor, agentId);
    if (!profile) throw new Error("That Bot is not available to this owner.");
    if (!canUseComputer(profile, actor)) return [];
    return createHeadlessComputerTools({
      gateway: computerGateway,
      botId: agentId,
      actor: { id: actor.id, userId: actor.id, initiator },
      auditStore,
      ...(deps.signInService ? { signIn: deps.signInService } : {}),
    });
  };
}
