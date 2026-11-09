/**
 * FreeDuet's members hand work to each other IN-BAND, so the approval gate can ask the person.
 *
 * OpenBot runs a remote Bot's `message_bot` and `ask_person` through the signed callback
 * (`POST /api/agent-tools/call`), not through the AG-UI client lifecycle every other granted tool
 * uses (copilot.ts, runWith: "Coordination retains its signed callback"). The callback has no
 * conversation behind it, so the approval gate there can never ask anybody: any `ask` or `hand_off`
 * becomes `ApprovalRefusedError` ("...it was not started from a conversation that can ask you",
 * approvals/types.ts, `approvalAction`). And with OpenBot's default preferences (auto-review on,
 * approvals/store.ts) the reviewer is shown no request at all, because `evaluate` takes the person's
 * words from that missing conversation. So a FreeDuet member, which is a remote Bot served by
 * agent-freeduet, could hand work on only when the reviewer happened to say "proceed" about an action
 * it could not check against anything the person said. On the maintainer's machine it did not:
 * Iris's hand-off to Penny was refused (server/tests/freeduet-handoff.test.ts reproduces it).
 *
 * Run in-band instead, `message_bot` goes through `HeadlessToolsMiddleware` like any other granted
 * tool: the gate gets the conversation (the reviewer reads what the person asked), a pending approval
 * suspends the run through the normal AG-UI interrupt and the approval card, and an approved hand-off
 * is carried out and resumed by the machinery OpenBot already has for it (approvals/execute.ts,
 * `bot/` refs). Nothing about the decision itself changes: the same rules, safety requirements and
 * reviewer apply, and the receiving member's own sends, payments, bookings, posts and deletions are
 * gated again in its own run. (One decision does change, for FreeDuet's own team only: a hand-off along
 * the hub grants is pre-approved and never asks, `hub-handoffs.ts`, docs/M1_PLAN.md D21.)
 *
 * ONLY FOR FREEDUET'S OWN MEMBERS: the loaded package is FreeDuet's (`applyFreeDuetPackage` marks it),
 * the subscription router is on, and the Bot is served by the managed endpoint (agent-freeduet) with
 * the deployment token. Every other Bot, and every other package, keeps OpenBot's behaviour exactly.
 * `ask_person` stays on the callback everywhere: it is never gated, and its durable routing is the
 * callback's. agent-freeduet routes by `openbotDeploymentTools`, so it sends `message_bot` in-band as
 * soon as the name is missing from that list (docs/M1_PLAN.md D5).
 */
import { isManagedEndpoint } from "../agents/managed-endpoint";

const NONE: ReadonlySet<string> = new Set();
/** The coordination tools a FreeDuet member runs in-band. */
export const FREEDUET_IN_BAND_COORDINATION: ReadonlySet<string> = new Set([
  "message_bot",
]);

let freeDuetPackageLoaded = false;

/** Called once the tenant package is known (hub-grants.ts, `applyFreeDuetPackage`). */
export function markFreeDuetPackage(loaded: boolean): void {
  freeDuetPackageLoaded = loaded;
}

/** Whether the loaded package is FreeDuet's, as `applyFreeDuetPackage` marked it. */
export function freeDuetPackageIsLoaded(): boolean {
  return freeDuetPackageLoaded;
}

/**
 * Which coordination tools this remote Bot's run executes in-band rather than through the callback.
 * Empty for everything that is not a FreeDuet member at agent-freeduet.
 */
export function coordinationRunsInBand(
  agent: { endpoint: string; headers?: Record<string, string> },
  environment: Record<string, string | undefined> = process.env,
): ReadonlySet<string> {
  if (!freeDuetPackageLoaded) return NONE;
  if (environment.FREEDUET_ROUTER?.trim().toLowerCase() === "off") return NONE;
  const token = environment.MANAGED_AGENT_TOKEN;
  if (!token || agent.headers?.["x-openbot-agent-token"] !== token) return NONE;
  if (!isManagedEndpoint(agent.endpoint, [environment.MANAGED_AGENT_AG_UI_URL]))
    return NONE;
  return FREEDUET_IN_BAND_COORDINATION;
}
