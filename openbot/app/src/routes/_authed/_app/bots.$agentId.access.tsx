import { createFileRoute } from "@tanstack/react-router";
import { AccessSections } from "@/components/bot-profile/access";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/access")({
  component: AccessPage,
});

function AccessPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.accessPurpose")}
      title={t("bot.area.access")}
    >
      {(agent) => <AccessSections agent={agent} />}
    </BotSubpage>
  );
}
