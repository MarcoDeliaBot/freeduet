import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { copilotkitTelemetryDisabled } from "../src/freeduet/copilotkit-telemetry";
import { selfHostBannerOptions } from "../src/freeduet/no-promotions";
import { telemetryOffWithoutIntelligence } from "../src/freeduet/telemetry-off";
import {
  createSelfHostBanner,
  type RuntimeEntitlementResponse,
} from "../src/self-host-banner";
import { loadTenantPackage } from "../src/tenant-package";
import { testEnvironment } from "./support/environment";

// The onboarding caption says what is true about CopilotKit's usage events, from this answer.
const FREEDUET = await loadTenantPackage(
  resolve(import.meta.dir, "../../examples/freeduet"),
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

/**
 * `/api/capabilities` for an environment that has been through the boot order: telemetry-off runs
 * first, as index.ts runs it before the configuration is read.
 */
async function capabilitiesAfterBoot(
  environment: Record<string, string | undefined>,
) {
  telemetryOffWithoutIntelligence(environment);
  const config = loadConfig(testEnvironment(environment));
  const banner = createSelfHostBanner({
    ...selfHostBannerOptions(config.selfHostBanner, FREEDUET, environment),
    entitlements: async () => free,
  });
  const args: unknown[] = new Array(createApp.length).fill(undefined);
  args[0] = config;
  // The banner is createApp's 36th parameter (see freeduet-no-promotions.test.ts).
  args[35] = banner;
  const app = (
    createApp as (...input: unknown[]) => ReturnType<typeof createApp>
  )(...args);
  return (await (await app.request("/api/capabilities")).json()) as Record<
    string,
    unknown
  >;
}

describe("CopilotKit's usage events, by the SDK's own rule", () => {
  // isTelemetryDisabled, @copilotkit/shared 1.77.0: exactly "true" or "1", in either variable.
  test.each([
    ["nothing set", {}, false],
    [
      "COPILOTKIT_TELEMETRY_DISABLED=true",
      { COPILOTKIT_TELEMETRY_DISABLED: "true" },
      true,
    ],
    [
      "COPILOTKIT_TELEMETRY_DISABLED=1",
      { COPILOTKIT_TELEMETRY_DISABLED: "1" },
      true,
    ],
    [
      "COPILOTKIT_TELEMETRY_DISABLED=false, chosen",
      { COPILOTKIT_TELEMETRY_DISABLED: "false" },
      false,
    ],
    [
      "COPILOTKIT_TELEMETRY_DISABLED=0",
      { COPILOTKIT_TELEMETRY_DISABLED: "0" },
      false,
    ],
    [
      "COPILOTKIT_TELEMETRY_DISABLED=TRUE, not folded",
      { COPILOTKIT_TELEMETRY_DISABLED: "TRUE" },
      false,
    ],
    [
      "COPILOTKIT_TELEMETRY_DISABLED with spaces, not trimmed",
      { COPILOTKIT_TELEMETRY_DISABLED: " true " },
      false,
    ],
    ["DO_NOT_TRACK=1", { DO_NOT_TRACK: "1" }, true],
    ["DO_NOT_TRACK=true", { DO_NOT_TRACK: "true" }, true],
    ["DO_NOT_TRACK=0", { DO_NOT_TRACK: "0" }, false],
  ] as const)("%s", (_, set, expected) => {
    const environment: Record<string, string | undefined> = { ...set };
    expect(copilotkitTelemetryDisabled(environment)).toBe(expected);
  });
});

describe("/api/capabilities says so only when CopilotKit's usage events are off", () => {
  test("the switch off with nothing chosen, the install's default: the answer says it", async () => {
    const body = await capabilitiesAfterBoot({ FREEDUET_INTELLIGENCE: "off" });
    expect(body.copilotkitTelemetryDisabled).toBe(true);
  });

  test("the switch off with the example's line: the same answer", async () => {
    const body = await capabilitiesAfterBoot({
      FREEDUET_INTELLIGENCE: "off",
      COPILOTKIT_TELEMETRY_DISABLED: "true",
    });
    expect(body.copilotkitTelemetryDisabled).toBe(true);
  });

  test("the switch off but false chosen: no key, because the SDK keeps usage events on", async () => {
    const body = await capabilitiesAfterBoot({
      FREEDUET_INTELLIGENCE: "off",
      COPILOTKIT_TELEMETRY_DISABLED: "false",
    });
    expect("copilotkitTelemetryDisabled" in body).toBe(false);
  });

  test("the switch on: no key, upstream's answer", async () => {
    const body = await capabilitiesAfterBoot({ FREEDUET_INTELLIGENCE: "on" });
    expect("copilotkitTelemetryDisabled" in body).toBe(false);
  });
});
