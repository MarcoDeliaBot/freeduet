/**
 * A setting is changed only in a conversation with the person (docs/design/settings-in-chat.md, 8.9).
 *
 * THE DECISION. Taken by the maintainer on 14 November 2026: a setting is never changed inside a
 * routine, or inside any run nobody is attending. Before it, such a run got a card the person could
 * answer later (D35 case 1); now the call is refused before any card is opened, so there is nothing to
 * answer later and nothing recorded as a change.
 *
 * WHAT COUNTS AS THE PERSON'S TURN. Only a run that began with the person's own message and is still in
 * their conversation:
 *
 * - their live chat turn, and the other turns the person starts by writing (a reply in a task, a message
 *   delivered from another channel). They carry no initiator, or the person's;
 * - the RELAY of a hand-off made from such a turn: the answer of the Bot that was asked, coming back to
 *   the Bot that asked, in the conversation the person is watching (D22). Its card is drawn there, and
 *   the person is the one asked to answer it.
 *
 * Everything else is refused: a routine, a trigger, a check-in, background research, a memory run and the
 * deployment's own runs; a hand-off whose chain began in any of those; the FORWARD hop of a hand-off, which
 * runs in a conversation of the addressed Bot's own that nobody is shown; a hand-off the server cannot
 * trace; and a call made outside any run that could wait for the person.
 *
 * WHO DECIDES. Only facts the server holds: the run's initiator (the approval context), the initiator the
 * call arrived with, and the deployment's own signed statement of the run (`forwardedProps.openbotRun`),
 * which says how deep a hand-off is, which conversation asked, and whether it is a delivery at all. Never
 * a word of the model's, and never the name of the setting: this is asked about the Settings connector's
 * write tool and nothing else, so every setting on the list, now and later, is covered by the same rule.
 *
 * EVERY DOUBT IS A REFUSAL. A hand-off whose root, depth, signature or conversation cannot be read is
 * refused, and so is a kind of initiator this build does not know.
 */
import { readApprovedRunAssertion } from "../agents/callback-token";
import type { RunAssertion } from "../agents/callback-token";
import type { AuditInitiator, AuditInitiatorKind } from "../audit";
import type { Decides } from "../plugins/broker";

/**
 * The sentence the member reads when a change is refused, and repeats to the person as it stands. Plain
 * English, like the Settings tool's own refusals.
 */
export const NOT_IN_A_CONVERSATION =
  "Settings can only be changed in a conversation with you. Ask me again there.";

/** Why a change was refused, for the audit row. Stable strings: a reader filters on them. */
export type RefusedBecause =
  /** The call is not made inside a run that can wait for the person: there is nobody to ask. */
  | "no_conversation"
  /** A routine, a trigger, a check-in, research, a memory run, the deployment, or a hand-off from one. */
  | "not_the_persons_run"
  /** Another member's run, in a conversation of its own that the person is not shown. */
  | "forward_hop"
  /** A hand-off whose root, depth, signature or conversation the server cannot establish. */
  | "untraced_hop";

export type OwnTurnVerdict =
  /** `live`: the person's own turn. `relay`: an answer coming back to the Bot that was asked for it. */
  { ok: true; leg: "live" | "relay" } | { ok: false; why: RefusedBecause };

export type OwnTurnFacts = {
  /** The call is made inside a run that can wait for an answer: an approval context exists. */
  inRun: boolean;
  /** What started the run, from its approval context. Absent for a turn started from the app. */
  runInitiator: AuditInitiator | undefined;
  /** What the call itself says started its run. Absent, or the person's, for the person's own turn. */
  callInitiator: AuditInitiator | undefined;
  /** The conversation the run is in, from its approval context. */
  runThreadId: string | undefined;
  /**
   * The deployment's signed statement of the run, verified with its key (expiry ignored: an approval is
   * answered long after the run's ten minutes). Null when absent, forged or unreadable.
   */
  assertion: RunAssertion | null;
  /** The Bot making the call, and the person it is for: the signed statement must name both. */
  botId: string;
  actorId: string;
};

/** How one carrier of an initiator reads. */
type Reading = "person" | "hop_of_person" | "other";

/**
 * One initiator, read strictly. A hand-off is the person's only when it names the person as its root:
 * `handoffInitiator` (audit.ts) always puts the root there, and a hop with no root has none to trust.
 */
