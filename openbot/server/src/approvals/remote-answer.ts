import { approvalText } from "@openbot/shared/approval-text";
import { REMOTE_SESSION_LIMITED } from "../auth/remote-limits";
import { safetyRequirement } from "./policy";
import type { ApprovalAction } from "./types";

/**
 * FreeDuet (docs/design/phone-and-remote.md 3.5.3): which approval requests a REMOTE session may answer.
 *
 * A signed-in browser that is not paired with this computer may see every request in full and answer an
 * ordinary one ONCE, with `allow_once` or `deny`. It may not answer one that is the person's to do, one
 * that would stand as a rule, or one that changes what the assistants may do. The default is no: a request
 * that cannot be classified is not answered from here, and stays pending for the computer.
 *
 * Pure, and built only from what the server recorded when the gate opened the request (`action.policy`,
 * set by the gate and never by a model or a browser) and from the same built-in safety check the gate runs,
 * asked again at the moment of answering so that a request opened by older code, or by a gate that has
 * since changed its mind, is not let through on its old verdict.
 */

/** What a person is told. It says why and where to answer. The request is left as it was. */
export const REMOTE_ANSWER_SENTENCE = approvalText(
  "remote.answerSentence",
  "en",
);

/**
 * The words of a call that connect, authorise, install, share or open something up, or that drive a computer:
 * matched on the tool's name and its target, never on the arguments, which a request can fill with anything.
 * Deliberately broad: a refusal here costs one answer at the computer.
 */
const NOT_FROM_HERE =
  /full[-_ ]?access|connect|authori[sz]e|oauth|install|grant|invite|share|permission|sign[-_ ]?in|always[-_ ]?(?:allow|ask)|approval[-_ ]?(?:rule|setting)|^host\/|^computer_|^programs\//i;

export type RemoteAnswer =
  | { allowed: true }
  | { allowed: false; reason: string };

const no = (reason: string): RemoteAnswer => ({ allowed: false, reason });

/**
 * Whether a remote session may answer this request with this decision. `action` is what the store holds for
 * the request, or `undefined` where it holds none, which is a refusal.
 */
export function remoteMayAnswer(
  decision: string,
  action: ApprovalAction | undefined,
): RemoteAnswer {
  if (decision !== "allow_once" && decision !== "deny") {
    return no("only allow once and deny are answered from a remote session");
  }
  if (!action) return no("the request has no recorded action");
  const policy = action.policy;
  // A request the gate left no verdict on is one it did not settle: not answered from here.
  if (!policy) return no("the gate recorded no verdict");
  // Only a verdict this code knows is read. A recorded one that is not (or has no behaviour) is not trusted.
  if (!["ask", "allow", "deny"].includes(policy.behaviour)) {
    return no("the gate's verdict is not one this build knows");
  }
  if (policy.behaviour === "hand_off")
    return no("the gate handed it to the person");
  if (policy.source === "safety")
    return no("a built-in safety requirement settled it");
  if (policy.review?.verdict === "hand_off")
    return no("the reviewer handed it to the person");
  if (policy.review?.safety && policy.review.safety !== "none") {
    return no("the reviewer found a safety category in it");
  }
  // The same check the gate runs, again: a payment or purchase, a credential, a security or sharing setting.
  const safety = safetyRequirement(action);
  if (safety) return no(`the safety check matches it (${safety.id})`);
  if (action.configuresAutomation)
    return no("it sets up a routine or a trigger");
  if (action.changesSetting) return no("it changes a setting from chat");
  if (NOT_FROM_HERE.test(`${action.toolRef} ${action.effect}`)) {
    return no(
      "it connects, shares or opens something up, or drives a computer",
    );
  }
  return { allowed: true };
}

/** The refusal the route answers, with the code the app already knows. */
export function remoteAnswerRefusal() {
  return { error: REMOTE_ANSWER_SENTENCE, code: REMOTE_SESSION_LIMITED };
}
