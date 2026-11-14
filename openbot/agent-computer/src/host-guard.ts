import { BlockList, isIP } from "node:net";

/**
 * Which names may reach this computer when the caller is on this machine (docs/M1_PLAN.md D40).
 *
 * THE HOLE. This process drives a browser that holds real logins and runs a Bot's shell, and its one
 * gate is `COMPUTER_TOKEN`. That token has a development default that is public in this repository
 * (`scripts/start.sh`, `docker-compose.yml`), and nothing read `Host`. A page the person opens at
 * evil.example can have that name answered first with the page's own address and then with 127.0.0.1
 * (DNS rebinding). The browser then sends the page's next requests to this machine's loopback and
 * still calls them same-origin with the page, so the page may set any header on them, the public
 * token included, and read the answer. Over a socket, from 127.0.0.1, a request under
 * `Host: evil.example` with that token read the output of `/exec` (HTTP 200) before this guard existed;
 * `tests/host-guard-http.test.ts` makes it. Nothing in such a request says it is not the person's
 * except the name it was addressed to, and that is the one thing the page cannot choose: it can only
 * send the name it was loaded from.
 *
 * THE RULE, the one the server has since D32 (`server/src/auth/host-guard.ts`). A request whose TCP
 * peer is loopback is answered only when its `Host` is
 *
 *  - `localhost`, or an IP literal that is loopback (127.0.0.0/8, ::1, an IPv4-mapped loopback). No
 *    DNS answer can turn those into somebody else's;
 *  - `host.docker.internal`, which is how a container reaches this machine and which Docker Desktop
 *    delivers to loopback. Only this machine's own resolver answers it;
 *  - or a name this deployment configured for this service in `COMPUTER_ALLOWED_HOSTS`: a hosts-file
 *    alias or a LAN name somebody pointed at this machine themselves.
 *
 * Anything else is answered 421 before any route sees it, on every method, on the `/stream` upgrade
 * and on `/health`: every caller of this process on loopback uses one of the names above (the image's
 * own health check says `localhost`, the scripts and the server say `localhost` or `127.0.0.1`).
 *
 * THE PORT IS NOT PART OF IT. What a page controls is the name. Up to five digits, at most 65535, as
 * part of the header being well formed.
 *
 * HOW THE HEADER IS READ. Exactly `host [":" port]` (RFC 9110, 7.2): one value, no userinfo, no path,
 * no list, no spaces. A request with none, with two (Bun merges them into `a, b` and builds
 * `request.url` from the first, so a lenient reading would disagree with itself) or with
 * `a@localhost` is refused. What passes is read the way a browser reads a URL's host (the WHATWG
 * parser): lower case, an address in its one canonical spelling, one trailing dot (`localhost.`) the
 * same name written out in full. `*.localhost` is not `localhost`.
 *
 * WHAT IS LEFT ALONE, and what is not seen. A peer that is not loopback is not a page on this
 * machine's loopback: the server calling from another container by name, the kubelet's probes, the
 * supervisor. They call with whatever `Host` they have and the token, as they did. So is a request
 * whose peer cannot be read. That is also the limit of this rule: inside a container, a connection
 * that this machine makes to a published port reaches the process from the network's gateway, not from
 * loopback (Docker's proxy opens it), so there this rule does not see the person's browser and the
 * token is the whole gate. See D40 for what that leaves and what could close it.
 *
 * This is a copy of the server's header reading, not an import: the computer's image holds this
 * package's `src` and one shared file, and the three copies (server, computer, supervisor) are held
 * to the same answers by `tests/host-guard-copies.test.ts` at the repository's `openbot/` root.
 */

/** Names that are this machine whatever a resolver says. */
const OWN_NAMES = new Set(["localhost", "host.docker.internal"]);

/** `host [":" port]` and nothing else: one IPv6 literal, or a run of name characters. */
const HOST_SHAPE = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i;

const MISDIRECTED =
  "While it is reached from this machine this computer answers only to this machine's own names (localhost, 127.0.0.1, [::1]). To reach it under another name, put that name in COMPUTER_ALLOWED_HOSTS (for example COMPUTER_ALLOWED_HOSTS=computer.local) and restart it.";

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

/** The one thing read from the server that accepted the connection. */
type PeerSource = {
  requestIP?: (request: Request) => { address: string } | null;
};

/** Whether the request came from this machine's loopback. No readable peer is not loopback. */
function cameFromLoopback(server: unknown, request: Request): boolean {
  const source = server as PeerSource | null | undefined;
  if (typeof source?.requestIP !== "function") return false;
  try {
    return isLoopbackPeer(source.requestIP(request)?.address);
  } catch {
    return false;
  }
}

/**
 * The names the deployment configured, read from one setting: host names or addresses separated by
 * commas, each as `host` or `host:port` (the port is not part of the rule), an IPv6 address in
 * brackets. Returned in the spelling the rule compares. An entry that is not one is not skipped, it
 * is an error: a name silently dropped would show as a caller refused with a 421 and nothing to say
 * why.
 */
export function allowedHostsFrom(
  raw: string | undefined,
): { ok: true; hosts: string[] } | { ok: false; reason: string } {
  const hosts: string[] = [];
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const hostname = hostnameOf(trimmed);
    if (hostname === null) {
      return {
        ok: false,
        reason: `COMPUTER_ALLOWED_HOSTS lists host names or addresses separated by commas, such as computer.local or 192.168.1.10, an IPv6 address in brackets (got ${JSON.stringify(trimmed)}).`,
      };
    }
    hosts.push(hostname);
  }
  return { ok: true, hosts };
}

/**
 * The guard, built once. Called with each request and the server that accepted it, it answers the
 * 421 to send, or null when the request may go on. It reads only the peer and the `Host` header, so
 * it can run before `new URL(request.url)`, which throws on the bare path Bun hands over when the
 * header is missing or malformed.
 */
export function createHostGuard(
  extraHosts: readonly string[] = [],
): (request: Request, server: unknown) => Response | null {
  const configured = new Set(extraHosts);
  return (request, server) => {
    if (!cameFromLoopback(server, request)) return null;
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
