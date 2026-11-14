import type { AuthService } from "./guards";
import { holdsInstallSecret, type InstallGate } from "./install-secret";

/**
 * FreeDuet (docs/design/phone-and-remote.md 3.5, decided 14 November 2026): who is REMOTE.
 *
 * A deployment with sign-in AND an installation secret asks one more thing of a signed-in browser: is it
 * paired with the computer this runs on? The pairing marker is the cookie of D28, which only a pairing
 * link opened on this machine by an administrator ever sets (auth/install-secret.ts). A session in a
 * browser that holds it is AT THE COMPUTER and nothing is limited; a session in any other browser is
 * REMOTE, and may do only what auth/remote-limits.ts lists. The gate is `signInGate(config)`: absent in
 * single-user mode, which keeps D28 as it is, and absent where a sign-in deployment has no secret, which
 * has nothing to tell one browser from another (the boot log says so).
 *
 * WHAT THE ANSWER IS BUILT FROM. Two facts the sender cannot make up:
 *
 *  1. The session, which the server holds and looks up with the very call every guarded route makes
 *     (`createRequireUser`), so "signed in" means the same thing here and there.
 *  2. The cookie, whose value is a secret that no route, no environment a member's computer gets and no
 *     link hands out.
 *
 * WHAT IT NEVER READS. A header (`X-Forwarded-For`, `Forwarded`, `User-Agent`, `Origin`, `Host`), the
 * query, or the connection's peer address. A tunnel or a reverse proxy that runs on this machine makes a
 * request from a phone arrive from loopback, with headers the sender chooses, so with sign-in on a
 * loopback peer is never, on its own, "at the computer". Nor does the cookie sign anybody in: a request
 * that holds it and has no session is nobody, and the route's own guard answers it as it always did (401,
 * or its own credential: a member's tool token, the worker's secret, a signature).
 *
 * The Engines page asks "at the computer" too (freeduet/at-the-computer.ts). It is the same question with
 * two conditions of its own on top (loopback, no proxy header), not another notion: it is given this gate.
 */

/**
 * Whether a SIGNED-IN request is remote: this deployment asks (there is a gate) and the browser is not
 * paired (it does not hold the cookie). Pure, and the only place the cookie is turned into the verdict.
 * With no gate nothing is remote.
 */
export function isRemote(
  gate: InstallGate | undefined,
  request: Request,
): boolean {
  return gate !== undefined && !holdsInstallSecret(request, gate);
}

/**
 * Whether the request is a remote SESSION: a signed-in browser that is not paired. A request with no
 * session is nobody's and is not this (it goes on to its own guard), and the cookie does not change that.
 *
 * The cookie is asked first, so a paired browser costs no session lookup. The lookup is the one the
 * guards make. One that cannot be answered counts as a session, so that a failing lookup refuses a
 * request and never lets one through.
 */
export async function isRemoteSession(
  gate: InstallGate | undefined,
  auth: Pick<AuthService, "api"> | undefined,
  request: Request,
): Promise<boolean> {
  if (!gate || !auth || !isRemote(gate, request)) return false;
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    // The guard's own test of "signed in": `if (!session)`.
    return Boolean(session);
  } catch {
    return true;
  }
}
