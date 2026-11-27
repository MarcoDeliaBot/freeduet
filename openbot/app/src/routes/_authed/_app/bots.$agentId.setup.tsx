import { createFileRoute } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { SetupSections } from "@/components/bot-profile/setup";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/setup")({
  component: SetupPage,
});

function SetupPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.setupPurpose")}
      title={t("settings.setup")}
    >
      {(agent) => <SetupSections agent={agent} />}
    </BotSubpage>
  );
}
