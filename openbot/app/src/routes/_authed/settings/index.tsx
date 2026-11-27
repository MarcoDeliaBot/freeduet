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
import { FreeDuetAbout } from "@/freeduet/about-section";
import { isFreeDuetApp } from "@/freeduet/manage-group";
import type { SettingsPlace } from "@/freeduet/settings-directory";
import { SettingsHome } from "@/freeduet/settings-home";
import { WorkspaceShell, WorkspaceTabs } from "@/freeduet/workspace";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { appConfig } from "@/lib/generated/application-config";
import { formatHotkey, HOTKEYS } from "@/lib/hotkeys/hotkeys";
import type { ThemePreference } from "@/lib/theme";
import { AppLanguageSetting } from "@/freeduet/i18n/language-setting";
import { type MessageId } from "@/freeduet/i18n/catalogs";
import { useT } from "@/freeduet/i18n/provider";

export const Route = createFileRoute("/_authed/settings/")({
  component: RouteComponent,
});

const APPEARANCE: readonly {
  value: ThemePreference;
  label: string;
  key18n: MessageId;
}[] = [
  { value: "system", label: "Match phone", key18n: "settings.matchPhone" },
  { value: "light", label: "Light", key18n: "settings.light" },
  { value: "dark", label: "Dark", key18n: "settings.dark" },
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
  const t = useT();
  const { preference, setPreference } = useTheme();
  const { data: user } = useQuery(currentUserQueryOptions());
  const product = appConfig.brand.productName;

  const places = SETTINGS_PLACES.filter(
    (place) => !place.adminOnly || user?.role === "admin",
  );
  const appearanceAndVoice = (
    <>
      <PageSection title={t("settings.appearance")}>
        <div className="mt-3">
          <Segmented
            label={t("settings.appearance")}
            onChange={setPreference}
            options={APPEARANCE.map((option) => ({
              value: option.value,
              label: t(option.key18n),
            }))}
            value={preference}
          />
        </div>
      </PageSection>
      <PageSection title={t("settings.voice")}>
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
      <PageSection className="hidden md:block" title={t("settings.shortcuts")}>
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
        title={t("nav.settings")}
        icon="iris"
        description={t("settings.description")}
      >
        <WorkspaceTabs
          label={t("settings.sections")}
          views={[
            {
              id: "workspace",
              label: t("settings.workspace"),
              icon: "dashboard",
              content: (
                <SettingsHome
                  isAdmin={user?.role === "admin"}
                  badges={{ "/bots": <BotsNavBadge /> }}
                />
              ),
            },
            {
              id: "preferences",
              label: t("settings.preferences"),
              icon: "settings",
              content: (
                <div className="fd-preferences">
                  {appearanceAndVoice}
                  <PageSection title={t("language.section")}>
                    <PageRows>
                      <AppLanguageSetting />
                    </PageRows>
                  </PageSection>
                  <StandingInstructions />
                </div>
              ),
            },
            {
              id: "devices",
              label: t("settings.devices"),
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
