import {
  IconBuildingBank,
  IconChecks,
  IconChevronRight,
  IconCode,
  IconCpu,
  IconDeviceDesktop,
  IconFileText,
  IconKey,
  IconLayoutGrid,
  IconListDetails,
  IconPuzzle,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import {
  createFileRoute,
  Link,
  type LinkOptions,
} from "@tanstack/react-router";
import {
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { StaggerItem } from "@/components/layout/stagger";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { isFreeDuetApp } from "@/freeduet/manage-group";
import { WorkspaceShell } from "@/freeduet/workspace";
import { appConfig } from "@/lib/generated/application-config";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import type { MessageId } from "@/freeduet/i18n/catalogs";

export const Route = createFileRoute("/_authed/admin/")({
  component: RouteComponent,
});

/**
 * Grouped by what the decision is about rather than by how the code is organised.
 *
 * "What Bots can reach" is the group an administrator arrives worrying about, so it goes first.
 * Everything in it either grants a capability or fences one in.
 */
const SECTIONS: {
  title: MessageId;
  description: MessageId | "";
  items: {
    description: MessageId;
    icon: React.ComponentType<{ className?: string }>;
    linkOptions: LinkOptions;
    title: MessageId;
  }[];
}[] = [
  {
    title: "admin.nav.reach",
    description: "admin.home.reach.desc",
    items: [
      {
        title: "admin.nav.credentials",
        description: "admin.home.credentials.desc",
        icon: IconKey,
        linkOptions: { to: "/admin/credentials" },
      },
      {
        title: "admin.nav.boundaries",
        description: "admin.home.boundaries.desc",
        icon: IconShieldCheck,
        linkOptions: { to: "/admin/boundaries" },
      },
      {
        title: "admin.nav.approvals",
        description: "admin.home.approvals.desc",
        icon: IconChecks,
        linkOptions: { to: "/admin/approvals" },
      },
      {
        title: "admin.nav.computers",
        description: "admin.home.computers.desc",
        icon: IconDeviceDesktop,
        linkOptions: { to: "/admin/computers" },
      },
    ],
  },
  {
    title: "admin.nav.do",
    description: "admin.home.do.desc",
    items: [
      {
        title: "admin.nav.plugins",
        description: "admin.home.plugins.desc",
        icon: IconPuzzle,
        linkOptions: { to: "/admin/plugins" },
      },
      {
        title: "admin.nav.skills",
        description: "admin.home.skills.desc",
        icon: IconFileText,
        linkOptions: { to: "/admin/skills" },
      },
      {
        title: "admin.nav.learning",
        description: "admin.home.learning.desc",
        icon: IconFileText,
        linkOptions: { to: "/admin/learning" },
      },
      {
        title: "admin.nav.components",
        description: "admin.home.components.desc",
        icon: IconLayoutGrid,
        linkOptions: { to: "/admin/components" },
      },
      {
        title: "admin.nav.playground",
        description: "admin.home.playground.desc",
        icon: IconCode,
        linkOptions: { to: "/admin/playground" },
      },
      {
        title: "dash.engines",
        description: "admin.home.engines.desc",
        icon: IconCpu,
        linkOptions: { to: "/admin/engines" },
      },
    ],
  },
  {
    title: "admin.nav.in",
    description: "",
    items: [
      {
        title: "admin.nav.people",
        description: "admin.home.people.desc",
        icon: IconUsers,
        linkOptions: { to: "/admin/people" },
      },
      {
        title: "admin.enterprise.title",
        description: "admin.home.enterprise.desc",
        icon: IconShieldCheck,
        linkOptions: { to: "/admin/enterprise" },
      },
      {
        title: "admin.nav.idp",
        description: "admin.home.idp.desc",
        icon: IconBuildingBank,
        linkOptions: { to: "/admin/identity-providers" },
      },
    ],
  },
  {
    title: "admin.nav.happened",
    description: "",
    items: [
      {
        title: "admin.nav.audit",
        description: "admin.home.audit.desc",
        icon: IconListDetails,
        linkOptions: { to: "/admin/audit" },
      },
    ],
  },
];

function RouteComponent() {
  const { t } = useAppLanguage();
  const product = appConfig.brand.productName;
  const workspace = isFreeDuetApp();
  const description = t("admin.home.description");
  const sections = (
    <>
      {SECTIONS.map((section) => (
        <PageSection
          description={
            section.description
              ? t(section.description, { product })
              : undefined
          }
          key={section.title}
          title={t(section.title)}
        >
          <PageRows>
            {section.items.map((item, index) => (
              <StaggerItem index={index} key={item.title}>
                {/*
                 * The whole row is the link, not a chevron somebody has to aim at: every row here
                 * goes exactly one place, so there is nothing else the row could mean.
                 */}
                <Item
                  render={(props) => <Link {...item.linkOptions} {...props} />}
                  size="sm"
                >
                  <ItemMedia>
                    <item.icon className="size-4 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t(item.title)}</ItemTitle>
                    <ItemDescription>
                      {t(item.description, { product })}
                    </ItemDescription>
                  </ItemContent>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Item>
                {index !== section.items.length - 1 && <Separator />}
              </StaggerItem>
            ))}
          </PageRows>
        </PageSection>
      ))}
    </>
  );
  return workspace ? (
    <WorkspaceShell
      title={t("nav.admin")}
      icon="shieldLock"
      description={description}
    >
      <div className="fd-admin-grid">{sections}</div>
    </WorkspaceShell>
  ) : (
    <PageShell title={t("nav.admin")} description={description}>
      {sections}
    </PageShell>
  );
}
