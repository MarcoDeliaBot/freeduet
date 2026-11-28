import { Link, type LinkOptions } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DuetIcon, type DuetIconName } from "@/components/duet/icons";
import "./light/tokens.css";
import "./settings-home.css";
import type { MessageId } from "./i18n/catalogs";
import { useT } from "./i18n/provider";

/** One row of the settings home: a link to a page that already exists. Nothing here changes a setting. */
export type SettingsHomeItem = {
  label: string;
  detail: string;
  icon: DuetIconName;
  to: LinkOptions["to"];
  adminOnly?: boolean;
  badge?: ReactNode;
};

export type SettingsHomeGroup = {
  id: "team" | "connections" | "security" | "jobs" | "system";
  title: string;
  items: readonly SettingsHomeItem[];
};

/**
 * The groups of the approved design (D154), each row a link to the page that holds the setting. Every
 * route is an existing one: a control stays on its own guarded page (approval rules and Full access
 * on `/settings/approvals`, credentials under `/admin`).
 */
export const SETTINGS_HOME_GROUPS: readonly SettingsHomeGroup[] = [
  {
    id: "team",
    title: "Team",
    items: [
      {
        label: "Bots",
        detail: "Meet your team and manage each Bot.",
        icon: "bolt",
        to: "/bots",
      },
      {
        label: "Capabilities",
        detail: "Skills and memory.",
        icon: "box",
        to: "/capabilities",
      },
    ],
  },
  {
    id: "connections",
    title: "Connections",
    items: [
      {
        label: "Accounts, apps and mail rules",
        detail: "Connect an account, an app or your mail.",
        icon: "plug",
        to: "/connections",
      },
      {
        label: "Setup checklist",
        detail: "See what is set up and what is left.",
        icon: "check",
        to: "/settings/setup",
      },
    ],
  },
  {
    id: "security",
    title: "Safety",
    items: [
      {
        label: "Approval rules and Full access",
        detail: "What a Bot may do without asking you.",
        icon: "shieldCheck",
        to: "/settings/approvals",
      },
      {
        label: "Passwords",
        detail: "Passwords your team may use.",
        icon: "key",
        to: "/settings/passwords",
      },
    ],
  },
  {
    id: "jobs",
    title: "Jobs",
    items: [
      {
        label: "Routines",
        detail: "Work that repeats on its own, and the week view.",
        icon: "repeat",
        to: "/routines",
      },
      {
        label: "Notifications",
        detail: "Where updates reach you.",
        icon: "bell",
        to: "/settings/notifications",
      },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      {
        label: "Admin",
        detail: "Computers, credentials, boundaries, people and audit.",
        icon: "shieldLock",
        to: "/admin",
        adminOnly: true,
      },
    ],
  },
];

/** Engines is one click from here and from the dashboard (D154). */
export const ENGINES_ITEM: SettingsHomeItem = {
  label: "Engines",
  detail:
    "Who answers for each Bot, in which order, and how much they used today. Your subscription stays first until you change the order.",
  icon: "wrench",
  to: "/admin/engines",
  adminOnly: true,
};

/** The ids of each row's words in the app's message catalogues (D181), by route; the literals above stay the English. */
const HOME_TEXT: Record<string, { label: MessageId; detail: MessageId }> = {
  "/bots": { label: "nav.bots", detail: "home.bots" },
  "/capabilities": { label: "nav.capabilities", detail: "home.capabilities" },
  "/connections": {
    label: "home.connectionsLabel",
    detail: "home.connections",
  },
  "/settings/setup": { label: "home.setupLabel", detail: "home.setup" },
  "/settings/approvals": {
    label: "home.approvalsLabel",
    detail: "home.approvals",
  },
  "/settings/passwords": {
    label: "home.passwordsLabel",
    detail: "home.passwords",
  },
  "/routines": { label: "nav.routines", detail: "home.routines" },
  "/settings/notifications": {
    label: "profile.notifications",
    detail: "home.notifications",
  },
  "/admin": { label: "nav.admin", detail: "home.admin" },
  "/admin/engines": { label: "dash.engines", detail: "home.engines" },
};

const GROUP_TITLE: Record<SettingsHomeGroup["id"], MessageId> = {
  team: "dash.team",
  connections: "nav.connections",
  security: "home.safety",
  jobs: "home.jobs",
  system: "home.system",
};

export function SettingsHome({
  isAdmin,
  badges = {},
}: {
  isAdmin: boolean;
  /** A badge per route, such as the unread count on Bots. */
  badges?: Partial<Record<string, ReactNode>>;
}) {
  const t = useT();
  const labelOf = (item: SettingsHomeItem) => {
    const text = HOME_TEXT[item.to as string];
    return text ? t(text.label) : item.label;
  };
  const detailOf = (item: SettingsHomeItem) => {
    const text = HOME_TEXT[item.to as string];
    return text ? t(text.detail) : item.detail;
  };
  const groups = SETTINGS_HOME_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);
  return (
    <nav aria-label={t("nav.settings")} className="fdh">
      {isAdmin && (
        <Link
          to={ENGINES_ITEM.to}
          className="fdh-engines"
          data-testid="settings-engines"
        >
          <span className="fdh-icon">
            <DuetIcon name={ENGINES_ITEM.icon} size={22} />
          </span>
          <span className="fdh-engines-copy">
            <strong>{labelOf(ENGINES_ITEM)}</strong>
            <small>{detailOf(ENGINES_ITEM)}</small>
          </span>
          <DuetIcon name="chevronRight" size={16} />
        </Link>
      )}
      <div className="fdh-groups">
        {groups.map((group) => (
          <section
            key={group.id}
            className="fdh-group"
            aria-labelledby={`fdh-${group.id}`}
            data-group={group.id}
          >
            <h2 id={`fdh-${group.id}`} className="fdh-title">
              {t(GROUP_TITLE[group.id])}
            </h2>
            {group.items.map((item) => (
              <Link key={item.to} to={item.to} className="fdh-row">
                <span className="fdh-icon">
                  <DuetIcon name={item.icon} size={18} />
                </span>
                <span className="fdh-row-copy">
                  <b>
                    {labelOf(item)}
                    {badges[item.to as string]}
                  </b>
                  <small>{detailOf(item)}</small>
                </span>
                <DuetIcon name="chevronRight" size={15} />
              </Link>
            ))}
          </section>
        ))}
      </div>
    </nav>
  );
}
