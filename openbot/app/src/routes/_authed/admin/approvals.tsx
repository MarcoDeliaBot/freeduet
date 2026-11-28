import { createFileRoute } from "@tanstack/react-router";
import { TeamApprovalSettings } from "@/components/approvals/team-settings";
import { PageShell } from "@/components/layout/page-shell";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/admin/approvals")({
  component: AdminApprovalsPage,
});

function AdminApprovalsPage() {
  const t = useT();
  return (
    <PageShell
      description={t("approvals.admin.description")}
      title={t("settings.approvals")}
    >
      <TeamApprovalSettings />
    </PageShell>
  );
}
