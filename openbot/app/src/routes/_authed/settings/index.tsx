import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import React from "react";
import { BotsNavBadge } from "@/components/bot-profile/attention";
import { DuetIcon } from "@/components/duet/icons";
import { Row, Segmented } from "@/components/duet/kit";
import {
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { PairDevicesSection } from "@/components/settings/pair-devices";
import { ReadAloudSetting } from "@/components/settings/read-aloud-setting";
import { StandingInstructions } from "@/components/settings/standing-instructions";
import { useTheme } from "@/components/theme-provider";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import {
  SettingsDirectory,
  type SettingsPlace,
} from "@/freeduet/settings-directory";
import { WorkspaceShell, WorkspaceTabs } from "@/freeduet/workspace";
import { isFreeDuetApp } from "@/freeduet/manage-group";
import { FreeDuetAbout } from "@/freeduet/about-section";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { appConfig } from "@/lib/generated/application-config";
import { formatHotkey, HOTKEYS } from "@/lib/hotkeys/hotkeys";
import type { ThemePreference } from "@/lib/theme";

export const Route = createFileRoute("/_authed/settings/")({
  component: RouteComponent,
});

const APPEARANCE: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Match phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Every place a person sets something up, one row each, in the order they reach for them. The first
 * six are the pages the sidebar's Manage group and the short menu no longer draw in FreeDuet's package
 * (D133), so these rows carry them: Bots to Approval rules, then Engines for an administrator.
 */
export const SETTINGS_PLACES: readonly SettingsPlace[] = [
  {
    label: "Bots",
    icon: "bolt",
    to: "/bots",
    group: "featured",
    detail: "Meet your team and manage each Bot.",
    badge: <BotsNavBadge />,
  },
  {
    label: "Connections",
    icon: "plug",
    to: "/connections",
    group: "featured",
    color: "aqua",
    detail: "Manage accounts, apps and mail rules.",
  },
  {
    label: "Capabilities",
    icon: "box",
    to: "/capabilities",
    group: "operations",
  },
  { label: "Routines", icon: "repeat", to: "/routines", group: "operations" },
  {
    label: "Approval rules",
    icon: "shieldCheck",
    to: "/settings/approvals",
    group: "operations",
  },
  {
    label: "Engines",
    icon: "wrench",
    to: "/admin/engines",
    group: "featured",
    color: "blue",
    adminOnly: true,
    detail: "Set up models and choose who uses them.",
  },
  {
    label: "Notifications",
    icon: "bell",
    to: "/settings/notifications",
    group: "account",
  },
  {
    label: "Passwords",
    icon: "key",
    to: "/settings/passwords",
    group: "account",
  },
  {
    label: "Admin",
    icon: "shieldLock",
    to: "/admin",
    group: "account",
    adminOnly: true,
  },
];

function RouteComponent() {
  const { preference, setPreference } = useTheme();
  const { data: user } = useQuery(currentUserQueryOptions());
  const product = appConfig.brand.productName;

  const places = SETTINGS_PLACES.filter(
    (place) => !place.adminOnly || user?.role === "admin",
  );
  const appearanceAndVoice = (
    <>
      <PageSection title="Appearance">
        <div className="mt-3">
          <Segmented
            label="Appearance"
            onChange={setPreference}
            options={APPEARANCE}
            value={preference}
          />
        </div>
      </PageSection>
      <PageSection title="Voice">
        <ReadAloudSetting />
      </PageSection>
    </>
  );
  const devicesAndInfo = (
    <>
      {/* D49: pair a phone or another browser with the computer. Draws nothing where there is no pairing. */}
      <PairDevicesSection />
      {/*
       * Only where there is a keyboard. Drawn from the same registry the listeners match against, so
       * this list is what the keys actually do. Read-only: they are not rebindable.
       */}
      <PageSection className="hidden md:block" title="Keyboard shortcuts">
        <PageRows>
          {HOTKEYS.map((hotkey, index) => (
            <React.Fragment key={hotkey.id}>
              <Item size="sm">
                <ItemContent>
                  <ItemTitle>{hotkey.label}</ItemTitle>
                  <ItemDescription>{hotkey.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="flex gap-1">
                    {formatHotkey(hotkey.combo).map((part) => (
                      <kbd
                        className="rounded-md border bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground"
                        key={part}
                      >
                        {part}
                      </kbd>
                    ))}
                  </span>
                </ItemActions>
              </Item>
              {index !== HOTKEYS.length - 1 && <Separator />}
            </React.Fragment>
          ))}
        </PageRows>
      </PageSection>
      <FreeDuetAbout />
    </>
  );
  if (isFreeDuetApp()) {
    return (
      <WorkspaceShell
        title="Settings"
        icon="iris"
        description="Manage your team, connected accounts and personal preferences."
      >
        <WorkspaceTabs
          label="Settings sections"
          views={[
            {
              id: "workspace",
              label: "Workspace",
              icon: "dashboard",
              content: <SettingsDirectory places={places} />,
            },
            {
              id: "preferences",
              label: "Preferences",
              icon: "settings",
              content: (
                <div className="fd-preferences">
                  {appearanceAndVoice}
                  <StandingInstructions />
                </div>
              ),
            },
            {
              id: "devices",
              label: "Devices & info",
              icon: "phone",
              content: <div className="fd-facts">{devicesAndInfo}</div>,
            },
          ]}
        />
      </WorkspaceShell>
    );
  }
  return (
    <PageShell
      description={`How ${product} looks and works for you.`}
      title="Settings"
    >
      {appearanceAndVoice}
      <nav aria-label="Settings" className="mt-8 flex flex-col gap-0.5">
        {places.map((place) => (
          <Row
            chevron
            key={place.label}
            leading={<DuetIcon name={place.icon} size={22} />}
            trailing={place.badge}
            link={({ className, children }) => (
              <Link className={className} to={place.to}>
                {children}
              </Link>
            )}
            size="nav"
            title={place.label}
          />
        ))}
      </nav>
      <StandingInstructions />
      {devicesAndInfo}
    </PageShell>
  );
}
