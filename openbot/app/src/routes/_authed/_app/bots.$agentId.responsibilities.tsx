import { createFileRoute } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { BotResponsibilities } from "@/components/responsibilities/responsibilities";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute(
  "/_authed/_app/bots/$agentId/responsibilities",
)({
  component: ResponsibilitiesPage,
});

function ResponsibilitiesPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.responsibilitiesPurpose")}
      title={t("bot.area.responsibilities")}
    >
      {(agent) => <BotResponsibilities agentId={agent.id} />}
    </BotSubpage>
  );
}
