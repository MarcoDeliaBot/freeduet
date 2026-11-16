/**
 * D51: FreeDuet advertises nobody.
 *
 * With FreeDuet's own package loaded, the app shows no promotional call to action for any company or
 * product: the bar offering help self-hosting is off, and onboarding leaves out the slide that sends
 * the person to another company's products and sales contact. Credit to the upstream authors (the
 * About page, NOTICE.md) is not advertising and is untouched.
 *
 * An operator who writes `OPENBOT_SELF_HOST_BANNER=true` (or `1`) keeps the upstream behaviour, so
 * the choice stays theirs. Any other package is upstream's, exactly: nothing here acts on it.
 * Unset is "not asked", so it does not count as that choice.
 */
import type { TenantPackage } from "../tenant-package";
import { isFreeDuetPackage } from "./hub-grants";

/** Whether the operator wrote the banner switch on, in so many words. */
function bannerSwitchedOn(
  environment: Record<string, string | undefined>,
): boolean {
  const value = environment.OPENBOT_SELF_HOST_BANNER?.trim().toLowerCase();
  return value === "true" || value === "1";
}

/** False when this deployment must show no promotion: the package is FreeDuet's and nobody asked for one. */
export function promotionsAllowed(
  tenantPackage: Pick<TenantPackage, "tenantId">,
  environment: Record<string, string | undefined>,
): boolean {
  if (!isFreeDuetPackage(tenantPackage)) return true;
  return bannerSwitchedOn(environment);
}

/** What index.ts hands `createSelfHostBanner`: the operator's switch, then FreeDuet's rule on top of it. */
export function selfHostBannerOptions(
  configured: boolean,
  tenantPackage: Pick<TenantPackage, "tenantId">,
  environment: Record<string, string | undefined>,
): { enabled: boolean; promotions: boolean } {
  const promotions = promotionsAllowed(tenantPackage, environment);
  return { enabled: configured && promotions, promotions };
}
