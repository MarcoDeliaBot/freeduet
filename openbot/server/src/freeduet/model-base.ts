/**
 * With FreeDuet's subscription router on, the server's own model calls go to agent-freeduet and to
 * nothing else (docs/SERVER_MODEL_CALLS.md, docs/M1_PLAN.md D10).
 *
 * Those calls are Anthropic-format requests to ANTHROPIC_BASE_URL, with FREEDUET_LOCAL_KEY as their
 * key: titles, routing, triage, auto-review, and the boot-time model check. The address is read from
 * the process environment, and a value exported there wins over `.env`: Bun's `--env-file` leaves an
 * exported variable in place. A shell that exports
 * ANTHROPIC_BASE_URL=https://api.anthropic.com therefore sent the boot check to Anthropic with the
 * local key, and every server call with the person's text. A `.env` with no ANTHROPIC_BASE_URL line
 * does the same, and start.sh does not write one.
 *
 * So the base is set to agent-freeduet for this run whenever the router is on, and the log says so
 * when that changes a value. The boot check then sees a local address and skips, as it does with the
 * `.env` defaults. Applied only to FreeDuet's package (index.ts): other packages keep their own base.
 */

/** The port agent-freeduet listens on: `FREEDUET_PORT` in `.env`, as start.sh and Compose read it. */
export const DEFAULT_ROUTER_PORT = 4230;

export type RouterPin =
  | { kind: "off" }
  | { kind: "kept"; base: string }
  | { kind: "pinned"; base: string; was: string };

/** Whether the subscription router is on. Absent is on, as start.sh and coordination.ts read it. */
export function routerOn(
  environment: Record<string, string | undefined>,
): boolean {
  return environment.FREEDUET_ROUTER?.trim().toLowerCase() !== "off";
}

function routerPort(environment: Record<string, string | undefined>): number {
  const value = environment.FREEDUET_PORT?.trim();
  const port = value && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(port) && port > 0 && port < 65536
    ? port
    : DEFAULT_ROUTER_PORT;
}

/** The router's address for the server's Anthropic-format calls, with the `/v1` that normalizeModelBaseUrls adds. */
export function routerModelBase(
  environment: Record<string, string | undefined>,
): string {
  return `http://localhost:${routerPort(environment)}/v1`;
}

/** The host a base URL names, for the log. Never the whole value, which can carry credentials. */
function hostOf(value: string): string {
  if (!value) return "unset";
  try {
    return new URL(value).hostname || "another address";
  } catch {
    return "an address that is not a URL";
  }
}

/**
 * Points ANTHROPIC_BASE_URL at agent-freeduet when the router is on. Call once, after
 * `normalizeModelBaseUrls` and before anything reads the model environment.
 *
 * Returns what it did. A value already at the router, with or without `/v1` and a trailing slash,
 * is kept and nothing is logged. Anything else (unset, blank, an exported provider address) is
 * replaced, and one line says which host it named, without the value.
 */
export function pinModelBaseToRouter(
  environment: Record<string, string | undefined>,
  log: (line: string) => void = (line) => console.warn(line),
): RouterPin {
  if (!routerOn(environment)) return { kind: "off" };
  const base = routerModelBase(environment);
  const current = environment.ANTHROPIC_BASE_URL?.trim() ?? "";
  const origin = base.slice(0, -"/v1".length);
  if (current.replace(/\/+$/, "").replace(/\/v1$/, "") === origin) {
    return { kind: "kept", base };
  }
  const was = hostOf(current);
  environment.ANTHROPIC_BASE_URL = base;
  log(
    JSON.stringify({
      type: "model-base-pinned",
      provider: "anthropic",
      base,
      was,
      reason:
        "FreeDuet's subscription router is on, so the server's own model calls go to agent-freeduet. " +
        "ANTHROPIC_BASE_URL named another address or none, so it is set to the router for this run. " +
        "Set FREEDUET_ROUTER=off to call a provider directly.",
    }),
  );
  return { kind: "pinned", base, was };
}
