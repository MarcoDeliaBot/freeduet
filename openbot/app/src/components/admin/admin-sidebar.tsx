import {
  IconArrowLeft,
  IconBuildingBank,
  IconChecks,
  IconCode,
  IconDeviceDesktop,
  IconFileText,
  IconKey,
  IconLayoutGrid,
  IconListDetails,
  IconPuzzle,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import type * as React from "react";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const appLinkOptions = { to: "/" } satisfies LinkOptions;
const adminLinkOptions = { to: "/admin" } satisfies LinkOptions;

/**
 * The same four groups, in the same order, as the admin index.
 *
 * A rail that lists ten things flat asks somebody to know which of them is the one they want. The
 * grouping is the only navigation help this screen offers, so it has to agree with the page it
 * navigates to — two different orderings of the same ten links is worse than either ordering.
 */
const GROUPS: {
  label: MessageId;
  items: {
    icon: React.ComponentType<{ className?: string }>;
    linkOptions: LinkOptions;
    title: MessageId;
  }[];
}[] = [
  {
    label: "admin.nav.reach",
    items: [
      {
        title: "admin.nav.credentials",
        icon: IconKey,
        linkOptions: { to: "/admin/credentials" },
      },
      {
        title: "admin.nav.boundaries",
        icon: IconShieldCheck,
        linkOptions: { to: "/admin/boundaries" },
      },
      {
        title: "admin.nav.approvals",
        icon: IconChecks,
        linkOptions: { to: "/admin/approvals" },
      },
      {
        title: "admin.nav.computers",
        icon: IconDeviceDesktop,
        linkOptions: { to: "/admin/computers" },
      },
    ],
  },
  {
    label: "admin.nav.do",
    items: [
      {
        title: "admin.nav.plugins",
        icon: IconPuzzle,
        linkOptions: { to: "/admin/plugins" },
      },
      {
        title: "admin.nav.skills",
        icon: IconFileText,
        linkOptions: { to: "/admin/skills" },
      },
      {
        title: "admin.nav.learning",
        icon: IconFileText,
        linkOptions: { to: "/admin/learning" },
      },
      {
        title: "admin.nav.components",
        icon: IconLayoutGrid,
        linkOptions: { to: "/admin/components" },
      },
      {
        title: "admin.nav.playground",
        icon: IconCode,
        linkOptions: { to: "/admin/playground" },
      },
    ],
  },
  {
    label: "admin.nav.in",
    items: [
      {
        title: "admin.nav.people",
        icon: IconUsers,
        linkOptions: { to: "/admin/people" },
      },
      {
        title: "admin.nav.idp",
        icon: IconBuildingBank,
        linkOptions: { to: "/admin/identity-providers" },
      },
    ],
  },
  {
    label: "admin.nav.happened",
    items: [
      {
        title: "admin.nav.audit",
        icon: IconListDetails,
        linkOptions: { to: "/admin/audit" },
      },
    ],
  },
];

export function AdminSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { t } = useAppLanguage();
  return (
    <Sidebar {...props}>
      {/*
       * Pinned to the same height as the app sidebar's header. Left to itself this one is 60px
       * against the app's 45px — `p-2` around a `size="lg"` button rather than a fixed height — so
       * the nav list started lower here and the sidebar appeared to shift on the way into Admin.
       *
       * The button takes its default height rather than `h-full`. `h-full` resolves against the
       * parent, which in the app sidebar is a flex row holding a second control and here is not, so
       * the same class produces two different heights.
       */}
      <SidebarHeader className="h-12 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={(props) => (
                <Link {...appLinkOptions} {...props}>
                  <IconArrowLeft className="mr-2 h-4 w-4" />
                  {t("admin.nav.back")}
                </Link>
              )}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              {/*
               * `activeOptions.exact`, because /admin is a prefix of every other route here and
               * would otherwise light up on all of them.
               */}
              <SidebarMenuButton
                render={(props) => (
                  <Link
                    {...adminLinkOptions}
                    activeOptions={{ exact: true }}
                    activeProps={{ className: "bg-foreground/5" }}
                    {...props}
                  >
                    {t("admin.nav.overview")}
                  </Link>
                )}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
            <SidebarMenu className="gap-px">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={(props) => (
                      <Link
                        {...item.linkOptions}
                        activeProps={{ className: "bg-foreground/5" }}
                        {...props}
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {t(item.title)}
                      </Link>
                    )}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
