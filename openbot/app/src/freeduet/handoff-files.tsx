import { useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { MemberFileCard } from "@/freeduet/member-file-card";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { membersNamed } from "@/lib/approvals";
import { client } from "@/lib/client";

/*
 * D177: under a hand-off line, the files the colleague offered while it worked, as the same card as
 * `offer_file` (`member-file-card.tsx`): the name, the size and a Download button, which fetches the file
 * through the computer download route only when it is pressed. Nothing here fetches a file's bytes.
 *
 * The colleague's run is in a scratch thread nobody sees, so its own card never reached this
 * conversation. The server keeps one row per offered file for the person's conversation
 * (`GET /api/freeduet/handoff-files?thread=`, narrowed to the signed-in person) and this draws those
 * of the member the line names, in the order they were offered.
 */

export type HandoffFileRow = {
  id: string;
  askerBotId: string;
  memberBotId: string;
  path: string;
  name: string;
  bytes: number;
  copyPath: string | null;
  copyNote: string | null;
  createdAt: string;
};

const POLL_MS = 5_000;
/** About thirty minutes of asking after the conversation opens; a hop is over long before that, and a focus asks again. */
const POLL_TIMES = 360;

export function handoffFilesQueryOptions(threadId: string | undefined) {
  return queryOptions({
    queryKey: ["freeduet", "handoff-files", threadId ?? ""],
    enabled: threadId !== undefined,
    queryFn: () =>
      client<HandoffFileRow[]>(
        `/api/freeduet/handoff-files?thread=${encodeURIComponent(threadId ?? "")}`,
        "files",
        { fallback: "Could not read the files." },
      ),
    refetchInterval: (query) =>
      query.state.dataUpdateCount < POLL_TIMES ? POLL_MS : false,
    retry: false,
  });
}

/** The cards of the files the member this line asked offered in this conversation. */
export function HandoffFiles({ bot }: { bot: string | undefined }) {
  const threadId = useCopilotChatConfiguration()?.threadId;
  const roster = useQuery(agentListQueryOptions());
  const files = useQuery(handoffFilesQueryOptions(threadId));
  const asked = membersNamed(bot, roster.data);
  const mine = (files.data ?? []).filter((file) => asked.has(file.memberBotId));
  if (mine.length === 0) return null;
  return (
    <div className="mt-3 space-y-3" data-handoff-files>
      {mine.map((file) => (
        <MemberFileCard
          file={{
            botId: file.memberBotId,
            path: file.path,
            name: file.name,
            bytes: file.bytes,
          }}
          key={file.id}
        />
      ))}
    </div>
  );
}
