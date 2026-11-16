import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DuetIcon } from "@/components/duet/icons";
import { ChatOrb, ChatStep, initialOf } from "@/components/shell/header";
import type { ShellTab } from "@/components/shell/tab-bar";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { appConfig } from "@/lib/generated/application-config";
import { type WideBand, WideProvider } from "./band";
import { MascotSprite } from "./mascot";
import { PinnedApprovalsProvider } from "./pinned";
import { TeamColumn } from "./team-column";

/**
 * The shell's frame at 1024 px and wider (D55): the team column on the left and the screen beside it.
 * Below that it returns its children and nothing else, so the phone and tablet layout is not touched.
 */
export function WideFrame({
  band,
  tab,
  onMenu,
  onNewChannel,
  children,
}: {
  band: WideBand;
  tab: ShellTab | null;
  onMenu: () => void;
  onNewChannel: () => void;
  children: ReactNode;
}) {
  if (band === "off") return <>{children}</>;
  return (
    <WideProvider value={band}>
      <PinnedApprovalsProvider>
        <MascotSprite />
        <div
          className="flex min-h-0 flex-1 overflow-hidden"
          data-wide-frame={band}
        >
          <TeamColumn
            band={band}
            onMenu={onMenu}
            onNewChannel={onNewChannel}
            tab={tab}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </PinnedApprovalsProvider>
    </WideProvider>
  );
}

/**
 * The bar above a tab on a wide screen, in the page's flow (so nothing scrolls under it): the orb
 * that shows what the Bot is doing, with the step in words beside it, and the person's settings.
 */
export function WideTopBar() {
  const { data: user } = useQuery(currentUserQueryOptions());
  return (
    <header className="duet-face flex h-16 shrink-0 items-center gap-3 border-duet-hair border-b bg-duet-surface px-6">
      <Link
        aria-label={`${appConfig.brand.productName} chat`}
        className="grid size-12 shrink-0 place-items-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-accent/50 active:scale-95"
        to="/"
      >
        <ChatOrb size={44} />
      </Link>
      <div className="min-w-0 flex-1">
        <ChatStep />
      </div>
      <Link
        aria-label="Your settings"
        className="duet-glass grid size-11 shrink-0 place-items-center rounded-full text-duet-ink shadow-duet-glass focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-accent/50"
        to="/settings"
      >
        <span className="type-nav font-semibold">
          {user ? initialOf(user) : <DuetIcon name="settings" size={18} />}
        </span>
      </Link>
    </header>
  );
}
