/**
 * Whether CopilotKit's usage events are off for this process, by the SDK's own rule.
 *
 * `isTelemetryDisabled` in @copilotkit/shared 1.77.0 (dist/telemetry/telemetry-disabled.mjs) answers
 * true only when COPILOTKIT_TELEMETRY_DISABLED or DO_NOT_TRACK is exactly "true" or "1". There is no
 * trimming and no case folding, so "false", "0", "TRUE" and " true " leave telemetry on, as the SDK
 * does. The server cannot import that function, because @copilotkit/shared is not one of its
 * dependencies, so this copies the rule. freeduet-copilotkit-telemetry.test.ts pins the table.
 *
 * Read from the environment the configuration is loaded from. index.ts loads the configuration after
 * `freeduet/telemetry-off` has filled in the variable (with the switch off and nothing chosen), so the
 * answer is the one the SDK gives its own runtime. Onboarding says what is true from this answer.
 */
const DISABLED_VALUES: readonly string[] = ["true", "1"];

export function copilotkitTelemetryDisabled(
  environment: Record<string, string | undefined>,
): boolean {
  return (
    DISABLED_VALUES.includes(environment.COPILOTKIT_TELEMETRY_DISABLED ?? "") ||
    DISABLED_VALUES.includes(environment.DO_NOT_TRACK ?? "")
  );
}
