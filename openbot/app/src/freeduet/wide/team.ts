import type { AgentProfile } from "@/lib/agents/queries";
import type { ApprovalInboxData } from "@/lib/approvals";
import type { ChannelSummary } from "@/lib/channels/queries";
import { mascotKeyOf } from "./mascot";

/**
 * The order the team is listed in: Iris first, then the members as the home page shows them. Anyone
 * else (a member somebody trained, one shared with them) follows by name.
 */
const TEAM_ORDER = [
  "freeduet",
  "inbox",
  "counsel",
  "bookkeeper",
  "concierge",
  "writer",
  "reviewer",
  "fixer",
  "chef",
  "marketer",
  "video",
  "creator",
];

export function orderTeam(agents: readonly AgentProfile[]): AgentProfile[] {
  const rank = (agent: AgentProfile) => {
    const at = TEAM_ORDER.indexOf(agent.id);
    return at === -1 ? TEAM_ORDER.length : at;
  };
  return [...agents]
    .filter((agent) => !agent.hidden)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** What the app already knows about a member right now: waiting on the person, working, or nothing. */
export type MemberState = "waiting" | "working" | null;

export const STATE_TEXT: Record<Exclude<MemberState, null>, string> = {
  waiting: "Waiting for you",
  working: "Working on it",
};

/**
 * The state of each member, from what the app has already loaded and no new question to the server:
 * a request or question in the owner-scoped inbox that names the member means it waits on the person;
 * a conversation of the member's that the roster marks busy means it is working.
 */
export function memberStates(
  inbox: ApprovalInboxData | undefined,
  channels: readonly ChannelSummary[] | undefined,
): Map<string, Exclude<MemberState, null>> {
  const states = new Map<string, Exclude<MemberState, null>>();
  for (const channel of channels ?? []) {
    if (!channel?.busy) continue;
    for (const id of channel.agentIds) states.set(id, "working");
  }
  for (const request of inbox?.requests ?? []) {
    if (request.status === "pending")
      states.set(request.action.botId, "waiting");
  }
  for (const question of inbox?.questions ?? []) {
    states.set(question.botId, "waiting");
  }
  return states;
}

/**
 * Where a member's row goes: Iris is Chat; another member opens the newest conversation with them
 * alone, or a new one when there is none. Both are destinations the app already has.
 */
export function memberTarget(
  agent: AgentProfile,
  primaryId: string | undefined,
  channels: readonly ChannelSummary[] | undefined,
):
  | { to: "/" }
  | { to: "/channel/$channelId"; channelId: string }
  | { to: "/channel/new"; agent: string } {
  if (agent.id === primaryId) return { to: "/" };
  const open = (channels ?? []).find(
    (channel) =>
      channel?.active &&
      !channel.taskId &&
      !channel.openduetChannel &&
      channel.agentIds.length === 1 &&
      channel.agentIds[0] === agent.id,
  );
  return open
    ? { to: "/channel/$channelId", channelId: open.id }
    : { to: "/channel/new", agent: agent.id };
}

/** Whether a member has one of the twelve faces, for the tests and the neutral fallback. */
export function hasOwnFace(agentId: string): boolean {
  return mascotKeyOf(agentId) !== null;
}
