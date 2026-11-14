import { isIP } from "node:net";
import type { DeploymentConfig } from "../config";
import {
  isLoopbackPeer,
  isLoopbackRequest,
  personIsLoopbackOnly,
} from "./peer";
import { appOrigins } from "./same-origin";

/**
 * Which names may reach this server when the person is whoever connects from loopback.
 *
 * THE HOLE. With no sign-in "the person" is a network position (auth/peer.ts), and the cross-site
 * guard (auth/same-origin.ts) looks only at requests that change something, so every GET passed. A
 * page the person opens at evil.example can have that name answered first with the page's own
 * address and then with 127.0.0.1 (DNS rebinding). The browser then sends the page's next request to
 * this machine's loopback and still calls it same-origin with the page, so the page reads the
 * answer: the person's conversations, memory, instructions, a Bot's screen. Nothing in such a request
 * says it is not the person's, except the name it was addressed to, and that is the one thing the
 * page cannot choose: it can only send the name it was loaded from.
 *
 * THE RULE. Where the person is a loopback peer (no sign-in, listening on this machine alone:
 * `personIsLoopbackOnly`), a request whose TCP peer is loopback is answered only when its `Host` is
 *
 *  - `localhost`, or an IP literal that is loopback (127.0.0.0/8, ::1, an IPv4-mapped loopback: the
 *    peer rule's own test, `isLoopbackPeer`). No DNS answer can turn those into somebody else's;
 *  - `host.docker.internal`, which is how a Bot's container reaches this machine and which Docker
 *    Desktop delivers to loopback (config.ts `listenAddresses`). Only this machine's own resolver
 *    answers it;
 *  - or the host of an origin this deployment is configured with (`OPENBOT_APP_URL`,
 *    `TRUSTED_ORIGINS`, ...: `appOrigins`, the list the cross-site guard already trusts). A name the
 *    person pointed at this machine themselves, a hosts-file alias or a LAN name, goes there.
 *
 * Anything else is answered 421 before any route sees it, on every method and on every WebSocket
 * upgrade, `/health` and `/api/capabilities` included: every caller of this server on loopback uses
 * one of the names above (scripts, compose, the desktop shell, the app's own proxy).
 *
 * THE PORT IS NOT PART OF IT. What a page controls is the name; the port tells nothing about who
 * wrote the page, and a check on it would refuse the person's own forwarded port (`ssh -L`, a local
 * proxy), the app's port (the dev proxy and `app/serve.ts` both pass the page's own `Host`, port
 * included, on to this server) and the ports the desktop shell picks. Up to five digits, at most 65535, as
 * part of the header being well formed.
 *
 * HOW THE HEADER IS READ. It must be exactly `host [":" port]` (RFC 9110, 7.2): one value, no
 * userinfo, no path, no list, no spaces; a request with none, with two, or with `a@localhost` is
 * refused. Bun merges two Host headers into one `a, b`, and builds `request.url` from the first, so
 * a lenient reading would disagree with itself. What passes is read the way a browser reads a URL's
 * host (the WHATWG parser): lower case, an address in its one canonical spelling, one trailing dot
 * (`localhost.`) the same name written out in full. `*.localhost` is not `localhost`.
 *
 * WHAT IS LEFT ALONE. A peer that is not loopback is not the person (auth/peer.ts), so a Bot's
 * container on the Docker bridge calls with whatever Host it likes and its own credential, as it
 * did. A deployment with sign-in has no network-position authority to borrow, and one opened with
 * `OPENBOT_HOST` made everybody who reaches it the administrator on purpose; both are as they were.
 * Nor does this say anything about a proxy or a tunnel on this machine that sends `Host: localhost`:
 * that connection is loopback and still looks like the person (docs/design/phone-and-remote.md).
 */

/** Names that are this machine whatever a resolver says. */
const OWN_NAMES = new Set(["localhost", "host.docker.internal"]);

/** `host [":" port]` and nothing else: one IPv6 literal, or a run of name characters. */
const HOST_SHAPE = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i;

const MISDIRECTED =
  "While there is no sign-in this server answers only to this machine's own names (localhost, 127.0.0.1, [::1]). Open FreeDuet at one of them, or put the address you opened in TRUSTED_ORIGINS (for example TRUSTED_ORIGINS=http://nas.local:3010) and restart it.";

/**
 * The host a `Host` header names, as a browser would read it from a URL, or null when the header is
 * absent or is not `host [":" port]`. Never throws.
 */
export function hostnameOf(header: string | null): string | null {
  const parts = header === null ? null : HOST_SHAPE.exec(header);
  if (!parts) return null;
  if (parts[2] !== undefined && Number(parts[2]) > 65_535) return null;
  try {
    return new URL(`http://${parts[1]}`).hostname.replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** Whether an IP literal (in a URL's own bracketed spelling for IPv6) is a loopback address. */
function isLoopbackLiteral(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, "");
  return isIP(address) !== 0 && isLoopbackPeer(address);
}

/**
 * The guard, built once from the deployment. Called with each request and the server that accepted
 * it, it answers the 421 to send, or null when the request may go on. Inert, and so null, wherever
 * the person is not a loopback peer.
 */
export function createHostGuard(
  config: DeploymentConfig,
): (request: Request, server: unknown) => Response | null {
  if (!personIsLoopbackOnly(config)) return () => null;
  const configured = new Set<string>();
  for (const origin of appOrigins(config).origins) {
    const hostname = hostnameOf(new URL(origin).host);
    if (hostname !== null) configured.add(hostname);
  }
  return (request, server) => {
    if (!isLoopbackRequest({ server }, request)) return null;
    const hostname = hostnameOf(request.headers.get("host"));
    if (
      hostname !== null &&
      (OWN_NAMES.has(hostname) ||
        isLoopbackLiteral(hostname) ||
        configured.has(hostname))
    )
      return null;
    return Response.json({ error: MISDIRECTED }, { status: 421 });
  };
}
