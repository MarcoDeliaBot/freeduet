import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ManageSection } from "@/components/bot-profile/manage";
import { BotProfile } from "@/components/bot-profile/profile";
import { BotSettingsRows } from "@/components/bot-profile/settings-rows";
import { LightPageShell } from "@/freeduet/light/light-page";
import { agentQueryOptions } from "@/lib/agents/queries";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/")({
  component: BotProfilePage,
});

function BotProfilePage() {
  const t = useT();
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const agent = useQuery(agentQueryOptions(agentId));
  const toRoster = () => void navigate({ to: "/bots" });
  return (
    <LightPageShell
      backButton={{ label: t("nav.bots"), linkProps: { to: "/bots" } }}
      crumbs={[{ label: t("nav.bots"), to: "/bots" }]}
      purpose={t("botPage.purpose")}
      title={agent.data?.name ?? t("botPage.fallbackTitle")}
    >
      {agent.isPending ? null : agent.error ? (
        <p className="mt-6 text-destructive text-sm" role="alert">
          {t("botPage.openError")}
        </p>
      ) : (
        <BotProfile
          agent={agent.data}
          manage={
            <ManageSection
              agent={agent.data}
              onDeleted={toRoster}
              onDuplicated={(copyId) =>
                void navigate({
                  params: { agentId: copyId },
                  to: "/bots/$agentId",
                })
              }
              onHidden={toRoster}
            />
          }
          settings={<BotSettingsRows agent={agent.data} />}
        />
      )}
    </LightPageShell>
  );
}
