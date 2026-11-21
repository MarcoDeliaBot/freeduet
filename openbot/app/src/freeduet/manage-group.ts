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
