import { createFileRoute } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { ReachingYou } from "@/components/delivery/reaching-you";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/reach")({
  component: ReachPage,
});

function ReachPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.reachPurpose")}
      title={t("bot.area.reaching")}
    >
      {(agent) => <ReachingYou agentId={agent.id} />}
    </BotSubpage>
  );
}
