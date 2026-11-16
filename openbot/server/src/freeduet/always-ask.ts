/**
 * What the server holds to an approval card every time, whatever the person switched on (D35,
 * docs/M1_PLAN.md section 18). Four cases, and nothing else:
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
 *    That is the person's own live turn. In a run nobody is attending (case 1) the call never gets
 *    here: `callTool` refuses it first (`settings-in-chat/own-turn.ts`, docs/design/settings-in-chat.md
 *    section 8.9), so no card is opened for it. The unattended-write branch below still names such a run
 *    as defence in depth, for a caller that reached the gate some other way.
 *
 * 4. A WRITE MADE IN A REMOTE SESSION'S RUN (docs/design/phone-and-remote.md 3.5.5, decision H). A person
 *    who is signed in from a browser that is not paired with the computer may chat with a member. What
 *    the member then writes asks a card whatever Full access, a saved rule, the reviewer or the typed-
 *    recipient shortcuts would have said, because those all read "the person's own live turn" as "the
 *    person is at the desk and typed this", and a phone that is lost or lifted is not that. The card
 *    can still be allowed once from there (`approvals/remote-answer.ts` says which ones, and a member's
 *    own computer is not one of them); it is never answered by a rule, and never saved as one. The mark
 *    is the run's initiator `remote`, set by the server from the pairing cookie (`copilot.ts`,
 *    `createRequestAgents`); a hop made from such a run keeps it as its root, so what the receiving
 *    member writes asks too.
 *
 * WHO DECIDES. Only facts the server holds: the run's initiator (the approval context and the signed
 * run, never a word of the model's), the transport the connector call resolved to, and the answer of
 * the check that asks about a new email. Nothing the model writes can add or lift an ask.
 *
 * WHAT IT IS NOT. Never a read. Never, in cases 1 to 3, the Bot's own workspace or commands on the
 * person's computer (`NOT_ACCOUNT_ACTIONS`: they reach no account, and a routine that writes a file would
 * otherwise wait for a card forever); case 4 does ask for them. Never a hand-off (`effect: "delegate"`:
 * D21 pre-approves it, and what the receiving member then writes meets this same rule in its own run).
 * Not a run started by the person at the computer, or a hop traced to one. A hand-off, a safety
 * requirement or a rule that hands the action to the person is stricter than a card, so it still comes
 * first (`approvals/policy.ts`).
 *
 * WHAT THE ANSWER LOOKS LIKE. `source: "always_ask"`, the same outcome a new email already has: the
 * store refuses "Always allow" for it, a saved rule never answers it, and both cards hide the button.
 */
import { NOT_ACCOUNT_ACTIONS, PROGRAMS_TOOLS } from "../approvals/policy";
import { approvalText } from "@openbot/shared/approval-text";
import type { AuditInitiator } from "../audit";

/** What the person reads on the card when the run was a routine's or a trigger's. */
export const UNATTENDED_WRITE_REASON = approvalText("reason.unattended", "en");
/** What the person reads on the card when a Bot is setting up, changing or removing one. */
export const AUTOMATION_CHANGE_REASON = approvalText("reason.automation", "en");
/**
 * What the person reads on the card when a Bot changes one of their settings from chat
 * (docs/design/settings-in-chat.md, slice 1).
 */
export const SETTING_CHANGE_REASON = approvalText("reason.setting", "en");

/**
 * What the person reads on the card when the run was started from a browser that is not paired with the
 * computer. It says what the card is for and how it goes away: a paired browser works as it always did.
 */
export const REMOTE_WRITE_REASON = approvalText("reason.remoteWrite", "en");

/**
 * What the person reads on the card for a program on their own computer (D60). Plain English, kept as it
 * stands; it is not yet in the per-language catalogue (slice S5 adds it there).
 */
export const PROGRAMS_REASON =
  "Anything done to the programs on your computer always asks you first, with Full access on or off, and the list of what is installed counts too.";

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

/**
 * Whether the run began in a remote session: a signed-in browser that is not paired with the computer. A
 * hand-off made from such a run began there too, so it is read through its root like the unattended ones.
 * The person's own turn at the computer (no initiator, or `person`) is not.
 */
export function startedRemote(initiator: AuditInitiator | undefined): boolean {
  return rootOf(initiator)?.kind === "remote";
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
  /*
   * PROGRAMS ON THE PERSON'S COMPUTER (D60, docs/design/programs-on-your-computer.md 4.4). First, before the
   * effect check and before the `NOT_ACCOUNT_ACTIONS` line below: the same reason in every kind of turn,
   * for a read of the list as well as for a write. Because `approvals/service.ts` asks for Full access only
   * when this returns nothing, Full access cannot lift it, in either of its settings; "Always allow" is
   * refused for the `always_ask` source it produces, and a saved rule never answers it.
   */
  if (PROGRAMS_TOOLS.test(facts.toolRef)) return PROGRAMS_REASON;
  if (facts.effect !== "write") return undefined;
  const remote =
    !facts.answeredByCard &&
    (startedRemote(facts.runInitiator) || startedRemote(facts.callInitiator));
  /*
   * A member's own workspace and its commands reach no account, so a routine is not held to a card for
   * them (it would wait for one nobody sees). A run that began in a remote session is: the person is
   * there to be asked, and the card cannot be answered from that browser (a computer tool is the
   * computer's, approvals/remote-answer.ts), so no road leads from a remote chat to a member's computer
   * without somebody at it (docs/design/phone-and-remote.md, decision J).
   */
  if (NOT_ACCOUNT_ACTIONS.test(facts.toolRef))
    return remote ? REMOTE_WRITE_REASON : undefined;
  if (
    !facts.answeredByCard &&
    (startedUnattended(facts.runInitiator) ||
      startedUnattended(facts.callInitiator))
  )
    return UNATTENDED_WRITE_REASON;
  if (facts.configuresAutomation) return AUTOMATION_CHANGE_REASON;
  if (facts.changesSetting) return SETTING_CHANGE_REASON;
  return remote ? REMOTE_WRITE_REASON : undefined;
}
