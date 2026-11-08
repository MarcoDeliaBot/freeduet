/**
 * With FREEDUET_INTELLIGENCE=off, CopilotKit's telemetry is off too, unless the person turned it on
 * (#42).
 *
 * WHY HERE. Switching Intelligence off promises that nothing is sent to CopilotKit, and the runtime's
 * own telemetry goes to `telemetry.copilotkit.ai` whatever the thread backend is. FreeDuet's
 * `.env.example` sets COPILOTKIT_TELEMETRY_DISABLED=true, but a `.env` written before that line, or
 * by hand, may not have it, and then the promise would quietly not hold.
 *
 * WHY THIS EARLY. CopilotKit reads the variable once, when its telemetry module is first loaded. So
 * index.ts imports this right after `./telemetry` and before anything that imports the runtime.
 *
 * ONLY AN EMPTY VARIABLE IS FILLED IN. Any value the person set, `false` included, is theirs and is
 * left as it is. With the switch unset or `on`, this does nothing: upstream behaviour.
 */
import { INTELLIGENCE_SWITCH } from "./intelligence-switch";

/** Turns telemetry off in `environment` when the switch is off and nobody chose. True when it did. */
export function telemetryOffWithoutIntelligence(
  environment: Record<string, string | undefined>,
): boolean {
  if (environment[INTELLIGENCE_SWITCH]?.trim().toLowerCase() !== "off")
    return false;
  if ((environment.COPILOTKIT_TELEMETRY_DISABLED ?? "").trim() !== "")
    return false;
  environment.COPILOTKIT_TELEMETRY_DISABLED = "true";
  return true;
}

telemetryOffWithoutIntelligence(process.env);
