import { BlockList, isIP } from "node:net";
import type { DeploymentConfig } from "../config";

/**
 * Who may be the one administrator when there is no sign-in.
 *
 * With `OPENBOT_SINGLE_USER` there is no session, so "the person" is a network position. The server
 * listens on this machine's loopback and, on Linux, on the Docker bridge (config.ts
 * `listenAddresses`) so that the Bots' containers can call back with their tool tokens. A process
 * inside one of those containers reaches the bridge address too, and a request there carried no
 * credential that told it from the person's own.
 *
 * THE RULE. Where the server listens on this machine alone (so, not beyond it because somebody set
 * `OPENBOT_HOST`), the implicit administrator is a request whose TCP peer is loopback: 127.0.0.0/8,
 * ::1, or an IPv4-mapped loopback. The peer is the address the connection came from, read from the
 * socket by the server. No header takes part in it: not `X-Forwarded-For`, not `Host`, not `Origin`.
 * Any other peer gets no implicit actor, so a route that asks who is calling answers 401, while a
 * route that checks its own credential (a Bot's tool token, the worker's secret, a signature) never
 * asked, and is unaffected.
 *
 * A server that somebody opened with `OPENBOT_HOST` is a different decision, already documented and
 * logged at every boot: everybody who can reach the addresses it was given is the administrator,
 * which is what a published container port or a LAN address needs. That is left as it was.
 *
 * NO PEER, NO PERSON. A request that arrives with no way to read its peer is refused rather than
 * admitted. `startHttpServer` is the only caller of the app and always passes the server; a caller
 * that forgot to would otherwise open the deployment without anybody noticing.
 */

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");

/** Whether a TCP peer address is this machine's own loopback. Anything unreadable is not. */
export function isLoopbackPeer(address: string | null | undefined): boolean {
  if (!address) return false;
  const family = isIP(address);
  if (family === 0) return false;
  try {
    return LOOPBACK.check(address, family === 6 ? "ipv6" : "ipv4");
  } catch {
    return false;
  }
}

/** The one thing read from the server that accepted the connection. */
type PeerSource = {
  requestIP?: (request: Request) => { address: string } | null;
};

/**
 * Whether the request came from this machine's loopback. `env` is what `app.fetch(request, env)`
 * was given, which is `{ server }` from `startHttpServer`.
 */
export function isLoopbackRequest(env: unknown, request: Request): boolean {
  const server = (env as { server?: PeerSource } | null | undefined)?.server;
  if (typeof server?.requestIP !== "function") return false;
  try {
    return isLoopbackPeer(server.requestIP(request)?.address);
  } catch {
    return false;
  }
}

/**
 * Whether only a loopback peer may be the person: no sign-in, and the server listens on this machine
 * alone (loopback, and the Docker bridge that exists only for Bot callbacks).
 */
export function personIsLoopbackOnly(
  config: Pick<DeploymentConfig, "singleUser" | "listen">,
): boolean {
  return config.singleUser && config.listen.every(({ local }) => local);
}
