import { DEFAULT_COMPUTER_TIMEOUT_MS } from "./client";

/**
 * The browser routes of the computer, as the server's front door has to tell them from every other
 * path.
 *
 * Its own module so the front door (http-server.ts, which binds a port) and the routes (routes.ts)
 * read one list, and so the list can be tested without starting a server.
 */

/** Every route that goes to the Bot's page, one segment after the Bot's id. */
export const BROWSER_ROUTES: ReadonlySet<string> = new Set([
  "status",
  "screenshot",
  "read",
  "navigate",
  "snapshot",
  "click",
  "type",
  "key",
  "scroll",
]);

/**
 * How long the front door lets one of these requests stay silent.
 *
 * `Bun.serve` closes a request that has sent nothing for ten seconds, and it does so to a request
 * that carries no body (a GET, or the POST `computer_snapshot` makes) while the handler is still
 * waiting on the computer; a request that carried a JSON body is not cut. A navigate may take up to
 * its own 30 s and a call may wait behind it, so a snapshot or a read that was merely slow came back to
 * the caller as a closed connection, and the app wrote "The assistant's computer could not be
 * reached." about a computer that was answering.
 *
 * The transport gives the computer its own deadline (`DEFAULT_COMPUTER_TIMEOUT_MS`, 45 s), which is
 * the real limit of these routes. This is that plus a margin, so the answer, or the transport's own
 * "didn't respond in time", always arrives first. Bun checks idleness on a coarse tick, so the margin
 * is larger than it looks.
 */
export const COMPUTER_ROUTE_IDLE_SECONDS =
  Math.ceil(DEFAULT_COMPUTER_TIMEOUT_MS / 1000) + 15;

/**
 * Whether a request path is one of the browser routes of a Bot's computer.
 *
 * Exactly one segment after the Bot, so `/files/read`, `/control/...`, `/human/...`, `/stream` and the
 * deployment-wide `/policy` and `/fleet` are none of them: those keep the server's default.
 */
export function isComputerBrowserPath(pathname: string): boolean {
  const match = pathname.match(/^\/api\/computers\/[^/]+\/([^/]+)\/?$/);
  return match?.[1] !== undefined && BROWSER_ROUTES.has(match[1]);
}
