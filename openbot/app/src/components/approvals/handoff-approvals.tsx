import { useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  approvalInboxOptions,
  handoffRequestsWaiting,
  membersNamed,
} from "@/lib/approvals";
import { HANDED_OVER } from "@/lib/copilot/markers";
import { saidItWentAhead } from "@/lib/plugins/tool-result";
import { InlineApproval } from "./inline-approval";

/**
 * D52: the card of a member's action that waits on the person, drawn in the conversation the person is
 * writing in, under the hand-off line that asked the member.
 *
 * Not a second card. It is `InlineApproval` over the request in the owner-scoped inbox the Tasks page
 * reads, found by the conversation that asked (`askedIn`, set by the server from the run it signed,
 * never from anything a model wrote) and by the member the line names. Same text, same buttons, same
 * decision route, so a decision made here or in Tasks is the one decision, and the server still runs
 * the action once and sends the answer home.
 *
 * A card this screen saw waiting stays, folded to who decided, once it is decided; one that was already
 * decided when the page opened is not drawn again.
 */
export function HandoffApprovals({ bot }: { bot: string | undefined }) {
  const threadId = useCopilotChatConfiguration()?.threadId;
  const inbox = useQuery(approvalInboxOptions());
  const roster = useQuery(agentListQueryOptions());
  const waiting = handoffRequestsWaiting(
    inbox.data?.requests,
    threadId,
    membersNamed(bot, roster.data),
  );
  const [seen, setSeen] = useState<string[]>([]);
  const fresh = waiting
    .map((request) => request.action.toolCallId as string)
    .filter((id) => !seen.includes(id));
  if (fresh.length > 0) setSeen([...seen, ...fresh]);
  if (seen.length === 0 && waiting.length === 0) return null;
  const ids = [...new Set([...seen, ...fresh])];
  return (
    <div className="mt-3 space-y-3" data-handoff-approvals>
      {ids.map((id) => (
        <InlineApproval key={id} toolCallId={id} fallback={null} />
      ))}
    </div>
  );
}

/** The Bot a hand-off line asked, from the arguments the model sent; `undefined` when they do not say. */
export function handoffTarget(args: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(args);
    const bot =
      parsed && typeof parsed === "object"
        ? (parsed as { bot?: unknown }).bot
        : undefined;
    return typeof bot === "string" && bot.trim() ? bot.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which hand-off lines of a transcript carry the waiting cards: the LAST line that asked each member
 * and was not turned away, so a card is drawn once even when the same member was asked twice. The line is
 * found by who was asked, not by which call: the server does not record the asking call, so a card
 * waiting for a member sits under that member's latest hand-off.
 */
export function lastHandoffLines(
  items: readonly {
    kind: string;
    id: string;
    toolCall?: { function: { name: string; arguments: string } };
    result?: string;
  }[],
): Set<string> {
  const lastFor = new Map<string, string>();
  for (const item of items) {
    if (item.kind !== "tool" || item.toolCall?.function.name !== "message_bot")
      continue;
    if (!saidItWentAhead(item.result, HANDED_OVER)) continue;
    const bot = handoffTarget(item.toolCall.function.arguments);
    if (bot) lastFor.set(bot.toLowerCase(), item.id);
  }
  return new Set(lastFor.values());
}
