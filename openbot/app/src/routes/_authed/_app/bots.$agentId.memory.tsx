import { createFileRoute, Link } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { MemorySources } from "@/components/memory/sources";
import { ProactiveResearchSettings } from "@/components/suggestions/proactive-panel";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/memory")({
  component: MemoryPage,
});

function MemoryPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.memoryPurpose")}
      title={t("bot.area.memory")}
    >
      {(agent) => (
        <>
          <p className="mt-6 text-muted-foreground text-sm">
            {t("bot.page.memoryPointer")}{" "}
            <Link
              className="underline underline-offset-4"
              to="/capabilities/memory"
            >
              {t("nav.capabilities")}
            </Link>
            .
          </p>
          <MemorySources agentId={agent.id} />
          <ProactiveResearchSettings agentId={agent.id} />
        </>
      )}
    </BotSubpage>
  );
}
