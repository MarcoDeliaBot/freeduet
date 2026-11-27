import { createFileRoute } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { SharingSections } from "@/components/bot-profile/sharing";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/sharing")({
  component: SharingPage,
});

function SharingPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.sharingPurpose")}
      title={t("bot.area.sharing")}
    >
      {(agent) => <SharingSections agent={agent} />}
    </BotSubpage>
  );
}
