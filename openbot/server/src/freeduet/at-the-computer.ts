/**
 * Whether a request comes from the person at the computer FreeDuet runs on, and not through a tunnel, a proxy or
 * from another machine (docs/design/engines-dashboard.md 6.8).
 *
 * The Engines page lets an administrator change how the team's engines behave. That is the installation's own
 * business, so it is asked of someone who is at the installation, on top of being an administrator:
 *
 *  1. The TCP peer is this machine's own loopback. It is read from the socket by the server and never from a header
 *     (auth/peer.ts). On a server opened with `OPENBOT_HOST`, where everybody who can reach it is the administrator,
 *     this is the check that still tells the person at the computer from the rest of the network.
 *  2. The request carries none of the headers a proxy, a tunnel or a load balancer adds. A tunnel that runs on this
 *     machine (Tailscale serve, a Cloudflare tunnel, nginx) hands the server a loopback connection for a person who
 *     is far away, and the connection alone cannot tell them apart; the headers they add can. A browser talking to
 *     this machine directly sends none of them.
 *
 * WHAT THIS IS NOT. It is a second lock and not the first. On Docker Desktop a Bot's computer reaches the server as
 * loopback too (docs/M1_PLAN.md D39), so what keeps that out is the pairing cookie of single-user mode (D28) or the
 * session of a deployment with sign-in, which every `/api` route already needs. A tunnel that strips the headers
 * above would also pass this check; that is why the phone design gives a remote session a marker of its own
 * (docs/design/phone-and-remote.md, slice 4).
 */
import { isLoopbackRequest } from "../auth/peer";

/** Headers that only an intermediary adds. Lower case, as `Headers` gives them. */
const INTERMEDIARY_HEADERS = new Set([
  "forwarded",
  "via",
  "x-real-ip",
  "x-client-ip",
  "true-client-ip",
]);

/** Families of them: `X-Forwarded-For`, `Cf-Connecting-Ip`, `Tailscale-User-Login`, and the like. */
const INTERMEDIARY_PREFIXES = ["x-forwarded-", "cf-", "tailscale-"];

/**
 * Whether this request came straight from this machine. `env` is what `app.fetch(request, env)` was given, which is
 * `{ server }` from `startHttpServer`; a request made in-process has no peer and is nobody's.
 */
export function atTheComputer(env: unknown, request: Request): boolean {
  if (!isLoopbackRequest(env, request)) return false;
  for (const name of request.headers.keys()) {
    const lower = name.toLowerCase();
    if (
      INTERMEDIARY_HEADERS.has(lower) ||
      INTERMEDIARY_PREFIXES.some((prefix) => lower.startsWith(prefix))
    )
      return false;
  }
  return true;
}
