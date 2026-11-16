/**
 * Whether a request came straight from this machine: the TCP peer is this machine's own loopback (read from the
 * socket, never from a header, auth/peer.ts) and the request carries none of the headers an intermediary adds. A
 * tunnel that runs on this machine hands the server a loopback connection for a person who is far away; the headers
 * it adds tell them apart. This is the first two conditions of "at the computer" (freeduet/at-the-computer.ts) and the
 * only condition under which the old pairing cookie is upgraded (auth/remote-limits.ts, D49), so both ask it here.
 */
import { isLoopbackRequest } from "./peer";

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

/** Whether this request came straight from this machine, and not through a tunnel, a proxy or from elsewhere. */
export function isDirectRequest(env: unknown, request: Request): boolean {
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
