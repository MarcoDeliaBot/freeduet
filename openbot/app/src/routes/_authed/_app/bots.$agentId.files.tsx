import { createFileRoute } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { useT } from "@/freeduet/i18n/provider";
import { MemberFilesPanel } from "@/freeduet/member-files-panel";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/files")({
  component: FilesPage,
});

function FilesPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("files.purpose")}
      title={t("files.title")}
    >
      {(agent) => <MemberFilesPanel botId={agent.id} name={agent.name} />}
    </BotSubpage>
  );
}
