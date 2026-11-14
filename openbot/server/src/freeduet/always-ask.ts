/**
 * What the server holds to an approval card every time, whatever the person switched on (D35,
 * docs/M1_PLAN.md section 18). Three cases, and nothing else:
 *
 * 1. A WRITE MADE BY A RUN NOBODY WAS WATCHING. A routine, an event trigger (a responsibility's run)
 *    and a hand-off whose chain began in one. In the person's own live chat turn the person is there
 *    to see the Bot work, and "ask before making changes", auto-review and Full access are their own
 *    settings for that. A routine writes at nine in the morning with nobody there: the reviewer is a
 *    model reading text the routine itself wrote, and a rule saved for a chat once answers every run
 *    after it. So the card is the only thing that stands in for the person, and nothing else does.
 * 2. CHANGING WHAT RUNS UNATTENDED. Creating, changing, switching or deleting a routine or a trigger
 *    (every write on the Routines connector) is how a Bot sets up case 1 for later, so it asks in the
 *    person's own live turn too, with Full access on or off.
 *
 * 3. CHANGING ONE OF THE PERSON'S SETTINGS FROM CHAT. The Settings connector's change tool
 *    (`plugins/builtin-settings.ts`, settings-in-chat slice 1) is a write that asks the person before
 *    anything changes, whatever Full access says. Its list of settings is decided in its own module.
 *
 * WHO DECIDES. Only facts the server holds: the run's initiator (the approval context and the signed
 * run, never a word of the model's), the transport the connector call resolved to, and the answer of
 * the check that asks about a new email. Nothing the model writes can add or lift an ask.
 *
 * WHAT IT IS NOT. Never a read. Never the Bot's own workspace or commands on the person's computer
 * (`NOT_ACCOUNT_ACTIONS`: they reach no account, and a routine that writes a file would otherwise wait
 * for a card forever). Never a hand-off (`effect: "delegate"`: D21 pre-approves it, and what the
 * receiving member then writes meets this same rule in its own run). Not a run started by the person,
 * or a hop traced to one. A hand-off, a safety requirement or a rule that hands the action to the
 * person is stricter than a card, so it still comes first (`approvals/policy.ts`).
 *
 * WHAT THE ANSWER LOOKS LIKE. `source: "always_ask"`, the same outcome a new email already has: the
 * store refuses "Always allow" for it, a saved rule never answers it, and both cards hide the button.
 */
import { NOT_ACCOUNT_ACTIONS } from "../approvals/policy";
import type { AuditInitiator } from "../audit";

/** What the person reads on the card when the run was a routine's or a trigger's. */
export const UNATTENDED_WRITE_REASON =
  "This came from a routine or a trigger running on its own, not from a message you sent, so it always asks you first.";
/** What the person reads on the card when a Bot is setting up, changing or removing one. */
export const AUTOMATION_CHANGE_REASON =
  "Routines and triggers act later without you, so setting one up, changing it or deleting it always asks you first.";
/**
 * What the person reads on the card when a Bot changes one of their settings from chat
 * (docs/design/settings-in-chat.md, slice 1).
 */
export const SETTING_CHANGE_REASON =
  "A Bot changing one of your settings from chat always asks you first, with Full access on or off.";

/** A chain of hand-offs is at most this long here; the desk caps it far lower, this only ends a loop. */
const MAX_HOPS = 16;

/**
 * What started a run: a hand-off carries the root it came from (`origin`, always the root, never
 * another hop: `handoffInitiator` in `audit.ts`), and any other initiator is its own. A hop that names
 * no origin has no known root, and `undefined` here is "not known to be unattended".
 */
function rootOf(
  initiator: AuditInitiator | undefined,
): AuditInitiator | undefined {
  let at = initiator;
  for (let hops = 0; at?.kind === "handoff" && hops < MAX_HOPS; hops += 1)
    at = at.origin;
  return at?.kind === "handoff" ? undefined : at;
}

/**
 * Whether the run began in a routine or an event trigger, or in a hand-off made from one. The
 * person's own turn (no initiator, or `person`), a memory run and the deployment are not: they are
 * not what D35 asked about, and every one of them is gated exactly as before.
 */
export function startedUnattended(
  initiator: AuditInitiator | undefined,
): boolean {
  const kind = rootOf(initiator)?.kind;
  return kind === "routine" || kind === "responsibility";
}

export type AlwaysAskFacts = {
  /** `read`, `write` or `delegate`: only a write is ever held to a card by this rule. */
  effect: string;
  toolRef: string;
  /** What started the run this call is made in: the approval context's initiator. */
  runInitiator: AuditInitiator | undefined;
  /**
   * What the call itself says started its run, for a call that holds no approval context: the
   * callback door (`/api/agent-tools/call`) carries the signed run's initiator and no continuation.
   */
  callInitiator: AuditInitiator | undefined;
  /** The call is a write on the Routines connector: it creates, changes, switches or deletes one. */
  configuresAutomation: boolean;
  /**
   * The call is a write on the Settings connector, which changes one of the person's settings from chat
   * (settings-in-chat). Read off the transport the row resolved to, like `configuresAutomation`.
   */
  changesSetting?: boolean;
  /**
   * The person just allowed this exact send on its own card (the check that asks about a new email
   * every time). A second card for the same email would be noise, and the answer being spent, one
   * that could never be honoured, so the send has the card the rule asks for.
   */
  answeredByCard: boolean;
};

/**
 * Why the server holds this action to a card every time, or `undefined` when this rule has nothing to
 * say about it (and the gate goes on exactly as it did before).
 */
export function alwaysAskReason(facts: AlwaysAskFacts): string | undefined {
  if (facts.effect !== "write") return undefined;
  if (NOT_ACCOUNT_ACTIONS.test(facts.toolRef)) return undefined;
  if (
    !facts.answeredByCard &&
    (startedUnattended(facts.runInitiator) ||
      startedUnattended(facts.callInitiator))
  )
    return UNATTENDED_WRITE_REASON;
  if (facts.configuresAutomation) return AUTOMATION_CHANGE_REASON;
  if (facts.changesSetting) return SETTING_CHANGE_REASON;
  return undefined;
}
