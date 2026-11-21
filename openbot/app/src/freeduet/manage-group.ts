import { appConfig } from "@/lib/generated/application-config";

/** The tenant id of FreeDuet's own package (`examples/freeduet/brand.yaml`). Same as the server's. */
export const FREEDUET_APP_TENANT_ID = "freeduet";

/**
 * Whether the sidebar draws its Manage group. FreeDuet's own package hides it: every page in the
 * group is one row in Settings, so nothing is lost. Any other package keeps it, as upstream has it.
 */
export function showsManageGroup(
  tenantId: string = appConfig.brand.tenantId,
): boolean {
  return tenantId !== FREEDUET_APP_TENANT_ID;
}

/**
 * Whether the app is FreeDuet's own package: the rows of the Bots and Connections lists carry a
 * button of their own (Message, Connect) there, and nowhere else (D129).
 */
export function isFreeDuetApp(
  tenantId: string = appConfig.brand.tenantId,
): boolean {
  return !showsManageGroup(tenantId);
}

/** One page the menu lists at its top level for FreeDuet's package (D129). */
export type FlatMenuEntry = {
  label: string;
  to:
    | "/bots"
    | "/connections"
    | "/routines"
    | "/settings/approvals"
    | "/admin/engines";
  icon: "bolt" | "plug" | "repeat" | "shieldCheck" | "wrench";
  /** Only an administrator is offered it: the page itself refuses anybody else. */
  adminOnly?: boolean;
  /** The Bots entry carries the unread badge that Manage and then Settings used to carry. */
  badge?: "bots";
};

/** The pages that sat behind Menu, Manage (and Admin, Engines): each is now one click from the menu. */
export const FLAT_MENU_ENTRIES: readonly FlatMenuEntry[] = [
  { label: "Bots", to: "/bots", icon: "bolt", badge: "bots" },
  { label: "Connections", to: "/connections", icon: "plug" },
  { label: "Routines", to: "/routines", icon: "repeat" },
  { label: "Approval rules", to: "/settings/approvals", icon: "shieldCheck" },
  { label: "Engines", to: "/admin/engines", icon: "wrench", adminOnly: true },
];

/**
 * The entries the menu draws at its top level. FreeDuet's own package gets them (D129, "three clicks
 * at most", D125); any other package gets none, and keeps its Manage group as upstream has it.
 */
export function flatMenuEntries(
  isAdmin: boolean,
  tenantId: string = appConfig.brand.tenantId,
): FlatMenuEntry[] {
  if (!isFreeDuetApp(tenantId)) return [];
  return FLAT_MENU_ENTRIES.filter((entry) => !entry.adminOnly || isAdmin);
}
