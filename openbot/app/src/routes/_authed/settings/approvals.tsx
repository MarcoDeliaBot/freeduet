import { createFileRoute } from "@tanstack/react-router";
import { ApprovalSettings } from "@/components/approvals/settings";
import { PageShell } from "@/components/layout/page-shell";
import { TeamBotConsents } from "@/components/settings/team-bot-consents";
import { FreeDuetFullAccess } from "@/freeduet/full-access-section";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/settings/approvals")({
  component: ApprovalsSettingsPage,
});

function ApprovalsSettingsPage() {
  const t = useT();
  return (
    <PageShell
      description={t("approvals.page.description")}
      // Named as the Settings row that opens it.
      title={t("nav.approvalRules")}
    >
      <ApprovalSettings />
      <FreeDuetFullAccess />
      <TeamBotConsents />
    </PageShell>
  );
}
