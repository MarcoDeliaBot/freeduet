/**
 * FREEDUET_INTELLIGENCE: whether conversations live in CopilotKit Intelligence or in FreeDuet's own
 * Postgres (issue #42).
 *
 * TWO ANSWERS, AND A MISSING ONE IS REFUSED (D65). `off` runs without Intelligence. `on` is upstream
 * OpenBot, which refuses to start without its three settings. A switch that is unset, empty or only
 * spaces is no longer a choice made for the person in either direction: it used to fall through to
 * upstream, so a start that did not go through `scripts/start.sh` with the three settings present
 * ran in Intelligence mode (threads and memory kept by the outside service) though nobody wrote
 * `on`. It does not become `off` either: an installation whose conversations are already in
 * Intelligence would then show none of them (the reason `start.sh` writes `on` in that case). The
 * server stops and says which line to write. `scripts/start.sh` and `.env.example` write the line,
 * so an install made with them never meets this.
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
 * What the server says when the switch is missing. Plain words, one sentence for each way out, and
 * the script that writes the line. Pinned by a test with this exact text.
 */
export const INTELLIGENCE_SWITCH_MISSING = `${INTELLIGENCE_SWITCH} is not set. Write ${INTELLIGENCE_SWITCH}=off in your settings file to keep your conversations on this computer, or ${INTELLIGENCE_SWITCH}=on to have them kept by the outside CopilotKit Intelligence service. scripts/start.sh writes it for you.`;

/**
 * The local runtime when the switch is off, or undefined for upstream's Intelligence contract (on).
 * Throws on a missing value (unset, empty, only spaces) and on a value that is neither on nor off.
 * The one definition: the runtime and both Learning readers in config.ts go through it.
 */
export function localRuntimeFrom(
  environment: Record<string, string | undefined>,
): LocalRuntime | undefined {
  const value = environment[INTELLIGENCE_SWITCH]?.trim().toLowerCase();
  if (!value) throw new Error(INTELLIGENCE_SWITCH_MISSING);
  if (value === "on") return undefined;
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
