import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import {
  promotionsAllowed,
  selfHostBannerOptions,
} from "../src/freeduet/no-promotions";
import {
  createSelfHostBanner,
  type RuntimeEntitlementResponse,
} from "../src/self-host-banner";
import { loadTenantPackage } from "../src/tenant-package";
import { testEnvironment } from "./support/environment";

// D51: FreeDuet advertises nobody. Unchanged behaviour for any other package is guarded here too.
const FREEDUET = await loadTenantPackage(
  resolve(import.meta.dir, "../../examples/freeduet"),
);
const OTHER = await loadTenantPackage(
  resolve(import.meta.dir, "../../examples/openduet"),
);

const free: RuntimeEntitlementResponse = {
  status: "ready",
  entitlement: {
    active: true,
    source: "managedOrgSubscription",
    features: {},
    limits: {},
    planCode: "free",
  },
};

async function capabilities(
  tenantPackage: typeof FREEDUET,
  environment: Record<string, string | undefined>,
) {
  const config = loadConfig(testEnvironment(environment));
  const banner = createSelfHostBanner({
    ...selfHostBannerOptions(config.selfHostBanner, tenantPackage, environment),
    entitlements: async () => free,
  });
  const args: unknown[] = new Array(createApp.length).fill(undefined);
  args[0] = config;
  // The banner is createApp's 36th parameter (see self-host-banner.test.ts).
  args[35] = banner;
  const app = (
    createApp as (...input: unknown[]) => ReturnType<typeof createApp>
  )(...args);
  return (await (await app.request("/api/capabilities")).json()) as Record<
    string,
    unknown
  >;
}

describe("FreeDuet shows no promotion (D51)", () => {
  test("the banner is off by default for FreeDuet's package, with no environment line", async () => {
    const body = await capabilities(FREEDUET, {});
    expect(body.selfHostBanner).toBe(false);
    expect(body.promotions).toBe(false);
  });

  test("an operator who writes the banner on keeps it, and onboarding keeps its slide", async () => {
    for (const value of ["true", "1", " TRUE "]) {
      const body = await capabilities(FREEDUET, {
        OPENBOT_SELF_HOST_BANNER: value,
      });
      expect(body.selfHostBanner).toBe(true);
      expect(body.promotions).toBeUndefined();
    }
  });

  test("an operator who writes it off still gets it off", async () => {
    const body = await capabilities(FREEDUET, {
      OPENBOT_SELF_HOST_BANNER: "false",
    });
    expect(body.selfHostBanner).toBe(false);
  });

  test("another package is upstream's exactly: banner on, no new key", async () => {
    const body = await capabilities(OTHER, {});
    expect(body.selfHostBanner).toBe(true);
    expect("promotions" in body).toBe(false);
  });

  test("another package with the banner written off is still off", async () => {
    const body = await capabilities(OTHER, { OPENBOT_SELF_HOST_BANNER: "0" });
    expect(body.selfHostBanner).toBe(false);
  });

  test("the rule itself", () => {
    expect(promotionsAllowed(FREEDUET, {})).toBe(false);
    expect(
      promotionsAllowed(FREEDUET, { OPENBOT_SELF_HOST_BANNER: "yes" }),
    ).toBe(false);
    expect(promotionsAllowed(OTHER, {})).toBe(true);
  });
});
