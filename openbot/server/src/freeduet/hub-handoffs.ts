/**
 * Hand-offs along FreeDuet's hub are pre-approved (docs/M1_PLAN.md, D21).
 *
 * WHY THE PERSON WAS ASKED. `message_bot` reaches the approval gate as `bot/message_bot`, effect
 * `delegate`, scope the Bot's name (`agents/handoff-tool.ts`, `execute`). The gate has no rule that
 * covers it, and OpenBot's default is auto-review on (`approvals/store.ts`, `DEFAULT_PREFERENCES`),
 * which reads every action that is not a read (`approvals/policy.ts`, `reviewable`). A reviewer that
 * is not shown a request that names the hand-off, or cannot be reached, says `needs_approval`
 * (`reviewAction` fails closed), and `decideAction` turns that into an `ask`. So on a fresh install,
 * with no standing "always allow", every member's status report to Iris and every one of Iris's
 * hand-offs stopped the run and asked the person: 46 requests in one night of team evals, all for
 * `message_bot`.
 *
 * WHAT THIS DOES. Along the grants `hub-grants.ts` writes (Iris to each member, each member to Iris,
 * `granted_by = freeduet-package`) the hand-off itself never asks. The hand-off is the team talking
 * to itself: a task and a report. Everything that reaches an account stays with the person, in the
 * member that does it.
 *
 * WHEN, exactly. All of these hold, and any other call goes to the gate untouched:
 *
 * 1. the loaded package is FreeDuet's (`coordination.ts`, `markFreeDuetPackage`);
 * 2. the call is a hand-off: toolRef `bot/message_bot` and effect `delegate`;
 * 3. the person is not re-checking an approval request that is already open (that goes through the
 *    gate as before, so a request opened by older code still resolves);
 * 4. the Bot named resolves the way the desk resolves it (`agents/handoff.ts`: an id wins, else one
 *    visible Bot of that name), and
 * 5. `plugin_grants` has a row of kind `bot` for exactly (asking Bot to that Bot) with
 *    `granted_by = freeduet-package`. Read from the table the desk's `mayAddress` reads, not from a
 *    list of names. A grant an administrator made by hand, even for the same pair, keeps its credit
 *    and the gate's behaviour; a grant with no row is refused by the desk exactly as before.
 *
 * WHAT IT DOES NOT TOUCH. The desk still checks the grant per hop, the depth cap (one) and the
 * fan-out cap, and still records `agent.handoff_offered` and queues the hop, so the target's
 * conversation and the Activity screen show it as before. The member that receives the task meets the
 * gate on every tool it then calls (a send, a payment, a booking, a post, a deletion), with the safety
 * floor and its reviewer, so delegating never gets an account action past the person. Each pre-approved
 * hand-off writes one `approval.evaluated` row saying who decided it and on which grant.
 */
import { and, eq } from "drizzle-orm";
import { HANDOFF_GRANT } from "../agents/handoff";
import { HANDOFF_TOOL } from "../agents/handoff-tool";
import type { AgentProfileStore } from "../agents/profile-store";
import type { AgentActor, AgentProfile } from "../agents/profile-types";
import { isApprovalRecheck } from "../approvals/service";
import {
  type ApprovalCandidate,
  type ApprovalGate,
  currentApprovalContext,
} from "../approvals/types";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { pluginGrants } from "../db/schema";
import { freeDuetPackageIsLoaded } from "./coordination";
import { FREEDUET_GRANT } from "./hub-grants";

/** The `source` the audit row carries, in the place the gate puts "auto_review" or "default". */
export const HUB_HANDOFF_SOURCE = "freeduet_hub";

/**
 * Which Bot a hand-off names, resolved as the desk resolves it (`createHandoffDesk`, `send`): an id
 * is exact and wins outright; otherwise a name, case-insensitively, among the Bots the person can
 * reach, and two of the same name resolve to nobody (the desk refuses it as ambiguous). A Bot that is
 * hidden or deleted is nobody, and so is the asking Bot itself.
 */