function reading(initiator: AuditInitiator | undefined): Reading {
  if (initiator === undefined) return "person";
  type _OwnTurnDecides = Decides<
    AuditInitiatorKind,
    {
      person: "the person's own turn";
      remote: "refused: the person's words from a browser not paired with the computer; a setting is changed at the computer";
      handoff: "the person's only through the relay of a hop whose root is the person; judged by the signed run";
      routine: "refused: a routine, a check-in or research ran on its own";
      responsibility: "refused: a trigger ran on its own";
      memory: "refused: a memory run, nobody asked for it";
      deployment: "refused: no person is behind it";
    }
  >;
  switch (initiator.kind) {
    case "person":
      return "person";
    case "handoff":
      return initiator.origin?.kind === "person" ? "hop_of_person" : "other";
    default:
      // A remote session's run, a routine, a trigger, a memory run, the deployment, and a kind only
      // another version knows.
      return "other";
  }
}

const refuse = (why: RefusedBecause): OwnTurnVerdict => ({ ok: false, why });

/**
 * Which leg of a hand-off this run is, and whether it is the one that comes back to the person.
 *
 * A RELAY is the asking Bot, run again in the conversation that asked, to tell the person what the other
 * Bot answered. The signed run says all of it: it is a delivery (`handoff`), for this Bot and this person,
 * one hop deep, made from a run of the person's own, and the conversation it names is the one this run is
 * in. A FORWARD hop names the same asking conversation and runs in a scratch conversation of its own, so
 * the two never agree. A hop deeper than one, or from a run of anything but the person's, is not traced.
 */
function legOf(facts: OwnTurnFacts): OwnTurnVerdict {
  const signed = facts.assertion;
  if (!signed?.handoff) return refuse("untraced_hop");
  if (signed.botId !== facts.botId || signed.actorId !== facts.actorId)
    return refuse("untraced_hop");
  if (!signed.threadId || !facts.runThreadId) return refuse("untraced_hop");
  if (signed.threadId !== facts.runThreadId) return refuse("forward_hop");
  if ((signed.depth ?? 0) !== 1) return refuse("untraced_hop");
  if (reading(signed.initiator) !== "person") return refuse("untraced_hop");
  return { ok: true, leg: "relay" };
}

/**
 * Whether this call to the Settings connector's write tool is made in the person's own turn. Pure: it
 * reads the facts it is given and nothing else.
 */
export function ownTurn(facts: OwnTurnFacts): OwnTurnVerdict {
  if (!facts.inRun) return refuse("no_conversation");
  const run = reading(facts.runInitiator);
  const call = reading(facts.callInitiator);
  if (run === "other" || call === "other") return refuse("not_the_persons_run");
  if (run === "person" && call === "person") {
    // A delivery is never the person's own turn, whatever its carriers say: one always carries the hop's
    // initiator, so a run the signed statement shows to be a delivery and that says otherwise is not traced.
    if (facts.assertion?.handoff) return refuse("untraced_hop");
    return { ok: true, leg: "live" };
  }
  // A mixture of the two is no leg of either: both carriers must say hand-off, or both the person.
  if (run !== "hop_of_person" || call !== "hop_of_person")
    return refuse("untraced_hop");
  return legOf(facts);
}

/**
 * The refusal for a call to the Settings connector's write tool made outside the person's own turn, or
 * null when the call may go on to the gate (which still asks the person, as before). Called by the plugin
 * store before the approval gate, so a refused call opens no card.
 */
export function settingChangeRefusal(input: {
  /** The run's approval context, when there is one. */
  context:
    | {
        initiator?: AuditInitiator | undefined;
        threadId?: string | undefined;
        forwardedProps?: unknown;
      }
    | undefined;
  callInitiator: AuditInitiator | undefined;
  botId: string;
  actorId: string;
  /** The deployment key the run was signed with. */
  encryptionKey: string;
}): { why: RefusedBecause; message: string } | null {
  const forwarded = input.context?.forwardedProps;
  const signed =
    forwarded && typeof forwarded === "object"
      ? (forwarded as { openbotRun?: unknown }).openbotRun
      : undefined;
  const verdict = ownTurn({
    inRun: input.context !== undefined,
    runInitiator: input.context?.initiator,
    callInitiator: input.callInitiator,
    runThreadId: input.context?.threadId,
    assertion: readApprovedRunAssertion(signed, input.encryptionKey),
    botId: input.botId,
    actorId: input.actorId,
  });
  return verdict.ok
    ? null
    : { why: verdict.why, message: NOT_IN_A_CONVERSATION };
}
