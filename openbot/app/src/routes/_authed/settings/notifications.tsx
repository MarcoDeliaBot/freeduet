import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { ChatChangesSection } from "@/components/settings/chat-changes";
import { NativeDevices, RecentDeliveries } from "@/components/settings/devices";
import { UpdateRoutingSection } from "@/components/settings/update-routing";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/settings/notifications")({
  component: NotificationsPage,
});

/** Where your Bots' updates reach you, for all of your Bots at once. Each Bot's own page says how much. */
function NotificationsPage() {
  const t = useT();
  return (
    <PageShell
      description={t("settings.notificationsPage")}
      title={t("profile.notifications")}
    >
      <UpdateRoutingSection />
      <NativeDevices />
      <RecentDeliveries />
      {/* Settings in chat: what a Bot changed from chat, with Undo where it still works (docs/design/settings-in-chat.md). */}
      <ChatChangesSection />
    </PageShell>
  );
}