export function resolveHandoffTarget(
  roster: readonly Pick<AgentProfile, "id" | "name" | "hidden" | "deletedAt">[],
  askingBotId: string,
  named: string,
): string | undefined {
  const wanted = named.trim().toLowerCase();
  const byId = roster.find((bot) => bot.id.toLowerCase() === wanted);
  const reachable = roster.filter(
    (bot) =>
      bot.name.toLowerCase() === wanted &&
      !bot.hidden &&
      bot.deletedAt === null,
  );
  if (!byId && reachable.length > 1) return undefined;
  const found = byId ?? reachable[0];
  if (!found || found.hidden || found.deletedAt !== null) return undefined;
  if (found.id === askingBotId) return undefined;
  return found.id;
}

/** Whether the package itself granted `from` the right to hand work to `to`. */
export async function hubGrantExists(
  database: Database,
  from: string,
  to: string,
): Promise<boolean> {
  const [row] = await database
    .select({ ref: pluginGrants.ref })
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.kind, HANDOFF_GRANT),
        eq(pluginGrants.agentId, from),
        eq(pluginGrants.ref, to),
        eq(pluginGrants.grantedBy, FREEDUET_GRANT),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export type HubHandoffDependencies = {
  database: Database;
  profiles: Pick<AgentProfileStore, "list">;
  actorFor: (ownerUserId: string) => Promise<AgentActor>;
  audit: AuditStore;
  /** Whether the loaded package is FreeDuet's. Read per call; defaults to what `index.ts` marked. */
  packageIsFreeDuet?: () => boolean;
};

/**
 * The target Bot's id when this call is a hand-off along the hub, and nothing for every other call.
 * Anything that cannot be read (the roster, the grant table) is "not along the hub": it fails closed
 * to the gate, which asks.
 */
async function hubTarget(
  candidate: ApprovalCandidate,
  deps: HubHandoffDependencies,
): Promise<string | undefined> {
  if (candidate.toolRef !== `bot/${HANDOFF_TOOL}`) return undefined;
  if (candidate.effect !== "delegate") return undefined;
  if (!(deps.packageIsFreeDuet ?? freeDuetPackageIsLoaded)()) return undefined;
  // An approval that is already open is re-checked by the gate itself, as before.
  if (isApprovalRecheck()) return undefined;
  try {
    const roster = await deps.profiles.list(
      await deps.actorFor(candidate.actorId),
    );
    const target = resolveHandoffTarget(
      roster,
      candidate.botId,
      candidate.scope,
    );
    if (!target) return undefined;
    return (await hubGrantExists(deps.database, candidate.botId, target))
      ? target
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `gate` with the hub's hand-offs let through. Wrap the gate the coordination tools are given
 * (`agents/coordination-wiring.ts`); every call that is not such a hand-off is `gate`'s, unchanged.
 */
export function preApproveHubHandoffs(
  gate: ApprovalGate,
  deps: HubHandoffDependencies,
): ApprovalGate {
  return async (candidate) => {
    const target = await hubTarget(candidate, deps);
    if (!target) return gate(candidate);
    const continuation = candidate.continuation ?? currentApprovalContext();
    await recordAuditEvent(deps.audit, {
      eventType: "approval.evaluated",
      targetType: "approval",
      targetId: candidate.toolRef,
      actorUserId: candidate.actorId,
      ...(continuation?.initiator ? { initiator: continuation.initiator } : {}),
      payload: {
        decidedBy: "policy",
        bot: candidate.botId,
        tool: candidate.toolRef,
        effect: candidate.effect,
        scope: candidate.scope,
        // The same key the desk's `agent.handoff_offered` row carries, so the two read together.
        ...(continuation?.runId ? { run: continuation.runId } : {}),
        outcome: {
          behaviour: "allow",
          source: HUB_HANDOFF_SOURCE,
          reason: `Pre-approved: ${candidate.botId} may hand work to ${target} on the team's own grants. What ${target} does with it is checked as usual.`,
        },
        grant: { from: candidate.botId, to: target, grantedBy: FREEDUET_GRANT },
      },
    });
    return undefined;
  };
}
