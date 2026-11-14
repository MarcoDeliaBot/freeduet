import { computerTokenFor } from "./computer-token";
import { NAMESPACE } from "./names";

/**
 * What a computer is told about itself.
 *
 * Kept separate from the HTTP server so the exact environment boundary is testable without
 * starting a listener or connecting to Docker. Nothing here is caller-supplied: a request says
 * which Bot, never what to run or what to set.
 *
 * The token is this Bot's own, derived from `SUPERVISOR_TOKEN` (computer-token.ts). The deployment's
 * `COMPUTER_TOKEN` is not read here and goes into no computer: it belongs to the one computer a
 * deployment runs without this supervisor, and a copy inside a Bot's computer is a copy inside the
 * one place whose shell can read it. `SUPERVISOR_TOKEN` itself never goes in either, because it is
 * what every Bot's token is made from.
 *
 * With no `SUPERVISOR_TOKEN` this throws. `index.ts` does not start without one, so it is a state only
 * a caller outside this process can reach, and a computer made without a token refuses to start.
 */
export function environmentFor(
  botId: string,
  env: Record<string, string | undefined> = process.env,
  namespace: string = NAMESPACE,
): string[] {
  const passthrough = Object.entries(env).filter(([key]) =>
    key.startsWith("EGRESS_PROXY"),
  );
  const derivationKey = env.SUPERVISOR_TOKEN?.trim();
  if (!derivationKey) {
    throw new Error(
      "SUPERVISOR_TOKEN is not set, so there is nothing to make this computer's own token from.",
    );
  }
  const computerToken = computerTokenFor(derivationKey, namespace, botId);
  const spireSocketVolume = env.SPIRE_AGENT_SOCKET_VOLUME;
  // Fail fast here rather than forwarding an invalid mode that crashes the child at
  // `browserModeFromEnv`: whitespace-only is falsy after trim, anything else must be headless
  // or headed.
  const rawBrowserMode = env.COMPUTER_BROWSER_MODE?.trim() || undefined;
  if (
    rawBrowserMode !== undefined &&
    rawBrowserMode !== "headless" &&
    rawBrowserMode !== "headed"
  ) {
    throw new Error(
      `COMPUTER_BROWSER_MODE must be headless or headed, not ${JSON.stringify(env.COMPUTER_BROWSER_MODE)}.`,
    );
  }
  const browserMode = rawBrowserMode;
  return [
    `COMPUTER_BOT_ID=${botId}`,
    `COMPUTER_TOKEN=${computerToken}`,
    ...(spireSocketVolume
      ? ["SPIFFE_ENDPOINT_SOCKET=/tmp/spire-agent/public/api.sock"]
      : []),
    ...(browserMode ? [`COMPUTER_BROWSER_MODE=${browserMode}`] : []),
    ...passthrough.map(([key, value]) => `${key}=${value ?? ""}`),
  ];
}
