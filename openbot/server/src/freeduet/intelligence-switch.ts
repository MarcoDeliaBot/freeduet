/**
 * FREEDUET_INTELLIGENCE: whether conversations live in CopilotKit Intelligence or in FreeDuet's own
 * Postgres (issue #42).
 *
 * THREE ANSWERS, ONE OF THEM UPSTREAM'S. `off` runs without Intelligence. `on` is upstream OpenBot,
 * which refuses to start without its three settings. Unset is also upstream OpenBot, exactly, so
 * every upstream test keeps describing the code it was written for. FreeDuet's own `.env.example`
 * and `scripts/start.sh` write `off`, which is what makes off the default for a FreeDuet install
 * without changing what an unconfigured upstream deployment does.
 *
 * ANYTHING ELSE IS REFUSED. A typo such as `of` or `false` would otherwise fall through to upstream
 * and stop the server with a message about Intelligence keys the person meant to do without.
 *
 * Kept apart from `backend.ts` because config.ts imports it, and config.ts must not pull the
 * CopilotKit runtime into everything that reads the configuration.
 */
import type { RuntimeCapabilities } from "../config";

export const INTELLIGENCE_SWITCH = "FREEDUET_INTELLIGENCE";

/**
 * The Intelligence credentials. With the switch off they are read by nothing, and the boot warning
 * names the ones that are set so nobody believes they are in use. Not the two addresses:
 * `.env.example` ships them filled in with the managed service, and a warning on every clean start
 * would teach people to ignore it.
 */
const INTELLIGENCE_VARIABLES = [
  "INTELLIGENCE_API_KEY",
  "COPILOTKIT_LICENSE_TOKEN",
  "INTELLIGENCE_SERVICE_TOKEN",
  "INTELLIGENCE_PROJECT_ID",
  "CPK_INTELLIGENCE_LEARNING_CONTAINER_ID",
] as const;

export type LocalRuntime = Extract<RuntimeCapabilities, { mode: "local" }>;

/**
 * The local runtime when the switch is off, or undefined for upstream's Intelligence contract.
 * Throws on a value that is neither on nor off.
 */
export function localRuntimeFrom(
  environment: Record<string, string | undefined>,
): LocalRuntime | undefined {
  const value = environment[INTELLIGENCE_SWITCH]?.trim().toLowerCase();
  if (!value || value === "on") return undefined;
  if (value !== "off")
    throw new Error(
      `${INTELLIGENCE_SWITCH} must be "on" or "off", not "${environment[INTELLIGENCE_SWITCH]}".`,
    );
  return {
    mode: "local",
    durableHistory: true,
    ignoredIntelligenceVariables: INTELLIGENCE_VARIABLES.filter(
      (name) => (environment[name]?.trim() ?? "") !== "",
    ),
  };
}
