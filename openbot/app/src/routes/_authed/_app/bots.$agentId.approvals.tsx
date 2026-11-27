import { createFileRoute } from "@tanstack/react-router";
import { BotApprovalRules } from "@/components/approvals/bot-rules";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/approvals")({
  component: ApprovalRulesPage,
});

function ApprovalRulesPage() {
  const t = useT();
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description={t("bot.page.approvalsPurpose")}
      title={t("nav.approvalRules")}
    >
      {(agent) => <BotApprovalRules agentId={agent.id} />}
    </BotSubpage>
  );
}
